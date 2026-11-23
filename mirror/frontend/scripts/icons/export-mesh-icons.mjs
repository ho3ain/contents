#!/usr/bin/env node
/**
 * Exports the custom MESH icon family from the typed registry
 * (`src/components/ui/icons/mesh.ts`) to:
 *   - src/assets/icons/mesh/<name>.svg   optimised standalone SVGs (currentColor)
 *   - docs/icon-system/mesh-icon-specimen.svg  the family at 16/20/24 px, light & dark
 *   - public/favicon.svg                 the brand mark on its ink tile
 *
 * The registry is the source of truth; `icons.test.tsx` fails when these
 * files drift. Run: `node scripts/icons/export-mesh-icons.mjs`
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const registryPath = resolve(root, 'src/components/ui/icons/mesh.ts');

/** Parse the registry without a TS toolchain: evaluate the object literal. */
export function loadRegistry(source = readFileSync(registryPath, 'utf8')) {
  const start = source.indexOf('export const MESH_ICONS = {');
  const end = source.indexOf('} as const satisfies', start);
  const literal = source.slice(start + 'export const MESH_ICONS = '.length, end + 1);
  // Strip comments; the literal is plain JSON-ish JS (keys unquoted).
  const js = literal.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  return new Function(`return (${js});`)();
}

const num = (n) => (Number.isInteger(n) ? String(n) : String(+n.toFixed(2)));

export function shapeToSvg(shape) {
  if ('d' in shape) return `<path d="${shape.d}"/>`;
  const c = `cx="${num(shape.cx)}" cy="${num(shape.cy)}" r="${num(shape.r)}"`;
  return shape.fill ? `<circle ${c} fill="currentColor" stroke="none"/>` : `<circle ${c}/>`;
}

export function iconSvg(name, def, { size = 24, strokeWidth = 2 } = {}) {
  const body = def.shapes.map(shapeToSvg).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" data-icon="${name}">${body}</svg>\n`;
}

export function faviconSvg(def) {
  // Ink tile + acid glyph: the existing brand colours (unchanged).
  const body = def.shapes.map(shapeToSvg).join('').replaceAll('currentColor', '#D6FA65');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" fill="#101722"/>
  <g transform="translate(4 4)" fill="none" stroke="#D6FA65" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${body}</g>
</svg>
`;
}

export function specimenSvg(registry) {
  const names = Object.keys(registry);
  const sizes = [24, 20, 16];
  const cell = 64;
  const cols = names.length;
  const rowH = 56;
  const pad = 24;
  const width = pad * 2 + cols * cell;
  const panels = [
    { bg: '#ffffff', fg: '#101722', label: 'light' },
    { bg: '#0f141c', fg: '#e8ecf3', label: 'dark' },
  ];
  const panelH = pad + sizes.length * rowH + 28;
  let y = 0;
  let out = '';
  for (const panel of panels) {
    out += `<rect x="0" y="${y}" width="${width}" height="${panelH}" fill="${panel.bg}"/>`;
    out += `<text x="${pad}" y="${y + 18}" font-family="ui-monospace, monospace" font-size="11" fill="${panel.fg}" opacity="0.6">MESH custom family — ${panel.label} — rows: 24 / 20 / 16 px — stroke 2</text>`;
    sizes.forEach((size, row) => {
      names.forEach((name, col) => {
        const x = pad + col * cell + (cell - size) / 2;
        const yy = y + 28 + row * rowH + (rowH - size) / 2 - 6;
        // Explicit colours: the specimen must render in viewers that ignore `currentColor`.
        const body = registry[name].shapes.map(shapeToSvg).join('').replaceAll('currentColor', panel.fg);
        out += `<g transform="translate(${x} ${yy}) scale(${size / 24})" fill="none" stroke="${panel.fg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</g>`;
        if (row === sizes.length - 1) {
          out += `<text x="${pad + col * cell + cell / 2}" y="${y + 28 + sizes.length * rowH - 2}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="8" fill="${panel.fg}" opacity="0.7">${name}</text>`;
        }
      });
    });
    y += panelH;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${y}" width="${width}" height="${y}">${out}</svg>\n`;
}

export function exportAll(registry = loadRegistry()) {
  const dir = resolve(root, 'src/assets/icons/mesh');
  mkdirSync(dir, { recursive: true });
  const files = {};
  for (const [name, def] of Object.entries(registry)) {
    files[`src/assets/icons/mesh/${name}.svg`] = iconSvg(name, def);
  }
  files['docs/icon-system/mesh-icon-specimen.svg'] = specimenSvg(registry);
  files['public/favicon.svg'] = faviconSvg(registry.mark);
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = exportAll();
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(resolve(root, rel)), { recursive: true });
    writeFileSync(resolve(root, rel), content);
  }
  console.log(`[icons] wrote ${Object.keys(files).length} files`);
}
