import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import type { RepoFiles, Skipped } from './types.js';

export const IGNORED_DIRS = ['node_modules', 'dist', 'build', 'bin', 'obj', '.git', 'vendor', 'coverage', '.next', 'out'];
const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'packages.lock.json', 'composer.lock', 'Gemfile.lock'];
/** Only these .env variants are read; real .env files may hold secrets. */
export const ALLOWED_ENV_FILES = ['.env.example', '.env.sample', '.env.template', '.env.development'];

/** Files above this size are skipped; configuration files are small, bigger ones are data or generated. */
export const MAX_FILE_BYTES = 1024 * 1024;

function skipReason(rel: string): string | null {
  const base = path.posix.basename(rel);
  if (LOCKFILES.includes(base)) return 'lockfile';
  if ((base === '.env' || base.startsWith('.env.')) && !ALLOWED_ENV_FILES.includes(base)) return 'environment file that may hold secrets';
  return null;
}

export async function openRepo(dir: string): Promise<RepoFiles> {
  const root = path.resolve(dir);
  const entries = await fg('**/*', {
    cwd: root,
    dot: true,
    onlyFiles: true,
    stats: true,
    followSymbolicLinks: false,
    ignore: IGNORED_DIRS.map((d) => `**/${d}/**`),
  });
  const files: string[] = [];
  const skipped: Skipped[] = [];
  for (const entry of entries.sort((a, b) => a.path.localeCompare(b.path))) {
    const reason = skipReason(entry.path) ?? ((entry.stats?.size ?? 0) > MAX_FILE_BYTES ? 'larger than 1 MB' : null);
    if (reason) skipped.push({ file: entry.path, reason });
    else files.push(entry.path);
  }
  return {
    dir: root,
    name: path.basename(root),
    list: () => files,
    read: (rel) => readFile(path.join(root, rel), 'utf8'),
    skipped,
  };
}

/** 1-based line number of a character offset. */
export function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}
