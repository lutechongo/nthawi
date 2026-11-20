import { useEffect, useState } from 'react';
import { send } from '../../shared/store.js';
import { DEFAULT_NUDGES } from '../../shared/constants.js';
import { dayKey, fromDayKey, weekdayLong, fmtDayMonth, fmtRelativeDayTime } from '../../shared/time.js';
import { Icon } from '../../ui/icons.jsx';
import { Toggle, Segmented, copyText } from '../../ui/kit.jsx';
import { showNudge } from '../../shared/nudge-overlay.js';

export function Section({ title, sub, right, children, id }) {
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

function Row({ title, sub, children }) {
  return (
    <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
      <div className="grow" style={{ minWidth: 240 }}>
        <div style={{ fontWeight: 500 }}>{title}</div>
        {sub && <div className="caption">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

const sel = { width: 'auto', background: 'var(--card)', border: '1px solid var(--border)' };

const PREVIEW = {
  break: { title: 'Time for a stretch', message: "You've been focused for 1h 30m. Stand up, roll your shoulders, grab some water. I'll pause while you're away.", primary: 'Take a 5-min break', secondary: 'In 15 min' },
  water: { title: 'Quick sip of water?', message: "It's been a while since your last pause. A glass of water helps more than another coffee.", primary: 'Done', secondary: 'Later' },
  lunch: { title: 'Lunch time', message: 'Your break runs 13:00–14:00. Enjoy it. Anything you do now is kept separate from your regular hours.', primary: 'Pause for lunch', secondary: 'Not now' },
  overtime: { title: "It's past 17:00", message: 'From here your time counts as overtime. Wrapping up soon?', primary: 'Stop for today', secondary: 'Keep going' },
};

function PreviewBtn({ kind, settings }) {
  const name = (settings.name || '').trim().split(/\s+/)[0];
  const wh = settings.workHours || {};
  const p = { ...PREVIEW[kind] };
  if (kind === 'lunch') p.message = p.message.replace('13:00–14:00', `${wh.lunchStart || '13:00'}–${wh.lunchEnd || '14:00'}`);
  if (kind === 'overtime') p.title = `It's past ${wh.end || '17:00'}`;
  if (name) p.title = p.title.replace(/\?$/, '') + `, ${name}${PREVIEW[kind].title.endsWith('?') ? '?' : ''}`;
  return (
    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent)' }} onClick={() => showNudge({ ...p, id: 'preview', kind, preview: true, dark: settings.theme === 'dark' })}>
      Preview
    </button>
  );
}

export function NudgesSection({ settings }) {
  const n = { ...DEFAULT_NUDGES, ...(settings.nudges || {}) };
  const up = (patch) => send('settings:update', { patch });
  const su = settings.standup || { reminder: true, time: '08:45' };
  const mins = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m} min`);
  return (
    <Section id="sec-nudges" title="Nudges & goal" sub="Small, friendly reminders that pop up inside the tab you're working in, just below the Nthawi icon. Each one appears at most once when it's due.">
      <Row title="Where nudges appear" sub={n.where === 'system' ? 'As system notifications. Check that notifications are allowed for Chrome in your computer settings.' : "In the page you're on. If a page can't show it, you'll get a system notification instead."}>
        <Segmented value={n.where} onChange={(v) => up({ nudges: { where: v } })} options={[{ value: 'tab', label: 'In my tab' }, { value: 'system', label: 'System notification' }]} />
      </Row>
      <div className="divider" />
      <Row title="Daily focus goal" sub="Shown as a ring in the popup and a line on your trend chart.">
        <select className="input" aria-label="Daily goal" style={sel} value={settings.dailyGoalHours ?? 6} onChange={(e) => up({ dailyGoalHours: +e.target.value })}>
          <option value={0}>No goal</option>
          {[3, 4, 5, 6, 7, 8].map((h) => (
            <option key={h} value={h}>{h} hours</option>
          ))}
        </select>
      </Row>
      <div className="divider" />
      <Row title="Take a break" sub="After a long stretch without a pause of 5 minutes or more. Taking the break pauses tracking for 5 minutes.">
        <PreviewBtn kind="break" settings={settings} />
        {n.breakEnabled && (
          <select className="input" aria-label="Remind after" style={sel} value={n.breakMinutes} onChange={(e) => up({ nudges: { breakMinutes: +e.target.value } })}>
            {[45, 60, 75, 90, 120].map((m) => (
              <option key={m} value={m}>After {mins(m)}</option>
            ))}
          </select>
        )}
        <Toggle on={n.breakEnabled} label="Break reminders" onChange={(on) => up({ nudges: { breakEnabled: on } })} />
      </Row>
      <Row title="Drink some water" sub="A gentle reminder while you're focused.">
        <PreviewBtn kind="water" settings={settings} />
        {n.water && (
          <select className="input" aria-label="Water reminder every" style={sel} value={n.waterMinutes} onChange={(e) => up({ nudges: { waterMinutes: +e.target.value } })}>
            {[30, 45, 60, 90].map((m) => (
              <option key={m} value={m}>Every {mins(m)}</option>
            ))}
          </select>
        )}
        <Toggle on={n.water} label="Water reminders" onChange={(on) => up({ nudges: { water: on } })} />
      </Row>
      <Row title="Lunch reminder" sub={`When you're still working at ${settings.workHours?.lunchStart || '13:00'}. "Pause for lunch" stops counting until ${settings.workHours?.lunchEnd || '14:00'}.`}>
        <PreviewBtn kind="lunch" settings={settings} />
        <Toggle on={n.lunch} label="Lunch reminder" onChange={(on) => up({ nudges: { lunch: on } })} />
      </Row>
      <Row title="Overtime heads-up" sub={`Once, when you keep working past ${settings.workHours?.end || '17:00'}.`}>
        <PreviewBtn kind="overtime" settings={settings} />
        <Toggle on={n.overtime} label="Overtime heads-up" onChange={(on) => up({ nudges: { overtime: on } })} />
      </Row>
      <div className="divider" />
      <Row title="Stand-up reminder" sub="On working days, with yesterday's summary ready to read out.">
        {su.reminder && <input type="time" className="input input-time" aria-label="Stand-up reminder time" defaultValue={su.time} key={su.time} onBlur={(e) => e.target.value && e.target.value !== su.time && up({ standup: { time: e.target.value } })} />}
        <Toggle on={su.reminder} label="Stand-up reminder" onChange={(on) => up({ standup: { reminder: on } })} />
      </Row>
      <Row title="Weekly recap" sub="On your last working day of the week, right after the end-of-day check-in.">
        <Toggle on={settings.weeklyRecap !== false} label="Weekly recap" onChange={(on) => up({ weeklyRecap: on })} />
      </Row>
    </Section>
  );
}

/** Consecutive days with the same kind and note become one range. */
function groupDays(list) {
  const out = [];
  for (const l of [...list].sort((a, b) => a.date.localeCompare(b.date))) {
    const last = out[out.length - 1];
    const prevDay = last && dayKey(fromDayKey(last.to) + 36 * 3600000);
    if (last && last.kind === l.kind && last.note === (l.note || '') && last.source === l.source && prevDay === l.date) {
      last.to = l.date;
      last.dates.push(l.date);
    } else out.push({ from: l.date, to: l.date, kind: l.kind, note: l.note || '', source: l.source, dates: [l.date] });
  }
  return out;
}

const fmtDay = (k) => `${weekdayLong(fromDayKey(k)).slice(0, 3)} ${fmtDayMonth(fromDayKey(k))}`;
function fmtSpan(g) {
  if (g.from === g.to) return fmtDay(g.from);
  // count working days in the span (Mon–Fri)
  const wd = g.dates.filter((d) => ![0, 6].includes(new Date(fromDayKey(d)).getDay())).length;
  return `${fmtDayMonth(fromDayKey(g.from))} – ${fmtDayMonth(fromDayKey(g.to))} · ${wd} working ${wd === 1 ? 'day' : 'days'}`;
}

function DayGroup({ g, onRemove }) {
  const holiday = g.kind === 'holiday';
  return (
    <div className="list-row" style={{ gap: 12 }}>
      <span className="tile-ic" style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', background: holiday ? 'var(--accent-tint)' : 'var(--on-bg)', color: holiday ? 'var(--accent)' : 'var(--on-text)' }}>
        <Icon name={holiday ? 'flag' : 'sun'} size={15} />
      </span>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="ellipsis" style={{ fontWeight: 500 }}>{g.note || (holiday ? 'Public holiday' : 'Leave')}</div>
        <div className="caption">{fmtSpan(g)}</div>
      </div>
      <span className="caption" style={{ color: 'var(--text-3)' }}>{g.source === 'vt' ? 'Vacation Tracker' : 'Added by you'}</span>
      {onRemove && (
        <button className="icon-btn" aria-label={`Remove ${g.note || g.from}`} title="Remove" onClick={onRemove}>
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

export function LeaveSection({ settings, toast }) {
  const today = dayKey(Date.now());
  const vt = settings.vacation;
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState('');
  const [showHow, setShowHow] = useState(false);
  const [manual, setManual] = useState(false);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [kind, setKind] = useState('leave');
  const [note, setNote] = useState('');
  const all = (settings.leave || []).filter((l) => l.date >= today);
  const groups = groupDays(all);
  const leaveGroups = groups.filter((g) => g.kind !== 'holiday').slice(0, 6);
  const holidayGroups = groups.filter((g) => g.kind === 'holiday').slice(0, 6);
  const leaveDays = all.filter((l) => l.kind !== 'holiday' && ![0, 6].includes(new Date(fromDayKey(l.date)).getDay())).length;

  const connect = () => {
    // The calendar lives on Vacation Tracker's servers, so Chrome asks once for access to that address.
    try {
      const u = new URL(url.trim().replace(/^webcal:/i, 'https:'));
      chrome.permissions?.request({ origins: [`${u.protocol}//${u.host}/*`] }).catch(() => false);
    } catch {
      /* invalid link: the background check explains */
    }
    run('connect', 'vt:connect', { url }, (r) => `Connected. ${r.leave} leave ${r.leave === 1 ? 'day' : 'days'} and ${r.holidays} ${r.holidays === 1 ? 'holiday' : 'holidays'} added.`);
  };
  const run = async (label, type, payload, ok) => {
    setBusy(label);
    try {
      const r = await send(type, payload);
      if (ok) toast(ok(r));
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy('');
    }
  };
  const add = async () => {
    try {
      await send('leave:add', { from, to: to || from, kind, note });
      setNote('');
      toast('Days off added');
    } catch (e) {
      toast(e.message);
    }
  };
  const remove = (g) => Promise.all(g.dates.map((date) => send('leave:remove', { date })));

  return (
    <Section id="sec-days-off" title="Days off" sub="Leave and public holidays aren't working days: no reminders, and any work you do counts as overtime.">
      {!vt ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
          <div className="row" style={{ gap: 12 }}>
            <span style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--accent-tint)', color: 'var(--accent)', flex: 'none' }}><Icon name="calendar" size={16} /></span>
            <div className="grow">
              <div style={{ fontWeight: 600 }}>Connect Vacation Tracker</div>
              <div className="caption">Your approved leave and Zambian public holidays come in on their own. No admin access needed.</div>
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <input className="input grow" style={{ flex: 1 }} placeholder="Paste your Vacation Tracker calendar link (https://… or webcal://…)" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && url.trim() && connect()} aria-label="Vacation Tracker calendar link" />
            <button className="btn btn-primary" disabled={!url.trim() || !!busy} onClick={connect}>
              {busy === 'connect' ? 'Connecting…' : 'Connect'}
            </button>
          </div>
          <button className="caption" style={{ alignSelf: 'flex-start', color: 'var(--accent)', fontWeight: 500 }} onClick={() => setShowHow(!showHow)}>
            {showHow ? 'Hide steps' : 'Where do I find this link?'}
          </button>
          {showHow && (
            <ol className="caption" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li>Open Vacation Tracker (in Slack, Teams or app.vacationtracker.io).</li>
              <li>Go to <b>My Profile</b>, then <b>Calendar sync</b> (sometimes called <b>Export to calendar</b>).</li>
              <li>Copy the <b>iCal / ICS link</b> for your own leave. Make sure holidays for your location are included.</li>
              <li>Paste it above. Nthawi checks it a few times a day.</li>
            </ol>
          )}
        </div>
      ) : (
        <div className="row" style={{ gap: 12, padding: 16, borderRadius: 12, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <span style={{ width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--accent-tint)', color: 'var(--accent)', flex: 'none' }}><Icon name="calendar" size={16} /></span>
          <div className="grow" style={{ minWidth: 200 }}>
            <div className="row" style={{ gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Vacation Tracker</span>
              <span className="tag" style={{ background: vt.error ? 'var(--danger-tint, #fdecec)' : 'var(--on-bg)', color: vt.error ? 'var(--danger)' : 'var(--on-text)' }}>{vt.error ? 'Needs attention' : 'Connected'}</span>
            </div>
            <div className="caption">
              {vt.error ? vt.error : `Synced ${vt.lastSync ? fmtRelativeDayTime(vt.lastSync) : 'just now'} · ${leaveDays} upcoming leave ${leaveDays === 1 ? 'day' : 'days'} · ${holidayGroups.length ? `${all.filter((l) => l.kind === 'holiday').length} holidays` : 'no holidays'}`}
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => run('sync', 'vt:sync', {}, (r) => `Synced. ${r.leave} leave ${r.leave === 1 ? 'day' : 'days'}, ${r.holidays} ${r.holidays === 1 ? 'holiday' : 'holidays'}.`)}>
            <Icon name="refresh" size={14} /> {busy === 'sync' ? 'Syncing…' : 'Sync now'}
          </button>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-2)' }} onClick={() => run('dis', 'vt:disconnect', {}, () => 'Vacation Tracker disconnected')}>
            Disconnect
          </button>
        </div>
      )}

      {leaveGroups.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="eyebrow" style={{ marginBottom: 4 }}>Upcoming leave</span>
          {leaveGroups.map((g) => (
            <DayGroup key={g.from + g.kind} g={g} onRemove={g.source === 'vt' ? null : () => remove(g)} />
          ))}
        </div>
      )}
      {holidayGroups.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="eyebrow" style={{ marginBottom: 4 }}>Public holidays</span>
          {holidayGroups.map((g) => (
            <DayGroup key={g.from + g.kind} g={g} onRemove={g.source === 'vt' ? null : () => remove(g)} />
          ))}
        </div>
      )}

      {!manual ? (
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', color: 'var(--accent)' }} onClick={() => setManual(true)}>
          <Icon name="plus" size={14} stroke={2.2} /> Add a day off by hand
        </button>
      ) : (
        <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field">
            <label htmlFor="lv-from">From</label>
            <input id="lv-from" type="date" className="input input-time" value={from} onChange={(e) => (setFrom(e.target.value), e.target.value > to && setTo(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="lv-to">Until</label>
            <input id="lv-to" type="date" className="input input-time" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="lv-kind">Type</label>
            <select id="lv-kind" className="input" style={sel} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="leave">Leave</option>
              <option value="holiday">Public holiday</option>
            </select>
          </div>
          <div className="field grow" style={{ minWidth: 160 }}>
            <label htmlFor="lv-note">Note (optional)</label>
            <input id="lv-note" className="input" placeholder="e.g. Annual leave" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button className="btn btn-secondary" onClick={add}>
            <Icon name="plus" size={14} stroke={2.2} /> Add
          </button>
        </div>
      )}
    </Section>
  );
}

export function ExcludesSection({ settings, toast }) {
  const [kind, setKind] = useState('url');
  const [value, setValue] = useState('');
  const list = settings.excludes || [];
  const add = async () => {
    try {
      await send('exclude:add', { kind, value });
      setValue('');
      toast('Added. That page no longer counts.');
    } catch (e) {
      toast(e.message);
    }
  };
  return (
    <Section id="sec-not-counted" title="Pages not counted" sub="Time on these never counts, even inside a tracked tool. Handy for reference docs or personal calls. You can also add the current page from the popup.">
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <select className="input" aria-label="Match by" style={sel} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="url">Address starts with</option>
          <option value="title">Tab title contains</option>
        </select>
        <input className="input grow" style={{ minWidth: 240, flex: 1 }} placeholder={kind === 'url' ? 'docs.google.com/document/d/1AbC…' : 'e.g. Personal'} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="Page to exclude" />
        <button className="btn btn-secondary" onClick={add} disabled={!value.trim()}>Add</button>
      </div>
      {list.map((x) => (
        <div key={x.id} className="list-row" style={{ gap: 12 }}>
          <Icon name="ban" size={14} style={{ color: 'var(--text-3)' }} />
          <span className="caption" style={{ width: 120 }}>{x.kind === 'title' ? 'Title contains' : 'Address'}</span>
          <span className="grow ellipsis">{x.value}</span>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-2)' }} onClick={() => send('exclude:remove', { id: x.id })}>Remove</button>
        </div>
      ))}
    </Section>
  );
}

export function GoogleSection({ data, toast }) {
  const g = data.google;
  const [clientId, setClientId] = useState(g.clientId);
  const [busy, setBusy] = useState('');
  useEffect(() => setClientId(g.clientId), [g.clientId]);
  const redirect = typeof chrome !== 'undefined' && chrome.identity?.getRedirectURL ? chrome.identity.getRedirectURL() : '';
  const run = async (label, fn, ok) => {
    setBusy(label);
    try {
      const r = await fn();
      if (ok) toast(ok(r));
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy('');
    }
  };

  if (!g.connected)
    return (
      <Section id="sec-google" title="Google Calendar & Sheets" sub="Name your Meet sessions after the calendar event, add public holidays, pull today's meetings into your stand-up, and keep a live Google Sheet of your time.">
        <ol style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, lineHeight: '19px' }} className="muted">
          <li>
            Open <b>console.cloud.google.com</b>, create a project (e.g. "Nthawi"), then go to <b>APIs & Services → Library</b> and enable <b>Google Calendar API</b>, <b>Google Sheets API</b> and <b>Google Drive API</b>.
          </li>
          <li>
            <b>OAuth consent screen</b>: choose <b>External</b>, fill in the app name and your email, and add yourself under <b>Test users</b>.
          </li>
          <li>
            <b>Credentials → Create credentials → OAuth client ID</b> → type <b>Web application</b>. Under <b>Authorized redirect URIs</b>, add:
            <div className="row" style={{ gap: 8, marginTop: 6 }}>
              <code style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--track)', fontSize: 12, wordBreak: 'break-all' }}>{redirect}</code>
              <button className="btn btn-secondary btn-sm" onClick={async () => toast((await copyText(redirect)) ? 'Copied' : "Couldn't copy")}>Copy</button>
            </div>
          </li>
          <li>Copy the <b>Client ID</b> it shows you, paste it below and click Connect.</li>
        </ol>
        <div className="row" style={{ gap: 8 }}>
          <input className="input" placeholder="1234567890-abc….apps.googleusercontent.com" value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Google OAuth client ID" />
          <button className="btn btn-primary" disabled={!clientId.trim() || !!busy} onClick={() => run('connect', () => send('google:connect', { clientId }), (r) => `Connected as ${r.email || 'your Google account'}${r.holidays ? ` · ${r.holidays} public holidays added` : ''}`)}>
            {busy === 'connect' ? 'Connecting…' : 'Connect Google'}
          </button>
        </div>
        <p className="caption" style={{ color: 'var(--text-3)' }}>Nthawi only reads your calendar and can only see the one spreadsheet it creates. Everything stays between this browser and Google.</p>
      </Section>
    );

  const up = (patch) => send('google:update', { patch });
  return (
    <Section
      id="sec-google"
      title="Google Calendar & Sheets"
      sub={`Connected${g.email ? ` as ${g.email}` : ''}.`}
      right={
        <button className="btn btn-secondary btn-sm" onClick={() => send('google:disconnect').then(() => toast('Google disconnected'))}>
          Disconnect
        </button>
      }
    >
      <Row title="Name Meet sessions after calendar events" sub='"Meeting abc-defg-hij" becomes "Sprint planning". Checked every 10 minutes.'>
        <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run('match', () => send('google:matchMeetings', {}), (r) => (r.renamed ? `Named ${r.renamed} meeting${r.renamed === 1 ? '' : 's'}` : 'No unnamed meetings today'))}>
          {busy === 'match' ? 'Checking…' : 'Check now'}
        </button>
        <Toggle on={g.calendarMatch} label="Name Meet sessions" onChange={(on) => up({ calendarMatch: on })} />
      </Row>
      <Row title="Public holidays" sub={`${data.settings.holidays?.length || 0} holidays from Google's Zambia holiday calendar.`}>
        <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run('hol', () => send('google:holidays'), (r) => `${r.count} holidays loaded`)}>
          {busy === 'hol' ? 'Loading…' : 'Refresh'}
        </button>
      </Row>
      <div className="divider" />
      <Row
        title="Live Google Sheet"
        sub={
          g.sheetUrl
            ? g.lastSync?.error
              ? `Last update failed: ${g.lastSync.error}`
              : `Updated ${g.lastSync ? fmtRelativeDayTime(g.lastSync.at) : 'never'} · a "Sessions" tab and a "Days" tab with regular, lunch and overtime hours.`
            : 'Creates "Nthawi time log" in your Drive with every session and a daily summary.'
        }
      >
        {g.sheetUrl && (
          <a className="btn btn-ghost btn-sm" href={g.sheetUrl} target="_blank" rel="noreferrer">
            Open sheet <Icon name="arrowUpRight" size={13} />
          </a>
        )}
        <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => run('sheet', () => send('google:syncSheet'), (r) => `Sheet updated · ${r.rows} sessions`)}>
          {busy === 'sheet' ? 'Updating…' : g.sheetUrl ? 'Update now' : 'Create sheet'}
        </button>
      </Row>
      {g.sheetUrl && (
        <Row title="Update the sheet automatically" sub="Every working day at your end-of-day check-in.">
          <Toggle on={g.autoSync} label="Update automatically" onChange={(on) => up({ autoSync: on })} />
        </Row>
      )}
    </Section>
  );
}

export function AISection({ data, toast }) {
  const [key, setKey] = useState('');
  const ai = data.ai;
  return (
    <Section id="sec-ai" title="AI stand-up writer (optional)" sub="Turns your stand-up notes into short, natural sentences you can read out. Uses your own Claude API key. Only the notes on the stand-up page are sent, and only when you press Rewrite.">
      {ai.apiKey ? (
        <Row title="Claude API key added" sub={`Key ending …${ai.apiKey.slice(-4)} · model ${ai.model}`}>
          <select className="input" aria-label="Model" style={sel} value={ai.model} onChange={(e) => send('ai:save', { patch: { model: e.target.value } })}>
            <option value="claude-haiku-5-5">Claude Haiku 5.5 (fast, cheapest)</option>
            <option value="claude-sonnet-5-5">Claude Sonnet 5.5</option>
          </select>
          <button className="btn btn-secondary btn-sm" onClick={() => send('ai:save', { patch: { apiKey: '' } }).then(() => toast('API key removed'))}>Remove key</button>
        </Row>
      ) : (
        <>
          <div className="row" style={{ gap: 8 }}>
            <input className="input" type="password" autoComplete="off" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Claude API key" />
            <button className="btn btn-primary" disabled={!key.trim().startsWith('sk-')} onClick={() => send('ai:save', { patch: { apiKey: key } }).then(() => (setKey(''), toast('API key saved')))}>
              Save
            </button>
          </div>
          <p className="caption">Get a key at console.anthropic.com → API keys. Stored only in this browser, never exported.</p>
        </>
      )}
    </Section>
  );
}
