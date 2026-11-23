import { t } from '../../i18n';
/* eslint-disable react-refresh/only-export-components -- shared blog helpers + presentational pieces */
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BLOG_PAGE_SIZES, type BlogTocEntry, type PublicBlogAuthor, type PublicBlogCard } from '../../api/blog';
import { AppIcon } from '../../components/ui/AppIcon';
import { avatarDataUriForIdentity, findBgColor } from '../../lib/avatar';
import { highlightSegments } from '../../lib/searchFold';
import { getLocale } from '../../i18n';
import { absoluteUrl } from '../../lib/usePageMeta';

/**
 * Blog platform — shared presentation for the public reading routes.
 * Persian-first (the public website is Persian; see docs/blog decisions),
 * built on the reference `blog.css` / `article.css` vocabulary plus the
 * `src/styles/blog.css` layer.
 */

export const BLOG_SITE_NAME = 'MESH';
export const BLOG_TITLE = t('blog.reader.meshBlog');

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export const faNum = (value: number | string): string => getLocale() === 'en' ? String(value) : String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);

const jalali = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric' });

/** «۲۳ شهریور ۱۴۰۵» — Jalali, Persian digits; '' for an invalid value. */
export function faDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : getLocale() === 'en' ? new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }).format(d) : jalali.format(d);
}

export const readingLabel = (minutes: number): string => getLocale() === 'en' ? `About ${Math.max(1, minutes)} min read` : `حدود ${faNum(Math.max(1, minutes))} دقیقه مطالعه`;

/** Coarse relative time for comments («۳ ساعت پیش»); falls back to the full date after a week. */
export function faRelative(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / 60_000);
  if (getLocale() === 'en' && minutes < 60 * 24 * 7) {
    const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    return minutes < 60 ? format.format(-minutes, 'minute') : minutes < 1440 ? format.format(-Math.floor(minutes / 60), 'hour') : format.format(-Math.floor(minutes / 1440), 'day');
  }
  if (minutes < 1) return t('blog.reader.justNow');
  if (minutes < 60) return `${faNum(minutes)} دقیقه پیش`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${faNum(hours)} ساعت پیش`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${faNum(days)} روز پیش`;
  return faDate(iso);
}

/** «۴٫۵» style average: one decimal, trailing «.0» dropped, Persian digits. */
export const faRating = (value: number): string => faNum(value.toFixed(1).replace(/\.0$/, ''));

/** Deterministic fallback artwork when an article has no featured image. */
const ART_CLASSES = ['art-purple', 'art-dark', 'art-lime', 'art-blue'] as const;
export function artClassFor(slug: string): (typeof ART_CLASSES)[number] {
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  return ART_CLASSES[hash % ART_CLASSES.length];
}

export const authorHref = (author: PublicBlogAuthor | null): string | null =>
  author?.slug ? `/blog/author/${encodeURIComponent(author.slug)}` : null;

export function AuthorAvatar({ author, size = 28 }: { author: PublicBlogAuthor | null; size?: number }) {
  const name = author?.name ?? t('blog.reader.meshEditorialTeam139');
  const identity = author?.slug ?? name;
  return (
    <img
      className="blog-avatar"
      src={avatarDataUriForIdentity(author?.avatarId ?? null, identity, size)}
      alt=""
      width={size}
      height={size}
      style={{ backgroundColor: findBgColor(author?.avatarBg) }}
    />
  );
}

export function AuthorName({ author }: { author: PublicBlogAuthor | null }) {
  const href = authorHref(author);
  const name = author?.name ?? t('blog.reader.meshEditorialTeam139');
  return href ? (
    <Link to={href} className="blog-author-link">
      {name}
    </Link>
  ) : (
    <span>{name}</span>
  );
}

/** Marks the parts of `text` that match the (folded) search terms. */
export function Highlight({ text, terms }: { text: string; terms?: string[] }) {
  if (!terms || terms.length === 0 || !text) return <>{text}</>;
  const segments = highlightSegments(text, terms);
  if (segments.length === 1 && !segments[0].hit) return <>{text}</>;
  return (
    <>
      {segments.map((segment, index) =>
        segment.hit ? (
          <mark className="blog-mark" key={index}>
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

/**
 * One article card (reference `.post-card`), with a real image or fallback
 * art. In search results (`terms`) the title/excerpt matches are marked and,
 * when the best match sits in the body, the API's snippet is shown.
 */
export function BlogCard({ card, headingLevel = 3, terms }: { card: PublicBlogCard; headingLevel?: 2 | 3; terms?: string[] }) {
  const location = useLocation();
  const from = /^\/blog(?:$|\/(category|tag|author)\/)/.test(location.pathname) ? location.pathname + location.search : undefined;
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const href = `/blog/${card.slug}`;
  const snippet = terms?.length && card.snippet?.field === 'body' ? card.snippet.text : null;
  return (
    <article className="post-card" data-testid="blog-card" data-slug={card.slug}>
      <Link to={href} state={from ? { blogFrom: from } : undefined} className={`post-art ${card.featuredImage ? 'has-image' : artClassFor(card.slug)}`} tabIndex={-1} aria-hidden="true">
        {card.featuredImage ? (
          <img src={card.featuredImage.url} alt="" loading="lazy" decoding="async" />
        ) : (
          <span>{card.category?.name ?? 'MESH'}</span>
        )}
      </Link>
      <div className="post-body">
        <div className="post-meta">
          <span>{card.category ? <Link to={`/blog/category/${card.category.slug}`}>{card.category.name}</Link> : t('blog.reader.blog')}</span>
          <span>{readingLabel(card.readingMinutes)}</span>
        </div>
        <Heading>
          <Link to={href} state={from ? { blogFrom: from } : undefined}>
            <Highlight text={card.title} terms={terms} />
          </Link>
        </Heading>
        <p>
          <Highlight text={card.excerpt} terms={terms} />
        </p>
        {snippet && (
          <p className="post-snippet" data-testid="blog-card-snippet">
            <span className="sr-only">{t('blog.reader.fromTheArticle')}</span>
            <Highlight text={snippet} terms={terms} />
          </p>
        )}
        <div className="post-foot">
          <span className="post-author">
            <AuthorAvatar author={card.author} size={22} />
            <AuthorName author={card.author} />
          </span>
          <span className="post-foot__end">
            <CardEngagement card={card} />
            <time dateTime={card.publishedAt}>{faDate(card.publishedAt)}</time>
          </span>
        </div>
      </div>
    </article>
  );
}

/**
 * Compact engagement signal on cards: average + votes, and the comment count
 * when there is one. Nothing is shown for an article nobody has rated or
 * discussed yet — an empty «۰» would only make new articles look worse.
 */
export function CardEngagement({ card }: { card: Pick<PublicBlogCard, 'ratingAvg' | 'ratingCount' | 'commentCount'> }) {
  if (!card.ratingCount && !card.commentCount) return null;
  return (
    <span className="post-engagement" data-testid="blog-card-engagement">
      {card.ratingCount > 0 && (
        <span className="post-engagement__rating" aria-label={t('blog.reader.ratingLabel', { rating: faRating(card.ratingAvg), n: faNum(card.ratingCount) })}>
          <AppIcon name="star" size={12} filled strokeWidth={1.5} />
          <b>{faRating(card.ratingAvg)}</b>
          <small>({faNum(card.ratingCount)})</small>
        </span>
      )}
      {card.commentCount > 0 && (
        <span className="post-engagement__comments" aria-label={t('blog.reader.commentCount', { n: faNum(card.commentCount) })}>
          <AppIcon name="messageCircle" size={12} />
          <b>{faNum(card.commentCount)}</b>
        </span>
      )}
    </span>
  );
}

export function BlogCardGrid({ cards, headingLevel, terms }: { cards: PublicBlogCard[]; headingLevel?: 2 | 3; terms?: string[] }) {
  return (
    <div className="posts-grid">
      {cards.map((card) => (
        <BlogCard key={card.slug} card={card} headingLevel={headingLevel} terms={terms} />
      ))}
    </div>
  );
}

export function BlogCardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="posts-grid" aria-busy="true" aria-label={t('blog.reader.loadingArticles')}>
      {Array.from({ length: count }, (_, i) => (
        <div className="post-card blog-skeleton" key={i}>
          <div className="post-art" />
          <div className="post-body">
            <div className="blog-skeleton-line w-40" />
            <div className="blog-skeleton-line w-90" />
            <div className="blog-skeleton-line w-70" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BlogNotice({
  kind,
  title,
  text,
  action,
  testId,
}: {
  kind: 'empty' | 'error' | 'missing';
  title: string;
  text?: string;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <div className={`blog-notice blog-notice--${kind}`} role={kind === 'error' ? 'alert' : 'status'} data-testid={testId}>
      <b>{title}</b>
      {text && <p>{text}</p>}
      {action && <div className="blog-notice-actions">{action}</div>}
    </div>
  );
}

export interface Crumb {
  label: string;
  to?: string;
}

export function BlogBreadcrumbs({ items, label = t('blog.reader.breadcrumb') }: { items: Crumb[]; label?: string }) {
  return (
    <nav className="blog-crumbs" aria-label={label}>
      <ol>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} aria-current={index === items.length - 1 ? 'page' : undefined}>
            {item.to && index < items.length - 1 ? <Link to={item.to}>{item.label}</Link> : <span>{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Page numbers to render for `page` of `totalPages`: first and last are
 * always present, the current page keeps one neighbour on each side, and
 * `null` marks a gap (rendered as an ellipsis). A gap of exactly one page
 * shows that page instead of "…" so the row never hides a single number.
 */
export function pagerWindow(page: number, totalPages: number, siblings = 1): Array<number | null> {
  if (totalPages <= 1) return [];
  const wanted = new Set<number>([1, totalPages]);
  for (let p = page - siblings; p <= page + siblings; p += 1) if (p >= 1 && p <= totalPages) wanted.add(p);
  // Keep the row the same width near the edges (1 2 3 4 … 20 / 1 … 17 18 19 20).
  const span = 2 * siblings + 3;
  if (page - siblings <= 2) for (let p = 1; p <= Math.min(totalPages, span); p += 1) wanted.add(p);
  if (page + siblings >= totalPages - 1) for (let p = Math.max(1, totalPages - span + 1); p <= totalPages; p += 1) wanted.add(p);
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: Array<number | null> = [];
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && p - prev === 2) out.push(prev + 1);
    else if (prev !== undefined && p - prev > 2) out.push(null);
    out.push(p);
  });
  return out;
}

/** Marks a heading as the list top so the pager can bring it back into view and focus it. */
export const BLOG_LIST_TOP_ID = 'blog-list-top';
export function focusListTop() {
  if (typeof document === 'undefined') return;
  const top = document.getElementById(BLOG_LIST_TOP_ID);
  if (!top) return;
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  top.focus({ preventScroll: true });
  top.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}

/**
 * Crawlable pagination — every page is a real link (first / previous /
 * numbers / next / last), the current one is marked, a visible range
 * summary («نمایش ۱۳–۲۴ از ۵۳») and a page-size selector that writes
 * `?size=` so the choice is shareable. `rel` prev/next also go into `<head>`.
 */
export function BlogPager({
  page,
  totalPages,
  total,
  pageSize,
  hrefFor,
  onPageSize,
  onNavigate = focusListTop,
  noun = t('blog.reader.articles'),
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  hrefFor: (page: number) => string;
  onPageSize?: (size: number) => void;
  onNavigate?: (page: number) => void;
  noun?: string;
}) {
  const prevHref = page > 1 ? hrefFor(page - 1) : null;
  const nextHref = page < totalPages ? hrefFor(page + 1) : null;
  usePrevNextLinks(prevHref, nextHref);
  if (total <= 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const sizes = BLOG_PAGE_SIZES.includes(pageSize) ? BLOG_PAGE_SIZES : [...BLOG_PAGE_SIZES, pageSize].sort((a, b) => a - b);
  const link = (p: number, label: ReactNode, extra: { title: string; rel?: string; disabled?: boolean; testId?: string }) =>
    extra.disabled ? (
      <span className="blog-pager-item is-disabled" aria-disabled="true" title={extra.title}>
        {label}
      </span>
    ) : (
      <Link
        to={hrefFor(p)}
        rel={extra.rel}
        className="blog-pager-item"
        aria-label={extra.title}
        title={extra.title}
        onClick={() => onNavigate?.(p)}
        data-testid={extra.testId}
      >
        {label}
      </Link>
    );
  return (
    <nav className="blog-pager" aria-label={t('blog.reader.paginationLabel', { name: noun })} data-testid="blog-pager">
      <p className="blog-pager-summary" data-testid="blog-pager-summary">
        {t('blog.reader.showing')}{' '}{faNum(from)}–{faNum(to)} {t('blog.reader.of')}{' '}{faNum(total)} {noun}
        {totalPages > 1 && (
          <span className="blog-pager-pages">
            {' '}
            {t('blog.reader.page')}{' '}{faNum(page)} {t('blog.reader.of')}{' '}{faNum(totalPages)}
          </span>
        )}
      </p>
      {totalPages > 1 && (
        <ul className="blog-pager-list">
          <li>
            {link(1, <AppIcon name="chevronsStart" size="sm" />, { title: t('blog.reader.firstPage'), disabled: page <= 1, testId: 'blog-pager-first' })}
          </li>
          <li>
            {link(page - 1, <AppIcon name="chevronStart" size="sm" />, {
              title: t('blog.reader.previousPage'),
              rel: 'prev',
              disabled: page <= 1,
              testId: 'blog-pager-prev',
            })}
          </li>
          {pagerWindow(page, totalPages).map((p, index) =>
            p === null ? (
              <li key={`gap-${index}`} className="blog-pager-gap" aria-hidden="true">
                …
              </li>
            ) : (
              <li key={p}>
                {p === page ? (
                  <span className="blog-pager-item is-current" aria-current="page" data-testid="blog-pager-current">
                    <span className="sr-only">{t('blog.reader.page148')}</span>
                    {faNum(p)}
                  </span>
                ) : (
                  link(p, faNum(p), { title: t('blog.reader.pageLabel', { n: faNum(p) }) })
                )}
              </li>
            ),
          )}
          <li>
            {link(page + 1, <AppIcon name="chevronEnd" size="sm" />, {
              title: t('blog.reader.nextPage'),
              rel: 'next',
              disabled: page >= totalPages,
              testId: 'blog-pager-next',
            })}
          </li>
          <li>
            {link(totalPages, <AppIcon name="chevronsEnd" size="sm" />, {
              title: t('blog.reader.lastPage'),
              disabled: page >= totalPages,
              testId: 'blog-pager-last',
            })}
          </li>
        </ul>
      )}
      {onPageSize && total > Math.min(...BLOG_PAGE_SIZES) && (
        <label className="blog-pager-size">
          <span>{t('blog.reader.perPage')}</span>
          <select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))} data-testid="blog-page-size">
            {sizes.map((size) => (
              <option key={size} value={size}>
                {faNum(size)}
              </option>
            ))}
          </select>
        </label>
      )}
    </nav>
  );
}

/** `<link rel="prev|next">` for the current list page (removed on unmount / change). */
export function usePrevNextLinks(prev: string | null, next: string | null) {
  useEffect(() => {
    const links: HTMLLinkElement[] = [];
    for (const [rel, href] of [
      ['prev', prev],
      ['next', next],
    ] as const) {
      if (!href) continue;
      const link = document.createElement('link');
      link.rel = rel;
      link.href = absoluteUrl(href);
      document.head.appendChild(link);
      links.push(link);
    }
    return () => links.forEach((link) => link.remove());
  }, [prev, next]);
}

// ---- structured data -------------------------------------------------------

export const organizationLd = () => ({
  '@type': 'Organization',
  '@id': `${absoluteUrl('/')}#organization`,
  name: BLOG_SITE_NAME,
  url: absoluteUrl('/'),
  logo: absoluteUrl('/og-cover.png'),
});

export const breadcrumbLd = (items: Crumb[]) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.label,
    ...(item.to ? { item: absoluteUrl(item.to) } : {}),
  })),
});

export const graphLd = (...nodes: Array<Record<string, unknown>>) => ({ '@context': 'https://schema.org', '@graph': nodes });

/** Highlights the heading currently in view (shared by blog, docs and legal pages). */
export function useScrollSpy(toc: BlogTocEntry[]) {
  const [activeId, setActiveId] = useState<string | null>(toc[0]?.id ?? null);
  const [spiedToc, setSpiedToc] = useState(toc);
  if (spiedToc !== toc) {
    // New article → start from its first heading.
    setSpiedToc(toc);
    setActiveId(toc[0]?.id ?? null);
  }
  useEffect(() => {
    if (toc.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const sections = toc.map(({ id }) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [toc]);
  return activeId;
}
