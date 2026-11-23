import { Link, useParams } from 'react-router-dom';
import { blogAdminApi, type PublicBlogPostDetail } from '../../../api/blog';
import { useAsync } from '../../../lib/useAsync';
import { usePageMeta } from '../../../lib/usePageMeta';
import { ArticleView } from '../../blog/BlogArticlePage';
import { BlogNotice } from '../../blog/blogShared';
import { t } from '../../../i18n';
import { AppIcon } from '../../../components/ui/AppIcon';

/**
 * `/admin/blog/posts/:id/preview` — the article exactly as readers will see
 * it, served by `GET /admin/blog/preview` (blog:view). Anonymous visitors
 * never reach this route (RequireRole) and the server enforces the
 * permission regardless; the page is noindex and carries a visible banner.
 */
export function AdminBlogPreviewPage() {
  const { id = '' } = useParams();
  const preview = useAsync<PublicBlogPostDetail>(() => blogAdminApi.preview(id), [id]);
  usePageMeta(t('blog.editor.preview'), undefined, 'MESH', { robots: 'noindex,nofollow' });

  if (preview.loading) {
    return (
      <div className="container article-state" aria-busy="true">
        <div className="blog-skeleton-line w-40" />
        <div className="blog-skeleton-line w-90 tall" />
        <div className="blog-skeleton-block" />
      </div>
    );
  }
  if (preview.error || !preview.data) {
    return (
      <div className="container article-state">
        <BlogNotice
          kind={preview.failure?.status === 404 ? 'missing' : 'error'}
          title={preview.failure?.status === 404 ? t('blog.err.notFound') : t('blog.editor.previewFailed')}
          text={preview.failure?.status === 404 ? undefined : (preview.error ?? undefined)}
          testId="blog-preview-error"
          action={
            <Link className="button button-primary" to="/admin/blog">
              {t('blog.common.backToList')}
            </Link>
          }
        />
      </div>
    );
  }
  return (
    <>
      <div className="blog-preview-toolbar">
        <Link to={`/admin/blog/posts/${id}`} className="button button-light">
          <AppIcon name="arrowBack" size="xs" /> {t('blog.editor.backToEditor')}
        </Link>
      </div>
      <ArticleView post={preview.data} preview />
    </>
  );
}
