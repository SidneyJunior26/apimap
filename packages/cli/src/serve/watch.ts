import path from 'node:path';
import { watch } from 'chokidar';
import { CONFIG_FILE } from '@apimap/core';

/**
 * Calls `onChange` (debounced) when the config or any service file changes.
 * Resolves once the watcher is ready; the returned function stops it.
 */
export async function watchCatalog(root: string, onChange: () => void, opts: { debounceMs?: number } = {}): Promise<() => Promise<void>> {
  const debounceMs = opts.debounceMs ?? 150;
  let timer: NodeJS.Timeout | undefined;
  // Watch the catalog folder itself so a config file created later is noticed too.
  const base = path.resolve(root);
  const relevant = (p: string) => {
    const rel = path.relative(base, p);
    return rel === '' || rel === CONFIG_FILE || rel === 'services' || rel.startsWith(`services${path.sep}`);
  };
  const watcher = watch(base, { ignoreInitial: true, ignored: (p) => !relevant(p) });
  watcher.on('all', () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, debounceMs);
  });
  await new Promise<void>((resolve) => watcher.once('ready', () => resolve()));
  return async () => {
    clearTimeout(timer);
    await watcher.close();
  };
}
