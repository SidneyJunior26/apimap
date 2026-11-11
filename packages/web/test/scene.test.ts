import { describe, expect, it } from 'vitest';
import { applyFilters, initialFilters } from '../src/filters.js';
import { toForceData } from '../src/graph3d/scene.js';
import { edge, graph, node } from './fixture.js';

const g = {
  ...graph(
    [node('a', { inDegree: 0, outDegree: 2 }), node('b', { kind: 'external', inDegree: 1 }), node('c', { inDegree: 1 }), node('g', { ghost: true })],
    [edge('a', 'b'), edge('a', 'c', { id: 'x', confidence: 'inferred' })],
  ),
  kinds: { core: { label: 'Core', color: '#34d399' }, external: { label: 'Ext', color: '#facc15' } },
};

describe('toForceData', () => {
  it('keeps only visible nodes and links', () => {
    const f = initialFilters(g);
    f.kinds.delete('external');
    const data = toForceData(g, applyFilters(g, f), { animate: true });
    expect(data.nodes.map((n) => n.id).sort()).toEqual(['a', 'c', 'g']);
    expect(data.links.map((l) => l.id)).toEqual(['x']);
  });

  it('sizes by degree and colors by kind, ghosts grey', () => {
    const data = toForceData(g, applyFilters(g, initialFilters(g)), { animate: true });
    const byId = Object.fromEntries(data.nodes.map((n) => [n.id, n]));
    expect(byId.a!.val).toBeGreaterThan(byId.c!.val);
    expect(byId.b!.color).toBe('#facc15');
    expect(byId.g!.color).not.toBe('#34d399');
  });

  it('uses more particles on confirmed links and none without motion', () => {
    const moving = toForceData(g, applyFilters(g, initialFilters(g)), { animate: true });
    expect(moving.links.find((l) => l.id === 'a->b:http')!.particles).toBe(2);
    expect(moving.links.find((l) => l.id === 'x')!.particles).toBe(1);
    const still = toForceData(g, applyFilters(g, initialFilters(g)), { animate: false });
    expect(still.links.every((l) => l.particles === 0)).toBe(true);
  });
});
