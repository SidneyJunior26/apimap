import { ServiceSchema } from '@svclens/core';
import { parse } from 'yaml';
import type { Scanner } from './types.js';

export const MANIFEST_FILES = ['svclens.yaml', 'svclens.yml'];
const DeclaredSchema = ServiceSchema.partial();

/** `svclens.yaml` at the repo root: the owner's own description of the service. Its fields win over scanned hints. */
export const manifestScanner: Scanner = {
  name: 'manifest',
  async scan(repo, acc) {
    const file = MANIFEST_FILES.find((f) => repo.list().includes(f));
    if (!file) return;
    try {
      const result = DeclaredSchema.safeParse(parse(await repo.read(file)) ?? {});
      if (!result.success) {
        const issue = result.error.issues[0]!;
        acc.errors.push({ file, message: `${issue.path.join('.')}: ${issue.message}` });
        return;
      }
      acc.declared = result.data;
    } catch (err) {
      acc.errors.push({ file, message: err instanceof Error ? err.message.split('\n')[0]! : String(err) });
    }
  },
};
