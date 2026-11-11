import type { MutableRefObject } from 'react';
import type { Theme, View } from '../viewState';
import type { GraphController } from './controller';

interface Props {
  controller: MutableRefObject<GraphController | null>;
  view: View;
  theme: Theme;
  exporting: boolean;
  onToggleView: () => void;
  onToggleTheme: () => void;
  onExport: () => void;
  onCopyMermaid: () => void;
  onResetFilters: () => void;
}

export function Toolbar({ controller, view, theme, exporting, onToggleView, onToggleTheme, onExport, onCopyMermaid, onResetFilters }: Props) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Graph view">
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => controller.current?.zoomIn()}>
        +
      </button>
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => controller.current?.zoomOut()}>
        −
      </button>
      <button type="button" aria-label="Fit graph" title="Fit graph" onClick={() => controller.current?.fit()}>
        ⤢
      </button>
      <span className="toolbar__sep" aria-hidden />
      <button type="button" className="toolbar__text" aria-pressed={view === '3d'} title="Switch between 2D and 3D" onClick={onToggleView}>
        {view === '3d' ? '2D' : '3D'}
      </button>
      <button type="button" className="toolbar__text" title="Switch between dark and light theme" onClick={onToggleTheme}>
        {theme === 'paper' ? 'Dark' : 'Light'}
      </button>
      <button type="button" className="toolbar__text" title="Download the current view as PNG" disabled={exporting} onClick={onExport}>
        {exporting ? 'Saving…' : 'PNG'}
      </button>
      <button type="button" className="toolbar__text" title="Copy the visible services as a Mermaid diagram" onClick={onCopyMermaid}>
        Mermaid
      </button>
      <span className="toolbar__sep" aria-hidden />
      <button type="button" className="toolbar__text" onClick={onResetFilters}>
        Reset filters
      </button>
    </div>
  );
}
