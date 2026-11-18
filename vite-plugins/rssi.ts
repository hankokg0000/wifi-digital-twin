import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import type { ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/**
 * Dev-only plugin: streams this Mac's WiFi RSSI (via helper/mac-rssi) to the app as
 * Server-Sent Events at /api/rssi/stream. Falls back to fake readings when there is no Mac /
 * swiftc, or when RSSI_FAKE=1. Never active in `vite build`.
 */

const SRC = 'helper/mac-rssi/rssi.swift';
const BIN_DIR = 'node_modules/.cache/mac-rssi';
const BIN = `${BIN_DIR}/rssi`;
const IDLE_MS = 10_000;
const FAKE_HZ = 10;

type Mode = 'live' | 'fake' | 'error';

function compileHelper(root: string): { ok: true; bin: string } | { ok: false; message: string } {
  const src = `${root}/${SRC}`;
  const bin = `${root}/${BIN}`;
  try {
    if (!existsSync(bin) || statSync(src).mtimeMs > statSync(bin).mtimeMs) {
      mkdirSync(`${root}/${BIN_DIR}`, { recursive: true });
      const r = spawnSync('swiftc', ['-O', src, '-o', bin], { encoding: 'utf8' });
      if (r.status !== 0) return { ok: false, message: (r.stderr || r.error?.message || 'swiftc failed').slice(0, 300) };
    }
    return { ok: true, bin };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}

function gaussian(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function defaultGateway(): string | null {
  const r = spawnSync('route', ['-n', 'get', 'default'], { encoding: 'utf8' });
  const m = /gateway:\s*(\S+)/.exec(r.stdout ?? '');
  return m?.[1] ?? null;
}

export function rssiPlugin(): Plugin {
  return {
    name: 'wdt-rssi',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root;
      const clients = new Set<ServerResponse>();
      let helper: ChildProcess | null = null;
      let ping: ChildProcess | null = null;
      let fakeTimer: ReturnType<typeof setInterval> | null = null;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      let mode: Mode = 'live';
      let message: string | undefined;
      let fakeMotion = false;

      const send = (chunk: string) => {
        for (const c of clients) c.write(chunk);
      };
      const statusChunk = () => `event: status\ndata: ${JSON.stringify({ mode, fakeMotion, ...(message ? { message } : {}) })}\n\n`;
      const setStatus = (m: Mode, msg?: string) => {
        mode = m;
        message = msg;
        send(statusChunk());
      };

      const startFake = () => {
        if (fakeTimer) return;
        fakeTimer = setInterval(() => {
          const sd = fakeMotion ? 4 : 1;
          const rssi = Math.round(-55 + gaussian() * sd);
          send(`data: ${JSON.stringify({ ts: Date.now(), rssi, noise: -96, channel: 36 })}\n\n`);
        }, 1000 / FAKE_HZ);
      };

      const startLive = (bin: string) => {
        const child = spawn(bin, ['--hz', '10'], { stdio: ['ignore', 'pipe', 'ignore'] });
        helper = child;
        createInterface({ input: child.stdout! }).on('line', (line) => {
          if (line.startsWith('{')) send(`data: ${line}\n\n`);
        });
        child.on('error', (e) => {
          if (helper === child) {
            helper = null;
            setStatus('error', String(e));
          }
        });
        child.on('exit', () => {
          if (helper === child) helper = null;
        });
        // Keep frames flowing on the hotspot link so RSSI keeps refreshing.
        const gw = defaultGateway();
        if (gw) {
          const p = spawn('ping', ['-i', '0.2', gw], { stdio: 'ignore' });
          p.on('error', () => {});
          ping = p;
        }
      };

      const start = () => {
        if (helper || fakeTimer) return;
        fakeMotion = false;
        if (process.env.RSSI_FAKE === '1' || process.platform !== 'darwin') {
          setStatus('fake');
          startFake();
          return;
        }
        const c = compileHelper(root);
        if (!c.ok) {
          server.config.logger.warn(`[rssi] swiftc failed, using fake readings: ${c.message}`);
          setStatus('fake', 'swiftc failed');
          startFake();
          return;
        }
        setStatus('live');
        startLive(c.bin);
      };

      const stop = () => {
        if (helper) helper.kill();
        helper = null;
        if (ping) ping.kill();
        ping = null;
        if (fakeTimer) clearInterval(fakeTimer);
        fakeTimer = null;
      };

      const scheduleIdleStop = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          if (clients.size === 0) stop();
        }, IDLE_MS);
      };

      server.middlewares.use('/api/rssi/stream', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end();
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        if (idleTimer) clearTimeout(idleTimer);
        start(); // before adding this client: it gets the status line below instead
        clients.add(res);
        res.write(statusChunk());
        req.on('close', () => {
          clients.delete(res);
          if (clients.size === 0) scheduleIdleStop();
        });
      });

      server.middlewares.use('/api/rssi/fake-motion', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (d) => (body += d));
        req.on('end', () => {
          try {
            fakeMotion = Boolean((JSON.parse(body) as { on?: unknown }).on);
            send(statusChunk());
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ on: fakeMotion }));
          } catch {
            res.statusCode = 400;
            res.end();
          }
        });
      });

      const cleanup = () => {
        if (idleTimer) clearTimeout(idleTimer);
        stop();
      };
      server.httpServer?.on('close', cleanup);
      process.once('exit', cleanup);
    },
  };
}
