import type { MutableRefObject } from 'react';
import type Sigma from 'sigma';
import type { EdgeAttrs, NodeAttrs } from './layout';

interface Props {
  sigma: MutableRefObject<Sigma<NodeAttrs, EdgeAttrs> | null>;
  onResetFilters: () => void;
}

export function Toolbar({ sigma, onResetFilters }: Props) {
  const camera = () => sigma.current?.getCamera();
  return (
    <div className="toolbar" role="toolbar" aria-label="Graph view">
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => camera()?.animatedZoom({ duration: 250 })}>
        +
      </button>
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => camera()?.animatedUnzoom({ duration: 250 })}>
        −
      </button>
      <button type="button" aria-label="Fit graph" title="Fit graph" onClick={() => camera()?.animatedReset({ duration: 400 })}>
        ⤢
      </button>
      <span className="toolbar__sep" aria-hidden />
      <button type="button" className="toolbar__text" onClick={onResetFilters}>
        Reset filters
      </button>
    </div>
  );
}
