// Heatmap compute off the main thread (design.md §4/§5). Comlink-exposed; one request at a time.
import * as Comlink from 'comlink';
import { computeHeatmap, roomCoverage, type Band, type Heatmap, type Id, type RfAgent, type RoomCoverage, type SceneDoc } from '../../core';

export interface HeatmapRequest {
  /** The doc to use; null = "same doc as the previous request" (saves re-cloning it 4x/s). */
  doc: SceneDoc | null;
  levelId: Id;
  band: Band;
  source: 'best' | Id;
  agents: RfAgent[];
}

export interface HeatmapResponse {
  heatmap: Heatmap;
  coverage: RoomCoverage[];
  /** Compute time inside the worker, ms. */
  ms: number;
}

let lastDoc: SceneDoc | null = null;

const api = {
  compute(req: HeatmapRequest): HeatmapResponse {
    if (req.doc) lastDoc = req.doc;
    if (!lastDoc) throw new Error('heatmap worker: no doc yet');
    const start = performance.now();
    const heatmap = computeHeatmap(lastDoc, { levelId: req.levelId, band: req.band, source: req.source, agents: req.agents });
    const coverage = roomCoverage(lastDoc, heatmap);
    const ms = performance.now() - start;
    return Comlink.transfer({ heatmap, coverage, ms }, [heatmap.values.buffer, heatmap.bestRadio.buffer]);
  },
};

export type HeatmapWorkerApi = typeof api;
Comlink.expose(api);
