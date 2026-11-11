import type { GraphJson, Service } from '@apimap/core';

/**
 * The published site only has graph.json, not the YAML files. This rebuilds the service from it.
 * Comments and unknown keys of the original file are not available here.
 */
export function serviceFromGraph(g: GraphJson, id: string): Service {
  const n = g.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`unknown service "${id}"`);
  const service: Service = {
    id: n.id,
    name: n.label,
    kind: n.kind,
    tech: n.tech,
    hosts: n.hosts,
    tags: n.tags,
    locked: Boolean(n.locked),
    dependsOn: g.edges
      .filter((e) => e.source === id)
      .map((e) => ({ target: e.target, protocol: e.protocol, confidence: e.confidence, origin: e.origin, evidence: e.evidence, ...(e.note ? { note: e.note } : {}) })),
  };
  for (const key of ['group', 'owner', 'repo', 'description'] as const) if (n[key]) service[key] = n[key];
  return service;
}
