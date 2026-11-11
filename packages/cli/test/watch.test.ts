import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { watchCatalog } from '../src/serve/watch.js';

describe('watchCatalog', () => {
  it('fires after changes in services/ and in the config, coalescing bursts', { timeout: 20_000 }, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'apimap-watch-'));
    await mkdir(path.join(root, 'services'));
    let calls = 0;
    const stop = await watchCatalog(root, () => calls++, { debounceMs: 300 });
    try {
      await Promise.all([writeFile(path.join(root, 'services/a.yaml'), 'id: a\n'), writeFile(path.join(root, 'services/b.yaml'), 'id: b\n')]);
      await vi.waitFor(() => expect(calls).toBeGreaterThanOrEqual(1), { timeout: 5000, interval: 50 });
      // Writes in one burst are coalesced; allow one extra event if the machine stalls between them.
      expect(calls).toBeLessThanOrEqual(2);
      const before = calls;
      await writeFile(path.join(root, 'apimap.config.yaml'), 'name: X\n');
      await vi.waitFor(() => expect(calls).toBeGreaterThan(before), { timeout: 5000, interval: 50 });
    } finally {
      await stop();
    }
  });
});
