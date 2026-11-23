import type { ReactNode } from 'react';
import { useI18n } from '../../i18n';

export function ErrorState({
  title,
  description,
  retry,
  retryLabel,
  action,
}: {
  /** Localized by default; pass a string to override. */
  title?: string;
  description?: ReactNode;
  retry?: () => void;
  /** Overrides the default «تلاش مجدد» label of the retry button. */
  retryLabel?: string;
  action?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="error-state" role="alert">
      <h3 style={{ marginBottom: 6 }}>{title ?? t('errors.stateTitle')}</h3>
      {description && (
        <p className="muted" style={{ marginBottom: 16 }}>
          {description}
        </p>
      )}
      <div className="row" style={{ justifyContent: 'center' }}>
        {retry && (
          <button type="button" className="btn btn--secondary" onClick={retry}>
            {retryLabel ?? t('actions.tryAgain')}
          </button>
        )}
        {action}
      </div>
    </div>
  );
}
