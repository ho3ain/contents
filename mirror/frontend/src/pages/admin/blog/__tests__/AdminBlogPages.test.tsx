import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../../api/client';
import type { AdminBlogCategory, AdminBlogPostDetail, AdminBlogPostRow, AdminBlogTag, BlogOverview } from '../../../../api/blog';
import { ToastProvider } from '../../../../components/Toast';
import { ThemeProvider } from '../../../../theme';
import { AdminBlogPage } from '../AdminBlogPage';
import { AdminBlogEditorPage } from '../AdminBlogEditorPage';
import { AdminBlogTaxonomyPage } from '../AdminBlogTaxonomyPage';

/**
 * Admin CMS — component level, API mocked. The saving model is the point of
 * these tests: diff-only PATCH with `version`, 409 conflict banner, 422
 * checklist, autosave only for non-live articles, unsaved-navigation guard,
 * role-gated controls, bulk actions with confirmation and taxonomy safety
 * (reassign before delete, merge).
 */

const api = vi.hoisted(() => ({
  me: vi.fn(),
  overview: vi.fn(),
  authors: vi.fn(),
  posts: vi.fn(),
  post: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  preview: vi.fn(),
  render: vi.fn(),
  bulk: vi.fn(),
  transition: vi.fn(),
  schedule: vi.fn(),
  revisions: vi.fn(),
  revision: vi.fn(),
  restoreRevision: vi.fn(),
  upload: vi.fn(),
  categories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  tags: vi.fn(),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
  mergeTags: vi.fn(),
}));

vi.mock('../../../../api/blog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../api/blog')>();
  return { ...actual, blogAdminApi: api };
});
// SEO Studio panel inside the editor — isolated here; its own behaviour is covered in editor/__tests__.
vi.mock('../../../../api/seo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../api/seo')>();
  const field = <T,>(effective: T) => ({ stored: null, effective, source: 'fallback' as const });
  return {
    ...actual,
    seoAdminApi: {
      ...actual.seoAdminApi,
      view: vi.fn().mockResolvedValue({
        content: {
          type: 'post',
          id: 'p1',
          title: 'اولین مقاله',
          slug: 'first-post',
          path: '/blog/first-post',
          status: 'draft',
          published: false,
          updatedAt: '',
        },
        fields: {
          seoTitle: field('اولین مقاله'),
          seoDescription: field('خلاصه'),
          canonicalUrl: field('http://localhost/blog/first-post'),
          ogImageUrl: field(null),
          ogTitle: field('اولین مقاله'),
          ogDescription: field('خلاصه'),
          twitterCard: field('summary_large_image'),
          robotsIndex: { stored: null, effective: false, source: 'forced' },
          robotsFollow: field(true),
          language: field('fa'),
        },
        focusKeyword: null,
        relatedKeywords: [],
        translationGroupId: null,
        translations: [],
        storage: 'blog_posts+content_seo',
        updatedAt: null,
      }),
      analyze: vi.fn().mockResolvedValue({
        engine: 'mesh-rules',
        version: 1,
        basis: 'unsaved',
        language: 'fa',
        score: { value: 40, label: 'MESH internal metric', criticalFailed: true, weights: {}, note: { fa: '', en: '' } },
        stats: {
          words: 1,
          sentences: 1,
          paragraphs: 1,
          headings: 1,
          images: 0,
          imagesWithoutAlt: 0,
          internalLinks: 0,
          externalLinks: 0,
          brokenLinks: 0,
          unpublishedLinks: 0,
          keyword: null,
        },
        recommendations: [],
      }),
      analysis: vi.fn().mockResolvedValue(null),
    },
  };
});
vi.mock('../../../../api/endpoints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../api/endpoints')>();
  return {
    ...actual,
    storageApi: {
      ...actual.storageApi,
      capabilities: vi.fn().mockResolvedValue({ enabled: false, driver: 'none', types: [], rules: {}, video: false }),
    },
    agentsApi: {
      ...actual.agentsApi,
      list: vi.fn().mockResolvedValue({ items: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 1 } }),
    },
    catalogApi: { ...actual.catalogApi, categories: vi.fn().mockResolvedValue([]) },
  };
});

const row = (over: Partial<AdminBlogPostRow> = {}): AdminBlogPostRow => ({
  id: 'p1',
  slug: 'first-post',
  title: 'اولین مقاله',
  status: 'draft',
  isFeatured: false,
  readingMinutes: 3,
  wordCount: 400,
  ratingAvg: 0,
  ratingCount: 0,
  commentCount: 0,
  author: { id: 'u1', name: 'سارا', username: 'sara' },
  reviewer: null,
  category: { id: '11111111-1111-4111-8111-111111111111', slug: 'automation', name: 'اتوماسیون' },
  publishedAt: null,
  scheduledFor: null,
  contentUpdatedAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
  createdAt: '2026-09-30T08:00:00.000Z',
  version: 3,
  updatedBy: 'u1',
  ...over,
});

const detail = (over: Partial<AdminBlogPostDetail> = {}): AdminBlogPostDetail => ({
  ...row(),
  excerpt: 'خلاصه',
  bodyMarkdown: '## بخش\n\nمتن',
  blocks: [],
  toc: [],
  featuredImageUrl: null,
  featuredImageAlt: null,
  featuredImageCaption: null,
  seoTitle: null,
  seoDescription: null,
  canonicalUrl: null,
  ogImageUrl: null,
  pillarPostId: null,
  editorialNote: null,
  sources: [],
  tagIds: ['t1'],
  relatedPostIds: [],
  agentIds: [],
  marketCategoryIds: [],
  availableActions: ['submit_review', 'publish', 'schedule', 'archive'],
  readiness: [],
  revisionCount: 2,
  redirects: [],
  refs: { tags: [{ id: 't1', name: 'هوش مصنوعی', slug: 'ai' }], related: [], pillar: null, agents: [], marketCategories: [] },
  ...over,
});

const categories: AdminBlogCategory[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'automation',
    name: 'اتوماسیون',
    nameEn: 'Automation',
    description: null,
    parentId: null,
    sortOrder: 1,
    isActive: true,
    postCount: 2,
    publishedCount: 1,
    updatedAt: '',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    slug: 'guides',
    name: 'راهنما',
    nameEn: null,
    description: null,
    parentId: null,
    sortOrder: 2,
    isActive: true,
    postCount: 0,
    publishedCount: 0,
    updatedAt: '',
  },
];
const tags: AdminBlogTag[] = [
  { id: 't1', slug: 'ai', name: 'هوش مصنوعی', postCount: 3, publishedCount: 2 },
  { id: 't2', slug: 'ai-2', name: 'AI', postCount: 1, publishedCount: 0 },
];
const overview: BlogOverview = { byStatus: { draft: 2, published: 1 }, featured: 1, stale: 0, scheduledNext: null, categories: 2, tags: 2 };

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderAt(path: string) {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/admin/blog" element={<AdminBlogPage />} />
            <Route path="/admin/blog/taxonomy" element={<AdminBlogTaxonomyPage />} />
            <Route path="/admin/blog/posts/:id" element={<AdminBlogEditorPage />} />
            <Route path="/admin/blog/posts/new" element={<AdminBlogEditorPage />} />
            <Route path="/other" element={<div>other page</div>} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </ThemeProvider>,
  );
}

const paginated = <T,>(items: T[]) => ({ items, meta: { page: 1, pageSize: 20, total: items.length, totalPages: 1 } });

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.me.mockResolvedValue({ can: { view: true, manage: true, publish: true } });
  api.overview.mockResolvedValue(overview);
  api.categories.mockResolvedValue(categories);
  api.tags.mockResolvedValue(tags);
  api.authors.mockResolvedValue([{ id: 'u1', name: 'سارا', username: 'sara' }]);
  api.posts.mockResolvedValue(
    paginated([
      row(),
      row({ id: 'p2', slug: 'live-post', title: 'مقالهٔ زنده', status: 'published', publishedAt: '2026-10-01T08:00:00.000Z' }),
    ]),
  );
  api.post.mockResolvedValue(detail());
  // Content Studio hydrates the visual editor from the server block tree.
  api.render.mockResolvedValue({ blocks: [], toc: [], plainText: '', wordCount: 0, readingMinutes: 1, warnings: [] });
  api.revisions.mockResolvedValue([
    { id: 'r1', version: 2, reason: 'save', createdAt: '2026-10-01T08:00:00.000Z', createdBy: null, title: 'اولین مقاله', wordCount: 400 },
  ]);
});
afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe('AdminBlogPage', () => {
  it('renders live counts, rows with status badges and filters through the URL', async () => {
    renderAt('/admin/blog');
    expect(await screen.findByTestId('blog-row-first-post')).toBeInTheDocument();
    expect(within(screen.getByTestId('blog-row-live-post')).getByTestId('blog-status-published')).toBeInTheDocument();
    expect(screen.getByTestId('blog-admin-total')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('blog-admin-status'), { target: { value: 'published' } });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('status=published'));
    await waitFor(() => expect(api.posts).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'published' })));
  });

  it('filters by category id, not slug (the admin API validates a UUID)', async () => {
    renderAt('/admin/blog');
    await screen.findByTestId('blog-row-first-post');
    const select = screen.getByTestId('blog-admin-category');
    expect([...select.querySelectorAll('option')].map((o) => (o as HTMLOptionElement).value)).toEqual([
      '',
      ...categories.map((c) => c.id),
    ]);
    fireEvent.change(select, { target: { value: '11111111-1111-4111-8111-111111111111' } });
    await waitFor(() => expect(api.posts).toHaveBeenLastCalledWith(expect.objectContaining({ category: '11111111-1111-4111-8111-111111111111' })));
  });

  it('ignores a non-uuid category in the URL instead of sending it to the API', async () => {
    renderAt('/admin/blog?category=automation');
    await screen.findByTestId('blog-row-first-post');
    expect(api.posts).toHaveBeenLastCalledWith(expect.objectContaining({ category: undefined }));
  });

  it('hides creation and bulk controls for view-only staff', async () => {
    api.me.mockResolvedValue({ can: { view: true, manage: false, publish: false } });
    renderAt('/admin/blog');
    await screen.findByTestId('blog-row-first-post');
    expect(screen.queryByTestId('blog-new-post')).toBeNull();
    expect(within(screen.getByTestId('blog-admin-table')).queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('runs a bulk action only after confirmation and reports skipped rows', async () => {
    api.bulk.mockResolvedValue({ done: ['p1'], skipped: [{ id: 'p2', reason: 'INVALID_TRANSITION' }] });
    renderAt('/admin/blog');
    await screen.findByTestId('blog-row-first-post');
    fireEvent.click(screen.getByLabelText('انتخاب همهٔ ردیف‌های این صفحه'));
    const bar = await screen.findByTestId('blog-bulkbar');
    fireEvent.click(within(bar).getByText('ویژه کن'));
    expect(api.bulk).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByTestId('blog-bulk-confirm'));
    await waitFor(() => expect(api.bulk).toHaveBeenCalledWith(['p1', 'p2'], 'feature', undefined));
    expect(await screen.findByText(/رد شد: ۱/)).toBeInTheDocument();
  });

  it('shows the designed empty state and the error state', async () => {
    api.posts.mockResolvedValue(paginated([]));
    renderAt('/admin/blog');
    expect(await screen.findByText('هنوز مقاله‌ای ایجاد نشده است')).toBeInTheDocument();
  });
});

describe('AdminBlogEditorPage — saving model', () => {
  it('loads the article and sends only the changed fields with the current version', async () => {
    api.update.mockResolvedValue(detail({ title: 'عنوان جدید', version: 4 }));
    renderAt('/admin/blog/posts/p1');
    const title = await screen.findByTestId('blog-title');
    expect(title).toHaveValue('اولین مقاله');
    expect(screen.getByTestId('blog-editor')).toHaveAttribute('data-dirty', 'false');
    fireEvent.change(title, { target: { value: 'عنوان جدید' } });
    expect(screen.getByTestId('blog-editor')).toHaveAttribute('data-dirty', 'true');
    expect(screen.getByTestId('blog-save-indicator')).toHaveTextContent('تغییرات ذخیره‌نشده');
    fireEvent.click(screen.getByTestId('blog-save'));
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
    expect(api.update).toHaveBeenCalledWith('p1', 3, { title: 'عنوان جدید' }, false);
    await waitFor(() => expect(screen.getByTestId('blog-save-indicator')).toHaveTextContent('ذخیره شد'));
    expect(screen.getByTestId('blog-editor')).toHaveAttribute('data-dirty', 'false');
  });

  it('surfaces a 409 STALE_STATE as a conflict banner and never claims success', async () => {
    api.update.mockRejectedValue(new ApiError('STALE_STATE', 'stale', 409));
    renderAt('/admin/blog/posts/p1');
    fireEvent.change(await screen.findByTestId('blog-title'), { target: { value: 'عنوان جدید' } });
    fireEvent.click(screen.getByTestId('blog-save'));
    expect(await screen.findByTestId('blog-conflict')).toBeInTheDocument();
    expect(screen.getByTestId('blog-save-indicator')).toHaveTextContent('تعارض');
    expect(screen.getByTestId('blog-editor')).toHaveAttribute('data-dirty', 'true');
  });

  it('lets the editor compare with the server copy and recover local edits on top of it', { timeout: 15_000 }, async () => {
    api.update
      .mockRejectedValueOnce(new ApiError('STALE_STATE', 'stale', 409))
      .mockResolvedValueOnce(detail({ title: 'عنوان جدید', version: 8 }));
    api.post
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(detail({ version: 7, excerpt: 'خلاصهٔ همکار', updatedAt: '2026-10-02T08:00:00.000Z' }));
    renderAt('/admin/blog/posts/p1');
    fireEvent.change(await screen.findByTestId('blog-title'), { target: { value: 'عنوان جدید' } });
    fireEvent.click(screen.getByTestId('blog-save'));
    await screen.findByTestId('blog-conflict');
    await waitFor(() => expect(screen.getByTestId('blog-conflict-compare')).toBeEnabled());
    fireEvent.click(screen.getByTestId('blog-conflict-compare'));
    const diff = await screen.findByTestId('blog-conflict-diff');
    expect(diff).toHaveTextContent('عنوان جدید');
    expect(diff).toHaveTextContent('خلاصهٔ همکار');
    fireEvent.click(screen.getByTestId('blog-conflict-recover'));
    await waitFor(() => expect(screen.queryByTestId('blog-conflict')).not.toBeInTheDocument());
    expect(screen.getByTestId('blog-title')).toHaveValue('عنوان جدید');
    expect(screen.getByTestId('blog-excerpt')).toHaveValue('خلاصهٔ همکار');
    fireEvent.click(screen.getByTestId('blog-save'));
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(2));
    expect(api.update).toHaveBeenLastCalledWith('p1', 7, { title: 'عنوان جدید' }, false);
  });

  it('keeps unsaved edits in local storage and offers to restore them after a reload', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const first = renderAt('/admin/blog/posts/p1');
    fireEvent.change(await screen.findByTestId('blog-title'), { target: { value: 'ویرایش محلی' } });
    await act(() => vi.advanceTimersByTimeAsync(1_200));
    expect(window.localStorage.getItem('mesh-blog-draft:p1')).toContain('ویرایش محلی');
    first.unmount();
    vi.useRealTimers();
    renderAt('/admin/blog/posts/p1');
    const banner = await screen.findByTestId('blog-local-draft');
    fireEvent.click(within(banner).getByTestId('blog-local-draft-restore'));
    expect(screen.getByTestId('blog-title')).toHaveValue('ویرایش محلی');
    expect(screen.getByTestId('blog-editor')).toHaveAttribute('data-dirty', 'true');
  });

  it('switches between the visual Content Studio and the Markdown fallback over the same body', async () => {
    renderAt('/admin/blog/posts/p1');
    expect(await screen.findByTestId('content-studio')).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('blog-body-mode')).getByText('مارک‌داون'));
    const textarea = screen.getByTestId('blog-body');
    expect(textarea).toHaveValue('## بخش\n\nمتن');
    fireEvent.change(textarea, { target: { value: '## بخش\n\nمتن تازه' } });
    expect(screen.getByTestId('blog-editor')).toHaveAttribute('data-dirty', 'true');
    fireEvent.click(within(screen.getByTestId('blog-body-mode')).getByText('بصری'));
    await waitFor(() => expect(api.render).toHaveBeenCalledWith('## بخش\n\nمتن تازه'));
    window.localStorage.removeItem('mesh-blog-body-mode');
  });

  it('shows the publish checklist from a 422 and keeps the article unpublished', async () => {
    api.transition.mockRejectedValue(
      new ApiError('PUBLISH_CHECKLIST_FAILED', 'checklist', 422, {
        issues: [
          { code: 'excerpt_missing', severity: 'error' },
          { code: 'image_alt_missing', severity: 'error' },
        ],
      }),
    );
    renderAt('/admin/blog/posts/p1');
    fireEvent.click(await screen.findByTestId('blog-action-publish'));
    fireEvent.click(await screen.findByTestId('blog-confirm-action'));
    await waitFor(() => expect(api.transition).toHaveBeenCalledWith('p1', 'publish', undefined));
    expect(await screen.findByText('خلاصهٔ مقاله نوشته نشده است.')).toBeInTheDocument();
    expect(screen.getByText('تصویر شاخص متن جایگزین (alt) ندارد.')).toBeInTheDocument();
    expect(screen.queryByTestId('blog-status-published')).toBeNull();
  });

  it('publishes after confirmation and reflects the new state', async () => {
    api.transition.mockResolvedValue(
      detail({ status: 'published', publishedAt: '2026-10-05T08:00:00.000Z', availableActions: ['unpublish'], version: 4 }),
    );
    renderAt('/admin/blog/posts/p1');
    fireEvent.click(await screen.findByTestId('blog-action-publish'));
    fireEvent.click(await screen.findByTestId('blog-confirm-action'));
    expect(await screen.findByTestId('blog-status-published')).toBeInTheDocument();
    expect(screen.getByTestId('blog-action-unpublish')).toBeInTheDocument();
    expect(screen.queryByTestId('blog-action-publish')).toBeNull();
    expect(screen.queryByTestId('blog-action-delete')).toBeNull();
  });

  it('hides publish actions from staff without the publish permission', async () => {
    api.me.mockResolvedValue({ can: { view: true, manage: true, publish: false } });
    renderAt('/admin/blog/posts/p1');
    await screen.findByTestId('blog-title');
    await waitFor(() => expect(screen.getByTestId('blog-action-submit_review')).toBeInTheDocument());
    expect(screen.queryByTestId('blog-action-publish')).toBeNull();
    expect(screen.queryByTestId('blog-action-schedule')).toBeNull();
  });

  it('autosaves a draft 30 s after the last change but never a published article', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.update.mockResolvedValue(detail({ title: 'x', version: 4 }));
    renderAt('/admin/blog/posts/p1');
    const title = await screen.findByTestId('blog-title');
    fireEvent.change(title, { target: { value: 'عنوان خودکار' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    expect(api.update).toHaveBeenCalledWith('p1', 3, { title: 'عنوان خودکار' }, true);
    vi.useRealTimers();
  });

  it('does not autosave a published article', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.post.mockResolvedValue(detail({ status: 'published', publishedAt: '2026-10-01T08:00:00.000Z', availableActions: ['unpublish'] }));
    renderAt('/admin/blog/posts/p1');
    fireEvent.change(await screen.findByTestId('blog-title'), { target: { value: 'عنوان جدید' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40_000);
    });
    expect(api.update).not.toHaveBeenCalled();
    expect(screen.getByTestId('blog-editor')).toHaveAttribute('data-dirty', 'true');
    vi.useRealTimers();
  });

  it('guards in-app navigation while dirty and lets the user save-and-leave', async () => {
    api.update.mockResolvedValue(detail({ title: 'عنوان جدید', version: 4 }));
    render(
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/admin/blog/posts/p1']}>
            <a href="/other">leave</a>
            <Routes>
              <Route path="/admin/blog/posts/:id" element={<AdminBlogEditorPage />} />
              <Route path="/other" element={<div>other page</div>} />
            </Routes>
            <LocationProbe />
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );
    fireEvent.change(await screen.findByTestId('blog-title'), { target: { value: 'عنوان جدید' } });
    fireEvent.click(screen.getByText('leave'));
    expect(await screen.findByTestId('blog-leave-save')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/blog/posts/p1');
    fireEvent.click(screen.getByTestId('blog-leave-save'));
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/other'));
  });

  it('creates a draft from the new-article form and moves to its edit URL', async () => {
    api.create.mockResolvedValue(
      detail({ id: 'p9', slug: 'new-one', title: 'مقالهٔ تازه', version: 1, availableActions: ['submit_review'] }),
    );
    renderAt('/admin/blog/posts/new');
    fireEvent.change(await screen.findByTestId('blog-title'), { target: { value: 'مقالهٔ تازه' } });
    fireEvent.click(screen.getByTestId('blog-save'));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ title: 'مقالهٔ تازه' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/admin/blog/posts/p9'));
  });

  it('shows a real not-found state for unknown ids', async () => {
    api.post.mockRejectedValue(new ApiError('NOT_FOUND', 'nope', 404));
    renderAt('/admin/blog/posts/missing');
    expect(await screen.findByText('مقاله پیدا نشد یا حذف شده است.')).toBeInTheDocument();
  });

  it('restores a revision only after confirmation', async () => {
    api.restoreRevision.mockResolvedValue(detail({ title: 'نسخهٔ قدیمی', version: 4 }));
    renderAt('/admin/blog/posts/p1');
    await screen.findByTestId('blog-title');
    fireEvent.click(await screen.findByRole('button', { name: 'بازگردانی' }));
    expect(api.restoreRevision).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByTestId('blog-confirm-restore'));
    await waitFor(() => expect(api.restoreRevision).toHaveBeenCalledWith('p1', 'r1'));
    await waitFor(() => expect(screen.getByTestId('blog-title')).toHaveValue('نسخهٔ قدیمی'));
  });
});

describe('AdminBlogTaxonomyPage', () => {
  it('requires a reassignment target before deleting a category with articles', async () => {
    api.deleteCategory.mockResolvedValue({ reassigned: 2 });
    renderAt('/admin/blog/taxonomy');
    await screen.findByTestId('blog-category-automation');
    fireEvent.click(screen.getByTestId('blog-category-delete-automation'));
    const confirm = await screen.findByTestId('blog-category-delete-confirm');
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByTestId('blog-category-reassign'), { target: { value: '22222222-2222-4222-8222-222222222222' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(api.deleteCategory).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'));
  });

  it('creates a category and surfaces server validation errors', async () => {
    api.createCategory.mockRejectedValue(new ApiError('CONFLICT', 'A category named "x" already exists', 409));
    renderAt('/admin/blog/taxonomy');
    await screen.findByTestId('blog-category-automation');
    fireEvent.click(screen.getByTestId('blog-taxonomy-create'));
    fireEvent.change(await screen.findByTestId('bc-name'), { target: { value: 'اتوماسیون' } });
    fireEvent.click(screen.getByTestId('blog-category-save'));
    expect(await screen.findByText('دسته‌ای با این نام وجود دارد.')).toBeInTheDocument();
  });

  it('merges selected tags into a chosen target', async () => {
    api.mergeTags.mockResolvedValue(tags[0]);
    renderAt('/admin/blog/taxonomy');
    await screen.findByTestId('blog-category-automation');
    fireEvent.click(screen.getByRole('tab', { name: /برچسب‌ها/ }));
    await screen.findByTestId('blog-tag-ai');
    fireEvent.click(screen.getByLabelText('هوش مصنوعی'));
    fireEvent.click(screen.getByLabelText('AI'));
    fireEvent.click(await screen.findByTestId('blog-tags-merge'));
    fireEvent.change(await screen.findByTestId('blog-tags-merge-target'), { target: { value: 't1' } });
    fireEvent.click(screen.getByTestId('blog-tags-merge-confirm'));
    await waitFor(() => expect(api.mergeTags).toHaveBeenCalledWith(['t2'], 't1'));
  });
});
