import { expect, it } from 'vitest';
import { createCsiTracker } from './csi-monitor';
import { parseNexmonCsi } from './nexmon-csi';

function packet(i: number, q: number) {
  const payload = new Uint8Array(18 + 64 * 4);
  const fields = new DataView(payload.buffer);
  fields.setUint16(0, 0x1111, true);
  fields.setInt8(2, -68);
  payload.set([0x02, 0x34, 0xab, 0x50, 0x90, 0xff], 4);
  fields.setUint16(10, 31, true);
  fields.setUint16(12, 0b1000, true);
  fields.setUint16(14, 0x1006, true);
  fields.setUint16(16, 0x4345, true);
  for (let tone = 0; tone < 64; tone++) {
    const used = (tone >= 4 && tone < 28) || (tone >= 36 && tone < 60);
    fields.setInt16(18 + tone * 4, used ? i : 8191, true);
    fields.setInt16(20 + tone * 4, used ? q : -8192, true);
  }
  return { payload, fields };
}

it('reads signed I/Q and ignores RSSI, guard bins and PHY metadata', () => {
  const { payload } = packet(-6, 8);
  expect(parseNexmonCsi(payload)).toEqual({ peer: '02:34:ab:50:90:ff', key: 'nexmon/02:34:ab:50:90:ff/4102/8', power: 20 });
});

it('rejects incomplete, unsupported, or empty CSI payloads', () => {
  const { payload, fields } = packet(3, 4);
  expect(parseNexmonCsi(payload.subarray(0, -1))).toBe(null);
  fields.setUint16(16, 0x4358, true);
  expect(parseNexmonCsi(payload)).toBe(null);
  expect(parseNexmonCsi(packet(0, 0).payload)).toBe(null);
});

it('uses one Wi-Fi peer and one channel/stream during baseline capture', () => {
  const tracker = createCsiTracker('02:34:ab:50:90:ff');
  const quiet = parseNexmonCsi(packet(-6, 8).payload)!;
  const otherStream = packet(60, 80);
  otherStream.fields.setUint16(12, 16, true);
  const other = parseNexmonCsi(otherStream.payload)!;
  tracker.acceptSample({ ...quiet, peer: '02:34:ab:50:90:00' }, 500);
  expect(tracker.status(500).readings).toEqual([]);
  tracker.acceptSample(quiet, 1_000);
  expect(tracker.baseline(1_000)).toBe(true);
  for (let time = 1_100; time <= 16_000; time += 100) {
    tracker.acceptSample(other, time - 1);
    tracker.acceptSample(quiet, time);
  }
  expect(tracker.status(16_000)).toMatchObject({ state: 'idle', baseline: { meanRssi: 20, samples: 150 } });
});
