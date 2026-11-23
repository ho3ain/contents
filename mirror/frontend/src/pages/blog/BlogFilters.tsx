import { t } from '../../i18n';
import { useEffect, useId, useState, type FormEvent } from 'react';
import type { BlogReading, BlogSort, PublicBlogCategory, PublicBlogTag } from '../../api/blog';
import { AppIcon } from '../../components/ui/AppIcon';
import {
  activeFilterCount,
  MAX_Q,
  READING_LABELS,
  SEARCH_DEBOUNCE_MS,
  SORT_LABELS,
  type BlogListPatch,
  type BlogListState,
  type LockedDimension,
} from './blogListState';
import { faNum } from './blogShared';

/**
 * Blog list controls — one component for `/blog` and the archives.
 *
 * Every control writes the URL through `onChange` (the page owns the
 * `useSearchParams` round-trip), so results are shareable, the back button
 * works and nothing is kept in component state except the search draft.
 *
 *  - search: live (debounced 350 ms, `replace` navigation while typing so
 *    history is not flooded), Enter / button submits immediately, Esc clears
 *  - sort: native radios styled as a segmented control (arrow keys for free);
 *    «مرتبط‌ترین» appears only while a query is set
 *  - reading time: native select (short ≤ 3 / medium 4–8 / long ≥ 9 min)
 *  - categories / tags: toggle chips with counts; the archive's own
 *    dimension is locked (not shown) and never written to the URL
 *  - active filters: removable pills + «پاک کردن همه»
 */

const TOP_TAGS = 8;

export type ChangeOptions = { replace?: boolean };
export type OnChange = (patch: BlogListPatch, options?: ChangeOptions) => void;

export function BlogSearchBox({
  value,
  onChange,
  className = 'blog-search',
  placeholder = t('blog.reader.searchArticles56'),
  label = t('blog.reader.searchArticles'),
  autoFocus = false,
}: {
  value: string;
  onChange: OnChange;
  className?: string;
  placeholder?: string;
  label?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    // URL changed outside the box (back button, pill, clear all) — adopt it.
    setSynced(value);
    setDraft(value);
  }
  const normalized = draft.trim().slice(0, MAX_Q);

  useEffect(() => {
    if (normalized === value) return;
    const timer = window.setTimeout(() => onChange({ q: normalized }, { replace: true }), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [normalized, value, onChange]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (normalized !== value) onChange({ q: normalized });
  };
  const clear = () => {
    setDraft('');
    if (value) onChange({ q: '' });
  };

  return (
    <form className={className} role="search" onSubmit={submit} data-testid="blog-search-form">
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <AppIcon name="search" size="sm" className="blog-search-icon" />
      <input
        id={id}
        type="search"
        placeholder={placeholder}
        maxLength={MAX_Q}
        value={draft}
        autoComplete="off"
        autoFocus={autoFocus}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && draft) {
            event.preventDefault();
            clear();
          }
        }}
        data-testid="blog-search-input"
      />
      {draft && (
        <button type="button" className="blog-search-clear" onClick={clear} aria-label={t('blog.reader.clearSearch')} data-testid="blog-search-clear">
          <AppIcon name="x" size="xs" />
        </button>
      )}
      <button className="button button-primary" type="submit" data-testid="blog-search-submit">
        {t('blog.reader.search')}<AppIcon name="arrowForward" size="xs" />
      </button>
    </form>
  );
}

export function BlogFilters({
  state,
  onChange,
  categories,
  tags,
  lock,
  lockedLabel,
  showSearch = false,
}: {
  state: BlogListState;
  onChange: OnChange;
  categories?: PublicBlogCategory[] | null;
  tags?: PublicBlogTag[] | null;
  lock?: LockedDimension;
  /** Human name of the locked dimension (shown as a fixed pill, e.g. the category). */
  lockedLabel?: string;
  showSearch?: boolean;
}) {
  const sortId = useId();
  const readingId = useId();
  const sorts: BlogSort[] = state.q ? ['relevance', 'newest', 'oldest', 'updated'] : ['newest', 'oldest', 'updated'];
  const visibleCategories = lock === 'category' ? [] : (categories ?? []).filter((c) => c.postCount > 0 || c.slug === state.category);
  const activeCategory = visibleCategories.find((c) => c.slug === state.category) ?? null;
  const tagPool = lock === 'tag' ? [] : (tags ?? []).filter((t) => t.postCount > 0);
  const topTags = [...tagPool].sort((a, b) => b.postCount - a.postCount || a.name.localeCompare(b.name, 'fa')).slice(0, TOP_TAGS);
  const activeTag = tagPool.find((t) => t.slug === state.tag) ?? null;
  const visibleTags = activeTag && !topTags.includes(activeTag) ? [activeTag, ...topTags] : topTags;
  const active = activeFilterCount(state);

  return (
    <div className="blog-toolbar" data-testid="blog-filters">
      {showSearch && (
        <BlogSearchBox
          value={state.q}
          onChange={onChange}
          className="blog-search blog-search--toolbar"
          placeholder={lockedLabel ? t('blog.reader.searchIn', { name: lockedLabel }) : t('blog.reader.searchArticles56')}
        />
      )}

      {visibleCategories.length > 0 && (
        <div className="blog-categories" role="group" aria-label={t('blog.reader.articleCategories')} data-testid="blog-category-chips">
          <button
            type="button"
            className={!state.category ? 'active' : undefined}
            aria-pressed={!state.category}
            onClick={() => onChange({ category: '' })}
          >
            {t('blog.reader.all')}</button>
          {visibleCategories.map((cat) => (
            <button
              key={cat.slug}
              type="button"
              className={state.category === cat.slug ? 'active' : undefined}
              aria-pressed={state.category === cat.slug}
              onClick={() => onChange({ category: state.category === cat.slug ? '' : cat.slug })}
            >
              {cat.name} <small>({faNum(cat.postCount)})</small>
            </button>
          ))}
        </div>
      )}

      <div className="blog-toolbar-row">
        <fieldset className="blog-segmented" data-testid="blog-sort">
          <legend id={sortId}>{t('blog.reader.sortBy')}</legend>
          {sorts.map((sort) => (
            <label key={sort} className={state.sort === sort ? 'is-checked' : undefined}>
              <input type="radio" name={`${sortId}-sort`} value={sort} checked={state.sort === sort} onChange={() => onChange({ sort })} />
              <span>{t(SORT_LABELS[sort])}</span>
            </label>
          ))}
        </fieldset>

        <label className="blog-select" htmlFor={readingId}>
          <AppIcon name="clock" size="sm" />
          <span>{t('blog.reader.readingTime')}</span>
          <select
            id={readingId}
            value={state.reading}
            onChange={(event) => onChange({ reading: event.target.value as BlogReading | '' })}
            data-testid="blog-reading"
          >
            <option value="">{t('blog.reader.all')}</option>
            {(Object.keys(READING_LABELS) as BlogReading[]).map((key) => (
              <option key={key} value={key}>
                {t(READING_LABELS[key])}
              </option>
            ))}
          </select>
        </label>
      </div>

      {visibleTags.length > 0 && (
        <div className="blog-tags" role="group" aria-label={t('blog.reader.tags')} data-testid="blog-tag-chips">
          {visibleTags.map((tag) => (
            <button
              key={tag.slug}
              type="button"
              className={state.tag === tag.slug ? 'active' : undefined}
              aria-pressed={state.tag === tag.slug}
              onClick={() => onChange({ tag: state.tag === tag.slug ? '' : tag.slug })}
            >
              #{tag.name} <small>({faNum(tag.postCount)})</small>
            </button>
          ))}
        </div>
      )}

      {(active > 0 || lockedLabel) && (
        <ul className="blog-active-filters" aria-label={t('blog.reader.activeFilters')} data-testid="blog-active-filters">
          {lockedLabel && (
            <li className="is-locked">
              <span>{lockedLabel}</span>
            </li>
          )}
          {state.q && <Pill label={t('blog.reader.searchFilter', { name: state.q })} onRemove={() => onChange({ q: '' })} />}
          {state.category && <Pill label={t('blog.reader.categoryFilter', { name: activeCategory?.name ?? state.category })} onRemove={() => onChange({ category: '' })} />}
          {state.tag && <Pill label={t('blog.reader.tagFilter', { name: activeTag?.name ?? state.tag })} onRemove={() => onChange({ tag: '' })} />}
          {state.reading && <Pill label={t('blog.reader.readingFilter', { name: t(READING_LABELS[state.reading]) })} onRemove={() => onChange({ reading: '' })} />}
          {active > 1 && (
            <li>
              <button
                type="button"
                className="blog-clear-all"
                onClick={() => onChange({ q: '', category: '', tag: '', reading: '', sort: 'newest' })}
                data-testid="blog-clear-filters"
              >
                {t('blog.reader.clearAll')}{faNum(active)})
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function Pill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <li>
      <button type="button" className="blog-pill" onClick={onRemove} aria-label={t('blog.reader.removeFilter', { name: label })}>
        <span>{label}</span>
        <AppIcon name="x" size="xs" />
      </button>
    </li>
  );
}
