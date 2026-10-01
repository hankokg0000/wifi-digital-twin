import type { SceneDoc, Vec2 } from './types';
import { DEFAULT_MATERIALS } from './materials';
import { addLevel, addWall, addOpening, addRoom, addObject, addRadio, addStair, setRoomRestricted, addZone, addIncident } from './ops';
import { populate } from '../sim/populate';

/**
 * A typical Thai two-storey detached house, footprint ~10 m (x) x 12 m (z).
 * Built entirely through the public ops pipeline so it doubles as a smoke test for ops.
 * Must pass validateDoc() with zero issues.
 */
export function sampleHouse(): SceneDoc {
  let doc: SceneDoc = {
    version: 1,
    seed: 42,
    materials: DEFAULT_MATERIALS.map((m) => ({ ...m, lossDb: { ...m.lossDb } })),
    levels: [],
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

  // --- Levels --------------------------------------------------------------
  // Level 1: elevation 0, height 3.0 (all addLevel defaults) — slab: concrete-slab (default).
  const l1 = addLevel(doc, { name: 'ชั้น 1' });
  doc = l1.doc;
  const level1 = l1.id;

  // Level 2: default elevation = top of level 1 (0 + 3.0) + 0.2 = 3.2 (addLevel default rule).
  const l2 = addLevel(doc, { name: 'ชั้น 2', height: 2.8 });
  doc = l2.doc;
  const level2 = l2.id;

  // ==========================================================================
  // Ground floor (level 1)
  // ==========================================================================
  // Exterior boundary (brick 0.2 m), corners: (0,0) (10,0) (10,12) (0,12).
  const gSouth = addWall(doc, { levelId: level1, a: [0, 0], b: [10, 0], thickness: 0.2 });
  doc = gSouth.doc;
  const gEast = addWall(doc, { levelId: level1, a: [10, 0], b: [10, 12], thickness: 0.2 });
  doc = gEast.doc;
  const gNorth = addWall(doc, { levelId: level1, a: [0, 12], b: [10, 12], thickness: 0.2 });
  doc = gNorth.doc;
  const gWest = addWall(doc, { levelId: level1, a: [0, 0], b: [0, 12], thickness: 0.2 });
  doc = gWest.doc;

  // Interior walls, brick 0.1 m.
  // Living (x0-6,z0-6) | Dining+Kitchen (x6-10,z0-6)
  const gLivingDining = addWall(doc, { levelId: level1, a: [6, 0], b: [6, 6], thickness: 0.1 });
  doc = gLivingDining.doc;
  // Dining (z0-3) | Kitchen (z3-6)
  const gDiningKitchen = addWall(doc, { levelId: level1, a: [6, 3], b: [10, 3], thickness: 0.1 });
  doc = gDiningKitchen.doc;
  // Front half (z0-6) | back half (z6-12), full width — carries the circulation doors.
  const gFrontBack = addWall(doc, { levelId: level1, a: [0, 6], b: [10, 6], thickness: 0.1 });
  doc = gFrontBack.doc;
  // Guest bedroom (x0-4) | Bath (x4-6), back half
  const gGuestBath = addWall(doc, { levelId: level1, a: [4, 6], b: [4, 12], thickness: 0.1 });
  doc = gGuestBath.doc;
  // Bath (x4-6) | Stair hall (x6-10), back half
  const gBathHall = addWall(doc, { levelId: level1, a: [6, 6], b: [6, 12], thickness: 0.1 });
  doc = gBathHall.doc;

  // Openings — ground floor.
  const gFrontDoor = addOpening(doc, {
    wallId: gSouth.id,
    kind: 'door',
    offset: 2.5,
    width: 1.0,
    sill: 0,
    height: 2.1,
  });
  doc = gFrontDoor.doc;

  const gDoorLivingDining = addOpening(doc, { wallId: gLivingDining.id, kind: 'door', offset: 2.5 });
  doc = gDoorLivingDining.doc;
  const gDoorDiningKitchen = addOpening(doc, { wallId: gDiningKitchen.id, kind: 'door', offset: 2 });
  doc = gDoorDiningKitchen.doc;
  const gDoorLivingGuest = addOpening(doc, { wallId: gFrontBack.id, kind: 'door', offset: 2 });
  doc = gDoorLivingGuest.doc;
  const gDoorKitchenHall = addOpening(doc, { wallId: gFrontBack.id, kind: 'door', offset: 8 });
  doc = gDoorKitchenHall.doc;
  const gDoorBathHall = addOpening(doc, { wallId: gBathHall.id, kind: 'door', offset: 2 });
  doc = gDoorBathHall.doc;

  const gWinLiving = addOpening(doc, { wallId: gWest.id, kind: 'window', offset: 2, width: 1.2 });
  doc = gWinLiving.doc;
  const gWinGuest = addOpening(doc, { wallId: gWest.id, kind: 'window', offset: 9, width: 1.2 });
  doc = gWinGuest.doc;
  const gWinKitchen = addOpening(doc, { wallId: gEast.id, kind: 'window', offset: 4.5, width: 1.2 });
  doc = gWinKitchen.doc;
  const gWinHall = addOpening(doc, { wallId: gEast.id, kind: 'window', offset: 9, width: 1.2 });
  doc = gWinHall.doc;
  const gWinDining = addOpening(doc, { wallId: gSouth.id, kind: 'window', offset: 8, width: 1.2 });
  doc = gWinDining.doc;
  // The one glass-lowe window in the house: the bath, facing the back exterior wall.
  const gWinBath = addOpening(doc, {
    wallId: gNorth.id,
    kind: 'window',
    offset: 4.5,
    width: 0.9,
    materialId: 'glass-lowe',
  });
  doc = gWinBath.doc;

  // Rooms — ground floor. cameraAllowed: true for living/kitchen/dining/halls, false for
  // bedrooms & bathrooms (privacy by default already covers this; set explicitly for clarity).
  const rLiving = addRoom(doc, {
    levelId: level1,
    name: 'ห้องนั่งเล่น',
    polygon: rect(0, 0, 6, 6),
    cameraAllowed: true,
  });
  doc = rLiving.doc;
  const rDining = addRoom(doc, {
    levelId: level1,
    name: 'ห้องทานข้าว',
    polygon: rect(6, 0, 10, 3),
    cameraAllowed: true,
  });
  doc = rDining.doc;
  const rKitchen = addRoom(doc, {
    levelId: level1,
    name: 'ห้องครัว',
    polygon: rect(6, 3, 10, 6),
    cameraAllowed: true,
  });
  doc = rKitchen.doc;
  const rGuest = addRoom(doc, {
    levelId: level1,
    name: 'ห้องนอนแขก',
    polygon: rect(0, 6, 4, 12),
    cameraAllowed: false,
  });
  doc = rGuest.doc;
  const rBath = addRoom(doc, {
    levelId: level1,
    name: 'ห้องน้ำ',
    polygon: rect(4, 6, 6, 12),
    cameraAllowed: false,
  });
  doc = rBath.doc;
  const rStairHall = addRoom(doc, {
    levelId: level1,
    name: 'โถงบันได',
    polygon: rect(6, 6, 10, 12),
    cameraAllowed: true,
  });
  doc = rStairHall.doc;

  // Objects — ground floor.
  doc = addObject(doc, {
    levelId: level1,
    name: 'โซฟา',
    position: [2, 0, 4.5],
    size: [2.2, 0.8, 0.9],
    materialId: 'wood-furniture',
  }).doc;
  doc = addObject(doc, {
    levelId: level1,
    name: 'โต๊ะทานข้าว',
    position: [8, 0, 1.5],
    size: [1.6, 0.75, 0.9],
    materialId: 'wood-furniture',
  }).doc;
  doc = addObject(doc, {
    levelId: level1,
    name: 'ตู้เย็น',
    position: [9.3, 0, 4.7],
    size: [0.7, 1.8, 0.7],
    materialId: 'metal',
  }).doc;
  doc = addObject(doc, {
    levelId: level1,
    name: 'ตู้เหล็ก',
    position: [8, 0, 10.5],
    size: [0.8, 1.8, 0.4],
    materialId: 'metal',
  }).doc;
  doc = addObject(doc, {
    levelId: level1,
    name: 'เตียงนอนห้องแขก',
    position: [2, 0, 9.5],
    size: [1.9, 0.5, 1.4],
    materialId: 'wood-furniture',
  }).doc;

  // Radio — router AP in the living room (dual-band, y 2.0 — addRadio defaults).
  doc = addRadio(doc, {
    levelId: level1,
    name: 'เราเตอร์หลัก',
    role: 'ap',
    position: [3, 2.0, 3],
  }).doc;

  // ==========================================================================
  // Upper floor (level 2)
  // ==========================================================================
  // Exterior boundary (brick 0.2 m), same footprint.
  const uSouth = addWall(doc, { levelId: level2, a: [0, 0], b: [10, 0], thickness: 0.2 });
  doc = uSouth.doc;
  const uEast = addWall(doc, { levelId: level2, a: [10, 0], b: [10, 12], thickness: 0.2 });
  doc = uEast.doc;
  const uNorth = addWall(doc, { levelId: level2, a: [0, 12], b: [10, 12], thickness: 0.2 });
  doc = uNorth.doc;
  const uWest = addWall(doc, { levelId: level2, a: [0, 0], b: [0, 12], thickness: 0.2 });
  doc = uWest.doc;

  // Interior walls, drywall 0.1 m.
  // Master bedroom (x0-5,z0-7) | hall vertical strip (x5-7)
  const uMasterHallV = addWall(doc, {
    levelId: level2,
    a: [5, 0],
    b: [5, 7],
    thickness: 0.1,
    materialId: 'drywall',
  });
  doc = uMasterHallV.doc;
  // Hall vertical strip / right room column boundary (x=7), full depth
  const uHallRight = addWall(doc, {
    levelId: level2,
    a: [7, 0],
    b: [7, 12],
    thickness: 0.1,
    materialId: 'drywall',
  });
  doc = uHallRight.doc;
  // Master bedroom | hall horizontal foot (z=7, x0-5)
  const uMasterHallH = addWall(doc, {
    levelId: level2,
    a: [0, 7],
    b: [5, 7],
    thickness: 0.1,
    materialId: 'drywall',
  });
  doc = uMasterHallH.doc;
  // Bedroom 2 (z0-4) | Bedroom 3 (z4-8), right column
  const uBed2Bed3 = addWall(doc, {
    levelId: level2,
    a: [7, 4],
    b: [10, 4],
    thickness: 0.1,
    materialId: 'drywall',
  });
  doc = uBed2Bed3.doc;
  // Bedroom 3 (z4-8) | Bath 2 (z8-12), right column
  const uBed3Bath2 = addWall(doc, {
    levelId: level2,
    a: [7, 8],
    b: [10, 8],
    thickness: 0.1,
    materialId: 'drywall',
  });
  doc = uBed3Bath2.doc;

  // Openings — upper floor.
  const uDoorMasterHall = addOpening(doc, { wallId: uMasterHallV.id, kind: 'door', offset: 3 });
  doc = uDoorMasterHall.doc;
  const uDoorHallBed2 = addOpening(doc, { wallId: uHallRight.id, kind: 'door', offset: 2 });
  doc = uDoorHallBed2.doc;
  const uDoorHallBed3 = addOpening(doc, { wallId: uHallRight.id, kind: 'door', offset: 6 });
  doc = uDoorHallBed3.doc;
  const uDoorHallBath2 = addOpening(doc, { wallId: uHallRight.id, kind: 'door', offset: 10 });
  doc = uDoorHallBath2.doc;

  const uWinMaster = addOpening(doc, { wallId: uSouth.id, kind: 'window', offset: 1.5, width: 1.2 });
  doc = uWinMaster.doc;
  const uWinBed2 = addOpening(doc, { wallId: uEast.id, kind: 'window', offset: 2, width: 1.2 });
  doc = uWinBed2.doc;
  const uWinBed3 = addOpening(doc, { wallId: uEast.id, kind: 'window', offset: 6, width: 1.2 });
  doc = uWinBed3.doc;
  const uWinBath2 = addOpening(doc, { wallId: uEast.id, kind: 'window', offset: 9.5, width: 0.9 });
  doc = uWinBath2.doc;
  const uWinHall = addOpening(doc, { wallId: uNorth.id, kind: 'window', offset: 2, width: 1.2 });
  doc = uWinHall.doc;

  // Rooms — upper floor. Hall (โถง) is L-shaped: vertical strip x5-7 (full depth) + horizontal
  // foot x0-5,z7-12, wrapping around the master bedroom.
  const rMaster = addRoom(doc, {
    levelId: level2,
    name: 'ห้องนอนใหญ่',
    polygon: rect(0, 0, 5, 7),
    cameraAllowed: false,
  });
  doc = rMaster.doc;
  const rHall = addRoom(doc, {
    levelId: level2,
    name: 'โถง',
    polygon: [
      [5, 0],
      [7, 0],
      [7, 12],
      [0, 12],
      [0, 7],
      [5, 7],
    ],
    cameraAllowed: true,
  });
  doc = rHall.doc;
  const rBed2 = addRoom(doc, {
    levelId: level2,
    name: 'ห้องนอน 2',
    polygon: rect(7, 0, 10, 4),
    cameraAllowed: false,
  });
  doc = rBed2.doc;
  const rBed3 = addRoom(doc, {
    levelId: level2,
    name: 'ห้องนอน 3',
    polygon: rect(7, 4, 10, 8),
    cameraAllowed: false,
  });
  doc = rBed3.doc;
  const rBath2 = addRoom(doc, {
    levelId: level2,
    name: 'ห้องน้ำ 2',
    polygon: rect(7, 8, 10, 12),
    cameraAllowed: false,
  });
  doc = rBath2.doc;

  // Objects — upper floor.
  doc = addObject(doc, {
    levelId: level2,
    name: 'ตู้เสื้อผ้า',
    position: [1, 0, 6.2],
    size: [1.5, 2.0, 0.6],
    materialId: 'wood-furniture',
  }).doc;
  doc = addObject(doc, {
    levelId: level2,
    name: 'เตียงนอนใหญ่',
    position: [2.5, 0, 2.5],
    size: [2.0, 0.5, 1.8],
    materialId: 'wood-furniture',
  }).doc;
  doc = addObject(doc, {
    levelId: level2,
    name: 'เตียงนอน 2',
    position: [8.5, 0, 1.8],
    size: [1.9, 0.5, 1.4],
    materialId: 'wood-furniture',
  }).doc;
  doc = addObject(doc, {
    levelId: level2,
    name: 'เตียงนอน 3',
    position: [8.5, 0, 5.8],
    size: [1.9, 0.5, 1.4],
    materialId: 'wood-furniture',
  }).doc;

  // Radio — mesh AP in the upstairs hall (dual-band).
  doc = addRadio(doc, {
    levelId: level2,
    name: 'Mesh AP ชั้น 2',
    role: 'ap',
    position: [6, 2.0, 2],
    ifaces: [
      { band: '2.4', channel: 11, txPowerDbm: 20 },
      { band: '5', channel: 149, txPowerDbm: 23 },
    ],
    antennaGainDbi: 3,
  }).doc;

  // ==========================================================================
  // Stair — โถงบันได (ground) ↔ โถง (upper). Landings sit well clear of the surrounding
  // walls/furniture (verified via planAgent warnings in the sim sanity check).
  // ==========================================================================
  doc = addStair(doc, {
    fromLevelId: level1,
    toLevelId: level2,
    bottom: [6.5, 7.5],
    top: [6.5, 10.5],
    width: 1.0,
  }).doc;

  // ==========================================================================
  // Population — random people + a pet, seed 42 (deterministic demo scenario). No generated
  // falls here (fallsPerHour: 0); one explicit fall is added below instead so the demo always
  // shows both fall alerts on the same, predictable person/time.
  // ==========================================================================
  doc = populate(doc, { people: 3, pets: 1, fallsPerHour: 0 }, 42);

  const firstPerson = doc.agents.find((a) => a.kind === 'person')!;
  doc = addIncident(doc, { agentId: firstPerson.id, t: 420, duration: 150 }).doc;

  // ==========================================================================
  // Zones — demonstrates restricted rooms (both appliesTo kinds) and a custom polygon zone.
  // ==========================================================================
  // ห้องครัว restricted for pets — cats/dogs wandering in are the demo's zone-entry alert.
  doc = setRoomRestricted(doc, rKitchen.id, true, 'pet');
  // ห้องนอนใหญ่ restricted for people — becomes "ห้องนอนใหญ่ (ห้ามเข้า)"; a roaming person
  // wandering in demonstrates the other appliesTo kind.
  doc = setRoomRestricted(doc, rMaster.id, true, 'person');
  // A custom ~1.5x1.5 m zone just inside the front door, disabled by default — shows the
  // free-polygon Zone tool without adding alert noise to the default demo.
  doc = addZone(doc, {
    levelId: level1,
    name: 'ประตูหน้า',
    appliesTo: 'any',
    enabled: false,
    polygon: [
      [2.25, 0.2],
      [3.75, 0.2],
      [3.75, 1.7],
      [2.25, 1.7],
    ],
  }).doc;

  return doc;
}

/** Axis-aligned rectangle polygon, counter-clockwise, useful for the many box-shaped rooms above. */
function rect(x0: number, z0: number, x1: number, z1: number): Vec2[] {
  return [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
}
