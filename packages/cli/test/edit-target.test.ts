import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runBuild } from '../src/index.js';
import { parseGithubRemote } from '../src/git.js';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' });

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

async function setup(config = '') {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'svclens-edit-'));
  git(repo, 'init', '-q', '-b', 'trunk');
  git(repo, 'remote', 'add', 'origin', 'git@github.com:acme/platform-map.git');
  const dir = path.join(repo, 'catalog');
  await mkdir(path.join(dir, 'services'), { recursive: true });
  await writeFile(path.join(dir, 'services/a.yaml'), 'id: a\nname: A\nkind: core\nowner: t\n');
  if (config) await writeFile(path.join(dir, 'svclens.config.yaml'), config);
  const webDist = await mkdtemp(path.join(os.tmpdir(), 'svclens-web-'));
  await writeFile(path.join(webDist, 'index.html'), '<html></html>');
  return { dir, webDist };
}

const graphOf = async (dir: string) => JSON.parse(await readFile(path.join(dir, 'dist/graph.json'), 'utf8'));

describe('edit target in graph.json', () => {
  it('detects the GitHub remote, branch and catalog path', async () => {
    const { dir, webDist } = await setup();
    expect(await runBuild(dir, { webDist })).toBe(0);
    expect((await graphOf(dir)).edit).toEqual({ provider: 'github', repo: 'acme/platform-map', branch: 'trunk', path: 'catalog' });
  });

  it('uses the config when present and can be turned off', async () => {
    const a = await setup('edit:\n  repo: other/repo\n  branch: main\n  path: x\n');
    await runBuild(a.dir, { webDist: a.webDist });
    expect((await graphOf(a.dir)).edit).toEqual({ provider: 'github', repo: 'other/repo', branch: 'main', path: 'x' });
    const b = await setup('edit: false\n');
    await runBuild(b.dir, { webDist: b.webDist });
    expect('edit' in (await graphOf(b.dir))).toBe(false);
  });
});

describe('parseGithubRemote', () => {
  it('reads https and ssh remotes, ignoring other hosts', () => {
    expect(parseGithubRemote('https://github.com/acme/x.git')).toBe('acme/x');
    expect(parseGithubRemote('https://token@github.com/acme/x')).toBe('acme/x');
    expect(parseGithubRemote('git@github.com:acme/x.git')).toBe('acme/x');
    expect(parseGithubRemote('https://gitlab.com/acme/x.git')).toBeNull();
  });
});
