import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { watchCatalog } from '../src/serve/watch.js';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('watchCatalog', () => {
  it('fires once per burst of changes in services/', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'apimap-watch-'));
    await mkdir(path.join(root, 'services'));
    let calls = 0;
    const stop = await watchCatalog(root, () => calls++, { debounceMs: 100 });
    try {
      await writeFile(path.join(root, 'services/a.yaml'), 'id: a\n');
      await writeFile(path.join(root, 'services/b.yaml'), 'id: b\n');
      await wait(700);
      expect(calls).toBe(1);
      await writeFile(path.join(root, 'apimap.config.yaml'), 'name: X\n');
      await wait(700);
      expect(calls).toBe(2);
    } finally {
      await stop();
    }
  });
});
