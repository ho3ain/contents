import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../../i18n';
import { Price } from '../Price';
import { MESH_ICONS } from '../icons/mesh';

/**
 * Sprint 2 (P2-02) — the shared customer-facing price:
 * Toman figure + graphical Toman icon (fa) / the word "Toman" (en), unit
 * announced exactly once, IRR never shown as Rial to a customer.
 */
describe('<Price> — Toman presentation + icon accessibility', () => {
  afterEach(() => setLocale('fa'));

  it('fa: renders the Toman figure, the decorative Toman icon and ONE visually-hidden unit', () => {
    setLocale('fa');
    render(<Price amount="1500000.00" currency="IRR" data-testid="p" />);
    const price = screen.getByTestId('p');
    expect(price).toHaveAttribute('data-unit', 'toman');
    expect(price).toHaveAttribute('data-currency', 'IRR');
    expect(price.querySelector('.price-amount__figure')).toHaveTextContent('۱۵۰٬۰۰۰');
    const icon = price.querySelector('svg[data-icon="toman"]');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).not.toHaveAttribute('role');
    const srUnits = price.querySelectorAll('.sr-only');
    expect(srUnits).toHaveLength(1);
    expect(srUnits[0]).toHaveTextContent('تومان');
    // Accessible text = figure + unit once (no double announcement, no «ریال»).
    expect(price.textContent).toBe('۱۵۰٬۰۰۰تومان');
    expect(price.textContent).not.toMatch(/ریال|IRR/);
    expect(price.textContent?.match(/تومان/g)).toHaveLength(1);
  });

  it('en: renders the Toman figure with the visible word "Toman" and no icon', () => {
    setLocale('en');
    render(<Price amount="4500000" data-testid="p" />);
    const price = screen.getByTestId('p');
    expect(price.querySelector('svg')).toBeNull();
    expect(price.querySelector('.price-amount__unit')).toHaveTextContent('Toman');
    expect(price.textContent).toBe('450,000Toman');
  });

  it('never rounds a price that is not a multiple of 10 Rial', () => {
    setLocale('en');
    render(<Price amount="1500005" data-testid="p" />);
    expect(screen.getByTestId('p').querySelector('.price-amount__figure')).toHaveTextContent('150,000.5');
  });

  it('free listings and missing amounts never show a fabricated figure', () => {
    setLocale('fa');
    const { rerender } = render(<Price amount="0" free data-testid="p" />);
    expect(screen.getByTestId('p')).toHaveTextContent('رایگان');
    expect(screen.getByTestId('p').querySelector('svg')).toBeNull();
    rerender(<Price amount={null} data-testid="p" />);
    expect(screen.getByTestId('p')).toHaveTextContent('—');
  });

  it('the Toman glyph is part of the MESH icon system (no foreign currency sign, no emoji)', () => {
    expect(MESH_ICONS.toman).toBeDefined();
    const paths = JSON.stringify(MESH_ICONS.toman);
    expect(paths).not.toMatch(/[$€£¥₹]/u);
  });

  it('exposes size variants for cards, detail and totals', () => {
    setLocale('fa');
    const { rerender } = render(<Price amount="10" size="sm" data-testid="p" />);
    expect(screen.getByTestId('p').className).toContain('price-amount--sm');
    expect(screen.getByTestId('p').querySelector('svg')).toHaveAttribute('width', '14');
    rerender(<Price amount="10" size="lg" data-testid="p" />);
    expect(screen.getByTestId('p').querySelector('svg')).toHaveAttribute('width', '22');
  });
});
