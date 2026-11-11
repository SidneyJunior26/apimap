import type { NodeHoverDrawingFunction } from 'sigma/rendering';
import type { Theme } from '../viewState';
import type { EdgeAttrs, NodeAttrs } from './layout';

/** Pill label shown on hover, matching the panel of the current theme. */
export const createHoverLabel = (theme: Theme): NodeHoverDrawingFunction<NodeAttrs, EdgeAttrs> => (ctx, data, settings) => {
  if (!data.label) return;
  const size = settings.labelSize;
  ctx.font = `600 ${size}px ${settings.labelFont}`;
  const width = ctx.measureText(data.label).width;
  const x = data.x + data.size + 6;
  const y = data.y;
  const padX = 8;
  const h = size + 10;
  ctx.fillStyle = theme === 'paper' ? 'rgba(255, 253, 248, 0.96)' : 'rgba(10, 16, 30, 0.92)';
  ctx.strokeStyle = data.color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x - padX, y - h / 2, width + padX * 2, h, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = theme === 'paper' ? '#1c2333' : '#e6ebf4';
  ctx.fillText(data.label, x, y + size / 3);
};
