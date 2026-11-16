// Date/time helpers. All dates are local time. Ranges are { start, end } with `end` exclusive.

export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export { MONTHS, MONTHS_LONG, DAYS_SHORT, DAYS_LONG };

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
export function addDays(ts, n) {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}
export function startOfWeek(ts) {
  // Weeks start on Monday.
  const d = new Date(startOfDay(ts));
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.getTime();
}
export function startOfMonth(ts) {
  const d = new Date(startOfDay(ts));
  d.setDate(1);
  return d.getTime();
}
export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function fromDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}
export function sameDay(a, b) {
  return startOfDay(a) === startOfDay(b);
}
/** Days (start-of-day timestamps) covered by a range. */
export function daysIn(range) {
  const out = [];
  for (let t = startOfDay(range.start); t < range.end; t = addDays(t, 1)) out.push(t);
  return out;
}
export function rangeDays(range) {
  return daysIn(range).length;
}

const pad = (n) => String(n).padStart(2, '0');

/** 06:42:18 */
export function fmtHMS(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}
/** 6h 42m · 45m · 0m */
export function fmtHM(ms) {
  const m = Math.max(0, Math.round(ms / MIN));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r}m`;
  return `${h}h ${pad(r)}m`;
}
/** 6.7h */
export function fmtHoursDec(ms, digits = 1) {
  return `${(ms / HOUR).toFixed(digits).replace(/\.0$/, '')}h`;
}
/** "6 Hours 42 Minutes" */
export function fmtLongHM(ms) {
  const m = Math.max(0, Math.floor(ms / MIN));
  const h = Math.floor(m / 60);
  const r = m % 60;
  const hs = `${h} ${h === 1 ? 'Hour' : 'Hours'}`;
  const ms_ = `${r} ${r === 1 ? 'Minute' : 'Minutes'}`;
  if (!h) return ms_;
  return `${hs} ${ms_}`;
}
/** 16:03 */
export function fmtClock(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** value for <input type="time"> */
export function toTimeInput(ts) {
  return fmtClock(ts);
}
/** value for <input type="date"> */
export function toDateInput(ts) {
  return dayKey(ts);
}
export function combineDateTime(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}
/** Thursday, 15 Oct 2026 */
export function fmtLongDate(ts) {
  const d = new Date(ts);
  return `${DAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
/** 15 Oct */
export function fmtDayMonth(ts) {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
/** Tuesday 13 Oct */
export function fmtWeekdayDayMonth(ts) {
  const d = new Date(ts);
  return `${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function weekdayShort(ts) {
  return DAYS_SHORT[new Date(ts).getDay()];
}
export function weekdayLong(ts) {
  return DAYS_LONG[new Date(ts).getDay()];
}
/** "12 – 18 Oct 2026", "28 Sep – 4 Oct 2026", "28 Dec 2026 – 3 Jan 2027", or a single day. */
export function fmtRangeLabel(range) {
  const a = new Date(range.start);
  const b = new Date(range.end - 1);
  if (sameDay(range.start, range.end - 1)) return `${a.getDate()} ${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
  if (a.getFullYear() !== b.getFullYear())
    return `${a.getDate()} ${MONTHS[a.getMonth()]} ${a.getFullYear()} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  if (a.getMonth() !== b.getMonth())
    return `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  return `${a.getDate()} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
}
/** "Today, 15:15" · "Yesterday, 09:00" · "Mon 12 Oct, 09:00" */
export function fmtRelativeDayTime(ts, now = Date.now()) {
  const day = startOfDay(ts);
  const today = startOfDay(now);
  if (day === today) return `Today, ${fmtClock(ts)}`;
  if (day === addDays(today, -1)) return `Yesterday, ${fmtClock(ts)}`;
  const d = new Date(ts);
  return `${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${fmtClock(ts)}`;
}

// ---- Ranges ---------------------------------------------------------------

export function rangeFor(kind, now = Date.now()) {
  const today = startOfDay(now);
  switch (kind) {
    case 'today':
      return { kind, start: today, end: addDays(today, 1) };
    case 'yesterday':
      return { kind, start: addDays(today, -1), end: today };
    case 'week': {
      const s = startOfWeek(now);
      return { kind, start: s, end: addDays(s, 7) };
    }
    case 'lastWeek': {
      const s = addDays(startOfWeek(now), -7);
      return { kind, start: s, end: addDays(s, 7) };
    }
    case 'last7':
      return { kind, start: addDays(today, -6), end: addDays(today, 1) };
    case 'last30':
      return { kind, start: addDays(today, -29), end: addDays(today, 1) };
    case 'month': {
      const s = startOfMonth(now);
      const d = new Date(s);
      d.setMonth(d.getMonth() + 1);
      return { kind, start: s, end: d.getTime() };
    }
    case 'lastMonth': {
      const d = new Date(startOfMonth(now));
      d.setMonth(d.getMonth() - 1);
      return { kind, start: d.getTime(), end: startOfMonth(now) };
    }
    default:
      return { kind: 'today', start: today, end: addDays(today, 1) };
  }
}

export const PRESETS = [
  { kind: 'today', label: 'Today' },
  { kind: 'yesterday', label: 'Yesterday' },
  { kind: 'week', label: 'This week' },
  { kind: 'lastWeek', label: 'Last week' },
  { kind: 'last7', label: 'Last 7 days' },
  { kind: 'last30', label: 'Last 30 days' },
  { kind: 'month', label: 'This month' },
  { kind: 'lastMonth', label: 'Last month' },
];

/** Same-length range immediately before. */
export function previousRange(range) {
  const n = rangeDays(range);
  return { kind: 'prev', start: addDays(range.start, -n), end: range.start };
}

export function customRange(startTs, endTsInclusive) {
  const a = startOfDay(Math.min(startTs, endTsInclusive));
  const b = startOfDay(Math.max(startTs, endTsInclusive));
  return { kind: 'custom', start: a, end: addDays(b, 1) };
}
