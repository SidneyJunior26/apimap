import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/bin.ts', 'src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  external: ['@apimap/core', '@apimap/web'],
  banner: { js: '#!/usr/bin/env node' },
});
