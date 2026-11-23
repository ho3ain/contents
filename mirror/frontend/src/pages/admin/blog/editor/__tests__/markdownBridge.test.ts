import { describe, expect, it } from 'vitest';
import type { BlogBlock } from '../../../../../api/blog';
import { blocksToDoc } from '../blocksToDoc';
import { docToMarkdown, escapeInline } from '../docToMarkdown';

/**
 * Content Studio bridge: server block tree → ProseMirror JSON → server Markdown
 * dialect. The expectations below are the exact strings the backend parser
 * (`blog-markdown.ts`) reads back into the same blocks — verified against the
 * real parser in docs/seo-studio/02_CONTENT_STUDIO.md.
 */

const blocks: BlogBlock[] = [
  { type: 'heading', level: 2, id: 'intro', text: 'مقدمه', c: [{ t: 'text', v: 'مقدمه' }] },
  {
    type: 'paragraph',
    c: [
      { t: 'text', v: 'متن ' },
      { t: 'strong', c: [{ t: 'text', v: 'پررنگ' }] },
      { t: 'text', v: ' و ' },
      { t: 'em', c: [{ t: 'text', v: 'کج' }] },
      { t: 'text', v: ' و ' },
      { t: 'code', v: 'x = 1' },
      { t: 'text', v: ' و ' },
      { t: 'link', href: '/blog/other', c: [{ t: 'text', v: 'پیوند' }] },
      { t: 'br' },
      { t: 'text', v: 'خط دوم با نیم‌فاصله' },
    ],
  },
  {
    type: 'list',
    ordered: false,
    items: [
      { c: [{ t: 'text', v: 'یک' }], children: null },
      {
        c: [{ t: 'text', v: 'دو' }],
        children: { type: 'list', ordered: true, items: [{ c: [{ t: 'text', v: 'دو-الف' }], children: null }] },
      },
    ],
  },
  { type: 'quote', kind: 'tip', paragraphs: [[{ t: 'text', v: 'نکته' }], [{ t: 'text', v: 'پاراگراف دوم' }]] },
  { type: 'quote', kind: null, paragraphs: [[{ t: 'text', v: 'نقل‌قول' }]] },
  { type: 'code', lang: 'ts', code: 'const a = 1;\nconst b = `x`;' },
  { type: 'image', src: 'https://cdn.example.com/a.png', alt: 'نمودار', caption: 'زیرنویس' },
  {
    type: 'table',
    align: ['left', 'center', null],
    header: [[{ t: 'text', v: 'a' }], [{ t: 'text', v: 'b' }], [{ t: 'text', v: 'c' }]],
    rows: [[[{ t: 'text', v: '1|2' }], [{ t: 'strong', c: [{ t: 'text', v: '2' }] }], []]],
  },
  { type: 'hr' },
] as BlogBlock[];

describe('blocksToDoc', () => {
  it('maps every server block type onto the editor schema', () => {
    const doc = blocksToDoc(blocks);
    expect(doc.type).toBe('doc');
    expect(doc.content?.map((n) => n.type)).toEqual([
      'heading',
      'paragraph',
      'bulletList',
      'callout',
      'blockquote',
      'codeBlock',
      'figure',
      'table',
      'horizontalRule',
    ]);
    const para = doc.content?.[1];
    expect(para?.content?.[1]).toEqual({ type: 'text', text: 'پررنگ', marks: [{ type: 'bold' }] });
    expect(para?.content?.[7]).toEqual({ type: 'text', text: 'پیوند', marks: [{ type: 'link', attrs: { href: '/blog/other' } }] });
    expect(para?.content?.[8]).toEqual({ type: 'hardBreak' });
    expect(doc.content?.[3].attrs).toEqual({ kind: 'tip' });
    expect(doc.content?.[6].attrs).toEqual({ src: 'https://cdn.example.com/a.png', alt: 'نمودار', caption: 'زیرنویس' });
    expect(doc.content?.[7].content?.[0].content?.[1].attrs).toMatchObject({ textAlign: 'center' });
  });
});

describe('docToMarkdown', () => {
  it('serialises to the server dialect', () => {
    const md = docToMarkdown(blocksToDoc(blocks));
    expect(md).toBe(
      [
        '## مقدمه',
        '',
        'متن **پررنگ** و *کج* و `x = 1` و [پیوند](/blog/other)\\',
        'خط دوم با نیم‌فاصله',
        '',
        '- یک',
        '- دو',
        '  1. دو-الف',
        '',
        '> [!TIP]',
        '>',
        '> نکته',
        '>',
        '> پاراگراف دوم',
        '',
        '> نقل‌قول',
        '',
        '```ts',
        'const a = 1;',
        'const b = `x`;',
        '```',
        '',
        '![نمودار](https://cdn.example.com/a.png "زیرنویس")',
        '',
        '| a | b | c |',
        '| :--- | :---: | --- |',
        '| 1\\|2 | **2** |   |',
        '',
        '---',
      ].join('\n'),
    );
  });

  it('keeps the ZWNJ (U+200C) untouched', () => {
    const md = docToMarkdown({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'می‌شود' }] }] });
    expect(md).toBe('می‌شود');
    expect(md.includes('\u200c')).toBe(true);
  });

  it('escapes text that would otherwise be read as markup', () => {
    const p = (text: string) => docToMarkdown({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
    expect(p('# not heading')).toBe('\\# not heading');
    expect(p('> not quote')).toBe('\\> not quote');
    expect(p('- not list')).toBe('\\- not list');
    expect(p('1. not list')).toBe('1\\. not list');
    expect(p('*a* _b_ `c` [d]')).toBe('\\*a\\* \\_b\\_ \\`c\\` \\[d\\]');
    expect(p('![img](x)')).toBe('\\!\\[img\\](x)');
    expect(escapeInline('a|b', true)).toBe('a\\|b');
  });

  it('moves emphasis markers inside surrounding whitespace and drops empty links', () => {
    const md = docToMarkdown({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: ' bold ', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'x' },
            { type: 'text', text: '  ', marks: [{ type: 'link', attrs: { href: 'https://e.com' } }] },
          ],
        },
      ],
    });
    // The whitespace-only link is dropped; the trailing blank is trimmed with the document.
    expect(md).toBe(' **bold** x');
  });

  it('clamps headings to H2–H4 and flattens lists deeper than one level', () => {
    const md = docToMarkdown({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Top' }] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
                {
                  type: 'bulletList',
                  content: [
                    {
                      type: 'listItem',
                      content: [
                        { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
                        {
                          type: 'bulletList',
                          content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'c' }] }] }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(md).toBe('## Top\n\n- a\n  - b\n  - c');
  });

  it('encodes unsafe characters in link and image targets and strips quotes from captions', () => {
    const md = docToMarkdown({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'go', marks: [{ type: 'link', attrs: { href: 'https://e.com/a b(c)' } }] }] },
        { type: 'figure', attrs: { src: 'https://e.com/i.png', alt: 'a]b', caption: 'say "hi"' } },
      ],
    });
    expect(md).toBe('[go](https://e.com/a%20b%28c%29)\n\n![a b](https://e.com/i.png "say ’hi’")');
  });
});
