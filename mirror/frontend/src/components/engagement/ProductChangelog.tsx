import { useState } from 'react';
import { agentsApi } from '../../api/endpoints';
import type { AgentChangelog, PublicVersionHistory, ReleaseInfo } from '../../api/types';
import { CHANGELOG_SECTIONS, freshnessText, hasChangelog } from '../../lib/changelog';
import { errorMessage } from '../../lib/error';
import { formatCount, formatDate } from '../../lib/format';
import { Badge, Button } from '../ui';
import { t } from '../../i18n';

/** One version's buyer-facing notes (what's new, major, improvements, fixes). */
export function ChangelogBody({ changelog }: { changelog: AgentChangelog | null }) {
  if (!hasChangelog(changelog)) {
    return <p className="small muted changelog__empty">{t('changelog.noNotes')}</p>;
  }
  return (
    <div className="changelog__body">
      {changelog.whatsNew && <p className="changelog__whats-new">{changelog.whatsNew}</p>}
      {CHANGELOG_SECTIONS.map((section) =>
        changelog[section].length > 0 ? (
          <div key={section} className="changelog__section" data-testid={`changelog-${section}`}>
            <h4 className="changelog__section-title">{t(`changelog.section.${section}`)}</h4>
            <ul>
              {changelog[section].map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
      {changelog.actionRequired && (
        <p className="changelog__action" data-testid="changelog-action">
          <strong>{t('changelog.actionRequired')}:</strong> {changelog.actionRequired}
        </p>
      )}
    </div>
  );
}

/**
 * Gap closure (P8) — «آخرین به‌روزرسانی» + version history on the public
 * product page. Progressive disclosure: the latest notes are visible; the
 * full history loads on demand. Only PUBLISHED versions and their public
 * notes exist here — never review / moderation information.
 */
export function ProductChangelog({ slug, release }: { slug: string; release: ReleaseInfo | null | undefined }) {
  const [history, setHistory] = useState<PublicVersionHistory | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!release || !release.latest) return null;
  const latest = release.latest;
  const freshness = freshnessText(release);

  const loadHistory = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (history) return;
    setLoading(true);
    setError(null);
    try {
      setHistory(await agentsApi.versions(slug));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const older = (history?.items ?? []).filter((item) => !item.current);

  return (
    <section id="changelog" className="mt-8 section-card changelog" aria-labelledby="changelog-heading" data-testid="product-changelog">
      <div className="section-card__head row row--between row--wrap" style={{ gap: 8 }}>
        <h3 id="changelog-heading">{t('changelog.title')}</h3>
        {freshness && (
          <Badge tone="accent" data-testid="changelog-freshness">
            {freshness}
          </Badge>
        )}
      </div>
      <p className="small muted" style={{ marginTop: 0 }} data-testid="changelog-last-update">
        {t('changelog.lastUpdate', {
          version: latest.versionNumber,
          date: formatDate(release.lastUpdatedAt ?? latest.publishedAt),
        })}
      </p>
      <ChangelogBody changelog={latest.changelog} />
      {release.versionCount > 1 && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            aria-expanded={open}
            aria-controls="changelog-history"
            loading={loading}
            onClick={() => void loadHistory()}
            data-testid="changelog-toggle"
          >
            {open ? t('changelog.hideHistory') : t('changelog.showHistory', { count: formatCount(release.versionCount) })}
          </Button>
          {open && (
            <div id="changelog-history" className="changelog__history" data-testid="changelog-history">
              {error && (
                <p className="small text-danger" role="alert">
                  {error}
                </p>
              )}
              {older.map((item) => (
                <article key={item.versionNumber} className="changelog__version" data-testid={`changelog-version-${item.versionNumber}`}>
                  <h4 className="changelog__version-title">
                    {t('changelog.versionHeading', { version: item.versionNumber, date: formatDate(item.publishedAt) })}
                  </h4>
                  <ChangelogBody changelog={item.changelog} />
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
