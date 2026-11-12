import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: {
    alias: {
      '@svclens/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@svclens/scanners': fileURLToPath(new URL('../scanners/src/index.ts', import.meta.url)),
    },
  },
});
