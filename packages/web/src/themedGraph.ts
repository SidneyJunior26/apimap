import type { GraphJson } from '@svclens/core';
import { themeColor } from './theme';
import type { Theme } from './viewState';

/** Same graph with kind and group colors adjusted for the theme, so every view and legend agrees. */
export function themedGraph(g: GraphJson, theme: Theme): GraphJson {
  return {
    ...g,
    kinds: Object.fromEntries(Object.entries(g.kinds).map(([id, k]) => [id, { ...k, color: themeColor(k.color, theme) }])),
    groups: Object.fromEntries(Object.entries(g.groups).map(([id, gr]) => [id, gr.color ? { ...gr, color: themeColor(gr.color, theme) } : gr])),
  };
}
