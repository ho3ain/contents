import { MeshIcon } from './icons/MeshIcon';

/**
 * MESH brand mark — the mesh-graph "M" (five nodes, four links) on its
 * ink tile, acid-on-ink via `.logo__mark` (INTELLIGENCE × ACTION on NETWORK).
 * The glyph is the registry's `mark` icon, so the favicon, the header and the
 * specimen all share one geometry. Decorative: the adjacent wordmark names it.
 */
export function MeshMark({ size = 28 }: { size?: number }) {
  // Glyph occupies ~57% of the tile (16/28), the ratio the shell was tuned to.
  const glyph = Math.round((size * 16) / 28);
  return (
    <span className="logo__mark" style={{ width: size, height: size }} aria-hidden="true">
      <MeshIcon name="mark" size={glyph} strokeWidth={2.25} />
    </span>
  );
}
