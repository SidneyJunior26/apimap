import type { GraphEdge, GraphJson, GraphNode } from './graph.js';

const RESERVED = new Set(['end', 'graph', 'subgraph', 'flowchart', 'style', 'class', 'classdef', 'click', 'linkstyle', 'default']);

function escapeLabel(text: string): string {
  return text.replace(/"/g, '#quot;').replace(/\[/g, '#91;').replace(/\]/g, '#93;').replace(/</g, '#lt;').replace(/>/g, '#gt;');
}

function safe(raw: string): string {
  let id = raw.replace(/[^a-zA-Z0-9]/g, '_');
  if (/^\d/.test(id)) id = `n_${id}`;
  if (RESERVED.has(id.toLowerCase())) id = `${id}_`;
  return id;
}

function shape(n: GraphNode, label: string): string {
  if (n.kind === 'database') return `[("${label}")]`;
  if (n.kind === 'external') return `(["${label}"])`;
  if (n.kind === 'queue') return `[["${label}"]]`;
  return `["${label}"]`;
}

const ARROWS: Record<GraphEdge['confidence'], string> = { confirmed: '-->', inferred: '-.->', manual: '==>' };

/** Mermaid flowchart of the graph: groups as subgraphs, kinds as classes, confidence as arrow style. */
export function toMermaid(g: GraphJson, opts: { direction?: 'LR' | 'TB' } = {}): string {
  const ids = new Map<string, string>();
  const used = new Set<string>();
  for (const n of g.nodes) {
    let id = safe(n.id);
    for (let i = 2; used.has(id); i++) id = `${safe(n.id)}_${i}`;
    used.add(id);
    ids.set(n.id, id);
  }

  const lines = [`flowchart ${opts.direction ?? 'LR'}`];
  const nodeLine = (n: GraphNode, indent: string) => `${indent}${ids.get(n.id)}${shape(n, escapeLabel(n.label))}`;

  const groups = new Map<string, GraphNode[]>();
  for (const n of g.nodes) {
    if (n.group) groups.set(n.group, [...(groups.get(n.group) ?? []), n]);
    else lines.push(nodeLine(n, '  '));
  }
  for (const [group, nodes] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`  subgraph ${safe(`g_${group}`)}["${escapeLabel(g.groups[group]?.label ?? group)}"]`);
    for (const n of nodes) lines.push(nodeLine(n, '    '));
    lines.push('  end');
  }

  for (const e of g.edges) {
    const label = e.protocol !== 'http' ? `|${escapeLabel(e.protocol)}|` : '';
    lines.push(`  ${ids.get(e.source)} ${ARROWS[e.confidence]}${label} ${ids.get(e.target)}`);
  }

  const byKind = new Map<string, string[]>();
  for (const n of g.nodes) {
    const cls = n.ghost ? 'ghost' : `k_${safe(n.kind)}`;
    byKind.set(cls, [...(byKind.get(cls) ?? []), ids.get(n.id)!]);
  }
  for (const [cls, members] of byKind) {
    if (cls === 'ghost') lines.push('  classDef ghost fill:none,stroke:#94a3b8,stroke-dasharray:4 4');
    else {
      const color = g.kinds[g.nodes.find((n) => ids.get(n.id) === members[0])!.kind]?.color ?? '#94a3b8';
      lines.push(`  classDef ${cls} fill:${color}33,stroke:${color}`);
    }
    lines.push(`  class ${members.join(',')} ${cls}`);
  }
  return `${lines.join('\n')}\n`;
}
