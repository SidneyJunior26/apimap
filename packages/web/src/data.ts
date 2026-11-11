import type { GraphJson } from '@apimap/core';

export async function loadGraph(url = './graph.json'): Promise<GraphJson> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status}). Run "apimap build" to generate it.`);
  const graph = (await res.json()) as GraphJson;
  if (graph.version !== 1) throw new Error(`Unsupported graph.json version ${String(graph.version)}`);
  return graph;
}
