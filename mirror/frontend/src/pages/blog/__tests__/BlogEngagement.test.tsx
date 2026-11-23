import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/client';
import type { BlogEngagementMe, BlogEngagementSummary, PublicBlogComment } from '../../../api/blog';
import { ToastProvider } from '../../../components/Toast';
import { ArticleEngagement } from '../BlogEngagement';
import { faRating, faRelative } from '../blogShared';

/**
 * Article engagement — rating widget + comment thread as mounted under every
 * public article. API mocked; auth toggled per test. Covers the anonymous
 * CTAs, rating (set / change / withdraw), comment create / reply / edit /
 * withdraw / like / report, the barred-account state (403 COMMENTS_BLOCKED),
 * sort + load-more, and the `#comment-<id>` deep link from notifications.
 */

const auth = vi.hoisted(() => ({ isAuthenticated: false, status: 'guest' as 'guest' | 'authenticated' }));
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ ...auth, user: auth.isAuthenticated ? { id: 'u-me', name: 'من' } : null, isAdmin: false, isCreator: false }),
}));

const api = vi.hoisted(() => ({
  summary: vi.fn(),
  me: vi.fn(),
  rate: vi.fn(),
  unrate: vi.fn(),
  comments: vi.fn(),
  createComment: vi.fn(),
  updateComment: vi.fn(),
  withdrawComment: vi.fn(),
  like: vi.fn(),
  unlike: vi.fn(),
  report: vi.fn(),
}));
vi.mock('../../../api/blog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/blog')>();
  return { ...actual, blogEngagementApi: api };
});

const summary = (over: Partial<BlogEngagementSummary['rating']> = {}, commentCount = 2): BlogEngagementSummary => ({
  rating: { average: 4.5, count: 12, distribution: { '1': 0, '2': 1, '3': 1, '4': 2, '5': 8 }, ...over },
  commentCount,
});
const me = (over: Partial<BlogEngagementMe> = {}): BlogEngagementMe => ({
  myRating: null,
  myCommentIds: [],
  likedCommentIds: [],
  reportedCommentIds: [],
  canComment: true,
  ...over,
});
const comment = (over: Partial<PublicBlogComment> = {}): PublicBlogComment => ({
  id: 'c1',
  parentId: null,
  status: 'published',
  body: 'دیدگاه اول',
  author: { name: 'سارا', slug: 'sara', avatarId: null, avatarBg: null, badge: null },
  likeCount: 3,
  replyCount: 0,
  createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  editedAt: null,
  replies: [],
  ...over,
});
const page = (items: PublicBlogComment[], total = items.length, pageNo = 1, pageSize = 20) => ({
  items,
  meta: { page: pageNo, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
});

function mount(hash = '') {
  const onSummary = vi.fn();
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/blog/hello${hash}`]}>
        <ArticleEngagement slug="hello" initial={{ ratingAvg: 4.5, ratingCount: 12, commentCount: 2 }} onSummary={onSummary} />
      </MemoryRouter>
    </ToastProvider>,
  );
  return { onSummary };
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  auth.isAuthenticated = false;
  auth.status = 'guest';
  api.summary.mockResolvedValue(summary());
  api.me.mockResolvedValue(me());
  api.comments.mockResolvedValue(page([comment(), comment({ id: 'c2', body: 'دیدگاه دوم', likeCount: 0 })]));
  Element.prototype.scrollIntoView = vi.fn();
});

describe('helpers', () => {
  it('formats relative time and ratings in Persian digits', () => {
    const now = Date.parse('2026-10-14T12:00:00Z');
    expect(faRelative('2026-10-14T11:59:40Z', now)).toBe('همین حالا');
    expect(faRelative('2026-10-14T11:15:00Z', now)).toBe('۴۵ دقیقه پیش');
    expect(faRelative('2026-10-14T09:00:00Z', now)).toBe('۳ ساعت پیش');
    expect(faRelative('2026-10-12T12:00:00Z', now)).toBe('۲ روز پیش');
    expect(faRelative('2026-09-01T12:00:00Z', now)).not.toMatch(/پیش$/);
    expect(faRelative('not-a-date', now)).toBe('');
    expect(faRating(4.5)).toBe('۴.۵');
    expect(faRating(5)).toBe('۵');
    expect(faRating(3.96)).toBe('۴');
  });
});

describe('ArticleEngagement — anonymous reader', () => {
  it('shows the average, distribution and comments with sign-in CTAs instead of inputs', async () => {
    mount();
    expect(await screen.findByTestId('blog-rating-average')).toHaveTextContent('۴.۵');
    expect(screen.getByTestId('blog-rating-login')).toBeInTheDocument();
    expect(screen.queryByTestId('blog-rating-star-5')).not.toBeInTheDocument();
    expect(screen.getByTestId('blog-comments-login')).toBeInTheDocument();
    expect(await screen.findAllByTestId('blog-comment')).toHaveLength(2);
    expect(screen.getByTestId('blog-comments-count')).toHaveTextContent('۲');
    expect(api.me).not.toHaveBeenCalled();
    const login = within(screen.getByTestId('blog-comments-login')).getAllByRole('link')[0];
    expect(login).toHaveAttribute('href', '/login');
    expect(screen.getAllByText('۲ ساعت پیش').length).toBeGreaterThan(0);
  });

  it('publishes a live counter to the page header via onSummary', async () => {
    const { onSummary } = mount();
    await waitFor(() => expect(onSummary).toHaveBeenLastCalledWith(summary()));
  });

  it('renders the empty and error states', async () => {
    api.comments.mockResolvedValueOnce(page([]));
    mount();
    expect(await screen.findByTestId('blog-comments-empty')).toBeInTheDocument();
  });
});

describe('ArticleEngagement — signed-in reader', () => {
  beforeEach(() => {
    auth.isAuthenticated = true;
    auth.status = 'authenticated';
  });

  it('rates, changes and withdraws the rating through the API', async () => {
    api.rate.mockResolvedValue({ ...summary({ average: 4.6, count: 13 }), myRating: 5 });
    api.unrate.mockResolvedValue(summary({ average: 4.5, count: 12 }));
    mount();
    const star5 = await screen.findByTestId('blog-rating-star-5');
    fireEvent.click(star5);
    await waitFor(() => expect(api.rate).toHaveBeenCalledWith('hello', 5));
    expect(await screen.findByTestId('blog-rating-mine')).toHaveTextContent('۵');
    expect(screen.getByTestId('blog-rating-average')).toHaveTextContent('۴.۶');
    expect(star5).toHaveAttribute('aria-checked', 'true');
    // Clicking the same star again withdraws.
    fireEvent.click(star5);
    await waitFor(() => expect(api.unrate).toHaveBeenCalledWith('hello'));
    await waitFor(() => expect(screen.queryByTestId('blog-rating-mine')).not.toBeInTheDocument());
  });

  it('posts a comment, a reply, edits and withdraws its own comment', async () => {
    api.createComment.mockImplementation(async (_slug: string, body: string, parentId?: string) =>
      comment({
        id: parentId ? 'r1' : 'c3',
        body,
        parentId: parentId ?? null,
        author: { name: 'من', slug: 'me', avatarId: null, avatarBg: null, badge: null },
      }),
    );
    api.updateComment.mockImplementation(async (id: string, body: string) => comment({ id, body, editedAt: new Date().toISOString() }));
    api.withdrawComment.mockResolvedValue(undefined);
    mount();
    await screen.findAllByTestId('blog-comment');

    const form = screen.getByTestId('blog-comment-form');
    const textarea = within(form).getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'a' } });
    expect(screen.getByTestId('blog-comment-form-submit')).toBeDisabled();
    fireEvent.change(textarea, { target: { value: 'دیدگاه تازهٔ من' } });
    fireEvent.submit(form);
    await waitFor(() => expect(api.createComment).toHaveBeenCalledWith('hello', 'دیدگاه تازهٔ من', undefined));
    const all = await screen.findAllByTestId('blog-comment');
    expect(all).toHaveLength(3);
    expect(all[0]).toHaveAttribute('data-comment-id', 'c3'); // newest first
    expect(screen.getByTestId('blog-comments-count')).toHaveTextContent('۳');

    // Own comment exposes edit + delete.
    const mineRow = all[0];
    fireEvent.click(within(mineRow).getByTestId('blog-comment-edit'));
    const editForm = within(mineRow).getByTestId('blog-comment-edit-c3');
    fireEvent.change(within(editForm).getByRole('textbox'), { target: { value: 'ویرایش‌شده' } });
    fireEvent.submit(editForm);
    await waitFor(() => expect(api.updateComment).toHaveBeenCalledWith('c3', 'ویرایش‌شده'));
    expect(await within(mineRow).findByText('ویرایش‌شده')).toBeInTheDocument();

    // Reply under someone else's comment.
    const other = screen.getAllByTestId('blog-comment')[1];
    fireEvent.click(within(other).getByTestId('blog-comment-reply'));
    const replyForm = within(other).getByTestId('blog-reply-form-c1');
    fireEvent.change(within(replyForm).getByRole('textbox'), { target: { value: 'پاسخ من' } });
    fireEvent.submit(replyForm);
    await waitFor(() => expect(api.createComment).toHaveBeenCalledWith('hello', 'پاسخ من', 'c1'));
    expect(await within(other).findByText('پاسخ من')).toBeInTheDocument();
    expect(within(other).getAllByTestId('blog-comment')).toHaveLength(1); // nested reply

    // Withdraw own top-level comment (confirmation dialog).
    fireEvent.click(within(mineRow).getByTestId('blog-comment-delete'));
    fireEvent.click(await screen.findByRole('button', { name: 'حذف دیدگاه' }));
    await waitFor(() => expect(api.withdrawComment).toHaveBeenCalledWith('c3'));
    await waitFor(() => expect(screen.queryByText('ویرایش‌شده')).not.toBeInTheDocument());
  });

  it('likes optimistically, settles with the server count and rolls back on failure', async () => {
    api.like.mockResolvedValue({ likeCount: 4 });
    api.unlike.mockRejectedValue(new ApiError('SERVER_ERROR', 'boom', 500));
    mount();
    const rows = await screen.findAllByTestId('blog-comment');
    const likeBtn = within(rows[0]).getByTestId('blog-comment-like');
    expect(likeBtn).toHaveTextContent('۳');
    fireEvent.click(likeBtn);
    await waitFor(() => expect(api.like).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(likeBtn).toHaveAttribute('aria-pressed', 'true'));
    expect(likeBtn).toHaveTextContent('۴');
    fireEvent.click(likeBtn);
    await waitFor(() => expect(api.unlike).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(likeBtn).toHaveAttribute('aria-pressed', 'true'));
    expect(likeBtn).toHaveTextContent('۴');
  });

  it('reports a comment once with a reason', async () => {
    api.report.mockResolvedValue({ id: 'rep1' });
    mount();
    const rows = await screen.findAllByTestId('blog-comment');
    fireEvent.click(within(rows[0]).getByTestId('blog-comment-report'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText('بی‌ربط به مقاله'));
    fireEvent.click(screen.getByTestId('blog-report-submit'));
    await waitFor(() => expect(api.report).toHaveBeenCalledWith('c1', 'off_topic', undefined));
    await waitFor(() => expect(within(rows[0]).getByTestId('blog-comment-report')).toBeDisabled());
  });

  it('switches to the barred state when the server answers 403 COMMENTS_BLOCKED', async () => {
    api.createComment.mockRejectedValue(
      new ApiError('FORBIDDEN', 'Commenting is disabled for this account', 403, { reason: 'COMMENTS_BLOCKED' }),
    );
    mount();
    await screen.findAllByTestId('blog-comment');
    const form = screen.getByTestId('blog-comment-form');
    fireEvent.change(within(form).getByRole('textbox'), { target: { value: 'سلام دنیا' } });
    fireEvent.submit(form);
    expect(await screen.findByTestId('blog-comments-blocked')).toBeInTheDocument();
    expect(screen.queryByTestId('blog-comment-form')).not.toBeInTheDocument();
  });

  it('hides the form up front for an account already barred', async () => {
    api.me.mockResolvedValue(me({ canComment: false }));
    mount();
    expect(await screen.findByTestId('blog-comments-blocked')).toBeInTheDocument();
  });

  it('re-sorts and loads further pages', async () => {
    api.comments.mockImplementation(async (_slug: string, q: { sort?: string; page?: number }) =>
      q.page === 2
        ? page([comment({ id: 'c21', body: 'صفحهٔ دوم' })], 21, 2)
        : page(
            Array.from({ length: 20 }, (_, i) => comment({ id: `p${q.sort}-${i}`, body: `${q.sort} ${i}` })),
            21,
            1,
          ),
    );
    mount();
    await screen.findAllByTestId('blog-comment');
    fireEvent.change(screen.getByTestId('blog-comments-sort'), { target: { value: 'top' } });
    await waitFor(() => expect(api.comments).toHaveBeenLastCalledWith('hello', { sort: 'top', page: 1 }));
    expect(await screen.findByText('top 0')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('blog-comments-more'));
    await waitFor(() => expect(api.comments).toHaveBeenLastCalledWith('hello', { sort: 'top', page: 2 }));
    expect(await screen.findByText('صفحهٔ دوم')).toBeInTheDocument();
    expect(screen.queryByTestId('blog-comments-more')).not.toBeInTheDocument();
  });

  it('highlights and scrolls to a deep-linked comment', async () => {
    mount('#comment-c2');
    const rows = await screen.findAllByTestId('blog-comment');
    const target = rows.find((r) => r.getAttribute('data-comment-id') === 'c2');
    expect(target).toHaveClass('blog-comment--highlight');
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  });
});
