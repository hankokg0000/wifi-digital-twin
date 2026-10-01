import { updateWall, type Wall } from '../../core';
import { useSceneStore } from '../store';
import { Field, MaterialSelect, num } from './fields';

export function WallInspector({ wall }: { wall: Wall }) {
  const apply = useSceneStore((s) => s.apply);
  return (
    <>
      <Field label="Thickness (m)">
        <input type="number" step={0.01} min={0.01} value={wall.thickness} onChange={(e) => apply((d) => updateWall(d, wall.id, { thickness: num(e) }))} />
      </Field>
      <Field label="Height (m)">
        <input type="number" step={0.1} min={0.1} value={wall.height} onChange={(e) => apply((d) => updateWall(d, wall.id, { height: num(e) }))} />
      </Field>
      <Field label="Material">
        <MaterialSelect value={wall.materialId} onChange={(v) => apply((d) => updateWall(d, wall.id, { materialId: v }))} />
      </Field>
    </>
  );
}
