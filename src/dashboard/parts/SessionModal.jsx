import { useState } from 'react';
import { send, sessionDuration } from '../../shared/store.js';
import { OTHER_TOOL } from '../../shared/constants.js';
import { combineDateTime, toDateInput, toTimeInput, fmtHM, MIN } from '../../shared/time.js';
import { Modal, toolColors, useToast, ToolIcon } from '../../ui/kit.jsx';
import { useApp } from '../App.jsx';

export default function SessionModal({ mode, session, onClose }) {
  const { data, tool } = useApp();
  const toast = useToast();
  const now = Date.now();
  const running = mode === 'edit' && session.end == null;
  const tools = data.settings.tools.filter((t) => !t.removed || t.id === session?.toolId);
  const choices = [...tools, OTHER_TOOL];

  const defEnd = Math.floor(now / (5 * MIN)) * 5 * MIN;
  const [title, setTitle] = useState(session?.title || '');
  const [toolId, setToolId] = useState(session?.toolId || tools.find((t) => t.enabled)?.id || 'other');
  const [date, setDate] = useState(toDateInput(session?.start ?? now));
  const [start, setStart] = useState(toTimeInput(session?.start ?? defEnd - 60 * MIN));
  const [end, setEnd] = useState(toTimeInput(session?.end ?? defEnd));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const projects = data.settings.projects.filter((p) => !p.archived || p.id === session?.projectId);
  const [projectId, setProjectId] = useState(session?.projectId || '');

  const a = date && start ? combineDateTime(date, start) : NaN;
  const b = date && end ? combineDateTime(date, end) : NaN;
  const dur = running ? sessionDuration(session, now) : b - a - (mode === 'edit' && a === session.start && b === session.end ? session.pausedMs || 0 : 0);
  let problem = '';
  if (!running) {
    if (!(b > a)) problem = 'End time must be after the start time.';
    else if (b > now + MIN) problem = "Sessions can't end in the future.";
  }

  const save = async () => {
    if (problem) return setError(problem);
    if (mode === 'add' && !title.trim()) return setError('Add a short description of what you worked on.');
    setSaving(true);
    try {
      if (mode === 'add') {
        const r = await send('session:add', { title, toolId, start: a, end: b });
        if (projectId) await send('session:setProject', { ids: [r.id], projectId });
        toast('Session added');
      } else {
        const patch = running ? { title, projectId: projectId || null } : { title, toolId, start: a, end: b, projectId: projectId || null };
        await send('session:update', { id: session.id, patch });
        toast('Session updated');
      }
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={mode === 'add' ? 'Add session manually' : 'Edit session'}
      sub={mode === 'add' ? 'For time spent away from tracked tools, like a call on your phone or a whiteboard session.' : running ? 'This session is still running, so only its name can change.' : `Tracked in ${tool(session.toolId).name}`}
      onClose={onClose}
      width={520}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving || (mode === 'add' && !title.trim()) || !!problem}>
            {mode === 'add' ? 'Add session' : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="s-title">What did you work on?</label>
        <input
          id="s-title"
          className="input"
          placeholder="e.g. Whiteboard session"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
      </div>
      {projects.length > 0 && (
        <div className="field">
          <label htmlFor="s-project">Project</label>
          <select id="s-project" className="input" style={{ background: 'var(--card)', border: '1px solid var(--border)' }} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Automatic (matched by keywords)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="none">No project</option>
          </select>
        </div>
      )}
      {!running && (
        <>
          <div className="field">
            <label>Tool</label>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {choices.map((t) => {
                const on = toolId === t.id;
                const c = toolColors(t);
                return (
                  <button key={t.id} type="button" className="chip" aria-pressed={on} onClick={() => setToolId(t.id)} style={on ? { background: c.fill, color: c.text, borderColor: 'transparent', fontWeight: 500 } : null}>
                    <ToolIcon tool={t} size={14} dot={6} />
                    {t.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="field">
              <label htmlFor="s-date">Date</label>
              <input id="s-date" type="date" className="input input-time" value={date} max={toDateInput(now)} onChange={(e) => (setDate(e.target.value), setError(''))} />
            </div>
            <div className="field">
              <label htmlFor="s-start">Start</label>
              <input id="s-start" type="time" className="input input-time" value={start} onChange={(e) => (setStart(e.target.value), setError(''))} />
            </div>
            <span className="muted" style={{ paddingBottom: 10 }}>
              –
            </span>
            <div className="field">
              <label htmlFor="s-end">End</label>
              <input id="s-end" type="time" className="input input-time" value={end} onChange={(e) => (setEnd(e.target.value), setError(''))} />
            </div>
            <div className="field" style={{ marginLeft: 'auto', alignItems: 'flex-end' }}>
              <label>Duration</label>
              <span style={{ fontSize: 16, lineHeight: '40px', fontWeight: 600 }} className="tnum">
                {Number.isFinite(dur) && dur > 0 ? fmtHM(dur) : '—'}
              </span>
            </div>
          </div>
        </>
      )}
      {(error || problem) && (
        <p className="caption" role="alert" style={{ color: 'var(--danger)' }}>
          {error || problem}
        </p>
      )}
    </Modal>
  );
}
