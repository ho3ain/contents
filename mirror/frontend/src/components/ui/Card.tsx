import type { ElementType, HTMLAttributes, ReactNode } from 'react';

/**
 * Card variants (docs/MESH-CARD-DESIGN-SYSTEM.md):
 * - `surface` (default) — a neutral bordered container for arbitrary content.
 * - `product`           — Product Card: discovery/comparison unit with a
 *                         fixed identity thumbnail, one CTA and shared hover.
 * Rows, priority panels and inline sections are separate components
 * (`ProductRow`, `PriorityPanel`, `InlineSection`) — not Card booleans.
 */
export type CardVariant = 'surface' | 'product';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  variant?: CardVariant;
  /** Adds the shared hover affordance (surface variant only; product has it built in). */
  hover?: boolean;
  /** Semantic element — `article` for standalone product cards. */
  as?: 'div' | 'article' | 'section' | 'li';
}

export function Card({ variant = 'surface', hover, as = 'div', className, children, ...rest }: CardProps) {
  const Tag: ElementType = as;
  const cls = ['card'];
  if (variant === 'product') cls.push('card--product');
  else if (hover) cls.push('card--hover');
  if (className) cls.push(className);
  return (
    <Tag className={cls.join(' ')} {...rest}>
      {children}
    </Tag>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const cls = ['card__body'];
  if (className) cls.push(className);
  return (
    <div className={cls.join(' ')} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const cls = ['card__footer'];
  if (className) cls.push(className);
  return (
    <div className={cls.join(' ')} {...rest}>
      {children}
    </div>
  );
}

export interface SectionCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  actions?: ReactNode;
}

export function SectionCard({ title, actions, children, className, ...rest }: SectionCardProps) {
  const cls = ['section-card'];
  if (className) cls.push(className);
  return (
    <div className={cls.join(' ')} {...rest}>
      {title != null && (
        <div className="section-card__head">
          <h3>{title}</h3>
          {actions}
        </div>
      )}
      <div className="section-card__body">{children}</div>
    </div>
  );
}
