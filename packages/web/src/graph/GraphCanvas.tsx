import type { GraphJson } from '@apimap/core';
import { useEffect, useRef } from 'react';
import Sigma from 'sigma';
import { searchMatches, type Visible } from '../filters';
import type { Selection } from '../state';
import { GlowNodeProgram } from './glowNodeProgram';
import { drawHoverLabel } from './labels';
import { runLayout, syncGraphology, toGraphology, type ApiGraph, type EdgeAttrs, type NodeAttrs } from './layout';
import { LinksLayer, type LinksState } from './links';
import { Toolbar } from './Toolbar';
import { neighbors } from './traversal';

interface Props {
  graph: GraphJson;
  visible: Visible;
  query: string;
  selection: Selection;
  onSelect: (id: string | null) => void;
  onResetFilters: () => void;
}

const DIM_COLOR = 'rgba(100, 116, 139, 0.18)';
const FALLBACK_GROUP_COLOR = '#64748b';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function GraphCanvas({ graph, visible, query, selection, onSelect, onResetFilters }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma<NodeAttrs, EdgeAttrs> | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const linksRef = useRef<LinksLayer | null>(null);
  const graphologyRef = useRef<ApiGraph | null>(null);
  const stopLayoutRef = useRef<() => void>(() => {});
  const linksState = useRef<LinksState>({ visibleEdges: visible.edgeIds, visibleNodes: visible.nodeIds, highlight: null, animate: !prefersReducedMotion() });
  const propsRef = useRef({ graph, visible, query, selection, onSelect });
  propsRef.current = { graph, visible, query, selection, onSelect };

  const computeHighlight = (): Set<string> | null => {
    const { graph, selection: sel, visible: vis, query: q } = propsRef.current;
    const hovered = hoveredRef.current;
    if (hovered) return neighbors(graph, hovered, 'both', 1, vis.edgeIds);
    if (!sel.selectedId) return searchMatches(graph, q, vis);
    if (sel.focusMode !== 'none') return neighbors(graph, sel.selectedId, sel.focusMode, sel.depth, vis.edgeIds);
    return neighbors(graph, sel.selectedId, 'both', 1, vis.edgeIds);
  };

  const refresh = () => {
    linksState.current.visibleEdges = propsRef.current.visible.edgeIds;
    linksState.current.visibleNodes = propsRef.current.visible.nodeIds;
    linksState.current.highlight = computeHighlight();
    sigmaRef.current?.refresh({ skipIndexation: true });
  };

  const groupsOf = (data: GraphJson) =>
    Object.fromEntries(
      [...new Set(data.nodes.map((n) => n.group).filter((x): x is string => Boolean(x)))].map((id) => [
        id,
        { label: data.groups[id]?.label ?? id, color: data.groups[id]?.color ?? FALLBACK_GROUP_COLOR },
      ]),
    );

  // Create sigma once. Later graph changes are applied in place (see the effect below).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const g = toGraphology(graph);
    graphologyRef.current = g;
    const sigma = new Sigma<NodeAttrs, EdgeAttrs>(g, container, {
      allowInvalidContainer: true,
      defaultNodeType: 'glow',
      nodeProgramClasses: { glow: GlowNodeProgram },
      labelFont: '"Inter Variable", system-ui, sans-serif',
      labelSize: 12,
      labelWeight: '500',
      labelColor: { color: '#c9d2e3' },
      labelRenderedSizeThreshold: 9,
      labelDensity: 0.6,
      defaultDrawNodeHover: drawHoverLabel,
      zIndex: true,
      minCameraRatio: 0.08,
      maxCameraRatio: 4,
      stagePadding: 48,
      nodeReducer: (id, data) => {
        const { visible: vis, selection: sel } = propsRef.current;
        if (!vis.nodeIds.has(id)) return { ...data, hidden: true };
        const highlight = linksState.current.highlight;
        const isSelected = sel.selectedId === id;
        if (highlight && !highlight.has(id)) return { ...data, color: DIM_COLOR, label: '', zIndex: 0 };
        return {
          ...data,
          size: isSelected ? data.size * 1.35 : data.size,
          forceLabel: Boolean(highlight) || isSelected,
          highlighted: hoveredRef.current === id,
          zIndex: highlight ? 2 : 1,
        };
      },
      // Links are drawn by LinksLayer (dashes, curves and particles are not available in sigma's WebGL edges).
      edgeReducer: (_id, data) => ({ ...data, hidden: true }),
    });
    sigmaRef.current = sigma;

    const canvas = sigma.createCanvas('links', { beforeLayer: 'nodes', style: { pointerEvents: 'none' } });
    const links = new LinksLayer(sigma, canvas, graph, groupsOf(graph), linksState.current);
    linksRef.current = links;

    sigma.on('enterNode', ({ node }) => {
      hoveredRef.current = node;
      container.style.cursor = 'pointer';
      refresh();
    });
    sigma.on('leaveNode', () => {
      hoveredRef.current = null;
      container.style.cursor = '';
      refresh();
    });
    sigma.on('clickNode', ({ node }) => propsRef.current.onSelect(node));
    sigma.on('clickStage', () => propsRef.current.onSelect(null));

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => {
      linksState.current.animate = !media.matches;
      sigma.refresh();
    };
    media.addEventListener('change', onMotion);

    stopLayoutRef.current = runLayout(g);
    refresh();

    return () => {
      media.removeEventListener('change', onMotion);
      stopLayoutRef.current();
      links.kill();
      sigma.kill();
      sigmaRef.current = null;
      linksRef.current = null;
      graphologyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Graph reloads (local editor): keep sigma, camera and known positions; settle new nodes briefly.
  const firstGraph = useRef(graph);
  useEffect(() => {
    const g = graphologyRef.current;
    if (!g || graph === firstGraph.current) return;
    stopLayoutRef.current();
    syncGraphology(g, graph);
    linksRef.current?.setData(graph, groupsOf(graph));
    stopLayoutRef.current = runLayout(g, 700);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  useEffect(refresh, [visible, query, selection]);

  // Fly to the selected node.
  useEffect(() => {
    const sigma = sigmaRef.current;
    if (!sigma || !selection.selectedId) return;
    const d = sigma.getNodeDisplayData(selection.selectedId);
    if (!d) return;
    const camera = sigma.getCamera();
    camera.animate({ x: d.x, y: d.y, ratio: Math.min(camera.ratio, 0.7) }, { duration: prefersReducedMotion() ? 0 : 500, easing: 'cubicInOut' });
  }, [selection.selectedId]);

  return (
    <>
      <div ref={containerRef} className="canvas" data-testid="graph-canvas" />
      <Toolbar sigma={sigmaRef} onResetFilters={onResetFilters} />
    </>
  );
}
