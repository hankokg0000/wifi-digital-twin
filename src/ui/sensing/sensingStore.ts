import { create } from 'zustand';
import { useSceneStore } from '../store';
import {
  DEFAULT_DETECTOR_CONFIG,
  autoMonitoredRoomId,
  computeBaseline,
  createDetector,
  liveLinkOf,
  type Alert,
  type Baseline,
  type Detector,
  type Reading,
  type SceneDoc,
  type Verdict,
} from '../../core';

/**
 * Fast-updating WiFi sensing state. Same idea as heatmapStore: the zustand store only holds
 * slow-changing things (connection, current verdict, baseline, flags — a few updates a second at
 * most). The raw reading / verdict buffers are plain mutable arrays that the chart reads on every
 * animation frame; pushing 10 readings a second through zustand would re-render needlessly.
 */

export type Connection = 'connecting' | 'live' | 'fake' | 'offline';
export type SensingSource = 'live' | 'replay';
export type SensingOrigin = 'live' | 'replay' | 'simulated';

export const SENSING_ORIGIN_LABEL: Record<SensingOrigin, string> = {
  live: 'ของจริง',
  replay: 'ย้อนหลัง',
  simulated: 'จำลอง',
};

export interface MotionEpisode {
  start: number;
  end?: number;
  source: SensingSource;
}
export interface WifiRecording {
  version: 1;
  kind: 'wifi-recording';
  startedAt: string;
  baseline: Baseline | null;
  readings: Reading[];
  meta: { channel: number };
}

/** An Alert from WiFi Motion Detection, with its origin captured when it was raised. */
export type SensingAlert = Alert & { origin: SensingOrigin };

export const BASELINE_SECONDS = 30;
export const BUFFER_SECONDS = 120;
const BASELINE_KEY = 'wdt.baseline.v1';
const ROOM_KEY = 'wdt.monitoredRoom.v1';
const MAX_EPISODES = 200;

/** Mutable buffers read by the chart on every frame. Never put these in zustand. */
export const sensingBuffers: { readings: Reading[]; verdicts: Verdict[] } = { readings: [], verdicts: [] };

interface SensingState {
  connection: Connection;
  rssi: number | null;
  channel: number | null;
  source: SensingSource;
  verdict: Verdict | null;
  baseline: Baseline | null;
  /** 0..1 while a baseline is being recorded, else null. */
  baselineProgress: number | null;
  recording: { startedAt: string; count: number } | null;
  monitoredRoomId: string | null;
  episodes: MotionEpisode[];
  /** Replay progress 0..1 while source === 'replay'. */
  replayProgress: number;
  /** Fake mode only: the dev server is currently simulating a person walking. */
  fakeMotion: boolean;
  /** Alerts raised by WiFi Motion Detection, newest last. Wall-clock `t` (epoch s). */
  sensingAlerts: SensingAlert[];
  sensingActiveId: string | null;
}

export function selectSensingOrigin(s: SensingState): SensingOrigin | null {
  if (s.source === 'replay') return 'replay';
  if (s.connection === 'fake') return 'simulated';
  return s.connection === 'live' ? 'live' : null;
}

export function selectCurrentVerdict(s: SensingState): Verdict | null {
  if (selectSensingOrigin(s) === null || s.baselineProgress !== null) return null;
  if (s.source === 'replay' && s.replayProgress >= 1) return null;
  return s.verdict;
}

export function selectMotion(s: SensingState): boolean {
  return selectCurrentVerdict(s)?.motion === true;
}

export function selectActiveSensingAlertId(s: SensingState): string | null {
  return selectMotion(s) ? s.sensingActiveId : null;
}

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota: the app works without persistence */
  }
}

function isBaseline(b: unknown): b is Baseline {
  const x = b as Baseline | null;
  return !!x && typeof x.windowStdMean === 'number' && typeof x.windowStdSd === 'number' && typeof x.meanRssi === 'number';
}

export const useSensingStore = create<SensingState>()(() => ({
  connection: 'connecting',
  rssi: null,
  channel: null,
  source: 'live',
  verdict: null,
  baseline: ((b) => (isBaseline(b) ? b : null))(load<Baseline>(BASELINE_KEY)),
  baselineProgress: null,
  recording: null,
  monitoredRoomId: load<string>(ROOM_KEY),
  episodes: [],
  replayProgress: 0,
  fakeMotion: false,
  sensingAlerts: [],
  sensingActiveId: null,
}));

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __sensingStore: typeof useSensingStore }).__sensingStore = useSensingStore;
}

const set = useSensingStore.setState;
const get = useSensingStore.getState;

/**
 * The Monitored Room: the saved choice if it still exists, else (with a Live Link) the room the
 * Link passes through longest, else "ห้องนอนแขก", else the first room.
 */
export function resolveMonitoredRoom(doc: SceneDoc, id: string | null) {
  const saved = doc.rooms.find((r) => r.id === id);
  if (saved) return saved;
  const link = liveLinkOf(doc);
  if (link) {
    const auto = autoMonitoredRoomId(doc.rooms, link.tx, link.rx);
    const room = doc.rooms.find((r) => r.id === auto);
    if (room) return room;
  }
  return doc.rooms.find((r) => r.name === 'ห้องนอนแขก') ?? doc.rooms[0] ?? null;
}

/** null = automatic (clears the saved choice). */
export function setMonitoredRoomId(id: string | null): void {
  save(ROOM_KEY, id);
  set({ monitoredRoomId: id });
}

/* ---------------- pipeline ---------------- */

let detector: Detector | null = null;
let recordingReadings: Reading[] = [];
let recordingChannel = 0;
let baselineReadings: Reading[] | null = null;
let lastMetaAt = 0;
let lastReadingWall = 0;
let streamMode: 'live' | 'fake' | 'error' = 'live';
let replayTimer: ReturnType<typeof setInterval> | null = null;

function resetDetector(): void {
  const b = get().baseline;
  detector = b ? createDetector(b, DEFAULT_DETECTOR_CONFIG) : null;
}

function clearBuffers(): void {
  sensingBuffers.readings.length = 0;
  sensingBuffers.verdicts.length = 0;
  set({ verdict: null, episodes: [], sensingActiveId: null });
  resetDetector();
}

function trim(): void {
  const { readings, verdicts } = sensingBuffers;
  const last = readings[readings.length - 1];
  if (!last) return;
  const cut = last.t - BUFFER_SECONDS;
  if (readings.length > 0 && readings[0]!.t < cut - 10) {
    const i = readings.findIndex((r) => r.t >= cut);
    readings.splice(0, i < 0 ? readings.length : i);
  }
  if (verdicts.length > 0 && verdicts[0]!.t < cut - 10) {
    const i = verdicts.findIndex((v) => v.t >= cut);
    verdicts.splice(0, i < 0 ? verdicts.length : i);
  }
}

const MAX_SENSING_ALERTS = 50;

/**
 * Rising edge of motion: if the Monitored Room has an enabled Zone that applies to anything,
 * raise an Alert. Zones for only people or only pets are never triggered by WiFi,
 * which cannot tell them apart.
 */
function sensingAlertFor(origin: SensingOrigin): SensingAlert | null {
  const doc = useSceneStore.getState().doc;
  const room = resolveMonitoredRoom(doc, get().monitoredRoomId);
  if (!room) return null;
  const zone = doc.zones.find((z) => z.enabled && z.appliesTo === 'any' && z.roomId === room.id);
  if (!zone) return null;
  const now = Date.now();
  const [cx, cz] = room.polygon.reduce<[number, number]>((a, p) => [a[0] + p[0] / room.polygon.length, a[1] + p[1] / room.polygon.length], [0, 0]);
  return {
    id: `wifi:${zone.id}:${now}`,
    t: now / 1000,
    kind: 'motion-in-zone',
    source: origin === 'simulated' ? 'simulated' : 'observed',
    severity: 'warning',
    zoneId: zone.id,
    levelId: room.levelId,
    position: [cx, 0, cz],
    message: `ตรวจพบการเคลื่อนไหวใน${room.name} จาก WiFi`,
    origin,
  };
}

function applyVerdict(v: Verdict, source: SensingSource): void {
  sensingBuffers.verdicts.push(v);
  const state = get();
  const prev = state.verdict;
  let episodes = state.episodes;
  let sensingActiveId = state.sensingActiveId;
  let sensingAlerts = state.sensingAlerts;
  if (v.motion && !prev?.motion) {
    episodes = [...episodes, { start: v.t, source }].slice(-MAX_EPISODES);
    const origin = selectSensingOrigin(state);
    const alert = origin === null ? null : sensingAlertFor(origin);
    if (alert) {
      sensingAlerts = [...sensingAlerts, alert].slice(-MAX_SENSING_ALERTS);
      sensingActiveId = alert.id;
    }
  } else if (!v.motion && prev?.motion) {
    episodes = episodes.map((e, i) => (i === episodes.length - 1 && e.end === undefined ? { ...e, end: v.t } : e));
    sensingActiveId = null;
  }
  set({ verdict: v, episodes, sensingAlerts, sensingActiveId });
}

/** One reading through the whole pipeline (live or replay). */
function ingest(r: Reading, source: SensingSource): void {
  sensingBuffers.readings.push(r);
  if (source === 'live') {
    if (get().recording) {
      recordingReadings.push(r);
      const rec = get().recording;
      if (rec && recordingReadings.length % 10 === 0) set({ recording: { ...rec, count: recordingReadings.length } });
    }
    if (baselineReadings) {
      baselineReadings.push(r);
      const t0 = baselineReadings[0]!.t;
      const progress = Math.min(1, (r.t - t0) / BASELINE_SECONDS);
      if (progress >= 1) finishBaseline();
      else set({ baselineProgress: progress });
    }
  }
  const v = detector?.push(r) ?? null;
  if (v) applyVerdict(v, source);
  trim();
}

function finishBaseline(): void {
  const readings = baselineReadings;
  baselineReadings = null;
  if (!readings || readings.length < 10) {
    set({ baselineProgress: null });
    return;
  }
  const baseline = computeBaseline(readings, DEFAULT_DETECTOR_CONFIG, new Date().toISOString());
  save(BASELINE_KEY, baseline);
  set({ baseline, baselineProgress: null, verdict: null, episodes: [], sensingActiveId: null });
  sensingBuffers.verdicts.length = 0;
  resetDetector();
}

/* ---------------- actions ---------------- */

export function startBaseline(): void {
  if (get().source !== 'live' || get().baselineProgress !== null) return;
  baselineReadings = [];
  set({ baselineProgress: 0 });
}

export function cancelBaseline(): void {
  baselineReadings = null;
  set({ baselineProgress: null });
}

export function startRecording(): void {
  if (get().recording || get().source !== 'live') return;
  recordingReadings = [];
  set({ recording: { startedAt: new Date().toISOString(), count: 0 } });
}

/** Stops recording and returns the file contents (null if nothing was recording). */
export function stopRecording(): WifiRecording | null {
  const rec = get().recording;
  if (!rec) return null;
  const file: WifiRecording = {
    version: 1,
    kind: 'wifi-recording',
    startedAt: rec.startedAt,
    baseline: get().baseline,
    readings: recordingReadings,
    meta: { channel: get().channel ?? recordingChannel },
  };
  recordingReadings = [];
  set({ recording: null });
  return file;
}

/** Validates a parsed file; returns the recording or an error message (Thai). */
export function parseRecording(json: unknown): { ok: true; rec: WifiRecording } | { ok: false; message: string } {
  const j = json as Partial<WifiRecording> | null;
  if (!j || j.kind !== 'wifi-recording' || !Array.isArray(j.readings)) return { ok: false, message: 'ไฟล์ไม่ใช่ Recording ของ WiFi' };
  const readings = j.readings.filter((r): r is Reading => !!r && typeof r.t === 'number' && typeof r.rssi === 'number');
  if (readings.length < 10) return { ok: false, message: 'Recording สั้นเกินไป' };
  const baseline = isBaseline(j.baseline) ? j.baseline : get().baseline;
  if (!baseline) return { ok: false, message: 'Recording นี้ไม่มี Baseline และยังไม่ได้อัด Baseline' };
  return {
    ok: true,
    rec: { version: 1, kind: 'wifi-recording', startedAt: j.startedAt ?? '', baseline, readings, meta: { channel: j.meta?.channel ?? 0 } },
  };
}

function stopReplayTimer(): void {
  if (replayTimer) clearInterval(replayTimer);
  replayTimer = null;
}

/** Replay a recording through the detector in real time (1x), using the file's own baseline. */
export function startReplay(rec: WifiRecording): void {
  stopReplayTimer();
  cancelBaseline();
  if (get().recording) stopRecording();
  const baseline = rec.baseline ?? get().baseline;
  if (!baseline) return;
  const readings = [...rec.readings].sort((a, b) => a.t - b.t);
  set({ source: 'replay', replayProgress: 0, rssi: null });
  clearBuffers();
  detector = createDetector(baseline, DEFAULT_DETECTOR_CONFIG);
  const t0 = readings[0]!.t;
  const span = Math.max(1e-6, readings[readings.length - 1]!.t - t0);
  const wall0 = performance.now();
  let i = 0;
  replayTimer = setInterval(() => {
    const elapsed = (performance.now() - wall0) / 1000;
    while (i < readings.length && readings[i]!.t - t0 <= elapsed) {
      const r = readings[i++]!;
      if (i % 5 === 0) set({ rssi: r.rssi, channel: rec.meta.channel || get().channel });
      ingest(r, 'replay');
    }
    set({ replayProgress: Math.min(1, elapsed / span) });
    if (i >= readings.length) stopReplayTimer();
  }, 100);
}

export function backToLive(): void {
  stopReplayTimer();
  set({ source: 'live', replayProgress: 0, rssi: null });
  clearBuffers();
}

/* ---------------- SSE connection ---------------- */

/** Extra named SSE events other stores want (assigned on module load; avoids import cycles). */
export const sseHandlers: { sites?: (d: unknown) => void } = {};

function setConnection(connection: Connection): void {
  const state = get();
  if (state.connection === connection) return;
  if (state.source === 'live') {
    resetDetector();
    set({ connection, rssi: null, verdict: null, episodes: [], sensingActiveId: null });
  } else {
    set({ connection });
  }
}

/**
 * Connects to the dev server's /api/rssi/stream. EventSource reconnects by itself; while it is
 * down the connection shows 'offline'. Returns a disposer. Mount once (see <SensingDriver/>).
 */
export function connectSensing(): () => void {
  if (typeof EventSource === 'undefined') {
    setConnection('offline');
    return () => {};
  }
  const es = new EventSource('/api/rssi/stream');
  es.onopen = () => setConnection('connecting');
  es.onerror = () => setConnection('offline');
  es.addEventListener('status', (e) => {
    try {
      const { mode, fakeMotion } = JSON.parse((e as MessageEvent<string>).data) as { mode: 'live' | 'fake' | 'error'; fakeMotion?: boolean };
      streamMode = mode;
      setConnection(mode === 'error' ? 'offline' : mode);
      set({ fakeMotion: Boolean(fakeMotion) });
    } catch {
      /* ignore malformed status */
    }
  });
  es.addEventListener('sites', (e) => {
    try {
      sseHandlers.sites?.(JSON.parse((e as MessageEvent<string>).data));
    } catch {
      /* ignore malformed sites */
    }
  });
  es.onmessage = (e) => {
    let d: { ts?: number; rssi?: number; channel?: number; error?: string };
    try {
      d = JSON.parse(e.data as string);
    } catch {
      return;
    }
    if (d.error) {
      setConnection('offline');
      return;
    }
    if (streamMode === 'error' || typeof d.ts !== 'number' || typeof d.rssi !== 'number') return;
    lastReadingWall = performance.now();
    setConnection(streamMode);
    const r: Reading = { t: d.ts / 1000, rssi: d.rssi };
    if (get().source === 'live') {
      ingest(r, 'live');
      recordingChannel = d.channel ?? recordingChannel;
      if (r.t * 1000 - lastMetaAt > 400) {
        lastMetaAt = r.t * 1000;
        set({ rssi: d.rssi, channel: d.channel ?? null });
      }
    }
  };
  // No readings for 3 s while "connected" (WiFi dropped, helper died): say so.
  const watchdog = setInterval(() => {
    const c = get().connection;
    if ((c === 'live' || c === 'fake') && performance.now() - lastReadingWall > 3000) setConnection('offline');
  }, 1000);

  return () => {
    es.close();
    clearInterval(watchdog);
  };
}

/** The Monitored Room's id for the current doc (saved choice, else the guest room, else the first). */
export function useMonitoredRoomId(): string | null {
  const doc = useSceneStore((s) => s.doc);
  const saved = useSensingStore((s) => s.monitoredRoomId);
  return resolveMonitoredRoom(doc, saved)?.id ?? null;
}
