import { useI18n } from '../../i18n';
import { Link, useParams } from 'react-router-dom';
import { blogApi, type PublicBlogAuthor, type PublicBlogCard, type PublicBlogCategory, type PublicBlogTag } from '../../api/blog';
import type { Paginated } from '../../api/types';
import { useAsync } from '../../lib/useAsync';
import { usePageMeta } from '../../lib/usePageMeta';
import { ArticleNotFound } from './BlogArticlePage';
import { BlogFilters } from './BlogFilters';
import { ListSection } from './BlogHomePage';
import { listHref, toApiQuery } from './blogListState';
import { useBlogListState } from './useBlogListState';
import {
  AuthorAvatar,
  BlogBreadcrumbs,
  BlogCardsSkeleton,
  BlogNotice,
  breadcrumbLd,
  faNum,
  graphLd,
  organizationLd,
  type Crumb,
} from './blogShared';
import { AppIcon } from '../../components/ui/AppIcon';

/**
 * Archive routes: `/blog/category/:slug`, `/blog/tag/:slug`,
 * `/blog/author/:username`. One component, three heads; the list itself is
 * the same paginated `/blog/posts` query the home search uses, with the
 * route's dimension locked and every other filter (search, sort, reading
 * time, the remaining taxonomy) still available and URL-synced.
 *
 * Indexation policy (docs/blog/MESH_Blog_Decisions_FA.md): a category with
 * ≥ 1 published article is indexable; tags need ≥ 2 (thin otherwise) and
 * author archives are always `noindex,follow` (people pages are not a
 * ranking target). Unknown slugs are a real 404.
 */

export type ArchiveKind = 'category' | 'tag' | 'author';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const USERNAME_RE = /^[a-zA-Z0-9_.-]{1,64}$/;

interface Head {
  title: string;
  description: string | null;
  robots: 'index,follow' | 'noindex,follow';
  crumbs: Crumb[];
  eyebrow: string;
  author?: PublicBlogAuthor;
}

export function BlogArchivePage({ kind }: { kind: ArchiveKind }) {
  const { locale, t } = useI18n();
  const BLOG_TITLE = t('blog.reader.meshBlog');
  const { slug = '' } = useParams();
  const [state, onChange] = useBlogListState(kind);
  const { page } = state;
  const valid = kind === 'author' ? USERNAME_RE.test(slug) : SLUG_RE.test(slug) && slug.length <= 110;
  const base = `/blog/${kind}/${encodeURIComponent(slug)}`;

  const head = useAsync<Head | null>(async () => {
    if (!valid) return null;
    if (kind === 'category') {
      const cat: PublicBlogCategory = await blogApi.category(slug);
      return {
        title: `${cat.name} — ${BLOG_TITLE}`,
        description: cat.description,
        robots: cat.postCount > 0 ? 'index,follow' : 'noindex,follow',
        crumbs: [{ label: t('blog.reader.home'), to: '/' }, { label: t('blog.reader.blog'), to: '/blog' }, { label: cat.name }],
        eyebrow: t('blog.reader.archiveCategory'),
      };
    }
    if (kind === 'tag') {
      const tag: PublicBlogTag = await blogApi.tag(slug);
      return {
        title: `${t('blog.reader.archiveTag')} ${tag.name} — ${BLOG_TITLE}`,
        description: null,
        robots: tag.postCount >= 2 ? 'index,follow' : 'noindex,follow',
        crumbs: [{ label: t('blog.reader.home'), to: '/' }, { label: t('blog.reader.blog'), to: '/blog' }, { label: `#${tag.name}` }],
        eyebrow: t('blog.reader.archiveTag'),
      };
    }
    const { author } = await blogApi.author(slug);
    return {
      title: t('blog.reader.archiveAuthorTitle', { name: author.name }) + ` — ${BLOG_TITLE}`,
      description: null,
      robots: 'noindex,follow',
      crumbs: [{ label: t('blog.reader.home'), to: '/' }, { label: t('blog.reader.blog'), to: '/blog' }, { label: author.name }],
      eyebrow: t('blog.reader.author'),
      author,
    };
  }, [kind, slug, valid, locale]);

  const apiQuery = toApiQuery(state, { [kind]: slug });
  const list = useAsync<Paginated<PublicBlogCard> | null>(
    () => (valid ? blogApi.posts(apiQuery) : Promise.resolve(null)),
    [
      valid,
      apiQuery.q,
      apiQuery.category,
      apiQuery.tag,
      apiQuery.author,
      apiQuery.sort,
      apiQuery.reading,
      apiQuery.page,
      apiQuery.pageSize,
    ],
  );
  const categories = useAsync<PublicBlogCategory[] | null>(
    () => (valid && kind !== 'category' ? blogApi.categories() : Promise.resolve(null)),
    [kind, valid],
  );
  const tags = useAsync<PublicBlogTag[] | null>(() => (valid && kind !== 'tag' ? blogApi.tags() : Promise.resolve(null)), [kind, valid]);

  const resolved = head.data;
  // Only the page number is a canonical facet of an archive; search, sort,
  // reading time and cross-taxonomy filters are noindex variants of it.
  const canonical = listHref(base, { ...state, q: '', category: '', tag: '', reading: '', sort: 'newest', pageSize: 9, all: false });
  const thinFacet = Boolean(state.q || state.category || state.tag || state.reading || state.sort !== 'newest' || state.pageSize !== 9);
  usePageMeta(
    resolved
      ? state.q
        ? t('blog.reader.archiveSearch', { query: state.q, title: resolved.title })
        : page > 1
          ? `${resolved.title} — ${t('blog.reader.pageLabel', { n: faNum(page) })}`
          : resolved.title
      : BLOG_TITLE,
    resolved?.description ?? t('blog.reader.archiveDescription'),
    '',
    {
      canonical: resolved && !state.q ? canonical : undefined,
      robots: resolved ? (thinFacet || (list.data && list.data.items.length === 0) ? 'noindex,follow' : resolved.robots) : 'noindex,follow',
      jsonLd: resolved
        ? graphLd(organizationLd(), breadcrumbLd(resolved.crumbs), {
            '@type': 'CollectionPage',
            name: resolved.title,
            url: canonical,
            inLanguage: locale === 'en' ? 'en' : 'fa-IR',
            isPartOf: { '@type': 'Blog', name: BLOG_TITLE },
          })
        : null,
    },
  );

  if (!valid || (head.failure?.status === 404 && !head.loading)) return <ArticleNotFound />;

  return (
    <>
      <section className="blog-hero blog-hero--archive">
        <div className="container blog-hero-inner">
          {resolved ? (
            <>
              <BlogBreadcrumbs items={resolved.crumbs} />
              <div className="blog-eyebrow">
                <span aria-hidden="true" />
                {resolved.eyebrow}
              </div>
              {resolved.author ? (
                <div className="blog-author-hero">
                  <AuthorAvatar author={resolved.author} size={64} />
                  <h1 data-testid="blog-archive-title">{resolved.author.name}</h1>
                </div>
              ) : (
                <h1 data-testid="blog-archive-title">{resolved.crumbs[resolved.crumbs.length - 1].label}</h1>
              )}
              {resolved.description && <p>{resolved.description}</p>}
            </>
          ) : head.loading ? (
            <div className="blog-skeleton-line w-40 tall" aria-busy="true" />
          ) : (
            <BlogNotice
              kind="error"
              title={t('blog.reader.archiveLoadFailed')}
              text={head.error ?? undefined}
              testId="blog-archive-error"
              action={
                <button type="button" className="button button-primary" onClick={() => void head.refetch()}>
                  {t('blog.reader.tryAgain')}
                </button>
              }
            />
          )}
        </div>
      </section>
      <section className="blog-content section">
        <div className="container">
          {resolved ? (
            <>
              <BlogFilters
                state={state}
                onChange={onChange}
                categories={categories.data}
                tags={tags.data}
                lock={kind}
                lockedLabel={resolved.crumbs[resolved.crumbs.length - 1].label}
                showSearch
              />
              <ListSection
                list={list}
                state={state}
                heading={state.q ? t('blog.reader.archiveSearchResults', { query: state.q }) : kind === 'author' ? t('blog.reader.archiveAuthorArticles') : t('blog.reader.archiveArticles')}
                base={base}
                onChange={onChange}
              />
            </>
          ) : head.loading ? (
            <BlogCardsSkeleton count={3} />
          ) : null}
          <div className="blog-more">
            <Link className="outline-link" to="/blog">
              {t('blog.reader.showAllArticles')} <AppIcon name="arrowForward" size="xs" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
