/**
 * Sites: named real places where a Pilot Deployment's Link is set up. Persisted by the dev server
 * (`.wdt-data/sites.json`) and shared by everyone viewing. This file imports NOTHING: the Vite
 * plugin (a separate TS project) imports it directly.
 */

export type XZ = [x: number, z: number];

export interface SiteNetwork {
  gateway: string | null;
  channel: number | null;
}

export interface Site {
  id: string;
  name: string;
  widthM: number;
  lengthM: number;
  createdAt: string;
  devices: { tx: XZ | null; rx: XZ | null };
  network: SiteNetwork | null;
}

export interface SitesFile {
  version: 1;
  activeSiteId: string | null;
  sites: Site[];
}

export const EMPTY_SITES: SitesFile = { version: 1, activeSiteId: null, sites: [] };

export const ROOM_MIN_M = 1;
export const ROOM_MAX_M = 30;
export const MAX_SITES = 50;
const DEVICE_MAX_ABS = 60;
const ID_RE = /^[\w-]{1,64}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseXZ(v: unknown): XZ | null | undefined {
  if (v === null) return null;
  if (!Array.isArray(v) || v.length !== 2) return undefined;
  const [x, z] = v as unknown[];
  if (typeof x !== 'number' || typeof z !== 'number') return undefined;
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > DEVICE_MAX_ABS || Math.abs(z) > DEVICE_MAX_ABS) return undefined;
  return [x, z];
}

function parseNetwork(v: unknown): SiteNetwork | null | undefined {
  if (v === undefined || v === null) return null;
  if (!isRecord(v)) return undefined;
  const { gateway, channel } = v;
  if (gateway !== null && gateway !== undefined && typeof gateway !== 'string') return undefined;
  if (channel !== null && channel !== undefined && (typeof channel !== 'number' || !Number.isFinite(channel))) return undefined;
  return { gateway: (gateway as string | null | undefined) ?? null, channel: (channel as number | null | undefined) ?? null };
}

function inRange(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= ROOM_MIN_M && n <= ROOM_MAX_M;
}

function parseSite(v: unknown): Site | null {
  if (!isRecord(v)) return null;
  const { id, name, widthM, lengthM, createdAt, devices } = v;
  if (typeof id !== 'string' || !ID_RE.test(id)) return null;
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 40) return null;
  if (!inRange(widthM) || !inRange(lengthM)) return null;
  if (typeof createdAt !== 'string') return null;
  if (!isRecord(devices)) return null;
  const tx = parseXZ(devices.tx);
  const rx = parseXZ(devices.rx);
  if (tx === undefined || rx === undefined) return null;
  const network = parseNetwork(v.network);
  if (network === undefined) return null;
  return { id, name: trimmed, widthM, lengthM, createdAt, devices: { tx, rx }, network };
}

/** Validate untrusted JSON into a SitesFile; any problem anywhere → null. */
export function parseSitesFile(json: unknown): SitesFile | null {
  if (!isRecord(json) || json.version !== 1 || !Array.isArray(json.sites)) return null;
  if (json.sites.length > MAX_SITES) return null;
  const sites: Site[] = [];
  const seen = new Set<string>();
  for (const raw of json.sites) {
    const s = parseSite(raw);
    if (!s || seen.has(s.id)) return null;
    seen.add(s.id);
    sites.push(s);
  }
  const a = json.activeSiteId;
  if (a !== null && a !== undefined && typeof a !== 'string') return null;
  const activeSiteId = typeof a === 'string' && seen.has(a) ? a : null;
  return { version: 1, activeSiteId, sites };
}

export function newSiteId(nowMs: number): string {
  return `site-${nowMs.toString(36)}`;
}

export function activeSite(f: SitesFile | null): Site | null {
  if (!f) return null;
  return f.sites.find((s) => s.id === f.activeSiteId) ?? null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Stable key of the device positions ("x,z|x,z", rounded 0.01); "" unless both are placed. */
export function devicesKey(s: Site): string {
  const { tx, rx } = s.devices;
  if (!tx || !rx) return '';
  return `${r2(tx[0])},${r2(tx[1])}|${r2(rx[0])},${r2(rx[1])}`;
}
