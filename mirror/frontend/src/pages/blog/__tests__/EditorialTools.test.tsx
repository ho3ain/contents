import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArticleImage } from '../ArticleImage';
import { ArticleShareRail } from '../ArticleShareRail';
import { setLocale } from '../../../i18n';

afterEach(() => { setLocale('fa'); document.body.style.overflow = ''; });

describe('Article body images', () => {
  it('opens the shared modal, closes on image click and restores focus and previous scroll lock', async () => {
    document.body.style.overflow = 'clip';
    render(<ArticleImage src="/example.png" alt="جزئیات" caption="زیرنویس" />);
    const trigger = screen.getByRole('button', { name: 'بزرگ‌نمایی تصویر: جزئیات' });
    trigger.focus(); fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: 'بستن تصویر بزرگ‌شده' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('clip');
  });
  it('supports Escape and cleans up on unmount, including images without alt', () => {
    const { unmount } = render(<ArticleImage src="/example.png" alt="" caption={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'بزرگ‌نمایی تصویر' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'بزرگ‌نمایی تصویر' }));
    unmount(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });
});

describe('Four sharing actions', () => {
  it('encodes the canonical URL, opens safe external targets and only reports successful copy after resolution', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const payload = { url: 'https://mesh.example/blog/hello?x=1&y=2', title: 'A title' };
    render(<ArticleShareRail payload={payload} />);
    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute('href', expect.stringContaining(encodeURIComponent(payload.url)));
    for (const link of screen.getAllByRole('link')) expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.click(screen.getByRole('button', { name: 'کپی لینک مقاله' }));
    expect(await screen.findByText('لینک کپی شد')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(payload.url);
  });
  it('announces a failure, not copied, when clipboard permission is denied', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    render(<ArticleShareRail payload={{ url: 'https://mesh.example/blog/a', title: 'A' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'کپی لینک مقاله' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('کپی ممکن نشد'));
    expect(screen.queryByText('لینک کپی شد')).not.toBeInTheDocument();
  });
});
