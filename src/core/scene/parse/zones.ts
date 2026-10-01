import type { Zone } from '../types';
import { fail, isFiniteNumber, isString, isBoolean, isVec2 } from './shape';

export function parseZones(items: unknown[]): Zone[] {
  return items.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) return fail(`zones[${i}] must be an object`);
    const z = raw as Record<string, unknown>;
    if (!isString(z['id'])) return fail(`zones[${i}].id must be a string`);
    if (!isString(z['name'])) return fail(`zones[${i}].name must be a string`);
    if (!isString(z['levelId'])) return fail(`zones[${i}].levelId must be a string`);
    if (z['roomId'] !== undefined && !isString(z['roomId'])) return fail(`zones[${i}].roomId must be a string when present`);
    if (!Array.isArray(z['polygon']) || !z['polygon'].every(isVec2)) {
      return fail(`zones[${i}].polygon must be an array of Vec2`);
    }
    if (z['appliesTo'] !== 'person' && z['appliesTo'] !== 'pet' && z['appliesTo'] !== 'any') {
      return fail(`zones[${i}].appliesTo must be "person" | "pet" | "any"`);
    }
    if (!isBoolean(z['enabled'])) return fail(`zones[${i}].enabled must be a boolean`);
    const out: Zone = {
      id: z['id'],
      name: z['name'],
      levelId: z['levelId'],
      ...(z['roomId'] !== undefined ? { roomId: z['roomId'] as string } : {}),
      polygon: z['polygon'] as [number, number][],
      appliesTo: z['appliesTo'],
      enabled: z['enabled'],
    };
    return out;
  });
}
