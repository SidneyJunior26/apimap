import { normalize } from '../filters';

export function exportFileName(name: string, date: Date): string {
  const slug = normalize(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'svclens';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${slug}-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.png`;
}

interface ComposeOptions {
  background: string;
  /** Soft color glow painted over the background (dark theme), or null. */
  glow: string[] | null;
  caption: string;
  captionColor: string;
}

/** Flattens view layers (same pixel size, bottom first) onto an opaque background with a caption. */
export function composeLayers(layers: HTMLCanvasElement[], opts: ComposeOptions): HTMLCanvasElement {
  const first = layers[0];
  if (!first) throw new Error('nothing to export');
  const out = document.createElement('canvas');
  out.width = first.width;
  out.height = first.height;
  const ctx = out.getContext('2d')!;
  const scale = first.width / (first.clientWidth || first.width);

  ctx.fillStyle = opts.background;
  ctx.fillRect(0, 0, out.width, out.height);
  opts.glow?.forEach((color, i) => {
    const x = out.width * (0.2 + 0.6 * (i / Math.max(opts.glow!.length - 1, 1)));
    const y = out.height * (i % 2 ? 0.75 : 0.25);
    const r = Math.max(out.width, out.height) * 0.45;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, out.width, out.height);
  });
  for (const layer of layers) ctx.drawImage(layer, 0, 0, out.width, out.height);

  ctx.font = `500 ${Math.round(12 * scale)}px "Inter Variable", system-ui, sans-serif`;
  ctx.fillStyle = opts.captionColor;
  ctx.textBaseline = 'bottom';
  ctx.fillText(opts.caption, 16 * scale, out.height - 14 * scale);
  return out;
}

export async function downloadCanvas(canvas: HTMLCanvasElement, fileName: string): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('could not encode PNG');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
