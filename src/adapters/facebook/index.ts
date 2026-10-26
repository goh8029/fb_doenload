import { isMediaUrl, targetFromUrl, type Scan, type Sample } from '../../shared/model';
export function scanPage(doc: Document, url: string): Scan {
  const target = targetFromUrl(url, doc.querySelector('h1')?.textContent || '');
  const samples: Sample[] = [];
  const seen = new Set<string>();
  // Only explicit DOM media IDs are candidates; do not infer account IDs from unrelated posts.
  for (const el of doc.querySelectorAll<HTMLImageElement | HTMLVideoElement>('a[href] img, video')) {
    const href = el.closest('a[href]')?.getAttribute('href') || url;
    let id: string | null = null;
    try { const u = new URL(href, url); if (u.origin !== 'https://www.facebook.com') continue; id = u.searchParams.get('fbid') || /\/videos\/(\d+)/.exec(u.pathname)?.[1] || null; } catch { continue; }
    const source = el.currentSrc || el.getAttribute('src') || '';
    if (!id || !/^\d{5,30}$/.test(id) || !isMediaUrl(source)) continue;
    const type = el.tagName === 'VIDEO' ? 'video' : 'photo';
    if (seen.has(`${type}:${id}`)) continue;
    seen.add(`${type}:${id}`);
    samples.push({ mediaId: id, type, url: source, quality: '頁面可見來源（品質未驗證）' });
    if (samples.length === 20) break;
  }
  return { target, samples, gaps: ['僅擷取目前 DOM 中最多 20 個樣本；尚未掃描分類、相簿或未載入內容。', '縮圖不代表原圖；影片品質與音軌未驗證，blob／分離音軌不支援。', ...(!target ? ['目標未能唯一辨識：請開啟含數字 ID 的個人頁；本階段不推測別名或登入者。'] : [])] };
}
