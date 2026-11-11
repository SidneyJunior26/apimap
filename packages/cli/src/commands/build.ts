import { cp, mkdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph, type Config, type EditTarget } from '@apimap/core';
import { defaultBranch, git, parseGithubRemote, posix, repoRoot } from '../git.js';
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

/** Where "propose change" links should point: the config, else the GitHub origin remote, else nowhere. */
export async function resolveEditTarget(catalogDir: string, config: Config): Promise<EditTarget | undefined> {
  if (config.edit === false) return undefined;
  if (config.edit) return config.edit;
  const root = await repoRoot(catalogDir);
  if (!root) return undefined;
  let remote: string;
  try {
    remote = await git(root, ['remote', 'get-url', 'origin']);
  } catch {
    return undefined;
  }
  const repo = parseGithubRemote(remote);
  if (!repo) return undefined;
  const rel = posix(path.relative(await realpath(root), await realpath(catalogDir)));
  return { provider: 'github', repo, branch: await defaultBranch(root), path: rel };
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
  const graph = buildGraph(catalog, new Date(), { edit: await resolveEditTarget(root, catalog.config) });
  await writeFile(path.join(out, 'graph.json'), `${JSON.stringify(graph)}\n`);
  console.log(`built ${graph.nodes.length} nodes, ${graph.edges.length} edges -> ${out}`);
  return 0;
}
