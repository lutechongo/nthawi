// CSV export, JSON export and the ClickUp-friendly plain-text summary.
import { sessionDuration, toolById } from './store.js';
import { fmtClock, fmtHM, fmtHMS, dayKey, fmtRangeLabel, weekdayLong, fmtDayMonth, startOfDay } from './time.js';
import { groupByDay } from './stats.js';
import { splitSession } from './schedule.js';

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function sessionsToCsv(sessions, tools, wh, now = Date.now()) {
  const rows = [['Date', 'Start', 'End', 'Duration', 'Hours', 'Regular hours', 'Lunch hours', 'Overtime hours', 'Tool', 'Session', 'Type', 'In ClickUp']];
  const sorted = [...sessions].sort((a, b) => a.start - b.start);
  for (const s of sorted) {
    const d = sessionDuration(s, now);
    const sp = splitSession(s, wh, now);
    const h = (ms) => (ms / 3600000).toFixed(2);
    rows.push([
      dayKey(s.start),
      fmtClock(s.start),
      s.end ? fmtClock(s.end) : 'running',
      fmtHMS(d),
      h(d),
      h(sp.regular),
      h(sp.lunch),
      h(sp.overtime),
      toolById(tools, s.toolId).name,
      s.title,
      s.manual ? 'Manual' : 'Tracked',
      s.clickup ? 'Yes' : '',
    ]);
  }
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function exportJson(data) {
  return JSON.stringify(
    {
      app: 'Nthawi',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: data.settings,
      sessions: data.sessions,
      idleLog: data.idleLog,
    },
    null,
    2,
  );
}

/** Plain text that pastes cleanly into a ClickUp comment, task or doc. */
export function clickUpSummary(sessions, tools, range, now = Date.now(), wh = null) {
  const totalMs = sessions.reduce((a, s) => a + sessionDuration(s, now), 0);
  const singleDay = range && startOfDay(range.start) === startOfDay(range.end - 1);
  const head = singleDay ? `Time log · ${weekdayLong(range.start)} ${fmtRangeLabel(range)}` : `Time log · ${range ? fmtRangeLabel(range) : 'Selected sessions'}`;
  const otMs = wh ? sessions.reduce((a, s) => a + splitSession(s, wh, now).overtime, 0) : 0;
  const lines = [`${head} · Total ${fmtHM(totalMs)}${otMs >= 60000 ? ` (${fmtHM(otMs)} overtime)` : ''}`, ''];
  for (const g of groupByDay(sessions).reverse()) {
    const dayTotal = g.sessions.reduce((a, s) => a + sessionDuration(s, now), 0);
    if (!singleDay) lines.push(`${weekdayLong(g.day)} ${fmtDayMonth(g.day)} · ${fmtHM(dayTotal)}`);
    for (const s of [...g.sessions].reverse()) {
      const t = toolById(tools, s.toolId);
      const sp = wh ? splitSession(s, wh, now) : null;
      const ot = sp && sp.overtime >= 60000 ? ` · ${sp.overtime >= sp.active * 0.9 ? 'overtime' : `${fmtHM(sp.overtime)} overtime`}` : '';
      lines.push(`• ${fmtClock(s.start)}–${s.end ? fmtClock(s.end) : 'now'} · ${s.title} (${t.name}) · ${fmtHM(sessionDuration(s, now))}${ot}`);
    }
    if (!singleDay) lines.push('');
  }
  return lines.join('\n').trim() + '\n';
}
