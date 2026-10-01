import type { SceneDoc, Id, Radio, RadioIface, Vec3 } from '../types';
import { newId } from '../ids';
import { checked, requireEntity, requireLevel } from './shared';

export interface AddRadioInput {
  levelId: Id;
  name?: string;
  role?: 'ap' | 'client' | 'sensor-node';
  position?: Vec3;
  ifaces?: RadioIface[];
  antennaGainDbi?: number;
}

const DEFAULT_AP_IFACES: RadioIface[] = [
  { band: '2.4', channel: 6, txPowerDbm: 20 },
  { band: '5', channel: 36, txPowerDbm: 23 },
];

export function addRadio(doc: SceneDoc, input: AddRadioInput): { doc: SceneDoc; id: Id } {
  requireLevel(doc, input.levelId);
  const id = newId('radio');
  const radio: Radio = {
    id,
    levelId: input.levelId,
    name: input.name ?? 'AP ใหม่',
    role: input.role ?? 'ap',
    position: input.position ?? [0, 2.0, 0],
    ifaces: (input.ifaces ?? DEFAULT_AP_IFACES).map((f) => ({ ...f })),
    antennaGainDbi: input.antennaGainDbi ?? 3,
  };
  const next = checked({ ...doc, radios: [...doc.radios, radio] });
  return { doc: next, id };
}

export function updateRadio(doc: SceneDoc, id: Id, patch: Partial<Omit<Radio, 'id'>>): SceneDoc {
  requireEntity(doc.radios, id, 'radio');
  const radios = doc.radios.map((r) => (r.id === id ? { ...r, ...patch } : r));
  return checked({ ...doc, radios });
}
