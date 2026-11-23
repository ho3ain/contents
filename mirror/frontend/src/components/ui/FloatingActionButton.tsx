import type { CSSProperties, ReactNode } from 'react';
import { useTheme } from '../../theme';

export interface FloatingActionButtonProps {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  style?: CSSProperties;
}

export function FloatingActionButton({
  icon,
  label,
  onClick,
  style,
}: FloatingActionButtonProps) {
  const { colors, accessibility } = useTheme();
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        position: 'fixed',
        bottom: 'var(--sp-6)',
        insetInlineEnd: 'var(--sp-6)',
        zIndex: 70,
        width: 52,
        height: 52,
        borderRadius: '50%',
        border: 'none',
        background: colors.accent,
        color: colors.textInverse,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'var(--shadow-lg)',
        cursor: 'pointer',
        outline: 'none',
        ['--focus-ring' as string]: accessibility.focusRing,
        ...style,
      }}
    >
      {icon}
    </button>
  );
}
