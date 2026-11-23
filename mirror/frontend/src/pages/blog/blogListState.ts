import {
  BLOG_PAGE_SIZE,
  BLOG_PAGE_SIZES,
  BLOG_READINGS,
  BLOG_SORTS,
  type BlogReading,
  type BlogSort,
  type PublicBlogListQuery,
} from '../../api/blog';

/**
 * URL ⇄ list state for every blog list route (`/blog`, category, tag and
 * author archives). The URL is the single source of truth: each filter is a
 * query parameter, defaults are omitted so canonical URLs stay clean, and
 * anything malformed falls back to its default instead of reaching the API.
 *
 *   ?q=…            free text (≤ 120 chars)
 *   ?category=slug  ?tag=slug          (archives lock their own dimension)
 *   ?sort=relevance|newest|oldest|updated   default: relevance with q, newest otherwise
 *   ?reading=short|medium|long
 *   ?page=N         ?size=12|24|48
 *   ?all=1          `/blog` only: the full list instead of the editorial home
 */

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_Q = 120;
export const SEARCH_DEBOUNCE_MS = 350;

export const SORT_LABELS: Record<BlogSort, string> = {
  relevance: 'blog.reader.mostRelevant',
  newest: 'blog.reader.latest',
  oldest: 'blog.reader.oldest',
  updated: 'blog.reader.updated153',
  popular: 'blog.reader.mostPopular',
};

export const READING_LABELS: Record<BlogReading, string> = {
  short: 'blog.reader.shortUpTo3Min',
  medium: 'blog.reader.medium48Min',
  long: 'blog.reader.long9MinOrMore',
};

export interface BlogListState {
  q: string;
  category: string;
  tag: string;
  sort: BlogSort;
  reading: BlogReading | '';
  page: number;
  pageSize: number;
  /** `/blog?all=1` — show the paginated list even without filters. */
  all: boolean;
}

export type BlogListPatch = Partial<BlogListState>;

/** Dimension fixed by the route (an archive page) — never read from or written to the query string. */
export type LockedDimension = 'category' | 'tag' | 'author';

export const defaultSort = (q: string): BlogSort => (q ? 'relevance' : 'newest');

/** Parses and clamps a `page` query parameter (anything odd → 1). */
export function parsePage(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

export function parsePageSize(raw: string | null): number {
  const n = Number(raw);
  return BLOG_PAGE_SIZES.includes(n) ? n : BLOG_PAGE_SIZE;
}

const isSort = (value: string): value is BlogSort => (BLOG_SORTS as readonly string[]).includes(value);
const isReading = (value: string): value is BlogReading => (BLOG_READINGS as readonly string[]).includes(value);

export function readListState(params: URLSearchParams, lock?: LockedDimension): BlogListState {
  const q = (params.get('q') ?? '').trim().slice(0, MAX_Q);
  const slugParam = (key: 'category' | 'tag') => {
    if (lock === key) return '';
    const raw = params.get(key) ?? '';
    return SLUG_RE.test(raw) && raw.length <= 110 ? raw : '';
  };
  const sortRaw = params.get('sort') ?? '';
  const sort = isSort(sortRaw) && (sortRaw !== 'relevance' || q) ? sortRaw : defaultSort(q);
  const readingRaw = params.get('reading') ?? '';
  return {
    q,
    category: slugParam('category'),
    tag: slugParam('tag'),
    sort,
    reading: isReading(readingRaw) ? readingRaw : '',
    page: parsePage(params.get('page')),
    pageSize: parsePageSize(params.get('size')),
    all: params.get('all') === '1',
  };
}

/** Query string (without `?`) for a state — defaults omitted, stable key order. */
export function listSearchParams(state: BlogListState): URLSearchParams {
  const out = new URLSearchParams();
  if (state.q) out.set('q', state.q);
  if (state.category) out.set('category', state.category);
  if (state.tag) out.set('tag', state.tag);
  if (state.sort !== defaultSort(state.q)) out.set('sort', state.sort);
  if (state.reading) out.set('reading', state.reading);
  if (state.page > 1) out.set('page', String(state.page));
  if (state.pageSize !== BLOG_PAGE_SIZE) out.set('size', String(state.pageSize));
  if (state.all) out.set('all', '1');
  return out;
}

export function listHref(base: string, state: BlogListState): string {
  const qs = listSearchParams(state).toString();
  return qs ? `${base}?${qs}` : base;
}

/** Applies a patch; any change other than the page itself goes back to page 1. */
export function patchState(state: BlogListState, patch: BlogListPatch): BlogListState {
  const next: BlogListState = { ...state, ...patch };
  if (patch.q !== undefined && patch.q !== state.q && patch.sort === undefined) {
    // Typing a query switches to relevance; clearing it goes back to newest —
    // unless the reader picked an explicit chronological sort for this query.
    if (state.sort === defaultSort(state.q)) next.sort = defaultSort(next.q);
    else if (!next.q && next.sort === 'relevance') next.sort = 'newest';
  }
  if (next.sort === 'relevance' && !next.q) next.sort = 'newest';
  if (patch.page === undefined) next.page = 1;
  return next;
}

/** Filters that are active beyond the plain list (used for pills and the "clear all" affordance). */
export function activeFilterCount(state: BlogListState): number {
  return [state.q, state.category, state.tag, state.reading].filter(Boolean).length;
}

/** True when nothing asks for the list view — `/blog` then shows the editorial home. */
export const isPlainList = (state: BlogListState): boolean =>
  !state.all && activeFilterCount(state) === 0 && state.sort === 'newest' && state.page === 1 && state.pageSize === BLOG_PAGE_SIZE;

/** The API query for a state (plus the archive's locked dimension, if any). */
export function toApiQuery(state: BlogListState, locked?: { [K in LockedDimension]?: string }): PublicBlogListQuery {
  return {
    q: state.q || undefined,
    category: locked?.category ?? (state.category || undefined),
    tag: locked?.tag ?? (state.tag || undefined),
    author: locked?.author,
    sort: state.sort,
    reading: state.reading || undefined,
    page: state.page,
    pageSize: state.pageSize,
  };
}
