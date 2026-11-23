/**
 * Skeleton system (Phase 10.2) — content-shaped loading placeholders that
 * mirror the real layout of the data being loaded. Animation is a subtle
 * shimmer and automatically disabled under prefers-reduced-motion (CSS).
 */
import type { CSSProperties } from 'react';

function Bar({
  width,
  className,
  style,
}: {
  width?: string | number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`skeleton ${className ?? ''}`.trim()}
      style={{ width, ...style }}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skel-stack" aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <Bar
          key={index}
          className="skel-line"
          style={index === lines - 1 ? { width: '60%' } : undefined}
        />
      ))}
    </div>
  );
}

export function SkeletonAvatar({ lines = 2 }: { lines?: number }) {
  return (
    <div className="skel-row" aria-hidden="true">
      <Bar className="skel-avatar" />
      <div className="skel-stack" style={{ flex: 1, gap: 8 }}>
        {Array.from({ length: lines }).map((_, index) => (
          <Bar key={index} className="skel-line" style={{ width: index ? '50%' : '80%' }} />
        ))}
      </div>
    </div>
  );
}

/** Marketplace agent-card shaped placeholder. */
export function SkeletonCard() {
  return (
    <div className="card" aria-hidden="true">
      <div className="card__body skel-stack">
        <div className="skel-row">
          <Bar className="skel-avatar" />
          <Bar className="skel-line skel-line--title" style={{ width: '60%' }} />
        </div>
        <Bar className="skel-line" style={{ width: '90%' }} />
        <Bar className="skel-line" style={{ width: '45%' }} />
        <Bar style={{ height: 36, marginTop: 8 }} />
      </div>
    </div>
  );
}

export function SkeletonCardGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid--agents" aria-busy="true">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skel-stack" aria-busy="true">
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonAvatar key={index} />
      ))}
    </div>
  );
}

/** Admin-table shaped placeholder with a header band + rows. */
export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }} aria-busy="true">
      <div className="skel-table-head">
        {Array.from({ length: 4 }).map((_, index) => (
          <Bar key={index} className="skel-line" style={{ width: '70%' }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div className="skel-table-row" key={index}>
          {Array.from({ length: 4 }).map((_, cell) => (
            <Bar key={cell} className="skel-line" style={{ width: cell === 0 ? '85%' : '60%' }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Dashboard stat-tile shaped placeholder. */
export function SkeletonStatGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid--2col" aria-busy="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="card card__body">
          <Bar className="skel-line skel-line--title" style={{ width: '40%', marginBottom: 12 }} />
          <Bar className="skel-stat" />
        </div>
      ))}
    </div>
  );
}

/** Detail page: hero + two-column body. */
export function SkeletonDetail() {
  return (
    <div className="skel-stack" aria-busy="true" style={{ gap: 'var(--sp-6)' }}>
      <div className="skel-row">
        <Bar className="skel-avatar" style={{ width: 64, height: 64 }} />
        <div className="skel-stack" style={{ flex: 1, gap: 8 }}>
          <Bar className="skel-line skel-line--title" style={{ width: '50%' }} />
          <Bar className="skel-line" style={{ width: '30%' }} />
        </div>
      </div>
      <div className="grid grid--2col" style={{ gap: 'var(--sp-6)' }}>
        <div className="skel-stack">
          <Bar className="skel-line" />
          <Bar className="skel-line" style={{ width: '90%' }} />
          <Bar className="skel-line" style={{ width: '75%' }} />
          <Bar className="skel-line" style={{ width: '82%' }} />
        </div>
        <Bar style={{ height: 180, borderRadius: 'var(--radius-lg)' }} />
      </div>
    </div>
  );
}
