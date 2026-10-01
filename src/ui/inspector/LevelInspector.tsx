import { updateLevel, type Level } from '../../core';
import { useSceneStore } from '../store';
import { Field, MaterialSelect, num } from './fields';

export function LevelInspector({ level }: { level: Level }) {
  const apply = useSceneStore((s) => s.apply);
  return (
    <>
      <Field label="Name">
        <input value={level.name} onChange={(e) => apply((d) => updateLevel(d, level.id, { name: e.target.value }))} />
      </Field>
      <Field label="Elevation (m)">
        <input type="number" step={0.1} value={level.elevation} onChange={(e) => apply((d) => updateLevel(d, level.id, { elevation: num(e) }))} />
      </Field>
      <Field label="Height (m)">
        <input type="number" step={0.1} value={level.height} onChange={(e) => apply((d) => updateLevel(d, level.id, { height: num(e) }))} />
      </Field>
      <Field label="Slab material">
        <MaterialSelect
          value={level.slabMaterialId}
          onChange={(v) => apply((d) => updateLevel(d, level.id, { slabMaterialId: v }))}
        />
      </Field>
    </>
  );
}
