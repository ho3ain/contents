import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppIcon } from '../../../components/ui/AppIcon';
import { DOCS_ARTICLES, searchDocs, type DocsSectionKey } from '../../../content/docs';
import { useI18n } from '../../../i18n';

/**
 * Documentation search — a command-palette style dialog opened from the docs
 * sidebar (or with `/` · Ctrl/⌘ K · `?q=`). The form is the same real
 * client-side full-text search over the parsed articles (both languages);
 * the dialog adds focus management, Esc/backdrop dismissal, a body scroll
 * lock and a fade + scale entrance that `prefers-reduced-motion` disables.
 */

const CLOSE_ANIMATION_MS = 170;

function sectionTitle(t: (key: string) => string, key: DocsSectionKey): string {
  return t(`docs.section.${key}.title`);
}

function reducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* ------------------------------------------------------------------ form */

export function DocsSearch({ initialQuery, onDone }: { initialQuery: string; onDone?: () => void }) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery);
  const inputId = useId();
  const hits = useMemo(() => searchDocs(query, locale), [query, locale]);
  const trimmed = query.trim();
  const active = trimmed.length >= 2;

  const inputRef = useRef<HTMLInputElement>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (hits[0]) {
      navigate(`/docs/${hits[0].article.slug}${hits[0].heading ? `#${hits[0].heading.id}` : ''}`);
      onDone?.();
    }
    // Nothing to open yet (empty or no hit): keep the user in the box.
    else inputRef.current?.focus();
  };

  return (
    <form className="docs-search" role="search" onSubmit={submit} data-testid="docs-search">
      <label htmlFor={inputId}>{t('docs.search.label')}</label>
      <div className="docs-search__box">
        <AppIcon name="search" size={18} />
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('docs.search.placeholder')}
          autoComplete="off"
          enterKeyHint="search"
          aria-describedby={active ? `${inputId}-status` : undefined}
          data-autofocus="true"
        />
        {query && (
          <button type="button" className="docs-search__clear" onClick={() => setQuery('')} aria-label={t('docs.search.clear')}>
            <AppIcon name="close" size={16} />
          </button>
        )}
        <button type="submit" className="button button-primary docs-search__submit">
          {t('docs.search.submit')}
        </button>
      </div>
      {active ? (
        <>
          <p id={`${inputId}-status`} className="docs-search__status" role="status" aria-live="polite" data-testid="docs-search-status">
            {hits.length === 0
              ? t('docs.search.none', { query: trimmed })
              : hits.length === 1
                ? t('docs.search.one')
                : t('docs.search.results', { count: hits.length })}
          </p>
          {hits.length > 0 && (
            <ul className="docs-results" data-testid="docs-search-results">
              {hits.map((hit) => (
                <li key={hit.article.slug}>
                  <Link to={`/docs/${hit.article.slug}${hit.heading ? `#${hit.heading.id}` : ''}`} onClick={onDone}>
                    <b>{hit.article.title[locale]}</b>
                    <small>
                      {t('docs.search.in', { section: sectionTitle(t, hit.article.section) })}
                      {hit.heading ? (
                        <>
                          {' · '}
                          <em>{hit.heading.text}</em>
                        </>
                      ) : null}
                    </small>
                    <p>{hit.excerpt}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="docs-search__status docs-search__status--idle">{t('docs.search.idle', { count: DOCS_ARTICLES.length })}</p>
      )}
    </form>
  );
}

/* ---------------------------------------------------------------- dialog */

export function DocsSearchDialog({
  open,
  initialQuery,
  onClose,
  returnFocusTo,
}: {
  open: boolean;
  initialQuery: string;
  onClose: () => void;
  /** Where focus goes when the dialog closes (the sidebar trigger); falls
   *  back to whatever was focused before — e.g. after the `/` shortcut. */
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const { t, locale } = useI18n();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // `closing` keeps the dialog mounted for the exit animation; with reduced
  // motion (or no matchMedia, e.g. jsdom) the dialog closes immediately.
  const [closing, setClosing] = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const closingRef = useRef(false);
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    if (reducedMotion()) {
      onCloseRef.current();
      return;
    }
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(() => {
      closingRef.current = false;
      setClosing(false);
      onCloseRef.current();
    }, CLOSE_ANIMATION_MS);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>('input[data-autofocus]')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeEl = document.activeElement;
      if (event.shiftKey) {
        if (activeEl === first || !dialog.contains(activeEl)) {
          event.preventDefault();
          last.focus();
        }
      } else if (activeEl === last || !dialog.contains(activeEl)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Read at cleanup time on purpose: the trigger may have been re-rendered
      // (route change) and the fresh node is the one that should get focus.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const target = returnFocusTo?.current;
      if (target && target.isConnected) target.focus();
      else if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open, requestClose, returnFocusTo]);

  if (!open) return null;

  return (
    <div
      className={`docs-search-dialog__backdrop${closing ? ' is-closing' : ''}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      data-testid="docs-search-dialog"
    >
      <div ref={dialogRef} className="docs-search-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="docs-search-dialog__head">
          <h2 id={titleId}>{t('docs.search.label')}</h2>
          <button type="button" className="docs-search-dialog__close" onClick={requestClose} aria-label={t('docs.search.close')}>
            <AppIcon name="close" size={16} />
          </button>
        </div>
        <DocsSearch key={locale} initialQuery={initialQuery} onDone={requestClose} />
        <div className="docs-search-dialog__foot" aria-hidden="true">
          <span>
            <kbd>↵</kbd> {t('docs.search.hint.open')}
          </span>
          <span>
            <kbd>Esc</kbd> {t('docs.search.hint.close')}
          </span>
          <span className="docs-search-dialog__count">{t('docs.search.hint.articles', { count: DOCS_ARTICLES.length })}</span>
        </div>
      </div>
    </div>
  );
}
