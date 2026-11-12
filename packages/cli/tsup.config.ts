import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const webDist = fileURLToPath(new URL('../web/dist', import.meta.url));
const out = fileURLToPath(new URL('./dist/web', import.meta.url));

export default defineConfig({
  entry: ['src/bin.ts', 'src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  dts: { entry: 'src/index.ts', resolve: [/^@svclens\//] },
  // The published package is self-contained: core and scanners are bundled in, the viewer is copied next to it.
  noExternal: [/^@svclens\//],
  define: { __SVCLENS_VERSION__: JSON.stringify(pkg.version) },
  banner: ({ format }) => (format === 'esm' ? { js: '' } : {}),
  async onSuccess() {
    if (!existsSync(webDist)) throw new Error('build @svclens/web first (pnpm -r build does it in order)');
    rmSync(out, { recursive: true, force: true });
    cpSync(webDist, out, { recursive: true });
  },
});
