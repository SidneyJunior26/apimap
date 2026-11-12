import { mkdir, mkdtemp, readFile, writeFile, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDiagnostics, runBuild, runValidate } from '../src/index.js';

async function catalog(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'svclens-'));
  for (const [rel, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), text);
  }
  return dir;
}

const ok = { 'services/a.yaml': 'id: a\nname: A\nkind: core\nowner: t\n' };
const warn = { 'services/a.yaml': 'id: a\nname: A\nkind: core\n' };
const bad = { 'services/a.yaml': 'id: a\nname: A\nkind: nope\nowner: t\n' };

const exists = (p: string) => access(p).then(() => true, () => false);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('runValidate', () => {
  it('exits 0 for a valid catalog', async () => {
    expect(await runValidate(await catalog(ok), {})).toBe(0);
  });
  it('exits 0 on warnings, 1 with --strict', async () => {
    const dir = await catalog(warn);
    expect(await runValidate(dir, {})).toBe(0);
    expect(await runValidate(dir, { strict: true })).toBe(1);
  });
  it('exits 1 on errors', async () => {
    expect(await runValidate(await catalog(bad), {})).toBe(1);
  });
});

describe('runBuild', () => {
  let webDist: string;
  beforeEach(async () => {
    webDist = await catalog({ 'index.html': '<!doctype html><title>svclens</title>', 'assets/app.js': '' });
  });

  it('writes graph.json and web assets', async () => {
    const dir = await catalog(ok);
    const out = path.join(dir, 'dist');
    expect(await runBuild(dir, { out, webDist })).toBe(0);
    const graph = JSON.parse(await readFile(path.join(out, 'graph.json'), 'utf8'));
    expect(graph.nodes.map((n: { id: string }) => n.id)).toEqual(['a']);
    expect(await exists(path.join(out, 'index.html'))).toBe(true);
    expect(await exists(path.join(out, 'assets/app.js'))).toBe(true);
  });

  it('defaults out to <dir>/dist', async () => {
    const dir = await catalog(ok);
    expect(await runBuild(dir, { webDist })).toBe(0);
    expect(await exists(path.join(dir, 'dist/graph.json'))).toBe(true);
  });

  it('refuses to build on errors', async () => {
    const dir = await catalog(bad);
    const out = path.join(dir, 'dist');
    expect(await runBuild(dir, { out, webDist })).toBe(1);
    expect(await exists(path.join(out, 'graph.json'))).toBe(false);
  });

  it('builds an empty catalog', async () => {
    const dir = await catalog({});
    const out = path.join(dir, 'dist');
    expect(await runBuild(dir, { out, webDist })).toBe(0);
    const graph = JSON.parse(await readFile(path.join(out, 'graph.json'), 'utf8'));
    expect(graph.nodes).toEqual([]);
  });
});

describe('formatDiagnostics', () => {
  it('prints level, file, path and summary', () => {
    const text = formatDiagnostics([
      { level: 'error', code: 'schema', file: 'services/a.yaml', path: 'dependsOn.0', message: 'bad' },
      { level: 'warning', code: 'missing-owner', file: 'services/b.yaml', message: 'no owner' },
    ]);
    expect(text).toContain('ERROR');
    expect(text).toContain('services/a.yaml dependsOn.0: bad');
    expect(text).toContain('WARN');
    expect(text).toContain('1 error, 1 warning');
  });
});
