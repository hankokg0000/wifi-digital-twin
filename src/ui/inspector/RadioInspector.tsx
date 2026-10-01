import { updateRadio, type Radio, type RadioIface, type Band } from '../../core';
import { useSceneStore } from '../store';
import { Field, Vec3Input, num } from './fields';

export function RadioInspector({ radio }: { radio: Radio }) {
  const apply = useSceneStore((s) => s.apply);
  return (
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
}
