import { describe, expect, it } from 'vitest';
import { mergeScan, ServiceSchema, type ScannedDependency } from '../src/index.js';

const dep = (target: string, protocol = 'http'): ScannedDependency => ({ target, protocol, confidence: 'confirmed', origin: 'scan', evidence: [{ file: 'appsettings.json', line: 3 }] });
const hints = { tech: ['dotnet8'], hosts: ['orders.acme.internal'] };

describe('mergeScan', () => {
  it('creates a new service from hints', () => {
    const r = mergeScan(undefined, 'orders-api', { ...hints, name: 'Orders API', kind: 'core' }, [dep('payments')]);
    expect(r.service).toMatchObject({ id: 'orders-api', name: 'Orders API', kind: 'core', tech: ['dotnet8'], hosts: ['orders.acme.internal'] });
    expect(r.added).toEqual(['payments:http']);
    expect(r.changed).toBe(true);
  });

  it('defaults name to id and kind to core', () => {
    expect(mergeScan(undefined, 'x', { tech: [], hosts: [] }, []).service).toMatchObject({ name: 'x', kind: 'core' });
  });

  it('only fills empty fields and unions tech/hosts', () => {
    const existing = ServiceSchema.parse({ id: 'o', name: 'Manual Name', kind: 'bff', tech: ['node'], hosts: ['orders.acme.internal'] });
    const r = mergeScan(existing, 'o', { ...hints, name: 'Scanned', kind: 'core', description: 'From OpenAPI' }, []);
    expect(r.service).toMatchObject({ name: 'Manual Name', kind: 'bff', description: 'From OpenAPI', tech: ['node', 'dotnet8'], hosts: ['orders.acme.internal'] });
  });

  it('replaces scan deps and keeps agent/manual ones', () => {
    const existing = ServiceSchema.parse({
      id: 'o', name: 'O', kind: 'core', tech: ['dotnet8'], hosts: ['orders.acme.internal'],
      dependsOn: [
        { target: 'old', origin: 'scan', confidence: 'confirmed' },
        { target: 'kept', origin: 'manual' },
        { target: 'agent-found', origin: 'agent', confidence: 'inferred' },
      ],
    });
    const r = mergeScan(existing, 'o', hints, [dep('payments')]);
    expect(r.service.dependsOn.map((d) => `${d.target}:${d.origin}`)).toEqual(['kept:manual', 'agent-found:agent', 'payments:scan']);
    expect(r.added).toEqual(['payments:http']);
    expect(r.removed).toEqual(['old:http']);
  });

  it('skips scan deps already declared by agent or manual', () => {
    const existing = ServiceSchema.parse({ id: 'o', name: 'O', kind: 'core', dependsOn: [{ target: 'payments', origin: 'manual' }] });
    const r = mergeScan(existing, 'o', { tech: [], hosts: [] }, [dep('payments')]);
    expect(r.service.dependsOn).toHaveLength(1);
    expect(r.added).toEqual([]);
  });

  it('drops self references and duplicate scan deps', () => {
    const r = mergeScan(undefined, 'o', { tech: [], hosts: [] }, [dep('o'), dep('p'), dep('p')]);
    expect(r.service.dependsOn.map((d) => d.target)).toEqual(['p']);
  });

  it('reports no change on identical rescan', () => {
    const first = mergeScan(undefined, 'o', hints, [dep('p')]).service;
    const second = mergeScan(first, 'o', hints, [dep('p')]);
    expect(second.changed).toBe(false);
    expect(second.added).toEqual([]);
    expect(second.removed).toEqual([]);
  });

  it('leaves locked services untouched', () => {
    const existing = ServiceSchema.parse({ id: 'o', name: 'O', kind: 'core', locked: true });
    const r = mergeScan(existing, 'o', hints, [dep('p')]);
    expect(r).toEqual({ service: existing, added: [], removed: [], changed: false });
  });
});
