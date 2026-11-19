# Plan — Live Link, Sites, Quick Room, Calibration, Diagnostics (branch feature/live-link)

Use CONTEXT.md terms. Requirements were agreed with the project owner in a grilling session
(see docs/HANDOFF.md §5); this file is the implementation plan.

**Status (2026-11-19):** Phase 1 ✅ committed `694f7f0` · Phase 2 🟡 code written, uncommitted,
not yet verified in a browser, no tests · Phase 3 ⬜ not started.

Phase 1 deviations already in the code: the "ของจริง / จำลอง" switch lives in `.topbar-left`
(the right cluster overflows the centre column below ~1100 px); in real mode zones, Legend,
SignalPanel and Timeline are hidden and the timeline grid row is removed
(`.app[data-reality='real']`); TopBar shows `reality` (not `wantReal`); LiveDriver clears
`wantReal` when something else (เริ่มเดโม, File → open) leaves real mode.

## Cross-cutting decisions
- Real/sim = doc swap in store with stash (≈60 components read `useSceneStore(s => s.doc)`). docSlice gains `reality: 'sim'|'real'`, `simStash: {doc, past, future} | null`. `enterReal` stashes sim doc+history and shows the Site doc; `exitReal` restores. Autosave skipped while `reality==='real'` so persisted key `wifi-digital-twin:scene-doc` is never overwritten. Edit mode blocked in real. `wdt.reality.v1` stores only this browser's wish; after reload re-enter real once Sites arrive.
- Persistence: server `<root>/.wdt-data/sites.json` (gitignored) = Sites + devices + network snapshot + activeSiteId, shared by all viewers. Per browser: reality wish, Baseline (unchanged), new BaselineContext (calibration offset + network snapshot).
- Site doc is derived, not stored: `quickRoomDoc(site)` builds deterministically from {width, length, devices, channel}, fixed ids `${site.id}-level|-room|-wall-n/e/s/w|-zone|-live-tx|-live-rx`. Live Link discovered from the doc (radio ids ending `-live-tx`/`-live-rx`) → sensingStore never imports the live store (no cycle). Sample house never matches → sim unchanged.
- Live Mirror in real: Link line + Coverage band glow on motion; crossed rooms glow faintly. Sim (no Live Link) keeps current RoomMesh behaviour.
- Constants: device height 0.9 m; hotspot tx 15 dBm; gain 0 dBi; band '5' if channel > 14 else '2.4' (unknown → '2.4'); walls `drywall`, thickness 0.1, height 2.6; level height 2.8.
- Blocking: drop = baseline mean − mean(last 1.5 s). <2 "ไม่บัง", 2–<5 "บังเล็กน้อย", 5–<10 "บังระดับกลาง", ≥10 "บังมาก". Never count people.

## Phase 1 — Quick Room, Sites, real/sim switch

### src/core/live/sites.ts (new; NO imports — the Vite plugin imports it too)
```ts
export type XZ = [x: number, z: number];
export interface SiteNetwork { gateway: string | null; channel: number | null }
export interface Site { id: string; name: string; widthM: number; lengthM: number; createdAt: string;
  devices: { tx: XZ | null; rx: XZ | null }; network: SiteNetwork | null }
export interface SitesFile { version: 1; activeSiteId: string | null; sites: Site[] }
export const EMPTY_SITES: SitesFile;
export const ROOM_MIN_M = 1, ROOM_MAX_M = 30, MAX_SITES = 50;
export function parseSitesFile(json: unknown): SitesFile | null;
export function newSiteId(nowMs: number): string;            // `site-${nowMs.toString(36)}`
export function activeSite(f: SitesFile | null): Site | null;
export function devicesKey(s: Site): string;                 // "x,z|x,z" rounded 0.01; "" if either missing
```
parseSitesFile: ids `/^[\w-]{1,64}$/`; name trimmed 1–40 chars; width/length finite within 1–30; device null or finite pair |v| ≤ 60; network optional; dangling activeSiteId → null; > 50 sites invalid; any failure → null.

### src/core/live/quickRoom.ts
```ts
export const DEVICE_HEIGHT_M = 0.9, LINK_TX_POWER_DBM = 15, QUICK_WALL_MATERIAL = 'drywall';
export function bandForChannel(ch: number | null): Band;
export function quickRoomDoc(site: Site | null, channel?: number | null): SceneDoc;
```
- From `createEmptyDoc()` materials. Level id `${id}-level` (or `live-empty-level` when site null → empty single-level doc).
- Room polygon [[0,0],[w,0],[w,l],[0,l]], name = site name, `cameraAllowed: false`. Four walls on edges.
- One zone `{roomId, appliesTo:'any', enabled:true, polygon:[]}` named `เฝ้า ${name}` (needed or `observedAlertFor` never raises an Observed alert).
- Placed devices → radios: tx role `ap` "Hotspot (Transmitter)", rx role `client` "Mac (Receiver)", position [x,0.9,z], ifaces [{band, channel: channel ?? 6, txPowerDbm: 15}], gain 0.
- No population/agents. Must pass `validateDoc`.
- `src/core/live/index.ts` re-exports; add `export * from './live'` in `src/core/index.ts`.

### Server persistence
- `vite-plugins/sites.ts` (new):
  - `isLocalWrite(headers: IncomingHttpHeaders): boolean` — true only if Host hostname ∈ {localhost, 127.0.0.1, [::1], ::1} (handle brackets, strip port) AND none of x-forwarded-for / x-forwarded-host / x-forwarded-proto / forwarded / x-real-ip / any `ngrok-*` header AND (if Origin present) Origin hostname is local.
  - `createSitesStore(root)` → `{ get(): SitesFile; put(body: unknown): SitesFile | null }`. Loads `.wdt-data/sites.json` (missing/invalid → EMPTY_SITES). Save: mkdir, write `sites.json.tmp`, rename.
- `vite-plugins/rssi.ts`: create store in configureServer; `sitesChunk()` = `event: sites\ndata: <json>\n\n`, written to each new SSE client right after `statusChunk()`. Middleware `/api/sites`: GET → JSON; PUT → 403 if !isLocalWrite, 413 if body > 256 KB, 400 if put returns null, else 200 + file and broadcast `send(sitesChunk())`; other → 405.
- `.gitignore` add `.wdt-data`. `tsconfig.node.json` include add `"src/core/live/sites.ts"` (composite → else TS6307).

### src/ui/live/liveStore.ts (zustand)
State: `sites: SitesFile | null` (null = not loaded / prod build), `wantReal: boolean` (`wdt.reality.v1`), `placing: null|'tx'|'rx'`, `draftTx: XZ|null`, `baselineContext` (P3), `diag` (P3), `saveError: string|null`.
Actions: `setWantReal(b)`; `putSites(next): Promise<void>` (PUT; 200 → set sites from response; failure → saveError 'บันทึกไม่ได้ — แก้ได้เฉพาะเครื่องที่รันเดโม'); `createQuickRoom(name,w,l)` (add + activate); `activateSite(id)`; `canWrite()` (location.hostname local).
SSE: in sensingStore.ts export `sseHandlers: { sites?: (d: unknown) => void }` and `es.addEventListener('sites', e => sseHandlers.sites?.(JSON.parse(e.data)))`. liveStore assigns the handler on module load, runs data through `parseSitesFile`.

### docSlice / store types
DocSlice adds `reality`, `simStash`, `enterReal(doc)` (stash; set doc; past/future empty; mode 'monitor'; clear selection; activeLevelId = first level; pause(); resetTime()), `replaceRealDoc(doc)` (real only; set doc + reconcileView), `exitReal()` (restore stash + reconcileView).
Guards: every `scheduleAutosave(...)` → `if (get().reality === 'sim') scheduleAutosave(...)`; `loadDoc` calls `exitReal()` first when real (covers startDemo + File menu); `setMode('edit')` no-op in real.

### src/ui/live/LiveDriver.tsx
Mounted in App beside SensingDriver. On mount GET /api/sites (fail → sites stays null). Effect on [wantReal, siteKey] (siteKey = JSON.stringify(activeSite) + channel): wantReal && sites → `enterReal(quickRoomDoc(site, ch))` or `replaceRealDoc` if already real; !wantReal && real → `exitReal()`.

### UI
- TopBar: Segmented "แหล่งข้อมูล" (`real` "ของจริง" / `sim` "จำลอง") → setWantReal. If `sites === null` clicking ของจริง → toast "ต้องรันด้วย pnpm dev". In real: hide Monitor/Edit control; brand-house shows site name or "ยังไม่มีห้อง"; hide FileMenu.
- App MonitorRails in real: hide OccupantsPanel, ZonesPanel, SimControls, Timeline; AlertsFeed `forcedFilter="observed"` and hide its filter control. "เริ่มเดโม" stays (leaves real via loadDoc).
- `src/ui/live/LiveSetup.tsx`: in SensingPanel above ConnectionLine when real. Site `<select>` → activateSite; "ห้องใหม่" → inline form name / กว้าง (m) / ยาว (m) (1–30, step 0.1) + สร้าง / ยกเลิก. Write buttons disabled when !canWrite() with title "แก้ได้เฉพาะเครื่องที่รันเดโม".
- `src/ui/canvas/bounds.ts`: houseBounds also includes radio x/z ± 0.5 m.

## Phase 2 — Placement, Live Link rendering, auto Monitored Room

### src/core/live/linkGeometry.ts
```ts
export interface LiveLink { levelId: Id; tx: Vec2; rx: Vec2; band: Band }
export function liveLinkOf(doc: SceneDoc): LiveLink | null;   // radios ids ending '-live-tx'/'-live-rx', same level
export function segmentLengthInPolygon(a: Vec2, b: Vec2, poly: Vec2[]): number;
export function roomsCrossed(rooms: Room[], a: Vec2, b: Vec2): { roomId: Id; lengthM: number }[]; // >0.01 m, longest first
export function autoMonitoredRoomId(rooms: Room[], a: Vec2, b: Vec2): Id | null;
export function coverageMidHalfWidth(distanceM: number, band: Band): number;  // clamp(0.5*sqrt(λ·D), 0.25, 0.5), λ = c / BAND_CENTER_MHZ
export function coverageBand(a: Vec2, b: Vec2, band: Band, samples = 16): Vec2[]; // lens: half-width H·sqrt(4t(1−t)); side A t=0..1, side B t=(N−1)/N..1/N; no duplicate tips
export function linkMidpoint(a: Vec2, b: Vec2): Vec2;
```
segmentLengthInPolygon: collect t of all edge intersections + 0,1; sort/dedupe; for each interval test midpoint with pointInPolygon; sum (t2−t1)·|ab| for inside (concave-safe).

### Placement
liveStore `startPlacement()` (placing 'tx', draftTx null); `placePoint(p)` snap 0.05 via snapVec2 — 1st click stores draftTx and placing 'rx'; 2nd click `putSites` with active site `devices:{tx: draftTx, rx: p}` and `network:{gateway, channel}` from sensingStore, placing null; `cancelPlacement()`.
LiveSetup button "วางตำแหน่งอุปกรณ์" (disabled with no active site or !canWrite()); while placing show hint "คลิกตำแหน่ง hotspot (Transmitter)" / "คลิกตำแหน่ง Mac (Receiver)" + ยกเลิก.
LevelGroup: render InteractionPlane when `placing && interactive` (in addition to edit); click → placePoint, right-click → cancel; draftTx marker = ring mesh. useKeyboardShortcuts: Escape also cancelPlacement().

### Monitored Room
`resolveMonitoredRoom(doc, id)`: saved id if in doc → else if liveLinkOf(doc) use autoMonitoredRoomId → else "ห้องนอนแขก" → else first room. `setMonitoredRoomId(id: string | null)`. Dropdown first option value '' "อัตโนมัติ (ห้องที่เส้นผ่านยาวสุด)" → null.

### Rendering
- `src/ui/canvas/LiveLinkLayer.tsx` rendered by LevelGroup when `link.levelId === level.id`. Band = shapeGeometry from coverageBand at y 0.05 (same −z trick as RoomMesh). Line = drei `<Line>` y 0.07 plan / 0.9 3D. Colour PALETTE.accent; useFrame eased material mutation (no React state). Connected idle: line opacity 0.5 width 2, band 0.08. Motion: line 1 / width 4, band 0.35 with sine pulse (static if reduced motion). Offline & not replaying: line ink3 dashed, band hidden.
- `src/ui/live/useLiveLink.ts`: `useLiveLink()` (memo liveLinkOf(doc)), `useCrossedRoomIds(): Set<Id>`.
- RoomMesh: with a Live Link, motion fill applies to every crossed room at opacity 0.12, no pulse (replaces monitored-room fill); monitored-room outline stays. No link → unchanged.

## Phase 3 — Calibration, diagnostics, blocking label

### Plugin + sensingStore
- Status payload adds `gateway: string | null` ('fake' in fake mode). Live mode polls defaultGateway() every 5 s; on change re-send status and restart ping to new gateway; clear timer in stop().
- sensingStore: state `gateway`, `noise` (from d.noise beside rssi); export `lastReadingAgeS(): number | null` from lastReadingWall. Reading type unchanged.

### src/core/live/calibration.ts
```ts
export function predictLinkRssi(doc: SceneDoc, link: LiveLink): { rssiDbm: number; obstructionLossDb: number; distanceM: number }; // traceLink, no agents, endpoints y=0.9
export function predictPersonDropDb(doc: SceneDoc, link: LiveLink): number; // temp person agent (r 0.2, h 1.7, 'human-body') at midpoint; without − with
export function calibrationOffsetDb(measuredMeanDbm: number, predictedDbm: number): number; // measured − predicted
export function estimateDistanceM(rssiDbm: number, band: Band, obstructionLossDb: number, txDbm = LINK_TX_POWER_DBM): number; // 10^((tx − obs − rssi − fsplAt1m(f)) / (10·PATH_LOSS_EXPONENT)), clamp 0.1..200
export function distanceRatio(estimatedM: number, planM: number): number | null; // max(e/p, p/e); null if planM < 0.1
export type BlockingLevel = 'none' | 'slight' | 'moderate' | 'heavy';
export const BLOCKING_TH: Record<BlockingLevel, string>;
export function blockingLevel(dropDb: number): BlockingLevel;
export function meanSince(rs: readonly Reading[], tFrom: number): number;  // NaN if none
export function stdSince(rs: readonly Reading[], tFrom: number): number;   // NaN if < 3
export function fmtDropDb(dropDb: number): string; // 6 → "−6 dB", −2 → "+2 dB" (U+2212, rounded)
```

### src/core/live/health.ts
```ts
export const HEALTH = { staleS: 2, minRateHz: 5, weakDbm: -75, badDbm: -85, idleStdMaxDb: 2, driftMaxDb: 6, distanceRatioMax: 2 } as const;
export interface HealthInput { readingAgeS: number | null; rateHz: number; rssiDbm: number | null; hasBaseline: boolean;
  networkChanged: boolean; idleStdDb: number | null; driftDb: number | null; distanceRatio: number | null }
export type CheckId = 'stream'|'network'|'rssi'|'baseline'|'rate'|'idle-noise'|'drift'|'distance';
export interface HealthCheck { id: CheckId; status: 'ok'|'warn'|'bad'|'na'; message: string }
export interface SignalHealth { light: 'green'|'yellow'|'red'; headline: string; checks: HealthCheck[] }
export function evaluateHealth(i: HealthInput): SignalHealth;
export function networkChanged(ref: SiteNetwork | null, gateway: string | null, channel: number | null): boolean;
```
Red: readingAgeS null or > 2 (rssi + rate → na); networkChanged ("Mac เปลี่ยนเครือข่าย — อัด Baseline ใหม่"); rssi < −85. Yellow: no baseline; rate < 5; −85 ≤ rssi < −75; idleStd > 2; drift > 6 ("อุปกรณ์อาจถูกย้าย — อัด Baseline ใหม่"); distanceRatio > 2. Null input → na. Headline = first bad, else first warn (CheckId order), else "พร้อมเดโม". networkChanged ignores null sides and 'fake' gateway; true if gateway or channel differs.

### BaselineContext (per browser, `wdt.baselineContext.v1`)
```ts
interface BaselineContext { recordedAt: string; gateway: string | null; channel: number | null;
  link: null | { siteId: string; devicesKey: string; band: Band; predictedDbm: number; measuredMeanDbm: number; offsetDb: number; personDropDb: number } }
```
liveStore subscribes to useSensingStore; when `baseline` changes identity and non-null, build from current doc + liveLinkOf + active site. Calibration valid only if link.siteId === active site and link.devicesKey === devicesKey(activeSite). Network ref = baselineContext ?? activeSite.network.

### src/ui/live/diagnostics.ts
`computeDiagnostics()` reads sensingBuffers + both stores + doc →
```ts
interface Diagnostics { health: SignalHealth; rssi2s: number | null; snrDb: number | null; quality: SignalQuality | null;
  distance: { estimatedM: number; planM: number; ratio: number } | null;  // pre-calibration, link only
  drift: { shiftDb: number } | null;                                     // post-calibration
  blocking: { dropDb: number; level: BlockingLevel } | null;             // link + Baseline, live source only
  calibration: BaselineContext['link']; personDropDb: number | null; lastPeakDropDb: number | null }
```
tLast = newest reading t. rateHz = readings in last 2 s / 2. rssi2s = meanSince(tLast−2). snr = rssi − noise. idleStd = stdSince(tLast−5) only if no motion verdict in last 5 s. drift = |meanSince(tLast−10) − measuredMeanDbm| only when calibrated and no motion in last 10 s. distance from Baseline mean (else rssi2s) with predictLinkRssi.obstructionLossDb. drop = baseline.meanRssi − meanSince(tLast−1.5).
LiveDriver runs every 500 ms → liveStore.diag; tracks peak drop per motion episode → lastPeakDropDb when motion ends. Replay: health replaced by neutral note "ย้อนหลัง", blocking null.

### UI
- `src/ui/live/SignalHealthCard.tsx` under `<SensingChart/>`: one line dot · `−62 dBm · ดี (QUALITY_TH) · SNR 31 dB` · headline · chevron; expanded = checks with dots. Pre-calibration: "จาก RSSI ≈ X m (ประมาณ) / บนผัง Y m". Post: "twin ทำนาย −A dBm · วัดจริง −B dBm · offset ±C dB" and "twin: คน 1 คนขวางกลางเส้น ≈ −X dB · วัดได้ล่าสุด −Y dB".
- LabelsOverlay: if Live Link and diag.blocking → LabelDiv id `live-link`, priority 5, world midpoint (y = elevation + 0.1), class `link-label`: `{fmtDropDb} · {BLOCKING_TH}` + small "คน 1 คนขวาง ≈ −X dB (twin)". Update labels.ts priority comment to mention 5.

## Tests (pure logic; written by a separate test pass)
- sites.test.ts: round-trip; reject bad id / size / non-finite device / >50; dangling active → null; devicesKey rounding / "".
- quickRoom.test.ts: validateDoc clean with & without devices; deterministic ids; 4 drywall walls; zone appliesTo 'any' on room; radios only for placed devices at y 0.9; bandForChannel(36)='5', 6/null='2.4'; quickRoomDoc(null) valid.
- linkGeometry.test.ts: inside full length; crossing partial; miss 0; concave L exit/re-enter sum; roomsCrossed sorted; auto picks longest; coverageBand no dup, widest mid, clamp 0.25–0.5; liveLinkOf null for sampleHouse(), found for quick room with both.
- calibration.test.ts: one drywall → obstructionLoss 3 @2.4; person drop ≈ 4 @2.4, 6 @5; offset sign; estimateDistanceM inverts predictLinkRssi within 1%; distanceRatio symmetric/null; blockingLevel 2/5/10; fmtDropDb signs; mean/std empty.
- health.test.ts: green; each red alone (stream → rssi/rate na); each yellow alone; −75 ok, −75.1 warn, −85 warn, −85.1 bad; headline order; networkChanged cases.
- vite-plugins/sites.test.ts: isLocalWrite accepts localhost:5173, 127.0.0.1, [::1]:5173; rejects ngrok host, local+x-forwarded-for, local+ngrok-skip-browser-warning, remote Origin.
- src/ui/store.test.ts extend: enterReal → op → exitReal restores exact sim doc + history; no scene localStorage write while real (fake timers + spy setItem); setMode('edit') no-op in real; loadSample() in real exits real.

## CONTEXT.md (glossary only)
Site (new, Deployments): a named real place where a Pilot Deployment's Link is set up; holds its Quick Room and device positions; shared by everyone viewing. _Avoid_: project, location, scene.
Quick Room (new): single rectangular room generated from width and length standing in for a Site's floor plan, default walls. _Avoid_: template, mock room.
Calibration Offset (new, Sensing): measured mean signal strength at Baseline time minus twin's predicted strength for the same Link; lets predictions be compared with Readings. _Avoid_: correction, bias. Baseline _Avoid_: "Calibration (reserved…)" → "Calibration Offset (the twin-vs-measured difference recorded with a Baseline)".
Live Mirror (redefine): twin showing real Motion Detection verdicts live on the Link and its Coverage on the plan, plus rooms the Link passes through; with no Link placed, on the Monitored Room.
Signal Health (new): single green/yellow/red judgement of whether a real Link is fit to demo (fresh Readings, same network, strong steady signal, devices where the plan says), with its checks. _Avoid_: status, connection quality.
Monitored Room: add — when a Link is placed it defaults to the room the Link passes through longest, overridable.

## Notes
- tsconfig.node composite → plugin may import only src/core/live/sites.ts (must import nothing).
- defaultGateway uses spawnSync; 5 s poll OK.
- ngrok viewers receive Sites/status via SSE; buttons disabled; server 403s.
- Monitored Room override key shared across modes; misses fall through (intended).
- predictPersonDropDb equals human-body material loss (no diffraction) — expected.
