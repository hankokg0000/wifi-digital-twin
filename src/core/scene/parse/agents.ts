import type { Agent, AgentBehavior, Waypoint, Incident, PopulationSettings } from '../types';
import { fail, isFiniteNumber, isString, isBoolean, isVec2 } from './shape';

function parseWaypoint(raw: unknown, path: string): Waypoint {
  if (typeof raw !== 'object' || raw === null) return fail(`${path} must be an object`);
  const wp = raw as Record<string, unknown>;
  if (!isString(wp['levelId'])) return fail(`${path}.levelId must be a string`);
  if (!isVec2(wp['p'])) return fail(`${path}.p must be a Vec2`);
  if (!isFiniteNumber(wp['dwell'])) return fail(`${path}.dwell must be a finite number`);
  return { levelId: wp['levelId'], p: wp['p'], dwell: wp['dwell'] };
}

export function parseAgents(items: unknown[]): Agent[] {
  return items.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) return fail(`agents[${i}] must be an object`);
    const a = raw as Record<string, unknown>;
    if (!isString(a['id'])) return fail(`agents[${i}].id must be a string`);
    if (!isString(a['name'])) return fail(`agents[${i}].name must be a string`);
    if (a['kind'] !== 'person' && a['kind'] !== 'pet') return fail(`agents[${i}].kind must be "person" | "pet"`);
    if (!isString(a['color'])) return fail(`agents[${i}].color must be a string`);
    if (!isFiniteNumber(a['radius'])) return fail(`agents[${i}].radius must be a finite number`);
    if (!isFiniteNumber(a['height'])) return fail(`agents[${i}].height must be a finite number`);
    if (!isFiniteNumber(a['speed'])) return fail(`agents[${i}].speed must be a finite number`);
    if (!isString(a['materialId'])) return fail(`agents[${i}].materialId must be a string`);
    const start = parseWaypoint(a['start'], `agents[${i}].start`);

    const rawBehavior = a['behavior'];
    if (typeof rawBehavior !== 'object' || rawBehavior === null) {
      return fail(`agents[${i}].behavior must be an object`);
    }
    const b = rawBehavior as Record<string, unknown>;
    let behavior: AgentBehavior;
    if (b['type'] === 'route') {
      if (!Array.isArray(b['waypoints'])) return fail(`agents[${i}].behavior.waypoints must be an array`);
      const waypoints = b['waypoints'].map((raw, j) => parseWaypoint(raw, `agents[${i}].behavior.waypoints[${j}]`));
      if (!isBoolean(b['loop'])) return fail(`agents[${i}].behavior.loop must be a boolean`);
      behavior = { type: 'route', waypoints, loop: b['loop'] };
    } else if (b['type'] === 'wander') {
      if (!isString(b['levelId'])) return fail(`agents[${i}].behavior.levelId must be a string`);
      if (b['roomId'] !== undefined && !isString(b['roomId'])) {
        return fail(`agents[${i}].behavior.roomId must be a string when present`);
      }
      if (!isFiniteNumber(b['pauseMin'])) return fail(`agents[${i}].behavior.pauseMin must be a finite number`);
      if (!isFiniteNumber(b['pauseMax'])) return fail(`agents[${i}].behavior.pauseMax must be a finite number`);
      behavior =
        b['roomId'] === undefined
          ? { type: 'wander', levelId: b['levelId'], pauseMin: b['pauseMin'], pauseMax: b['pauseMax'] }
          : { type: 'wander', levelId: b['levelId'], roomId: b['roomId'], pauseMin: b['pauseMin'], pauseMax: b['pauseMax'] };
    } else if (b['type'] === 'roam') {
      if (!isFiniteNumber(b['dwellMin'])) return fail(`agents[${i}].behavior.dwellMin must be a finite number`);
      if (!isFiniteNumber(b['dwellMax'])) return fail(`agents[${i}].behavior.dwellMax must be a finite number`);
      behavior = { type: 'roam', dwellMin: b['dwellMin'], dwellMax: b['dwellMax'] };
    } else {
      return fail(`agents[${i}].behavior.type must be "route" | "wander" | "roam"`);
    }

    const out: Agent = {
      id: a['id'],
      name: a['name'],
      kind: a['kind'],
      color: a['color'],
      radius: a['radius'],
      height: a['height'],
      speed: a['speed'],
      materialId: a['materialId'],
      start,
      behavior,
    };
    return out;
  });
}

export function parseIncidents(items: unknown[]): Incident[] {
  return items.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) return fail(`incidents[${i}] must be an object`);
    const inc = raw as Record<string, unknown>;
    if (!isString(inc['id'])) return fail(`incidents[${i}].id must be a string`);
    if (inc['kind'] !== 'fall') return fail(`incidents[${i}].kind must be "fall"`);
    if (!isString(inc['agentId'])) return fail(`incidents[${i}].agentId must be a string`);
    if (!isFiniteNumber(inc['t'])) return fail(`incidents[${i}].t must be a finite number`);
    if (!isFiniteNumber(inc['duration'])) return fail(`incidents[${i}].duration must be a finite number`);
    const out: Incident = { id: inc['id'], kind: inc['kind'], agentId: inc['agentId'], t: inc['t'], duration: inc['duration'] };
    return out;
  });
}

export function parsePopulation(rawPopulation: Record<string, unknown>): PopulationSettings {
  if (!isFiniteNumber(rawPopulation['people'])) return fail('population.people must be a finite number');
  if (!isFiniteNumber(rawPopulation['pets'])) return fail('population.pets must be a finite number');
  if (!isFiniteNumber(rawPopulation['fallsPerHour'])) return fail('population.fallsPerHour must be a finite number');
  return {
    people: rawPopulation['people'],
    pets: rawPopulation['pets'],
    fallsPerHour: rawPopulation['fallsPerHour'],
  };
}
