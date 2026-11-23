import { describe, expect, it } from 'vitest';
import { foldSearchText, highlightRanges, highlightSegments, tokenizeSearchQuery } from '../searchFold';

/**
 * Browser twin of the backend fold (`blog-search.ts`). The expectations below
 * mirror the backend unit test so the two implementations cannot drift
 * unnoticed: identical input → identical folded output.
 */
describe('searchFold', () => {
  it('folds Arabic letters, digits, ZWNJ and diacritics like the API does', () => {
    expect(foldSearchText('كيفية  ۱۴ روز می‌شود  مَرحَبا سَلام API')).toBe('کیفیه 14 روز میشود مرحبا سلام api');
    expect(foldSearchText('ميتوانيد')).toBe('میتوانید');
    expect(foldSearchText('٣٤ ۵۶')).toBe('34 56');
    expect(foldSearchText('  a \n\t b  ')).toBe('a b');
    expect(foldSearchText('')).toBe('');
  });

  it('tokenizes like the API (distinct, ≤ 8, punctuation split, short terms dropped unless alone)', () => {
    expect(tokenizeSearchQuery('بازگشت وجه، بازگشت')).toEqual(['بازگشت', 'وجه']);
    expect(tokenizeSearchQuery('a')).toEqual(['a']);
    expect(tokenizeSearchQuery('a bb')).toEqual(['bb']);
    expect(tokenizeSearchQuery('1 2 3 4 5 6 7 8 9 10'.replace(/\d+/g, (d) => `t${d}`))).toHaveLength(8);
    expect(tokenizeSearchQuery('%_')).toEqual([]);
  });

  it('maps folded matches back to the original text, across ZWNJ and Arabic spellings', () => {
    const text = 'هر محصول پیش از انتشار بازبینی می‌شود.';
    const [range] = highlightRanges(text, ['میشود']);
    expect(text.slice(range.start, range.end)).toBe('می‌شود');
    const arabic = 'كيفية استفاده';
    const [r2] = highlightRanges(arabic, ['کیفیه']);
    expect(arabic.slice(r2.start, r2.end)).toBe('كيفية');
  });

  it('merges overlapping ranges and renders segments in order', () => {
    const segments = highlightSegments('Rate limit و rate-limit', ['rate', 'limit', 'ate']);
    expect(segments.map((s) => [s.text, s.hit])).toEqual([
      ['Rate', true],
      [' ', false],
      ['limit', true],
      [' و ', false],
      ['rate', true],
      ['-', false],
      ['limit', true],
    ]);
    expect(highlightSegments('بدون تطابق', ['xyz'])).toEqual([{ text: 'بدون تطابق', hit: false }]);
    expect(highlightSegments('', ['x'])).toEqual([{ text: '', hit: false }]);
  });

  it('handles astral characters without splitting surrogate pairs', () => {
    const text = 'نتیجه 😀 عالی';
    const segments = highlightSegments(text, ['عالی']);
    expect(segments.map((s) => s.text).join('')).toBe(text);
    expect(segments.find((s) => s.hit)?.text).toBe('عالی');
  });
});
