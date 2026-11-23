import { Node, mergeAttributes, type Extensions } from '@tiptap/core';
import Placeholder from '@tiptap/extension-placeholder';
import { TableCell, TableHeader, TableRow, Table } from '@tiptap/extension-table';
import Heading from '@tiptap/extension-heading';
import StarterKit from '@tiptap/starter-kit';

/**
 * Content Studio schema — exactly the constructs the server dialect stores
 * (see `agentHub_backend/src/modules/blog/domain/blog-markdown.ts`). Nothing
 * outside this list can exist in the document, so pasted Word/Google-Docs
 * HTML is reduced to it automatically (unknown nodes/marks are dropped by
 * ProseMirror's schema, URLs are re-checked by the server on save).
 */

const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];

/** Mirrors the server's `safeUrl`: absolute http(s)/mailto/tel, site-relative `/x`, `#anchor`. */
export function isSafeHref(raw: string): boolean {
  const url = raw.trim();
  if (!url || /\p{Cc}/u.test(url)) return false;
  if (url.startsWith('#')) return /^#[\p{L}\p{N}_-]+$/u.test(url);
  if (url.startsWith('/')) return !url.startsWith('//');
  try {
    return SAFE_PROTOCOLS.includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export const CALLOUT_KINDS = ['note', 'tip', 'warning'] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (kind: CalloutKind) => ReturnType;
      toggleCallout: (kind: CalloutKind) => ReturnType;
      unsetCallout: () => ReturnType;
    };
    figure: {
      insertFigure: (attrs: { src: string; alt: string; caption?: string | null }) => ReturnType;
      updateFigure: (attrs: { src?: string; alt?: string; caption?: string | null }) => ReturnType;
    };
  }
}

/** `> [!NOTE|TIP|WARNING]` callout — a block of paragraphs with a kind. */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'paragraph+',
  defining: true,
  addAttributes() {
    return {
      kind: {
        default: 'note',
        parseHTML: (el) => {
          const k = el.getAttribute('data-kind');
          return k && (CALLOUT_KINDS as readonly string[]).includes(k) ? k : 'note';
        },
        renderHTML: (attrs) => ({ 'data-kind': attrs.kind as string }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'aside[data-callout]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes, { 'data-callout': '', class: 'cs-callout' }), 0];
  },
  addCommands() {
    return {
      setCallout:
        (kind) =>
        ({ commands }) =>
          commands.wrapIn(this.name, { kind }),
      toggleCallout:
        (kind) =>
        ({ commands, editor }) => {
          if (editor.isActive(this.name, { kind })) return commands.lift(this.name);
          if (editor.isActive(this.name)) return commands.updateAttributes(this.name, { kind });
          return commands.wrapIn(this.name, { kind });
        },
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },
});

/** `![alt](src "caption")` — an atomic figure; alt/caption edited in its node view. */
export const Figure = Node.create({
  name: 'figure',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: '' },
      caption: { default: null },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'figure',
        getAttrs: (el) => {
          const img = el.querySelector('img');
          if (!img) return false;
          return {
            src: img.getAttribute('src') ?? '',
            alt: img.getAttribute('alt') ?? '',
            caption: el.querySelector('figcaption')?.textContent?.trim() || null,
          };
        },
      },
      {
        tag: 'img[src]',
        getAttrs: (el) => ({ src: el.getAttribute('src') ?? '', alt: el.getAttribute('alt') ?? '', caption: null }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const { src, alt, caption } = HTMLAttributes as { src: string; alt: string; caption: string | null };
    return ['figure', { class: 'cs-figure' }, ['img', { src, alt }], ...(caption ? [['figcaption', {}, caption] as const] : [])];
  },
  addCommands() {
    return {
      insertFigure:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { caption: null, ...attrs } }),
      updateFigure:
        (attrs) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, attrs),
    };
  },
});

const alignAttribute = {
  textAlign: {
    default: null as 'left' | 'center' | 'right' | null,
    parseHTML: (el: HTMLElement) => {
      const a = el.style.textAlign || el.getAttribute('align');
      return a === 'left' || a === 'center' || a === 'right' ? a : null;
    },
    renderHTML: (attrs: Record<string, unknown>) => (attrs.textAlign ? { style: `text-align: ${attrs.textAlign as string}` } : {}),
  },
};

// Server table cells hold a single inline run: paragraphs only (no nested blocks).
export const AlignedTableCell = TableCell.extend({
  content: 'paragraph+',
  addAttributes() {
    return { ...this.parent?.(), ...alignAttribute };
  },
});
export const AlignedTableHeader = TableHeader.extend({
  content: 'paragraph+',
  addAttributes() {
    return { ...this.parent?.(), ...alignAttribute };
  },
});

/**
 * Headings H2–H4 (the article title is H1). Pasted documents (Word, Google
 * Docs) usually start with an H1 and may go deeper than H4: those are folded
 * into the dialect instead of silently becoming plain paragraphs.
 */
const ClampedHeading = Heading.extend({
  parseHTML() {
    return [1, 2, 3, 4, 5, 6].map((level) => ({
      tag: `h${level}`,
      attrs: { level: Math.min(4, Math.max(2, level)) },
    }));
  },
});

export function buildExtensions(placeholder: string): Extensions {
  return [
    StarterKit.configure({
      heading: false,
      strike: false,
      underline: false,
      codeBlock: { HTMLAttributes: { class: 'cs-code' } },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        protocols: ['http', 'https', 'mailto', 'tel'],
        isAllowedUri: (url) => isSafeHref(url),
        shouldAutoLink: (url) => isSafeHref(url),
        HTMLAttributes: { rel: 'noopener', class: 'cs-link' },
      },
      dropcursor: { width: 2 },
    }),
    ClampedHeading.configure({ levels: [2, 3, 4] }),
    Callout,
    Figure,
    Table.configure({ resizable: false, HTMLAttributes: { class: 'cs-table' } }),
    TableRow,
    AlignedTableHeader,
    AlignedTableCell,
    Placeholder.configure({ placeholder }),
  ];
}
