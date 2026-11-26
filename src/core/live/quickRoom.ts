import type { Band, Level, Radio, Room, SceneDoc, Wall, Zone } from '../scene/types';
import { createEmptyDoc } from '../scene/doc';
import type { Site } from './sites';

export const DEVICE_HEIGHT_M = 0.9;
export const LINK_TX_POWER_DBM = 15;
export const QUICK_WALL_MATERIAL = 'drywall';
const WALL_THICKNESS_M = 0.1;
const WALL_HEIGHT_M = 2.6;
const LEVEL_HEIGHT_M = 2.8;

/** 5 GHz for channels above 14; unknown → 2.4. */
export function bandForChannel(ch: number | null): Band {
  return ch !== null && ch > 14 ? '5' : '2.4';
}

/**
 * Deterministic single-room doc standing in for a Site's floor plan. Same inputs → same ids, so
 * the Live Link can be found again by radio id suffix (`-live-tx` / `-live-rx`).
 */
export function quickRoomDoc(site: Site | null, channel?: number | null): SceneDoc {
  const doc = createEmptyDoc();
  if (!site) {
    return { ...doc, levels: [{ ...doc.levels[0]!, id: 'live-empty-level' }] };
  }
  const id = site.id;
  const levelId = `${id}-level`;
  const roomId = `${id}-room`;
  const level: Level = { id: levelId, name: 'ชั้น 1', elevation: 0, height: LEVEL_HEIGHT_M, slabMaterialId: 'concrete-slab' };
  const w = site.widthM;
  const l = site.lengthM;
  const poly: [number, number][] = [
    [0, 0],
    [w, 0],
    [w, l],
    [0, l],
  ];
  const room: Room = { id: roomId, levelId, name: site.name, polygon: poly, cameraAllowed: false };
  const names = ['n', 'e', 's', 'w'];
  const walls: Wall[] = poly.map((a, i) => ({
    id: `${id}-wall-${names[i]!}`,
    levelId,
    a,
    b: poly[(i + 1) % 4]!,
    thickness: WALL_THICKNESS_M,
    height: WALL_HEIGHT_M,
    materialId: QUICK_WALL_MATERIAL,
  }));
  const zone: Zone = {
    id: `${id}-zone`,
    name: `เฝ้า ${site.name}`,
    levelId,
    roomId,
    polygon: [],
    appliesTo: 'any',
    enabled: true,
  };
  const band = bandForChannel(channel ?? null);
  const iface = { band, channel: channel ?? 6, txPowerDbm: LINK_TX_POWER_DBM };
  const radios: Radio[] = [];
  const { tx, rx } = site.devices;
  if (tx) {
    radios.push({ id: `${id}-live-tx`, levelId, name: 'Hotspot (Transmitter)', role: 'ap', position: [tx[0], DEVICE_HEIGHT_M, tx[1]], ifaces: [{ ...iface }], antennaGainDbi: 0 });
  }
  if (rx) {
    radios.push({ id: `${id}-live-rx`, levelId, name: 'Mac (Receiver)', role: 'client', position: [rx[0], DEVICE_HEIGHT_M, rx[1]], ifaces: [{ ...iface }], antennaGainDbi: 0 });
  }
  return { ...doc, levels: [level], walls, rooms: [room], zones: [zone], radios };
}
