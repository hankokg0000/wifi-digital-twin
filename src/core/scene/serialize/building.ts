import type { Material, Level, Wall, Opening, Room, SceneObject, Stair } from '../types';

export function orderedMaterial(m: Material): Material {
  return {
    id: m.id,
    name: m.name,
    lossDb: { '2.4': m.lossDb['2.4'], '5': m.lossDb['5'] },
    color: m.color,
  };
}

export function orderedLevel(l: Level): Level {
  return {
    id: l.id,
    name: l.name,
    elevation: l.elevation,
    height: l.height,
    slabMaterialId: l.slabMaterialId,
  };
}

export function orderedWall(w: Wall): Wall {
  return {
    id: w.id,
    levelId: w.levelId,
    a: [w.a[0], w.a[1]],
    b: [w.b[0], w.b[1]],
    thickness: w.thickness,
    height: w.height,
    materialId: w.materialId,
  };
}

export function orderedOpening(o: Opening): Opening {
  return {
    id: o.id,
    wallId: o.wallId,
    kind: o.kind,
    offset: o.offset,
    width: o.width,
    sill: o.sill,
    height: o.height,
    materialId: o.materialId,
    open: o.open,
  };
}

export function orderedRoom(r: Room): Room {
  return {
    id: r.id,
    levelId: r.levelId,
    name: r.name,
    polygon: r.polygon.map((p): [number, number] => [p[0], p[1]]),
    cameraAllowed: r.cameraAllowed,
  };
}

export function orderedObject(o: SceneObject): SceneObject {
  return {
    id: o.id,
    levelId: o.levelId,
    name: o.name,
    position: [o.position[0], o.position[1], o.position[2]],
    size: [o.size[0], o.size[1], o.size[2]],
    rotationY: o.rotationY,
    materialId: o.materialId,
  };
}

export function orderedStair(s: Stair): Stair {
  return {
    id: s.id,
    fromLevelId: s.fromLevelId,
    toLevelId: s.toLevelId,
    bottom: [s.bottom[0], s.bottom[1]],
    top: [s.top[0], s.top[1]],
    width: s.width,
  };
}
