import { describe, expect, it } from 'vitest';
import { activeFilterCount, isPlainList, listHref, listSearchParams, patchState, readListState, toApiQuery } from '../blogListState';
import { pagerWindow } from '../blogShared';

const read = (qs: string, lock?: 'category' | 'tag' | 'author') => readListState(new URLSearchParams(qs), lock);

describe('blogListState', () => {
  it('reads every filter from the URL and falls back to defaults for anything malformed', () => {
    expect(read('')).toEqual({ q: '', category: '', tag: '', sort: 'newest', reading: '', page: 1, pageSize: 9, all: false });
    expect(read('q=%20تسویه%20&category=buyers-guide&tag=refunds&sort=oldest&reading=long&page=3&size=48&all=1')).toEqual({
      q: 'تسویه',
      category: 'buyers-guide',
      tag: 'refunds',
      sort: 'oldest',
      reading: 'long',
      page: 3,
      pageSize: 9,
      all: true,
    });
    const bad = read('sort=bogus&reading=huge&size=7&page=-2&category=<script>&tag=Bad%20Slug&all=yes');
    expect(bad).toEqual({ q: '', category: '', tag: '', sort: 'newest', reading: '', page: 1, pageSize: 9, all: false });
    expect(read('q=' + 'x'.repeat(200)).q).toHaveLength(120);
  });

  it('defaults to relevance with a query and refuses relevance without one', () => {
    expect(read('q=api').sort).toBe('relevance');
    expect(read('q=api&sort=updated').sort).toBe('updated');
    expect(read('sort=relevance').sort).toBe('newest');
  });

  it('never reads the locked dimension of an archive', () => {
    expect(read('category=other&tag=ai', 'category')).toMatchObject({ category: '', tag: 'ai' });
    expect(read('category=other&tag=ai', 'tag')).toMatchObject({ category: 'other', tag: '' });
    expect(toApiQuery(read('tag=ai', 'category'), { category: 'automation' })).toMatchObject({ category: 'automation', tag: 'ai' });
  });

  it('writes a clean, stable query string (defaults omitted) and round-trips', () => {
    const state = read('q=a%20b&sort=oldest&reading=short&page=2&size=24&tag=ai');
    expect(listHref('/blog', state)).toBe('/blog?q=a+b&tag=ai&sort=oldest&reading=short&page=2');
    expect(listHref('/blog', read(''))).toBe('/blog');
    expect(read(listSearchParams(state).toString())).toEqual(state);
    // relevance is the implied sort of a query → not written
    expect(listHref('/blog', read('q=x&sort=relevance'))).toBe('/blog?q=x');
  });

  it('patches reset the page, switch relevance on/off with the query and keep explicit sorts', () => {
    const base = read('page=4');
    expect(patchState(base, { q: 'api' })).toMatchObject({ q: 'api', sort: 'relevance', page: 1 });
    expect(patchState(read('q=api'), { q: '' })).toMatchObject({ q: '', sort: 'newest' });
    expect(patchState(read('q=api&sort=oldest'), { q: 'other' })).toMatchObject({ q: 'other', sort: 'oldest' });
    expect(patchState(read('q=api&sort=oldest'), { q: '' })).toMatchObject({ q: '', sort: 'oldest' });
    expect(patchState(read('page=3&q=x'), { page: 2 })).toMatchObject({ page: 2, q: 'x' });
    expect(patchState(read('page=3'), { sort: 'relevance' }).sort).toBe('newest');
    expect(patchState(read('page=3&size=24'), { pageSize: 9 })).toMatchObject({ page: 1, pageSize: 9 });
  });

  it('knows when the home should show the editorial view', () => {
    expect(isPlainList(read(''))).toBe(true);
    for (const qs of ['q=x', 'category=a', 'tag=a', 'reading=short', 'sort=oldest', 'page=2', 'all=1'])
      expect(isPlainList(read(qs)), qs).toBe(false);
    expect(activeFilterCount(read('q=x&tag=a&sort=oldest'))).toBe(2);
  });

  it('builds a stable pager window with first/last, siblings and single-page gaps filled', () => {
    expect(pagerWindow(1, 10)).toEqual([1, 2, 3, 4, 5, null, 10]);
    expect(pagerWindow(4, 10)).toEqual([1, 2, 3, 4, 5, null, 10]);
    expect(pagerWindow(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(pagerWindow(10, 10)).toEqual([1, null, 6, 7, 8, 9, 10]);
    expect(pagerWindow(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pagerWindow(1, 1)).toEqual([]);
  });
});
