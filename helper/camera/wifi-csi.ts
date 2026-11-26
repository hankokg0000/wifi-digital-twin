import { createSocket, type Socket } from 'node:dgram';
import { isIPv4 } from 'node:net';
import { createCsiTracker } from '../../src/core/camera/csi-monitor';
import { parseNexmonCsi } from '../../src/core/camera/nexmon-csi';

export function createWifiCsiMonitor(signal: AbortSignal) {
  const host = process.env.WDT_CSI_UDP_HOST ?? '127.0.0.1';
  const port = Number(process.env.WDT_CSI_UDP_PORT ?? 5500);
  const sender = process.env.WDT_CSI_UDP_PEER;
  const wifiPeer = process.env.WDT_CSI_WIFI_PEER?.toLowerCase();
  const tracker = createCsiTracker(wifiPeer);
  let socket: Socket | undefined;
  let feedback = '';

  function stop() {
    const previous = socket;
    socket = undefined;
    previous?.close();
  }

  function reset() {
    stop();
    tracker.reset();
    feedback = '';
  }

  signal.addEventListener('abort', stop, { once: true });
  return {
    reset,
    start() {
      if (socket || signal.aborted) return;
      feedback = '';
      if (!Number.isInteger(port) || port < 1024 || port > 65535 || !isIPv4(host) ||
          host === '0.0.0.0' || (sender ? !isIPv4(sender) : host !== '127.0.0.1') ||
          (wifiPeer && !/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(wifiPeer))) {
        feedback = 'ตรวจค่า IP พอร์ต และ MAC ของตัวรับ CSI ในการตั้งค่าเซิร์ฟเวอร์';
        return;
      }
      const receiver = createSocket('udp4');
      socket = receiver;
      receiver.on('error', () => {
        if (receiver !== socket) return;
        feedback = `เปิดตัวรับ CSI ที่ UDP ${port} ไม่สำเร็จ ลองผูกห้องใหม่`;
        tracker.reset();
        stop();
      });
      receiver.on('message', (packet, remote) => {
        if (receiver !== socket || remote.address !== (sender ?? '127.0.0.1')) return;
        const sample = parseNexmonCsi(packet);
        if (sample) tracker.acceptSample(sample, Date.now());
      });
      receiver.bind(port, host).unref();
    },
    baseline: tracker.baseline,
    status(now: number) {
      const snapshot = tracker.status(now);
      return { ...snapshot, feedback: feedback || snapshot.feedback };
    },
  };
}
