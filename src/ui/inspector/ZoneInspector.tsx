import { updateZone, type Zone, type SceneDoc } from '../../core';
import { useSceneStore } from '../store';
import { Field } from './fields';

export function ZoneInspector({ zone, doc }: { zone: Zone; doc: SceneDoc }) {
  const apply = useSceneStore((s) => s.apply);
  return (
    <>
      <Field label="Name">
        <input value={zone.name} onChange={(e) => apply((d) => updateZone(d, zone.id, { name: e.target.value }))} />
      </Field>
      <Field label="ใช้กับ">
        <select
          value={zone.appliesTo}
          onChange={(e) => apply((d) => updateZone(d, zone.id, { appliesTo: e.target.value as typeof zone.appliesTo }))}
        >
          <option value="person">คน</option>
          <option value="pet">สัตว์</option>
          <option value="any">ทั้งหมด</option>
        </select>
      </Field>
      <Field label="เปิดใช้งาน">
        <input type="checkbox" checked={zone.enabled} onChange={(e) => apply((d) => updateZone(d, zone.id, { enabled: e.target.checked }))} />
      </Field>
      {zone.roomId && (
        <Field label="ห้อง">
          <span className="readonly-value">{doc.rooms.find((r) => r.id === zone.roomId)?.name ?? zone.roomId}</span>
        </Field>
      )}
    </>
  );
}
