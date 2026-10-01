import type { Band, Id, SceneDoc, Vec2, Vec3 } from '../scene/types';
import { pointInPolygon } from '../scene/geometry';
import { traceIndexFor, traceWorld, rssiDbm, type RfAgent } from './trace';

export interface HeatmapOptions {
  levelId: Id;
  band: Band;
  /** 'best' = strongest AP per cell; otherwise a radio id (falls back to 'best' if it is gone). */
  source: 'best' | Id;
  agents?: readonly RfAgent[];
  /** Grid pitch, m. Default 0.25. */
  cell?: number;
  /** Receiver height above the floor, m. Default 1.0. */
  rxHeight?: number;
}

export interface Heatmap {
  levelId: Id;
  band: Band;
  /** World x/z of the grid's min corner; cell (c, r) covers [minX + c·cell, +cell) × [minZ + r·cell, +cell). */
  minX: number;
  minZ: number;
  cols: number;
  rows: number;
  cell: number;
  /** Row-major (r · cols + c), dBm; NaN where the cell centre is outside every room. */
  values: Float32Array;
  /** Index into `doc.radios` of the strongest transmitter per cell; −1 outside rooms. */
  bestRadio: Int16Array;
}

/**
 * RSSI over one level's floor plan at `rxHeight`. Only cells whose centre lies inside a room of
 * that level are computed. Pure and deterministic: same doc + options -> same arrays.
 */
export function computeHeatmap(doc: SceneDoc, opts: HeatmapOptions): Heatmap {
  const cell = opts.cell ?? 0.25;
  const rxHeight = opts.rxHeight ?? 1.0;
  const agents = opts.agents ?? [];
  const idx = traceIndexFor(doc);
  const level = idx.levelById.get(opts.levelId);
  const rooms = doc.rooms.filter((r) => r.levelId === opts.levelId && r.polygon.length >= 3);

  let bx0 = Infinity;
  let bz0 = Infinity;
  let bx1 = -Infinity;
  let bz1 = -Infinity;
  for (const room of rooms) {
    for (const [x, z] of room.polygon) {
      bx0 = Math.min(bx0, x);
      bx1 = Math.max(bx1, x);
      bz0 = Math.min(bz0, z);
      bz1 = Math.max(bz1, z);
    }
  }
  if (!level || rooms.length === 0) {
    return {
      levelId: opts.levelId,
      band: opts.band,
      minX: 0,
      minZ: 0,
      cols: 0,
      rows: 0,
      cell,
      values: new Float32Array(0),
      bestRadio: new Int16Array(0),
    };
  }
  const minX = Math.floor(bx0 / cell) * cell;
  const minZ = Math.floor(bz0 / cell) * cell;
  const cols = Math.max(1, Math.ceil((bx1 - minX) / cell));
  const rows = Math.max(1, Math.ceil((bz1 - minZ) / cell));
  const values = new Float32Array(cols * rows).fill(NaN);
  const bestRadio = new Int16Array(cols * rows).fill(-1);

  // Transmitters: (radio index, world position, EIRP before path loss) for the chosen band.
  interface Tx {
    index: number;
    pos: Vec3;
    eirp: { power: number; gain: number };
  }
  const wantOne = opts.source !== 'best' && doc.radios.some((r) => r.id === opts.source);
  const txs: Tx[] = [];
  doc.radios.forEach((radio, index) => {
    if (wantOne ? radio.id !== opts.source : radio.role !== 'ap') return;
    const iface = radio.ifaces.find((f) => f.band === opts.band);
    if (!iface) return;
    const elev = idx.levelById.get(radio.levelId)?.elevation ?? 0;
    txs.push({
      index,
      pos: [radio.position[0], elev + radio.position[1], radio.position[2]],
      eirp: { power: iface.txPowerDbm, gain: radio.antennaGainDbi },
    });
  });

  const rxY = level.elevation + rxHeight;
  const rx: Vec3 = [0, rxY, 0];
  for (let r = 0; r < rows; r++) {
    const z = minZ + (r + 0.5) * cell;
    for (let c = 0; c < cols; c++) {
      const x = minX + (c + 0.5) * cell;
      const p: Vec2 = [x, z];
      if (!rooms.some((room) => pointInPolygon(p, room.polygon))) continue;
      rx[0] = x;
      rx[2] = z;
      let best = -Infinity;
      let bestIdx = -1;
      for (const tx of txs) {
        const { pathLossDb } = traceWorld(idx, tx.pos, rx, opts.band, agents, null);
        const v = rssiDbm(tx.eirp.power, tx.eirp.gain, pathLossDb);
        if (v > best) {
          best = v;
          bestIdx = tx.index;
        }
      }
      const i = r * cols + c;
      // No transmitter on this band at all: inside a room but no signal -> the floor value.
      values[i] = bestIdx === -1 ? -100 : best;
      bestRadio[i] = bestIdx;
    }
  }

  return { levelId: opts.levelId, band: opts.band, minX, minZ, cols, rows, cell, values, bestRadio };
}
