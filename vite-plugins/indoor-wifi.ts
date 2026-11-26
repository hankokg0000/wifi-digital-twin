import type { IncomingMessage, ServerResponse } from 'node:http';
import type { createWifiCsiMonitor } from '../helper/camera/wifi-csi';
import { INDOOR_WIFI_API } from '../src/core/camera/csi-monitor';
import { demoArea } from '../src/core/camera/site-demo';
import { localOperator } from './camera-clips';

export function createIndoorWifi(receiver: ReturnType<typeof createWifiCsiMonitor>) {
  let roomId: string | null = null;
  return {
    handle(request: IncomingMessage, response: ServerResponse, path: string) {
      const action = path.slice(INDOOR_WIFI_API.length);
      const read = action === 'status' && request.method === 'GET';
      const write = ['assign', 'baseline', 'release'].includes(action) && request.method === 'POST';
      const requested = new URL(request.url ?? '/', 'http://localhost').searchParams.get('room');
      const send = (status: number, body: unknown) => {
        response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify(body));
      };
      if (!read && !write) return send(405, { error: 'วิธีเรียกใช้งานไม่ถูกต้อง' });
      if (!localOperator(request, write)) return send(403, { error: 'เปิด Indoor Twin จากเครื่องที่รันเซิร์ฟเวอร์' });
      if (action === 'assign') {
        if (!demoArea(requested)) return send(400, { error: 'เลือกห้องที่ติดตั้งตัวรับ Wi-Fi CSI' });
        if (roomId !== requested) {
          roomId = requested;
          receiver.reset();
        }
        receiver.start();
      } else if (write) {
        if (!roomId || roomId !== requested) return send(409, { error: 'ผูกตัวรับ CSI กับห้องนี้ก่อน' });
        if (action === 'release') {
          roomId = null;
          receiver.reset();
        } else if (!receiver.baseline(Date.now())) {
          return send(409, { error: 'รอข้อมูล CSI จากตัวรับ Wi-Fi ก่อนบันทึก Baseline' });
        }
      }
      const snapshot = receiver.status(Date.now());
      send(200, roomId ? { ...snapshot, roomId } : {
        roomId: null, state: 'disconnected', readings: [], verdicts: [], baseline: null, score: null, threshold: null, remainingMs: 0,
      });
    },
  };
}
