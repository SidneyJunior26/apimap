import { rm } from 'node:fs/promises';
import path from 'node:path';
import { buildGraph, loadCatalog, ServiceSchema, validateCatalog, writeServiceFile, type Service } from '@svclens/core';
import { Hono, type Context } from 'hono';
import { streamSSE, type SSEStreamingApi } from 'hono/streaming';
import { readStatic } from './static.js';

export interface ServeOptions {
  webDist: string;
  port: number;
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const KEEPALIVE_MS = 25_000;

type Issue = { path: string; message: string };

function parseService(body: unknown): { ok: true; service: Service } | { ok: false; issues: Issue[] } {
  const result = ServiceSchema.safeParse(body);
  if (result.success) return { ok: true, service: result.data };
  return { ok: false, issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

/** HTTP app for `svclens serve`: viewer assets, catalog API and live change events. */
export function createServeApp(root: string, opts: ServeOptions) {
  const app = new Hono();
  const allowedHosts = new Set(LOCAL_HOSTS.map((h) => `${h}:${opts.port}`));
  const allowedOrigins = new Set([...allowedHosts].map((h) => `http://${h}`));
  const clients = new Set<SSEStreamingApi>();

  // Only this machine may talk to the server: blocks DNS rebinding and cross-site writes.
  app.use('*', async (c, next) => {
    const host = c.req.header('host') ?? '';
    if (!allowedHosts.has(host)) return c.json({ error: 'forbidden host' }, 403);
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      const origin = c.req.header('origin');
      if (origin && !allowedOrigins.has(origin)) return c.json({ error: 'forbidden origin' }, 403);
      const hasBody = c.req.method === 'POST' || c.req.method === 'PUT';
      if (hasBody && !(c.req.header('content-type') ?? '').startsWith('application/json')) {
        return c.json({ error: 'expected application/json' }, 415);
      }
    }
    await next();
  });

  app.get('/api/graph', async (c) => {
    const { catalog, diagnostics } = await loadCatalog(root);
    return c.json({ graph: buildGraph(catalog), diagnostics: [...diagnostics, ...validateCatalog(catalog)], editable: true });
  });

  app.get('/api/services/:id', async (c) => {
    const { catalog } = await loadCatalog(root);
    const service = catalog.services.find((s) => s.id === c.req.param('id'));
    return service ? c.json(service) : c.json({ error: 'not found' }, 404);
  });

  app.post('/api/services', async (c) => {
    const parsed = parseService(await readJson(c));
    if (!parsed.ok) return c.json({ error: 'invalid service', issues: parsed.issues }, 400);
    const { catalog } = await loadCatalog(root);
    if (catalog.services.some((s) => s.id === parsed.service.id)) return c.json({ error: `id "${parsed.service.id}" already exists` }, 409);
    const file = `services/${parsed.service.id}.yaml`;
    await writeServiceFile(path.join(root, file), parsed.service);
    return c.json({ ...parsed.service, file }, 201);
  });

  app.put('/api/services/:id', async (c) => {
    const id = c.req.param('id');
    const parsed = parseService(await readJson(c));
    if (!parsed.ok) return c.json({ error: 'invalid service', issues: parsed.issues }, 400);
    if (parsed.service.id !== id) return c.json({ error: 'id in body does not match URL', issues: [{ path: 'id', message: 'ids cannot be renamed' }] }, 400);
    const { catalog } = await loadCatalog(root);
    const existing = catalog.services.find((s) => s.id === id);
    if (!existing) return c.json({ error: 'not found' }, 404);
    if (existing.locked) return c.json({ error: 'service is locked' }, 423);
    await writeServiceFile(path.join(root, existing.file), parsed.service);
    return c.json({ ...parsed.service, file: existing.file });
  });

  app.delete('/api/services/:id', async (c) => {
    const id = c.req.param('id');
    const { catalog } = await loadCatalog(root);
    const existing = catalog.services.find((s) => s.id === id);
    if (!existing) return c.json({ error: 'not found' }, 404);
    if (existing.locked) return c.json({ error: 'service is locked' }, 423);
    await rm(path.join(root, existing.file));
    const dependents = catalog.services.filter((s) => s.id !== id && s.dependsOn.some((d) => d.target === id)).map((s) => s.id);
    return c.json({ deleted: id, file: existing.file, dependents });
  });

  app.get('/api/events', (c) =>
    streamSSE(c, async (stream) => {
      clients.add(stream);
      stream.onAbort(() => {
        clients.delete(stream);
      });
      await stream.writeSSE({ event: 'ready', data: '' });
      while (!stream.aborted) {
        await stream.sleep(KEEPALIVE_MS);
        if (!stream.aborted) await stream.write(': keepalive\n\n');
      }
    }),
  );

  app.get('*', async (c) => {
    const file = (await readStatic(opts.webDist, c.req.path)) ?? (await readStatic(opts.webDist, '/index.html'));
    if (!file) return c.text('viewer assets not found', 500);
    if (file.type.startsWith('text/html')) {
      // Tells the viewer it can use the editing API.
      const html = file.body.toString('utf8').replace('<head>', '<head><meta name="svclens-editable" content="true">');
      return c.html(html);
    }
    return c.body(new Uint8Array(file.body), 200, { 'content-type': file.type });
  });

  /** Tells every open browser that the catalog changed. */
  const notify = () => {
    for (const stream of clients) void stream.writeSSE({ event: 'graph', data: String(Date.now()) }).catch(() => {
      clients.delete(stream);
    });
  };

  return { app, notify };
}
