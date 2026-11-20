const f="none";function p(t,i=[]){if(t.projectId===f)return null;if(t.projectId){const r=i.find(e=>e.id===t.projectId);if(r)return r}const o=(t.title||"").toLowerCase();for(const r of i)if(!r.archived&&(r.keywords||[]).some(e=>e&&o.includes(e.toLowerCase())))return r;return null}function h(t,i,o){const r=new Map;for(const e of t){const a=p(e,i),s=a?a.id:null;r.set(s,(r.get(s)||0)+o(e))}return[...r.entries()].map(([e,a])=>({projectId:e,ms:a})).sort((e,a)=>a.ms-e.ms)}function m(t){return String(t||"").trim().toLowerCase().replace(/\s+/g," ")}function x(t,i,o,r){if(r)return{task:r,why:"chosen"};const e=i.memory?.[m(t.title)];if(e)return{task:e,why:"remembered"};const a=p(t,o);return a?.task?{task:a.task,why:`project ${a.name}`}:i.toolTasks?.[t.toolId]?{task:i.toolTasks[t.toolId],why:"tool"}:i.defaultTask?{task:i.defaultTask,why:"default"}:{task:null,why:null}}function g(t){const i="nthawi-nudge-host";document.getElementById(i)?.remove();const o=document.createElement("div");o.id=i,o.style.cssText="position:fixed;top:10px;right:16px;z-index:2147483647;all:initial;position:fixed;top:10px;right:16px;z-index:2147483647;";const r=o.attachShadow({mode:"open"}),e=c=>String(c||"").replace(/[&<>"]/g,d=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[d]),a=t.dark?"#8E82EE":"#A497F2",s=t.dark?"#D4CCFF":"#3D2B9E",u=`<svg width="18" height="18" viewBox="50 73 400 400" aria-hidden="true"><circle cx="250.5" cy="304" r="146.5" fill="none" stroke="${a}" stroke-width="30"/><path d="M246.9 97 A207 207 0 0 1 399.4 160.2" fill="none" stroke="${s}" stroke-width="30" stroke-linecap="round"/><path d="M256 303 L321 238" fill="none" stroke="${s}" stroke-width="30" stroke-linecap="round"/></svg>`,n=!!t.dark;r.innerHTML=`
<style>
  :host { all: initial; }
  .wrap { display: flex; flex-direction: column; align-items: flex-end; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; animation: drop .22s cubic-bezier(.2,.8,.2,1); }
  .caret { width: 14px; height: 14px; background: ${n?"#17171E":"#fff"}; transform: rotate(45deg); margin-right: 34px; margin-bottom: -8px; box-shadow: -1px -1px 0 ${n?"#282834":"#EDEDF2"}; }
  .card { width: 344px; box-sizing: border-box; background: ${n?"#17171E":"#fff"}; color: ${n?"#ECECF3":"#14141F"}; border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 12px;
    box-shadow: 0 24px 48px rgba(20,20,31,.18), 0 0 0 1px ${n?"#282834":"#EDEDF2"}; }
  .head { display: flex; align-items: center; gap: 8px; font-size: 12px; }
  .head b { font-weight: 600; }
  .muted { color: ${n?"#A3A3B8":"#6B6B80"}; }
  .faint { color: ${n?"#6E6E85":"#A0A0B2"}; }
  .x { margin-left: auto; width: 26px; height: 26px; border: 0; border-radius: 6px; background: transparent; color: inherit; opacity: .6; cursor: pointer; font-size: 18px; line-height: 1; }
  .x:hover { opacity: 1; background: ${n?"#24242F":"#F7F7FA"}; }
  .title { font-size: 16px; line-height: 22px; font-weight: 600; margin: 0; }
  .msg { font-size: 13px; line-height: 19px; margin: 4px 0 0; }
  .row { display: flex; gap: 8px; }
  button.b { height: 34px; padding: 0 12px; border-radius: 8px; font: 500 13px Inter, -apple-system, sans-serif; cursor: pointer; white-space: nowrap; }
  .p { flex: 1; background: #6E5FD8; color: #fff; border: 0; }
  .p:hover { background: #5546C2; }
  .s { background: transparent; color: inherit; border: 1px solid ${n?"#34343F":"#EDEDF2"}; }
  .s:hover { background: ${n?"#24242F":"#F7F7FA"}; }
  @keyframes drop { from { opacity: 0; transform: translateY(-6px); } }
  @media (prefers-reduced-motion: reduce) { .wrap { animation: none; } }
</style>
<div class="wrap">
  <div class="caret"></div>
  <div class="card" role="alertdialog" aria-labelledby="t" aria-describedby="m">
    <div class="head">${u}<b>Nthawi</b><span class="faint">${t.preview?"preview":"now"}</span><button class="x" data-a="dismiss" aria-label="Dismiss">×</button></div>
    <div><p class="title" id="t">${e(t.title)}</p><p class="msg muted" id="m">${e(t.message)}</p></div>
    <div class="row">${t.primary?`<button class="b p" data-a="primary">${e(t.primary)}</button>`:""}${t.secondary?`<button class="b s" data-a="secondary">${e(t.secondary)}</button>`:""}</div>
  </div>
</div>`;const l=()=>o.remove();return r.addEventListener("click",c=>{const d=c.target.closest("[data-a]")?.dataset.a;if(d&&(l(),!t.preview&&d!=="dismiss"))try{chrome.runtime.sendMessage({type:"nudge:action",id:t.id,kind:t.kind,action:d})}catch{}}),(document.body||document.documentElement).appendChild(o),setTimeout(l,t.preview?12e3:9e4),!0}export{h as b,x as c,p,g as s,m as t};
