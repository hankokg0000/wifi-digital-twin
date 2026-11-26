import { useEffect, useState } from 'react';
import type { UsdRoomModel } from '../../core/camera/plan-import';
import { ROOM_MONITOR_API, type MonitorRoom, type MonitorStatus } from '../../core/camera/room-monitor';
import { requireCameraJson } from '../camera/useOfficeEditor';

export function useLiveRoom(enabled: boolean, available = true) {
  const [room, setRoom] = useState<MonitorRoom | null>(null);
  const [status, setStatus] = useState<MonitorStatus>();
  const [model, setModel] = useState<UsdRoomModel>();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!available) return;
    const abort = new AbortController();
    const signal = abort.signal;
    let timer: ReturnType<typeof setTimeout>;
    const request = async <T,>(path: string, method = 'GET') =>
      requireCameraJson<T>(await fetch(ROOM_MONITOR_API + path, { method, signal, cache: 'no-store' }));
    const warn = (error: unknown) => {
      if (!signal.aborted) {
        setStatus(undefined);
        setError(error instanceof Error ? error.message : 'เปิดกล้องสดไม่ได้');
      }
    };
    async function start() {
      setStatus(undefined);
      setModel(undefined);
      setError('');
      const active = await request<MonitorRoom | null>('room');
      if (signal.aborted) return;
      setRoom(active);
      if (!enabled) return;
      if (!active) throw new Error('เลือกห้องที่จะใช้จากหน้าตั้งค่ากล้องก่อน');
      const roomId = active.id;
      if (active.modelUrl) {
        void fetch(active.modelUrl, { signal }).then(requireCameraJson<UsdRoomModel>).then((data) => {
          if (!signal.aborted) setModel(data);
        }).catch(() => {});
      }
      const current = await request<MonitorStatus>('status');
      const selected = current.camera === 'live' ? current : await request<MonitorStatus>('camera/live', 'POST');
      if (signal.aborted) return;
      setStatus(selected);
      async function poll() {
        try {
          const next = await request<MonitorStatus>('status');
          if (signal.aborted) return;
          if (next.roomId !== roomId || next.camera !== 'live') {
            throw new Error('ห้องหรือแหล่งภาพเปลี่ยนแล้ว ลองเลือกกล้องสดอีกครั้ง');
          }
          setStatus(next);
          setError('');
        } catch (error) {
          warn(error);
        }
        if (!signal.aborted) timer = setTimeout(() => void poll(), 150);
      }
      timer = setTimeout(() => void poll(), 150);
    }
    void start().catch((error: unknown) => { if (enabled) warn(error); });
    return () => { abort.abort(); clearTimeout(timer); };
  }, [available, enabled]);

  return { room, status, model, error };
}
