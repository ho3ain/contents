/** Types for the MESH icon exporter (consumed by the vitest drift test). */
export type ExportedShape = { d: string } | { cx: number; cy: number; r: number; fill?: boolean };
export interface ExportedIconDef {
  meaning: string;
  shapes: ExportedShape[];
}
export type ExportedRegistry = Record<string, ExportedIconDef>;
export function loadRegistry(source?: string): ExportedRegistry;
export function shapeToSvg(shape: ExportedShape): string;
export function iconSvg(name: string, def: ExportedIconDef, options?: { size?: number; strokeWidth?: number }): string;
export function faviconSvg(def: ExportedIconDef): string;
export function specimenSvg(registry: ExportedRegistry): string;
/** Relative repo path → file content for every generated artefact. */
export function exportAll(registry?: ExportedRegistry): Record<string, string>;
