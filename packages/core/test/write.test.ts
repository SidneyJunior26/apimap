import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { ServiceSchema, writeServiceFile } from '../src/index.js';

const tmp = () => mkdtemp(path.join(os.tmpdir(), 'svclens-write-'));

describe('writeServiceFile', () => {
  it('creates a new file with schema header', async () => {
    const file = path.join(await tmp(), 'services', 'a.yaml');
    const s = ServiceSchema.parse({ id: 'a', name: 'A', kind: 'core', dependsOn: [{ target: 'b', origin: 'scan', confidence: 'confirmed' }] });
    expect(await writeServiceFile(file, s)).toBe(true);
    const text = await readFile(file, 'utf8');
    expect(text.startsWith('# yaml-language-server: $schema=')).toBe(true);
    expect(ServiceSchema.parse(parse(text))).toEqual(s);
    expect(text).not.toContain('locked');
    expect(text).not.toContain('tags: []');
  });

  it('preserves comments on untouched entries and skips unchanged writes', async () => {
    const file = path.join(await tmp(), 'a.yaml');
    const original = [
      '# Owned by team-x',
      'id: a',
      'name: A # display name',
      'kind: core',
      'dependsOn:',
      '  # keep this: legacy contract',
      '  - target: legacy',
      '    origin: manual',
      '  - target: old',
      '    origin: scan',
      '    confidence: confirmed',
      '',
    ].join('\n');
    await writeFile(file, original);
    const s = ServiceSchema.parse({
      id: 'a', name: 'A', kind: 'core', tech: ['dotnet8'],
      dependsOn: [{ target: 'legacy', origin: 'manual' }, { target: 'new', origin: 'scan', confidence: 'confirmed' }],
    });
    expect(await writeServiceFile(file, s)).toBe(true);
    const text = await readFile(file, 'utf8');
    expect(text).toContain('# Owned by team-x');
    expect(text).toContain('# display name');
    expect(text).toContain('# keep this: legacy contract');
    expect(text).not.toContain('target: old');
    expect(ServiceSchema.parse(parse(text))).toEqual(s);

    expect(await writeServiceFile(file, s)).toBe(false);
    expect(await readFile(file, 'utf8')).toBe(text);
  });
});

describe('serviceToYaml', () => {
  it('produces a parseable file with the schema header', async () => {
    const { serviceToYaml } = await import('../src/serialize.js');
    const s = ServiceSchema.parse({ id: 'a', name: 'A "quoted"', kind: 'core', dependsOn: [{ target: 'b', protocol: 'soap' }] });
    const text = serviceToYaml(s);
    expect(text.startsWith('# yaml-language-server: $schema=')).toBe(true);
    expect(ServiceSchema.parse(parse(text))).toEqual(s);
  });
});
