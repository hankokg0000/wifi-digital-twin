// Deterministic PRNG for agent simulation — design.md §7.1. Same doc.seed + agent id always
// produces the same stream, independent of the order agents are planned in.

/** mulberry32: small, fast, decent-quality 32-bit seeded PRNG. Returns a function yielding [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash to a 32-bit unsigned int, used to derive a per-agent seed. */
function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** PRNG for one agent: combines the doc-level seed with a hash of the agent id, so agents
 * are independent of each other and of array ordering. */
export function rngFor(docSeed: number, agentId: string): () => number {
  const combined = ((docSeed >>> 0) ^ hashId(agentId)) >>> 0;
  return mulberry32(combined);
}
