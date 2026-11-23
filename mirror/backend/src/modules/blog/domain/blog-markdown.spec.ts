import {
  countWords,
  headingAnchor,
  inlineText,
  readingMinutesFor,
  renderBlogMarkdown,
  safeUrl,
} from './blog-markdown';

describe('blog markdown — safeUrl', () => {
  it('accepts http(s), mailto, tel, site-relative paths and anchors', () => {
    expect(safeUrl('https://mesh.example/x?y=1')).toBe(
      'https://mesh.example/x?y=1',
    );
    expect(safeUrl('http://a.b/c')).toBe('http://a.b/c');
    expect(safeUrl('mailto:hi@mesh.example')).toBe('mailto:hi@mesh.example');
    expect(safeUrl('/agents/foo')).toBe('/agents/foo');
    expect(safeUrl('#need')).toBe('#need');
    expect(safeUrl('#نیاز-واقعی')).toBe('#نیاز-واقعی');
  });

  it('rejects script/data/vbscript, protocol-relative and control characters', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('JAVASCRIPT:alert(1)')).toBeNull();
    expect(safeUrl(' java\nscript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html;base64,AAAA')).toBeNull();
    expect(safeUrl('vbscript:msgbox')).toBeNull();
    expect(safeUrl('//evil.example/x')).toBeNull();
    expect(safeUrl('')).toBeNull();
    expect(safeUrl('#"><img src=x>')).toBeNull();
  });
});

describe('blog markdown — anchors and counts', () => {
  it('builds Unicode-aware stable anchors', () => {
    expect(headingAnchor('از نیاز واقعی شروع کنید')).toBe(
      'از-نیاز-واقعی-شروع-کنید',
    );
    expect(headingAnchor('Compare Capabilities!')).toBe('compare-capabilities');
    expect(headingAnchor('می‌خواهید؟')).toBe('می-خواهید');
  });

  it('counts words across scripts and derives reading minutes', () => {
    expect(countWords('یک دو سه four five 6')).toBe(6);
    expect(readingMinutesFor(0)).toBe(1);
    expect(readingMinutesFor(200)).toBe(1);
    expect(readingMinutesFor(201)).toBe(2);
  });
});

describe('blog markdown — blocks', () => {
  it('parses headings into a TOC with unique ids and demotes h1', () => {
    const r = renderBlogMarkdown(
      '# عنوان\n\n## بخش\n\ntext\n\n## بخش\n\n### زیر بخش\n\n##### deep',
    );
    expect(
      r.blocks
        .filter((b) => b.type === 'heading')
        .map((b) => (b.type === 'heading' ? [b.level, b.id] : null)),
    ).toEqual([
      [2, 'عنوان'],
      [2, 'بخش'],
      [2, 'بخش-2'],
      [3, 'زیر-بخش'],
      [4, 'deep'],
    ]);
    expect(r.toc.map((t) => t.id)).toEqual([
      'عنوان',
      'بخش',
      'بخش-2',
      'زیر-بخش',
      'deep',
    ]);
    expect(r.warnings.some((w) => w.code === 'h1_demoted')).toBe(true);
  });

  it('parses inline emphasis, code and links; drops unsafe links but keeps their text', () => {
    const r = renderBlogMarkdown(
      'A **bold** and *em* and `x < y` [ok](https://a.b) [bad](javascript:alert(1)) end.',
    );
    const p = r.blocks[0];
    expect(p.type).toBe('paragraph');
    if (p.type !== 'paragraph') return;
    expect(p.c).toEqual([
      { t: 'text', v: 'A ' },
      { t: 'strong', c: [{ t: 'text', v: 'bold' }] },
      { t: 'text', v: ' and ' },
      { t: 'em', c: [{ t: 'text', v: 'em' }] },
      { t: 'text', v: ' and ' },
      { t: 'code', v: 'x < y' },
      { t: 'text', v: ' ' },
      { t: 'link', href: 'https://a.b/', c: [{ t: 'text', v: 'ok' }] },
      { t: 'text', v: ' bad end.' },
    ]);
    expect(r.warnings).toEqual([
      { code: 'unsafe_url', line: 1, detail: 'javascript:alert(1)' },
    ]);
  });

  it('never produces HTML: raw tags stay literal text', () => {
    const r = renderBlogMarkdown('<script>alert(1)</script> hello <b>x</b>');
    expect(JSON.stringify(r.blocks)).toContain(
      '<script>alert(1)</script> hello <b>x</b>',
    );
    expect(r.blocks[0].type).toBe('paragraph');
  });

  it('parses lists with one nesting level and lazy continuation', () => {
    const r = renderBlogMarkdown(
      '- one\n- two\n  continued\n  - nested a\n  - nested b\n- three\n\n1. first\n2. second',
    );
    expect(r.blocks).toHaveLength(2);
    const ul = r.blocks[0];
    const ol = r.blocks[1];
    if (ul.type !== 'list' || ol.type !== 'list')
      throw new Error('expected lists');
    expect(ul.ordered).toBe(false);
    expect(ul.items.map((i) => inlineText(i.c))).toEqual([
      'one',
      'two continued',
      'three',
    ]);
    expect(ul.items[1].children?.items.map((i) => inlineText(i.c))).toEqual([
      'nested a',
      'nested b',
    ]);
    expect(ol.ordered).toBe(true);
    expect(ol.items).toHaveLength(2);
  });

  it('parses quotes with callout markers', () => {
    const r = renderBlogMarkdown(
      '> [!TIP]\n> به‌جای «کدام بهتر است؟» بپرسید\n>\n> دومین پاراگراف\n\n> plain',
    );
    expect(r.blocks[0]).toMatchObject({ type: 'quote', kind: 'tip' });
    if (r.blocks[0].type === 'quote')
      expect(r.blocks[0].paragraphs).toHaveLength(2);
    expect(r.blocks[1]).toMatchObject({ type: 'quote', kind: null });
  });

  it('parses fenced code verbatim (no inline parsing, no escaping)', () => {
    const r = renderBlogMarkdown('```ts\nconst a = "<b>*x*</b>";\n```\nafter');
    expect(r.blocks[0]).toEqual({
      type: 'code',
      lang: 'ts',
      code: 'const a = "<b>*x*</b>";',
    });
    expect(r.blocks[1].type).toBe('paragraph');
  });

  it('parses GFM tables with alignment and escaped pipes', () => {
    const r = renderBlogMarkdown(
      '| چه چیزی | چرا |\n|:--|--:|\n| کاربرد | هم‌راستا \\| بله |\n| short |',
    );
    const t = r.blocks[0];
    if (t.type !== 'table') throw new Error('expected table');
    expect(t.align).toEqual(['left', 'right']);
    expect(t.header.map(inlineText)).toEqual(['چه چیزی', 'چرا']);
    expect(t.rows.map((row) => row.map(inlineText))).toEqual([
      ['کاربرد', 'هم‌راستا | بله'],
      ['short', ''],
    ]);
  });

  it('parses standalone images as blocks and warns on missing alt / unsafe src', () => {
    const r = renderBlogMarkdown(
      '![نمودار](/uploads/a.png "کپشن")\n\n![](https://x.y/z.png)\n\n![x](javascript:1)',
    );
    expect(r.blocks[0]).toEqual({
      type: 'image',
      src: '/uploads/a.png',
      alt: 'نمودار',
      caption: 'کپشن',
    });
    expect(r.blocks[1]).toMatchObject({ type: 'image', alt: '' });
    expect(r.blocks).toHaveLength(2);
    expect(r.warnings.map((w) => w.code)).toEqual([
      'image_without_alt',
      'unsafe_url',
    ]);
  });

  it('handles rules, hard breaks and computes plain text / reading time', () => {
    const r = renderBlogMarkdown(
      'line one  \nline two\\\nline three\n\n---\n\npara',
    );
    const p = r.blocks[0];
    if (p.type !== 'paragraph') throw new Error('expected paragraph');
    expect(p.c.filter((n) => n.t === 'br')).toHaveLength(2);
    expect(r.blocks[1]).toEqual({ type: 'hr' });
    expect(r.plainText).toBe('line one line two line three\npara');
    expect(r.wordCount).toBe(7);
    expect(r.readingMinutes).toBe(1);
  });

  it('is deterministic', () => {
    const src = '## a\n\ntext **b**\n\n- x\n- y\n\n## a';
    expect(renderBlogMarkdown(src)).toEqual(renderBlogMarkdown(src));
  });
});
