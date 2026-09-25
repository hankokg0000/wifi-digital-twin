import type {
  SceneDoc,
  Level,
  Wall,
  Opening,
  Room,
  SceneObject,
  Agent,
  RadioIface,
  Radio,
  Material,
  ValidationIssue,
} from './types';
import { DEFAULT_MATERIALS } from './materials';
import { newId } from './ids';
import { validateDoc } from './validate';

/** Thrown by `parse` when the input is not valid JSON, not shaped like a SceneDoc, or fails validation. */
export class SceneParseError extends Error {
  issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[]) {
    super(message);
    this.name = 'SceneParseError';
    this.issues = issues;
  }
}

/** A fresh document: one level "ชั้น 1" and the default material library. */
export function createEmptyDoc(): SceneDoc {
  const materials = DEFAULT_MATERIALS.map(cloneMaterial);
  const level: Level = {
    id: newId('level'),
    name: 'ชั้น 1',
    elevation: 0,
    height: 3.0,
    slabMaterialId: 'concrete-slab',
  };
  return {
    version: 1,
    materials,
    levels: [level],
    walls: [],
    openings: [],
    rooms: [],
    objects: [],
    agents: [],
    radios: [],
  };
}

function cloneMaterial(m: Material): Material {
  return { id: m.id, name: m.name, lossDb: { '2.4': m.lossDb['2.4'], '5': m.lossDb['5'] }, color: m.color };
}

function orderedMaterial(m: Material): Material {
  return {
    id: m.id,
    name: m.name,
    lossDb: { '2.4': m.lossDb['2.4'], '5': m.lossDb['5'] },
    color: m.color,
  };
}

function orderedLevel(l: Level): Level {
  return {
    id: l.id,
    name: l.name,
    elevation: l.elevation,
    height: l.height,
    slabMaterialId: l.slabMaterialId,
  };
}

function orderedWall(w: Wall): Wall {
  return {
    id: w.id,
    levelId: w.levelId,
    a: [w.a[0], w.a[1]],
    b: [w.b[0], w.b[1]],
    thickness: w.thickness,
    height: w.height,
    materialId: w.materialId,
  };
}

function orderedOpening(o: Opening): Opening {
  return {
    id: o.id,
    wallId: o.wallId,
    kind: o.kind,
    offset: o.offset,
    width: o.width,
    sill: o.sill,
    height: o.height,
    materialId: o.materialId,
    open: o.open,
  };
}

function orderedRoom(r: Room): Room {
  return {
    id: r.id,
    levelId: r.levelId,
    name: r.name,
    polygon: r.polygon.map((p): [number, number] => [p[0], p[1]]),
    cameraAllowed: r.cameraAllowed,
  };
}

function orderedObject(o: SceneObject): SceneObject {
  return {
    id: o.id,
    levelId: o.levelId,
    name: o.name,
    position: [o.position[0], o.position[1], o.position[2]],
    size: [o.size[0], o.size[1], o.size[2]],
    rotationY: o.rotationY,
    materialId: o.materialId,
  };
}

function orderedAgent(a: Agent): Agent {
  return {
    id: a.id,
    levelId: a.levelId,
    kind: a.kind,
    radius: a.radius,
    height: a.height,
    path: a.path.map((wp) => ({ t: wp.t, p: [wp.p[0], wp.p[1]] as [number, number] })),
    materialId: a.materialId,
  };
}

function orderedIface(i: RadioIface): RadioIface {
  return { band: i.band, channel: i.channel, txPowerDbm: i.txPowerDbm };
}

function orderedRadio(r: Radio): Radio {
  return {
    id: r.id,
    levelId: r.levelId,
    name: r.name,
    role: r.role,
    position: [r.position[0], r.position[1], r.position[2]],
    ifaces: r.ifaces.map(orderedIface),
    antennaGainDbi: r.antennaGainDbi,
  };
}

/** Deterministic JSON serialization: fixed key order per type, doc-order arrays, trailing newline. */
export function serialize(doc: SceneDoc): string {
  const ordered: SceneDoc = {
    version: 1,
    materials: doc.materials.map(orderedMaterial),
    levels: doc.levels.map(orderedLevel),
    walls: doc.walls.map(orderedWall),
    openings: doc.openings.map(orderedOpening),
    rooms: doc.rooms.map(orderedRoom),
    objects: doc.objects.map(orderedObject),
    agents: doc.agents.map(orderedAgent),
    radios: doc.radios.map(orderedRadio),
  };
  return JSON.stringify(ordered, null, 2) + '\n';
}

function fail(message: string): never {
  throw new SceneParseError(message, [{ path: '$', message }]);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isVec2(v: unknown): v is [number, number] {
  return Array.isArray(v) && v.length === 2 && isFiniteNumber(v[0]) && isFiniteNumber(v[1]);
}

function isVec3(v: unknown): v is [number, number, number] {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    isFiniteNumber(v[0]) &&
    isFiniteNumber(v[1]) &&
    isFiniteNumber(v[2])
  );
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

function isBand(v: unknown): v is '2.4' | '5' {
  return v === '2.4' || v === '5';
}

/**
 * Parse and shape-check raw JSON into a SceneDoc, then run validateDoc.
 * Throws SceneParseError (with `.issues`) on any JSON error, shape mismatch, or validation issue.
 */
export function parse(json: string): SceneDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return fail(`invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (typeof raw !== 'object' || raw === null) {
    return fail('document must be a JSON object');
  }
  const d = raw as Record<string, unknown>;

  if (d['version'] !== 1) {
    return fail('unsupported or missing "version" (expected 1)');
  }

  const requiredArrays = [
    'materials',
    'levels',
    'walls',
    'openings',
    'rooms',
    'objects',
    'agents',
    'radios',
  ] as const;
  for (const key of requiredArrays) {
    if (!Array.isArray(d[key])) {
      return fail(`"${key}" must be an array`);
    }
  }

  const materials = (d['materials'] as unknown[]).map((raw, i) => {
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

  const levels = (d['levels'] as unknown[]).map((raw, i) => {
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

  const walls = (d['walls'] as unknown[]).map((raw, i) => {
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

  const openings = (d['openings'] as unknown[]).map((raw, i) => {
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

  const rooms = (d['rooms'] as unknown[]).map((raw, i) => {
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

  const objects = (d['objects'] as unknown[]).map((raw, i) => {
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

  const agents = (d['agents'] as unknown[]).map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) return fail(`agents[${i}] must be an object`);
    const a = raw as Record<string, unknown>;
    if (!isString(a['id'])) return fail(`agents[${i}].id must be a string`);
    if (!isString(a['levelId'])) return fail(`agents[${i}].levelId must be a string`);
    if (a['kind'] !== 'person' && a['kind'] !== 'pet') return fail(`agents[${i}].kind must be "person" | "pet"`);
    if (!isFiniteNumber(a['radius'])) return fail(`agents[${i}].radius must be a finite number`);
    if (!isFiniteNumber(a['height'])) return fail(`agents[${i}].height must be a finite number`);
    if (!Array.isArray(a['path'])) return fail(`agents[${i}].path must be an array`);
    const path = a['path'].map((raw, j) => {
      if (typeof raw !== 'object' || raw === null) return fail(`agents[${i}].path[${j}] must be an object`);
      const wp = raw as Record<string, unknown>;
      if (!isFiniteNumber(wp['t'])) return fail(`agents[${i}].path[${j}].t must be a finite number`);
      if (!isVec2(wp['p'])) return fail(`agents[${i}].path[${j}].p must be a Vec2`);
      return { t: wp['t'], p: wp['p'] };
    });
    if (!isString(a['materialId'])) return fail(`agents[${i}].materialId must be a string`);
    const out: Agent = {
      id: a['id'],
      levelId: a['levelId'],
      kind: a['kind'],
      radius: a['radius'],
      height: a['height'],
      path,
      materialId: a['materialId'],
    };
    return out;
  });

  const radios = (d['radios'] as unknown[]).map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) return fail(`radios[${i}] must be an object`);
    const r = raw as Record<string, unknown>;
    if (!isString(r['id'])) return fail(`radios[${i}].id must be a string`);
    if (!isString(r['levelId'])) return fail(`radios[${i}].levelId must be a string`);
    if (!isString(r['name'])) return fail(`radios[${i}].name must be a string`);
    if (r['role'] !== 'ap' && r['role'] !== 'client' && r['role'] !== 'sensor-node') {
      return fail(`radios[${i}].role must be "ap" | "client" | "sensor-node"`);
    }
    if (!isVec3(r['position'])) return fail(`radios[${i}].position must be a Vec3`);
    if (!Array.isArray(r['ifaces'])) return fail(`radios[${i}].ifaces must be an array`);
    const ifaces = r['ifaces'].map((raw, j) => {
      if (typeof raw !== 'object' || raw === null) return fail(`radios[${i}].ifaces[${j}] must be an object`);
      const f = raw as Record<string, unknown>;
      if (!isBand(f['band'])) return fail(`radios[${i}].ifaces[${j}].band must be "2.4" | "5"`);
      if (!isFiniteNumber(f['channel'])) return fail(`radios[${i}].ifaces[${j}].channel must be a finite number`);
      if (!isFiniteNumber(f['txPowerDbm'])) return fail(`radios[${i}].ifaces[${j}].txPowerDbm must be a finite number`);
      const out: RadioIface = { band: f['band'], channel: f['channel'], txPowerDbm: f['txPowerDbm'] };
      return out;
    });
    if (!isFiniteNumber(r['antennaGainDbi'])) return fail(`radios[${i}].antennaGainDbi must be a finite number`);
    const out: Radio = {
      id: r['id'],
      levelId: r['levelId'],
      name: r['name'],
      role: r['role'],
      position: r['position'],
      ifaces,
      antennaGainDbi: r['antennaGainDbi'],
    };
    return out;
  });

  const doc: SceneDoc = { version: 1, materials, levels, walls, openings, rooms, objects, agents, radios };

  const issues = validateDoc(doc);
  if (issues.length > 0) {
    throw new SceneParseError(`SceneDoc failed validation with ${issues.length} issue(s)`, issues);
  }

  return doc;
}
