// Nthawi — background service worker.
//
// This is the tracking engine and the only writer of stored data. Time counts
// while ALL of these are true:
//   1. tracking is ON (the user pressed Start),
//   2. a Chrome window is focused and its active tab matches an enabled tool,
//   3. the user isn't idle (chrome.idle, with a separate limit for Google Meet).
//
// The worker can be stopped by Chrome at any time, so all state lives in
// chrome.storage.local and every event re-reads it. Operations are serialised
// through a small lock so overlapping events can't clobber each other.

import { DEFAULT_SETTINGS, DEFAULT_TOOLS, CUSTOM_PALETTE_ORDER, MERGE_GAP_MS, MIN_SESSION_MS, HEARTBEAT_MINUTES, STALE_BEAT_MS } from '../shared/constants.js';
import { KEYS, DEFAULT_TRACKER, readAll, uid, sessionDuration, toolById } from '../shared/store.js';
import { matchTool, sessionTitleFromTab, normalizeDomain } from '../shared/match.js';
import { startOfDay, addDays, dayKey, fmtHM } from '../shared/time.js';
import { workHours, splitSession, hm, isWorkday, previousWorkday } from '../shared/schedule.js';
import { getUser, getTeams, getTask, createTimeEntry, setApiBase } from '../shared/clickup.js';
import { DEFAULT_END_OF_DAY, DEFAULT_WORK_HOURS, DEFAULT_NUDGES, PROJECT_PALETTES } from '../shared/constants.js';
import { clickupTaskFor, titleKey, projectFor } from '../shared/projects.js';
import { urlMatchesDomain } from '../shared/match.js';
import { phaseAt, dayOff } from '../shared/schedule.js';
import * as G from '../shared/google.js';
import { rewriteStandup } from '../shared/ai.js';
import { showNudge } from '../shared/nudge-overlay.js';
import { daysOff as icsDaysOff } from '../shared/ical.js';
import { fmtClock, weekdayLong, startOfWeek } from '../shared/time.js';

// ---------------------------------------------------------------------------
// Lock + state transactions

let chain = Promise.resolve();
function locked(fn) {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

/** Load state, run `fn(st)`, persist whatever it marked dirty. */
function tx(fn) {
  return locked(async () => {
    const st = await readAll();
    st.dirty = new Set();
    const result = await fn(st);
    if (st.dirty.size) {
      const out = {};
      for (const k of st.dirty) out[KEYS[k]] = st[k];
      await chrome.storage.local.set(out);
    }
    if (st.dirty.has('tracker') || st.dirty.has('settings')) await refreshChrome(st);
    return result;
  });
}

// ---------------------------------------------------------------------------
// Focus detection

async function focusedContext(settings) {
  let win;
  try {
    win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
  } catch {
    return null;
  }
  if (!win || !win.focused) return null;
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  if (!tab || !tab.url) return null;
  const tool = matchTool(tab.url, settings.tools);
  if (!tool) return null;
  if (isExcluded(tab, settings.excludes)) return null;
  let key = sessionTitleFromTab(tab.title, tool, tab.url);
  if (tool.id === 'meet') {
    // Only time in an actual meeting counts (not the Meet home page or lobby list).
    if (!MEET_CODE.test(new URL(tab.url).pathname)) return null;
    if (isGenericMeet(key)) key = (await meetTitleFromPage(tab)) || key;
  }
  lastTab = tab;
  return { toolId: tool.id, key, tabId: tab.id };
}

const MEET_CODE = /\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i;
function isGenericMeet(key) {
  return /^(meeting [a-z]{3}-[a-z]{4}-[a-z]{3}|google meet|meet)$/i.test(key || '');
}

// The meeting's real name, read from the Meet page itself (cached briefly per tab).
const meetCache = new Map();
async function meetTitleFromPage(tab) {
  const c = meetCache.get(tab.id);
  if (c && c.url === tab.url && Date.now() - c.at < 60000) return c.title;
  let title = null;
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const el = document.querySelector('[data-meeting-title]');
        const t = el?.getAttribute('data-meeting-title') || '';
        return t.trim() || null;
      },
    });
    title = r?.result || null;
  } catch {
    /* no access to the page yet */
  }
  meetCache.set(tab.id, { url: tab.url, title, at: Date.now() });
  return title;
}
let lastTab = null;

/** Pages you've told Nthawi not to count (by address prefix or by words in the tab title). */
function isExcluded(tab, excludes = []) {
  const title = (tab.title || '').toLowerCase();
  return excludes.some((x) => (x.kind === 'title' ? x.value && title.includes(x.value.toLowerCase()) : x.value && urlMatchesDomain(tab.url, x.value)));
}

// ---------------------------------------------------------------------------
// App logos: remember each tool's real favicon the first time we see its tab.

function iconCandidate(tool, tab) {
  if (!tab?.favIconUrl || !/^https?:\/\//.test(tab.favIconUrl)) return null;
  // docs.google.com also serves Sheets/Slides; keep the Docs icon for the Docs tool.
  if (tool.id === 'docs' && !/\/document\//.test(tab.url || '')) return null;
  return tab.favIconUrl;
}

function captureIcon(st, tab) {
  if (!tab?.url) return;
  const tool = matchTool(tab.url, st.settings.tools);
  const url = tool && iconCandidate(tool, tab);
  if (url && tool.iconUrl !== url) {
    tool.iconUrl = url;
    st.dirty.add('settings');
  }
}

async function seedIcons(st) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) captureIcon(st, t);
  } catch {
    /* ignore */
  }
}

function idleThresholdSec(st, ctx = st.tracker.ctx) {
  const min = ctx?.toolId === 'meet' ? st.settings.meetIdleMinutes : st.settings.idleMinutes;
  return Math.max(15, Math.round(min * 60));
}

// ---------------------------------------------------------------------------
// Session bookkeeping

function openSession(st) {
  return st.sessions.find((s) => s.id === st.tracker.currentId && s.end == null) || null;
}

function closeCurrent(st, at) {
  const s = openSession(st);
  st.tracker.currentId = null;
  st.dirty.add('tracker');
  if (!s) return null;
  s.end = Math.max(at, s.activeSince || s.start);
  delete s.activeSince;
  st.dirty.add('sessions');
  if (sessionDuration(s, s.end) < MIN_SESSION_MS) {
    // Tab flick: drop it so the session list stays clean.
    st.sessions = st.sessions.filter((x) => x.id !== s.id);
    return null;
  }
  return s;
}

/** Start counting for ctx: resume the most recent session if it's the same thing and recent, else open a new one. */
function startCounting(st, ctx, now) {
  const today = startOfDay(now);
  let last = null;
  for (const s of st.sessions) {
    if (s.manual || s.end == null) continue;
    if (!last || s.end > last.end) last = s;
  }
  if (last && last.toolId === ctx.toolId && last.key === ctx.key && now - last.end <= MERGE_GAP_MS && startOfDay(last.start) === today) {
    last.pausedMs = (last.pausedMs || 0) + (now - last.end);
    last.end = null;
    last.activeSince = now;
    st.tracker.currentId = last.id;
  } else {
    const s = { id: uid('s'), title: ctx.key, key: ctx.key, toolId: ctx.toolId, start: now, end: null, pausedMs: 0, manual: false, activeSince: now, createdAt: now };
    st.sessions.push(s);
    st.tracker.currentId = s.id;
  }
  st.dirty.add('sessions');
  st.dirty.add('tracker');
}

/** Bring stored state in line with what's focused right now. */
async function evaluate(st, now = Date.now()) {
  lastTab = null;
  const ctx = await focusedContext(st.settings);
  if (ctx && lastTab) captureIcon(st, lastTab);
  const prevCtx = st.tracker.ctx;
  if (JSON.stringify(prevCtx) !== JSON.stringify(ctx)) {
    st.tracker.ctx = ctx;
    st.dirty.add('tracker');
    if ((prevCtx?.toolId === 'meet') !== (ctx?.toolId === 'meet')) chrome.idle.setDetectionInterval(idleThresholdSec(st, ctx));
  }
  if (st.tracker.status !== 'on') return;

  splitAtMidnight(st, now);
  const cur = openSession(st);
  if (cur && ctx && cur.toolId === ctx.toolId && cur.key === ctx.key) return; // still the same thing
  // Same Meet call, but now we know its real name: rename instead of starting over.
  if (cur && ctx && cur.toolId === 'meet' && ctx.toolId === 'meet' && prevCtx?.tabId === ctx.tabId && isGenericMeet(cur.key) && !isGenericMeet(ctx.key)) {
    if (cur.title === cur.key) cur.title = ctx.key;
    cur.key = ctx.key;
    st.dirty.add('sessions');
    return;
  }
  if (cur || st.tracker.currentId) closeCurrent(st, now);
  if (ctx) startCounting(st, ctx, now);
}

function splitAtMidnight(st, now) {
  const s = openSession(st);
  if (!s) return;
  const today = startOfDay(now);
  if (s.start >= today) return;
  // Close at midnight, then reopen a fresh copy that starts today.
  s.end = Math.max(today - 1, s.activeSince || s.start);
  delete s.activeSince;
  const next = { ...s, id: uid('s'), start: today, end: null, pausedMs: 0, activeSince: today, createdAt: now };
  st.sessions.push(next);
  st.tracker.currentId = next.id;
  st.dirty.add('sessions');
  st.dirty.add('tracker');
}

// ---------------------------------------------------------------------------
// Toolbar badge

async function refreshChrome(st) {
  const t = st.tracker;
  let text = '';
  let color = '#A0A0B2';
  let title = 'Nthawi · Tracking OFF';
  if (t.status === 'on') {
    const tool = t.ctx && st.settings.tools.find((x) => x.id === t.ctx.toolId);
    text = 'ON';
    color = t.currentId ? '#2F9E62' : '#A0A0B2';
    title = tool ? `Nthawi · Tracking ON · active in ${tool.name}` : 'Nthawi · Tracking ON · waiting for a tracked tool';
  } else if (t.status === 'paused') {
    text = '❚❚';
    color = '#E3A63C';
    title = t.reason === 'idle' ? 'Nthawi · Paused while you are idle' : 'Nthawi · Paused';
  }
  try {
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color });
    if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
    await chrome.action.setTitle({ title });
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Commands from the popup / dashboard

function clampTimes(start, end, now) {
  if (!(Number.isFinite(start) && Number.isFinite(end))) throw new Error('Enter a start and end time.');
  if (end <= start) throw new Error('End time must be after the start time.');
  if (end > now + 60 * 1000) throw new Error("Sessions can't end in the future.");
  return [start, end];
}

function nextPalette(tools) {
  const used = new Set(tools.filter((t) => !t.removed).map((t) => t.palette));
  return CUSTOM_PALETTE_ORDER.find((p) => !used.has(p)) || CUSTOM_PALETTE_ORDER[tools.length % CUSTOM_PALETTE_ORDER.length];
}

function cleanDomains(list) {
  const out = [];
  for (const d of list || []) {
    const n = normalizeDomain(d);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

const handlers = {
  async start(st) {
    if (st.tracker.status === 'on') return;
    st.tracker = { ...st.tracker, status: 'on', reason: null, idleSince: null, startedAt: Date.now() };
    st.dirty.add('tracker');
    chrome.idle.setDetectionInterval(idleThresholdSec(st));
    await evaluate(st);
  },
  async stop(st, { forToday } = {}) {
    closeCurrent(st, Date.now());
    st.tracker = { ...st.tracker, status: 'off', reason: null, idleSince: null, currentId: null, stoppedDay: dayKey(Date.now()), restToday: !!forToday };
    st.dirty.add('tracker');
  },
  async pause(st) {
    if (st.tracker.status !== 'on') return;
    closeCurrent(st, Date.now());
    st.tracker = { ...st.tracker, status: 'paused', reason: 'manual', idleSince: null };
    st.dirty.add('tracker');
  },
  async resume(st) {
    if (st.tracker.status === 'on') return;
    finishIdle(st, Date.now());
    st.tracker = { ...st.tracker, status: 'on', reason: null, idleSince: null, resumeAt: null };
    st.dirty.add('tracker');
    chrome.alarms.clear('auto-resume');
    await evaluate(st);
  },

  async 'session:add'(st, { title, toolId, start, end }) {
    const now = Date.now();
    [start, end] = clampTimes(start, end, now);
    const s = { id: uid('m'), title: (title || '').trim() || 'Untitled session', key: null, toolId: toolId || 'other', start, end, pausedMs: 0, manual: true, createdAt: now };
    st.sessions.push(s);
    st.dirty.add('sessions');
    return { id: s.id };
  },
  async 'session:update'(st, { id, patch }) {
    const s = st.sessions.find((x) => x.id === id);
    if (!s) throw new Error('That session no longer exists.');
    if (patch.title != null) s.title = patch.title.trim() || s.title;
    if ('projectId' in patch) {
      if (patch.projectId) s.projectId = patch.projectId;
      else delete s.projectId; // back to automatic (keywords)
    }
    if (s.end == null) {
      // Running session: only the name can change; times are still being recorded.
      st.dirty.add('sessions');
      return;
    }
    if (patch.toolId) s.toolId = patch.toolId;
    if (patch.start != null || patch.end != null) {
      const [a, b] = clampTimes(patch.start ?? s.start, patch.end ?? s.end, Date.now());
      s.start = a;
      s.end = b;
      s.pausedMs = Math.min(s.pausedMs || 0, Math.max(0, b - a - 1000));
      s.edited = true;
    }
    st.dirty.add('sessions');
  },
  async 'session:duplicate'(st, { id }) {
    const s = st.sessions.find((x) => x.id === id);
    if (!s) throw new Error('That session no longer exists.');
    const now = Date.now();
    const end = s.end ?? now;
    const copy = { ...s, id: uid('m'), end, manual: true, key: null, createdAt: now, title: s.title };
    delete copy.activeSince;
    st.sessions.push(copy);
    st.dirty.add('sessions');
    return { id: copy.id };
  },
  async 'session:delete'(st, { ids }) {
    const set = new Set(ids);
    if (set.has(st.tracker.currentId)) {
      st.tracker.currentId = null;
      st.tracker.ctx = null; // forces a fresh session on the next evaluation
      st.dirty.add('tracker');
    }
    st.sessions = st.sessions.filter((s) => !set.has(s.id));
    st.dirty.add('sessions');
    if (st.tracker.status === 'on') await evaluateLater();
  },

  /** Undo for delete: put previously deleted (closed) sessions back. */
  async 'session:restore'(st, { sessions }) {
    const ids = new Set(st.sessions.map((s) => s.id));
    for (const s of sessions || []) {
      if (!s || ids.has(s.id) || !Number.isFinite(s.start)) continue;
      const copy = { ...s, end: s.end ?? Date.now() };
      delete copy.activeSince;
      st.sessions.push(copy);
    }
    st.dirty.add('sessions');
  },

  async 'settings:update'(st, { patch }) {
    const allowed = ['name', 'role', 'roleCustom', 'photo', 'theme', 'idleMinutes', 'meetIdleMinutes', 'onboarded', 'weeklyRecap', 'autoStart'];
    for (const k of allowed) if (k in patch) st.settings[k] = patch[k];
    if ('dailyGoalHours' in patch) st.settings.dailyGoalHours = Math.min(16, Math.max(0, Number(patch.dailyGoalHours) || 0));
    if (patch.nudges) st.settings.nudges = { ...DEFAULT_NUDGES, ...(st.settings.nudges || {}), ...patch.nudges };
    if (patch.standup) st.settings.standup = { ...(st.settings.standup || {}), ...patch.standup };
    if (patch.standup || 'weeklyRecap' in patch || patch.workHours) setTimeout(() => scheduleAll(), 0);
    if (patch.workHours) {
      const wh = { ...DEFAULT_WORK_HOURS, ...(st.settings.workHours || {}), ...patch.workHours };
      delete wh.off;
      if (hm(wh.end) <= hm(wh.start)) throw new Error('The working day has to end after it starts.');
      if (hm(wh.lunchEnd) < hm(wh.lunchStart)) throw new Error('Lunch has to end after it starts.');
      wh.days = [...new Set(wh.days)].filter((d) => d >= 0 && d <= 6).sort();
      st.settings.workHours = wh;
    }
    if (patch.endOfDay) {
      st.settings.endOfDay = { ...DEFAULT_END_OF_DAY, ...(st.settings.endOfDay || {}), ...patch.endOfDay };
      setTimeout(() => scheduleEod(), 0);
    }
    st.settings.idleMinutes = Math.min(10, Math.max(1, Math.round(st.settings.idleMinutes)));
    st.settings.meetIdleMinutes = Math.min(30, Math.max(1, Math.round(st.settings.meetIdleMinutes)));
    st.dirty.add('settings');
    chrome.idle.setDetectionInterval(idleThresholdSec(st));
  },
  /** Finish onboarding: profile, tool choices, custom sites, idle limit. */
  async 'onboarding:finish'(st, { name, role, roleCustom, enabled, sites, idleMinutes }) {
    st.settings.name = (name || '').trim();
    st.settings.role = role || 'designer';
    st.settings.roleCustom = role === 'other' ? (roleCustom || '').trim().slice(0, 60) : '';
    st.settings.idleMinutes = Math.min(10, Math.max(1, idleMinutes || 2));
    const tools = st.settings.tools.map((t) => (t.builtin ? { ...t, enabled: enabled?.[t.id] !== false } : t));
    for (const site of sites || []) {
      const d = normalizeDomain(site);
      if (!d || tools.some((t) => t.domains.includes(d))) continue;
      tools.push({ id: uid('t'), name: prettyName(d), short: prettyName(d), domains: [d], palette: nextPalette(tools), enabled: true, custom: true });
    }
    st.settings.tools = tools;
    st.settings.onboarded = true;
    st.dirty.add('settings');
    await evaluate(st);
  },

  async 'tool:add'(st, { name, domain }) {
    const d = normalizeDomain(domain);
    if (!d) throw new Error('Enter a website like notion.so or github.com/your-org.');
    const existing = st.settings.tools.find((t) => t.domains.includes(d));
    if (existing && !existing.removed) throw new Error(`${existing.name} already tracks ${d}.`);
    if (existing && existing.removed) {
      existing.removed = false;
      existing.enabled = true;
      st.dirty.add('settings');
      await evaluate(st);
      return { id: existing.id };
    }
    const label = (name || '').trim() || prettyName(d);
    const t = { id: uid('t'), name: label, short: label, domains: [d], palette: nextPalette(st.settings.tools), enabled: true, custom: true };
    st.settings.tools = [...st.settings.tools, t];
    st.dirty.add('settings');
    await evaluate(st);
    return { id: t.id };
  },
  async 'tool:update'(st, { id, patch }) {
    const t = st.settings.tools.find((x) => x.id === id);
    if (!t) throw new Error('Tool not found.');
    if ('enabled' in patch) t.enabled = !!patch.enabled;
    if (patch.name != null && patch.name.trim()) {
      t.name = patch.name.trim();
      t.short = t.builtin ? t.short : t.name;
    }
    if (patch.domains) {
      const ds = cleanDomains(patch.domains);
      if (!ds.length) throw new Error('Add at least one website.');
      t.domains = ds;
    }
    st.dirty.add('settings');
    await evaluate(st);
  },
  async 'tool:remove'(st, { id }) {
    const t = st.settings.tools.find((x) => x.id === id);
    if (!t) return;
    t.removed = true;
    t.enabled = false;
    st.dirty.add('settings');
    await evaluate(st);
  },
  async 'tool:restore'(st, { id }) {
    const t = st.settings.tools.find((x) => x.id === id);
    if (!t) return;
    t.removed = false;
    t.enabled = true;
    st.dirty.add('settings');
    await evaluate(st);
  },

  async 'data:deleteAll'(st) {
    st.sessions = [];
    st.idleLog = [];
    st.settings = { ...st.settings, tools: DEFAULT_TOOLS.map((t) => ({ ...t })) };
    st.tracker = { ...DEFAULT_TRACKER };
    for (const k of ['sessions', 'idleLog', 'settings', 'tracker']) st.dirty.add(k);
  },
  async 'data:import'(st, { data }) {
    if (!data || !Array.isArray(data.sessions)) throw new Error("That file isn't an Nthawi export.");
    const ids = new Set(st.sessions.map((s) => s.id));
    let added = 0;
    for (const s of data.sessions) {
      if (!s || ids.has(s.id) || !Number.isFinite(s.start) || !Number.isFinite(s.end)) continue;
      st.sessions.push({ ...s, end: s.end });
      added++;
    }
    for (const t of data.settings?.tools || []) {
      if (!st.settings.tools.some((x) => x.id === t.id)) st.settings.tools.push(t);
    }
    if (Array.isArray(data.idleLog)) st.idleLog.push(...data.idleLog.filter((e) => Number.isFinite(e.start) && Number.isFinite(e.end)));
    st.dirty.add('sessions');
    st.dirty.add('settings');
    st.dirty.add('idleLog');
    return { added };
  },
  async ping() {
    return { ok: true };
  },
};

function prettyName(domain) {
  const host = domain.split('/')[0];
  const base = host.split('.').slice(-2, -1)[0] || host;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

let evalTimer = null;
function evaluateLater(delay = 150) {
  clearTimeout(evalTimer);
  evalTimer = setTimeout(() => tx((st) => evaluate(st)), delay);
}

// ---------------------------------------------------------------------------
// Idle

function finishIdle(st, now) {
  const t = st.tracker;
  if (t.status === 'paused' && t.reason === 'idle' && t.idleSince && t.idleTool) {
    st.idleLog.push({ start: t.idleSince, end: now, toolId: t.idleTool });
    // Keep a year of idle history.
    const cutoff = now - 366 * 24 * 3600 * 1000;
    st.idleLog = st.idleLog.filter((e) => e.end >= cutoff);
    st.dirty.add('idleLog');
  }
  t.idleTool = null;
}

function onIdleState(state) {
  return tx(async (st) => {
    const now = Date.now();
    const t = st.tracker;
    if (state === 'idle' || state === 'locked') {
      if (t.status !== 'on') return;
      const cur = openSession(st);
      const idleStart = state === 'idle' ? now - idleThresholdSec(st) * 1000 : now;
      const begin = cur ? Math.max(idleStart, cur.activeSince || cur.start) : idleStart;
      if (cur) closeCurrent(st, begin);
      st.tracker = { ...t, status: 'paused', reason: 'idle', idleSince: begin, idleTool: cur ? cur.toolId : null, currentId: null };
      st.dirty.add('tracker');
    } else if (state === 'active') {
      if (t.status === 'paused' && t.reason === 'idle') {
        finishIdle(st, now);
        st.tracker = { ...st.tracker, status: 'on', reason: null, idleSince: null };
        st.dirty.add('tracker');
        await evaluate(st, now);
      }
    }
  });
}
chrome.idle.onStateChanged.addListener(onIdleState);

// ---------------------------------------------------------------------------
// Heartbeat: catch sleep/crash gaps, midnight, and any missed focus events.

/**
 * Switch tracking on by itself: when Chrome opens, and at the start of each new day.
 * A stop during the day is respected until tomorrow if it was "Stop for today", otherwise until Chrome restarts.
 */
function autoStart(st, now, chromeStarted) {
  const t = st.tracker;
  if (st.settings.autoStart === false || !st.settings.onboarded) return false;
  const newDay = t.stoppedDay !== dayKey(now);
  const manualPause = t.status === 'paused' && t.reason === 'manual';
  if (t.status !== 'off' && !manualPause) return false;
  if (!(newDay || (chromeStarted && !t.restToday))) return false;
  st.tracker = { ...t, status: 'on', reason: null, idleSince: null, stoppedDay: null, restToday: false };
  st.dirty.add('tracker');
  return true;
}

async function heartbeat() {
  await tx(async (st) => {
    const now = Date.now();
    autoStart(st, now, false);
    const t = st.tracker;
    const cur = openSession(st);
    if (cur && t.lastBeat && now - t.lastBeat > STALE_BEAT_MS) {
      // We weren't running (computer asleep or Chrome closed): stop the clock at the last beat.
      closeCurrent(st, t.lastBeat);
    }
    t.lastBeat = now;
    st.dirty.add('tracker');
    if (t.status === 'paused' && t.reason === 'idle') {
      // Recover if we missed the "active" event.
      const state = await chrome.idle.queryState(idleThresholdSec(st));
      if (state === 'active') {
        finishIdle(st, now);
        st.tracker = { ...st.tracker, status: 'on', reason: null, idleSince: null };
      }
    }
    await evaluate(st, now);
    nudges(st, now);
  });
  maybeMatchMeetings();
  maybeSyncVacation();
}

async function ensureAlarm() {
  const a = await chrome.alarms.get('beat');
  if (!a) await chrome.alarms.create('beat', { periodInMinutes: HEARTBEAT_MINUTES, delayInMinutes: HEARTBEAT_MINUTES });
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'beat') heartbeat();
  if (a.name === 'eod') endOfDay(false);
  if (a.name === 'eod-snooze') endOfDay(true);
  if (a.name === 'recap') weeklyRecap();
  if (a.name === 'auto-resume')
    tx(async (st) => {
      if (st.tracker.status === 'paused' && (st.tracker.reason === 'break' || st.tracker.reason === 'lunch')) {
        st.tracker = { ...st.tracker, status: 'on', reason: null, resumeAt: null };
        st.dirty.add('tracker');
        await evaluate(st);
      }
    });
  if (a.name === 'standup') standupReminder();
});

// ---------------------------------------------------------------------------
// Focus events

chrome.tabs.onActivated.addListener(() => evaluateLater(50));
chrome.tabs.onUpdated.addListener((_id, info, tab) => {
  if (tab.active && (info.url || info.title || info.favIconUrl || info.status === 'complete')) evaluateLater(200);
});
chrome.tabs.onRemoved.addListener(() => evaluateLater(100));
// WINDOW_ID_NONE fires when Chrome loses focus (also briefly between Chrome windows on some OSes),
// so re-check after a short delay instead of trusting the raw event.
chrome.windows.onFocusChanged.addListener(() => evaluateLater(300));

// ---------------------------------------------------------------------------
// ClickUp timesheet sync

/** Which ClickUp task a session goes to (see clickupTaskFor for the order). */
function taskFor(session, cu, overrides = {}, projects = []) {
  return clickupTaskFor(session, cu, projects, overrides[session.id]).task;
}

/** Closed, unsent sessions of a day that are long enough to log. */
function unsentForDay(sessions, day) {
  const a = startOfDay(day);
  const b = addDays(a, 1);
  return sessions.filter((s) => s.start >= a && s.start < b && s.end != null && !s.clickup && sessionDuration(s) >= 60 * 1000);
}

async function readClickUp() {
  const { clickup } = await readAll();
  return clickup;
}

const netHandlers = {
  async 'clickup:connect'({ token }) {
    const t = String(token || '').trim();
    if (!/^pk_/.test(t)) throw new Error('That doesn\'t look like a ClickUp personal token. It starts with "pk_".');
    const user = await getUser(t);
    const teams = await getTeams(t);
    if (!teams.length) throw new Error('This ClickUp account has no workspaces.');
    await tx(async (st) => {
      st.clickup = { ...st.clickup, token: t, user, teams, teamId: teams.some((x) => x.id === st.clickup.teamId) ? st.clickup.teamId : teams[0].id };
      st.dirty.add('clickup');
    });
    return { user, teams };
  },
  async 'clickup:resolveTask'({ input }) {
    const cu = await readClickUp();
    if (!cu.token) throw new Error('Connect ClickUp first.');
    return getTask(cu.token, input, cu.teamId);
  },
  /** entries: [{ sessionId, taskId? }] — taskId overrides the mapping for that session. */
  async 'clickup:send'({ sessionIds, overrides = {} }) {
    const { sessions, clickup: cu, settings } = await readAll();
    if (!cu.token || !cu.teamId) throw new Error('Connect ClickUp in Settings first.');
    const wh = workHours(settings);
    let useDesc = !!cu.sendDescriptions;
    const list = sessions.filter((s) => sessionIds.includes(s.id) && s.end != null && !s.clickup);
    const sent = [];
    const failed = [];
    for (const s of list) {
      const task = taskFor(s, cu, overrides, settings.projects);
      if (!task) {
        failed.push({ id: s.id, error: 'No ClickUp task chosen' });
        continue;
      }
      const tool = toolById(settings.tools, s.toolId);
      const split = splitSession(s, wh);
      const ot = cu.markOvertime && split.overtime >= split.active / 2;
      try {
        // A basic entry (task + start + duration) works on every plan. Descriptions and the
        // billable flag are ClickUp "Advanced Time Tracking", capped on most plans.
        const entry = { start: s.start, duration: Math.round(sessionDuration(s)), tid: task.id };
        if (useDesc) entry.description = `${s.title} (${tool.name})${ot ? ' · Overtime' : ''}`;
        let entryId;
        try {
          entryId = await createTimeEntry(cu.token, cu.teamId, entry);
        } catch (e) {
          if (!useDesc || !/advanced time tracking/i.test(e.message)) throw e;
          // Over the plan's limit: fall back to plain entries from now on.
          useDesc = false;
          delete entry.description;
          entryId = await createTimeEntry(cu.token, cu.teamId, entry);
          await tx(async (st) => {
            st.clickup.sendDescriptions = false;
            st.dirty.add('clickup');
          });
        }
        sent.push({ id: s.id, entryId, taskId: task.id, taskName: task.name, task });
      } catch (e) {
        failed.push({ id: s.id, error: e.message });
        if (/token|reach|rate/i.test(e.message)) break; // no point continuing
      }
    }
    if (sent.length) {
      await tx(async (st) => {
        const at = Date.now();
        for (const r of sent) {
          const s = st.sessions.find((x) => x.id === r.id);
          if (s) {
            s.clickup = { entryId: r.entryId, taskId: r.taskId, taskName: r.taskName, at };
            // Learn: next time a session with this name gets the same task automatically.
            const task = r.task;
            if (task) st.clickup.memory = { ...(st.clickup.memory || {}), [titleKey(s.title)]: task };
          }
        }
        st.clickup.lastSync = { at, count: sent.length };
        st.dirty.add('sessions');
        st.dirty.add('clickup');
      });
    }
    return { sent: sent.length, failed, ms: list.filter((s) => sent.some((r) => r.id === s.id)).reduce((t, s) => t + sessionDuration(s), 0) };
  },
};

Object.assign(handlers, {
  async 'clickup:update'(st, { patch }) {
    const allowed = ['teamId', 'defaultTask', 'toolTasks', 'markOvertime', 'sendDescriptions', 'memory'];
    for (const k of allowed) if (k in patch) st.clickup[k] = patch[k];
    st.dirty.add('clickup');
  },
  async 'clickup:disconnect'(st) {
    st.clickup = { ...st.clickup, token: '', user: null, teams: [], teamId: '' };
    st.dirty.add('clickup');
  },
  async 'clickup:forget'(st, { ids }) {
    // Let sessions be sent again (e.g. after deleting the entries in ClickUp).
    for (const s of st.sessions) if (ids.includes(s.id)) delete s.clickup;
    st.dirty.add('sessions');
  },
});

// ---------------------------------------------------------------------------
// End-of-day check-in

async function scheduleEod() {
  const { settings } = await readAll();
  const eod = { ...DEFAULT_END_OF_DAY, ...(settings.endOfDay || {}) };
  await chrome.alarms.clear('eod');
  if (!eod.enabled) return;
  const wh = workHours(settings);
  const now = Date.now();
  for (let i = 0; i < 8; i++) {
    const day = addDays(startOfDay(now), i);
    const when = day + hm(eod.time) * 60000;
    if (when > now + 1000 && isWorkday(day, wh)) {
      await chrome.alarms.create('eod', { when });
      return;
    }
  }
}

async function endOfDay(snoozed) {
  if (!snoozed) await scheduleEod(); // queue tomorrow's first
  syncSheetQuietly();
  const { sessions, clickup: cu, settings, tracker } = await readAll();
  const now = Date.now();
  const today = sessions.filter((s) => s.start >= startOfDay(now));
  const total = today.reduce((t, s) => t + sessionDuration(s, now), 0);
  if (total < 5 * 60000) return; // nothing worth reporting
  const wh = workHours(settings);
  const ot = today.reduce((t, s) => t + splitSession(s, wh, now).overtime, 0);
  const unsent = unsentForDay(sessions, now);
  const connected = !!cu.token;
  if (connected && !unsent.length && !tracker.currentId) return; // already sent everything
  const still = tracker.status === 'on' && tracker.currentId ? ' You\'re still tracking.' : '';
  await chrome.notifications.clear('eod');
  chrome.notifications.create('eod', {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: 'Your day is done',
    message: `${fmtHM(total)} tracked today${ot >= 60000 ? `, ${fmtHM(ot)} overtime` : ''}.${still} ${connected ? 'Send it to your ClickUp timesheet?' : 'Review it and connect ClickUp to log it.'}`,
    buttons: [{ title: connected ? 'Send to ClickUp' : 'Review my day' }, { title: `Remind me in ${settings.endOfDay?.snoozeMinutes || 30} min` }],
    requireInteraction: true,
    priority: 2,
  });
}

async function openReview() {
  const base = chrome.runtime.getURL('dashboard.html');
  const url = `${base}#/?review=${dayKey(Date.now())}`;
  const tabs = await chrome.tabs.query({ url: `${base}*` });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { active: true, url });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else await chrome.tabs.create({ url });
}

async function quickSend() {
  const { sessions, clickup: cu, settings } = await readAll();
  const unsent = unsentForDay(sessions, Date.now());
  if (!unsent.length) return;
  if (unsent.some((s) => !taskFor(s, cu, {}, settings.projects))) return openReview(); // needs a task choice
  try {
    const r = await netHandlers['clickup:send']({ sessionIds: unsent.map((s) => s.id) });
    chrome.notifications.create('eod-done', {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: r.failed.length ? 'Partly sent to ClickUp' : 'Sent to ClickUp',
      message: r.failed.length ? `${r.sent} sent, ${r.failed.length} need a look. Click to review.` : `${r.sent} ${r.sent === 1 ? 'entry' : 'entries'} (${fmtHM(r.ms)}) added to your timesheet.`,
    });
  } catch (e) {
    chrome.notifications.create('eod-done', { type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'), title: "Couldn't send to ClickUp", message: `${e.message} Click to review.` });
  }
}

chrome.notifications.onButtonClicked.addListener(async (id, i) => {
  if (id !== 'eod') return;
  chrome.notifications.clear('eod');
  const { clickup: cu, settings } = await readAll();
  if (i === 1) {
    chrome.alarms.create('eod-snooze', { delayInMinutes: settings.endOfDay?.snoozeMinutes || 30 });
    return;
  }
  if (cu.token) quickSend();
  else openReview();
});
chrome.notifications.onClicked.addListener((id) => {
  chrome.notifications.clear(id);
  if (id === 'eod' || id === 'eod-done') openReview();
  else if (id === 'recap') openDashboardAt('reports?tab=recap');
  else if (id === 'standup') openDashboardAt('reports?tab=standup');
});

// ---------------------------------------------------------------------------
// Projects, excluded pages, leave days, merge/split, stand-up notes

function cleanKeywords(list) {
  return [...new Set((list || []).map((k) => String(k).trim()).filter(Boolean))].slice(0, 30);
}

Object.assign(handlers, {
  async 'project:save'(st, { project }) {
    const name = String(project?.name || '').trim();
    if (!name) throw new Error('Give the project a name.');
    const list = [...(st.settings.projects || [])];
    let id = project.id;
    if (id) {
      const p = list.find((x) => x.id === id);
      if (!p) throw new Error('Project not found.');
      Object.assign(p, {
        name,
        keywords: cleanKeywords(project.keywords),
        task: 'task' in project ? project.task : p.task || null,
        palette: project.palette || p.palette,
        archived: !!project.archived,
      });
    } else {
      if (list.some((p) => p.name.toLowerCase() === name.toLowerCase() && !p.archived)) throw new Error(`You already have a project called ${name}.`);
      const used = new Set(list.filter((p) => !p.archived).map((p) => p.palette));
      id = uid('p');
      list.push({
        id,
        name,
        keywords: cleanKeywords(project.keywords?.length ? project.keywords : [name]),
        task: project.task || null,
        palette: project.palette || PROJECT_PALETTES.find((x) => !used.has(x)) || PROJECT_PALETTES[list.length % PROJECT_PALETTES.length],
        archived: false,
      });
    }
    st.settings.projects = list;
    st.dirty.add('settings');
    return { id };
  },
  async 'project:delete'(st, { id }) {
    st.settings.projects = (st.settings.projects || []).filter((p) => p.id !== id);
    for (const s of st.sessions) if (s.projectId === id) delete s.projectId;
    st.dirty.add('settings');
    st.dirty.add('sessions');
  },
  async 'session:setProject'(st, { ids, projectId }) {
    for (const s of st.sessions) {
      if (!ids.includes(s.id)) continue;
      if (projectId) s.projectId = projectId;
      else delete s.projectId;
    }
    st.dirty.add('sessions');
  },

  async 'exclude:add'(st, { kind, value }) {
    const v = kind === 'title' ? String(value || '').trim() : normalizeDomain(value);
    if (!v) throw new Error(kind === 'title' ? 'Enter some words from the tab title.' : 'Enter a web address, like docs.google.com/document/d/abc');
    const list = st.settings.excludes || [];
    if (!list.some((x) => x.kind === kind && x.value === v)) list.push({ id: uid('x'), kind: kind === 'title' ? 'title' : 'url', value: v });
    st.settings.excludes = list;
    st.dirty.add('settings');
    await evaluate(st); // stops counting right away if it's the current tab
  },
  async 'exclude:remove'(st, { id }) {
    st.settings.excludes = (st.settings.excludes || []).filter((x) => x.id !== id);
    st.dirty.add('settings');
    await evaluate(st);
  },

  async 'leave:add'(st, { from, to, kind, note }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '')) throw new Error('Pick a date.');
    const a = fromKey(from);
    const b = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? fromKey(to) : a;
    if (b < a) throw new Error('The last day must be on or after the first day.');
    if (b - a > 62 * 86400000) throw new Error('Add at most two months at a time.');
    const map = new Map((st.settings.leave || []).map((l) => [l.date, l]));
    for (let d = a; d <= b; d = addDays(d, 1)) map.set(dayKey(d), { date: dayKey(d), kind: kind === 'holiday' ? 'holiday' : 'leave', note: String(note || '').trim().slice(0, 80) });
    st.settings.leave = [...map.values()].sort((x, y) => x.date.localeCompare(y.date));
    st.dirty.add('settings');
    setTimeout(() => scheduleAll(), 0);
  },
  async 'leave:remove'(st, { date }) {
    st.settings.leave = (st.settings.leave || []).filter((l) => l.date !== date);
    st.dirty.add('settings');
    setTimeout(() => scheduleAll(), 0);
  },

  async 'session:renameMany'(st, { ids, title }) {
    const t = String(title || '').trim().slice(0, 200);
    if (!t) throw new Error('Give it a name.');
    for (const s of st.sessions) if (ids.includes(s.id)) s.title = t;
    st.dirty.add('sessions');
  },
  async 'session:merge'(st, { ids }) {
    const list = st.sessions.filter((s) => ids.includes(s.id));
    if (list.length < 2) throw new Error('Select at least two sessions to merge.');
    if (list.some((s) => s.end == null)) throw new Error("A running session can't be merged. Stop or pause tracking first.");
    if (list.some((s) => s.clickup)) throw new Error('One of these is already in ClickUp, so it can’t be merged.');
    if (new Set(list.map((s) => dayKey(s.start))).size > 1) throw new Error('Only sessions from the same day can be merged.');
    const longest = list.reduce((a, b) => (sessionDuration(b) > sessionDuration(a) ? b : a));
    const start = Math.min(...list.map((s) => s.start));
    const end = Math.max(...list.map((s) => s.end));
    const active = list.reduce((t, s) => t + sessionDuration(s), 0);
    const merged = { ...longest, start, end, pausedMs: Math.max(0, end - start - active), manual: list.some((s) => s.manual), edited: true };
    st.sessions = st.sessions.filter((s) => !ids.includes(s.id) || s.id === longest.id).map((s) => (s.id === longest.id ? merged : s));
    st.dirty.add('sessions');
    return { id: longest.id };
  },
  async 'session:split'(st, { id, at }) {
    const s = st.sessions.find((x) => x.id === id);
    if (!s) throw new Error('That session no longer exists.');
    if (s.end == null) throw new Error("A running session can't be split yet.");
    if (s.clickup) throw new Error('This session is already in ClickUp.');
    if (!(at > s.start + 60000 && at < s.end - 60000)) throw new Error('Pick a time at least a minute inside the session.');
    const raw = s.end - s.start;
    const p1 = Math.round((s.pausedMs || 0) * ((at - s.start) / raw));
    const second = { ...s, id: uid('s'), start: at, pausedMs: (s.pausedMs || 0) - p1, edited: true, createdAt: Date.now() };
    s.end = at;
    s.pausedMs = p1;
    s.edited = true;
    st.sessions.push(second);
    st.dirty.add('sessions');
    return { id: second.id };
  },

  async 'notes:save'(st, { day, patch }) {
    st.notes = { ...(st.notes || {}), [day]: { ...(st.notes?.[day] || {}), ...patch } };
    // Keep two months of notes.
    const cutoff = dayKey(addDays(Date.now(), -62));
    for (const k of Object.keys(st.notes)) if (k < cutoff) delete st.notes[k];
    st.dirty.add('notes');
  },
  async 'ai:save'(st, { patch }) {
    st.ai = { ...st.ai, ...('apiKey' in patch ? { apiKey: String(patch.apiKey || '').trim() } : {}), ...('model' in patch ? { model: patch.model } : {}) };
    st.dirty.add('ai');
  },
  async 'google:update'(st, { patch }) {
    for (const k of ['clientId', 'calendarMatch', 'autoSync', 'holidayCalendar']) if (k in patch) st.google[k] = typeof patch[k] === 'string' ? patch[k].trim() : patch[k];
    st.dirty.add('google');
  },
  async 'google:disconnect'(st) {
    if (st.google.token) fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(st.google.token)}`, { method: 'POST' }).catch(() => {});
    st.google = { ...st.google, token: '', tokenExp: 0, email: '', connected: false };
    st.settings.holidays = [];
    st.dirty.add('google');
    st.dirty.add('settings');
  },
});

function fromKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

// ---------------------------------------------------------------------------
// Gentle nudges: breaks, lunch, overtime

function notify(id, title, message) {
  chrome.notifications.create(id, { type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'), title, message, priority: 0 });
}

const NUDGE_TEXT = {
  break: (name, focus) => ({
    title: `Time for a stretch${name ? `, ${name}` : ''}`,
    message: `You've been focused for ${focus}. Stand up, roll your shoulders, grab some water. I'll pause while you're away.`,
    primary: 'Take a 5-min break',
    secondary: 'In 15 min',
  }),
  water: (name) => ({
    title: `Quick sip of water${name ? `, ${name}` : ''}?`,
    message: "It's been a while since your last pause. A glass of water helps more than another coffee.",
    primary: 'Done',
    secondary: 'Later',
  }),
  lunch: (name, wh) => ({
    title: `Lunch time${name ? `, ${name}` : ''}`,
    message: `Your break runs ${wh.lunchStart}–${wh.lunchEnd}. Enjoy it. Anything you do now is kept separate from your regular hours.`,
    primary: 'Pause for lunch',
    secondary: 'Not now',
  }),
  overtime: (name, wh) => ({
    title: `It's past ${wh.end}${name ? `, ${name}` : ''}`,
    message: 'From here your time counts as overtime. Wrapping up soon?',
    primary: 'Stop for today',
    secondary: 'Keep going',
  }),
};

/** Show a nudge as a card inside the tab you're working in; fall back to a system notification. */
async function nudge(st, kind, ...args) {
  const text = NUDGE_TEXT[kind](st.settings.name, ...args);
  const n = { ...DEFAULT_NUDGES, ...(st.settings.nudges || {}) };
  const opts = { id: `${kind}-${Date.now()}`, kind, ...text, dark: st.settings.theme === 'dark' };
  if (n.where !== 'system') {
    try {
      const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
      const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
      if (tab?.id && /^https?:/.test(tab.url || '')) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: showNudge, args: [opts] });
        return;
      }
    } catch {
      /* no access to this page: use a notification instead */
    }
  }
  chrome.notifications.create(`nudge-${kind}`, { type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'), title: text.title, message: text.message, priority: 0, buttons: [{ title: text.primary }, { title: text.secondary }] });
}

function nudges(st, now) {
  const t = st.tracker;
  const n = { ...DEFAULT_NUDGES, ...(st.settings.nudges || {}) };
  const wh = workHours(st.settings);
  const counting = t.status === 'on' && !!t.currentId;
  const today = dayKey(now);
  if (!t.nudged || t.nudged.day !== today) t.nudged = { day: today };
  if (counting) {
    // A gap of 5+ minutes (idle, paused, elsewhere) counts as a break and resets the focus clocks.
    if (!t.focusSince || (t.lastCountAt && now - t.lastCountAt > 5 * 60000)) {
      t.focusSince = now;
      t.breakAt = null;
      t.waterAt = now;
    }
    t.lastCountAt = now;
    const focusMs = now - t.focusSince;
    const every = (n.breakMinutes || 90) * 60000;
    let shown = false;
    if (n.breakEnabled && now >= (t.breakSnoozeUntil || 0) && focusMs >= every && (!t.breakAt || now - t.breakAt >= every)) {
      t.breakAt = now;
      t.waterAt = now;
      shown = true;
      nudge(st, 'break', fmtHM(focusMs));
    }
    const waterEvery = (n.waterMinutes || 45) * 60000;
    if (!shown && n.water && now >= (t.waterSnoozeUntil || 0) && now - (t.waterAt || t.focusSince) >= waterEvery) {
      t.waterAt = now;
      shown = true;
      nudge(st, 'water');
    }
    if (isWorkday(now, wh)) {
      if (!shown && n.lunch && phaseAt(now, wh) === 'lunch' && !t.nudged.lunch) {
        t.nudged.lunch = true;
        shown = true;
        nudge(st, 'lunch', wh);
      }
      const endTs = startOfDay(now) + hm(wh.end) * 60000;
      if (!shown && n.overtime && now >= endTs && now - endTs < 4 * 3600000 && !t.nudged.overtime) {
        t.nudged.overtime = true;
        nudge(st, 'overtime', wh);
      }
    }
  } else if (t.lastCountAt && now - t.lastCountAt > 5 * 60000) {
    t.focusSince = null;
  }
  st.dirty.add('tracker');
}

/** Pause now and resume on its own at `until` (a short break, or lunch). */
async function pauseUntil(st, until, reason) {
  closeCurrent(st, Date.now());
  st.tracker = { ...st.tracker, status: 'paused', reason, idleSince: null, resumeAt: until };
  st.dirty.add('tracker');
  await chrome.alarms.create('auto-resume', { when: until });
}

async function handleNudgeAction(st, kind, action) {
  const now = Date.now();
  const t = st.tracker;
  const wh = workHours(st.settings);
  if (kind === 'break') {
    if (action === 'primary') await pauseUntil(st, now + 5 * 60000, 'break');
    else t.breakSnoozeUntil = now + 15 * 60000;
  } else if (kind === 'water') {
    if (action === 'secondary') {
      t.waterSnoozeUntil = now + 15 * 60000;
      t.waterAt = now - ((st.settings.nudges?.waterMinutes || 45) - 15) * 60000;
    }
  } else if (kind === 'lunch') {
    if (action === 'primary' && st.tracker.status === 'on') await pauseUntil(st, startOfDay(now) + hm(wh.lunchEnd) * 60000, 'lunch');
  } else if (kind === 'overtime') {
    if (action === 'primary') await handlers.stop(st, { forToday: true });
  }
  st.dirty.add('tracker');
}

Object.assign(handlers, {
  async 'nudge:action'(st, { kind, action }) {
    await handleNudgeAction(st, kind, action);
  },
});

chrome.notifications.onButtonClicked.addListener((id, i) => {
  const m = id.match(/^nudge-(break|water|lunch|overtime)$/);
  if (!m) return;
  chrome.notifications.clear(id);
  tx((st) => handleNudgeAction(st, m[1], i === 0 ? 'primary' : 'secondary'));
});

// ---------------------------------------------------------------------------
// Scheduled reminders: end of day, weekly recap, stand-up

async function scheduleAt(name, time, enabled, pick) {
  await chrome.alarms.clear(name);
  if (!enabled) return;
  const now = Date.now();
  for (let i = 0; i < 14; i++) {
    const day = addDays(startOfDay(now), i);
    const when = day + hm(time) * 60000;
    if (when > now + 1000 && pick(day)) {
      await chrome.alarms.create(name, { when });
      return;
    }
  }
}

function lastWorkdayOfWeek(day, wh) {
  const weekEnd = addDays(startOfWeek(day), 7);
  for (let d = addDays(day, 1); d < weekEnd; d = addDays(d, 1)) if (isWorkday(d, wh)) return false;
  return true;
}

async function scheduleAll() {
  const { settings } = await readAll();
  const wh = workHours(settings);
  await scheduleEod();
  const eod = { ...DEFAULT_END_OF_DAY, ...(settings.endOfDay || {}) };
  // The recap comes a minute after the end-of-day check-in on the week's last working day.
  const [h, m] = eod.time.split(':').map(Number);
  const recapTime = `${String(h + (m === 59 ? 1 : 0)).padStart(2, '0')}:${String((m + 1) % 60).padStart(2, '0')}`;
  await scheduleAt('recap', recapTime, settings.weeklyRecap !== false, (d) => isWorkday(d, wh) && lastWorkdayOfWeek(d, wh));
  await scheduleAt('standup', settings.standup?.time || '08:45', settings.standup?.reminder !== false, (d) => isWorkday(d, wh));
}

async function openDashboardAt(route) {
  const base = chrome.runtime.getURL('dashboard.html');
  const url = `${base}#/${route}`;
  const tabs = await chrome.tabs.query({ url: `${base}*` });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { active: true, url });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else await chrome.tabs.create({ url });
}

async function weeklyRecap() {
  await scheduleAll();
  const { sessions, settings } = await readAll();
  const now = Date.now();
  const a = startOfWeek(now);
  const week = sessions.filter((s) => s.start >= a);
  const total = week.reduce((t, s) => t + sessionDuration(s, now), 0);
  if (total < 30 * 60000) return;
  const wh = workHours(settings);
  const ot = week.reduce((t, s) => t + splitSession(s, wh, now).overtime, 0);
  const perDay = new Map();
  for (const s of week) perDay.set(startOfDay(s.start), (perDay.get(startOfDay(s.start)) || 0) + sessionDuration(s, now));
  const best = [...perDay.entries()].sort((x, y) => y[1] - x[1])[0];
  notify(
    'recap',
    'Your week in Nthawi',
    `${fmtHM(total)} across ${perDay.size} ${perDay.size === 1 ? 'day' : 'days'}${ot >= 60000 ? `, ${fmtHM(ot)} overtime` : ''}. Your fullest day was ${weekdayLong(best[0])}. Click for your recap. Have a good weekend!`,
  );
}

async function standupReminder() {
  await scheduleAll();
  const { sessions, settings } = await readAll();
  const now = Date.now();
  const wh = workHours(settings);
  const prev = previousWorkday(now, wh);
  const list = sessions.filter((s) => s.start >= prev && s.start < addDays(prev, 1));
  const total = list.reduce((t, s) => t + sessionDuration(s, now), 0);
  notify('standup', 'Stand-up soon', total ? `Your notes are ready: ${fmtHM(total)} on ${weekdayLong(prev)}. Click to add today's plan and any blockers.` : "Click to jot down today's plan and any blockers before stand-up.");
}

// ---------------------------------------------------------------------------
// Google: sign-in, meeting names, holidays, live sheet

async function googleToken(interactive = false) {
  const { google: g } = await readAll();
  if (!g.clientId) throw new G.GoogleError('Add your Google OAuth client ID in Settings → Google.');
  if (g.token && g.tokenExp > Date.now()) return g.token;
  if (!g.connected && !interactive) throw new G.GoogleError('Connect Google in Settings first.');
  const r = await G.signIn(g.clientId, { interactive, email: g.email });
  await tx(async (st) => {
    st.google = { ...st.google, token: r.token, tokenExp: r.expiresAt, connected: true };
    st.dirty.add('google');
  });
  return r.token;
}

async function matchMeetings(day = Date.now()) {
  const token = await googleToken(false);
  const { sessions } = await readAll();
  const a = startOfDay(day);
  const b = addDays(a, 1);
  const meets = sessions.filter((s) => s.toolId === 'meet' && s.start >= a && s.start < b && !s.event && s.title === s.key);
  if (!meets.length) return { renamed: 0 };
  const evs = (await G.events(token, 'primary', a, b)).filter((e) => !e.allDay);
  const changes = [];
  for (const s of meets) {
    const code = (s.key || '').match(/[a-z]{3}-[a-z]{4}-[a-z]{3}/i)?.[0];
    let ev = code ? evs.find((e) => e.meet && e.meet.toLowerCase().includes(code.toLowerCase())) : null;
    if (!ev) {
      // No code match: the video meeting closest to when you joined.
      ev = evs
        .filter((e) => e.meet && e.start - 15 * 60000 <= s.start && e.end + 5 * 60000 >= s.start)
        .sort((x, y) => Math.abs(x.start - s.start) - Math.abs(y.start - s.start))[0];
    }
    if (ev) changes.push({ id: s.id, title: ev.summary, event: { id: ev.id, summary: ev.summary } });
  }
  if (changes.length)
    await tx(async (st) => {
      for (const c of changes) {
        const s = st.sessions.find((x) => x.id === c.id);
        if (s && s.title === s.key) {
          s.title = c.title;
          s.event = c.event;
        }
      }
      st.dirty.add('sessions');
    });
  return { renamed: changes.length };
}

let lastMeetMatch = 0;
async function maybeMatchMeetings() {
  if (Date.now() - lastMeetMatch < 10 * 60000) return;
  lastMeetMatch = Date.now();
  const { google: g } = await readAll();
  if (!g.connected || !g.calendarMatch) return;
  try {
    await matchMeetings();
  } catch {
    /* quiet: shown in Settings when it matters */
  }
}

async function refreshHolidays(token) {
  const { google: g } = await readAll();
  if (!g.holidayCalendar) return 0;
  const y = new Date().getFullYear();
  const evs = await G.events(token, g.holidayCalendar, new Date(y, 0, 1).getTime(), new Date(y + 2, 0, 1).getTime());
  const holidays = evs.filter((e) => e.allDay).map((e) => ({ date: e.start, name: e.summary }));
  await tx(async (st) => {
    st.settings.holidays = holidays;
    st.dirty.add('settings');
  });
  setTimeout(() => scheduleAll(), 0);
  return holidays.length;
}

function sheetTabs(sessions, settings) {
  const wh = workHours(settings);
  const h = (ms) => Math.round((ms / 3600000) * 100) / 100;
  const cutoff = addDays(startOfDay(Date.now()), -400);
  const list = sessions.filter((s) => s.start >= cutoff && s.end != null).sort((a, b) => a.start - b.start);
  const rows = [['Date', 'Start', 'End', 'Hours', 'Regular', 'Lunch', 'Overtime', 'Tool', 'Project', 'Session', 'Type', 'In ClickUp']];
  const days = new Map();
  for (const s of list) {
    const sp = splitSession(s, wh);
    const p = projectFor(s, settings.projects);
    rows.push([dayKey(s.start), fmtClock(s.start), fmtClock(s.end), h(sp.active), h(sp.regular), h(sp.lunch), h(sp.overtime), toolById(settings.tools, s.toolId).name, p?.name || '', s.title, s.manual ? 'Manual' : 'Tracked', s.clickup ? 'Yes' : '']);
    const k = dayKey(s.start);
    const d = days.get(k) || { day: startOfDay(s.start), total: 0, regular: 0, lunch: 0, overtime: 0, count: 0 };
    d.total += sp.active;
    d.regular += sp.regular;
    d.lunch += sp.lunch;
    d.overtime += sp.overtime;
    d.count++;
    days.set(k, d);
  }
  const dayRows = [['Date', 'Weekday', 'Hours', 'Regular', 'Lunch', 'Overtime', 'Sessions', 'Day off']];
  for (const [k, d] of days) {
    const off = dayOff(d.day, wh);
    dayRows.push([k, weekdayLong(d.day), h(d.total), h(d.regular), h(d.lunch), h(d.overtime), d.count, off ? `${off.kind}${off.note ? `: ${off.note}` : ''}` : '']);
  }
  return { Sessions: rows, Days: dayRows };
}

async function syncSheet(interactive) {
  const token = await googleToken(interactive);
  const { sessions, settings, google: g } = await readAll();
  const tabs = sheetTabs(sessions, settings);
  let { sheetId, sheetUrl } = g;
  try {
    if (!sheetId) throw Object.assign(new Error('new'), { status: 404 });
    await G.writeSheets(token, sheetId, tabs);
  } catch (e) {
    if (e.status !== 404 && e.status !== 403) throw e;
    const c = await G.createSpreadsheet(token, 'Nthawi time log');
    sheetId = c.id;
    sheetUrl = c.url;
    await G.writeSheets(token, sheetId, tabs);
  }
  const rows = tabs.Sessions.length - 1;
  await tx(async (st) => {
    st.google = { ...st.google, sheetId, sheetUrl, lastSync: { at: Date.now(), rows } };
    st.dirty.add('google');
  });
  return { url: sheetUrl, rows };
}

async function syncSheetQuietly() {
  const { google: g } = await readAll();
  if (!g.connected || !g.autoSync || !g.sheetId) return;
  try {
    await syncSheet(false);
  } catch (e) {
    await tx(async (st) => {
      st.google = { ...st.google, lastSync: { at: Date.now(), error: e.message } };
      st.dirty.add('google');
    });
  }
}

Object.assign(netHandlers, {
  async 'google:connect'({ clientId }) {
    if (clientId != null)
      await tx(async (st) => {
        st.google = { ...st.google, clientId: String(clientId).trim() };
        st.dirty.add('google');
      });
    const { google: g } = await readAll();
    const r = await G.signIn(g.clientId, { interactive: true });
    const email = await G.userEmail(r.token).catch(() => '');
    await tx(async (st) => {
      st.google = { ...st.google, token: r.token, tokenExp: r.expiresAt, email, connected: true };
      st.dirty.add('google');
    });
    let holidays = 0;
    try {
      holidays = await refreshHolidays(r.token);
    } catch {
      /* the holiday calendar is optional */
    }
    lastMeetMatch = 0;
    maybeMatchMeetings();
    return { email, holidays };
  },
  async 'google:holidays'() {
    return { count: await refreshHolidays(await googleToken(true)) };
  },
  async 'google:matchMeetings'({ day }) {
    await googleToken(true);
    return matchMeetings(day || Date.now());
  },
  async 'google:agenda'({ day }) {
    const token = await googleToken(true);
    const a = startOfDay(day || Date.now());
    const evs = await G.events(token, 'primary', a, addDays(a, 1));
    return { events: evs.filter((e) => !e.allDay && !e.declined).map((e) => ({ summary: e.summary, start: e.start, end: e.end })) };
  },
  async 'google:syncSheet'() {
    return syncSheet(true);
  },
  async 'ai:standup'({ notes }) {
    const { ai } = await readAll();
    return rewriteStandup(ai, notes);
  },
});

// ---------------------------------------------------------------------------
// Vacation Tracker: your personal iCal link → leave days and public holidays

async function syncVacation() {
  const { settings } = await readAll();
  const vt = settings.vacation || {};
  if (!vt.url) throw new Error('Paste your Vacation Tracker calendar link first.');
  let text;
  try {
    const res = await fetch(vt.url.replace(/^webcal:/i, 'https:'), { cache: 'no-store' });
    if (!res.ok) throw new Error(`Vacation Tracker returned an error (${res.status}). Check the link.`);
    text = await res.text();
  } catch (e) {
    throw new Error(/returned/.test(e.message) ? e.message : "Couldn't reach Vacation Tracker. Check your connection and the link.");
  }
  if (!/BEGIN:VCALENDAR/.test(text)) throw new Error("That link didn't return a calendar. Copy the iCal link again.");
  const now = Date.now();
  const days = icsDaysOff(text, addDays(startOfDay(now), -90), addDays(startOfDay(now), 400));
  await tx(async (st) => {
    const manual = (st.settings.leave || []).filter((l) => l.source !== 'vt');
    const map = new Map(days.map((d) => [d.date, d]));
    for (const m of manual) map.set(m.date, m); // your own entries win
    st.settings.leave = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
    st.settings.vacation = { ...st.settings.vacation, lastSync: Date.now(), error: null, count: days.length };
    st.dirty.add('settings');
  });
  setTimeout(() => scheduleAll(), 0);
  return { count: days.length, leave: days.filter((d) => d.kind === 'leave').length, holidays: days.filter((d) => d.kind === 'holiday').length };
}

let vtSyncing = false;
async function maybeSyncVacation() {
  if (vtSyncing) return;
  const { settings } = await readAll();
  const vt = settings.vacation;
  if (!vt?.url || (vt.lastSync && Date.now() - vt.lastSync < 6 * 3600000)) return;
  vtSyncing = true;
  try {
    await syncVacation();
  } catch (e) {
    await tx(async (st) => {
      st.settings.vacation = { ...st.settings.vacation, lastSync: Date.now(), error: e.message };
      st.dirty.add('settings');
    });
  } finally {
    vtSyncing = false;
  }
}

Object.assign(netHandlers, {
  async 'vt:connect'({ url }) {
    const u = String(url || '').trim();
    if (!/^(https?|webcal):\/\/\S+$/i.test(u)) throw new Error('Paste the full link. It starts with https:// or webcal://');
    await tx(async (st) => {
      st.settings.vacation = { url: u, lastSync: null, error: null };
      st.dirty.add('settings');
    });
    try {
      return await syncVacation();
    } catch (e) {
      await tx(async (st) => {
        st.settings.vacation = null;
        st.dirty.add('settings');
      });
      throw e;
    }
  },
  async 'vt:sync'() {
    return syncVacation();
  },
});

Object.assign(handlers, {
  async 'vt:disconnect'(st) {
    st.settings.vacation = null;
    st.settings.leave = (st.settings.leave || []).filter((l) => l.source !== 'vt');
    st.dirty.add('settings');
    setTimeout(() => scheduleAll(), 0);
  },
});

// ---------------------------------------------------------------------------
// Lifecycle

chrome.runtime.onInstalled.addListener(async (details) => {
  await tx(async (st) => {
    // Make sure settings exist (and gain any new default keys after an update).
    st.settings = { ...DEFAULT_SETTINGS, ...st.settings };
    // Older installs: give built-in tools their home page (used to find their logo).
    st.settings.tools = st.settings.tools.map((t) => {
      const def = DEFAULT_TOOLS.find((d) => d.id === t.id);
      return def && t.builtin && !t.home ? { ...t, home: def.home } : t;
    });
    st.dirty.add('settings');
    await seedIcons(st);
    const cur = openSession(st);
    if (cur && st.tracker.lastBeat) closeCurrent(st, st.tracker.lastBeat);
    chrome.idle.setDetectionInterval(idleThresholdSec(st));
  });
  await ensureAlarm();
  await scheduleAll();
  if (details.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
});

chrome.runtime.onStartup.addListener(async () => {
  await tx(async (st) => {
    // Chrome was closed: the open session ended at the last heartbeat.
    const cur = openSession(st);
    if (cur) closeCurrent(st, st.tracker.lastBeat || cur.activeSince || cur.start);
    st.tracker.lastBeat = Date.now();
    st.dirty.add('tracker');
    autoStart(st, Date.now(), true);
    chrome.idle.setDetectionInterval(idleThresholdSec(st));
    await seedIcons(st);
    await evaluate(st);
  });
  await ensureAlarm();
  await scheduleAll();
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const net = msg && netHandlers[msg.type];
  if (net) {
    net(msg)
      .then((r) => reply(r ?? { ok: true }))
      .catch((e) => reply({ error: e?.message || String(e) }));
    return true;
  }
  const h = msg && handlers[msg.type];
  if (!h) return false;
  tx((st) => h(st, msg))
    .then((r) => reply(r ?? { ok: true }))
    .catch((e) => reply({ error: e?.message || String(e) }));
  return true;
});

// Worker (re)started for any reason: make sure the heartbeat exists.
ensureAlarm();

// Handy from the service worker console (chrome://extensions → Inspect views):
//   __nthawi.idle('idle'), __nthawi.idle('active'), __nthawi.beat()
self.__nthawi = self.__activeTime = { startup: () => tx(async (st) => { autoStart(st, Date.now(), true); await evaluate(st); }), nudge: (kind) => tx(async (st) => { await nudge(st, kind, kind === 'break' ? '1h 30m' : workHours(st.settings)); }), idle: onIdleState, beat: heartbeat, evaluate: () => tx((st) => evaluate(st)), endOfDay, weeklyRecap, standupReminder, nudges: () => tx((st) => nudges(st, Date.now())), setClickUpApi: setApiBase };
scheduleAll();
