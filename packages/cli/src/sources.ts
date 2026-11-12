import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { git } from './git.js';

const GIT_URL = /^(https?:\/\/|ssh:\/\/|git@[^:\s]+:|file:\/\/)|\.git$/i;

export const isGitSource = (source: string): boolean => GIT_URL.test(source.trim());

/** The URL if it is safe to hand to `git clone`, otherwise null (option injection, ext:: transports, control characters). */
export function safeGitUrl(url: string): string | null {
  const u = url.trim();
  if (!u || u.startsWith('-') || /[\s\0]/.test(u) || /^[a-z0-9+.-]*::/i.test(u)) return null;
  return isGitSource(u) ? u : null;
}

/** Credential-free `host/owner/name` used as the service `repo` and as the cache path. */
export function repoLabel(url: string): string {
  const scp = /^git@([^:]+):(.+)$/.exec(url);
  const raw = scp ? `${scp[1]}/${scp[2]}` : url.replace(/^[a-z+]+:\/\//i, '').replace(/^[^@/]*@/, '');
  return raw.replace(/\.git$/i, '').replace(/\/+$/, '').replace(/^\/+/, '');
}

export const CACHE_DIR = '.svclens/repos';

async function exists(p: string): Promise<boolean> {
  return access(p).then(() => true, () => false);
}

/**
 * Makes a shallow copy of `url` available under the catalog's cache and returns its directory.
 * `fetch: false` reuses an existing copy without touching the network.
 */
export async function syncGitSource(root: string, url: string, opts: { fetch: boolean }): Promise<string> {
  const safe = safeGitUrl(url);
  if (!safe) throw new Error(`refusing unsafe git source "${url}"`);
  const cacheRoot = path.join(root, '.svclens');
  await mkdir(cacheRoot, { recursive: true });
  await writeFile(path.join(cacheRoot, '.gitignore'), '*\n');
  const dir = path.join(root, CACHE_DIR, ...repoLabel(safe).split('/').filter((p) => p && p !== '..' && p !== '.'));
  const hardened = ['-c', 'protocol.ext.allow=never'];
  if (await exists(path.join(dir, '.git'))) {
    if (opts.fetch) {
      await git(dir, [...hardened, 'fetch', '--depth', '1', '--quiet', 'origin']);
      // Only ever run inside our own cache copy.
      await git(dir, ['reset', '--hard', '--quiet', 'FETCH_HEAD']);
    }
    return dir;
  }
  await mkdir(path.dirname(dir), { recursive: true });
  await git(root, [...hardened, 'clone', '--depth', '1', '--quiet', '--', safe, dir]);
  return dir;
}
