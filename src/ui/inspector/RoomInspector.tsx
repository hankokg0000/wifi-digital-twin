import { updateRoom, setRoomRestricted, type Room, type SceneDoc } from '../../core';
import { useSceneStore } from '../store';
import { Field } from './fields';

export function RoomInspector({ room, doc }: { room: Room; doc: SceneDoc }) {
  const apply = useSceneStore((s) => s.apply);
  const restrictedZone = doc.zones.find((z) => z.roomId === room.id);
  return (
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
      <Field label="พื้นที่ห้ามเข้า">
        <input
          type="checkbox"
          checked={!!restrictedZone}
          onChange={(e) => apply((d) => setRoomRestricted(d, room.id, e.target.checked, restrictedZone?.appliesTo ?? 'any'))}
        />
      </Field>
      {restrictedZone && (
        <Field label="ใช้กับ">
          <select
            value={restrictedZone.appliesTo}
            onChange={(e) => apply((d) => setRoomRestricted(d, room.id, true, e.target.value as 'person' | 'pet' | 'any'))}
          >
            <option value="person">คน</option>
            <option value="pet">สัตว์</option>
            <option value="any">ทั้งหมด</option>
          </select>
        </Field>
      )}
    </>
  );
}
