import { describe, expect, it } from 'vitest';
import { scanRepo, type Reference } from '../src/index.js';
import { hostsOf, repo } from './helpers.js';

const pairs = (refs: Reference[]) => [...new Set(refs.map((r) => `${r.host}:${r.protocol}`))].sort();

describe('dotnet', () => {
  it('finds http, soap, amqp and sql references in orders-api', async () => {
    const r = await scanRepo(repo('orders-api'));
    expect(pairs(r.references)).toEqual([
      'billing.acme.internal:soap',
      'inventory.acme.internal:http',
      'mq.acme.internal:amqp',
      'orders-db.acme.internal:sql',
      'payments.acme.internal:http',
    ]);
    expect(r.references.find((x) => x.protocol === 'sql')?.evidence).toEqual({ file: 'src/OrdersApi/appsettings.json', line: 7 });
    expect(r.hints.tech).toEqual(expect.arrayContaining(['dotnet8', 'refit', 'rabbitmq']));
    expect(r.errors).toEqual([]);
  });

  it('never leaks connection string or URL secrets', async () => {
    const text = JSON.stringify(await scanRepo(repo('orders-api')));
    for (const secret of ['Sup3rS3cret', 'guest:guest', 'User Id', 'stale.acme.internal']) expect(text).not.toContain(secret);
  });

  it('detects legacy SOAP webservices', async () => {
    const r = await scanRepo(repo('billing-ws'));
    expect(r.hints.kind).toBe('webservice');
    expect(r.hints.tech).toContain('dotnet-framework');
    expect(pairs(r.references)).toEqual(['billing-db.acme.internal:sql']);
  });

  it('detects workers', async () => {
    const r = await scanRepo(repo('invoice-worker'));
    expect(r.hints.kind).toBe('worker');
    expect(r.hints.tech).toEqual(expect.arrayContaining(['dotnet9', 'kafka']));
  });
});

describe('openapi', () => {
  it('uses title, description and servers as own hints', async () => {
    const r = await scanRepo(repo('catalog-api'));
    expect(r.hints).toMatchObject({ name: 'Catalog API', description: 'Products and categories.' });
    expect(r.hints.hosts).toEqual(['catalog.acme.internal']);
    expect(r.references).toEqual([]);
  });
});

describe('docker-compose', () => {
  it('turns depends_on of services built from the repo into references', async () => {
    const r = await scanRepo(repo('checkout-api'));
    expect(pairs(r.references)).toEqual(['cart-api:http', 'checkout-db:sql', 'rabbitmq:amqp']);
    expect(hostsOf(r.references)).not.toContain('redis');
  });
});

describe('apimap.yaml manifest', () => {
  it('reads the owner-declared service', async () => {
    const r = await scanRepo(repo('partner-gateway'));
    expect(r.declared).toMatchObject({ id: 'partner-gateway', name: 'Partner Gateway', owner: 'team-partners' });
    expect(r.declared?.dependsOn?.[0]).toMatchObject({ target: 'orders-api', confidence: 'manual', note: 'public order endpoints' });
    expect(hostsOf(r.references)).toEqual(['catalog.acme.internal']);
  });

  it('reports an invalid manifest without aborting', async () => {
    const r = await scanRepo(repo('broken-manifest'));
    expect(r.declared).toBeUndefined();
    expect(r.errors.map((e) => e.file)).toEqual(['apimap.yaml']);
  });
});
