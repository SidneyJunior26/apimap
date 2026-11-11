import type { GraphJson } from '@apimap/core';
import type Sigma from 'sigma';
import { hash01, type ApiGraph, type EdgeAttrs, type NodeAttrs } from './layout';

/** What the links layer needs to know each frame. Mutated by GraphCanvas. */
export interface LinksState {
  visibleEdges: Set<string>;
  visibleNodes: Set<string>;
  /** When set, everything outside it is dimmed. */
  highlight: Set<string> | null;
  animate: boolean;
}

interface Point { x: number; y: number }

const PARTICLE_SPEED = 70; // px per second
const MAX_PARTICLE_EDGES = 3000;
const CURVATURE = 0.14;

function hexToRgb(color: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : [148, 163, 184];
}

const rgba = (color: string, a: number) => {
  const [r, g, b] = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

const spriteCache = new Map<string, HTMLCanvasElement>();
function particleSprite(color: string): HTMLCanvasElement {
  let sprite = spriteCache.get(color);
  if (sprite) return sprite;
  sprite = document.createElement('canvas');
  sprite.width = sprite.height = 24;
  const ctx = sprite.getContext('2d')!;
  const grad = ctx.createRadialGradient(12, 12, 0, 12, 12, 12);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, rgba(color, 0.95));
  grad.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 24, 24);
  spriteCache.set(color, sprite);
  return sprite;
}

function quad(p0: Point, c: Point, p1: Point, t: number): Point {
  const u = 1 - t;
  return { x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y };
}

/** Canvas layer under the nodes: group halos, curved links (solid/dashed) with arrows, and flowing particles. */
export class LinksLayer {
  private ctx: CanvasRenderingContext2D;
  private frame = 0;
  private edgeMeta: Map<string, { confidence: string; color: string; phase: number }>;

  constructor(
    private sigma: Sigma<NodeAttrs, EdgeAttrs>,
    private canvas: HTMLCanvasElement,
    data: GraphJson,
    private groups: Record<string, { label: string; color: string }>,
    private state: LinksState,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.edgeMeta = new Map();
    this.setData(data, groups);
    sigma.on('afterRender', this.onAfterRender);
    this.loop();
  }

  /** Call after the graph data changed (local editor reloads). */
  setData(data: GraphJson, groups: Record<string, { label: string; color: string }>): void {
    this.groups = groups;
    const kindOf = new Map(data.nodes.map((n) => [n.id, n.kind]));
    this.edgeMeta = new Map(
      data.edges.map((e) => [e.id, { confidence: e.confidence, color: data.kinds[kindOf.get(e.source) ?? '']?.color ?? '#94a3b8', phase: hash01(e.id) }]),
    );
  }

  private onAfterRender = () => {
    if (!this.state.animate) this.draw(performance.now());
  };

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    if (this.state.animate && !document.hidden) this.draw(performance.now());
  };

  kill() {
    cancelAnimationFrame(this.frame);
    this.sigma.off('afterRender', this.onAfterRender);
  }

  private resize(): { w: number; h: number } {
    const { width: w, height: h } = this.sigma.getDimensions();
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  private viewport(node: string): (Point & { r: number }) | null {
    const d = this.sigma.getNodeDisplayData(node);
    if (!d || d.hidden) return null;
    const p = this.sigma.framedGraphToViewport(d);
    return { ...p, r: this.sigma.scaleSize(d.size) };
  }

  draw(time: number) {
    const { w, h } = this.resize();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    const graph = this.sigma.getGraph() as ApiGraph;
    const { highlight, visibleEdges, visibleNodes } = this.state;

    this.drawGroups(graph, visibleNodes, highlight);

    const particles: Array<{ p: Point; color: string; alpha: number }> = [];
    const withParticles = this.state.animate && visibleEdges.size <= MAX_PARTICLE_EDGES;

    graph.forEachEdge((id, _attrs, source, target) => {
      if (!visibleEdges.has(id)) return;
      const meta = this.edgeMeta.get(id);
      const a = this.viewport(source);
      const b = this.viewport(target);
      if (!meta || !a || !b) return;
      const lit = highlight ? highlight.has(source) && highlight.has(target) : null;
      const alpha = lit === null ? 0.32 : lit ? 0.9 : 0.04;

      ctx.strokeStyle = rgba(meta.color, alpha);
      ctx.fillStyle = rgba(meta.color, alpha);
      ctx.lineWidth = meta.confidence === 'manual' ? 1 : lit ? 2 : 1.4;
      ctx.setLineDash(meta.confidence === 'inferred' ? [5, 5] : []);

      if (source === target) {
        ctx.beginPath();
        ctx.arc(a.x, a.y - a.r - 8, 8, 0, Math.PI * 2);
        ctx.stroke();
        return;
      }

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const c = { x: (a.x + b.x) / 2 - (dy / len) * len * CURVATURE, y: (a.y + b.y) / 2 + (dx / len) * len * CURVATURE };
      // Stop the line at the target's rim so the arrow tip touches the node.
      const tx = b.x - c.x;
      const ty = b.y - c.y;
      const tl = Math.hypot(tx, ty) || 1;
      const end = { x: b.x - (tx / tl) * (b.r + 2), y: b.y - (ty / tl) * (b.r + 2) };

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(c.x, c.y, end.x, end.y);
      ctx.stroke();

      const head = lit ? 8 : 6;
      const ux = tx / tl;
      const uy = ty / tl;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - ux * head - uy * head * 0.5, end.y - uy * head + ux * head * 0.5);
      ctx.lineTo(end.x - ux * head + uy * head * 0.5, end.y - uy * head - ux * head * 0.5);
      ctx.closePath();
      ctx.fill();

      if (withParticles && lit !== false) {
        const count = meta.confidence === 'confirmed' ? 2 : 1;
        for (let i = 0; i < count; i++) {
          const t = ((time / 1000) * (PARTICLE_SPEED / len) + meta.phase + i / count) % 1;
          particles.push({ p: quad(a, c, end, t), color: meta.color, alpha: lit ? 1 : 0.7 });
        }
      }
    });

    ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'lighter';
    for (const { p, color, alpha } of particles) {
      ctx.globalAlpha = alpha;
      ctx.drawImage(particleSprite(color), p.x - 6, p.y - 6, 12, 12);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawGroups(graph: ApiGraph, visibleNodes: Set<string>, highlight: Set<string> | null) {
    const buckets = new Map<string, Point[]>();
    graph.forEachNode((id, attrs) => {
      if (!visibleNodes.has(id) || attrs.ghost) return;
      const p = this.viewport(id);
      if (p) buckets.set(attrs.group, [...(buckets.get(attrs.group) ?? []), p]);
    });
    const ctx = this.ctx;
    for (const [group, points] of buckets) {
      const info = this.groups[group];
      if (!info || points.length < 2) continue;
      const color = info.color;
      const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
      const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
      const r = Math.max(...points.map((p) => Math.hypot(p.x - cx, p.y - cy))) + 48;
      const strength = highlight ? 0.03 : 0.09;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, rgba(color, strength));
      grad.addColorStop(0.7, rgba(color, strength * 0.6));
      grad.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '600 11px "Inter Variable", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = rgba(color, highlight ? 0.2 : 0.55);
      ctx.fillText(info.label.toUpperCase(), cx, cy - r + 28);
    }
  }
}
