import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, resolve } from 'node:path';
import type { Logger } from 'vite';
import { demoArea } from '../src/core/camera/site-demo';
import { observedRssi, parseSavedRssiLink, RSSI_BASELINE_MS, type SavedRssiLink } from '../src/core/sensing/live-rssi';
import { makePublicWifiSnapshot } from '../src/core/sensing/public-wifi';
import { createSignalTracker } from '../src/core/sensing/signal-tracker';
import { DEFAULT_DETECTOR_CONFIG } from '../src/core/sensing/types';
import { localOperator } from './camera-clips';

function writeJson(path: string, value: unknown) {
  const temporary = resolve(dirname(path), `.wifi-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function createIndoorRssiPublication(root: string, logger: Logger) {
  const target = process.env.WDT_INDOOR_WIFI_PUBLIC_FILE;
  if (!target) return undefined;
  const destination = resolve(root, target);
  const config = resolve(root, '.wdt-data/indoor-rssi-public.json');
  mkdirSync(dirname(config), { recursive: true });
  const tracker = createSignalTracker({ baselineMs: RSSI_BASELINE_MS, config: DEFAULT_DETECTOR_CONFIG, traceLimit: 640 });
  let link: SavedRssiLink | null = null;
  try {
    const saved = parseSavedRssiLink(JSON.parse(readFileSync(config, 'utf8')));
    if (saved && demoArea(saved.roomId)) link = saved;
  } catch { /* Opening a fresh publication requires no room assignment. */ }
  let key: string | undefined;
  let reportedError = false;

  return {
    accept(line: string) {
      let measurement;
      try { measurement = observedRssi('live', JSON.parse(line)); } catch { return; }
      if (!measurement) return;
      if (key !== measurement.key) tracker.reset();
      key = measurement.key;
      const { channel } = measurement;
      tracker.acceptSample(measurement, Date.now());
      if (link?.baseline?.channel === channel) tracker.restoreBaseline(key, link.baseline.value);
    },
    publish() {
      try {
        const now = Date.now();
        writeJson(destination, makePublicWifiSnapshot(tracker.status(now), link?.roomId ?? null, now));
        reportedError = false;
      } catch {
        if (!reportedError) logger.warn('[indoor-wifi] Could not update the public RSSI snapshot.');
        reportedError = true;
      }
    },
    stop() {
      try { rmSync(destination, { force: true }); } catch { /* Viewers also discard expired snapshots. */ }
    },
    async configure(request: IncomingMessage, response: ServerResponse) {
      if (request.method !== 'POST') {
        response.writeHead(405, { Allow: 'POST' }).end();
        return;
      }
      if (!localOperator(request, true)) {
        response.writeHead(403).end();
        return;
      }
      let body = '';
      try {
        for await (const chunk of request) {
          body += String(chunk);
          if (body.length > 4096) {
            response.writeHead(413).end();
            return;
          }
        }
      } catch { return; }
      let value: unknown;
      try { value = JSON.parse(body); } catch {
        response.writeHead(400).end();
        return;
      }
      const next = parseSavedRssiLink(value);
      if (value !== null && (!next || !demoArea(next.roomId))) {
        response.writeHead(400).end();
        return;
      }
      try {
        if (JSON.stringify(next) !== JSON.stringify(link)) {
          writeJson(config, next);
          link = next;
          tracker.reset();
        }
        response.writeHead(204).end();
      } catch {
        response.writeHead(500).end();
      }
    },
  };
}
