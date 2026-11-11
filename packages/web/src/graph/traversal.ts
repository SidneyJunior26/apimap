import type { GraphJson } from '@apimap/core';

export type Direction = 'up' | 'down' | 'both';

/**
 * Breadth-first walk from `id`. "down" follows dependencies (what id calls),
 * "up" follows dependents (who calls id). Includes `id` itself.
 * When `edgeIds` is given, only those edges are walked.
 */
export function neighbors(g: GraphJson, id: string, dir: Direction, depth: number, edgeIds?: Set<string>): Set<string> {
  const out = new Map<string, string[]>();
  const inc = new Map<string, string[]>();
  for (const e of g.edges) {
    if (edgeIds && !edgeIds.has(e.id)) continue;
    out.set(e.source, [...(out.get(e.source) ?? []), e.target]);
    inc.set(e.target, [...(inc.get(e.target) ?? []), e.source]);
  }
  const seen = new Set([id]);
  let frontier = [id];
  for (let level = 0; level < depth && frontier.length > 0; level++) {
    const next: string[] = [];
    for (const cur of frontier) {
      const steps = [...(dir !== 'up' ? (out.get(cur) ?? []) : []), ...(dir !== 'down' ? (inc.get(cur) ?? []) : [])];
      for (const n of steps) {
        if (!seen.has(n)) {
          seen.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return seen;
}
