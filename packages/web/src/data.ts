import type { GraphJson } from '@apimap/core';

export interface Loaded {
  graph: GraphJson;
  /** True when served by `apimap serve`, which exposes the editing API. */
  editable: boolean;
}

export function isEditable(): boolean {
  return document.querySelector('meta[name="apimap-editable"]')?.getAttribute('content') === 'true';
}

export async function loadGraph(): Promise<Loaded> {
  const editable = isEditable();
  const url = editable ? './api/graph' : './graph.json';
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status}). Run "apimap build" to generate it.`);
  const body = (await res.json()) as GraphJson | { graph: GraphJson };
  const graph = 'graph' in body ? body.graph : body;
  if (graph.version !== 1) throw new Error(`Unsupported graph.json version ${String(graph.version)}`);
  return { graph, editable };
}
