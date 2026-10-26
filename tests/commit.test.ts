import { afterEach, expect, it, vi } from 'vitest';
import { runProbe } from '../src/files/probe';

// Transactional file handles model createWritable's close/abort behavior.
function memoryRoot(failFinalClose = false) {
  const files = new Map<string, Uint8Array>();
  function directory(path: string): FileSystemDirectoryHandle {
    return {
      name: path.split('/').pop() || 'root',
      getDirectoryHandle: async (name: string) => directory(`${path}/${name}`),
      getFileHandle: async (name: string) => {
        const key = `${path}/${name}`;
        return {
          getFile: async () => new File([new Uint8Array(files.get(key) || [])], name),
          createWritable: async () => {
            const chunks: Uint8Array[] = [];
            const accept = async (value: string | Uint8Array) => { chunks.push(typeof value === 'string' ? new TextEncoder().encode(value) : value); };
            const close = async () => {
              if (failFinalClose && name.endsWith('.jpg')) throw new Error('injected disk failure');
              const total = new Uint8Array(chunks.reduce((sum, b) => sum + b.byteLength, 0)); let pos = 0;
              for (const chunk of chunks) { total.set(chunk, pos); pos += chunk.byteLength; }
              files.set(key, total);
            };
            const stream = new WritableStream({ write: accept, close });
            return Object.assign(stream, { write: accept, close, abort: async () => undefined });
          },
        };
      },
    } as unknown as FileSystemDirectoryHandle;
  }
  return { root: directory('root'), files };
}
const target = { name: '測試', targetId: '123456', sourcePageUrl: 'https://www.facebook.com/profile.php?id=123456' };
const sample = { mediaId: '987654', type: 'photo' as const, quality: '頁面可見來源（品質未驗證）', url: 'https://scontent.xx.fbcdn.net/photo?secret=never-save' };
afterEach(() => vi.unstubAllGlobals());
it('提交後才記 complete，且紀錄不保存短效 URL', async () => {
  const { root, files } = memoryRoot();
  vi.stubGlobal('fetch', async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }));
  const result = await runProbe(root, target, sample, new AbortController().signal, () => undefined);
  expect(result.record.status).toBe('complete');
  const json = [...files].find(([path]) => path.endsWith('probe.json'))![1];
  expect(new TextDecoder().decode(json)).not.toMatch(/secret|fbcdn/);
  expect([...files].find(([path]) => path.endsWith('.jpg'))![1]).toEqual(new Uint8Array([1, 2, 3]));
});
it('最後檔案關閉失敗必須留下 interrupted', async () => {
  const { root, files } = memoryRoot(true);
  vi.stubGlobal('fetch', async () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/jpeg' } }));
  await expect(runProbe(root, target, sample, new AbortController().signal, () => undefined)).rejects.toThrow('disk');
  const json = [...files].find(([path]) => path.endsWith('probe.json'))![1];
  expect(JSON.parse(new TextDecoder().decode(json)).status).toBe('interrupted');
});
it('兩次驗證建立獨立路徑，不覆寫前次樣本', async () => {
  const { root, files } = memoryRoot();
  vi.stubGlobal('fetch', async () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/jpeg' } }));
  const a = await runProbe(root, target, sample, new AbortController().signal, () => undefined);
  const b = await runProbe(root, target, sample, new AbortController().signal, () => undefined);
  expect(a.path).not.toBe(b.path); expect([...files.keys()].filter(k => k.endsWith('.jpg'))).toHaveLength(2);
});
