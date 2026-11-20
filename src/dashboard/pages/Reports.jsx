import { useEffect, useMemo, useRef, useState } from 'react';
import { send, sessionDuration } from '../../shared/store.js';
import { inRange, total, idleInRange } from '../../shared/stats.js';
import { summarizeDay, summaryText } from '../../shared/standup.js';
import { previousWorkday, splitSession, dayOff } from '../../shared/schedule.js';
import {
  dayKey, fromDayKey, startOfDay, addDays, startOfWeek, startOfMonth, fmtHM, fmtClock, fmtRangeLabel, weekdayLong, fmtDayMonth, toDateInput, MONTHS_LONG, HOUR,
} from '../../shared/time.js';
import { Icon } from '../../ui/icons.jsx';
import { Segmented, copyText, downloadFile, toolColors } from '../../ui/kit.jsx';
import { useApp } from '../App.jsx';
import { BreakdownCard, ToolsCard, SummaryCard } from '../parts/Charts.jsx';

export default function Reports() {
  const { params, go } = useApp();
  const tab = ['standup', 'recap', 'overtime'].includes(params.get('tab')) ? params.get('tab') : 'standup';
  return (
    <>
      <div className="row no-print" style={{ marginTop: -8, gap: 16, flexWrap: 'wrap' }}>
        <Segmented
          value={tab}
          onChange={(v) => go(`reports?tab=${v}`)}
          options={[
            { value: 'standup', label: 'Stand-up' },
            { value: 'recap', label: 'Weekly recap' },
            { value: 'overtime', label: 'Overtime report' },
          ]}
        />
      </div>
      {tab === 'standup' && <Standup />}
      {tab === 'recap' && <Recap />}
      {tab === 'overtime' && <Overtime />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Stand-up

function Area({ id, label, hint, value, onChange, onBlur, rows = 5, placeholder }) {
  return (
    <div className="field">
      <label htmlFor={id} style={{ fontSize: 15, lineHeight: '22px', fontWeight: 600, color: 'var(--text)' }}>
        {label}
      </label>
      {hint && <span className="caption">{hint}</span>}
      <textarea id={id} className="input" rows={rows} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} style={{ height: 'auto', padding: '12px 14px', resize: 'vertical', lineHeight: '22px' }} />
    </div>
  );
}

function Standup() {
  const { data, now, wh, toast, go, project } = useApp();
  const today = startOfDay(now);
  const key = dayKey(today);
  const saved = data.notes[key] || {};
  const [didDay, setDidDay] = useState(() => (saved.didDay ? fromDayKey(saved.didDay) : previousWorkday(today, wh)));
  const sum = useMemo(() => summarizeDay(data.sessions, data.settings, didDay, now), [data.sessions, data.settings, didDay, now]);
  const auto = summaryText(sum);
  const [did, setDid] = useState(saved.did ?? auto);
  const [plan, setPlan] = useState(saved.today || '');
  const [blockers, setBlockers] = useState(saved.blockers || '');
  const [edited, setEdited] = useState(saved.did != null);
  const [agenda, setAgenda] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [meeting, setMeeting] = useState(false);
  const ai = saved.ai;

  // Keep the generated text fresh until you edit it.
  useEffect(() => {
    if (!edited) setDid(auto);
  }, [auto, edited]);

  const save = (patch) => send('notes:save', { day: key, patch });
  const label = didDay === addDays(today, -1) ? 'yesterday' : `on ${weekdayLong(didDay)}`;
  const append = (text, setter, value, field) => {
    const v = `${value ? `${value.replace(/\s+$/, '')}\n` : ''}• ${text}`;
    setter(v);
    save({ [field]: v });
  };

  const continues = sum.groups.flatMap((g) => g.items.filter((i) => i.ms >= 20 * 60000).map((i) => (g.isProject && !i.title.toLowerCase().includes(g.name.toLowerCase()) ? `${g.name}: ${i.title}` : i.title))).slice(0, 4);

  const loadAgenda = async () => {
    try {
      const r = await send('google:agenda', { day: today });
      setAgenda(r.events);
      if (!r.events.length) toast('No meetings on your calendar today');
    } catch (e) {
      toast(e.message);
    }
  };

  const plain = () =>
    [`What I did ${label}:`, did || '• Nothing tracked', '', 'What I’ll do today:', plan || '• (not written yet)', '', 'Blockers / requests:', blockers || '• None'].join('\n');

  const rewrite = async () => {
    setAiBusy(true);
    try {
      const r = await send('ai:standup', { notes: { yesterdayLabel: label, yesterday: did, today: plan, blockers } });
      await save({ ai: { ...r, at: Date.now() } });
    } catch (e) {
      toast(e.message);
    } finally {
      setAiBusy(false);
    }
  };

  const projectsOf = sum.groups.filter((g) => g.isProject);

  return (
    <>
      <div className="row no-print" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div className="grow">
          <h2 className="h-card">Stand-up for {weekdayLong(today)}, {fmtDayMonth(today)}</h2>
          <p className="caption">Your notes save as you type. Open meeting view when it's your turn to speak.</p>
        </div>
        <button className="btn btn-secondary" onClick={async () => toast((await copyText(plain())) ? 'Stand-up copied' : "Couldn't copy")}>
          <Icon name="copy" size={15} /> Copy
        </button>
        {data.ai.apiKey ? (
          <button className="btn btn-secondary" onClick={rewrite} disabled={aiBusy}>
            <Icon name="sparkle" size={15} /> {aiBusy ? 'Writing…' : ai ? 'Rewrite again' : 'Rewrite with AI'}
          </button>
        ) : (
          <button className="btn btn-ghost" onClick={() => go('settings?section=ai')} title="Add a Claude API key to turn your notes into natural spoken sentences">
            <Icon name="sparkle" size={15} /> Set up AI rewrite
          </button>
        )}
        <button className="btn btn-primary" onClick={() => setMeeting(true)}>
          <Icon name="expand" size={15} /> Meeting view
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(280px, 1fr)', gap: 16, alignItems: 'start' }}>
        <section className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="field">
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <label htmlFor="su-did" className="grow" style={{ fontSize: 15, lineHeight: '22px', fontWeight: 600, color: 'var(--text)' }}>
                1. What did I do {label}?
              </label>
              <input type="date" className="input input-time" aria-label="Which day to summarise" style={{ height: 32, fontSize: 13 }} value={toDateInput(didDay)} max={toDateInput(today)} onChange={(e) => e.target.value && (setDidDay(fromDayKey(e.target.value)), setEdited(false), save({ didDay: e.target.value, did: null }))} />
              {edited && (
                <button className="btn btn-ghost btn-sm" onClick={() => (setEdited(false), save({ did: null }))} title="Go back to the summary from your tracked time">
                  Reset
                </button>
              )}
            </div>
            <span className="caption">Written from your tracked time, grouped by project. Edit freely.</span>
            <textarea id="su-did" className="input" rows={6} value={did} onChange={(e) => (setDid(e.target.value), setEdited(true))} onBlur={() => edited && save({ did, didDay: dayKey(didDay) })} placeholder={`Nothing was tracked ${label}.`} style={{ height: 'auto', padding: '12px 14px', resize: 'vertical', lineHeight: '22px' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Area id="su-today" label="2. What will I do today?" value={plan} onChange={setPlan} onBlur={() => save({ today: plan })} rows={4} placeholder="• Finish the MLFC back-office screens&#10;• Review feedback from the demo" />
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {continues.map((c) => (
                <button key={c} className="chip" onClick={() => append(`Continue ${c}`, setPlan, plan, 'today')} title="Add to today's plan">
                  <Icon name="plus" size={12} /> Continue {c}
                </button>
              ))}
              {data.google.connected && !agenda && (
                <button className="chip" onClick={loadAgenda}>
                  <Icon name="calendar" size={12} /> Add today's meetings
                </button>
              )}
              {agenda?.map((e) => (
                <button key={`${e.start}${e.summary}`} className="chip" onClick={() => append(`${fmtClock(e.start)} ${e.summary}`, setPlan, plan, 'today')}>
                  <Icon name="plus" size={12} /> {fmtClock(e.start)} {e.summary}
                </button>
              ))}
            </div>
          </div>

          <Area
            id="su-blockers"
            label="3. Any challenges, requests or things that are unclear?"
            hint="What's in your way? What do you need from someone? What isn't clear yet?"
            value={blockers}
            onChange={setBlockers}
            onBlur={() => save({ blockers })}
            rows={3}
            placeholder="• Waiting on content for the donations page&#10;• Need clarity on who approves the final designs"
          />

          {ai && (
            <div style={{ borderRadius: 12, background: 'var(--accent-tint-2)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="row" style={{ gap: 8 }}>
                <Icon name="sparkle" size={15} style={{ color: 'var(--accent)' }} />
                <b style={{ fontWeight: 600 }} className="grow">
                  Spoken version
                </b>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-2)' }} onClick={() => save({ ai: null })}>
                  Remove
                </button>
              </div>
              <p><b style={{ fontWeight: 600 }}>Yesterday: </b>{ai.yesterday}</p>
              <p><b style={{ fontWeight: 600 }}>Today: </b>{ai.today}</p>
              <p><b style={{ fontWeight: 600 }}>Blockers: </b>{ai.blockers}</p>
            </div>
          )}
        </section>

        <section className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <h2 className="h-card">{weekdayLong(didDay)} at a glance</h2>
            <p className="caption">{fmtHM(sum.totalMs)} tracked{dayOff(didDay, wh) ? ` · ${dayOff(didDay, wh).note || dayOff(didDay, wh).kind}` : ''}</p>
          </div>
          {sum.groups.map((g) => (
            <div key={g.name} style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <div className="row" style={{ gap: 8 }}>
                {g.isProject && <span style={{ width: 8, height: 8, borderRadius: 2, background: toolColors(data.settings.projects.find((p) => p.name === g.name) || {}).text }} />}
                <b style={{ fontWeight: 600 }} className="grow">{g.name}</b>
                <span className="tnum caption">{fmtHM(g.ms)}</span>
              </div>
              {g.items.slice(0, 5).map((i) => (
                <div key={i.title} className="row caption" style={{ gap: 8 }}>
                  <span className="grow ellipsis">{i.title}</span>
                  <span className="tnum">{fmtHM(i.ms)}</span>
                </div>
              ))}
            </div>
          ))}
          {sum.meetings.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <div className="row">
                <b style={{ fontWeight: 600 }} className="grow">Meetings</b>
                <span className="tnum caption">{fmtHM(sum.meetings.reduce((t, m) => t + m.ms, 0))}</span>
              </div>
              {sum.meetings.map((m) => (
                <div key={m.title} className="row caption" style={{ gap: 8 }}>
                  <span className="grow ellipsis">{m.title}</span>
                  <span className="tnum">{fmtHM(m.ms)}</span>
                </div>
              ))}
            </div>
          )}
          {!sum.totalMs && <p className="muted">Nothing tracked that day.</p>}
          {!projectsOf.length && sum.totalMs > 0 && (
            <p className="caption" style={{ paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              Tip: <button className="btn-ghost" style={{ color: 'var(--accent)', fontWeight: 500 }} onClick={() => go('projects')}>create projects</button> so your stand-up groups work by client.
            </p>
          )}
        </section>
      </div>

      {meeting && <MeetingView label={label} did={ai?.yesterday || did} plan={ai?.today || plan} blockers={ai?.blockers || blockers} onClose={() => setMeeting(false)} />}
    </>
  );
}

function MeetingView({ label, did, plan, blockers, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  const block = (title, text, empty) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent)' }}>{title}</div>
      <div style={{ fontSize: 26, lineHeight: '38px', whiteSpace: 'pre-wrap' }}>{text?.trim() || empty}</div>
    </div>
  );
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-label="Stand-up meeting view" style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'var(--page)', overflow: 'auto', outline: 'none' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 32px 80px', display: 'flex', flexDirection: 'column', gap: 44 }}>
        <div className="row">
          <span className="caption grow">Press Esc to close</span>
          <button className="btn btn-secondary" onClick={onClose}>
            <Icon name="x" size={15} /> Close
          </button>
        </div>
        {block(`What I did ${label}`, did, 'Nothing tracked.')}
        {block('What I’ll do today', plan, 'Not written yet.')}
        {block('Blockers & requests', blockers, 'No blockers right now.')}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weekly recap

function Stat({ label, value, sub, tone }) {
  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="caption">{label}</span>
      <span className="tnum" style={{ fontSize: 24, lineHeight: '32px', fontWeight: 600, color: tone }}>{value}</span>
      {sub && <span className="caption" style={{ color: 'var(--text-3)' }}>{sub}</span>}
    </div>
  );
}

function Recap() {
  const { data, now, wh } = useApp();
  const [offset, setOffset] = useState(0);
  const start = addDays(startOfWeek(now), offset * 7);
  const range = { kind: offset === 0 ? 'week' : offset === -1 ? 'lastWeek' : 'custom', start, end: addDays(start, 7) };
  const sessions = inRange(data.sessions, range);
  const active = total(sessions, now);
  const idle = idleInRange(data.idleLog, range, data.tracker, now);
  const ot = sessions.reduce((t, s) => t + splitSession(s, wh, now).overtime, 0);
  const days = new Set(sessions.map((s) => dayKey(s.start)));
  const meetMs = sessions.filter((s) => s.toolId === 'meet').reduce((t, s) => t + sessionDuration(s, now), 0);
  const longest = [...sessions].sort((a, b) => sessionDuration(b, now) - sessionDuration(a, now)).slice(0, 5);
  const offDays = [];
  for (let d = start; d < range.end; d = addDays(d, 1)) if (dayOff(d, wh)) offDays.push({ d, ...dayOff(d, wh) });

  return (
    <>
      <div className="row" style={{ gap: 12 }}>
        <button className="icon-btn bordered" aria-label="Previous week" onClick={() => setOffset(offset - 1)}>
          <Icon name="chevLeft" size={16} />
        </button>
        <h2 className="h-card">{offset === 0 ? 'This week' : offset === -1 ? 'Last week' : 'Week of'} · {fmtRangeLabel(range)}</h2>
        <button className="icon-btn bordered" aria-label="Next week" onClick={() => setOffset(Math.min(0, offset + 1))} disabled={offset === 0} style={offset === 0 ? { opacity: 0.4 } : null}>
          <Icon name="chevRight" size={16} />
        </button>
      </div>
      <div className="grid-5">
        <Stat label="Tracked" value={fmtHM(active)} sub={`${days.size} ${days.size === 1 ? 'day' : 'days'}`} />
        <Stat label="Average per day" value={days.size ? fmtHM(active / days.size) : '—'} sub="On days you worked" />
        <Stat label="Overtime" value={fmtHM(ot)} sub={`Outside ${wh.start}–${wh.end}`} tone={ot >= 60000 ? 'var(--pause-text)' : undefined} />
        <Stat label="In meetings" value={fmtHM(meetMs)} sub={active ? `${Math.round((meetMs / active) * 100)}% of your time` : '—'} />
        <Stat label="Focus" value={active + idle ? `${Math.round((active / (active + idle)) * 100)}%` : '—'} sub="Active vs idle" />
      </div>
      <div className="grid-3">
        <BreakdownCard range={range} sessions={sessions} />
        <ToolsCard sessions={sessions} sub="Where the week went" />
        <SummaryCard range={range} />
      </div>
      <section className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 className="h-card">Longest stretches</h2>
        {longest.map((s) => (
          <div key={s.id} className="list-row" style={{ gap: 12 }}>
            <span className="grow ellipsis">{s.title}</span>
            <span className="caption">{weekdayLong(s.start)} {fmtClock(s.start)}</span>
            <span className="tnum" style={{ fontWeight: 600, width: 70, textAlign: 'right' }}>{fmtHM(sessionDuration(s, now))}</span>
          </div>
        ))}
        {!longest.length && <p className="muted">Nothing tracked this week.</p>}
        {offDays.length > 0 && <p className="caption" style={{ marginTop: 8 }}>Days off: {offDays.map((o) => `${weekdayLong(o.d)} (${o.note || o.kind})`).join(', ')}</p>}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Monthly overtime report

function Overtime() {
  const { data, now, wh, toast } = useApp();
  const [offset, setOffset] = useState(0);
  const m0 = new Date(startOfMonth(now));
  m0.setMonth(m0.getMonth() + offset);
  const start = m0.getTime();
  const m1 = new Date(start);
  m1.setMonth(m1.getMonth() + 1);
  const end = m1.getTime();
  const sessions = data.sessions.filter((s) => s.start >= start && s.start < end && s.end != null);

  const days = new Map();
  for (const s of sessions) {
    const k = dayKey(s.start);
    const sp = splitSession(s, wh, now);
    const d = days.get(k) || { day: startOfDay(s.start), regular: 0, lunch: 0, overtime: 0, active: 0, items: [] };
    d.regular += sp.regular;
    d.lunch += sp.lunch;
    d.overtime += sp.overtime;
    d.active += sp.active;
    if (sp.overtime >= 60000) d.items.push({ title: s.title, ms: sp.overtime, at: s.start });
    days.set(k, d);
  }
  const list = [...days.values()].sort((a, b) => a.day - b.day);
  const sum = (f) => list.reduce((t, d) => t + d[f], 0);
  const weeks = new Map();
  for (const d of list) {
    const w = startOfWeek(d.day);
    const e = weeks.get(w) || { start: w, days: 0, regular: 0, lunch: 0, overtime: 0 };
    e.days++;
    e.regular += d.regular;
    e.lunch += d.lunch;
    e.overtime += d.overtime;
    weeks.set(w, e);
  }
  const otDays = list.filter((d) => d.overtime >= 60000);
  const monthName = `${MONTHS_LONG[m0.getMonth()]} ${m0.getFullYear()}`;
  const h = (ms) => (ms / HOUR).toFixed(2);

  const csv = () => {
    const rows = [['Date', 'Weekday', 'Regular hours', 'Lunch hours', 'Overtime hours', 'Overtime sessions']];
    for (const d of list) rows.push([dayKey(d.day), weekdayLong(d.day), h(d.regular), h(d.lunch), h(d.overtime), d.items.map((i) => `${i.title} (${fmtHM(i.ms)})`).join('; ')]);
    rows.push(['Total', '', h(sum('regular')), h(sum('lunch')), h(sum('overtime')), '']);
    const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
    downloadFile(`nthawi-overtime_${dayKey(start).slice(0, 7)}.csv`, '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  };

  return (
    <div className="print-area" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <button className="icon-btn bordered no-print" aria-label="Previous month" onClick={() => setOffset(offset - 1)}>
          <Icon name="chevLeft" size={16} />
        </button>
        <h2 className="h-card">Overtime report · {monthName}</h2>
        <button className="icon-btn bordered no-print" aria-label="Next month" onClick={() => setOffset(Math.min(0, offset + 1))} disabled={offset === 0} style={offset === 0 ? { opacity: 0.4 } : null}>
          <Icon name="chevRight" size={16} />
        </button>
        <span className="grow" />
        <button className="btn btn-secondary no-print" onClick={csv} disabled={!list.length}>
          <Icon name="download" size={15} /> CSV
        </button>
        {data.google.connected && (
          <button className="btn btn-secondary no-print" onClick={() => send('google:syncSheet').then((r) => toast(`Sheet updated · ${r.rows} sessions`), (e) => toast(e.message))}>
            <Icon name="upload" size={15} /> Update Google Sheet
          </button>
        )}
        <button className="btn btn-primary no-print" onClick={() => window.print()} disabled={!list.length}>
          <Icon name="print" size={15} /> Print or save as PDF
        </button>
      </div>
      <p className="caption">
        {data.settings.name || 'Me'} · Working hours {wh.start}–{wh.end}, lunch {wh.lunchStart}–{wh.lunchEnd}, {wh.days.length} days a week. Overtime = time tracked outside these hours or on days off{wh.lunchIsOvertime ? ', including lunch' : ''}.
      </p>
      <div className="grid-4">
        <Stat label="Overtime" value={fmtHM(sum('overtime'))} sub={`${otDays.length} ${otDays.length === 1 ? 'day' : 'days'} with overtime`} tone={sum('overtime') >= 60000 ? 'var(--pause-text)' : undefined} />
        <Stat label="Regular hours" value={fmtHM(sum('regular'))} sub={`${list.length} days worked`} />
        <Stat label="Lunch-time work" value={fmtHM(sum('lunch'))} sub={wh.lunchIsOvertime ? 'Counted as overtime' : 'Shown separately'} />
        <Stat label="Total tracked" value={fmtHM(sum('active'))} sub={monthName} />
      </div>
      <section className="card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-2)', fontSize: 12 }}>
              {['Week', 'Days worked', 'Regular', 'Lunch', 'Overtime'].map((x, i) => (
                <th key={x} style={{ padding: '12px 16px', fontWeight: 500, textAlign: i ? 'right' : 'left', borderBottom: '1px solid var(--border)' }}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...weeks.values()].map((w) => (
              <tr key={w.start}>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>{fmtRangeLabel({ start: w.start, end: addDays(w.start, 7) })}</td>
                <td className="tnum" style={{ padding: '12px 16px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>{w.days}</td>
                <td className="tnum" style={{ padding: '12px 16px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>{fmtHM(w.regular)}</td>
                <td className="tnum" style={{ padding: '12px 16px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>{fmtHM(w.lunch)}</td>
                <td className="tnum" style={{ padding: '12px 16px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontWeight: 600, color: w.overtime >= 60000 ? 'var(--pause-text)' : undefined }}>{fmtHM(w.overtime)}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 600 }}>
              <td style={{ padding: '12px 16px' }}>Total</td>
              <td className="tnum" style={{ padding: '12px 16px', textAlign: 'right' }}>{list.length}</td>
              <td className="tnum" style={{ padding: '12px 16px', textAlign: 'right' }}>{fmtHM(sum('regular'))}</td>
              <td className="tnum" style={{ padding: '12px 16px', textAlign: 'right' }}>{fmtHM(sum('lunch'))}</td>
              <td className="tnum" style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--pause-text)' }}>{fmtHM(sum('overtime'))}</td>
            </tr>
          </tbody>
        </table>
        {!list.length && <p className="muted" style={{ padding: 24, textAlign: 'center' }}>Nothing tracked in {monthName}.</p>}
      </section>
      {otDays.length > 0 && (
        <section className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 className="h-card" style={{ marginBottom: 8 }}>Overtime by day</h2>
          {otDays.map((d) => (
            <div key={d.day} className="list-row" style={{ alignItems: 'flex-start', gap: 16 }}>
              <span style={{ width: 150, flex: 'none', fontWeight: 500 }}>
                {weekdayLong(d.day)} {fmtDayMonth(d.day)}
                {dayOff(d.day, wh) && <span className="caption" style={{ display: 'block' }}>{dayOff(d.day, wh).note || dayOff(d.day, wh).kind}</span>}
              </span>
              <span className="grow caption" style={{ fontSize: 13 }}>{d.items.map((i) => `${i.title} (${fmtHM(i.ms)})`).join(' · ')}</span>
              <span className="tnum" style={{ fontWeight: 600, color: 'var(--pause-text)', width: 70, textAlign: 'right', flex: 'none' }}>{fmtHM(d.overtime)}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
