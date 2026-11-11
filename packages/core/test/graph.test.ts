import { describe, expect, it } from 'vitest';
import { buildGraph } from '../src/index.js';
import { makeCatalog } from './helpers.js';

const now = new Date('2026-01-02T03:04:05.000Z');

describe('buildGraph', () => {
  it('turns unresolved targets into ghost external nodes', () => {
    const g = buildGraph(makeCatalog([{ id: 'a', dependsOn: [{ target: 'paygate' }] }]), now);
    const ghost = g.nodes.find((n) => n.id === 'paygate');
    expect(ghost).toMatchObject({ ghost: true, kind: 'external', label: 'paygate', inDegree: 1 });
  });

  it('collapses duplicate edges', () => {
    const g = buildGraph(makeCatalog([{ id: 'a', dependsOn: [{ target: 'b' }, { target: 'b' }] }, { id: 'b' }]), now);
    expect(g.edges.map((e) => e.id)).toEqual(['a->b:http']);
  });

  it('keeps edges with different protocols', () => {
    const g = buildGraph(makeCatalog([{ id: 'a', dependsOn: [{ target: 'b' }, { target: 'b', protocol: 'ws' }] }, { id: 'b' }]), now);
    expect(g.edges).toHaveLength(2);
  });

  it('counts degrees', () => {
    const g = buildGraph(makeCatalog([{ id: 'a', dependsOn: [{ target: 'b' }] }, { id: 'b' }, { id: 'c', dependsOn: [{ target: 'b' }] }]), now);
    const b = g.nodes.find((n) => n.id === 'b')!;
    expect(b.inDegree).toBe(2);
    expect(b.outDegree).toBe(0);
  });

  it('handles cycles and self-loops', () => {
    const g = buildGraph(makeCatalog([
      { id: 'a', dependsOn: [{ target: 'a' }, { target: 'b' }] },
      { id: 'b', dependsOn: [{ target: 'a' }] },
    ]), now);
    expect(g.edges).toHaveLength(3);
  });

  it('is deterministic and stamps generatedAt', () => {
    const c = makeCatalog([{ id: 'z', dependsOn: [{ target: 'a' }] }, { id: 'a' }]);
    const g = buildGraph(c, now);
    expect(g.version).toBe(1);
    expect(g.name).toBe('Test');
    expect(g.generatedAt).toBe('2026-01-02T03:04:05.000Z');
    expect(g.nodes.map((n) => n.id)).toEqual(['a', 'z']);
    expect(buildGraph(c, now)).toEqual(g);
  });

  it('flags locked services only', () => {
    const g = buildGraph(makeCatalog([{ id: 'a', locked: true }, { id: 'b' }]), now);
    expect(g.nodes[0]!.locked).toBe(true);
    expect('locked' in g.nodes[1]!).toBe(false);
  });

  it('maps service fields onto nodes', () => {
    const g = buildGraph(makeCatalog([{ id: 'a', name: 'Autorização Core', group: 'identity', tags: ['pii'] }]), now);
    expect(g.nodes[0]).toMatchObject({ id: 'a', label: 'Autorização Core', group: 'identity', tags: ['pii'], ghost: false, file: 'services/a.yaml' });
  });
});

describe('buildGraph edit target', () => {
  it('includes the edit target only when given', () => {
    const c = makeCatalog([{ id: 'a' }]);
    expect('edit' in buildGraph(c, now)).toBe(false);
    expect(buildGraph(c, now, { edit: { provider: 'github', repo: 'acme/catalog', branch: 'main', path: 'map' } }).edit).toEqual({ provider: 'github', repo: 'acme/catalog', branch: 'main', path: 'map' });
  });
});
