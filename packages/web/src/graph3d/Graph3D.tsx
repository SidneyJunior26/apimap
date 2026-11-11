import type { GraphJson } from '@apimap/core';
import { useEffect, useRef, type MutableRefObject } from 'react';
import { searchMatches, type Visible } from '../filters';
import type { GraphController } from '../graph/controller';
import { prefersReducedMotion } from '../graph/GraphCanvas';
import { neighbors } from '../graph/traversal';
import type { Selection } from '../state';
import { themeBackground } from '../theme';
import type { Theme } from '../viewState';
import { toForceData, type Link3D, type Node3D } from './scene';

interface Props {
  graph: GraphJson;
  visible: Visible;
  query: string;
  selection: Selection;
  theme: Theme;
  controllerRef: MutableRefObject<GraphController | null>;
  onSelect: (id: string | null) => void;
  /** Called when the browser cannot run the 3D view (no WebGL or the library failed to load). */
  onUnavailable: (reason: string) => void;
}

// Loose structural type: the library's chainable generics add nothing here.
type ForceGraph = {
  graphData(data?: { nodes: Node3D[]; links: Link3D[] }): ForceGraph & { nodes: Node3D[]; links: Link3D[] };
  [method: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

/** After the simulation starts, link ends are replaced by node objects. */
type LiveLink = Omit<Link3D, 'source' | 'target'> & { source: Node3D | string; target: Node3D | string };
const endId = (end: Node3D | string) => (typeof end === 'string' ? end : end.id);
const linkLit = (lit: Set<string> | null, l: LiveLink) => !lit || (lit.has(endId(l.source)) && lit.has(endId(l.target)));

const DIM = { nebula: 'rgba(100,116,139,0.25)', paper: 'rgba(148,163,184,0.35)' } as const;
/** Bloom glow. Off by default: it lifts the whole background and reads as neon rather than professional. */
const BLOOM = { nebula: 0, paper: 0 } as const;

export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function labelElement(text: string, theme: Theme): HTMLElement {
  const el = document.createElement('div');
  el.className = `graph3d-label graph3d-label--${theme}`;
  el.textContent = text; // textContent: names never become HTML
  return el;
}

/** 3D view for presentations. Mount it with `key={theme}`. */
export function Graph3D({ graph, visible, query, selection, theme, controllerRef, onSelect, onUnavailable }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraph | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const nodeCache = useRef(new Map<string, Node3D>());
  const propsRef = useRef({ graph, visible, query, selection, onSelect });
  propsRef.current = { graph, visible, query, selection, onSelect };

  const highlight = (): Set<string> | null => {
    const { graph: g, visible: vis, query: q, selection: sel } = propsRef.current;
    if (hoveredRef.current) return neighbors(g, hoveredRef.current, 'both', 1, vis.edgeIds);
    if (!sel.selectedId) return searchMatches(g, q, vis);
    return neighbors(g, sel.selectedId, sel.focusMode === 'none' ? 'both' : sel.focusMode, sel.focusMode === 'none' ? 1 : sel.depth, vis.edgeIds);
  };

  /** Re-applies color accessors so highlight changes show up. */
  const repaint = () => {
    const fg = fgRef.current;
    if (!fg) return;
    const lit = highlight();
    const dim = DIM[theme];
    fg.nodeColor((n: Node3D) => (lit && !lit.has(n.id) ? dim : n.color));
    fg.linkColor((l: LiveLink) => (linkLit(lit, l) ? l.color : dim));
    fg.linkDirectionalParticles((l: LiveLink) => (linkLit(lit, l) ? l.particles : 0));
  };

  /** Pushes visible data, reusing node objects so existing nodes keep their position. */
  const pushData = () => {
    const fg = fgRef.current;
    if (!fg) return;
    const data = toForceData(propsRef.current.graph, propsRef.current.visible, { animate: !prefersReducedMotion() });
    const nodes = data.nodes.map((n) => {
      const cached = nodeCache.current.get(n.id);
      const merged = cached ? Object.assign(cached, { ...n, x: cached.x, y: cached.y, z: cached.z }) : n;
      nodeCache.current.set(n.id, merged);
      return merged;
    });
    fg.graphData({ nodes, links: data.links });
    repaint();
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!supportsWebGL()) {
      onUnavailable('This browser cannot draw WebGL, so the 3D view is not available.');
      return;
    }
    let disposed = false;
    let resize: ResizeObserver | undefined;

    void (async () => {
      try {
        const [{ default: ForceGraph3D }, THREE, { UnrealBloomPass }] = await Promise.all([
          import('3d-force-graph'),
          import('three'),
          import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
        ]);
        if (disposed) return;
        const fg = new ForceGraph3D(container, {
          controlType: 'orbit',
          rendererConfig: { antialias: true, preserveDrawingBuffer: true },
        }) as unknown as ForceGraph;
        fgRef.current = fg;
        const reduced = prefersReducedMotion();
        fg.width(container.clientWidth)
          .height(container.clientHeight)
          .backgroundColor(themeBackground(theme))
          .showNavInfo(false)
          .nodeId('id')
          .nodeVal('val')
          .nodeOpacity(0.9)
          .nodeResolution(16)
          .nodeLabel((n: Node3D) => labelElement(n.label, theme))
          .linkWidth((l: Link3D) => (l.confidence === 'confirmed' ? 1.2 : 0.5))
          .linkOpacity(theme === 'paper' ? 0.5 : 0.3)
          .linkCurvature(0.12)
          .linkDirectionalArrowLength(3.5)
          .linkDirectionalArrowRelPos(1)
          .linkDirectionalParticleWidth(1.1)
          .linkDirectionalParticleSpeed(0.006)
          .onNodeHover((n: Node3D | null) => {
            hoveredRef.current = n?.id ?? null;
            container.style.cursor = n ? 'pointer' : '';
            repaint();
          })
          .onNodeClick((n: Node3D) => propsRef.current.onSelect(n.id))
          .onBackgroundClick(() => propsRef.current.onSelect(null));

        if (BLOOM[theme] > 0) {
          const size = new THREE.Vector2(container.clientWidth, container.clientHeight);
          fg.postProcessingComposer().addPass(new UnrealBloomPass(size, BLOOM[theme], 0.35, 0.35));
        }

        // Frame the whole graph once the layout settles the first time.
        let framed = false;
        fg.cooldownTime(4000).onEngineStop(() => {
          if (framed || disposed) return;
          framed = true;
          fg.zoomToFit(reduced ? 0 : 800, 60);
        });
        pushData();

        resize = new ResizeObserver(() => fg.width(container.clientWidth).height(container.clientHeight));
        resize.observe(container);

        const camera = () => fg.camera() as { position: { x: number; y: number; z: number } };
        const scaleCamera = (factor: number) => {
          const p = camera().position;
          fg.cameraPosition({ x: p.x * factor, y: p.y * factor, z: p.z * factor }, undefined, reduced ? 0 : 300);
        };
        controllerRef.current = {
          zoomIn: () => scaleCamera(0.75),
          zoomOut: () => scaleCamera(1.33),
          fit: () => fg.zoomToFit(reduced ? 0 : 500, 60),
          snapshot: () => [fg.renderer().domElement as HTMLCanvasElement],
        };
      } catch (err) {
        if (!disposed) onUnavailable(`The 3D view could not start: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();

    return () => {
      disposed = true;
      resize?.disconnect();
      controllerRef.current = null;
      fgRef.current?._destructor();
      fgRef.current = null;
      container.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(pushData, [graph, visible]);
  useEffect(repaint, [query, selection]);

  // Orbit the camera to the selected node.
  useEffect(() => {
    const fg = fgRef.current;
    const id = selection.selectedId;
    if (!fg || !id) return;
    const node = nodeCache.current.get(id);
    if (!node || node.x === undefined) return;
    const { x = 0, y = 0, z = 0 } = node;
    const distance = 140;
    const ratio = 1 + distance / Math.max(Math.hypot(x, y, z), 1);
    fg.cameraPosition({ x: x * ratio, y: y * ratio, z: z * ratio }, { x, y, z }, prefersReducedMotion() ? 0 : 1000);
  }, [selection.selectedId]);

  return <div ref={containerRef} className="canvas canvas--3d" data-testid="graph-canvas-3d" />;
}
