// Builds public/graph.json from the acme demo catalog for local development.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildGraph, loadCatalog } from '../../core/src/index.js';

const dir = process.argv[2] ?? fileURLToPath(new URL('../../../examples/acme-demo', import.meta.url));
const { catalog } = await loadCatalog(dir);
await writeFile(new URL('../public/graph.json', import.meta.url), JSON.stringify(buildGraph(catalog)));
console.log(`graph.json written from ${dir}`);
