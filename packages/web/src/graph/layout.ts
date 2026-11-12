import type { GraphJson } from '@svclens/core';
import Graph from 'graphology';
import { inferSettings } from 'graphology-layout-forceatlas2';
import FA2Layout from 'graphology-layout-forceatlas2/worker';
import { groupOf } from '../filters';

export const GHOST_COLOR = 'rgba(148, 163, 184, 0.55)';

export interface NodeAttrs {
  x: number;
  y: number;
  size: number;
  color: string;
  label: string;
  kind: string;
  group: string;
  ghost: boolean;
}

export interface EdgeAttrs {
  weight: number;
}

export type ApiGraph = Graph<NodeAttrs, EdgeAttrs>;

/** Deterministic 0..1 value from a string (FNV-1a). */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function nodeSize(inDegree: number, outDegree: number): number {
  return 4 + 2 * Math.sqrt(inDegree + outDegree);
}

/** Builds a graphology graph with seeded positions: each group starts in its own sector so clusters form quickly. */
export type Positions = Map<string, { x: number; y: number }>;

export function toGraphology(g: GraphJson, previous?: Positions): ApiGraph {
  const graph: ApiGraph = new Graph({ type: 'directed', multi: true, allowSelfLoops: true });
  const groups = [...new Set(g.nodes.map(groupOf))].sort();
  for (const n of g.nodes) {
    const gi = groups.indexOf(groupOf(n));
    const angle = (gi / Math.max(groups.length, 1)) * Math.PI * 2 + (hash01(n.id) - 0.5) * 1.2;
    const radius = 60 + hash01(`${n.id}#r`) * 50;
    graph.addNode(n.id, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      size: nodeSize(n.inDegree, n.outDegree),
      color: n.ghost ? GHOST_COLOR : (g.kinds[n.kind]?.color ?? '#94a3b8'),
      label: n.label,
      kind: n.kind,
      group: groupOf(n),
      ghost: n.ghost,
    });
  }
  for (const e of g.edges) graph.addDirectedEdgeWithKey(e.id, e.source, e.target, { weight: e.confidence === 'confirmed' ? 1 : 0.6 });
  if (previous?.size) seedFromPrevious(graph, previous);
  return graph;
}

/** Keeps positions of nodes that already existed and puts new ones next to their known neighbors. */
function seedFromPrevious(graph: ApiGraph, previous: Positions): void {
  graph.forEachNode((id) => {
    const p = previous.get(id);
    if (p) graph.mergeNodeAttributes(id, { x: p.x, y: p.y });
  });
  graph.forEachNode((id) => {
    if (previous.has(id)) return;
    const known = graph.neighbors(id).map((n) => previous.get(n)).filter((p): p is { x: number; y: number } => Boolean(p));
    if (!known.length) return;
    const angle = hash01(id) * Math.PI * 2;
    graph.mergeNodeAttributes(id, {
      x: known.reduce((s, p) => s + p.x, 0) / known.length + Math.cos(angle) * 20,
      y: known.reduce((s, p) => s + p.y, 0) / known.length + Math.sin(angle) * 20,
    });
  });
}

/** Replaces the contents of `g` with `data`, keeping positions of nodes that already existed. */
export function syncGraphology(g: ApiGraph, data: GraphJson): void {
  const positions: Positions = new Map();
  g.forEachNode((id, a) => positions.set(id, { x: a.x, y: a.y }));
  const fresh = toGraphology(data, positions);
  g.clear();
  g.import(fresh.export());
}

/** Runs ForceAtlas2 in a web worker for `ms` milliseconds. Returns a function that stops and frees the worker. */
export function runLayout(graph: ApiGraph, ms = 2500): () => void {
  if (graph.order < 2) return () => {};
  const layout = new FA2Layout(graph, {
    settings: { ...inferSettings(graph), gravity: 0.6, scalingRatio: 14, slowDown: 6, barnesHutOptimize: graph.order > 300 },
    getEdgeWeight: 'weight',
  });
  layout.start();
  const timer = window.setTimeout(() => layout.stop(), ms);
  return () => {
    window.clearTimeout(timer);
    layout.kill();
  };
}
