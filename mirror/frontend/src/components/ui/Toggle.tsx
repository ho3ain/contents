import type { CSSProperties } from 'react';
import { useTheme } from '../../theme';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  style?: CSSProperties;
  /** Stable hook for tests. */
  'data-testid'?: string;
}

export function Toggle({ checked, onChange, label, disabled, style, 'data-testid': testId }: ToggleProps) {
  const { colors } = useTheme();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative',
        width: 42,
        height: 24,
        borderRadius: 999,
        border: 'none',
        padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        background: checked ? colors.accent : colors.borderStrong,
        transition: 'background-color 120ms ease',
        ...style,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 20 : 2,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 120ms ease',
          boxShadow: 'var(--shadow-sm)',
        }}
      />
    </button>
  );
}
