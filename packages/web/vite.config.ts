/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      // Subpaths (schema, serialize, mermaid) are browser-safe; the root entry is only imported for types.
      { find: /^@svclens\/core\/(.+)$/, replacement: fileURLToPath(new URL('../core/src/$1.ts', import.meta.url)) },
      { find: /^@svclens\/core$/, replacement: fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) },
    ],
  },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
