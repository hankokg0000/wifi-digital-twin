import { addRadio } from '../../core';
import { computeSnap } from '../canvas/snapping';
import type { ToolHandler } from './types';

export const apTool: ToolHandler = {
  snapIndicator: true,
  onMove: (ctx, p) => computeSnap(p, ctx.walls).point,
  onClick: (ctx, p) => {
    const snapped = computeSnap(p, ctx.walls).point;
    ctx.applyOp((d) => addRadio(d, { levelId: ctx.levelId, position: [snapped[0], 2.0, snapped[1]] }));
  },
};
