import type { KindDef } from './kinds.js';
import type { Catalog } from './load.js';
import type { Config, Confidence, Evidence, Origin } from './schema.js';

export interface GraphNode {
  id: string;
  label: string;
  kind: string;
  group?: string;
  owner?: string;
  repo?: string;
  tech: string[];
  hosts: string[];
  description?: string;
  tags: string[];
  file?: string;
  ghost: boolean;
  inDegree: number;
  outDegree: number;
}

export interface GraphEdge {
  /** `${source}->${target}:${protocol}` */
  id: string;
  source: string;
  target: string;
  protocol: string;
  confidence: Confidence;
  origin: Origin;
  evidence: Evidence[];
  note?: string;
}

export interface GraphJson {
  version: 1;
  name: string;
  generatedAt: string;
  kinds: Record<string, KindDef>;
  groups: Config['groups'];
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Builds the serializable graph. First declaration wins on duplicate ids or edges. */
export function buildGraph(c: Catalog, now: Date = new Date()): GraphJson {
  const nodes = new Map<string, GraphNode>();
  for (const s of c.services) {
    if (nodes.has(s.id)) continue;
    nodes.set(s.id, {
      id: s.id,
      label: s.name,
      kind: s.kind,
      group: s.group,
      owner: s.owner,
      repo: s.repo,
      tech: s.tech,
      hosts: s.hosts,
      description: s.description,
      tags: s.tags,
      file: s.file,
      ghost: false,
      inDegree: 0,
      outDegree: 0,
    });
  }

  const edges = new Map<string, GraphEdge>();
  for (const s of c.services) {
    for (const d of s.dependsOn) {
      const id = `${s.id}->${d.target}:${d.protocol}`;
      if (edges.has(id)) continue;
      edges.set(id, { id, source: s.id, target: d.target, protocol: d.protocol, confidence: d.confidence, origin: d.origin, evidence: d.evidence, note: d.note });
      if (!nodes.has(d.target)) {
        nodes.set(d.target, { id: d.target, label: d.target, kind: 'external', tech: [], hosts: [], tags: [], ghost: true, inDegree: 0, outDegree: 0 });
      }
    }
  }

  for (const e of edges.values()) {
    nodes.get(e.source)!.outDegree++;
    nodes.get(e.target)!.inDegree++;
  }

  return {
    version: 1,
    name: c.config.name,
    generatedAt: now.toISOString(),
    kinds: c.kinds,
    groups: c.config.groups,
    nodes: [...nodes.values()].sort(byId),
    edges: [...edges.values()].sort(byId),
  };
}
