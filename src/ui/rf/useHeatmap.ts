import { useEffect } from 'react';
import * as Comlink from 'comlink';
import { sampleWorld, type Id, type RfAgent, type SceneDoc } from '../../core';
import { useSceneStore } from '../store';
import { plansFor } from '../sim/cache';
import { simClockRef } from '../simClock';
import { useHeatmapStore } from './heatmapStore';
import type { HeatmapWorkerApi, HeatmapRequest } from './heatmap.worker';

/** While the sim plays, agents move but the heatmap only needs to follow a few times a second. */
const MIN_INTERVAL_MS = 250; // 4 Hz
const SLOW_MS = 50;

const docIds = new WeakMap<SceneDoc, number>();
let nextDocId = 1;
const docId = (d: SceneDoc) => {
  let id = docIds.get(d);
  if (id === undefined) docIds.set(d, (id = nextDocId++));
  return id;
};

/**
 * Drives the heatmap worker. Mount once (see <HeatmapDriver/>): it watches the scene store and
 * recomputes when the doc / level / band / source changes (immediately) and when agents move
 * (at most 4x/s, and only when some agent actually changed cell). Only the newest request is
 * ever sent: while one is in flight further changes just mark it dirty, then a fresh snapshot is
 * taken — stale requests are dropped, never queued.
 */
function useHeatmapDriver(): void {
  useEffect(() => {
    const worker = new Worker(new URL('./heatmap.worker.ts', import.meta.url), { type: 'module' });
    const api = Comlink.wrap<HeatmapWorkerApi>(worker);

    let disposed = false;
    let inFlight = false;
    let dirty = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastSentAt = 0;
    let sentDoc: SceneDoc | null = null;
    let lastBaseSig = '';
    let lastSig = '';
    let warned = false;

    const snapshot = () => {
      const s = useSceneStore.getState();
      if (!s.heatmap.enabled && s.mode !== 'monitor') return null; // nobody is looking at it
      const level = s.doc.levels.find((l) => l.id === s.activeLevelId);
      if (!level) return null;
      const source: 'best' | Id = s.doc.radios.some((r) => r.id === s.heatmap.source) ? s.heatmap.source : 'best';
      const world = sampleWorld(s.doc, plansFor(s.doc), simClockRef.t);
      const agents: RfAgent[] = world.map((a) => ({ agentId: a.agentId, position: a.position, posture: a.posture }));
      const baseSig = `${docId(s.doc)}|${level.id}|${s.heatmap.band}|${source}`;
      // Agents that only wiggle inside a cell would not change much: bucket to 0.1 m.
      const agentSig = agents.map((a) => `${a.position[0].toFixed(1)},${a.position[1].toFixed(1)},${a.position[2].toFixed(1)},${a.posture[0]}`).join(';');
      return { s, level, source, agents, baseSig, sig: `${baseSig}#${agentSig}` };
    };

    const run = async () => {
      timer = null;
      if (disposed) return;
      if (inFlight) {
        dirty = true;
        return;
      }
      const snap = snapshot();
      if (!snap || snap.sig === lastSig) return;
      lastSig = snap.sig;
      lastBaseSig = snap.baseSig;
      lastSentAt = performance.now();
      inFlight = true;
      const req: HeatmapRequest = {
        doc: sentDoc === snap.s.doc ? null : snap.s.doc,
        levelId: snap.level.id,
        band: snap.s.heatmap.band,
        source: snap.source,
        agents: snap.agents,
      };
      sentDoc = snap.s.doc;
      try {
        const res = await api.compute(req);
        if (!disposed) {
          useHeatmapStore.setState({ heatmap: res.heatmap, coverage: res.coverage, ms: res.ms });
          if (import.meta.env.DEV && !warned && res.ms > SLOW_MS) {
            warned = true;
            console.warn(`[heatmap] compute took ${res.ms.toFixed(0)} ms (> ${SLOW_MS} ms budget)`);
          }
        }
      } catch (e) {
        lastSig = ''; // let the next change retry
        sentDoc = null; // and re-send the doc: the worker may not have received it
        if (!disposed) console.warn('[heatmap] worker failed', e);
      } finally {
        inFlight = false;
        if (dirty && !disposed) {
          dirty = false;
          schedule();
        }
      }
    };

    const schedule = () => {
      if (disposed || timer !== null) return;
      const snap = snapshot();
      // Structural changes (edit, level, band, source) go out at once; pure agent motion is throttled.
      const urgent = snap !== null && snap.baseSig !== lastBaseSig;
      const wait = urgent ? 0 : Math.max(0, lastSentAt + MIN_INTERVAL_MS - performance.now());
      timer = setTimeout(run, wait);
    };

    schedule();
    const unsubscribe = useSceneStore.subscribe((s, prev) => {
      if (
        s.doc !== prev.doc ||
        s.activeLevelId !== prev.activeLevelId ||
        s.heatmap !== prev.heatmap ||
        s.mode !== prev.mode ||
        s.sim.t !== prev.sim.t
      ) {
        schedule();
      }
    });

    return () => {
      disposed = true;
      unsubscribe();
      if (timer) clearTimeout(timer);
      api[Comlink.releaseProxy]();
      worker.terminate();
    };
  }, []);
}

/** Renders nothing; mount once near the app root. */
export function HeatmapDriver(): null {
  useHeatmapDriver();
  return null;
}

/**
 * The heatmap result that is valid for what is on screen (right level and band), or null while a
 * recompute for a just-changed level/band is still pending. Always the latest worker output.
 */
export function useHeatmap() {
  const result = useHeatmapStore((s) => s.heatmap);
  const coverage = useHeatmapStore((s) => s.coverage);
  const levelId = useSceneStore((s) => s.activeLevelId);
  const band = useSceneStore((s) => s.heatmap.band);
  const valid = result !== null && result.levelId === levelId && result.band === band;
  return { heatmap: valid ? result : null, coverage: valid ? coverage : [], pending: !valid };
}
