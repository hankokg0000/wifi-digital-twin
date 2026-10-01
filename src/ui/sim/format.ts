import { SIM_DAY_START_SECONDS, formatClock } from '../simClock';

/** "07:19:43" for a sim-relative time. */
export function clockAt(t: number): string {
  return formatClock(SIM_DAY_START_SECONDS + t);
}

/** "mm:ss" for a duration in seconds (e.g. a fall timer: "01:12"). */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** "h:mm:ss" (no leading zero on hours), used for the horizon readout. */
export function formatHms(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Thai relative time between two sim times: "เมื่อสักครู่", "30 วินาทีที่แล้ว", "2 นาทีที่แล้ว". */
export function relativeThai(now: number, then: number): string {
  const d = Math.max(0, now - then);
  if (d < 10) return 'เมื่อสักครู่';
  if (d < 60) return `${Math.floor(d)} วินาทีที่แล้ว`;
  if (d < 3600) return `${Math.floor(d / 60)} นาทีที่แล้ว`;
  return `${Math.floor(d / 3600)} ชั่วโมงที่แล้ว`;
}
