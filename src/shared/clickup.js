// Minimal ClickUp API v2 client (used by the background worker only).
// Auth: a personal API token (pk_…) from ClickUp → Settings → Apps.

let API = 'https://api.clickup.com/api/v2';
export function setApiBase(url) {
  API = url; // tests only
}

export class ClickUpError extends Error {}

async function call(token, path, { method = 'GET', body, query } = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(query || {})) if (v != null) url.searchParams.set(k, v);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: token, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ClickUpError("Couldn't reach ClickUp. Check your internet connection.");
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    if (res.status === 401) throw new ClickUpError("ClickUp didn't accept that token. Copy it again from ClickUp → Settings → Apps.");
    if (res.status === 429) throw new ClickUpError('ClickUp is rate-limiting requests. Try again in a minute.');
    throw new ClickUpError(json?.err || json?.error || `ClickUp returned an error (${res.status}).`);
  }
  return json;
}

export async function getUser(token) {
  const r = await call(token, '/user');
  return { id: r.user.id, username: r.user.username, email: r.user.email, color: r.user.color };
}

export async function getTeams(token) {
  const r = await call(token, '/team');
  return (r.teams || []).map((t) => ({ id: String(t.id), name: t.name }));
}

/** Accepts a task link (app.clickup.com/t/…), a task ID, or a custom task ID like DEV-123. */
export function parseTaskInput(input) {
  const v = String(input || '').trim();
  if (!v) return null;
  const m = v.match(/clickup\.com\/t\/(?:(\d+)\/)?([A-Za-z0-9_-]+)/);
  if (m) return { id: m[2], teamId: m[1] || null, custom: !!m[1] };
  if (/^[A-Za-z]+-\d+$/.test(v)) return { id: v, teamId: null, custom: true };
  if (/^[A-Za-z0-9]+$/.test(v)) return { id: v, teamId: null, custom: false };
  return null;
}

export async function getTask(token, input, teamId) {
  const p = parseTaskInput(input);
  if (!p) throw new ClickUpError('Paste a ClickUp task link, like https://app.clickup.com/t/86abc123');
  const query = p.custom ? { custom_task_ids: 'true', team_id: p.teamId || teamId } : {};
  const t = await call(token, `/task/${encodeURIComponent(p.id)}`, { query });
  return { id: t.id, name: t.name, url: t.url, list: t.list?.name || '', customId: t.custom_id || null };
}

export async function createTimeEntry(token, teamId, entry) {
  const r = await call(token, `/team/${teamId}/time_entries`, { method: 'POST', body: entry });
  return r?.data?.id || r?.id || null;
}
