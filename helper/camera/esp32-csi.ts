import { execFile, spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { createCsiTracker } from '../../src/core/camera/csi-monitor';

const run = promisify(execFile);
const PORT = /^\/dev\/cu\.(?:usbserial|usbmodem|SLAB_USBtoUART|wchusbserial)[a-zA-Z0-9._-]*$/i;

async function serialPort() {
  const configured = process.env.WDT_ESP32_PORT;
  if (configured) return PORT.test(configured) ? configured : null;
  const ports = (await readdir('/dev')).map((name) => '/dev/' + name).filter((path) => PORT.test(path));
  return ports.length === 1 ? ports[0]! : null;
}

export function createEspCsiMonitor() {
  const peer = process.env.WDT_ESP32_PEER?.trim().toLowerCase();
  let running: AbortController | null = null;
  const tracker = createCsiTracker(peer);

  async function listen(signal: AbortSignal) {
    while (!signal.aborted) {
      const port = await serialPort().catch(() => null);
      if (port) {
        try {
          const baud = process.env.WDT_ESP32_BAUD === '230400' ? '230400' : '115200';
          await run('/bin/stty', ['-f', port, baud, 'raw', '-echo', '-hupcl'], { signal, timeout: 2_000 });
          const device = spawn('/bin/cat', [port], { signal, stdio: ['ignore', 'pipe', 'ignore'] });
          const exited = new Promise<void>((done) => {
            device.once('error', () => done());
            device.once('close', () => done());
          });
          const lines = createInterface({ input: device.stdout, crlfDelay: Infinity });
          try {
            for await (const line of lines) {
              if (signal.aborted) break;
              tracker.accept(line, Date.now());
            }
          } finally {
            lines.close();
            device.kill();
            await exited;
          }
        } catch {
          // Reconnect after a disconnect or an unavailable port.
        }
      }
      if (!signal.aborted) {
        tracker.reset();
        await delay(1_200, undefined, { signal });
      }
    }
  }

  return {
    setEnabled(enabled: boolean) {
      if (enabled === Boolean(running)) return;
      running?.abort();
      running = null;
      tracker.reset();
      if (enabled) {
        running = new AbortController();
        void listen(running.signal).catch(() => {});
      }
    },
    reset: tracker.reset,
    baseline: tracker.baseline,
    status: tracker.status,
  };
}
