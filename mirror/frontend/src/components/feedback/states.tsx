import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';

/**
 * Standardized page-level states (Phase 10.1): not-found and
 * permission-denied get the same structure, copy tone and next actions
 * everywhere instead of per-page improvisation.
 */
export function NotFoundState({
  entity,
  action,
}: {
  /** Optional: what was not found (agent, order, request…). */
  entity?: string;
  action?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="empty-state" role="alert">
      <h3>{entity ? t('states.notFoundEntity', { entity }) : t('states.notFound')}</h3>
      <p>{t('states.notFoundHint')}</p>
      <div className="row row--center">
        {action ?? (
          <Link className="btn btn--secondary btn--sm" to="/agents">
            {t('states.backToExplore')}
          </Link>
        )}
      </div>
    </div>
  );
}

export function ForbiddenState({ hint }: { hint?: string }) {
  const { t } = useI18n();
  return (
    <div className="empty-state" role="alert">
      <h3>{t('states.forbidden')}</h3>
      <p>{hint ?? t('states.forbiddenHint')}</p>
      <div className="row row--center">
        <Link className="btn btn--secondary btn--sm" to="/dashboard">
          {t('states.backToDashboard')}
        </Link>
      </div>
    </div>
  );
}
