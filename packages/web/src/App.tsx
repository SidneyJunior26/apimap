import type { GraphJson } from '@apimap/core';
import { useEffect, useMemo, useState } from 'react';
import { loadGraph } from './data';
import { applyFilters, initialFilters, type FilterState } from './filters';
import { Sidebar } from './panel/Sidebar';
import { initialSelection, type Selection } from './state';

export function App() {
  const [graph, setGraph] = useState<GraphJson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState | null>(null);
  const [selection, setSelection] = useState<Selection>(initialSelection);

  useEffect(() => {
    loadGraph()
      .then((g) => {
        document.title = g.name;
        setGraph(g);
        setFilters(initialFilters(g));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const visible = useMemo(() => (graph && filters ? applyFilters(graph, filters) : null), [graph, filters]);

  if (error) {
    return (
      <main className="state" role="alert">
        <h1>Could not load the map</h1>
        <p>{error}</p>
      </main>
    );
  }

  if (!graph || !filters || !visible) {
    return (
      <main className="state" aria-busy="true">
        <p>Loading map…</p>
      </main>
    );
  }

  return (
    <div className="app">
      <main className="stage" aria-label="Dependency graph">
        {graph.nodes.length === 0 ? (
          <div className="state" role="status">
            <h1>No services yet</h1>
            <p>
              Add YAML files to <code>services/</code> and run <code>apimap build</code>.
            </p>
          </div>
        ) : (
          <div className="canvas" data-testid="graph-canvas" />
        )}
      </main>
      <Sidebar
        graph={graph}
        filters={filters}
        visible={visible}
        selection={selection}
        onFiltersChange={setFilters}
        onSelectionChange={setSelection}
      />
    </div>
  );
}
