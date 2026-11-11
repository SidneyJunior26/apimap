import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runDiff, runExport } from '../src/index.js';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, stdio: 'pipe' }).toString();

async function write(dir: string, files: Record<string, string>) {
  for (const [rel, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), text);
  }
}

let out: string[];
beforeEach(() => {
  out = [];
  vi.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...a) => void out.push(a.join(' ')));
});

describe('runExport', () => {
  it('prints mermaid to stdout or writes a file', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'apimap-export-'));
    await write(dir, { 'services/a.yaml': 'id: a\nname: A\nkind: core\nowner: t\ndependsOn:\n  - target: b\n', 'services/b.yaml': 'id: b\nname: B\nkind: database\nowner: t\n' });
    expect(await runExport(dir, { format: 'mermaid' })).toBe(0);
    expect(out.join('\n')).toContain('flowchart LR');
    expect(await runExport(dir, { format: 'mermaid', out: path.join(dir, 'map.mmd') })).toBe(0);
    expect(await readFile(path.join(dir, 'map.mmd'), 'utf8')).toContain('a ==> b');
  });

  it('rejects unknown formats', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'apimap-export-'));
    expect(await runExport(dir, { format: 'svg' })).toBe(1);
  });
});

describe('runDiff', () => {
  it('compares the working tree with a git ref', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'apimap-diff-'));
    git(repo, 'init', '-q', '-b', 'main');
    await write(repo, {
      'catalog/services/a.yaml': 'id: a\nname: A\nkind: core\nowner: t\ndependsOn:\n  - target: b\n',
      'catalog/services/b.yaml': 'id: b\nname: B\nkind: core\nowner: t\n',
    });
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'base');
    await write(repo, { 'catalog/services/c.yaml': 'id: c\nname: C\nkind: core\nowner: t\n', 'catalog/services/a.yaml': 'id: a\nname: A\nkind: core\nowner: t\ndependsOn:\n  - target: c\n' });
    await rm(path.join(repo, 'catalog/services/b.yaml'));

    expect(await runDiff(path.join(repo, 'catalog'), { base: 'main', format: 'markdown' })).toBe(0);
    const text = out.join('\n');
    expect(text).toContain('#### Services added');
    expect(text).toContain('- `c` C (core)');
    expect(text).toContain('#### Services removed');
    expect(text).toContain('`a` → `c` (http, manual)');
  });

  it('treats a catalog missing at the base ref as empty', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'apimap-diff-'));
    git(repo, 'init', '-q', '-b', 'main');
    await write(repo, { 'README.md': 'x' });
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'base');
    await write(repo, { 'catalog/services/a.yaml': 'id: a\nname: A\nkind: core\nowner: t\n' });
    expect(await runDiff(path.join(repo, 'catalog'), { base: 'main', format: 'text' })).toBe(0);
    expect(out.join('\n')).toContain('Services added:');
  });

  it('fails clearly outside a git repository or with an unknown ref', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'apimap-nogit-'));
    expect(await runDiff(dir, { base: 'main', format: 'text' })).toBe(1);
    expect(out.join('\n')).toContain('not inside a git repository');
  });
});
