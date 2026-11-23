import type { CSSProperties, ReactNode } from 'react';

export interface ScreenProps {
  narrow?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/** Top-level page container — applies centered, padded layout from tokens. */
export function Screen({ narrow, className, style, children }: ScreenProps) {
  const cls = ['page', 'container'];
  if (narrow) cls.push('container--narrow');
  if (className) cls.push(className);
  return (
    <main className={cls.join(' ')} style={style}>
      {children}
    </main>
  );
}

export interface SectionProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

/** Card-like section with an optional header row. */
export function Section({ title, description, actions, className, bodyClassName, children }: SectionProps) {
  const cls = ['section-card'];
  if (className) cls.push(className);
  return (
    <section className={cls.join(' ')}>
      {(title != null || actions != null) && (
        <div className="section-card__head">
          <div>
            <h3>{title}</h3>
            {description != null && <p className="section-desc">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={['section-card__body', bodyClassName].filter(Boolean).join(' ')}>{children}</div>
    </section>
  );
}
