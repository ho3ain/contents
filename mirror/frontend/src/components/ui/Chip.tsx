import type { HTMLAttributes, ReactNode } from 'react';

export interface ChipProps extends HTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children: ReactNode;
}

export function Chip({ active, className, children, ...rest }: ChipProps) {
  const cls = ['chip'];
  if (active) cls.push('chip--active');
  if (className) cls.push(className);
  return (
    <button type="button" className={cls.join(' ')} aria-pressed={active} {...rest}>
      {children}
    </button>
  );
}
