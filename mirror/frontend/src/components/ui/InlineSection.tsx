import type { HTMLAttributes, ReactNode } from 'react';

/**
 * MESH card pattern #4 — Inline Section.
 * docs/MESH-CARD-DESIGN-SYSTEM.md › Inline Section
 *
 * Groups related content with typography and spacing instead of a
 * bordered box. Use it when the content inside already has its own
 * shape (rows, rails, cards) — nesting a card inside another card is the
 * anti-pattern this component exists to prevent.
 */
export interface InlineSectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  /** id for the heading (section is `aria-labelledby` it). */
  titleId: string;
  /** Optional count shown beside the title, already formatted. */
  count?: ReactNode;
  /** One short sentence under the heading row. */
  hint?: ReactNode;
  /** Trailing link/actions aligned with the heading («همه», filters…). */
  aside?: ReactNode;
  headingLevel?: 2 | 3;
  children: ReactNode;
}

export function InlineSection({ title, titleId, count, hint, aside, headingLevel = 2, className, children, ...rest }: InlineSectionProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section className={['inline-section', className].filter(Boolean).join(' ')} aria-labelledby={titleId} {...rest}>
      <div className="inline-section__head">
        <div className="inline-section__heading">
          <Heading className="inline-section__title" id={titleId}>
            {title}
          </Heading>
          {count !== undefined && count !== null && <span className="inline-section__count">{count}</span>}
        </div>
        {aside && <div className="inline-section__aside">{aside}</div>}
        {hint && <p className="inline-section__hint">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
