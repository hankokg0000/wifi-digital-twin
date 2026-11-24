import { describe, expect, it } from 'vitest';
import type { FloorPoint } from './tracking';
import { outlineArea, readMagicplanPdf, readMagicplanUsdRoom, referenceScale } from './plan-import';

const rectangle: FloorPoint[] = [[0, 0], [4, 0], [4, 3], [0, 3]];
const sketch = 'magicplan\nROOMS: 1\nLiving Room\n12 m² (4 × 3)';
const floorPath = '<path fill-opacity="0.0667" d="M 10 20 L 90 20 L 90 80 L 10 80 Z"/>';
const room = `#usda 1.0
(
    upAxis = "Y"
)
def Mesh "WholeFloor_1"
{
    int[] faceVertexCounts = [3, 3]
    int[] faceVertexIndices = [0, 1, 2, 0, 2, 3]
    point3f[] points = [(0, 0, 0), (4, 0, 0), (4, 0, 3), (0, 0, 3)]
    matrix4d xformOp:transform = ((0.1,0,0,0),(0,0.1,0,0),(0,0,0.1,0),(0,0,0,1))
}
`;

describe('magicplan import', () => {
  it('extracts the outer edges of a triangulated USD floor', () => {
    const result = readMagicplanUsdRoom(room)?.plan;
    expect(result?.bounds).toEqual([-2.5, -1.875, 2.5, 1.875]);
    expect(result?.visibleFloor).toEqual([[-2.5, -1.875], [2.5, -1.875], [2.5, 1.875], [-2.5, 1.875]]);
    expect(result?.walls).toHaveLength(4);
    expect(readMagicplanUsdRoom(room.replace('WholeFloor_', 'Other_'))).toBeNull();
  });

  it('preserves authored furniture triangles and composes transforms on a nested window', () => {
    const source = room + `
def Xform "window_1"
{
    matrix4d xformOp:transform = ((1,0,0,0),(0,1,0,0),(0,0,1,0),(0.2,0.1,0,1))
    uniform token[] xformOpOrder = ["xformOp:transform"]
    def Mesh "window_panel"
    {
        int[] faceVertexCounts = [3]
        int[] faceVertexIndices = [0, 1, 2]
        point3f[] points = [(0, 0, 0), (0.1, 0, 0), (0, 0.1, 0)]
        matrix4d xformOp:transform = ((1,0,0,0),(0,1,0,0),(0,0,1,0),(0,0,0.1,1))
        uniform token[] xformOpOrder = ["xformOp:transform"]
    }
}
def Mesh "furniture_chair"
{
    int[] faceVertexCounts = [3]
    int[] faceVertexIndices = [0, 2, 1]
    point3f[] points = [(0.1, 0, 0.1), (0.2, 0, 0.1), (0.1, 0.1, 0.2)]
}
`;
    const surfaces = readMagicplanUsdRoom(source)?.model.surfaces.slice(1);
    expect(surfaces).toEqual([
      { kind: 'frame', positions: [0, 1.25, -0.625, 1.25, 1.25, -0.625, 0, 2.5, -0.625], indices: [0, 1, 2] },
      { kind: 'furniture', positions: [-1.25, 0, -0.625, 0, 0, -0.625, -1.25, 1.25, 0.625], indices: [0, 2, 1] },
    ]);
  });

  it('scales a Sketch PDF outline to its printed metric area', () => {
    const result = readMagicplanPdf(floorPath, sketch);
    expect(result?.area).toBe(12);
    expect(result?.plan.bounds).toEqual([-2, -1.5, 2, 1.5]);
    expect(outlineArea(result!.plan.visibleFloor)).toBe(12);
    expect(readMagicplanPdf(floorPath, `ROOMS: 2\n${sketch}`)).toBeNull();
    expect(readMagicplanPdf('<image/>', sketch)).toBeNull();
  });

  it('matches a reversed or rotated outline and rejects a different room', () => {
    const halfSize: FloorPoint[] = [[2, 1.5], [2, 0], [0, 0], [0, 1.5]];
    expect(referenceScale(halfSize, rectangle)).toBe(2);
    expect(referenceScale(halfSize, [[0, 0], [3, 0], [3, 3], [0, 3]])).toBeNull();
  });
});
