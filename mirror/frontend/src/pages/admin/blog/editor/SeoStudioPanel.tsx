import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../../../../api/client';
import {
  seoAdminApi,
  type AnalyzeContentInput,
  type ContentSeoView,
  type SeoAnalysisReport,
  type SeoContentType,
  type SeoFieldValue,
  type SeoLanguage,
  type SeoLocation,
  type SeoRecommendation,
  type SeoSeverity,
  type TwitterCard,
  type UpsertContentSeoInput,
} from '../../../../api/seo';
import {
  Alert,
  AppIcon,
  Badge,
  Button,
  Chip,
  Field,
  Input,
  ProgressBar,
  SegmentedControl,
  Textarea,
  Toggle,
} from '../../../../components/ui';
import { getLocale, t } from '../../../../i18n';
import { formatCount, formatDateTime } from '../../../../lib/format';
import { blogErrorMessage } from '../blogAdminShared';

/**
 * SEO Studio — the per-content panel (articles and products share it).
 *
 * Two sources of truth, kept visibly apart:
 *  • the content form (title, slug, excerpt, body, legacy SEO columns) — owned
 *    by the host editor and saved with it;
 *  • `content_seo` (robots, OG, Twitter card, keywords, language,
 *    translations) — owned here, saved with the panel's own button through
 *    `PUT /admin/seo/content/:type/:id`.
 * Every "effective" value shows whether it is stored or a fallback; drafts
 * are marked forced-noindex by the server. Analysis runs against the unsaved
 * form (debounced POST /analyze) and, after a save, against the saved copy.
 */

export interface SeoHostSnapshot {
  title: string;
  slug: string;
  excerpt?: string;
  bodyMarkdown?: string;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  ogImageUrl: string;
  featuredImageUrl?: string;
  /** Host-side save version; bumping it re-fetches the saved analysis. */
  version: number | null;
  published: boolean;
}

export type SeoGoTo = (location: SeoLocation) => void;

interface Props {
  contentType: SeoContentType;
  contentId: string | null;
  snapshot: SeoHostSnapshot;
  readOnly: boolean;
  onGoTo: SeoGoTo;
  onLanguage?: (language: SeoLanguage) => void;
  /** Product hosts own their meta fields through this panel. */
  ownsMeta?: boolean;
  onMetaChange?: (patch: Partial<Pick<SeoHostSnapshot, 'seoTitle' | 'seoDescription' | 'canonicalUrl' | 'ogImageUrl'>>) => void;
  /**
   * True while the host form has unsaved edits. While neither the host nor this
   * panel is dirty, the analysis shown is the one of the SAVED copy; the first
   * edit switches to the live (unsaved) analysis.
   */
  hostDirty?: boolean;
}

const ANALYZE_DEBOUNCE_MS = 800;
const SEVERITY_ORDER: SeoSeverity[] = ['critical', 'warning', 'info'];
const SEVERITY_TONE: Record<SeoSeverity, 'danger' | 'warning' | 'info'> = { critical: 'danger', warning: 'warning', info: 'info' };

interface Draft {
  ogTitle: string;
  ogDescription: string;
  twitterCard: TwitterCard;
  robotsIndex: boolean;
  robotsFollow: boolean;
  focusKeyword: string;
  relatedKeywords: string[];
  language: SeoLanguage;
}

function draftFrom(view: ContentSeoView): Draft {
  return {
    ogTitle: view.fields.ogTitle.stored ?? '',
    ogDescription: view.fields.ogDescription.stored ?? '',
    twitterCard: view.fields.twitterCard.effective,
    robotsIndex: view.fields.robotsIndex.stored ?? true,
    robotsFollow: view.fields.robotsFollow.stored ?? true,
    focusKeyword: view.focusKeyword ?? '',
    relatedKeywords: view.relatedKeywords,
    language: view.fields.language.effective,
  };
}

function toInput(d: Draft): UpsertContentSeoInput {
  return {
    ogTitle: d.ogTitle.trim() || null,
    ogDescription: d.ogDescription.trim() || null,
    twitterCard: d.twitterCard,
    robotsIndex: d.robotsIndex,
    robotsFollow: d.robotsFollow,
    focusKeyword: d.focusKeyword.trim() || null,
    relatedKeywords: d.relatedKeywords,
    language: d.language,
  };
}

function SourceBadge<T>({ field }: { field: SeoFieldValue<T> }) {
  const tone = field.source === 'stored' ? 'success' : field.source === 'forced' ? 'warning' : 'neutral';
  return (
    <Badge tone={tone} className="seo-source" data-source={field.source}>
      {t(`blog.seo.source.${field.source}`)}
    </Badge>
  );
}

function pixelsEstimate(text: string): number {
  // Rough glyph-width estimate (Latin ≈ 8 px, Persian ≈ 7 px at 20 px font); labelled as an estimate in the UI.
  let px = 0;
  for (const ch of text) px += /[\u0600-\u06FF]/.test(ch) ? 7 : /[A-Z]/.test(ch) ? 9 : ch === ' ' ? 4 : 8;
  return Math.round(px);
}

export function SerpPreviewStudio({
  title,
  description,
  path,
  language,
}: {
  title: string;
  description: string;
  path: string;
  language: SeoLanguage;
}) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const titleLimit = device === 'desktop' ? 600 : 920;
  const titlePx = pixelsEstimate(title);
  const site = typeof window !== 'undefined' ? window.location.origin : '';
  return (
    <div className="seo-serp-wrap">
      <div className="seo-serp-head">
        <span className="small muted">{t('blog.seo.serp.label')}</span>
        <SegmentedControl<'desktop' | 'mobile'>
          label={t('blog.seo.serp.device')}
          value={device}
          onChange={setDevice}
          options={[
            { key: 'desktop', label: t('blog.seo.serp.desktop') },
            { key: 'mobile', label: t('blog.seo.serp.mobile') },
          ]}
          data-testid="seo-serp-device"
        />
      </div>
      <div
        className={`blog-serp seo-serp seo-serp--${device}`}
        dir={language === 'en' ? 'ltr' : 'rtl'}
        data-testid="seo-serp"
        data-device={device}
      >
        <small dir="ltr">
          {site}
          {path}
        </small>
        <b className={titlePx > titleLimit ? 'is-truncated' : ''}>{title || t('blog.editor.untitled')}</b>
        <p>{description || t('blog.editor.serpNoDescription')}</p>
      </div>
      <p className="small muted">{t('blog.seo.serp.estimate', { px: formatCount(titlePx), limit: formatCount(titleLimit) })}</p>
    </div>
  );
}

function KeywordChips({
  values,
  onChange,
  disabled,
  id,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  disabled: boolean;
  id: string;
}) {
  const [input, setInput] = useState('');
  const add = () => {
    const v = input.trim();
    if (!v) return;
    if (!values.includes(v) && values.length < 10) onChange([...values, v]);
    setInput('');
  };
  return (
    <div className="blog-chips">
      <div className="blog-chips__row">
        {values.map((v) => (
          <Chip
            key={v}
            className="blog-chip"
            onClick={() => !disabled && onChange(values.filter((x) => x !== v))}
            aria-disabled={disabled}
            aria-label={t('blog.common.removeX', { name: v })}
          >
            {v} <AppIcon name="x" size="xs" />
          </Chip>
        ))}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <Input
          id={id}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={t('blog.seo.relatedPlaceholder')}
          disabled={disabled || values.length >= 10}
          maxLength={80}
        />
        <Button size="sm" variant="secondary" onClick={add} disabled={disabled || !input.trim()}>
          {t('blog.common.add')}
        </Button>
      </div>
    </div>
  );
}

function Recommendation({ rec, onGoTo }: { rec: SeoRecommendation; onGoTo: SeoGoTo }) {
  const [open, setOpen] = useState(!rec.passed && rec.severity === 'critical');
  const lang = getLocale();
  return (
    <li
      className={`seo-rec seo-rec--${rec.severity}${rec.passed ? ' is-passed' : ''}`}
      data-testid="seo-rec"
      data-rule={rec.rule}
      data-passed={rec.passed}
    >
      <button type="button" className="seo-rec__head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <AppIcon
          name={rec.passed ? 'check' : rec.severity === 'critical' ? 'alertTriangle' : rec.severity === 'warning' ? 'warning' : 'info'}
          size="xs"
          tone={rec.passed ? 'success' : SEVERITY_TONE[rec.severity]}
        />
        <span className="seo-rec__title">{rec.title[lang]}</span>
        <Badge tone={rec.passed ? 'success' : SEVERITY_TONE[rec.severity]}>
          {rec.passed ? t('blog.seo.resolved') : t(`blog.seo.severity.${rec.severity}`)}
        </Badge>
      </button>
      {open && (
        <div className="seo-rec__body">
          <p>
            <b>{t('blog.seo.rec.problem')}:</b> {rec.problem[lang]}
          </p>
          <p>
            <b>{t('blog.seo.rec.why')}:</b> {rec.why[lang]}
          </p>
          {!rec.passed && (
            <p>
              <b>{t('blog.seo.rec.fix')}:</b> {rec.fix[lang]}
            </p>
          )}
          <Button size="sm" variant="ghost" onClick={() => onGoTo(rec.location)} data-testid="seo-rec-goto">
            <AppIcon name="focus" size="xs" /> {t('blog.seo.rec.goTo')}
          </Button>
        </div>
      )}
    </li>
  );
}

export function SeoStudioPanel({
  contentType,
  contentId,
  snapshot,
  readOnly,
  onGoTo,
  onLanguage,
  ownsMeta,
  onMetaChange,
  hostDirty,
}: Props) {
  const [view, setView] = useState<ContentSeoView | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveState, setSaveState] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'error'; message?: string }>({ kind: 'idle' });
  const [report, setReport] = useState<SeoAnalysisReport | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [showPassed, setShowPassed] = useState(false);
  const [showWeights, setShowWeights] = useState(false);
  const [translationId, setTranslationId] = useState('');
  const [translationBusy, setTranslationBusy] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const lang = getLocale();
  const onMetaChangeRef = useRef(onMetaChange);
  useEffect(() => {
    onMetaChangeRef.current = onMetaChange;
  }, [onMetaChange]);

  const load = useCallback(() => {
    if (!contentId) return;
    let cancelled = false;
    seoAdminApi
      .view(contentType, contentId)
      .then((v) => {
        if (cancelled) return;
        setView(v);
        setDraft(draftFrom(v));
        setViewError(null);
        onLanguage?.(v.fields.language.effective);
        if (ownsMeta) {
          onMetaChangeRef.current?.({
            seoTitle: v.fields.seoTitle.stored ?? '',
            seoDescription: v.fields.seoDescription.stored ?? '',
            canonicalUrl: v.fields.canonicalUrl.stored ?? '',
            ogImageUrl: v.fields.ogImageUrl.stored ?? '',
          });
        }
      })
      .catch((e: unknown) => !cancelled && setViewError(blogErrorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [contentType, contentId, onLanguage, ownsMeta]);

  useEffect(() => load(), [load]);

  const metaDirty = Boolean(
    ownsMeta &&
    view &&
    (snapshot.seoTitle !== (view.fields.seoTitle.stored ?? '') ||
      snapshot.seoDescription !== (view.fields.seoDescription.stored ?? '') ||
      snapshot.canonicalUrl !== (view.fields.canonicalUrl.stored ?? '') ||
      snapshot.ogImageUrl !== (view.fields.ogImageUrl.stored ?? '')),
  );
  const dirty = useMemo(
    () => Boolean(view && draft && JSON.stringify(draftFrom(view)) !== JSON.stringify(draft)) || metaDirty,
    [view, draft, metaDirty],
  );
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // After the host saves: refresh stored fields (robots may be forced, fallbacks
  // change) and show the analysis of the SAVED copy.
  const lastVersion = useRef(snapshot.version);
  useEffect(() => {
    if (snapshot.version === lastVersion.current) return;
    lastVersion.current = snapshot.version;
    if (!contentId) return;
    let cancelled = false;
    seoAdminApi
      .view(contentType, contentId)
      .then((v) => {
        if (cancelled) return;
        setView(v);
        if (!dirtyRef.current) setDraft(draftFrom(v));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [snapshot.version, contentType, contentId]);

  // ---- analysis (unsaved basis, debounced) -------------------------------------
  const language: SeoLanguage = draft?.language ?? view?.fields.language.effective ?? 'fa';
  const analyzeInput = useMemo<AnalyzeContentInput>(
    () => ({
      contentType,
      contentId,
      language,
      title: snapshot.title,
      slug: snapshot.slug,
      excerpt: snapshot.excerpt ?? (view && view.fields.seoDescription.source !== 'stored' ? view.fields.seoDescription.effective : ''),
      bodyMarkdown: snapshot.bodyMarkdown ?? '',
      seoTitle: snapshot.seoTitle || null,
      seoDescription: snapshot.seoDescription || null,
      canonicalUrl: snapshot.canonicalUrl || null,
      ogImageUrl: snapshot.ogImageUrl || null,
      featuredImageUrl:
        snapshot.featuredImageUrl ?? (view?.fields.ogImageUrl.source !== 'stored' ? view?.fields.ogImageUrl.effective : null) ?? null,
      robotsIndex: draft?.robotsIndex ?? true,
      focusKeyword: draft?.focusKeyword.trim() || null,
      relatedKeywords: draft?.relatedKeywords ?? [],
    }),
    [
      contentType,
      contentId,
      language,
      snapshot.title,
      snapshot.slug,
      snapshot.excerpt,
      snapshot.bodyMarkdown,
      snapshot.seoTitle,
      snapshot.seoDescription,
      snapshot.canonicalUrl,
      snapshot.ogImageUrl,
      snapshot.featuredImageUrl,
      view,
      draft?.robotsIndex,
      draft?.focusKeyword,
      draft?.relatedKeywords,
    ],
  );
  const analyzeKey = JSON.stringify(analyzeInput);
  const hasInput = Boolean(snapshot.title.trim() || snapshot.bodyMarkdown?.trim());
  // Nothing changed anywhere → the saved copy's analysis is the truth (it also
  // carries duplicate/inbound checks against the stored rows). Any edit, in the
  // host or here, switches to the debounced analysis of the unsaved state.
  const pristine = Boolean(contentId && view) && !hostDirty && !dirty;
  useEffect(() => {
    if (!hasInput) return;
    if (pristine && contentId) {
      let cancelled = false;
      const saved = window.setTimeout(() => {
        setAnalysisBusy(true);
        seoAdminApi
          .analysis(contentType, contentId)
          .then((r) => {
            if (cancelled) return;
            setReport(r);
            setAnalysisError(null);
          })
          .catch((e: unknown) => {
            if (!cancelled) setAnalysisError(blogErrorMessage(e));
          })
          .finally(() => {
            if (!cancelled) setAnalysisBusy(false);
          });
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(saved);
      };
    }
    const timer = window.setTimeout(() => {
      setAnalysisBusy(true);
      seoAdminApi
        .analyze(JSON.parse(analyzeKey) as AnalyzeContentInput)
        .then((r) => {
          setReport(r);
          setAnalysisError(null);
        })
        .catch((e: unknown) => setAnalysisError(blogErrorMessage(e)))
        .finally(() => setAnalysisBusy(false));
    }, ANALYZE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [analyzeKey, hasInput, pristine, contentType, contentId]);

  // ---- save -----------------------------------------------------------------
  const saveSeo = async () => {
    if (!contentId || !draft) return;
    setSaveState({ kind: 'saving' });
    try {
      const body: UpsertContentSeoInput = ownsMeta
        ? {
            ...toInput(draft),
            seoTitle: snapshot.seoTitle.trim() || null,
            seoDescription: snapshot.seoDescription.trim() || null,
            canonicalUrl: snapshot.canonicalUrl.trim() || null,
            ogImageUrl: snapshot.ogImageUrl.trim() || null,
          }
        : toInput(draft);
      const next = await seoAdminApi.upsert(contentType, contentId, body);
      setView(next);
      setDraft(draftFrom(next));
      setSaveState({ kind: 'saved' });
      onLanguage?.(next.fields.language.effective);
    } catch (e) {
      const message = e instanceof ApiError && e.code === 'CONFLICT' ? t('blog.seo.err.languageConflict') : blogErrorMessage(e);
      setSaveState({ kind: 'error', message });
    }
  };

  const linkTranslation = async () => {
    if (!contentId) return;
    const target = translationId.trim();
    if (!/^[0-9a-f-]{36}$/i.test(target)) {
      setTranslationError(t('blog.seo.translations.invalidId'));
      return;
    }
    setTranslationBusy(true);
    setTranslationError(null);
    try {
      const next = await seoAdminApi.linkTranslation(contentType, contentId, contentType, target);
      setView(next);
      setDraft(draftFrom(next));
      setTranslationId('');
    } catch (e) {
      setTranslationError(blogErrorMessage(e));
    } finally {
      setTranslationBusy(false);
    }
  };
  const unlinkTranslation = async () => {
    if (!contentId) return;
    setTranslationBusy(true);
    try {
      const next = await seoAdminApi.unlinkTranslation(contentType, contentId);
      setView(next);
      setDraft(draftFrom(next));
    } catch (e) {
      setTranslationError(blogErrorMessage(e));
    } finally {
      setTranslationBusy(false);
    }
  };

  // ---- derived ----------------------------------------------------------------
  const effectiveTitle = snapshot.seoTitle || snapshot.title;
  const effectiveDescription = snapshot.seoDescription || snapshot.excerpt || '';
  const path = view?.content.path ?? (contentType === 'post' ? `/blog/${snapshot.slug || '…'}` : `/agents/${snapshot.slug || '…'}`);
  const grouped = useMemo(() => {
    const recs = (report?.recommendations ?? []).filter((r) => r.applicable);
    return SEVERITY_ORDER.map((sev) => ({
      severity: sev,
      open: recs.filter((r) => r.severity === sev && !r.passed),
      passed: recs.filter((r) => r.severity === sev && r.passed),
    }));
  }, [report]);
  const openCount = grouped.reduce((n, g) => n + g.open.length, 0);
  const scoreTone = report ? (report.score.value >= 80 ? 'success' : report.score.value >= 50 ? 'accent' : 'warning') : 'accent';

  if (!contentId) {
    return (
      <div className="seo-studio seo-studio--new" data-testid="seo-studio">
        <Alert kind="info" title={t('blog.seo.saveFirst.title')}>
          {t('blog.seo.saveFirst.body')}
        </Alert>
        <SerpPreviewStudio title={effectiveTitle} description={effectiveDescription} path={path} language="fa" />
      </div>
    );
  }

  return (
    <div className="seo-studio" data-testid="seo-studio" data-dirty={dirty}>
      {viewError && (
        <Alert kind="error" title={t('blog.seo.err.load')}>
          {viewError}{' '}
          <Button size="sm" variant="ghost" onClick={() => load()}>
            {t('blog.cs.retry')}
          </Button>
        </Alert>
      )}

      {ownsMeta && onMetaChange && (
        <div className="grid grid--2col">
          <Field
            label={t('blog.editor.seoTitle')}
            htmlFor="seo-meta-title"
            hint={<span className="blog-counter">{formatCount(effectiveTitle.length)}/70</span>}
          >
            <Input
              id="seo-meta-title"
              value={snapshot.seoTitle}
              onChange={(e) => onMetaChange({ seoTitle: e.target.value })}
              maxLength={70}
              placeholder={snapshot.title}
              disabled={readOnly}
              data-testid="seo-meta-title"
            />
          </Field>
          <Field label={t('blog.editor.canonical')} htmlFor="seo-meta-canonical" hint={t('blog.editor.canonicalHint')}>
            <Input
              id="seo-meta-canonical"
              dir="ltr"
              value={snapshot.canonicalUrl}
              onChange={(e) => onMetaChange({ canonicalUrl: e.target.value })}
              maxLength={2000}
              placeholder="https://"
              disabled={readOnly}
            />
          </Field>
          <Field
            label={t('blog.editor.seoDescription')}
            htmlFor="seo-meta-desc"
            hint={<span className="blog-counter">{formatCount(effectiveDescription.length)}/160</span>}
          >
            <Textarea
              id="seo-meta-desc"
              value={snapshot.seoDescription}
              onChange={(e) => onMetaChange({ seoDescription: e.target.value })}
              rows={2}
              maxLength={200}
              placeholder={snapshot.excerpt}
              disabled={readOnly}
              data-testid="seo-meta-desc"
            />
          </Field>
          <Field label={t('blog.editor.ogImage')} htmlFor="seo-meta-og" hint={t('blog.editor.ogImageHint')}>
            <Input
              id="seo-meta-og"
              dir="ltr"
              value={snapshot.ogImageUrl}
              onChange={(e) => onMetaChange({ ogImageUrl: e.target.value })}
              maxLength={2000}
              placeholder={snapshot.featuredImageUrl || 'https://'}
              disabled={readOnly}
            />
          </Field>
        </div>
      )}

      {view && (
        <dl className="seo-effective" data-testid="seo-effective">
          {(
            [
              ['seoTitle', view.fields.seoTitle],
              ['seoDescription', view.fields.seoDescription],
              ['canonicalUrl', view.fields.canonicalUrl],
              ['ogImageUrl', view.fields.ogImageUrl],
              ['robotsIndex', view.fields.robotsIndex],
            ] as Array<[string, SeoFieldValue<unknown>]>
          ).map(([key, field]) => (
            <div key={key} className="seo-effective__row">
              <dt>{t(`blog.seo.field.${key}`)}</dt>
              <dd>
                <span dir={key === 'canonicalUrl' || key === 'ogImageUrl' ? 'ltr' : undefined}>
                  {typeof field.effective === 'boolean'
                    ? field.effective
                      ? 'index'
                      : 'noindex'
                    : field.effective
                      ? String(field.effective)
                      : '—'}
                </span>
                <SourceBadge field={field} />
              </dd>
            </div>
          ))}
          {view.fields.robotsIndex.source === 'forced' && <p className="small muted seo-forced-note">{t('blog.seo.forcedNoindex')}</p>}
        </dl>
      )}

      <SerpPreviewStudio title={effectiveTitle} description={effectiveDescription} path={path} language={language} />

      {draft && (
        <fieldset className="seo-fields" disabled={readOnly} data-testid="seo-fields">
          <legend className="field__label">{t('blog.seo.storedFields')}</legend>
          <div className="grid grid--2col">
            <Field label={t('blog.seo.focusKeyword')} htmlFor="seo-focus" hint={t('blog.seo.focusKeywordHint')}>
              <Input
                id="seo-focus"
                value={draft.focusKeyword}
                onChange={(e) => setDraft({ ...draft, focusKeyword: e.target.value })}
                maxLength={80}
                data-testid="seo-focus"
              />
            </Field>
            <Field label={t('blog.seo.language')} htmlFor="seo-language" hint={t('blog.seo.languageHint')}>
              <SegmentedControl<SeoLanguage>
                label={t('blog.seo.language')}
                value={draft.language}
                onChange={(language) => setDraft({ ...draft, language })}
                options={[
                  { key: 'fa', label: 'فارسی (fa)' },
                  { key: 'en', label: 'English (en)' },
                ]}
                data-testid="seo-language"
              />
            </Field>
          </div>
          <Field label={t('blog.seo.relatedKeywords')} htmlFor="seo-related" hint={t('blog.seo.relatedHint')}>
            <KeywordChips
              id="seo-related"
              values={draft.relatedKeywords}
              onChange={(relatedKeywords) => setDraft({ ...draft, relatedKeywords })}
              disabled={readOnly}
            />
          </Field>
          <div className="grid grid--2col">
            <Field
              label={t('blog.seo.ogTitle')}
              htmlFor="seo-og-title"
              hint={<span className="blog-counter">{formatCount((draft.ogTitle || effectiveTitle).length)}/95</span>}
            >
              <Input
                id="seo-og-title"
                value={draft.ogTitle}
                onChange={(e) => setDraft({ ...draft, ogTitle: e.target.value })}
                maxLength={95}
                placeholder={effectiveTitle}
              />
            </Field>
            <Field label={t('blog.seo.twitterCard')} htmlFor="seo-twitter">
              <SegmentedControl<TwitterCard>
                label={t('blog.seo.twitterCard')}
                value={draft.twitterCard}
                onChange={(twitterCard) => setDraft({ ...draft, twitterCard })}
                options={[
                  { key: 'summary_large_image', label: t('blog.seo.twitter.large') },
                  { key: 'summary', label: t('blog.seo.twitter.summary') },
                ]}
              />
            </Field>
          </div>
          <Field
            label={t('blog.seo.ogDescription')}
            htmlFor="seo-og-desc"
            hint={<span className="blog-counter">{formatCount((draft.ogDescription || effectiveDescription).length)}/200</span>}
          >
            <Textarea
              id="seo-og-desc"
              rows={2}
              value={draft.ogDescription}
              onChange={(e) => setDraft({ ...draft, ogDescription: e.target.value })}
              maxLength={200}
              placeholder={effectiveDescription}
            />
          </Field>
          <div className="row seo-robots" style={{ gap: 16, flexWrap: 'wrap' }}>
            <label className="row" style={{ gap: 8 }}>
              <Toggle
                checked={draft.robotsIndex}
                onChange={(robotsIndex) => setDraft({ ...draft, robotsIndex })}
                label={t('blog.seo.robotsIndex')}
                disabled={readOnly}
                data-testid="seo-robots-index"
              />
              <span>{t('blog.seo.robotsIndex')}</span>
            </label>
            <label className="row" style={{ gap: 8 }}>
              <Toggle
                checked={draft.robotsFollow}
                onChange={(robotsFollow) => setDraft({ ...draft, robotsFollow })}
                label={t('blog.seo.robotsFollow')}
                disabled={readOnly}
              />
              <span>{t('blog.seo.robotsFollow')}</span>
            </label>
            {!snapshot.published && <span className="small muted">{t('blog.seo.robotsUnpublished')}</span>}
          </div>
          <div className="row seo-save" style={{ gap: 8, alignItems: 'center' }}>
            <Button
              size="sm"
              variant="primary"
              onClick={() => void saveSeo()}
              disabled={readOnly || !dirty || saveState.kind === 'saving'}
              data-testid="seo-save"
            >
              {saveState.kind === 'saving' ? t('blog.editor.saving') : t('blog.seo.save')}
            </Button>
            {saveState.kind === 'saved' && !dirty && (
              <span className="small muted" role="status">
                <AppIcon name="check" size="xs" tone="success" /> {t('blog.seo.saved')}
                {view?.updatedAt ? ` · ${formatDateTime(view.updatedAt)}` : ''}
              </span>
            )}
            {saveState.kind === 'error' && (
              <span className="field__error" role="alert">
                {saveState.message}
              </span>
            )}
            {dirty && saveState.kind !== 'saving' && <span className="small muted">{t('blog.seo.unsaved')}</span>}
          </div>
        </fieldset>
      )}

      {view && (
        <section className="seo-translations" data-testid="seo-translations">
          <h4 className="field__label">{t('blog.seo.translations')}</h4>
          {view.translations.length ? (
            <ul className="seo-translations__list">
              {view.translations.map((tr) => (
                <li key={tr.id}>
                  <Badge tone="info">{tr.language}</Badge> <a href={tr.path}>{tr.title}</a>
                  {!tr.published && <span className="small muted"> · {t('blog.seo.translations.unpublished')}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">{t('blog.seo.translations.none')}</p>
          )}
          {!readOnly && (
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Input
                dir="ltr"
                value={translationId}
                onChange={(e) => setTranslationId(e.target.value)}
                placeholder={t('blog.seo.translations.idPlaceholder')}
                aria-label={t('blog.seo.translations.idPlaceholder')}
                style={{ maxWidth: 340 }}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void linkTranslation()}
                disabled={translationBusy || !translationId.trim()}
              >
                {t('blog.seo.translations.link')}
              </Button>
              {view.translationGroupId && (
                <Button size="sm" variant="ghost" onClick={() => void unlinkTranslation()} disabled={translationBusy}>
                  {t('blog.seo.translations.unlink')}
                </Button>
              )}
            </div>
          )}
          {translationError && (
            <p className="field__error" role="alert">
              {translationError}
            </p>
          )}
          <p className="small muted">{t('blog.seo.translations.hint')}</p>
        </section>
      )}

      <section className="seo-analysis" data-testid="seo-analysis" aria-busy={analysisBusy}>
        <div className="seo-analysis__head">
          <h4 className="field__label">{t('blog.seo.analysis')}</h4>
          {report && (
            <Badge tone={report.basis === 'saved' ? 'success' : 'neutral'} data-testid="seo-basis">
              {t(`blog.seo.basis.${report.basis}`)}
            </Badge>
          )}
          {analysisBusy && <span className="small muted">{t('blog.seo.analyzing')}</span>}
        </div>
        {analysisError && (
          <Alert kind="warning" title={t('blog.seo.err.analysis')}>
            {analysisError}
          </Alert>
        )}
        {report && hasInput ? (
          <>
            <div className="seo-score" data-testid="seo-score" data-value={report.score.value}>
              <div className="seo-score__num">
                <b>{formatCount(report.score.value)}</b>
                <span>/100</span>
              </div>
              <div className="seo-score__bar">
                <ProgressBar value={report.score.value} label={report.score.label} tone={scoreTone} />
                <p className="small muted">
                  {report.score.label} · {report.score.note[lang]}
                  {report.score.criticalFailed && <> · {t('blog.seo.score.capped')}</>}
                </p>
              </div>
            </div>
            <div className="seo-stats small muted" data-testid="seo-stats">
              <span>{t('blog.seo.stats.words', { n: formatCount(report.stats.words) })}</span>
              <span>{t('blog.seo.stats.headings', { n: formatCount(report.stats.headings) })}</span>
              <span>
                {t('blog.seo.stats.images', { n: formatCount(report.stats.images), missing: formatCount(report.stats.imagesWithoutAlt) })}
              </span>
              <span>
                {t('blog.seo.stats.links', {
                  internal: formatCount(report.stats.internalLinks),
                  external: formatCount(report.stats.externalLinks),
                  broken: formatCount(report.stats.brokenLinks),
                })}
              </span>
              {report.stats.keyword && (
                <span>
                  {t('blog.seo.stats.keyword', {
                    n: formatCount(report.stats.keyword.occurrences),
                    density: report.stats.keyword.density.toFixed(1),
                  })}
                </span>
              )}
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Button size="sm" variant="ghost" onClick={() => setShowPassed((v) => !v)} aria-pressed={showPassed}>
                {showPassed ? t('blog.seo.hidePassed') : t('blog.seo.showPassed')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowWeights((v) => !v)} aria-pressed={showWeights}>
                {t('blog.seo.weights')}
              </Button>
            </div>
            {showWeights && (
              <table className="seo-weights small" data-testid="seo-weights">
                <tbody>
                  {Object.entries(report.score.weights).map(([rule, w]) => (
                    <tr key={rule}>
                      <td>{rule}</td>
                      <td>{w}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {openCount === 0 && (
              <p className="small" data-testid="seo-all-clear">
                {t('blog.seo.allClear')}
              </p>
            )}
            {grouped.map((g) =>
              g.open.length || (showPassed && g.passed.length) ? (
                <div key={g.severity} className="seo-group">
                  <h5 className="seo-group__title">
                    {t(`blog.seo.severity.${g.severity}`)} <span className="muted">({formatCount(g.open.length)})</span>
                  </h5>
                  <ul className="seo-recs">
                    {g.open.map((r) => (
                      <Recommendation key={r.rule} rec={r} onGoTo={onGoTo} />
                    ))}
                    {showPassed && g.passed.map((r) => <Recommendation key={r.rule} rec={r} onGoTo={onGoTo} />)}
                  </ul>
                </div>
              ) : null,
            )}
          </>
        ) : (
          !analysisError && <p className="small muted">{t('blog.seo.noAnalysis')}</p>
        )}
      </section>
    </div>
  );
}
