import type { GraphJson } from '@apimap/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Service } from '@apimap/core';
import { toMermaid } from '@apimap/core/mermaid';
import { ServiceSchema } from '@apimap/core/schema';
import { serviceToYaml } from '@apimap/core/serialize';
import { api, ApiError } from './api';
import { serviceFromGraph } from './propose/fromGraph';
import { deleteFileUrl, editFileUrl, newFileUrl } from './propose/github';
import { ProposeDialog, type Proposal } from './propose/ProposeDialog';
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
import { initialSelection, type EditMode, type Selection } from './state';

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
  const [proposal, setProposal] = useState<Proposal | null>(null);
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
        glow: theme === 'nebula' ? ['rgba(14, 116, 144, 0.14)', 'rgba(29, 78, 216, 0.11)', 'rgba(190, 24, 93, 0.05)'] : null,
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
  const copyMermaid = async () => {
    if (!rawGraph || !visible) return;
    const subset: GraphJson = {
      ...rawGraph,
      nodes: rawGraph.nodes.filter((n) => visible.nodeIds.has(n.id)),
      edges: rawGraph.edges.filter((e) => visible.edgeIds.has(e.id)),
    };
    try {
      await navigator.clipboard.writeText(toMermaid(subset));
      setNotice(`Mermaid diagram with ${subset.nodes.length} services copied. Paste it in a Markdown file inside a mermaid code block.`);
    } catch {
      setNotice('The browser blocked the clipboard. Use "apimap export" on the command line instead.');
    }
  };
  const select = (id: string | null) => setSelection((s) => ({ ...s, selectedId: id, focusMode: 'none' }));

  const editMode: EditMode = editable ? 'local' : rawGraph?.edit ? 'propose' : null;
  const fileOf = (id: string) => rawGraph?.nodes.find((n) => n.id === id)?.file ?? `services/${id}.yaml`;

  const openEdit = async (id: string) => {
    try {
      if (editMode === 'propose' && rawGraph) {
        setEditor({ mode: 'edit', service: serviceFromGraph(rawGraph, id), file: fileOf(id) });
        return;
      }
      const { file, ...service } = await api.get(id);
      setEditor({ mode: 'edit', service, file });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  };

  /** Local editor: write through the API. */
  const saveLocal = async (service: Service, isNew: boolean) => {
    const saved = isNew ? await api.create(service) : await api.update(service);
    setEditor(null);
    await reload();
    select(saved.id);
  };

  /** Published site: check the service here, then hand over to GitHub. */
  const propose = async (service: Service, isNew: boolean) => {
    const target = rawGraph?.edit;
    if (!target) return;
    const parsed = ServiceSchema.safeParse(service);
    if (!parsed.success) {
      throw new ApiError('Please fix the highlighted fields.', 400, parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    }
    if (isNew && rawGraph.nodes.some((n) => n.id === service.id && !n.ghost)) {
      throw new ApiError(`id "${service.id}" already exists`, 409, [{ path: 'id', message: 'already used by another service' }]);
    }
    const yaml = serviceToYaml(parsed.data);
    const file = isNew ? `services/${service.id}.yaml` : fileOf(service.id);
    const link = isNew ? newFileUrl(target, file, yaml) : { url: editFileUrl(target, file), prefilled: false };
    setEditor(null);
    setProposal({ kind: isNew ? 'new' : 'edit', url: link.url, prefilled: link.prefilled, yaml, file });
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
            {editMode ? (
              <p>Use "{editMode === 'local' ? 'New service' : 'Propose service'}" to add the first one.</p>
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
            onCopyMermaid={() => void copyMermaid()}
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
        editMode={editMode}
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
          onSubmit={editMode === 'propose' ? propose : saveLocal}
          submitLabel={editMode === 'propose' ? { create: 'Continue on GitHub', edit: 'Continue on GitHub' } : undefined}
          note={
            editMode === 'propose'
              ? 'Your change becomes a pull request on GitHub. Nothing is saved here, and comments in the YAML file are not carried over when editing.'
              : undefined
          }
          onClose={() => setEditor(null)}
        />
      )}
      {deleting && (
        <DeleteDialog
          graph={graph}
          id={deleting}
          onCancel={() => setDeleting(null)}
          {...(editMode === 'propose' && rawGraph?.edit
            ? {
                confirmLabel: 'Continue on GitHub',
                description: `GitHub opens a page to delete ${fileOf(deleting)} and create a pull request.`,
                onConfirm: async () => {
                  window.open(deleteFileUrl(rawGraph.edit!, fileOf(deleting)), '_blank', 'noopener');
                  setDeleting(null);
                },
              }
            : {
                onConfirm: async () => {
                  await api.remove(deleting);
                  setDeleting(null);
                  select(null);
                  await reload();
                },
              })}
        />
      )}
      {proposal && <ProposeDialog proposal={proposal} onClose={() => setProposal(null)} />}
    </div>
  );
}
