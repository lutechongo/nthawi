import { useState } from 'react';
import { send } from '../../shared/store.js';
import { inRange, total } from '../../shared/stats.js';
import { rangeFor, fmtHM, fmtRelativeDayTime } from '../../shared/time.js';
import { Icon } from '../../ui/icons.jsx';
import { MoreMenu, Toggle, ToolTile } from '../../ui/kit.jsx';
import { useApp } from '../App.jsx';
import ToolModal from '../parts/ToolModal.jsx';

export function useToolActions() {
  const { go, toast } = useApp();
  const [modal, setModal] = useState(null);
  const remove = async (t) => {
    await send('tool:remove', { id: t.id });
    toast(`Removed: ${t.name}`, { label: 'Restore', onClick: () => send('tool:restore', { id: t.id }) });
  };
  const menu = (t) => [
    { label: 'View sessions', icon: 'list', onClick: () => go(`sessions?tool=${t.id}`) },
    { label: t.builtin ? 'Edit websites' : 'Edit tool', icon: 'edit', onClick: () => setModal({ tool: t }) },
    'divider',
    { label: 'Remove tool', icon: 'trash', danger: true, onClick: () => remove(t) },
  ];
  const modalEl = modal && <ToolModal tool={modal.tool} onClose={() => setModal(null)} />;
  return { menu, openAdd: () => setModal({ tool: null }), modalEl };
}

export default function Tools() {
  const { data, now } = useApp();
  const { menu, openAdd, modalEl } = useToolActions();
  const tools = data.settings.tools.filter((t) => !t.removed);
  const week = inRange(data.sessions, rangeFor('week', now));
  const counting = data.tracker.status === 'on' && data.tracker.currentId ? data.tracker.ctx?.toolId : null;

  const lastActive = (id) => {
    let last = 0;
    for (const s of data.sessions) if (s.toolId === id) last = Math.max(last, s.end ?? now);
    return last;
  };

  return (
    <>
      <div className="row" style={{ gap: 16, marginTop: -8 }}>
        <p className="muted grow">The websites Nthawi watches. Time only counts while one of these is open in your active tab.</p>
        <button className="btn btn-primary" onClick={openAdd}>
          <Icon name="plus" size={14} stroke={2.2} />
          Add tool
        </button>
      </div>
      <div className="grid-3">
        {tools.map((t) => {
          const wk = total(week.filter((s) => s.toolId === t.id), now);
          const last = lastActive(t.id);
          return (
            <section key={t.id} className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20, opacity: t.enabled ? 1 : 0.85 }}>
              <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                <ToolTile tool={t} size={40} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, lineHeight: '24px', fontWeight: 600, overflowWrap: 'break-word' }}>
                    {t.name}
                  </div>
                  <div className="caption ellipsis" title={t.domains.join(', ')}>
                    {t.domains.join(' · ')}
                  </div>
                </div>
                {!t.enabled && (
                  <span className="badge badge-off" style={{ marginTop: 2 }}>
                    Off
                  </span>
                )}
                <Toggle on={t.enabled} label={`Track ${t.name}`} onChange={(on) => send('tool:update', { id: t.id, patch: { enabled: on } })} />
                <MoreMenu label={`Actions for ${t.name}`} items={menu(t)} />
              </div>
              <div className="divider" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div className="caption">This week</div>
                  <div className="tnum" style={{ fontSize: 16, lineHeight: '24px', fontWeight: 600 }}>
                    {fmtHM(wk)}
                  </div>
                </div>
                <div>
                  <div className="caption">Last active</div>
                  <div className="tnum" style={{ fontSize: 16, lineHeight: '24px', fontWeight: 600, color: counting === t.id ? 'var(--on-text)' : undefined }}>
                    {counting === t.id ? 'Active now' : last ? fmtRelativeDayTime(last, now) : 'Not yet'}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
        <button className="card" onClick={openAdd} style={{ padding: 24, minHeight: 180, borderStyle: 'dashed', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-2)', boxShadow: 'none' }}>
          <Icon name="plus" size={20} />
          <span style={{ fontWeight: 500 }}>Add a website</span>
          <span className="caption">Notion, Linear, GitHub, Canva…</span>
        </button>
      </div>
      {modalEl}
    </>
  );
}
