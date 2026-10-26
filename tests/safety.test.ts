import { describe, expect, it } from 'vitest';
import { isFacebook, isMediaUrl, targetFromUrl, validateScan } from '../src/shared/model';
import { safeSegment } from '../src/files/probe';
describe('來源邊界與目標辨識', () => {
  it.each(['https://evilfbcdn.net/a', 'https://fbcdn.net.evil.org/a', 'http://a.fbcdn.net/a', 'https://user@a.fbcdn.net/a', 'file:///x', 'https://a.fbcdn.net:444/a'])('拒絕媒體來源 %s', url => expect(isMediaUrl(url)).toBe(false));
  it('允許 HTTPS CDN 子網域', () => expect(isMediaUrl('https://scontent.xx.fbcdn.net/a?token=memory-only')).toBe(true));
  it('阻止偽裝 Facebook 網址', () => expect(isFacebook('https://www.facebook.com.evil.org/')).toBe(false));
  it.each(['https://www.facebook.com/', 'https://www.facebook.com/me', 'https://www.facebook.com/user.name', 'https://www.facebook.com/photo.php?fbid=123456', 'https://www.facebook.com/watch/'])('不從模糊頁面猜測目標 %s', url => expect(targetFromUrl(url, '人名')).toBeNull());
  it('數字 ID 頁面可辨識並移除追蹤參數', () => expect(targetFromUrl('https://www.facebook.com/profile.php?id=123456&secret=no', ' 測試 ')).toEqual({ targetId: '123456', name: '測試', sourcePageUrl: 'https://www.facebook.com/profile.php?id=123456' }));
  it('錯誤媒體與目標不進入控制頁', () => { expect(() => validateScan({ target: null, samples: [{ mediaId: '123456', url: 'https://evil.org' }], gaps: [] })).toThrow(); expect(() => validateScan({ target: { targetId: '777777', name: 'x', sourcePageUrl: 'https://www.facebook.com/123456' }, samples: [], gaps: [] })).toThrow(); });
});
describe('Windows 檔名', () => {
  it.each(['CON', 'con.txt', 'LPT9', 'AUX'])('處理保留名稱 %s', value => expect(safeSegment(value)).toMatch(/^_/));
  it('不允許名稱包含路徑或相對跳脫', () => { expect(safeSegment('../C:\\secret')).not.toMatch(/[\\/:]/); expect(safeSegment('..')).toBe('_unnamed'); });
  it('截短後仍移除尾端點與空白', () => expect(safeSegment('a'.repeat(79) + '.abcdef')).toBe('a'.repeat(79)));
});
