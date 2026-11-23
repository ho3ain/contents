import { useNavigate } from 'react-router-dom';
import { AppIcon } from './AppIcon';

/** Back navigation — the arrow is logical (`arrowBack`), so it mirrors in RTL. */
export function BackLink({ to, label = 'Back' }: { to: string; label?: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate(to)} style={{ marginBottom: 16, paddingInlineStart: 8 }}>
      <AppIcon name="arrowBack" size="xs" />
      {label}
    </button>
  );
}
