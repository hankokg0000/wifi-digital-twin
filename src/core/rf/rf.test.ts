import { describe, it, expect } from 'vitest';
import { createEmptyDoc } from '../scene/doc';
import { addLevel, addWall, addOpening, toggleOpening, addObject, addRoom, addRadio } from '../scene/ops';
import type { SceneDoc } from '../scene/types';
import { fsplAt1m, BAND_CENTER_MHZ } from './bands';
import { traceLink, rssiDbm } from './trace';
import { computeHeatmap } from './heatmap';
import { qualityOf, roomCoverage } from './stats';

const doc0 = createEmptyDoc();
const L1 = doc0.levels[0]!.id;
const tx = { levelId: L1, position: [0, 1, 0] as [number, number, number] };
const rx = { levelId: L1, position: [5, 1, 0] as [number, number, number] };
const rssi24 = (d: SceneDoc, band: '2.4' | '5' = '2.4') => rssiDbm(20, 3, traceLink(d, tx, rx, band).pathLossDb);

describe('rf: link budget', () => {
  it('FSPL at 1 m matches design §8', () => {
    expect(fsplAt1m(BAND_CENTER_MHZ['2.4'])).toBeCloseTo(40.19, 1);
    expect(fsplAt1m(BAND_CENTER_MHZ['5'])).toBeCloseTo(47.26, 1);
  });

  it('free-space 5 m at 20 dBm + 3 dBi is about -31 dBm and clamps at the floor', () => {
    expect(rssi24(doc0)).toBeCloseTo(-31.2, 1);
    expect(rssiDbm(-50, 0, 80)).toBe(-100);
  });

  it('counts a wall once, at its band loss', () => {
    const { doc } = addWall(doc0, { levelId: L1, a: [2.5, -3], b: [2.5, 3], thickness: 0.1, materialId: 'brick' });
    expect(rssi24(doc)).toBeCloseTo(-39.2, 1);
    expect(rssi24(doc, '5') - rssi24(doc0, '5')).toBeCloseTo(-12, 5);
    expect(traceLink(doc, tx, rx, '2.4').obstructions).toHaveLength(1);
  });

  it('counts a wall junction the ray passes exactly through once (lossiest wins)', () => {
    let d = addWall(doc0, { levelId: L1, a: [2.5, -3], b: [2.5, 0], thickness: 0.1, materialId: 'brick' }).doc;
    d = addWall(d, { levelId: L1, a: [2.5, 0], b: [2.5, 3], thickness: 0.1, materialId: 'drywall' }).doc;
    const t = traceLink(d, tx, rx, '2.4');
    expect(t.obstructions.map((x) => x.lossDb)).toEqual([8]);
  });

  it('ignores a wall the ray passes over (height) or beside (extent)', () => {
    const low = addWall(doc0, { levelId: L1, a: [2.5, -3], b: [2.5, 3], thickness: 0.1, height: 0.5 }).doc;
    expect(rssi24(low)).toBeCloseTo(-31.2, 1);
    const beside = addWall(doc0, { levelId: L1, a: [2.5, 1], b: [2.5, 3], thickness: 0.1 }).doc;
    expect(rssi24(beside)).toBeCloseTo(-31.2, 1);
  });

  it('opening: open = no loss, closed = opening material instead of wall', () => {
    const w = addWall(doc0, { levelId: L1, a: [2.5, -3], b: [2.5, 3], thickness: 0.1, materialId: 'brick' });
    // wall runs z -3 -> 3, the ray is at z = 0, so the crossing is 3 m along the wall.
    const o = addOpening(w.doc, { wallId: w.id, kind: 'door', offset: 2.5, width: 1.0, sill: 0, height: 2.1 });
    const closed = traceLink(o.doc, tx, rx, '2.4');
    expect(closed.obstructions.map((x) => [x.kind, x.lossDb])).toEqual([['opening', 3]]);
    const open = traceLink(toggleOpening(o.doc, o.id), tx, rx, '2.4');
    expect(open.obstructions).toHaveLength(0);
    // Ray above the door head still hits the brick.
    const high = traceLink(o.doc, { ...tx, position: [0, 2.5, 0] }, { ...rx, position: [5, 2.5, 0] }, '2.4');
    expect(high.obstructions.map((x) => x.kind)).toEqual(['wall']);
  });

  it('objects block only when the ray is below their top', () => {
    const o = addObject(doc0, { levelId: L1, position: [2.5, 0, 0], size: [1, 0.8, 1], materialId: 'wood-furniture' }).doc;
    expect(traceLink(o, tx, rx, '2.4').obstructions).toHaveLength(0); // ray at 1.0 m clears 0.8 m
    const low = traceLink(o, { ...tx, position: [0, 0.5, 0] }, { ...rx, position: [5, 0.5, 0] }, '2.4');
    expect(low.obstructions.map((x) => x.lossDb)).toEqual([2]);
    // Rotated 45 deg, a thin box offset to the side is still found where its footprint really is.
    const rot = addObject(doc0, { levelId: L1, position: [2.5, 0, 0.5], size: [2, 2, 0.2], rotationY: Math.PI / 4 }).doc;
    expect(traceLink(rot, tx, rx, '2.4').obstructions).toHaveLength(1);
    const flat = addObject(doc0, { levelId: L1, position: [2.5, 0, 0.5], size: [2, 2, 0.2], rotationY: 0 }).doc;
    expect(traceLink(flat, tx, rx, '2.4').obstructions).toHaveLength(0);
  });

  it('a person on the line costs 4 / 6 dB; a fallen one is under the ray', () => {
    const base = { ...doc0, agents: [{ id: 'p', name: 'สมชาย', kind: 'person' as const, color: '#fff', radius: 0.2, height: 1.7, speed: 1.2, materialId: 'human-body', start: { levelId: L1, p: [0, 0] as [number, number], dwell: 0 }, behavior: { type: 'roam' as const, dwellMin: 1, dwellMax: 2 } }] };
    const stand = [{ agentId: 'p', position: [2.5, 0, 0] as [number, number, number], posture: 'standing' as const }];
    for (const [band, loss] of [['2.4', 4], ['5', 6]] as const) {
      const d = traceLink(base, tx, rx, band, stand).pathLossDb - traceLink(base, tx, rx, band).pathLossDb;
      expect(d).toBeCloseTo(loss, 5);
    }
    expect(traceLink(base, tx, rx, '2.4', [{ ...stand[0]!, posture: 'fallen' }]).obstructions).toHaveLength(0);
    const aside = [{ ...stand[0]!, position: [2.5, 0, 0.5] as [number, number, number] }];
    expect(traceLink(base, tx, rx, '2.4', aside).obstructions).toHaveLength(0);
  });

  it('adds one slab loss per level floor between the endpoints', () => {
    const two = addLevel(doc0, { name: 'ชั้น 2' }).doc;
    const L2 = two.levels[1]!.id;
    const up = { levelId: L2, position: [0, 1, 0] as [number, number, number] };
    const t = traceLink(two, tx, up, '2.4');
    expect(t.obstructions.map((x) => [x.kind, x.lossDb])).toEqual([['slab', 18]]);
    expect(traceLink(two, up, tx, '5').obstructions[0]!.lossDb).toBe(25);
    expect(traceLink(two, tx, tx, '2.4').obstructions).toHaveLength(0);
  });
});

describe('rf: heatmap + stats', () => {
  const room = (d: SceneDoc, x0: number, x1: number) =>
    addRoom(d, { levelId: L1, name: 'r', polygon: [[x0, 0], [x1, 0], [x1, 4], [x0, 4]], cameraAllowed: true });

  it('covers only room cells, is deterministic, and picks the strongest radio', () => {
    let d = room(doc0, 0, 4).doc;
    d = addRadio(d, { levelId: L1, position: [1, 2, 2] }).doc;
    d = addRadio(d, { levelId: L1, position: [3, 2, 2] }).doc;
    const a = computeHeatmap(d, { levelId: L1, band: '2.4', source: 'best' });
    const b = computeHeatmap(d, { levelId: L1, band: '2.4', source: 'best' });
    expect(a.cols * a.rows).toBe(16 * 16);
    expect(Array.from(a.values)).toEqual(Array.from(b.values));
    expect(a.bestRadio[0 * a.cols + 1]).toBe(0); // near (1, 2)-ish radio
    expect(a.bestRadio[0 * a.cols + 14]).toBe(1);
    expect(a.values.every((v) => v <= 0 && v >= -100)).toBe(true);
    const only1 = computeHeatmap(d, { levelId: L1, band: '2.4', source: d.radios[1]!.id });
    expect(new Set(only1.bestRadio)).toEqual(new Set([1]));
  });

  it('leaves NaN / -1 outside rooms', () => {
    let d = room(doc0, 0, 2).doc;
    d = room(d, 6, 8).doc;
    d = addRadio(d, { levelId: L1, position: [1, 2, 2] }).doc;
    const hm = computeHeatmap(d, { levelId: L1, band: '5', source: 'best' });
    const mid = Math.floor((4 - hm.minX) / hm.cell);
    expect(Number.isNaN(hm.values[2 * hm.cols + mid]!)).toBe(true);
    expect(hm.bestRadio[2 * hm.cols + mid]).toBe(-1);
  });

  it('quality thresholds and per-room stats', () => {
    expect([-50, -50.1, -67, -75, -85, -85.1].map(qualityOf)).toEqual(['excellent', 'good', 'good', 'fair', 'poor', 'none']);
    const r = room(doc0, 0, 4);
    const d = addRadio(r.doc, { levelId: L1, position: [2, 2, 2] }).doc;
    const [cov] = roomCoverage(d, computeHeatmap(d, { levelId: L1, band: '2.4', source: 'best' }));
    expect(cov!.roomId).toBe(r.id);
    expect(cov!.p10Dbm).toBeLessThanOrEqual(cov!.meanDbm);
    expect(cov!.quality).toBe('excellent');
  });

  it('a closed brick wall between AP and room lowers the signal', () => {
    let d = addRadio(room(doc0, 6, 10).doc, { levelId: L1, position: [2, 2, 2] }).doc;
    const open = roomCoverage(d, computeHeatmap(d, { levelId: L1, band: '2.4', source: 'best' }))[0]!.meanDbm;
    d = addWall(d, { levelId: L1, a: [5, -1], b: [5, 5], thickness: 0.2, materialId: 'brick' }).doc;
    const walled = roomCoverage(d, computeHeatmap(d, { levelId: L1, band: '2.4', source: 'best' }))[0]!.meanDbm;
    expect(open - walled).toBeCloseTo(8, 1);
  });
});
