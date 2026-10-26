import { isMediaUrl, type Sample, type Target } from '../shared/model';
export function safeSegment(name: string): string {
  const cleaned = name.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 80).replace(/[. ]+$/g, '');
  return !cleaned || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(cleaned) ? `_${cleaned || 'unnamed'}` : cleaned;
}
export async function writeJson(dir: FileSystemDirectoryHandle, name: string, value: unknown) {
  const file = await dir.getFileHandle(name, { create: true });
  const writer = await file.createWritable();
  try { await writer.write(JSON.stringify(value, null, 2)); await writer.close(); }
  catch (e) { await writer.abort().catch(() => undefined); throw e; }
}
export interface ProbeRecord { schemaVersion: 1; status: 'running' | 'complete' | 'interrupted'; mediaId: string; type: string; quality: string; bytes: number; expectedBytes: number | null; filename: string; savedAt: string }
export async function transfer(
  url: string, destination: FileSystemWritableFileStream, signal: AbortSignal,
  onProgress: (bytes: number, total: number | null) => void, timeoutMs = 30_000,
): Promise<{ bytes: number; expectedBytes: number | null; mime: string }> {
  if (!isMediaUrl(url)) throw new Error('不允許的媒體來源');
  const local = new AbortController();
  const abort = () => local.abort(signal.reason);
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  let timer: ReturnType<typeof setTimeout>;
  const heartbeat = () => { clearTimeout(timer); timer = setTimeout(() => local.abort(new Error('30 秒沒有資料進度')), timeoutMs); };
  heartbeat();
  try {
    // Reject redirects rather than risk requesting an unvalidated destination.
    const response = await fetch(url, { signal: local.signal, credentials: 'omit', redirect: 'error', cache: 'no-store' });
    if (!response.ok || response.status === 206 || !response.body) throw new Error(`來源回應 ${response.status}`);
    const mime = (response.headers.get('content-type') || '').split(';')[0];
    if (!['image/jpeg', 'image/png', 'image/webp', 'video/mp4'].includes(mime)) throw new Error('來源不是支援的照片或 MP4');
    const length = response.headers.get('content-length');
    const expectedBytes = length && /^\d+$/.test(length) ? Number(length) : null;
    let bytes = 0;
    const reader = response.body.getReader();
    const cancel = () => { void reader.cancel().catch(() => undefined); };
    local.signal.addEventListener('abort', cancel, { once: true });
    try {
      while (true) {
        local.signal.throwIfAborted();
        const chunk = await reader.read();
        local.signal.throwIfAborted();
        if (chunk.done) break;
        if (chunk.value.byteLength) { heartbeat(); await destination.write(chunk.value as Uint8Array<ArrayBuffer>); bytes += chunk.value.byteLength; onProgress(bytes, expectedBytes); }
      }
    } finally { local.signal.removeEventListener('abort', cancel); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    if (!bytes || (expectedBytes !== null && expectedBytes !== bytes)) throw new Error('媒體長度不符或為空檔');
    return { bytes, expectedBytes, mime };
  } finally { clearTimeout(timer!); signal.removeEventListener('abort', abort); }
}
export async function runProbe(root: FileSystemDirectoryHandle, target: Target, sample: Sample, signal: AbortSignal, progress: (bytes: number, total: number | null) => void) {
  const parent = await root.getDirectoryHandle(safeSegment(`${target.name}_${target.targetId}`), { create: true });
  const folderName = `P0驗證_${new Date().toISOString().replace(/[:.]/g, '-')}_${crypto.randomUUID()}`;
  const dir = await parent.getDirectoryHandle(folderName, { create: true });
  const record: ProbeRecord = { schemaVersion: 1, status: 'running', mediaId: sample.mediaId, type: sample.type, quality: sample.quality, bytes: 0, expectedBytes: null, filename: 'media.partial', savedAt: new Date().toISOString() };
  await writeJson(dir, 'probe.json', record);
  let writer: FileSystemWritableFileStream | undefined;
  try {
    const partial = await dir.getFileHandle('media.partial', { create: true });
    writer = await partial.createWritable();
    const result = await transfer(sample.url, writer, signal, progress);
    if ((sample.type === 'video') !== result.mime.startsWith('video/')) throw new Error('媒體型別與來源不符');
    await writer.close(); writer = undefined;
    signal.throwIfAborted();
    const file = await partial.getFile();
    if (file.size !== result.bytes) throw new Error('磁碟大小核對失敗');
    const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4' } as Record<string, string>)[result.mime];
    const filename = `${sample.mediaId}_visible.${ext}`;
    const final = await dir.getFileHandle(filename, { create: true });
    const out = await final.createWritable();
    await file.stream().pipeTo(out, { signal });
    if ((await final.getFile()).size !== file.size) throw new Error('提交大小核對失敗');
    signal.throwIfAborted();
    Object.assign(record, { status: 'complete', filename, bytes: result.bytes, expectedBytes: result.expectedBytes, savedAt: new Date().toISOString() });
    await writeJson(dir, 'probe.json', record);
    // Keep the isolated partial for P0 interruption experiments; it is never an indexed download.
    return { record, path: `${parent.name}/${folderName}/${filename}` };
  } catch (error) {
    await writer?.abort().catch(() => undefined);
    record.status = 'interrupted'; record.savedAt = new Date().toISOString();
    await writeJson(dir, 'probe.json', record).catch(() => undefined);
    throw error;
  }
}
export async function inspectProbe(dir: FileSystemDirectoryHandle): Promise<string> {
  const json = await (await dir.getFileHandle('probe.json')).getFile();
  if (json.size > 16_384) throw new Error('紀錄過大');
  const record = JSON.parse(await json.text()) as ProbeRecord;
  if (record.schemaVersion !== 1 || !['running', 'interrupted', 'complete'].includes(record.status)) throw new Error('紀錄格式不符');
  if (record.status !== 'complete') return '此樣本未完成；請回 FB 重新解析來源並重新驗證，不會視為成功。';
  if (typeof record.filename !== 'string' || !/^\d{5,30}_visible\.(jpg|png|webp|mp4)$/.test(record.filename) || !Number.isSafeInteger(record.bytes) || record.bytes <= 0) throw new Error('紀錄內容不符');
  const file = await (await dir.getFileHandle(record.filename)).getFile();
  return file.size === record.bytes ? '提交紀錄與實體大小一致；仍需人工確認影像／音軌。本檢查不代表內容雜湊驗證。' : '實體檔大小與紀錄不符，不可視為完整。';
}
