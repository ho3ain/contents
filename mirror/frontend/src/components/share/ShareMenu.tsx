import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { SiX } from 'react-icons/si';
import { AppIcon } from '../ui/AppIcon';
import { SocialIcon } from '../ui/icons/SocialIcon';
import { useMediaQuery } from '../../lib/useMediaQuery';
import {
  SHARE_CHANNELS,
  SHARE_CHANNEL_LABELS,
  SHARE_LABELS_FA,
  canNativeShare,
  shareHref,
  type ShareChannel,
  type ShareMenuLabels,
  type SharePayload,
} from './shareTargets';

/**
 * Share — one component for articles and products.
 *
 *  - Touch devices with the Web Share API get the native sheet straight
 *    away (that is where people's own apps live); if the sheet is dismissed
 *    nothing else happens, if it fails the menu opens instead.
 *  - Everywhere else a small menu opens: copy link, Telegram, WhatsApp,
 *    LinkedIn, X, e-mail — and "more…" when the browser also has a native
 *    sheet (desktop Safari / Windows).
 *  - Accessible menu button: `aria-haspopup`/`aria-expanded`, arrow-key
 *    navigation, Home/End, Escape closes and returns focus, click outside
 *    closes. The copy result is announced through a live region.
 *  - No tracking: the shared URL is the canonical page URL, nothing appended.
 *
 * Copy is passed in (`labels`) so the website (Persian literals) and the
 * app (`t()` keys) both stay on their own translation path.
 */

export interface ShareMenuProps {
  payload: SharePayload;
  labels?: ShareMenuLabels;
  /** Icon-only trigger (text stays as the accessible name). */
  compact?: boolean;
  /** Extra class on the root (layout hooks only). */
  className?: string;
  testId?: string;
  /** Opens the menu toward the given side; default `start` (RTL-aware via logical props). */
  align?: 'start' | 'end';
}

type CopyState = 'idle' | 'copied' | 'failed';

function ChannelMark({ channel }: { channel: ShareChannel }) {
  if (channel === 'x') return <SiX size={16} aria-hidden="true" focusable="false" className="share-menu__mark" />;
  if (channel === 'email') return <AppIcon name="mail" size="xs" className="share-menu__mark" />;
  return <SocialIcon network={channel} size={16} className="share-menu__mark" />;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function ShareMenu({
  payload,
  labels = SHARE_LABELS_FA,
  compact = false,
  className,
  testId = 'share-menu',
  align = 'start',
}: ShareMenuProps) {
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<number | undefined>(undefined);
  const menuId = useId();
  const coarse = useMediaQuery('(pointer: coarse)');
  const nativeAvailable = canNativeShare(payload);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Click outside / focus leaving the component closes the menu.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onFocus = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('focusin', onFocus);
    };
  }, [open]);

  // Focus the first item once the menu is on screen.
  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
  }, [open]);

  const nativeShare = async (): Promise<'done' | 'dismissed' | 'failed'> => {
    try {
      await navigator.share({ title: payload.title, text: payload.text ?? undefined, url: payload.url });
      return 'done';
    } catch (error) {
      return error instanceof DOMException && error.name === 'AbortError' ? 'dismissed' : 'failed';
    }
  };

  const onTrigger = async () => {
    if (open) {
      close();
      return;
    }
    if (coarse && nativeAvailable) {
      const result = await nativeShare();
      if (result !== 'failed') return;
    }
    setCopyState('idle');
    setOpen(true);
  };

  const onCopy = async () => {
    const ok = await copyToClipboard(payload.url);
    setCopyState(ok ? 'copied' : 'failed');
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => {
      setCopyState('idle');
      if (ok) close();
    }, 1400);
  };

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const list = items();
    if (!list.length) return;
    const index = list.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number) => list[(i + list.length) % list.length]?.focus();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusAt(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusAt(0);
        break;
      case 'End':
        event.preventDefault();
        focusAt(list.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        break;
    }
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' && !open) {
      event.preventDefault();
      setCopyState('idle');
      setOpen(true);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      close();
    }
  };

  const status = copyState === 'copied' ? labels.copied : copyState === 'failed' ? labels.copyFailed : '';

  return (
    <div
      ref={rootRef}
      className={['share-menu', open ? 'share-menu--open' : '', className ?? ''].filter(Boolean).join(' ')}
      data-testid={testId}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`share-menu__trigger${compact ? ' share-menu__trigger--compact' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={compact ? (labels.buttonAria ?? labels.button) : undefined}
        onClick={() => void onTrigger()}
        onKeyDown={onTriggerKeyDown}
        data-testid={`${testId}-trigger`}
      >
        <AppIcon name="share" size="xs" />
        {!compact && <span>{labels.button}</span>}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={labels.menu}
          className={`share-menu__popover share-menu__popover--${align}`}
          onKeyDown={onMenuKeyDown}
          data-testid={`${testId}-popover`}
        >
          <button type="button" role="menuitem" className="share-menu__item" onClick={() => void onCopy()} data-testid={`${testId}-copy`}>
            <AppIcon name={copyState === 'copied' ? 'check' : 'copy'} size="xs" className="share-menu__mark" />
            <span>{copyState === 'copied' ? labels.copied : copyState === 'failed' ? labels.copyFailed : labels.copy}</span>
          </button>
          {SHARE_CHANNELS.map((channel) => (
            <a
              key={channel}
              role="menuitem"
              className="share-menu__item"
              href={shareHref(channel, payload)}
              target={channel === 'email' ? undefined : '_blank'}
              rel={channel === 'email' ? undefined : 'noopener noreferrer'}
              onClick={() => setOpen(false)}
              data-testid={`${testId}-${channel}`}
            >
              <ChannelMark channel={channel} />
              <span>{SHARE_CHANNEL_LABELS[channel]}</span>
            </a>
          ))}
          {nativeAvailable && !coarse && (
            <button
              type="button"
              role="menuitem"
              className="share-menu__item"
              onClick={() => {
                setOpen(false);
                void nativeShare();
              }}
              data-testid={`${testId}-native`}
            >
              <AppIcon name="external" size="xs" className="share-menu__mark" />
              <span>{labels.native}</span>
            </button>
          )}
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {status}
      </span>
    </div>
  );
}
