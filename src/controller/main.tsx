import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { validateScan, type Scan, type Sample } from '../shared/model';
import { inspectProbe, runProbe } from '../files/probe';
import './style.css';
const empty: Scan = { target: null, samples: [], gaps: [] };
const sessionId = new URLSearchParams(location.search).get('session');
function App() {
  const [page, setPage] = useState('workspace');
  const [scan, setScan] = useState<Scan>(empty);
  const [selected, setSelected] = useState<number | null>(null);
  const [root, setRoot] = useState<FileSystemDirectoryHandle | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [inspector, setInspector] = useState(true);
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [progress, setProgress] = useState({ bytes: 0, total: null as number | null });
  const [history, setHistory] = useState<{ id: string; state: string; path: string }[]>([]);
  const abort = useRef<AbortController | null>(null);
  const running = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (confirm) dialog.current?.showModal(); else dialog.current?.close(); }, [confirm]);
  useEffect(() => { const close = (e: BeforeUnloadEvent) => { if (running.current) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', close); return () => window.removeEventListener('beforeunload', close); }, []);
  async function refresh() {
    if (running.current) return;
    setLoading(true); setSelected(null); setScan(empty);
    try {
      if (!sessionId || !globalThis.chrome?.runtime?.id) throw new Error('請在 Facebook 點「拾光」開啟工作頁，再由工作頁開啟此控制頁。');
      const r = await chrome.runtime.sendMessage({ type: 'SCAN', sessionId });
      if (!r.ok) throw new Error(r.error);
      setScan(validateScan(r.scan)); setMessage('已讀取目前工作頁。樣本是可見來源，品質與支援能力尚待驗證。');
    } catch (e) { setMessage((e as Error).message); }
    finally { setLoading(false); }
  }
  async function chooseFolder() {
    try { const chosen = await window.showDirectoryPicker({ mode: 'readwrite' }); setRoot(chosen); setMessage('資料夾已選擇。最後確認前不下載、不寫入媒體。'); }
    catch (e) { setMessage((e as Error).name === 'AbortError' ? '已取消選擇資料夾。' : '無法取得資料夾授權。'); }
  }
  async function start() {
    if (running.current || selected === null || !scan.target || !root) return;
    const sample: Sample = { ...scan.samples[selected] }; const target = { ...scan.target }; const folder = root;
    running.current = true; setBusy(true); setConfirm(false); setProgress({ bytes: 0, total: null });
    abort.current = new AbortController();
    try {
      // The request is invoked directly by the confirmation click (user gesture).
      const allowed = await chrome.permissions.request({ origins: [`${new URL(sample.url).origin}/*`] });
      if (!allowed) throw new Error('未授權此 Facebook 媒體網域，尚未下載。');
      setPage('tasks'); setMessage('正在串流單一樣本，請保持控制頁開啟。');
      let last = 0;
      const result = await runProbe(folder, target, sample, abort.current.signal, (bytes, total) => { if (performance.now() - last > 200 || bytes === total) { last = performance.now(); setProgress({ bytes, total }); } });
      setProgress({ bytes: result.record.bytes, total: result.record.expectedBytes });
      setHistory(h => [{ id: sample.mediaId, state: '已保存 · 待人工驗證', path: result.path }, ...h]);
      setMessage('樣本已保存並核對大小。請開啟檔案確認畫質；影片需確認音軌。此結果不代表完整來源驗收。');
    } catch (e) {
      setHistory(h => [{ id: sample.mediaId, state: '未完成', path: '' }, ...h]);
      // Never expose exceptions containing credential-bearing CDN URLs.
      setMessage(abort.current.signal.aborted ? '已取消。未完成樣本不會標為成功。' : '驗證未完成：請檢查來源授權、網路與目錄權限，回工作頁重新讀取樣本。');
    } finally { running.current = false; setBusy(false); abort.current = null; }
  }
  async function inspect() { try { const dir = await window.showDirectoryPicker({ mode: 'read' }); setMessage(await inspectProbe(dir)); } catch (e) { setMessage((e as Error).name === 'AbortError' ? '已取消核對。' : '無法核對：請選擇包含 probe.json 的 P0驗證子資料夾，確認檔案及紀錄完整。'); } }
  const sample = selected === null ? null : scan.samples[selected];
  const visible = scan.samples.map((m, i) => ({ m, i })).filter(({ m }) => (tab === 'all' || m.type === tab) && m.mediaId.includes(query));
  const pages = [['workspace', '▦', '下載工作區'], ['tasks', '↓', '下載任務'], ['history', '◷', '批次紀錄'], ['settings', '⚙', '偏好設定']];
  return <div className="shell"><aside className="sidebar"><div className="brand"><span className="logo">拾</span>拾光</div><div className="tagline">KEEP YOUR MOMENTS</div><div className="navlabel">媒體管理</div><nav>{pages.map(([id, icon, label]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><i>{icon}</i>{label}</button>)}</nav><div className="sidefoot"><span className="pill">P0 可行性驗證 v0.1</span><p>本機優先，保留每份回憶</p><p>無後端 · 無資料庫 · 不收集帳密</p></div></aside><div className="body"><header><span>Facebook 媒體下載 / {pages.find(p => p[0] === page)?.[2]}</span><span className="pill">電腦版 · 來源待驗證</span></header><main><div className="heading"><div className="eyebrow">YOUR MEDIA, WELL KEPT.</div><h1>{page === 'workspace' ? '把美好，好好收藏。' : pages.find(p => p[0] === page)?.[2]}</h1><p>{page === 'workspace' ? '瀏覽原生 Facebook，從一份可核對的樣本開始。' : '每份收藏，都有清楚的處理紀錄。'}</p></div><div className="banner" role="status">{message || '這是實際擴充功能的 P0 驗證版。請從 Facebook 工作頁讀取樣本；此處沒有示範媒體。'}</div>
  {page === 'workspace' && <><section className="target"><span className="avatar">{scan.target?.name.slice(0, 1) || '拾'}</span><div><h3>{scan.target?.name || '等待辨識下載目標'}</h3><small>{scan.target ? `ID ${scan.target.targetId}` : '目標未明時，不允許開始下載'}</small></div><button disabled={busy || loading} onClick={refresh}>{loading ? '讀取中…' : '讀取工作頁'}</button></section><div className={`workspace ${inspector ? '' : 'collapsed'}`}><section className="panel"><div className="tabs">{[['all', '所有樣本'], ['photo', '照片'], ['video', '影片']].map(([id, name]) => <button className={tab === id ? 'active' : ''} key={id} onClick={() => setTab(id)}>{name}</button>)}</div><div className="tools"><input aria-label="搜尋媒體 ID" placeholder="⌕ 搜尋媒體 ID" value={query} onChange={e => setQuery(e.target.value)} /><span>{visible.length} 個可見樣本</span><button onClick={() => setInspector(!inspector)}>選取檢視 ☷</button></div>{visible.length ? <div className="grid">{visible.map(({ m, i }) => <label className={`card ${i === selected ? 'selected' : ''}`} key={`${m.type}:${m.mediaId}`}><div className="thumb"><input aria-label={`選擇 ${m.mediaId}`} type="checkbox" checked={selected === i} disabled={busy || loading} onChange={() => setSelected(selected === i ? null : i)} /><span className="media-icon">{m.type === 'photo' ? '▧' : '▷'}</span><span className="thumbtag">{m.type === 'photo' ? '照片' : '影片'}</span></div><div className="card-title">{m.mediaId}</div><small>頁面可見來源 · 品質未驗證</small></label>)}</div> : <div className="empty"><div>▦</div><h3>{query ? '沒有符合的樣本' : '收藏，從 Facebook 開始'}</h3><p>在 Facebook 個人頁點「拾光」，保留原頁並開啟工作頁。<br />載入照片後，再回這裡讀取樣本。</p><a href="https://www.facebook.com/" target="_blank" rel="noreferrer">開啟 Facebook ↗</a></div>}<div className="gridfoot">P0 每次驗證一個樣本，最多讀取 20 個；不代表帳號總數。</div></section>{inspector && <aside className="panel inspector"><div className="panelhead"><h3>選取檢視</h3><button aria-label="收合選取檢視" onClick={() => setInspector(false)}>✕</button></div><div className="inspectbody"><div className="count">{sample ? '1' : '0'} <small>個樣本</small></div><p>{sample ? `${sample.type === 'photo' ? '照片' : '影片'} ${sample.mediaId}` : '選擇一份樣本，確認實際保存能力。'}</p><div className="folder">{root?.name || '尚未選擇本機資料夾'}</div><button className="full" disabled={busy} onClick={chooseFolder}>選擇資料夾</button></div><div className="inspectfoot"><button className="primary full" disabled={busy || loading || !sample || !scan.target || !root} onClick={() => setConfirm(true)}>↓ 驗證所選樣本</button><small>最後確認後才會下載媒體。</small></div></aside>}</div><div className="notice">{scan.gaps.length ? scan.gaps.map(g => <p key={g}>ⓘ {g}</p>) : <p>ⓘ 完整下載、整相簿選取與增量下載須先通過 P0，尚未啟用。</p>}</div></>}
  {page === 'tasks' && <section className="panel task"><h3>{busy ? '正在傳輸樣本' : '目前沒有執行中的工作'}</h3><p>實際寫入 {(progress.bytes / 1048576).toFixed(2)} MB · {progress.total === null ? '總大小未知，ETA 估算中' : `來源回報 ${(progress.total / 1048576).toFixed(2)} MB`}</p>{busy && <progress aria-label="樣本傳輸進度" value={progress.total ? progress.bytes : undefined} max={progress.total || undefined} />}<button disabled={!busy} onClick={() => abort.current?.abort()}>取消目前樣本</button><p>控制頁關閉會中斷。本階段沒有自動重試或續傳。</p></section>}
  {page === 'history' && <section className="panel"><div className="panelhead"><h3>本次控制頁紀錄</h3><button disabled={busy} onClick={inspect}>核對既有 P0 紀錄</button></div>{history.length ? history.map((h, i) => <div className="history-row" key={i}><b>{h.id} · {h.state}</b><p>{h.path || '未產生可驗收成果'}</p></div>) : <div className="empty"><h3>尚無樣本紀錄</h3><p>下載後會在此顯示，重新整理會清空這份列表。<br />磁碟內的 probe.json 保留提交狀態。</p></div>}</section>}
  {page === 'settings' && <section className="panel settings">{[['目前階段', 'P0：驗證真實頁面、目錄授權、串流與提交。'], ['保存方式', '每次建立獨立 P0驗證 子資料夾，保留部分檔及 JSON 紀錄。'], ['同時下載數', 'P0 固定 1；正式版 1–4 併發尚待後續關卡。'], ['來源支援', '自己／他人照片、相簿、影片、被標註及粉專皆尚未完成真實驗收。'], ['隱私', '短效媒體 URL 僅保存在記憶體，不寫入紀錄。沒有遙測或遠端程式碼。']].map(([title, body]) => <div className="settingrow" key={title}><h3>{title}</h3><p>{body}</p></div>)}</section>}
  </main></div><dialog ref={dialog} onCancel={() => setConfirm(false)}><div className="modalhead"><h2>最後確認</h2><button aria-label="關閉確認" onClick={() => setConfirm(false)}>✕</button></div><p>僅下載所選樣本，尚非完整／增量下載。</p>{[['目標', `${scan.target?.name} · ${scan.target?.targetId}`], ['模式', 'P0 單一樣本串流驗證'], ['範圍', sample?.mediaId || ''], ['根目錄', root?.name || '']].map(([k, v]) => <div className="summary" key={k}><span>{k}</span><b>{v}</b></div>)}<p>確認後可能要求授權該 Facebook 媒體網域。畫質及影片音軌需人工檢查。</p><div className="actions"><button onClick={() => setConfirm(false)}>取消</button><button className="primary" onClick={start} disabled={busy}>確認並驗證</button></div></dialog></div>;
}
createRoot(document.getElementById('root')!).render(<App />);
