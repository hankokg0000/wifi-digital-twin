import { Footprints, User, Siren, PawPrint } from 'lucide-react';
import { useSceneStore } from '../store';
import { useMonitorModel } from '../sim/useMonitorModel';
import { formatDuration } from '../sim/format';
import { Section } from '../components/Section';
import { focusAgent } from './actions';
import type { Occupant } from '../sim/model';
import './monitor.css';

function PostureIcon({ o }: { o: Occupant }) {
  if (o.posture === 'fallen') return <Siren size={16} strokeWidth={1.5} className="posture posture-fallen" aria-label="ล้ม" />;
  if (o.posture === 'walking') return <Footprints size={16} strokeWidth={1.5} className="posture" aria-label="กำลังเดิน" />;
  return o.kind === 'pet' ? (
    <PawPrint size={16} strokeWidth={1.5} className="posture" aria-label="อยู่นิ่ง" />
  ) : (
    <User size={16} strokeWidth={1.5} className="posture" aria-label="ยืนอยู่" />
  );
}

/** Left rail "ในบ้านตอนนี้": who is where, fallen first. */
export function OccupantsPanel() {
  const { occupants } = useMonitorModel();
  const selection = useSceneStore((s) => s.selection);
  const people = occupants.filter((o) => o.kind === 'person').length;
  const pets = occupants.length - people;

  return (
    <Section title="ในบ้านตอนนี้" aside={<span>{people} คน · {pets} สัตว์เลี้ยง</span>}>
      {occupants.length === 0 ? (
        <p className="empty-hint">ยังไม่มีผู้อยู่อาศัย — สุ่มจากส่วน “จำลอง” ด้านล่าง</p>
      ) : (
        <ul className="occupants">
          {occupants.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className={`occupant${o.posture === 'fallen' ? ' fallen' : ''}${selection === o.id ? ' selected' : ''}`}
                aria-pressed={selection === o.id}
                onClick={() => focusAgent(o.id, o.levelId, o.position[0], o.position[2])}
              >
                <span className="occupant-dot" style={{ background: o.color }} aria-hidden="true" />
                <span className="occupant-name">{o.name}</span>
                <PostureIcon o={o} />
                <span className="occupant-where">
                  {o.room} · {o.levelName}
                </span>
                {o.fallenFor !== null ? (
                  <span className="occupant-time occupant-time-fallen mono">ล้มมา {formatDuration(o.fallenFor)}</span>
                ) : (
                  <span className="occupant-time mono">{formatDuration(o.inRoomFor)}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
