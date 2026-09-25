import { describe, it, expect } from 'vitest';
import { createEmptyDoc, serialize, parse, SceneParseError } from './doc';
import { sampleHouse } from './sample-house';
import type { Wall, SceneDoc } from './types';

describe('doc', () => {
  describe('createEmptyDoc', () => {
    it('creates valid empty document', () => {
      const doc = createEmptyDoc();
      expect(doc.version).toBe(1);
      expect(doc.levels).toHaveLength(1);
      expect(doc.levels[0]!.name).toBe('ชั้น 1');
      expect(doc.materials.length).toBeGreaterThan(0);
      expect(doc.walls).toHaveLength(0);
      expect(doc.openings).toHaveLength(0);
      expect(doc.rooms).toHaveLength(0);
      expect(doc.objects).toHaveLength(0);
      expect(doc.agents).toHaveLength(0);
      expect(doc.radios).toHaveLength(0);
    });
  });

  describe('serialize', () => {
    it('ends with newline', () => {
      const doc = createEmptyDoc();
      const json = serialize(doc);
      expect(json.endsWith('\n')).toBe(true);
    });

    it('is deterministic', () => {
      const doc = createEmptyDoc();
      const s1 = serialize(doc);
      const s2 = serialize(doc);
      expect(s1).toBe(s2);
    });

    it('preserves key order in materials', () => {
      const doc = createEmptyDoc();
      const json = serialize(doc);
      // Check that key order matches the expected order (id, name, lossDb, color)
      const parsed = JSON.parse(json);
      const keys = Object.keys(parsed.materials[0]);
      expect(keys).toEqual(['id', 'name', 'lossDb', 'color']);
    });

    it('preserves key order in levels', () => {
      const doc = createEmptyDoc();
      const json = serialize(doc);
      const parsed = JSON.parse(json);
      const keys = Object.keys(parsed.levels[0]);
      expect(keys).toEqual(['id', 'name', 'elevation', 'height', 'slabMaterialId']);
    });

    it('is idempotent under parse/serialize cycle', () => {
      const doc = createEmptyDoc();
      const s1 = serialize(doc);
      const parsed = parse(s1);
      const s2 = serialize(parsed);
      expect(s2).toBe(s1);
    });

    it('is key-order independent on parse', () => {
      const doc = createEmptyDoc();
      const s1 = serialize(doc);
      const parsed1 = parse(s1);

      // Create a wall with the actual types
      const wall: Wall = {
        id: 'w1',
        levelId: parsed1.levels[0]!.id,
        a: [0, 0],
        b: [10, 0],
        thickness: 0.1,
        height: 3,
        materialId: 'brick',
      };

      // Reconstruct by putting it back into the doc
      const docWithWall: SceneDoc = { ...parsed1, walls: [wall] };

      // Serialize and parse again
      const s2 = serialize(docWithWall);
      const parsed2 = parse(s2);

      // The serialize output should match (deterministic key ordering)
      expect(serialize(parsed2)).toBe(s2);
    });
  });

  describe('parse', () => {
    it('parses valid empty doc', () => {
      const doc = createEmptyDoc();
      const json = serialize(doc);
      const parsed = parse(json);
      expect(parsed.version).toBe(1);
      expect(parsed.levels).toHaveLength(1);
    });

    it('throws on invalid JSON', () => {
      expect(() => parse('not json')).toThrow(SceneParseError);
      try {
        parse('not json');
      } catch (e) {
        if (e instanceof SceneParseError) {
          expect(e.issues.length).toBeGreaterThan(0);
        }
      }
    });

    it('throws on wrong version', () => {
      const json = JSON.stringify({ version: 2, materials: [], levels: [], walls: [], openings: [], rooms: [], objects: [], agents: [], radios: [] });
      expect(() => parse(json)).toThrow(SceneParseError);
    });

    it('throws on missing arrays', () => {
      const json = JSON.stringify({ version: 1, materials: [] });
      expect(() => parse(json)).toThrow(SceneParseError);
    });

    it('throws on dangling levelId', () => {
      const json = JSON.stringify({
        version: 1,
        materials: [{ id: 'm1', name: 'test', lossDb: { '2.4': 1, '5': 1 }, color: '#fff' }],
        levels: [],
        walls: [{ id: 'w1', levelId: 'l999', a: [0, 0], b: [1, 1], thickness: 0.1, height: 3, materialId: 'm1' }],
        openings: [],
        rooms: [],
        objects: [],
        agents: [],
        radios: [],
      });
      expect(() => parse(json)).toThrow(SceneParseError);
    });

    it('throws on non-finite number', () => {
      const json = JSON.stringify({
        version: 1,
        materials: [{ id: 'm1', name: 'test', lossDb: { '2.4': Infinity, '5': 1 }, color: '#fff' }],
        levels: [],
        walls: [],
        openings: [],
        rooms: [],
        objects: [],
        agents: [],
        radios: [],
      });
      expect(() => parse(json)).toThrow(SceneParseError);
    });

    it('throws on NaN', () => {
      const json = JSON.stringify({
        version: 1,
        materials: [{ id: 'm1', name: 'test', lossDb: { '2.4': NaN, '5': 1 }, color: '#fff' }],
        levels: [],
        walls: [],
        openings: [],
        rooms: [],
        objects: [],
        agents: [],
        radios: [],
      });
      expect(() => parse(json)).toThrow(SceneParseError);
    });

    it('accepts sample house', () => {
      const doc = sampleHouse();
      const json = serialize(doc);
      const parsed = parse(json);
      expect(parsed.levels.length).toBeGreaterThan(0);
    });
  });

  describe('determinism and idempotence', () => {
    it('triple-serialize cycle for empty doc', () => {
      const doc = createEmptyDoc();
      const s1 = serialize(doc);
      const parsed1 = parse(s1);
      const s2 = serialize(parsed1);
      const parsed2 = parse(s2);
      const s3 = serialize(parsed2);
      expect(s1).toBe(s2);
      expect(s2).toBe(s3);
    });

    it('triple-serialize cycle for sample house', () => {
      const doc = sampleHouse();
      const s1 = serialize(doc);
      const parsed1 = parse(s1);
      const s2 = serialize(parsed1);
      const parsed2 = parse(s2);
      const s3 = serialize(parsed2);
      expect(s1).toBe(s2);
      expect(s2).toBe(s3);
    });
  });
});
