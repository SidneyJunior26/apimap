import type { Theme } from './viewState';

export const NEBULA_BG = '#05080f';
export const PAPER_BG = '#f6f4ef';
/** Minimum contrast for kind colors drawn on the light background. */
const MIN_CONTRAST = 3;

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : null;
}

const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(parseHex(a) ?? [0, 0, 0]);
  const lb = luminance(parseHex(b) ?? [0, 0, 0]);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Kind color adjusted for the theme: on paper, darkened until it reads against the light background. */
export function themeColor(color: string, theme: Theme): string {
  if (theme !== 'paper') return color;
  const rgb = parseHex(color);
  if (!rgb) return color;
  let current = rgb;
  for (let step = 0; step < 20 && contrastRatio(toHex(current), PAPER_BG) < MIN_CONTRAST; step++) {
    current = current.map((v) => v * 0.9) as [number, number, number];
  }
  return toHex(current);
}

export const themeBackground = (theme: Theme): string => (theme === 'paper' ? PAPER_BG : NEBULA_BG);
