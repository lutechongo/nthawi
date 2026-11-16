import { useLayoutEffect, useRef, useState } from 'react';
import { sessionDuration } from '../../shared/store.js';
import { byDay, byTool, total, inRange, summary, idleInRange, pctChange } from '../../shared/stats.js';
import { trackerView } from '../../shared/view.js';
import { overtimeOf, dayWindows, phaseAt } from '../../shared/schedule.js';
import {
  HOUR, DAY, startOfDay, addDays, fmtClock, fmtHM, fmtHMS, fmtHoursDec, fmtLongHM, weekdayShort, weekdayLong, fmtWeekdayDayMonth, fmtRangeLabel, rangeDays, rangeFor, previousRange,
} from '../../shared/time.js';
import { Icon } from '../../ui/icons.jsx';
import { ToolTag, ToolIcon, ChangeBadge, toolColors, hatchBg } from '../../ui/kit.jsx';
import { useApp } from '../App.jsx';

function useSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}
function useWidth() {
  const [ref, size] = useSize();
  return [ref, size.w];
}

function niceMax(hours) {
  const m = Math.max(3, Math.ceil(hours / 3) * 3);
  return m;
}

function CardHead({ title, sub, right }) {
  return (
    <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
      <div className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
        <h2 className="h-card">{title}</h2>
        {sub && <span className="caption">{sub}</span>}
      </div>
      {right}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tracking banner

export function TrackingBanner({ variant, range }) {
  const { data, now, tool, actions } = useApp();
  const v = trackerView(data, now);
  const todaySessions = inRange(data.sessions, rangeFor('today', now));
  const status = (() => {
    switch (v.mode) {
      case 'counting':
        return (
          <>
            <span className="pulse" />
            <span>
              <b style={{ fontWeight: 600, color: 'var(--on-text)' }}>Tracking ON</b>
              <span className="muted">, active in </span>
              <b style={{ fontWeight: 600 }}>{v.tool?.name}</b>
            </span>
          </>
        );
      case 'waiting':
        return (
          <>
            <span className="pulse" />
            <span>
              <b style={{ fontWeight: 600, color: 'var(--on-text)' }}>Tracking ON</b>
              <span className="muted">, open a tracked tool to start counting</span>
            </span>
          </>
        );
      case 'idle':
        return (
          <>
            <PauseBars />
            <span>
              <b style={{ fontWeight: 600, color: 'var(--pause-text)' }}>Paused</b>
              <span className="muted">, you've been idle for {v.idleMin} min. It picks up again when you're back.</span>
            </span>
          </>
        );
      case 'paused':
        return (
          <>
            <PauseBars />
            <span>
              <b style={{ fontWeight: 600, color: 'var(--pause-text)' }}>Paused</b>
              <span className="muted"> by you</span>
            </span>
          </>
        );
      default:
        return (
          <>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text-3)' }} />
            <span>
              <b style={{ fontWeight: 600, color: 'var(--text-2)' }}>Tracking OFF</b>
            </span>
          </>
        );
    }
  })();

  const showSession = v.session && v.mode !== 'off' && v.mode !== 'waiting';
  return (
    <section className="card">
      <div className="banner-row" style={variant === 'none' ? { borderBottom: 0 } : null}>
        <Icon name="timer" size={18} style={{ color: 'var(--text-2)' }} />
        <span style={{ width: 1, height: 20, background: 'var(--border)' }} />
        <div className="row" style={{ gap: 10 }}>{status}</div>
        <span className="caption faint ellipsis" style={{ color: 'var(--text-3)', minWidth: 0, flex: '1 1 0' }} title={showSession ? v.session.title : ''}>
          {showSession ? v.session.title : ''}
        </span>
        {showSession && v.tool && <ToolTag tool={v.tool} />}
        <span className="big-timer" style={{ color: v.mode === 'counting' ? 'var(--text)' : 'var(--text-3)', minWidth: 104, textAlign: 'right' }}>
          {fmtHMS(v.timerMs)}
        </span>
        {v.mode === 'off' && (
          <button className="btn btn-primary" onClick={actions.start}>
            <Icon name="play" size={14} />
            Start tracking
          </button>
        )}
        {(v.mode === 'counting' || v.mode === 'waiting') && (
          <button className="btn btn-secondary" onClick={actions.pause}>
            <PauseBars />
            Pause
          </button>
        )}
        {v.mode === 'paused' && (
          <button className="btn btn-primary" onClick={actions.resume}>
            <Icon name="play" size={14} />
            Resume
          </button>
        )}
        {v.mode !== 'off' && (
          <button className="btn btn-danger" onClick={actions.stop}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--danger-solid)' }} />
            Stop
          </button>
        )}
      </div>
      {variant === 'today' && <TodayStrip sessions={todaySessions} />}
      {variant === 'range' && <RangeStrip range={range} />}
    </section>
  );
}

function PauseBars() {
  return (
    <span style={{ display: 'flex', gap: 2, flex: 'none' }}>
      <span style={{ width: 3, height: 10, borderRadius: 1, background: 'var(--pause-dot)' }} />
      <span style={{ width: 3, height: 10, borderRadius: 1, background: 'var(--pause-dot)' }} />
    </span>
  );
}

function TodayStrip({ sessions }) {
  const { now, tool, wh } = useApp();
  const tools = byTool(sessions, now);
  const ot = overtimeOf(sessions, wh, now);
  return (
    <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Icon name="play" size={10} style={{ color: 'var(--accent)' }} />
        <span className="muted">Total time today:</span>
        <span className="tnum" style={{ fontWeight: 600 }}>
          {fmtHMS(total(sessions, now))}
        </span>
        {ot >= 60000 && (
          <span className="badge badge-paused tnum" style={{ marginLeft: 4 }} title={`Outside working hours (${wh.start}–${wh.end})`}>
            Overtime {fmtHMS(ot)}
          </span>
        )}
        <span className="grow" />
        {tools.map((t) => (
          <span key={t.toolId} className="row caption" style={{ gap: 6, marginLeft: 12 }}>
            <ToolIcon tool={tool(t.toolId)} size={14} />
            {tool(t.toolId).name}
          </span>
        ))}
      </div>
      <Timeline24 sessions={sessions} />
    </div>
  );
}

export function Timeline24({ sessions }) {
  const { now, tool, wh } = useApp();
  const [tip, setTip] = useState(null);
  const day0 = startOfDay(now);
  const pct = (t) => ((t - day0) / DAY) * 100;
  const win = dayWindows(day0, wh);
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative', height: 56, borderRadius: 10, background: 'var(--track)' }} onMouseLeave={() => setTip(null)}>
        {win.work.map(([a, b], i) => (
          <span key={`w${i}`} title="Working hours" style={{ position: 'absolute', top: 4, bottom: 4, left: `${pct(a)}%`, width: `${pct(b) - pct(a)}%`, background: 'var(--card)', borderRadius: 6, boxShadow: 'inset 0 0 0 1px var(--border)' }} />
        ))}
        {win.lunch.map(([a, b], i) => (
          <span key={`l${i}`} title="Lunch break" style={{ position: 'absolute', top: 4, bottom: 4, left: `${pct(a)}%`, width: `${pct(b) - pct(a)}%`, borderRadius: 6, background: 'repeating-linear-gradient(-45deg, var(--border) 0 1px, transparent 1px 6px)' }} />
        ))}
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} style={{ position: 'absolute', top: 8, bottom: 8, left: `${(i / 6) * 100}%`, borderLeft: '1px dashed var(--border-2)' }} />
        ))}
        {sessions.map((s) => {
          const a = Math.max(s.start, day0);
          const b = Math.min(s.end ?? now, day0 + DAY);
          const c = toolColors(tool(s.toolId)).chart;
          return (
            <div
              key={s.id}
              onMouseEnter={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const p = e.currentTarget.parentElement.getBoundingClientRect();
                setTip({ x: r.left - p.left + r.width / 2, s });
              }}
              style={{ position: 'absolute', top: 10, bottom: 10, left: `${pct(a)}%`, width: `max(3px, calc(${pct(b) - pct(a)}% - 2px))`, borderRadius: 4, background: hatchBg(c), cursor: 'default' }}
            />
          );
        })}
        <span style={{ position: 'absolute', top: 4, bottom: 4, left: `${pct(now)}%`, width: 2, borderRadius: 2, background: 'var(--accent)' }} title={`Now ${fmtClock(now)}`} />
        {tip && (
          <div className="tip" style={{ left: tip.x, top: -8, transform: 'translate(-50%, -100%)' }}>
            <b style={{ fontWeight: 600 }}>{tool(tip.s.toolId).name}</b>
            <span className="muted">
              {' '}
              · {tip.s.title}
            </span>
            <div className="muted tnum">
              {fmtClock(tip.s.start)} – {tip.s.end ? fmtClock(tip.s.end) : 'now'} · {fmtHM(sessionDuration(tip.s, now))}
              {phaseAt(tip.s.end ?? now, wh) === 'overtime' || phaseAt(tip.s.start, wh) === 'overtime' ? <span style={{ color: 'var(--pause-text)' }}> · overtime</span> : null}
            </div>
          </div>
        )}
      </div>
      <div className="row caption" style={{ justifyContent: 'space-between', marginTop: 12, color: 'var(--text-3)' }}>
        {['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'].map((l, i) => (
          <span key={i} className="tnum">
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

function RangeStrip({ range }) {
  const { data, now, wh } = useApp();
  const sessions = inRange(data.sessions, range);
  const ot = overtimeOf(sessions, wh, now);
  const days = byDay(sessions, range, now);
  const sum = total(sessions, now);
  const tracked = days.filter((d) => d.ms > 0).length;
  const today = startOfDay(now);
  const label = range.kind === 'week' ? 'This week' : range.kind === 'lastWeek' ? 'Last week' : fmtRangeLabel(range);
  const openDay = (day) => window.dispatchEvent(new CustomEvent('at:open-day', { detail: day }));
  return (
    <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {days.length <= 7 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))`, gap: 12 }}>
          {days.map((d) => {
            const isToday = d.day === today;
            const future = d.day > today;
            return (
              <div key={d.day} style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                <button
                  disabled={future || !d.ms}
                  onClick={() => openDay(d.day)}
                  style={{ width: '100%', height: 64, borderRadius: 10, border: isToday ? '1px solid var(--accent)' : '1px solid var(--border)', background: isToday ? 'var(--accent)' : 'var(--card)', color: isToday ? '#fff' : future ? 'var(--text-3)' : 'var(--text)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, cursor: future || !d.ms ? 'default' : 'pointer' }}
                  title={d.ms ? `Show ${weekdayLong(d.day)}'s sessions` : undefined}
                >
                  <span style={{ fontSize: 12, lineHeight: '16px', opacity: isToday ? 0.85 : 0.75 }}>{weekdayShort(d.day)}</span>
                  <span style={{ fontSize: 16, lineHeight: '24px', fontWeight: 600 }}>{new Date(d.day).getDate()}</span>
                </button>
                <span className="caption tnum" style={{ color: d.ms ? 'var(--text-2)' : 'var(--text-3)' }}>
                  {d.ms ? fmtHM(d.ms) : '—'}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div className="row" style={{ gap: 8, height: 44, padding: '0 16px', borderRadius: 8, background: 'var(--accent-tint-2)', borderLeft: '3px solid var(--accent)' }}>
        <span className="muted">{label}:</span>
        <span className="tnum" style={{ fontWeight: 600, fontSize: 16 }}>
          {fmtHM(sum)}
        </span>
        {ot >= 60000 && (
          <span className="badge badge-paused tnum" style={{ marginLeft: 8 }}>
            Overtime {fmtHM(ot)}
          </span>
        )}
        <span className="grow" />
        <span className="caption">
          {tracked} of {days.length} days tracked
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Time tracking (trend) card

export function TrendCard() {
  const { data, now, setRangeSel } = useApp();
  const today = startOfDay(now);
  const range = { start: addDays(today, -6), end: addDays(today, 1) };
  const days = byDay(inRange(data.sessions, range), range, now);
  const todayMs = days[6].ms;
  // Only compare against a real day of work; tiny baselines produce silly percentages.
  const change = days[5].ms >= 30 * 60000 ? pctChange(todayMs, days[5].ms) : null;
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);

  const H = 150;
  const padL = 28;
  const padT = 12;
  const padB = 24;
  const maxH = niceMax(Math.max(...days.map((d) => d.ms)) / HOUR);
  const iw = Math.max(10, w - padL - 8);
  const x = (i) => padL + 8 + (i / 6) * (iw - 8);
  const y = (ms) => padT + (1 - ms / HOUR / maxH) * (H - padT - padB);
  const pts = days.map((d, i) => [x(i), y(d.ms)]);
  const path = smoothPath(pts);
  const area = `${path} L ${pts[6][0]} ${H - padB} L ${pts[0][0]} ${H - padB} Z`;
  const hi = hover ?? 6;

  return (
    <section className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <CardHead title="Time tracking" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="caption">Today total time</span>
        <span style={{ fontSize: 28, lineHeight: '36px', fontWeight: 600, color: 'var(--accent)' }}>{fmtLongHM(todayMs)}</span>
        <div style={{ marginTop: 8, minHeight: 22 }}>
          <ChangeBadge change={change} suffix=" vs yesterday" />
        </div>
      </div>
      <div ref={ref} style={{ position: 'relative', height: H }} onMouseLeave={() => setHover(null)}>
        {w > 0 && (
          <svg width={w} height={H} style={{ display: 'block', overflow: 'visible' }}>
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, maxH / 3, (2 * maxH) / 3, maxH].map((h) => (
              <g key={h}>
                <line x1={padL} x2={w} y1={y(h * HOUR)} y2={y(h * HOUR)} stroke="var(--border)" strokeDasharray={h ? '3 4' : undefined} />
                <text x={0} y={y(h * HOUR) + 4} fontSize="11" fill="var(--text-3)">
                  {Math.round(h)}h
                </text>
              </g>
            ))}
            <path d={area} fill="url(#trendFill)" />
            <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
            <line x1={pts[hi][0]} x2={pts[hi][0]} y1={pts[hi][1]} y2={H - padB} stroke="var(--accent)" strokeDasharray="3 3" />
            {hover == null && <line x1={pts[6][0]} x2={w} y1={pts[6][1]} y2={pts[6][1]} stroke="var(--accent)" strokeOpacity=".5" strokeDasharray="3 4" />}
            {pts.map(([px, py], i) => (
              <circle key={i} cx={px} cy={py} r={i === hi ? 5 : 3.5} fill="var(--card)" stroke="var(--accent)" strokeWidth={i === hi ? 2.5 : 1.75} />
            ))}
            {i18nDays(days).map((l, i) => (
              <text key={i} x={pts[i][0]} y={H - 4} fontSize="11" textAnchor="middle" fill={i === 6 ? 'var(--accent)' : 'var(--text-3)'} fontWeight={i === 6 ? 600 : 400}>
                {l}
              </text>
            ))}
            {pts.map(([px], i) => (
              <rect key={`h${i}`} x={px - iw / 12} y={0} width={iw / 6} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
            ))}
          </svg>
        )}
        {w > 0 && (
          <div className="tip" style={{ left: pts[hi][0], top: pts[hi][1] - 12, transform: 'translate(-50%, -100%)' }}>
            <span className="muted">{weekdayLong(days[hi].day)}</span> <b style={{ fontWeight: 600, marginLeft: 6 }}>{fmtHoursDec(days[hi].ms)}</b>
          </div>
        )}
      </div>
      <button className="btn btn-secondary" style={{ color: 'var(--accent)', width: '100%', justifyContent: 'space-between', padding: '0 16px 0 calc(50% - 40px)' }} onClick={() => setRangeSel({ kind: 'week' })}>
        View detail
        <Icon name="chevRight" size={14} />
      </button>
    </section>
  );
}

function i18nDays(days) {
  return days.map((d) => weekdayShort(d.day));
}

function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const t = 0.18;
    // Clamp control points between the two endpoints so the curve never overshoots (e.g. below 0h).
    const lo = Math.min(p1[1], p2[1]);
    const hi = Math.max(p1[1], p2[1]);
    const clamp = (v) => Math.min(hi, Math.max(lo, v));
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, clamp(p1[1] + (p2[1] - p0[1]) * t)];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, clamp(p2[1] - (p3[1] - p1[1]) * t)];
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

// ---------------------------------------------------------------------------
// Time by tool

export function ToolsCard({ sessions, sub }) {
  const { now, tool } = useApp();
  const rows = byTool(sessions, now).filter((r) => r.ms > 0);
  return (
    <section className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <CardHead title="Time by tool" sub={sub || `Active time across ${rows.length} ${rows.length === 1 ? 'tool' : 'tools'}`} />
      <div style={{ display: 'flex', gap: 4, height: 28 }}>
        {rows.length ? (
          rows.map((r) => <span key={r.toolId} title={`${tool(r.toolId).name} · ${r.pct}%`} style={{ flex: `${Math.max(r.ms, 1)} 1 0`, minWidth: 6, borderRadius: 6, background: hatchBg(toolColors(tool(r.toolId)).chart) }} />)
        ) : (
          <span style={{ flex: 1, borderRadius: 6, background: 'var(--track)' }} />
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((r) => {
          const t = tool(r.toolId);
          return (
            <div key={r.toolId} className="list-row">
              <ToolIcon tool={t} size={18} dot={8} />
              <span className="grow ellipsis">{t.name}</span>
              <span className="caption faint tnum" style={{ color: 'var(--text-3)', width: 40, textAlign: 'right' }}>
                {r.pct}%
              </span>
              <span className="tnum" style={{ fontWeight: 600, width: 72, textAlign: 'right' }}>
                {fmtHM(r.ms)}
              </span>
            </div>
          );
        })}
        {!rows.length && <p className="muted">No tracked time in this period.</p>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Focus gauge

export function FocusCard({ range }) {
  const { data, now, wh } = useApp();
  const active = total(inRange(data.sessions, range), now);
  const ot = overtimeOf(inRange(data.sessions, range), wh, now);
  const idle = idleInRange(data.idleLog, range, data.tracker, now);
  const pct = active + idle ? Math.round((active / (active + idle)) * 100) : 0;
  const R = 90;
  const C = Math.PI * R;
  return (
    <section className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <CardHead title="Focus" sub="Active vs idle" />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
        <div style={{ position: 'relative', width: 230, height: 130 }}>
          <svg width="230" height="130" viewBox="0 0 230 130">
            <path d={`M 25 115 A ${R} ${R} 0 0 1 205 115`} fill="none" stroke="var(--track-2)" strokeWidth="20" strokeLinecap="round" />
            {pct > 0 && <path d={`M 25 115 A ${R} ${R} 0 0 1 205 115`} fill="none" stroke="var(--accent)" strokeWidth="20" strokeLinecap="round" strokeDasharray={`${(pct / 100) * C} ${C}`} />}
          </svg>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 58, textAlign: 'center' }}>
            <div className="caption">Active</div>
            <div style={{ fontSize: 28, lineHeight: '36px', fontWeight: 600, color: 'var(--accent)' }} className="tnum">
              {active + idle ? `${pct}%` : '—'}
            </div>
          </div>
        </div>
      </div>
      <div className="divider" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="row caption" style={{ gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />
            Active
          </span>
          <span className="tnum" style={{ fontWeight: 600, fontSize: 16 }}>
            {fmtHM(active)}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="row caption" style={{ gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--border-2)' }} />
            Idle, excluded
          </span>
          <span className="tnum" style={{ fontWeight: 600, fontSize: 16 }}>
            {fmtHM(idle)}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} title={`Tracked outside ${wh.start}–${wh.end}`}>
          <span className="row caption" style={{ gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--pause-dot)' }} />
            Overtime
          </span>
          <span className="tnum" style={{ fontWeight: 600, fontSize: 16, color: ot >= 60000 ? 'var(--pause-text)' : undefined }}>
            {fmtHM(ot)}
          </span>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Daily breakdown (stacked bars)

export function BreakdownCard({ range, sessions }) {
  const { now, tool } = useApp();
  const days = byDay(sessions, range, now);
  const order = byTool(sessions, now).map((r) => r.toolId);
  const withTime = days.filter((d) => d.ms > 0);
  const avg = withTime.length ? withTime.reduce((a, d) => a + d.ms, 0) / withTime.length : 0;
  const maxH = niceMax(Math.max(0, ...days.map((d) => d.ms)) / HOUR);
  const today = startOfDay(now);
  const [boxRef, box] = useSize();
  const H = Math.max(160, Math.round(box.h || 180) - 24);
  const [tip, setTip] = useState(null);
  const many = days.length > 7;
  const labelEvery = days.length > 20 ? Math.ceil(days.length / 10) : 1;

  return (
    <section className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <CardHead
        title="Daily breakdown"
        sub="Hours per day, stacked by tool"
        right={
          avg > 0 && (
            <span className="row caption" style={{ gap: 6 }}>
              <span style={{ width: 14, borderTop: '1.5px dashed var(--text-2)' }} />
              {fmtHoursDec(avg)} avg
            </span>
          )
        }
      />
      <div ref={boxRef} style={{ flex: 1, minHeight: 184, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr)', gap: 4 }}>
        <div style={{ position: 'relative', height: H }}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="caption" style={{ position: 'absolute', right: 4, top: H - (i / 3) * H - 8, fontSize: 11, color: 'var(--text-3)' }}>
              {Math.round((maxH / 3) * i)}h
            </span>
          ))}
        </div>
        <div style={{ position: 'relative', height: H }} onMouseLeave={() => setTip(null)}>
          {[1, 2, 3].map((i) => (
            <span key={i} style={{ position: 'absolute', left: 0, right: 0, top: H - (i / 3) * H, borderTop: '1px dashed var(--border)' }} />
          ))}
          <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, borderTop: '1px solid var(--border)' }} />
          {avg > 0 && <span style={{ position: 'absolute', left: 0, right: 0, bottom: (avg / HOUR / maxH) * H, borderTop: '1.5px dashed var(--text-3)', zIndex: 2 }} />}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: many ? 4 : 10, padding: '0 4px' }}>
            {days.map((d, i) => (
              <div
                key={d.day}
                style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column-reverse', gap: 2, alignItems: 'center', cursor: d.ms ? 'default' : undefined }}
                onMouseEnter={(e) => {
                  if (!d.ms) return setTip(null);
                  const r = e.currentTarget.getBoundingClientRect();
                  const p = e.currentTarget.parentElement.getBoundingClientRect();
                  setTip({ i, x: r.left - p.left + r.width / 2, y: H - (d.ms / HOUR / maxH) * H });
                }}
              >
                {order
                  .filter((id) => d.tools[id])
                  .map((id) => (
                    <span key={id} style={{ width: '100%', maxWidth: 32, height: `calc(${(d.tools[id] / HOUR / maxH) * 100}% - 2px)`, minHeight: 2, borderRadius: 4, background: hatchBg(toolColors(tool(id)).chart) }} />
                  ))}
              </div>
            ))}
          </div>
          {tip && (
            <div className="tip" style={{ left: tip.x + 4, top: tip.y - 8, transform: 'translate(-50%, -100%)', minWidth: 160 }}>
              <div className="row" style={{ gap: 12, marginBottom: 4 }}>
                <b style={{ fontWeight: 600 }} className="grow">
                  {fmtWeekdayDayMonth(days[tip.i].day)}
                </b>
                <b style={{ fontWeight: 600 }} className="tnum">
                  {fmtHM(days[tip.i].ms)}
                </b>
              </div>
              {order
                .filter((id) => days[tip.i].tools[id])
                .map((id) => (
                  <div key={id} className="row muted" style={{ gap: 8 }}>
                    <ToolIcon tool={tool(id)} size={12} dot={6} />
                    <span className="grow">{tool(id).name}</span>
                    <span className="tnum">{fmtHM(days[tip.i].tools[id])}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
        <span />
        <div style={{ display: 'flex', gap: many ? 4 : 10, padding: '4px 4px 0' }}>
          {days.map((d, i) => (
            <span key={d.day} className="caption tnum" style={{ flex: 1, textAlign: 'center', fontSize: 11, color: d.day === today ? 'var(--accent)' : 'var(--text-3)', fontWeight: d.day === today ? 600 : 400, whiteSpace: 'nowrap', overflow: 'visible' }}>
              {i % labelEvery === 0 ? (many ? new Date(d.day).getDate() : weekdayShort(d.day)) : ''}
            </span>
          ))}
        </div>
      </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Summary vs previous period

export function SummaryCard({ range }) {
  const { data, now, tool, wh } = useApp();
  const prev = previousRange(range);
  const otNow = overtimeOf(inRange(data.sessions, range), wh, now);
  const otPrev = overtimeOf(inRange(data.sessions, prev), wh, now);
  const s = summary(data.sessions, data.idleLog, data.tracker, range, prev, now);
  const comparing = range.kind === 'week' ? 'last week' : range.kind === 'lastWeek' ? 'the week before' : rangeDays(range) === 1 ? 'the day before' : `the previous ${rangeDays(range)} days`;
  const rows = [
    {
      label: 'Most-used tool',
      sub: s.top ? (
        <span className="row" style={{ gap: 6 }}>
          <ToolIcon tool={tool(s.top.toolId)} size={16} />
          {tool(s.top.toolId).name}
        </span>
      ) : (
        '—'
      ),
      val: s.top ? fmtHM(s.top.ms) : '—',
      change: s.top?.change,
    },
    {
      label: 'Longest session',
      sub: s.longest ? `${s.longest.session.title} · ${weekdayShort(s.longest.session.start)}` : '—',
      val: s.longest ? fmtHMS(s.longest.ms) : '—',
      change: s.longest?.change,
    },
    { label: 'Busiest day', sub: s.busiest ? fmtWeekdayDayMonth(s.busiest.day) : '—', val: s.busiest ? fmtHM(s.busiest.ms) : '—', change: s.busiest?.change },
    { label: 'Overtime', sub: `Outside ${wh.start}–${wh.end}`, val: fmtHM(otNow), change: otPrev >= 30 * 60000 ? pctChange(otNow, otPrev) : null, invert: true },
    { label: 'Idle time excluded', sub: `Across ${s.idle.daysTracked} ${s.idle.daysTracked === 1 ? 'day' : 'days'}`, val: fmtHM(s.idle.ms), change: s.idle.change, invert: true },
  ];
  return (
    <section className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <CardHead title="Summary" sub={`Compared with ${comparing}`} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((r) => (
          <div key={r.label} className="list-row" style={{ alignItems: 'flex-start', padding: '12px 0' }}>
            <div className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span className="caption">{r.label}</span>
              <span className="ellipsis" title={typeof r.sub === 'string' ? r.sub : undefined}>
                {r.sub}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <span className="tnum" style={{ fontWeight: 600 }}>
                {r.val}
              </span>
              <ChangeBadge change={r.change} invert={r.invert} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
