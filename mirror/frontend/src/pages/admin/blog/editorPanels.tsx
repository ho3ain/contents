import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode, type RefObject } from 'react';
import { blogAdminApi, type BlogReadinessIssue, type BlogRenderedBody, type BlogSource } from '../../../api/blog';
import { Button, Field, Input } from '../../../components/ui';
import { AppIcon } from '../../../components/ui/AppIcon';
import { StateIcon } from '../../../components/ui/icons/StateIcon';
import { formatCount } from '../../../lib/format';
import { t } from '../../../i18n';
import { BlogBlocks } from '../../blog/BlogBlocks';
import { blogErrorMessage, readinessLabel } from './blogAdminShared';

/** Blog platform — editor building blocks (markdown editor, pickers, SEO, media). */

// ---- markdown editor -------------------------------------------------------

type Wrap = { before: string; after?: string; block?: boolean; placeholder: string };

const TOOLS: Array<{ key: string; wrap: Wrap }> = [
  { key: 'h2', wrap: { before: '## ', block: true, placeholder: 'عنوان بخش' } },
  { key: 'h3', wrap: { before: '### ', block: true, placeholder: 'زیرعنوان' } },
  { key: 'bold', wrap: { before: '**', after: '**', placeholder: 'متن پررنگ' } },
  { key: 'italic', wrap: { before: '*', after: '*', placeholder: 'متن مورب' } },
  { key: 'link', wrap: { before: '[', after: '](https://)', placeholder: 'متن لینک' } },
  { key: 'ul', wrap: { before: '- ', block: true, placeholder: 'مورد فهرست' } },
  { key: 'ol', wrap: { before: '1. ', block: true, placeholder: 'مورد فهرست' } },
  { key: 'quote', wrap: { before: '> ', block: true, placeholder: 'نقل‌قول' } },
  { key: 'note', wrap: { before: '> [!NOTE]\n> ', block: true, placeholder: 'نکته' } },
  { key: 'code', wrap: { before: '`', after: '`', placeholder: 'code' } },
  { key: 'codeblock', wrap: { before: '```\n', after: '\n```', block: true, placeholder: 'code' } },
  { key: 'table', wrap: { before: '| ستون ۱ | ستون ۲ |\n| --- | --- |\n| ', after: ' |  |', block: true, placeholder: 'مقدار' } },
  { key: 'hr', wrap: { before: '\n---\n', block: true, placeholder: '' } },
];

/** Inserts/wraps markdown at the caret — the only "formatting" the editor does; parsing is server-side. */
function applyWrap(textarea: HTMLTextAreaElement, wrap: Wrap, onChange: (next: string) => void) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const selected = value.slice(start, end) || wrap.placeholder;
  let before = wrap.before;
  if (wrap.block && start > 0 && value[start - 1] !== '\n') before = `\n${before}`;
  const insert = `${before}${selected}${wrap.after ?? ''}`;
  const next = value.slice(0, start) + insert + value.slice(end);
  onChange(next);
  requestAnimationFrame(() => {
    textarea.focus();
    const caret = start + before.length;
    textarea.setSelectionRange(caret, caret + selected.length);
  });
}

export function MarkdownEditor({
  value,
  onChange,
  onUploadImage,
  uploadsEnabled,
  textareaRef,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  onUploadImage: (file: File) => Promise<{ url: string; alt: string } | null>;
  uploadsEnabled: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [preview, setPreview] = useState<BlogRenderedBody | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const id = useId();

  // Preview is rendered by the SAME server parser that runs at save time —
  // what the editor sees is exactly what readers will get.
  useEffect(() => {
    if (mode !== 'preview') return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setPreviewBusy(true);
      blogAdminApi
        .render(value)
        .then((r) => {
          if (!cancelled) {
            setPreview(r);
            setPreviewError(null);
          }
        })
        .catch((e: unknown) => !cancelled && setPreviewError(blogErrorMessage(e)))
        .finally(() => !cancelled && setPreviewBusy(false));
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mode, value]);

  const pickImage = () => fileRef.current?.click();
  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await onUploadImage(file);
      if (uploaded && textareaRef.current) {
        applyWrap(
          textareaRef.current,
          { before: `\n![${uploaded.alt}](${uploaded.url} "`, after: '")\n', block: true, placeholder: 'توضیح تصویر' },
          onChange,
        );
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="blog-md" data-testid="blog-markdown-editor">
      <div className="blog-md-bar">
        <div className="blog-md-tools" role="toolbar" aria-label={t('blog.editor.toolbar')} aria-controls={`${id}-ta`}>
          {TOOLS.map((tool) => (
            <button
              key={tool.key}
              type="button"
              className="blog-md-tool"
              title={t(`blog.editor.tool.${tool.key}`)}
              aria-label={t(`blog.editor.tool.${tool.key}`)}
              disabled={disabled || mode !== 'write'}
              onClick={() => textareaRef.current && applyWrap(textareaRef.current, tool.wrap, onChange)}
            >
              {t(`blog.editor.toolIcon.${tool.key}`)}
            </button>
          ))}
          <button
            type="button"
            className="blog-md-tool"
            title={uploadsEnabled ? t('blog.editor.tool.image') : t('blog.err.storageDisabled')}
            aria-label={t('blog.editor.tool.image')}
            disabled={disabled || mode !== 'write' || !uploadsEnabled || uploading}
            onClick={pickImage}
          >
            {uploading ? '…' : t('blog.editor.toolIcon.image')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => void onFile(e)}
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>
        <div className="blog-md-modes" role="tablist" aria-label={t('blog.editor.modes')}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'write'}
            className={mode === 'write' ? 'is-active' : ''}
            onClick={() => setMode('write')}
            data-testid="blog-mode-write"
          >
            {t('blog.editor.modeWrite')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'preview'}
            className={mode === 'preview' ? 'is-active' : ''}
            onClick={() => setMode('preview')}
            data-testid="blog-mode-preview"
          >
            {t('blog.editor.modePreview')}
          </button>
        </div>
      </div>
      {mode === 'write' ? (
        <textarea
          id={`${id}-ta`}
          ref={textareaRef}
          className="blog-md-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('blog.editor.bodyPlaceholder')}
          aria-label={t('blog.editor.body')}
          disabled={disabled}
          spellCheck
          data-testid="blog-body"
        />
      ) : (
        <div className="blog-md-preview article-body" role="tabpanel" aria-busy={previewBusy} data-testid="blog-inline-preview">
          {previewError ? (
            <p className="field__error" role="alert">
              {previewError}
            </p>
          ) : preview ? (
            <>
              {preview.warnings.length > 0 && (
                <ul className="blog-warnings" aria-label={t('blog.editor.warnings')}>
                  {preview.warnings.map((w, i) => (
                    <li key={i}>
                      {t(`blog.warning.${w.code}`)} {t('blog.editor.line', { n: formatCount(w.line) })}
                      {w.detail ? ` — ${w.detail}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              {preview.blocks.length === 0 ? (
                <p className="muted">{t('blog.editor.previewEmpty')}</p>
              ) : (
                <BlogBlocks blocks={preview.blocks} />
              )}
              <p className="muted small blog-md-stats">
                {t('blog.editor.stats', { words: formatCount(preview.wordCount), minutes: formatCount(preview.readingMinutes) })}
              </p>
            </>
          ) : (
            <p className="muted">{t('common.loading')}</p>
          )}
        </div>
      )}
      <p className="muted small blog-md-help">{t('blog.editor.syntaxHelp')}</p>
    </div>
  );
}

// ---- generic async picker --------------------------------------------------

export interface PickerOption {
  id: string;
  label: string;
  hint?: string;
}

/** Search-as-you-type picker producing a list of chips (single or multi). */
export function Picker({
  label,
  hint,
  values,
  onChange,
  search,
  single,
  max,
  disabled,
  testId,
  emptyLabel,
}: {
  label: string;
  hint?: string;
  values: PickerOption[];
  onChange: (next: PickerOption[]) => void;
  search: (q: string) => Promise<PickerOption[]>;
  single?: boolean;
  max?: number;
  disabled?: boolean;
  testId?: string;
  emptyLabel?: string;
}) {
  const [q, setQ] = useState('');
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setBusy(true);
      search(q.trim())
        .then((rows) => !cancelled && setOptions(rows.filter((r) => !values.some((v) => v.id === r.id))))
        .catch(() => !cancelled && setOptions([]))
        .finally(() => !cancelled && setBusy(false));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [q, open, search, values]);

  const add = (option: PickerOption) => {
    onChange(single ? [option] : [...values, option]);
    setQ('');
    if (single || (max && values.length + 1 >= max)) setOpen(false);
  };
  const remove = (optionId: string) => onChange(values.filter((v) => v.id !== optionId));
  const full = Boolean(single && values.length >= 1) || Boolean(max && values.length >= max);

  return (
    <Field label={label} hint={hint} htmlFor={`${id}-in`}>
      <div className="blog-picker" data-testid={testId}>
        {values.length > 0 ? (
          <ul className="blog-chips" aria-label={label}>
            {values.map((v) => (
              <li key={v.id} className="blog-chip">
                <span>{v.label}</span>
                {!disabled && (
                  <button type="button" aria-label={t('blog.common.removeX', { name: v.label })} onClick={() => remove(v.id)}>
                    <AppIcon name="close" size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          emptyLabel && <p className="muted small">{emptyLabel}</p>
        )}
        {!disabled && !full && (
          <div className="blog-picker-search">
            <Input
              id={`${id}-in`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setOpen(true)}
              onBlur={() => window.setTimeout(() => setOpen(false), 150)}
              placeholder={t('blog.common.searchPlaceholder')}
              autoComplete="off"
              role="combobox"
              aria-expanded={open}
              aria-controls={`${id}-list`}
              aria-autocomplete="list"
            />
            {open && (
              <ul className="blog-picker-list" id={`${id}-list`} role="listbox">
                {busy && options.length === 0 ? (
                  <li className="muted small">{t('common.loading')}</li>
                ) : options.length === 0 ? (
                  <li className="muted small">{t('blog.common.noMatches')}</li>
                ) : (
                  options.slice(0, 12).map((o) => (
                    <li key={o.id} role="option" aria-selected={false}>
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(o)}>
                        <span>{o.label}</span>
                        {o.hint && <small>{o.hint}</small>}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </Field>
  );
}

// ---- sources ---------------------------------------------------------------

export function SourcesEditor({
  value,
  onChange,
  disabled,
}: {
  value: BlogSource[];
  onChange: (next: BlogSource[]) => void;
  disabled?: boolean;
}) {
  const update = (index: number, patch: Partial<BlogSource>) => onChange(value.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  return (
    <div className="stack stack--sm" data-testid="blog-sources">
      {value.map((source, index) => (
        <div className="blog-source-row" key={index}>
          <Input
            value={source.title}
            onChange={(e) => update(index, { title: e.target.value })}
            placeholder={t('blog.editor.sourceTitle')}
            aria-label={t('blog.editor.sourceTitle')}
            disabled={disabled}
            maxLength={200}
          />
          <Input
            value={source.url}
            dir="ltr"
            onChange={(e) => update(index, { url: e.target.value })}
            placeholder="https://"
            aria-label={t('blog.editor.sourceUrl')}
            disabled={disabled}
            maxLength={2000}
          />
          {!disabled && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              aria-label={t('blog.common.remove')}
            >
              <AppIcon name="close" size="xs" />
            </Button>
          )}
        </div>
      ))}
      {!disabled && value.length < 20 && (
        <Button size="sm" variant="secondary" onClick={() => onChange([...value, { title: '', url: '' }])}>
          {t('blog.editor.addSource')}
        </Button>
      )}
    </div>
  );
}

// ---- readiness -------------------------------------------------------------

export function ReadinessList({ issues, title }: { issues: BlogReadinessIssue[]; title?: string }) {
  if (issues.length === 0) return null;
  return (
    <div className="blog-readiness" data-testid="blog-readiness">
      {title && <b>{title}</b>}
      <ul>
        {issues.map((issue, i) => (
          <li key={`${issue.code}-${i}`} className={issue.severity === 'error' ? 'is-error' : 'is-warning'}>
            <StateIcon state={issue.severity === 'error' ? 'failed' : 'warning'} size={14} tone="inherit" /> {readinessLabel(issue)}
            {issue.detail ? <small> — {issue.detail}</small> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- SEO snippet -----------------------------------------------------------

export function SerpPreview({ title, description, path }: { title: string; description: string; path: string }) {
  return (
    <div className="blog-serp" aria-label={t('blog.editor.serpPreview')}>
      <small dir="ltr">{path}</small>
      <b>{title || t('blog.editor.untitled')}</b>
      <p>{description || t('blog.editor.serpNoDescription')}</p>
    </div>
  );
}

export function Counter({ value, max, warn }: { value: number; max: number; warn?: number }) {
  const tone = value > max ? 'is-over' : warn && value > warn ? 'is-warn' : '';
  return (
    <span className={`blog-counter ${tone}`} aria-live="polite">
      {formatCount(value)}/{formatCount(max)}
    </span>
  );
}

export function FeaturedImageEditor({
  url,
  alt,
  caption,
  onChange,
  onUpload,
  uploadsEnabled,
  disabled,
}: {
  url: string;
  alt: string;
  caption: string;
  onChange: (patch: { featuredImageUrl?: string; featuredImageAlt?: string; featuredImageCaption?: string }) => void;
  onUpload: (file: File) => Promise<{ url: string; alt: string } | null>;
  uploadsEnabled: boolean;
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // Remember WHICH url failed so a new url is retried automatically.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const broken = brokenUrl !== null && brokenUrl === url;
  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const uploaded = await onUpload(file);
      if (uploaded) onChange({ featuredImageUrl: uploaded.url, featuredImageAlt: alt || uploaded.alt });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack stack--sm" data-testid="blog-featured-image">
      {url ? (
        broken ? (
          <p className="field__error" role="alert">
            {t('blog.editor.imageMissing')}
          </p>
        ) : (
          <img className="blog-featured-preview" src={url} alt={alt} onError={() => setBrokenUrl(url)} />
        )
      ) : (
        <p className="muted small">{t('blog.editor.noImage')}</p>
      )}
      <div className="row row--wrap" style={{ gap: 8 }}>
        <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={disabled || !uploadsEnabled || busy}>
          {busy ? t('blog.common.working') : url ? t('blog.editor.replaceImage') : t('blog.editor.uploadImage')}
        </Button>
        {url && !disabled && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onChange({ featuredImageUrl: '', featuredImageAlt: '', featuredImageCaption: '' })}
          >
            {t('blog.common.remove')}
          </Button>
        )}
        {!uploadsEnabled && <span className="muted small">{t('blog.err.storageDisabled')}</span>}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => void onFile(e)}
        aria-hidden="true"
        tabIndex={-1}
      />
      <Field label={t('blog.editor.imageAlt')} hint={t('blog.editor.imageAltHint')} htmlFor="blog-img-alt">
        <Input
          id="blog-img-alt"
          value={alt}
          onChange={(e) => onChange({ featuredImageAlt: e.target.value })}
          disabled={disabled || !url}
          maxLength={300}
          data-testid="blog-img-alt"
        />
      </Field>
      <Field label={t('blog.editor.imageCaption')} htmlFor="blog-img-caption">
        <Input
          id="blog-img-caption"
          value={caption}
          onChange={(e) => onChange({ featuredImageCaption: e.target.value })}
          disabled={disabled || !url}
          maxLength={300}
        />
      </Field>
    </div>
  );
}

export function Panel({ title, children, testId, aside }: { title: string; children: ReactNode; testId?: string; aside?: ReactNode }) {
  return (
    <section className="card blog-panel" data-testid={testId}>
      <header className="blog-panel-head">
        <h2>{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}
