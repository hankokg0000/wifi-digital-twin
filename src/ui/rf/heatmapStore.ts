import { create } from 'zustand';
import type { Heatmap, RoomCoverage } from '../../core';

interface HeatmapResult {
  /** Latest worker result; null until the first one arrives. */
  heatmap: Heatmap | null;
  coverage: RoomCoverage[];
  /** Worker compute time of the latest result, ms. */
  ms: number;
}

/** Latest heatmap result. Separate from the scene store: it is derived, large and never saved. */
export const useHeatmapStore = create<HeatmapResult>()(() => ({ heatmap: null, coverage: [], ms: 0 }));

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __heatmapStore: typeof useHeatmapStore }).__heatmapStore = useHeatmapStore;
}
