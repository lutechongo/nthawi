import { useEffect, useMemo, useState } from 'react';
import { sessionDuration } from '../../shared/store.js';
import { groupByDay } from '../../shared/stats.js';
import { fmtClock, fmtHMS, fmtHM, weekdayLong, fmtDayMonth } from '../../shared/time.js';
import { Icon } from '../../ui/icons.jsx';
import { Checkbox, MoreMenu, ToolTag, ToolIcon, ProjectTag, toolColors, Segmented, Modal } from '../../ui/kit.jsx';
import { send } from '../../shared/store.js';
import { useApp } from '../App.jsx';
import { splitSession } from '../../shared/schedule.js';

export function SessionRow({ s, selected, onSelect, nested }) {
  const { tool, now, actions, wh, project } = useApp();
  const t = tool(s.toolId);
  const p = project(s);
  const running = s.end == null;
  const sp = splitSession(s, wh, now);
  const ot = sp.overtime >= 60000 ? (sp.overtime >= sp.active * 0.9 ? 'Overtime' : `Overtime ${fmtHM(sp.overtime)}`) : null;
  return (
    <div className={`srow ${selected ? 'selected' : ''} ${nested ? 'nested' : ''}`}>
      <Checkbox state={selected} onChange={onSelect} label={`Select ${s.title}`} />
      <div className="row" style={{ gap: 8, minWidth: 0, paddingRight: 16 }}>
        {nested ? (
          <span className="muted tnum">
            Visit · {fmtClock(s.start)} – {running ? 'now' : fmtClock(s.end)}
          </span>
        ) : (
          <span className="ellipsis" title={s.title}>
            {s.title}
          </span>
        )}
        {running && (
          <span className="badge badge-on" style={{ height: 20, fontSize: 11, padding: '0 6px' }}>
            <span className="dot" />
            ON
          </span>
        )}
        {p && !nested && <ProjectTag project={p} style={{ height: 20, fontSize: 11 }} />}
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
      <div>{!nested && <ToolTag tool={t} />}</div>
      <div className="c-time muted tnum">{!nested && `${fmtClock(s.start)} – ${running ? 'now' : fmtClock(s.end)}`}</div>
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
            ...(s.end != null && !s.clickup && s.end - s.start > 3 * 60000 ? [{ label: 'Split…', icon: 'scissors', onClick: () => actions.split(s) }] : []),
            'divider',
            { label: 'Delete', icon: 'trash', danger: true, onClick: () => actions.remove([s.id]) },
          ]}
        />
      </div>
    </div>
  );
}

const titleKey = (s) => (s.title || '').trim().toLowerCase();

/** Sessions of one app, grouped by what you worked on (same title = same thing). */
function byTitle(list) {
  const m = new Map();
  for (const s of list) {
    const k = titleKey(s);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(s);
  }
  return [...m.values()].map((visits) => visits.sort((a, b) => b.start - a.start));
}

function rangeText(list) {
  const start = Math.min(...list.map((s) => s.start));
  const running = list.some((s) => s.end == null);
  const end = Math.max(...list.map((s) => s.end || 0));
  return `${fmtClock(start)} – ${running ? 'now' : fmtClock(end)}`;
}

function TitleRow({ visits, sel, toggleMany, open, setOpen, onRename }) {
  const { now, actions, project } = useApp();
  const first = visits[0];
  const ids = visits.map((s) => s.id);
  const total = visits.reduce((a, s) => a + sessionDuration(s, now), 0);
  const running = visits.some((s) => s.end == null);
  const p = project(first);
  const state = ids.every((id) => sel.includes(id)) ? true : ids.some((id) => sel.includes(id)) ? 'partial' : false;
  const many = visits.length > 1;
  if (!many) return <SessionRow s={first} selected={sel.includes(first.id)} onSelect={(on) => toggleMany([first.id], on)} />;
  const sameDay = new Set(visits.map((s) => new Date(s.start).toDateString())).size === 1;
  const canMerge = sameDay && !running && !visits.some((s) => s.clickup);
  return (
    <>
      <div className={`srow title-row ${state === true ? 'selected' : ''}`}>
        <Checkbox state={state} onChange={(on) => toggleMany(ids, on)} label={`Select all visits of ${first.title}`} />
        <button className="row title-toggle" style={{ gap: 8, minWidth: 0, paddingRight: 16 }} onClick={() => setOpen(!open)} aria-expanded={open}>
          <Icon name={open ? 'chevDown' : 'chevRight'} size={14} style={{ color: 'var(--text-2)', flex: 'none' }} />
          <span className="ellipsis" title={first.title}>
            {first.title}
          </span>
          {running && (
            <span className="badge badge-on" style={{ height: 20, fontSize: 11, padding: '0 6px' }}>
              <span className="dot" />
              ON
            </span>
          )}
          {p && <ProjectTag project={p} style={{ height: 20, fontSize: 11 }} />}
        </button>
        <div className="caption tnum">{visits.length} visits</div>
        <div className="c-time muted tnum">{rangeText(visits)}</div>
        <div className="row tnum" style={{ gap: 8, fontWeight: 600 }}>
          <Icon name="clock" size={14} style={{ color: 'var(--text-2)' }} />
          {fmtHMS(total)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <MoreMenu
            label={`Actions for ${first.title}`}
            items={[
              { label: 'Rename all', icon: 'edit', onClick: () => onRename(visits) },
              ...(canMerge ? [{ label: `Merge ${visits.length} visits`, icon: 'merge', onClick: () => actions.merge(ids) }] : []),
              { label: open ? 'Hide visits' : 'Show visits', icon: 'list', onClick: () => setOpen(!open) },
              'divider',
              { label: `Delete ${visits.length} visits`, icon: 'trash', danger: true, onClick: () => actions.remove(ids) },
            ]}
          />
        </div>
      </div>
      {open && visits.map((s) => <SessionRow key={s.id} s={s} nested selected={sel.includes(s.id)} onSelect={(on) => toggleMany([s.id], on)} />)}
    </>
  );
}

const TITLE_LIMIT = 6;

/** Sessions grouped by app, then by what you worked on. */
function AppGroups({ sessions, sel, toggleMany, onRename, autoOpen }) {
  const { tool, now } = useApp();
  const [open, setOpen] = useState({}); // app id or app|title → bool
  const [more, setMore] = useState({});
  const apps = useMemo(() => {
    const m = new Map();
    for (const s of sessions) {
      if (!m.has(s.toolId)) m.set(s.toolId, []);
      m.get(s.toolId).push(s);
    }
    const all = sessions.reduce((a, s) => a + sessionDuration(s, now), 0) || 1;
    return [...m.entries()]
      .map(([id, list]) => {
        const total = list.reduce((a, s) => a + sessionDuration(s, now), 0);
        const titles = byTitle(list).sort((a, b) => {
          const ra = a.some((s) => s.end == null) ? 1 : 0;
          const rb = b.some((s) => s.end == null) ? 1 : 0;
          return rb - ra || b.reduce((t, s) => t + sessionDuration(s, now), 0) - a.reduce((t, s) => t + sessionDuration(s, now), 0);
        });
        return { id, list, total, share: total / all, titles, running: list.some((s) => s.end == null) };
      })
      .sort((a, b) => b.running - a.running || b.total - a.total);
  }, [sessions, now]);

  return apps.map((a, i) => {
    const t = tool(a.id);
    const o = open[a.id] ?? (autoOpen || i === 0 || a.running);
    const ids = a.list.map((s) => s.id);
    const state = ids.every((id) => sel.includes(id)) ? true : ids.some((id) => sel.includes(id)) ? 'partial' : false;
    const c = toolColors(t);
    const shown = more[a.id] ? a.titles : a.titles.slice(0, TITLE_LIMIT);
    return (
      <div key={a.id} className="app-group">
        <div className="app-head">
          <Checkbox state={state} onChange={(on) => toggleMany(ids, on)} label={`Select all ${t.name} sessions`} />
          <button className="app-toggle" onClick={() => setOpen({ ...open, [a.id]: !o })} aria-expanded={o}>
            <Icon name={o ? 'chevDown' : 'chevRight'} size={14} style={{ color: 'var(--text-2)', flex: 'none' }} />
            <ToolIcon tool={t} size={20} dot={8} />
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, textAlign: 'left' }}>
              <span className="row" style={{ gap: 8 }}>
                <span style={{ fontWeight: 600 }}>{t.name}</span>
                {a.running && (
                  <span className="badge badge-on" style={{ height: 18, fontSize: 10, padding: '0 6px' }}>
                    <span className="dot" />
                    ON
                  </span>
                )}
              </span>
              <span className="caption tnum">
                {a.list.length} {a.list.length === 1 ? 'visit' : 'visits'} · {a.titles.length} {a.titles.length === 1 ? 'item' : 'items'} · {rangeText(a.list)}
              </span>
            </span>
            <span className="grow" />
            <span className="app-share" aria-hidden="true">
              <span style={{ width: `${Math.max(3, a.share * 100)}%`, background: c.chart }} />
            </span>
            <span className="caption tnum" style={{ width: 36, textAlign: 'right' }}>
              {Math.round(a.share * 100)}%
            </span>
            <span className="tnum" style={{ fontWeight: 600, width: 80, textAlign: 'right' }}>
              {fmtHMS(a.total)}
            </span>
          </button>
        </div>
        {o && (
          <div>
            {shown.map((visits) => {
              const k = `${a.id}|${titleKey(visits[0])}`;
              return <TitleRow key={k} visits={visits} sel={sel} toggleMany={toggleMany} open={!!open[k]} setOpen={(v) => setOpen((x) => ({ ...x, [k]: v }))} onRename={onRename} />;
            })}
            {a.titles.length > shown.length && (
              <button className="show-more" onClick={() => setMore({ ...more, [a.id]: true })}>
                Show {a.titles.length - shown.length} more in {t.name}
              </button>
            )}
          </div>
        )}
      </div>
    );
  });
}

function RenameModal({ visits, onClose }) {
  const [title, setTitle] = useState(visits[0].title);
  const toast = useApp().toast;
  const save = async () => {
    const v = title.trim();
    if (!v) return;
    await send('session:renameMany', { ids: visits.map((s) => s.id), title: v });
    toast(`Renamed ${visits.length} visits`);
    onClose();
  };
  return (
    <Modal
      title="Rename all visits"
      sub={`Changes the name of all ${visits.length} visits.`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!title.trim()}>
            Rename
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="rn-title">Name</label>
        <input id="rn-title" className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </div>
    </Modal>
  );
}

function ViewToggle({ view, setView }) {
  return (
    <Segmented
      value={view}
      onChange={setView}
      options={[
        { value: 'app', label: 'By app' },
        { value: 'all', label: 'Every visit' },
      ]}
    />
  );
}

/**
 * Sessions card used on the dashboard and the Sessions page.
 * grouped=false renders a flat table (Today); grouped=true groups by day with collapsible headers.
 */
export default function SessionList({ sessions, range, title, sub, grouped, showSearch = false, initialTool = 'all', initialProject = 'all', maxDays = 7 }) {
  const { data, tool, now, actions, project } = useApp();
  const projects = data.settings.projects.filter((x) => !x.archived);
  const [filter, setFilter] = useState(initialTool);
  const [pFilter, setPFilter] = useState(initialProject || 'all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [open, setOpen] = useState({});
  const [showAll, setShowAll] = useState(false);
  const [view, setViewState] = useState(() => localStorage.getItem('at-view') || 'app');
  const setView = (v) => {
    setViewState(v);
    localStorage.setItem('at-view', v);
  };
  const [renaming, setRenaming] = useState(null);

  useEffect(() => setFilter(initialTool), [initialTool]);
  useEffect(() => setPFilter(initialProject || 'all'), [initialProject]);
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
  const list = sessions.filter(
    (s) =>
      (filter === 'all' || s.toolId === filter) &&
      (pFilter === 'all' || (pFilter === 'none' ? !project(s) : project(s)?.id === pFilter)) &&
      (!q || s.title.toLowerCase().includes(q) || tool(s.toolId).name.toLowerCase().includes(q) || (project(s)?.name || '').toLowerCase().includes(q)),
  );
  const sorted = [...list].sort((a, b) => b.start - a.start);
  const groups = grouped ? groupByDay(list) : [];
  const visibleGroups = showAll ? groups : groups.slice(0, maxDays);

  // Drop selections that disappeared.
  const ids = new Set(sessions.map((s) => s.id));
  const sel = [...selected].filter((id) => ids.has(id));
  const toggle = (id, on) => toggleMany([id], on);
  const toggleMany = (idList, on) => {
    const n = new Set(sel);
    for (const id of idList) on ? n.add(id) : n.delete(id);
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
          <ViewToggle view={view} setView={setView} />
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
              {projects.length > 0 && (
                <select
                  className="input"
                  aria-label="Move selected to a project"
                  style={{ height: 32, width: 'auto', fontSize: 13, background: 'var(--card)', border: '1px solid var(--border)' }}
                  value=""
                  onChange={(e) => e.target.value && actions.setProject(sel, e.target.value === 'auto' ? null : e.target.value)}
                >
                  <option value="">Move to project…</option>
                  {projects.map((x) => (
                    <option key={x.id} value={x.id}>{x.name}</option>
                  ))}
                  <option value="none">No project</option>
                  <option value="auto">Automatic (by keywords)</option>
                </select>
              )}
              {sel.length > 1 && (
                <button className="btn btn-secondary btn-sm" title="Combine into one session" onClick={async () => (await actions.merge(sel)) && setSelected(new Set())}>
                  <Icon name="merge" size={14} />
                  Merge
                </button>
              )}
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
            {projects.length > 0 && <span style={{ width: 1, height: 20, background: 'var(--border-2)', margin: '0 4px' }} />}
            {projects.map((x) => (
              <button key={x.id} className={`chip ${pFilter === x.id ? 'on' : ''}`} onClick={() => setPFilter(pFilter === x.id ? 'all' : x.id)} title={`Only ${x.name}`}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: toolColors(x).text }} />
                {x.name}
              </button>
            ))}
            {projects.length > 0 && (
              <button className={`chip ${pFilter === 'none' ? 'on' : ''}`} onClick={() => setPFilter(pFilter === 'none' ? 'all' : 'none')}>
                No project
              </button>
            )}
          </div>
        )}
      </div>

      {!grouped && view === 'app' && (
        <div className="app-groups">
          <AppGroups sessions={list} sel={sel} toggleMany={toggleMany} onRename={setRenaming} autoOpen={!!q || filter !== 'all'} />
          {!list.length && <Empty q={q} />}
        </div>
      )}

      {!grouped && view === 'all' && (
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
                      {new Set(g.sessions.map((x) => x.toolId)).size} {new Set(g.sessions.map((x) => x.toolId)).size === 1 ? 'app' : 'apps'} · {g.sessions.length} {g.sessions.length === 1 ? 'visit' : 'visits'}
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
                {o && view === 'app' && (
                  <div className="app-groups in-day">
                    <AppGroups sessions={g.sessions} sel={sel} toggleMany={toggleMany} onRename={setRenaming} autoOpen={!!q || filter !== 'all'} />
                  </div>
                )}
                {o && view === 'all' && g.sessions.map((s) => <SessionRow key={s.id} s={s} selected={sel.includes(s.id)} onSelect={(on) => toggle(s.id, on)} />)}
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
      {renaming && <RenameModal visits={renaming} onClose={() => setRenaming(null)} />}
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
