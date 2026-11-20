import { idleInRange, byDay } from '../../shared/stats.js';
import { fmtHM } from '../../shared/time.js';
import { Icon } from '../../ui/icons.jsx';
import { useApp } from '../App.jsx';
import { TrackingBanner, TrendCard, ToolsCard, FocusCard, BreakdownCard, SummaryCard } from '../parts/Charts.jsx';
import SessionList from '../parts/SessionList.jsx';

function toolList(tools) {
  const names = tools.filter((t) => t.enabled && !t.removed).map((t) => t.short || t.name);
  if (names.length <= 1) return names[0] || 'your tools';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export default function Dashboard() {
  const { data, now, range, rangeSessions, actions } = useApp();
  const empty = !data.sessions.length && data.tracker.status === 'off';

  if (empty) {
    return (
      <section className="card" style={{ minHeight: 560, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, maxWidth: 420, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--accent-tint)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="timer" size={30} />
          </div>
          <h2 className="h-page" style={{ marginTop: 8 }}>
            No tracked time yet
          </h2>
          <p className="muted" style={{ textWrap: 'pretty' }}>
            Track your time without thinking about it. Press Start once, then just work in {toolList(data.settings.tools)}. Nthawi counts only the tab you're actually using and pauses when you step away.
          </p>
          <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={actions.start}>
            <Icon name="play" size={14} />
            Start tracking
          </button>
        </div>
      </section>
    );
  }

  if (range.kind === 'today') {
    const idle = idleInRange(data.idleLog, range, data.tracker, now);
    const n = rangeSessions.length;
    return (
      <>
        <TrackingBanner variant="today" range={range} />
        <div className="grid-3">
          <TrendCard />
          <ToolsCard sessions={rangeSessions} />
          <FocusCard range={range} />
        </div>
        <SessionList sessions={rangeSessions} range={range} grouped={false} title="Today's sessions" sub={`${new Set(rangeSessions.map((x) => x.toolId)).size} ${new Set(rangeSessions.map((x) => x.toolId)).size === 1 ? 'app' : 'apps'} · ${n} ${n === 1 ? 'visit' : 'visits'} · ${fmtHM(idle)} idle excluded`} />
      </>
    );
  }

  const daysWith = byDay(rangeSessions, range, now).filter((d) => d.count).length;
  const n = rangeSessions.length;
  const isWeek = range.kind === 'week';
  return (
    <>
      <TrackingBanner variant="range" range={range} />
      <div className="grid-3">
        <BreakdownCard range={range} sessions={rangeSessions} />
        <ToolsCard sessions={rangeSessions} sub={isWeek ? 'Active time this week' : 'Active time in this range'} />
        <SummaryCard range={range} />
      </div>
      <SessionList
        sessions={rangeSessions}
        range={range}
        grouped
        title={isWeek ? "This week's sessions" : 'Sessions in range'}
        sub={`${n} ${n === 1 ? 'session' : 'sessions'} across ${daysWith} ${daysWith === 1 ? 'day' : 'days'}`}
      />
    </>
  );
}
