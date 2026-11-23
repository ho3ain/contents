/**
 * Blog platform — structured article body.
 *
 * Authors write a small, well-defined Markdown subset; the server parses it
 * ONCE at save time into a JSON block tree that the public API returns and the
 * frontend renders as React elements. There is deliberately no HTML anywhere
 * in the pipeline: raw HTML in the source is plain text, every URL goes
 * through {@link safeUrl}, and the stored tree can only contain the node
 * kinds below — so the renderer never needs `dangerouslySetInnerHTML` and no
 * sanitizer dependency is required.
 *
 * Supported syntax: ATX headings (## … ####; a single `#` is demoted to h2
 * because the article title is the page's h1), paragraphs, **bold**, *italic*,
 * `code`, [links](url), ![images](url "caption"), ordered / unordered lists
 * (one nesting level), > quotes with optional `[!NOTE]` / `[!TIP]` /
 * `[!WARNING]` callout markers, ``` fenced code, GFM pipe tables, `---` rules
 * and hard line breaks (two trailing spaces or a trailing backslash).
 */

export type BlogInline =
  | { t: 'text'; v: string }
  | { t: 'strong'; c: BlogInline[] }
  | { t: 'em'; c: BlogInline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: BlogInline[] }
  | { t: 'br' };

export type BlogCalloutKind = 'note' | 'tip' | 'warning';

export interface BlogListItem {
  c: BlogInline[];
  children?: { ordered: boolean; items: BlogListItem[] };
}

export type BlogBlock =
  | {
      type: 'heading';
      level: 2 | 3 | 4;
      id: string;
      text: string;
      c: BlogInline[];
    }
  | { type: 'paragraph'; c: BlogInline[] }
  | { type: 'list'; ordered: boolean; items: BlogListItem[] }
  | { type: 'quote'; kind: BlogCalloutKind | null; paragraphs: BlogInline[][] }
  | { type: 'code'; lang: string | null; code: string }
  | { type: 'image'; src: string; alt: string; caption: string | null }
  | {
      type: 'table';
      align: Array<'left' | 'center' | 'right' | null>;
      header: BlogInline[][];
      rows: BlogInline[][][];
    }
  | { type: 'hr' };

export interface BlogTocEntry {
  id: string;
  text: string;
  level: 2 | 3 | 4;
}

export type BlogContentWarningCode =
  | 'unsafe_url'
  | 'image_without_alt'
  | 'empty_heading'
  | 'heading_level_skipped'
  | 'h1_demoted';

export interface BlogContentWarning {
  code: BlogContentWarningCode;
  line: number;
  detail?: string;
}

export interface BlogRenderedBody {
  blocks: BlogBlock[];
  toc: BlogTocEntry[];
  plainText: string;
  wordCount: number;
  readingMinutes: number;
  warnings: BlogContentWarning[];
}

/** Average silent-reading speed used for the computed reading time (words/min). */
export const READING_WORDS_PER_MINUTE = 200;

/** Upper bound of a stored body (characters of Markdown source). */
export const BLOG_BODY_MAX_CHARS = 120_000;

const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];

/**
 * Returns the URL if it is safe to emit as a link/image target, else null.
 * Accepts absolute http(s)/mailto/tel URLs, site-relative paths (`/x`, but not
 * protocol-relative `//x`), and in-page anchors (`#id`).
 */
export function safeUrl(raw: string): string | null {
  const url = raw.trim();
  // eslint-disable-next-line no-control-regex -- control characters are exactly what we refuse
  if (!url || /[\u0000-\u001f\u007f]/.test(url)) return null;
  if (url.startsWith('#')) return /^#[\p{L}\p{N}_-]+$/u.test(url) ? url : null;
  if (url.startsWith('/')) return url.startsWith('//') ? null : url;
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Unicode-aware anchor id (Persian headings keep their letters). */
export function headingAnchor(text: string): string {
  const base = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u200c\u200d]/g, '-') // ZWNJ/ZWJ → separator, keeps words apart
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base;
}

export function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}]+/gu);
  return matches ? matches.length : 0;
}

export function readingMinutesFor(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / READING_WORDS_PER_MINUTE));
}

// ---------------------------------------------------------------------------
// Inline parsing
// ---------------------------------------------------------------------------

interface InlineCtx {
  line: number;
  warnings: BlogContentWarning[];
}

function pushText(out: BlogInline[], text: string): void {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.t === 'text') last.v += text;
  else out.push({ t: 'text', v: text });
}

/** Finds the matching `]` for a `[` at `start`, honouring nesting and escapes. */
function findClosingBracket(src: string, start: number): number {
  let depth = 0;
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Parses `(url "title")` starting at `start` (the `(`). */
function parseLinkTarget(
  src: string,
  start: number,
): { href: string; title: string | null; end: number } | null {
  if (src[start] !== '(') return null;
  let i = start + 1;
  let depth = 1;
  let body = '';
  for (; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '\\' && i + 1 < src.length) {
      body += src[i + 1];
      i += 1;
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
    if (ch === '\n') return null;
    body += ch;
  }
  if (depth !== 0) return null;
  const trimmed = body.trim();
  const m = /^(\S*)(?:\s+"([^"]*)")?$/.exec(trimmed);
  if (!m) return null;
  return { href: m[1], title: m[2] ?? null, end: i + 1 };
}

function parseEmphasis(
  src: string,
  i: number,
  ctx: InlineCtx,
): { node: BlogInline; end: number } | null {
  const ch = src[i];
  if (ch !== '*' && ch !== '_') return null;
  const double = src[i + 1] === ch;
  const marker = double ? ch + ch : ch;
  const start = i + marker.length;
  if (start >= src.length || /\s/.test(src[start])) return null;
  // `_` must not start inside a word (snake_case_identifiers).
  if (ch === '_' && i > 0 && /[\p{L}\p{N}]/u.test(src[i - 1])) return null;
  let j = start;
  while (j < src.length) {
    if (src[j] === '\\') {
      j += 2;
      continue;
    }
    if (src[j] === '`') {
      const close = src.indexOf('`', j + 1);
      if (close === -1) break;
      j = close + 1;
      continue;
    }
    if (src.startsWith(marker, j) && !/\s/.test(src[j - 1])) {
      const after = src[j + marker.length];
      if (ch === '_' && after && /[\p{L}\p{N}]/u.test(after)) {
        j += 1;
        continue;
      }
      const inner = src.slice(start, j);
      if (!inner.trim()) return null;
      return {
        node: { t: double ? 'strong' : 'em', c: parseInlines(inner, ctx) },
        end: j + marker.length,
      };
    }
    j += 1;
  }
  return null;
}

export function parseInlines(src: string, ctx: InlineCtx): BlogInline[] {
  const out: BlogInline[] = [];
  let i = 0;
  let buf = '';
  const flush = () => {
    pushText(out, buf);
    buf = '';
  };
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\' && i + 1 < src.length) {
      if (src[i + 1] === '\n') {
        flush();
        out.push({ t: 'br' });
        i += 2;
        continue;
      }
      buf += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === '\n') {
      // Hard break when the previous line ends with two spaces.
      if (buf.endsWith('  ')) {
        buf = buf.replace(/ +$/, '');
        flush();
        out.push({ t: 'br' });
      } else {
        buf += ' ';
      }
      i += 1;
      continue;
    }
    if (ch === '`') {
      const run = /^`+/.exec(src.slice(i))?.[0] ?? '`';
      const close = src.indexOf(run, i + run.length);
      if (close !== -1) {
        flush();
        out.push({
          t: 'code',
          v: src
            .slice(i + run.length, close)
            .replace(/\n/g, ' ')
            .trim(),
        });
        i = close + run.length;
        continue;
      }
    }
    if (ch === '!' && src[i + 1] === '[') {
      const close = findClosingBracket(src, i + 1);
      const target = close !== -1 ? parseLinkTarget(src, close + 1) : null;
      if (target) {
        flush();
        const href = safeUrl(target.href);
        const alt = src.slice(i + 2, close);
        if (href) {
          out.push({ t: 'link', href, c: [{ t: 'text', v: alt || href }] });
        } else {
          ctx.warnings.push({
            code: 'unsafe_url',
            line: ctx.line,
            detail: target.href,
          });
          pushText(out, alt);
        }
        i = target.end;
        continue;
      }
    }
    if (ch === '[') {
      const close = findClosingBracket(src, i);
      const target = close !== -1 ? parseLinkTarget(src, close + 1) : null;
      if (target) {
        flush();
        const href = safeUrl(target.href);
        const inner = parseInlines(src.slice(i + 1, close), ctx);
        if (href) out.push({ t: 'link', href, c: inner });
        else {
          ctx.warnings.push({
            code: 'unsafe_url',
            line: ctx.line,
            detail: target.href,
          });
          for (const node of inner) {
            if (node.t === 'text') pushText(out, node.v);
            else out.push(node);
          }
        }
        i = target.end;
        continue;
      }
    }
    if (ch === '*' || ch === '_') {
      const em = parseEmphasis(src, i, ctx);
      if (em) {
        flush();
        out.push(em.node);
        i = em.end;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

export function inlineText(nodes: BlogInline[]): string {
  return nodes
    .map((n) => {
      switch (n.t) {
        case 'text':
        case 'code':
          return n.v;
        case 'br':
          return ' ';
        default:
          return inlineText(n.c);
      }
    })
    .join('');
}

// ---------------------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------------------

const FENCE_RE = /^(`{3,}|~{3,})\s*([\w+-]*)\s*$/;
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR_RE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;
const UL_RE = /^(\s*)[-*+]\s+(.*)$/;
const OL_RE = /^(\s*)\d{1,3}[.)]\s+(.*)$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
const IMAGE_LINE_RE = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*$/;
const CALLOUT_RE = /^\[!(NOTE|TIP|WARNING)\]\s*$/i;

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cur += '|';
      i += 1;
    } else if (s[i] === '|') {
      cells.push(cur.trim());
      cur = '';
    } else cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

function parseList(
  lines: string[],
  start: number,
  baseIndent: number,
  ctx: InlineCtx,
): { block: Extract<BlogBlock, { type: 'list' }>; end: number } {
  const ordered = OL_RE.test(lines[start]);
  const items: BlogListItem[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    const m = UL_RE.exec(line) ?? OL_RE.exec(line);
    if (!m) break;
    const indent = m[1].length;
    if (indent < baseIndent) break;
    if (indent > baseIndent) {
      // Nested list → attached to the previous item (one level only; deeper
      // lines are flattened into that level).
      const parent = items[items.length - 1];
      if (!parent) break;
      const nested = parseList(lines, i, indent, {
        ...ctx,
        line: ctx.line + i - start,
      });
      parent.children = {
        ordered: nested.block.ordered,
        items: nested.block.items,
      };
      i = nested.end;
      continue;
    }
    // A marker switch (- → 1.) at the same indent starts a new list.
    if (OL_RE.test(line) !== ordered) break;
    // Lazy continuation lines (indented plain text) belong to the item.
    let text = m[2];
    let j = i + 1;
    while (
      j < lines.length &&
      lines[j].trim() &&
      !UL_RE.test(lines[j]) &&
      !OL_RE.test(lines[j]) &&
      /^\s{2,}/.test(lines[j])
    ) {
      text += `\n${lines[j].trim()}`;
      j += 1;
    }
    items.push({
      c: parseInlines(text, { ...ctx, line: ctx.line + i - start }),
    });
    i = j;
  }
  return { block: { type: 'list', ordered, items }, end: i };
}

function parseQuote(
  lines: string[],
  start: number,
  ctx: InlineCtx,
): { block: Extract<BlogBlock, { type: 'quote' }>; end: number } {
  const inner: string[] = [];
  let i = start;
  while (i < lines.length && /^\s*>/.test(lines[i])) {
    inner.push(lines[i].replace(/^\s*>\s?/, ''));
    i += 1;
  }
  let kind: BlogCalloutKind | null = null;
  const marker = CALLOUT_RE.exec(inner[0] ?? '');
  if (marker) {
    kind = marker[1].toLowerCase() as BlogCalloutKind;
    inner.shift();
  }
  const paragraphs: BlogInline[][] = [];
  let buf: string[] = [];
  const flushPara = () => {
    if (buf.length) paragraphs.push(parseInlines(buf.join('\n'), ctx));
    buf = [];
  };
  for (const l of inner) {
    if (!l.trim()) flushPara();
    else buf.push(l);
  }
  flushPara();
  return { block: { type: 'quote', kind, paragraphs }, end: i };
}

/**
 * Parses Markdown source into the block tree plus derived metadata. Pure and
 * deterministic: the same source always yields the same ids and counts.
 */
export function renderBlogMarkdown(source: string): BlogRenderedBody {
  const warnings: BlogContentWarning[] = [];
  const blocks: BlogBlock[] = [];
  const toc: BlogTocEntry[] = [];
  const usedIds = new Map<string, number>();
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  let paragraph: string[] = [];
  let paragraphLine = 0;
  let lastHeadingLevel = 1;

  const ctxAt = (line: number): InlineCtx => ({ line: line + 1, warnings });

  const uniqueId = (base: string, fallback: string): string => {
    const root = base || fallback;
    const n = usedIds.get(root) ?? 0;
    usedIds.set(root, n + 1);
    return n === 0 ? root : `${root}-${n + 1}`;
  };

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join('\n');
    paragraph = [];
    const img = IMAGE_LINE_RE.exec(text.trim());
    if (img) {
      const src = safeUrl(img[2]);
      if (!src) {
        warnings.push({
          code: 'unsafe_url',
          line: paragraphLine + 1,
          detail: img[2],
        });
        return;
      }
      const alt = img[1].trim();
      if (!alt)
        warnings.push({
          code: 'image_without_alt',
          line: paragraphLine + 1,
          detail: src,
        });
      blocks.push({ type: 'image', src, alt, caption: img[3]?.trim() || null });
      return;
    }
    const c = parseInlines(text, ctxAt(paragraphLine));
    if (c.length) blocks.push({ type: 'paragraph', c });
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      i += 1;
      continue;
    }

    const fence = FENCE_RE.exec(trimmed);
    if (fence) {
      flushParagraph();
      const marker = fence[1];
      const lang = fence[2] ? fence[2].toLowerCase().slice(0, 20) : null;
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(marker)) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence (or EOF)
      blocks.push({ type: 'code', lang, code: code.join('\n') });
      continue;
    }

    const heading = HEADING_RE.exec(trimmed);
    if (heading) {
      flushParagraph();
      let level = heading[1].length;
      if (level === 1) {
        warnings.push({ code: 'h1_demoted', line: i + 1 });
        level = 2;
      }
      if (level > 4) level = 4;
      if (level > lastHeadingLevel + 1 && lastHeadingLevel >= 2) {
        warnings.push({ code: 'heading_level_skipped', line: i + 1 });
      }
      lastHeadingLevel = level;
      const c = parseInlines(heading[2], ctxAt(i));
      const text = inlineText(c).trim();
      if (!text) {
        warnings.push({ code: 'empty_heading', line: i + 1 });
        i += 1;
        continue;
      }
      const id = uniqueId(headingAnchor(text), `section-${toc.length + 1}`);
      blocks.push({ type: 'heading', level: level as 2 | 3 | 4, id, text, c });
      toc.push({ id, text, level: level as 2 | 3 | 4 });
      i += 1;
      continue;
    }

    if (HR_RE.test(trimmed) && !paragraph.length) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    if (/^\s*>/.test(line)) {
      flushParagraph();
      const q = parseQuote(lines, i, ctxAt(i));
      blocks.push(q.block);
      i = q.end;
      continue;
    }

    if ((UL_RE.test(line) || OL_RE.test(line)) && !HR_RE.test(trimmed)) {
      flushParagraph();
      const m = UL_RE.exec(line) ?? OL_RE.exec(line);
      const l = parseList(lines, i, m ? m[1].length : 0, ctxAt(i));
      blocks.push(l.block);
      i = l.end;
      continue;
    }

    // GFM table: header row, separator row, body rows.
    if (
      trimmed.includes('|') &&
      i + 1 < lines.length &&
      TABLE_SEP_RE.test(lines[i + 1])
    ) {
      flushParagraph();
      const header = splitTableRow(line).map((cell) =>
        parseInlines(cell, ctxAt(i)),
      );
      const align = splitTableRow(lines[i + 1]).map((cell) => {
        const left = cell.startsWith(':');
        const right = cell.endsWith(':');
        if (left && right) return 'center' as const;
        if (right) return 'right' as const;
        if (left) return 'left' as const;
        return null;
      });
      const rows: BlogInline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        const cells = splitTableRow(lines[i]);
        while (cells.length < header.length) cells.push('');
        rows.push(
          cells
            .slice(0, header.length)
            .map((cell) => parseInlines(cell, ctxAt(i))),
        );
        i += 1;
      }
      while (align.length < header.length) align.push(null);
      blocks.push({
        type: 'table',
        align: align.slice(0, header.length),
        header,
        rows,
      });
      continue;
    }

    if (!paragraph.length) paragraphLine = i;
    paragraph.push(line);
    i += 1;
  }
  flushParagraph();

  const plainText = blocksPlainText(blocks);
  const wordCount = countWords(plainText);
  return {
    blocks,
    toc,
    plainText,
    wordCount,
    readingMinutes: readingMinutesFor(wordCount),
    warnings,
  };
}

export function blocksPlainText(blocks: BlogBlock[]): string {
  const parts: string[] = [];
  const listText = (items: BlogListItem[]): void => {
    for (const item of items) {
      parts.push(inlineText(item.c));
      if (item.children) listText(item.children.items);
    }
  };
  for (const b of blocks) {
    switch (b.type) {
      case 'heading':
        parts.push(b.text);
        break;
      case 'paragraph':
        parts.push(inlineText(b.c));
        break;
      case 'list':
        listText(b.items);
        break;
      case 'quote':
        b.paragraphs.forEach((p) => parts.push(inlineText(p)));
        break;
      case 'code':
        parts.push(b.code);
        break;
      case 'image':
        parts.push(b.alt, b.caption ?? '');
        break;
      case 'table':
        b.header.forEach((c) => parts.push(inlineText(c)));
        b.rows.forEach((r) => r.forEach((c) => parts.push(inlineText(c))));
        break;
      default:
        break;
    }
  }
  return parts
    .filter(Boolean)
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
