/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: { alias: { '@apimap/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) } },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
