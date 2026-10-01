import { addOpening, OPENING_DEFAULTS } from '../../core';
import { findHoverWall } from '../canvas/snapping';
import type { ToolHandler } from './types';

function createOpeningTool(kind: 'door' | 'window'): ToolHandler {
  return {
    onMove: (_ctx, p) => p,
    onClick: (ctx, p) => {
      const hw = findHoverWall(p, ctx.walls);
      if (!hw) return;
      const wall = ctx.walls.find((w) => w.id === hw.wallId);
      if (!wall) return;
      const width = OPENING_DEFAULTS[kind].width;
      const length = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
      const offset = Math.min(Math.max(hw.offset - width / 2, 0), Math.max(length - width, 0));
      ctx.applyOp((d) => addOpening(d, { wallId: hw.wallId, kind, offset }));
    },
  };
}

export const doorTool = createOpeningTool('door');
export const windowTool = createOpeningTool('window');
