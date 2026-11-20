// Tiny iCalendar (.ics) reader for the Vacation Tracker personal feed.
// Turns all-day events into day-off entries: { date: 'YYYY-MM-DD', kind, note, source: 'vt' }.

function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

function unescape(v) {
  return v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
}

function parseDate(prop) {
  // prop like "DTSTART;VALUE=DATE:20261125" or "DTSTART:20261125T080000Z"
  const value = prop.slice(prop.indexOf(':') + 1).trim();
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const allDay = !m[4];
  const date = allDay ? new Date(+m[1], +m[2] - 1, +m[3]) : m[8] ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[5], +m[6], +m[7])) : new Date(+m[1], +m[2] - 1, +m[3], +m[5], +m[6], +m[7]);
  return { ts: date.getTime(), allDay };
}

export function parseEvents(text) {
  const events = [];
  let cur = null;
  for (const line of unfold(text).split('\n')) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT') {
      if (cur?.start) events.push(cur);
      cur = null;
    } else if (cur) {
      const name = line.split(/[;:]/)[0].toUpperCase();
      if (name === 'DTSTART') cur.start = parseDate(line);
      else if (name === 'DTEND') cur.end = parseDate(line);
      else if (name === 'SUMMARY') cur.summary = unescape(line.slice(line.indexOf(':') + 1));
      else if (name === 'CATEGORIES') cur.categories = unescape(line.slice(line.indexOf(':') + 1));
      else if (name === 'STATUS') cur.status = line.slice(line.indexOf(':') + 1).trim().toUpperCase();
    }
  }
  return events;
}

const pad = (n) => String(n).padStart(2, '0');
const key = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Leave types that aren't actually days off.
const NOT_OFF = /work(ing)? from home|\bwfh\b|remote|business trip|training|on site/i;
const LEAVE = /leave|pto|vacation|holiday leave|sick|annual|maternity|paternity|compassionate|study|toil|time off|day off|bereavement|personal/i;
const HOLIDAY = /holiday|public|bank|day$|independence|christmas|new year|easter|good friday|labou?r|heroes|unity|farmers|women|youth|africa|mothers|prayer/i;

/** Day-off entries between `from` and `to` (timestamps), one per day. */
export function daysOff(text, from, to) {
  const out = new Map();
  for (const e of parseEvents(text)) {
    if (e.status === 'CANCELLED' || !e.start?.allDay) continue; // half days / timed events don't make a day off
    const s = (e.summary || '').trim();
    if (NOT_OFF.test(s)) continue;
    const cat = `${e.categories || ''} ${s}`;
    const kind = /holiday/i.test(e.categories || '') ? 'holiday' : LEAVE.test(s) ? 'leave' : HOLIDAY.test(cat) ? 'holiday' : 'leave';
    const endTs = e.end?.ts && e.end.ts > e.start.ts ? e.end.ts : e.start.ts + 86400000;
    for (let d = new Date(e.start.ts); d.getTime() < endTs; d.setDate(d.getDate() + 1)) {
      const t = d.getTime();
      if (t < from || t > to) continue;
      const k = key(t);
      // A holiday wins over leave on the same day (you don't use leave on a holiday).
      if (out.has(k) && out.get(k).kind === 'holiday') continue;
      out.set(k, { date: k, kind, note: s.replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 80), source: 'vt' });
    }
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}
