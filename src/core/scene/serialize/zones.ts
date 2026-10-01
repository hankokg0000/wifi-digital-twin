import type { Zone } from '../types';

export function orderedZone(z: Zone): Zone {
  return z.roomId === undefined
    ? {
        id: z.id,
        name: z.name,
        levelId: z.levelId,
        polygon: z.polygon.map((p): [number, number] => [p[0], p[1]]),
        appliesTo: z.appliesTo,
        enabled: z.enabled,
      }
    : {
        id: z.id,
        name: z.name,
        levelId: z.levelId,
        roomId: z.roomId,
        polygon: z.polygon.map((p): [number, number] => [p[0], p[1]]),
        appliesTo: z.appliesTo,
        enabled: z.enabled,
      };
}
