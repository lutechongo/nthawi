import { useState } from 'react';
import { send } from '../shared/store.js';
import { inRange, byTool, total } from '../shared/stats.js';
import { rangeFor, fmtHMS, fmtHM } from '../shared/time.js';
import { trackerView } from '../shared/view.js';
import { workHours, overtimeOf, phaseAt, hm } from '../shared/schedule.js';
import { dayKey, startOfDay } from '../shared/time.js';
import { sessionDuration } from '../shared/store.js';
import { Icon } from '../ui/icons.jsx';
import { Logo, useAppData, useNow, toolColors, hatchBg, openDashboard, useTools, ToolIcon } from '../ui/kit.jsx';

export default function Popup() {
  const data = useAppData();
  const now = useNow(1000);
  const tool = useTools(data?.settings);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  if (!data) return <div className="pp" />;

  const v = trackerView(data, now);
  const wh = workHours(data.settings);
  const inOvertime = v.mode === 'counting' && phaseAt(now, wh) === 'overtime';
  const today = inRange(data.sessions, rangeFor('today', now));
  const todayTotal = total(today, now);
  const goalMs = (data.settings.dailyGoalHours || 0) * 3600000;
  const todayOt = overtimeOf(today, wh, now);
  const eodTime = data.settings.endOfDay?.time || '17:30';
  const unsent = today.filter((x) => x.end != null && !x.clickup && sessionDuration(x, now) >= 60000);
  const showSend = now >= startOfDay(now) + hm(eodTime) * 60000 && unsent.length > 0;
  let rows = byTool(today, now).filter((r) => r.ms > 0);
  if (!rows.length) rows = data.settings.tools.filter((t) => t.enabled && !t.removed).map((t) => ({ toolId: t.id, ms: 0 }));
  const max = Math.max(1, ...rows.map((r) => r.ms));
  const shown = rows.slice(0, 4);
  const more = rows.length - shown.length;

  const act = async (type) => {
    setBusy(true);
    try {
      await send(type);
    } finally {
      setBusy(false);
    }
  };
  const go = async (route) => {
    await openDashboard(route);
    window.close();
  };

  const isOff = v.mode === 'off';
  const isPaused = v.mode === 'paused';
  const showPlay = isOff || isPaused;
  const badgeCls = v.mode === 'off' ? 'badge-off' : v.mode === 'idle' || v.mode === 'paused' ? 'badge-paused' : v.mode === 'waiting' ? 'badge-off' : 'badge-on';
  const timerColor = v.mode === 'counting' ? 'var(--text)' : v.mode === 'off' || v.mode === 'waiting' ? 'var(--text-3)' : 'var(--text-2)';

  return (
    <div className="pp">
      <header className="pp-head">
        <Logo size={22} spin={v.mode === 'counting'} />
        <span style={{ fontWeight: 600, fontSize: 15 }}>Nthawi</span>
        <span className="grow" />
        <button className="icon-btn" title="Settings" aria-label="Settings" onClick={() => go('settings')}>
          <Icon name="gear" size={16} />
        </button>
      </header>

      {!data.settings.onboarded && (
        <div style={{ margin: '12px 16px 0', padding: '10px 12px', borderRadius: 10, background: 'var(--accent-tint)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="grow" style={{ fontSize: 13 }}>Finish setting up your tools.</span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
              window.close();
            }}
          >
            Set up
          </button>
        </div>
      )}

      <div className="pp-body">
        <button
          className={`pp-big ${showPlay ? 'start' : 'stop'}`}
          disabled={busy}
          aria-label={isOff ? 'Start tracking' : isPaused ? 'Resume tracking' : 'Stop tracking'}
          title={isOff ? 'Start tracking' : isPaused ? 'Resume tracking' : 'Stop tracking'}
          onClick={() => act(isOff ? 'start' : isPaused ? 'resume' : 'stop')}
        >
          {showPlay ? <Icon name="play" size={30} style={{ marginLeft: 4 }} /> : <span style={{ width: 26, height: 26, borderRadius: 6, background: 'currentColor' }} />}
        </button>

        <span className={`badge ${badgeCls}`} style={{ height: 26, padding: '0 10px', marginTop: 4 }}>
          {v.mode === 'counting' ? (
            <span className="pulse" />
          ) : v.mode === 'idle' || v.mode === 'paused' ? (
            <span style={{ display: 'flex', gap: 2 }}>
              <span style={{ width: 3, height: 9, borderRadius: 1, background: 'var(--pause-dot)' }} />
              <span style={{ width: 3, height: 9, borderRadius: 1, background: 'var(--pause-dot)' }} />
            </span>
          ) : (
            <span className="dot" style={{ width: 7, height: 7, background: v.mode === 'waiting' ? 'var(--on-dot)' : 'var(--text-3)' }} />
          )}
          {v.label}
          {inOvertime && <span style={{ color: 'var(--pause-text)' }}>· overtime</span>}
        </span>

        <div className="pp-timer" style={{ color: timerColor }}>{fmtHMS(v.timerMs)}</div>
        {(isPaused || v.mode === 'idle') && (
          <div style={{ marginTop: -8, display: 'flex', gap: 4 }}>
            {isPaused && (
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => act('stop')}>
                Stop tracking
              </button>
            )}
          </div>
        )}
        {!isPaused && v.mode !== 'idle' && v.session && <div className="caption ellipsis" style={{ marginTop: -10, maxWidth: '100%' }}>{v.session.title}</div>}
        {v.mode === 'counting' && !note && (
          <button
            className="caption"
            style={{ marginTop: -6, display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-3)' }}
            title="Stop counting time on this page from now on"
            onClick={async () => {
              const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
              if (!tab?.url) return;
              const u = new URL(tab.url);
              await send('exclude:add', { kind: 'url', value: `${u.hostname}${u.pathname}` });
              setNote('Not counting this page anymore. Undo it in Settings → Pages not counted.');
            }}
          >
            <Icon name="ban" size={12} /> Don't count this page
          </button>
        )}
        {note && <div className="caption" style={{ marginTop: -6, textAlign: 'center', color: 'var(--on-text)' }}>{note}</div>}

        <div className="pp-today">
          <div className="row" style={{ gap: 10 }}>
            {goalMs > 0 && <GoalRing pct={todayTotal / goalMs} />}
            <span style={{ display: 'flex', flexDirection: 'column' }} className="grow">
              <span style={{ fontWeight: 600 }}>Today</span>
              {goalMs > 0 && <span className="caption">{todayTotal >= goalMs ? 'Daily goal reached. Nice!' : `${fmtHM(goalMs - todayTotal)} to your ${data.settings.dailyGoalHours}h goal`}</span>}
            </span>
            <span style={{ fontWeight: 600, color: 'var(--accent)' }} className="tnum">
              {fmtHM(todayTotal)}
            </span>
          </div>
          {todayOt >= 60000 && (
            <div className="row caption" style={{ gap: 6, marginTop: -4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pause-dot)' }} />
              <span className="grow">Overtime (after {wh.end} or before {wh.start})</span>
              <span className="tnum" style={{ color: 'var(--pause-text)', fontWeight: 600 }}>{fmtHM(todayOt)}</span>
            </div>
          )}
          {shown.map((r) => {
            const t = tool(r.toolId);
            const c = toolColors(t);
            return (
              <div key={r.toolId}>
                <div className="row" style={{ gap: 8, fontSize: 13 }}>
                  <ToolIcon tool={t} size={14} />
                  <span className="grow ellipsis">{t.name}</span>
                  <span className="tnum" style={{ fontWeight: 600 }}>
                    {fmtHM(r.ms)}
                  </span>
                </div>
                <div className="pp-bar">
                  <span style={{ width: r.ms ? `${Math.max(3, (r.ms / max) * 100)}%` : 0, background: hatchBg(c.chart, 0.5) }} />
                </div>
              </div>
            );
          })}
          {more > 0 && <div className="caption">+{more} more in the dashboard</div>}
        </div>
      </div>

      <div className="pp-foot" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {showSend && (
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => go(`?review=${dayKey(now)}`)}>
            <Icon name="upload" size={15} />
            Day done? Send {unsent.length} to ClickUp
          </button>
        )}
        <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => go('')}>
          Open dashboard <Icon name="arrowUpRight" size={15} />
        </button>
      </div>
    </div>
  );
}

function GoalRing({ pct, size = 32 }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, pct));
  return (
    <svg width={size} height={size} aria-label={`${Math.round(p * 100)}% of daily goal`} role="img" style={{ flex: 'none' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track-2)" strokeWidth="5" />
      <circle className="ring-in" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p >= 1 ? 'var(--on-dot)' : 'var(--accent)'} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${p * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}
