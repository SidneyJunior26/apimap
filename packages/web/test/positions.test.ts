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
