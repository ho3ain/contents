import type { CSSProperties } from 'react';

export interface DividerProps {
  className?: string;
  style?: CSSProperties;
}

export function Divider({ className, style }: DividerProps) {
  return (
    <hr
      className={className}
      style={{ border: 'none', borderTop: '1px solid var(--border)', margin: 0, ...style }}
    />
  );
}
