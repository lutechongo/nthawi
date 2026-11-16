// Aggregations used by the popup and the dashboard.
import { sessionDuration } from './store.js';
import { startOfDay, daysIn } from './time.js';

export function inRange(sessions, range) {
  return sessions.filter((s) => s.start >= range.start && s.start < range.end);
}

export function total(sessions, now = Date.now()) {
  return sessions.reduce((a, s) => a + sessionDuration(s, now), 0);
}

/** [{ toolId, ms, pct }] sorted by time, descending. pct is a 0–100 integer share. */
export function byTool(sessions, now = Date.now()) {
  const m = new Map();
  for (const s of sessions) m.set(s.toolId, (m.get(s.toolId) || 0) + sessionDuration(s, now));
  const sum = [...m.values()].reduce((a, b) => a + b, 0);
  const rows = [...m.entries()].map(([toolId, ms]) => ({ toolId, ms, pct: sum ? (ms / sum) * 100 : 0 }));
  rows.sort((a, b) => b.ms - a.ms);
  return roundPcts(rows);
}

// Largest-remainder rounding so the shares add up to 100.
function roundPcts(rows) {
  const floor = rows.map((r) => Math.floor(r.pct));
  let left = 100 - floor.reduce((a, b) => a + b, 0);
  if (!rows.length || rows.every((r) => !r.ms)) return rows.map((r) => ({ ...r, pct: 0 }));
  const order = rows.map((r, i) => [r.pct - floor[i], i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floor[i]++;
    left--;
  }
  return rows.map((r, i) => ({ ...r, pct: floor[i] }));
}

/** [{ day, ms, tools: { [toolId]: ms } }] for every day in the range. */
export function byDay(sessions, range, now = Date.now()) {
  const days = daysIn(range).map((day) => ({ day, ms: 0, tools: {}, count: 0 }));
  const idx = new Map(days.map((d, i) => [d.day, i]));
  for (const s of sessions) {
    const i = idx.get(startOfDay(s.start));
    if (i == null) continue;
    const d = sessionDuration(s, now);
    days[i].ms += d;
    days[i].count++;
    days[i].tools[s.toolId] = (days[i].tools[s.toolId] || 0) + d;
  }
  return days;
}

/** Idle minutes excluded inside the range, including an idle period happening right now. */
export function idleInRange(idleLog, range, tracker, now = Date.now()) {
  let ms = 0;
  const entries = [...idleLog];
  if (tracker?.status === 'paused' && tracker.reason === 'idle' && tracker.idleSince && tracker.ctx)
    entries.push({ start: tracker.idleSince, end: now });
  for (const e of entries) {
    const a = Math.max(e.start, range.start);
    const b = Math.min(e.end ?? now, range.end);
    if (b > a) ms += b - a;
  }
  return ms;
}

export function pctChange(cur, prev) {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

/** Summary card data, comparing a range with the one before it. */
export function summary(sessions, idleLog, tracker, range, prev, now = Date.now()) {
  const cur = inRange(sessions, range);
  const old = inRange(sessions, prev);
  const curTools = byTool(cur, now);
  const oldTools = byTool(old, now);
  const top = curTools[0] || null;
  const topPrev = top ? oldTools.find((t) => t.toolId === top.toolId)?.ms || 0 : 0;

  const longest = cur.reduce((best, s) => (!best || sessionDuration(s, now) > sessionDuration(best, now) ? s : best), null);
  const longestPrev = old.reduce((m, s) => Math.max(m, sessionDuration(s, now)), 0);

  const days = byDay(cur, range, now);
  const busiest = days.reduce((b, d) => (!b || d.ms > b.ms ? d : b), null);
  const busiestPrev = byDay(old, prev, now).reduce((m, d) => Math.max(m, d.ms), 0);

  const idle = idleInRange(idleLog, range, tracker, now);
  const idlePrev = idleInRange(idleLog, prev, null, now);
  const daysTracked = days.filter((d) => d.ms > 0).length;

  return {
    top: top ? { toolId: top.toolId, ms: top.ms, change: pctChange(top.ms, topPrev) } : null,
    longest: longest ? { session: longest, ms: sessionDuration(longest, now), change: pctChange(sessionDuration(longest, now), longestPrev) } : null,
    busiest: busiest && busiest.ms ? { day: busiest.day, ms: busiest.ms, change: pctChange(busiest.ms, busiestPrev) } : null,
    idle: { ms: idle, change: pctChange(idle, idlePrev), daysTracked },
  };
}

/** Group sessions by day (newest day first, newest session first). */
export function groupByDay(sessions) {
  const m = new Map();
  for (const s of sessions) {
    const d = startOfDay(s.start);
    if (!m.has(d)) m.set(d, []);
    m.get(d).push(s);
  }
  return [...m.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([day, list]) => ({ day, sessions: list.sort((a, b) => b.start - a.start) }));
}
