// Storage layout (chrome.storage.local) and small read helpers shared by the
// background worker and the UI. Only the background worker writes; the UI
// sends it commands via `send()`.

import { DEFAULT_SETTINGS, OTHER_TOOL } from './constants.js';

export const KEYS = {
  settings: 'settings',
  sessions: 'sessions',
  idleLog: 'idleLog',
  tracker: 'tracker',
  clickup: 'clickup',
  google: 'google',
  ai: 'ai',
  notes: 'notes',
};

export const DEFAULT_GOOGLE = {
  clientId: '',
  token: '',
  tokenExp: 0,
  email: '',
  connected: false,
  calendarMatch: true, // name Meet sessions after calendar events
  holidayCalendar: 'en.zm#holiday@group.v.calendar.google.com',
  sheetId: '',
  sheetUrl: '',
  autoSync: true,
  lastSync: null, // { at, rows } | { at, error }
};

export const DEFAULT_AI = { apiKey: '', model: 'claude-haiku-5-5' };

// ClickUp connection lives under its own key so it never ends up in JSON exports.
export const DEFAULT_CLICKUP = {
  token: '',
  user: null, // { id, username, email }
  teams: [], // [{ id, name }]
  teamId: '',
  defaultTask: null, // { id, name, url, list }
  toolTasks: {}, // { [toolId]: task }
  markOvertime: true,
  sendDescriptions: false, // descriptions count as ClickUp "Advanced Time Tracking" (limited on most plans)
  lastSync: null, // { at, day, count }
  memory: {}, // learned: session title (lower-case) -> task
};

export const DEFAULT_TRACKER = {
  status: 'off', // 'off' | 'on' | 'paused'
  reason: null, // when paused: 'manual' | 'idle'
  idleSince: null, // ms timestamp the idle period began
  currentId: null, // id of the open session, if time is counting right now
  ctx: null, // { toolId, title, tabId } of the focused tracked tab, if any
  lastBeat: null,
  startedAt: null,
};

/**
 * Session: { id, title, toolId, start, end (null while open), pausedMs, manual, createdAt }
 * Idle log entry: { start, end, toolId }
 */

export async function readAll() {
  const r = await chrome.storage.local.get(Object.values(KEYS));
  return {
    settings: { ...DEFAULT_SETTINGS, ...(r.settings || {}) },
    sessions: r.sessions || [],
    idleLog: r.idleLog || [],
    tracker: { ...DEFAULT_TRACKER, ...(r.tracker || {}) },
    clickup: { ...DEFAULT_CLICKUP, ...(r.clickup || {}) },
    google: { ...DEFAULT_GOOGLE, ...(r.google || {}) },
    ai: { ...DEFAULT_AI, ...(r.ai || {}) },
    notes: r.notes || {}, // stand-up notes by day: { [YYYY-MM-DD]: { today, blockers, ai } }
  };
}

export function sessionDuration(s, now = Date.now()) {
  const end = s.end ?? now;
  return Math.max(0, end - s.start - (s.pausedMs || 0));
}

export function toolById(tools, id) {
  if (id === OTHER_TOOL.id) return OTHER_TOOL;
  return tools.find((t) => t.id === id) || { ...OTHER_TOOL, id, name: 'Unknown', short: 'Unknown' };
}

export function uid(prefix = 's') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Send a command to the background worker. Resolves with its reply or throws its error. */
export async function send(type, payload = {}) {
  const res = await chrome.runtime.sendMessage({ type, ...payload });
  if (res && res.error) throw new Error(res.error);
  return res;
}
