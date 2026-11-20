// Projects group sessions across tools (e.g. "MLFC" covers Figma files, Docs and Meet calls).
// A session belongs to a project when you pick one for it, or automatically when its
// name contains one of the project's keywords.

export const NO_PROJECT = 'none';

export function projectFor(session, projects = []) {
  if (session.projectId === NO_PROJECT) return null;
  if (session.projectId) {
    const p = projects.find((x) => x.id === session.projectId);
    if (p) return p;
  }
  const title = (session.title || '').toLowerCase();
  for (const p of projects) {
    if (p.archived) continue;
    if ((p.keywords || []).some((k) => k && title.includes(k.toLowerCase()))) return p;
  }
  return null;
}

/** [{ projectId|null, ms }] sorted by time. */
export function byProject(sessions, projects, duration) {
  const m = new Map();
  for (const s of sessions) {
    const p = projectFor(s, projects);
    const id = p ? p.id : null;
    m.set(id, (m.get(id) || 0) + duration(s));
  }
  return [...m.entries()].map(([projectId, ms]) => ({ projectId, ms })).sort((a, b) => b.ms - a.ms);
}

export function titleKey(title) {
  return String(title || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Which ClickUp task a session goes to, most specific first:
 * a choice made in the send dialog → a task you used before for the same session name →
 * the session's project → its tool → your default task.
 */
export function clickupTaskFor(session, cu, projects, override) {
  if (override) return { task: override, why: 'chosen' };
  const remembered = cu.memory?.[titleKey(session.title)];
  if (remembered) return { task: remembered, why: 'remembered' };
  const p = projectFor(session, projects);
  if (p?.task) return { task: p.task, why: `project ${p.name}` };
  if (cu.toolTasks?.[session.toolId]) return { task: cu.toolTasks[session.toolId], why: 'tool' };
  if (cu.defaultTask) return { task: cu.defaultTask, why: 'default' };
  return { task: null, why: null };
}
