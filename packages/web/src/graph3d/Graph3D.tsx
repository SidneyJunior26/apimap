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
/** Soft halo around each node. Drawn as a sprite instead of bloom post-processing, which flattens the transparent background. */
const HALO = { nebula: 0.5, paper: 0.18 } as const;
const HALO_SCALE = 5;
const DIM_HALO = 0.1;

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
  const halos = useRef(new Map<string, { material: { opacity: number } }>());
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
    for (const [id, halo] of halos.current) halo.material.opacity = lit && !lit.has(id) ? DIM_HALO : 1;
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
        const [{ default: ForceGraph3D }, THREE] = await Promise.all([import('3d-force-graph'), import('three')]);
        if (disposed) return;
        const fg = new ForceGraph3D(container, {
          controlType: 'orbit',
          rendererConfig: { antialias: true, alpha: true, preserveDrawingBuffer: true },
        }) as unknown as ForceGraph;
        fgRef.current = fg;
        const reduced = prefersReducedMotion();

        // One soft radial texture per node color, shared by every halo of that color.
        const textures = new Map<string, InstanceType<typeof THREE.CanvasTexture>>();
        const haloTexture = (color: string) => {
          let t = textures.get(color);
          if (!t) {
            const c = document.createElement('canvas');
            c.width = c.height = 128;
            const ctx = c.getContext('2d')!;
            const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
            const base = new THREE.Color(color);
            const rgb = `${Math.round(base.r * 255)}, ${Math.round(base.g * 255)}, ${Math.round(base.b * 255)}`;
            grad.addColorStop(0, `rgba(${rgb}, ${HALO[theme]})`);
            grad.addColorStop(0.35, `rgba(${rgb}, ${HALO[theme] * 0.35})`);
            grad.addColorStop(1, `rgba(${rgb}, 0)`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 128, 128);
            t = new THREE.CanvasTexture(c);
            textures.set(color, t);
          }
          return t;
        };
        const haloFor = (n: Node3D) => {
          const material = new THREE.SpriteMaterial({ map: haloTexture(n.color), transparent: true, depthWrite: false });
          const sprite = new THREE.Sprite(material);
          // Node radius in 3d-force-graph is cbrt(val) * nodeRelSize (4).
          const size = Math.cbrt(n.val) * 4 * HALO_SCALE;
          sprite.scale.set(size, size, 1);
          halos.current.set(n.id, { material });
          return sprite;
        };

        fg.width(container.clientWidth)
          .height(container.clientHeight)
          .backgroundColor('rgba(0,0,0,0)') // transparent: the Nebula / Paper page background shows through, as in 2D
          .showNavInfo(false)
          .nodeId('id')
          .nodeVal('val')
          .nodeOpacity(0.95)
          .nodeThreeObject(haloFor)
          .nodeThreeObjectExtend(true)
          .nodeResolution(16)
          .nodeLabel((n: Node3D) => labelElement(n.label, theme))
          .linkWidth((l: Link3D) => (l.confidence === 'confirmed' ? 1.2 : 0.5))
          .linkOpacity(theme === 'paper' ? 0.5 : 0.38)
          .linkCurvature(0.12)
          .linkDirectionalArrowLength(3.5)
          .linkDirectionalArrowRelPos(1)
          .linkDirectionalParticleWidth(1.4)
          .linkDirectionalParticleSpeed(0.006)
          .onNodeHover((n: Node3D | null) => {
            hoveredRef.current = n?.id ?? null;
            container.style.cursor = n ? 'pointer' : '';
            repaint();
          })
          .onNodeClick((n: Node3D) => propsRef.current.onSelect(n.id))
          .onBackgroundClick(() => propsRef.current.onSelect(null));

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
      halos.current.clear();
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
