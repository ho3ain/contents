import { useEffect, useRef, type ReactNode } from 'react';
import { t } from '../i18n';
import { AppIcon } from './ui/AppIcon';

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // The latest onClose is read through a ref so the effect below depends on
  // `open` only. Depending on an inline `onClose` re-ran it on EVERY parent
  // render — which re-focused the first control after each keystroke
  // (taxonomy admin QA, 2026-10-12: typing in the form lost focus).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      // aria-modal dialog: keep keyboard focus trapped inside
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Initial focus: the first control of the BODY (a field, not the ✕ close
    // button in the header); fall back to the dialog itself.
    const dialog = dialogRef.current;
    const first =
      dialog?.querySelector<HTMLElement>(
        '.modal__body input:not([disabled]), .modal__body select:not([disabled]), .modal__body textarea:not([disabled]), .modal__body button:not([disabled])',
      ) ?? dialog?.querySelector<HTMLElement>('input,button,textarea');
    first?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={wide ? { maxWidth: 760 } : undefined}
      >
        <div className="modal__head">
          <h3>{title}</h3>
          <button className="btn btn--ghost btn--sm" onClick={onClose} aria-label={t('a11y.closeDialog')}>
            <AppIcon name="close" size="xs" />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}
