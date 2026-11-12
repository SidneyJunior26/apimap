import path from 'node:path';
import { DependencySchema, loadCatalog, writeServiceFile, type Evidence } from '@svclens/core';

export interface LinkOptions {
  protocol?: string;
  confidence?: string;
  origin?: string;
  /** `file` or `file:line` */
  evidence?: string[];
  note?: string;
}

export function parseEvidence(raw: string): Evidence {
  const m = /^(.*):(\d+)$/.exec(raw);
  return m ? { file: m[1]!, line: Number(m[2]) } : { file: raw };
}

/** Adds or updates one dependency of `sourceId`, keeping comments and other entries. Returns the exit code. */
export async function runLink(dir: string, sourceId: string, target: string, opts: LinkOptions): Promise<number> {
  const root = path.resolve(dir);
  const { catalog } = await loadCatalog(root);
  const service = catalog.services.find((s) => s.id === sourceId);
  if (!service) {
    console.error(`unknown service "${sourceId}"`);
    return 1;
  }
  if (service.locked) {
    console.error(`service "${sourceId}" is locked`);
    return 1;
  }
  const parsed = DependencySchema.safeParse({
    target,
    protocol: opts.protocol ?? 'http',
    confidence: opts.confidence ?? 'inferred',
    origin: opts.origin ?? 'agent',
    evidence: (opts.evidence ?? []).map(parseEvidence),
    note: opts.note,
  });
  if (!parsed.success) {
    console.error(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'));
    return 1;
  }
  const dep = parsed.data;
  const i = service.dependsOn.findIndex((d) => d.target === dep.target && d.protocol === dep.protocol);
  const dependsOn = [...service.dependsOn];
  if (i >= 0) dependsOn[i] = dep;
  else dependsOn.push(dep);

  const { file, ...rest } = service;
  await writeServiceFile(path.join(root, file), { ...rest, dependsOn });
  if (!catalog.services.some((s) => s.id === target)) console.log(`note: "${target}" is not in the catalog yet; it will show as a ghost node`);
  console.log(`linked ${sourceId} -> ${target} (${dep.protocol}, ${dep.confidence})`);
  return 0;
}
