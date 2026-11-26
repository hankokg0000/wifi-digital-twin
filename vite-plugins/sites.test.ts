import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { IncomingHttpHeaders } from 'node:http';
import { isLocalWrite, createSitesStore } from './sites';
import { EMPTY_SITES, type SitesFile } from '../src/core/live/sites';

const local = (extra: Record<string, string> = {}): IncomingHttpHeaders => ({ host: 'localhost:5173', ...extra });

describe('isLocalWrite', () => {
  it('accepts a loopback host name with port', () => {
    expect(isLocalWrite({ host: 'localhost:5173' })).toBe(true);
  });

  it('accepts 127.0.0.1', () => {
    expect(isLocalWrite({ host: '127.0.0.1' })).toBe(true);
  });

  it('accepts bracketed IPv6 loopback with port', () => {
    expect(isLocalWrite({ host: '[::1]:5173' })).toBe(true);
  });

  it('accepts localhost when Origin is also localhost', () => {
    expect(isLocalWrite(local({ origin: 'http://localhost:5173' }))).toBe(true);
  });

  it('rejects a tunnel host name', () => {
    expect(isLocalWrite({ host: 'abc.ngrok-free.app' })).toBe(false);
  });

  it('rejects a request carrying x-forwarded-for', () => {
    expect(isLocalWrite(local({ 'x-forwarded-for': '203.0.113.5' }))).toBe(false);
  });

  it('rejects a request carrying x-forwarded-host', () => {
    expect(isLocalWrite(local({ 'x-forwarded-host': 'abc.ngrok-free.app' }))).toBe(false);
  });

  it('rejects a request carrying the standard forwarded header', () => {
    expect(isLocalWrite(local({ forwarded: 'for=203.0.113.5' }))).toBe(false);
  });

  it('rejects a request carrying an ngrok-* header', () => {
    expect(isLocalWrite(local({ 'ngrok-skip-browser-warning': 'true' }))).toBe(false);
  });

  it('rejects a foreign Origin even with a localhost Host', () => {
    expect(isLocalWrite(local({ origin: 'https://evil.example' }))).toBe(false);
  });

  it('rejects a request with no host header', () => {
    expect(isLocalWrite({})).toBe(false);
  });
});

describe('createSitesStore', () => {
  const roots: string[] = [];
  const makeRoot = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wdt-sites-'));
    roots.push(dir);
    return dir;
  };

  const valid: SitesFile = {
    version: 1,
    activeSiteId: 'site-a',
    sites: [
      {
        id: 'site-a',
        name: 'Lab',
        widthM: 8,
        lengthM: 6,
        createdAt: '2026-01-01T00:00:00.000Z',
        devices: { tx: [1, 2], rx: null },
        network: null,
      },
    ],
  };

  afterEach(() => {
    for (const dir of roots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('get() on a missing file returns EMPTY_SITES', () => {
    const store = createSitesStore(makeRoot());
    expect(store.get()).toEqual(EMPTY_SITES);
  });

  it('put(valid) returns the parsed file and writes .wdt-data/sites.json', () => {
    const root = makeRoot();
    const store = createSitesStore(root);
    expect(store.put(valid)).toEqual(valid);
    const written = JSON.parse(fs.readFileSync(path.join(root, '.wdt-data', 'sites.json'), 'utf8'));
    expect(written).toEqual(valid);
  });

  it('a new store on the same root reads back the saved file', () => {
    const root = makeRoot();
    createSitesStore(root).put(valid);
    expect(createSitesStore(root).get()).toEqual(valid);
  });

  it('put(invalid) returns null and leaves the file unchanged', () => {
    const root = makeRoot();
    const store = createSitesStore(root);
    store.put(valid);
    const file = path.join(root, '.wdt-data', 'sites.json');
    const before = fs.readFileSync(file, 'utf8');
    expect(store.put({ version: 1, activeSiteId: null, sites: [{ id: 'bad id' }] })).toBeNull();
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
    expect(store.get()).toEqual(valid);
  });

  it('corrupt JSON on disk makes get() return EMPTY_SITES', () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, '.wdt-data'), { recursive: true });
    fs.writeFileSync(path.join(root, '.wdt-data', 'sites.json'), '{not json');
    expect(createSitesStore(root).get()).toEqual(EMPTY_SITES);
  });
});
