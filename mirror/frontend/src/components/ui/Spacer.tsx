import type { CSSProperties } from 'react';

export interface SpacerProps {
  /** Height token key from the spacing scale (e.g. 4 = 1rem). */
  size?: number;
  style?: CSSProperties;
}

export function Spacer({ size = 4, style }: SpacerProps) {
  return <div aria-hidden="true" style={{ height: `var(--sp-${size})`, ...style }} />;
}
