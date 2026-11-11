import type { Positions } from './layout';

/** What the toolbar can ask of whichever view (2D or 3D) is on screen. */
export interface GraphController {
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  /** Renders the current view into canvases, bottom layer first. */
  snapshot(): HTMLCanvasElement[];
}

/** Shared across view switches so nodes keep their place. */
export interface ViewCache {
  positions: Positions;
  camera2d: { x: number; y: number; ratio: number; angle: number } | null;
}

export const createViewCache = (): ViewCache => ({ positions: new Map(), camera2d: null });
