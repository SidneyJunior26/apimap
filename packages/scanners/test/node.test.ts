import { describe, expect, it } from 'vitest';
import { openRepo, scanRepo } from '../src/index.js';
import { hostsOf, repo } from './helpers.js';

describe('openRepo', () => {
  it('skips ignored folders and real .env files', async () => {
    const files = (await openRepo(repo('storefront-bff'))).list();
    expect(files).toContain('.env.example');
    expect(files).not.toContain('.env');
    expect(files.some((f) => f.startsWith('node_modules/'))).toBe(false);
  });
});

describe('storefront-bff (node + generic)', () => {
  it('finds endpoints in config files', async () => {
    const r = await scanRepo(repo('storefront-bff'));
    expect(hostsOf(r.references)).toEqual(['catalog.acme.internal', 'identity.acme.internal', 'logs.acme.internal', 'search.acme.internal']);
    expect(r.errors).toEqual([]);
  });

  it('records evidence with line numbers', async () => {
    const r = await scanRepo(repo('storefront-bff'));
    expect(r.references.find((x) => x.host === 'catalog.acme.internal')?.evidence).toEqual({ file: '.env.example', line: 1, key: 'CATALOG_URL' });
    expect(r.references.find((x) => x.host === 'search.acme.internal')?.evidence).toEqual({ file: 'config/default.json', line: 4, key: 'url' });
  });

  it('never leaks credentials or unread secrets', async () => {
    const text = JSON.stringify(await scanRepo(repo('storefront-bff')));
    expect(text).not.toContain('p4ss');
    expect(text).not.toContain('svc:');
    expect(text).not.toContain('secret-host');
  });

  it('reads package.json hints', async () => {
    const { hints } = await scanRepo(repo('storefront-bff'));
    expect(hints.name).toBe('storefront-bff');
    expect(hints.description).toBe('Backend for the web store');
    expect(hints.tech).toEqual(expect.arrayContaining(['node', 'fastify']));
    expect(hints.kind).toBe('bff');
  });
});
