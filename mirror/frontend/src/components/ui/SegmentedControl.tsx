import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { isRtlLocale } from '../../i18n';

export interface SegmentedOption<K extends string = string> {
  key: K;
  label: ReactNode;
  /** Optional count shown after the label (e.g. unread notifications). */
  count?: number;
  disabled?: boolean;
}

export interface SegmentedControlProps<K extends string> {
  options: Array<SegmentedOption<K>>;
  value: K;
  onChange: (key: K) => void;
  /** Accessible name of the group. */
  label: string;
  /** Horizontal scroll on narrow screens instead of wrapping. */
  scroll?: boolean;
  className?: string;
  'data-testid'?: string;
}

/**
 * Pill-shaped single-select switch (filters, radio-like choices). Shares the
 * `.pf-segmented` styles with the creator profile avatar-source picker.
 * Keyboard: ←/→ move (mirrored in RTL), Home/End jump; roving tabindex.
 */
export function SegmentedControl<K extends string>({
  options,
  value,
  onChange,
  label,
  scroll,
  className,
  'data-testid': testId,
}: SegmentedControlProps<K>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusAt = (from: number, direction: 1 | -1) => {
    const count = options.length;
    let index = from;
    for (let step = 0; step < count; step += 1) {
      index = (index + direction + count) % count;
      if (!options[index].disabled) break;
    }
    refs.current[index]?.focus();
    onChange(options[index].key);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const forward = isRtlLocale() ? 'ArrowLeft' : 'ArrowRight';
    const backward = isRtlLocale() ? 'ArrowRight' : 'ArrowLeft';
    if (event.key === forward) focusAt(index, 1);
    else if (event.key === backward) focusAt(index, -1);
    else if (event.key === 'Home') focusAt(-1, 1);
    else if (event.key === 'End') focusAt(0, -1);
    else return;
    event.preventDefault();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={['pf-segmented', scroll ? 'pf-segmented--scroll' : null, className].filter(Boolean).join(' ')}
      data-testid={testId}
    >
      {options.map((option, index) => {
        const checked = option.key === value;
        return (
          <button
            key={option.key}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={option.disabled}
            className={`pf-segmented__item${checked ? ' pf-segmented__item--active' : ''}`}
            onClick={() => onChange(option.key)}
            onKeyDown={(event) => onKeyDown(event, index)}
            data-key={option.key}
          >
            {option.label}
            {typeof option.count === 'number' && (
              <span className="pf-segmented__count" dir="ltr">
                {option.count.toLocaleString()}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
