import { describe, it, expect } from 'vitest';
import { populate } from './populate';
import { sampleHouse } from '../scene/sample-house';
import type { Agent } from '../scene/types';

const PERSON_POOL = ['Alex', 'Emma', 'Noah', 'Olivia', 'Liam', 'Mia', 'Ethan', 'Sophia', 'Lucas', 'Ava', 'Ben', 'Chloe'];
const PET_NAME_RE = /^(Milo|Luna|Oliver|Cleo|Max|Bella|Charlie|Daisy)( \d+)?$/;
const THAI_RE = /[฀-๿]/;

// 14 people (wraps past the 12-name pool: 13th = "Alex 2", 14th = "Emma 2") and 4 pets
// (cat, dog, cat, dog => Milo, Max, Luna, Bella), no falls so only names matter here.
const SETTINGS = { people: 14, pets: 4, fallsPerHour: 0 };

function names(agents: readonly Agent[], kind: Agent['kind']): string[] {
  return agents.filter((a) => a.kind === kind).map((a) => a.name);
}

describe('populate names', () => {
  const doc = populate(sampleHouse(), SETTINGS, 1);

  it('gives people the exact expected names in spawn order, with a numeric suffix after the pool wraps', () => {
    expect(names(doc.agents, 'person')).toEqual([
      'Alex', 'Emma', 'Noah', 'Olivia', 'Liam', 'Mia', 'Ethan', 'Sophia', 'Lucas', 'Ava', 'Ben', 'Chloe',
      'Alex 2', 'Emma 2',
    ]);
  });

  it('gives every person a name from the person pool, optionally with a " N" suffix', () => {
    const personRe = new RegExp(`^(${PERSON_POOL.join('|')})( \\d+)?$`);
    for (const n of names(doc.agents, 'person')) {
      expect(n).toMatch(personRe);
    }
  });

  it('gives pets the exact expected names: cats and dogs alternate from their own pools', () => {
    expect(names(doc.agents, 'pet')).toEqual(['Milo', 'Max', 'Luna', 'Bella']);
  });

  it('gives every pet a name matching the pet pattern', () => {
    for (const n of names(doc.agents, 'pet')) {
      expect(n).toMatch(PET_NAME_RE);
    }
  });

  it('contains no Thai characters in any agent name', () => {
    for (const a of doc.agents) {
      expect(a.name).not.toMatch(THAI_RE);
    }
  });

  it('gives every agent a unique name within one run', () => {
    const all = doc.agents.map((a) => a.name);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(18);
  });

  it('keeps names unique past the cat pool wrap as well', () => {
    const big = populate(sampleHouse(), { people: 0, pets: 10, fallsPerHour: 0 }, 7);
    // pets 0,2,4,6,8 are cats: Milo, Luna, Oliver, Cleo, then Milo 2; dogs 1,3,5,7,9: Max, Bella, Charlie, Daisy, Max 2
    expect(names(big.agents, 'pet')).toEqual([
      'Milo', 'Max', 'Luna', 'Bella', 'Oliver', 'Charlie', 'Cleo', 'Daisy', 'Milo 2', 'Max 2',
    ]);
    expect(names(big.agents, 'pet')).toHaveLength(new Set(names(big.agents, 'pet')).size);
  });
});
