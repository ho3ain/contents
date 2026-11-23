import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  blogAdminApi,
  type AdminBlogCommentBan,
  type AdminBlogCommentRow,
  type AdminBlogCommentsQuery,
  type BlogCommentReportReason,
  type BlogCommentStatus,
} from '../../../api/blog';
import { Modal } from '../../../components/Modal';
import { Pagination } from '../../../components/Pagination';
import { useToast } from '../../../components/Toast';
import { Badge, Button, EmptyState, ErrorState, PageHeader, SearchField, SkeletonList, Textarea } from '../../../components/ui';
import { AppIcon } from '../../../components/ui/AppIcon';
import { formatCount, formatDateTime } from '../../../lib/format';
import { useAsync } from '../../../lib/useAsync';
import { usePageMeta } from '../../../lib/usePageMeta';
import { t } from '../../../i18n';
import { blogErrorMessage } from './blogAdminShared';

/**
 * `/admin/blog/comments` — post-moderation queue for article comments.
 *
 * Comments publish immediately; this page is where the editorial team acts on
 * reader reports: remove (author is notified, open reports resolve), restore,
 * dismiss reports that do not hold up, and bar repeat offenders from
 * commenting. Every filter lives in the URL; every action is a server call
 * that returns the fresh row, so the table never shows optimistic state.
 */

const PAGE_SIZE = 20;
const STATUSES: readonly BlogCommentStatus[] = ['published', 'hidden', 'removed'];
const REASON_KEYS: Record<BlogCommentReportReason, string> = {
  spam: 'blog.comments.reason.spam',
  abuse: 'blog.comments.reason.abuse',
  off_topic: 'blog.comments.reason.off_topic',
  other: 'blog.comments.reason.other',
};

type Query = Required<Pick<AdminBlogCommentsQuery, 'page'>> & AdminBlogCommentsQuery;

function readQuery(params: URLSearchParams): Query {
  const page = Number(params.get('page'));
  const status = params.get('status');
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    q: (params.get('q') ?? '').trim().slice(0, 120) || undefined,
    status: status && (STATUSES as readonly string[]).includes(status) ? (status as BlogCommentStatus) : undefined,
    reported: params.get('reported') === 'true' ? true : undefined,
    userId: params.get('user') || undefined,
    postId: params.get('post') || undefined,
  };
}

const statusTone = (status: BlogCommentStatus) => (status === 'published' ? 'success' : status === 'removed' ? 'danger' : 'neutral');

export function AdminBlogCommentsPage() {
  usePageMeta(t('blog.comments.title'), undefined, 'MESH', { robots: 'noindex,nofollow' });
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => readQuery(params), [params]);
  const [draftQ, setDraftQ] = useState(query.q ?? '');
  const [syncedQ, setSyncedQ] = useState(query.q ?? '');
  if (syncedQ !== (query.q ?? '')) {
    setSyncedQ(query.q ?? '');
    setDraftQ(query.q ?? '');
  }

  const overview = useAsync(() => blogAdminApi.commentsOverview(), []);
  const list = useAsync(
    () => blogAdminApi.comments({ ...query, pageSize: PAGE_SIZE }),
    [query.page, query.q, query.status, query.reported, query.userId, query.postId],
  );
  const bans = useAsync(() => blogAdminApi.commentBans(), []);

  const [showBans, setShowBans] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<AdminBlogCommentRow | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [banTarget, setBanTarget] = useState<{ id: string; name: string } | null>(null);
  const [banReason, setBanReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };

  const refresh = () => {
    list.reload();
    overview.reload();
  };

  const run = async (key: string, action: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await action();
      toast.success(done);
      refresh();
      return true;
    } catch (error) {
      toast.error(blogErrorMessage(error));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!removeTarget) return;
    const ok = await run(
      `remove:${removeTarget.id}`,
      () => blogAdminApi.removeComment(removeTarget.id, removeReason.trim() || undefined),
      t('blog.comments.removed'),
    );
    if (ok) {
      setRemoveTarget(null);
      setRemoveReason('');
    }
  };

  const ban = async () => {
    if (!banTarget) return;
    const ok = await run(
      `ban:${banTarget.id}`,
      () => blogAdminApi.banCommenter(banTarget.id, banReason.trim() || undefined),
      t('blog.comments.banned', { name: banTarget.name }),
    );
    if (ok) {
      setBanTarget(null);
      setBanReason('');
      bans.reload();
    }
  };

  const unban = (row: AdminBlogCommentBan) => {
    if (!row.user) return;
    const userId = row.user.id;
    void run(`unban:${userId}`, () => blogAdminApi.unbanCommenter(userId), t('blog.comments.unbanned')).then((ok) => {
      if (ok) bans.reload();
    });
  };

  const rows = list.data?.items ?? [];
  const filtered = Boolean(query.q || query.status || query.reported || query.userId || query.postId);
  const ov = overview.data;

  return (
    <div className="container page" data-testid="admin-blog-comments">
      <PageHeader
        title={t('blog.comments.title')}
        description={t('blog.comments.subtitle')}
        actions={
          <div className="row" style={{ gap: 8 }}>
            <Button size="sm" variant="secondary" onClick={() => navigate('/admin/blog')}>
              {t('blog.admin.nav')}
            </Button>
            <Button
              size="sm"
              variant={showBans ? 'primary' : 'secondary'}
              onClick={() => setShowBans((v) => !v)}
              aria-expanded={showBans}
              data-testid="blog-comments-toggle-bans"
            >
              {t('blog.comments.bans', { count: formatCount(bans.data?.length ?? ov?.bans ?? 0) })}
            </Button>
          </div>
        }
      />

      <div className="blog-admin-stats" data-testid="blog-comments-stats">
        <button
          type="button"
          className={`blog-admin-stat blog-admin-stat--alert${query.reported ? ' is-active' : ''}`}
          aria-pressed={Boolean(query.reported)}
          onClick={() => set({ reported: query.reported ? undefined : 'true' })}
          data-testid="blog-comments-stat-reported"
        >
          <span className="blog-admin-stat__label">{t('blog.comments.stat.openReports')}</span>
          <span className="blog-admin-stat__value">{overview.loading ? '…' : formatCount(ov?.openReports ?? 0)}</span>
          <span className="blog-admin-stat__sub">{t('blog.comments.stat.openReportsHint')}</span>
        </button>
        {STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            className={`blog-admin-stat${query.status === status ? ' is-active' : ''}`}
            aria-pressed={query.status === status}
            onClick={() => set({ status: query.status === status ? undefined : status })}
          >
            <span className="blog-admin-stat__label">{t(`blog.comments.status.${status}`)}</span>
            <span className="blog-admin-stat__value">{overview.loading ? '…' : formatCount(ov?.[status] ?? 0)}</span>
          </button>
        ))}
      </div>

      {showBans && (
        <section className="blog-admin-panel" aria-label={t('blog.comments.bansTitle')} data-testid="blog-comments-bans">
          <h2 className="blog-admin-panel__title">{t('blog.comments.bansTitle')}</h2>
          <p className="muted small">{t('blog.comments.bansHint')}</p>
          {bans.loading ? (
            <SkeletonList rows={2} />
          ) : bans.error ? (
            <ErrorState description={bans.error} retry={bans.refetch} />
          ) : (bans.data ?? []).length === 0 ? (
            <p className="muted small" data-testid="blog-comments-bans-empty">
              {t('blog.comments.bansEmpty')}
            </p>
          ) : (
            <ul className="blog-admin-banlist">
              {(bans.data ?? []).map((row) => (
                <li key={row.user?.id ?? row.createdAt} data-testid="blog-comment-ban-row">
                  <div>
                    <b>{row.user?.name ?? t('blog.comments.deletedUser')}</b>
                    {row.user?.username && <span className="muted small"> @{row.user.username}</span>}
                    <div className="muted small">
                      {formatDateTime(row.createdAt)}
                      {row.reason ? ` — ${row.reason}` : ''}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    {row.user && (
                      <Button size="sm" variant="ghost" onClick={() => set({ user: row.user?.id, status: undefined, reported: undefined })}>
                        {t('blog.comments.showComments')}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!row.user || busy === `unban:${row.user.id}`}
                      onClick={() => unban(row)}
                      data-testid="blog-comment-unban"
                    >
                      {t('blog.comments.unban')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <form
        className="blog-admin-filters"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          set({ q: draftQ.trim() || undefined });
        }}
      >
        <SearchField
          value={draftQ}
          onChange={(e) => setDraftQ(e.target.value)}
          placeholder={t('blog.comments.search')}
          aria-label={t('blog.comments.search')}
          data-testid="blog-comments-search"
        />
        <select
          className="select"
          aria-label={t('blog.admin.filter.status')}
          value={query.status ?? ''}
          onChange={(e) => set({ status: e.target.value || undefined })}
          data-testid="blog-comments-status"
        >
          <option value="">{t('blog.admin.filter.allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`blog.comments.status.${s}`)}
            </option>
          ))}
        </select>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={query.reported === true}
            onChange={(e) => set({ reported: e.target.checked ? 'true' : undefined })}
          />
          <span>{t('blog.comments.reportedOnly')}</span>
        </label>
        {(query.userId || query.postId) && (
          <Button type="button" size="sm" variant="ghost" onClick={() => set({ user: undefined, post: undefined })}>
            {t('blog.comments.clearScope')}
          </Button>
        )}
        <Button type="submit" size="sm" variant="secondary">
          {t('blog.common.search')}
        </Button>
      </form>

      {list.loading ? (
        <SkeletonList rows={8} />
      ) : list.error ? (
        <ErrorState description={list.error} retry={list.refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={filtered ? t('blog.comments.emptyFiltered') : t('blog.comments.empty')}
          description={filtered ? t('blog.comments.emptyFilteredHint') : t('blog.comments.emptyHint')}
        />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table blog-admin-table blog-comments-table" data-testid="blog-comments-table">
              <thead>
                <tr>
                  <th>{t('blog.comments.col.comment')}</th>
                  <th>{t('blog.comments.col.author')}</th>
                  <th>{t('blog.comments.col.post')}</th>
                  <th>{t('blog.comments.col.reports')}</th>
                  <th>{t('blog.comments.col.status')}</th>
                  <th>{t('blog.comments.col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <CommentRow
                    key={row.id}
                    row={row}
                    busy={busy}
                    onRemove={() => {
                      setRemoveReason('');
                      setRemoveTarget(row);
                    }}
                    onRestore={() => void run(`restore:${row.id}`, () => blogAdminApi.restoreComment(row.id), t('blog.comments.restored'))}
                    onDismiss={() =>
                      void run(`dismiss:${row.id}`, () => blogAdminApi.dismissCommentReports(row.id), t('blog.comments.dismissed'))
                    }
                    onBan={() => {
                      if (!row.author) return;
                      setBanReason('');
                      setBanTarget({ id: row.author.id, name: row.author.name });
                    }}
                    onScopeUser={() => row.author && set({ user: row.author.id })}
                    onScopePost={() => row.post && set({ post: row.post.id })}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="row row--between mt-3">
            <span className="muted small" data-testid="blog-comments-total">
              {t('blog.comments.total', { count: formatCount(list.data?.meta.total ?? 0) })}
            </span>
            <Pagination
              page={query.page}
              pageSize={PAGE_SIZE}
              total={list.data?.meta.total ?? 0}
              onPageChange={(p) => set({ page: p > 1 ? String(p) : undefined })}
            />
          </div>
        </>
      )}

      <Modal
        open={removeTarget !== null}
        title={t('blog.comments.removeTitle')}
        onClose={() => (busy ? undefined : setRemoveTarget(null))}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoveTarget(null)} disabled={busy !== null}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => void remove()} disabled={busy !== null} data-testid="blog-comment-remove-confirm">
              {busy ? t('blog.common.working') : t('blog.comments.remove')}
            </Button>
          </>
        }
      >
        {removeTarget && <blockquote className="blog-admin-quote">{removeTarget.body}</blockquote>}
        <p className="muted small">{t('blog.comments.removeNote')}</p>
        <label className="field">
          <span className="field__label">{t('blog.comments.removeReason')}</span>
          <Textarea
            rows={3}
            maxLength={500}
            value={removeReason}
            onChange={(e) => setRemoveReason(e.target.value)}
            placeholder={t('blog.comments.removeReasonHint')}
            data-testid="blog-comment-remove-reason"
          />
        </label>
      </Modal>

      <Modal
        open={banTarget !== null}
        title={banTarget ? t('blog.comments.banTitle', { name: banTarget.name }) : ''}
        onClose={() => (busy ? undefined : setBanTarget(null))}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBanTarget(null)} disabled={busy !== null}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => void ban()} disabled={busy !== null} data-testid="blog-comment-ban-confirm">
              {busy ? t('blog.common.working') : t('blog.comments.ban')}
            </Button>
          </>
        }
      >
        <p className="muted small">{t('blog.comments.banNote')}</p>
        <label className="field">
          <span className="field__label">{t('blog.comments.banReason')}</span>
          <Textarea
            rows={3}
            maxLength={500}
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
            data-testid="blog-comment-ban-reason"
          />
        </label>
      </Modal>
    </div>
  );
}

function CommentRow({
  row,
  busy,
  onRemove,
  onRestore,
  onDismiss,
  onBan,
  onScopeUser,
  onScopePost,
}: {
  row: AdminBlogCommentRow;
  busy: string | null;
  onRemove: () => void;
  onRestore: () => void;
  onDismiss: () => void;
  onBan: () => void;
  onScopeUser: () => void;
  onScopePost: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const openReports = row.reports.filter((r) => r.status === 'open');
  const rowBusy = busy !== null && busy.endsWith(`:${row.id}`);
  const publicHref = row.post ? `/blog/${row.post.slug}#comment-${row.id}` : null;
  return (
    <tr data-testid="blog-comment-row" data-status={row.status} data-reported={openReports.length > 0 ? 'true' : 'false'}>
      <td className="blog-comments-table__body">
        <div className="blog-comments-table__meta">
          {row.parentId && <Badge tone="neutral">{t('blog.comments.replyBadge')}</Badge>}
          {row.editedAt && <span className="muted small">{t('blog.comments.edited')}</span>}
          <span className="muted small">{formatDateTime(row.createdAt)}</span>
          <span className="muted small">
            <AppIcon name="thumbsUp" size={12} /> {formatCount(row.likeCount)}
          </span>
        </div>
        <p className={`blog-comments-table__text${expanded ? ' is-expanded' : ''}`}>
          {row.body || <i className="muted">{t('blog.comments.noBody')}</i>}
        </p>
        {row.body.length > 160 && (
          <button type="button" className="link-button small" onClick={() => setExpanded((v) => !v)}>
            {expanded ? t('blog.comments.less') : t('blog.comments.more')}
          </button>
        )}
        {row.removedAt && (
          <div className="muted small">
            {t('blog.comments.removedAt', { when: formatDateTime(row.removedAt) })}
            {row.removedReason ? ` — ${row.removedReason}` : ''}
          </div>
        )}
      </td>
      <td>
        {row.author ? (
          <>
            <button type="button" className="link-button" onClick={onScopeUser} title={t('blog.comments.showComments')}>
              {row.author.name}
            </button>
            {row.author.username && <div className="muted small">@{row.author.username}</div>}
            {row.author.banned && (
              <Badge tone="danger" data-testid="blog-comment-author-banned">
                {t('blog.comments.bannedBadge')}
              </Badge>
            )}
          </>
        ) : (
          <span className="muted">{t('blog.comments.deletedUser')}</span>
        )}
      </td>
      <td>
        {row.post ? (
          <>
            <button type="button" className="link-button" onClick={onScopePost} title={t('blog.comments.showPostComments')}>
              {row.post.title}
            </button>
            {publicHref && (
              <div>
                <Link className="small blog-comments-table__public" to={publicHref} target="_blank" rel="noopener">
                  {t('blog.comments.openPublic')} <AppIcon name="external" size={12} />
                </Link>
              </div>
            )}
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td>
        {row.reports.length === 0 ? (
          <span className="muted">—</span>
        ) : (
          <details className="blog-comments-table__reports">
            <summary>
              <Badge tone={openReports.length ? 'warning' : 'neutral'}>
                {openReports.length
                  ? t('blog.comments.openReportsCount', { count: formatCount(openReports.length) })
                  : t('blog.comments.resolvedReportsCount', { count: formatCount(row.reports.length) })}
              </Badge>
            </summary>
            <ul>
              {row.reports.map((r) => (
                <li key={r.id}>
                  <b>{t(REASON_KEYS[r.reason])}</b>
                  {r.note && <span> — {r.note}</span>}
                  <div className="muted small">
                    {r.reporter?.name ?? t('blog.comments.deletedUser')} · {formatDateTime(r.createdAt)}
                    {r.status !== 'open' && ` · ${t(`blog.comments.reportStatus.${r.status}`)}`}
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </td>
      <td>
        <Badge tone={statusTone(row.status)}>{t(`blog.comments.status.${row.status}`)}</Badge>
      </td>
      <td>
        <div className="blog-comments-table__actions">
          {row.status === 'published' ? (
            <Button size="sm" variant="danger" disabled={rowBusy} onClick={onRemove} data-testid="blog-comment-remove">
              {t('blog.comments.remove')}
            </Button>
          ) : (
            <Button size="sm" variant="secondary" disabled={rowBusy} onClick={onRestore} data-testid="blog-comment-restore">
              {t('blog.comments.restore')}
            </Button>
          )}
          {openReports.length > 0 && (
            <Button size="sm" variant="ghost" disabled={rowBusy} onClick={onDismiss} data-testid="blog-comment-dismiss">
              {t('blog.comments.dismiss')}
            </Button>
          )}
          {row.author && !row.author.banned && (
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={onBan} data-testid="blog-comment-ban">
              {t('blog.comments.ban')}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
