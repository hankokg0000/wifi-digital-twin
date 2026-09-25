import { describe, it, expect } from 'vitest';
import { validateDoc } from './validate';
import { createEmptyDoc } from './doc';
import type { SceneDoc, Material } from './types';

describe('validate', () => {
  it('accepts empty doc with no issues', () => {
    const doc = createEmptyDoc();
    const issues = validateDoc(doc);
    expect(issues).toHaveLength(0);
  });

  describe('id uniqueness', () => {
    it('rejects duplicate ids', () => {
      const doc = createEmptyDoc();
      const wallId = 'w1';
      const wall = {
        id: wallId,
        levelId: doc.levels[0]!.id,
        a: [0, 0] as [number, number],
        b: [1, 0] as [number, number],
        thickness: 0.1,
        height: 3,
        materialId: 'brick',
      };
      const room = {
        id: wallId, // duplicate!
        levelId: doc.levels[0]!.id,
        name: 'test',
        polygon: [[0, 0], [1, 0], [1, 1]] as [number, number][],
        cameraAllowed: false,
      };
      const docWithDup = { ...doc, walls: [wall], rooms: [room] };
      const issues = validateDoc(docWithDup);
      expect(issues.some((i) => i.message.includes('Duplicate id'))).toBe(true);
    });
  });

  describe('dangling references', () => {
    it('rejects dangling levelId in wall', () => {
      const doc = createEmptyDoc();
      const wall = {
        id: 'w1',
        levelId: 'l999',
        a: [0, 0] as [number, number],
        b: [1, 0] as [number, number],
        thickness: 0.1,
        height: 3,
        materialId: 'brick',
      };
      const docWithBadRef = { ...doc, walls: [wall] };
      const issues = validateDoc(docWithBadRef);
      expect(issues.some((i) => i.message.includes('does not resolve'))).toBe(true);
    });

    it('rejects dangling materialId', () => {
      const doc = createEmptyDoc();
      const wall = {
        id: 'w1',
        levelId: doc.levels[0]!.id,
        a: [0, 0] as [number, number],
        b: [1, 0] as [number, number],
        thickness: 0.1,
        height: 3,
        materialId: 'm999',
      };
      const docWithBadRef = { ...doc, walls: [wall] };
      const issues = validateDoc(docWithBadRef);
      expect(issues.some((i) => i.message.includes('does not resolve'))).toBe(true);
    });

    it('rejects dangling wallId in opening', () => {
      const doc = createEmptyDoc();
      const opening = {
        id: 'o1',
        wallId: 'w999',
        kind: 'door' as const,
        offset: 0,
        width: 0.9,
        sill: 0,
        height: 2.0,
        materialId: 'wood-door',
        open: false,
      };
      const docWithBadRef = { ...doc, openings: [opening] };
      const issues = validateDoc(docWithBadRef);
      expect(issues.some((i) => i.message.includes('does not resolve'))).toBe(true);
    });
  });

  describe('wall validation', () => {
    it('rejects wall with a === b', () => {
      const doc = createEmptyDoc();
      const wall = {
        id: 'w1',
        levelId: doc.levels[0]!.id,
        a: [1, 1] as [number, number],
        b: [1, 1] as [number, number],
        thickness: 0.1,
        height: 3,
        materialId: 'brick',
      };
      const docWithBadWall = { ...doc, walls: [wall] };
      const issues = validateDoc(docWithBadWall);
      expect(issues.some((i) => i.message.includes('endpoints a and b must differ'))).toBe(true);
    });

    it('rejects wall with thickness <= 0', () => {
      const doc = createEmptyDoc();
      const wall = {
        id: 'w1',
        levelId: doc.levels[0]!.id,
        a: [0, 0] as [number, number],
        b: [1, 0] as [number, number],
        thickness: 0,
        height: 3,
        materialId: 'brick',
      };
      const docWithBadWall = { ...doc, walls: [wall] };
      const issues = validateDoc(docWithBadWall);
      expect(issues.some((i) => i.message.includes('thickness must be > 0'))).toBe(true);
    });

    it('rejects wall with height <= 0', () => {
      const doc = createEmptyDoc();
      const wall = {
        id: 'w1',
        levelId: doc.levels[0]!.id,
        a: [0, 0] as [number, number],
        b: [1, 0] as [number, number],
        thickness: 0.1,
        height: 0,
        materialId: 'brick',
      };
      const docWithBadWall = { ...doc, walls: [wall] };
      const issues = validateDoc(docWithBadWall);
      expect(issues.some((i) => i.message.includes('height must be > 0'))).toBe(true);
    });
  });

  describe('opening validation', () => {
    it('rejects opening that overflows wall length', () => {
      const doc = createEmptyDoc();
      const wall = {
        id: 'w1',
        levelId: doc.levels[0]!.id,
        a: [0, 0] as [number, number],
        b: [10, 0] as [number, number],
        thickness: 0.1,
        height: 3,
        materialId: 'brick',
      };
      const opening = {
        id: 'o1',
        wallId: 'w1',
        kind: 'door' as const,
        offset: 5,
        width: 6, // 5 + 6 = 11 > 10
        sill: 0,
        height: 2.0,
        materialId: 'wood-door',
        open: false,
      };
      const docWithOverflow = { ...doc, walls: [wall], openings: [opening] };
      const issues = validateDoc(docWithOverflow);
      expect(issues.some((i) => i.message.includes('exceeds wall length'))).toBe(true);
    });

    it('rejects opening with sill + height > wall height', () => {
      const doc = createEmptyDoc();
      const wall = {
        id: 'w1',
        levelId: doc.levels[0]!.id,
        a: [0, 0] as [number, number],
        b: [10, 0] as [number, number],
        thickness: 0.1,
        height: 2.5,
        materialId: 'brick',
      };
      const opening = {
        id: 'o1',
        wallId: 'w1',
        kind: 'window' as const,
        offset: 0,
        width: 1.2,
        sill: 1.5,
        height: 1.2, // 1.5 + 1.2 = 2.7 > 2.5
        materialId: 'glass',
        open: false,
      };
      const docWithTall = { ...doc, walls: [wall], openings: [opening] };
      const issues = validateDoc(docWithTall);
      expect(issues.some((i) => i.message.includes('exceeds wall height'))).toBe(true);
    });

    it('rejects overlapping openings', () => {
      const doc = createEmptyDoc();
      const wall = {
        id: 'w1',
        levelId: doc.levels[0]!.id,
        a: [0, 0] as [number, number],
        b: [10, 0] as [number, number],
        thickness: 0.1,
        height: 3,
        materialId: 'brick',
      };
      const opening1 = {
        id: 'o1',
        wallId: 'w1',
        kind: 'door' as const,
        offset: 2,
        width: 2,
        sill: 0,
        height: 2.0,
        materialId: 'wood-door',
        open: false,
      };
      const opening2 = {
        id: 'o2',
        wallId: 'w1',
        kind: 'door' as const,
        offset: 3, // 3 < 2+2=4, overlaps
        width: 1,
        sill: 0,
        height: 2.0,
        materialId: 'wood-door',
        open: false,
      };
      const docWithOverlap = { ...doc, walls: [wall], openings: [opening1, opening2] };
      const issues = validateDoc(docWithOverlap);
      expect(issues.some((i) => i.message.includes('overlaps'))).toBe(true);
    });
  });

  describe('room validation', () => {
    it('rejects room with < 3 points', () => {
      const doc = createEmptyDoc();
      const room = {
        id: 'r1',
        levelId: doc.levels[0]!.id,
        name: 'bad',
        polygon: [[0, 0], [1, 0]] as [number, number][],
        cameraAllowed: false,
      };
      const docWithBadRoom = { ...doc, rooms: [room] };
      const issues = validateDoc(docWithBadRoom);
      expect(issues.some((i) => i.message.includes('must have >= 3 points'))).toBe(true);
    });

    it('rejects room with zero area', () => {
      const doc = createEmptyDoc();
      const room = {
        id: 'r1',
        levelId: doc.levels[0]!.id,
        name: 'bad',
        polygon: [
          [0, 0],
          [1, 1],
          [2, 2],
        ] as [number, number][],
        cameraAllowed: false,
      };
      const docWithZeroArea = { ...doc, rooms: [room] };
      const issues = validateDoc(docWithZeroArea);
      expect(issues.some((i) => i.message.includes('area must be > 0'))).toBe(true);
    });
  });

  describe('radio validation', () => {
    it('rejects radio with 0 ifaces', () => {
      const doc = createEmptyDoc();
      const radio = {
        id: 'r1',
        levelId: doc.levels[0]!.id,
        name: 'bad',
        role: 'ap' as const,
        position: [0, 0, 0] as [number, number, number],
        ifaces: [],
        antennaGainDbi: 3,
      };
      const docWithBadRadio = { ...doc, radios: [radio] };
      const issues = validateDoc(docWithBadRadio);
      expect(issues.some((i) => i.message.includes('must have >= 1 iface'))).toBe(true);
    });

    it('rejects radio with duplicate band', () => {
      const doc = createEmptyDoc();
      const radio = {
        id: 'r1',
        levelId: doc.levels[0]!.id,
        name: 'bad',
        role: 'ap' as const,
        position: [0, 0, 0] as [number, number, number],
        ifaces: [
          { band: '2.4' as const, channel: 6, txPowerDbm: 20 },
          { band: '2.4' as const, channel: 11, txPowerDbm: 20 },
        ],
        antennaGainDbi: 3,
      };
      const docWithDupBand = { ...doc, radios: [radio] };
      const issues = validateDoc(docWithDupBand);
      expect(issues.some((i) => i.message.includes('duplicate band'))).toBe(true);
    });
  });

  describe('material validation', () => {
    it('rejects material with missing band', () => {
      const doc = createEmptyDoc();
      const material: Material = {
        id: 'm1',
        name: 'bad',
        lossDb: { '2.4': 3 } as Record<'2.4' | '5', number>,
        color: '#fff',
      };
      const docWithBadMat = { ...doc, materials: [material] };
      const issues = validateDoc(docWithBadMat);
      expect(issues.some((i) => i.message.includes('must be a finite number'))).toBe(true);
    });

    it('rejects material with negative loss', () => {
      const doc = createEmptyDoc();
      const material: Material = {
        id: 'm1',
        name: 'bad',
        lossDb: { '2.4': -1, '5': 3 },
        color: '#fff',
      };
      const docWithNegMat = { ...doc, materials: [material] };
      const issues = validateDoc(docWithNegMat);
      expect(issues.some((i) => i.message.includes('must be a finite number >= 0'))).toBe(true);
    });
  });
});
