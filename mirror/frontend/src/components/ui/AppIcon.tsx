import { BASE_ICONS, DIRECTIONAL, type BaseIconName } from './icons/base';
import { MeshIcon } from './icons/MeshIcon';
import { isMeshIconName, type MeshIconName } from './icons/mesh';
import { iconA11y, iconClassName, iconPx, type IconBaseProps } from './icons/types';

/** Every name the system knows: base (Lucide) ∪ custom MESH. No overlap. */
export type IconName = BaseIconName | MeshIconName;

export interface AppIconProps extends IconBaseProps {
  name: IconName;
  /** Filled variant for the few glyphs that have a solid state (star, heart). */
  filled?: boolean;
  'data-state'?: string;
}

/**
 * The one icon entry point for data-driven UI (nav configs, status maps):
 * dispatches custom names to `MeshIcon` and everything else to the Lucide
 * catalogue. Use `MeshIcon` directly when the custom family is intended.
 * Decorative by default; pass `label` for a meaningful standalone icon.
 */
export function AppIcon({ name, size, className, style, label, tone, strokeWidth = 2, flip = 'auto', filled = false, ...rest }: AppIconProps) {
  if (isMeshIconName(name)) {
    return (
      <MeshIcon name={name} size={size} className={className} style={style} label={label} tone={tone} strokeWidth={strokeWidth} flip={flip} data-testid={rest['data-testid']} />
    );
  }
  const Icon = BASE_ICONS[name];
  const px = iconPx(size);
  // `fill` must be *absent* (not `undefined`) for the outline: react-icons
  // spreads props after its own `fill="none"`, so an explicit undefined would
  // drop the attribute and the browser would fill the paths black.
  const fillProps = filled ? { fill: 'currentColor' } : {};
  return (
    <Icon
      size={px}
      strokeWidth={strokeWidth}
      className={iconClassName({ className, tone, flip, directional: DIRECTIONAL.has(name), extra: `icon--${name}` })}
      style={style}
      focusable="false"
      data-icon={name}
      data-testid={rest['data-testid']}
      data-state={rest['data-state']}
      {...fillProps}
      {...iconA11y(label)}
    />
  );
}
