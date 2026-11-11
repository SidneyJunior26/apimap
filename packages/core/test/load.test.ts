import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_KINDS, FALLBACK_KIND_COLOR, loadCatalog } from '../src/index.js';

const fx = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe('loadCatalog', () => {
  it('loads ok fixture sorted by id with relative file paths', async () => {
    const { catalog, diagnostics } = await loadCatalog(fx('ok'));
    expect(diagnostics).toEqual([]);
    expect(catalog.config.name).toBe('OK Fixture');
    expect(catalog.services.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(catalog.services[0]!.file).toBe('services/a.yaml');
    expect(catalog.services[2]!.file).toBe('services/c.yml');
  });

  it('missing config uses defaults', async () => {
    const { catalog } = await loadCatalog(fx('empty'));
    expect(catalog.config.name).toBe('API Map');
    expect(catalog.kinds).toEqual(DEFAULT_KINDS);
  });

  it('empty dir loads 0 services without diagnostics', async () => {
    const { catalog, diagnostics } = await loadCatalog(fx('empty'));
    expect(catalog.services).toEqual([]);
    expect(diagnostics).toEqual([]);
  });

  it('config kinds merge over defaults', async () => {
    const { catalog } = await loadCatalog(fx('kinds'));
    expect(catalog.kinds.delphi).toEqual({ label: 'Delphi', color: '#ff0000' });
    expect(catalog.kinds.core).toMatchObject({ label: DEFAULT_KINDS.core!.label, color: '#00ff00' });
    expect(catalog.kinds.bare).toEqual({ label: 'bare', color: FALLBACK_KIND_COLOR });
  });

  it('reports per-file errors and still loads valid files', async () => {
    const { catalog, diagnostics } = await loadCatalog(fx('broken'));
    expect(catalog.services.map((s) => s.id)).toEqual(['good']);
    const byFile = Object.fromEntries(diagnostics.map((d) => [d.file, d]));
    expect(byFile['services/bad.yaml']).toMatchObject({ level: 'error', code: 'yaml-parse' });
    expect(byFile['services/blank.yaml']).toMatchObject({ level: 'error', code: 'not-a-mapping' });
    expect(byFile['services/list.yaml']).toMatchObject({ level: 'error', code: 'not-a-mapping' });
    expect(byFile['services/invalid.yaml']).toMatchObject({ level: 'error', code: 'schema', path: 'dependsOn.0.confidence' });
  });
});
