import { updateObject, type SceneObject } from '../../core';
import { useSceneStore } from '../store';
import { Field, MaterialSelect, Vec3Input, num } from './fields';

export function ObjectInspector({ object }: { object: SceneObject }) {
  const apply = useSceneStore((s) => s.apply);
  return (
    <>
      <Field label="Name">
        <input value={object.name} onChange={(e) => apply((d) => updateObject(d, object.id, { name: e.target.value }))} />
      </Field>
      <Field label="Position (x, y, z)">
        <Vec3Input
          value={object.position}
          onChange={(v) => apply((d) => updateObject(d, object.id, { position: v }))}
        />
      </Field>
      <Field label="Size (x, y, z)">
        <Vec3Input value={object.size} onChange={(v) => apply((d) => updateObject(d, object.id, { size: v }))} />
      </Field>
      <Field label="Rotation Y (deg)">
        <input
          type="number"
          step={15}
          value={Math.round((object.rotationY * 180) / Math.PI)}
          onChange={(e) => apply((d) => updateObject(d, object.id, { rotationY: (num(e) * Math.PI) / 180 }))}
        />
      </Field>
      <Field label="Material">
        <MaterialSelect value={object.materialId} onChange={(v) => apply((d) => updateObject(d, object.id, { materialId: v }))} />
      </Field>
    </>
  );
}
