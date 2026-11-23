import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  blogAdminApi,
  type AdminBlogPostDetail,
  type BlogPostInput,
  type BlogReadinessIssue,
  type BlogRevisionRow,
  type BlogSource,
  type BlogWorkflowAction,
} from '../../../api/blog';
import { ApiError } from '../../../api/client';
import { agentsApi, catalogApi, storageApi } from '../../../api/endpoints';
import { Modal } from '../../../components/Modal';
import { useToast } from '../../../components/Toast';
import { Alert, Badge, Button, ErrorState, Field, Input, SkeletonList, Textarea, Toggle } from '../../../components/ui';
import { formatCount, formatDateTime } from '../../../lib/format';
import { useAsync } from '../../../lib/useAsync';
import { usePageMeta } from '../../../lib/usePageMeta';
import { t } from '../../../i18n';
import { BodyEditor } from './editor/BodyEditor';
import type { ContentEditorHandle } from './editor/ContentEditor';
import { SeoStudioPanel, type SeoGoTo } from './editor/SeoStudioPanel';
import {
  CONFIRMED_ACTIONS,
  NOTE_ACTIONS,
  PUBLISH_ACTIONS,
  SLUG_RE,
  StatusBadge,
  actionLabel,
  blogErrorMessage,
  checklistIssues,
  isoToLocal,
  localToIso,
  statusLabel,
  useBlogAccess,
} from './blogAdminShared';
import { Counter, FeaturedImageEditor, Panel, Picker, ReadinessList, SourcesEditor, type PickerOption } from './editorPanels';

/**
 * `/admin/blog/posts/new` and `/admin/blog/posts/:id` — the article editor.
 *
 * Saving model (docs/blog): the form is a local copy of the server detail;
 * "Save" sends ONLY the changed fields with the current `version`. A 409
 * STALE_STATE (someone else saved) is surfaced as a conflict banner — the
 * editor never silently overwrites. Autosave runs 30 s after the last change
 * for non-live articles only (the server refuses autosave on
 * published/scheduled so a live page cannot change half-typed). Leaving with
 * unsaved changes asks first (in-app links and tab close alike).
 */

const AUTOSAVE_MS = 30_000;

interface Form {
  title: string;
  slug: string;
  excerpt: string;
  bodyMarkdown: string;
  featuredImageUrl: string;
  featuredImageAlt: string;
  featuredImageCaption: string;
  authorUserId: string;
  reviewerUserId: string;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  ogImageUrl: string;
  primaryCategoryId: string;
  pillarPostId: string;
  isFeatured: boolean;
  editorialNote: string;
  sources: BlogSource[];
  tagIds: string[];
  relatedPostIds: string[];
  agentIds: string[];
  marketCategoryIds: string[];
}

const BLANK: Form = {
  title: '',
  slug: '',
  excerpt: '',
  bodyMarkdown: '',
  featuredImageUrl: '',
  featuredImageAlt: '',
  featuredImageCaption: '',
  authorUserId: '',
  reviewerUserId: '',
  seoTitle: '',
  seoDescription: '',
  canonicalUrl: '',
  ogImageUrl: '',
  primaryCategoryId: '',
  pillarPostId: '',
  isFeatured: false,
  editorialNote: '',
  sources: [],
  tagIds: [],
  relatedPostIds: [],
  agentIds: [],
  marketCategoryIds: [],
};

const fromDetail = (d: AdminBlogPostDetail): Form => ({
  title: d.title,
  slug: d.slug,
  excerpt: d.excerpt,
  bodyMarkdown: d.bodyMarkdown,
  featuredImageUrl: d.featuredImageUrl ?? '',
  featuredImageAlt: d.featuredImageAlt ?? '',
  featuredImageCaption: d.featuredImageCaption ?? '',
  authorUserId: d.author?.id ?? '',
  reviewerUserId: d.reviewer?.id ?? '',
  seoTitle: d.seoTitle ?? '',
  seoDescription: d.seoDescription ?? '',
  canonicalUrl: d.canonicalUrl ?? '',
  ogImageUrl: d.ogImageUrl ?? '',
  primaryCategoryId: d.category?.id ?? '',
  pillarPostId: d.pillarPostId ?? '',
  isFeatured: d.isFeatured,
  editorialNote: d.editorialNote ?? '',
  sources: d.sources,
  tagIds: d.tagIds,
  relatedPostIds: d.relatedPostIds,
  agentIds: d.agentIds,
  marketCategoryIds: d.marketCategoryIds,
});

const NULLABLE: ReadonlySet<keyof Form> = new Set([
  'featuredImageUrl',
  'featuredImageAlt',
  'featuredImageCaption',
  'authorUserId',
  'reviewerUserId',
  'seoTitle',
  'seoDescription',
  'canonicalUrl',
  'ogImageUrl',
  'primaryCategoryId',
  'pillarPostId',
  'editorialNote',
]);

/** Only the fields that differ from the last server copy, `''` → null for nullable columns. */
function diff(form: Form, base: Form): BlogPostInput {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(form) as Array<keyof Form>) {
    const a = form[key];
    const b = base[key];
    const changed = Array.isArray(a) ? JSON.stringify(a) !== JSON.stringify(b) : a !== b;
    if (!changed) continue;
    out[key] =
      NULLABLE.has(key) && a === '' ? null : key === 'sources' ? (a as BlogSource[]).filter((s) => s.title.trim() && s.url.trim()) : a;
  }
  return out as BlogPostInput;
}

const isDirty = (form: Form, base: Form) => Object.keys(diff(form, base)).length > 0;

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving'; auto: boolean }
  | { kind: 'saved'; at: number; auto: boolean }
  | { kind: 'error'; message: string }
  | { kind: 'conflict'; server: AdminBlogPostDetail | null };

/** Human labels for the fields a conflict comparison can list. */
const FIELD_LABEL_KEYS: Partial<Record<keyof Form, string>> = {
  title: 'blog.editor.title',
  slug: 'blog.editor.slug',
  excerpt: 'blog.editor.excerpt',
  bodyMarkdown: 'blog.editor.body',
  seoTitle: 'blog.editor.seoTitle',
  seoDescription: 'blog.editor.seoDescription',
  canonicalUrl: 'blog.editor.canonical',
  ogImageUrl: 'blog.editor.ogImage',
  featuredImageUrl: 'blog.editor.featuredImage',
  editorialNote: 'blog.editor.editorialNote',
};

/** Local draft retention: unsaved edits survive a crashed tab/browser. */
const LOCAL_DRAFT_PREFIX = 'mesh-blog-draft:';
interface LocalDraft {
  savedAt: string;
  baseVersion: number;
  form: Form;
}
function readLocalDraft(id: string): LocalDraft | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_DRAFT_PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalDraft;
    return parsed && typeof parsed.savedAt === 'string' && parsed.form && typeof parsed.form.bodyMarkdown === 'string' ? parsed : null;
  } catch {
    return null;
  }
}
function writeLocalDraft(id: string, draft: LocalDraft | null) {
  try {
    if (draft) window.localStorage.setItem(LOCAL_DRAFT_PREFIX + id, JSON.stringify(draft));
    else window.localStorage.removeItem(LOCAL_DRAFT_PREFIX + id);
  } catch {
    /* quota / private mode — retention is best effort */
  }
}

export function AdminBlogEditorPage() {
  const { id } = useParams();
  // Keyed by the article id so navigating new → saved → another article
  // starts from a clean form instead of resetting state inside effects.
  return <Editor key={id ?? 'new'} id={id} />;
}

const defaultScheduleAt = () => isoToLocal(new Date(Date.now() + 3_600_000).toISOString());

function Editor({ id }: { id: string | undefined }) {
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();
  const { access } = useBlogAccess();
  const canManage = access?.can.manage ?? false;
  const canPublish = access?.can.publish ?? false;

  const [detail, setDetail] = useState<AdminBlogPostDetail | null>(null);
  const [base, setBase] = useState<Form>(BLANK);
  const [form, setForm] = useState<Form>(BLANK);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [issues, setIssues] = useState<BlogReadinessIssue[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [labels, setLabels] = useState<{
    tags: PickerOption[];
    related: PickerOption[];
    pillar: PickerOption[];
    agents: PickerOption[];
    market: PickerOption[];
  }>({
    tags: [],
    related: [],
    pillar: [],
    agents: [],
    market: [],
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentEditor = useRef<ContentEditorHandle>(null);
  const [contentLanguage, setContentLanguage] = useState<'fa' | 'en'>('fa');
  const [localDraft, setLocalDraft] = useState<LocalDraft | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);

  const dirty = useMemo(() => isDirty(form, base), [form, base]);
  const live = detail?.status === 'published' || detail?.status === 'scheduled';
  const readOnly = !canManage && access !== null;

  usePageMeta(isNew ? t('blog.editor.newTitle') : detail?.title || t('blog.editor.untitled'), undefined, 'MESH', {
    robots: 'noindex,nofollow',
  });

  const adopt = useCallback((d: AdminBlogPostDetail) => {
    setDetail(d);
    const f = fromDetail(d);
    setBase(f);
    setForm(f);
    setIssues([]);
    setLabels({
      tags: d.refs.tags.map((x) => ({ id: x.id, label: x.name })),
      related: d.refs.related.map((x) => ({ id: x.id, label: x.title, hint: statusLabel(x.status) })),
      pillar: d.refs.pillar ? [{ id: d.refs.pillar.id, label: d.refs.pillar.title, hint: statusLabel(d.refs.pillar.status) }] : [],
      agents: d.refs.agents.map((x) => ({ id: x.id, label: x.name, hint: x.slug })),
      market: d.refs.marketCategories.map((x) => ({ id: x.id, label: x.nameFa ?? x.name, hint: x.slug })),
    });
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    blogAdminApi
      .post(id)
      .then((d) => {
        if (cancelled) return;
        adopt(d);
        setLoadError(null);
        setLoadStatus(null);
        const kept = readLocalDraft(d.id);
        if (kept && isDirty(kept.form, fromDetail(d))) setLocalDraft(kept);
        else if (kept) writeLocalDraft(d.id, null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(blogErrorMessage(e));
        setLoadStatus(e instanceof ApiError ? e.status : null);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, adopt]);

  const categories = useAsync(() => blogAdminApi.categories(), []);
  const authors = useAsync(() => blogAdminApi.authors(), []);
  const storage = useAsync(() => storageApi.capabilities(), []);
  const uploadsEnabled = storage.data?.enabled ?? false;
  const revisions = useAsync<BlogRevisionRow[]>(() => (id ? blogAdminApi.revisions(id) : Promise.resolve([])), [id, detail?.version]);

  const patch = (p: Partial<Form>) => {
    setForm((prev) => ({ ...prev, ...p }));
    setFormError(null);
  };

  // ---- validation (mirrors the server's DTO; the server remains the authority)
  const validate = (f: Form): string | null => {
    if (f.title.trim().length < 3) return t('blog.editor.err.title');
    if (f.slug && !SLUG_RE.test(f.slug)) return t('blog.editor.err.slug');
    if (f.excerpt.length > 400) return t('blog.editor.err.excerpt');
    if (f.seoTitle.length > 70) return t('blog.editor.err.seoTitle');
    if (f.seoDescription.length > 200) return t('blog.editor.err.seoDescription');
    if (f.canonicalUrl && !/^https:\/\/.+/i.test(f.canonicalUrl)) return t('blog.editor.err.canonical');
    if (f.sources.some((s) => (s.title.trim() || s.url.trim()) && !/^https?:\/\/.+/i.test(s.url.trim())))
      return t('blog.editor.err.source');
    return null;
  };

  // ---- save -----------------------------------------------------------------
  const inflight = useRef(false);
  const doSave = useCallback(
    async (auto: boolean): Promise<boolean> => {
      if (inflight.current) return false;
      const problem = validate(form);
      if (problem) {
        if (!auto) setFormError(problem);
        return false;
      }
      inflight.current = true;
      setSave({ kind: 'saving', auto });
      try {
        let next: AdminBlogPostDetail;
        if (isNew || !detail) {
          const body = diff(form, BLANK);
          next = await blogAdminApi.create({ ...body, title: form.title.trim() });
          adopt(next);
          setSave({ kind: 'saved', at: Date.now(), auto });
          navigate(`/admin/blog/posts/${next.id}`, { replace: true });
          return true;
        }
        const body = diff(form, base);
        if (Object.keys(body).length === 0) {
          setSave({ kind: 'idle' });
          return true;
        }
        next = await blogAdminApi.update(detail.id, detail.version, body, auto);
        // Keep what the user typed meanwhile: only the base moves to the server copy.
        setDetail(next);
        const f = fromDetail(next);
        setBase(f);
        setForm((current) => {
          // Fields edited while the request was in flight win over the server copy.
          const typedMeanwhile = diff(current, form);
          const merged: Form = { ...f };
          for (const key of Object.keys(typedMeanwhile) as Array<keyof Form>) {
            (merged as unknown as Record<string, unknown>)[key] = current[key];
          }
          return merged;
        });
        setIssues([]);
        setSave({ kind: 'saved', at: Date.now(), auto });
        return true;
      } catch (error) {
        if (error instanceof ApiError && error.code === 'STALE_STATE') {
          setSave({ kind: 'conflict', server: null });
          if (detail) {
            void blogAdminApi
              .post(detail.id)
              .then((server) => setSave((s) => (s.kind === 'conflict' ? { kind: 'conflict', server } : s)))
              .catch(() => undefined);
          }
        } else {
          const message = blogErrorMessage(error);
          setSave({ kind: 'error', message });
          if (!auto) setFormError(message);
        }
        return false;
      } finally {
        inflight.current = false;
      }
    },
    [form, base, detail, isNew, adopt, navigate],
  );

  // Local draft retention — mirror unsaved edits to localStorage (1 s debounce).
  useEffect(() => {
    if (!detail) return;
    if (!dirty) {
      writeLocalDraft(detail.id, null);
      return;
    }
    const timer = window.setTimeout(
      () => writeLocalDraft(detail.id, { savedAt: new Date().toISOString(), baseVersion: detail.version, form }),
      1_000,
    );
    return () => window.clearTimeout(timer);
  }, [detail, dirty, form]);

  // Autosave — drafts only, 30 s after the last keystroke, never on live articles.
  useEffect(() => {
    if (isNew || !dirty || live || readOnly || save.kind === 'conflict') return;
    const timer = window.setTimeout(() => void doSave(true), AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [form, dirty, live, isNew, readOnly, save.kind, doSave]);

  // Ctrl/Cmd+S
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!readOnly) void doSave(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doSave, readOnly]);

  // ---- unsaved-changes guard --------------------------------------------------
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || !href.startsWith('/') || anchor.getAttribute('target') === '_blank' || anchor.hasAttribute('download')) return;
      if (href === window.location.pathname) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(href);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [dirty]);

  // ---- uploads ---------------------------------------------------------------
  const upload = async (file: File): Promise<{ url: string; alt: string } | null> => {
    try {
      const media = await blogAdminApi.upload(file);
      return { url: media.url, alt: file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ') };
    } catch (error) {
      toast.error(blogErrorMessage(error));
      return null;
    }
  };

  // ---- workflow ----------------------------------------------------------------
  const [pendingAction, setPendingAction] = useState<BlogWorkflowAction | null>(null);
  const [note, setNote] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BlogRevisionRow | null>(null);

  const runAction = async (action: BlogWorkflowAction) => {
    if (!detail) return;
    if (dirty) {
      const ok = await doSave(false);
      if (!ok) return;
    }
    setActionBusy(true);
    setIssues([]);
    try {
      let next: AdminBlogPostDetail;
      if (action === 'schedule') {
        const iso = localToIso(scheduleAt);
        if (!iso) {
          setFormError(t('blog.err.schedule'));
          return;
        }
        next = await blogAdminApi.schedule(detail.id, iso);
      } else {
        next = await blogAdminApi.transition(detail.id, action, NOTE_ACTIONS.has(action) ? note.trim() || null : undefined);
      }
      adopt(next);
      setPendingAction(null);
      setNote('');
      toast.success(t(`blog.toast.${action}`));
    } catch (error) {
      const list = checklistIssues(error);
      if (list.length) {
        setIssues(list);
        setPendingAction(null);
      }
      toast.error(blogErrorMessage(error));
    } finally {
      setActionBusy(false);
    }
  };

  const onActionClick = (action: BlogWorkflowAction) => {
    setFormError(null);
    if (action === 'schedule' || CONFIRMED_ACTIONS.has(action) || NOTE_ACTIONS.has(action)) {
      if (action === 'schedule') setScheduleAt(isoToLocal(detail?.scheduledFor ?? null) || defaultScheduleAt());
      setPendingAction(action);
      return;
    }
    void runAction(action);
  };

  const deletePost = async () => {
    if (!detail) return;
    setActionBusy(true);
    try {
      await blogAdminApi.remove(detail.id);
      toast.success(t('blog.toast.deleted'));
      setBase(form); // nothing left to protect
      navigate('/admin/blog');
    } catch (error) {
      toast.error(blogErrorMessage(error));
    } finally {
      setActionBusy(false);
      setConfirmDelete(false);
    }
  };

  const restore = async () => {
    if (!detail || !restoreTarget) return;
    setActionBusy(true);
    try {
      adopt(await blogAdminApi.restoreRevision(detail.id, restoreTarget.id));
      toast.success(t('blog.toast.restored', { version: formatCount(restoreTarget.version) }));
      setRestoreTarget(null);
    } catch (error) {
      toast.error(blogErrorMessage(error));
    } finally {
      setActionBusy(false);
    }
  };

  // ---- pickers -------------------------------------------------------------------
  const searchTags = useCallback(async (q: string): Promise<PickerOption[]> => {
    const all = await blogAdminApi.tags();
    const needle = q.toLowerCase();
    return all
      .filter((x) => !needle || x.name.toLowerCase().includes(needle) || x.slug.includes(needle))
      .map((x) => ({ id: x.id, label: x.name, hint: formatCount(x.publishedCount) }));
  }, []);
  const searchPosts = useCallback(
    async (q: string): Promise<PickerOption[]> => {
      const res = await blogAdminApi.posts({ q: q || undefined, pageSize: 20, sort: 'updated' });
      return res.items.filter((x) => x.id !== detail?.id).map((x) => ({ id: x.id, label: x.title || x.slug, hint: statusLabel(x.status) }));
    },
    [detail?.id],
  );
  const searchAgents = useCallback(async (q: string): Promise<PickerOption[]> => {
    const res = await agentsApi.list({ q: q || undefined, pageSize: 20 } as never);
    return res.items.map((x) => ({ id: x.id, label: x.name, hint: x.slug }));
  }, []);
  const searchMarket = useCallback(async (q: string): Promise<PickerOption[]> => {
    const all = await catalogApi.categories();
    const needle = q.toLowerCase();
    return all
      .filter((x) => !needle || x.name.toLowerCase().includes(needle) || (x.nameFa ?? '').includes(q) || x.slug.includes(needle))
      .map((x) => ({ id: x.id, label: x.nameFa ?? x.name, hint: x.slug }));
  }, []);

  const createTag = async (name: string) => {
    try {
      const tag = await blogAdminApi.createTag({ name });
      setLabels((l) => ({ ...l, tags: [...l.tags, { id: tag.id, label: tag.name }] }));
      patch({ tagIds: [...form.tagIds, tag.id] });
    } catch (error) {
      toast.error(blogErrorMessage(error));
    }
  };
  const [newTag, setNewTag] = useState('');

  // ---- render ----------------------------------------------------------------------
  if (loading) {
    return (
      <div className="container page">
        <SkeletonList rows={10} />
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="container page">
        <ErrorState
          description={loadStatus === 404 ? t('blog.err.notFound') : loadError}
          retry={loadStatus === 404 ? undefined : () => window.location.reload()}
        />
        <Link className="btn btn--secondary btn--sm mt-3" to="/admin/blog">
          {t('blog.common.backToList')}
        </Link>
      </div>
    );
  }

  const seoSnapshot = {
    title: form.title,
    slug: form.slug || detail?.slug || '',
    excerpt: form.excerpt,
    bodyMarkdown: form.bodyMarkdown,
    seoTitle: form.seoTitle,
    seoDescription: form.seoDescription,
    canonicalUrl: form.canonicalUrl,
    ogImageUrl: form.ogImageUrl,
    featuredImageUrl: form.featuredImageUrl,
    version: detail?.version ?? null,
    published: detail?.status === 'published',
  };
  const goTo: SeoGoTo = (location) => {
    const focusEl = (selector: string) => {
      const el = document.querySelector<HTMLElement>(selector);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.focus();
    };
    if (location.kind === 'field') {
      const map: Record<string, string> = {
        seoTitle: '#blog-seo-title',
        seoDescription: '#blog-seo-desc',
        canonicalUrl: '#blog-canonical',
        ogImageUrl: '#blog-og',
        slug: '#blog-slug',
        focusKeyword: '#seo-focus',
        robotsIndex: '[data-testid="seo-robots-index"]',
      };
      focusEl(map[location.field] ?? '[data-testid="blog-panel-seo"]');
    } else if (location.kind === 'panel') {
      focusEl(`[data-testid="blog-panel-${location.panel === 'seo' ? 'seo' : location.panel === 'links' ? 'links' : 'content'}"]`);
    } else {
      focusEl('[data-testid="blog-panel-content"]');
      contentEditor.current?.focusBlock(location.position);
    }
  };
  const seoTitleEffective = form.seoTitle || form.title;
  const seoDescriptionEffective = form.seoDescription || form.excerpt;
  const slugChangedOnLive = Boolean(detail?.publishedAt) && form.slug !== base.slug;

  return (
    <div className="container page blog-editor" data-testid="blog-editor" data-dirty={dirty ? 'true' : 'false'}>
      <header className="blog-editor-top">
        <div className="blog-editor-crumbs">
          <Link to="/admin/blog">{t('blog.admin.title')}</Link>
          <span aria-hidden="true">›</span>
          <h1 className="blog-editor-crumbs__current">{isNew ? t('blog.editor.newTitle') : detail?.title || t('blog.editor.untitled')}</h1>
        </div>
        <div className="blog-editor-actions">
          <SaveIndicator state={save} dirty={dirty} />
          {detail && (
            <Link
              className="btn btn--secondary btn--sm"
              to={`/admin/blog/posts/${detail.id}/preview`}
              target="_blank"
              rel="noopener"
              title={t('blog.editor.previewSavedVersion')}
              data-testid="blog-open-preview"
            >
              {t('blog.editor.preview')}
            </Link>
          )}
          {detail?.status === 'published' && (
            <Link className="btn btn--ghost btn--sm" to={`/blog/${detail.slug}`} target="_blank" rel="noopener">
              {t('blog.editor.viewPublic')}
            </Link>
          )}
          {!readOnly && (
            <Button
              size="sm"
              onClick={() => void doSave(false)}
              disabled={save.kind === 'saving' || (!dirty && !isNew)}
              data-testid="blog-save"
            >
              {save.kind === 'saving' ? t('blog.editor.saving') : isNew ? t('blog.editor.createDraft') : t('blog.editor.save')}
            </Button>
          )}
        </div>
      </header>

      {readOnly && <Alert kind="info">{t('blog.editor.readOnly')}</Alert>}
      {save.kind === 'conflict' && (
        <Alert kind="warning" title={t('blog.err.staleTitle')} data-testid="blog-conflict">
          <p>{t('blog.err.stale')}</p>
          {save.server && (
            <p className="small muted">
              {t('blog.cs.conflict.serverVersion', {
                version: save.server.version,
                when: formatDateTime(save.server.updatedAt),
              })}
            </p>
          )}
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (!detail) return;
                void blogAdminApi.post(detail.id).then((d) => {
                  adopt(d);
                  setSave({ kind: 'idle' });
                });
              }}
            >
              {t('blog.err.staleReload')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!save.server}
              onClick={() => setCompareOpen(true)}
              data-testid="blog-conflict-compare"
            >
              {t('blog.cs.conflict.compare')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!save.server}
              data-testid="blog-conflict-recover"
              onClick={() => {
                // Recover: adopt the server copy as the new base, re-apply my edits on top.
                if (!save.server) return;
                const mine = diff(form, base);
                adopt(save.server);
                setForm((f) => ({ ...f, ...(mine as Partial<Form>) }));
                setSave({ kind: 'idle' });
              }}
            >
              {t('blog.cs.conflict.recover')}
            </Button>
          </div>
        </Alert>
      )}
      {localDraft && detail && (
        <Alert kind="info" title={t('blog.cs.localDraft.title')} data-testid="blog-local-draft">
          <p>{t('blog.cs.localDraft.body', { when: formatDateTime(localDraft.savedAt) })}</p>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Button
              size="sm"
              variant="secondary"
              data-testid="blog-local-draft-restore"
              onClick={() => {
                setForm((f) => ({ ...f, ...(diff(localDraft.form, base) as Partial<Form>) }));
                setLocalDraft(null);
              }}
            >
              {t('blog.cs.localDraft.restore')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                writeLocalDraft(detail.id, null);
                setLocalDraft(null);
              }}
            >
              {t('blog.cs.localDraft.discard')}
            </Button>
          </div>
        </Alert>
      )}
      {formError && (
        <p className="field__error" role="alert" data-testid="blog-form-error">
          {formError}
        </p>
      )}
      <ReadinessList issues={issues} title={t('blog.editor.checklistFailed')} />

      <div className="blog-editor-grid">
        <div className="blog-editor-main">
          <Panel title={t('blog.editor.content')} testId="blog-panel-content">
            <Field label={t('blog.editor.title')} htmlFor="blog-title">
              <Input
                id="blog-title"
                value={form.title}
                onChange={(e) => patch({ title: e.target.value })}
                maxLength={180}
                required
                disabled={readOnly}
                className="blog-title-input"
                data-testid="blog-title"
              />
            </Field>
            <Field
              label={t('blog.editor.slug')}
              htmlFor="blog-slug"
              hint={
                slugChangedOnLive ? (
                  <span className="blog-hint-warn">{t('blog.editor.slugRedirectHint', { old: base.slug })}</span>
                ) : isNew ? (
                  t('blog.editor.slugAutoHint')
                ) : (
                  t('blog.editor.slugHint')
                )
              }
            >
              <Input
                id="blog-slug"
                dir="ltr"
                value={form.slug}
                onChange={(e) => patch({ slug: e.target.value.toLowerCase() })}
                maxLength={110}
                disabled={readOnly}
                placeholder={isNew ? t('blog.editor.slugAuto') : undefined}
                data-testid="blog-slug"
              />
            </Field>
            {detail && detail.redirects.length > 0 && (
              <p className="muted small">
                {t('blog.editor.redirectsFrom')}{' '}
                {detail.redirects.map((r) => (
                  <code key={r} dir="ltr">
                    {r}
                  </code>
                ))}
              </p>
            )}
            <Field
              label={t('blog.editor.excerpt')}
              htmlFor="blog-excerpt"
              hint={<Counter value={form.excerpt.length} max={400} warn={300} />}
            >
              <Textarea
                id="blog-excerpt"
                value={form.excerpt}
                onChange={(e) => patch({ excerpt: e.target.value })}
                rows={3}
                maxLength={400}
                disabled={readOnly}
                data-testid="blog-excerpt"
              />
            </Field>
            <BodyEditor
              value={form.bodyMarkdown}
              initialBlocks={detail && detail.bodyMarkdown === form.bodyMarkdown ? detail.blocks : null}
              onChange={(bodyMarkdown) => patch({ bodyMarkdown })}
              onUploadImage={upload}
              uploadsEnabled={uploadsEnabled}
              textareaRef={textareaRef}
              disabled={readOnly}
              language={contentLanguage}
              handle={contentEditor}
            />
          </Panel>

          <Panel title={t('blog.editor.featuredImage')} testId="blog-panel-image">
            <FeaturedImageEditor
              url={form.featuredImageUrl}
              alt={form.featuredImageAlt}
              caption={form.featuredImageCaption}
              onChange={(p) => patch(p)}
              onUpload={upload}
              uploadsEnabled={uploadsEnabled}
              disabled={readOnly}
            />
          </Panel>

          <Panel title={t('blog.editor.seo')} testId="blog-panel-seo">
            <div className="grid grid--2col">
              <Field
                label={t('blog.editor.seoTitle')}
                htmlFor="blog-seo-title"
                hint={<Counter value={seoTitleEffective.length} max={70} warn={60} />}
              >
                <Input
                  id="blog-seo-title"
                  value={form.seoTitle}
                  onChange={(e) => patch({ seoTitle: e.target.value })}
                  maxLength={70}
                  placeholder={form.title}
                  disabled={readOnly}
                  data-testid="blog-seo-title"
                />
              </Field>
              <Field label={t('blog.editor.canonical')} htmlFor="blog-canonical" hint={t('blog.editor.canonicalHint')}>
                <Input
                  id="blog-canonical"
                  dir="ltr"
                  value={form.canonicalUrl}
                  onChange={(e) => patch({ canonicalUrl: e.target.value })}
                  maxLength={2000}
                  placeholder="https://"
                  disabled={readOnly}
                />
              </Field>
            </div>
            <Field
              label={t('blog.editor.seoDescription')}
              htmlFor="blog-seo-desc"
              hint={<Counter value={seoDescriptionEffective.length} max={200} warn={160} />}
            >
              <Textarea
                id="blog-seo-desc"
                value={form.seoDescription}
                onChange={(e) => patch({ seoDescription: e.target.value })}
                rows={2}
                maxLength={200}
                placeholder={form.excerpt}
                disabled={readOnly}
                data-testid="blog-seo-desc"
              />
            </Field>
            <Field label={t('blog.editor.ogImage')} htmlFor="blog-og" hint={t('blog.editor.ogImageHint')}>
              <Input
                id="blog-og"
                dir="ltr"
                value={form.ogImageUrl}
                onChange={(e) => patch({ ogImageUrl: e.target.value })}
                maxLength={2000}
                placeholder={form.featuredImageUrl || 'https://'}
                disabled={readOnly}
              />
            </Field>
            <ul className="blog-seo-notes muted small">
              {seoTitleEffective.length > 60 && <li>{t('blog.readiness.seo_title_long')}</li>}
              {seoDescriptionEffective.length > 160 && <li>{t('blog.readiness.seo_description_long')}</li>}
              {!form.featuredImageUrl && !form.ogImageUrl && <li>{t('blog.editor.noSocialImage')}</li>}
              {form.canonicalUrl && <li>{t('blog.editor.canonicalExcluded')}</li>}
            </ul>
            <SeoStudioPanel
              contentType="post"
              contentId={detail?.id ?? null}
              snapshot={seoSnapshot}
              readOnly={readOnly}
              onGoTo={goTo}
              onLanguage={setContentLanguage}
              hostDirty={dirty}
            />
          </Panel>

          <Panel title={t('blog.editor.sources')} testId="blog-panel-sources">
            <SourcesEditor value={form.sources} onChange={(sources) => patch({ sources })} disabled={readOnly} />
          </Panel>
        </div>

        <aside className="blog-editor-side">
          <Panel
            title={t('blog.editor.statusPanel')}
            testId="blog-panel-status"
            aside={detail ? <StatusBadge status={detail.status} /> : <Badge tone="neutral">{t('blog.editor.unsavedNew')}</Badge>}
          >
            {detail ? (
              <>
                <dl className="blog-meta-list">
                  <dt>{t('blog.admin.col.published')}</dt>
                  <dd>{detail.publishedAt ? formatDateTime(detail.publishedAt) : '—'}</dd>
                  {detail.scheduledFor && (
                    <>
                      <dt>{t('blog.editor.scheduledFor')}</dt>
                      <dd>{formatDateTime(detail.scheduledFor)}</dd>
                    </>
                  )}
                  <dt>{t('blog.editor.contentUpdated')}</dt>
                  <dd>{detail.contentUpdatedAt ? formatDateTime(detail.contentUpdatedAt) : '—'}</dd>
                  <dt>{t('blog.editor.version')}</dt>
                  <dd>{formatCount(detail.version)}</dd>
                  <dt>{t('blog.editor.readingTime')}</dt>
                  <dd>{t('blog.admin.minutes', { n: formatCount(detail.readingMinutes) })}</dd>
                </dl>
                <ReadinessList
                  issues={detail.readiness}
                  title={detail.readiness.some((i) => i.severity === 'error') ? t('blog.editor.notReady') : t('blog.editor.warningsOnly')}
                />
                {detail.readiness.length === 0 && <p className="muted small">{t('blog.editor.ready')}</p>}
                {!readOnly && (
                  <div className="blog-actions" data-testid="blog-workflow-actions">
                    {detail.availableActions
                      .filter((a) => canPublish || !PUBLISH_ACTIONS.has(a))
                      .map((action) => (
                        <Button
                          key={action}
                          size="sm"
                          variant={action === 'publish' ? 'success' : action === 'unpublish' ? 'danger' : 'secondary'}
                          onClick={() => onActionClick(action)}
                          disabled={actionBusy || save.kind === 'saving'}
                          data-testid={`blog-action-${action}`}
                        >
                          {actionLabel(action)}
                        </Button>
                      ))}
                    {detail.status !== 'published' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDelete(true)}
                        disabled={actionBusy}
                        data-testid="blog-action-delete"
                      >
                        {t('common.delete')}
                      </Button>
                    )}
                  </div>
                )}
                {detail.editorialNote && (
                  <p className="blog-editorial-note">
                    <b>{t('blog.editor.editorialNote')}:</b> {detail.editorialNote}
                  </p>
                )}
              </>
            ) : (
              <p className="muted small">{t('blog.editor.newHint')}</p>
            )}
          </Panel>

          <Panel title={t('blog.editor.organisation')} testId="blog-panel-taxonomy">
            <Field label={t('blog.editor.category')} htmlFor="blog-category">
              <select
                id="blog-category"
                className="select"
                value={form.primaryCategoryId}
                onChange={(e) => patch({ primaryCategoryId: e.target.value })}
                disabled={readOnly}
                data-testid="blog-category"
              >
                <option value="">{t('blog.editor.pickCategory')}</option>
                {(categories.data ?? [])
                  .filter((c) => c.isActive || c.id === form.primaryCategoryId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.parentId ? `↳ ${c.name}` : c.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Picker
              label={t('blog.editor.tags')}
              values={labels.tags}
              onChange={(next) => {
                setLabels((l) => ({ ...l, tags: next }));
                patch({ tagIds: next.map((x) => x.id) });
              }}
              search={searchTags}
              max={10}
              disabled={readOnly}
              testId="blog-tags"
              emptyLabel={t('blog.editor.noTags')}
            />
            {!readOnly && (
              <div className="row" style={{ gap: 6 }}>
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder={t('blog.editor.newTag')}
                  aria-label={t('blog.editor.newTag')}
                  maxLength={60}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={newTag.trim().length < 2}
                  onClick={() => {
                    void createTag(newTag.trim());
                    setNewTag('');
                  }}
                >
                  {t('blog.common.add')}
                </Button>
              </div>
            )}
            <Field label={t('blog.editor.author')} htmlFor="blog-author" hint={t('blog.editor.authorHint')}>
              <select
                id="blog-author"
                className="select"
                value={form.authorUserId}
                onChange={(e) => patch({ authorUserId: e.target.value })}
                disabled={readOnly}
                data-testid="blog-author"
              >
                <option value="">{t('blog.editor.noAuthor')}</option>
                {(authors.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.username ? ` (@${a.username})` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('blog.editor.reviewer')} htmlFor="blog-reviewer">
              <select
                id="blog-reviewer"
                className="select"
                value={form.reviewerUserId}
                onChange={(e) => patch({ reviewerUserId: e.target.value })}
                disabled={readOnly}
              >
                <option value="">—</option>
                {(authors.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="row row--between">
              <span>{t('blog.editor.featured')}</span>
              <Toggle
                checked={form.isFeatured}
                onChange={(v) => patch({ isFeatured: v })}
                label={t('blog.editor.featured')}
                disabled={readOnly}
                data-testid="blog-featured-toggle"
              />
            </div>
            <p className="muted small">{t('blog.editor.featuredHint')}</p>
            <Field label={t('blog.editor.editorialNote')} htmlFor="blog-note" hint={t('blog.editor.editorialNoteHint')}>
              <Textarea
                id="blog-note"
                value={form.editorialNote}
                onChange={(e) => patch({ editorialNote: e.target.value })}
                rows={2}
                maxLength={1000}
                disabled={readOnly}
              />
            </Field>
          </Panel>

          <Panel title={t('blog.editor.links')} testId="blog-panel-links">
            <Picker
              label={t('blog.editor.agents')}
              hint={t('blog.editor.agentsHint')}
              values={labels.agents}
              onChange={(next) => {
                setLabels((l) => ({ ...l, agents: next }));
                patch({ agentIds: next.map((x) => x.id) });
              }}
              search={searchAgents}
              max={8}
              disabled={readOnly}
              testId="blog-agents"
              emptyLabel={t('blog.editor.noLinks')}
            />
            <Picker
              label={t('blog.editor.marketCategories')}
              values={labels.market}
              onChange={(next) => {
                setLabels((l) => ({ ...l, market: next }));
                patch({ marketCategoryIds: next.map((x) => x.id) });
              }}
              search={searchMarket}
              max={5}
              disabled={readOnly}
              testId="blog-market-categories"
              emptyLabel={t('blog.editor.noLinks')}
            />
            <Picker
              label={t('blog.editor.related')}
              hint={t('blog.editor.relatedHint')}
              values={labels.related}
              onChange={(next) => {
                setLabels((l) => ({ ...l, related: next }));
                patch({ relatedPostIds: next.map((x) => x.id) });
              }}
              search={searchPosts}
              max={6}
              disabled={readOnly}
              testId="blog-related"
              emptyLabel={t('blog.editor.relatedAuto')}
            />
            <Picker
              label={t('blog.editor.pillar')}
              hint={t('blog.editor.pillarHint')}
              values={labels.pillar}
              onChange={(next) => {
                setLabels((l) => ({ ...l, pillar: next }));
                patch({ pillarPostId: next[0]?.id ?? '' });
              }}
              search={searchPosts}
              single
              disabled={readOnly}
              testId="blog-pillar"
            />
          </Panel>

          {detail && (
            <Panel
              title={t('blog.editor.revisions')}
              testId="blog-panel-revisions"
              aside={<span className="muted small">{formatCount(detail.revisionCount)}</span>}
            >
              {revisions.loading ? (
                <p className="muted small">{t('common.loading')}</p>
              ) : (revisions.data ?? []).length === 0 ? (
                <p className="muted small">{t('blog.editor.noRevisions')}</p>
              ) : (
                <ol className="blog-revisions">
                  {(revisions.data ?? []).slice(0, 15).map((rev) => (
                    <li key={rev.id}>
                      <div>
                        <b>v{formatCount(rev.version)}</b> · {t(`blog.revision.${rev.reason}`)}
                        <small>
                          {formatDateTime(rev.createdAt)}
                          {rev.createdBy ? ` · ${rev.createdBy.name}` : ''} · {t('blog.editor.words', { n: formatCount(rev.wordCount) })}
                        </small>
                      </div>
                      {!readOnly && rev.version !== detail.version && (
                        <Button size="sm" variant="ghost" onClick={() => setRestoreTarget(rev)} disabled={actionBusy}>
                          {t('blog.editor.restore')}
                        </Button>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              <p className="muted small">{t('blog.editor.revisionsHint')}</p>
            </Panel>
          )}
        </aside>
      </div>

      {/* ---- modals ---- */}
      <Modal open={compareOpen} title={t('blog.cs.conflict.compareTitle')} onClose={() => setCompareOpen(false)} wide>
        {save.kind === 'conflict' && save.server ? (
          (() => {
            const server = fromDetail(save.server);
            const mine = diff(form, base);
            const theirs = diff(server, base);
            const keys = Array.from(new Set([...Object.keys(mine), ...Object.keys(theirs)])) as Array<keyof Form>;
            return (
              <div className="cs-compare" data-testid="blog-conflict-diff">
                <p className="small muted">{t('blog.cs.conflict.compareHint')}</p>
                <table className="cs-compare__table">
                  <thead>
                    <tr>
                      <th>{t('blog.cs.conflict.field')}</th>
                      <th>{t('blog.cs.conflict.mine')}</th>
                      <th>{t('blog.cs.conflict.theirs')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((key) => {
                      const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));
                      const conflict = key in mine && key in theirs && show(form[key]) !== show(server[key]);
                      const labelKey = FIELD_LABEL_KEYS[key];
                      return (
                        <tr key={key} data-conflict={conflict}>
                          <td>{labelKey ? t(labelKey) : key}</td>
                          <td>
                            <pre>{key in mine ? show(form[key]) : <span className="muted">{t('blog.cs.conflict.unchanged')}</span>}</pre>
                          </td>
                          <td>
                            <pre>
                              {key in theirs ? show(server[key]) : <span className="muted">{t('blog.cs.conflict.unchanged')}</span>}
                            </pre>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()
        ) : (
          <p className="muted">{t('blog.common.working')}</p>
        )}
      </Modal>

      <Modal
        open={pendingAction !== null}
        title={pendingAction ? t(`blog.confirm.${pendingAction}.title`) : ''}
        onClose={() => (actionBusy ? undefined : setPendingAction(null))}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingAction(null)} disabled={actionBusy}>
              {t('common.cancel')}
            </Button>
            <Button
              variant={pendingAction === 'unpublish' ? 'danger' : 'primary'}
              onClick={() => pendingAction && void runAction(pendingAction)}
              disabled={actionBusy || (pendingAction === 'schedule' && !scheduleAt)}
              data-testid="blog-confirm-action"
            >
              {actionBusy ? t('blog.common.working') : pendingAction ? actionLabel(pendingAction) : ''}
            </Button>
          </>
        }
      >
        {pendingAction && <p>{t(`blog.confirm.${pendingAction}.body`)}</p>}
        {dirty && <p className="muted small">{t('blog.confirm.savesFirst')}</p>}
        {pendingAction === 'schedule' && (
          <Field label={t('blog.editor.scheduledFor')} htmlFor="blog-schedule-at" hint={t('blog.editor.scheduleHint')}>
            <Input
              id="blog-schedule-at"
              type="datetime-local"
              dir="ltr"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              data-testid="blog-schedule-at"
            />
          </Field>
        )}
        {pendingAction && NOTE_ACTIONS.has(pendingAction) && (
          <Field
            label={t('blog.editor.note')}
            htmlFor="blog-action-note"
            hint={pendingAction === 'request_changes' ? t('blog.editor.noteRequired') : undefined}
          >
            <Textarea
              id="blog-action-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={1000}
              data-testid="blog-action-note"
            />
          </Field>
        )}
      </Modal>

      <Modal
        open={confirmDelete}
        title={t('blog.confirm.delete.title')}
        onClose={() => (actionBusy ? undefined : setConfirmDelete(false))}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={actionBusy}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => void deletePost()} disabled={actionBusy} data-testid="blog-confirm-delete">
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p>{t('blog.confirm.delete.body')}</p>
      </Modal>

      <Modal
        open={restoreTarget !== null}
        title={t('blog.confirm.restore.title', { version: formatCount(restoreTarget?.version ?? 0) })}
        onClose={() => (actionBusy ? undefined : setRestoreTarget(null))}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRestoreTarget(null)} disabled={actionBusy}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void restore()} disabled={actionBusy} data-testid="blog-confirm-restore">
              {t('blog.editor.restore')}
            </Button>
          </>
        }
      >
        <p>{t('blog.confirm.restore.body')}</p>
      </Modal>

      <Modal
        open={pendingHref !== null}
        title={t('blog.confirm.leave.title')}
        onClose={() => setPendingHref(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingHref(null)}>
              {t('blog.confirm.leave.stay')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const href = pendingHref;
                setPendingHref(null);
                setBase(form);
                if (href) navigate(href);
              }}
              data-testid="blog-leave-discard"
            >
              {t('blog.confirm.leave.discard')}
            </Button>
            {!readOnly && (
              <Button
                onClick={() => {
                  const href = pendingHref;
                  void doSave(false).then((ok) => {
                    if (ok && href) {
                      setPendingHref(null);
                      navigate(href);
                    }
                  });
                }}
                data-testid="blog-leave-save"
              >
                {t('blog.confirm.leave.save')}
              </Button>
            )}
          </>
        }
      >
        <p>{t('blog.confirm.leave.body')}</p>
      </Modal>
    </div>
  );
}

function SaveIndicator({ state, dirty }: { state: SaveState; dirty: boolean }) {
  let text: string;
  let tone: 'muted' | 'warn' | 'ok' | 'error' = 'muted';
  if (state.kind === 'saving') text = state.auto ? t('blog.editor.autosaving') : t('blog.editor.saving');
  else if (state.kind === 'conflict') {
    text = t('blog.err.staleShort');
    tone = 'error';
  } else if (state.kind === 'error') {
    text = t('blog.editor.saveFailed');
    tone = 'error';
  } else if (dirty) {
    text = t('blog.editor.unsaved');
    tone = 'warn';
  } else if (state.kind === 'saved') {
    text = state.auto ? t('blog.editor.autosaved') : t('blog.editor.saved');
    tone = 'ok';
  } else text = t('blog.editor.allSaved');
  return (
    <span className={`blog-save-indicator is-${tone}`} role="status" aria-live="polite" data-testid="blog-save-indicator">
      {text}
    </span>
  );
}
