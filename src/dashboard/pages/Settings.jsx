import { useEffect, useRef, useState } from 'react';
import { send, sessionDuration } from '../../shared/store.js';
import { ROLES } from '../../shared/constants.js';
import { exportJson } from '../../shared/exporters.js';
import { fmtHM, dayKey } from '../../shared/time.js';
import { Icon } from '../../ui/icons.jsx';
import { Avatar, Modal, MoreMenu, Segmented, Toggle, ToolTag, downloadFile } from '../../ui/kit.jsx';
import { useApp } from '../App.jsx';
import { useToolActions } from './Tools.jsx';
import { TaskPicker } from '../parts/ClickUp.jsx';
import { workHours, hm } from '../../shared/schedule.js';
import { DEFAULT_END_OF_DAY } from '../../shared/constants.js';
import { ToolIcon } from '../../ui/kit.jsx';
import { NudgesSection, LeaveSection, ExcludesSection, AISection } from './SettingsExtra.jsx';

const DAY_LABELS = [
  [1, 'Mon'],
  [2, 'Tue'],
  [3, 'Wed'],
  [4, 'Thu'],
  [5, 'Fri'],
  [6, 'Sat'],
  [0, 'Sun'],
];

function TimeField({ label, value, onCommit }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className="field">
      <label>{label}</label>
      <input type="time" className="input input-time" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v && v !== value && onCommit(v)} />
    </div>
  );
}

function WorkHoursSection({ settings, toast }) {
  const wh = workHours(settings);
  const eod = { ...DEFAULT_END_OF_DAY, ...(settings.endOfDay || {}) };
  const save = async (patch) => {
    try {
      await send('settings:update', { patch: { workHours: patch } });
    } catch (e) {
      toast(e.message);
    }
  };
  const saveEod = (patch) => send('settings:update', { patch: { endOfDay: patch } });
  const hours = Math.max(0, hm(wh.end) - hm(wh.start) - Math.max(0, hm(wh.lunchEnd) - hm(wh.lunchStart))) / 60;
  return (
    <Section title="Working hours" sub={`Time tracked outside these hours, or on days off, counts as overtime. That's ${hours % 1 ? hours.toFixed(1) : hours} hours a day.`}>
      <div className="row" style={{ gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <TimeField label="Day starts" value={wh.start} onCommit={(v) => save({ start: v })} />
        <TimeField label="Day ends" value={wh.end} onCommit={(v) => save({ end: v })} />
        <span style={{ width: 1, height: 40, background: 'var(--border)', margin: '0 8px' }} />
        <TimeField label="Lunch from" value={wh.lunchStart} onCommit={(v) => save({ lunchStart: v })} />
        <TimeField label="Lunch until" value={wh.lunchEnd} onCommit={(v) => save({ lunchEnd: v })} />
      </div>
      <div className="field">
        <label>Working days</label>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {DAY_LABELS.map(([d, l]) => {
            const on = wh.days.includes(d);
            return (
              <button key={d} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => save({ days: on ? wh.days.filter((x) => x !== d) : [...wh.days, d] })}>
                {l}
              </button>
            );
          })}
        </div>
      </div>
      <div className="row" style={{ gap: 16 }}>
        <div className="grow">
          <div style={{ fontWeight: 500 }}>Count work during lunch as overtime</div>
          <div className="caption">Off: lunch-time work is tracked but shown separately, not as overtime.</div>
        </div>
        <Toggle on={wh.lunchIsOvertime} label="Count lunch as overtime" onChange={(on) => save({ lunchIsOvertime: on })} />
      </div>
      <div className="divider" />
      <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
        <div className="grow" style={{ minWidth: 240 }}>
          <div style={{ fontWeight: 500 }}>End-of-day check-in</div>
          <div className="caption">On working days, a notification asks if you're done and offers to send the day to ClickUp, or to remind you later.</div>
        </div>
        {eod.enabled && (
          <>
            <input type="time" className="input input-time" aria-label="Check-in time" defaultValue={eod.time} key={eod.time} onBlur={(e) => e.target.value && e.target.value !== eod.time && saveEod({ time: e.target.value })} />
            <select className="input" aria-label="Remind me later after" style={{ width: 'auto', background: 'var(--card)', border: '1px solid var(--border)' }} value={eod.snoozeMinutes} onChange={(e) => saveEod({ snoozeMinutes: +e.target.value })}>
              {[15, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  Snooze {m} min
                </option>
              ))}
            </select>
          </>
        )}
        <Toggle on={eod.enabled} label="End-of-day check-in" onChange={(on) => saveEod({ enabled: on })} />
      </div>
    </Section>
  );
}

function ClickUpSection({ data, toast }) {
  const cu = data.clickup;
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (patch) => send('clickup:update', { patch });
  const tools = data.settings.tools.filter((t) => !t.removed);

  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await send('clickup:connect', { token });
      setToken('');
      toast(`Connected as ${r.user.username}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!cu.token)
    return (
      <Section title="ClickUp" sub="Send each day's sessions to your ClickUp timesheet as time entries.">
        <ol className="caption" style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, lineHeight: '18px' }}>
          <li>In ClickUp, click your avatar → <b>Settings</b> → <b>Apps</b>.</li>
          <li>Under API Token, click <b>Generate</b> (or Copy) and paste it below. It starts with <code>pk_</code>.</li>
        </ol>
        <div className="row" style={{ gap: 8 }}>
          <input className={`input ${error ? 'error' : ''}`} type="password" autoComplete="off" placeholder="pk_…" value={token} onChange={(e) => (setToken(e.target.value), setError(''))} onKeyDown={(e) => e.key === 'Enter' && connect()} aria-label="ClickUp API token" />
          <button className="btn btn-primary" onClick={connect} disabled={busy || !token.trim()}>
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </div>
        {error && <p className="caption" role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
        <p className="caption faint" style={{ color: 'var(--text-3)' }}>The token is kept only in this browser and is sent only to api.clickup.com. It's never included in exports.</p>
      </Section>
    );

  return (
    <Section
      title="ClickUp"
      sub={`Connected as ${cu.user?.username || 'you'}${cu.user?.email ? ` (${cu.user.email})` : ''}. Entries go to your timesheet.`}
      right={
        <button className="btn btn-secondary btn-sm" onClick={() => send('clickup:disconnect').then(() => toast('ClickUp disconnected'))}>
          Disconnect
        </button>
      }
    >
      {cu.teams?.length > 1 && (
        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="cu-team">Workspace</label>
          <select id="cu-team" className="input" style={{ background: 'var(--card)', border: '1px solid var(--border)' }} value={cu.teamId} onChange={(e) => update({ teamId: e.target.value, defaultTask: null, toolTasks: {} })}>
            {cu.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label>Default task</label>
        <TaskPicker value={cu.defaultTask} onChange={(t) => update({ defaultTask: t })} />
        <span className="caption">ClickUp logs time against a task. On Free and Unlimited plans, time entries must belong to a task, so set one here, such as a "Design work" or "Admin" task.</span>
      </div>
      <div className="field">
        <label>Task per tool (optional, overrides the default)</label>
        <div>
          {tools.map((t) => (
            <div key={t.id} className="list-row" style={{ gap: 16, padding: '10px 0' }}>
              <span className="row" style={{ gap: 8, width: 170, flex: 'none' }}>
                <ToolIcon tool={t} size={16} />
                <span className="ellipsis">{t.name}</span>
              </span>
              {cu.toolTasks?.[t.id] ? (
                <TaskPicker compact value={cu.toolTasks[t.id]} onChange={(task) => { const m = { ...cu.toolTasks }; task ? (m[t.id] = task) : delete m[t.id]; update({ toolTasks: m }); }} />
              ) : (
                <ToolTaskAdd onPick={(task) => update({ toolTasks: { ...cu.toolTasks, [t.id]: task } })} />
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="row" style={{ gap: 16 }}>
        <div className="grow">
          <div style={{ fontWeight: 500 }}>Add session names as descriptions</div>
          <div className="caption">
            e.g. "MLFC – back office (Figma)". ClickUp counts entry descriptions as Advanced Time Tracking, which is capped on most plans (40 uses on Unlimited, shared across the whole workspace). Off: entries are logged with just the task, start and duration, which works on every plan. If ClickUp refuses a description, Nthawi sends the entry without it and turns this off.
          </div>
        </div>
        <Toggle on={cu.sendDescriptions} label="Add session names as descriptions" onChange={(on) => update({ sendDescriptions: on })} />
      </div>
      {cu.sendDescriptions && (
        <div className="row" style={{ gap: 16 }}>
          <div className="grow">
            <div style={{ fontWeight: 500 }}>Mark overtime entries</div>
            <div className="caption">Adds "· Overtime" to the description of entries tracked mostly outside working hours.</div>
          </div>
          <Toggle on={cu.markOvertime} label="Mark overtime entries" onChange={(on) => update({ markOvertime: on })} />
        </div>
      )}
    </Section>
  );
}

function ToolTaskAdd({ onPick }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <span className="row" style={{ gap: 8 }}>
        <span className="caption">Uses the default task</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
          Set a task
        </button>
      </span>
    );
  return <TaskPicker compact value={null} allowClear={false} onChange={(t) => { onPick(t); setOpen(false); }} />;
}

function Section({ title, sub, right, children, id }) {
  return (
    <section id={id || `sec-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`} className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 20, scrollMarginTop: 24 }}>
      <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
        <div className="grow">
          <h2 className="h-card">{title}</h2>
          {sub && <p className="caption">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

async function resizeImage(file, size = 192) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const s = Math.min(img.width, img.height);
    c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    return c.toDataURL('image/jpeg', 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function IdleSlider({ label, sub, min, max, value, onChange, tag }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px minmax(0,1fr) 110px', gap: 24, alignItems: 'center' }}>
      <div>
        {tag || <div style={{ fontWeight: 500 }}>{label}</div>}
        <div className="caption" style={{ marginTop: 2 }}>
          {sub}
        </div>
      </div>
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={1}
        value={v}
        aria-label={label}
        style={{ '--pct': `${((v - min) / (max - min)) * 100}%` }}
        onChange={(e) => setV(+e.target.value)}
        onMouseUp={() => onChange(v)}
        onKeyUp={() => onChange(v)}
        onTouchEnd={() => onChange(v)}
      />
      <span style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent)' }} className="tnum">
        {v} {v === 1 ? 'minute' : 'minutes'}
      </span>
    </div>
  );
}

export default function Settings() {
  const { data, toast, now, params } = useApp();
  useEffect(() => {
    const sec = params.get('section');
    if (sec) setTimeout(() => document.getElementById(`sec-${sec}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, [params]);
  const s = data.settings;
  const { menu, openAdd, modalEl } = useToolActions();
  const [name, setName] = useState(s.name);
  const [roleCustom, setRoleCustom] = useState(s.roleCustom || '');
  useEffect(() => setRoleCustom(s.roleCustom || ''), [s.roleCustom]);
  const [confirm, setConfirm] = useState(false);
  const fileRef = useRef(null);
  const importRef = useRef(null);

  useEffect(() => setName(s.name), [s.name]);
  const update = (patch) => send('settings:update', { patch });
  const tools = s.tools.filter((t) => !t.removed);
  const meet = s.tools.find((t) => t.id === 'meet');
  const totalMs = data.sessions.reduce((a, x) => a + sessionDuration(x, now), 0);

  const onPhoto = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) return toast('Choose a JPG or PNG image');
    try {
      await update({ photo: await resizeImage(f) });
      toast('Photo updated');
    } catch {
      toast("Couldn't read that image");
    }
  };

  const onImport = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      const r = await send('data:import', { data: json });
      toast(`Imported ${r.added} ${r.added === 1 ? 'session' : 'sessions'}`);
    } catch (err) {
      toast(err.message?.includes('export') ? err.message : "That file isn't an Nthawi export");
    }
  };

  return (
    <div className="settings-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section title="Profile">
        <div className="row" style={{ gap: 16 }}>
          <Avatar settings={s} size={64} radius={14} fontSize={20} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current.click()}>
                Change photo
              </button>
              {s.photo && (
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-2)' }} onClick={() => update({ photo: '' })}>
                  Remove
                </button>
              )}
            </div>
            <span className="caption faint" style={{ color: 'var(--text-3)' }}>
              JPG or PNG, square works best
            </span>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onPhoto} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 240px', gap: 24 }}>
          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="p-name">What should I call you?</label>
            <input
              id="p-name"
              className="input"
              value={name}
              maxLength={40}
              placeholder="e.g. Chanda"
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name !== s.name && update({ name: name.trim() })}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          </div>
          <div className="field">
            <label htmlFor="p-role">Role</label>
            <select id="p-role" className="input" style={{ background: 'var(--card)', border: '1px solid var(--border)' }} value={s.role} onChange={(e) => update({ role: e.target.value })}>
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            {s.role === 'other' && (
              <input
                className="input"
                aria-label="Your role"
                placeholder="Type your role, e.g. Business Analyst"
                maxLength={60}
                value={roleCustom}
                onChange={(e) => setRoleCustom(e.target.value)}
                onBlur={() => roleCustom.trim() !== (s.roleCustom || '') && update({ roleCustom: roleCustom.trim() })}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                style={{ marginTop: 8 }}
              />
            )}
          </div>
        </div>
      </Section>

      <Section
        title="Tracked tools"
        sub="Time counts only while one of these is open in your active tab."
        right={
          <button className="btn btn-secondary" onClick={openAdd}>
            <Icon name="plus" size={14} stroke={2.2} />
            Add custom website
          </button>
        }
      >
        <div>
          {tools.map((t) => (
            <div key={t.id} className="list-row" style={{ gap: 16, padding: '16px 0' }}>
              <ToolTag tool={t} />
              <span className="muted grow ellipsis">{t.domains.join(' · ')}</span>
              <Toggle on={t.enabled} label={`Track ${t.name}`} onChange={(on) => send('tool:update', { id: t.id, patch: { enabled: on } })} />
              <MoreMenu label={`Actions for ${t.name}`} items={menu(t)} />
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Start automatically"
        sub={s.autoStart !== false ? "Tracking switches on by itself when Chrome opens and each new day, so you never have to press Start. If you stop it, it stays off until you reopen Chrome (or until tomorrow, if you chose Stop for today)." : 'Tracking only starts when you press Start in the popup.'}
        right={<Toggle on={s.autoStart !== false} label="Start tracking automatically" onChange={(on) => update({ autoStart: on })} />}
      />

      <Section title="Idle timing" sub="How long without keyboard or mouse activity before the timer pauses.">
        <IdleSlider label="All tools" sub="1 to 10 minutes" min={1} max={10} value={s.idleMinutes} onChange={(v) => update({ idleMinutes: v })} />
        <div className="divider" />
        <IdleSlider label="Google Meet" tag={meet ? <ToolTag tool={meet} /> : null} sub="1 to 30 minutes" min={1} max={30} value={s.meetIdleMinutes} onChange={(v) => update({ meetIdleMinutes: v })} />
        <p className="caption" style={{ marginLeft: 224 }}>
          In calls you often listen without typing, so Meet gets a longer limit before it counts you as idle.
        </p>
      </Section>

      <WorkHoursSection settings={s} toast={toast} />

      <NudgesSection settings={s} />

      <LeaveSection settings={s} toast={toast} />

      <ExcludesSection settings={s} toast={toast} />

      <ClickUpSection data={data} toast={toast} />

      <AISection data={data} toast={toast} />

      <Section
        title="Appearance"
        sub={s.theme === 'dark' ? 'Deep surfaces with violet accents, easier on the eyes at night.' : 'Soft white surfaces with violet accents.'}
        right={<Segmented value={s.theme} onChange={(v) => update({ theme: v })} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />}
      />

      <Section title="Data" sub="Your sessions are stored only in this browser, on this device.">
        <div className="row" style={{ gap: 16 }}>
          <div className="grow">
            <div style={{ fontWeight: 500 }}>Export</div>
            <div className="caption">Every session, tool and setting in one file.</div>
          </div>
          <button className="btn btn-secondary" onClick={() => downloadFile(`nthawi-backup_${dayKey(Date.now())}.json`, exportJson(data), 'application/json')}>
            <Icon name="download" size={16} />
            Export all data as JSON
          </button>
        </div>
        <div className="divider" />
        <div className="row" style={{ gap: 16 }}>
          <div className="grow">
            <div style={{ fontWeight: 500 }}>Import</div>
            <div className="caption">Bring in sessions from an Nthawi export, e.g. from another computer. Existing sessions are kept.</div>
          </div>
          <button className="btn btn-secondary" onClick={() => importRef.current.click()}>
            <Icon name="upload" size={16} />
            Import JSON
          </button>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
        </div>
        <div className="divider" />
        <div className="row" style={{ gap: 16 }}>
          <div className="grow">
            <div style={{ fontWeight: 500 }}>Delete everything</div>
            <div className="caption">Removes all sessions and resets your tools. This can't be undone.</div>
          </div>
          <button className="btn btn-danger" onClick={() => setConfirm(true)} disabled={!data.sessions.length && !data.idleLog.length}>
            Delete all data
          </button>
        </div>
      </Section>

      {confirm && (
        <Modal
          title="Delete all data?"
          sub={`This permanently removes ${data.sessions.length} ${data.sessions.length === 1 ? 'session' : 'sessions'} and ${fmtHM(totalMs)} of tracked time from this device. Export first if you want a copy.`}
          onClose={() => setConfirm(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirm(false)}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  await send('data:deleteAll');
                  setConfirm(false);
                  toast('All data deleted');
                }}
              >
                Delete
              </button>
            </>
          }
        />
      )}
      {modalEl}
    </div>
  );
}
