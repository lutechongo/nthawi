import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { send, sessionDuration } from '../shared/store.js';
import { rangeFor, fmtRangeLabel, fmtLongDate, dayKey } from '../shared/time.js';
import { inRange } from '../shared/stats.js';
import { sessionsToCsv, clickUpSummary } from '../shared/exporters.js';
import { Icon } from '../ui/icons.jsx';
import { Logo, Avatar, Segmented, useAppData, useNow, useTools, useToast, roleLabel, copyText, downloadFile } from '../ui/kit.jsx';
import DateRangePicker from './parts/DateRangePicker.jsx';
import SessionModal from './parts/SessionModal.jsx';
import { ClickUpDialog } from './parts/ClickUp.jsx';
import { workHours } from '../shared/schedule.js';
import { fromDayKey } from '../shared/time.js';
import Dashboard from './pages/Dashboard.jsx';
import Sessions from './pages/Sessions.jsx';
import Tools from './pages/Tools.jsx';
import Settings from './pages/Settings.jsx';
import Help from './pages/Help.jsx';
import Projects from './pages/Projects.jsx';
import Reports from './pages/Reports.jsx';
import SplitModal from './parts/SplitModal.jsx';
import { projectFor } from '../shared/projects.js';
import { greeting } from '../shared/greeting.js';
import Greeting from './parts/Greeting.jsx';
import { total } from '../shared/stats.js';
import { rangeFor as _rf, addDays, startOfDay } from '../shared/time.js';

export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [route, q] = h.split('?');
  return { route: route || '', params: new URLSearchParams(q || '') };
}

function loadRange() {
  try {
    const r = JSON.parse(localStorage.getItem('at-range'));
    if (r && r.kind) return r;
  } catch {
    /* ignore */
  }
  return { kind: 'today' };
}

export function resolveRange(r, now) {
  if (r.kind === 'custom') return { kind: 'custom', start: r.start, end: r.end };
  return rangeFor(r.kind, now);
}

const TITLES = { '': 'Overview', sessions: 'Sessions', reports: 'Reports', projects: 'Projects', tools: 'Tools', settings: 'Settings', help: 'Help' };

export default function App() {
  const data = useAppData();
  const now = useNow(1000);
  const toast = useToast();
  const tool = useTools(data?.settings);
  const [{ route, params }, setLoc] = useState(parseHash());
  const [rangeSel, setRangeSel] = useState(loadRange);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [modal, setModal] = useState(null); // { mode: 'add' | 'edit', session? }
  const [cuDay, setCuDay] = useState(null); // day shown in the ClickUp dialog
  const [splitting, setSplitting] = useState(null); // session being split
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('at-side') === '1');

  useEffect(() => {
    const onHash = () => {
      setLoc(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => localStorage.setItem('at-range', JSON.stringify(rangeSel)), [rangeSel]);
  useEffect(() => localStorage.setItem('at-side', collapsed ? '1' : '0'), [collapsed]);
  useEffect(() => {
    document.title = `${TITLES[route] || 'Overview'} · Nthawi`;
  }, [route]);
  // #/?review=YYYY-MM-DD (from the end-of-day notification) opens the ClickUp dialog.
  useEffect(() => {
    const r = params.get('review');
    if (r && /^\d{4}-\d{2}-\d{2}$/.test(r)) {
      setCuDay(fromDayKey(r));
      history.replaceState(null, '', '#/');
    }
  }, [params]);

  // Keep "today"/"this week" anchored to the current day (re-resolves at midnight).
  const dayStamp = dayKey(now);
  const range = useMemo(() => resolveRange(rangeSel, now), [rangeSel, dayStamp]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback((r) => {
    location.hash = `#/${r}`;
  }, []);

  const removeSessions = useCallback(
    async (ids) => {
      const removed = data.sessions.filter((s) => ids.includes(s.id));
      await send('session:delete', { ids });
      toast(ids.length === 1 ? 'Session deleted' : `${ids.length} sessions deleted`, {
        label: 'Undo',
        onClick: () => send('session:restore', { sessions: removed }),
      });
    },
    [data, toast],
  );

  const actions = useMemo(
    () => ({
      add: () => setModal({ mode: 'add' }),
      edit: (s) => setModal({ mode: 'edit', session: s }),
      duplicate: async (s) => {
        await send('session:duplicate', { id: s.id });
        toast('Session duplicated');
      },
      remove: removeSessions,
      copySummary: async (list, r) => {
        if (!list.length) return toast('No sessions to copy');
        const ok = await copyText(clickUpSummary(list, data.settings.tools, r, Date.now(), workHours(data.settings)));
        toast(ok ? `Copied ${list.length} ${list.length === 1 ? 'session' : 'sessions'} for ClickUp` : "Couldn't copy to the clipboard");
      },
      exportCsv: (list, r) => {
        if (!list.length) return toast('No sessions in this range to export');
        const name = `nthawi_${dayKey(r.start)}_${dayKey(r.end - 1)}.csv`;
        downloadFile(name, sessionsToCsv(list, data.settings.tools, workHours(data.settings)), 'text/csv;charset=utf-8');
        toast(`Exported ${list.length} sessions`);
      },
      clickup: (day) => setCuDay(day ?? Date.now()),
      split: (s) => setSplitting(s),
      merge: async (ids) => {
        try {
          await send('session:merge', { ids });
          toast(`Merged ${ids.length} sessions`);
          return true;
        } catch (e) {
          toast(e.message);
          return false;
        }
      },
      setProject: async (ids, projectId) => {
        await send('session:setProject', { ids, projectId });
        const p = data.settings.projects.find((x) => x.id === projectId);
        toast(projectId === 'none' ? 'Removed from projects' : p ? `Moved to ${p.name}` : 'Project set to automatic');
      },
      start: () => send('start'),
      stop: () => send('stop'),
      pause: () => send('pause'),
      resume: () => send('resume'),
    }),
    [data, toast, removeSessions],
  );

  if (!data) return null;
  const { settings } = data;
  const isDash = route === '';
  const showRange = isDash || route === 'sessions';
  const activeTools = settings.tools.filter((t) => !t.removed);
  const rangeSessions = inRange(data.sessions, range);

  const segValue = pickerOpen ? 'custom' : rangeSel.kind === 'today' ? 'today' : rangeSel.kind === 'week' ? 'week' : 'custom';
  const dateLabel = range.kind === 'today' ? fmtLongDate(range.start) : fmtRangeLabel(range);

  const wh = workHours(settings);
  const project = (s) => projectFor(s, settings.projects);
  const ctx = { data, now, tool, range, rangeSel, setRangeSel, go, params, actions, rangeSessions, toast, wh, project };

  // Personal greeting on the Overview.
  const todaySessions = inRange(data.sessions, _rf('today', now));
  const tracking = data.tracker?.status === 'on' && !!data.tracker?.currentId;
  const lastEnd = tracking ? null : Math.max(0, ...todaySessions.map((s) => s.end || 0)) || null;
  const yest = addDays(startOfDay(now), -1);
  const yd = new Date(yest).getDay();
  const greet = greeting({
    now,
    name: settings.name,
    wh,
    todayMs: total(todaySessions, now),
    goalMs: (settings.dailyGoalHours || 0) * 3600000,
    lastActiveAt: lastEnd,
    tracking,
    firstToday: todaySessions.length === 0,
    wasOffYesterday: wh.days.includes(yd) && !!wh.off?.has(dayKey(yest)),
  });

  const nav = (r, icon, label, count) => (
    <button key={r} className={`nav-item ${route === r ? 'on' : ''}`} data-tip={collapsed ? label : undefined} aria-label={label} onClick={() => go(r)} aria-current={route === r ? 'page' : undefined}>
      <Icon name={icon} size={16} />
      {!collapsed && <span className="grow">{label}</span>}
      {!collapsed && count != null && <span className="nav-count">{count}</span>}
    </button>
  );

  return (
    <Ctx.Provider value={ctx}>
      <div className={`app ${collapsed ? 'collapsed' : ''}`}>
        <aside className="side">
          <div className="side-brand">
            <Logo size={26} spin={tracking} />
            {!collapsed && <span style={{ fontSize: 16, lineHeight: '24px', fontWeight: 600, whiteSpace: 'nowrap' }}>Nthawi</span>}
            <button className="icon-btn bordered" style={{ marginLeft: collapsed ? 0 : 'auto', width: 28, height: 28 }} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed(!collapsed)}>
              <Icon name={collapsed ? 'chevsRight' : 'chevsLeft'} size={14} />
            </button>
          </div>
          <nav>
            {collapsed ? <span className="sep" /> : <span className="eyebrow">Main menu</span>}
            {nav('', 'grid', 'Overview')}
            {nav('sessions', 'timer', 'Sessions')}
            {nav('reports', 'list', 'Reports')}
          </nav>
          <nav>
            {collapsed ? <span className="sep" /> : <span className="eyebrow">Manage</span>}
            {nav('projects', 'folder', 'Projects', settings.projects.filter((p) => !p.archived).length || null)}
            {nav('tools', 'box', 'Tools', activeTools.length)}
            {nav('settings', 'gear', 'Settings')}
          </nav>
          <nav style={{ marginTop: 'auto' }}>{nav('help', 'help', 'Help')}</nav>
        </aside>

        <main className="main">
          <header className={`header ${isDash ? 'header-dash' : ''}`}>
            {isDash ? (
              <Greeting title={greet.title} sub={`${dateLabel}${greet.sub ? ` · ${greet.sub}` : ''}`} settings={settings} onProfile={() => go('settings')} />
            ) : (
              <h1 className="h-page">{TITLES[route] || 'Overview'}</h1>
            )}
            {showRange && !isDash && (
              <span className="caption" style={{ marginTop: 6, whiteSpace: 'nowrap' }}>
                {dateLabel}
              </span>
            )}
            {!isDash && <span className="grow" />}
            {showRange && (
              <div className="row" style={{ gap: 16, position: 'relative' }}>
                <Segmented
                  value={segValue}
                  options={[
                    { value: 'today', label: 'Today' },
                    { value: 'week', label: 'This Week' },
                    { value: 'custom', label: 'Custom Range' },
                  ]}
                  onChange={(v) => {
                    if (v === 'custom') setPickerOpen(true);
                    else {
                      setRangeSel({ kind: v });
                      setPickerOpen(false);
                    }
                  }}
                />
                {pickerOpen && (
                  <DateRangePicker
                    initial={range}
                    now={now}
                    onCancel={() => setPickerOpen(false)}
                    onApply={(r) => {
                      setRangeSel(r.kind === 'custom' ? { kind: 'custom', start: r.start, end: r.end } : { kind: r.kind });
                      setPickerOpen(false);
                    }}
                  />
                )}
                {isDash && (
                  <button className="btn btn-secondary" onClick={() => actions.exportCsv(rangeSessions, range)}>
                    <Icon name="download" size={16} />
                    Export CSV
                  </button>
                )}
              </div>
            )}
            {!isDash && <button className="profile-chip" onClick={() => go('settings')} title="Profile settings">
              <Avatar settings={settings} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 12, lineHeight: '16px', fontWeight: 600, whiteSpace: 'nowrap' }}>{settings.name || 'Add your name'}</span>
                <span style={{ fontSize: 11, lineHeight: '14px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{roleLabel(settings.role, settings.roleCustom)}</span>
              </div>
            </button>}
          </header>

          {route === '' && <Dashboard />}
          {route === 'sessions' && <Sessions />}
          {route === 'tools' && <Tools />}
          {route === 'settings' && <Settings />}
          {route === 'help' && <Help />}
          {route === 'projects' && <Projects />}
          {route === 'reports' && <Reports />}
          {!(route in TITLES) && <Dashboard />}
        </main>
      </div>

      {modal && <SessionModal mode={modal.mode} session={modal.session} onClose={() => setModal(null)} />}
      {cuDay != null && <ClickUpDialog day={cuDay} onClose={() => setCuDay(null)} />}
      {splitting && <SplitModal session={splitting} onClose={() => setSplitting(null)} />}
    </Ctx.Provider>
  );
}

export { sessionDuration };
