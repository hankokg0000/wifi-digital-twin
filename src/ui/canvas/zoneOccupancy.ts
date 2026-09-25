/**
 * Module-level registry of "is an applicable agent currently inside this zone" flags, written
 * once per animation frame by <AgentsLayer> (which already samples every agent's position every
 * frame) and read every frame by <ZoneMesh> to pulse its fill — mirrors labels.ts's pattern so
 * neither side needs React state/re-renders for something that changes 10+ times a second.
 */

const occupied = new Set<string>();

export function setZoneOccupied(zoneId: string, isOccupied: boolean) {
  if (isOccupied) occupied.add(zoneId);
  else occupied.delete(zoneId);
}

export function isZoneOccupied(zoneId: string): boolean {
  return occupied.has(zoneId);
}
