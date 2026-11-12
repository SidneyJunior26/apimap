import { describe, expect, it } from 'vitest';
import { buildGraph, diffGraphs, formatDiff } from '../src/index.js';
import { makeCatalog } from './helpers.js';

const now = new Date(0);
const before = buildGraph(makeCatalog([
  { id: 'a', name: 'A', owner: 'x', dependsOn: [{ target: 'b' }, { target: 'c', confidence: 'inferred' }] },
  { id: 'b' },
  { id: 'c' },
  { id: 'gone' },
]), now);
const after = buildGraph(makeCatalog([
  { id: 'a', name: 'A2', owner: 'x', dependsOn: [{ target: 'c', confidence: 'confirmed' }, { target: 'new' }] },
  { id: 'b' },
  { id: 'c' },
  { id: 'new' },
]), now);

describe('diffGraphs', () => {
  const d = diffGraphs(before, after);

  it('lists added, removed and changed services', () => {
    expect(d.addedServices.map((s) => s.id)).toEqual(['new']);
    expect(d.removedServices.map((s) => s.id)).toEqual(['gone']);
    expect(d.changedServices).toEqual([{ id: 'a', fields: ['label'] }]);
  });

  it('lists added, removed and changed links', () => {
    expect(d.addedEdges.map((e) => e.id)).toEqual(['a->new:http']);
    expect(d.removedEdges.map((e) => e.id)).toEqual(['a->b:http']);
    expect(d.changedEdges).toEqual([{ id: 'a->c:http', from: 'inferred', to: 'confirmed' }]);
  });

  it('ignores ghost nodes and generatedAt', () => {
    const later = { ...after, generatedAt: '2030-01-01T00:00:00.000Z' };
    expect(diffGraphs(after, later).changedServices).toEqual([]);
    const withGhost = buildGraph(makeCatalog([{ id: 'a', dependsOn: [{ target: 'ghost' }] }]), now);
    expect(diffGraphs(buildGraph(makeCatalog([{ id: 'a' }]), now), withGhost).addedServices).toEqual([]);
  });
});

describe('formatDiff', () => {
  it('renders markdown with sections', () => {
    const md = formatDiff(diffGraphs(before, after), 'markdown');
    expect(md).toContain('### svclens');
    expect(md).toContain('**+1** services');
    expect(md).toContain('- `new`');
    expect(md).toContain('`a` → `b` (http)');
    expect(md).toContain('inferred → confirmed');
  });

  it('says when nothing changed', () => {
    expect(formatDiff(diffGraphs(after, after), 'text')).toBe('No changes in services or links.');
  });
});
