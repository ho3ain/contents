import {
  escapeLikeTerm,
  phraseForms,
  foldSearchText,
  foldSqlExpression,
  searchSnippet,
  tokenizeSearchQuery,
} from './blog-search';

describe('blog-search folding', () => {
  it('maps Arabic letters and digits onto the Persian canonical form', () => {
    expect(foldSearchText('كيفيت ۱۴ روز')).toBe('کیفیت 14 روز');
    expect(foldSearchText('مسؤول إدارة أمور آب ة ۀ')).toBe(
      'مسوول اداره امور اب ه ه',
    );
    expect(foldSearchText('٣٤')).toBe('34');
  });

  it('drops ZWNJ, diacritics and tatweel, collapses whitespace, lower-cases', () => {
    expect(foldSearchText('می‌شود')).toBe('میشود');
    expect(foldSearchText('مَرْحَبا')).toBe('مرحبا');
    expect(foldSearchText('سـلام')).toBe('سلام');
    expect(foldSearchText('  API   Key \n Rate ')).toBe('api key rate');
  });

  it('is idempotent', () => {
    const once = foldSearchText('بازگشت‌ وجه كامل ۱۴');
    expect(foldSearchText(once)).toBe(once);
  });

  it('tokenises into distinct terms, dropping punctuation and one-letter noise', () => {
    expect(tokenizeSearchQuery('بازگشت وجه، بازگشت!')).toEqual([
      'بازگشت',
      'وجه',
    ]);
    expect(tokenizeSearchQuery('API-key و rate limit')).toEqual([
      'api',
      'key',
      'rate',
      'limit',
    ]);
    expect(tokenizeSearchQuery('و')).toEqual(['و']);
    expect(tokenizeSearchQuery('   ')).toEqual([]);
    expect(
      tokenizeSearchQuery('a b c d e f g h i j k l').length,
    ).toBeLessThanOrEqual(8);
  });

  it('builds spaced and glued phrase forms for multi-term queries only', () => {
    expect(phraseForms(['می', 'شود'])).toEqual(['می شود', 'میشود']);
    expect(phraseForms(['rate', 'limit'])).toEqual(['rate limit', 'ratelimit']);
    expect(phraseForms(['تسویه'])).toEqual([]);
  });

  it('escapes LIKE wild-cards in user terms', () => {
    expect(escapeLikeTerm('100%_x\\')).toBe('100\\%\\_x\\\\');
  });

  it('emits a SQL expression with the same letter map (no bind parameters)', () => {
    const sql = foldSqlExpression('p.title');
    expect(sql).toContain('translate(lower(p.title)');
    expect(sql).toContain(
      "'يىكؤإأآةۀ۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', 'ییکواااهه01234567890123456789'",
    );
    expect(sql).not.toMatch(/:\w+/);
  });
});

describe('searchSnippet', () => {
  const parts = {
    title: 'بازگشت وجه در MESH دقیقاً چطور کار می‌کند؟',
    excerpt: 'پنجرهٔ ۱۴ روزه و دلایل پذیرفته‌شده.',
    body: 'قاعده ساده است. تا ۱۴ روز پس از پرداخت می‌توانید درخواست بازگشت وجه ثبت کنید. سازنده سه روز فرصت پاسخ دارد.',
  };

  it('prefers title, then excerpt, then the first matching body sentence', () => {
    expect(searchSnippet(parts, ['بازگشت'])).toEqual({
      field: 'title',
      text: parts.title,
    });
    expect(searchSnippet(parts, ['روزه'])).toEqual({
      field: 'excerpt',
      text: parts.excerpt,
    });
    expect(searchSnippet(parts, ['فرصت'])).toEqual({
      field: 'body',
      text: 'سازنده سه روز فرصت پاسخ دارد.',
    });
  });

  it('matches through orthography differences (ZWNJ / Arabic letters) and returns the original text', () => {
    const hit = searchSnippet(parts, tokenizeSearchQuery('ميتوانيد'));
    expect(hit?.field).toBe('body');
    expect(hit?.text).toContain('می‌توانید');
  });

  it('treats line breaks (list items, table cells) as sentence boundaries', () => {
    const hit = searchSnippet(
      {
        title: '',
        excerpt: '',
        body: 'کارمزد پلتفرم\n۱۵٪ از مبلغ فروش\nسهم سازنده\n۸۵٪',
      },
      ['سهم'],
    );
    expect(hit).toEqual({ field: 'body', text: 'سهم سازنده' });
  });

  it('prefers the sentence that matches the most terms over an earlier field with one', () => {
    const hit = searchSnippet(
      {
        title: 'راهنمای تسویه ab12',
        excerpt: '',
        body: 'جملهٔ اول. اینکه چطور انتخاب کنیم ab12 موضوع دیگری است.',
      },
      ['انتخاب', 'کنیم', 'ab12'],
    );
    expect(hit).toEqual({
      field: 'body',
      text: 'اینکه چطور انتخاب کنیم ab12 موضوع دیگری است.',
    });
    // Equal scores: the title still wins.
    expect(
      searchSnippet({ title: 'تسویه ab12', excerpt: '', body: 'متن ab12' }, [
        'ab12',
      ])?.field,
    ).toBe('title');
  });

  it('returns null without terms or matches', () => {
    expect(searchSnippet(parts, [])).toBeNull();
    expect(searchSnippet(parts, ['zzqx'])).toBeNull();
  });

  it('trims long sentences around the match with ellipses', () => {
    const long = `${'کلمه '.repeat(60)}هدف ${'کلمه '.repeat(60)}`.trim();
    const hit = searchSnippet(
      { title: '', excerpt: '', body: long },
      ['هدف'],
      80,
    );
    expect(hit?.text.length).toBeLessThanOrEqual(84);
    expect(hit?.text).not.toContain('\n');
    expect(hit?.text).toContain('هدف');
    expect(hit?.text.startsWith('…')).toBe(true);
    expect(hit?.text.endsWith('…')).toBe(true);
  });
});
