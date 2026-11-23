import type { CSSProperties } from 'react';
import { MeshIcon } from './icons/MeshIcon';
import { presentPrice } from '../../lib/currency';
import { t } from '../../i18n';

export type PriceSize = 'sm' | 'md' | 'lg';

export interface PriceProps {
  /** Authoritative amount from the API (IRR decimal string). Never converted by the caller. */
  amount: string | number | null | undefined;
  /** ISO code from the same payload (`IRR` today). */
  currency?: string | null;
  /** Free listing: renders the localized «رایگان» in the success tone. */
  free?: boolean;
  size?: PriceSize;
  className?: string;
  style?: CSSProperties;
  /** Visual prefix such as «جمع کل:» — kept outside the amount so it is not part of the figure. */
  'data-testid'?: string;
}

const ICON_PX: Record<PriceSize, number> = { sm: 14, md: 18, lg: 22 };

/**
 * Customer-facing price (Sprint 2, P2-02) — the ONLY place that renders a
 * product/order amount for buyers and creators.
 *
 * - Persian: Toman figure + the graphical Toman icon (`MeshIcon name="toman"`,
 *   decorative) + ONE visually-hidden «تومان» so screen readers announce the
 *   unit exactly once («۱۵۰٬۰۰۰ تومان»).
 * - English: Toman figure + the visible word "Toman" (no icon, no ambiguity).
 * - Non-IRR (none today): figure + ISO code.
 * - The whole span is `dir="auto"`-safe: figure and unit are inline-flex
 *   items so RTL/LTR alignment follows the document direction.
 */
export function Price({ amount, currency = 'IRR', free = false, size = 'md', className, style, ...rest }: PriceProps) {
  const cls = ['price-amount', `price-amount--${size}`, className].filter(Boolean).join(' ');
  if (free) {
    return (
      <span className={`${cls} price-amount--free`} style={style} data-testid={rest['data-testid']}>
        {t('agent.free')}
      </span>
    );
  }
  const presented = presentPrice(amount, currency);
  if (!presented) {
    return (
      <span className={cls} style={style} data-testid={rest['data-testid']}>
        —
      </span>
    );
  }
  const showIcon = presented.unit === 'toman' && presented.unitLabel === 'تومان';
  return (
    <span className={cls} style={style} data-testid={rest['data-testid']} data-unit={presented.unit} data-currency={presented.currency}>
      <span className="price-amount__figure">{presented.figure}</span>
      {showIcon ? (
        <>
          <MeshIcon name="toman" size={ICON_PX[size]} className="price-amount__icon" flip="never" />
          <span className="sr-only">{presented.unitLabel}</span>
        </>
      ) : (
        <span className="price-amount__unit">{presented.unitLabel}</span>
      )}
    </span>
  );
}
