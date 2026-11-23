import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AppProviders } from './app/providers';
import { PageLoader } from './components/ui';

/**
 * Route tree for the EXTRACTED content-production UI.
 *
 * This file is NOT part of the MESH source. It is scaffolding: a trimmed copy
 * of the content routes declared in `src/app/router.tsx` (which is in the
 * mirror, tier `reference`, and still shows the full original wiring).
 *
 * ---------------------------------------------------------------------------
 * NO AUTHORISATION IS APPLIED HERE
 * ---------------------------------------------------------------------------
 * In MESH the `/admin/blog/**` routes sit inside an admin layout behind a
 * permission guard (`blog:view` / `blog:manage` / `blog:publish`, declared
 * backend-side in `src/modules/control-plane/authz/route-permissions.ts`).
 * That guard is NOT reproduced below, because it belongs to the control-plane
 * subsystem rather than to the content feature.
 *
 * >> Everything under /admin/blog is reachable by anyone who loads this app.
 * >> Re-attach your own route guard before shipping.
 * The API still enforces its own permissions, so an unauthenticated visitor
 * sees failing requests rather than data — but the screens do render.
 */

// Public reading surface.
const BlogHomePage = lazy(() =>
  import('./pages/blog/BlogHomePage').then((m) => ({ default: m.BlogHomePage })),
);
const BlogArticlePage = lazy(() =>
  import('./pages/blog/BlogArticlePage').then((m) => ({ default: m.BlogArticlePage })),
);
const BlogArchivePage = lazy(() =>
  import('./pages/blog/BlogArchivePage').then((m) => ({ default: m.BlogArchivePage })),
);

// Editorial CMS.
const AdminBlogPage = lazy(() =>
  import('./pages/admin/blog/AdminBlogPage').then((m) => ({ default: m.AdminBlogPage })),
);
const AdminBlogEditorPage = lazy(() =>
  import('./pages/admin/blog/AdminBlogEditorPage').then((m) => ({ default: m.AdminBlogEditorPage })),
);
const AdminBlogPreviewPage = lazy(() =>
  import('./pages/admin/blog/AdminBlogPreviewPage').then((m) => ({ default: m.AdminBlogPreviewPage })),
);
const AdminBlogTaxonomyPage = lazy(() =>
  import('./pages/admin/blog/AdminBlogTaxonomyPage').then((m) => ({ default: m.AdminBlogTaxonomyPage })),
);
const AdminBlogCommentsPage = lazy(() =>
  import('./pages/admin/blog/AdminBlogCommentsPage').then((m) => ({ default: m.AdminBlogCommentsPage })),
);
const AdminKnowledgeGraphPage = lazy(() =>
  import('./pages/admin/blog/graph/AdminKnowledgeGraphPage').then((m) => ({
    default: m.AdminKnowledgeGraphPage,
  })),
);

export default function ContentApp() {
  return (
    <AppProviders>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Navigate to="/blog" replace />} />

          {/* Literal archive routes MUST precede the :slug pattern, otherwise
              /blog/category/x is read as an article slug. Same order as MESH. */}
          <Route path="/blog" element={<BlogHomePage />} />
          <Route path="/blog/category/:slug" element={<BlogArchivePage kind="category" />} />
          <Route path="/blog/tag/:slug" element={<BlogArchivePage kind="tag" />} />
          <Route path="/blog/author/:slug" element={<BlogArchivePage kind="author" />} />
          <Route path="/blog/:slug" element={<BlogArticlePage />} />

          {/* `posts/new` MUST precede `posts/:id`. Same order as MESH. */}
          <Route path="/admin/blog" element={<AdminBlogPage />} />
          <Route path="/admin/blog/posts/new" element={<AdminBlogEditorPage />} />
          <Route path="/admin/blog/posts/:id" element={<AdminBlogEditorPage />} />
          <Route path="/admin/blog/posts/:id/preview" element={<AdminBlogPreviewPage />} />
          <Route path="/admin/blog/taxonomy" element={<AdminBlogTaxonomyPage />} />
          <Route path="/admin/blog/comments" element={<AdminBlogCommentsPage />} />
          <Route path="/admin/blog/graph" element={<AdminKnowledgeGraphPage />} />

          <Route path="*" element={<Navigate to="/blog" replace />} />
        </Routes>
      </Suspense>
    </AppProviders>
  );
}
