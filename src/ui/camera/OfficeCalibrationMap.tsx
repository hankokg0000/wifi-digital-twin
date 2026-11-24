import type { PointerEvent } from 'react';
import { OFFICE_DESKS, OFFICE_LENGTH, OFFICE_WIDTH } from '../../core/camera/office';
import type { FloorPoint } from '../../core/camera/tracking';

export function OfficeCalibrationMap({ points, onPoint }: {
  points: FloorPoint[];
  onPoint?: (point: FloorPoint) => void;
}) {
  function place(event: PointerEvent<SVGSVGElement>) {
    if (!onPoint || event.button !== 0) return;
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    onPoint([point.x, point.y]);
  }

  return (
    <svg className={`camera-calibration-map${onPoint ? ' editing' : ''}`}
      viewBox={`-0.8 -0.8 ${OFFICE_WIDTH + 1.6} ${OFFICE_LENGTH + 1.6}`}
      aria-label="ผังมุมบนสำหรับจับคู่จุดบนพื้น" data-testid="calibration-floor" onPointerUp={onPoint ? place : undefined}>
      <rect className="calibration-map-floor" x="0" y="0" width={OFFICE_WIDTH} height={OFFICE_LENGTH} rx="0.08" />
      <path className="calibration-map-wall" d={`M0 ${OFFICE_LENGTH} V0 H${OFFICE_WIDTH}`} />
      {OFFICE_DESKS.map(([x, z, rotation]) => (
        <rect key={z} className="calibration-map-desk" x="-0.90" y="-0.42" width="1.8" height="0.84" rx="0.06"
          transform={`translate(${x} ${z}) rotate(${-rotation * 180 / Math.PI})`} />
      ))}
      <polyline className="calibration-map-outline" points={points.map(([x, z]) => `${x},${z}`).join(' ')} />
      {points.map(([x, z], index) => (
        <g key={index} className="calibration-map-point" transform={`translate(${x} ${z})`}>
          <circle r="0.23" />
          <text y="0.085">{index + 1}</text>
        </g>
      ))}
    </svg>
  );
}
