import { scanPage } from '../adapters/facebook';
let workspace = false;
let busy = false;
const host = document.createElement('div');
host.id = 'shiguang-extension-root';
const shadow = host.attachShadow({ mode: 'closed' });
shadow.innerHTML = `<style>:host{all:initial;position:fixed;bottom:24px;right:24px;z-index:2147483647}button{font:14px system-ui;color:#e0e7f2;background:#192b44;border:1px solid #6a8ebc;border-radius:12px;padding:14px 22px;cursor:pointer;box-shadow:0 8px 30px #0005}button:focus-visible{outline:3px solid #a1bfe5}p{max-width:260px;font:12px system-ui;background:#131f31;color:#e0e7f2;padding:8px}</style><button>拾光 · 開啟下載工作頁</button><p hidden></p>`;
const button = shadow.querySelector('button')!;
button.onclick = async () => {
  if (busy) return;
  busy = true; button.disabled = true;
  try { const r = await chrome.runtime.sendMessage({ type: workspace ? 'OPEN_CONTROLLER' : 'OPEN_WORKSPACE' }); if (!r.ok) throw new Error(r.error); }
  catch { const p = shadow.querySelector('p')!; p.hidden = false; p.textContent = '連線失敗，請重新整理 Facebook 頁面。'; }
  finally { busy = false; button.disabled = false; }
};
function mount() { if (!host.isConnected) document.documentElement.append(host); }
mount();
const observer = new MutationObserver(mount);
observer.observe(document.documentElement, { childList: true });
// A newly created tab can load before the worker finishes binding it.
let attempts = 0;
const check = async () => { try { const r = await chrome.runtime.sendMessage({ type: 'WORKSPACE_STATUS' }); workspace = !!r.workspace; if (workspace) button.textContent = '拾光 · 檢視樣本與選擇資料夾'; else if (++attempts < 6) setTimeout(check, 500); } catch { /* Reloading an extension invalidates old content scripts. */ } };
void check();
chrome.runtime.onMessage.addListener((m, sender, respond) => { if (sender.id === chrome.runtime.id && m?.type === 'SCAN_PAGE') respond(scanPage(document, location.href)); });
