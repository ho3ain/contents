import { useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type ChangeEvent, type Ref } from 'react';
import {
  EditorContent,
  ReactNodeViewRenderer,
  NodeViewWrapper,
  useEditor,
  useEditorState,
  type Editor,
  type NodeViewProps,
} from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import type { JSONContent } from '@tiptap/core';
import { blogAdminApi, type BlogBlock } from '../../../../api/blog';
import { AppIcon } from '../../../../components/ui/AppIcon';
import { t } from '../../../../i18n';
import { blogErrorMessage } from '../blogAdminShared';
import { blocksToDoc } from './blocksToDoc';
import { docToMarkdown } from './docToMarkdown';
import { buildExtensions, CALLOUT_KINDS, Figure, isSafeHref, type CalloutKind } from './extensions';

/**
 * Content Studio — the visual editor (Tiptap/ProseMirror) for article bodies.
 *
 * Source of truth stays `bodyMarkdown`: the document is hydrated from the
 * server-parsed block tree (`detail.blocks`, or `POST /admin/blog/render` for
 * any other Markdown) and serialised back to the server dialect on every
 * change, so the Markdown mode, revisions, preview and the public renderer all
 * keep reading the same field. Direction follows the article language; mixed
 * Persian/Latin lines are handled by `unicode-bidi: plaintext` per block.
 */

export interface ContentEditorHandle {
  /** Select + scroll to the n-th top-level block (SEO "go to" actions). */
  focusBlock: (index: number) => void;
  focus: () => void;
}

const EMIT_DEBOUNCE_MS = 200;

function proseAttributes(language: 'fa' | 'en'): Record<string, string> {
  return {
    class: 'cs-prose article-body',
    dir: language === 'en' ? 'ltr' : 'rtl',
    lang: language,
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': t('blog.editor.body'),
    'data-testid': 'cs-editor',
  };
}

type Status = 'loading' | 'ready' | 'error';

interface Props {
  value: string;
  /** Server-parsed blocks that correspond to `value` at load time (skips one render round-trip). */
  initialBlocks?: BlogBlock[] | null;
  onChange: (markdown: string) => void;
  onUploadImage: (file: File) => Promise<{ url: string; alt: string } | null>;
  uploadsEnabled: boolean;
  disabled?: boolean;
  language: 'fa' | 'en';
  handle?: Ref<ContentEditorHandle>;
}

// ---- figure node view --------------------------------------------------------

function FigureView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const { src, alt, caption } = node.attrs as { src: string; alt: string; caption: string | null };
  const editable = editor.isEditable;
  return (
    <NodeViewWrapper as="figure" className={`cs-figure${selected ? ' is-selected' : ''}`} data-testid="cs-figure">
      <img src={src} alt={alt} loading="lazy" />
      {editable ? (
        <div className="cs-figure__fields" contentEditable={false}>
          <label>
            <span>{t('blog.cs.figure.alt')}</span>
            <input
              value={alt}
              onChange={(e) => updateAttributes({ alt: e.target.value })}
              placeholder={t('blog.cs.figure.altPlaceholder')}
              aria-invalid={!alt.trim()}
              data-testid="cs-figure-alt"
            />
          </label>
          <label>
            <span>{t('blog.cs.figure.caption')}</span>
            <input
              value={caption ?? ''}
              onChange={(e) => updateAttributes({ caption: e.target.value || null })}
              placeholder={t('blog.cs.figure.captionPlaceholder')}
              data-testid="cs-figure-caption"
            />
          </label>
          {!alt.trim() && <small className="field__error">{t('blog.cs.figure.altMissing')}</small>}
        </div>
      ) : (
        caption && <figcaption>{caption}</figcaption>
      )}
    </NodeViewWrapper>
  );
}

const FigureWithView = Figure.extend({
  addNodeView() {
    return ReactNodeViewRenderer(FigureView);
  },
});

// ---- toolbar -----------------------------------------------------------------

function ToolButton({
  icon,
  label,
  onClick,
  active,
  disabled,
  shortcut,
  testId,
}: {
  icon: Parameters<typeof AppIcon>[0]['name'];
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  shortcut?: string;
  testId?: string;
}) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      className={`cs-tool${active ? ' is-active' : ''}`}
      onMouseDown={(e) => e.preventDefault()} // keep the selection
      onClick={onClick}
      aria-label={title}
      title={title}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      data-testid={testId}
    >
      <AppIcon name={icon} size="xs" />
    </button>
  );
}

interface ToolbarState {
  bold: boolean;
  italic: boolean;
  code: boolean;
  link: boolean;
  linkHref: string | null;
  paragraph: boolean;
  h2: boolean;
  h3: boolean;
  h4: boolean;
  bullet: boolean;
  ordered: boolean;
  quote: boolean;
  callout: CalloutKind | null;
  codeBlock: boolean;
  table: boolean;
  figure: boolean;
  canUndo: boolean;
  canRedo: boolean;
  words: number;
}

function readState(editor: Editor): ToolbarState {
  const callout = CALLOUT_KINDS.find((k) => editor.isActive('callout', { kind: k })) ?? null;
  const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ', ' ');
  return {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    code: editor.isActive('code'),
    link: editor.isActive('link'),
    linkHref: editor.isActive('link') ? ((editor.getAttributes('link').href as string | undefined) ?? null) : null,
    paragraph: editor.isActive('paragraph'),
    h2: editor.isActive('heading', { level: 2 }),
    h3: editor.isActive('heading', { level: 3 }),
    h4: editor.isActive('heading', { level: 4 }),
    bullet: editor.isActive('bulletList'),
    ordered: editor.isActive('orderedList'),
    quote: editor.isActive('blockquote'),
    callout,
    codeBlock: editor.isActive('codeBlock'),
    table: editor.isActive('table'),
    figure: editor.isActive('figure'),
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
    words: (text.match(/[\p{L}\p{N}]+/gu) ?? []).length,
  };
}

const SHORTCUTS: Array<{ keys: string; label: string }> = [
  { keys: 'Ctrl+B', label: 'blog.cs.tool.bold' },
  { keys: 'Ctrl+I', label: 'blog.cs.tool.italic' },
  { keys: 'Ctrl+E', label: 'blog.cs.tool.code' },
  { keys: 'Ctrl+K', label: 'blog.cs.tool.link' },
  { keys: 'Ctrl+Alt+2/3/4', label: 'blog.cs.tool.heading' },
  { keys: 'Ctrl+Shift+8', label: 'blog.cs.tool.bullet' },
  { keys: 'Ctrl+Shift+7', label: 'blog.cs.tool.ordered' },
  { keys: 'Ctrl+Shift+B', label: 'blog.cs.tool.quote' },
  { keys: 'Ctrl+Alt+C', label: 'blog.cs.tool.codeBlock' },
  { keys: 'Shift+Enter', label: 'blog.cs.tool.hardBreak' },
  { keys: 'Ctrl+Z / Ctrl+Shift+Z', label: 'blog.cs.tool.undoRedo' },
  { keys: 'Ctrl+S', label: 'blog.cs.tool.save' },
];

export function ContentEditor({ value, initialBlocks, onChange, onUploadImage, uploadsEnabled, disabled, language, handle }: Props) {
  const id = useId();
  const [status, setStatus] = useState<Status>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState<{ href: string; error: string | null } | null>(null);
  const [imageDraft, setImageDraft] = useState<{ src: string; alt: string; error: string | null } | null>(null);
  const [tableMenu, setTableMenu] = useState(false);
  const [calloutMenu, setCalloutMenu] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastEmitted = useRef<string | null>(null);
  const hydratedFor = useRef<string | null>(null);
  const emitTimer = useRef<number | null>(null);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const extensions = useMemo(() => [...buildExtensions(t('blog.cs.placeholder')).filter((e) => e.name !== 'figure'), FigureWithView], []);

  const editor = useEditor({
    extensions,
    editable: !disabled,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: { attributes: proseAttributes(language) },
    onUpdate: ({ editor: ed, transaction }) => {
      // Only real document changes reach the host — `setEditable` and other
      // non-content transactions must never mark the article dirty.
      if (!transaction.docChanged) return;
      if (emitTimer.current) window.clearTimeout(emitTimer.current);
      emitTimer.current = window.setTimeout(() => {
        const md = docToMarkdown(ed.getJSON());
        lastEmitted.current = md;
        onChangeRef.current(md);
      }, EMIT_DEBOUNCE_MS);
    },
  });
  useEffect(() => {
    // Second argument: do not emit `update` — a read-only toggle is not an edit.
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);

  useEffect(() => {
    editor?.setOptions({ editorProps: { attributes: proseAttributes(language) } });
  }, [editor, language]);

  // Hydrate from the server block tree whenever the external Markdown differs
  // from what this editor last emitted (initial load, revision restore,
  // conflict reload, edits made in Markdown mode).
  useEffect(() => {
    if (!editor) return;
    if (value === lastEmitted.current || value === hydratedFor.current) return;
    let cancelled = false;
    const apply = (blocks: BlogBlock[]) => {
      if (cancelled) return;
      hydratedFor.current = value;
      lastEmitted.current = null;
      const next = blocksToDoc(blocks) as JSONContent;
      // Same content after a server round-trip (e.g. normalised whitespace after
      // autosave): keep the document and the caret where they are.
      if (docToMarkdown(next) !== docToMarkdown(editor.getJSON())) {
        editor.commands.setContent(next, { emitUpdate: false });
      }
      setStatus('ready');
      setLoadError(null);
    };
    if (!value.trim()) {
      apply([]);
      return;
    }
    if (initialBlocks) {
      // The host passes blocks only when they correspond to `value` — no round-trip needed.
      apply(initialBlocks);
      return;
    }
    // Status flips to "loading" from a callback (not synchronously in the
    // effect body) so the hydration request itself stays the single trigger.
    const request = blogAdminApi.render(value);
    void Promise.resolve().then(() => {
      if (!cancelled && hydratedFor.current !== value) setStatus('loading');
    });
    request
      .then((r) => apply(r.blocks))
      .catch((e: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setLoadError(blogErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [editor, value, initialBlocks]);

  useEffect(
    () => () => {
      if (emitTimer.current) window.clearTimeout(emitTimer.current);
    },
    [],
  );

  const state = useEditorState({ editor, selector: ({ editor: ed }) => (ed ? readState(ed) : null) });

  useImperativeHandle(
    handle,
    () => ({
      focus: () => editor?.commands.focus(),
      focusBlock: (index: number) => {
        if (!editor) return;
        const { doc } = editor.state;
        if (index < 0 || index >= doc.childCount) return;
        let pos = 0;
        for (let i = 0; i < index; i += 1) pos += doc.child(i).nodeSize;
        const node = doc.child(index);
        const inside = node.isTextblock || node.content.size > 0 ? pos + 1 : pos;
        const tr = editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(inside)));
        editor.view.dispatch(tr.scrollIntoView());
        editor.commands.focus();
        const dom = editor.view.nodeDOM(pos);
        if (dom instanceof HTMLElement) {
          dom.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
          dom.classList.add('cs-flash');
          window.setTimeout(() => dom.classList.remove('cs-flash'), 1600);
        }
      },
    }),
    [editor],
  );

  // ---- link dialog ------------------------------------------------------------
  const openLink = useCallback(() => {
    if (!editor) return;
    const href = (editor.getAttributes('link').href as string | undefined) ?? '';
    setLinkDraft({ href, error: null });
  }, [editor]);
  const applyLink = () => {
    if (!editor || !linkDraft) return;
    const href = linkDraft.href.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setLinkDraft(null);
      return;
    }
    if (!isSafeHref(href)) {
      setLinkDraft({ ...linkDraft, error: t('blog.cs.link.invalid') });
      return;
    }
    if (editor.state.selection.empty && !editor.isActive('link')) {
      editor
        .chain()
        .focus()
        .insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
    setLinkDraft(null);
  };

  // ---- image ---------------------------------------------------------------------
  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !editor) return;
    setUploading(true);
    try {
      const uploaded = await onUploadImage(file);
      if (uploaded) editor.chain().focus().insertFigure({ src: uploaded.url, alt: uploaded.alt, caption: null }).run();
    } finally {
      setUploading(false);
    }
  };
  const applyImage = () => {
    if (!editor || !imageDraft) return;
    const src = imageDraft.src.trim();
    if (!isSafeHref(src) || src.startsWith('#')) {
      setImageDraft({ ...imageDraft, error: t('blog.cs.image.invalid') });
      return;
    }
    editor.chain().focus().insertFigure({ src, alt: imageDraft.alt.trim(), caption: null }).run();
    setImageDraft(null);
  };

  if (!editor || !state) return null;
  const busy = status === 'loading';
  const dis = Boolean(disabled) || busy;

  return (
    <div className="cs" data-testid="content-studio" data-status={status}>
      <div className="cs-toolbar" role="toolbar" aria-label={t('blog.editor.toolbar')} aria-controls={`${id}-editor`}>
        <div className="cs-group">
          <ToolButton
            icon="undoEdit"
            label={t('blog.cs.tool.undo')}
            shortcut="Ctrl+Z"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={dis || !state.canUndo}
          />
          <ToolButton
            icon="redoEdit"
            label={t('blog.cs.tool.redo')}
            shortcut="Ctrl+Shift+Z"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={dis || !state.canRedo}
          />
        </div>
        <div className="cs-group">
          <ToolButton
            icon="paragraph"
            label={t('blog.cs.tool.paragraph')}
            active={state.paragraph}
            onClick={() => editor.chain().focus().setParagraph().run()}
            disabled={dis}
          />
          <ToolButton
            icon="heading2"
            label={t('blog.editor.tool.h2')}
            shortcut="Ctrl+Alt+2"
            active={state.h2}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            disabled={dis}
            testId="cs-h2"
          />
          <ToolButton
            icon="heading3"
            label={t('blog.editor.tool.h3')}
            shortcut="Ctrl+Alt+3"
            active={state.h3}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            disabled={dis}
          />
          <ToolButton
            icon="heading4"
            label={t('blog.cs.tool.h4')}
            shortcut="Ctrl+Alt+4"
            active={state.h4}
            onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
            disabled={dis}
          />
        </div>
        <div className="cs-group">
          <ToolButton
            icon="bold"
            label={t('blog.editor.tool.bold')}
            shortcut="Ctrl+B"
            active={state.bold}
            onClick={() => editor.chain().focus().toggleBold().run()}
            disabled={dis}
            testId="cs-bold"
          />
          <ToolButton
            icon="italic"
            label={t('blog.editor.tool.italic')}
            shortcut="Ctrl+I"
            active={state.italic}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            disabled={dis}
          />
          <ToolButton
            icon="inlineCode"
            label={t('blog.editor.tool.code')}
            shortcut="Ctrl+E"
            active={state.code}
            onClick={() => editor.chain().focus().toggleCode().run()}
            disabled={dis}
          />
          <ToolButton
            icon="link"
            label={t('blog.editor.tool.link')}
            shortcut="Ctrl+K"
            active={state.link}
            onClick={openLink}
            disabled={dis}
            testId="cs-link"
          />
          <ToolButton
            icon="clearFormatting"
            label={t('blog.cs.tool.clear')}
            onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
            disabled={dis}
          />
        </div>
        <div className="cs-group">
          <ToolButton
            icon="list"
            label={t('blog.editor.tool.ul')}
            shortcut="Ctrl+Shift+8"
            active={state.bullet}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            disabled={dis}
            testId="cs-bullet"
          />
          <ToolButton
            icon="listOrdered"
            label={t('blog.editor.tool.ol')}
            shortcut="Ctrl+Shift+7"
            active={state.ordered}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            disabled={dis}
          />
          <ToolButton
            icon="quote"
            label={t('blog.editor.tool.quote')}
            shortcut="Ctrl+Shift+B"
            active={state.quote}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            disabled={dis}
          />
          <div className="cs-menu-anchor">
            <ToolButton
              icon="callout"
              label={t('blog.cs.tool.callout')}
              active={state.callout !== null}
              onClick={() => setCalloutMenu((v) => !v)}
              disabled={dis}
              testId="cs-callout"
            />
            {calloutMenu && (
              <div className="cs-menu" role="menu" aria-label={t('blog.cs.tool.callout')}>
                {CALLOUT_KINDS.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    role="menuitemradio"
                    aria-checked={state.callout === kind}
                    onClick={() => {
                      editor.chain().focus().toggleCallout(kind).run();
                      setCalloutMenu(false);
                    }}
                    data-testid={`cs-callout-${kind}`}
                  >
                    {t(`blog.cs.callout.${kind}`)}
                  </button>
                ))}
                {state.callout && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      editor.chain().focus().unsetCallout().run();
                      setCalloutMenu(false);
                    }}
                  >
                    {t('blog.cs.callout.remove')}
                  </button>
                )}
              </div>
            )}
          </div>
          <ToolButton
            icon="codeBlock"
            label={t('blog.cs.tool.codeBlock')}
            shortcut="Ctrl+Alt+C"
            active={state.codeBlock}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            disabled={dis}
          />
        </div>
        <div className="cs-group">
          <div className="cs-menu-anchor">
            <ToolButton
              icon="table"
              label={t('blog.cs.tool.table')}
              active={state.table}
              onClick={() => setTableMenu((v) => !v)}
              disabled={dis}
              testId="cs-table"
            />
            {tableMenu && (
              <div className="cs-menu" role="menu" aria-label={t('blog.cs.tool.table')}>
                {!state.table ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                      setTableMenu(false);
                    }}
                    data-testid="cs-table-insert"
                  >
                    {t('blog.cs.table.insert')}
                  </button>
                ) : (
                  <>
                    <button type="button" role="menuitem" onClick={() => editor.chain().focus().addRowAfter().run()}>
                      {t('blog.cs.table.addRow')}
                    </button>
                    <button type="button" role="menuitem" onClick={() => editor.chain().focus().addColumnAfter().run()}>
                      {t('blog.cs.table.addCol')}
                    </button>
                    <button type="button" role="menuitem" onClick={() => editor.chain().focus().deleteRow().run()}>
                      {t('blog.cs.table.deleteRow')}
                    </button>
                    <button type="button" role="menuitem" onClick={() => editor.chain().focus().deleteColumn().run()}>
                      {t('blog.cs.table.deleteCol')}
                    </button>
                    {(['left', 'center', 'right'] as const).map((a) => (
                      <button
                        key={a}
                        type="button"
                        role="menuitem"
                        onClick={() =>
                          editor
                            .chain()
                            .focus()
                            .updateAttributes('tableCell', { textAlign: a })
                            .updateAttributes('tableHeader', { textAlign: a })
                            .run()
                        }
                      >
                        {t(`blog.cs.table.align.${a}`)}
                      </button>
                    ))}
                    <button
                      type="button"
                      role="menuitem"
                      className="is-danger"
                      onClick={() => {
                        editor.chain().focus().deleteTable().run();
                        setTableMenu(false);
                      }}
                    >
                      {t('blog.cs.table.delete')}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <ToolButton
            icon="image"
            label={uploadsEnabled ? t('blog.editor.tool.image') : t('blog.cs.image.byUrl')}
            onClick={() => (uploadsEnabled ? fileRef.current?.click() : setImageDraft({ src: '', alt: '', error: null }))}
            disabled={dis || uploading}
            testId="cs-image"
          />
          {uploadsEnabled && (
            <ToolButton
              icon="external"
              label={t('blog.cs.image.byUrl')}
              onClick={() => setImageDraft({ src: '', alt: '', error: null })}
              disabled={dis}
            />
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => void onFile(e)}
            aria-hidden="true"
            tabIndex={-1}
          />
          <ToolButton
            icon="minus"
            label={t('blog.editor.tool.hr')}
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            disabled={dis}
          />
        </div>
        <div className="cs-group cs-group--end">
          <ToolButton icon="keyboard" label={t('blog.cs.tool.shortcuts')} active={shortcuts} onClick={() => setShortcuts((v) => !v)} />
        </div>
      </div>

      {state.link && !linkDraft && (
        <div className="cs-linkbar" role="group" aria-label={t('blog.cs.link.current')} data-testid="cs-linkbar">
          <AppIcon name="link" size="xs" />
          <span dir="ltr">{state.linkHref}</span>
          <button type="button" className="btn btn--ghost btn--xs" onClick={openLink}>
            {t('blog.cs.link.edit')}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--xs"
            onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
          >
            <AppIcon name="unlink" size="xs" /> {t('blog.cs.link.remove')}
          </button>
          {state.linkHref && !state.linkHref.startsWith('#') && (
            <a className="btn btn--ghost btn--xs" href={state.linkHref} target="_blank" rel="noopener noreferrer">
              {t('blog.cs.link.open')} <AppIcon name="external" size="xs" />
            </a>
          )}
        </div>
      )}

      {linkDraft && (
        <form
          className="cs-inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            applyLink();
          }}
          data-testid="cs-link-form"
        >
          <label htmlFor={`${id}-href`}>{t('blog.cs.link.href')}</label>
          <input
            id={`${id}-href`}
            dir="ltr"
            autoFocus
            value={linkDraft.href}
            onChange={(e) => setLinkDraft({ href: e.target.value, error: null })}
            placeholder="https://… / /blog/… / #anchor"
            aria-invalid={Boolean(linkDraft.error)}
            aria-describedby={linkDraft.error ? `${id}-href-err` : undefined}
          />
          <button type="submit" className="btn btn--primary btn--xs">
            {t('blog.cs.link.apply')}
          </button>
          <button type="button" className="btn btn--ghost btn--xs" onClick={() => setLinkDraft(null)}>
            {t('blog.cs.cancel')}
          </button>
          {linkDraft.error && (
            <small id={`${id}-href-err`} className="field__error" role="alert">
              {linkDraft.error}
            </small>
          )}
        </form>
      )}

      {imageDraft && (
        <form
          className="cs-inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            applyImage();
          }}
          data-testid="cs-image-form"
        >
          <label htmlFor={`${id}-img`}>{t('blog.cs.image.src')}</label>
          <input
            id={`${id}-img`}
            dir="ltr"
            autoFocus
            value={imageDraft.src}
            onChange={(e) => setImageDraft({ ...imageDraft, src: e.target.value, error: null })}
            placeholder="https://"
          />
          <label htmlFor={`${id}-img-alt`}>{t('blog.cs.figure.alt')}</label>
          <input id={`${id}-img-alt`} value={imageDraft.alt} onChange={(e) => setImageDraft({ ...imageDraft, alt: e.target.value })} />
          <button type="submit" className="btn btn--primary btn--xs">
            {t('blog.cs.image.insert')}
          </button>
          <button type="button" className="btn btn--ghost btn--xs" onClick={() => setImageDraft(null)}>
            {t('blog.cs.cancel')}
          </button>
          {imageDraft.error && (
            <small className="field__error" role="alert">
              {imageDraft.error}
            </small>
          )}
        </form>
      )}

      {shortcuts && (
        <dl className="cs-shortcuts" data-testid="cs-shortcuts">
          {SHORTCUTS.map((s) => (
            <div key={s.keys}>
              <dt>{t(s.label)}</dt>
              <dd dir="ltr">{s.keys}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="cs-canvas" aria-busy={busy}>
        {status === 'error' ? (
          <div className="cs-load-error" role="alert">
            <p>{loadError}</p>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => {
                hydratedFor.current = null;
                lastEmitted.current = null;
                setStatus('loading');
                blogAdminApi
                  .render(value)
                  .then((r) => {
                    hydratedFor.current = value;
                    editor.commands.setContent(blocksToDoc(r.blocks) as JSONContent, { emitUpdate: false });
                    setStatus('ready');
                  })
                  .catch((e: unknown) => {
                    setStatus('error');
                    setLoadError(blogErrorMessage(e));
                  });
              }}
            >
              {t('blog.cs.retry')}
            </button>
          </div>
        ) : (
          <EditorContent editor={editor} id={`${id}-editor`} />
        )}
        {busy && <div className="cs-loading muted small">{t('blog.cs.loading')}</div>}
      </div>
      <p className="cs-status muted small" aria-live="polite">
        {t('blog.cs.words', { n: state.words })} · {language === 'en' ? 'LTR · English' : 'RTL · فارسی'} · {t('blog.cs.mdNote')}
      </p>
    </div>
  );
}
