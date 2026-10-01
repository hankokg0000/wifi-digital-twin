import type { SceneDoc, Level, Material } from './types';
import { DEFAULT_MATERIALS } from './materials';
import { newId } from './ids';
import { validateDoc } from './validate';
import { orderDoc } from './serialize';
import {
  SceneParseError,
  fail,
  isFiniteNumber,
  parseMaterials,
  parseLevels,
  parseWalls,
  parseOpenings,
  parseRooms,
  parseObjects,
  parseStairs,
  parseAgents,
  parseIncidents,
  parsePopulation,
  parseRadios,
  parseZones,
} from './parse';

export { SceneParseError };

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
    seed: 1,
    materials,
    levels: [level],
    walls: [],
    openings: [],
    rooms: [],
    objects: [],
    agents: [],
    radios: [],
    stairs: [],
    zones: [],
    incidents: [],
    population: { people: 0, pets: 0, fallsPerHour: 0 },
  };
}

function cloneMaterial(m: Material): Material {
  return { id: m.id, name: m.name, lossDb: { '2.4': m.lossDb['2.4'], '5': m.lossDb['5'] }, color: m.color };
}

/** Deterministic JSON serialization: fixed key order per type, doc-order arrays, trailing newline. */
export function serialize(doc: SceneDoc): string {
  return JSON.stringify(orderDoc(doc), null, 2) + '\n';
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
  if (!isFiniteNumber(d['seed'])) {
    return fail('"seed" must be a finite number');
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
    'stairs',
    'zones',
    'incidents',
  ] as const;
  for (const key of requiredArrays) {
    if (!Array.isArray(d[key])) {
      return fail(`"${key}" must be an array`);
    }
  }
  if (typeof d['population'] !== 'object' || d['population'] === null) {
    return fail('"population" must be an object');
  }

  const materials = parseMaterials(d['materials'] as unknown[]);
  const levels = parseLevels(d['levels'] as unknown[]);
  const walls = parseWalls(d['walls'] as unknown[]);
  const openings = parseOpenings(d['openings'] as unknown[]);
  const rooms = parseRooms(d['rooms'] as unknown[]);
  const objects = parseObjects(d['objects'] as unknown[]);
  const agents = parseAgents(d['agents'] as unknown[]);
  const radios = parseRadios(d['radios'] as unknown[]);
  const stairs = parseStairs(d['stairs'] as unknown[]);
  const zones = parseZones(d['zones'] as unknown[]);
  const incidents = parseIncidents(d['incidents'] as unknown[]);
  const population = parsePopulation(d['population'] as Record<string, unknown>);

  const doc: SceneDoc = {
    version: 1,
    seed: d['seed'] as number,
    materials,
    levels,
    walls,
    openings,
    rooms,
    objects,
    agents,
    radios,
    stairs,
    zones,
    incidents,
    population,
  };

  const issues = validateDoc(doc);
  if (issues.length > 0) {
    throw new SceneParseError(`SceneDoc failed validation with ${issues.length} issue(s)`, issues);
  }

  return doc;
}
