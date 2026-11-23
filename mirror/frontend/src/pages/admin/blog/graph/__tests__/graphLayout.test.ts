import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode } from '../../../../../api/seo';
import { layoutGraph } from '../graphLayout';

const node = (id: string, type: GraphNode['type'] = 'post'): GraphNode => ({
  id: `${type}:${id}`,
  type,
  refId: id,
  label: id,
  slug: id,
  path: `/blog/${id}`,
  language: 'fa',
  status: 'published',
  published: true,
  categoryId: null,
  inbound: 0,
  outbound: 0,
  issues: { orphan: false, brokenOut: 0, noOutbound: false },
});
const edge = (s: string, t: string): GraphEdge => ({
  id: `${s}>${t}`,
  source: s,
  target: t,
  type: 'link',
  anchor: null,
  status: 'ok',
  position: 0,
  language: 'fa',
  suggestionId: null,
  reason: null,
  score: null,
  linkId: null,
});

describe('layoutGraph', () => {
  it('is deterministic and finite', () => {
    const nodes = ['a', 'b', 'c', 'd'].map((id) => node(id));
    const edges = [edge('post:a', 'post:b'), edge('post:b', 'post:c')];
    const first = layoutGraph(nodes, edges);
    const second = layoutGraph(nodes, edges);
    expect(first).toEqual(second);
    for (const p of first) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    expect(new Set(first.map((p) => `${p.x},${p.y}`)).size).toBe(4);
  });

  it('places linked nodes closer than unlinked ones', () => {
    const nodes = ['a', 'b', 'c'].map((id) => node(id));
    const pos = layoutGraph(nodes, [edge('post:a', 'post:b')]);
    const d = (i: number, j: number) => Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y);
    expect(d(0, 1)).toBeLessThan(d(0, 2));
  });

  it('handles empty input and ignores edges to unknown nodes', () => {
    expect(layoutGraph([], [])).toEqual([]);
    expect(layoutGraph([node('a')], [edge('post:a', 'post:zzz')])).toHaveLength(1);
  });
});
