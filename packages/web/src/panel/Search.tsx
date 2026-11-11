import type { GraphJson } from '@apimap/core';
import { searchMatches, type FilterState, type Visible } from '../filters';

interface Props {
  graph: GraphJson;
  filters: FilterState;
  visible: Visible;
  onQueryChange: (q: string) => void;
  onSelect: (id: string) => void;
}

const MAX_RESULTS = 8;

export function Search({ graph, filters, visible, onQueryChange, onSelect }: Props) {
  const matches = searchMatches(graph, filters.query, visible);
  const results = matches ? graph.nodes.filter((n) => matches.has(n.id)) : [];

  return (
    <section className="section">
      <label className="sr-only" htmlFor="search">
        Search services
      </label>
      <input
        id="search"
        className="input"
        type="search"
        placeholder="Search services, owners, hosts…"
        autoComplete="off"
        value={filters.query}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      {filters.query.trim() && (
        <ul className="results" aria-label="Search results">
          {results.length === 0 && <li className="muted">No matches</li>}
          {results.slice(0, MAX_RESULTS).map((n) => (
            <li key={n.id}>
              <button type="button" className="result" onClick={() => onSelect(n.id)}>
                <span className="dot" style={{ background: graph.kinds[n.kind]?.color }} aria-hidden />
                <span className="result__label">{n.label}</span>
                <span className="muted result__kind">{graph.kinds[n.kind]?.label ?? n.kind}</span>
              </button>
            </li>
          ))}
          {results.length > MAX_RESULTS && <li className="muted">+{results.length - MAX_RESULTS} more</li>}
        </ul>
      )}
    </section>
  );
}
