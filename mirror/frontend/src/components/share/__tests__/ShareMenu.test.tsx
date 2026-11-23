import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareMenu } from '../ShareMenu';
import { SHARE_CHANNELS, canNativeShare, shareHref } from '../shareTargets';

/**
 * Share menu — the one component behind "share this article / product".
 * Covers the URL builders (no tracking parameters), the popover (copy,
 * channels, keyboard, outside click), and the touch path where the native
 * share sheet is tried first and the menu is only a fallback.
 */

const payload = { url: 'https://mesh.example/blog/hello-world', title: 'سلام دنیا', text: 'خلاصهٔ مقاله' };

function matchMedia(coarse: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: coarse && query.includes('pointer: coarse'),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

function setShare(fn: ((data: ShareData) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'share', { configurable: true, writable: true, value: fn });
  Object.defineProperty(navigator, 'canShare', { configurable: true, writable: true, value: fn ? () => true : undefined });
}

describe('shareTargets', () => {
  it('builds channel URLs from the payload only — no UTM or tracking parameters', () => {
    for (const channel of SHARE_CHANNELS) {
      const href = shareHref(channel, payload);
      expect(href).toContain(encodeURIComponent(payload.url));
      expect(href).not.toMatch(/utm_|ref=|fbclid/);
    }
    expect(shareHref('telegram', payload)).toMatch(/^https:\/\/t\.me\/share\/url\?url=/);
    expect(shareHref('whatsapp', payload)).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(shareHref('linkedin', payload)).toBe(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(payload.url)}`);
    expect(shareHref('x', payload)).toContain(`text=${encodeURIComponent(payload.title)}`);
    expect(shareHref('email', payload)).toMatch(/^mailto:\?subject=/);
    expect(decodeURIComponent(shareHref('email', payload))).toContain(payload.text);
  });

  it('detects the native share sheet only when the browser offers it', () => {
    setShare(undefined);
    expect(canNativeShare(payload)).toBe(false);
    setShare(async () => undefined);
    expect(canNativeShare(payload)).toBe(true);
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
    expect(canNativeShare(payload)).toBe(false);
  });
});

describe('ShareMenu', () => {
  beforeEach(() => {
    matchMedia(false);
    setShare(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens an accessible menu with copy + five channels and focuses the first item', () => {
    render(<ShareMenu payload={payload} />);
    const trigger = screen.getByTestId('share-menu-trigger');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-controls', menu.id);
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(1 + SHARE_CHANNELS.length);
    expect(document.activeElement).toBe(items[0]);
    const telegram = screen.getByTestId('share-menu-telegram');
    expect(telegram).toHaveAttribute('href', shareHref('telegram', payload));
    expect(telegram).toHaveAttribute('target', '_blank');
    expect(telegram).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByTestId('share-menu-email')).not.toHaveAttribute('target');
  });

  it('copies the URL, announces it in a live region and closes shortly after', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ShareMenu payload={payload} />);
    fireEvent.click(screen.getByTestId('share-menu-trigger'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('share-menu-copy'));
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(payload.url);
    expect(screen.getByRole('status')).toHaveTextContent('لینک کپی شد');
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByTestId('share-menu-trigger'));
  });

  it('supports arrow / Home / End / Escape keys and closes on outside click', () => {
    render(
      <div>
        <button type="button">outside</button>
        <ShareMenu payload={payload} />
      </div>,
    );
    const trigger = screen.getByTestId('share-menu-trigger');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const menu = screen.getByRole('menu');
    const items = screen.getAllByRole('menuitem');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(items[items.length - 1]);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[items.length - 1]);
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText('outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('on touch devices tries the native share sheet first and only falls back to the menu when it fails', async () => {
    matchMedia(true);
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share);
    render(<ShareMenu payload={payload} />);
    fireEvent.click(screen.getByTestId('share-menu-trigger'));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: payload.title, text: payload.text, url: payload.url }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    // User dismissed the sheet → nothing else happens.
    share.mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'));
    fireEvent.click(screen.getByTestId('share-menu-trigger'));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    // Sheet unavailable for this payload → the menu is the fallback.
    share.mockRejectedValueOnce(new TypeError('not supported'));
    fireEvent.click(screen.getByTestId('share-menu-trigger'));
    await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
  });

  it('renders a compact icon-only trigger with an accessible name and custom labels', () => {
    render(
      <ShareMenu
        payload={payload}
        compact
        labels={{ button: 'Share', menu: 'Share options', copy: 'Copy link', copied: 'Copied', copyFailed: 'Failed', native: 'More…' }}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Share' });
    expect(trigger).toHaveClass('share-menu__trigger--compact');
    fireEvent.click(trigger);
    expect(screen.getByRole('menu', { name: 'Share options' })).toBeInTheDocument();
    expect(screen.getByTestId('share-menu-copy')).toHaveTextContent('Copy link');
  });
});
