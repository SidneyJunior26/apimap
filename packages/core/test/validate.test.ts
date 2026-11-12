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

describe('client applications', () => {
  it('warns when a client app depends directly on a database or log backend', () => {
    const svc = (id: string, role: 'client' | 'server', protocol: string) =>
      ({ id, name: id, kind: 'web', role, owner: 'o', file: `${id}.yaml`, dependsOn: [{ target: 'db', protocol, confidence: 'confirmed', origin: 'scan', evidence: [] }] }) as any;
    const kinds = { web: {}, database: {} } as any;
    const db = { id: 'db', name: 'db', kind: 'database', owner: 'o', file: 'db.yaml', dependsOn: [] } as any;
    const out = validateCatalog({ services: [svc('spa', 'client', 'sql'), svc('api', 'server', 'sql'), svc('spa2', 'client', 'http'), db], kinds } as any);
    expect(out.filter((d) => d.code === 'client-direct-access').map((d) => d.file)).toEqual(['spa.yaml']);
  });
});
