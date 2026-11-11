import { describe, expect, it } from 'vitest';
import { validateCatalog } from '../src/index.js';
import { makeCatalog } from './helpers.js';

const codes = (c: ReturnType<typeof makeCatalog>) => validateCatalog(c).map((d) => `${d.level}:${d.code}`);

describe('validateCatalog', () => {
  it('flags duplicate ids naming both files', () => {
    const c = makeCatalog([{ id: 'a' }, { id: 'a' }]);
    c.services[1]!.file = 'services/a-copy.yaml';
    const d = validateCatalog(c).find((x) => x.code === 'duplicate-id');
    expect(d?.level).toBe('error');
    expect(d?.message).toContain('services/a.yaml');
    expect(d?.message).toContain('services/a-copy.yaml');
  });

  it('flags unknown kind', () => {
    expect(codes(makeCatalog([{ id: 'a', kind: 'mainframe' }]))).toContain('error:unknown-kind');
  });

  it('warns on unresolved target', () => {
    expect(codes(makeCatalog([{ id: 'a', dependsOn: [{ target: 'ghost' }] }]))).toContain('warning:unresolved-target');
  });

  it('warns on missing owner', () => {
    expect(codes(makeCatalog([{ id: 'a', owner: undefined }]))).toContain('warning:missing-owner');
  });

  it('warns on duplicate edge with same target and protocol', () => {
    const c = makeCatalog([{ id: 'a', dependsOn: [{ target: 'b' }, { target: 'b' }] }, { id: 'b' }]);
    expect(codes(c)).toEqual(['warning:duplicate-edge']);
  });

  it('accepts self-dependency and cycles', () => {
    const c = makeCatalog([
      { id: 'a', dependsOn: [{ target: 'a' }, { target: 'b' }] },
      { id: 'b', dependsOn: [{ target: 'a' }] },
    ]);
    expect(validateCatalog(c)).toEqual([]);
  });
});
