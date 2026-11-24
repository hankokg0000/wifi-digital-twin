import { describe, expect, it } from 'vitest';
import { createFloorCoordinates, fitSceneFloor, type FloorSample } from './floor-projection';
import { createFloorPlan, floorPlanProjector, type PlanSemantics } from './floor-plan';
import type { GeneratedScene } from './generated-scene';

describe('floor plan from a fixed view', () => {
  it('fits a floor through depth outliers and maps image points onto the same plane', () => {
    const samples: FloorSample[] = [];
    for (let row = 0; row < 12; row++) {
      for (let column = 0; column < 12; column++) {
        const u = column / 12;
        const v = 0.4 + row / 24;
        samples.push({ u, v, inverse: 0.13 + 0.36 * v + ((row + column) % 5 === 0 ? 0.17 : 0) });
      }
    }
    const plane = fitSceneFloor(samples)!;
    expect(plane.map((value) => Number(value.toFixed(5)))).toEqual([0, 0.36, 0.13]);
    const map = createFloorCoordinates({ aspect: 16 / 9, plane });
    expect(map.surface([0.5, 0.75], 0.4)?.map((value) => (Number(value.toFixed(5)) || 0))).toEqual([0, 0, -1.58426]);
    expect(map.ground([1.01, 0.75])).toBeNull();
    expect(fitSceneFloor(samples.map((sample) => ({ ...sample, inverse: 0.3 })))).toBeNull();
  });

  it('returns geometric proxies and inferred wall edges with no image arrays', () => {
    const width = 48;
    const height = 32;
    const labels = Array.from({ length: width * height }, (_, i) => {
      const x = i % width;
      const y = Math.floor(i / width);
      if (x >= 27 && x <= 39 && y >= 13 && y <= 24) return 1;
      return y >= 12 ? 2 : 0;
    });
    const scene: GeneratedScene = {
      width, height,
      disparity: labels.map((label, index) => {
        const v = (Math.floor(index / width) + 0.5) / height;
        const delta = label === 1 ? 0.095 : 0;
        return 1 + Math.round(254 * (0.36 * v + delta) / 0.46);
      }),
    };
    const semantics: PlanSemantics = { names: { '0': 'ceiling', '1': 'shelf', '2': 'floor' }, labels, objects: [{ kind: 'shelf', box: [0.56, 0.40, 0.84, 0.80], confidence: 0.9 }] };
    const plan = createFloorPlan(scene, semantics);
    expect(plan.objects.map((object) => object.kind)).toEqual(['shelf']);
    expect(plan.walls.map((wall) => wall.inferred)).toEqual([true, true, true, true]);
    expect(plan).not.toHaveProperty('rgb');
    expect(floorPlanProjector(plan)([0.49, 0.78])).not.toBeNull();
    expect(JSON.stringify(plan)).toBe(JSON.stringify(createFloorPlan(scene, semantics)));
  });
});
