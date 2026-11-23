import { MESH_DIRECTIONAL, MESH_ICONS, type MeshIconName, type MeshShape } from './mesh';
import { iconA11y, iconClassName, iconPx, type IconBaseProps } from './types';

export interface MeshIconProps extends IconBaseProps {
  name: MeshIconName;
}

/**
 * Custom MESH family (see `mesh.ts`). Renders the registry shapes as a plain
 * inline `<svg>` — no innerHTML, no asset fetch, nothing dynamic that could
 * fail silently: an unknown name is a type error.
 */
export function MeshIcon({ name, size, className, style, label, tone, strokeWidth = 2, flip = 'auto', ...rest }: MeshIconProps) {
  const shapes: readonly MeshShape[] = MESH_ICONS[name].shapes;
  const px = iconPx(size);
  return (
    <svg
      viewBox="0 0 24 24"
      width={px}
      height={px}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      className={iconClassName({ className, tone, flip, directional: MESH_DIRECTIONAL.has(name), extra: `icon--mesh icon--mesh-${name}` })}
      style={style}
      data-icon={name}
      data-testid={rest['data-testid']}
      {...iconA11y(label)}
    >
      {shapes.map((shape, index) =>
        'd' in shape ? (
          <path key={index} d={shape.d} />
        ) : (
          <circle key={index} cx={shape.cx} cy={shape.cy} r={shape.r} fill={shape.fill ? 'currentColor' : undefined} stroke={shape.fill ? 'none' : undefined} />
        ),
      )}
    </svg>
  );
}
