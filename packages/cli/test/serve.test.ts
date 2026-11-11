import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { createServeApp } from '../src/serve/app.js';

const PORT = 4321;
const ORIGIN = `http://localhost:${PORT}`;

async function catalog(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'apimap-serve-'));
  for (const [rel, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), text);
  }
  return dir;
}

const exists = (p: string) => access(p).then(() => true, () => false);

let root: string;
let webDist: string;
let app: ReturnType<typeof createServeApp>['app'];

const req = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.request(url, {
    method,
    headers: { host: `localhost:${PORT}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

beforeEach(async () => {
  root = await catalog({
    'services/orders.yaml': ['# owned by team-orders', 'id: orders-api', 'name: Orders API # display', 'kind: core', 'owner: team-orders', 'dependsOn:', '  - target: payments-api', ''].join('\n'),
    'services/payments.yaml': 'id: payments-api\nname: Payments\nkind: core\nowner: t\n',
    'services/legacy.yaml': 'id: legacy\nname: Legacy\nkind: legacy\nowner: t\nlocked: true\n',
  });
  webDist = await catalog({ 'index.html': '<!doctype html><title>apimap</title>' });
  app = createServeApp(root, { webDist, port: PORT }).app;
});

describe('serve API', () => {
  it('returns the live graph', async () => {
    const res = await req('GET', '/api/graph');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.editable).toBe(true);
    expect(body.graph.nodes.map((n: any) => n.id)).toEqual(['legacy', 'orders-api', 'payments-api']);
  });

  it('returns one service with its file', async () => {
    const body = (await (await req('GET', '/api/services/orders-api')).json()) as any;
    expect(body).toMatchObject({ id: 'orders-api', file: 'services/orders.yaml' });
    expect((await req('GET', '/api/services/nope')).status).toBe(404);
  });

  it('creates a service', async () => {
    const res = await req('POST', '/api/services', { id: 'shipping-api', name: 'Shipping', kind: 'core', dependsOn: [{ target: 'orders-api' }] }, { origin: ORIGIN });
    expect(res.status).toBe(201);
    const saved = parse(await readFile(path.join(root, 'services/shipping-api.yaml'), 'utf8'));
    expect(saved).toMatchObject({ id: 'shipping-api', dependsOn: [{ target: 'orders-api', confidence: 'manual', origin: 'manual' }] });
  });

  it('rejects duplicate ids on create', async () => {
    expect((await req('POST', '/api/services', { id: 'orders-api', name: 'X', kind: 'core' })).status).toBe(409);
  });

  it('rejects invalid services with issues', async () => {
    const res = await req('POST', '/api/services', { id: '../evil', name: '', kind: 'core' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.issues.map((i: any) => i.path)).toEqual(expect.arrayContaining(['id', 'name']));
    expect(await exists(path.join(root, 'evil.yaml'))).toBe(false);
  });

  it('updates a service and keeps comments', async () => {
    const res = await req('PUT', '/api/services/orders-api', { id: 'orders-api', name: 'Orders API', kind: 'core', owner: 'team-checkout', dependsOn: [{ target: 'payments-api' }] });
    expect(res.status).toBe(200);
    const text = await readFile(path.join(root, 'services/orders.yaml'), 'utf8');
    expect(text).toContain('# owned by team-orders');
    expect(text).toContain('# display');
    expect(parse(text).owner).toBe('team-checkout');
  });

  it('rejects id mismatch, unknown and locked services on update', async () => {
    expect((await req('PUT', '/api/services/orders-api', { id: 'other', name: 'X', kind: 'core' })).status).toBe(400);
    expect((await req('PUT', '/api/services/nope', { id: 'nope', name: 'X', kind: 'core' })).status).toBe(404);
    expect((await req('PUT', '/api/services/legacy', { id: 'legacy', name: 'X', kind: 'legacy' })).status).toBe(423);
  });

  it('deletes a service and reports dependents', async () => {
    const res = await req('DELETE', '/api/services/payments-api');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 'payments-api', file: 'services/payments.yaml', dependents: ['orders-api'] });
    expect(await exists(path.join(root, 'services/payments.yaml'))).toBe(false);
  });

  it('refuses to delete locked or unknown services', async () => {
    expect((await req('DELETE', '/api/services/legacy')).status).toBe(423);
    expect((await req('DELETE', '/api/services/nope')).status).toBe(404);
  });

  it('rejects foreign hosts and origins', async () => {
    expect((await req('GET', '/api/graph', undefined, { host: 'evil.example:4321' })).status).toBe(403);
    const res = await req('DELETE', '/api/services/payments-api', undefined, { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(await exists(path.join(root, 'services/payments.yaml'))).toBe(true);
  });

  it('requires JSON for writes', async () => {
    const res = await app.request('/api/services', { method: 'POST', headers: { host: `localhost:${PORT}`, 'content-type': 'text/plain' }, body: 'id=x' });
    expect(res.status).toBe(415);
  });

  it('serves the viewer', async () => {
    const res = await req('GET', '/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>apimap</title>');
  });
});
