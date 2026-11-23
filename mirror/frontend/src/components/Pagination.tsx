import { t } from '../i18n';

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const pages: number[] = [];
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  for (let p = start; p <= Math.min(totalPages, start + 4); p += 1) {
    pages.push(p);
  }

  return (
    <nav className="pagination" aria-label={t('pagination.navLabel')}>
      <button
        className="btn btn--secondary btn--sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        {t('pagination.previous')}
      </button>
      {pages.map((p) => (
        <button
          key={p}
          className={`btn btn--sm ${p === page ? 'btn--primary' : 'btn--ghost'}`}
          aria-current={p === page ? 'page' : undefined}
          onClick={() => onPageChange(p)}
        >
          {p}
        </button>
      ))}
      <span className="pagination__info">
        {t('pagination.pageOf', { page, totalPages })}
      </span>
      <button
        className="btn btn--secondary btn--sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        {t('pagination.next')}
      </button>
    </nav>
  );
}

export function PaginatedTableFooter({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div
      className="row row--between"
      style={{ padding: 'var(--sp-3) var(--sp-4)', borderTop: '1px solid var(--border)' }}
    >
      <span className="muted small">
        {t('pagination.range', { from, to, total })}
      </span>
      <div className="row">
        <button
          className="btn btn--secondary btn--sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {t('pagination.previous')}
        </button>
        <button
          className="btn btn--secondary btn--sm"
          disabled={page * pageSize >= total}
          onClick={() => onPageChange(page + 1)}
        >
          {t('pagination.next')}
        </button>
      </div>
    </div>
  );
}
