import type { SceneDoc, ValidationIssue, Id } from './types';
import { wallLength, polygonArea } from './geometry';

function issue(path: string, message: string): ValidationIssue {
  return { path, message };
}

/** Validate a SceneDoc against all Phase 0 invariants. Returns an empty array when clean. */
export function validateDoc(doc: SceneDoc): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const levelIds = new Set(doc.levels.map((l) => l.id));
  const materialIds = new Set(doc.materials.map((m) => m.id));
  const wallIds = new Set(doc.walls.map((w) => w.id));
  const roomIds = new Set(doc.rooms.map((r) => r.id));

  // --- global id uniqueness -----------------------------------------
  const allIds: Id[] = [
    ...doc.materials.map((m) => m.id),
    ...doc.levels.map((l) => l.id),
    ...doc.walls.map((w) => w.id),
    ...doc.openings.map((o) => o.id),
    ...doc.rooms.map((r) => r.id),
    ...doc.objects.map((o) => o.id),
    ...doc.agents.map((a) => a.id),
    ...doc.radios.map((r) => r.id),
    ...doc.stairs.map((s) => s.id),
    ...doc.zones.map((z) => z.id),
    ...doc.incidents.map((i) => i.id),
  ];
  const seen = new Set<Id>();
  for (const id of allIds) {
    if (seen.has(id)) {
      issues.push(issue(`id:${id}`, `Duplicate id "${id}" used by more than one entity`));
    }
    seen.add(id);
  }

  // --- levels ----------------------------------------------------------
  doc.levels.forEach((level, i) => {
    const path = `levels[${i}]`;
    if (!materialIds.has(level.slabMaterialId)) {
      issues.push(issue(path, `slabMaterialId "${level.slabMaterialId}" does not resolve`));
    }
  });

  // --- walls -------------------------------------------------------------
  doc.walls.forEach((wall, i) => {
    const path = `walls[${i}]`;
    if (!levelIds.has(wall.levelId)) {
      issues.push(issue(path, `levelId "${wall.levelId}" does not resolve`));
    }
    if (!materialIds.has(wall.materialId)) {
      issues.push(issue(path, `materialId "${wall.materialId}" does not resolve`));
    }
    if (wall.a[0] === wall.b[0] && wall.a[1] === wall.b[1]) {
      issues.push(issue(path, 'wall endpoints a and b must differ'));
    }
    if (!(wall.thickness > 0)) {
      issues.push(issue(path, 'thickness must be > 0'));
    }
    if (!(wall.height > 0)) {
      issues.push(issue(path, 'height must be > 0'));
    }
  });

  // --- openings ------------------------------------------------------------
  const openingsByWall = new Map<Id, typeof doc.openings>();
  for (const o of doc.openings) {
    const list = openingsByWall.get(o.wallId) ?? [];
    list.push(o);
    openingsByWall.set(o.wallId, list);
  }

  doc.openings.forEach((opening, i) => {
    const path = `openings[${i}]`;
    if (!wallIds.has(opening.wallId)) {
      issues.push(issue(path, `wallId "${opening.wallId}" does not resolve`));
      return;
    }
    if (!materialIds.has(opening.materialId)) {
      issues.push(issue(path, `materialId "${opening.materialId}" does not resolve`));
    }
    const wall = doc.walls.find((w) => w.id === opening.wallId);
    if (!wall) return; // already reported above
    const length = wallLength(wall);
    if (!(opening.offset >= 0)) {
      issues.push(issue(path, 'offset must be >= 0'));
    }
    if (opening.offset + opening.width > length + 1e-9) {
      issues.push(issue(path, `offset + width (${opening.offset + opening.width}) exceeds wall length (${length})`));
    }
    if (!(opening.sill >= 0)) {
      issues.push(issue(path, 'sill must be >= 0'));
    }
    if (opening.sill + opening.height > wall.height + 1e-9) {
      issues.push(issue(path, `sill + height exceeds wall height (${wall.height})`));
    }
  });

  for (const [wallId, openings] of openingsByWall) {
    const sorted = [...openings].sort((a, b) => a.offset - b.offset);
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i]!;
      const next = sorted[i + 1]!;
      if (cur.offset + cur.width > next.offset + 1e-9) {
        const curIdx = doc.openings.indexOf(cur);
        issues.push(
          issue(
            `openings[${curIdx}]`,
            `overlaps opening "${next.id}" on wall "${wallId}"`,
          ),
        );
      }
    }
  }

  // --- rooms -------------------------------------------------------------
  doc.rooms.forEach((room, i) => {
    const path = `rooms[${i}]`;
    if (!levelIds.has(room.levelId)) {
      issues.push(issue(path, `levelId "${room.levelId}" does not resolve`));
    }
    if (room.polygon.length < 3) {
      issues.push(issue(path, 'room polygon must have >= 3 points'));
    } else {
      const area = polygonArea(room.polygon);
      if (Math.abs(area) <= 0) {
        issues.push(issue(path, 'room polygon area must be > 0'));
      }
    }
  });

  // --- objects -------------------------------------------------------------
  doc.objects.forEach((obj, i) => {
    const path = `objects[${i}]`;
    if (!levelIds.has(obj.levelId)) {
      issues.push(issue(path, `levelId "${obj.levelId}" does not resolve`));
    }
    if (!materialIds.has(obj.materialId)) {
      issues.push(issue(path, `materialId "${obj.materialId}" does not resolve`));
    }
    if (!(obj.size[0] > 0 && obj.size[1] > 0 && obj.size[2] > 0)) {
      issues.push(issue(path, 'size components must all be > 0'));
    }
  });

  // --- agents -------------------------------------------------------------
  doc.agents.forEach((agent, i) => {
    const path = `agents[${i}]`;
    if (!materialIds.has(agent.materialId)) {
      issues.push(issue(path, `materialId "${agent.materialId}" does not resolve`));
    }
    if (!(agent.radius > 0)) {
      issues.push(issue(path, 'radius must be > 0'));
    }
    if (!(agent.height > 0)) {
      issues.push(issue(path, 'height must be > 0'));
    }
    if (!(agent.speed > 0)) {
      issues.push(issue(path, 'speed must be > 0'));
    }
    if (!levelIds.has(agent.start.levelId)) {
      issues.push(issue(path, `start.levelId "${agent.start.levelId}" does not resolve`));
    }
    const behavior = agent.behavior;
    if (behavior.type === 'route') {
      if (behavior.waypoints.length < 1) {
        issues.push(issue(path, 'route behavior must have >= 1 waypoint'));
      }
      behavior.waypoints.forEach((wp, j) => {
        if (!levelIds.has(wp.levelId)) {
          issues.push(issue(`${path}.behavior.waypoints[${j}]`, `levelId "${wp.levelId}" does not resolve`));
        }
      });
    } else if (behavior.type === 'wander') {
      if (!levelIds.has(behavior.levelId)) {
        issues.push(issue(path, `behavior.levelId "${behavior.levelId}" does not resolve`));
      }
      if (behavior.roomId !== undefined) {
        const room = doc.rooms.find((r) => r.id === behavior.roomId);
        if (!room) {
          issues.push(issue(path, `behavior.roomId "${behavior.roomId}" does not resolve`));
        } else if (room.levelId !== behavior.levelId) {
          issues.push(issue(path, `behavior.roomId "${behavior.roomId}" is not on behavior.levelId`));
        }
      }
      if (!(behavior.pauseMin <= behavior.pauseMax)) {
        issues.push(issue(path, 'behavior.pauseMin must be <= pauseMax'));
      }
    } else {
      // roam
      if (!(behavior.dwellMin <= behavior.dwellMax)) {
        issues.push(issue(path, 'behavior.dwellMin must be <= dwellMax'));
      }
    }
  });

  // --- radios -------------------------------------------------------------
  doc.radios.forEach((radio, i) => {
    const path = `radios[${i}]`;
    if (!levelIds.has(radio.levelId)) {
      issues.push(issue(path, `levelId "${radio.levelId}" does not resolve`));
    }
    if (radio.ifaces.length < 1) {
      issues.push(issue(path, 'radio must have >= 1 iface'));
    }
    const bands = new Set<string>();
    for (const iface of radio.ifaces) {
      if (bands.has(iface.band)) {
        issues.push(issue(path, `duplicate band "${iface.band}" on radio "${radio.id}"`));
      }
      bands.add(iface.band);
    }
  });

  // --- stairs -------------------------------------------------------------
  doc.stairs.forEach((stair, i) => {
    const path = `stairs[${i}]`;
    if (!levelIds.has(stair.fromLevelId)) {
      issues.push(issue(path, `fromLevelId "${stair.fromLevelId}" does not resolve`));
    }
    if (!levelIds.has(stair.toLevelId)) {
      issues.push(issue(path, `toLevelId "${stair.toLevelId}" does not resolve`));
    }
    if (stair.fromLevelId === stair.toLevelId) {
      issues.push(issue(path, 'fromLevelId and toLevelId must differ'));
    }
    if (!(stair.width > 0)) {
      issues.push(issue(path, 'width must be > 0'));
    }
  });

  // --- zones -------------------------------------------------------------
  doc.zones.forEach((zone, i) => {
    const path = `zones[${i}]`;
    if (!levelIds.has(zone.levelId)) {
      issues.push(issue(path, `levelId "${zone.levelId}" does not resolve`));
    }
    if (zone.roomId !== undefined) {
      if (!roomIds.has(zone.roomId)) {
        issues.push(issue(path, `roomId "${zone.roomId}" does not resolve`));
      } else {
        const room = doc.rooms.find((r) => r.id === zone.roomId);
        if (room && room.levelId !== zone.levelId) {
          issues.push(issue(path, `roomId "${zone.roomId}" is not on levelId "${zone.levelId}"`));
        }
      }
    } else if (zone.polygon.length < 3) {
      issues.push(issue(path, 'zone polygon must have >= 3 points when roomId is not set'));
    }
  });

  // --- incidents -------------------------------------------------------------
  doc.incidents.forEach((incident, i) => {
    const path = `incidents[${i}]`;
    const agent = doc.agents.find((a) => a.id === incident.agentId);
    if (!agent) {
      issues.push(issue(path, `agentId "${incident.agentId}" does not resolve`));
    } else if (agent.kind !== 'person') {
      issues.push(issue(path, `agentId "${incident.agentId}" is not a person`));
    }
    if (!(incident.t >= 0)) {
      issues.push(issue(path, 't must be >= 0'));
    }
    if (!(incident.duration > 0)) {
      issues.push(issue(path, 'duration must be > 0'));
    }
  });

  // --- population -------------------------------------------------------------
  if (!(doc.population.people >= 0)) {
    issues.push(issue('population', 'people must be >= 0'));
  }
  if (!(doc.population.pets >= 0)) {
    issues.push(issue('population', 'pets must be >= 0'));
  }
  if (!(doc.population.fallsPerHour >= 0)) {
    issues.push(issue('population', 'fallsPerHour must be >= 0'));
  }

  // --- materials -------------------------------------------------------------
  doc.materials.forEach((material, i) => {
    const path = `materials[${i}]`;
    for (const band of ['2.4', '5'] as const) {
      const v = material.lossDb[band];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
        issues.push(issue(path, `lossDb["${band}"] must be a finite number >= 0`));
      }
    }
  });

  return issues;
}
