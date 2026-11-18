import { describe, it, expect } from 'vitest';
import { validateDoc } from '../scene/validate';
import { bandForChannel, quickRoomDoc, LINK_TX_POWER_DBM, DEVICE_HEIGHT_M } from './quickRoom';
import type { Site } from './sites';

const baseSite = (overrides: Partial<Site> = {}): Site => ({
  id: 'site-abc',
  name: 'Lab',
  widthM: 8,
  lengthM: 6,
  createdAt: '2026-01-01T00:00:00.000Z',
  devices: { tx: null, rx: null },
  network: null,
  ...overrides,
});

const noDevices = baseSite();
const bothDevices = baseSite({ devices: { tx: [1, 2], rx: [5, 4] } });
const txOnly = baseSite({ devices: { tx: [1, 2], rx: null } });

describe('quickRoomDoc', () => {
  it('produces a doc with no validation issues (no devices)', () => {
    expect(validateDoc(quickRoomDoc(noDevices))).toEqual([]);
  });

  it('produces a doc with no validation issues (both devices, channel 36)', () => {
    expect(validateDoc(quickRoomDoc(bothDevices, 36))).toEqual([]);
  });

  it('produces a doc with no validation issues for a null site', () => {
    expect(validateDoc(quickRoomDoc(null))).toEqual([]);
  });

  it('uses deterministic ids derived from the site id, identical across calls', () => {
    const first = quickRoomDoc(bothDevices, 36);
    const second = quickRoomDoc(bothDevices, 36);
    expect(first.levels.map((l) => l.id)).toEqual(['site-abc-level']);
    expect(first.rooms.map((r) => r.id)).toEqual(['site-abc-room']);
    expect(first.walls.map((w) => w.id)).toEqual([
      'site-abc-wall-n',
      'site-abc-wall-e',
      'site-abc-wall-s',
      'site-abc-wall-w',
    ]);
    expect(first.zones.map((z) => z.id)).toEqual(['site-abc-zone']);
    expect(first.radios.map((r) => r.id)).toEqual(['site-abc-live-tx', 'site-abc-live-rx']);
    expect(second).toEqual(first);
  });

  it('has exactly 4 walls, all drywall, forming the room outline', () => {
    const doc = quickRoomDoc(noDevices);
    expect(doc.walls.length).toBe(4);
    expect(doc.walls.map((w) => w.materialId)).toEqual(['drywall', 'drywall', 'drywall', 'drywall']);
    expect(doc.walls.map((w) => [w.a, w.b])).toEqual([
      [[0, 0], [8, 0]],
      [[8, 0], [8, 6]],
      [[8, 6], [0, 6]],
      [[0, 6], [0, 0]],
    ]);
  });

  it('room polygon is the site rectangle and camera is not allowed', () => {
    const room = quickRoomDoc(noDevices).rooms[0]!;
    expect(room.polygon).toEqual([
      [0, 0],
      [8, 0],
      [8, 6],
      [0, 6],
    ]);
    expect(room.cameraAllowed).toBe(false);
  });

  it('has exactly one zone bound to the room, applying to any occupant', () => {
    const doc = quickRoomDoc(noDevices);
    expect(doc.zones.length).toBe(1);
    expect(doc.zones[0]!.roomId).toBe('site-abc-room');
    expect(doc.zones[0]!.appliesTo).toBe('any');
  });

  it('places no radios when no devices are set', () => {
    expect(quickRoomDoc(noDevices).radios).toEqual([]);
  });

  it('places only the transmitter AP when only tx is set', () => {
    const radios = quickRoomDoc(txOnly).radios;
    expect(radios.length).toBe(1);
    expect(radios[0]!.id).toBe('site-abc-live-tx');
    expect(radios[0]!.role).toBe('ap');
    expect(radios[0]!.position).toEqual([1, DEVICE_HEIGHT_M, 2]);
  });

  it('places tx as AP and rx as client at [x, 0.9, z] when both are set', () => {
    const radios = quickRoomDoc(bothDevices, 36).radios;
    expect(radios.map((r) => [r.id, r.role, r.position])).toEqual([
      ['site-abc-live-tx', 'ap', [1, 0.9, 2]],
      ['site-abc-live-rx', 'client', [5, 0.9, 4]],
    ]);
  });

  it('uses the given channel and its band on the radio interface', () => {
    const radios = quickRoomDoc(bothDevices, 36).radios;
    expect(radios[0]!.ifaces).toEqual([{ band: '5', channel: 36, txPowerDbm: LINK_TX_POWER_DBM }]);
    expect(radios[1]!.ifaces).toEqual([{ band: '5', channel: 36, txPowerDbm: 15 }]);
  });

  it('defaults the interface to channel 6 on 2.4 GHz when no channel is given', () => {
    const radios = quickRoomDoc(bothDevices).radios;
    expect(radios[0]!.ifaces).toEqual([{ band: '2.4', channel: 6, txPowerDbm: 15 }]);
  });

  it('has no agents and an empty population', () => {
    const doc = quickRoomDoc(bothDevices, 36);
    expect(doc.agents).toEqual([]);
    expect(doc.population).toEqual({ people: 0, pets: 0, fallsPerHour: 0 });
  });

  it('a null site yields an empty doc with no walls, rooms or radios', () => {
    const doc = quickRoomDoc(null);
    expect(doc.walls).toEqual([]);
    expect(doc.rooms).toEqual([]);
    expect(doc.radios).toEqual([]);
  });
});

describe('bandForChannel', () => {
  it('maps channel 36 to 5 GHz', () => {
    expect(bandForChannel(36)).toBe('5');
  });

  it('maps channel 15 (first above 14) to 5 GHz', () => {
    expect(bandForChannel(15)).toBe('5');
  });

  it('maps channel 14 to 2.4 GHz', () => {
    expect(bandForChannel(14)).toBe('2.4');
  });

  it('maps channel 6 to 2.4 GHz', () => {
    expect(bandForChannel(6)).toBe('2.4');
  });

  it('maps an unknown (null) channel to 2.4 GHz', () => {
    expect(bandForChannel(null)).toBe('2.4');
  });
});
