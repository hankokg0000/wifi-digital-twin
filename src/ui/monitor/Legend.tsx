import { CameraOff } from 'lucide-react';

/** Floating canvas key: agent marker, restricted-zone hatch, fallen ring, private (no-camera) room. */
export function Legend() {
  return (
    <div className="legend" aria-label="คำอธิบายสัญลักษณ์">
      <span className="legend-item">
        <span className="legend-agent" />
        ผู้อยู่อาศัย
      </span>
      <span className="legend-item">
        <span className="legend-zone" />
        พื้นที่ห้ามเข้า
      </span>
      <span className="legend-item">
        <span className="legend-fallen" />
        ล้ม
      </span>
      <span className="legend-item">
        <CameraOff size={14} strokeWidth={1.5} />
        ห้องส่วนตัว
      </span>
    </div>
  );
}
