import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { IncomingHttpHeaders } from 'node:http';
import { EMPTY_SITES, parseSitesFile, type SitesFile } from '../src/core/live/sites';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function hostnameOf(hostHeader: string): string {
  const h = hostHeader.trim().toLowerCase();
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    return end < 0 ? h : h.slice(0, end + 1);
  }
  if (h === '::1') return h;
  const i = h.lastIndexOf(':');
  return i < 0 ? h : h.slice(0, i);
}

/**
 * True only for requests that reached the server directly on a loopback host: no proxy/tunnel
 * headers (ngrok adds x-forwarded-* and ngrok-*), and any Origin is also loopback.
 */
export function isLocalWrite(headers: IncomingHttpHeaders): boolean {
  const host = headers.host;
  if (typeof host !== 'string' || !LOCAL_HOSTS.has(hostnameOf(host))) return false;
  for (const k of Object.keys(headers)) {
    const key = k.toLowerCase();
    if (key === 'x-forwarded-for' || key === 'x-forwarded-host' || key === 'x-forwarded-proto' || key === 'forwarded' || key === 'x-real-ip' || key.startsWith('ngrok-')) return false;
  }
  const origin = headers.origin;
  if (typeof origin === 'string') {
    try {
      if (!LOCAL_HOSTS.has(hostnameOf(new URL(origin).host))) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export function createSitesStore(root: string): { get(): SitesFile; put(body: unknown): SitesFile | null } {
  const dir = `${root}/.wdt-data`;
  const file = `${dir}/sites.json`;
  let current: SitesFile = EMPTY_SITES;
  try {
    if (existsSync(file)) current = parseSitesFile(JSON.parse(readFileSync(file, 'utf8'))) ?? EMPTY_SITES;
  } catch {
    current = EMPTY_SITES;
  }
  return {
    get: () => current,
    put(body) {
      const parsed = parseSitesFile(body);
      if (!parsed) return null;
      mkdirSync(dir, { recursive: true });
      writeFileSync(`${file}.tmp`, JSON.stringify(parsed, null, 2) + '\n');
      renameSync(`${file}.tmp`, file);
      current = parsed;
      return parsed;
    },
  };
}
