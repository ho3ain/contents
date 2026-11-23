import type {
  BlogBlock,
  BlogInline,
  BlogListItem,
} from '../../blog/domain/blog-markdown';
import { inlineText } from '../../blog/domain/blog-markdown';

/** A hyperlink as it appears in stored content, before resolution. */
export interface ExtractedLink {
  href: string;
  anchor: string;
  /** Block index (0-based) the link lives in. */
  position: number;
}

/** What a stored `href` points at, decided from the URL shape alone. */
export type LinkTarget =
  | { kind: 'post'; slug: string }
  | { kind: 'agent'; slug: string }
  | { kind: 'route'; path: string }
  | { kind: 'external'; url: string }
  | { kind: 'anchor' };

function walkInlines(
  nodes: BlogInline[],
  position: number,
  out: ExtractedLink[],
) {
  for (const node of nodes) {
    if (node.t === 'link') {
      out.push({
        href: node.href,
        anchor: inlineText(node.c).trim(),
        position,
      });
      walkInlines(node.c, position, out);
    } else if (node.t === 'strong' || node.t === 'em') {
      walkInlines(node.c, position, out);
    }
  }
}

function walkItems(
  items: BlogListItem[],
  position: number,
  out: ExtractedLink[],
) {
  for (const item of items) {
    walkInlines(item.c, position, out);
    if (item.children) walkItems(item.children.items, position, out);
  }
}

/** Every link in a block tree, in document order, with its block position. */
export function extractLinks(blocks: BlogBlock[]): ExtractedLink[] {
  const out: ExtractedLink[] = [];
  blocks.forEach((block, position) => {
    switch (block.type) {
      case 'paragraph':
      case 'heading':
        walkInlines(block.c, position, out);
        break;
      case 'list':
        walkItems(block.items, position, out);
        break;
      case 'quote':
        for (const p of block.paragraphs) walkInlines(p, position, out);
        break;
      case 'table':
        for (const cell of block.header) walkInlines(cell, position, out);
        for (const row of block.rows)
          for (const cell of row) walkInlines(cell, position, out);
        break;
      default:
        break;
    }
  });
  return out;
}

const SLUG_SEGMENT = /^[A-Za-z0-9\u0600-\u06FF%_-]+$/;

/**
 * Classifies an href. `siteOrigin` (e.g. `https://mesh.example`) makes
 * absolute links to our own host count as internal; any other absolute URL
 * is external. Paths are compared after stripping query and hash.
 */
export function classifyHref(
  href: string,
  siteOrigin: string | null,
): LinkTarget {
  const raw = href.trim();
  if (!raw || raw.startsWith('#')) return { kind: 'anchor' };
  let path: string;
  if (/^https?:\/\//i.test(raw)) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return { kind: 'external', url: raw };
    }
    const origin = siteOrigin ? safeOrigin(siteOrigin) : null;
    if (!origin || url.origin.toLowerCase() !== origin.toLowerCase()) {
      return { kind: 'external', url: raw };
    }
    path = url.pathname;
  } else if (raw.startsWith('/')) {
    path = raw.split(/[?#]/)[0];
  } else {
    // mailto:, tel:, relative-without-slash — not part of the site graph.
    return { kind: 'external', url: raw };
  }
  const segments = path.split('/').filter(Boolean).map(decodeSegment);
  if (
    segments.length === 2 &&
    segments[0] === 'blog' &&
    SLUG_SEGMENT.test(segments[1])
  ) {
    return { kind: 'post', slug: segments[1] };
  }
  if (
    segments.length === 2 &&
    segments[0] === 'agents' &&
    SLUG_SEGMENT.test(segments[1])
  ) {
    return { kind: 'agent', slug: segments[1] };
  }
  return { kind: 'route', path: `/${segments.join('/')}` };
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function safeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}
