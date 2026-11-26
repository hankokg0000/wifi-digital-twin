import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import { INDOOR_RSSI_STREAM } from '../src/core/sensing/live-rssi';
import { localOperator } from './camera-clips';
import { INDOOR_RSSI_SHARE_PATH } from '../src/core/sensing/public-wifi';
import { createIndoorRssiPublication } from './indoor-rssi-public';
import { createSitesStore, isLocalWrite } from './sites';
import type { SitesFile } from '../src/core/live/sites';

/**
 * Streams this Mac's WiFi RSSI using the CoreWLAN helper. The Indoor Twin endpoint is local-only.
 * The legacy development endpoint also supports simulated readings.
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
  function configure(server: ViteDevServer | PreviewServer, legacy: boolean) {
    const root = server.config.root;
    const publication = createIndoorRssiPublication(root, server.config.logger);
    const sites = legacy ? createSitesStore(root) : undefined;
    const clients = new Map<ServerResponse, boolean>();
    let helper: ChildProcess | null = null;
    let ping: ChildProcess | null = null;
    let fakeTimer: ReturnType<typeof setInterval> | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let mode: Mode = 'live';
    let message: string | undefined;
    let fakeMotion = false;

    const send = (chunk: string) => {
      for (const c of clients.keys()) c.write(chunk);
    };
    const statusChunk = () => `event: status\ndata: ${JSON.stringify({ mode, fakeMotion, ...(message ? { message } : {}) })}\n\n`;
    const sitesChunk = (value: SitesFile) => `event: sites\ndata: ${JSON.stringify(value)}\n\n`;
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
        if (helper !== child || !line.startsWith('{')) return;
        publication?.accept(line);
        send(`data: ${line}\n\n`);
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
      if (ping) { ping.kill(); ping = null; }
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
      if (publication) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (clients.size === 0) stop();
      }, IDLE_MS);
    };

    function stream(req: IncomingMessage, res: ServerResponse, includeSites: boolean) {
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
      clients.set(res, includeSites);
      res.write(statusChunk());
      if (includeSites && sites) res.write(sitesChunk(sites.get()));
      req.on('close', () => {
        clients.delete(res);
        if (clients.size === 0) scheduleIdleStop();
      });
    }

    server.middlewares.use(INDOOR_RSSI_STREAM, (req, res) => {
      if (!localOperator(req, false)) {
        res.writeHead(403).end();
        return;
      }
      stream(req, res, false);
    });
    if (publication) server.middlewares.use(INDOOR_RSSI_SHARE_PATH, (req, res) => void publication.configure(req, res));
    if (legacy) server.middlewares.use('/api/rssi/stream', (req, res) => stream(req, res, true));
    if (legacy) server.middlewares.use('/api/rssi/fake-motion', (req, res) => {
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

    if (sites) {
      const MAX_SITES_BODY = 256 * 1024;
      server.middlewares.use('/api/sites', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method === 'GET') {
          res.end(JSON.stringify(sites.get()));
          return;
        }
        if (req.method !== 'PUT') {
          res.statusCode = 405;
          res.end();
          return;
        }
        if (!isLocalWrite(req.headers)) {
          res.statusCode = 403;
          res.end();
          return;
        }
        let body = '';
        let size = 0;
        let tooBig = false;
        req.on('data', (d: Buffer) => {
          size += d.length;
          if (size > MAX_SITES_BODY) tooBig = true;
          else body += d;
        });
        req.on('end', () => {
          if (tooBig) {
            res.statusCode = 413;
            res.end();
            return;
          }
          let saved: ReturnType<typeof sites.put> = null;
          try {
            saved = sites.put(JSON.parse(body));
          } catch {
            saved = null;
          }
          if (!saved) {
            res.statusCode = 400;
            res.end();
            return;
          }
          res.end(JSON.stringify(saved));
          for (const [client, includeSites] of clients) {
            if (includeSites) client.write(sitesChunk(saved));
          }
        });
      });
    }

    const publisherTimer = publication ? setInterval(() => {
      start();
      publication.publish();
    }, 1_000).unref() : undefined;
    const cleanup = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (publisherTimer) clearInterval(publisherTimer);
      publication?.stop();
      stop();
    };
    server.httpServer?.on('close', cleanup);
    process.once('exit', cleanup);
  }

  return {
    name: 'wdt-rssi',
    apply: 'serve',
    configureServer: server => configure(server, true),
    configurePreviewServer: server => configure(server, false),
  };
}
