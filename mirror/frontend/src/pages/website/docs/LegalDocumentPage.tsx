import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppIcon } from '../../../components/ui/AppIcon';
import {
  LEGAL_DOCUMENTS,
  LEGAL_ORDER,
  isLegalDocumentEffective,
  legalKeyFromSlug,
  legalNeighbours,
  parseLegalDocument,
  type LegalDocumentKey,
  type LegalDocumentMeta,
} from '../../../content/legal';
import { intlLocale, useI18n } from '../../../i18n';
import { usePageMeta } from '../../../lib/usePageMeta';
import { BlogBlocks, type BlockUi } from '../../blog/BlogBlocks';
import { BlogBreadcrumbs, useScrollSpy, type Crumb } from '../../blog/blogShared';

/**
 * Existing public legal surface: a small registry, one stable route per
 * document, and a status-aware renderer. It deliberately does not expose the
 * internal Phase 8 governance package or invent a publication workflow.
 */

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(intlLocale(), { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${iso}T00:00:00Z`));
  } catch {
    return iso;
  }
}

function LegalPublicationNotice({ meta, documentKey, compact = false }: {
  meta: LegalDocumentMeta;
  documentKey?: LegalDocumentKey;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const effective = isLegalDocumentEffective(meta);
  return (
    <div className={compact ? 'legal-publication-notice legal-publication-notice--compact' : 'legal-publication-notice'} data-status={meta.status}>
      <div className="trust-meta" data-testid={compact ? undefined : 'legal-version'}>
        <span className="trust-badge" data-testid={compact ? undefined : 'legal-publication-status'}>
          {t(`legal.status.${meta.status}`)}
        </span>
        <span>{t('legal.version', { version: meta.version })}</span>
        {effective ? <span>{t('legal.effective', { date: formatDate(meta.effectiveAt) })}</span> : null}
      </div>
      {!effective && !compact ? (
        <p className="legal-draft" role="note" data-testid="legal-draft-notice">
          <AppIcon name="info" size={16} />
          <span>{t('legal.statusNote.draft')}</span>
        </p>
      ) : null}
      {!effective && documentKey ? (
        <p className="small muted" data-testid="legal-document-review-note">
          {t(`legal.reviewNote.${documentKey}`)}
        </p>
      ) : null}
    </div>
  );
}

function LegalNotFound() {
  const { t } = useI18n();
  return (
    <div className="trust-page" data-testid="legal-not-found">
      <div className="container" style={{ padding: '48px 0 70px' }}>
        <div className="trust-empty" role="status">
          <h2>{t('legal.notFound.title')}</h2>
          <p>{t('legal.notFound.text')}</p>
          <nav
            className="legal-links"
            aria-label={t('legal.other')}
            style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}
          >
            <Link className="button button-small button-primary" to="/legal">
              {t('legal.index.link')}
            </Link>
            {LEGAL_ORDER.map((key) => (
              <Link key={key} className="button button-small button-primary" to={LEGAL_DOCUMENTS[key].path}>
                {t(`legal.title.${key}`)}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}

/** `/legal` — a public index for the existing three documents only. */
export function LegalIndexPage() {
  const { t } = useI18n();
  const documents = LEGAL_ORDER.map((key) => LEGAL_DOCUMENTS[key]);
  const effectiveCount = documents.filter(isLegalDocumentEffective).length;
  usePageMeta(t('legal.index.title'), t('legal.index.description'), 'MESH', {
    canonical: '/legal',
    robots: 'index,follow',
  });

  return (
    <div className="trust-page legal-page" data-testid="legal-index">
      <header className="trust-head">
        <div className="container">
          <BlogBreadcrumbs items={[{ label: t('docs.crumb.home'), to: '/' }, { label: t('legal.crumb') }]} label={t('docs.crumbs')} />
          <h1>{t('legal.index.title')}</h1>
          <p className="trust-lead">{t('legal.index.lead')}</p>
          {effectiveCount === 0 ? (
            <p className="legal-draft" role="note" data-testid="legal-index-no-effective">
              <AppIcon name="info" size={16} />
              <span>{t('legal.index.noEffective')}</span>
            </p>
          ) : null}
        </div>
      </header>
      <div className="container" style={{ paddingBlock: '28px 64px' }}>
        <section aria-label={t('legal.index.listLabel')}>
          <div className="stack" style={{ gap: 12 }}>
            {documents.map((document) => (
              <article className="card" key={document.key} data-testid={`legal-index-${document.key}`}>
                <div className="card__body">
                  <div className="row row--between row--wrap" style={{ gap: 12, alignItems: 'flex-start' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '1.125rem' }}>
                        <Link to={document.path}>{t(`legal.title.${document.key}`)}</Link>
                      </h2>
                      <p className="muted small" style={{ margin: '6px 0 0' }}>{t(`legal.summary.${document.key}`)}</p>
                    </div>
                    <Link className="button button-small button-secondary" to={document.path}>
                      {t('legal.index.open')}
                    </Link>
                  </div>
                  <LegalPublicationNotice meta={document} compact />
                </div>
              </article>
            ))}
          </div>
        </section>
        <p className="small muted" style={{ marginTop: 24 }}>{t('legal.index.scope')}</p>
      </div>
    </div>
  );
}

export function LegalDocumentPage() {
  const { doc } = useParams();
  const { t, locale } = useI18n();
  const key = legalKeyFromSlug(doc);

  const title = key ? t(`legal.title.${key}`) : t('legal.notFound.title');
  usePageMeta(title, key ? t(`legal.meta.description.${key}`) : undefined, 'MESH', {
    canonical: key ? LEGAL_DOCUMENTS[key].path : undefined,
    robots: key ? 'index,follow' : 'noindex,follow',
  });

  const parsed = useMemo(() => (key ? parseLegalDocument(key, locale) : null), [key, locale]);
  const activeId = useScrollSpy(parsed?.toc ?? []);
  const ui = useMemo<BlockUi>(
    () => ({ calloutLabel: (kind) => t(`docs.callout.${kind}`) }),
    // module-level `t`; re-create when the dictionary (locale) changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale],
  );

  if (!key || !parsed) return <LegalNotFound />;

  const meta = LEGAL_DOCUMENTS[key];
  const { prev, next } = legalNeighbours(key);
  const crumbs: Crumb[] = [
    { label: t('docs.crumb.home'), to: '/' },
    { label: t('legal.crumb'), to: '/legal' },
    { label: title },
  ];

  return (
    <div className="trust-page legal-page" data-testid="legal-page" data-doc={key} data-status={meta.status}>
      <header className="trust-head">
        <div className="container">
          <BlogBreadcrumbs items={crumbs} label={t('docs.crumbs')} />
          <h1 data-testid="legal-title">{title}</h1>
          <p className="trust-lead">{t(`legal.summary.${key}`)}</p>
          <LegalPublicationNotice meta={meta} documentKey={key} />
        </div>
      </header>

      <div className="container">
        <div className="legal-layout">
          <aside className="legal-aside">
            {parsed.toc.length > 1 && (
              <nav className="toc" aria-label={t('legal.toc')} data-testid="legal-toc">
                <b>{t('legal.toc')}</b>
                {parsed.toc
                  .filter((entry) => entry.level === 2)
                  .map(({ id, text }) => (
                    <a key={id} href={`#${id}`} className={activeId === id ? 'active' : undefined}>
                      {text}
                    </a>
                  ))}
              </nav>
            )}
            <div className="legal-others">
              <h2>{t('legal.other')}</h2>
              <ul>
                <li><Link to="/legal">{t('legal.index.link')}</Link></li>
                {LEGAL_ORDER.map((other) => (
                  <li key={other}>
                    <Link to={LEGAL_DOCUMENTS[other].path} aria-current={other === key ? 'page' : undefined}>
                      {t(`legal.title.${other}`)}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link to="/docs">{t('legal.docs.link')}</Link>
                </li>
              </ul>
            </div>
          </aside>

          <div>
            <article className="article-body legal-body" lang={locale} data-testid="legal-body">
              <BlogBlocks blocks={parsed.blocks} ui={ui} lead={false} />
            </article>
            <nav className="legal-footer-nav" aria-label={t('legal.other')}>
              <p>{t('legal.questions')}</p>
              <div className="legal-links">
                <Link to="/contact?topic=general">{t('legal.questions.cta')}</Link>
                {prev && (
                  <Link to={LEGAL_DOCUMENTS[prev].path} data-testid="legal-prev">
                    ← {t(`legal.title.${prev}`)}
                  </Link>
                )}
                {next && (
                  <Link to={LEGAL_DOCUMENTS[next].path} data-testid="legal-next">
                    {t(`legal.title.${next}`)} →
                  </Link>
                )}
              </div>
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
}
