import { updateRadio, type Radio, type RadioIface, type Band } from '../../core';
import { useSceneStore } from '../store';
import { Field, Vec3Input, num } from './fields';

const TX_MIN = 0;
const TX_MAX = 30;

// 2.4 GHz: 1-13 (Thailand allows 1-13). 5 GHz: the common non-DFS + DFS channels.
const CHANNELS: Record<Band, number[]> = {
  '2.4': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  '5': [36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144, 149, 153, 157, 161, 165],
};

/** Valid channels for a band; a legacy off-list channel already on the radio stays selectable. */
function channelsFor(band: Band, current?: number): number[] {
  const list = CHANNELS[band];
  return current !== undefined && !list.includes(current) ? [...list, current].sort((a, b) => a - b) : list;
}

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
        <span className="field-label">Interfaces — เปลี่ยนแล้ว heatmap ปรับตามทันที</span>
        {radio.ifaces.map((iface, i) => {
          const patch = (p: Partial<RadioIface>, coalesce?: string) => {
            const next: RadioIface[] = radio.ifaces.map((f, j) => (j === i ? { ...f, ...p } : f));
            apply((d) => updateRadio(d, radio.id, { ifaces: next }), coalesce ? { coalesce } : undefined);
          };
          return (
            <div key={i} className="iface-card">
              <div className="iface-head">
                <select
                  aria-label={`Band ของ interface ${i + 1}`}
                  value={iface.band}
                  onChange={(e) => {
                    const band = e.target.value as Band;
                    patch({ band, channel: channelsFor(band)[0]! });
                  }}
                >
                  <option value="2.4">2.4 GHz</option>
                  <option value="5">5 GHz</option>
                </select>
                <label className="iface-channel">
                  <span>ช่อง</span>
                  <select
                    aria-label={`Channel ${iface.band} GHz`}
                    value={iface.channel}
                    onChange={(e) => patch({ channel: Number(e.target.value) })}
                  >
                    {channelsFor(iface.band, iface.channel).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="iface-power">
                <span>กำลังส่ง</span>
                <input
                  type="range"
                  min={TX_MIN}
                  max={TX_MAX}
                  step={1}
                  aria-label={`Tx power ${iface.band} GHz (dBm)`}
                  value={iface.txPowerDbm}
                  onChange={(e) => patch({ txPowerDbm: Number(e.target.value) }, `tx:${radio.id}:${i}`)}
                />
                <output className="mono">{iface.txPowerDbm} dBm</output>
              </label>
            </div>
          );
        })}
      </div>
    </>
  );
}
