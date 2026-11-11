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
  const watcher = watch([path.join(root, CONFIG_FILE), path.join(root, 'services')], { ignoreInitial: true });
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
