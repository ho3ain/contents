import type { HTMLAttributes, ReactNode } from 'react';

/**
 * MESH card pattern #3 — Priority Panel.
 * docs/MESH-CARD-DESIGN-SYSTEM.md › Priority Panel
 *
 * One pending action, blocker or decision — never a generic container and
 * never rendered empty (the caller decides whether there is something to
 * say). Tone is semantic (accent = next step, warning = waiting on the
 * buyer, danger = broken); urgency comes from the copy, not the styling.
 */
export type PriorityPanelTone = 'accent' | 'warning' | 'danger';

export interface PriorityPanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  tone?: PriorityPanelTone;
  /** Short label above the title, e.g. «ادامه از همین‌جا». */
  eyebrow?: ReactNode;
  /** The decision/action, as the panel heading. */
  title: ReactNode;
  /** id for the heading, so the section can be `aria-labelledby` it. */
  titleId: string;
  /** Identity thumbnail (optional). */
  media?: ReactNode;
  /** Context line under the title (product name, status…). */
  lead?: ReactNode;
  /** Why it matters — one or two sentences. */
  description?: ReactNode;
  /** Anything extra inside the body (progress, facts). */
  children?: ReactNode;
  /** ONE primary action, optionally one secondary + a quiet link. */
  actions?: ReactNode;
  /** Quiet trailing content (e.g. «۲ محصول دیگر هم منتظر شما هستند»). */
  footer?: ReactNode;
  headingLevel?: 2 | 3;
}

export function PriorityPanel({
  tone = 'accent',
  eyebrow,
  title,
  titleId,
  media,
  lead,
  description,
  children,
  actions,
  footer,
  headingLevel = 2,
  className,
  ...rest
}: PriorityPanelProps) {
  const Heading = `h${headingLevel}` as const;
  const cls = ['priority-panel'];
  if (tone !== 'accent') cls.push(`priority-panel--${tone}`);
  if (!media) cls.push('priority-panel--plain');
  if (className) cls.push(className);
  return (
    <section className={cls.join(' ')} aria-labelledby={titleId} data-tone={tone} {...rest}>
      {media && <div className="priority-panel__media">{media}</div>}
      <div className="priority-panel__body">
        {eyebrow && <span className="priority-panel__eyebrow">{eyebrow}</span>}
        <Heading className="priority-panel__title" id={titleId}>
          {title}
        </Heading>
        {lead && <div className="priority-panel__lead">{lead}</div>}
        {description && <p className="priority-panel__desc">{description}</p>}
        {children}
        {actions && <div className="priority-panel__actions">{actions}</div>}
        {footer && <div className="priority-panel__footer">{footer}</div>}
      </div>
    </section>
  );
}
