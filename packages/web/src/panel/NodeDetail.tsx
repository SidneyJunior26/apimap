import type { GraphEdge, GraphJson } from '@apimap/core';
import { EDIT_LABELS, type EditMode, type FocusMode, type Selection } from '../state';

interface Props {
  graph: GraphJson;
  selection: Selection;
  editMode: EditMode;
  onSelectionChange: (s: Selection) => void;
  onSelect: (id: string | null) => void;
  onCreate: (id?: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

const FOCUS: Array<{ mode: FocusMode; label: string; hint: string }> = [
  { mode: 'up', label: 'Upstream', hint: 'Who depends on this service' },
  { mode: 'down', label: 'Downstream', hint: 'What this service depends on' },
  { mode: 'both', label: 'Both', hint: 'Upstream and downstream' },
];

function DependencyList({ title, edges, side, graph, onSelect }: { title: string; edges: GraphEdge[]; side: 'source' | 'target'; graph: GraphJson; onSelect: (id: string) => void }) {
  if (edges.length === 0) return null;
  return (
    <div className="deps">
      <h3>
        {title} <span className="muted">{edges.length}</span>
      </h3>
      <ul>
        {edges.map((e) => {
          const other = graph.nodes.find((n) => n.id === e[side]);
          return (
            <li key={e.id}>
              <button type="button" className="dep" onClick={() => onSelect(e[side])}>
                <span className="dot" style={{ background: graph.kinds[other?.kind ?? '']?.color }} aria-hidden />
                <span className="dep__label">{other?.label ?? e[side]}</span>
                <span className="pill">{e.protocol}</span>
                <span className={`pill pill--${e.confidence}`}>{e.confidence}</span>
              </button>
              {e.evidence.length > 0 && (
                <ul className="evidence">
                  {e.evidence.map((ev) => (
                    <li key={`${ev.file}:${ev.line ?? ''}`}>
                      <code>
                        {ev.file}
                        {ev.line ? `:${ev.line}` : ''}
                      </code>
                    </li>
                  ))}
                </ul>
              )}
              {e.note && <p className="muted note">{e.note}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function NodeDetail({ graph, selection, editMode, onSelectionChange, onSelect, onCreate, onEdit, onDelete }: Props) {
  const node = graph.nodes.find((n) => n.id === selection.selectedId);
  if (!node) {
    return (
      <section className="section" aria-label="Service details">
        <h2>Details</h2>
        <p className="muted">Click a node to see details</p>
      </section>
    );
  }
  const kind = graph.kinds[node.kind];
  const outgoing = graph.edges.filter((e) => e.source === node.id);
  const incoming = graph.edges.filter((e) => e.target === node.id);

  return (
    <section className="section detail" aria-label="Service details" data-testid="node-detail">
      <div className="detail__head">
        <h2>{node.label}</h2>
        <button type="button" className="icon-btn" aria-label="Clear selection" onClick={() => onSelect(null)}>
          ×
        </button>
      </div>
      <p className="detail__meta">
        <span className="badge" style={{ borderColor: kind?.color, color: kind?.color }}>
          {kind?.label ?? node.kind}
        </span>
        {node.ghost && <span className="badge badge--ghost">not in catalog</span>}
        <code className="muted">{node.id}</code>
      </p>
      {editMode && (
        <div className="detail__actions">
          {node.ghost ? (
            <button type="button" className="chip" onClick={() => onCreate(node.id)}>
              {EDIT_LABELS[editMode].addGhost}
            </button>
          ) : node.locked ? (
            <span className="muted small">Locked: edit the YAML file to change it.</span>
          ) : (
            <>
              <button type="button" className="chip" onClick={() => onEdit(node.id)}>
                {EDIT_LABELS[editMode].edit}
              </button>
              <button type="button" className="chip chip--danger" onClick={() => onDelete(node.id)}>
                {EDIT_LABELS[editMode].remove}
              </button>
            </>
          )}
        </div>
      )}
      {node.description && <p>{node.description}</p>}
      <dl className="facts">
        {node.group && (<><dt>Group</dt><dd>{graph.groups[node.group]?.label ?? node.group}</dd></>)}
        {node.owner && (<><dt>Owner</dt><dd>{node.owner}</dd></>)}
        {node.repo && (<><dt>Repo</dt><dd><code>{node.repo}</code></dd></>)}
        {node.hosts.length > 0 && (<><dt>Hosts</dt><dd>{node.hosts.map((h) => <code key={h}>{h}</code>)}</dd></>)}
        {node.tech.length > 0 && (<><dt>Tech</dt><dd>{node.tech.join(', ')}</dd></>)}
        {node.file && (<><dt>File</dt><dd><code>{node.file}</code></dd></>)}
      </dl>
      <div className="focus" role="group" aria-label="Highlight dependencies">
        {FOCUS.map((f) => (
          <button
            key={f.mode}
            type="button"
            title={f.hint}
            className={`chip${selection.focusMode === f.mode ? ' chip--on' : ''}`}
            aria-pressed={selection.focusMode === f.mode}
            onClick={() => onSelectionChange({ ...selection, focusMode: selection.focusMode === f.mode ? 'none' : f.mode })}
          >
            {f.label}
          </button>
        ))}
        <label className="depth">
          Depth {selection.depth}
          <input type="range" min={1} max={5} value={selection.depth} onChange={(e) => onSelectionChange({ ...selection, depth: Number(e.target.value) })} />
        </label>
      </div>
      <DependencyList title="Depends on" edges={outgoing} side="target" graph={graph} onSelect={onSelect} />
      <DependencyList title="Used by" edges={incoming} side="source" graph={graph} onSelect={onSelect} />
    </section>
  );
}
