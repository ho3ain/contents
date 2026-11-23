import { useId, type CSSProperties } from 'react';

/**
 * Locale flags for the public website language menu — original inline SVG
 * (no raster, no external request, renders inside the sandboxed preview).
 *
 * Two flags only, one per supported locale: Iran (fa) and the United
 * Kingdom (en). Both are drawn on a 3:2 canvas and clipped to a rounded
 * rectangle with a hairline border so they read as one calm UI element
 * next to text, never as a loud national banner. Decorative by default —
 * the accessible name belongs to the surrounding control (language label).
 */
export type FlagCode = 'ir' | 'gb';

export interface FlagIconProps {
  code: FlagCode;
  /** Rendered width in px (height follows the 3:2 ratio). */
  width?: number;
  className?: string;
  style?: CSSProperties;
  /** Optional accessible name; omit for a purely decorative flag. */
  label?: string;
}

const W = 60;
const H = 40;

function IranFlag() {
  // Official proportions are 4:7; the 3:2 canvas crops the bands evenly.
  // Colours: green #239f40, white, red #da0000. The central emblem is a
  // simplified stylised tulip (the official emblem's silhouette) — at icon
  // sizes finer detail would only produce noise.
  return (
    <>
      <rect width={W} height={H} fill="#fff" />
      <rect width={W} height={H / 3} fill="#239f40" />
      <rect y={(H / 3) * 2} width={W} height={H / 3} fill="#da0000" />
      <g fill="#da0000" transform={`translate(${W / 2} ${H / 2})`}>
        {/* stem */}
        <rect x={-0.9} y={-5.2} width={1.8} height={9.4} rx={0.9} />
        {/* two outer crescents */}
        <path d="M-5.6 -2.4c-1.9 2.6-1.2 6.2 1.4 7.9 1.1.7 2.3 1 3.4.9-1.6-.6-2.9-1.9-3.5-3.6-.6-1.8-.3-3.7.7-5.2z" />
        <path d="M5.6 -2.4c1.9 2.6 1.2 6.2-1.4 7.9-1.1.7-2.3 1-3.4.9 1.6-.6 2.9-1.9 3.5-3.6.6-1.8.3-3.7-.7-5.2z" />
        {/* two inner crescents */}
        <path d="M-2.9 -1.2c-1 1.8-.6 4 .9 5.3.5.4 1 .7 1.5.8-.9-.5-1.5-1.4-1.8-2.4-.3-1.3-.1-2.6.5-3.7z" />
        <path d="M2.9 -1.2c1 1.8.6 4-.9 5.3-.5.4-1 .7-1.5.8.9-.5 1.5-1.4 1.8-2.4.3-1.3.1-2.6-.5-3.7z" />
        {/* crown */}
        <path d="M-1.4 -6.4h2.8l-1.4 1.6z" />
      </g>
    </>
  );
}

function UnitedKingdomFlag({ clipId }: { clipId: string }) {
  // Standard Union Flag construction on a 60×30 grid, scaled to 60×40 by
  // extending the blue field; diagonals are drawn as two strokes (white over
  // red) with the red offset by the usual counter-changed quarter clip.
  return (
    <g transform={`translate(0 ${(H - 30) / 2})`}>
      <rect x={0} y={-5} width={60} height={40} fill="#012169" />
      <clipPath id={clipId}>
        <path d="M30 15h30v15zv15H30zH0V15zV0h30z" />
      </clipPath>
      <path d="M0-5 60 35M60-5 0 35" stroke="#fff" strokeWidth={6} />
      <path d="M0 0 60 30M60 0 0 30" stroke="#c8102e" strokeWidth={4} clipPath={`url(#${clipId})`} />
      <path d="M30-5v40M0 15h60" stroke="#fff" strokeWidth={10} />
      <path d="M30-5v40M0 15h60" stroke="#c8102e" strokeWidth={6} />
    </g>
  );
}

export function FlagIcon({ code, width = 22, className, style, label }: FlagIconProps) {
  const uid = useId().replace(/:/g, '');
  const frameId = `flag-frame-${uid}`;
  const quarterId = `flag-quarter-${uid}`;
  const height = Math.round((width * H) / W);
  const a11y = label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true as const, focusable: 'false' as const };
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${W} ${H}`}
      className={['flag-icon', `flag-icon--${code}`, className].filter(Boolean).join(' ')}
      style={style}
      data-flag={code}
      {...a11y}
    >
      <clipPath id={frameId}>
        <rect width={W} height={H} rx={7} />
      </clipPath>
      <g clipPath={`url(#${frameId})`}>{code === 'ir' ? <IranFlag /> : <UnitedKingdomFlag clipId={quarterId} />}</g>
      <rect x={0.75} y={0.75} width={W - 1.5} height={H - 1.5} rx={6.5} fill="none" stroke="rgba(16,23,34,.18)" strokeWidth={1.5} />
    </svg>
  );
}
