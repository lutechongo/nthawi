import { useEffect, useState } from 'react';
import { ROLES, TAGLINE } from '../shared/constants.js';
import { normalizeDomain } from '../shared/match.js';
import { send } from '../shared/store.js';
import { Icon } from '../ui/icons.jsx';
import { Logo, Toggle, useAppData, toolColors, useToolLogo } from '../ui/kit.jsx';

const ROLE_ICONS = { designer: 'pen', developer: 'code', pm: 'clipboard', marketer: 'megaphone', other: 'plusCircle' };

export default function Onboarding() {
  const data = useAppData();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [role, setRole] = useState('designer');
  const [roleCustom, setRoleCustom] = useState('');
  const [off, setOff] = useState({});
  const [site, setSite] = useState('');
  const [siteErr, setSiteErr] = useState('');
  const [sites, setSites] = useState([]);
  const [idle, setIdle] = useState(2);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const s = data.settings;
    if (s.name) setName(s.name);
    if (s.role) setRole(s.role);
    if (s.roleCustom) setRoleCustom(s.roleCustom);
    if (s.idleMinutes) setIdle(s.idleMinutes);
    const o = {};
    for (const t of s.tools) if (t.builtin && !t.enabled) o[t.id] = true;
    setOff(o);
  }, [!!data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return null;
  const builtins = data.settings.tools.filter((t) => t.builtin && !t.virtual);
  const onCount = builtins.filter((t) => !off[t.id]).length;

  const addSite = () => {
    const d = normalizeDomain(site);
    if (!d) return setSiteErr('Enter a website like linear.app');
    if (sites.includes(d) || builtins.some((t) => t.domains.includes(d))) return setSiteErr('Already on your list');
    setSites([...sites, d]);
    setSite('');
    setSiteErr('');
  };

  const finish = async (skip = false) => {
    setSaving(true);
    try {
      if (skip) await send('settings:update', { patch: { onboarded: true } });
      else
        await send('onboarding:finish', {
          name,
          role,
          roleCustom,
          enabled: Object.fromEntries(builtins.map((t) => [t.id, !off[t.id]])),
          sites,
          idleMinutes: idle,
        });
      location.href = chrome.runtime.getURL('dashboard.html');
    } finally {
      setSaving(false);
    }
  };

  const H = {
    1: ["What's your role?", 'This tailors your dashboard and the tools we suggest.'],
    2: ['Which tools do you use?', 'Time counts only while one of these is open in your active tab. You can change this later in Tools.'],
    3: ['When should I count you as idle?', 'Idle minutes are kept out of your totals.'],
  }[step];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 24px', background: 'var(--page)' }}>
      <div className="row" style={{ gap: 10, marginBottom: 8 }}>
        <Logo size={28} />
        <span style={{ fontSize: 18, lineHeight: '24px', fontWeight: 600 }}>Nthawi</span>
        <button className="caption" style={{ marginLeft: 16, display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => finish(true)}>
          Skip to dashboard <Icon name="arrowRight" size={12} />
        </button>
      </div>

      <p className="muted" style={{ marginBottom: 24, textAlign: 'center' }}>
        {TAGLINE} Nthawi notices when you're working in your tools and keeps the hours for you.
      </p>
      <div className="card" style={{ width: 'min(900px, 100%)', overflow: 'hidden' }}>
        <div style={{ height: 4, background: 'var(--track)' }}>
          <div style={{ height: '100%', width: `${(step / 3) * 100}%`, background: 'var(--accent)', transition: 'width .25s' }} />
        </div>
        <div style={{ padding: '44px 48px 32px', display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 12, lineHeight: '16px', fontWeight: 600, color: 'var(--accent)' }}>Step {step} of 3</span>
          <h1 className="h-page" style={{ marginTop: 8 }}>
            {H[0]}
          </h1>
          <p className="muted" style={{ marginTop: 8 }}>
            {H[1]}
          </p>

          {step === 1 && (
            <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div className="field" style={{ maxWidth: 360 }}>
                <label htmlFor="name">Your name</label>
                <input id="name" className="input" placeholder="e.g. Chanda Mwale" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 16 }}>
                {ROLES.map((r) => {
                  const on = role === r.id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => {
                        setRole(r.id);
                        if (r.id === 'other') setTimeout(() => document.getElementById('role-custom')?.focus(), 0);
                      }}
                      aria-pressed={on}
                      style={{ position: 'relative', textAlign: 'left', padding: 20, borderRadius: 12, border: on ? '1.5px solid var(--accent)' : '1px solid var(--border)', background: on ? 'var(--accent-tint-2)' : 'var(--card)', display: 'flex', flexDirection: 'column', gap: 24, minHeight: 116 }}
                    >
                      <span style={{ width: 40, height: 40, borderRadius: 10, background: on ? 'var(--card)' : 'var(--track)', color: on ? 'var(--accent)' : 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name={ROLE_ICONS[r.id]} size={18} />
                      </span>
                      <span style={{ fontWeight: 600 }}>{r.label}</span>
                      {on && (
                        <span style={{ position: 'absolute', top: 16, right: 16, width: 20, height: 20, borderRadius: 6, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="check" size={12} stroke={3} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {role === 'other' && (
                <div className="field" style={{ maxWidth: 360 }}>
                  <label htmlFor="role-custom">What's your role?</label>
                  <input id="role-custom" className="input" placeholder="e.g. Business Analyst" maxLength={60} value={roleCustom} onChange={(e) => setRoleCustom(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && roleCustom.trim() && setStep(2)} />
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 16 }}>
                {builtins.map((t) => {
                  const on = !off[t.id];
                  const c = toolColors(t);
                  return (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20, borderRadius: 12, background: on ? c.fill : 'var(--card)', border: on ? '1px solid transparent' : '1px solid var(--border)', transition: 'background .15s' }}>
                      <ToolLogoBox tool={t} on={on} color={c.text} />
                      <div className="grow">
                        <div style={{ fontWeight: 600 }}>{t.name}</div>
                        <div className="caption">{t.domains.join(', ')}</div>
                      </div>
                      <Toggle on={on} label={`Track ${t.name}`} onChange={() => setOff({ ...off, [t.id]: on })} />
                    </div>
                  );
                })}
              </div>
              <div className="field">
                <label htmlFor="site" style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>
                  Add a custom website
                </label>
                <div className="row" style={{ gap: 8 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Icon name="globe" size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-3)' }} />
                    <input
                      id="site"
                      className={`input ${siteErr ? 'error' : ''}`}
                      style={{ paddingLeft: 34 }}
                      placeholder="e.g. linear.app"
                      value={site}
                      onChange={(e) => {
                        setSite(e.target.value);
                        setSiteErr('');
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && addSite()}
                    />
                  </div>
                  <button className="btn btn-secondary" onClick={addSite}>
                    Add
                  </button>
                </div>
                {siteErr && <span className="caption" style={{ color: 'var(--danger)' }}>{siteErr}</span>}
                {!!sites.length && (
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    {sites.map((s) => (
                      <span key={s} className="tag" style={{ background: 'var(--track)', color: 'var(--text)', height: 28, paddingRight: 4 }}>
                        <Icon name="globe" size={12} />
                        {s}
                        <button className="icon-btn" style={{ width: 20, height: 20 }} aria-label={`Remove ${s}`} onClick={() => setSites(sites.filter((x) => x !== s))}>
                          <Icon name="x" size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 28, lineHeight: '36px', fontWeight: 600, color: 'var(--accent)' }}>
                {idle} {idle === 1 ? 'minute' : 'minutes'}
              </div>
              <input type="range" className="slider" min={1} max={10} step={1} value={idle} onChange={(e) => setIdle(+e.target.value)} style={{ '--pct': `${((idle - 1) / 9) * 100}%` }} aria-label="Idle limit in minutes" />
              <div className="row" style={{ justifyContent: 'space-between', padding: '0 4px' }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <button key={n} onClick={() => setIdle(n)} style={{ fontSize: 12, color: n === idle ? 'var(--accent)' : 'var(--text-3)', fontWeight: n === idle ? 600 : 400, width: 16 }}>
                    {n}
                  </button>
                ))}
              </div>
              <p className="muted" style={{ marginTop: 8 }}>
                If you stop moving your mouse or typing for this long, the timer pauses. Google Meet gets a longer limit (10 min) since you often listen without typing. You can change both in Settings.
              </p>
            </div>
          )}

          <div className="divider" style={{ marginTop: 32 }} />
          <div className="row" style={{ marginTop: 24, gap: 16 }}>
            <button className="btn" style={{ color: step === 1 ? 'var(--text-3)' : 'var(--text)', padding: '0 16px' }} disabled={step === 1} onClick={() => setStep(step - 1)}>
              Back
            </button>
            <span className="grow" />
            {step === 2 && <span className="caption">{onCount} of {builtins.length} tools on{sites.length ? ` · ${sites.length} custom` : ''}</span>}
            {step < 3 ? (
              <button className="btn btn-primary" onClick={() => setStep(step + 1)} disabled={(step === 1 && role === 'other' && !roleCustom.trim()) || (step === 2 && onCount + sites.length === 0)}>
                Next
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => finish(false)} disabled={saving}>
                Finish and open dashboard
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolLogoBox({ tool, on, color }) {
  const { src, onError } = useToolLogo(tool);
  return (
    <span style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--card)', border: on ? '1px solid transparent' : '1px solid var(--border)', color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 16, flex: 'none' }}>
      {src ? <img src={src} alt="" onError={onError} style={{ width: 24, height: 24, objectFit: 'contain' }} /> : tool.name.replace('Google ', '')[0]}
    </span>
  );
}
