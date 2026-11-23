import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { blogAdminApi, type AdminBlogCategory, type AdminBlogTag, type BlogCategoryInput } from '../../../api/blog';
import { Modal } from '../../../components/Modal';
import { useToast } from '../../../components/Toast';
import {
  Badge,
  Button,
  ErrorState,
  Field,
  Input,
  PageHeader,
  SearchField,
  SkeletonList,
  TabPanel,
  Tabs,
  Textarea,
  Toggle,
} from '../../../components/ui';
import { formatCount } from '../../../lib/format';
import { useAsync } from '../../../lib/useAsync';
import { usePageMeta } from '../../../lib/usePageMeta';
import { t } from '../../../i18n';
import { SLUG_RE, blogErrorMessage, useBlogAccess } from './blogAdminShared';

/**
 * `/admin/blog/taxonomy` — editorial categories (one nesting level) and
 * tags. Separate from the marketplace taxonomy on purpose (docs/blog
 * decisions): a blog category is an editorial section, not a product
 * classification. Deleting a category that still has articles requires a
 * target to move them to; tags can be merged (links move, sources vanish).
 */

type Tab = 'categories' | 'tags';

interface CategoryForm {
  id: string | null;
  name: string;
  nameEn: string;
  slug: string;
  description: string;
  parentId: string;
  sortOrder: string;
  isActive: boolean;
}

const blankCategory = (): CategoryForm => ({
  id: null,
  name: '',
  nameEn: '',
  slug: '',
  description: '',
  parentId: '',
  sortOrder: '',
  isActive: true,
});
const fromCategory = (c: AdminBlogCategory): CategoryForm => ({
  id: c.id,
  name: c.name,
  nameEn: c.nameEn ?? '',
  slug: c.slug,
  description: c.description ?? '',
  parentId: c.parentId ?? '',
  sortOrder: String(c.sortOrder ?? ''),
  isActive: c.isActive,
});

export function AdminBlogTaxonomyPage() {
  usePageMeta(t('blog.taxonomy.title'), undefined, 'MESH', { robots: 'noindex,nofollow' });
  const toast = useToast();
  const { access } = useBlogAccess();
  const canManage = access?.can.manage ?? false;
  const [tab, setTab] = useState<Tab>('categories');
  const [query, setQuery] = useState('');
  const categories = useAsync(() => blogAdminApi.categories(), []);
  const tags = useAsync(() => blogAdminApi.tags(), []);

  const [editor, setEditor] = useState<CategoryForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<{ category: AdminBlogCategory; reassignToId: string } | null>(null);

  const [tagEditor, setTagEditor] = useState<{ id: string | null; name: string; slug: string } | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [mergeTarget, setMergeTarget] = useState<string>('');
  const [merging, setMerging] = useState(false);
  const [deletingTag, setDeletingTag] = useState<AdminBlogTag | null>(null);

  const q = query.trim().toLowerCase();
  const categoryRows = useMemo(() => {
    const all = categories.data ?? [];
    const roots = all.filter((c) => !c.parentId);
    const flat: Array<{ row: AdminBlogCategory; depth: number }> = [];
    for (const root of roots) {
      flat.push({ row: root, depth: 0 });
      for (const child of all.filter((c) => c.parentId === root.id)) flat.push({ row: child, depth: 1 });
    }
    for (const orphan of all.filter((c) => c.parentId && !roots.some((r) => r.id === c.parentId))) flat.push({ row: orphan, depth: 1 });
    return q
      ? flat.filter(({ row }) => row.name.toLowerCase().includes(q) || row.slug.includes(q) || (row.nameEn ?? '').toLowerCase().includes(q))
      : flat;
  }, [categories.data, q]);
  const tagRows = useMemo(
    () => (tags.data ?? []).filter((x) => !q || x.name.toLowerCase().includes(q) || x.slug.includes(q)),
    [tags.data, q],
  );

  const saveCategory = async () => {
    if (!editor) return;
    if (editor.name.trim().length < 2) return setFormError(t('blog.taxonomy.err.name'));
    if (editor.slug.trim() && !SLUG_RE.test(editor.slug.trim())) return setFormError(t('blog.editor.err.slug'));
    setBusy(true);
    setFormError(null);
    try {
      const body: BlogCategoryInput = {
        name: editor.name.trim(),
        nameEn: editor.nameEn.trim() || null,
        description: editor.description.trim() || null,
        parentId: editor.parentId || null,
        sortOrder: editor.sortOrder.trim() ? Number(editor.sortOrder) : undefined,
        isActive: editor.isActive,
      };
      if (editor.slug.trim()) body.slug = editor.slug.trim();
      if (editor.id) await blogAdminApi.updateCategory(editor.id, body);
      else await blogAdminApi.createCategory(body);
      await categories.refetch();
      toast.success(t('blog.taxonomy.saved'));
      setEditor(null);
    } catch (error) {
      setFormError(blogErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const toggleCategory = async (row: AdminBlogCategory, next: boolean) => {
    try {
      await blogAdminApi.updateCategory(row.id, { isActive: next });
      await categories.refetch();
    } catch (error) {
      toast.error(blogErrorMessage(error));
    }
  };

  const deleteCategory = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const result = await blogAdminApi.deleteCategory(deleting.category.id, deleting.reassignToId || null);
      toast.success(t('blog.taxonomy.categoryDeleted', { count: formatCount(result.reassigned) }));
      setDeleting(null);
      await categories.refetch();
    } catch (error) {
      toast.error(blogErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const saveTag = async () => {
    if (!tagEditor) return;
    if (tagEditor.name.trim().length < 2) return setFormError(t('blog.taxonomy.err.name'));
    if (tagEditor.slug.trim() && !SLUG_RE.test(tagEditor.slug.trim())) return setFormError(t('blog.editor.err.slug'));
    setBusy(true);
    setFormError(null);
    try {
      const body = { name: tagEditor.name.trim(), ...(tagEditor.slug.trim() ? { slug: tagEditor.slug.trim() } : {}) };
      if (tagEditor.id) await blogAdminApi.updateTag(tagEditor.id, body);
      else await blogAdminApi.createTag(body);
      await tags.refetch();
      toast.success(t('blog.taxonomy.saved'));
      setTagEditor(null);
    } catch (error) {
      setFormError(blogErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const merge = async () => {
    const sources = [...selectedTags].filter((id) => id !== mergeTarget);
    if (!mergeTarget || sources.length === 0) return;
    setBusy(true);
    try {
      await blogAdminApi.mergeTags(sources, mergeTarget);
      toast.success(t('blog.taxonomy.merged', { count: formatCount(sources.length) }));
      setMerging(false);
      setSelectedTags(new Set());
      setMergeTarget('');
      await tags.refetch();
    } catch (error) {
      toast.error(blogErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const deleteTag = async () => {
    if (!deletingTag) return;
    setBusy(true);
    try {
      await blogAdminApi.deleteTag(deletingTag.id);
      toast.success(t('blog.taxonomy.tagDeleted'));
      setDeletingTag(null);
      await tags.refetch();
    } catch (error) {
      toast.error(blogErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const loading = tab === 'categories' ? categories.loading : tags.loading;
  const error = tab === 'categories' ? categories.error : tags.error;
  const refetch = tab === 'categories' ? categories.refetch : tags.refetch;
  const parents = (categories.data ?? []).filter((c) => !c.parentId);

  return (
    <div className="container page" data-testid="admin-blog-taxonomy">
      <PageHeader
        title={t('blog.taxonomy.title')}
        description={t('blog.taxonomy.subtitle')}
        actions={
          <div className="row" style={{ gap: 8 }}>
            <Link className="btn btn--secondary btn--sm" to="/admin/blog">
              {t('blog.common.backToList')}
            </Link>
            {canManage && (
              <Button
                size="sm"
                onClick={() => {
                  setFormError(null);
                  if (tab === 'categories') setEditor(blankCategory());
                  else setTagEditor({ id: null, name: '', slug: '' });
                }}
                data-testid="blog-taxonomy-create"
              >
                {tab === 'categories' ? t('blog.taxonomy.newCategory') : t('blog.taxonomy.newTag')}
              </Button>
            )}
          </div>
        }
      />

      <Tabs<Tab>
        items={[
          { key: 'categories', label: `${t('blog.taxonomy.tabCategories')} (${formatCount((categories.data ?? []).length)})` },
          { key: 'tags', label: `${t('blog.taxonomy.tabTags')} (${formatCount((tags.data ?? []).length)})` },
        ]}
        active={tab}
        onChange={setTab}
        label={t('blog.taxonomy.title')}
        idPrefix="blog-taxonomy"
      />

      <div className="row row--between mt-4 mb-4" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div style={{ maxWidth: 420, flex: 1 }}>
          <SearchField
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('blog.taxonomy.search')}
            aria-label={t('blog.taxonomy.search')}
          />
        </div>
        {tab === 'tags' && canManage && selectedTags.size >= 2 && (
          <Button size="sm" variant="secondary" onClick={() => setMerging(true)} data-testid="blog-tags-merge">
            {t('blog.taxonomy.merge', { count: formatCount(selectedTags.size) })}
          </Button>
        )}
      </div>

      {loading ? (
        <SkeletonList rows={8} />
      ) : error ? (
        <ErrorState description={error} retry={refetch} />
      ) : tab === 'categories' ? (
        <TabPanel idPrefix="blog-taxonomy" tabKey="categories">
          <div className="table-wrap">
            <table className="table" data-testid="blog-categories-table">
              <thead>
                <tr>
                  <th>{t('blog.taxonomy.col.name')}</th>
                  <th>{t('blog.taxonomy.col.slug')}</th>
                  <th>{t('blog.taxonomy.col.posts')}</th>
                  <th>{t('blog.taxonomy.col.status')}</th>
                  <th>
                    <span className="sr-only">{t('blog.taxonomy.col.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {categoryRows.map(({ row, depth }) => (
                  <tr key={row.id} data-testid={`blog-category-${row.slug}`} className={row.isActive ? undefined : 'is-muted'}>
                    <td style={{ paddingInlineStart: depth ? 28 : undefined }}>
                      {depth > 0 && (
                        <span aria-hidden="true" className="muted">
                          ↳{' '}
                        </span>
                      )}
                      <strong>{row.name}</strong>
                      {row.nameEn && (
                        <span className="muted small" dir="ltr">
                          {' '}
                          · {row.nameEn}
                        </span>
                      )}
                      {row.description && <div className="muted small">{row.description}</div>}
                    </td>
                    <td dir="ltr">
                      <code>{row.slug}</code>
                    </td>
                    <td>
                      {formatCount(row.publishedCount)}
                      <span className="muted small"> / {formatCount(row.postCount)}</span>
                    </td>
                    <td>
                      <span className="row" style={{ gap: 8, alignItems: 'center' }}>
                        {canManage && (
                          <Toggle
                            checked={row.isActive}
                            onChange={(next) => void toggleCategory(row, next)}
                            label={t('blog.taxonomy.col.status')}
                          />
                        )}
                        <Badge tone={row.isActive ? 'success' : 'neutral'}>
                          {row.isActive ? t('blog.taxonomy.active') : t('blog.taxonomy.inactive')}
                        </Badge>
                      </span>
                    </td>
                    <td>
                      {canManage && (
                        <span className="row" style={{ gap: 6 }}>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setFormError(null);
                              setEditor(fromCategory(row));
                            }}
                          >
                            {t('common.edit')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleting({ category: row, reassignToId: '' })}
                            data-testid={`blog-category-delete-${row.slug}`}
                          >
                            {t('common.delete')}
                          </Button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {categoryRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      {t('blog.taxonomy.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabPanel>
      ) : (
        <TabPanel idPrefix="blog-taxonomy" tabKey="tags">
          <div className="table-wrap">
            <table className="table" data-testid="blog-tags-table">
              <thead>
                <tr>
                  {canManage && <th style={{ width: 36 }} />}
                  <th>{t('blog.taxonomy.col.name')}</th>
                  <th>{t('blog.taxonomy.col.slug')}</th>
                  <th>{t('blog.taxonomy.col.posts')}</th>
                  <th>
                    <span className="sr-only">{t('blog.taxonomy.col.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tagRows.map((row) => (
                  <tr key={row.id} data-testid={`blog-tag-${row.slug}`}>
                    {canManage && (
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedTags.has(row.id)}
                          aria-label={row.name}
                          onChange={() =>
                            setSelectedTags((prev) => {
                              const next = new Set(prev);
                              if (next.has(row.id)) next.delete(row.id);
                              else next.add(row.id);
                              return next;
                            })
                          }
                        />
                      </td>
                    )}
                    <td>
                      <strong>{row.name}</strong>
                    </td>
                    <td dir="ltr">
                      <code>{row.slug}</code>
                    </td>
                    <td>
                      {formatCount(row.publishedCount)}
                      <span className="muted small"> / {formatCount(row.postCount)}</span>
                    </td>
                    <td>
                      {canManage && (
                        <span className="row" style={{ gap: 6 }}>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setFormError(null);
                              setTagEditor({ id: row.id, name: row.name, slug: row.slug });
                            }}
                          >
                            {t('common.edit')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeletingTag(row)}>
                            {t('common.delete')}
                          </Button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {tagRows.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 5 : 4} className="muted">
                      {t('blog.taxonomy.emptyTags')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabPanel>
      )}

      <p className="muted small mt-4">{t('blog.taxonomy.note')}</p>

      {/* category editor */}
      <Modal
        open={editor !== null}
        title={editor?.id ? t('blog.taxonomy.editCategory', { name: editor.name }) : t('blog.taxonomy.newCategory')}
        onClose={() => (busy ? undefined : setEditor(null))}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditor(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="blog-category-form" disabled={busy} data-testid="blog-category-save">
              {busy ? t('blog.common.working') : t('blog.common.save')}
            </Button>
          </>
        }
      >
        {editor && (
          <form
            id="blog-category-form"
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void saveCategory();
            }}
          >
            {formError && (
              <p className="field__error" role="alert">
                {formError}
              </p>
            )}
            <div className="grid grid--2col">
              <Field label={t('blog.taxonomy.col.name')} htmlFor="bc-name">
                <Input
                  id="bc-name"
                  value={editor.name}
                  onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                  required
                  maxLength={80}
                  data-testid="bc-name"
                />
              </Field>
              <Field label={t('blog.taxonomy.nameEn')} htmlFor="bc-name-en">
                <Input
                  id="bc-name-en"
                  dir="ltr"
                  value={editor.nameEn}
                  onChange={(e) => setEditor({ ...editor, nameEn: e.target.value })}
                  maxLength={80}
                />
              </Field>
            </div>
            <div className="grid grid--2col">
              <Field label={t('blog.taxonomy.col.slug')} htmlFor="bc-slug" hint={t('blog.taxonomy.slugHint')}>
                <Input
                  id="bc-slug"
                  dir="ltr"
                  value={editor.slug}
                  onChange={(e) => setEditor({ ...editor, slug: e.target.value.toLowerCase() })}
                  maxLength={110}
                />
              </Field>
              <Field label={t('blog.taxonomy.sortOrder')} htmlFor="bc-sort">
                <Input
                  id="bc-sort"
                  type="number"
                  dir="ltr"
                  value={editor.sortOrder}
                  onChange={(e) => setEditor({ ...editor, sortOrder: e.target.value })}
                />
              </Field>
            </div>
            <Field label={t('blog.taxonomy.parent')} htmlFor="bc-parent" hint={t('blog.taxonomy.parentHint')}>
              <select
                id="bc-parent"
                className="select"
                value={editor.parentId}
                onChange={(e) => setEditor({ ...editor, parentId: e.target.value })}
              >
                <option value="">{t('blog.taxonomy.noParent')}</option>
                {parents
                  .filter((p) => p.id !== editor.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label={t('blog.taxonomy.description')} htmlFor="bc-desc" hint={t('blog.taxonomy.descriptionHint')}>
              <Textarea
                id="bc-desc"
                rows={3}
                value={editor.description}
                onChange={(e) => setEditor({ ...editor, description: e.target.value })}
                maxLength={400}
              />
            </Field>
            <div className="row row--between">
              <span>{t('blog.taxonomy.active')}</span>
              <Toggle checked={editor.isActive} onChange={(v) => setEditor({ ...editor, isActive: v })} label={t('blog.taxonomy.active')} />
            </div>
          </form>
        )}
      </Modal>

      {/* category delete / reassign */}
      <Modal
        open={deleting !== null}
        title={deleting ? t('blog.taxonomy.deleteCategory', { name: deleting.category.name }) : ''}
        onClose={() => (busy ? undefined : setDeleting(null))}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => void deleteCategory()}
              disabled={busy || (Boolean(deleting?.category.postCount) && !deleting?.reassignToId)}
              data-testid="blog-category-delete-confirm"
            >
              {t('common.delete')}
            </Button>
          </>
        }
      >
        {deleting && (
          <div className="stack">
            {deleting.category.postCount > 0 ? (
              <>
                <p>{t('blog.taxonomy.deleteHasPosts', { count: formatCount(deleting.category.postCount) })}</p>
                <Field label={t('blog.taxonomy.reassignTo')} htmlFor="bc-reassign">
                  <select
                    id="bc-reassign"
                    className="select"
                    value={deleting.reassignToId}
                    onChange={(e) => setDeleting({ ...deleting, reassignToId: e.target.value })}
                    data-testid="blog-category-reassign"
                  >
                    <option value="">{t('blog.editor.pickCategory')}</option>
                    {(categories.data ?? [])
                      .filter((c) => c.id !== deleting.category.id && c.parentId !== deleting.category.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.parentId ? `↳ ${c.name}` : c.name}
                        </option>
                      ))}
                  </select>
                </Field>
              </>
            ) : (
              <p>{t('blog.taxonomy.deleteEmpty')}</p>
            )}
          </div>
        )}
      </Modal>

      {/* tag editor */}
      <Modal
        open={tagEditor !== null}
        title={tagEditor?.id ? t('blog.taxonomy.editTag', { name: tagEditor.name }) : t('blog.taxonomy.newTag')}
        onClose={() => (busy ? undefined : setTagEditor(null))}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTagEditor(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="blog-tag-form" disabled={busy} data-testid="blog-tag-save">
              {busy ? t('blog.common.working') : t('blog.common.save')}
            </Button>
          </>
        }
      >
        {tagEditor && (
          <form
            id="blog-tag-form"
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void saveTag();
            }}
          >
            {formError && (
              <p className="field__error" role="alert">
                {formError}
              </p>
            )}
            <Field label={t('blog.taxonomy.col.name')} htmlFor="bt-name">
              <Input
                id="bt-name"
                value={tagEditor.name}
                onChange={(e) => setTagEditor({ ...tagEditor, name: e.target.value })}
                required
                maxLength={60}
                data-testid="bt-name"
              />
            </Field>
            <Field label={t('blog.taxonomy.col.slug')} htmlFor="bt-slug" hint={t('blog.taxonomy.slugHint')}>
              <Input
                id="bt-slug"
                dir="ltr"
                value={tagEditor.slug}
                onChange={(e) => setTagEditor({ ...tagEditor, slug: e.target.value.toLowerCase() })}
                maxLength={110}
              />
            </Field>
          </form>
        )}
      </Modal>

      {/* tag merge */}
      <Modal
        open={merging}
        title={t('blog.taxonomy.mergeTitle')}
        onClose={() => (busy ? undefined : setMerging(false))}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMerging(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void merge()} disabled={busy || !mergeTarget} data-testid="blog-tags-merge-confirm">
              {busy ? t('blog.common.working') : t('blog.common.confirm')}
            </Button>
          </>
        }
      >
        <p>{t('blog.taxonomy.mergeBody')}</p>
        <Field label={t('blog.taxonomy.mergeTarget')} htmlFor="bt-merge-target">
          <select
            id="bt-merge-target"
            className="select"
            value={mergeTarget}
            onChange={(e) => setMergeTarget(e.target.value)}
            data-testid="blog-tags-merge-target"
          >
            <option value="">—</option>
            {(tags.data ?? [])
              .filter((x) => selectedTags.has(x.id))
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} ({formatCount(x.postCount)})
                </option>
              ))}
          </select>
        </Field>
      </Modal>

      {/* tag delete */}
      <Modal
        open={deletingTag !== null}
        title={deletingTag ? t('blog.taxonomy.deleteTag', { name: deletingTag.name }) : ''}
        onClose={() => (busy ? undefined : setDeletingTag(null))}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeletingTag(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => void deleteTag()} disabled={busy}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        {deletingTag && (
          <p>
            {deletingTag.postCount > 0
              ? t('blog.taxonomy.deleteTagHasPosts', { count: formatCount(deletingTag.postCount) })
              : t('blog.taxonomy.deleteEmpty')}
          </p>
        )}
      </Modal>
    </div>
  );
}
