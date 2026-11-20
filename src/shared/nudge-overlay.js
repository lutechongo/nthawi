// The in-tab nudge card. This function is injected into the page you're working in
// (chrome.scripting.executeScript serialises it), so it must not use anything from
// outside its own body. The Settings page also calls it directly to preview a nudge.
//
// o = { id, kind, title, message, primary, secondary, preview, dark }

export function showNudge(o) {
  const HOST_ID = 'nthawi-nudge-host';
  document.getElementById(HOST_ID)?.remove();
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'position:fixed;top:10px;right:16px;z-index:2147483647;all:initial;position:fixed;top:10px;right:16px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const ring = o.dark ? '#8E82EE' : '#A497F2';
  const hand = o.dark ? '#D4CCFF' : '#3D2B9E';
  const logo = `<svg width="18" height="18" viewBox="50 73 400 400" aria-hidden="true"><circle cx="250.5" cy="304" r="146.5" fill="none" stroke="${ring}" stroke-width="30"/><path d="M246.9 97 A207 207 0 0 1 399.4 160.2" fill="none" stroke="${hand}" stroke-width="30" stroke-linecap="round"/><path d="M256 303 L321 238" fill="none" stroke="${hand}" stroke-width="30" stroke-linecap="round"/></svg>`;
  const dark = !!o.dark;
  root.innerHTML = `
<style>
  :host { all: initial; }
  .wrap { display: flex; flex-direction: column; align-items: flex-end; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; animation: drop .22s cubic-bezier(.2,.8,.2,1); }
  .caret { width: 14px; height: 14px; background: ${dark ? '#17171E' : '#fff'}; transform: rotate(45deg); margin-right: 34px; margin-bottom: -8px; box-shadow: -1px -1px 0 ${dark ? '#282834' : '#EDEDF2'}; }
  .card { width: 344px; box-sizing: border-box; background: ${dark ? '#17171E' : '#fff'}; color: ${dark ? '#ECECF3' : '#14141F'}; border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 12px;
    box-shadow: 0 24px 48px rgba(20,20,31,.18), 0 0 0 1px ${dark ? '#282834' : '#EDEDF2'}; }
  .head { display: flex; align-items: center; gap: 8px; font-size: 12px; }
  .head b { font-weight: 600; }
  .muted { color: ${dark ? '#A3A3B8' : '#6B6B80'}; }
  .faint { color: ${dark ? '#6E6E85' : '#A0A0B2'}; }
  .x { margin-left: auto; width: 26px; height: 26px; border: 0; border-radius: 6px; background: transparent; color: inherit; opacity: .6; cursor: pointer; font-size: 18px; line-height: 1; }
  .x:hover { opacity: 1; background: ${dark ? '#24242F' : '#F7F7FA'}; }
  .title { font-size: 16px; line-height: 22px; font-weight: 600; margin: 0; }
  .msg { font-size: 13px; line-height: 19px; margin: 4px 0 0; }
  .row { display: flex; gap: 8px; }
  button.b { height: 34px; padding: 0 12px; border-radius: 8px; font: 500 13px Inter, -apple-system, sans-serif; cursor: pointer; white-space: nowrap; }
  .p { flex: 1; background: #6E5FD8; color: #fff; border: 0; }
  .p:hover { background: #5546C2; }
  .s { background: transparent; color: inherit; border: 1px solid ${dark ? '#34343F' : '#EDEDF2'}; }
  .s:hover { background: ${dark ? '#24242F' : '#F7F7FA'}; }
  @keyframes drop { from { opacity: 0; transform: translateY(-6px); } }
  @media (prefers-reduced-motion: reduce) { .wrap { animation: none; } }
</style>
<div class="wrap">
  <div class="caret"></div>
  <div class="card" role="alertdialog" aria-labelledby="t" aria-describedby="m">
    <div class="head">${logo}<b>Nthawi</b><span class="faint">${o.preview ? 'preview' : 'now'}</span><button class="x" data-a="dismiss" aria-label="Dismiss">×</button></div>
    <div><p class="title" id="t">${esc(o.title)}</p><p class="msg muted" id="m">${esc(o.message)}</p></div>
    <div class="row">${o.primary ? `<button class="b p" data-a="primary">${esc(o.primary)}</button>` : ''}${o.secondary ? `<button class="b s" data-a="secondary">${esc(o.secondary)}</button>` : ''}</div>
  </div>
</div>`;
  const close = () => host.remove();
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    close();
    if (!o.preview && a !== 'dismiss') {
      try {
        chrome.runtime.sendMessage({ type: 'nudge:action', id: o.id, kind: o.kind, action: a });
      } catch {
        /* extension reloaded; nothing to do */
      }
    }
  });
  (document.body || document.documentElement).appendChild(host);
  setTimeout(close, o.preview ? 12000 : 90000);
  return true;
}
