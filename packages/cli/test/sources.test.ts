import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { runScan } from '../src/index.js';
import { isGitSource, repoLabel, safeGitUrl } from '../src/sources.js';

const FIXTURE = fileURLToPath(new URL('../../scanners/test/fixtures/repos/storefront-bff', import.meta.url));
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, stdio: 'pipe' });

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('git source helpers', () => {
  it('recognizes git URLs', () => {
    for (const url of ['https://github.com/acme/a.git', 'ssh://git@host/x', 'git@github.com:acme/a.git', 'file:///tmp/repo', 'https://gitlab.example/acme/a']) {
      expect(isGitSource(url)).toBe(true);
    }
    expect(isGitSource('../repos/*')).toBe(false);
  });

  it('rejects option injection and unsafe transports', () => {
    expect(safeGitUrl('--upload-pack=touch /tmp/x')).toBeNull();
    expect(safeGitUrl('ext::sh -c touch% /tmp/pwned')).toBeNull();
    expect(safeGitUrl('https://github.com/acme/a.git\n--foo')).toBeNull();
    expect(safeGitUrl('https://github.com/acme/a.git')).toBe('https://github.com/acme/a.git');
  });

  it('labels repositories without credentials', () => {
    expect(repoLabel('https://user:tok3n@github.com/acme/orders-api.git')).toBe('github.com/acme/orders-api');
    expect(repoLabel('git@github.com:acme/orders-api.git')).toBe('github.com/acme/orders-api');
  });
});

describe('scan with git sources', () => {
  it('clones, scans and records the repository', async () => {
    const remote = await mkdtemp(path.join(os.tmpdir(), 'apimap-remote-'));
    const repoDir = path.join(remote, 'storefront-bff');
    await cp(FIXTURE, repoDir, { recursive: true });
    git(repoDir, 'init', '-q', '-b', 'main');
    git(repoDir, 'add', '-A', '-f');
    git(repoDir, 'commit', '-q', '-m', 'init');

    const catalog = await mkdtemp(path.join(os.tmpdir(), 'apimap-cat-'));
    await writeFile(path.join(catalog, 'apimap.config.yaml'), `sources:\n  - file://${repoDir}\n`);
    expect(await runScan(catalog, {})).toBe(0);
    const svc = parse(await readFile(path.join(catalog, 'services/storefront-bff.yaml'), 'utf8'));
    expect(svc).toMatchObject({ id: 'storefront-bff', kind: 'bff', repo: `${repoDir.replace(/^\//, '')}` });
    expect(await readFile(path.join(catalog, '.apimap/.gitignore'), 'utf8')).toBe('*\n');

    // Offline run reuses the cache.
    expect(await runScan(catalog, { fetch: false })).toBe(0);
  });

  it('reports a clone failure without aborting other sources', async () => {
    const catalog = await mkdtemp(path.join(os.tmpdir(), 'apimap-cat-'));
    expect(await runScan(catalog, { source: ['file:///nonexistent/repo.git'] })).toBe(1);
  });
});
