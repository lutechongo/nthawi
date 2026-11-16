// Shared UI kit: data hooks, theme, and the design-system components.
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { readAll, toolById } from '../shared/store.js';
import { PALETTES, ROLES, BRAND_LOGOS } from '../shared/constants.js';
import { Icon } from './icons.jsx';

// ---------------------------------------------------------------------------
// Data

/** Live view of everything in storage; re-reads on every change. */
export function useAppData() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    let queued = false;
    const load = () => {
      if (queued) return;
      queued = true;
      setTimeout(() => {
        queued = false;
        readAll().then((d) => alive && setData(d));
      }, 0);
    };
    load();
    const onChange = (_c, area) => area === 'local' && load();
    chrome.storage.onChanged.addListener(onChange);
    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(onChange);
    };
  }, []);
  useTheme(data?.settings?.theme);
  return data;
}

/** Re-render every `ms` (for running timers). */
export function useNow(ms = 1000, active = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, active]);
  return now;
}

// ---------------------------------------------------------------------------
// Theme

export function useTheme(theme) {
  useLayoutEffect(() => {
    const t = theme || safeLocal('at-theme') || 'light';
    document.documentElement.dataset.theme = t;
    if (theme) safeLocal('at-theme', theme);
  }, [theme]);
}
function safeLocal(k, v) {
  try {
    if (v === undefined) return localStorage.getItem(k);
    localStorage.setItem(k, v);
  } catch {
    return null;
  }
}
export function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** { fill, text, chart } for a tool in the current theme. */
export function toolColors(tool) {
  const p = PALETTES[tool?.palette] || PALETTES.slate;
  if (currentTheme() === 'dark') return { fill: hexA(p.chart, 0.16), text: p.chart, chart: p.chart };
  return p;
}
export function hatchBg(color, strength = 0.45) {
  return `repeating-linear-gradient(-45deg, rgba(255,255,255,${strength}) 0 3px, transparent 3px 7px), ${color}`;
}

export function useTools(settings) {
  return useCallback((id) => toolById(settings?.tools || [], id), [settings]);
}

export function roleLabel(id, custom) {
  if (id === 'other') return (custom || '').trim() || 'Other';
  return ROLES.find((r) => r.id === id)?.label || 'Other';
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'AT';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// ---------------------------------------------------------------------------
// Components

/** The Nthawi mark: an hourglass whose lower half fills with the app's hatching. */
export function Logo({ size = 24 }) {
  const id = useId().replace(/:/g, '');
  const solid = size < 28;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Nthawi" style={{ flex: 'none', display: 'block' }}>
      <rect x="2" y="2" width="96" height="96" rx="24" fill="#6E5FD8" />
      <defs>
        <clipPath id={`lo${id}`}>
          <path d="M50 52 L71 76 L29 76 Z" />
        </clipPath>
      </defs>
      {solid ? (
        <path d="M50 52 L71 76 L29 76 Z" fill="#fff" />
      ) : (
        <g clipPath={`url(#lo${id})`}>
          {[14, 23, 32, 41, 50, 59, 68, 77].map((x) => (
            <line key={x} x1={x} y1="80" x2={x + 30} y2="44" stroke="#fff" strokeWidth="4" />
          ))}
        </g>
      )}
      <path d="M29 24 L50 50 L71 76 M71 24 L50 50 L29 76" fill="none" stroke="#fff" strokeWidth={solid ? 8 : 6} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 24 H78 M22 76 H78" stroke="#fff" strokeWidth={solid ? 8 : 6} strokeLinecap="round" />
    </svg>
  );
}

// ---- App logos -------------------------------------------------------------
// 1. tool.iconUrl: the site's real favicon, saved by the background worker the first time you visit it.
// 2. Chrome's local favicon cache (_favicon API), when it has one for the tool's site.
// 3. Otherwise the tool's coloured dot.

const favCache = new Map();
let defaultFav = null;
async function faviconBytes(pageUrl) {
  const u = `${chrome.runtime.getURL('/_favicon/')}?pageUrl=${encodeURIComponent(pageUrl)}&size=64`;
  const buf = await (await fetch(u)).arrayBuffer();
  return { u, bytes: new Uint8Array(buf) };
}
function sameBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function cachedFavicon(pageUrl) {
  if (!favCache.has(pageUrl)) {
    favCache.set(
      pageUrl,
      (async () => {
        try {
          defaultFav = defaultFav || faviconBytes('https://nthawi.invalid/');
          const [d, f] = await Promise.all([defaultFav, faviconBytes(pageUrl)]);
          return sameBytes(d.bytes, f.bytes) ? null : f.u; // the default globe means "unknown"
        } catch {
          return null;
        }
      })(),
    );
  }
  return favCache.get(pageUrl);
}
function toolPage(tool) {
  if (tool.home) return tool.home;
  const d = tool.domains?.[0];
  return d ? `https://${d}${d.includes('/') ? '' : '/'}` : null;
}

function bundledLogo(tool) {
  const key = tool?.domains?.find((d) => BRAND_LOGOS[d]);
  if (!key || typeof chrome === 'undefined' || !chrome.runtime?.getURL) return null;
  return chrome.runtime.getURL(`logos/${BRAND_LOGOS[key]}.png`);
}

export function useToolLogo(tool) {
  const [fallback, setFallback] = useState(null);
  const [broken, setBroken] = useState(false);
  const bundled = bundledLogo(tool);
  const page = tool && !bundled && !tool.iconUrl && !tool.virtual ? toolPage(tool) : null;
  useEffect(() => {
    let alive = true;
    setFallback(null);
    if (page && typeof chrome !== 'undefined' && chrome.runtime?.getURL) cachedFavicon(page).then((u) => alive && setFallback(u));
    return () => {
      alive = false;
    };
  }, [page]);
  useEffect(() => setBroken(false), [tool?.iconUrl]);
  if (bundled) return { src: bundled, onError: () => {} };
  const src = !broken && tool?.iconUrl ? tool.iconUrl : fallback;
  return { src, onError: () => (tool?.iconUrl && !broken ? setBroken(true) : setFallback(null)) };
}

/** The app's logo, or its coloured dot when we don't have one yet. */
export function ToolIcon({ tool, size = 14, dot = 7, style }) {
  const { src, onError } = useToolLogo(tool);
  if (src)
    return <img src={src} alt="" width={size} height={size} onError={onError} style={{ width: size, height: size, borderRadius: Math.max(2, size / 5), objectFit: 'contain', flex: 'none', display: 'inline-block', ...style }} />;
  return <span style={{ width: dot, height: dot, borderRadius: '50%', background: toolColors(tool).chart, flex: 'none', display: 'inline-block', margin: (size - dot) / 2, ...style }} />;
}

export function ToolTag({ tool, short = false, style }) {
  const c = toolColors(tool);
  return (
    <span className="tag" style={{ background: c.fill, color: c.text, paddingLeft: 6, ...style }}>
      <ToolIcon tool={tool} size={14} dot={6} style={{ margin: 0 }} />
      {short ? tool.short || tool.name : tool.name}
    </span>
  );
}

export function ToolDot({ tool, size = 8 }) {
  return <span style={{ width: size, height: size, borderRadius: '50%', background: toolColors(tool).chart, flex: 'none', display: 'inline-block' }} />;
}

export function ToolTile({ tool, size = 40 }) {
  const c = toolColors(tool);
  const { src, onError } = useToolLogo(tool);
  return (
    <div style={{ width: size, height: size, borderRadius: 10, background: c.fill, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
      {src ? (
        <img src={src} alt="" onError={onError} style={{ width: size * 0.55, height: size * 0.55, objectFit: 'contain', borderRadius: 4 }} />
      ) : (
        <div style={{ width: size * 0.4, height: size * 0.4, borderRadius: 4, background: hatchBg(c.text, 0.5) }} />
      )}
    </div>
  );
}

export function Checkbox({ state = false, onChange, label, title }) {
  const cls = state === 'partial' ? 'partial' : state ? 'on' : '';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === 'partial' ? 'mixed' : !!state}
      aria-label={label || title}
      title={title}
      className={`cb ${cls}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!(state === true));
      }}
    >
      {state === 'partial' ? <Icon name="minus" size={12} stroke={3} /> : state ? <Icon name="check" size={12} stroke={3} /> : null}
    </button>
  );
}

export function Toggle({ on, onChange, label }) {
  return <button type="button" role="switch" aria-checked={!!on} aria-label={label} className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange?.(!on)} />;
}

export function Segmented({ options, value, onChange, style }) {
  return (
    <div className="seg" role="tablist" style={style}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ChangeBadge({ change, invert = false, suffix = '' }) {
  if (change == null) return null;
  const up = change >= 0;
  const good = invert ? !up : up;
  return (
    <span className={`badge ${good ? 'badge-on' : 'badge-danger'}`} style={{ gap: 4 }}>
      <Icon name={up ? 'arrowUp' : 'arrowDown'} size={11} stroke={2.4} />
      {Math.abs(change)}%{suffix}
    </span>
  );
}

export function Avatar({ settings, size = 32, radius = 8, fontSize = 12 }) {
  const style = { width: size, height: size, borderRadius: radius, flex: 'none', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', color: 'var(--accent)', fontSize, fontWeight: 600 };
  if (settings?.photo) return <img src={settings.photo} alt="" style={{ ...style, objectFit: 'cover' }} />;
  return <div style={style}>{initials(settings?.name)}</div>;
}

/** Closes on outside click / Escape. */
export function useDismiss(open, onClose, refs) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (refs.some((r) => r.current && r.current.contains(e.target))) return;
      onClose();
    };
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** "⋯" button with a dropdown. items: [{ label, icon, onClick, danger } | 'divider'] */
export function MoreMenu({ items, label = 'More actions', bordered = false }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const menu = useRef(null);
  useDismiss(open, () => setOpen(false), [btn, menu]);
  const toggle = () => {
    if (open) return setOpen(false);
    const r = btn.current.getBoundingClientRect();
    const h = items.length * 38 + 20;
    const below = r.bottom + 6 + h < window.innerHeight;
    setPos({ right: window.innerWidth - r.right, top: below ? r.bottom + 6 : r.top - h - 6 });
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const openedAt = Date.now();
    // Ignore the scroll that can land right after opening (e.g. scroll-into-view).
    const close = () => Date.now() - openedAt > 250 && setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);
  return (
    <>
      <button ref={btn} type="button" className={`icon-btn ${bordered ? 'bordered' : ''}`} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle} style={open ? { background: 'var(--track)', color: 'var(--text)' } : null}>
        <Icon name="more" size={16} />
      </button>
      {open &&
        createPortal(
          <div ref={menu} className="menu" role="menu" style={{ position: 'fixed', top: pos.top, right: pos.right }}>
            {items.map((it, i) =>
              it === 'divider' ? (
                <hr key={i} />
              ) : (
                <button
                  key={i}
                  role="menuitem"
                  className={it.danger ? 'danger' : ''}
                  onClick={() => {
                    setOpen(false);
                    it.onClick();
                  }}
                >
                  {it.icon && <Icon name={it.icon} size={15} />}
                  {it.label}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

export function Modal({ title, sub, children, footer, onClose, width = 480 }) {
  const box = useRef(null);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const first = box.current?.querySelector('input, select, textarea, button');
    first?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ width: `min(${width}px, 100%)` }}>
        <div className="modal-head">
          <div className="row" style={{ gap: 12 }}>
            <h2 className="h-card grow">{title}</h2>
            <button className="icon-btn" aria-label="Close" onClick={onClose}>
              <Icon name="x" size={16} />
            </button>
          </div>
          {sub && <p className="caption" style={{ fontSize: 13, lineHeight: '18px' }}>{sub}</p>}
        </div>
        {children ? <div className="modal-body">{children}</div> : <div style={{ height: 20 }} />}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Toasts

const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((text, action, ms = 4000) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-2), { id, text, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? Math.max(ms, 6000) : ms);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className="toast">
              <span>{t.text}</span>
              {t.action && (
                <button
                  onClick={() => {
                    t.action.onClick();
                    setToasts((x) => x.filter((y) => y.id !== t.id));
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}
export function useToast() {
  return useContext(ToastCtx);
}

// ---------------------------------------------------------------------------
// Navigation helpers

/** Focus an existing dashboard tab (or open one) at the given route. */
export async function openDashboard(route = '') {
  const base = chrome.runtime.getURL('dashboard.html');
  const url = route ? `${base}#/${route}` : base;
  try {
    const tabs = await chrome.tabs.query({ url: `${base}*` });
    if (tabs.length) {
      await chrome.tabs.update(tabs[0].id, { active: true, url });
      await chrome.windows.update(tabs[0].windowId, { focused: true });
      return;
    }
  } catch {
    /* fall through */
  }
  await chrome.tabs.create({ url });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
