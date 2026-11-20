// Builds the "what did I do" part of a stand-up from tracked sessions.
import { sessionDuration, toolById } from './store.js';
import { projectFor } from './projects.js';
import { fmtHM, startOfDay, addDays } from './time.js';

/**
 * Groups a day's sessions into stand-up items:
 * { groups: [{ name, ms, items: [{ title, ms, tools: [names] }] }], meetings: [{ title, ms }], totalMs }
 * Meetings (Google Meet) are listed separately because that's how people say it.
 */
export function summarizeDay(sessions, settings, day, now = Date.now()) {
  const a = startOfDay(day);
  const b = addDays(a, 1);
  const list = sessions.filter((s) => s.start >= a && s.start < b);
  const groups = new Map();
  const meetings = new Map();
  let totalMs = 0;
  for (const s of list) {
    const ms = sessionDuration(s, now);
    totalMs += ms;
    const tool = toolById(settings.tools, s.toolId);
    if (s.toolId === 'meet') {
      const m = meetings.get(s.title) || { title: s.title, ms: 0 };
      m.ms += ms;
      meetings.set(s.title, m);
      continue;
    }
    const p = projectFor(s, settings.projects);
    const gName = p ? p.name : 'Other work';
    const g = groups.get(gName) || { name: gName, ms: 0, items: new Map(), isProject: !!p };
    g.ms += ms;
    const it = g.items.get(s.title) || { title: s.title, ms: 0, tools: new Set() };
    it.ms += ms;
    it.tools.add(tool.name);
    g.items.set(s.title, it);
    groups.set(gName, g);
  }
  return {
    totalMs,
    groups: [...groups.values()]
      .map((g) => ({ ...g, items: [...g.items.values()].map((i) => ({ ...i, tools: [...i.tools] })).sort((x, y) => y.ms - x.ms) }))
      .sort((x, y) => (x.isProject === y.isProject ? y.ms - x.ms : x.isProject ? -1 : 1)),
    meetings: [...meetings.values()].sort((x, y) => y.ms - x.ms),
  };
}

/** Plain-text bullets of a summary (skips bits under 5 minutes). */
export function summaryText(sum, { maxItems = 4 } = {}) {
  const lines = [];
  for (const g of sum.groups) {
    const items = g.items.filter((i) => i.ms >= 5 * 60000).slice(0, maxItems);
    if (!items.length) continue;
    lines.push(`• ${g.name} (${fmtHM(g.ms)}): ${items.map((i) => `${i.title} in ${i.tools.join(' & ')}`).join('; ')}`);
  }
  const meets = sum.meetings.filter((m) => m.ms >= 5 * 60000);
  if (meets.length) lines.push(`• Meetings (${fmtHM(meets.reduce((t, m) => t + m.ms, 0))}): ${meets.map((m) => m.title).join(', ')}`);
  return lines.join('\n');
}
