import { describe, expect, it } from 'vitest';
import { neighbors } from '../src/graph/traversal.js';
import { edge, graph, node } from './fixture.js';

const chain = graph([node('a'), node('b'), node('c')], [edge('a', 'b'), edge('b', 'c')]);
const sorted = (s: Set<string>) => [...s].sort();

describe('neighbors', () => {
  it('walks downstream by depth', () => {
    expect(sorted(neighbors(chain, 'a', 'down', 1))).toEqual(['a', 'b']);
    expect(sorted(neighbors(chain, 'a', 'down', 2))).toEqual(['a', 'b', 'c']);
  });

  it('walks upstream', () => {
    expect(sorted(neighbors(chain, 'c', 'up', 2))).toEqual(['a', 'b', 'c']);
    expect(sorted(neighbors(chain, 'c', 'down', 3))).toEqual(['c']);
  });

  it('walks both directions', () => {
    expect(sorted(neighbors(chain, 'b', 'both', 1))).toEqual(['a', 'b', 'c']);
  });

  it('terminates on cycles and self-loops', () => {
    const g = graph([node('a'), node('b')], [edge('a', 'b'), edge('b', 'a'), edge('a', 'a', { id: 'self' })]);
    expect(sorted(neighbors(g, 'a', 'both', 5))).toEqual(['a', 'b']);
  });

  it('respects a restricted edge set', () => {
    expect(sorted(neighbors(chain, 'a', 'down', 2, new Set(['a->b:http'])))).toEqual(['a', 'b']);
  });
});
