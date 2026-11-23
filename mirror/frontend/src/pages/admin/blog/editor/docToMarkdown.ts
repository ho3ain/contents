import type { JSONContent } from '@tiptap/core';

/**
 * Content Studio — ProseMirror document → Markdown in the server dialect.
 *
 * The stored article body stays Markdown (`body_markdown`), parsed ONCE by the
 * server into the block tree every reader renders. This serializer is the
 * inverse of that parser for exactly the constructs the schema allows, so
 * save → reload is lossless for every structure the editor can produce:
 * headings (h2–h4), paragraphs, bold/italic/code/link marks, hard breaks,
 * lists with one nesting level, quotes, `[!NOTE|TIP|WARNING]` callouts,
 * fenced code, figures (`![alt](src "caption")`), GFM tables with alignment
 * and horizontal rules.
 */

type Mark = NonNullable<JSONContent['marks']>[number];
type Inline = JSONContent;

/** Backslash-escape every character that could start inline syntax. */
export function escapeInline(text: string, inTable = false): string {
  let out = text.replace(/([\\*_`[\]])/g, '\\$1').replace(/!(?=\\\[)/g, '\\!');
  if (inTable) out = out.replace(/\|/g, '\\|');
  return out;
}

/** A paragraph line must not look like a block marker. */
function escapeLineStart(line: string): string {
  if (/^(#{1,6}\s|>|[-*+]\s|(?:-{3,}|\*{3,}|_{3,})\s*$)/.test(line)) return `\\${line}`;
  // `1. x` → `1\. x` (the backslash escape is consumed by the inline parser).
  if (/^\d{1,3}[.)]\s/.test(line)) return line.replace(/^(\d{1,3})([.)])/, '$1\\$2');
  return line;
}

function hasMark(node: Inline, type: string): Mark | undefined {
  return node.marks?.find((m) => m.type === type);
}

function sameMark(a: Mark | undefined, b: Mark | undefined): boolean {
  if (!a || !b) return false;
  return a.type === b.type && JSON.stringify(a.attrs ?? {}) === JSON.stringify(b.attrs ?? {});
}

function withoutMark(node: Inline, type: string): Inline {
  return { ...node, marks: node.marks?.filter((m) => m.type !== type) };
}

const MARK_ORDER = ['link', 'bold', 'italic'] as const;

function codeSpan(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${text.replace(/\n/g, ' ')}${pad}${fence}`;
}

function linkHref(href: unknown): string {
  const raw = typeof href === 'string' ? href.trim() : '';
  // Spaces/parens/quotes would end the `(…)` target early.
  return raw.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/"/g, '%22');
}

/** Emphasis markers must hug non-space characters; move the edges outside. */
function wrapTrimmed(inner: string, marker: string): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
  if (!m || !m[2]) return inner;
  return `${m[1]}${marker}${m[2]}${marker}${m[3]}`;
}

function serializeInlines(nodes: Inline[], inTable: boolean): string {
  for (const type of MARK_ORDER) {
    const index = nodes.findIndex((n) => hasMark(n, type));
    if (index === -1) continue;
    const mark = hasMark(nodes[index], type);
    let end = index + 1;
    while (end < nodes.length && sameMark(hasMark(nodes[end], type), mark)) end += 1;
    const before = serializeInlines(nodes.slice(0, index), inTable);
    const inner = serializeInlines(
      nodes.slice(index, end).map((n) => withoutMark(n, type)),
      inTable,
    );
    const after = serializeInlines(nodes.slice(end), inTable);
    let wrapped: string;
    if (type === 'link') wrapped = inner.trim() ? `[${inner}](${linkHref(mark?.attrs?.href)})` : inner;
    else if (type === 'bold') wrapped = wrapTrimmed(inner, '**');
    else wrapped = wrapTrimmed(inner, '*');
    return `${before}${wrapped}${after}`;
  }
  return nodes
    .map((n) => {
      if (n.type === 'hardBreak') return inTable ? ' ' : '\\\n';
      if (n.type !== 'text') return '';
      const text = n.text ?? '';
      if (hasMark(n, 'code')) return codeSpan(text);
      return escapeInline(text, inTable);
    })
    .join('');
}

/** Inline content of a textblock; multi-line output escapes each line start. */
function textblock(node: JSONContent, inTable = false): string {
  const raw = serializeInlines(node.content ?? [], inTable);
  if (inTable) return raw.replace(/\s*\n\s*/g, ' ').trim();
  return raw.split('\n').map(escapeLineStart).join('\n');
}

function listItems(node: JSONContent, ordered: boolean, depth: number): string[] {
  const indent = '  '.repeat(depth);
  const lines: string[] = [];
  let n = 0;
  for (const item of node.content ?? []) {
    if (item.type !== 'listItem') continue;
    n += 1;
    const marker = ordered ? `${n}.` : '-';
    const paragraphs = (item.content ?? []).filter((c) => c.type === 'paragraph');
    const nested = (item.content ?? []).filter((c) => c.type === 'bulletList' || c.type === 'orderedList');
    // One textblock per item in the server dialect: extra paragraphs continue the item.
    const text = paragraphs
      .map((p) => serializeInlines(p.content ?? [], false))
      .filter((s) => s.length)
      .join('\\\n');
    const [first = '', ...rest] = text.split('\n');
    lines.push(`${indent}${marker} ${first}`);
    for (const line of rest) lines.push(`${indent}  ${line}`);
    // Deeper nesting than one level is flattened to the nested level (server rule).
    for (const sub of nested) lines.push(...listItems(sub, sub.type === 'orderedList', Math.min(depth + 1, 1)));
  }
  return lines;
}

function quoteBody(node: JSONContent, kind: string | null): string {
  const paragraphs = (node.content ?? []).map((p) => textblock(p));
  const lines: string[] = [];
  if (kind) lines.push(`> [!${kind.toUpperCase()}]`);
  paragraphs.forEach((p, i) => {
    if (i > 0 || kind) lines.push('>');
    for (const line of p.split('\n')) lines.push(`> ${line}`);
  });
  return lines.join('\n');
}

function codeBlock(node: JSONContent): string {
  const code = (node.content ?? []).map((c) => c.text ?? '').join('');
  const longest = Math.max(2, ...[...code.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(longest + 1);
  const lang = typeof node.attrs?.language === 'string' ? node.attrs.language.replace(/[^\w+-]/g, '').slice(0, 20) : '';
  return `${fence}${lang}\n${code}\n${fence}`;
}

function figure(node: JSONContent): string {
  const src = typeof node.attrs?.src === 'string' ? node.attrs.src.trim() : '';
  if (!src) return '';
  const alt = (typeof node.attrs?.alt === 'string' ? node.attrs.alt : '').replace(/[\]\n]/g, ' ').trim();
  const caption = (typeof node.attrs?.caption === 'string' ? node.attrs.caption : '').replace(/["\n]/g, '’').trim();
  return `![${alt}](${src.replace(/ /g, '%20').replace(/\)/g, '%29')}${caption ? ` "${caption}"` : ''})`;
}

function table(node: JSONContent): string {
  const rows = (node.content ?? []).filter((r) => r.type === 'tableRow');
  if (!rows.length) return '';
  const cellText = (cell: JSONContent) =>
    (cell.content ?? [])
      .map((p) => textblock(p, true))
      .filter(Boolean)
      .join(' ') || ' ';
  const header = rows[0].content ?? [];
  const width = header.length;
  if (!width) return '';
  const align = header.map((c) => {
    const a = c.attrs?.textAlign;
    return a === 'left' || a === 'center' || a === 'right' ? a : null;
  });
  const sep = align.map((a) => (a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---'));
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
  const out = [line(header.map(cellText)), line(sep)];
  for (const row of rows.slice(1)) {
    const cells = (row.content ?? []).slice(0, width).map(cellText);
    while (cells.length < width) cells.push(' ');
    out.push(line(cells));
  }
  return out.join('\n');
}

export function nodeToMarkdown(node: JSONContent): string {
  switch (node.type) {
    case 'heading': {
      const level = Math.min(4, Math.max(2, Number(node.attrs?.level ?? 2)));
      const text = textblock(node).replace(/\\\n/g, ' ').trim();
      return text ? `${'#'.repeat(level)} ${text}` : '';
    }
    case 'paragraph':
      return textblock(node);
    case 'bulletList':
      return listItems(node, false, 0).join('\n');
    case 'orderedList':
      return listItems(node, true, 0).join('\n');
    case 'blockquote':
      return quoteBody(node, null);
    case 'callout':
      return quoteBody(node, typeof node.attrs?.kind === 'string' ? node.attrs.kind : 'note');
    case 'codeBlock':
      return codeBlock(node);
    case 'figure':
      return figure(node);
    case 'table':
      return table(node);
    case 'horizontalRule':
      return '---';
    default:
      return '';
  }
}

/** Whole document → Markdown; blocks are separated by one blank line. */
export function docToMarkdown(doc: JSONContent): string {
  return (doc.content ?? [])
    .map(nodeToMarkdown)
    .filter((s) => s.trim().length)
    .join('\n\n')
    .trimEnd();
}
