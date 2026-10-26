import { isFacebook, type Session } from '../shared/model';
const key = (id: string) => `session:${id}`;
async function route(m: unknown, sender: chrome.runtime.MessageSender) {
  if (sender.id !== chrome.runtime.id || !m || typeof m !== 'object' || JSON.stringify(m).length > 2048) throw new Error('拒絕訊息');
  const msg = m as { type: string; sessionId?: string };
  if (msg.type === 'OPEN_WORKSPACE') {
    if (!sender.tab?.id || sender.frameId !== 0 || !isFacebook(sender.url || '')) throw new Error('來源分頁不符');
    const tab = await chrome.tabs.create({ url: sender.url });
    if (!tab.id) throw new Error('無法建立分頁');
    const session: Session = { id: crypto.randomUUID(), sourceTabId: sender.tab.id, workTabId: tab.id };
    await chrome.storage.session.set({ [key(session.id)]: session, [`work:${tab.id}`]: session.id });
    return { ok: true };
  }
  if (msg.type === 'WORKSPACE_STATUS' || msg.type === 'OPEN_CONTROLLER') {
    if (!sender.tab?.id || sender.frameId !== 0 || !isFacebook(sender.url || '')) throw new Error('來源分頁不符');
    const id = (await chrome.storage.session.get(`work:${sender.tab.id}`))[`work:${sender.tab.id}`] as string | undefined;
    if (!id) return { ok: true, workspace: false };
    if (msg.type === 'OPEN_CONTROLLER') {
      const session = (await chrome.storage.session.get(key(id)))[key(id)] as Session;
      const tab = await chrome.tabs.create({ url: chrome.runtime.getURL(`controller.html?session=${id}`) });
      session.controllerTabId = tab.id;
      await chrome.storage.session.set({ [key(id)]: session });
    }
    return { ok: true, workspace: true };
  }
  if (msg.type === 'SCAN') {
    if (!msg.sessionId || sender.url?.split('?')[0] !== chrome.runtime.getURL('controller.html')) throw new Error('控制頁不符');
    const session = (await chrome.storage.session.get(key(msg.sessionId)))[key(msg.sessionId)] as Session | undefined;
    if (!session || session.controllerTabId !== sender.tab?.id) throw new Error('工作階段已失效，請從工作頁重新開啟');
    return { ok: true, scan: await chrome.tabs.sendMessage(session.workTabId, { type: 'SCAN_PAGE' }, { frameId: 0 }) };
  }
  throw new Error('未知訊息');
}
chrome.runtime.onMessage.addListener((m, sender, respond) => { void route(m, sender).then(respond, () => respond({ ok: false, error: '工作階段或來源不符，請從 FB 工作頁重新開啟控制頁。' })); return true; });
chrome.action.onClicked.addListener(() => { void chrome.tabs.create({ url: chrome.runtime.getURL('controller.html') }); });
chrome.tabs.onRemoved.addListener(tabId => { void (async () => { const data = await chrome.storage.session.get(null); const remove: string[] = [`work:${tabId}`]; for (const [k, value] of Object.entries(data)) if (k.startsWith('session:') && (value as Session).workTabId === tabId) remove.push(k); await chrome.storage.session.remove(remove); })(); });
