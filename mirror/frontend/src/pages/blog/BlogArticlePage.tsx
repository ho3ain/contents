import { t } from '../../i18n';
import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { blogApi, type BlogEngagementSummary, type PublicBlogPostDetail, type PublicPostLookup } from '../../api/blog';
import { useAsync } from '../../lib/useAsync';
import { absoluteUrl, usePageMeta } from '../../lib/usePageMeta';
import { BlogBlocks } from './BlogBlocks';
import {
  AuthorAvatar,
  AuthorName,
  BLOG_SITE_NAME,
  BlogCardGrid,
  BlogNotice,
  authorHref,
  breadcrumbLd,
  faDate,
  faNum,
  faRating,
  graphLd,
  organizationLd,
  readingLabel,
  type Crumb,
  useScrollSpy,
} from './blogShared';
import { AppIcon } from '../../components/ui/AppIcon';
import { ArticleShareRail } from './ArticleShareRail';
import { useI18n } from '../../i18n';
import { ArticleEngagement, StarRow } from './BlogEngagement';

/**
 * `/blog/:slug` — one published article. A renamed slug answers with
 * `{redirectTo}` and the page replaces the URL (no chain: the server always
 * points at the CURRENT slug); unknown / unpublished slugs are a real 404.
 * The same component renders the authorised editor preview (`preview` prop).
 */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function BlogArticlePage() {
  const { slug = '' } = useParams();
  const valid = SLUG_RE.test(slug) && slug.length <= 110;
  const lookup = useAsync<PublicPostLookup | null>(() => (valid ? blogApi.post(slug) : Promise.resolve(null)), [slug, valid]);

  if (!valid || (lookup.failure?.status === 404 && !lookup.loading)) return <ArticleNotFound />;
  if (lookup.loading) return <ArticleSkeleton />;
  if (lookup.error || !lookup.data) {
    return (
      <div className="container article-state">
        <BlogNotice
          kind="error"
          title={t('blog.reader.unableToLoadArticle')}
          text={lookup.error ?? undefined}
          testId="blog-article-error"
          action={
            <button type="button" className="button button-primary" onClick={() => void lookup.refetch()}>
              {t('blog.reader.tryAgain')}</button>
          }
        />
      </div>
    );
  }
  if ('redirectTo' in lookup.data) return <Navigate to={`/blog/${lookup.data.redirectTo}`} replace />;
  return <ArticleView post={lookup.data} />;
}

export function ArticleNotFound() {
  usePageMeta(t('blog.reader.articleNotFound'), undefined, BLOG_SITE_NAME, { robots: 'noindex,nofollow' });
  return (
    <div className="container article-state" data-testid="blog-article-404">
      <BlogNotice
        kind="missing"
        title={t('blog.reader.thisArticleCouldNotBeFound')}
        text={t('blog.reader.theAddressMayBeIncorrectOrThe')}
        action={
          <>
            <Link className="button button-primary" to="/blog">
              {t('blog.reader.backToBlog')}</Link>
            <Link className="button button-light" to="/agents">
              {t('blog.reader.exploreAgents')}</Link>
          </>
        }
      />
    </div>
  );
}

function ArticleSkeleton() {
  return (
    <div className="container article-state" aria-busy="true" aria-label={t('blog.reader.loadingArticle')}>
      <div className="blog-skeleton-line w-40" />
      <div className="blog-skeleton-line w-90 tall" />
      <div className="blog-skeleton-line w-70" />
      <div className="blog-skeleton-block" />
    </div>
  );
}

export function ArticleView({ post, preview = false }: { post: PublicBlogPostDetail; preview?: boolean }) {
  const { locale } = useI18n();
  const en = locale === 'en';
  const location = useLocation();
  const candidate: unknown = (location.state as { blogFrom?: unknown } | null)?.blogFrom;
  const backTo = typeof candidate === 'string' && /^\/blog(?:\?|$|\/(?:category|tag|author)\/[a-z0-9-]+(?:\?|$))/.test(candidate) ? candidate : '/blog';
  const path = `/blog/${post.slug}`;
  const crumbs: Crumb[] = [
    { label: t('blog.reader.home'), to: '/' },
    { label: t('blog.reader.blog'), to: '/blog' },
  ];
  if (post.category) crumbs.push({ label: post.category.name, to: `/blog/category/${post.category.slug}` });
  crumbs.push({ label: post.title });
  const image = post.seo.ogImageUrl ?? post.featuredImage?.url ?? null;
  const authorUrl = authorHref(post.author);
  const updated = post.updatedAt && post.updatedAt !== post.publishedAt ? post.updatedAt : null;
  // Live engagement counters (seeded from the article payload, refreshed by the section below).
  const [engagement, setEngagement] = useState<BlogEngagementSummary | null>(null);
  const ratingAvg = engagement?.rating.average ?? post.ratingAvg;
  const ratingCount = engagement?.rating.count ?? post.ratingCount;
  const commentCount = engagement?.commentCount ?? post.commentCount;

  usePageMeta(post.seo.title, post.seo.description, '', {
    canonical: preview ? undefined : (post.seo.canonicalUrl ?? path),
    // SEO Studio: robots / language / translations / social copy come from the
    // same effective metadata the crawler HTML (`/seo/render`) emits.
    robots: preview ? 'noindex,nofollow' : (post.seo.robots ?? 'index,follow'),
    language: post.seo.language,
    hreflang: preview ? undefined : post.seo.translations?.map((t) => ({ lang: t.language, href: t.path })),
    twitterCard: post.seo.twitterCard,
    ogTitle: post.seo.ogTitle && post.seo.ogTitle !== post.seo.title ? post.seo.ogTitle : undefined,
    ogDescription: post.seo.ogDescription && post.seo.ogDescription !== post.seo.description ? post.seo.ogDescription : undefined,
    jsonLd: preview
      ? null
      : graphLd(organizationLd(), breadcrumbLd(crumbs), {
          '@type': 'BlogPosting',
          '@id': `${absoluteUrl(path)}#article`,
          mainEntityOfPage: absoluteUrl(path),
          headline: post.title,
          description: post.excerpt,
          inLanguage: post.seo.language === 'en' ? 'en' : 'fa-IR',
          datePublished: post.publishedAt,
          dateModified: post.updatedAt,
          wordCount: post.wordCount,
          ...(image ? { image: [image] } : {}),
          ...(post.category ? { articleSection: post.category.name } : {}),
          ...(post.tags.length ? { keywords: post.tags.map((t) => t.name).join(', ') } : {}),
          ...(ratingCount > 0
            ? {
                aggregateRating: {
                  '@type': 'AggregateRating',
                  ratingValue: ratingAvg,
                  ratingCount,
                  bestRating: 5,
                  worstRating: 1,
                },
              }
            : {}),
          ...(commentCount > 0 ? { commentCount } : {}),
          author: post.author
            ? { '@type': 'Person', name: post.author.name, ...(authorUrl ? { url: absoluteUrl(authorUrl) } : {}) }
            : { '@id': organizationLd()['@id'] },
          publisher: { '@id': organizationLd()['@id'] },
        }),
  });

  useEffect(() => {
    if (preview) return;
    const og = (property: string, content: string | null) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
      const previous = el?.getAttribute('content') ?? null;
      if (content) {
        if (!el) {
          el = document.createElement('meta');
          el.setAttribute('property', property);
          el.setAttribute('data-blog-meta', '1');
          document.head.appendChild(el);
        }
        el.setAttribute('content', content);
      }
      return () => {
        if (!el) return;
        if (el.hasAttribute('data-blog-meta')) el.remove();
        else if (previous) el.setAttribute('content', previous);
      };
    };
    const undo = [
      og('og:type', 'article'),
      og('og:image', image),
      og('article:published_time', post.publishedAt),
      og('article:modified_time', post.updatedAt),
      og('article:section', post.category?.name ?? null),
    ];
    return () => undo.forEach((fn) => fn());
  }, [preview, image, post.publishedAt, post.updatedAt, post.category?.name]);

  const activeId = useScrollSpy(post.toc);
  const sharePayload = { url: absoluteUrl(post.seo.canonicalUrl ?? path), title: post.title, text: post.excerpt };

  const hasMarketLinks = post.agents.length > 0 || post.marketCategories.length > 0;

  return (
    <>
      {preview && (
        <div className="blog-preview-banner" role="status" data-testid="blog-preview-banner">
          {en ? 'Private preview — latest saved version. Unsaved edits are not shown.' : t('blog.reader.privatePreviewLatestSavedVersionUnsavedEdits')}
        </div>
      )}
      <div className="article-top">
        <div className="container">
          <Link to={backTo} className="article-back">{en ? '← All articles' : t('blog.reader.allArticles')}</Link>
          <div className="article-heading">
            <div className="article-publication">
              {post.category && <Link className="article-kicker" to={`/blog/category/${post.category.slug}`}>{post.category.name}</Link>}
              {post.publishedAt && <time dateTime={post.publishedAt}>{faDate(post.publishedAt)}</time>}
            </div>
            <h1 data-testid="blog-article-title">{post.title}</h1>
            <p className="article-lead">{post.excerpt}</p>
            <div className="article-meta">
              <span>{readingLabel(post.readingMinutes)}</span>
              {post.author && <span className="article-byline"><AuthorAvatar author={post.author} /><AuthorName author={post.author} /></span>}
              {updated && <small>{en ? 'Updated: ' : t('blog.reader.updated')}<time dateTime={updated}>{faDate(updated)}</time></small>}
            </div>
            <div className="article-actions" data-testid="blog-article-actions">
              {!preview && (
                <>
                  <a href="#rating" className="article-chip" data-testid="blog-article-rating-chip" aria-label={ratingCount ? t('blog.reader.ratingLabel', { rating: faRating(ratingAvg), n: faNum(ratingCount) }) : t('blog.reader.rateThisArticle')}>
                    <StarRow value={ratingCount ? ratingAvg : 0} size={13} />
                    {ratingCount ? (
                      <>
                        <b>{faRating(ratingAvg)}</b>
                        <small>({faNum(ratingCount)})</small>
                      </>
                    ) : (
                      <small>{t('blog.reader.beTheFirstToRate')}</small>
                    )}
                  </a>
                  <a href="#comments" className="article-chip" data-testid="blog-article-comments-chip">
                    <AppIcon name="messageCircle" size="xs" />
                    <b>{faNum(commentCount)}</b>
                    <small>{t('blog.reader.comments')}</small>
                  </a>
                </>
              )}

            </div>
          </div>
        </div>
      </div>

      {post.featuredImage && (
        <figure className="article-cover">
          <img
            className="article-cover-img"
            src={post.featuredImage.url}
            alt={post.featuredImage.alt}
            decoding="async"
            fetchPriority="high"
          />
          {post.featuredImage.caption && <figcaption>{post.featuredImage.caption}</figcaption>}
        </figure>
      )}

      <div className="container article-layout">
        <aside className="article-aside"><div className="article-sidebar-inner">
          {post.toc.length > 0 && (
            <nav className="toc" aria-label={t('blog.reader.tableOfContents')} data-testid="blog-toc">
              <b>{en ? 'On this page' : t('blog.reader.onThisPage')}</b>
              {post.toc.filter((entry) => entry.level <= 3).map(({ id, text, level }) => (
                <a key={id} href={`#${id}`} aria-current={activeId === id ? 'location' : undefined} className={`${activeId === id ? 'active' : ''} toc-l${level}`.trim()}>
                  {text}
                </a>
              ))}
            </nav>
          )}
          <div className="article-sidebar-cta"><b>{en ? 'Put ideas into practice' : t('blog.reader.putIdeasIntoPractice')}</b><p>{en ? 'Find an agent for your next task.' : t('blog.reader.findAnAgentForYourNextTask')}</p><Link className="button button-light" to="/agents">{en ? 'Explore agents' : t('blog.reader.exploreAgents44')}</Link></div>
          </div></aside>

        <article className="article-body" lang={post.seo.language ?? 'fa'} dir={post.seo.language === 'en' ? 'ltr' : 'rtl'} data-testid="blog-article-body">
          <BlogBlocks blocks={post.blocks} />

          {post.sources.length > 0 && (
            <section className="article-sources" aria-labelledby="article-sources-h">
              <h2 id="article-sources-h">{t('blog.reader.sources')}</h2>
              <ol>
                {post.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer nofollow">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {post.tags.length > 0 && (
            <div className="article-tags" aria-label={t('blog.reader.tags')}>
              {post.tags.map((tag) => (
                <Link key={tag.slug} to={`/blog/tag/${tag.slug}`} className="article-tag">
                  #{tag.name}
                </Link>
              ))}
            </div>
          )}

          {hasMarketLinks && (
            <section className="article-market" aria-labelledby="article-market-h" data-testid="blog-market-links">
              <h2 id="article-market-h">{t('blog.reader.onTheMeshMarketplace')}</h2>
              {post.agents.length > 0 && (
                <ul className="article-agents">
                  {post.agents.map((agent) => (
                    <li key={agent.slug}>
                      <Link to={`/agents/${agent.slug}`}>
                        {agent.logoUrl ? (
                          <img src={agent.logoUrl} alt="" width={36} height={36} loading="lazy" />
                        ) : (
                          <span className="article-agent-mark" aria-hidden="true" />
                        )}
                        <span>
                          <b>{agent.name}</b>
                          {agent.shortDescription && <small>{agent.shortDescription}</small>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {post.marketCategories.length > 0 && (
                <div className="article-market-cats">
                  {post.marketCategories.map((cat) => (
                    <Link key={cat.slug} to={`/categories/${cat.slug}`} className="article-market-cat">
                      {cat.nameFa ?? cat.name}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}

          <div className="article-end">
            <b>{t('blog.reader.yourNextStep')}</b>
            <span>{t('blog.reader.findAnAgentForTheWorkYou')}</span>
            <Link to="/agents">
              {t('blog.reader.exploreAgents')}<AppIcon name="arrowForward" size="xs" />
            </Link>
          </div>

          {post.author && (
            <aside className="article-author-box" aria-label={t('blog.reader.aboutTheAuthor')}>
              <AuthorAvatar author={post.author} size={48} />
              <div>
                <b>
                  <AuthorName author={post.author} />
                </b>
                <small>{authorUrl ? t('blog.reader.viewAllArticlesByThisAuthor') : t('blog.reader.meshEditorialTeam')}</small>
              </div>
            </aside>
          )}

        </article>
        <aside className="article-share-aside"><div className="article-share-sticky"><ArticleShareRail key={post.slug} payload={sharePayload} /></div></aside>
      </div>

      {(post.pillar || post.cluster.length > 0) && (
        <section className="related section article-cluster">
          <div className="container">
            <div className="section-head">
              <div>
                <h2>{post.pillar ? t('blog.reader.partOfTheCompleteGuide') : t('blog.reader.continueThisGuide')}</h2>
              </div>
              {post.pillar && (
                <Link className="outline-link" to={`/blog/${post.pillar.slug}`}>
                  {post.pillar.title} <AppIcon name="arrowForward" size="xs" />
                </Link>
              )}
            </div>
            {post.cluster.length > 0 && <BlogCardGrid cards={post.cluster} />}
          </div>
        </section>
      )}

      {post.related.length > 0 && (
        <section className="related section" data-testid="blog-related">
          <div className="container">
            <div className="section-head">
              <div>
                <h2>{t('blog.reader.relatedArticles')}</h2>
              </div>
              <Link className="outline-link" to="/blog">
                {t('blog.reader.backToBlog')}<AppIcon name="arrowForward" size="xs" />
              </Link>
            </div>
            <BlogCardGrid cards={post.related.slice(0, 3)} />
          </div>
        </section>
      )}
      {!preview && <section className="container article-discussion"><ArticleEngagement
        key={post.slug} slug={post.slug}
        initial={{ ratingAvg: post.ratingAvg, ratingCount: post.ratingCount, commentCount: post.commentCount }}
        onSummary={setEngagement} /></section>}
    </>
  );
}
