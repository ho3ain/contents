import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'info' | 'accent' | 'success' | 'warning' | 'danger';
export type BadgeDot = 'success' | 'warning' | 'danger' | 'neutral';

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'badge--neutral',
  info: 'badge--info',
  accent: 'badge--accent',
  success: 'badge--success',
  warning: 'badge--warning',
  danger: 'badge--danger',
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  dot?: BadgeDot;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', dot, children, className, ...rest }: BadgeProps) {
  const cls = ['badge', TONE_CLASS[tone]];
  if (className) cls.push(className);
  return (
    <span className={cls.join(' ')} {...rest}>
      {dot && <span aria-hidden="true" className={`dot dot--${dot}`} />}
      {children}
    </span>
  );
}
