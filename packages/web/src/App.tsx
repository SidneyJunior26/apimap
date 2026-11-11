import type { GraphJson } from '@apimap/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { Nebula } from './background/Nebula';
import { Paper } from './background/Paper';
import { composeLayers, downloadCanvas, exportFileName } from './export/png';
import { createViewCache, type GraphController } from './graph/controller';
import { Toolbar } from './graph/Toolbar';
import { Graph3D } from './graph3d/Graph3D';
import { themeBackground } from './theme';
import { themedGraph } from './themedGraph';
import { loadStoredViewState, readViewState, storeViewState, writeViewState, type ViewState } from './viewState';
import { loadGraph } from './data';
import { DeleteDialog } from './editor/DeleteDialog';
import { EditorDrawer, type EditorTarget } from './editor/EditorDrawer';
import { applyFilters, initialFilters, refreshFilters, type FilterState } from './filters';
import { GraphCanvas } from './graph/GraphCanvas';
import { Sidebar } from './panel/Sidebar';
import { initialSelection, type Selection } from './state';

const prefersLight = () => window.matchMedia('(prefers-color-scheme: light)').matches;

export function App() {
  const [rawGraph, setGraph] = useState<GraphJson | null>(null);
  const [viewState, setViewState] = useState<ViewState>(() => readViewState(window.location.search, loadStoredViewState(), prefersLight()));
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const controllerRef = useRef<GraphController | null>(null);
  const viewCache = useRef(createViewCache());
  const [editable, setEditable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState | null>(null);
  const [selection, setSelection] = useState<Selection>(initialSelection);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const graphRef = useRef<GraphJson | null>(null);
  const graphKey = useRef('');
  const filtersRef = useRef<FilterState | null>(null);
  filtersRef.current = filters;
  // A save triggers both an explicit reload and a file-watch event: run one at a time and fold the rest into one.
  const inFlight = useRef<Promise<void> | null>(null);
  const queued = useRef(false);

  const fetchAndApply = useCallback(async () => {
    try {
      const loaded = await loadGraph();
      const key = JSON.stringify({ ...loaded.graph, generatedAt: '' });
      setEditable(loaded.editable);
      if (key === graphKey.current) return;
      graphKey.current = key;
      const prev = graphRef.current;
      const f = filtersRef.current;
      graphRef.current = loaded.graph;
      document.title = loaded.graph.name;
      setGraph(loaded.graph);
      setFilters(prev && f ? refreshFilters(prev, loaded.graph, f) : initialFilters(loaded.graph));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const reload = useCallback((): Promise<void> => {
    if (inFlight.current) {
      queued.current = true;
      return inFlight.current;
    }
    const run = (async () => {
      do {
        queued.current = false;
        await fetchAndApply();
      } while (queued.current);
      inFlight.current = null;
    })();
    inFlight.current = run;
    return run;
  }, [fetchAndApply]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // In the local editor, reload when any YAML file changes on disk.
  useEffect(() => {
    if (!editable) return;
    const events = new EventSource('./api/events');
    events.addEventListener('graph', () => void reload());
    return () => events.close();
  }, [editable, reload]);

  const { view, theme } = viewState;
  const graph = useMemo(() => (rawGraph ? themedGraph(rawGraph, theme) : null), [rawGraph, theme]);
  const visible = useMemo(() => (graph && filters ? applyFilters(graph, filters) : null), [graph, filters]);

  // Theme on <html>, view state in the URL (shareable) and in local storage (remembered).
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const query = writeViewState(viewState, new URL(window.location.href), prefersLight());
    window.history.replaceState(null, '', `${window.location.pathname}${query}${window.location.hash}`);
    storeViewState(viewState);
  }, [viewState, theme]);

  const exportPng = async () => {
    const layers = controllerRef.current?.snapshot();
    if (!graph || !layers?.length) return;
    setExporting(true);
    try {
      const canvas = composeLayers(layers, {
        background: themeBackground(theme),
        glow: theme === 'nebula' ? ['rgba(14, 116, 144, 0.28)', 'rgba(29, 78, 216, 0.22)', 'rgba(190, 24, 93, 0.10)'] : null,
        caption: `${graph.name} · ${new Date().toLocaleDateString()} · apimap`,
        captionColor: theme === 'paper' ? 'rgba(28, 35, 51, 0.6)' : 'rgba(230, 235, 244, 0.6)',
      });
      await downloadCanvas(canvas, exportFileName(graph.name, new Date()));
    } catch (err) {
      setNotice(`Could not export the image: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
    }
  };
  const select = (id: string | null) => setSelection((s) => ({ ...s, selectedId: id, focusMode: 'none' }));

  const openEdit = async (id: string) => {
    try {
      const { file, ...service } = await api.get(id);
      setEditor({ mode: 'edit', service, file });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (error && !graph) {
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
      {theme === 'paper' ? <Paper /> : <Nebula />}
      <main className="stage" aria-label="Dependency graph">
        {graph.nodes.length === 0 ? (
          <div className="state" role="status">
            <h1>No services yet</h1>
            {editable ? (
              <p>Use "New service" to add the first one.</p>
            ) : (
              <p>
                Add YAML files to <code>services/</code> and run <code>apimap build</code>.
              </p>
            )}
          </div>
        ) : view === '3d' ? (
          <Graph3D
            key={theme}
            graph={graph}
            visible={visible}
            query={filters.query}
            selection={selection}
            theme={theme}
            controllerRef={controllerRef}
            onSelect={select}
            onUnavailable={(reason) => {
              setNotice(`${reason} Showing the 2D view.`);
              setViewState((v) => ({ ...v, view: '2d' }));
            }}
          />
        ) : (
          <GraphCanvas
            key={theme}
            graph={graph}
            visible={visible}
            query={filters.query}
            selection={selection}
            theme={theme}
            cache={viewCache.current}
            controllerRef={controllerRef}
            onSelect={select}
          />
        )}
        {graph.nodes.length > 0 && (
          <Toolbar
            controller={controllerRef}
            view={view}
            theme={theme}
            exporting={exporting}
            onToggleView={() => setViewState((v) => ({ ...v, view: v.view === '3d' ? '2d' : '3d' }))}
            onToggleTheme={() => setViewState((v) => ({ ...v, theme: v.theme === 'paper' ? 'nebula' : 'paper' }))}
            onExport={() => void exportPng()}
            onResetFilters={() => setFilters(initialFilters(graph))}
          />
        )}
        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setNotice(null)}>
              ×
            </button>
          </div>
        )}
      </main>
      <Sidebar
        graph={graph}
        filters={filters}
        visible={visible}
        selection={selection}
        editable={editable}
        onFiltersChange={setFilters}
        onSelectionChange={setSelection}
        onCreate={(id) => setEditor({ mode: 'create', id })}
        onEdit={(id) => void openEdit(id)}
        onDelete={setDeleting}
      />
      {editor && (
        <EditorDrawer
          graph={graph}
          target={editor}
          onClose={() => setEditor(null)}
          onSaved={(id) => {
            setEditor(null);
            void reload().then(() => select(id));
          }}
        />
      )}
      {deleting && (
        <DeleteDialog
          graph={graph}
          id={deleting}
          onCancel={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            select(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}
