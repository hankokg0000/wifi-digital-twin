import type { SceneDoc } from '../types';
import { orderedMaterial, orderedLevel, orderedWall, orderedOpening, orderedRoom, orderedObject, orderedStair } from './building';
import { orderedAgent, orderedIncident, orderedPopulation } from './agents';
import { orderedRadio } from './radios';
import { orderedZone } from './zones';

/** Rebuild `doc` with a fixed key order per type (arrays keep doc order), ready for JSON.stringify. */
export function orderDoc(doc: SceneDoc): SceneDoc {
  return {
    version: 1,
    seed: doc.seed,
    materials: doc.materials.map(orderedMaterial),
    levels: doc.levels.map(orderedLevel),
    walls: doc.walls.map(orderedWall),
    openings: doc.openings.map(orderedOpening),
    rooms: doc.rooms.map(orderedRoom),
    objects: doc.objects.map(orderedObject),
    agents: doc.agents.map(orderedAgent),
    radios: doc.radios.map(orderedRadio),
    stairs: doc.stairs.map(orderedStair),
    zones: doc.zones.map(orderedZone),
    incidents: doc.incidents.map(orderedIncident),
    population: orderedPopulation(doc.population),
  };
}
