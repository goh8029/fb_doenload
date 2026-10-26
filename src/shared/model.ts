export interface Target { targetId: string; name: string; sourcePageUrl: string }
export interface Sample { mediaId: string; type: 'photo' | 'video'; url: string; quality: string }
export interface Scan { target: Target | null; samples: Sample[]; gaps: string[] }
export interface Session { id: string; sourceTabId: number; workTabId: number; controllerTabId?: number }
export function isFacebook(raw: string): boolean {
  try { const u = new URL(raw); return u.protocol === 'https:' && u.hostname === 'www.facebook.com' && !u.username && !u.password && !u.port; } catch { return false; }
}
export function isMediaUrl(raw: string): boolean {
  try { const u = new URL(raw); return u.protocol === 'https:' && u.hostname.endsWith('.fbcdn.net') && !u.username && !u.password && !u.port; } catch { return false; }
}
export function targetFromUrl(raw: string, name: string): Target | null {
  if (!isFacebook(raw)) return null;
  const u = new URL(raw);
  const id = u.pathname === '/profile.php' ? u.searchParams.get('id') : /^\/(\d+)\/?(?:photos|videos|albums)?\/?$/.exec(u.pathname)?.[1];
  if (!id || !/^\d{5,30}$/.test(id)) return null;
  return { targetId: id, name: name.trim().slice(0, 120) || `Facebook ${id}`, sourcePageUrl: `https://www.facebook.com/profile.php?id=${id}` };
}
export function validateScan(value: unknown): Scan {
  if (!value || typeof value !== 'object' || JSON.stringify(value).length > 100_000) throw new Error('來源資料格式不符');
  const s = value as Scan;
  if (!Array.isArray(s.samples) || s.samples.length > 20 || !Array.isArray(s.gaps) || s.gaps.some(x => typeof x !== 'string')) throw new Error('來源資料超出範圍');
  if (s.target && (!targetFromUrl(s.target.sourcePageUrl, s.target.name) || targetFromUrl(s.target.sourcePageUrl, s.target.name)?.targetId !== s.target.targetId)) throw new Error('目標資料不符');
  for (const m of s.samples) if (!/^\d{5,30}$/.test(m.mediaId) || !isMediaUrl(m.url) || !['photo', 'video'].includes(m.type) || m.quality !== '頁面可見來源（品質未驗證）') throw new Error('媒體來源不符');
  return s;
}
