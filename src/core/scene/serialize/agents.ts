import type { Agent, Waypoint, AgentBehavior, Incident, PopulationSettings } from '../types';

function orderedWaypoint(wp: Waypoint): Waypoint {
  return { levelId: wp.levelId, p: [wp.p[0], wp.p[1]], dwell: wp.dwell };
}

function orderedBehavior(b: AgentBehavior): AgentBehavior {
  if (b.type === 'route') {
    return { type: 'route', waypoints: b.waypoints.map(orderedWaypoint), loop: b.loop };
  }
  if (b.type === 'wander') {
    return b.roomId === undefined
      ? { type: 'wander', levelId: b.levelId, pauseMin: b.pauseMin, pauseMax: b.pauseMax }
      : { type: 'wander', levelId: b.levelId, roomId: b.roomId, pauseMin: b.pauseMin, pauseMax: b.pauseMax };
  }
  return { type: 'roam', dwellMin: b.dwellMin, dwellMax: b.dwellMax };
}

export function orderedAgent(a: Agent): Agent {
  return {
    id: a.id,
    name: a.name,
    kind: a.kind,
    color: a.color,
    radius: a.radius,
    height: a.height,
    speed: a.speed,
    materialId: a.materialId,
    start: orderedWaypoint(a.start),
    behavior: orderedBehavior(a.behavior),
  };
}

export function orderedIncident(i: Incident): Incident {
  return { id: i.id, kind: i.kind, agentId: i.agentId, t: i.t, duration: i.duration };
}

export function orderedPopulation(p: PopulationSettings): PopulationSettings {
  return { people: p.people, pets: p.pets, fallsPerHour: p.fallsPerHour };
}
