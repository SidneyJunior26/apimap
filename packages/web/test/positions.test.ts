import { describe, expect, it } from 'vitest';
import { toGraphology } from '../src/graph/layout.js';
import { edge, graph, node } from './fixture.js';

describe('toGraphology with previous positions', () => {
  it('keeps known positions and seeds new nodes near their neighbors', () => {
    const g = graph([node('a'), node('b'), node('c')], [edge('c', 'a'), edge('c', 'b')]);
    const prev = new Map([['a', { x: 100, y: 0 }], ['b', { x: 300, y: 0 }]]);
    const out = toGraphology(g, prev);
    expect(out.getNodeAttributes('a')).toMatchObject({ x: 100, y: 0 });
    expect(out.getNodeAttributes('b')).toMatchObject({ x: 300, y: 0 });
    const c = out.getNodeAttributes('c');
    expect(Math.hypot(c.x - 200, c.y)).toBeLessThan(60);
  });
});

describe('syncGraphology', () => {
  it('updates the graph in place, keeping positions and dropping removed nodes', async () => {
    const { syncGraphology } = await import('../src/graph/layout.js');
    const g = toGraphology(graph([node('a'), node('b')], [edge('a', 'b')]));
    g.mergeNodeAttributes('a', { x: 5, y: 7 });
    syncGraphology(g, graph([node('a', { label: 'Renamed' }), node('c')], [edge('c', 'a')]));
    expect(g.nodes().sort()).toEqual(['a', 'c']);
    expect(g.getNodeAttributes('a')).toMatchObject({ x: 5, y: 7, label: 'Renamed' });
    expect(g.edges()).toEqual(['c->a:http']);
  });
});
