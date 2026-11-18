import { describe, it, expect } from 'vitest';
import { parseSitesFile, activeSite, devicesKey, newSiteId, type Site, type SitesFile } from './sites';

const site = (overrides: Partial<Site> = {}): Site => ({
  id: 'site-a',
  name: 'Lab',
  widthM: 8,
  lengthM: 6,
  createdAt: '2026-01-01T00:00:00.000Z',
  devices: { tx: [1, 2], rx: [5, 4] },
  network: { gateway: '192.168.1.1', channel: 36 },
  ...overrides,
});

const file = (sites: unknown[], activeSiteId: unknown = null): unknown => ({ version: 1, activeSiteId, sites });

describe('parseSitesFile', () => {
  it('round-trips a valid SitesFile unchanged', () => {
    const input: SitesFile = {
      version: 1,
      activeSiteId: 'site-a',
      sites: [
        site(),
        site({ id: 'site_B-2', name: 'Home', devices: { tx: null, rx: [-3.5, 0] }, network: { gateway: null, channel: null } }),
      ],
    };
    expect(parseSitesFile(JSON.parse(JSON.stringify(input)))).toEqual(input);
  });

  it('accepts an id of exactly 64 characters', () => {
    expect(parseSitesFile(file([site({ id: 'a'.repeat(64) })]))?.sites.length).toBe(1);
  });

  it('rejects an id containing a space', () => {
    expect(parseSitesFile(file([site({ id: 'site a' })]))).toBeNull();
  });

  it('rejects an id of 65 characters', () => {
    expect(parseSitesFile(file([site({ id: 'a'.repeat(65) })]))).toBeNull();
  });

  it('rejects a name that is empty after trimming', () => {
    expect(parseSitesFile(file([site({ name: '   ' })]))).toBeNull();
  });

  it('rejects a name of 41 characters', () => {
    expect(parseSitesFile(file([site({ name: 'a'.repeat(41) })]))).toBeNull();
  });

  it('accepts a name of exactly 40 characters', () => {
    expect(parseSitesFile(file([site({ name: 'a'.repeat(40) })]))?.sites[0]?.name).toBe('a'.repeat(40));
  });

  it('rejects widthM below the 1 m minimum (0.5)', () => {
    expect(parseSitesFile(file([site({ widthM: 0.5 })]))).toBeNull();
  });

  it('rejects widthM above the 30 m maximum (31)', () => {
    expect(parseSitesFile(file([site({ widthM: 31 })]))).toBeNull();
  });

  it('rejects lengthM of NaN', () => {
    expect(parseSitesFile(file([site({ lengthM: NaN })]))).toBeNull();
  });

  it('rejects lengthM of Infinity', () => {
    expect(parseSitesFile(file([site({ lengthM: Infinity })]))).toBeNull();
  });

  it('rejects a device with a non-finite coordinate', () => {
    expect(parseSitesFile(file([site({ devices: { tx: [NaN, 1], rx: null } })]))).toBeNull();
  });

  it('rejects a device coordinate with |v| > 60', () => {
    expect(parseSitesFile(file([site({ devices: { tx: [61, 0], rx: null } })]))).toBeNull();
  });

  it('accepts a device coordinate of exactly -60', () => {
    expect(parseSitesFile(file([site({ devices: { tx: [-60, 0], rx: null } })]))?.sites[0]?.devices.tx).toEqual([-60, 0]);
  });

  it('rejects more than 50 sites', () => {
    const sites = Array.from({ length: 51 }, (_, i) => site({ id: `site-${i}` }));
    expect(parseSitesFile(file(sites))).toBeNull();
  });

  it('accepts exactly 50 sites', () => {
    const sites = Array.from({ length: 50 }, (_, i) => site({ id: `site-${i}` }));
    expect(parseSitesFile(file(sites))?.sites.length).toBe(50);
  });

  it('rejects non-object input', () => {
    expect(parseSitesFile(null)).toBeNull();
    expect(parseSitesFile('sites')).toBeNull();
    expect(parseSitesFile([])).toBeNull();
  });

  it('rejects version other than 1', () => {
    expect(parseSitesFile({ version: 2, activeSiteId: null, sites: [] })).toBeNull();
  });

  it('rejects a file where any one site is invalid', () => {
    expect(parseSitesFile(file([site(), site({ id: 'site b' })]))).toBeNull();
  });

  it('trims site names', () => {
    expect(parseSitesFile(file([site({ name: '  Lab  ' })]))?.sites[0]?.name).toBe('Lab');
  });

  it('turns a dangling activeSiteId into null', () => {
    expect(parseSitesFile(file([site()], 'missing'))?.activeSiteId).toBeNull();
  });

  it('keeps a valid activeSiteId', () => {
    expect(parseSitesFile(file([site()], 'site-a'))?.activeSiteId).toBe('site-a');
  });

  it('treats a network-less site as network null', () => {
    const { network: _omitted, ...raw } = site();
    expect(parseSitesFile(file([raw]))?.sites[0]?.network).toBeNull();
  });
});

describe('activeSite', () => {
  it('returns the site matching activeSiteId', () => {
    const a = site({ id: 'site-a' });
    const b = site({ id: 'site-b' });
    expect(activeSite({ version: 1, activeSiteId: 'site-b', sites: [a, b] })).toBe(b);
  });

  it('returns null for a null file', () => {
    expect(activeSite(null)).toBeNull();
  });

  it('returns null when activeSiteId is null', () => {
    expect(activeSite({ version: 1, activeSiteId: null, sites: [site()] })).toBeNull();
  });
});

describe('devicesKey', () => {
  it('rounds coordinates to 0.01 m as "x,z|x,z"', () => {
    // 1.234 -> 1.23, 4.567 -> 4.57 (Math.round(n * 100) / 100)
    expect(devicesKey(site({ devices: { tx: [1.234, 4.567], rx: [10, -2.5] } }))).toBe('1.23,4.57|10,-2.5');
  });

  it('returns "" when tx is missing', () => {
    expect(devicesKey(site({ devices: { tx: null, rx: [1, 1] } }))).toBe('');
  });

  it('returns "" when rx is missing', () => {
    expect(devicesKey(site({ devices: { tx: [1, 1], rx: null } }))).toBe('');
  });
});

describe('newSiteId', () => {
  it('formats as site-<base36 ms>', () => {
    expect(newSiteId(0)).toBe('site-0');
    expect(newSiteId(1295)).toBe('site-zz');
    expect(newSiteId(1000)).toBe('site-rs');
  });
});
