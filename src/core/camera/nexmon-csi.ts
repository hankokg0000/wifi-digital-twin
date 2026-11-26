// Nexmon's current BCM43455c0 payload: 18-byte header and 64 int16 I/Q pairs at 20 MHz.
const HEADER_BYTES = 18;
const SUBCARRIERS = 64;

export function parseNexmonCsi(packet: Uint8Array) {
  if (packet.byteLength !== HEADER_BYTES + SUBCARRIERS * 4) return null;
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const channel = view.getUint16(14, true);
  if (view.getUint16(0, true) !== 0x1111 || view.getUint16(16, true) !== 0x4345 ||
      (channel & 0x3800) !== 0x1000) return null;
  const peer = Array.from(packet.subarray(4, 10), value => value.toString(16).padStart(2, '0')).join(':');
  if (peer === '00:00:00:00:00:00' || (packet[4]! & 1)) return null;
  const stream = view.getUint16(12, true) & 0x3f;
  let power = 0;
  let pairs = 0;
  for (let tone = 0; tone < SUBCARRIERS; tone++) {
    // Ignore the edges and the unused center bins, where Nexmon inserts PHY metadata.
    if (tone < 4 || tone >= 60 || (tone >= 28 && tone < 36)) continue;
    const offset = HEADER_BYTES + tone * 4;
    power += view.getInt16(offset, true) ** 2 + view.getInt16(offset + 2, true) ** 2;
    pairs++;
  }
  return power > 0 ? { peer, key: `nexmon/${peer}/${channel}/${stream}`, power: 10 * Math.log10(power / pairs) } : null;
}
