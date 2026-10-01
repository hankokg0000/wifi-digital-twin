import type { ChangeEvent, ReactNode } from 'react';
import { useSceneStore } from '../store';

export function num(e: ChangeEvent<HTMLInputElement>): number {
  return Number(e.target.value);
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field-block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function Vec2Input({ value, onChange }: { value: [number, number]; onChange: (v: [number, number]) => void }) {
  return (
    <div className="vec3-input">
      {[0, 1].map((i) => (
        <input
          key={i}
          type="number"
          step={0.05}
          value={value[i]}
          onChange={(e) => {
            const v: [number, number] = [...value];
            v[i] = Number(e.target.value);
            onChange(v);
          }}
        />
      ))}
    </div>
  );
}

export function Vec3Input({ value, onChange }: { value: [number, number, number]; onChange: (v: [number, number, number]) => void }) {
  return (
    <div className="vec3-input">
      {[0, 1, 2].map((i) => (
        <input
          key={i}
          type="number"
          step={0.05}
          value={value[i]}
          onChange={(e) => {
            const v: [number, number, number] = [...value];
            v[i] = Number(e.target.value);
            onChange(v);
          }}
        />
      ))}
    </div>
  );
}

export function MaterialSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const materials = useSceneStore((s) => s.doc.materials);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {materials.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
}
