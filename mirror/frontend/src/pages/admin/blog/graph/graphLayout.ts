import type { GraphEdge, GraphNode } from '../../../../api/seo';

/**
 * Deterministic force-directed layout for the Knowledge Graph (≤ 400 nodes,
 * runs in a few ms). Pure function so it can be unit-tested; seeded by node
 * ids so the same graph always lands in the same picture.
 */

export interface Positioned {
  id: string;
  x: number;
  y: number;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[], iterations = 160): Positioned[] {
  const n = nodes.length;
  if (!n) return [];
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  // Cards in the canvas intentionally have a generous footprint. Give the
  // deterministic layout enough room for readable titles and visible links
  // instead of compressing everything into a low-contrast cluster.
  const radius = 150 + Math.sqrt(n) * 118;
  const pos = nodes.map((node) => {
    const a = hash(node.id) * Math.PI * 2;
    // content nodes start on an inner ring, keyword/category nodes outside — keeps hubs central.
    const r = (node.type === 'post' || node.type === 'agent' ? 0.55 : 1) * radius * (0.6 + hash(node.id + 'r') * 0.4);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0 };
  });
  const links = edges
    .map((e) => [index.get(e.source), index.get(e.target)] as const)
    .filter((pair): pair is readonly [number, number] => pair[0] !== undefined && pair[1] !== undefined && pair[0] !== pair[1]);
  const degree = new Array<number>(n).fill(0);
  for (const [a, b] of links) {
    degree[a] += 1;
    degree[b] += 1;
  }
  const spring = 235;
  for (let it = 0; it < iterations; it += 1) {
    const temp = 1 - it / iterations;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = (hash(`${i}-${j}`) - 0.5) * 2;
          dy = (hash(`${j}-${i}`) - 0.5) * 2;
          d2 = dx * dx + dy * dy;
        }
        const f = (spring * spring) / d2;
        const fx = dx * f * 0.02;
        const fy = dy * f * 0.02;
        pos[i].vx += fx;
        pos[i].vy += fy;
        pos[j].vx -= fx;
        pos[j].vy -= fy;
      }
    }
    for (const [a, b] of links) {
      const dx = pos[b].x - pos[a].x;
      const dy = pos[b].y - pos[a].y;
      const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const f = ((d - spring) / d) * 0.05;
      pos[a].vx += dx * f;
      pos[a].vy += dy * f;
      pos[b].vx -= dx * f;
      pos[b].vy -= dy * f;
    }
    for (let i = 0; i < n; i += 1) {
      // gravity towards the centre, stronger for well-connected nodes
      pos[i].vx -= pos[i].x * 0.002 * (1 + degree[i] * 0.1);
      pos[i].vy -= pos[i].y * 0.002 * (1 + degree[i] * 0.1);
      const speed = Math.sqrt(pos[i].vx ** 2 + pos[i].vy ** 2);
      const max = 30 * temp + 1;
      const k = speed > max ? max / speed : 1;
      pos[i].x += pos[i].vx * k;
      pos[i].y += pos[i].vy * k;
      pos[i].vx *= 0.6;
      pos[i].vy *= 0.6;
    }
  }
  return nodes.map((node, i) => ({ id: node.id, x: Math.round(pos[i].x), y: Math.round(pos[i].y) }));
}
