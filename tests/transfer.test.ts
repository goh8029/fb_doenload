import { afterEach, describe, expect, it, vi } from 'vitest';
import { transfer, inspectProbe } from '../src/files/probe';
const url = 'https://scontent.xx.fbcdn.net/media';
const writer = () => ({ write: vi.fn(async () => undefined) }) as unknown as FileSystemWritableFileStream;
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('串流', () => {
  it('逐塊寫入與核對長度，不讀取整個媒體到記憶體', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg', 'content-length': '3' } })));
    const out = writer(); const progress = vi.fn();
    expect(await transfer(url, out, new AbortController().signal, progress)).toEqual({ bytes: 3, expectedBytes: 3, mime: 'image/jpeg' });
    expect(out.write).toHaveBeenCalledOnce(); expect(progress).toHaveBeenCalledWith(3, 3);
    expect(fetch).toHaveBeenCalledWith(url, expect.objectContaining({ credentials: 'omit', redirect: 'error' }));
  });
  it.each([['0', []], ['8', [1, 2]]])('空檔或截短不得完成 (%s)', async (size, bytes) => {
    vi.stubGlobal('fetch', async () => new Response(new Uint8Array(bytes as number[]), { headers: { 'content-type': 'video/mp4', 'content-length': size as string } }));
    await expect(transfer(url, writer(), new AbortController().signal, () => undefined)).rejects.toThrow();
  });
  it('HTML 登入回應不能寫成媒體', async () => {
    vi.stubGlobal('fetch', async () => new Response('login', { headers: { 'content-type': 'text/html' } }));
    const out = writer(); await expect(transfer(url, out, new AbortController().signal, () => undefined)).rejects.toThrow(); expect(out.write).not.toHaveBeenCalled();
  });
  it('429 不重試不寫檔', async () => { vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 }))); const out = writer(); await expect(transfer(url, out, new AbortController().signal, () => undefined)).rejects.toThrow('429'); expect(fetch).toHaveBeenCalledOnce(); expect(out.write).not.toHaveBeenCalled(); });
  it('外部取消會中止等待中的讀取', async () => {
    vi.stubGlobal('fetch', async () => new Response(new ReadableStream(), { headers: { 'content-type': 'video/mp4' } }));
    const abort = new AbortController(); const job = transfer(url, writer(), abort.signal, () => undefined); const assertion = expect(job).rejects.toThrow();
    await Promise.resolve(); await Promise.resolve(); abort.abort(); await assertion;
  });
  it('無位元組進度逾時會釋放讀取', async () => {
    vi.useFakeTimers(); vi.stubGlobal('fetch', async () => new Response(new ReadableStream(), { headers: { 'content-type': 'video/mp4' } }));
    const job = transfer(url, writer(), new AbortController().signal, () => undefined); const assertion = expect(job).rejects.toThrow('30 秒'); await vi.advanceTimersByTimeAsync(30_001); await assertion;
  });
  it('未知總長保持 null', async () => { vi.stubGlobal('fetch', async () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } })); expect((await transfer(url, writer(), new AbortController().signal, () => undefined)).expectedBytes).toBeNull(); });
});
describe('中斷紀錄核對', () => {
  function folder(record: unknown, size = 2) { return { getFileHandle: async (name: string) => ({ getFile: async () => name === 'probe.json' ? new File([JSON.stringify(record)], name) : new File([new Uint8Array(size)], name) }) } as unknown as FileSystemDirectoryHandle; }
  it('running 不會誤報成功', async () => expect(await inspectProbe(folder({ schemaVersion: 1, status: 'running' }))).toContain('未完成'));
  it('檔案大小不符不報完整', async () => expect(await inspectProbe(folder({ schemaVersion: 1, status: 'complete', filename: '123456_visible.jpg', bytes: 3 }))).toContain('不符'));
  it('惡意紀錄不能跳脫目錄', async () => expect(inspectProbe(folder({ schemaVersion: 1, status: 'complete', filename: '../private', bytes: 2 }))).rejects.toThrow());
});
