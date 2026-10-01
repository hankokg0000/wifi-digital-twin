import { create } from 'zustand';
import type { SignalQuality } from '../../core';

export interface ProbeRow {
  radioId: string;
  name: string;
  band: '2.4' | '5';
  dbm: number;
  quality: SignalQuality;
}

export interface ProbeData {
  roomName: string | null;
  rows: ProbeRow[];
  /** The link the obstruction list belongs to (the chosen source, else the strongest AP). */
  linkName: string;
  distance: number;
  /** Same-named obstructions merged ("ผนังอิฐ ×2"), biggest loss first. */
  obstructions: { name: string; count: number; lossDb: number }[];
}

interface ProbeState {
  /** Cursor position in px, relative to the canvas, plus the canvas size (for edge flipping). */
  at: { x: number; y: number; w: number; h: number } | null;
  data: ProbeData | null;
}

export const useProbeStore = create<ProbeState>()(() => ({ at: null, data: null }));
