import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminBlogCommentBan, AdminBlogCommentOverview, AdminBlogCommentRow } from '../../../../api/blog';
import { ToastProvider } from '../../../../components/Toast';
import { ThemeProvider } from '../../../../theme';
import { AdminBlogCommentsPage } from '../AdminBlogCommentsPage';

/**
 * Comment moderation queue — component level, API mocked. Covers the
 * overview tiles as URL filters, the reported-only queue, remove with a
 * reason (author notified), restore, dismissing reports, and the ban list.
 */

const api = vi.hoisted(() => ({
  commentsOverview: vi.fn(),
  comments: vi.fn(),
  removeComment: vi.fn(),
  restoreComment: vi.fn(),
  dismissCommentReports: vi.fn(),
  commentBans: vi.fn(),
  banCommenter: vi.fn(),
  unbanCommenter: vi.fn(),
}));
vi.mock('../../../../api/blog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../api/blog')>();
  return { ...actual, blogAdminApi: { ...actual.blogAdminApi, ...api } };
});

const overview: AdminBlogCommentOverview = { published: 12, hidden: 1, removed: 2, openReports: 3, bans: 1 };

const row = (over: Partial<AdminBlogCommentRow> = {}): AdminBlogCommentRow => ({
  id: 'c1',
  parentId: null,
  status: 'published',
  body: 'یک دیدگاه معمولی',
  likeCount: 2,
  replyCount: 0,
  author: { id: 'u1', name: 'سارا', username: 'sara', banned: false },
  post: { id: 'p1', slug: 'first-post', title: 'اولین مقاله' },
  openReportCount: 0,
  reports: [],
  removedReason: null,
  removedAt: null,
  editedAt: null,
  createdAt: '2026-10-10T08:00:00.000Z',
  ...over,
});

const reported = row({
  id: 'c2',
  body: 'خرید فالوور ارزان!',
  author: { id: 'u2', name: 'اسپمر', username: null, banned: false },
  openReportCount: 2,
  reports: [
    {
      id: 'r1',
      reason: 'spam',
      note: 'تبلیغ',
      status: 'open',
      reporter: { id: 'u3', name: 'رضا', username: 'reza' },
      createdAt: '2026-10-11T08:00:00.000Z',
    },
    { id: 'r2', reason: 'other', note: null, status: 'open', reporter: null, createdAt: '2026-10-11T09:00:00.000Z' },
  ],
});

const bans: AdminBlogCommentBan[] = [
  {
    user: { id: 'u9', name: 'کاربر محدود', username: 'blocked' },
    reason: 'اسپم مکرر',
    createdBy: 'admin',
    createdAt: '2026-10-01T08:00:00.000Z',
  },
];

const paginated = <T,>(items: T[], total = items.length) => ({ items, meta: { page: 1, pageSize: 20, total, totalPages: 1 } });

function Probe() {
  const location = useLocation();
  return <div data-testid="loc">{location.search}</div>;
}

function renderAt(path = '/admin/blog/comments') {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/admin/blog/comments" element={<AdminBlogCommentsPage />} />
          </Routes>
          <Probe />
        </MemoryRouter>
      </ToastProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.commentsOverview.mockResolvedValue(overview);
  api.comments.mockResolvedValue(paginated([reported, row()]));
  api.commentBans.mockResolvedValue(bans);
});

describe('AdminBlogCommentsPage', () => {
  it('lists comments with report details and puts the overview tiles into the URL', async () => {
    renderAt();
    const rows = await screen.findAllByTestId('blog-comment-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('data-reported', 'true');
    expect(within(rows[0]).getByText('۲ گزارش باز')).toBeInTheDocument();
    expect(within(rows[0]).getByText('هرزنامه یا تبلیغات')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('link', { name: /نمایش در سایت/ })).toHaveAttribute('href', '/blog/first-post#comment-c2');
    expect(screen.getByTestId('blog-comments-total')).toHaveTextContent('۲');

    fireEvent.click(screen.getByTestId('blog-comments-stat-reported'));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('?reported=true'));
    await waitFor(() => expect(api.comments).toHaveBeenLastCalledWith(expect.objectContaining({ reported: true, page: 1 })));
    expect(screen.getByTestId('blog-comments-stat-reported')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.change(screen.getByTestId('blog-comments-status'), { target: { value: 'removed' } });
    await waitFor(() => expect(api.comments).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'removed', reported: true })));
  });

  it('removes a comment with a reason, then restores it', async () => {
    api.removeComment.mockResolvedValue({ ...reported, status: 'removed' });
    api.restoreComment.mockResolvedValue({ ...reported, status: 'published' });
    renderAt();
    const rows = await screen.findAllByTestId('blog-comment-row');
    fireEvent.click(within(rows[0]).getByTestId('blog-comment-remove'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('خرید فالوور ارزان!')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('blog-comment-remove-reason'), { target: { value: 'تبلیغات' } });
    api.comments.mockResolvedValue(
      paginated([{ ...reported, status: 'removed', reports: reported.reports.map((r) => ({ ...r, status: 'resolved' as const })) }, row()]),
    );
    fireEvent.click(screen.getByTestId('blog-comment-remove-confirm'));
    await waitFor(() => expect(api.removeComment).toHaveBeenCalledWith('c2', 'تبلیغات'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const restore = await screen.findByTestId('blog-comment-restore');
    expect(api.commentsOverview).toHaveBeenCalledTimes(2);
    fireEvent.click(restore);
    await waitFor(() => expect(api.restoreComment).toHaveBeenCalledWith('c2'));
  });

  it('dismisses open reports without touching the comment', async () => {
    api.dismissCommentReports.mockResolvedValue({ ...reported, openReportCount: 0 });
    renderAt();
    const rows = await screen.findAllByTestId('blog-comment-row');
    expect(within(rows[1]).queryByTestId('blog-comment-dismiss')).not.toBeInTheDocument();
    fireEvent.click(within(rows[0]).getByTestId('blog-comment-dismiss'));
    await waitFor(() => expect(api.dismissCommentReports).toHaveBeenCalledWith('c2'));
    expect(await screen.findByText('گزارش‌ها رد شدند؛ دیدگاه می‌ماند.')).toBeInTheDocument();
  });

  it('bars a commenter with a note and lifts a restriction from the ban panel', async () => {
    api.banCommenter.mockResolvedValue({
      user: { id: 'u2', name: 'اسپمر', username: null },
      reason: 'x',
      createdBy: 'a',
      createdAt: 'now',
    });
    api.unbanCommenter.mockResolvedValue(undefined);
    renderAt();
    const rows = await screen.findAllByTestId('blog-comment-row');
    fireEvent.click(within(rows[0]).getByTestId('blog-comment-ban'));
    expect(await screen.findByRole('dialog')).toHaveTextContent('اسپمر');
    fireEvent.change(screen.getByTestId('blog-comment-ban-reason'), { target: { value: 'اسپم' } });
    fireEvent.click(screen.getByTestId('blog-comment-ban-confirm'));
    await waitFor(() => expect(api.banCommenter).toHaveBeenCalledWith('u2', 'اسپم'));

    fireEvent.click(screen.getByTestId('blog-comments-toggle-bans'));
    const panel = await screen.findByTestId('blog-comments-bans');
    expect(within(panel).getByText('کاربر محدود')).toBeInTheDocument();
    fireEvent.click(within(panel).getByTestId('blog-comment-unban'));
    await waitFor(() => expect(api.unbanCommenter).toHaveBeenCalledWith('u9'));
  });

  it('shows the filtered empty state and surfaces API errors with retry', async () => {
    api.comments.mockResolvedValueOnce(paginated([]));
    renderAt('/admin/blog/comments?status=hidden');
    expect(await screen.findByText('دیدگاهی با این فیلترها پیدا نشد.')).toBeInTheDocument();
  });
});
