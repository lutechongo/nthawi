import { useEffect, useMemo, useState } from 'react';
import { send, sessionDuration } from '../../shared/store.js';
import { splitSession } from '../../shared/schedule.js';
import { fmtClock, fmtHM, toDateInput, fromDayKey, startOfDay, addDays, weekdayLong, fmtDayMonth } from '../../shared/time.js';
import { Icon } from '../../ui/icons.jsx';
import { Checkbox, Modal, ToolTag } from '../../ui/kit.jsx';
import { useApp } from '../App.jsx';

export function ClickUpMark({ size = 16 }) {
  // Neutral "timesheet" glyph (we don't redraw ClickUp's logo).
  return (
    <span style={{ width: size, height: size, borderRadius: 4, background: 'var(--accent-tint)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
      <Icon name="clipboard" size={size - 4} stroke={2} />
    </span>
  );
}

/** Shows a chosen ClickUp task and lets you paste a link to change it. */
export function TaskPicker({ value, onChange, placeholder = 'Paste a ClickUp task link', allowClear = true, compact = false }) {
  const [editing, setEditing] = useState(!value);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const find = async () => {
    if (!input.trim()) return;
    setBusy(true);
    setError('');
    try {
      const t = await send('clickup:resolveTask', { input });
      onChange(t);
      setInput('');
      setEditing(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (value && !editing)
    return (
      <div className="row" style={{ gap: 8, minWidth: 0 }}>
        <span className="tag" style={{ background: 'var(--accent-tint)', color: 'var(--accent)', maxWidth: compact ? 220 : 360 }} title={value.list ? `${value.name} · ${value.list}` : value.name}>
          <Icon name="check" size={12} stroke={2.4} />
          <span className="ellipsis">{value.name}</span>
        </span>
        {value.list && !compact && <span className="caption ellipsis">in {value.list}</span>}
        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
          Change
        </button>
        {allowClear && (
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-2)' }} onClick={() => onChange(null)}>
            Remove
          </button>
        )}
      </div>
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
      <div className="row" style={{ gap: 8 }}>
        <input className={`input ${error ? 'error' : ''}`} style={{ height: 36 }} placeholder={placeholder} value={input} onChange={(e) => (setInput(e.target.value), setError(''))} onKeyDown={(e) => e.key === 'Enter' && find()} />
        <button className="btn btn-secondary btn-sm" style={{ height: 36 }} onClick={find} disabled={busy || !input.trim()}>
          {busy ? 'Checking…' : 'Use task'}
        </button>
        {value && (
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-2)' }} onClick={() => setEditing(false)}>
            Cancel
          </button>
        )}
      </div>
      {error && <span className="caption" style={{ color: 'var(--danger)' }}>{error}</span>}
    </div>
  );
}

/** Review a day's sessions and send them to the ClickUp timesheet. */
export function ClickUpDialog({ day: initialDay, onClose }) {
  const { data, now, tool, go, toast, wh } = useApp();
  const cu = data.clickup;
  const [day, setDay] = useState(startOfDay(initialDay ?? now));
  const [overrides, setOverrides] = useState({}); // sessionId -> task
  const [extra, setExtra] = useState([]); // tasks picked in this dialog
  const [picking, setPicking] = useState(null); // sessionId | 'all'
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const list = useMemo(
    () => data.sessions.filter((s) => s.start >= day && s.start < addDays(day, 1)).sort((a, b) => a.start - b.start),
    [data.sessions, day],
  );
  const sendable = list.filter((s) => s.end != null && !s.clickup && sessionDuration(s) >= 60000);
  const [picked, setPicked] = useState(() => new Set(sendable.map((s) => s.id)));
  const running = list.find((s) => s.end == null);
  useEffect(() => setPicked(new Set(sendable.map((s) => s.id))), [day]); // eslint-disable-line react-hooks/exhaustive-deps

  const taskOf = (s) => overrides[s.id] || cu.toolTasks?.[s.toolId] || cu.defaultTask || null;
  const known = useMemo(() => {
    const m = new Map();
    for (const t of [cu.defaultTask, ...Object.values(cu.toolTasks || {}), ...extra]) if (t) m.set(t.id, t);
    return [...m.values()];
  }, [cu, extra]);

  const chosen = sendable.filter((s) => picked.has(s.id));
  const missing = chosen.filter((s) => !taskOf(s));
  const totalMs = chosen.reduce((t, s) => t + sessionDuration(s, now), 0);
  const workspace = cu.teams?.find((t) => t.id === cu.teamId)?.name;

  const setTask = (ids, t) => {
    if (t && !known.some((k) => k.id === t.id)) setExtra((x) => [...x, t]);
    setOverrides((o) => {
      const n = { ...o };
      for (const id of ids) n[id] = t;
      return n;
    });
  };

  const submit = async () => {
    setBusy(true);
    try {
      const ov = {};
      for (const s of chosen) if (overrides[s.id]) ov[s.id] = overrides[s.id];
      const r = await send('clickup:send', { sessionIds: chosen.map((s) => s.id), overrides: ov });
      setResult(r);
      if (!r.failed.length) {
        toast(`Sent ${r.sent} ${r.sent === 1 ? 'entry' : 'entries'} (${fmtHM(r.ms)}) to ClickUp`);
        onClose();
      }
    } catch (e) {
      setResult({ sent: 0, failed: [{ error: e.message }] });
    } finally {
      setBusy(false);
    }
  };

  if (!cu.token)
    return (
      <Modal title="Send your day to ClickUp" sub="Connect ClickUp once, and each tracked session becomes a time entry on your timesheet." onClose={onClose} footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Not now</button>
          <button className="btn btn-primary" onClick={() => { onClose(); go('settings?section=clickup'); }}>Connect ClickUp</button>
        </>
      }>
        <ol className="muted" style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>In ClickUp, open your avatar → Settings → Apps and copy your personal API token.</li>
          <li>Paste it in Settings → ClickUp here and choose a default task to log time against.</li>
          <li>At the end of each day you'll get a reminder to send the day with one click.</li>
        </ol>
      </Modal>
    );

  return (
    <Modal
      title={`Send ${startOfDay(now) === day ? 'today' : weekdayLong(day)} to ClickUp`}
      sub={`Each session becomes a time entry on your timesheet${workspace ? ` in ${workspace}` : ''}.`}
      width={860}
      onClose={onClose}
      footer={
        <>
          <span className="caption" style={{ marginRight: 'auto', alignSelf: 'center' }}>
            {missing.length ? `${missing.length} ${missing.length === 1 ? 'session needs' : 'sessions need'} a task` : chosen.length ? `${chosen.length} ${chosen.length === 1 ? 'entry' : 'entries'} · ${fmtHM(totalMs)}` : 'Nothing selected'}
          </span>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !chosen.length || missing.length > 0}>
            {busy ? 'Sending…' : `Send ${chosen.length || ''} to ClickUp`}
          </button>
        </>
      }
    >
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div className="field">
          <label htmlFor="cu-day">Day</label>
          <input id="cu-day" type="date" className="input input-time" value={toDateInput(day)} max={toDateInput(now)} onChange={(e) => e.target.value && (setDay(fromDayKey(e.target.value)), setOverrides({}), setResult(null))} />
        </div>
        <div className="field grow">
          <label>Log everything selected to</label>
          {picking === 'all' ? (
            <TaskPicker value={null} allowClear={false} onChange={(t) => { setTask(chosen.map((s) => s.id), t); setPicking(null); }} />
          ) : (
            <div className="row" style={{ gap: 8 }}>
              <select className="input" style={{ height: 36, maxWidth: 360, background: 'var(--card)', border: '1px solid var(--border)' }} value="" onChange={(e) => {
                if (e.target.value === '__new') return setPicking('all');
                if (e.target.value === '__map') return setOverrides({});
                const t = known.find((k) => k.id === e.target.value);
                if (t) setTask(chosen.map((s) => s.id), t);
              }}>
                <option value="">Each session's own task</option>
                {known.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                <option value="__new">Another task…</option>
                <option value="__map">Reset to tool defaults</option>
              </select>
            </div>
          )}
        </div>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {list.length === 0 && <p className="muted" style={{ padding: 24, textAlign: 'center' }}>No sessions on {weekdayLong(day)} {fmtDayMonth(day)}.</p>}
        {list.map((s, i) => {
          const isSendable = sendable.includes(s);
          const t = taskOf(s);
          const ot = splitSession(s, wh, now).overtime;
          return (
            <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '32px minmax(0,1fr) 120px 96px minmax(0,1.2fr)', gap: 12, alignItems: 'center', padding: '10px 14px', borderTop: i ? '1px solid var(--border)' : 0, opacity: isSendable ? 1 : 0.6 }}>
              {isSendable ? (
                <Checkbox state={picked.has(s.id)} label={`Send ${s.title}`} onChange={(on) => { const n = new Set(picked); on ? n.add(s.id) : n.delete(s.id); setPicked(n); }} />
              ) : (
                <span />
              )}
              <div style={{ minWidth: 0 }}>
                <div className="ellipsis" style={{ fontWeight: 500 }}>{s.title}</div>
                <div className="caption tnum">
                  {fmtClock(s.start)} – {s.end ? fmtClock(s.end) : 'now'}
                  {ot >= 60000 && <span style={{ color: 'var(--pause-text)', marginLeft: 6 }}>· {fmtHM(ot)} overtime</span>}
                </div>
              </div>
              <div><ToolTag tool={tool(s.toolId)} /></div>
              <div className="tnum" style={{ fontWeight: 600 }}>{fmtHM(sessionDuration(s, now))}</div>
              <div style={{ minWidth: 0 }}>
                {s.clickup ? (
                  <span className="badge badge-on" title={s.clickup.taskName}>
                    <Icon name="check" size={12} stroke={2.4} /> Sent{s.clickup.taskName ? ` · ${s.clickup.taskName}` : ''}
                  </span>
                ) : s.end == null ? (
                  <span className="caption">Still running, send it once it ends</span>
                ) : !isSendable ? (
                  <span className="caption">Under a minute, skipped</span>
                ) : picking === s.id ? (
                  <TaskPicker value={null} compact allowClear={false} onChange={(task) => { setTask([s.id], task); setPicking(null); }} />
                ) : (
                  <select className={`input ${!t && picked.has(s.id) ? 'error' : ''}`} style={{ height: 34, background: 'var(--card)', border: t ? '1px solid var(--border)' : undefined, fontSize: 13 }} value={t?.id || ''} onChange={(e) => {
                    if (e.target.value === '__new') return setPicking(s.id);
                    setTask([s.id], known.find((k) => k.id === e.target.value) || null);
                  }}>
                    {!t && <option value="">Choose a task…</option>}
                    {known.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                    <option value="__new">Another task…</option>
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {running && <p className="caption">Tip: stop tracking first if you're done, so the last session is included.</p>}
      {!known.length && (
        <p className="caption">
          You haven't set a default task yet. Paste a task link with "Another task…", or set defaults in{' '}
          <button className="btn-ghost" style={{ color: 'var(--accent)', fontWeight: 500 }} onClick={() => { onClose(); go('settings?section=clickup'); }}>Settings → ClickUp</button>.
        </p>
      )}
      {result?.failed?.length > 0 && (
        <p className="caption" role="alert" style={{ color: 'var(--danger)' }}>
          {result.sent ? `${result.sent} sent. ` : ''}
          {result.failed.length} didn't go through: {result.failed[0].error}
        </p>
      )}
    </Modal>
  );
}
