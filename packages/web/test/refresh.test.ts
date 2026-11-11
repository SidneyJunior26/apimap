import { describe, expect, it } from 'vitest';
import { initialFilters, refreshFilters } from '../src/filters.js';
import { graph, node } from './fixture.js';

describe('refreshFilters', () => {
  it('keeps user choices and shows kinds and groups that are new', () => {
    const before = graph([node('a', { kind: 'core' }), node('b', { kind: 'external' })]);
    const f = initialFilters(before);
    f.kinds.delete('external');
    const after = graph([node('a', { kind: 'core' }), node('b', { kind: 'external' }), node('c', { kind: 'queue', group: 'new' })]);
    const next = refreshFilters(before, after, f);
    expect([...next.kinds].sort()).toEqual(['core', 'queue']);
    expect(next.groups.has('new')).toBe(true);
  });
});
