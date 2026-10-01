import { addWall } from '../../core';
import { computeSnap } from '../canvas/snapping';
import type { ToolHandler } from './types';

export const wallTool: ToolHandler = {
  snapIndicator: true,
  onMove: (ctx, p) => computeSnap(p, ctx.walls).point,
  onClick: (ctx, p) => {
    const { draft, walls, levelId } = ctx;
    const snapped = computeSnap(p, walls).point;
    if (!draft || draft.kind !== 'wall-chain') {
      ctx.setDraft({ kind: 'wall-chain', points: [snapped] });
      return;
    }
    const last = draft.points[draft.points.length - 1]!;
    ctx.applyOp((d) => addWall(d, { levelId, a: last, b: snapped }));
    ctx.setDraft({ kind: 'wall-chain', points: [...draft.points, snapped] });
  },
};
