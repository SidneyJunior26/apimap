import type { Confidence, GraphJson } from '@svclens/core';
import type { Visible } from '../filters';
import { nodeSize } from '../graph/layout';

export const GHOST_COLOR_3D = '#94a3b8';

export interface Node3D {
  id: string;
  label: string;
  color: string;
  val: number;
  ghost: boolean;
  x?: number;
  y?: number;
  z?: number;
}

export interface Link3D {
  id: string;
  source: string;
  target: string;
  color: string;
  confidence: Confidence;
  particles: number;
}

/** Visible part of the graph in the shape 3d-force-graph expects. Colors come from `g.kinds` (already themed). */
export function toForceData(g: GraphJson, visible: Visible, opts: { animate: boolean }): { nodes: Node3D[]; links: Link3D[] } {
  const kindOf = new Map(g.nodes.map((n) => [n.id, n.kind]));
  const colorOf = (kind: string | undefined) => g.kinds[kind ?? '']?.color ?? GHOST_COLOR_3D;
  return {
    nodes: g.nodes
      .filter((n) => visible.nodeIds.has(n.id))
      .map((n) => ({
        id: n.id,
        label: n.label,
        color: n.ghost ? GHOST_COLOR_3D : colorOf(n.kind),
        // Sphere volume grows with val; square the 2D radius so sizes read the same.
        val: nodeSize(n.inDegree, n.outDegree) ** 2 / 8,
        ghost: n.ghost,
      })),
    links: g.edges
      .filter((e) => visible.edgeIds.has(e.id))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        color: colorOf(kindOf.get(e.source)),
        confidence: e.confidence,
        particles: opts.animate ? (e.confidence === 'confirmed' ? 2 : 1) : 0,
      })),
  };
}
