import type { Material, Level, Wall, Opening, Room, SceneObject, Stair } from '../types';
import { fail, isFiniteNumber, isString, isBoolean, isVec2, isVec3 } from './shape';

export function parseMaterials(items: unknown[]): Material[] {
  return items.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) return fail(`materials[${i}] must be an object`);
    const m = raw as Record<string, unknown>;
    if (!isString(m['id'])) return fail(`materials[${i}].id must be a string`);
    if (!isString(m['name'])) return fail(`materials[${i}].name must be a string`);
    if (!isString(m['color'])) return fail(`materials[${i}].color must be a string`);
    const lossDb = m['lossDb'];
    if (typeof lossDb !== 'object' || lossDb === null) {
      return fail(`materials[${i}].lossDb must be an object`);
    }
    const l = lossDb as Record<string, unknown>;
    if (!isFiniteNumber(l['2.4']) || !isFiniteNumber(l['5'])) {
      return fail(`materials[${i}].lossDb must have finite "2.4" and "5"`);
    }
    const out: Material = { id: m['id'], name: m['name'], color: m['color'], lossDb: { '2.4': l['2.4'], '5': l['5'] } };
    return out;
  });
}

export function parseLevels(items: unknown[]): Level[] {
  return items.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) return fail(`levels[${i}] must be an object`);
    const l = raw as Record<string, unknown>;
    if (!isString(l['id'])) return fail(`levels[${i}].id must be a string`);
    if (!isString(l['name'])) return fail(`levels[${i}].name must be a string`);
    if (!isFiniteNumber(l['elevation'])) return fail(`levels[${i}].elevation must be a finite number`);
    if (!isFiniteNumber(l['height'])) return fail(`levels[${i}].height must be a finite number`);
    if (!isString(l['slabMaterialId'])) return fail(`levels[${i}].slabMaterialId must be a string`);
    const out: Level = {
      id: l['id'],
      name: l['name'],
      elevation: l['elevation'],
      height: l['height'],
      slabMaterialId: l['slabMaterialId'],
    };
    return out;
  });
}

export function parseWalls(items: unknown[]): Wall[] {
  return items.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) return fail(`walls[${i}] must be an object`);
    const w = raw as Record<string, unknown>;
    if (!isString(w['id'])) return fail(`walls[${i}].id must be a string`);
    if (!isString(w['levelId'])) return fail(`walls[${i}].levelId must be a string`);
    if (!isVec2(w['a'])) return fail(`walls[${i}].a must be a Vec2`);
    if (!isVec2(w['b'])) return fail(`walls[${i}].b must be a Vec2`);
    if (!isFiniteNumber(w['thickness'])) return fail(`walls[${i}].thickness must be a finite number`);
    if (!isFiniteNumber(w['height'])) return fail(`walls[${i}].height must be a finite number`);
    if (!isString(w['materialId'])) return fail(`walls[${i}].materialId must be a string`);
    const out: Wall = {
      id: w['id'],
      levelId: w['levelId'],
      a: w['a'],
      b: w['b'],
      thickness: w['thickness'],
      height: w['height'],
      materialId: w['materialId'],
    };
    return out;
  });
}

export function parseOpenings(items: unknown[]): Opening[] {
  return items.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) return fail(`openings[${i}] must be an object`);
    const o = raw as Record<string, unknown>;
    if (!isString(o['id'])) return fail(`openings[${i}].id must be a string`);
    if (!isString(o['wallId'])) return fail(`openings[${i}].wallId must be a string`);
    if (o['kind'] !== 'door' && o['kind'] !== 'window') return fail(`openings[${i}].kind must be "door" | "window"`);
    if (!isFiniteNumber(o['offset'])) return fail(`openings[${i}].offset must be a finite number`);
    if (!isFiniteNumber(o['width'])) return fail(`openings[${i}].width must be a finite number`);
    if (!isFiniteNumber(o['sill'])) return fail(`openings[${i}].sill must be a finite number`);
    if (!isFiniteNumber(o['height'])) return fail(`openings[${i}].height must be a finite number`);
    if (!isString(o['materialId'])) return fail(`openings[${i}].materialId must be a string`);
    if (!isBoolean(o['open'])) return fail(`openings[${i}].open must be a boolean`);
    const out: Opening = {
      id: o['id'],
      wallId: o['wallId'],
      kind: o['kind'],
      offset: o['offset'],
      width: o['width'],
      sill: o['sill'],
      height: o['height'],
      materialId: o['materialId'],
      open: o['open'],
    };
    return out;
  });
}

export function parseRooms(items: unknown[]): Room[] {
  return items.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) return fail(`rooms[${i}] must be an object`);
    const r = raw as Record<string, unknown>;
    if (!isString(r['id'])) return fail(`rooms[${i}].id must be a string`);
    if (!isString(r['levelId'])) return fail(`rooms[${i}].levelId must be a string`);
    if (!isString(r['name'])) return fail(`rooms[${i}].name must be a string`);
    if (!Array.isArray(r['polygon']) || !r['polygon'].every(isVec2)) {
      return fail(`rooms[${i}].polygon must be an array of Vec2`);
    }
    if (!isBoolean(r['cameraAllowed'])) return fail(`rooms[${i}].cameraAllowed must be a boolean`);
    const out: Room = {
      id: r['id'],
      levelId: r['levelId'],
      name: r['name'],
      polygon: r['polygon'] as [number, number][],
      cameraAllowed: r['cameraAllowed'],
    };
    return out;
  });
}

export function parseObjects(items: unknown[]): SceneObject[] {
  return items.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) return fail(`objects[${i}] must be an object`);
    const o = raw as Record<string, unknown>;
    if (!isString(o['id'])) return fail(`objects[${i}].id must be a string`);
    if (!isString(o['levelId'])) return fail(`objects[${i}].levelId must be a string`);
    if (!isString(o['name'])) return fail(`objects[${i}].name must be a string`);
    if (!isVec3(o['position'])) return fail(`objects[${i}].position must be a Vec3`);
    if (!isVec3(o['size'])) return fail(`objects[${i}].size must be a Vec3`);
    if (!isFiniteNumber(o['rotationY'])) return fail(`objects[${i}].rotationY must be a finite number`);
    if (!isString(o['materialId'])) return fail(`objects[${i}].materialId must be a string`);
    const out: SceneObject = {
      id: o['id'],
      levelId: o['levelId'],
      name: o['name'],
      position: o['position'],
      size: o['size'],
      rotationY: o['rotationY'],
      materialId: o['materialId'],
    };
    return out;
  });
}

export function parseStairs(items: unknown[]): Stair[] {
  return items.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) return fail(`stairs[${i}] must be an object`);
    const s = raw as Record<string, unknown>;
    if (!isString(s['id'])) return fail(`stairs[${i}].id must be a string`);
    if (!isString(s['fromLevelId'])) return fail(`stairs[${i}].fromLevelId must be a string`);
    if (!isString(s['toLevelId'])) return fail(`stairs[${i}].toLevelId must be a string`);
    if (!isVec2(s['bottom'])) return fail(`stairs[${i}].bottom must be a Vec2`);
    if (!isVec2(s['top'])) return fail(`stairs[${i}].top must be a Vec2`);
    if (!isFiniteNumber(s['width'])) return fail(`stairs[${i}].width must be a finite number`);
    const out: Stair = {
      id: s['id'],
      fromLevelId: s['fromLevelId'],
      toLevelId: s['toLevelId'],
      bottom: s['bottom'],
      top: s['top'],
      width: s['width'],
    };
    return out;
  });
}
