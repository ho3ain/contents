import { AppIcon } from '../AppIcon';
import type { IconBaseProps } from './types';

/**
 * The checklist / journey states that used to be drawn with text glyphs
 * (✓ ○ ● ✕ !) across wizard, launch, success and review surfaces. One
 * mapping, one visual weight, semantic tone + shape (never colour alone).
 * Decorative by default: the step label next to it carries the meaning.
 */
export type UiState = 'done' | 'todo' | 'current' | 'failed' | 'warning' | 'skipped';

const STATE: Record<UiState, { name: 'checkCircle' | 'circle' | 'circleDot' | 'xCircle' | 'alertCircle' | 'minus'; tone?: IconBaseProps['tone'] }> = {
  done: { name: 'checkCircle', tone: 'success' },
  todo: { name: 'circle', tone: 'muted' },
  current: { name: 'circleDot', tone: 'accent' },
  failed: { name: 'xCircle', tone: 'danger' },
  warning: { name: 'alertCircle', tone: 'warning' },
  skipped: { name: 'minus', tone: 'muted' },
};

export function StateIcon({
  state,
  size = 'xs',
  label,
  className,
  tone,
}: { state: UiState; /** `'inherit'` → no tone class, the parent's colour wins. */ tone?: IconBaseProps['tone'] | 'inherit' } & Pick<
  IconBaseProps,
  'size' | 'label' | 'className'
>) {
  const def = STATE[state];
  const resolved = tone === 'inherit' ? undefined : (tone ?? def.tone);
  return <AppIcon name={def.name} size={size} tone={resolved} label={label} className={className} data-state={state} />;
}

