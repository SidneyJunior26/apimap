import { describe, expect, it } from 'vitest';
import { buildGraph, toMermaid } from '../src/index.js';
import { makeCatalog } from './helpers.js';

const now = new Date(0);
const g = buildGraph(
  makeCatalog([
    { id: 'orders-api', name: 'Orders "API" [v2]', group: 'commerce', dependsOn: [{ target: 'orders-db', protocol: 'sql', confidence: 'confirmed' }, { target: 'paygate', confidence: 'inferred' }, { target: 'legacy', origin: 'manual' }] },
    { id: 'orders-db', name: 'Orders DB', kind: 'database', group: 'commerce' },
    { id: 'paygate', name: 'Paygate', kind: 'external' },
    { id: 'legacy', name: 'Relatórios Legado', kind: 'legacy' },
  ]),
  now,
);

describe('toMermaid', () => {
  const text = toMermaid(g);

  it('starts with a flowchart header', () => {
    expect(text.split('\n')[0]).toBe('flowchart LR');
    expect(toMermaid(g, { direction: 'TB' }).split('\n')[0]).toBe('flowchart TB');
  });

  it('uses safe ids and escaped labels', () => {
    expect(text).toContain('orders_api["Orders #quot;API#quot; #91;v2#93;"]');
    expect(text).toContain('legacy["Relatórios Legado"]');
  });

  it('shapes nodes by kind', () => {
    expect(text).toContain('orders_db[("Orders DB")]');
    expect(text).toContain('paygate(["Paygate"])');
  });

  it('styles edges by confidence and labels non-http protocols', () => {
    expect(text).toContain('orders_api -->|sql| orders_db');
    expect(text).toContain('orders_api -.-> paygate');
    expect(text).toContain('orders_api ==> legacy');
  });

  it('groups nodes in subgraphs and adds kind classes', () => {
    expect(text).toMatch(/subgraph g_commerce\["commerce"\]\n\s+orders_api/);
    expect(text).toContain('classDef k_database fill:');
    expect(text).toContain('class orders_db k_database');
  });

  it('avoids id collisions after sanitizing', () => {
    const c = buildGraph(makeCatalog([{ id: 'a-b', dependsOn: [{ target: 'a.b' }, { target: 'end' }] }]), now);
    const ids = [...toMermaid(c).matchAll(/^\s+(\w+)[[(]/gm)].map((m) => m[1]);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toContain('end_');
  });
});
