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
import { workHours, splitSession, hm, isWorkday } from '../shared/schedule.js';
import { getUser, getTeams, getTask, createTimeEntry, setApiBase } from '../shared/clickup.js';
import { DEFAULT_END_OF_DAY } from '../shared/constants.js';

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
  const key = sessionTitleFromTab(tab.title, tool, tab.url);
  lastTab = tab;
  return { toolId: tool.id, key, tabId: tab.id };
}
let lastTab = null;

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
  async stop(st) {
    closeCurrent(st, Date.now());
    st.tracker = { ...st.tracker, status: 'off', reason: null, idleSince: null, currentId: null };
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
    st.tracker = { ...st.tracker, status: 'on', reason: null, idleSince: null };
    st.dirty.add('tracker');
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
    const allowed = ['name', 'role', 'roleCustom', 'photo', 'theme', 'idleMinutes', 'meetIdleMinutes', 'onboarded'];
    for (const k of allowed) if (k in patch) st.settings[k] = patch[k];
    if (patch.workHours) {
      const wh = { ...workHours(st.settings), ...patch.workHours };
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

async function heartbeat() {
  await tx(async (st) => {
    const now = Date.now();
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
  });
}

async function ensureAlarm() {
  const a = await chrome.alarms.get('beat');
  if (!a) await chrome.alarms.create('beat', { periodInMinutes: HEARTBEAT_MINUTES, delayInMinutes: HEARTBEAT_MINUTES });
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'beat') heartbeat();
  if (a.name === 'eod') endOfDay(false);
  if (a.name === 'eod-snooze') endOfDay(true);
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

/** Which ClickUp task a session goes to: per-session choice, else its tool's task, else the default. */
function taskFor(session, cu, overrides = {}) {
  return overrides[session.id] || cu.toolTasks?.[session.toolId] || cu.defaultTask || null;
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
    const list = sessions.filter((s) => sessionIds.includes(s.id) && s.end != null && !s.clickup);
    const sent = [];
    const failed = [];
    for (const s of list) {
      const task = taskFor(s, cu, overrides);
      if (!task) {
        failed.push({ id: s.id, error: 'No ClickUp task chosen' });
        continue;
      }
      const tool = toolById(settings.tools, s.toolId);
      const split = splitSession(s, wh);
      const ot = cu.markOvertime && split.overtime >= split.active / 2;
      try {
        const entryId = await createTimeEntry(cu.token, cu.teamId, {
          description: `${s.title} (${tool.name})${ot ? ' · Overtime' : ''}`,
          start: s.start,
          duration: Math.round(sessionDuration(s)),
          billable: false,
          tid: task.id,
        });
        sent.push({ id: s.id, entryId, taskId: task.id, taskName: task.name });
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
          if (s) s.clickup = { entryId: r.entryId, taskId: r.taskId, taskName: r.taskName, at };
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
    const allowed = ['teamId', 'defaultTask', 'toolTasks', 'markOvertime'];
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
  const { sessions, clickup: cu } = await readAll();
  const unsent = unsentForDay(sessions, Date.now());
  if (!unsent.length) return;
  if (unsent.some((s) => !taskFor(s, cu))) return openReview(); // needs a task choice
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
  if (id === 'eod' || id === 'eod-done') {
    chrome.notifications.clear(id);
    openReview();
  }
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
  await scheduleEod();
  if (details.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
});

chrome.runtime.onStartup.addListener(async () => {
  await tx(async (st) => {
    // Chrome was closed: the open session ended at the last heartbeat.
    const cur = openSession(st);
    if (cur) closeCurrent(st, st.tracker.lastBeat || cur.activeSince || cur.start);
    st.tracker.lastBeat = Date.now();
    st.dirty.add('tracker');
    chrome.idle.setDetectionInterval(idleThresholdSec(st));
    await seedIcons(st);
    await evaluate(st);
  });
  await ensureAlarm();
  await scheduleEod();
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
self.__nthawi = self.__activeTime = { idle: onIdleState, beat: heartbeat, evaluate: () => tx((st) => evaluate(st)), endOfDay, setClickUpApi: setApiBase };
scheduleEod();
