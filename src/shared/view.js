// Derives what the popup and dashboard banner should show from stored state.
import { sessionDuration, toolById } from './store.js';
import { startOfDay } from './time.js';

/**
 * mode: 'off' | 'counting' | 'waiting' (on, but no tracked tool focused) | 'idle' | 'paused'
 * session: the running session, or (when paused/idle) the most recent one today
 */
export function trackerView(data, now = Date.now()) {
  const { tracker, sessions, settings } = data;
  const tools = settings.tools;
  const running = sessions.find((s) => s.id === tracker.currentId && s.end == null) || null;
  const today = startOfDay(now);
  let last = null;
  for (const s of sessions) {
    if (s.start < today) continue;
    const e = s.end ?? now;
    if (!last || e > (last.end ?? now)) last = s;
  }

  let mode = 'off';
  if (tracker.status === 'on') mode = running ? 'counting' : 'waiting';
  else if (tracker.status === 'paused') mode = tracker.reason === 'idle' ? 'idle' : 'paused';

  const session = running || (mode === 'idle' || mode === 'paused' ? last : null);
  const tool = session ? toolById(tools, session.toolId) : tracker.ctx ? toolById(tools, tracker.ctx.toolId) : null;
  const timerMs = session ? sessionDuration(session, now) : 0;
  const idleMin = tracker.idleSince ? Math.max(1, Math.round((now - tracker.idleSince) / 60000)) : 0;

  let label;
  let short;
  switch (mode) {
    case 'counting':
      label = `Tracking ON · active in ${tool?.name}`;
      short = 'Tracking ON';
      break;
    case 'waiting':
      label = 'Tracking ON · open a tracked tool';
      short = 'Tracking ON';
      break;
    case 'idle':
      label = `Paused, you've been idle for ${idleMin} min`;
      short = 'Paused';
      break;
    case 'paused':
      label = 'Paused';
      short = 'Paused';
      break;
    default:
      label = 'Tracking OFF';
      short = 'Tracking OFF';
  }
  return { mode, session, running, tool, timerMs, label, short, idleMin };
}
