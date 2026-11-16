import { useEffect, useMemo, useState } from 'react';
import { sessionDuration } from '../../shared/store.js';
import { groupByDay } from '../../shared/stats.js';
import { fmtClock, fmtHMS, fmtHM, weekdayLong, fmtDayMonth } from '../../shared/time.js';
import { Icon } from '../../ui/icons.jsx';
import { Checkbox, MoreMenu, ToolTag, ToolIcon } from '../../ui/kit.jsx';
import { useApp } from '../App.jsx';
import { splitSession } from '../../shared/schedule.js';

function SessionRow({ s, selected, onSelect }) {
  const { tool, now, actions, wh } = useApp();
  const t = tool(s.toolId);
  const running = s.end == null;
  const sp = splitSession(s, wh, now);
  const ot = sp.overtime >= 60000 ? (sp.overtime >= sp.active * 0.9 ? 'Overtime' : `Overtime ${fmtHM(sp.overtime)}`) : null;
  return (
    <div className={`srow ${selected ? 'selected' : ''}`}>
      <Checkbox state={selected} onChange={onSelect} label={`Select ${s.title}`} />
      <div className="row" style={{ gap: 8, minWidth: 0, paddingRight: 16 }}>
        <span className="ellipsis" title={s.title}>
          {s.title}
        </span>
        {running && (
          <span className="badge badge-on" style={{ height: 20, fontSize: 11, padding: '0 6px' }}>
            <span className="dot" />
            ON
          </span>
        )}
        {ot && (
          <span className="badge badge-paused" style={{ height: 20, fontSize: 11, padding: '0 6px' }} title="Outside your working hours">
            {ot}
          </span>
        )}
        {s.manual && (
          <span className="badge badge-off" style={{ height: 20, fontSize: 11, padding: '0 6px' }} title="Added or duplicated by you">
            Manual
          </span>
        )}
        {s.clickup && (
          <span className="badge" style={{ height: 20, fontSize: 11, padding: '0 6px', background: 'var(--accent-tint)', color: 'var(--accent)' }} title={`Sent to ClickUp${s.clickup.taskName ? ` · ${s.clickup.taskName}` : ''}`}>
            <Icon name="check" size={10} stroke={2.6} />
            ClickUp
          </span>
        )}
      </div>
      <div>
        <ToolTag tool={t} />
      </div>
      <div className="c-time muted tnum">
        {fmtClock(s.start)} – {running ? 'now' : fmtClock(s.end)}
      </div>
      <div className="row tnum" style={{ gap: 8, fontWeight: 600 }}>
        <Icon name="clock" size={14} style={{ color: 'var(--text-2)' }} />
        {fmtHMS(sessionDuration(s, now))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <MoreMenu
          label={`Actions for ${s.title}`}
          items={[
            { label: running ? 'Rename' : 'Edit', icon: 'edit', onClick: () => actions.edit(s) },
            { label: 'Duplicate', icon: 'copy', onClick: () => actions.duplicate(s) },
            'divider',
            { label: 'Delete', icon: 'trash', danger: true, onClick: () => actions.remove([s.id]) },
          ]}
        />
      </div>
    </div>
  );
}

/**
 * Sessions card used on the dashboard and the Sessions page.
 * grouped=false renders a flat table (Today); grouped=true groups by day with collapsible headers.
 */
export default function SessionList({ sessions, range, title, sub, grouped, showSearch = false, initialTool = 'all', maxDays = 7 }) {
  const { data, tool, now, actions } = useApp();
  const [filter, setFilter] = useState(initialTool);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [open, setOpen] = useState({});
  const [showAll, setShowAll] = useState(false);

  useEffect(() => setFilter(initialTool), [initialTool]);
  useEffect(() => {
    // Day tiles in the banner ask us to reveal a day.
    const h = (e) => {
      setOpen((o) => ({ ...o, [e.detail]: true }));
      setShowAll(true);
      setTimeout(() => document.getElementById(`day-${e.detail}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    };
    window.addEventListener('at:open-day', h);
    return () => window.removeEventListener('at:open-day', h);
  }, []);

  const toolIds = useMemo(() => {
    const ids = data.settings.tools.filter((t) => !t.removed).map((t) => t.id);
    for (const s of sessions) if (!ids.includes(s.toolId)) ids.push(s.toolId);
    return ids;
  }, [data.settings.tools, sessions]);

  const q = query.trim().toLowerCase();
  const list = sessions.filter((s) => (filter === 'all' || s.toolId === filter) && (!q || s.title.toLowerCase().includes(q) || tool(s.toolId).name.toLowerCase().includes(q)));
  const sorted = [...list].sort((a, b) => b.start - a.start);
  const groups = grouped ? groupByDay(list) : [];
  const visibleGroups = showAll ? groups : groups.slice(0, maxDays);

  // Drop selections that disappeared.
  const ids = new Set(sessions.map((s) => s.id));
  const sel = [...selected].filter((id) => ids.has(id));
  const toggle = (id, on) => {
    const n = new Set(sel);
    on ? n.add(id) : n.delete(id);
    setSelected(n);
  };
  const allState = !sorted.length ? false : sorted.every((s) => sel.includes(s.id)) ? true : sorted.some((s) => sel.includes(s.id)) ? 'partial' : false;
  const selectedSessions = sessions.filter((s) => sel.includes(s.id));

  // The ClickUp dialog works one day at a time: the newest day in this list, or today.
  const clickupDay = sessions.length ? Math.max(...sessions.map((x) => x.start)) : now;
  const isOpen = (day, i) => (open[day] != null ? open[day] : i < 2 || !!q || filter !== 'all');

  return (
    <section className="card">
      <div style={{ padding: '20px 16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 16, borderBottom: grouped ? '1px solid var(--border)' : 0 }}>
        <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
          <div className="grow" style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 className="h-card">{title}</h2>
            <span className="caption">{sub}</span>
          </div>
          {showSearch && (
            <div style={{ position: 'relative', width: 280 }}>
              <Icon name="search" size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-3)' }} />
              <input className="input" style={{ paddingLeft: 34 }} placeholder="Search sessions" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search sessions" />
            </div>
          )}
          {sel.length > 0 && (
            <>
              <span className="caption">{sel.length} selected</span>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-2)' }} onClick={() => setSelected(new Set())}>
                Clear
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  actions.remove(sel);
                  setSelected(new Set());
                }}
              >
                <Icon name="trash" size={14} />
                Delete
              </button>
            </>
          )}
          <button className="btn btn-ghost" onClick={actions.add}>
            <Icon name="plus" size={14} stroke={2.2} />
            Add manually
          </button>
          <button className="btn btn-secondary" onClick={() => actions.clickup(clickupDay)} title="Add these sessions to your ClickUp timesheet">
            <Icon name="upload" size={15} />
            Send to ClickUp
          </button>
          <button className="btn btn-secondary" onClick={() => actions.copySummary(selectedSessions.length ? selectedSessions : list, selectedSessions.length ? null : range)} title={sel.length ? 'Copy the selected sessions' : 'Copy every session shown'}>
            <Icon name="copy" size={15} />
            {sel.length ? `Copy ${sel.length}` : 'Copy summary'}
          </button>
        </div>
        {grouped && (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
              <span className="dot" style={{ background: 'var(--accent)' }} />
              All
            </button>
            {toolIds.map((id) => {
              const t = tool(id);
              return (
                <button key={id} className={`chip ${filter === id ? 'on' : ''}`} onClick={() => setFilter(id)}>
                  <ToolIcon tool={t} size={14} dot={6} />
                  {t.short || t.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!grouped && (
        <div>
          <div className="srow head">
            <Checkbox state={allState} label="Select all" onChange={(on) => setSelected(on ? new Set(sorted.map((s) => s.id)) : new Set())} />
            <span>Session</span>
            <span>Tool</span>
            <span className="c-time">Time</span>
            <span>Duration</span>
            <span />
          </div>
          {sorted.map((s) => (
            <SessionRow key={s.id} s={s} selected={sel.includes(s.id)} onSelect={(on) => toggle(s.id, on)} />
          ))}
          {!sorted.length && <Empty q={q} />}
        </div>
      )}

      {grouped && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visibleGroups.map((g, i) => {
            const o = isOpen(g.day, i);
            const dayTotal = g.sessions.reduce((a, s) => a + sessionDuration(s, now), 0);
            return (
              <div key={g.day} className="day-group" id={`day-${g.day}`}>
                <div className="row" style={{ background: 'var(--track)' }}>
                  <button className="day-head grow" onClick={() => setOpen({ ...open, [g.day]: !o })} aria-expanded={o}>
                    <Icon name={o ? 'chevDown' : 'chevRight'} size={14} style={{ color: 'var(--text-2)' }} />
                    <span style={{ fontWeight: 600 }}>{weekdayLong(g.day)}</span>
                    <span style={{ width: 1, height: 16, background: 'var(--border-2)' }} />
                    <span className="muted">{fmtDayMonth(g.day)}</span>
                    <span className="caption faint" style={{ color: 'var(--text-3)' }}>
                      {g.sessions.length} {g.sessions.length === 1 ? 'session' : 'sessions'}
                    </span>
                    <span className="grow" />
                    <span className="caption">Total:</span>
                    <span className="tnum" style={{ fontWeight: 600 }} title={fmtHM(dayTotal)}>
                      {fmtHMS(dayTotal)}
                    </span>
                  </button>
                  {g.sessions.some((x) => x.end != null && !x.clickup) ? (
                    <button className="icon-btn" style={{ marginRight: 8 }} title={`Send ${weekdayLong(g.day)} to ClickUp`} aria-label={`Send ${weekdayLong(g.day)} to ClickUp`} onClick={() => actions.clickup(g.day)}>
                      <Icon name="upload" size={15} />
                    </button>
                  ) : (
                    <span className="icon-btn" style={{ marginRight: 8, color: 'var(--accent)' }} title="Everything here is in ClickUp">
                      <Icon name="check" size={15} stroke={2.2} />
                    </span>
                  )}
                </div>
                {o && g.sessions.map((s) => <SessionRow key={s.id} s={s} selected={sel.includes(s.id)} onSelect={(on) => toggle(s.id, on)} />)}
              </div>
            );
          })}
          {!groups.length && <Empty q={q} />}
          {groups.length > visibleGroups.length && (
            <button className="btn btn-secondary" style={{ alignSelf: 'center' }} onClick={() => setShowAll(true)}>
              Show {groups.length - visibleGroups.length} more {groups.length - visibleGroups.length === 1 ? 'day' : 'days'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Empty({ q }) {
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center' }} className="muted">
      {q ? 'No sessions match your search.' : 'No sessions here yet.'}
    </div>
  );
}
