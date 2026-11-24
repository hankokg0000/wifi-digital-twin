import { execFile, spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { parseEspCsi } from '../../src/core/camera/room-monitor';
import { computeBaseline, createDetector, type Detector } from '../../src/core/sensing/detect';
import type { Reading } from '../../src/core/sensing/types';

const run = promisify(execFile);
const CSI_AGE_MS = 3_000;
const BASELINE_MS = 15_000;
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
  let last = 0;
  let format: string | null = null;
  let detector: Detector | null = null;
  let readings: Reading[] = [];
  let calibrationEnds = 0;
  let motion = false;
  let feedback = '';

  function resetLink() {
    last = 0;
    format = null;
    detector = null;
    readings = [];
    calibrationEnds = 0;
    motion = false;
    feedback = '';
  }

  function accept(line: string, now: number) {
    const sample = parseEspCsi(line);
    if (!sample || (peer && sample.peer !== peer)) return;
    if (format && now - last > CSI_AGE_MS) resetLink();
    if (format && format !== sample.key) return;
    format = sample.key;
    last = now;
    const reading = { t: now / 1000, rssi: sample.power };
    if (calibrationEnds) {
      readings.push(reading);
      if (now >= calibrationEnds) {
        const duration = (readings.at(-1)?.t ?? 0) - (readings[0]?.t ?? 0);
        if (readings.length >= 60 && duration >= 12) {
          detector = createDetector(computeBaseline(readings, {
            windowS: 2, stepS: 0.5, onConsecutive: 2, offHoldS: 3, kOn: 3, kOff: 1.5, sdFloor: 0.3,
          }, new Date(now).toISOString()));
        } else feedback = 'ข้อมูลจากบอร์ดยังไม่ต่อเนื่อง ลองบันทึกช่วงห้องนิ่งใหม่';
        readings = [];
        calibrationEnds = 0;
      }
    } else {
      const verdict = detector?.push(reading);
      if (verdict) motion = verdict.motion;
    }
  }

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
              accept(line, Date.now());
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
        resetLink();
        await delay(1_200, undefined, { signal });
      }
    }
  }

  return {
    setEnabled(enabled: boolean) {
      if (enabled === Boolean(running)) return;
      running?.abort();
      running = null;
      resetLink();
      if (enabled) {
        running = new AbortController();
        void listen(running.signal).catch(() => {});
      }
    },
    baseline(now: number) {
      if (!last || now - last > CSI_AGE_MS || calibrationEnds) return false;
      detector = null;
      readings = [];
      feedback = '';
      motion = false;
      calibrationEnds = now + BASELINE_MS;
      return true;
    },
    status(now: number): { state: 'disconnected' | 'calibrating' | 'baseline-needed' | 'motion' | 'idle'; feedback?: string } {
      if (!last || now - last > CSI_AGE_MS) return { state: 'disconnected' };
      if (calibrationEnds) return { state: 'calibrating' };
      if (!detector) return { state: 'baseline-needed', feedback };
      return { state: motion ? 'motion' : 'idle' };
    },
  };
}
