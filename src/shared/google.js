// Google sign-in (OAuth implicit flow through chrome.identity) plus the few
// Calendar and Sheets calls Nthawi needs. Used by the background worker only.
//
// Setup (once): Google Cloud Console → create an OAuth client of type
// "Web application" with the redirect URI shown in Settings → Google
// (https://<extension-id>.chromiumapp.org/), then paste its client ID.

export const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/drive.file', // only files Nthawi creates (your time-log sheet)
];

export class GoogleError extends Error {}

export function redirectUrl() {
  return chrome.identity.getRedirectURL();
}

/** Returns { token, expiresAt }. interactive=false refreshes silently when you're still signed in to Google. */
export async function signIn(clientId, { interactive, email } = {}) {
  if (!clientId) throw new GoogleError('Add your Google OAuth client ID first.');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('redirect_uri', redirectUrl());
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('include_granted_scopes', 'true');
  if (email) url.searchParams.set('login_hint', email);
  if (!interactive) url.searchParams.set('prompt', 'none');
  let redirect;
  try {
    redirect = await chrome.identity.launchWebAuthFlow({ url: url.href, interactive: !!interactive });
  } catch (e) {
    throw new GoogleError(interactive ? `Google sign-in didn't finish: ${e.message}` : 'Google sign-in expired. Reconnect in Settings → Google.');
  }
  const params = new URLSearchParams(new URL(redirect).hash.slice(1));
  if (params.get('error')) throw new GoogleError(`Google said: ${params.get('error')}. Check the client ID and redirect URI.`);
  const token = params.get('access_token');
  if (!token) throw new GoogleError("Google didn't return a sign-in token.");
  return { token, expiresAt: Date.now() + (Number(params.get('expires_in')) || 3600) * 1000 - 60000 };
}

async function call(token, url, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new GoogleError("Couldn't reach Google. Check your internet connection.");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = new GoogleError(json?.error?.message || `Google returned an error (${res.status}).`);
    e.status = res.status;
    throw e;
  }
  return json;
}

export async function userEmail(token) {
  const r = await call(token, 'https://openidconnect.googleapis.com/v1/userinfo');
  return r.email || '';
}

/** Events between two timestamps: [{ id, summary, start, end, meet, allDay }] */
export async function events(token, calendarId, from, to) {
  const u = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  u.searchParams.set('timeMin', new Date(from).toISOString());
  u.searchParams.set('timeMax', new Date(to).toISOString());
  u.searchParams.set('singleEvents', 'true');
  u.searchParams.set('orderBy', 'startTime');
  u.searchParams.set('maxResults', '250');
  const r = await call(token, u.href);
  return (r.items || [])
    .filter((e) => e.status !== 'cancelled')
    .map((e) => {
      const allDay = !!e.start?.date;
      const meet = e.hangoutLink || e.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri || '';
      return {
        id: e.id,
        summary: e.summary || '(No title)',
        start: allDay ? e.start.date : new Date(e.start.dateTime).getTime(),
        end: allDay ? e.end.date : new Date(e.end.dateTime).getTime(),
        allDay,
        meet,
        declined: (e.attendees || []).some((a) => a.self && a.responseStatus === 'declined'),
      };
    });
}

export async function createSpreadsheet(token, title) {
  const r = await call(token, 'https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    body: { properties: { title }, sheets: [{ properties: { title: 'Sessions', gridProperties: { frozenRowCount: 1 } } }, { properties: { title: 'Days', gridProperties: { frozenRowCount: 1 } } }] },
  });
  return { id: r.spreadsheetId, url: r.spreadsheetUrl };
}

/** Replace the contents of the given tabs: { Sessions: rows, Days: rows }. */
export async function writeSheets(token, id, tabs) {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values`;
  await call(token, `${base}:batchClear`, { method: 'POST', body: { ranges: Object.keys(tabs) } });
  await call(token, `${base}:batchUpdate`, {
    method: 'POST',
    body: { valueInputOption: 'USER_ENTERED', data: Object.entries(tabs).map(([tab, values]) => ({ range: `${tab}!A1`, values })) },
  });
}
