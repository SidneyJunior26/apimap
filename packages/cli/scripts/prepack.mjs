// npm shows the package README; keep the repository README and LICENSE as the single source.
import { copyFileSync } from 'node:fs';

for (const file of ['README.md', 'LICENSE']) {
  copyFileSync(new URL(`../../../${file}`, import.meta.url), new URL(`../${file}`, import.meta.url));
}
