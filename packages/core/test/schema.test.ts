import { describe, expect, it } from 'vitest';
import { DEFAULT_KINDS, DependencySchema, ServiceSchema } from '../src/index.js';

describe('ServiceSchema', () => {
  it('parses minimal service', () => {
    const s = ServiceSchema.parse({ id: 'a', name: 'A', kind: 'core' });
    expect(s.dependsOn).toEqual([]);
    expect(s.locked).toBe(false);
    expect(s.tech).toEqual([]);
    expect(s.hosts).toEqual([]);
    expect(s.tags).toEqual([]);
  });

  it('rejects invalid id', () => {
    expect(ServiceSchema.safeParse({ id: 'Payments Core', name: 'x', kind: 'core' }).success).toBe(false);
    expect(ServiceSchema.safeParse({ id: '-x', name: 'x', kind: 'core' }).success).toBe(false);
  });

  it('keeps unknown keys for forward compatibility', () => {
    const s = ServiceSchema.parse({ id: 'a', name: 'A', kind: 'core', future: 1 }) as Record<string, unknown>;
    expect(s.future).toBe(1);
  });
});

describe('DependencySchema', () => {
  it('applies dependency defaults', () => {
    const d = DependencySchema.parse({ target: 'b' });
    expect(d).toMatchObject({ protocol: 'http', confidence: 'manual', origin: 'manual', evidence: [] });
  });

  it('rejects unknown confidence', () => {
    expect(DependencySchema.safeParse({ target: 'b', confidence: 'maybe' }).success).toBe(false);
  });
});

describe('DEFAULT_KINDS', () => {
  it('has 14 kinds with unique colors', () => {
    const ids = ['bff', 'core', 'web', 'worker', 'webservice', 'websocket', 'grpc', 'graphql', 'queue', 'database', 'ftp', 'logs', 'external', 'legacy'];
    expect(Object.keys(DEFAULT_KINDS).sort()).toEqual([...ids].sort());
    const colors = Object.values(DEFAULT_KINDS).map((k) => k.color.toLowerCase());
    expect(new Set(colors).size).toBe(14);
  });
});
