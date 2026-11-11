import type { GraphEdge, GraphJson, GraphNode } from '@apimap/core';

export function node(id: string, extra: Partial<GraphNode> = {}): GraphNode {
  return { id, label: id, kind: 'core', tech: [], hosts: [], tags: [], ghost: false, inDegree: 0, outDegree: 0, ...extra };
}

export function edge(source: string, target: string, extra: Partial<GraphEdge> = {}): GraphEdge {
  return { id: `${source}->${target}:http`, source, target, protocol: 'http', confidence: 'confirmed', origin: 'scan', evidence: [], ...extra };
}

export function graph(nodes: GraphNode[], edges: GraphEdge[] = []): GraphJson {
  return { version: 1, name: 'T', generatedAt: '', kinds: {}, groups: {}, nodes, edges };
}
