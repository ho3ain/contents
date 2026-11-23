import {
  anchorAvailable,
  unwrapLink,
  wrapFirstOccurrence,
} from './markdown-link-edit';

const md = [
  '## ایجنت هوش مصنوعی چیست؟',
  '',
  '```',
  'ایجنت هوش مصنوعی در کد',
  '```',
  '',
  'در این [ایجنت هوش مصنوعی](/blog/x) قبلاً لینک داریم و `ایجنت هوش مصنوعی` کد است.',
  '',
  '- انتخاب ايجنت هوش‌مصنوعی برای تیم کوچک ساده نیست.',
  '',
  '| ایجنت هوش مصنوعی | ستون |',
  '|---|---|',
].join('\n');

describe('markdown-link-edit', () => {
  it('wraps the first prose occurrence, skipping headings, code, existing links and tables, with spelling variants', () => {
    const r = wrapFirstOccurrence(md, 'ایجنت هوش مصنوعی', '/blog/target');
    expect(r.changed).toBe(true);
    expect(r.line).toBe(9);
    expect(r.markdown.split('\n')[8]).toBe(
      '- انتخاب [ايجنت هوش‌مصنوعی](/blog/target) برای تیم کوچک ساده نیست.',
    );
    // untouched elsewhere
    expect(r.markdown.split('\n')[6]).toBe(md.split('\n')[6]);
  });

  it('reports when the anchor is not available in prose', () => {
    expect(anchorAvailable(md, 'ستون')).toBe(false);
    expect(anchorAvailable(md, 'تیم کوچک')).toBe(true);
    expect(wrapFirstOccurrence('متن ساده', 'نیست', '/x').changed).toBe(false);
  });

  it('unwraps a link by href (and optional anchor), leaving images alone', () => {
    const src =
      'ببینید ![alt](/blog/x) و [راهنما](/blog/x "t") و [دیگر](/blog/y).';
    const r = unwrapLink(src, '/blog/x');
    expect(r.changed).toBe(true);
    expect(r.markdown).toBe(
      'ببینید ![alt](/blog/x) و راهنما و [دیگر](/blog/y).',
    );
    expect(unwrapLink(src, '/blog/x', 'چیز دیگر').changed).toBe(false);
    expect(unwrapLink(src, '/blog/z').changed).toBe(false);
  });

  it('matches Latin anchors case-insensitively', () => {
    const r = wrapFirstOccurrence(
      'Choose an AI Agent wisely.',
      'ai agent',
      '/agents/x',
    );
    expect(r.markdown).toBe('Choose an [AI Agent](/agents/x) wisely.');
  });
});
