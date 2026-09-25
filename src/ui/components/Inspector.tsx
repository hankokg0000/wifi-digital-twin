import type { ChangeEvent, ReactNode } from 'react';
import {
  removeEntity,
  updateWall,
  updateOpening,
  updateRoom,
  updateObject,
  updateRadio,
  updateLevel,
  type Band,
  type RadioIface,
} from '../../core';
import { useSceneStore } from '../store';
import { findEntity, KIND_LABEL } from '../entityLookup';

function num(e: ChangeEvent<HTMLInputElement>): number {
  return Number(e.target.value);
}

export function Inspector() {
  const doc = useSceneStore((s) => s.doc);
  const selection = useSceneStore((s) => s.selection);
  const apply = useSceneStore((s) => s.apply);
  const setSelection = useSceneStore((s) => s.setSelection);

  if (!selection) {
    return (
      <div className="inspector">
        <p className="empty-hint">Select an entity to edit its properties.</p>
      </div>
    );
  }

  const found = findEntity(doc, selection);
  if (!found) {
    return (
      <div className="inspector">
        <p className="empty-hint">Selection no longer exists.</p>
      </div>
    );
  }

  const remove = () => {
    apply((d) => removeEntity(d, selection));
    setSelection(null);
  };

  let body: ReactNode = null;

  if (found.kind === 'level') {
    const level = doc.levels[found.index]!;
    body = (
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
  } else if (found.kind === 'wall') {
    const wall = doc.walls[found.index]!;
    body = (
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
  } else if (found.kind === 'opening') {
    const opening = doc.openings[found.index]!;
    body = (
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
  } else if (found.kind === 'room') {
    const room = doc.rooms[found.index]!;
    body = (
      <>
        <Field label="Name">
          <input value={room.name} onChange={(e) => apply((d) => updateRoom(d, room.id, { name: e.target.value }))} />
        </Field>
        <Field label="Camera allowed">
          <input type="checkbox" checked={room.cameraAllowed} onChange={(e) => apply((d) => updateRoom(d, room.id, { cameraAllowed: e.target.checked }))} />
        </Field>
        <Field label="Points">
          <span className="readonly-value">{room.polygon.length}</span>
        </Field>
      </>
    );
  } else if (found.kind === 'object') {
    const object = doc.objects[found.index]!;
    body = (
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
  } else if (found.kind === 'radio') {
    const radio = doc.radios[found.index]!;
    body = (
      <>
        <Field label="Name">
          <input value={radio.name} onChange={(e) => apply((d) => updateRadio(d, radio.id, { name: e.target.value }))} />
        </Field>
        <Field label="Role">
          <select value={radio.role} onChange={(e) => apply((d) => updateRadio(d, radio.id, { role: e.target.value as typeof radio.role }))}>
            <option value="ap">ap</option>
            <option value="client">client</option>
            <option value="sensor-node">sensor-node</option>
          </select>
        </Field>
        <Field label="Position (x, y, z)">
          <Vec3Input value={radio.position} onChange={(v) => apply((d) => updateRadio(d, radio.id, { position: v }))} />
        </Field>
        <Field label="Antenna gain (dBi)">
          <input
            type="number"
            step={0.5}
            value={radio.antennaGainDbi}
            onChange={(e) => apply((d) => updateRadio(d, radio.id, { antennaGainDbi: num(e) }))}
          />
        </Field>
        <div className="field-block">
          <span className="field-label">Interfaces</span>
          <table className="iface-table">
            <thead>
              <tr>
                <th>Band</th>
                <th>Channel</th>
                <th>Tx (dBm)</th>
              </tr>
            </thead>
            <tbody>
              {radio.ifaces.map((iface, i) => (
                <tr key={i}>
                  <td>
                    <select
                      value={iface.band}
                      onChange={(e) => {
                        const next: RadioIface[] = radio.ifaces.map((f, j) =>
                          j === i ? { ...f, band: e.target.value as Band } : f,
                        );
                        apply((d) => updateRadio(d, radio.id, { ifaces: next }));
                      }}
                    >
                      <option value="2.4">2.4</option>
                      <option value="5">5</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      value={iface.channel}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        const next: RadioIface[] = radio.ifaces.map((f, j) => (j === i ? { ...f, channel: v } : f));
                        apply((d) => updateRadio(d, radio.id, { ifaces: next }));
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={iface.txPowerDbm}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        const next: RadioIface[] = radio.ifaces.map((f, j) => (j === i ? { ...f, txPowerDbm: v } : f));
                        apply((d) => updateRadio(d, radio.id, { ifaces: next }));
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  } else if (found.kind === 'agent') {
    const agent = doc.agents[found.index]!;
    body = (
      <>
        <Field label="Kind">
          <span className="readonly-value">{agent.kind}</span>
        </Field>
        <Field label="Radius (m)">
          <span className="readonly-value">{agent.radius}</span>
        </Field>
        <Field label="Height (m)">
          <span className="readonly-value">{agent.height}</span>
        </Field>
        <Field label="Waypoints">
          <span className="readonly-value">{agent.path.length}</span>
        </Field>
        <p className="empty-hint">Agents aren&apos;t editable in the UI yet.</p>
      </>
    );
  } else if (found.kind === 'material') {
    body = <p className="empty-hint">Edit materials from the Materials tab.</p>;
  }

  return (
    <div className="inspector">
      <div className="inspector-header">
        <span className="inspector-kind">{KIND_LABEL[found.kind]}</span>
        <button className="small-btn danger" onClick={remove} title="Delete">
          Delete
        </button>
      </div>
      {body}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field-block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function Vec3Input({ value, onChange }: { value: [number, number, number]; onChange: (v: [number, number, number]) => void }) {
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

function MaterialSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
