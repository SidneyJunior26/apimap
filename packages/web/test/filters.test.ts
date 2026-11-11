import { describe, expect, it } from 'vitest';
import { applyFilters, countByKind, initialFilters, normalize } from '../src/filters.js';
import { edge, graph, node } from './fixture.js';

const g = graph(
  [
    node('autorizacao-core', { label: 'Autorização Core', owner: 'team-identity', tags: ['pii'], hosts: ['authz.acme.internal'] }),
    node('paygate', { label: 'Paygate', kind: 'external', group: 'partners' }),
    node('orders-api', { label: 'Orders API', group: 'commerce' }),
  ],
  [edge('orders-api', 'paygate'), edge('orders-api', 'autorizacao-core', { id: 'x', confidence: 'inferred' })],
);

describe('normalize', () => {
  it('lowercases and strips diacritics', () => {
    expect(normalize('Autorização Ção')).toBe('autorizacao cao');
  });
});

describe('applyFilters', () => {
  it('shows everything by default', () => {
    const r = applyFilters(g, initialFilters(g));
    expect(r.nodeIds.size).toBe(3);
    expect(r.edgeIds.size).toBe(2);
  });

  it('search is accent and case insensitive', () => {
    const r = applyFilters(g, { ...initialFilters(g), query: 'AUTORIZACAO' });
    expect([...r.nodeIds]).toEqual(['autorizacao-core']);
  });

  it('search matches id, owner, tags and hosts', () => {
    for (const q of ['autorizacao-core', 'team-identity', 'pii', 'authz.acme']) {
      expect([...applyFilters(g, { ...initialFilters(g), query: q }).nodeIds]).toEqual(['autorizacao-core']);
    }
  });

  it('kind filter hides nodes and their edges', () => {
    const f = initialFilters(g);
    f.kinds.delete('external');
    const r = applyFilters(g, f);
    expect(r.nodeIds.has('paygate')).toBe(false);
    expect(r.edgeIds.has('orders-api->paygate:http')).toBe(false);
    expect(r.edgeIds.has('x')).toBe(true);
  });

  it('group filter treats missing group as "ungrouped"', () => {
    const f = initialFilters(g);
    f.groups.delete('ungrouped');
    expect(applyFilters(g, f).nodeIds.has('autorizacao-core')).toBe(false);
  });

  it('confidence filter hides only edges', () => {
    const f = initialFilters(g);
    f.confidences.delete('inferred');
    const r = applyFilters(g, f);
    expect(r.nodeIds.size).toBe(3);
    expect([...r.edgeIds]).toEqual(['orders-api->paygate:http']);
  });

  it('empty graph yields empty sets', () => {
    const e = graph([]);
    const r = applyFilters(e, initialFilters(e));
    expect(r.nodeIds.size).toBe(0);
    expect(r.edgeIds.size).toBe(0);
  });
});

describe('countByKind', () => {
  it('counts nodes per kind', () => {
    expect(countByKind(g)).toEqual({ core: 2, external: 1 });
  });
});
