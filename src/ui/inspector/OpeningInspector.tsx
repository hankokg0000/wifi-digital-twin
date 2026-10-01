import { updateOpening, type Opening } from '../../core';
import { useSceneStore } from '../store';
import { Field, MaterialSelect, num } from './fields';

export function OpeningInspector({ opening }: { opening: Opening }) {
  const apply = useSceneStore((s) => s.apply);
  return (
    <>
      <Field label="Kind">
        <span className="readonly-value">{opening.kind}</span>
      </Field>
      <Field label="Offset (m)">
        <input type="number" step={0.05} value={opening.offset} onChange={(e) => apply((d) => updateOpening(d, opening.id, { offset: num(e) }))} />
      </Field>
      <Field label="Width (m)">
        <input type="number" step={0.05} min={0.01} value={opening.width} onChange={(e) => apply((d) => updateOpening(d, opening.id, { width: num(e) }))} />
      </Field>
      <Field label="Sill (m)">
        <input type="number" step={0.05} min={0} value={opening.sill} onChange={(e) => apply((d) => updateOpening(d, opening.id, { sill: num(e) }))} />
      </Field>
      <Field label="Height (m)">
        <input type="number" step={0.05} min={0.01} value={opening.height} onChange={(e) => apply((d) => updateOpening(d, opening.id, { height: num(e) }))} />
      </Field>
      <Field label="Material">
        <MaterialSelect value={opening.materialId} onChange={(v) => apply((d) => updateOpening(d, opening.id, { materialId: v }))} />
      </Field>
      <Field label="Open">
        <input type="checkbox" checked={opening.open} onChange={(e) => apply((d) => updateOpening(d, opening.id, { open: e.target.checked }))} />
      </Field>
    </>
  );
}
