import type { Confidence } from './schema.js';
import type { GraphEdge, GraphJson, GraphNode } from './graph.js';
import { sameValue } from './stable.js';

export interface GraphDiff {
  addedServices: GraphNode[];
  removedServices: GraphNode[];
  changedServices: Array<{ id: string; fields: string[] }>;
  addedEdges: GraphEdge[];
  removedEdges: GraphEdge[];
  changedEdges: Array<{ id: string; from: Confidence; to: Confidence }>;
}

const FIELDS = ['label', 'kind', 'group', 'owner', 'repo', 'description', 'tech', 'hosts', 'tags', 'locked'] as const;

/** What changed between two graphs. Ghost nodes (targets missing from the catalog) are not services and are skipped. */
export function diffGraphs(before: GraphJson, after: GraphJson): GraphDiff {
  const real = (g: GraphJson) => new Map(g.nodes.filter((n) => !n.ghost).map((n) => [n.id, n]));
  const a = real(before);
  const b = real(after);
  const ea = new Map(before.edges.map((e) => [e.id, e]));
  const eb = new Map(after.edges.map((e) => [e.id, e]));
  return {
    addedServices: [...b.values()].filter((n) => !a.has(n.id)),
    removedServices: [...a.values()].filter((n) => !b.has(n.id)),
    changedServices: [...b.values()]
      .filter((n) => a.has(n.id))
      .map((n) => ({ id: n.id, fields: FIELDS.filter((f) => !sameValue(a.get(n.id)![f], n[f])) as string[] }))
      .filter((c) => c.fields.length > 0),
    addedEdges: [...eb.values()].filter((e) => !ea.has(e.id)),
    removedEdges: [...ea.values()].filter((e) => !eb.has(e.id)),
    changedEdges: [...eb.values()]
      .filter((e) => ea.has(e.id) && ea.get(e.id)!.confidence !== e.confidence)
      .map((e) => ({ id: e.id, from: ea.get(e.id)!.confidence, to: e.confidence })),
  };
}

const isEmpty = (d: GraphDiff) => Object.values(d).every((list) => list.length === 0);

/** Human summary of a diff. Markdown is meant for pull request comments. */
export function formatDiff(d: GraphDiff, format: 'text' | 'markdown'): string {
  if (isEmpty(d)) return 'No changes in services or links.';
  const md = format === 'markdown';
  const code = (s: string) => (md ? `\`${s}\`` : s);
  const link = (e: Pick<GraphEdge, 'source' | 'target' | 'protocol'>) => `${code(e.source)} → ${code(e.target)} (${e.protocol}`;
  const sections: Array<[string, string[]]> = [
    ['Services added', d.addedServices.map((n) => `${code(n.id)} ${n.label} (${n.kind})`)],
    ['Services removed', d.removedServices.map((n) => `${code(n.id)} ${n.label}`)],
    ['Services changed', d.changedServices.map((c) => `${code(c.id)}: ${c.fields.join(', ')}`)],
    ['Links added', d.addedEdges.map((e) => `${link(e)}, ${e.confidence})`)],
    ['Links removed', d.removedEdges.map((e) => `${link(e)})`)],
    ['Links with new confidence', d.changedEdges.map((c) => {
      const [source, rest] = c.id.split('->') as [string, string];
      const [target, protocol] = rest.split(':') as [string, string];
      return `${link({ source, target, protocol })}): ${c.from} → ${c.to}`;
    })],
  ];
  const n = (x: number, sign: string) => (md ? `**${sign}${x}**` : `${sign}${x}`);
  const summary = `${n(d.addedServices.length, '+')} services, ${n(d.removedServices.length, '-')} services, ${n(d.changedServices.length, '~')} changed · ${n(d.addedEdges.length, '+')} links, ${n(d.removedEdges.length, '-')} links, ${n(d.changedEdges.length, '~')} changed`;
  const out = md ? ['### svclens', '', summary] : [summary];
  for (const [title, items] of sections) {
    if (!items.length) continue;
    out.push('', md ? `#### ${title}` : `${title}:`, ...items.map((i) => (md ? `- ${i}` : `  ${i}`)));
  }
  return out.join('\n');
}
