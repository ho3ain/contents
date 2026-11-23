import {
  keywordKey,
  normalizePersian,
} from '../../../common/utils/persian-normalize';

/**
 * Surgical edits on the Markdown SOURCE of an article (the stored source of
 * truth). Used when a link is created/removed from the knowledge graph or a
 * suggestion is approved: the change is reflected in the content itself, not
 * in a side table — the next render produces the link.
 *
 * Conservative by design: only prose lines (paragraphs, list items, quotes)
 * are edited; headings, code fences, tables and image lines are skipped; an
 * occurrence inside an existing link or inline code is never wrapped.
 */

export interface LinkEditResult {
  markdown: string;
  changed: boolean;
  /** 1-based line of the edit, for diagnostics. */
  line: number | null;
}

const LINK_OR_IMAGE_RE = /!?\[[^\]]*\]\([^)]*\)/g;
const INLINE_CODE_RE = /`[^`]*`/g;

function protectedSpans(line: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const re of [LINK_OR_IMAGE_RE, INLINE_CODE_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) spans.push([m.index, m.index + m[0].length]);
  }
  return spans;
}

function inside(
  spans: Array<[number, number]>,
  start: number,
  end: number,
): boolean {
  return spans.some(([a, b]) => start < b && end > a);
}

function isProseLine(line: string, inFence: boolean): boolean {
  if (inFence) return false;
  const t = line.trim();
  if (!t) return false;
  if (/^#{1,6}\s/.test(t)) return false;
  if (t.startsWith('|')) return false;
  if (/^!\[/.test(t)) return false;
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) return false;
  return true;
}

/**
 * Finds `anchor` in the source (Persian-normalised, case-insensitive match
 * over the ORIGINAL characters) and returns the exact original substring and
 * its index, or null. Matching is done on a per-line basis.
 */
function findInLine(
  line: string,
  anchor: string,
): { index: number; text: string } | null {
  const target = keywordKey(anchor);
  if (!target) return null;
  // Walk candidate windows of the same word count as the anchor.
  const words = target.split(' ').length;
  // Same segmentation as keywordKey(): whitespace, punctuation, symbols and ZWNJ split.
  const tokenRe = /[^\s\p{P}\p{S}\u200C]+/gu;
  const tokens: Array<{ start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(line)))
    tokens.push({ start: m.index, end: m.index + m[0].length });
  const spans = protectedSpans(line);
  for (let i = 0; i + words <= tokens.length; i += 1) {
    const start = tokens[i].start;
    const end = tokens[i + words - 1].end;
    const slice = line.slice(start, end);
    if (keywordKey(slice) !== target) continue;
    if (inside(spans, start, end)) continue;
    return { index: start, text: slice };
  }
  return null;
}

/** Wraps the first eligible occurrence of `anchor` as `[anchor](href)`. */
export function wrapFirstOccurrence(
  markdown: string,
  anchor: string,
  href: string,
): LinkEditResult {
  const lines = markdown.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!isProseLine(line, inFence)) continue;
    const hit = findInLine(line, anchor);
    if (!hit) continue;
    lines[i] =
      `${line.slice(0, hit.index)}[${hit.text}](${href})${line.slice(hit.index + hit.text.length)}`;
    return { markdown: lines.join('\n'), changed: true, line: i + 1 };
  }
  return { markdown, changed: false, line: null };
}

/** Does `anchor` occur in prose (eligible for wrapping)? */
export function anchorAvailable(markdown: string, anchor: string): boolean {
  return wrapFirstOccurrence(markdown, anchor, '#').changed;
}

/**
 * Removes the first Markdown link whose href equals `href` (and, when given,
 * whose anchor text matches), keeping the anchor text as plain text.
 */
export function unwrapLink(
  markdown: string,
  href: string,
  anchor?: string | null,
): LinkEditResult {
  const lines = markdown.split('\n');
  const wantAnchor = anchor ? keywordKey(anchor) : null;
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const re = /(?<!!)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      if (normalizePersian(m[2]) !== normalizePersian(href)) continue;
      if (wantAnchor && keywordKey(m[1]) !== wantAnchor) continue;
      lines[i] =
        `${line.slice(0, m.index)}${m[1]}${line.slice(m.index + m[0].length)}`;
      return { markdown: lines.join('\n'), changed: true, line: i + 1 };
    }
  }
  return { markdown, changed: false, line: null };
}
