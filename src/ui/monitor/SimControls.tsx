import { useState } from 'react';
import { Minus, Plus, Shuffle, Siren } from 'lucide-react';
import { addIncident, populate, type PopulationSettings } from '../../core';
import { useSceneStore } from '../store';
import { Section } from '../components/Section';
import { Segmented } from '../components/Segmented';

const FALL_RATES: { value: number; label: string; hint: string }[] = [
  { value: 0, label: 'ปิด', hint: 'ไม่สุ่มเหตุล้ม' },
  { value: 0.5, label: 'ต่ำ', hint: '0.5 ครั้ง/ชม.' },
  { value: 3, label: 'สูง', hint: '3 ครั้ง/ชม.' },
];

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <span className="field-label">{label}</span>
      <div className="stepper-controls">
        <button className="icon-btn" aria-label={`ลด${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
          <Minus size={16} strokeWidth={1.5} />
        </button>
        <output className="stepper-value mono" aria-label={label}>{value}</output>
        <button className="icon-btn" aria-label={`เพิ่ม${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
          <Plus size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

/** Left rail, collapsible "จำลอง": population steppers, fall rate, re-roll, force a fall. */
export function SimControls() {
  const doc = useSceneStore((s) => s.doc);
  const selection = useSceneStore((s) => s.selection);
  const simT = useSceneStore((s) => s.sim.t);
  const apply = useSceneStore((s) => s.apply);
  const setTime = useSceneStore((s) => s.setTime);
  const play = useSceneStore((s) => s.play);
  const clearAcknowledged = useSceneStore((s) => s.clearAcknowledged);
  const [settings, setSettings] = useState<PopulationSettings>(doc.population);

  const hasPeople = doc.agents.some((a) => a.kind === 'person');

  function randomize() {
    const seed = Math.floor(Math.random() * 1_000_000_000);
    apply((d) => populate(d, settings, seed));
    clearAcknowledged();
    setTime(0);
    play();
  }

  function simulateFallNow() {
    const people = doc.agents.filter((a) => a.kind === 'person');
    if (people.length === 0) return;
    const target = people.find((p) => p.id === selection) ?? people[Math.floor(Math.random() * people.length)]!;
    apply((d) => addIncident(d, { agentId: target.id, t: simT, duration: 180 }).doc);
  }

  return (
    <Section title="จำลอง" collapsible>
      <div className="sim-controls">
        <div className="stepper-pair">
          <Stepper label="คน" value={settings.people} min={0} max={12} onChange={(people) => setSettings((s) => ({ ...s, people }))} />
          <Stepper label="สัตว์เลี้ยง" value={settings.pets} min={0} max={6} onChange={(pets) => setSettings((s) => ({ ...s, pets }))} />
        </div>
        <div className="sim-field">
          <span className="field-label">โอกาสล้ม</span>
          <Segmented
            fill
            label="โอกาสล้ม"
            value={settings.fallsPerHour}
            onChange={(fallsPerHour) => setSettings((s) => ({ ...s, fallsPerHour }))}
            options={FALL_RATES.map((r) => ({ value: r.value, label: r.label, ariaLabel: `${r.label} (${r.hint})` }))}
          />
        </div>
        <div className="sim-actions">
          <button className="btn btn-block" onClick={randomize}>
            <Shuffle size={16} strokeWidth={1.5} />
            สุ่มใหม่
          </button>
          <button className="btn btn-critical btn-block" onClick={simulateFallNow} disabled={!hasPeople}>
            <Siren size={16} strokeWidth={1.5} />
            จำลองคนล้ม
          </button>
        </div>
      </div>
    </Section>
  );
}
