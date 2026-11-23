import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../../api/client';
import { healthApi } from '../../../api/endpoints';
import { AppIcon } from '../../../components/ui/AppIcon';
import {
  DOCS_SECTIONS,
  docNeighbours,
  docsBySection,
  findDocArticle,
  parseDocArticle,
  type DocArticle,
  type DocsSectionKey,
} from '../../../content/docs';
import { LEGAL_DOCUMENTS, LEGAL_ORDER } from '../../../content/legal/legal-documents';
import { API_PREFIX } from '../../../content/platform-facts';
import { intlLocale, useI18n } from '../../../i18n';
import { usePageMeta } from '../../../lib/usePageMeta';
import { BlogBlocks, type BlockUi } from '../../blog/BlogBlocks';
import { BlogBreadcrumbs, useScrollSpy, type Crumb } from '../../blog/blogShared';
import { DocsSearchDialog } from './DocsSearchDialog';

/**
 * Sprint 1 (D) — documentation center: `/docs` (landing) and `/docs/:slug`.
 * Content is static, versioned source (`src/content/docs/*`) parsed with the
 * markdown-lite parser into the blog block tree and rendered by the blog
 * renderer — one typography, one accessibility review. Search is a real
 * client-side full-text index over the parsed articles (both languages),
 * opened from the sidebar in a dialog (`DocsSearchDialog`).
 *
 * Layout (same `.container` as the website header, so the breadcrumbs sit
 * under the logo): breadcrumbs → [sticky sidebar | content (| TOC rail)].
 * The landing's display heading lives in the content column.
 */

const START_HERE = ['what-is-mesh', 'how-to-buy', 'refunds', 'becoming-a-creator', 'earnings-and-payouts', 'developer-api-overview'];

/** Icon-tile tone per section — the website's category palette (style.css). */
const SECTION_TONE: Record<DocsSectionKey, 'violet' | 'mint' | 'sky' | 'lemon' | 'peach' | 'lilac'> = {
  'getting-started': 'violet',
  buying: 'mint',
  creators: 'peach',
  developers: 'sky',
  security: 'lilac',
  status: 'lemon',
};

function sectionTitle(t: (key: string) => string, key: DocsSectionKey): string {
  return t(`docs.section.${key}.title`);
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(intlLocale(), { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${iso}T00:00:00Z`));
  } catch {
    return iso;
  }
}

function useBlockUi(): BlockUi {
  const { t, locale } = useI18n();
  return useMemo(
    () => ({
      calloutLabel: (kind) => t(`docs.callout.${kind}`),
      copy: { label: t('docs.code.copy'), copied: t('docs.code.copied'), failed: t('docs.code.failed') },
    }),
    // `t` is module-level; the dictionary changes with `locale`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale],
  );
}

/* ----------------------------------------------------------------- sidebar */

function DocsSidebar({
  current,
  onOpenSearch,
  searchTriggerRef,
}: {
  current: string | null;
  onOpenSearch: () => void;
  searchTriggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const navId = useId();
  return (
    <aside className="docs-sidebar" aria-label={t('docs.nav.aria')} data-testid="docs-sidebar">
      <div className="docs-sidebar__bar">
        {/* Search is the first stop of the sidebar — opens the search dialog
            (also `/` or Ctrl/⌘ K anywhere on the page). */}
        <button
          ref={searchTriggerRef}
          type="button"
          className="docs-search-trigger"
          onClick={onOpenSearch}
          data-testid="docs-search-trigger"
        >
          <AppIcon name="search" size={16} />
          <span>{t('docs.search.open')}</span>
          <kbd aria-hidden="true">/</kbd>
        </button>
        <button
          type="button"
          className="docs-sidebar__toggle"
          aria-expanded={open}
          aria-controls={navId}
          onClick={() => setOpen((value) => !value)}
          data-testid="docs-nav-toggle"
        >
          <AppIcon name={open ? 'close' : 'menu'} size={16} />
          {open ? t('docs.nav.close') : t('docs.nav.toggle')}
        </button>
      </div>
      <nav id={navId} className={open ? 'is-open' : undefined} aria-label={t('docs.nav.aria')}>
        {DOCS_SECTIONS.map((section) => (
          <div key={section.key}>
            <h2>
              <AppIcon name={section.icon} size={16} />
              {sectionTitle(t, section.key)}
            </h2>
            <ul>
              {docsBySection(section.key).map((article) => (
                <li key={article.slug}>
                  <Link
                    to={`/docs/${article.slug}`}
                    aria-current={article.slug === current ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                  >
                    {article.title[locale]}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

/* --------------------------------------------------------------- landing */

function LegalCard() {
  const { t } = useI18n();
  return (
    <section className="docs-legal-card" aria-labelledby="docs-legal-h" data-testid="docs-legal-card">
      <h2 id="docs-legal-h">{t('docs.landing.legal.title')}</h2>
      <p>{t('docs.landing.legal.text')}</p>
      <nav aria-label={t('docs.landing.legal.title')}>
        {LEGAL_ORDER.map((key) => (
          <Link key={key} to={LEGAL_DOCUMENTS[key].path}>
            {t(`legal.title.${key}`)}
          </Link>
        ))}
      </nav>
    </section>
  );
}

function DocsLanding() {
  const { t, locale } = useI18n();
  const starts = START_HERE.map((slug) => findDocArticle(slug)).filter((a): a is DocArticle => a !== null);
  return (
    <div className="docs-main" data-testid="docs-landing">
      {/* Same hero grammar as the website pages — display heading with the
          purple emphasis and a lead — start-aligned in the content column. */}
      <div className="docs-landing-head">
        <h1>
          {t('docs.hero.title')} <em>{t('docs.hero.titleAccent')}</em>
        </h1>
        <p className="trust-lead">{t('docs.subtitle')}</p>
      </div>
      <div className="docs-section-head">
        <h2 className="docs-section-title">{t('docs.landing.sections')}</h2>
        <p>{t('docs.landing.sections.desc')}</p>
      </div>
      <div className="docs-grid">
        {DOCS_SECTIONS.map((section) => {
          const articles = docsBySection(section.key);
          return (
            <Link key={section.key} to={`/docs/${articles[0].slug}`} className="docs-card" data-testid={`docs-card-${section.key}`}>
              <span className={`docs-card__icon ${SECTION_TONE[section.key]}`} aria-hidden="true">
                <AppIcon name={section.icon} size={20} />
              </span>
              <span className="docs-card__body">
                <h3>{sectionTitle(t, section.key)}</h3>
                <p>{t(`docs.section.${section.key}.desc`)}</p>
                <small>{t('docs.landing.count', { count: articles.length })}</small>
              </span>
              <AppIcon name="arrowForward" size={16} className="docs-card__arrow" />
            </Link>
          );
        })}
      </div>
      <div className="docs-section-head">
        <h2 className="docs-section-title">{t('docs.landing.start')}</h2>
        <p>{t('docs.landing.start.desc')}</p>
      </div>
      <ol className="docs-start">
        {starts.map((article, index) => (
          <li key={article.slug}>
            <Link to={`/docs/${article.slug}`}>
              <span className="docs-start__number" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <b>{article.title[locale]}</b>
              <span>{article.summary[locale]}</span>
            </Link>
          </li>
        ))}
      </ol>
      <LegalCard />
    </div>
  );
}

/* ---------------------------------------------------------- status widget */

type Probe =
  | { state: 'checking' }
  | { state: 'ok' | 'degraded'; database: 'up' | 'down' | 'unknown'; checkedAt: Date }
  | { state: 'unreachable'; checkedAt: Date };

export function ServiceStatusWidget() {
  const { t } = useI18n();
  const [probe, setProbe] = useState<Probe>({ state: 'checking' });
  const [nonce, setNonce] = useState(0);
  // Re-check resets to "checking" in the click handler (not in the effect).
  const recheck = () => {
    setProbe({ state: 'checking' });
    setNonce((n) => n + 1);
  };

  useEffect(() => {
    let cancelled = false;
    healthApi
      .check()
      .then((result) => {
        if (cancelled) return;
        const database = result.database === 'up' ? 'up' : result.database === 'down' ? 'down' : 'unknown';
        setProbe({ state: result.status === 'ok' && database === 'up' ? 'ok' : 'degraded', database, checkedAt: new Date() });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // A 503 is the API telling us the database is down — still an answer.
        if (error instanceof ApiError && error.status === 503) {
          setProbe({ state: 'degraded', database: 'down', checkedAt: new Date() });
        } else {
          setProbe({ state: 'unreachable', checkedAt: new Date() });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const label =
    probe.state === 'checking'
      ? t('docs.status.checking')
      : probe.state === 'ok'
        ? t('docs.status.ok')
        : probe.state === 'degraded'
          ? t('docs.status.degraded')
          : t('docs.status.unreachable');
  const app = probe.state === 'checking' ? 'unknown' : probe.state === 'unreachable' ? 'down' : 'up';
  const db = probe.state === 'checking' || probe.state === 'unreachable' ? 'unknown' : probe.database;
  const checkedAt = 'checkedAt' in probe ? probe.checkedAt : null;

  return (
    <section className="status-widget" aria-labelledby="status-widget-h" data-testid="service-status" data-state={probe.state}>
      <div className="status-widget__head">
        <h2 id="status-widget-h">{t('docs.status.title')}</h2>
        <div className="status-widget__state" role="status" aria-live="polite">
          <span className={`status-dot status-dot--${probe.state}`} aria-hidden="true" />
          <span>{label}</span>
        </div>
      </div>
      <dl>
        <div>
          <dt>{t('docs.status.component.app')}</dt>
          <dd>{t(`docs.status.${app}`)}</dd>
        </div>
        <div>
          <dt>{t('docs.status.component.db')}</dt>
          <dd>{t(`docs.status.${db}`)}</dd>
        </div>
      </dl>
      <div className="status-widget__foot">
        <span>
          {t('docs.status.endpoint')}: <code>GET {API_PREFIX}/health</code>
          {checkedAt ? ` · ${t('docs.status.checkedAt', { time: checkedAt.toLocaleTimeString(intlLocale()) })}` : ''}
        </span>
        <button type="button" onClick={recheck} disabled={probe.state === 'checking'}>
          {t('docs.status.recheck')}
        </button>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- article */

function DocsArticle({ article }: { article: DocArticle }) {
  const { t, locale } = useI18n();
  const parsed = parseDocArticle(article, locale);
  const ui = useBlockUi();
  const activeId = useScrollSpy(parsed.toc);
  const { prev, next } = docNeighbours(article.slug);
  const hashHandled = useRef<string | null>(null);

  // Deep links (`/docs/slug#heading`) arrive before the article is in the
  // DOM; scroll once the blocks are rendered.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash || hashHandled.current === `${article.slug}#${hash}`) return;
    hashHandled.current = `${article.slug}#${hash}`;
    const target = document.getElementById(hash);
    if (target) target.scrollIntoView({ block: 'start' });
  }, [article.slug, locale]);

  return (
    <>
      {/* The TOC precedes the body in DOM order so that reading/focus order
          matches the layout at every width: a sticky rail (≥1101px, placed in
          column 3 by the grid) or an inline list above the article. */}
      <aside className="docs-toc" aria-label={t('docs.toc')}>
        {parsed.toc.length > 1 && (
          <nav className="toc" aria-label={t('docs.toc')} data-testid="docs-toc">
            <b>{t('docs.toc')}</b>
            {parsed.toc.map(({ id, text, level }) => (
              <a key={id} href={`#${id}`} className={`${activeId === id ? 'active' : ''} toc-l${level}`.trim()}>
                {text}
              </a>
            ))}
          </nav>
        )}
      </aside>
      <div className="docs-main" data-testid="docs-article">
        <span className="docs-kicker">
          <AppIcon name={DOCS_SECTIONS.find((s) => s.key === article.section)?.icon ?? 'bookOpen'} size={14} />
          {sectionTitle(t, article.section)}
        </span>
        <h1 data-testid="docs-article-title">{article.title[locale]}</h1>
        <p className="docs-summary">{article.summary[locale]}</p>
        <div className="docs-article-meta">
          <span>{t('docs.meta.updated', { date: formatDate(article.updatedAt) })}</span>
          <span>{t('docs.meta.owner', { owner: t(`docs.owner.${article.owner}`) })}</span>
        </div>
        <article className="article-body" lang={locale} data-testid="docs-article-body">
          <BlogBlocks blocks={parsed.blocks} ui={ui} lead={false} />
        </article>
        {article.widget === 'service-status' && <ServiceStatusWidget />}
        <nav className="docs-pager" aria-label={`${t('docs.prev')} / ${t('docs.next')}`}>
          {prev ? (
            <Link to={`/docs/${prev.slug}`} className="docs-pager__prev" data-testid="docs-prev">
              <small>{t('docs.prev')}</small>
              <b>{prev.title[locale]}</b>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link to={`/docs/${next.slug}`} className="docs-pager__next" data-testid="docs-next">
              <small>{t('docs.next')}</small>
              <b>{next.title[locale]}</b>
            </Link>
          ) : (
            <span />
          )}
        </nav>
        <p className="docs-feedback">
          <span>{t('docs.feedback')}</span>
          <Link to="/contact?topic=general">{t('docs.feedback.cta')}</Link>
        </p>
      </div>
    </>
  );
}

function DocsNotFound() {
  const { t } = useI18n();
  return (
    <div className="docs-main">
      <div className="trust-empty" role="status" data-testid="docs-not-found">
        <h2>{t('docs.notFound.title')}</h2>
        <p>{t('docs.notFound.text')}</p>
        <Link className="button button-primary button-small" to="/docs">
          {t('docs.notFound.cta')}
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export function DocsPage() {
  const { slug } = useParams();
  const { t, locale } = useI18n();
  const [searchParams] = useSearchParams();
  const article = findDocArticle(slug);
  const missing = Boolean(slug) && !article;
  const prefill = searchParams.get('q') ?? '';
  // `?q=` deep links open the search dialog with the term filled in.
  const [searchOpen, setSearchOpen] = useState(() => prefill.trim().length > 0);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);

  const pageTitle = article ? `${article.title[locale]} — ${t('docs.meta.title')}` : t('docs.meta.title');
  usePageMeta(pageTitle, article ? article.summary[locale] : t('docs.meta.description'), 'MESH', {
    canonical: article ? `/docs/${article.slug}` : '/docs',
    robots: missing ? 'noindex,follow' : 'index,follow',
  });

  // Keyboard shortcuts: `/` and Ctrl/⌘ K open the search (not while typing).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const palette = event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey);
      const slash = event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey;
      if (!palette && !slash) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) return;
      event.preventDefault();
      setSearchOpen(true);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const crumbs: Crumb[] = [
    { label: t('docs.crumb.home'), to: '/' },
    { label: t('docs.crumb.docs'), to: '/docs' },
  ];
  if (article) {
    crumbs.push({ label: sectionTitle(t, article.section), to: `/docs/${docsBySection(article.section)[0].slug}` });
    crumbs.push({ label: article.title[locale] });
  }

  return (
    <div className="trust-page docs-page" data-testid="docs-page">
      {/* `.container` is reset by the reference glue (`all: revert`), so the
          grid lives on its own element. */}
      <div className="container">
        <div className="docs-crumbs">
          <BlogBreadcrumbs items={crumbs} label={t('docs.crumbs')} />
        </div>
        <div className={`docs-layout${article ? '' : ' docs-layout--landing'}`}>
          <DocsSidebar current={article?.slug ?? null} onOpenSearch={() => setSearchOpen(true)} searchTriggerRef={searchTriggerRef} />
          {article ? <DocsArticle article={article} /> : missing ? <DocsNotFound /> : <DocsLanding />}
        </div>
      </div>
      <DocsSearchDialog open={searchOpen} initialQuery={prefill} onClose={() => setSearchOpen(false)} returnFocusTo={searchTriggerRef} />
    </div>
  );
}
