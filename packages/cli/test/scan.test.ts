import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { runLink, runScan } from '../src/index.js';

const REPOS = fileURLToPath(new URL('../../scanners/test/fixtures/repos', import.meta.url));

async function catalog(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'apimap-scan-'));
  for (const [rel, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), text);
  }
  return dir;
}

const seed = () =>
  catalog({
    'apimap.config.yaml': `sources:\n  - ${REPOS}/*\n`,
    'services/catalog.yaml': [
      'id: catalog-api',
      'name: Catalog',
      'kind: core',
      'owner: team-catalog',
      'hosts: [catalog.acme.internal]',
      'dependsOn:',
      '  # contract agreed with search team',
      '  - target: search',
      '    origin: manual',
      '',
    ].join('\n'),
    'services/payments.yaml': 'id: payments-api\nname: Payments\nkind: core\nowner: t\nhosts: [payments.acme.internal]\n',
    'services/inventory.yaml': 'id: inventory-api\nname: Inventory\nkind: core\nowner: t\nlocked: true\nhosts: [inventory.acme.internal]\n',
  });

const read = async (dir: string, rel: string) => parse(await readFile(path.join(dir, rel), 'utf8')) as Record<string, any>;
const targets = (svc: Record<string, any>) => (svc.dependsOn ?? []).map((d: any) => `${d.target}:${d.protocol ?? 'http'}:${d.origin}`).sort();

let out: string[];
beforeEach(() => {
  out = [];
  vi.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...a) => void out.push(a.join(' ')));
});

describe('runScan', () => {
  it('creates and updates services from scanned repos', async () => {
    const dir = await seed();
    const lockedBefore = await readFile(path.join(dir, 'services/inventory.yaml'), 'utf8');
    expect(await runScan(dir, {})).toBe(0);

    const orders = await read(dir, 'services/orders-api.yaml');
    expect(orders).toMatchObject({ id: 'orders-api', kind: 'core' });
    expect(targets(orders)).toEqual(['inventory-api:http:scan', 'payments-api:http:scan']);

    const bff = await read(dir, 'services/storefront-bff.yaml');
    expect(bff).toMatchObject({ kind: 'bff', name: 'storefront-bff' });
    expect(targets(bff)).toEqual(['catalog-api:http:scan']);

    const catalogText = await readFile(path.join(dir, 'services/catalog.yaml'), 'utf8');
    expect(catalogText).toContain('# contract agreed with search team');
    expect(parse(catalogText)).toMatchObject({ name: 'Catalog', description: 'Products and categories.' });

    const gateway = await read(dir, 'services/partner-gateway.yaml');
    expect(gateway).toMatchObject({ name: 'Partner Gateway', owner: 'team-partners' });
    expect(targets(gateway)).toEqual(['catalog-api:http:scan', 'orders-api:http:scan']);
    expect(gateway.dependsOn.find((d: any) => d.target === 'orders-api').confidence).toBe('manual');

    expect(await readFile(path.join(dir, 'services/inventory.yaml'), 'utf8')).toBe(lockedBefore);
    expect(out.join('\n')).toContain('mq.acme.internal');
  });

  it('is idempotent', async () => {
    const dir = await seed();
    await runScan(dir, {});
    const files = await readdir(path.join(dir, 'services'));
    const before = await Promise.all(files.map(async (f) => (await stat(path.join(dir, 'services', f))).mtimeMs));
    await new Promise((r) => setTimeout(r, 20));
    expect(await runScan(dir, {})).toBe(0);
    const after = await Promise.all(files.map(async (f) => (await stat(path.join(dir, 'services', f))).mtimeMs));
    expect(after).toEqual(before);
    expect(await readdir(path.join(dir, 'services'))).toEqual(files);
  });

  it('writes nothing with --dry-run', async () => {
    const dir = await seed();
    expect(await runScan(dir, { dryRun: true })).toBe(0);
    expect((await readdir(path.join(dir, 'services'))).sort()).toEqual(['catalog.yaml', 'inventory.yaml', 'payments.yaml']);
  });

  it('creates external stubs for unresolved hosts with --create-stubs', async () => {
    const dir = await seed();
    expect(await runScan(dir, { createStubs: true, source: [`${REPOS}/orders-api`] })).toBe(0);
    expect(await read(dir, 'services/mq-acme-internal.yaml')).toMatchObject({ kind: 'external', hosts: ['mq.acme.internal'] });
    expect(targets(await read(dir, 'services/orders-api.yaml'))).toContain('mq-acme-internal:amqp:scan');
  });

  it('fails without sources', async () => {
    const dir = await catalog({});
    expect(await runScan(dir, {})).toBe(1);
    expect(out.join('\n')).toContain('no sources');
  });

  it('never writes secrets', async () => {
    const dir = await seed();
    await runScan(dir, { createStubs: true });
    for (const f of await readdir(path.join(dir, 'services'))) {
      const text = await readFile(path.join(dir, 'services', f), 'utf8');
      for (const secret of ['p4ss', 'Sup3rS3cret', 'guest:guest', 'secret-host']) expect(text).not.toContain(secret);
    }
  });
});

describe('runLink', () => {
  it('adds a dependency and keeps comments', async () => {
    const dir = await seed();
    const code = await runLink(dir, 'catalog-api', 'payments-api', { evidence: ['src/Pay.cs:12'], note: 'price check' });
    expect(code).toBe(0);
    const text = await readFile(path.join(dir, 'services/catalog.yaml'), 'utf8');
    expect(text).toContain('# contract agreed with search team');
    const dep = (parse(text) as any).dependsOn.find((d: any) => d.target === 'payments-api');
    expect(dep).toEqual({ target: 'payments-api', confidence: 'inferred', origin: 'agent', evidence: [{ file: 'src/Pay.cs', line: 12 }], note: 'price check' });
  });

  it('updates an existing entry in place', async () => {
    const dir = await seed();
    await runLink(dir, 'catalog-api', 'search', { confidence: 'confirmed', origin: 'manual' });
    const deps = (await read(dir, 'services/catalog.yaml')).dependsOn;
    expect(deps).toHaveLength(1);
    expect(deps[0]).toMatchObject({ target: 'search', confidence: 'confirmed' });
  });

  it('fails for unknown or locked services', async () => {
    const dir = await seed();
    expect(await runLink(dir, 'nope', 'x', {})).toBe(1);
    expect(await runLink(dir, 'inventory-api', 'x', {})).toBe(1);
  });
});
