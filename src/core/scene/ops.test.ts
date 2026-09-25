import { describe, it, expect } from 'vitest';
import {
  addLevel,
  removeLevel,
  addWall,
  updateWall,
  removeWall,
  addOpening,
  toggleOpening,
  addRoom,
  addObject,
  addRadio,
  SceneOpError,
  OPENING_DEFAULTS,
} from './ops';
import { createEmptyDoc } from './doc';
import { validateDoc } from './validate';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

describe('ops', () => {
  describe('addLevel', () => {
    it('adds level with default elevation', () => {
      const doc = createEmptyDoc();
      const level1 = doc.levels[0]!;
      const result = addLevel(doc, { name: 'ชั้น 2' });
      expect(result.doc.levels).toHaveLength(2);
      const newLevel = result.doc.levels[1];
      expect(newLevel).toBeDefined();
      expect(newLevel!.elevation).toBe(level1.elevation + level1.height + 0.2);
      expect(newLevel!.name).toBe('ชั้น 2');
    });

    it('adds level with custom elevation', () => {
      const doc = createEmptyDoc();
      const result = addLevel(doc, { elevation: 5.0 });
      expect(result.doc.levels[1]!.elevation).toBe(5.0);
    });

    it('returns level id', () => {
      const doc = createEmptyDoc();
      const result = addLevel(doc, {});
      expect(result.id).toBeDefined();
      expect(result.doc.levels.find((l) => l.id === result.id)).toBeDefined();
    });
  });

  describe('removeLevel', () => {
    it('removes level and cascades walls, rooms, objects, etc.', () => {
      let doc = createEmptyDoc();
      const l1 = doc.levels[0]!.id;
      const l2 = addLevel(doc, {}).doc;
      const l2Id = l2.levels[1]!.id;

      // Add wall to level 2
      const wallRes = addWall(l2, { levelId: l2Id, a: [0, 0], b: [10, 0] });
      doc = wallRes.doc;
      const wallId = wallRes.id;

      // Add room to level 2
      const roomRes = addRoom(doc, { levelId: l2Id, polygon: [[0, 0], [1, 0], [1, 1]] });
      doc = roomRes.doc;

      // Remove level 2
      doc = removeLevel(doc, l2Id);

      expect(doc.levels).toHaveLength(1);
      expect(doc.walls).toHaveLength(0);
      expect(doc.rooms).toHaveLength(0);
    });

    it('refuses to remove last level', () => {
      const doc = createEmptyDoc();
      expect(() => removeLevel(doc, doc.levels[0]!.id)).toThrow(SceneOpError);
      expect(() => removeLevel(doc, doc.levels[0]!.id)).toThrow('cannot remove the last level');
    });
  });

  describe('addWall', () => {
    it('adds wall with defaults', () => {
      const doc = createEmptyDoc();
      const result = addWall(doc, { levelId: doc.levels[0]!.id, a: [0, 0], b: [10, 0] });
      const wall = result.doc.walls[0];
      expect(wall).toBeDefined();
      expect(wall!.thickness).toBe(0.15);
      expect(wall!.materialId).toBe('brick');
      expect(wall!.height).toBe(doc.levels[0]!.height);
    });

    it('adds wall with custom thickness and material', () => {
      const doc = createEmptyDoc();
      const result = addWall(doc, {
        levelId: doc.levels[0]!.id,
        a: [0, 0],
        b: [10, 0],
        thickness: 0.2,
        materialId: 'concrete-wall',
      });
      const wall = result.doc.walls[0];
      expect(wall!.thickness).toBe(0.2);
      expect(wall!.materialId).toBe('concrete-wall');
    });
  });

  describe('updateWall', () => {
    it('refuses to shorten wall if opening no longer fits', () => {
      let doc = createEmptyDoc();
      const levelId = doc.levels[0]!.id;

      // Add wall
      const wallRes = addWall(doc, { levelId, a: [0, 0], b: [10, 0] });
      doc = wallRes.doc;
      const wallId = wallRes.id;

      // Add opening at offset 5
      const openRes = addOpening(doc, { wallId, kind: 'door', offset: 5 });
      doc = openRes.doc;

      // Try to shorten wall to length 4 (opening at 5 won't fit)
      expect(() => updateWall(doc, wallId, { b: [4, 0] })).toThrow(SceneOpError);
    });
  });

  describe('removeWall', () => {
    it('cascades openings', () => {
      let doc = createEmptyDoc();
      const levelId = doc.levels[0]!.id;

      const wallRes = addWall(doc, { levelId, a: [0, 0], b: [10, 0] });
      doc = wallRes.doc;
      const wallId = wallRes.id;

      const openRes = addOpening(doc, { wallId, kind: 'door', offset: 5 });
      doc = openRes.doc;

      doc = removeWall(doc, wallId);
      expect(doc.walls).toHaveLength(0);
      expect(doc.openings).toHaveLength(0);
    });
  });

  describe('addOpening', () => {
    it('adds door with defaults', () => {
      let doc = createEmptyDoc();
      const levelId = doc.levels[0]!.id;

      const wallRes = addWall(doc, { levelId, a: [0, 0], b: [10, 0] });
      doc = wallRes.doc;

      const openRes = addOpening(doc, { wallId: wallRes.id, kind: 'door', offset: 2 });
      const opening = openRes.doc.openings[0];

      expect(opening!.width).toBe(OPENING_DEFAULTS.door.width);
      expect(opening!.sill).toBe(OPENING_DEFAULTS.door.sill);
      expect(opening!.height).toBe(OPENING_DEFAULTS.door.height);
      expect(opening!.materialId).toBe(OPENING_DEFAULTS.door.materialId);
      expect(opening!.open).toBe(false);
    });

    it('adds window with defaults', () => {
      let doc = createEmptyDoc();
      const levelId = doc.levels[0]!.id;

      const wallRes = addWall(doc, { levelId, a: [0, 0], b: [10, 0] });
      doc = wallRes.doc;

      const openRes = addOpening(doc, { wallId: wallRes.id, kind: 'window', offset: 2 });
      const opening = openRes.doc.openings[0];

      expect(opening!.width).toBe(OPENING_DEFAULTS.window.width);
      expect(opening!.sill).toBe(OPENING_DEFAULTS.window.sill);
      expect(opening!.height).toBe(OPENING_DEFAULTS.window.height);
      expect(opening!.materialId).toBe(OPENING_DEFAULTS.window.materialId);
    });

    it('throws if opening does not fit', () => {
      let doc = createEmptyDoc();
      const levelId = doc.levels[0]!.id;

      const wallRes = addWall(doc, { levelId, a: [0, 0], b: [0.5, 0] }); // wall shorter than door width (0.9)
      doc = wallRes.doc;

      expect(() => addOpening(doc, { wallId: wallRes.id, kind: 'door', offset: 0 })).toThrow(SceneOpError);
    });

    it('never returns invalid doc after throw', () => {
      let doc = createEmptyDoc();
      const levelId = doc.levels[0]!.id;

      const wallRes = addWall(doc, { levelId, a: [0, 0], b: [1, 0] });
      doc = wallRes.doc;

      const snapshot = deepClone(doc);

      try {
        addOpening(doc, { wallId: wallRes.id, kind: 'door', offset: 0 });
      } catch {
        // expected to throw
      }

      expect(doc).toEqual(snapshot);
    });
  });

  describe('toggleOpening', () => {
    it('flips open flag', () => {
      let doc = createEmptyDoc();
      const levelId = doc.levels[0]!.id;

      const wallRes = addWall(doc, { levelId, a: [0, 0], b: [10, 0] });
      doc = wallRes.doc;

      const openRes = addOpening(doc, { wallId: wallRes.id, kind: 'door', offset: 2 });
      doc = openRes.doc;
      const openingId = openRes.id;

      expect(doc.openings[0]!.open).toBe(false);

      doc = toggleOpening(doc, openingId);
      expect(doc.openings[0]!.open).toBe(true);

      doc = toggleOpening(doc, openingId);
      expect(doc.openings[0]!.open).toBe(false);
    });
  });

  describe('addRoom', () => {
    it('creates room with default cameraAllowed false', () => {
      const doc = createEmptyDoc();
      const result = addRoom(doc, {
        levelId: doc.levels[0]!.id,
        polygon: [[0, 0], [1, 0], [1, 1]],
      });
      expect(result.doc.rooms[0]!.cameraAllowed).toBe(false);
    });

    it('creates room with explicit cameraAllowed true', () => {
      const doc = createEmptyDoc();
      const result = addRoom(doc, {
        levelId: doc.levels[0]!.id,
        polygon: [[0, 0], [1, 0], [1, 1]],
        cameraAllowed: true,
      });
      expect(result.doc.rooms[0]!.cameraAllowed).toBe(true);
    });
  });

  describe('addObject', () => {
    it('creates object with defaults', () => {
      const doc = createEmptyDoc();
      const result = addObject(doc, { levelId: doc.levels[0]!.id });
      const obj = result.doc.objects[0];
      expect(obj).toBeDefined();
      expect(obj!.position).toEqual([0, 0, 0]);
      expect(obj!.size).toEqual([1, 0.8, 1]);
      expect(obj!.rotationY).toBe(0);
      expect(obj!.materialId).toBe('wood-furniture');
    });
  });

  describe('addRadio', () => {
    it('creates AP with default dual-band ifaces', () => {
      const doc = createEmptyDoc();
      const result = addRadio(doc, { levelId: doc.levels[0]!.id });
      const radio = result.doc.radios[0];

      expect(radio).toBeDefined();
      expect(radio!.role).toBe('ap');
      expect(radio!.ifaces).toHaveLength(2);
      expect(radio!.ifaces[0]!.band).toBe('2.4');
      expect(radio!.ifaces[0]!.channel).toBe(6);
      expect(radio!.ifaces[0]!.txPowerDbm).toBe(20);
      expect(radio!.ifaces[1]!.band).toBe('5');
      expect(radio!.ifaces[1]!.channel).toBe(36);
      expect(radio!.ifaces[1]!.txPowerDbm).toBe(23);
    });

    it('creates radio with default y=2.0', () => {
      const doc = createEmptyDoc();
      const result = addRadio(doc, { levelId: doc.levels[0]!.id });
      expect(result.doc.radios[0]!.position[1]).toBe(2.0);
    });

    it('creates radio with default antennaGainDbi=3', () => {
      const doc = createEmptyDoc();
      const result = addRadio(doc, { levelId: doc.levels[0]!.id });
      expect(result.doc.radios[0]!.antennaGainDbi).toBe(3);
    });
  });

  describe('immutability', () => {
    it('input doc unchanged after addLevel', () => {
      const doc = createEmptyDoc();
      const snapshot = deepClone(doc);

      addLevel(doc, {});

      expect(doc).toEqual(snapshot);
    });

    it('input doc unchanged after addWall', () => {
      const doc = createEmptyDoc();
      const snapshot = deepClone(doc);

      const levelId = doc.levels[0]!.id;
      addWall(doc, { levelId, a: [0, 0], b: [10, 0] });

      expect(doc).toEqual(snapshot);
    });

    it('input doc unchanged after addOpening', () => {
      let doc = createEmptyDoc();
      const levelId = doc.levels[0]!.id;
      const wallRes = addWall(doc, { levelId, a: [0, 0], b: [10, 0] });
      doc = wallRes.doc;

      const snapshot = deepClone(doc);

      addOpening(doc, { wallId: wallRes.id, kind: 'door', offset: 2 });

      expect(doc).toEqual(snapshot);
    });

    it('input doc unchanged after addRoom', () => {
      const doc = createEmptyDoc();
      const snapshot = deepClone(doc);

      addRoom(doc, { levelId: doc.levels[0]!.id, polygon: [[0, 0], [1, 0], [1, 1]] });

      expect(doc).toEqual(snapshot);
    });

    it('input doc unchanged after addObject', () => {
      const doc = createEmptyDoc();
      const snapshot = deepClone(doc);

      addObject(doc, { levelId: doc.levels[0]!.id });

      expect(doc).toEqual(snapshot);
    });

    it('input doc unchanged after addRadio', () => {
      const doc = createEmptyDoc();
      const snapshot = deepClone(doc);

      addRadio(doc, { levelId: doc.levels[0]!.id });

      expect(doc).toEqual(snapshot);
    });
  });

  describe('validation on all ops', () => {
    it('all ops produce valid docs', () => {
      let doc = createEmptyDoc();

      const l2 = addLevel(doc, { name: 'ชั้น 2' });
      doc = l2.doc;
      expect(validateDoc(doc)).toHaveLength(0);

      const w1 = addWall(doc, { levelId: l2.id, a: [0, 0], b: [10, 0] });
      doc = w1.doc;
      expect(validateDoc(doc)).toHaveLength(0);

      const o1 = addOpening(doc, { wallId: w1.id, kind: 'door', offset: 2 });
      doc = o1.doc;
      expect(validateDoc(doc)).toHaveLength(0);

      const r1 = addRoom(doc, { levelId: l2.id, polygon: [[0, 0], [5, 0], [5, 5]] });
      doc = r1.doc;
      expect(validateDoc(doc)).toHaveLength(0);

      const obj = addObject(doc, { levelId: l2.id });
      doc = obj.doc;
      expect(validateDoc(doc)).toHaveLength(0);

      const radio = addRadio(doc, { levelId: l2.id });
      doc = radio.doc;
      expect(validateDoc(doc)).toHaveLength(0);
    });
  });
});
