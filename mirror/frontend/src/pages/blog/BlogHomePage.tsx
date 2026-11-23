import { t } from '../../i18n';
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { blogApi, type PublicBlogCard, type PublicBlogHome, type PublicBlogTag } from '../../api/blog';
import type { Paginated } from '../../api/types';
import { tokenizeSearchQuery } from '../../lib/searchFold';
import { useAsync } from '../../lib/useAsync';
import { usePageMeta } from '../../lib/usePageMeta';
import { apiOrigin } from '../../api/client';
import { BlogFilters, BlogSearchBox, type OnChange } from './BlogFilters';
import { listHref, toApiQuery, type BlogListState } from './blogListState';
import { useBlogListState } from './useBlogListState';
import {
  AuthorAvatar,
  AuthorName,
  BLOG_LIST_TOP_ID,
  BLOG_TITLE,
  BlogCardGrid,
  BlogCardsSkeleton,
  BlogNotice,
  BlogPager,
  CardEngagement,
  breadcrumbLd,
  faDate,
  faNum,
  graphLd,
  organizationLd,
  readingLabel,
} from './blogShared';
import { useI18n } from '../../i18n';
import { AppIcon } from '../../components/ui/AppIcon';

/**
 * `/blog` — the editorial home (featured, latest, categories) and, with any
 * of `?q=` / `?category=` / `?tag=` / `?reading=` / `?sort=` / `?page=` /
 * `?size=`, the paginated search/list view. Every filter lives in the URL so
 * results are shareable and crawlable; search pages and empty lists are
 * noindex.
 */

export function BlogHomePage() {
  const { locale } = useI18n();
  const en = locale === 'en';
  const [state, onChange] = useBlogListState();
  const home = useAsync<PublicBlogHome>(() => blogApi.home(), []);
  const tags = useAsync<PublicBlogTag[]>(() => blogApi.tags(), []);
  const query = toApiQuery({ ...state, pageSize: 9 });
  const list = useAsync<Paginated<PublicBlogCard> | null>(() => blogApi.posts(query),
    [query.q, query.category, query.tag, query.sort, query.reading, query.page, query.pageSize]);
  const canonical = listHref('/blog', { ...state, sort: 'newest', q: '', tag: '', reading: '', pageSize: 9, all: false });
  usePageMeta(en ? 'MESH Journal — Ideas for working with AI' : BLOG_TITLE,
    en ? 'Practical guides and ideas for working with AI agents.' : t('blog.reader.practicalGuidesAndExperienceForWorkingWith'), '', {
      canonical, robots: state.q || state.sort !== 'newest' ? 'noindex,follow' : 'index,follow',
      jsonLd: graphLd(organizationLd(), breadcrumbLd([{ label: en ? 'Blog' : t('blog.reader.blog'), to: '/blog' }]), { '@type': 'Blog', name: en ? 'MESH Journal' : BLOG_TITLE, inLanguage: locale === 'en' ? 'en' : 'fa-IR', publisher: { '@id': organizationLd()['@id'] } }),
    });
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'alternate'; link.type = 'application/rss+xml'; link.title = BLOG_TITLE;
    link.href = `${apiOrigin()}/api/v1/blog/feed.xml`;
    document.head.appendChild(link); return () => link.remove();
  }, []);
  return <>
    <section className="blog-hero"><div className="container blog-hero-inner">
      <div className="blog-eyebrow">{en ? 'MESH JOURNAL' : t('blog.reader.meshJournal')}</div>
      <h1>{en ? 'Ideas for a more intelligent way of working' : t('blog.reader.ideasForAMoreIntelligentWayOf')}</h1>
      <p>{en ? 'Thoughtful guides, practical knowledge, and new perspectives on AI agents.' : t('blog.reader.practicalGuidesRealExperienceAndFreshPerspectives')}</p>
      <BlogSearchBox value={state.q} onChange={onChange} label={en ? 'Search articles' : t('blog.reader.searchArticles')} placeholder={en ? 'Search the journal…' : t('blog.reader.searchTheJournal')} />
    </div></section>
    <section className="blog-content section"><div className="container">
      {home.loading ? <BlogCardsSkeleton count={1} /> : home.error ? <BlogNotice kind="error" title={en ? 'Unable to load featured article' : t('blog.reader.unableToLoadTheFeaturedArticle')} action={<button className="button button-light" onClick={() => void home.refetch()}>{en ? 'Retry' : t('blog.reader.tryAgain')}</button>} /> : home.data?.featured ? <FeaturedPost card={home.data.featured} /> : null}
      <fieldset className="blog-discovery" aria-describedby="blog-metric-note">
        <legend className="sr-only">{en ? 'Discover articles' : t('blog.reader.discoverArticles')}</legend>
        <label className={state.sort === 'newest' && !state.category ? 'active' : ''}><input type="radio" name="discovery" checked={state.sort === 'newest' && !state.category} onChange={() => onChange({ sort: 'newest', category: '' })} />{en ? 'Latest' : t('blog.reader.latest')}</label>
        <span className="blog-unavailable" title={en ? 'Reliable readership data is not available' : t('blog.reader.reliableReadershipDataIsNotAvailable')}>{en ? 'Most viewed · unavailable' : t('blog.reader.mostViewedUnavailable')}</span>
        <label className={state.sort === 'popular' ? 'active' : ''}><input type="radio" name="discovery" checked={state.sort === 'popular'} onChange={() => onChange({ sort: 'popular' })} />{en ? 'Most popular' : t('blog.reader.mostPopular')}</label>
        <a href="#blog-categories" className={state.category ? 'active' : undefined} aria-current={state.category ? 'location' : undefined}>{en ? 'Categories' : t('blog.reader.categories')}</a>
      </fieldset>
      {state.sort === 'popular' && <p id="blog-metric-note" className="blog-metric-note">{en ? 'Ordered by reader rating, then number of ratings. Unrated articles follow.' : t('blog.reader.orderedByReaderRatingThenNumberOf')}</p>}
      <div id="blog-categories"><BlogFilters state={state} onChange={onChange} categories={home.data?.categories} tags={tags.data} /></div>
      <ListSection list={list} state={{ ...state, pageSize: 9 }} heading={en ? 'Explore the journal' : t('blog.reader.exploreTheJournal')} onChange={onChange} />
    </div></section>
  </>;
}

function FeaturedPost({ card }: { card: PublicBlogCard }) {
  const location = useLocation();
  const navigationState = { blogFrom: location.pathname + location.search };
  const href = `/blog/${card.slug}`;
  return (
    <article className="featured-post" data-testid="blog-featured">
      <Link to={href} state={navigationState} className="featured-art" tabIndex={-1} aria-hidden="true">
        {card.featuredImage ? (
          <img src={card.featuredImage.url} alt="" decoding="async" />
        ) : (
          <>
            <span className="art-label">MESH</span>


            <b>{card.category?.name ?? 'MESH'}</b>
          </>
        )}
      </Link>
      <div className="featured-copy">
        <div className="post-meta">
          <span>{card.category?.name ?? t('blog.reader.blog')}</span>
          <span>{readingLabel(card.readingMinutes)}</span>
        </div>
        <h2>
          <Link to={href} state={navigationState}>{card.title}</Link>
        </h2>
        <p>{card.excerpt}</p>
        <div className="post-foot">
          <span className="post-author">
            <AuthorAvatar author={card.author} size={24} />
            <AuthorName author={card.author} />
          </span>
          <span className="post-foot__end">
            <CardEngagement card={card} />
            <time dateTime={card.publishedAt}>{faDate(card.publishedAt)}</time>
          </span>
        </div>
        <Link className="post-link" to={href} state={navigationState}>
          {t('blog.reader.readArticle')}<AppIcon name="arrowForward" size="xs" />
        </Link>
      </div>
    </article>
  );
}

export function ListSection({
  list,
  state,
  heading,
  base = '/blog',
  onChange,
}: {
  list: ReturnType<typeof useAsync<Paginated<PublicBlogCard> | null>>;
  state: BlogListState;
  heading: string;
  base?: string;
  onChange: OnChange;
}) {
  const { q, page, pageSize } = state;
  const terms = q ? tokenizeSearchQuery(q) : [];
  const head = (
    <div className="posts-head">
      <div>
        <h2 id={BLOG_LIST_TOP_ID} tabIndex={-1}>
          {heading}
        </h2>
      </div>
      {list.data && !list.loading && (
        <span className="posts-count" role="status" data-testid="blog-list-count">
          {faNum(list.data.meta.total)} {t('blog.reader.articles')}{list.data.meta.totalPages > 1 ? t('blog.reader.pageOf', { page: faNum(page), total: faNum(list.data.meta.totalPages) }) : ''}
        </span>
      )}
    </div>
  );
  if (list.loading)
    return (
      <>
        {head}
        <BlogCardsSkeleton count={Math.min(6, pageSize)} />
      </>
    );
  if (list.error)
    return (
      <>
        {head}
        <BlogNotice
          kind="error"
          title={t('blog.reader.unableToLoadArticles')}
          text={list.error}
          testId="blog-list-error"
          action={
            <button type="button" className="button button-primary" onClick={() => void list.refetch()}>
              {t('blog.reader.tryAgain')}</button>
          }
        />
      </>
    );
  const data = list.data;
  if (!data) return null;
  const hasFilters = Boolean(q || state.category || state.tag || state.reading);
  return (
    <>
      {head}
      {data.items.length === 0 ? (
        <BlogNotice
          kind="empty"
          title={
            q
              ? t('blog.reader.noArticlesMatchThisSearch')
              : hasFilters
                ? t('blog.reader.noArticlesMatchTheseFilters')
                : t('blog.reader.noArticlesHaveBeenPublishedHereYet')
          }
          text={
            q ? t('blog.reader.tryAnotherSpellingOrAShorterSearch') : hasFilters ? t('blog.reader.removeAFilterToBroadenYourSearch') : undefined
          }
          testId="blog-list-empty"
          action={
            hasFilters && (
              <button
                type="button"
                className="button button-primary"
                onClick={() => onChange({ q: '', category: '', tag: '', reading: '', sort: 'newest' })}
              >
                {t('blog.reader.showAllArticles')}</button>
            )
          }
        />
      ) : (
        <BlogCardGrid cards={data.items} terms={terms} />
      )}
      <BlogPager
        page={page}
        totalPages={data.meta.totalPages}
        total={data.meta.total}
        pageSize={data.meta.pageSize}
        hrefFor={(p) => listHref(base, { ...state, page: p })}
      />
    </>
  );
}
