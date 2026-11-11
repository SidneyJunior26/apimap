import type { Catalog, Diagnostic } from './load.js';

/** Cross-file checks that a single-file schema cannot express. */
export function validateCatalog(c: Catalog): Diagnostic[] {
  const out: Diagnostic[] = [];
  const filesById = new Map<string, string[]>();
  for (const s of c.services) filesById.set(s.id, [...(filesById.get(s.id) ?? []), s.file]);

  for (const [id, files] of filesById) {
    if (files.length > 1) {
      out.push({ level: 'error', code: 'duplicate-id', file: files[1], message: `id "${id}" is declared in ${files.join(', ')}` });
    }
  }

  for (const s of c.services) {
    if (!c.kinds[s.kind]) {
      out.push({ level: 'error', code: 'unknown-kind', file: s.file, path: 'kind', message: `unknown kind "${s.kind}" (declare it under kinds: in apimap.config.yaml)` });
    }
    if (!s.owner) {
      out.push({ level: 'warning', code: 'missing-owner', file: s.file, path: 'owner', message: `service "${s.id}" has no owner` });
    }
    const seen = new Set<string>();
    s.dependsOn.forEach((d, i) => {
      const key = `${d.target}:${d.protocol}`;
      if (seen.has(key)) {
        out.push({ level: 'warning', code: 'duplicate-edge', file: s.file, path: `dependsOn.${i}`, message: `duplicate dependency on "${d.target}" (${d.protocol})` });
      }
      seen.add(key);
      if (!filesById.has(d.target)) {
        out.push({ level: 'warning', code: 'unresolved-target', file: s.file, path: `dependsOn.${i}.target`, message: `"${d.target}" is not a known service; it will be shown as a ghost node` });
      }
    });
  }
  return out;
}
