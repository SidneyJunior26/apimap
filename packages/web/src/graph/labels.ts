import type { NodeHoverDrawingFunction } from 'sigma/rendering';
import type { EdgeAttrs, NodeAttrs } from './layout';

/** Dark pill label shown on hover, matching the glass panel. */
export const drawHoverLabel: NodeHoverDrawingFunction<NodeAttrs, EdgeAttrs> = (ctx, data, settings) => {
  if (!data.label) return;
  const size = settings.labelSize;
  ctx.font = `600 ${size}px ${settings.labelFont}`;
  const width = ctx.measureText(data.label).width;
  const x = data.x + data.size + 6;
  const y = data.y;
  const padX = 8;
  const h = size + 10;
  ctx.fillStyle = 'rgba(10, 16, 30, 0.92)';
  ctx.strokeStyle = data.color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x - padX, y - h / 2, width + padX * 2, h, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e6ebf4';
  ctx.fillText(data.label, x, y + size / 3);
};
