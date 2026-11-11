// Builds the demo and an empty catalog into e2e/.sites using the local CLI.
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const cli = here('../../cli/dist/bin.js');
rmSync(here('./.sites'), { recursive: true, force: true });
for (const [catalog, out] of [
  ['../../../examples/acme-demo', './.sites/acme'],
  ['./fixtures/empty', './.sites/empty'],
]) {
  execFileSync(process.execPath, [cli, 'build', here(catalog), '-o', here(out)], { stdio: 'inherit' });
}
