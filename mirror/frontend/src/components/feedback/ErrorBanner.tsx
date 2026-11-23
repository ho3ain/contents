import type { ReactNode } from 'react';

export function ErrorBanner({
  children,
  onRetry,
}: {
  children: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div
      className="alert alert--error"
      role="alert"
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
    >
      <span>{children}</span>
      {onRetry && (
        <button className="btn btn--ghost btn--sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
