// Matching tabs to tools, and turning tab titles into session names.

/** "https://www.Figma.com/design/x" -> "figma.com/design/x"; returns '' if unusable. */
export function normalizeDomain(input) {
  let v = String(input || '').trim().toLowerCase();
  if (!v) return '';
  v = v.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
  v = v.split(/[?#]/)[0].replace(/\/+$/, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/.test(v)) return '';
  return v;
}

/** Does `url` belong to `domain` (which may include a path prefix, e.g. "github.com/myorg")? */
export function urlMatchesDomain(url, domain) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const [dHost, ...rest] = domain.split('/');
  const dPath = rest.length ? '/' + rest.join('/') : '';
  const hostOk = host === dHost || host.endsWith('.' + dHost);
  if (!hostOk) return false;
  if (!dPath) return true;
  return u.pathname.toLowerCase().startsWith(dPath);
}

/** First enabled, non-removed tool whose domains match. Longer (more specific) domains win. */
export function matchTool(url, tools) {
  if (!url) return null;
  let best = null;
  let bestLen = -1;
  for (const t of tools) {
    if (!t.enabled || t.removed || t.virtual) continue;
    for (const d of t.domains || []) {
      if (d.length > bestLen && urlMatchesDomain(url, d)) {
        best = t;
        bestLen = d.length;
      }
    }
  }
  return best;
}

const SUFFIXES = [
  'figma', 'google docs', 'google sheets', 'google slides', 'google forms', 'google drawings',
  'claude', 'google meet', 'meet', 'google drive',
];

/** Turn a tab title into a readable session name. */
export function sessionTitleFromTab(title, tool, url) {
  let t = String(title || '').trim();
  if (tool?.id === 'meet' || /meet\.google\.com/.test(url || '')) {
    // "Meet - abc-defg-hij" / "Meet: Sprint planning" / "Google Meet"
    const m = t.match(/^(?:google\s+)?meet\s*[-–:|]\s*(.+)$/i);
    if (m) {
      const rest = m[1].trim();
      return /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(rest) ? `Meeting ${rest}` : rest;
    }
    const code = (url || '').match(/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
    if (code) return `Meeting ${code[1]}`;
    return t && !/^(google\s+)?meet$/i.test(t) ? t : 'Google Meet';
  }
  // Strip leading unread counters like "(3) ".
  t = t.replace(/^\(\d+\)\s*/, '');
  // Drop trailing " – Figma", " - Google Docs", " | Claude", and the tool's own name.
  const extra = tool?.name ? [tool.name.toLowerCase(), (tool.short || '').toLowerCase()] : [];
  for (let i = 0; i < 3; i++) {
    const m = t.match(/^(.*\S)\s+[-–—|·]\s+([^-–—|·]+)$/);
    if (!m) break;
    const last = m[2].trim().toLowerCase();
    if (SUFFIXES.includes(last) || extra.includes(last)) t = m[1];
    else break;
  }
  t = t.trim();
  if (!t || (tool && t.toLowerCase() === tool.name.toLowerCase())) {
    if (tool?.custom && url) {
      try {
        const u = new URL(url);
        return u.hostname.replace(/^www\./, '');
      } catch {
        /* fall through */
      }
    }
    return tool?.name || 'Untitled';
  }
  return t.length > 120 ? t.slice(0, 117) + '…' : t;
}
