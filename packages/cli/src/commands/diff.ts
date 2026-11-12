import { mkdtemp, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildGraph, diffGraphs, formatDiff, loadCatalog } from '@svclens/core';
import { extractAt, GitError, posix, refExists, repoRoot } from '../git.js';

export interface DiffOptions {
  /** Git ref to compare against. Defaults to origin/main, then main. */
  base?: string;
  format: 'text' | 'markdown';
}

/** Prints what changed in the catalog since `base`. Returns the process exit code. */
export async function runDiff(dir: string, opts: DiffOptions): Promise<number> {
  const catalogDir = path.resolve(dir);
  const root = await repoRoot(catalogDir);
  if (!root) {
    console.error(`"${dir}" is not inside a git repository; svclens diff compares against a git ref`);
    return 1;
  }
  const candidates = opts.base ? [opts.base] : ['origin/main', 'main'];
  let base: string | undefined;
  for (const ref of candidates) {
    if (await refExists(root, ref)) {
      base = ref;
      break;
    }
  }
  if (!base) {
    console.error(`git ref not found: ${candidates.join(' or ')}`);
    return 1;
  }

  const tmp = await mkdtemp(path.join(os.tmpdir(), 'svclens-base-'));
  try {
    // realpath: on macOS /tmp and /private/tmp are the same folder seen through a symlink.
    const rel = posix(path.relative(await realpath(root), await realpath(catalogDir)));
    const existed = await extractAt(root, base, rel, tmp);
    const before = buildGraph((await loadCatalog(existed ? path.join(tmp, rel) : tmp)).catalog, new Date(0));
    const after = buildGraph((await loadCatalog(catalogDir)).catalog, new Date(0));
    console.log(formatDiff(diffGraphs(before, after), opts.format));
    return 0;
  } catch (err) {
    console.error(err instanceof GitError ? `git: ${err.message}` : String(err));
    return 1;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
