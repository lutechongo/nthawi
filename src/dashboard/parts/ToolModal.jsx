import { useState } from 'react';
import { send } from '../../shared/store.js';
import { normalizeDomain } from '../../shared/match.js';
import { SUGGESTED_TOOLS } from '../../shared/constants.js';
import { Modal, useToast, ToolIcon } from '../../ui/kit.jsx';
import { useApp } from '../App.jsx';
import { Icon } from '../../ui/icons.jsx';

/** Add a website as a tool, or edit an existing tool's name and websites. */
export default function ToolModal({ tool, onClose }) {
  const toast = useToast();
  const { data } = useApp();
  const editing = !!tool;
  const tracked = new Set(data.settings.tools.filter((t) => !t.removed).flatMap((t) => t.domains));
  const suggestions = SUGGESTED_TOOLS.filter((x) => !tracked.has(x.domain));
  const quickAdd = async (x) => {
    try {
      await send('tool:add', { name: x.name, domain: x.domain });
      toast(`${x.name} added`);
    } catch (e) {
      setError(e.message);
    }
  };
  const [name, setName] = useState(tool?.name || '');
  const [domains, setDomains] = useState(tool ? tool.domains.join('\n') : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const list = domains
    .split(/[\n,]+/)
    .map((d) => d.trim())
    .filter(Boolean);
  const bad = list.filter((d) => !normalizeDomain(d));

  const save = async () => {
    if (!list.length) return setError('Enter at least one website.');
    if (bad.length) return setError(`"${bad[0]}" doesn't look like a website. Try something like notion.so`);
    setSaving(true);
    try {
      if (editing) {
        await send('tool:update', { id: tool.id, patch: { name, domains: list } });
        toast(`${name || tool.name} updated`);
      } else {
        for (const [i, d] of list.entries()) await send('tool:add', { name: i === 0 ? name : '', domain: d });
        toast(list.length === 1 ? 'Tool added' : `${list.length} tools added`);
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
      title={editing ? `Edit ${tool.name}` : 'Add a tool'}
      sub={editing ? 'Time counts while a tab on one of these websites is in focus.' : 'Enter the website. Time counts while that tab is in focus.'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !list.length}>
            {editing ? 'Save changes' : 'Add tool'}
          </button>
        </>
      }
    >
      {(!editing || !tool.builtin) && (
        <div className="field">
          <label htmlFor="t-name">Name {editing ? '' : '(optional)'}</label>
          <input id="t-name" className="input" placeholder="e.g. Notion" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      )}
      <div className="field">
        <label htmlFor="t-dom">{editing ? 'Websites, one per line' : 'Website'}</label>
        {editing ? (
          <textarea id="t-dom" className="input" style={{ height: 'auto', minHeight: 96, padding: '10px 12px', resize: 'vertical' }} value={domains} onChange={(e) => (setDomains(e.target.value), setError(''))} />
        ) : (
          <input
            id="t-dom"
            className={`input ${error ? 'error' : ''}`}
            placeholder="e.g. notion.so or github.com/your-org"
            value={domains}
            onChange={(e) => (setDomains(e.target.value), setError(''))}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        )}
        <span className="caption">Subdomains count too. Add a path (like github.com/your-org) to track only part of a site.</span>
      </div>
      {error && (
        <p className="caption" role="alert" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
      {!editing && suggestions.length > 0 && (
        <div className="field">
          <label>Or add one in a click</label>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {suggestions.map((x) => (
              <button key={x.domain} type="button" className="chip" title={x.domain} onClick={() => quickAdd(x)}>
                <ToolIcon tool={{ id: x.domain, name: x.name, domains: [x.domain], palette: 'slate' }} size={14} dot={6} />
                {x.name}
                <Icon name="plus" size={12} style={{ color: 'var(--text-3)' }} />
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
