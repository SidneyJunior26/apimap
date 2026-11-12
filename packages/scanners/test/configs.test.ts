import { describe, expect, it } from 'vitest';
import { scanProjects, scanRepo } from '../src/index.js';
import { repo } from './helpers.js';

const pairs = (refs: Array<{ host: string; protocol: string }>) => refs.map((r) => `${r.host}:${r.protocol}`).sort();
const LEAKS = [
  'Sup3rS3cret', '0racleS3cret', 'Pr0dS3cret', 'k3y-should-never-leak', 'smtp-pass-leak', 'm41l-leak', 'billing_app',
  'pgS3cret', 'r3d1sS3cret', 'm0ng0S3cret', 'appuser', 'seq-key-leak', 'jwt-secret-leak', 'pr0dPgS3cret', 'pw0rdLeak',
  'secret-host', 'real-env-leak', 'commented.acme.internal', '00000000-0000-0000',
];

describe('legacy Web.config (legacy-webforms)', () => {
  it('finds databases, services, mail and log sinks with key and environment', async () => {
    const r = await scanRepo(repo('legacy-webforms'));
    expect(pairs(r.references)).toEqual([
      'billing-db.acme.internal:sql',
      'billing-db.prod.acme.internal:sql',
      'ledger-db.acme.internal:sql',
      'logs.acme.internal:logs',
      'mail.acme.internal:smtp',
      'payments.acme.internal:http',
      'syslog.acme.internal:logs',
      'tax.acme.internal:soap',
    ]);
    const find = (host: string) => r.references.find((x) => x.host === host)!;
    expect(find('billing-db.acme.internal')).toMatchObject({ provider: 'SQL Server', evidence: { file: 'Web.config', key: 'connectionStrings.Billing' } });
    expect(find('billing-db.prod.acme.internal').evidence).toMatchObject({ file: 'Web.Release.config', key: 'connectionStrings.Billing', env: 'Release' });
    expect(find('ledger-db.acme.internal')).toMatchObject({ provider: 'Oracle', protocol: 'sql' });
    expect(find('payments.acme.internal').evidence.key).toBe('appSettings.PaymentsUrl');
    expect(find('tax.acme.internal').evidence.key).toBe('serviceModel.client.TaxService');
    expect(find('syslog.acme.internal').evidence.key).toBe('appender.remoteAddress');
    expect(find('logs.acme.internal').evidence).toMatchObject({ file: 'nlog.config', key: 'target@address' });
    expect(r.hints.kind).toBeUndefined();
  });

  it('ignores local databases and commented entries, and reports placeholders as inconclusive', async () => {
    const r = await scanRepo(repo('legacy-webforms'));
    expect(r.references.some((x) => /localdb|commented/.test(x.host))).toBe(false);
    expect(r.inconclusive).toContainEqual(expect.objectContaining({ file: 'Web.config', key: 'connectionStrings.Templated', reason: 'host is a placeholder' }));
  });

  it('never reads the real .env and says so', async () => {
    const r = await scanRepo(repo('legacy-webforms'));
    expect(r.analyzed).not.toContain('.env');
    expect(r.skipped).toContainEqual({ file: '.env', reason: 'environment file that may hold secrets' });
  });

  it('counts redactions without keeping values', async () => {
    const r = await scanRepo(repo('legacy-webforms'));
    const kinds = new Set(r.redactions.map((x) => x.kind));
    expect(kinds).toEqual(new Set(['password', 'user', 'key']));
    const web = r.redactions.filter((x) => x.file === 'Web.config');
    expect(web.find((x) => x.kind === 'password')?.count).toBeGreaterThanOrEqual(4);
    expect(Object.keys(r.redactions[0]!).sort()).toEqual(['count', 'file', 'kind']);
  });

  it('does not leak any secret in the scan result', async () => {
    const r = await scanRepo(repo('legacy-webforms'));
    const text = JSON.stringify(r);
    for (const leak of LEAKS) expect(text, leak).not.toContain(leak);
  });

  it('is deterministic: scanning twice gives the same result', async () => {
    const a = await scanRepo(repo('legacy-webforms'));
    const b = await scanRepo(repo('legacy-webforms'));
    expect(b).toEqual(a);
  });
});

describe('appsettings and logging (modern-logging)', () => {
  it('reads JSON with comments and trailing commas, by provider and sink', async () => {
    const r = await scanRepo(repo('modern-logging'));
    expect(pairs(r.references)).toEqual([
      'cache.acme.internal:redis',
      'catalog.acme.internal:http',
      'db.acme.internal:sql',
      'es1.acme.internal:logs',
      'es2.acme.internal:logs',
      'mongo.acme.internal:mongodb',
      'pg.acme.internal:sql',
      'pg.prod.acme.internal:sql',
      'seq.acme.internal:logs',
      'telemetry.acme.internal:logs',
    ]);
    const find = (host: string) => r.references.find((x) => x.host === host)!;
    expect(find('pg.acme.internal')).toMatchObject({ provider: 'PostgreSQL', evidence: { file: 'appsettings.json', key: 'ConnectionStrings:Main', line: 4 } });
    expect(find('pg.prod.acme.internal').evidence).toMatchObject({ file: 'appsettings.Production.json', env: 'Production' });
    expect(find('cache.acme.internal').provider).toBe('Redis');
    expect(find('seq.acme.internal').evidence.key).toBe('Serilog:WriteTo:0:Args:serverUrl');
    expect(find('db.acme.internal').evidence).toMatchObject({ file: '.env.example', key: 'DATABASE_URL' });
  });

  it('keeps going when a JSON file is invalid and says so', async () => {
    const r = await scanRepo(repo('modern-logging'));
    expect(r.inconclusive).toContainEqual(expect.objectContaining({ file: 'appsettings.Broken.json', reason: expect.stringContaining('invalid JSON') }));
    expect(r.references.some((x) => x.host === 'broken-db.acme.internal')).toBe(false);
  });

  it('reports a placeholder in an env file as inconclusive', async () => {
    const r = await scanRepo(repo('modern-logging'));
    expect(r.inconclusive).toContainEqual(expect.objectContaining({ file: '.env.example', key: 'API_URL' }));
  });

  it('does not leak credentials and lists the analyzed files and patterns', async () => {
    const r = await scanRepo(repo('modern-logging'));
    const text = JSON.stringify(r);
    for (const leak of LEAKS) expect(text, leak).not.toContain(leak);
    expect(r.analyzed).toEqual(expect.arrayContaining(['appsettings.json', 'appsettings.Production.json', '.env.example']));
    expect(r.patterns['connection string']).toBeGreaterThanOrEqual(4);
    expect(r.patterns['log sink']).toBeGreaterThanOrEqual(3);
    expect(r.redactions.map((x) => x.kind)).toEqual(expect.arrayContaining(['password', 'user', 'token', 'key', 'url-credentials']));
  });
});

describe('monorepo (mono-repo)', () => {
  it('splits application projects and leaves libraries and test helpers out', async () => {
    const projects = await scanProjects(repo('mono-repo'));
    expect(projects.map((p) => p.sub)).toEqual(['src/billing', 'src/orders', 'web']);
    const by = Object.fromEntries(projects.map((p) => [p.sub, p.scan]));
    expect(pairs(by['src/orders']!.references)).toEqual(['orders-db.acme.internal:sql']);
    expect(by['src/orders']!.references[0]!.evidence.file).toBe('src/orders/appsettings.json');
    expect(pairs(by['src/billing']!.references)).toEqual(['tax.acme.internal:http']);
    expect(pairs(by['web']!.references)).toEqual(['orders.acme.internal:http']);
    expect(projects.flatMap((p) => p.scan.references).some((r) => r.host === 'shared-lib.acme.internal')).toBe(false);
  });

  it('lists root files that no project owns', async () => {
    const [first] = await scanProjects(repo('mono-repo'));
    expect(first!.scan.skipped).toContainEqual({ file: 'docker-compose.yml', reason: 'outside every project of this repository' });
  });

  it('keeps a repository with one project, or with a svclens.yaml, as a single service', async () => {
    expect((await scanProjects(repo('orders-api'))).map((p) => p.sub)).toEqual(['']);
    expect((await scanProjects(repo('partner-gateway'))).map((p) => p.sub)).toEqual(['']);
  });
});
