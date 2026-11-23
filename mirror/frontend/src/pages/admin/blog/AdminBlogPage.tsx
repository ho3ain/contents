import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  blogAdminApi,
  BLOG_POST_STATUSES,
  type AdminBlogListQuery,
  type AdminBlogPostRow,
  type BlogBulkAction,
  type BlogPostStatus,
} from '../../../api/blog';
import { Modal } from '../../../components/Modal';
import { Pagination } from '../../../components/Pagination';
import { useToast } from '../../../components/Toast';
import { Badge, Button, EmptyState, ErrorState, PageHeader, SearchField, SkeletonList } from '../../../components/ui';
import { formatCount, formatDateTime } from '../../../lib/format';
import { useAsync } from '../../../lib/useAsync';
import { usePageMeta } from '../../../lib/usePageMeta';
import { t } from '../../../i18n';
import { StatusBadge, blogErrorMessage, statusLabel, useBlogAccess } from './blogAdminShared';

/**
 * `/admin/blog` — editorial dashboard: real counts per status, the list with
 * search / filters / sort / pagination (all in the URL), and safe bulk
 * actions. Every control maps to a server operation; what a role cannot do
 * is not rendered (the server enforces it regardless).
 */

const PAGE_SIZE = 20;
const SORTS = ['updated', 'created', 'published', 'title'] as const;
type Sort = (typeof SORTS)[number];

// The admin list filters by category/author *id* (the public blog API is the
// one that takes slugs). A stale link carrying a slug would otherwise reach
// the API and come back 400, so unreadable values are dropped like an unknown
// `status` or `sort` already is.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const readId = (value: string | null): string | undefined =>
  value && UUID_RE.test(value) ? value : undefined;

function readQuery(params: URLSearchParams): Required<Pick<AdminBlogListQuery, 'page' | 'sort'>> & AdminBlogListQuery {
  const page = Number(params.get('page'));
  const status = params.get('status');
  const sort = params.get('sort');
  const featured = params.get('featured');
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    q: (params.get('q') ?? '').trim().slice(0, 120) || undefined,
    status: status && (BLOG_POST_STATUSES as readonly string[]).includes(status) ? (status as BlogPostStatus) : undefined,
    category: readId(params.get('category')),
    author: readId(params.get('author')),
    featured: featured === 'true' ? true : undefined,
    sort: sort && (SORTS as readonly string[]).includes(sort) ? (sort as Sort) : 'updated',
  };
}

export function AdminBlogPage() {
  usePageMeta(t('blog.admin.title'), undefined, 'MESH', { robots: 'noindex,nofollow' });
  const toast = useToast();
  const navigate = useNavigate();
  const { access } = useBlogAccess();
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => readQuery(params), [params]);
  const [draftQ, setDraftQ] = useState(query.q ?? '');
  const [syncedQ, setSyncedQ] = useState(query.q ?? '');
  if (syncedQ !== (query.q ?? '')) {
    // URL changed from outside the search box (back button, stat tile) — adopt it.
    setSyncedQ(query.q ?? '');
    setDraftQ(query.q ?? '');
  }

  const overview = useAsync(() => blogAdminApi.overview(), []);
  const categories = useAsync(() => blogAdminApi.categories(), []);
  const list = useAsync(
    () => blogAdminApi.posts({ ...query, pageSize: PAGE_SIZE }),
    [query.page, query.q, query.status, query.category, query.author, query.featured, query.sort],
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectionFor, setSelectionFor] = useState(list.data);
  if (selectionFor !== list.data) {
    // A fresh page of rows invalidates the previous selection.
    setSelectionFor(list.data);
    setSelected(new Set());
  }
  const [bulk, setBulk] = useState<{ action: BlogBulkAction; categoryId: string } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };

  const rows = list.data?.items ?? [];
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runBulk = async () => {
    if (!bulk) return;
    setBulkBusy(true);
    try {
      const result = await blogAdminApi.bulk(
        [...selected],
        bulk.action,
        bulk.action === 'set_category' ? bulk.categoryId || null : undefined,
      );
      toast.success(t('blog.admin.bulkDone', { done: formatCount(result.done.length), skipped: formatCount(result.skipped.length) }));
      setBulk(null);
      list.reload();
      overview.reload();
    } catch (error) {
      toast.error(blogErrorMessage(error));
    } finally {
      setBulkBusy(false);
    }
  };

  const canManage = access?.can.manage ?? false;
  const canPublish = access?.can.publish ?? false;
  const byStatus = overview.data?.byStatus ?? {};

  return (
    <div className="container page" data-testid="admin-blog">
      <PageHeader
        title={t('blog.admin.title')}
        description={t('blog.admin.subtitle')}
        actions={
          <div className="row" style={{ gap: 8 }}>
            <Button size="sm" variant="secondary" onClick={() => navigate('/admin/blog/taxonomy')}>
              {t('blog.admin.navTaxonomy')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => navigate('/admin/blog/graph')} data-testid="blog-nav-graph">
              {t('blog.admin.navGraph')}
            </Button>
            {canManage && (
              <Button size="sm" onClick={() => navigate('/admin/blog/posts/new')} data-testid="blog-new-post">
                {t('blog.admin.newPost')}
              </Button>
            )}
          </div>
        }
      />

      {access && !access.can.view && <ErrorState description={t('blog.err.forbidden')} />}

      <div className="blog-admin-stats" data-testid="blog-admin-stats">
        {(['published', 'scheduled', 'in_review', 'draft'] as const).map((status) => (
          <button
            key={status}
            type="button"
            className={`blog-admin-stat${query.status === status ? ' is-active' : ''}`}
            aria-pressed={query.status === status}
            onClick={() => set({ status: query.status === status ? undefined : status })}
          >
            <span className="blog-admin-stat__label">{statusLabel(status)}</span>
            <span className="blog-admin-stat__value">{overview.loading ? '…' : formatCount(byStatus[status] ?? 0)}</span>
          </button>
        ))}
        <div className="blog-admin-stat is-static">
          <span className="blog-admin-stat__label">{t('blog.admin.stat.stale')}</span>
          <span className="blog-admin-stat__value">{overview.loading ? '…' : formatCount(overview.data?.stale ?? 0)}</span>
          <span className="blog-admin-stat__sub">{t('blog.admin.stat.staleHint')}</span>
        </div>
        <div className="blog-admin-stat is-static">
          <span className="blog-admin-stat__label">{t('blog.admin.stat.nextScheduled')}</span>
          <span className="blog-admin-stat__value">
            {overview.data?.scheduledNext ? (
              <Link to={`/admin/blog/posts/${overview.data.scheduledNext.id}`}>
                {formatDateTime(overview.data.scheduledNext.scheduledFor)}
              </Link>
            ) : (
              '—'
            )}
          </span>
          {overview.data?.scheduledNext && <span className="blog-admin-stat__sub">{overview.data.scheduledNext.title}</span>}
        </div>
      </div>

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
          placeholder={t('blog.admin.search')}
          aria-label={t('blog.admin.search')}
          data-testid="blog-admin-search"
        />
        <select
          className="select"
          aria-label={t('blog.admin.filter.status')}
          value={query.status ?? ''}
          onChange={(e) => set({ status: e.target.value || undefined })}
          data-testid="blog-admin-status"
        >
          <option value="">{t('blog.admin.filter.allStatuses')}</option>
          {BLOG_POST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        <select
          className="select"
          aria-label={t('blog.admin.filter.category')}
          value={query.category ?? ''}
          onChange={(e) => set({ category: e.target.value || undefined })}
          data-testid="blog-admin-category"
        >
          <option value="">{t('blog.admin.filter.allCategories')}</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.parentId ? `↳ ${c.name}` : c.name}
            </option>
          ))}
        </select>
        <select
          className="select"
          aria-label={t('blog.admin.filter.sort')}
          value={query.sort}
          onChange={(e) => set({ sort: e.target.value })}
        >
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {t(`blog.admin.sort.${s}`)}
            </option>
          ))}
        </select>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={query.featured === true}
            onChange={(e) => set({ featured: e.target.checked ? 'true' : undefined })}
          />
          <span>{t('blog.admin.filter.featuredOnly')}</span>
        </label>
        <Button type="submit" size="sm" variant="secondary">
          {t('blog.common.search')}
        </Button>
      </form>

      {canManage && selected.size > 0 && (
        <div className="blog-admin-bulkbar" role="region" aria-label={t('blog.admin.bulk.title')} data-testid="blog-bulkbar">
          <b>{t('blog.admin.bulk.selected', { count: formatCount(selected.size) })}</b>
          <Button size="sm" variant="secondary" onClick={() => setBulk({ action: 'feature', categoryId: '' })}>
            {t('blog.admin.bulk.feature')}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setBulk({ action: 'unfeature', categoryId: '' })}>
            {t('blog.admin.bulk.unfeature')}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setBulk({ action: 'set_category', categoryId: '' })}>
            {t('blog.admin.bulk.setCategory')}
          </Button>
          {canPublish && (
            <Button size="sm" variant="danger" onClick={() => setBulk({ action: 'unpublish', categoryId: '' })}>
              {t('blog.action.unpublish')}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setBulk({ action: 'archive', categoryId: '' })}>
            {t('blog.action.archive')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            {t('common.cancel')}
          </Button>
        </div>
      )}

      {list.loading ? (
        <SkeletonList rows={8} />
      ) : list.error ? (
        <ErrorState description={list.error} retry={list.refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={query.q || query.status || query.category ? t('blog.admin.emptyFiltered') : t('blog.admin.empty')}
          description={query.q || query.status || query.category ? t('blog.admin.emptyFilteredHint') : t('blog.admin.emptyHint')}
          action={
            canManage && !(query.q || query.status || query.category) ? (
              <Button size="sm" onClick={() => navigate('/admin/blog/posts/new')}>
                {t('blog.admin.newPost')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table blog-admin-table" data-testid="blog-admin-table">
              <thead>
                <tr>
                  {canManage && (
                    <th style={{ width: 36 }}>
                      <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label={t('blog.admin.bulk.selectAll')} />
                    </th>
                  )}
                  <th>{t('blog.admin.col.title')}</th>
                  <th>{t('blog.admin.col.status')}</th>
                  <th>{t('blog.admin.col.category')}</th>
                  <th>{t('blog.admin.col.author')}</th>
                  <th>{t('blog.admin.col.updated')}</th>
                  <th>{t('blog.admin.col.published')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <PostRow key={row.id} row={row} selectable={canManage} checked={selected.has(row.id)} onToggle={() => toggle(row.id)} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="row row--between mt-3">
            <span className="muted small" data-testid="blog-admin-total">
              {t('blog.admin.total', { count: formatCount(list.data?.meta.total ?? 0) })}
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
        open={bulk !== null}
        title={bulk ? t(`blog.admin.bulk.confirm.${bulk.action}`, { count: formatCount(selected.size) }) : ''}
        onClose={() => (bulkBusy ? undefined : setBulk(null))}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBulk(null)} disabled={bulkBusy}>
              {t('common.cancel')}
            </Button>
            <Button
              variant={bulk?.action === 'unpublish' ? 'danger' : 'primary'}
              onClick={() => void runBulk()}
              disabled={bulkBusy || (bulk?.action === 'set_category' && !bulk.categoryId)}
              data-testid="blog-bulk-confirm"
            >
              {bulkBusy ? t('blog.common.working') : t('blog.common.confirm')}
            </Button>
          </>
        }
      >
        <p className="muted small">{t('blog.admin.bulk.note')}</p>
        {bulk?.action === 'set_category' && (
          <select
            className="select mt-2"
            aria-label={t('blog.admin.filter.category')}
            value={bulk.categoryId}
            onChange={(e) => setBulk({ ...bulk, categoryId: e.target.value })}
          >
            <option value="">{t('blog.editor.pickCategory')}</option>
            {(categories.data ?? [])
              .filter((c) => c.isActive)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parentId ? `↳ ${c.name}` : c.name}
                </option>
              ))}
          </select>
        )}
      </Modal>
    </div>
  );
}

function PostRow({
  row,
  selectable,
  checked,
  onToggle,
}: {
  row: AdminBlogPostRow;
  selectable: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <tr data-testid={`blog-row-${row.slug}`}>
      {selectable && (
        <td>
          <input type="checkbox" checked={checked} onChange={onToggle} aria-label={row.title} />
        </td>
      )}
      <td>
        <Link to={`/admin/blog/posts/${row.id}`} className="blog-admin-title">
          {row.title || t('blog.editor.untitled')}
        </Link>
        <div className="muted small row" style={{ gap: 6 }}>
          <code dir="ltr">{row.slug}</code>
          {row.isFeatured && <Badge tone="accent">{t('blog.admin.featured')}</Badge>}
          <span>{t('blog.admin.minutes', { n: formatCount(row.readingMinutes) })}</span>
        </div>
      </td>
      <td>
        <StatusBadge status={row.status} />
        {row.status === 'scheduled' && row.scheduledFor && <div className="muted small">{formatDateTime(row.scheduledFor)}</div>}
      </td>
      <td>{row.category?.name ?? <span className="muted">—</span>}</td>
      <td>{row.author?.name ?? <span className="muted">{t('blog.editor.noAuthor')}</span>}</td>
      <td className="small">{formatDateTime(row.updatedAt)}</td>
      <td className="small">{row.publishedAt ? formatDateTime(row.publishedAt) : <span className="muted">—</span>}</td>
    </tr>
  );
}
