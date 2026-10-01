import type { Vec2, Id, SceneDoc } from '../../core';
import { computeSnap } from '../canvas/snapping';
import type { ToolContext, ToolHandler } from './types';

type PolygonKind = 'room-polygon' | 'zone-polygon';

/** Click within this distance (m) of the first point to close the polygon. */
const CLOSE_DISTANCE = 0.25;

/**
 * Shared behavior of the polygon-drawing tools (room, zone): click to add points, click near
 * the first point (with >= 3 points) or press Enter to commit via `add`.
 */
export function createPolygonTool(
  kind: PolygonKind,
  add: (levelId: Id, polygon: Vec2[]) => (d: SceneDoc) => { doc: SceneDoc; id: Id },
): ToolHandler {
  const commit = (ctx: ToolContext, points: Vec2[]) => {
    ctx.applyOp(add(ctx.levelId, points));
    ctx.setDraft(null);
  };

  return {
    snapIndicator: true,
    onMove: (ctx, p) => computeSnap(p, ctx.walls).point,
    onClick: (ctx, p) => {
      const { draft, walls } = ctx;
      const snapped = computeSnap(p, walls).point;
      if (!draft || draft.kind !== kind) {
        ctx.setDraft({ kind, points: [snapped] });
        return;
      }
      const first = draft.points[0]!;
      const closeDist = Math.hypot(snapped[0] - first[0], snapped[1] - first[1]);
      if (draft.points.length >= 3 && closeDist <= CLOSE_DISTANCE) {
        commit(ctx, draft.points);
        return;
      }
      ctx.setDraft({ kind, points: [...draft.points, snapped] });
    },
    onKey: (ctx, e) => {
      if (e.key === 'Enter' && ctx.draft?.kind === kind) {
        if (ctx.draft.points.length >= 3) commit(ctx, ctx.draft.points);
        return true;
      }
      return false;
    },
  };
}
