import type {
  BlogBlock,
  BlogInline,
  BlogListItem,
} from '../../blog/domain/blog-markdown';
import { safeUrl } from '../../blog/domain/blog-markdown';

/**
 * Server-side HTML for the public shell renderer. The block tree already
 * contains no HTML (see blog-markdown.ts), so escaping every text node and
 * attribute is sufficient — there is no sanitiser step to forget.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** For `<script type="application/ld+json">`: prevents `</script>` breakouts. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function inlines(nodes: BlogInline[]): string {
  return nodes
    .map((n) => {
      switch (n.t) {
        case 'text':
          return escapeHtml(n.v);
        case 'strong':
          return `<strong>${inlines(n.c)}</strong>`;
        case 'em':
          return `<em>${inlines(n.c)}</em>`;
        case 'code':
          return `<code>${escapeHtml(n.v)}</code>`;
        case 'br':
          return '<br/>';
        case 'link': {
          const href = safeUrl(n.href);
          if (!href) return inlines(n.c);
          const external = /^https?:\/\//i.test(href);
          return `<a href="${escapeHtml(href)}"${external ? ' rel="noopener"' : ''}>${inlines(n.c)}</a>`;
        }
        default:
          return '';
      }
    })
    .join('');
}

function items(list: { ordered: boolean; items: BlogListItem[] }): string {
  const tag = list.ordered ? 'ol' : 'ul';
  return `<${tag}>${list.items
    .map(
      (it) =>
        `<li>${inlines(it.c)}${it.children ? items(it.children) : ''}</li>`,
    )
    .join('')}</${tag}>`;
}

export function blocksToHtml(blocks: BlogBlock[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case 'heading':
          return `<h${b.level} id="${escapeHtml(b.id)}">${inlines(b.c)}</h${b.level}>`;
        case 'paragraph':
          return `<p>${inlines(b.c)}</p>`;
        case 'list':
          return items(b);
        case 'quote':
          return `<blockquote${b.kind ? ` data-kind="${b.kind}"` : ''}>${b.paragraphs
            .map((p) => `<p>${inlines(p)}</p>`)
            .join('')}</blockquote>`;
        case 'code':
          return `<pre><code${b.lang ? ` class="language-${escapeHtml(b.lang)}"` : ''}>${escapeHtml(b.code)}</code></pre>`;
        case 'image': {
          const src = safeUrl(b.src);
          if (!src) return '';
          const img = `<img src="${escapeHtml(src)}" alt="${escapeHtml(b.alt)}" loading="lazy"/>`;
          return b.caption
            ? `<figure>${img}<figcaption>${escapeHtml(b.caption)}</figcaption></figure>`
            : img;
        }
        case 'table': {
          const cell = (tag: 'th' | 'td', c: BlogInline[], i: number) =>
            `<${tag}${b.align[i] ? ` style="text-align:${b.align[i]}"` : ''}>${inlines(c)}</${tag}>`;
          return `<table><thead><tr>${b.header.map((c, i) => cell('th', c, i)).join('')}</tr></thead><tbody>${b.rows
            .map(
              (r) => `<tr>${r.map((c, i) => cell('td', c, i)).join('')}</tr>`,
            )
            .join('')}</tbody></table>`;
        }
        case 'hr':
          return '<hr/>';
        default:
          return '';
      }
    })
    .join('\n');
}
