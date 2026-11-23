import { renderBlogMarkdown } from '../../blog/domain/blog-markdown';
import { classifyHref, extractLinks } from './content-links';

describe('content-links — extraction', () => {
  it('collects links from paragraphs, headings, lists, quotes and tables with positions', () => {
    const md = [
      '## عنوان [لینک تیتر](/blog/a)',
      '',
      'متن با [لینک **پررنگ**](/agents/x) و [خارجی](https://example.org/p).',
      '',
      '- آیتم [داخل لیست](/blog/b)',
      '  - تو در تو [عمیق](/blog/c)',
      '',
      '> نقل [قول](/categories/ai)',
      '',
      '| a | b |',
      '|---|---|',
      '| [سلول](/blog/d) | x |',
    ].join('\n');
    const links = extractLinks(renderBlogMarkdown(md).blocks);
    expect(links.map((l) => [l.href, l.anchor, l.position])).toEqual([
      ['/blog/a', 'لینک تیتر', 0],
      ['/agents/x', 'لینک پررنگ', 1],
      ['https://example.org/p', 'خارجی', 1],
      ['/blog/b', 'داخل لیست', 2],
      ['/blog/c', 'عمیق', 2],
      ['/categories/ai', 'قول', 3],
      ['/blog/d', 'سلول', 4],
    ]);
  });
});

describe('content-links — classification', () => {
  const site = 'https://mesh.example';
  it('recognises posts, agents, routes, anchors and external URLs', () => {
    expect(classifyHref('/blog/my-post?utm=1#h', site)).toEqual({
      kind: 'post',
      slug: 'my-post',
    });
    expect(classifyHref('/blog/%D9%86%DB%8C%D8%A7%D8%B2', site)).toEqual({
      kind: 'post',
      slug: 'نیاز',
    });
    expect(classifyHref('/agents/invoice-sentinel', site)).toEqual({
      kind: 'agent',
      slug: 'invoice-sentinel',
    });
    expect(classifyHref('https://mesh.example/agents/x/', site)).toEqual({
      kind: 'agent',
      slug: 'x',
    });
    expect(classifyHref('https://other.example/agents/x', site)).toEqual({
      kind: 'external',
      url: 'https://other.example/agents/x',
    });
    expect(classifyHref('/categories/ai', site)).toEqual({
      kind: 'route',
      path: '/categories/ai',
    });
    expect(classifyHref('/blog/category/x', site)).toEqual({
      kind: 'route',
      path: '/blog/category/x',
    });
    expect(classifyHref('#section', site)).toEqual({ kind: 'anchor' });
    expect(classifyHref('mailto:a@b.c', site)).toEqual({
      kind: 'external',
      url: 'mailto:a@b.c',
    });
    expect(classifyHref('https://mesh.example/blog/p', null)).toEqual({
      kind: 'external',
      url: 'https://mesh.example/blog/p',
    });
  });
});
