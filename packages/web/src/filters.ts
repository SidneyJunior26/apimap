import type { Confidence, GraphJson, GraphNode } from '@apimap/core';

export const UNGROUPED = 'ungrouped';
export const CONFIDENCES: Confidence[] = ['confirmed', 'inferred', 'manual'];

export interface FilterState {
  query: string;
  kinds: Set<string>;
  groups: Set<string>;
  confidences: Set<Confidence>;
}

export interface Visible {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

/** Lowercase and strip diacritics so "autorizacao" matches "Autorização". */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export const groupOf = (n: GraphNode): string => n.group ?? UNGROUPED;

export function initialFilters(g: GraphJson): FilterState {
  return {
    query: '',
    kinds: new Set(g.nodes.map((n) => n.kind)),
    groups: new Set(g.nodes.map(groupOf)),
    confidences: new Set(CONFIDENCES),
  };
}

function searchText(n: GraphNode): string {
  return normalize([n.id, n.label, n.owner ?? '', n.group ?? '', ...n.tags, ...n.hosts, ...n.tech].join(' '));
}

export function matchesQuery(n: GraphNode, query: string): boolean {
  const q = normalize(query.trim());
  return q === '' || searchText(n).includes(q);
}

export function applyFilters(g: GraphJson, f: FilterState): Visible {
  const nodeIds = new Set(
    g.nodes.filter((n) => f.kinds.has(n.kind) && f.groups.has(groupOf(n)) && matchesQuery(n, f.query)).map((n) => n.id),
  );
  const edgeIds = new Set(
    g.edges.filter((e) => f.confidences.has(e.confidence) && nodeIds.has(e.source) && nodeIds.has(e.target)).map((e) => e.id),
  );
  return { nodeIds, edgeIds };
}

export function countByKind(g: GraphJson): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of g.nodes) out[n.kind] = (out[n.kind] ?? 0) + 1;
  return out;
}
