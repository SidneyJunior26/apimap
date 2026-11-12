import { ServiceSchema, type Dependency, type Service } from './schema.js';
import { sameValue } from './stable.js';

export interface ScanHints {
  name?: string;
  kind?: string;
  role?: Service['role'];
  description?: string;
  repo?: string;
  tech: string[];
  hosts: string[];
}

export type ScannedDependency = Dependency & { origin: 'scan' };

export interface MergeResult {
  service: Service;
  /** Edge keys (`target:protocol`) added by this scan. */
  added: string[];
  /** Edge keys previously found by scan and now gone. */
  removed: string[];
  changed: boolean;
}

export const edgeKey = (d: Pick<Dependency, 'target' | 'protocol'>): string => `${d.target}:${d.protocol}`;

const union = (a: string[], b: string[]): string[] => [...new Set([...a, ...b])];

/**
 * Applies a scan result to a service. Never touches `agent`/`manual` dependencies or fields
 * someone already filled in; `locked` services are returned as-is.
 */
export function mergeScan(existing: Service | undefined, id: string, hints: ScanHints, deps: ScannedDependency[]): MergeResult {
  if (existing?.locked) return { service: existing, added: [], removed: [], changed: false };

  const base: Service =
    existing ?? ServiceSchema.parse({ id, name: hints.name ?? id, kind: hints.kind ?? 'core' });

  const kept = base.dependsOn.filter((d) => d.origin !== 'scan');
  const blocked = new Set(kept.map(edgeKey));
  const scanned = new Map<string, ScannedDependency>();
  for (const d of [...deps].sort((a, b) => edgeKey(a).localeCompare(edgeKey(b)))) {
    const key = edgeKey(d);
    if (d.target === id || blocked.has(key) || scanned.has(key)) continue;
    scanned.set(key, d);
  }

  const before = new Set(base.dependsOn.filter((d) => d.origin === 'scan').map(edgeKey));
  const after = new Set(scanned.keys());

  const service: Service = {
    ...base,
    ...((base.role ?? hints.role) ? { role: base.role ?? hints.role } : {}),
    description: base.description ?? hints.description,
    repo: base.repo ?? hints.repo,
    tech: union(base.tech, hints.tech),
    hosts: union(base.hosts, hints.hosts),
    dependsOn: [...kept, ...scanned.values()],
  };

  return {
    service,
    added: [...after].filter((k) => !before.has(k)),
    removed: [...before].filter((k) => !after.has(k)),
    changed: !existing || !sameValue(existing, service),
  };
}
