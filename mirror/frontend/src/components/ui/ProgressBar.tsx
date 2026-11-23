import { formatPercent } from '../../lib/format';

export type ProgressTone = 'accent' | 'success' | 'warning';

export interface ProgressBarProps {
  /** 0–100; clamped. Must come from real data — never decoration. */
  value: number;
  /** Accessible name (e.g. «تکمیل پروفایل»). */
  label: string;
  tone?: ProgressTone;
  size?: 'sm' | 'md';
  className?: string;
  /** Optional id of an element that describes the value in words. */
  describedBy?: string;
}

/**
 * Determinate progress indicator (design-system primitive).
 * Screen readers get the name + a localized percentage via aria-valuetext;
 * the visible text next to it is the caller's job (never color alone).
 */
export function ProgressBar({
  value,
  label,
  tone,
  size = 'md',
  className,
  describedBy,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
  const resolvedTone: ProgressTone = tone ?? (clamped >= 100 ? 'success' : 'accent');
  const cls = ['progress', `progress--${resolvedTone}`, `progress--${size}`];
  if (className) cls.push(className);
  return (
    <div
      className={cls.join(' ')}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-valuetext={formatPercent(clamped)}
      aria-describedby={describedBy}
    >
      <div className="progress__fill" style={{ inlineSize: `${clamped}%` }} />
    </div>
  );
}
