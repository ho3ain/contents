import type { BlogBlock, BlogInline, BlogListItem, BlogTocEntry } from '../api/blog';

/**
 * Sprint 1 — a deliberately small Markdown subset for content that ships WITH
 * the frontend (legal documents, documentation center). It produces the same
 * block tree the blog renderer (`BlogBlocks`) already understands, so one
 * renderer, one stylesheet and one accessibility review cover blog articles,
 * legal pages and docs alike — no HTML strings, no new dependency.
 *
 * Supported (everything else is a paragraph):
 *   ## / ### / #### headings      → heading (ids derived from the text)
 *   - item / 1. item               → list (one nesting level via 2-space indent)
 *   > text                         → quote; `> [!note]` / `[!tip]` / `[!warning]` → callout
 *   ```lang … ```                  → code
 *   | a | b |  (+ `|---|---|`)     → table
 *   ---                            → hr
 *   inline: **strong**, *em*, `code`, [text](href)
 */
export interface ParsedDocument {
  blocks: BlogBlock[];
  toc: BlogTocEntry[];
  /** Plain text (for search indexing). */
  text: string;
}

const INLINE_TOKEN = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

export function parseInline(source: string): BlogInline[] {
  const out: BlogInline[] = [];
  let last = 0;
  for (const match of source.matchAll(INLINE_TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) out.push({ t: 'text', v: source.slice(last, index) });
    const token = match[0];
    if (token.startsWith('**')) out.push({ t: 'strong', c: parseInline(token.slice(2, -2)) });
    else if (token.startsWith('`')) out.push({ t: 'code', v: token.slice(1, -1) });
    else if (token.startsWith('[')) {
      const close = token.indexOf('](');
      out.push({ t: 'link', href: token.slice(close + 2, -1), c: parseInline(token.slice(1, close)) });
    } else out.push({ t: 'em', c: parseInline(token.slice(1, -1)) });
    last = index + token.length;
  }
  if (last < source.length) out.push({ t: 'text', v: source.slice(last) });
  return out;
}

export function inlineText(nodes: BlogInline[]): string {
  return nodes
    .map((node) => {
      switch (node.t) {
        case 'text':
        case 'code':
          return node.v;
        case 'br':
          return ' ';
        default:
          return inlineText(node.c);
      }
    })
    .join('');
}

/** Stable, URL-safe heading ids for Persian and Latin text alike. */
export function slugifyHeading(text: string, used: Set<string>): string {
  const base =
    text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'section';
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

const CALLOUT = /^\[!(note|tip|warning)\]\s*/i;

export function parseMarkdownLite(source: string): ParsedDocument {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: BlogBlock[] = [];
  const toc: BlogTocEntry[] = [];
  const used = new Set<string>();
  const text: string[] = [];
  let i = 0;

  const flushParagraph = (buffer: string[]) => {
    if (!buffer.length) return;
    const joined = buffer.join(' ').trim();
    if (!joined) return;
    const c = parseInline(joined);
    blocks.push({ type: 'paragraph', c });
    text.push(inlineText(c));
    buffer.length = 0;
  };

  const paragraph: string[] = [];
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph(paragraph);
      i += 1;
      continue;
    }

    const heading = /^(#{2,4})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph(paragraph);
      const level = heading[1].length as 2 | 3 | 4;
      const c = parseInline(heading[2].trim());
      const plain = inlineText(c);
      const id = slugifyHeading(plain, used);
      blocks.push({ type: 'heading', level, id, text: plain, c });
      toc.push({ id, text: plain, level });
      text.push(plain);
      i += 1;
      continue;
    }

    if (trimmed === '---') {
      flushParagraph(paragraph);
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      flushParagraph(paragraph);
      const lang = trimmed.slice(3).trim() || null;
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence
      blocks.push({ type: 'code', lang, code: code.join('\n') });
      text.push(code.join(' '));
      continue;
    }

    if (trimmed.startsWith('>')) {
      flushParagraph(paragraph);
      const quoted: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoted.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      let kind: 'note' | 'tip' | 'warning' | null = null;
      const first = quoted[0] ?? '';
      const m = CALLOUT.exec(first);
      if (m) {
        kind = m[1].toLowerCase() as 'note' | 'tip' | 'warning';
        quoted[0] = first.replace(CALLOUT, '');
      }
      const paragraphs = quoted
        .join('\n')
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\n/g, ' ').trim())
        .filter(Boolean)
        .map(parseInline);
      blocks.push({ type: 'quote', kind, paragraphs });
      text.push(paragraphs.map(inlineText).join(' '));
      continue;
    }

    if (trimmed.startsWith('|')) {
      flushParagraph(paragraph);
      const rowsRaw: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rowsRaw.push(lines[i].trim());
        i += 1;
      }
      const cells = (row: string) =>
        row
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim());
      const header = cells(rowsRaw[0]).map(parseInline);
      const hasDivider = rowsRaw[1] !== undefined && /^\|?\s*:?-{2,}/.test(rowsRaw[1]);
      const align = hasDivider
        ? cells(rowsRaw[1]).map((cell) => {
            const left = cell.startsWith(':');
            const right = cell.endsWith(':');
            return left && right ? 'center' : right ? 'right' : left ? 'left' : null;
          })
        : header.map(() => null);
      const rows = rowsRaw.slice(hasDivider ? 2 : 1).map((row) => cells(row).map(parseInline));
      blocks.push({ type: 'table', align, header, rows });
      text.push([...header, ...rows.flat()].map(inlineText).join(' '));
      continue;
    }

    const listMatch = /^(\s*)([-*]|\d+\.)\s+(.+)$/.exec(line);
    if (listMatch && listMatch[1].length === 0) {
      flushParagraph(paragraph);
      const ordered = /\d/.test(listMatch[2]);
      const items: BlogListItem[] = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*]|\d+\.)\s+(.+)$/.exec(lines[i]);
        if (!m) break;
        const depth = m[1].length;
        const item: BlogListItem = { c: parseInline(m[3].trim()) };
        text.push(inlineText(item.c));
        if (depth === 0) items.push(item);
        else {
          const parent = items[items.length - 1];
          if (!parent) break;
          parent.children ??= { ordered: /\d/.test(m[2]), items: [] };
          parent.children.items.push(item);
        }
        i += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    paragraph.push(trimmed);
    i += 1;
  }
  flushParagraph(paragraph);
  return { blocks, toc, text: text.join(' \n ') };
}
