import { create } from 'zustand';
import { activeSite, newSiteId, parseSitesFile, snapVec2, type Site, type SitesFile, type XZ } from '../../core';
import { sseHandlers, useSensingStore } from '../sensing/sensingStore';

/**
 * Live (real-world) deployment state: the shared Sites file mirrored from the dev server and this
 * browser's wish to look at the real Link instead of the simulation. Never imports the scene
 * store; the doc swap is driven by <LiveDriver/>.
 */

const REALITY_KEY = 'wdt.reality.v1';
export const READ_ONLY_HINT = 'แก้ได้เฉพาะเครื่องที่รันเดโม';
const SAVE_ERROR = 'บันทึกไม่ได้ — แก้ได้เฉพาะเครื่องที่รันเดโม';

function loadWant(): boolean {
  try {
    return localStorage.getItem(REALITY_KEY) === 'real';
  } catch {
    return false;
  }
}

interface LiveState {
  /** null = not loaded yet / no dev server (production build). */
  sites: SitesFile | null;
  /** This browser's wish; after a reload we re-enter real once Sites arrive. */
  wantReal: boolean;
  saveError: string | null;
  /** Click-to-place of the two devices on the plan: which one the next click sets. */
  placing: null | 'tx' | 'rx';
  /** First click (Transmitter), kept until the Receiver click completes the pair. */
  draftTx: XZ | null;
}

export const useLiveStore = create<LiveState>()(() => ({
  sites: null,
  wantReal: loadWant(),
  saveError: null,
  placing: null,
  draftTx: null,
}));

const set = useLiveStore.setState;
const get = useLiveStore.getState;

export function setWantReal(b: boolean): void {
  try {
    localStorage.setItem(REALITY_KEY, b ? 'real' : 'sim');
  } catch {
    /* private mode */
  }
  set({ wantReal: b });
}

/** Only the machine running the demo may write Sites (the server enforces this too). */
export function canWrite(): boolean {
  if (typeof location === 'undefined') return false;
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname);
}

export function receiveSites(json: unknown): void {
  const parsed = parseSitesFile(json);
  if (parsed) set({ sites: parsed });
}

sseHandlers.sites = receiveSites;

export async function fetchSites(): Promise<void> {
  try {
    const res = await fetch('/api/sites');
    if (!res.ok) return;
    receiveSites(await res.json());
  } catch {
    /* no dev server: sites stays null */
  }
}

export async function putSites(next: SitesFile): Promise<void> {
  try {
    const res = await fetch('/api/sites', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
    if (!res.ok) throw new Error(String(res.status));
    const parsed = parseSitesFile(await res.json());
    if (!parsed) throw new Error('bad response');
    set({ sites: parsed, saveError: null });
  } catch {
    set({ saveError: SAVE_ERROR });
  }
}

export async function createQuickRoom(name: string, widthM: number, lengthM: number): Promise<void> {
  const cur = get().sites ?? { version: 1 as const, activeSiteId: null, sites: [] };
  const site: Site = {
    id: newSiteId(Date.now()),
    name: name.trim(),
    widthM,
    lengthM,
    createdAt: new Date().toISOString(),
    devices: { tx: null, rx: null },
    network: null,
  };
  await putSites({ version: 1, activeSiteId: site.id, sites: [...cur.sites, site] });
}

export async function activateSite(id: string): Promise<void> {
  const cur = get().sites;
  if (!cur || cur.activeSiteId === id) return;
  await putSites({ ...cur, activeSiteId: id });
}

const PLACE_SNAP_M = 0.05;

export function startPlacement(): void {
  set({ placing: 'tx', draftTx: null });
}

export function cancelPlacement(): void {
  if (get().placing === null && get().draftTx === null) return;
  set({ placing: null, draftTx: null });
}

/** 1st click = hotspot (Transmitter), 2nd = Mac (Receiver); the pair is saved to the active Site. */
export function placePoint(p: [number, number]): void {
  const { placing, draftTx, sites } = get();
  if (placing === null) return;
  const q = snapVec2(p, PLACE_SNAP_M);
  if (placing === 'tx') {
    set({ draftTx: q, placing: 'rx' });
    return;
  }
  const site = activeSite(sites);
  set({ placing: null, draftTx: null });
  if (!sites || !site || !draftTx) return;
  // Gateway polling arrives with Phase 3; until then only the channel is recorded.
  const channel = useSensingStore.getState().channel;
  const next: Site = { ...site, devices: { tx: draftTx, rx: q }, network: { gateway: null, channel } };
  void putSites({ ...sites, sites: sites.sites.map((s) => (s.id === site.id ? next : s)) });
}
