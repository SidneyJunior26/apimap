import type { GraphJson } from '@apimap/core';
import { useState } from 'react';
import type { FilterState, Visible } from '../filters';
import type { Selection } from '../state';
import { Filters } from './Filters';
import { Legend } from './Legend';
import { NodeDetail } from './NodeDetail';
import { Search } from './Search';

interface Props {
  graph: GraphJson;
  filters: FilterState;
  visible: Visible;
  selection: Selection;
  editable: boolean;
  onFiltersChange: (f: FilterState) => void;
  onSelectionChange: (s: Selection) => void;
  onCreate: (id?: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function Sidebar({ graph, filters, visible, selection, editable, onFiltersChange, onSelectionChange, onCreate, onEdit, onDelete }: Props) {
  const [open, setOpen] = useState(true);
  const select = (id: string | null) => onSelectionChange({ ...selection, selectedId: id, focusMode: 'none' });

  return (
    <aside className={`sidebar${open ? '' : ' sidebar--closed'}`} aria-label="Map controls">
      <button type="button" className="sidebar__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide panel' : 'Show panel'}
      </button>
      <header className="sidebar__header">
        <div className="sidebar__title">
          <h1>{graph.name}</h1>
          {editable && (
            <button type="button" className="chip chip--on" onClick={() => onCreate()}>
              New service
            </button>
          )}
        </div>
        <p className="muted">
          {visible.nodeIds.size} of {graph.nodes.length} services · {visible.edgeIds.size} links
        </p>
      </header>
      <Search graph={graph} filters={filters} visible={visible} onQueryChange={(query) => onFiltersChange({ ...filters, query })} onSelect={select} />
      <NodeDetail
        graph={graph}
        selection={selection}
        editable={editable}
        onSelectionChange={onSelectionChange}
        onSelect={select}
        onCreate={onCreate}
        onEdit={onEdit}
        onDelete={onDelete}
      />
      <Filters graph={graph} filters={filters} onChange={onFiltersChange} />
      <Legend />
    </aside>
  );
}
