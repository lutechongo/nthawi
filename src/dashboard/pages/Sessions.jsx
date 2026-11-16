import { total, byTool } from '../../shared/stats.js';
import { fmtHM, fmtRangeLabel } from '../../shared/time.js';
import { useApp } from '../App.jsx';
import { overtimeOf } from '../../shared/schedule.js';
import SessionList from '../parts/SessionList.jsx';

const LABELS = { today: 'Today', yesterday: 'Yesterday', week: 'This week', lastWeek: 'Last week', last7: 'Last 7 days', last30: 'Last 30 days', month: 'This month', lastMonth: 'Last month' };

function Stat({ label, value, sub }) {
  return (
    <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="caption">{label}</span>
      <span className="tnum" style={{ fontSize: 28, lineHeight: '36px', fontWeight: 600 }}>
        {value}
      </span>
      <span className="caption faint" style={{ color: 'var(--text-3)' }}>
        {sub}
      </span>
    </div>
  );
}

export default function Sessions() {
  const { now, range, rangeSessions, params, wh } = useApp();
  const n = rangeSessions.length;
  const active = total(rangeSessions, now);
  const tools = byTool(rangeSessions, now).length;
  const manual = rangeSessions.filter((s) => s.manual).length;
  const label = LABELS[range.kind] || fmtRangeLabel(range);
  return (
    <>
      <p className="muted" style={{ marginTop: -8 }}>
        Every block of active time, grouped by day. Rename, fix times, duplicate or delete entries before they go into reports.
      </p>
      <div className="grid-5">
        <Stat label="Sessions" value={n} sub={label} />
        <Stat label="Active time" value={fmtHM(active)} sub="Idle excluded" />
        <Stat label="Overtime" value={fmtHM(overtimeOf(rangeSessions, wh, now))} sub={`Outside ${wh.start}–${wh.end}`} />
        <Stat label="Average session" value={n ? fmtHM(active / n) : '—'} sub={`Across ${tools} ${tools === 1 ? 'tool' : 'tools'}`} />
        <Stat label="Manual entries" value={manual} sub="Added by you" />
      </div>
      <SessionList
        sessions={rangeSessions}
        range={range}
        grouped
        showSearch
        initialTool={params.get('tool') || 'all'}
        maxDays={14}
        title={label}
        sub={`${fmtRangeLabel(range)} · ${n} ${n === 1 ? 'session' : 'sessions'}`}
      />
    </>
  );
}
