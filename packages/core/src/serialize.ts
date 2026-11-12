// Browser-safe: no Node modules here. Used by the CLI writer and by the web viewer.
import { Document } from 'yaml';
import type { Dependency, Service } from './schema.js';

export const SERVICE_SCHEMA_URL = 'https://raw.githubusercontent.com/SidneyJunior26/svclens/main/packages/core/schema/service.schema.json';

export const KEY_ORDER = ['id', 'name', 'kind', 'group', 'owner', 'repo', 'description', 'tech', 'hosts', 'tags', 'locked', 'dependsOn'];

export function plainDependency(d: Dependency): Record<string, unknown> {
  return {
    target: d.target,
    ...(d.protocol !== 'http' ? { protocol: d.protocol } : {}),
    confidence: d.confidence,
    origin: d.origin,
    ...(d.evidence.length ? { evidence: d.evidence } : {}),
    ...(d.note ? { note: d.note } : {}),
  };
}

/** Service as it should appear on disk: defaults and empty values omitted, known keys first. */
export function toPlainService(s: Service): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const known = s as Record<string, unknown>;
  const keys = [...KEY_ORDER, ...Object.keys(s).filter((k) => !KEY_ORDER.includes(k))];
  for (const key of keys) {
    const v = known[key];
    if (v === undefined || v === false || (Array.isArray(v) && v.length === 0)) continue;
    out[key] = key === 'dependsOn' ? s.dependsOn.map(plainDependency) : v;
  }
  return out;
}


/** YAML text for a new service file, with the editor schema header. */
export function serviceToYaml(service: Service): string {
  const doc = new Document(toPlainService(service));
  doc.commentBefore = ` yaml-language-server: $schema=${SERVICE_SCHEMA_URL}`;
  return doc.toString({ lineWidth: 0 });
}
