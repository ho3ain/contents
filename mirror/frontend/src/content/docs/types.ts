import type { Locale } from '../../i18n';

export type DocsSectionKey = 'getting-started' | 'buying' | 'creators' | 'developers' | 'security' | 'status';

export interface DocsSection {
  key: DocsSectionKey;
  /** Icon name from the MESH icon system. */
  icon: 'bookOpen' | 'shoppingBag' | 'builder' | 'tools' | 'shieldCheck' | 'activity';
}

export interface DocArticle {
  slug: string;
  section: DocsSectionKey;
  title: Record<Locale, string>;
  summary: Record<Locale, string>;
  /** Markdown-lite source per locale (see src/content/markdown-lite.ts). */
  body: Record<Locale, string>;
  /** ISO date of the last substantive edit. */
  updatedAt: string;
  /** Team that owns the content. */
  owner: 'product' | 'operations' | 'engineering' | 'legal';
  /** Optional: render a live widget under the body (status page). */
  widget?: 'service-status';
}
