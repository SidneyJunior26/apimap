import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { runLink, runScan } from '../src/index.js';

const REPOS = fileURLToPath(new URL('../../scanners/test/fixtures/repos', import.meta.url));

async function catalog(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'svclens-scan-'));
  for (const [rel, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), text);
  }
  return dir;
}

const seed = () =>
  catalog({
    'svclens.config.yaml': `sources:\n  - ${REPOS}/*\n`,
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

  it('never stubs hosts from internal domains', async () => {
    const dir = await seed();
    await writeFile(path.join(dir, 'svclens.config.yaml'), `sources:\n  - ${REPOS}/*\nscan:\n  internalDomains: [acme.internal, '*.corp.example']\n`);
    expect(await runScan(dir, { createStubs: true, source: [`${REPOS}/orders-api`] })).toBe(0);
    const files = await readdir(path.join(dir, 'services'));
    expect(files.filter((f) => f.includes('acme-internal'))).toEqual([]);
    expect(out.join('\n')).toMatch(/internal hosts without an owner[\s\S]*mq\.acme\.internal/);
  });

  it('accepts internal domains from the command line', async () => {
    const dir = await seed();
    expect(await runScan(dir, { createStubs: true, internalDomain: ['acme.internal'], source: [`${REPOS}/orders-api`] })).toBe(0);
    expect((await readdir(path.join(dir, 'services'))).filter((f) => f.includes('acme-internal'))).toEqual([]);
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

const LEGACY_SOURCES = ['legacy-webforms', 'modern-logging', 'mono-repo'].map((r) => `${REPOS}/${r}`);
const SECRETS = [
  'Sup3rS3cret', '0racleS3cret', 'Pr0dS3cret', 'k3y-should-never-leak', 'smtp-pass-leak', 'm41l-leak', 'billing_app', 'pgS3cret',
  'r3d1sS3cret', 'm0ng0S3cret', 'appuser', 'seq-key-leak', 'jwt-secret-leak', 'pr0dPgS3cret', 'pw0rdLeak', 'secret-host', 'real-env-leak',
];

async function allText(dir: string): Promise<string> {
  const parts: string[] = [];
  for (const f of await readdir(path.join(dir, 'services'))) parts.push(await readFile(path.join(dir, 'services', f), 'utf8'));
  return parts.join('\n');
}

describe('runScan with legacy configs and monorepos', () => {
  it('splits a monorepo into one service per application project', async () => {
    const dir = await catalog({ 'svclens.config.yaml': 'sources: []\n' });
    expect(await runScan(dir, { source: LEGACY_SOURCES, createStubs: true })).toBe(0);
    const files = await readdir(path.join(dir, 'services'));
    expect(files).toEqual(expect.arrayContaining(['mono-repo-orders.yaml', 'mono-repo-billing.yaml', 'mono-repo-web.yaml']));
    expect(files).not.toContain('mono-repo.yaml');
    expect(files.some((f) => f.includes('shared'))).toBe(false);
    const orders = await read(dir, 'services/mono-repo-orders.yaml');
    expect(orders.dependsOn[0].evidence[0]).toEqual({ file: 'src/orders/appsettings.json', line: 1, key: 'ConnectionStrings:Orders' });
    expect(out.join('\n')).toContain('3 repositories (5 services)');
  });

  it('creates one node per host, typed by protocol, with provider, key and environment', async () => {
    const dir = await catalog({ 'svclens.config.yaml': 'sources: []\n' });
    await runScan(dir, { source: LEGACY_SOURCES, createStubs: true });
    expect(await read(dir, 'services/billing-db-acme-internal.yaml')).toMatchObject({ kind: 'database', hosts: ['billing-db.acme.internal'] });
    expect(await read(dir, 'services/logs-acme-internal.yaml')).toMatchObject({ kind: 'logs' });
    expect(await read(dir, 'services/seq-acme-internal.yaml')).toMatchObject({ kind: 'logs' });
    expect(await read(dir, 'services/payments-acme-internal.yaml')).toMatchObject({ kind: 'external' });
    const web = await read(dir, 'services/legacy-webforms.yaml');
    const billing = web.dependsOn.find((d: any) => d.target === 'billing-db-acme-internal');
    expect(billing).toMatchObject({ protocol: 'sql', origin: 'scan', note: 'SQL Server', evidence: [{ file: 'Web.config', key: 'connectionStrings.Billing' }] });
    const prod = web.dependsOn.find((d: any) => d.target === 'billing-db-prod-acme-internal');
    expect(prod.evidence[0]).toMatchObject({ file: 'Web.Release.config', env: 'Release' });
  });

  it('is idempotent: a second scan changes nothing and adds no nodes', async () => {
    const dir = await catalog({ 'svclens.config.yaml': 'sources: []\n' });
    const opts = { source: LEGACY_SOURCES, createStubs: true };
    await runScan(dir, opts);
    const files = await readdir(path.join(dir, 'services'));
    const before = await Promise.all(files.map(async (f) => (await stat(path.join(dir, 'services', f))).mtimeMs));
    await new Promise((r) => setTimeout(r, 20));
    expect(await runScan(dir, opts)).toBe(0);
    expect(await readdir(path.join(dir, 'services'))).toEqual(files);
    expect(await Promise.all(files.map(async (f) => (await stat(path.join(dir, 'services', f))).mtimeMs))).toEqual(before);
  });

  it('reports files, patterns, redactions and inconclusive relations without leaking values', async () => {
    const dir = await catalog({ 'svclens.config.yaml': 'sources: []\n' });
    const json = path.join(dir, 'report.json');
    await runScan(dir, { source: LEGACY_SOURCES, createStubs: true, json, verbose: true });
    const text = out.join('\n');
    expect(text).toMatch(/legacy-webforms: \d+ files? analyzed, found .*connection string/);
    expect(text).toMatch(/removed for safety: .*password x\d+ \(Web\.config\)/);
    expect(text).toContain('connectionStrings.Templated: host is a placeholder');
    expect(text).toContain('skipped .env: environment file that may hold secrets');
    expect(text).toContain('Web.config');
    const report = JSON.parse(await readFile(json, 'utf8'));
    const web = report.services.find((s: any) => s.service === 'legacy-webforms');
    expect(web.analyzed).toContain('Web.Release.config');
    expect(web.redactions.length).toBeGreaterThan(0);
    for (const secret of SECRETS) {
      expect(JSON.stringify(report), secret).not.toContain(secret);
      expect(text, secret).not.toContain(secret);
    }
  });

  it('never writes secrets, even from legacy configs', async () => {
    const dir = await catalog({ 'svclens.config.yaml': 'sources: []\n' });
    await runScan(dir, { source: LEGACY_SOURCES, createStubs: true });
    const text = await allText(dir);
    for (const secret of SECRETS) expect(text, secret).not.toContain(secret);
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

describe('runScan with client applications', () => {
  const sources = ['client-spa', 'desktop-app'].map((r) => `${REPOS}/${r}`);

  it('keeps calls to servers but not direct database access', async () => {
    const dir = await catalog({ 'svclens.config.yaml': 'sources: []\n' });
    await runScan(dir, { source: sources, createStubs: true, json: path.join(dir, 'r.json') });
    for (const id of ['client-spa', 'desktop-app']) {
      const svc = await read(dir, `services/${id}.yaml`);
      expect(svc.role).toBe('client');
      expect(targets(svc)).toEqual(['gateway-acme-internal:http:scan']);
    }
    const files = await readdir(path.join(dir, 'services'));
    expect(files.filter((f) => /spa-db|desk-db/.test(f))).toEqual([]);
    const report = JSON.parse(await readFile(path.join(dir, 'r.json'), 'utf8'));
    const spa = report.services.find((s: any) => s.service === 'client-spa');
    expect(spa.inconclusive).toContainEqual(expect.objectContaining({ key: 'DATABASE_URL', reason: expect.stringContaining('client application') }));
    expect(JSON.stringify(report) + (await allText(dir))).not.toMatch(/spaLeak123|deskLeak123/);
  });

  it('does not give a role to server components, which keep their database relation', async () => {
    const dir = await catalog({ 'svclens.config.yaml': 'sources: []\n' });
    await runScan(dir, { source: [`${REPOS}/orders-api`], createStubs: true });
    expect((await read(dir, 'services/orders-api.yaml')).role).toBeUndefined();
    expect(targets(await read(dir, 'services/orders-api.yaml')).some((t: string) => t.includes(':sql:'))).toBe(true);
  });
});
