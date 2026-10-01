import { User, PawPrint, Users, TriangleAlert } from 'lucide-react';
import { updateZone, type Zone } from '../../core';
import { useSceneStore } from '../store';
import { useMonitorModel } from '../sim/useMonitorModel';
import { Section } from '../components/Section';
import { Switch } from '../components/Switch';
import { Tooltip } from '../components/Tooltip';

const APPLIES: Record<Zone['appliesTo'], { icon: typeof User; label: string }> = {
  person: { icon: User, label: 'ใช้กับคน' },
  pet: { icon: PawPrint, label: 'ใช้กับสัตว์เลี้ยง' },
  any: { icon: Users, label: 'ใช้กับทุกคน' },
};

/** Left rail "พื้นที่ห้ามเข้า": per-zone live status and an enable switch. */
export function ZonesPanel() {
  const { zones } = useMonitorModel();
  const apply = useSceneStore((s) => s.apply);

  return (
    <Section title="พื้นที่ห้ามเข้า" aside={<span>{zones.filter((z) => z.zone.enabled).length}/{zones.length} เปิดอยู่</span>}>
      {zones.length === 0 ? (
        <p className="empty-hint">ยังไม่มีพื้นที่ห้ามเข้า — วาดได้ในโหมด Edit (กด Z)</p>
      ) : (
        <ul className="zones">
          {zones.map(({ zone, levelName, occupied }) => {
            const Icon = APPLIES[zone.appliesTo].icon;
            return (
              <li key={zone.id} className="zone-row">
                <Tooltip label={APPLIES[zone.appliesTo].label} side="right">
                  <span className="zone-applies" tabIndex={0} aria-label={APPLIES[zone.appliesTo].label}>
                    <Icon size={16} strokeWidth={1.5} />
                  </span>
                </Tooltip>
                <span className="zone-name">
                  <span className="zone-title">{zone.name}</span>
                  <span className="zone-sub">
                    {!zone.enabled ? (
                      <span className="chip chip-off">ปิดใช้งาน</span>
                    ) : occupied ? (
                      <span className="chip chip-warning">
                        <TriangleAlert size={12} strokeWidth={1.5} />
                        มีผู้บุกรุก
                      </span>
                    ) : (
                      <span className="chip chip-idle">ว่าง</span>
                    )}
                    <span className="zone-level">{levelName}</span>
                  </span>
                </span>
                <Switch
                  checked={zone.enabled}
                  label={`เปิดใช้งาน ${zone.name}`}
                  onChange={(enabled) => apply((d) => updateZone(d, zone.id, { enabled }))}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
