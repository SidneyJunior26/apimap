import { spawn } from 'node:child_process';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { loadCatalog } from '@apimap/core';
import { createServeApp } from '../serve/app.js';
import { watchCatalog } from '../serve/watch.js';
import { resolveWebDist } from './build.js';

export interface ServeCommandOptions {
  port?: number;
  open?: boolean;
  webDist?: string;
}

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
}

/** Starts the local editor. Resolves when the server is listening; runs until the process exits. */
export async function runServe(dir: string, opts: ServeCommandOptions): Promise<number> {
  const root = path.resolve(dir);
  const port = opts.port ?? 4321;
  const { catalog } = await loadCatalog(root);
  const { app, notify } = createServeApp(root, { webDist: opts.webDist ?? resolveWebDist(), port });
  const stopWatching = await watchCatalog(root, notify);

  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port });
  const url = `http://localhost:${port}`;
  console.log(`apimap editor for "${catalog.config.name}" (${catalog.services.length} services) at ${url}`);
  console.log('changes are written to the YAML files in services/; press Ctrl+C to stop');
  if (opts.open) openBrowser(url);

  const shutdown = async () => {
    await stopWatching();
    server.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return 0;
}
