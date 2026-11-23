/**
 * MESH icon system — the custom MESH family.
 *
 * Original artwork (not derived from any third-party set). One visual DNA:
 * **nodes and links** — the product is a mesh of agents, tools and steps.
 *
 * Grid: 24 × 24, 2-px live area inset (nothing outside 2…22), stroke 2,
 * round caps and joins, `currentColor`. A *node* is a filled circle r = 2
 * (`fill: true`); a *link* is a 2-px stroke that ends on the node centre and
 * is covered by the node. Rings (outlined circles) mark targets/outputs.
 *
 * This file is the single source of truth. `scripts/icons/export-mesh-icons.mjs`
 * writes the optimised standalone SVGs in `src/assets/icons/mesh/` and the
 * specimen sheet from it; a unit test fails when they drift.
 */

export type MeshShape =
  | { readonly d: string }
  | { readonly cx: number; readonly cy: number; readonly r: number; readonly fill?: true };

export interface MeshIconDef {
  /** Short meaning, used in docs/specimen (not rendered). */
  readonly meaning: string;
  readonly shapes: readonly MeshShape[];
}

export const MESH_ICONS = {
  /** Brand mark — the mesh "M": five nodes, four links. Identity, not a UI glyph. */
  mark: {
    meaning: 'MESH brand mark',
    shapes: [
      { d: 'M3 19L8 7l4 7 4-7 5 12' },
      { cx: 3, cy: 19, r: 2, fill: true },
      { cx: 8, cy: 7, r: 2, fill: true },
      { cx: 12, cy: 14, r: 2, fill: true },
      { cx: 16, cy: 7, r: 2, fill: true },
      { cx: 21, cy: 19, r: 2, fill: true },
    ],
  },
  /** An AI agent: a module with a core node and two ports. */
  agent: {
    meaning: 'AI agent / listed product',
    shapes: [
      { d: 'M8 5h8a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z' },
      { cx: 12, cy: 12, r: 2, fill: true },
      { d: 'M2 12h3' },
      { d: 'M19 12h3' },
    ],
  },
  /** Agent builder: a module still open at one corner, being added to. */
  builder: {
    meaning: 'Create / configure an agent',
    shapes: [
      { d: 'M13 4H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-6' },
      { d: 'M18 3v6' },
      { d: 'M15 6h6' },
      { cx: 12, cy: 13, r: 2, fill: true },
    ],
  },
  /** Connected tools: two modules joined by a routed link. */
  tools: {
    meaning: 'Tool integrations / capabilities',
    shapes: [
      { d: 'M5 3h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z' },
      { d: 'M16 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z' },
      { d: 'M10 6.5h7.5V14' },
    ],
  },
  /** Workflow: a chain of steps ending in an output ring. */
  workflow: {
    meaning: 'Connected steps and execution',
    shapes: [
      { cx: 4, cy: 12, r: 2, fill: true },
      { cx: 12, cy: 12, r: 2, fill: true },
      { d: 'M6 12h4' },
      { d: 'M14 12h3' },
      { cx: 20, cy: 12, r: 3 },
    ],
  },
  /** Publish: a node on the platform line goes live — upward, out of the mesh. */
  publish: {
    meaning: 'Make an agent available',
    shapes: [{ d: 'M5 20h14' }, { cx: 12, cy: 20, r: 2, fill: true }, { d: 'M12 18V5' }, { d: 'M7 10l5-5 5 5' }],
  },
  /** Version: the current module in front of its previous state. */
  version: {
    meaning: 'Versioned product state',
    shapes: [
      { d: 'M4 8v9a3 3 0 0 0 3 3h9' },
      { d: 'M10.5 4h7A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 8 13.5v-7A2.5 2.5 0 0 1 10.5 4z' },
      { cx: 14, cy: 10, r: 2, fill: true },
    ],
  },
  /** Review: inspecting a node. */
  review: {
    meaning: 'Evaluation / review queue',
    shapes: [{ cx: 10, cy: 10, r: 6 }, { cx: 10, cy: 10, r: 2, fill: true }, { d: 'M14.5 14.5L20 20' }],
  },
  /** Growth: a path rising from a node. */
  growth: {
    meaning: 'Improving adoption and performance',
    shapes: [{ cx: 4, cy: 18, r: 2, fill: true }, { d: 'M4 18l6-6 4 4 7-8' }, { d: 'M16 8h5v5' }],
  },
  /** Success: a verified cell. */
  success: {
    meaning: 'Verified achievement',
    shapes: [{ d: 'M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z' }, { d: 'M8.5 12.5l2.5 2.5 4.5-5' }],
  },
  /** Ideas: a starting node branching into options. */
  ideas: {
    meaning: 'Discovery / starting points',
    shapes: [
      { cx: 12, cy: 19, r: 2, fill: true },
      { d: 'M12 17v-5' },
      { d: 'M12 12L7.5 8.5' },
      { d: 'M12 12l4.5-3.5' },
      { cx: 6, cy: 7, r: 2 },
      { cx: 18, cy: 7, r: 2 },
    ],
  },
  /** Portfolio: the mark shown in a frame. */
  portfolio: {
    meaning: 'Public showcase',
    shapes: [{ d: 'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z' }, { d: 'M7 15l2.5-5.5 2.5 4 2.5-4L17 15' }],
  },
  /** Opportunity: from this node, up and out. */
  opportunity: {
    meaning: 'Actionable growth opportunity',
    shapes: [{ cx: 8, cy: 16, r: 2.5, fill: true }, { d: 'M10 14l9-9' }, { d: 'M13 5h6v6' }],
  },
  /**
   * Toman currency sign (Sprint 2, P2-02). Original MESH glyph: the Persian
   * letter «ت» — the initial of «تومان» — drawn as the script's bowl with the
   * two dots as mesh nodes. Shown beside Persian prices instead of the word
   * «تومان»; never a foreign currency glyph. Non-directional (a letterform —
   * must not mirror). The unit name for assistive tech is supplied by the
   * `<Price>` component, so the icon itself stays decorative.
   */
  toman: {
    meaning: 'Toman currency unit (تومان)',
    shapes: [
      { d: 'M21 6v5c0 5-3.6 7.5-9 7.5S3.5 16 3.5 11.5' },
      { cx: 10, cy: 4.5, r: 2, fill: true },
      { cx: 15, cy: 4.5, r: 2, fill: true },
    ],
  },
  /** Network: three nodes, fully connected. */
  network: {
    meaning: 'Relationships between agents / tools',
    shapes: [
      { d: 'M12 5L5 18' },
      { d: 'M12 5l7 13' },
      { d: 'M5 18h14' },
      { cx: 12, cy: 5, r: 2, fill: true },
      { cx: 5, cy: 18, r: 2, fill: true },
      { cx: 19, cy: 18, r: 2, fill: true },
    ],
  },
} as const satisfies Record<string, MeshIconDef>;

export type MeshIconName = keyof typeof MESH_ICONS;

export const meshIconNames = Object.keys(MESH_ICONS) as MeshIconName[];

export function isMeshIconName(name: string): name is MeshIconName {
  return Object.prototype.hasOwnProperty.call(MESH_ICONS, name);
}

/**
 * MESH icons that mirror in RTL. Deliberately empty: `growth`/`opportunity`
 * rise like a chart (time axis stays LTR in Persian UIs, same as the base
 * `trendingUp`), `workflow` is a diagram, everything else is symmetrical or
 * non-directional. Add a name here only with a documented reason.
 */
export const MESH_DIRECTIONAL: ReadonlySet<MeshIconName> = new Set<MeshIconName>();
