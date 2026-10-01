import { updateMaterial, type Band } from '../../core';
import { useSceneStore } from '../store';

const BANDS: Band[] = ['2.4', '5'];

export function MaterialsTab() {
  const materials = useSceneStore((s) => s.doc.materials);
  const apply = useSceneStore((s) => s.apply);

  return (
    <div className="panel-body">
      <table className="materials-table">
        <thead>
          <tr>
            <th>Material</th>
            <th>2.4 GHz (dB)</th>
            <th>5 GHz (dB)</th>
            <th>Color</th>
          </tr>
        </thead>
        <tbody>
          {materials.map((m) => (
            <tr key={m.id}>
              <td>{m.name}</td>
              {BANDS.map((band) => (
                <td key={band}>
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    value={m.lossDb[band]}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v)) return;
                      apply((d) => updateMaterial(d, m.id, { lossDb: { ...m.lossDb, [band]: v } }));
                    }}
                  />
                </td>
              ))}
              <td>
                <span className="color-swatch" style={{ background: m.color }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
