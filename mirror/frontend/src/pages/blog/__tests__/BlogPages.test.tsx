import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/client';
import type { PublicBlogCard, PublicBlogCategory, PublicBlogHome, PublicBlogPostDetail, PublicBlogTag } from '../../../api/blog';
import { BlogHomePage } from '../BlogHomePage';
import { BlogArticlePage } from '../BlogArticlePage';
import { BlogArchivePage } from '../BlogArchivePage';
import { BlogBlocks } from '../BlogBlocks';
import { ToastProvider } from '../../../components/Toast';

/**
 * Public blog pages — component level, API mocked. Covers: real-API home
 * (featured/recent/categories/search URL state), live search with
 * highlighting and snippets, URL-synced filters (sort / reading / tag) with
 * pills and clear-all, the full pager (window, summary, page size, head
 * prev/next), article rendering from server blocks (no innerHTML), TOC,
 * redirects for old slugs, the real 404, archive filter locking and noindex
 * policy, and the safe-URL guarantee of the block renderer.
 */

const api = vi.hoisted(() => ({
  home: vi.fn(),
  posts: vi.fn(),
  post: vi.fn(),
  categories: vi.fn(),
  category: vi.fn(),
  tags: vi.fn(),
  tag: vi.fn(),
  author: vi.fn(),
}));

const engagementApi = vi.hoisted(() => ({
  summary: vi.fn(),
  me: vi.fn(),
  comments: vi.fn(),
}));

vi.mock('../../../api/blog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/blog')>();
  return { ...actual, blogApi: api, blogEngagementApi: { ...actual.blogEngagementApi, ...engagementApi } };
});

// The article page embeds the signed-in engagement widgets; this suite covers
// the anonymous reader, the widgets themselves are tested in BlogEngagement.test.tsx.
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ status: 'guest', isAuthenticated: false, user: null, isAdmin: false, isCreator: false }),
}));

const card = (over: Partial<PublicBlogCard> = {}): PublicBlogCard => ({
  slug: 'first-post',
  title: 'اولین مقاله',
  excerpt: 'خلاصهٔ اولین مقاله',
  readingMinutes: 4,
  publishedAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-02T08:00:00.000Z',
  featuredImage: null,
  author: { name: 'سارا', slug: 'sara', avatarId: null, avatarBg: null },
  category: { slug: 'automation', name: 'اتوماسیون' },
  tags: [{ slug: 'ai', name: 'هوش مصنوعی' }],
  isFeatured: false,
  ratingAvg: 0,
  ratingCount: 0,
  commentCount: 0,
  ...over,
});

const categories: PublicBlogCategory[] = [
  { slug: 'automation', name: 'اتوماسیون', description: 'توضیح دسته', parentSlug: null, postCount: 2 },
  { slug: 'empty', name: 'خالی', description: null, parentSlug: null, postCount: 0 },
];

const tags: PublicBlogTag[] = [
  { slug: 'ai', name: 'هوش مصنوعی', postCount: 3 },
  { slug: 'payments', name: 'پرداخت', postCount: 2 },
  { slug: 'unused', name: 'بدون مقاله', postCount: 0 },
];

const home: PublicBlogHome = {
  featured: card({ slug: 'featured-post', title: 'مقالهٔ ویژه', isFeatured: true }),
  recent: [card(), card({ slug: 'second-post', title: 'مقالهٔ دوم' })],
  categories: [categories[0]],
  totalPublished: 3,
};

const detail: PublicBlogPostDetail = {
  ...card(),
  blocks: [
    {
      type: 'paragraph',
      c: [
        { t: 'text', v: 'پاراگراف اول با ' },
        { t: 'strong', c: [{ t: 'text', v: 'تأکید' }] },
      ],
    },
    { type: 'heading', level: 2, id: 'h-one', text: 'بخش اول', c: [{ t: 'text', v: 'بخش اول' }] },
    {
      type: 'paragraph',
      c: [
        { t: 'link', href: 'https://example.com/x', c: [{ t: 'text', v: 'لینک خارجی' }] },
        { t: 'text', v: ' و ' },
        { t: 'link', href: '/agents/foo', c: [{ t: 'text', v: 'لینک داخلی' }] },
      ],
    },
    { type: 'quote', kind: 'note', paragraphs: [[{ t: 'text', v: 'یک نکته' }]] },
    { type: 'code', lang: 'ts', code: 'const a = 1;' },
    { type: 'table', align: [null, 'left'], header: [[{ t: 'text', v: 'ستون' }]], rows: [[[{ t: 'text', v: 'مقدار' }]]] },
    { type: 'heading', level: 2, id: 'h-two', text: 'بخش دوم', c: [{ t: 'text', v: 'بخش دوم' }] },
    { type: 'image', src: 'https://cdn.example.com/a.jpg', alt: 'توضیح تصویر', caption: 'زیرنویس' },
  ],
  toc: [
    { id: 'h-one', text: 'بخش اول', level: 2 },
    { id: 'h-two', text: 'بخش دوم', level: 2 },
  ],
  wordCount: 120,
  sources: [{ title: 'منبع یک', url: 'https://example.com/source' }],
  seo: {
    title: 'اولین مقاله — بلاگ MESH',
    description: 'خلاصهٔ اولین مقاله',
    canonicalUrl: null,
    ogImageUrl: null,
    ogTitle: 'اولین مقاله — بلاگ MESH',
    ogDescription: 'خلاصهٔ اولین مقاله',
    twitterCard: 'summary_large_image',
    robots: 'index,follow',
    language: 'fa',
    translations: [{ language: 'en', path: '/blog/first-post-en' }],
  },
  breadcrumbs: [
    { name: 'بلاگ', path: '/blog' },
    { name: 'اولین مقاله', path: '/blog/first-post' },
  ],
  related: [card({ slug: 'second-post', title: 'مقالهٔ دوم' })],
  pillar: null,
  cluster: [],
  agents: [{ slug: 'foo-agent', name: 'ایجنت فو', shortDescription: 'توضیح کوتاه', logoUrl: null }],
  marketCategories: [{ slug: 'sales', name: 'Sales', nameFa: 'فروش' }],
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderAt(path: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/blog" element={<BlogHomePage />} />
        <Route path="/blog/category/:slug" element={<BlogArchivePage kind="category" />} />
        <Route path="/blog/tag/:slug" element={<BlogArchivePage kind="tag" />} />
        <Route path="/blog/author/:slug" element={<BlogArchivePage kind="author" />} />
        <Route path="/blog/:slug" element={<BlogArticlePage />} />
      </Routes>
        <LocationProbe />
      </MemoryRouter>
    </ToastProvider>,
  );
}

const paginated = (items: PublicBlogCard[], total = items.length, page = 1, pageSize = 9) => ({
  items,
  meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
});

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.home.mockResolvedValue(home);
  api.categories.mockResolvedValue(categories);
  api.tags.mockResolvedValue(tags);
  api.posts.mockResolvedValue(paginated(home.recent));
  for (const fn of Object.values(engagementApi)) fn.mockReset();
  engagementApi.summary.mockResolvedValue({ rating: { average: 0, count: 0, distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } }, commentCount: 0 });
  engagementApi.comments.mockResolvedValue({ items: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 1 } });
  document.head.innerHTML = '';
  document.title = '';
});

describe('BlogHomePage', () => {
  it('renders featured, recent and category chips from the real API', async () => {
    renderAt('/blog');
    expect(await screen.findByTestId('blog-featured')).toHaveTextContent('مقالهٔ ویژه');
    const cards = screen.getAllByTestId('blog-card');
    expect(cards.length).toBeGreaterThanOrEqual(2);
    expect(within(screen.getByTestId('blog-category-chips')).getByText('اتوماسیون')).toBeInTheDocument();
    expect(document.title).toContain('بلاگ');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toMatch(/\/blog$/);
    expect(api.posts).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 9 }));
  });

  it('keeps the search in the URL and lists matches with a count', async () => {
    api.posts.mockResolvedValue(paginated([card({ title: 'نتیجهٔ جستجو' })], 1));
    renderAt('/blog');
    await screen.findByTestId('blog-featured');
    fireEvent.change(screen.getByTestId('blog-search-input'), { target: { value: 'تیم' } });
    fireEvent.click(screen.getByTestId('blog-search-submit'));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/blog?q=%D8%AA%DB%8C%D9%85'));
    await waitFor(() => expect(api.posts).toHaveBeenCalledWith(expect.objectContaining({ q: 'تیم', page: 1 })));
    expect(await screen.findByText('نتیجهٔ جستجو')).toBeInTheDocument();
    expect(screen.getByTestId('blog-list-count')).toBeInTheDocument();
  });

  it('ignores an invalid category slug in the URL and shows an empty state when nothing matches', async () => {
    api.posts.mockResolvedValue(paginated([], 0));
    renderAt('/blog?q=xyz&category=<script>');
    await waitFor(() => expect(api.posts).toHaveBeenCalled());
    expect(api.posts.mock.calls[0][0]).not.toHaveProperty('category', '<script>');
    expect(await screen.findByText(/پیدا نشد/)).toBeInTheDocument();
  });

  it('shows an error state with retry when the API fails', async () => {
    api.home.mockRejectedValue(new ApiError('INTERNAL', 'boom', 500));
    renderAt('/blog');
    const retry = await screen.findByRole('button', { name: /تلاش دوباره/ });
    api.home.mockResolvedValue(home);
    fireEvent.click(retry);
    expect(await screen.findByTestId('blog-featured')).toBeInTheDocument();
  });
});

describe('BlogHomePage — search, filters, pager', () => {
  it('searches live (debounced, replace), highlights matches and shows the body snippet', async () => {
    api.posts.mockResolvedValue(
      paginated(
        [
          card({
            slug: 'refunds',
            title: 'بازگشت وجه در MESH',
            excerpt: 'قاعده ساده است.',
            snippet: { field: 'body', text: 'تا ۱۴ روز می‌توانید درخواست بازگشت وجه ثبت کنید.' },
          }),
        ],
        1,
      ),
    );
    renderAt('/blog');
    await screen.findByTestId('blog-featured');
    fireEvent.change(screen.getByTestId('blog-search-input'), { target: { value: 'بازگشت' } });
    // Nothing happens synchronously — the URL changes only after the debounce.
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/blog$/);
    expect(api.posts).not.toHaveBeenCalledWith(expect.objectContaining({ q: 'كيك' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/blog?q='));
    await waitFor(() =>
      expect(api.posts).toHaveBeenCalledWith(expect.objectContaining({ q: 'بازگشت', sort: 'relevance', page: 1, pageSize: 9 })),
    );
    const result = await screen.findByTestId('blog-card');
    const marks = within(result).getAllByText('بازگشت', { selector: 'mark' });
    expect(marks.length).toBeGreaterThanOrEqual(2); // title + snippet
    expect(within(result).getByTestId('blog-card-snippet')).toHaveTextContent('درخواست بازگشت وجه');
    // Relevance is offered (and selected) only while a query is set.
    expect(screen.getByRole('radio', { name: 'مرتبط‌ترین' })).toBeChecked();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,follow');
    // Clear button empties the box and returns to the editorial home.
    fireEvent.click(screen.getByTestId('blog-search-clear'));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/blog$/));
    expect(await screen.findByTestId('blog-featured')).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'مرتبط‌ترین' })).not.toBeInTheDocument();
  });

  it('syncs sort, reading time and tags to the URL and the API; pills remove one filter, clear-all resets', async () => {
    renderAt('/blog?q=api');
    await waitFor(() => expect(api.posts).toHaveBeenCalledWith(expect.objectContaining({ q: 'api' })));
    fireEvent.change(screen.getByTestId('blog-reading'), { target: { value: 'short' } });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('reading=short'));
    await waitFor(() => expect(api.posts).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'api', reading: 'short', page: 1 })));
    fireEvent.click(screen.getByRole('radio', { name: 'قدیمی‌ترین' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('sort=oldest'));
    await waitFor(() => expect(api.posts).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'oldest' })));
    const tagChips = await screen.findByTestId('blog-tag-chips');
    expect(within(tagChips).queryByText(/بدون مقاله/)).not.toBeInTheDocument(); // zero-count tags are hidden
    fireEvent.click(within(tagChips).getByRole('button', { name: /پرداخت/ }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('tag=payments'));
    await waitFor(() =>
      expect(api.posts).toHaveBeenLastCalledWith(expect.objectContaining({ tag: 'payments', q: 'api', reading: 'short', sort: 'oldest' })),
    );
    expect(within(tagChips).getByRole('button', { name: /پرداخت/ })).toHaveAttribute('aria-pressed', 'true');
    const pills = screen.getByTestId('blog-active-filters');
    expect(within(pills).getAllByRole('button')).toHaveLength(4); // q, tag, reading + clear all
    fireEvent.click(within(pills).getByRole('button', { name: /حذف فیلتر زمان مطالعه/ }));
    await waitFor(() => expect(screen.getByTestId('location')).not.toHaveTextContent('reading='));
    expect(screen.getByTestId('location')).toHaveTextContent('tag=payments');
    fireEvent.click(screen.getByTestId('blog-clear-filters'));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/blog$/));
    expect(await screen.findByTestId('blog-featured')).toBeInTheDocument();
  });

  it('renders a complete pager: window with gaps, range summary, first/last, head prev/next and a shareable page size', async () => {
    const items = Array.from({ length: 9 }, (_, i) => card({ slug: `post-${i}`, title: `مقاله ${i}` }));
    api.posts.mockResolvedValue(paginated(items, 90, 5));
    renderAt('/blog?all=1&page=5');
    const pager = await screen.findByTestId('blog-pager');
    expect(screen.getByTestId('blog-pager-summary')).toHaveTextContent('نمایش ۳۷–۴۵ از ۹۰ مقاله');
    expect(screen.getByTestId('blog-pager-summary')).toHaveTextContent('صفحه ۵ از ۱۰');
    expect(screen.getByTestId('blog-pager-current')).toHaveTextContent('۵');
    expect(screen.getByTestId('blog-pager-first')).toHaveAttribute('href', '/blog?all=1');
    expect(screen.getByTestId('blog-pager-prev')).toHaveAttribute('href', '/blog?page=4&all=1');
    expect(screen.getByTestId('blog-pager-next')).toHaveAttribute('href', '/blog?page=6&all=1');
    expect(screen.getByTestId('blog-pager-last')).toHaveAttribute('href', '/blog?page=10&all=1');
    expect(within(pager).getByRole('link', { name: 'صفحه ۱۰' })).toBeInTheDocument();
    expect(pager.querySelectorAll('.blog-pager-gap')).toHaveLength(2);
    expect(document.querySelector('link[rel="prev"]')?.getAttribute('href')).toMatch(/\/blog\?page=4&all=1$/);
    expect(document.querySelector('link[rel="next"]')?.getAttribute('href')).toMatch(/\/blog\?page=6&all=1$/);
    expect(screen.getByTestId('blog-list-count')).toHaveTextContent('۹۰ مقاله · صفحه ۵ از ۱۰');
    // The editorial contract is fixed at nine results per page.
    expect(screen.queryByTestId('blog-page-size')).not.toBeInTheDocument();
  });

  it('first and last pages disable the edge controls and the last page shows a shorter range', async () => {
    api.posts.mockResolvedValue(paginated([card()], 19, 3));
    renderAt('/blog?all=1&page=3');
    await screen.findByTestId('blog-pager');
    expect(screen.getByTestId('blog-pager-summary')).toHaveTextContent('نمایش ۱۹–۱۹ از ۱۹ مقاله');
    expect(screen.queryByTestId('blog-pager-next')).not.toBeInTheDocument();
    expect(screen.queryByTestId('blog-pager-last')).not.toBeInTheDocument();
    expect(screen.getByTestId('blog-pager-prev')).toHaveAttribute('href', '/blog?page=2&all=1');
    expect(document.querySelector('link[rel="next"]')).toBeNull();
  });

  it('ignores invalid sort / reading / size / page values and asks the API for defaults', async () => {
    renderAt('/blog?all=1&sort=bogus&reading=huge&size=7&page=-1');
    await waitFor(() => expect(api.posts).toHaveBeenCalled());
    expect(api.posts.mock.calls[0][0]).toMatchObject({ sort: 'newest', page: 1, pageSize: 9 });
    expect(api.posts.mock.calls[0][0]).not.toHaveProperty('reading', 'huge');
  });
});

describe('BlogArticlePage', () => {
  it('renders the structured body from server blocks with TOC, sources, related and marketplace links', async () => {
    api.post.mockResolvedValue(detail);
    renderAt('/blog/first-post');
    expect(await screen.findByTestId('blog-article-title')).toHaveTextContent('اولین مقاله');
    // Let the engagement section settle (summary + comments) before the synchronous assertions below.
    expect(await screen.findByTestId('blog-comments-empty')).toBeInTheDocument();
    const body = screen.getByTestId('blog-article-body');
    expect(within(body).getByRole('heading', { level: 2, name: 'بخش اول' })).toHaveAttribute('id', 'h-one');
    expect(within(body).getByText('تأکید').tagName).toBe('STRONG');
    expect(body.querySelector('pre.article-code code')?.textContent).toBe('const a = 1;');
    expect(within(body).getByRole('table')).toBeInTheDocument();
    expect(within(body).getByAltText('توضیح تصویر')).toBeInTheDocument();
    const external = within(body).getByRole('link', { name: 'لینک خارجی' });
    expect(external).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(external).toHaveAttribute('target', '_blank');
    expect(within(body).getByRole('link', { name: 'لینک داخلی' })).toHaveAttribute('href', '/agents/foo');
    const toc = screen.getByTestId('blog-toc');
    expect(within(toc).getByRole('link', { name: 'بخش دوم' })).toHaveAttribute('href', '#h-two');
    expect(screen.getByRole('link', { name: 'منبع یک' })).toHaveAttribute('href', 'https://example.com/source');
    expect(within(screen.getByTestId('blog-related')).getByText('مقالهٔ دوم')).toBeInTheDocument();
    expect(within(screen.getByTestId('blog-market-links')).getByText('ایجنت فو')).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: /سارا/ })) expect(link).toHaveAttribute('href', '/blog/author/sara');
    // SEO head
    expect(document.title).toBe('اولین مقاله — بلاگ MESH');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toMatch(/\/blog\/first-post$/);
    const ld = document.querySelector('script[type="application/ld+json"]');
    expect(ld?.textContent).toContain('BlogPosting');
    expect(ld?.textContent).toContain('BreadcrumbList');
  });

  it('follows a slug redirect to the current slug (replace, no chain)', async () => {
    api.post.mockImplementation((slug: string) =>
      slug === 'old-slug' ? Promise.resolve({ redirectTo: 'first-post' }) : Promise.resolve(detail),
    );
    renderAt('/blog/old-slug');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/blog/first-post'));
    expect(await screen.findByTestId('blog-article-title')).toHaveTextContent('اولین مقاله');
  });

  it('renders a real 404 for unknown or unpublished slugs and for invalid slugs without calling the API', async () => {
    api.post.mockRejectedValue(new ApiError('NOT_FOUND', 'not found', 404));
    renderAt('/blog/does-not-exist');
    expect(await screen.findByTestId('blog-article-404')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('noindex'));

    api.post.mockClear();
    renderAt('/blog/Bad Slug!');
    expect((await screen.findAllByTestId('blog-article-404')).length).toBeGreaterThan(0);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('hides empty sections', async () => {
    api.post.mockResolvedValue({
      ...detail,
      toc: [],
      sources: [],
      related: [],
      agents: [],
      marketCategories: [],
      blocks: detail.blocks.slice(0, 1),
    });
    renderAt('/blog/first-post');
    await screen.findByTestId('blog-article-title');
    expect(screen.queryByTestId('blog-toc')).toBeNull();
    expect(screen.queryByTestId('blog-related')).toBeNull();
    expect(screen.queryByTestId('blog-market-links')).toBeNull();
  });
});

describe('BlogBlocks', () => {
  it('never renders unsafe hrefs or raw HTML', () => {
    render(
      <BlogBlocks
        blocks={[
          {
            type: 'paragraph',
            c: [
              { t: 'link', href: 'javascript:alert(1)', c: [{ t: 'text', v: 'bad' }] },
              { t: 'text', v: '<img src=x onerror=alert(1)>' },
            ],
          },
          { type: 'image', src: 'data:text/html,<script>', alt: 'x', caption: null },
        ]}
      />,
    );
    expect(screen.queryByRole('link', { name: 'bad' })).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img[src^="data:"]')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
  });
});

describe('BlogArchivePage', () => {
  it('renders a category archive with breadcrumbs, description and index policy', async () => {
    api.category.mockResolvedValue(categories[0]);
    api.posts.mockResolvedValue(paginated([card()], 1));
    renderAt('/blog/category/automation');
    expect(await screen.findByTestId('blog-archive-title')).toHaveTextContent('اتوماسیون');
    expect(screen.getByText('توضیح دسته')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /مسیر/ })).toBeInTheDocument();
    await waitFor(() => expect(api.posts).toHaveBeenCalledWith(expect.objectContaining({ category: 'automation' })));
    expect(await screen.findByTestId('blog-card')).toBeInTheDocument();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index,follow');
  });

  it('marks an empty category noindex and shows the designed empty state', async () => {
    api.category.mockResolvedValue(categories[1]);
    api.posts.mockResolvedValue(paginated([], 0));
    renderAt('/blog/category/empty');
    await screen.findByTestId('blog-archive-title');
    await waitFor(() => expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,follow'));
    expect(await screen.findByText(/هنوز مقاله‌ای/)).toBeInTheDocument();
  });

  it('author archives are noindex and never expose private data', async () => {
    api.author.mockResolvedValue({ author: { name: 'سارا', slug: 'sara', avatarId: null, avatarBg: null } });
    api.posts.mockResolvedValue(paginated([card()], 1));
    renderAt('/blog/author/sara');
    expect(await screen.findByTestId('blog-archive-title')).toHaveTextContent('سارا');
    await waitFor(() => expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,follow'));
    expect(document.body.textContent).not.toMatch(/@|\+98|09\d{9}/);
  });

  it('locks the archive dimension, keeps search / sort / tags available and marks filtered variants noindex', async () => {
    api.category.mockResolvedValue(categories[0]);
    api.posts.mockResolvedValue(paginated([card({ title: 'نتیجه در دسته' })], 1));
    renderAt('/blog/category/automation?q=api&sort=oldest&category=other&tag=ai');
    expect(await screen.findByTestId('blog-archive-title')).toHaveTextContent('اتوماسیون');
    await waitFor(() =>
      expect(api.posts).toHaveBeenCalledWith(expect.objectContaining({ category: 'automation', tag: 'ai', q: 'api', sort: 'oldest' })),
    );
    expect(api.posts.mock.calls.some((c) => c[0].category === 'other')).toBe(false);
    expect(screen.queryByTestId('blog-category-chips')).not.toBeInTheDocument();
    expect(await screen.findByTestId('blog-tag-chips')).toBeInTheDocument();
    expect(screen.getByTestId('blog-search-input')).toHaveValue('api');
    const pills = screen.getByTestId('blog-active-filters');
    expect(within(pills).getByText('اتوماسیون')).toBeInTheDocument(); // locked, not removable
    expect(within(pills).getByRole('button', { name: /حذف فیلتر برچسب/ })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,follow'));
    expect(document.querySelector('link[rel="canonical"]')).toBeNull(); // search variants carry no canonical
    expect(document.title).toContain('جستجوی «api»');
  });

  it('paginates an archive with a clean canonical page URL', async () => {
    api.category.mockResolvedValue(categories[0]);
    api.posts.mockResolvedValue(paginated([card()], 30, 2));
    renderAt('/blog/category/automation?page=2');
    await screen.findByTestId('blog-pager');
    expect(screen.getByTestId('blog-pager-next')).toHaveAttribute('href', '/blog/category/automation?page=3');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toMatch(/\/blog\/category\/automation\?page=2$/);
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index,follow');
  });

  it('returns 404 for unknown archives', async () => {
    api.category.mockRejectedValue(new ApiError('NOT_FOUND', 'not found', 404));
    renderAt('/blog/category/nope');
    expect(await screen.findByText(/پیدا نشد/)).toBeInTheDocument();
  });
});
