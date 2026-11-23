import { Spinner } from '../ui/Spinner';

export function LoadingState({ label }: { label?: string }) {
  return (
    <div
      className="row"
      style={{
        justifyContent: 'center',
        padding: 'var(--sp-8)',
        gap: 'var(--sp-2)',
        color: 'var(--text-3)',
      }}
    >
      <Spinner />
      {label && <span className="muted small">{label}</span>}
    </div>
  );
}
