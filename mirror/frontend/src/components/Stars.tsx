import { useTheme } from '../theme';
import { formatRating } from '../lib/format';
import { t } from '../i18n';
import { AppIcon } from './ui/AppIcon';

/** Star glyph: filled for reached steps, outlined (same stroke) otherwise. */
function Star({ on, size }: { on: boolean; size: number }) {
  return <AppIcon name="star" filled={on} size={size} strokeWidth={on ? 1.5 : 2} />;
}

export function Stars({ value, count }: { value: number | null; count?: number }) {
  const { colors } = useTheme();
  if (value === null) {
    return <span className="muted small">{t('reviews.emptyTitle')}</span>;
  }
  return (
    <span className="stars" aria-label={t('reviews.ratingOfFive', { value: formatRating(value) })}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          aria-hidden="true"
          className="stars__star"
          style={{ color: star <= Math.round(value) ? colors.star : 'var(--border-strong)' }}
        >
          <Star on={star <= Math.round(value)} size={13} />
        </span>
      ))}
      <span style={{ marginInlineStart: 4, fontWeight: 600, color: 'var(--text-2)' }}>
        {formatRating(value)}
      </span>
      {count !== undefined && (
        <span className="muted small" style={{ marginInlineStart: 2 }}>
          ({formatRating(count)})
        </span>
      )}
    </span>
  );
}export function RatingInput({
  value,
  onChange,
  name,
}: {
  value: number;
  onChange: (value: number) => void;
  name: string;
}) {
  const { colors } = useTheme();
  return (
    <div role="radiogroup" aria-label={name} className="row" style={{ fontSize: 26 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={t('a11y.stars', { star })}
          onClick={() => onChange(star)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'inline-flex',
            lineHeight: 1,
            padding: '0 2px',
            color: star <= value ? colors.star : 'var(--border-strong)',
          }}
        >
          <Star on={star <= value} size={26} />
        </button>
      ))}
    </div>
  );
}
