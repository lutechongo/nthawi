import { useMemo, useState } from 'react';
import { send, sessionDuration } from '../../shared/store.js';
import { PALETTES, PROJECT_PALETTES } from '../../shared/constants.js';
import { inRange } from '../../shared/stats.js';
import { rangeFor, fmtHM } from '../../shared/time.js';
import { Icon } from '../../ui/icons.jsx';
import { Modal, MoreMenu, toolColors } from '../../ui/kit.jsx';
import { useApp } from '../App.jsx';
import { TaskPicker } from '../parts/ClickUp.jsx';

function ProjectModal({ project, seed, onClose }) {
  const { data, toast } = useApp();
  const editing = !!project;
  const [name, setName] = useState(project?.name || seed?.name || '');
  const [keywords, setKeywords] = useState((project?.keywords || seed?.keywords || []).join(', '));
  const [palette, setPalette] = useState(project?.palette || null);
  const [task, setTask] = useState(project?.task || null);
  const [error, setError] = useState('');
  const connected = !!data.clickup.token;

  const save = async () => {
    try {
      const kw = keywords.split(',').map((k) => k.trim()).filter(Boolean);
      const r = await send('project:save', { project: { id: project?.id, name, keywords: kw.length ? kw : [name], palette, task, archived: project?.archived } });
      if (seed?.sessionIds?.length) await send('session:setProject', { ids: seed.sessionIds, projectId: r.id });
      toast(editing ? 'Project saved' : `${name} created`);
      onClose();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Modal
      title={editing ? `Edit ${project.name}` : 'New project'}
      sub="Sessions join a project automatically when their name contains one of its keywords. You can also move any session by hand."
      onClose={onClose}
      width={540}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={!name.trim()}>{editing ? 'Save' : 'Create project'}</button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="pj-name">Name</label>
        <input id="pj-name" className="input" placeholder="e.g. MLFC" value={name} onChange={(e) => (setName(e.target.value), setError(''))} />
      </div>
      <div className="field">
        <label htmlFor="pj-kw">Keywords, separated by commas</label>
        <input id="pj-kw" className="input" placeholder="e.g. MLFC, church, back office" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        <span className="caption">Matched against session names like "MLFC – back office" or a Meet event title. Not case-sensitive.</span>
      </div>
      <div className="field">
        <label>Colour</label>
        <div className="row" style={{ gap: 8 }}>
          {PROJECT_PALETTES.map((k) => (
            <button
              key={k}
              type="button"
              aria-label={PALETTES[k].name}
              aria-pressed={palette === k}
              onClick={() => setPalette(k)}
              style={{ width: 28, height: 28, borderRadius: 8, background: PALETTES[k].text, boxShadow: palette === k ? '0 0 0 2px var(--card), 0 0 0 4px var(--accent)' : 'none' }}
            />
          ))}
        </div>
      </div>
      {connected && (
        <div className="field">
          <label>ClickUp task for this project (optional)</label>
          <TaskPicker value={task} onChange={setTask} />
        </div>
      )}
      {error && <p className="caption" role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
    </Modal>
  );
}

export default function Projects() {
  const { data, now, project, go, toast, actions } = useApp();
  const [modal, setModal] = useState(null);
  const projects = data.settings.projects;
  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);
  const week = inRange(data.sessions, rangeFor('week', now));
  const last30 = inRange(data.sessions, rangeFor('last30', now));

  // Frequent session names that don't belong to any project yet: quick wins.
  const unsorted = useMemo(() => {
    const m = new Map();
    for (const s of last30) {
      if (project(s) || s.toolId === 'meet') continue;
      const e = m.get(s.title) || { title: s.title, ms: 0, ids: [] };
      e.ms += sessionDuration(s, now);
      e.ids.push(s.id);
      m.set(s.title, e);
    }
    return [...m.values()].filter((e) => e.ms >= 15 * 60000).sort((a, b) => b.ms - a.ms).slice(0, 6);
  }, [last30, project, now]);

  const card = (p) => {
    const c = toolColors(p);
    const mine = week.filter((s) => project(s)?.id === p.id);
    const ms = mine.reduce((t, s) => t + sessionDuration(s, now), 0);
    const monthMs = last30.filter((s) => project(s)?.id === p.id).reduce((t, s) => t + sessionDuration(s, now), 0);
    return (
      <section key={p.id} className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, opacity: p.archived ? 0.7 : 1 }}>
        <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          <span style={{ width: 40, height: 40, borderRadius: 10, background: c.fill, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <Icon name="folder" size={18} style={{ color: c.text }} />
          </span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, lineHeight: '24px', fontWeight: 600 }}>{p.name}</div>
            <div className="caption ellipsis" title={p.keywords.join(', ')}>Matches: {p.keywords.join(', ') || '—'}</div>
          </div>
          <MoreMenu
            label={`Actions for ${p.name}`}
            items={[
              { label: 'View sessions', icon: 'list', onClick: () => go(`sessions?project=${p.id}`) },
              { label: 'Edit', icon: 'edit', onClick: () => setModal({ project: p }) },
              p.archived
                ? { label: 'Restore', icon: 'arrowUp', onClick: () => send('project:save', { project: { ...p, archived: false } }) }
                : { label: 'Archive', icon: 'box', onClick: () => send('project:save', { project: { ...p, archived: true } }).then(() => toast(`${p.name} archived`)) },
              'divider',
              {
                label: 'Delete',
                icon: 'trash',
                danger: true,
                onClick: async () => {
                  await send('project:delete', { id: p.id });
                  toast(`${p.name} deleted`, { label: 'Undo', onClick: () => send('project:save', { project: { ...p, id: undefined } }) });
                },
              },
            ]}
          />
        </div>
        <div className="divider" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div className="caption">This week</div>
            <div className="tnum" style={{ fontSize: 16, lineHeight: '24px', fontWeight: 600 }}>{fmtHM(ms)}</div>
          </div>
          <div>
            <div className="caption">Last 30 days</div>
            <div className="tnum" style={{ fontSize: 16, lineHeight: '24px', fontWeight: 600 }}>{fmtHM(monthMs)}</div>
          </div>
        </div>
        {data.clickup.token && (
          <div className="caption row" style={{ gap: 6 }}>
            <Icon name="clipboard" size={13} />
            {p.task ? <span className="ellipsis">ClickUp: {p.task.name}</span> : <span>No ClickUp task. Uses your tool or default task.</span>}
          </div>
        )}
      </section>
    );
  };

  return (
    <>
      <div className="row" style={{ gap: 16, marginTop: -8 }}>
        <p className="muted grow">Group your sessions by client or project, across Figma, Docs, Meet and the rest. Stand-ups, reports and ClickUp use these.</p>
        <button className="btn btn-primary" onClick={() => setModal({})}>
          <Icon name="plus" size={14} stroke={2.2} />
          New project
        </button>
      </div>

      {unsorted.length > 0 && (
        <section className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <h2 className="h-card">Not in a project yet</h2>
            <p className="caption">Your most-used session names from the last 30 days.</p>
          </div>
          {unsorted.map((u) => (
            <div key={u.title} className="list-row" style={{ gap: 12 }}>
              <span className="grow ellipsis">{u.title}</span>
              <span className="tnum caption" style={{ width: 70, textAlign: 'right' }}>{fmtHM(u.ms)}</span>
              {active.length > 0 && (
                <select className="input" aria-label={`Add ${u.title} to a project`} style={{ height: 32, width: 'auto', fontSize: 13, background: 'var(--card)', border: '1px solid var(--border)' }} value="" onChange={(e) => e.target.value && actions.setProject(u.ids, e.target.value)}>
                  <option value="">Add to…</option>
                  {active.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => setModal({ seed: { name: u.title, keywords: [u.title], sessionIds: u.ids } })}>
                New project
              </button>
            </div>
          ))}
        </section>
      )}

      {active.length === 0 && (
        <section className="card" style={{ padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
          <span style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--accent-tint)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="folder" size={26} />
          </span>
          <h2 className="h-card">No projects yet</h2>
          <p className="muted" style={{ maxWidth: 440 }}>Create one per client or project, e.g. "MLFC" with the keyword "MLFC". Every session named that way is grouped automatically.</p>
          <button className="btn btn-primary" onClick={() => setModal({})}>Create your first project</button>
        </section>
      )}
      {active.length > 0 && <div className="grid-3">{active.map(card)}</div>}
      {archived.length > 0 && (
        <>
          <h2 className="h-card" style={{ marginTop: 8 }}>Archived</h2>
          <div className="grid-3">{archived.map(card)}</div>
        </>
      )}
      {modal && <ProjectModal project={modal.project} seed={modal.seed} onClose={() => setModal(null)} />}
    </>
  );
}
