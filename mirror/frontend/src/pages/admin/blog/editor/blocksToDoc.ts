import type { JSONContent } from '@tiptap/core';
import type { BlogBlock, BlogInline, BlogListItem } from '../../../../api/blog';

/**
 * Content Studio — server block tree → ProseMirror document.
 *
 * The editor never parses Markdown itself: the SAME server parser that runs
 * at save time (`POST /admin/blog/render`) produces the block tree, and this
 * module maps it 1:1 onto the Tiptap schema in `extensions.ts`. Everything
 * the server cannot express cannot appear here either, so the editor's
 * document is by construction a valid article body.
 */

const CALLOUT_KINDS = new Set(['note', 'tip', 'warning']);

function inlines(nodes: BlogInline[], marks: JSONContent['marks'] = []): JSONContent[] {
  const out: JSONContent[] = [];
  for (const n of nodes) {
    switch (n.t) {
      case 'text':
        if (n.v) out.push({ type: 'text', text: n.v, ...(marks.length ? { marks } : {}) });
        break;
      case 'strong':
        out.push(...inlines(n.c, [...marks, { type: 'bold' }]));
        break;
      case 'em':
        out.push(...inlines(n.c, [...marks, { type: 'italic' }]));
        break;
      case 'code':
        if (n.v) out.push({ type: 'text', text: n.v, marks: [...marks, { type: 'code' }] });
        break;
      case 'link':
        out.push(...inlines(n.c, [...marks, { type: 'link', attrs: { href: n.href } }]));
        break;
      case 'br':
        out.push({ type: 'hardBreak' });
        break;
    }
  }
  return out;
}

function paragraph(c: BlogInline[]): JSONContent {
  const content = inlines(c);
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
}

function listItem(item: BlogListItem): JSONContent {
  const content: JSONContent[] = [paragraph(item.c)];
  if (item.children?.items.length) content.push(list(item.children.ordered, item.children.items));
  return { type: 'listItem', content };
}

function list(ordered: boolean, items: BlogListItem[]): JSONContent {
  return { type: ordered ? 'orderedList' : 'bulletList', content: items.map(listItem) };
}

function cell(type: 'tableHeader' | 'tableCell', c: BlogInline[], align: 'left' | 'center' | 'right' | null): JSONContent {
  return { type, attrs: { textAlign: align }, content: [paragraph(c)] };
}

export function blockToNode(block: BlogBlock): JSONContent {
  switch (block.type) {
    case 'heading':
      return { type: 'heading', attrs: { level: block.level }, content: inlines(block.c) };
    case 'paragraph':
      return paragraph(block.c);
    case 'list':
      return list(block.ordered, block.items);
    case 'quote': {
      const paragraphs = block.paragraphs.length ? block.paragraphs.map(paragraph) : [{ type: 'paragraph' }];
      if (block.kind && CALLOUT_KINDS.has(block.kind)) return { type: 'callout', attrs: { kind: block.kind }, content: paragraphs };
      return { type: 'blockquote', content: paragraphs };
    }
    case 'code':
      return {
        type: 'codeBlock',
        attrs: { language: block.lang },
        ...(block.code ? { content: [{ type: 'text', text: block.code }] } : {}),
      };
    case 'image':
      return { type: 'figure', attrs: { src: block.src, alt: block.alt, caption: block.caption } };
    case 'table': {
      const align = (i: number) => block.align[i] ?? null;
      const rows: JSONContent[] = [
        { type: 'tableRow', content: block.header.map((c, i) => cell('tableHeader', c, align(i))) },
        ...block.rows.map((r) => ({ type: 'tableRow', content: r.map((c, i) => cell('tableCell', c, align(i))) })),
      ];
      return { type: 'table', content: rows };
    }
    case 'hr':
      return { type: 'horizontalRule' };
  }
}

/** Whole document; an empty article is a single empty paragraph (ProseMirror needs ≥1 block). */
export function blocksToDoc(blocks: BlogBlock[]): JSONContent {
  const content = blocks.map(blockToNode);
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}
