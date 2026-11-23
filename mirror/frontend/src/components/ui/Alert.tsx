import type { ReactNode } from 'react';

export type AlertKind = 'error' | 'success' | 'warning' | 'info';

export function Alert({
  kind,
  title,
  children,
  ...rest
}: {
  kind: AlertKind;
  /** Optional bold heading rendered above the message. */
  title?: ReactNode;
  children: ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`alert alert--${kind}`}
      role={kind === 'error' ? 'alert' : 'status'}
      {...rest}>
      {title ? (
        <div className="alert__title">
          <strong>{title}</strong>
        </div>
      ) : null}
      {children}
    </div>
  );
}
