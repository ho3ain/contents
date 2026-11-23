import { createElement, type CSSProperties, type ReactNode, type JSX } from 'react';
import { useTheme } from '../../theme';

export type TextVariant = 'h1' | 'h2' | 'h3' | 'h4' | 'body' | 'small' | 'muted';

const TAG: Record<TextVariant, keyof JSX.IntrinsicElements> = {
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  body: 'p',
  small: 'span',
  muted: 'span',
};

export interface AppTextProps {
  variant?: TextVariant;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  as?: keyof JSX.IntrinsicElements;
}

export function AppText({ variant = 'body', children, className, style, as }: AppTextProps) {
  const { typography, colors } = useTheme();
  const base: CSSProperties = {
    fontFamily: typography.fontSans,
    margin: 0,
  };
  const variants: Record<TextVariant, CSSProperties> = {
    h1: {
      fontSize: typography.fontSize['3xl'],
      fontWeight: typography.fontWeight.bold,
      lineHeight: typography.lineHeight.tight,
      letterSpacing: typography.letterSpacing.tight,
      color: colors.text,
    },
    h2: {
      fontSize: typography.fontSize['2xl'],
      fontWeight: typography.fontWeight.bold,
      lineHeight: typography.lineHeight.tight,
      color: colors.text,
    },
    h3: {
      fontSize: typography.fontSize.xl,
      fontWeight: typography.fontWeight.semibold,
      color: colors.text,
    },
    h4: {
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.semibold,
      color: colors.text,
    },
    body: {
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.regular,
      lineHeight: typography.lineHeight.base,
      color: colors.text,
    },
    small: {
      fontSize: typography.fontSize.sm,
      color: colors.text2,
    },
    muted: {
      fontSize: typography.fontSize.base,
      color: colors.text3,
    },
  };

  const tag = (as ?? TAG[variant]) as keyof JSX.IntrinsicElements;
  return createElement(tag, { className, style: { ...base, ...variants[variant], ...style } }, children);
}
