import { updateStair, type Stair, type SceneDoc } from '../../core';
import { useSceneStore } from '../store';
import { Field, Vec2Input, num } from './fields';

export function StairInspector({ stair, doc }: { stair: Stair; doc: SceneDoc }) {
  const apply = useSceneStore((s) => s.apply);
  const fromLevel = doc.levels.find((l) => l.id === stair.fromLevelId);
  const toLevel = doc.levels.find((l) => l.id === stair.toLevelId);
  return (
    <>
      <Field label="From level">
        <span className="readonly-value">{fromLevel?.name ?? stair.fromLevelId}</span>
      </Field>
      <Field label="To level">
        <span className="readonly-value">{toLevel?.name ?? stair.toLevelId}</span>
      </Field>
      <Field label="Bottom (x, z)">
        <Vec2Input value={stair.bottom} onChange={(v) => apply((d) => updateStair(d, stair.id, { bottom: v }))} />
      </Field>
      <Field label="Top (x, z)">
        <Vec2Input value={stair.top} onChange={(v) => apply((d) => updateStair(d, stair.id, { top: v }))} />
      </Field>
      <Field label="Width (m)">
        <input type="number" step={0.1} min={0.1} value={stair.width} onChange={(e) => apply((d) => updateStair(d, stair.id, { width: num(e) }))} />
      </Field>
    </>
  );
}
