import type { Radio, RadioIface } from '../types';
import { fail, isFiniteNumber, isString, isVec3, isBand } from './shape';

export function parseRadios(items: unknown[]): Radio[] {
  return items.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) return fail(`radios[${i}] must be an object`);
    const r = raw as Record<string, unknown>;
    if (!isString(r['id'])) return fail(`radios[${i}].id must be a string`);
    if (!isString(r['levelId'])) return fail(`radios[${i}].levelId must be a string`);
    if (!isString(r['name'])) return fail(`radios[${i}].name must be a string`);
    if (r['role'] !== 'ap' && r['role'] !== 'client' && r['role'] !== 'sensor-node') {
      return fail(`radios[${i}].role must be "ap" | "client" | "sensor-node"`);
    }
    if (!isVec3(r['position'])) return fail(`radios[${i}].position must be a Vec3`);
    if (!Array.isArray(r['ifaces'])) return fail(`radios[${i}].ifaces must be an array`);
    const ifaces = r['ifaces'].map((raw, j) => {
      if (typeof raw !== 'object' || raw === null) return fail(`radios[${i}].ifaces[${j}] must be an object`);
      const f = raw as Record<string, unknown>;
      if (!isBand(f['band'])) return fail(`radios[${i}].ifaces[${j}].band must be "2.4" | "5"`);
      if (!isFiniteNumber(f['channel'])) return fail(`radios[${i}].ifaces[${j}].channel must be a finite number`);
      if (!isFiniteNumber(f['txPowerDbm'])) return fail(`radios[${i}].ifaces[${j}].txPowerDbm must be a finite number`);
      const out: RadioIface = { band: f['band'], channel: f['channel'], txPowerDbm: f['txPowerDbm'] };
      return out;
    });
    if (!isFiniteNumber(r['antennaGainDbi'])) return fail(`radios[${i}].antennaGainDbi must be a finite number`);
    const out: Radio = {
      id: r['id'],
      levelId: r['levelId'],
      name: r['name'],
      role: r['role'],
      position: r['position'],
      ifaces,
      antennaGainDbi: r['antennaGainDbi'],
    };
    return out;
  });
}
