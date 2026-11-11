import type { Confidence, GraphJson } from '@apimap/core';
import { CONFIDENCES, countByKind, groupOf, UNGROUPED, type FilterState } from '../filters';

interface Props {
  graph: GraphJson;
  filters: FilterState;
  onChange: (f: FilterState) => void;
}

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function Filters({ graph, filters, onChange }: Props) {
  const kindCounts = countByKind(graph);
  const kinds = Object.keys(kindCounts).sort((a, b) => (graph.kinds[a]?.label ?? a).localeCompare(graph.kinds[b]?.label ?? b));
  const groupCounts: Record<string, number> = {};
  for (const n of graph.nodes) groupCounts[groupOf(n)] = (groupCounts[groupOf(n)] ?? 0) + 1;
  const groups = Object.keys(groupCounts).sort();
  const allKinds = filters.kinds.size === kinds.length;

  return (
    <section className="section" aria-label="Filters">
      <div className="section__head">
        <h2>Kinds</h2>
        <button type="button" className="link-btn" onClick={() => onChange({ ...filters, kinds: allKinds ? new Set() : new Set(kinds) })}>
          {allKinds ? 'Clear all' : 'Select all'}
        </button>
      </div>
      <ul className="checks">
        {kinds.map((k) => (
          <li key={k}>
            <label className="check">
              <input type="checkbox" checked={filters.kinds.has(k)} onChange={() => onChange({ ...filters, kinds: toggle(filters.kinds, k) })} />
              <span className="dot" style={{ background: graph.kinds[k]?.color }} aria-hidden />
              <span className="check__label">{graph.kinds[k]?.label ?? k}</span>
              <span className="muted">{kindCounts[k]}</span>
            </label>
          </li>
        ))}
      </ul>

      {groups.length > 1 && (
        <>
          <h2>Groups</h2>
          <ul className="checks">
            {groups.map((gid) => (
              <li key={gid}>
                <label className="check">
                  <input type="checkbox" checked={filters.groups.has(gid)} onChange={() => onChange({ ...filters, groups: toggle(filters.groups, gid) })} />
                  <span className="check__label">{gid === UNGROUPED ? 'No group' : (graph.groups[gid]?.label ?? gid)}</span>
                  <span className="muted">{groupCounts[gid]}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Links</h2>
      <ul className="checks">
        {CONFIDENCES.map((c: Confidence) => (
          <li key={c}>
            <label className="check">
              <input type="checkbox" checked={filters.confidences.has(c)} onChange={() => onChange({ ...filters, confidences: toggle(filters.confidences, c) })} />
              <span className={`line line--${c}`} aria-hidden />
              <span className="check__label">{c}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
