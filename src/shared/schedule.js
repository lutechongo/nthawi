// Working hours: split tracked time into regular hours, lunch and overtime.
import { DEFAULT_WORK_HOURS } from './constants.js';
import { sessionDuration } from './store.js';
import { startOfDay, addDays, MIN, dayKey } from './time.js';

export function hm(str) {
  const [h, m] = String(str || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function workHours(settings) {
  // Leave and public holidays are days off: any work then counts as overtime.
  const off = new Map();
  for (const h of settings?.holidays || []) off.set(h.date, { kind: 'holiday', note: h.name });
  for (const l of settings?.leave || []) off.set(l.date, { kind: l.kind || 'leave', note: l.note || '' });
  return { ...DEFAULT_WORK_HOURS, ...(settings?.workHours || {}), off };
}

/** { kind: 'leave' | 'holiday', note } when the day is a day off, else null. */
export function dayOff(ts, wh) {
  return wh.off?.get(dayKey(ts)) || null;
}

/** Regular / lunch windows for the day containing `dayStart`, as [a, b] ms pairs. */
function windowsFor(dayStart, wh) {
  const dow = new Date(dayStart).getDay();
  if (!wh.days.includes(dow) || wh.off?.has(dayKey(dayStart))) return { work: [], lunch: [] };
  const at = (m) => dayStart + m * MIN;
  const s = hm(wh.start);
  const e = hm(wh.end);
  const ls = Math.max(s, hm(wh.lunchStart));
  const le = Math.min(e, hm(wh.lunchEnd));
  if (e <= s) return { work: [], lunch: [] };
  if (le <= ls) return { work: [[at(s), at(e)]], lunch: [] };
  return { work: [[at(s), at(ls)], [at(le), at(e)]], lunch: [[at(ls), at(le)]] };
}

const overlap = (a, b, [x, y]) => Math.max(0, Math.min(b, y) - Math.max(a, x));

/** Split a raw clock interval into { regular, lunch, overtime } ms. */
export function splitInterval(a, b, wh) {
  const out = { regular: 0, lunch: 0, overtime: 0 };
  if (b <= a) return out;
  for (let d = startOfDay(a); d < b; d = addDays(d, 1)) {
    const da = Math.max(a, d);
    const db = Math.min(b, addDays(d, 1));
    const w = windowsFor(d, wh);
    const reg = w.work.reduce((t, win) => t + overlap(da, db, win), 0);
    const lunch = w.lunch.reduce((t, win) => t + overlap(da, db, win), 0);
    out.regular += reg;
    out.lunch += lunch;
    out.overtime += db - da - reg - lunch;
  }
  if (wh.lunchIsOvertime) {
    out.overtime += out.lunch;
    out.lunch = 0;
  }
  return out;
}

/**
 * Split a session's active time. Paused/idle minutes inside a session aren't
 * located precisely, so the split is scaled to the session's active share.
 */
export function splitSession(s, wh, now = Date.now()) {
  const end = s.end ?? now;
  const raw = end - s.start;
  const active = sessionDuration(s, now);
  const parts = splitInterval(s.start, end, wh);
  if (raw <= 0) return { regular: 0, lunch: 0, overtime: 0, active };
  const f = active / raw;
  return { regular: parts.regular * f, lunch: parts.lunch * f, overtime: parts.overtime * f, active };
}

export function overtimeOf(sessions, wh, now = Date.now()) {
  return sessions.reduce((t, s) => t + splitSession(s, wh, now).overtime, 0);
}

export function lunchOf(sessions, wh, now = Date.now()) {
  return sessions.reduce((t, s) => t + splitSession(s, wh, now).lunch, 0);
}

/** 'regular' | 'lunch' | 'overtime' for a moment in time. */
export function phaseAt(ts, wh) {
  const d = startOfDay(ts);
  const w = windowsFor(d, wh);
  if (w.work.some(([a, b]) => ts >= a && ts < b)) return 'regular';
  if (w.lunch.some(([a, b]) => ts >= a && ts < b)) return wh.lunchIsOvertime ? 'overtime' : 'lunch';
  return 'overtime';
}

/** Working/lunch windows of a day, for drawing the timeline background. */
export function dayWindows(dayStart, wh) {
  return windowsFor(dayStart, wh);
}

export function isWorkday(ts, wh) {
  return wh.days.includes(new Date(ts).getDay()) && !wh.off?.has(dayKey(ts));
}

/** The most recent working day before `ts` (skips weekends, leave and holidays; max 14 days back). */
export function previousWorkday(ts, wh) {
  let d = addDays(startOfDay(ts), -1);
  for (let i = 0; i < 14 && !isWorkday(d, wh); i++) d = addDays(d, -1);
  return d;
}
