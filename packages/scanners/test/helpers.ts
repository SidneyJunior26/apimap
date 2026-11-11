import { fileURLToPath } from 'node:url';

export const repo = (name: string) => fileURLToPath(new URL(`./fixtures/repos/${name}`, import.meta.url));

export const hostsOf = (refs: Array<{ host: string }>) => [...new Set(refs.map((r) => r.host))].sort();
