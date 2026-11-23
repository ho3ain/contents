/**
 * Loading indicator. Rotates by default; under prefers-reduced-motion the
 * animation is replaced by a static pulsing dot (CSS handles this).
 */
export function Spinner({
  size = 14,
  label,
}: {
  size?: number;
  label?: string;
}) {
  return (
    <span
      role={label ? 'status' : 'presentation'}
      aria-label={label}
      style={{ display: 'inline-flex', lineHeight: 0 }}
    >
      <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />
    </span>
  );
}

/** Full-page skeleton used by route guards while auth restores. */
export function PageLoader() {
  return (
    <div className="container page" aria-busy="true">
      <div className="stack">
        <div className="skeleton" style={{ height: 28, width: 220 }} />
        <div className="skeleton" style={{ height: 16, width: 480, maxWidth: '100%' }} />
        <div className="skeleton" style={{ height: 16, width: 360, maxWidth: '100%' }} />
        <div className="mt-6 grid grid--agents">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="card">
              <div className="card__body">
                <div className="skeleton" style={{ height: 44, width: 44, marginBottom: 12 }} />
                <div className="skeleton" style={{ height: 16, width: '70%', marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 12, width: '40%', marginBottom: 16 }} />
                <div className="skeleton" style={{ height: 40 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
