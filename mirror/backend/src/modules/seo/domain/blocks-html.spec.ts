import { renderBlogMarkdown } from '../../blog/domain/blog-markdown';
import { blocksToHtml, escapeHtml, jsonForScript } from './blocks-html';

describe('blocks-html (public shell renderer)', () => {
  it('escapes every text node and attribute; unsafe URLs never become links', () => {
    const { blocks } = renderBlogMarkdown(
      [
        '## عنوان <b>bold</b>',
        '',
        'متن با [لینک](javascript:alert(1)) و [امن](/blog/x "t") و `code<tag>`.',
        '',
        '![alt "quoted"](https://cdn.example.com/a.png)',
        '',
        '| a | b |',
        '|---|---|',
        '| <x> | y |',
      ].join('\n'),
    );
    const html = blocksToHtml(blocks);
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<a href="/blog/x">امن</a>');
    expect(html).toContain('<code>code&lt;tag&gt;</code>');
    expect(html).toContain('alt="alt &quot;quoted&quot;"');
    expect(html).toContain('<td>&lt;x&gt;</td>');
    expect(html).toMatch(/<h2 id="[^"]+">/);
  });

  it('escapeHtml / jsonForScript neutralise breakouts', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;',
    );
    const json = jsonForScript({ a: '</script><script>alert(1)</script>' });
    expect(json).not.toContain('</script>');
    expect(JSON.parse(json)).toEqual({
      a: '</script><script>alert(1)</script>',
    });
  });
});
