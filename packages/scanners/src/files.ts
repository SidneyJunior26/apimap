import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import type { RepoFiles } from './types.js';

export const IGNORED_DIRS = ['node_modules', 'dist', 'build', 'bin', 'obj', '.git', 'vendor', 'coverage', '.next', 'out'];
const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'packages.lock.json', 'composer.lock', 'Gemfile.lock'];
/** Only these .env variants are read; real .env files may hold secrets. */
export const ALLOWED_ENV_FILES = ['.env.example', '.env.sample', '.env.template', '.env.development'];

function allowed(rel: string): boolean {
  const base = path.posix.basename(rel);
  if (LOCKFILES.includes(base)) return false;
  if (base === '.env' || base.startsWith('.env.')) return ALLOWED_ENV_FILES.includes(base);
  return true;
}

export async function openRepo(dir: string): Promise<RepoFiles> {
  const root = path.resolve(dir);
  const files = (
    await fg('**/*', {
      cwd: root,
      dot: true,
      onlyFiles: true,
      followSymbolicLinks: false,
      ignore: IGNORED_DIRS.map((d) => `**/${d}/**`),
    })
  )
    .filter(allowed)
    .sort();
  return {
    dir: root,
    name: path.basename(root),
    list: () => files,
    read: (rel) => readFile(path.join(root, rel), 'utf8'),
  };
}

/** 1-based line number of a character offset. */
export function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}
