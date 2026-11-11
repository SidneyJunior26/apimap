import { cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph } from '@apimap/core';
import { formatDiagnostics } from '../report.js';
import { loadAndValidate } from './check.js';

export interface BuildOptions {
  /** Output directory. Defaults to `<dir>/dist`. */
  out?: string;
  /** Prebuilt web viewer directory. Defaults to the installed `@apimap/web` dist. */
  webDist?: string;
}

export function resolveWebDist(): string {
  try {
    return path.dirname(fileURLToPath(import.meta.resolve('@apimap/web/dist/index.html')));
  } catch {
    throw new Error('web viewer assets not found: install @apimap/web or pass --web-dist');
  }
}

/** Returns the process exit code. Writes nothing when the catalog has errors. */
export async function runBuild(dir: string, opts: BuildOptions): Promise<number> {
  const root = path.resolve(dir);
  const out = path.resolve(opts.out ?? path.join(root, 'dist'));
  const { catalog, diagnostics, errors } = await loadAndValidate(root);
  if (diagnostics.length > 0) console.log(formatDiagnostics(diagnostics));
  if (errors > 0) {
    console.error('build aborted: fix errors above');
    return 1;
  }
  const webDist = opts.webDist ?? resolveWebDist();
  await mkdir(out, { recursive: true });
  await cp(webDist, out, { recursive: true });
  const graph = buildGraph(catalog);
  await writeFile(path.join(out, 'graph.json'), `${JSON.stringify(graph)}\n`);
  console.log(`built ${graph.nodes.length} nodes, ${graph.edges.length} edges -> ${out}`);
  return 0;
}
