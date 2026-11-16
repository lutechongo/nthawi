import { useRef, useState } from 'react';
import { PRESETS, rangeFor, customRange, fmtRangeLabel, rangeDays, startOfDay, addDays, MONTHS_LONG } from '../../shared/time.js';
import { Icon } from '../../ui/icons.jsx';
import { useDismiss } from '../../ui/kit.jsx';

const DOWS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function monthCells(year, month) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d).getTime());
  return cells;
}

export default function DateRangePicker({ initial, now, onApply, onCancel }) {
  const ref = useRef(null);
  useDismiss(true, onCancel, [ref]);
  const today = startOfDay(now);
  const [a, setA] = useState(initial.start);
  const [b, setB] = useState(addDays(initial.end, -1));
  const [anchorOnly, setAnchorOnly] = useState(false);
  const [preset, setPreset] = useState(initial.kind !== 'custom' && initial.kind !== 'prev' ? initial.kind : null);
  const endMonth = new Date(b);
  const [view, setView] = useState({ y: endMonth.getFullYear(), m: endMonth.getMonth() });
  const [hover, setHover] = useState(null);

  const months = [-1, 0].map((off) => {
    const d = new Date(view.y, view.m + off, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const lo = anchorOnly && hover != null ? Math.min(a, hover) : Math.min(a, b);
  const hi = anchorOnly && hover != null ? Math.max(a, hover) : anchorOnly ? a : Math.max(a, b);

  const pick = (day) => {
    setPreset(null);
    if (!anchorOnly) {
      setA(day);
      setB(day);
      setAnchorOnly(true);
    } else {
      setB(day);
      setAnchorOnly(false);
    }
  };
  const applyPreset = (kind) => {
    const r = rangeFor(kind, now);
    setPreset(kind);
    setA(r.start);
    setB(Math.min(addDays(r.end, -1), Math.max(r.start, today)));
    setAnchorOnly(false);
    const e = new Date(addDays(r.end, -1));
    setView({ y: e.getFullYear(), m: e.getMonth() });
  };
  const draft = customRange(lo, hi);
  const shift = (n) => {
    const d = new Date(view.y, view.m + n, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <div ref={ref} className="picker" role="dialog" aria-label="Choose a date range">
      <div style={{ padding: '16px 12px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="eyebrow" style={{ padding: '0 8px 8px' }}>
          Presets
        </span>
        {PRESETS.map((p) => (
          <button key={p.kind} className={`preset ${preset === p.kind ? 'on' : ''}`} onClick={() => applyPreset(p.kind)}>
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, padding: '20px 24px', position: 'relative' }}>
          <button className="icon-btn" style={{ position: 'absolute', left: 16, top: 14 }} aria-label="Previous month" onClick={() => shift(-1)}>
            <Icon name="chevLeft" size={16} />
          </button>
          <button
            className="icon-btn"
            style={{ position: 'absolute', right: 16, top: 14, visibility: new Date(view.y, view.m + 1, 1).getTime() > today ? 'hidden' : 'visible' }}
            aria-label="Next month"
            onClick={() => shift(1)}
          >
            <Icon name="chevRight" size={16} />
          </button>
          {months.map(({ y, m }) => (
            <div key={`${y}-${m}`} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={{ textAlign: 'center', fontWeight: 600 }}>
                {MONTHS_LONG[m]} {y}
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 4 }} onMouseLeave={() => setHover(null)}>
                {DOWS.map((d) => (
                  <span key={d} className="caption faint" style={{ height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
                    {d}
                  </span>
                ))}
                {monthCells(y, m).map((day, i) => {
                  if (day == null) return <span key={i} />;
                  const future = day > today;
                  const inBand = day >= lo && day <= hi;
                  const edge = day === lo || day === hi;
                  const col = i % 7;
                  const L = day === lo || col === 0 ? '8px' : '0';
                  const R = day === hi || col === 6 ? '8px' : '0';
                  const radius = `${L} ${R} ${R} ${L}`;
                  return (
                    <div
                      key={i}
                      className={`cal-cell ${future ? '' : 'pick'} ${inBand ? 'band' : ''} ${edge ? 'edge' : ''}`}
                      style={inBand ? { borderRadius: radius } : null}
                      onClick={() => !future && pick(day)}
                      onMouseEnter={() => !future && setHover(day)}
                    >
                      <span style={{ color: future ? 'var(--text-3)' : day === today && !edge ? 'var(--accent)' : undefined, fontWeight: day === today ? 600 : undefined }}>{new Date(day).getDate()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="row" style={{ gap: 12, padding: '16px 24px', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
          <span style={{ fontWeight: 600 }} className="tnum">
            {anchorOnly ? 'Pick an end date' : fmtRangeLabel(draft)}
          </span>
          {!anchorOnly && <span className="caption">{rangeDays(draft)} {rangeDays(draft) === 1 ? 'day' : 'days'}</span>}
          <button className="btn btn-secondary" style={{ marginLeft: 'auto' }} onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={anchorOnly} onClick={() => onApply(preset ? rangeFor(preset, now) : draft)}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
