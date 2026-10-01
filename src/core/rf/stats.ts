import type { Id, SceneDoc } from '../scene/types';
import { pointInPolygon } from '../scene/geometry';
import type { Heatmap } from './heatmap';

export type SignalQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'none';

/** dBm thresholds (lower bound, inclusive) for each quality tier. */
export const QUALITY_THRESHOLDS_DBM = { excellent: -50, good: -67, fair: -75, poor: -85 } as const;

export function qualityOf(dbm: number): SignalQuality {
  if (dbm >= QUALITY_THRESHOLDS_DBM.excellent) return 'excellent';
  if (dbm >= QUALITY_THRESHOLDS_DBM.good) return 'good';
  if (dbm >= QUALITY_THRESHOLDS_DBM.fair) return 'fair';
  if (dbm >= QUALITY_THRESHOLDS_DBM.poor) return 'poor';
  return 'none';
}

export interface RoomCoverage {
  roomId: Id;
  meanDbm: number;
  /** 10th percentile: the weak corner of the room (what a user in the worst 10 % of it sees). */
  p10Dbm: number;
  /** Quality of the mean. */
  quality: SignalQuality;
}

/** Per-room signal summary for the heatmap's level. Rooms with no grid cell centre are omitted. */
export function roomCoverage(doc: SceneDoc, hm: Heatmap): RoomCoverage[] {
  const out: RoomCoverage[] = [];
  for (const room of doc.rooms) {
    if (room.levelId !== hm.levelId || room.polygon.length < 3) continue;
    const vals: number[] = [];
    for (let r = 0; r < hm.rows; r++) {
      const z = hm.minZ + (r + 0.5) * hm.cell;
      for (let c = 0; c < hm.cols; c++) {
        const v = hm.values[r * hm.cols + c]!;
        if (Number.isNaN(v)) continue;
        if (pointInPolygon([hm.minX + (c + 0.5) * hm.cell, z], room.polygon)) vals.push(v);
      }
    }
    if (vals.length === 0) continue;
    vals.sort((a, b) => a - b);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const p10 = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.1))]!;
    out.push({ roomId: room.id, meanDbm: mean, p10Dbm: p10, quality: qualityOf(mean) });
  }
  return out;
}
