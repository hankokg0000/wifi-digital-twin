import { describe, it, expect } from 'vitest';
import { sampleHouse } from './sample-house';
import { validateDoc } from './validate';

describe('sample-house', () => {
  const doc = sampleHouse();

  it('validates with 0 issues', () => {
    const issues = validateDoc(doc);
    expect(issues).toHaveLength(0);
  });

  it('has 2 levels', () => {
    expect(doc.levels).toHaveLength(2);
  });

  it('has rooms on each level', () => {
    const level1Id = doc.levels[0]!.id;
    const level2Id = doc.levels[1]!.id;

    const level1Rooms = doc.rooms.filter((r) => r.levelId === level1Id);
    const level2Rooms = doc.rooms.filter((r) => r.levelId === level2Id);

    expect(level1Rooms.length).toBeGreaterThan(0);
    expect(level2Rooms.length).toBeGreaterThan(0);
  });

  it('has bedrooms/bathrooms with cameraAllowed false and others true', () => {
    for (const room of doc.rooms) {
      const name = room.name.toLowerCase();
      if (name.includes('นอน') || name.includes('น้ำ')) {
        // Thai characters for "bedroom" (ห้องนอน) and "bathroom" (ห้องน้ำ)
        expect(room.cameraAllowed).toBe(false);
      } else {
        expect(room.cameraAllowed).toBe(true);
      }
    }
  });

  it('has at least one metal object and one glass-lowe opening', () => {
    const metalObj = doc.objects.find((o) => o.materialId === 'metal');
    expect(metalObj).toBeDefined();

    const glassLoweOpening = doc.openings.find((o) => o.materialId === 'glass-lowe');
    expect(glassLoweOpening).toBeDefined();
  });

  it('has 2 AP radios each with both bands', () => {
    const aps = doc.radios.filter((r) => r.role === 'ap');
    expect(aps).toHaveLength(2);

    for (const ap of aps) {
      expect(ap.ifaces).toHaveLength(2);
      const bands = new Set(ap.ifaces.map((i) => i.band));
      expect(bands.has('2.4')).toBe(true);
      expect(bands.has('5')).toBe(true);
    }
  });

  it('has at least one wall on each level', () => {
    const level1Id = doc.levels[0]!.id;
    const level2Id = doc.levels[1]!.id;

    const level1Walls = doc.walls.filter((w) => w.levelId === level1Id);
    const level2Walls = doc.walls.filter((w) => w.levelId === level2Id);

    expect(level1Walls.length).toBeGreaterThan(0);
    expect(level2Walls.length).toBeGreaterThan(0);
  });

  it('has 4 agents (3 people, 1 pet)', () => {
    expect(doc.agents.length).toBe(4);
    expect(doc.agents.filter((a) => a.kind === 'person')).toHaveLength(3);
    expect(doc.agents.filter((a) => a.kind === 'pet')).toHaveLength(1);
  });

  it('agents have valid spawn and behavior', () => {
    for (const agent of doc.agents) {
      expect(agent.radius).toBeGreaterThan(0);
      expect(agent.height).toBeGreaterThan(0);
      expect(agent.speed).toBeGreaterThan(0);
      expect(agent.start.levelId).toBeTruthy();
      // People roam the whole house at random; the pet wanders its spawn level (no fixed room).
      if (agent.kind === 'person') {
        expect(agent.behavior.type).toBe('roam');
      } else {
        expect(agent.behavior.type).toBe('wander');
      }
    }
  });

  it('has one explicit fall incident and the matching zones', () => {
    expect(doc.incidents).toHaveLength(1);
    expect(doc.incidents[0]!.kind).toBe('fall');
    expect(doc.incidents[0]!.t).toBe(420);
    expect(doc.incidents[0]!.duration).toBe(150);

    expect(doc.zones.length).toBeGreaterThanOrEqual(3);
    const kitchenZone = doc.zones.find((z) => z.roomId && doc.rooms.find((r) => r.id === z.roomId)?.name === 'ห้องครัว');
    expect(kitchenZone?.appliesTo).toBe('pet');
    const masterZone = doc.zones.find((z) => z.roomId && doc.rooms.find((r) => r.id === z.roomId)?.name === 'ห้องนอนใหญ่');
    expect(masterZone?.appliesTo).toBe('person');
    const frontDoorZone = doc.zones.find((z) => z.name === 'ประตูหน้า');
    expect(frontDoorZone?.enabled).toBe(false);
  });

  it('has windows on exterior walls', () => {
    const windows = doc.openings.filter((o) => o.kind === 'window');
    expect(windows.length).toBeGreaterThan(0);
  });

  it('has doors between rooms', () => {
    const doors = doc.openings.filter((o) => o.kind === 'door');
    expect(doors.length).toBeGreaterThan(0);
  });

  it('all references resolve correctly', () => {
    const levelIds = new Set(doc.levels.map((l) => l.id));
    const materialIds = new Set(doc.materials.map((m) => m.id));
    const wallIds = new Set(doc.walls.map((w) => w.id));

    for (const wall of doc.walls) {
      expect(levelIds.has(wall.levelId)).toBe(true);
      expect(materialIds.has(wall.materialId)).toBe(true);
    }

    for (const opening of doc.openings) {
      expect(wallIds.has(opening.wallId)).toBe(true);
      expect(materialIds.has(opening.materialId)).toBe(true);
    }

    for (const room of doc.rooms) {
      expect(levelIds.has(room.levelId)).toBe(true);
    }

    for (const obj of doc.objects) {
      expect(levelIds.has(obj.levelId)).toBe(true);
      expect(materialIds.has(obj.materialId)).toBe(true);
    }

    for (const agent of doc.agents) {
      expect(levelIds.has(agent.start.levelId)).toBe(true);
      expect(materialIds.has(agent.materialId)).toBe(true);
    }

    for (const radio of doc.radios) {
      expect(levelIds.has(radio.levelId)).toBe(true);
    }

    for (const level of doc.levels) {
      expect(materialIds.has(level.slabMaterialId)).toBe(true);
    }
  });

  it('has reasonable footprint', () => {
    // Walls should be roughly in a 10x12 m range
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const wall of doc.walls) {
      minX = Math.min(minX, wall.a[0], wall.b[0]);
      maxX = Math.max(maxX, wall.a[0], wall.b[0]);
      minZ = Math.min(minZ, wall.a[1], wall.b[1]);
      maxZ = Math.max(maxZ, wall.a[1], wall.b[1]);
    }

    const widthX = maxX - minX;
    const widthZ = maxZ - minZ;

    // Loosely check it's in the expected range
    expect(widthX).toBeGreaterThan(5);
    expect(widthZ).toBeGreaterThan(5);
    expect(widthX).toBeLessThan(20);
    expect(widthZ).toBeLessThan(20);
  });
});
