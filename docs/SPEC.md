# WiFi Digital Twin — Build Spec

สเปกนี้เขียนให้ AI coding agent (เช่น Claude Code) **สร้างระบบทั้งหมดได้จากศูนย์** โดยไม่ต้องดูโค้ดเดิม ใช้คู่กับ `CONTEXT.md` (ศัพท์โดเมน)

---

## 0. วิธีใช้

1. สร้างโฟลเดอร์ว่าง ใส่ `SPEC.md` (ไฟล์นี้) และ `CONTEXT.md`
2. เปิด Claude Code ในโฟลเดอร์นั้น แล้ววางคำสั่งนี้:

```text
อ่าน SPEC.md และ CONTEXT.md ให้ครบก่อน แล้วสร้างโปรเจกต์ตาม SPEC ทีละ milestone (M0 → M7)
- ทำทีละ milestone เท่านั้น ห้ามข้าม ห้ามทำหลาย milestone พร้อมกัน
- จบแต่ละ milestone: รัน test/build ให้ผ่าน ตรวจข้อ "เสร็จเมื่อ" ครบทุกข้อ commit แล้วหยุด รายงานผลให้ฉันตรวจ
- ถ้าสเปกไม่ชัดหรือขัดกันเอง ให้ถามก่อน อย่าเดา
- ใช้ศัพท์ตาม CONTEXT.md ในโค้ด, UI และข้อความ commit
เริ่มที่ M0
```

3. เมื่อ AI รายงานว่า milestone เสร็จ ให้ลองใช้งานตามข้อ "เสร็จเมื่อ" แล้วพิมพ์ `ต่อ M<ถัดไป>`

> AI สร้างทั้งระบบในคำสั่งเดียวไม่ได้ ต้องไปทีละขั้นและให้คนตรวจทุกขั้น ผลจะใกล้เคียงต้นแบบ แต่ไม่เหมือนกันทุกพิกเซล

---

## 1. ภาพรวมผลิตภัณฑ์

**Digital twin ของบ้านทั้งหลัง** ที่ตรวจจับคนและกิจกรรมจากสัญญาณ WiFi (และกล้องในห้องที่อนุญาต) รวมถึงในห้องที่ไม่มีเซนเซอร์มองเห็นโดยตรง เพราะสัญญาณ WiFi วิ่งทะลุผนังห้องนั้น (**Non-line-of-sight Detection**)

- **WiFi Sensing แบบ device-free:** คนไม่ต้องพกอะไร ส่วนการติดตามมือถือ (Device Tracking) อยู่นอก scope
- **Sim-first:** ยังไม่มี hardware ทุกอย่างรันใน browser พร้อม simulator คนและสัตว์ไว้ใช้ทดสอบ
- **ผู้ใช้:** ทีมพัฒนาใช้ทดสอบ และใช้นำเสนอโครงการ จึงต้องสวยระดับนำเสนอได้ (dark ops console)
- **ภาษา UI:** ภาษาไทยทั้งหมด ยกเว้นชื่อเครื่องมือใน Edit (Select, Wall, ...) และหน่วย

**สิ่งที่ระบบต้องทำได้เมื่อจบ M7:**
1. วาดหรือแก้ผังบ้านหลายชั้น
2. กดปุ่มเดียวสุ่มคนและสัตว์ให้เดินเองทั้งบ้าน
3. ตั้งพื้นที่ห้ามเข้า และได้แจ้งเตือนเมื่อมีคนบุกรุกหรือล้ม
4. ดู heatmap สัญญาณ WiFi สด
5. วาง Link เพื่อเฝ้าห้อง ระบบแนะนำตำแหน่งวางให้ (Placement Plan)
6. ตรวจจับการเคลื่อนไหวจาก Virtual Link แล้ววัดผลเทียบ Ground Truth
7. ต่อ Mac จริงเพื่ออ่าน RSSI ทำ Test Session และเห็นผลจริง (Observed) ซ้อนบน twin

---

## 2. กฎที่ห้ามละเมิด

1. **World ≠ Twin:** World คือความจริง (ใน sim = Ground Truth) ส่วน Twin คือสิ่งที่ระบบประมาณจากเซนเซอร์ โค้ดตรวจจับ**ห้ามอ่านตำแหน่งจริงของ agent** ให้รับได้เฉพาะ Readings
2. **ตัวตรวจจับตัวเดียว:** Motion Detection ใช้โค้ดชุดเดียวกันทั้งกับ Virtual Link และ Link จริง ต่างกันแค่แหล่งที่มาของ Readings
3. **ผลซ้ำได้เสมอ:**
   - ทุกอย่างใน core ที่สุ่ม ใช้ seeded PRNG (mulberry32) ห้ามใช้ `Math.random()` ใน `src/core`
   - doc + seed + t เดียวกัน ต้องได้ผลเดียวกันทุกครั้ง
4. **Core เป็น pure TypeScript:**
   - `src/core` ห้าม import React, three หรือ DOM
   - ทุกฟังก์ชันใน core ทดสอบได้ใน Node
5. **Doc เป็น immutable:**
   - ทุก edit คืน object ใหม่
   - cache ต่างๆ ใช้ `WeakMap` บน identity ของ doc
6. **Serialize แบบ deterministic:**
   - ลำดับ key คงที่ต่อชนิด และ array เรียงตามลำดับใน doc
   - indent 2 ช่อง ปิดท้ายด้วย newline
   - save → load → save ต้องได้ byte เดียวกัน
7. **Observed ต้องมีป้ายเสมอ:**
   - ทุกอย่างที่มาจากเซนเซอร์จริง ต้องมีป้าย "ของจริง" มองเห็นชัด
   - ห้ามสับสนกับสิ่งที่จำลอง
8. **สีแดงและเหลืองอำพันสงวนไว้ให้ Alert เท่านั้น** ห้ามใช้ตกแต่ง และห้ามใช้ใน heatmap
9. **ไม่ให้ผู้ใช้เพิ่มของเองทีละชิ้นในโหมด Monitor:**
   - คนและสัตว์มาจากปุ่มสุ่ม
   - Link มาจาก Placement Plan ที่กดยอมรับได้

---

## 3. Stack และการตั้งโปรเจกต์ (M0)

| ส่วน | ใช้ |
|---|---|
| Build | Vite 8, TypeScript strict (`noUncheckedIndexedAccess: true`), pnpm, Node 24 |
| UI | React 19, zustand 5 (แบ่ง slice), lucide-react (icon stroke 1.5) |
| 3D | three, @react-three/fiber 9, @react-three/drei 10 (ใช้เฉพาะ OrbitControls/OrthographicCamera) |
| Worker | Web Worker + comlink |
| ฟอนต์ | @fontsource/ibm-plex-sans-thai, @fontsource/ibm-plex-mono |
| Test | vitest (core + store), Playwright (E2E, Chromium + `--use-angle=swiftshader --enable-unsafe-swiftshader`) |

**Scripts:**

| คำสั่ง | ทำอะไร |
|---|---|
| `dev` | `vite` |
| `build` | `tsc -b && vite build` |
| `typecheck` | `tsc -b --noEmit` |
| `test` | `vitest run` |
| `e2e` | `playwright test` |

**โครงสร้างโฟลเดอร์:**

```
src/core/
  scene/      types, materials, ids, geometry, validate, ops/, serialize/, parse/, sample-house
  sim/        rng, navgrid, pathfind, plan, sample, world, populate
  alerts/     computeAlerts
  rf/         bands, trace, heatmap, stats
  sensing/    link (Virtual Link readings), detect (Motion Detection), score, placement, coverage   ← M6
  index.ts    re-export ทั้งหมด
src/ui/
  store/      slices: doc, view, sim, alert, sensing
  shell/      TopBar, Rail, FileMenu, SignalControl
  canvas/     SceneCanvas และ mesh ต่างๆ, HeatmapLayer, CameraRig
  monitor/    แผงโหมด Monitor
  edit/ inspector/ tools/ panels/   โหมด Edit
  rf/         colormap, legend, worker
  sensing/    UI ของ Link, Baseline, Test Session   ← M6–M7
  theme/      tokens.css, palette.ts
e2e/          *.e2e.ts + helpers.ts
helper/mac-rssi/   Swift CLI   ← M7
```

**Dev hooks:** `window.__sceneStore` (zustand store) และ `window.__r3f` (R3F state) เปิดเฉพาะตอน dev ไว้ให้ E2E ใช้

**M0 เสร็จเมื่อ:** `pnpm dev` เปิดหน้าว่างพร้อมพื้นหลัง `--bg` และฟอนต์ไทยโหลดได้, `pnpm test`, `pnpm build` และ `pnpm e2e` (test smoke 1 ตัว) ผ่านทั้งหมด

---

## 4. หน่วยและพิกัด

- **หน่วย:** เมตร, dBm, dB, MHz, วินาที, radian
- **แกน:** แบบ three.js คือ **Y ขึ้นบน** ผังบ้านอยู่บนระนาบ **XZ**
- **พิกัดผนัง/ห้อง:** เก็บเป็น 2D `[x, z]` ต่อชั้น ความสูงจริง = `level.elevation + y`
- **การวาด polygon ห้องด้วย `THREE.Shape`:** ใช้ `(x, -z)` แล้วหมุน −90° รอบแกน X ไม่งั้นรูปห้องจะกลับด้าน

---

## 5. Data model

```ts
type Id = string;
type Vec2 = [x: number, z: number];
type Vec3 = [x: number, y: number, z: number];
type Band = '2.4' | '5';

interface Material { id: Id; name: string; lossDb: Record<Band, number>; color: string }
interface Level { id: Id; name: string; elevation: number; height: number; slabMaterialId: Id }
interface Wall { id: Id; levelId: Id; a: Vec2; b: Vec2; thickness: number; height: number; materialId: Id }
interface Opening {
  id: Id; wallId: Id; kind: 'door' | 'window';
  offset: number;  // m จากจุด a ตามแนวผนัง
  width: number; sill: number /* ประตู = 0 */; height: number;
  materialId: Id;  // ใช้ตอนปิด
  open: boolean;   // เปิด = ไม่มี loss
}
interface Room { id: Id; levelId: Id; name: string; polygon: Vec2[]; cameraAllowed: boolean }
interface SceneObject {
  id: Id; levelId: Id; name: string;
  position: Vec3;  // กึ่งกลางฐาน, y = ความสูงฐานเหนือพื้น (ปกติ 0)
  size: Vec3; rotationY: number; materialId: Id;
}
interface Waypoint { levelId: Id; p: Vec2; dwell: number }
type AgentBehavior =
  | { type: 'route'; waypoints: Waypoint[]; loop: boolean }
  | { type: 'wander'; levelId: Id; roomId?: Id; pauseMin: number; pauseMax: number } // ไม่มี roomId = ทั้งชั้น
  | { type: 'roam'; dwellMin: number; dwellMax: number };  // สุ่มห้องทุกชั้น ข้ามบันได
interface Agent {
  id: Id; name: string; kind: 'person' | 'pet'; color: string;
  radius: number;  // คน 0.2, สัตว์ 0.15
  height: number;  // คน 1.5–1.8, สัตว์ 0.35
  speed: number;   // m/s คน 1.0–1.4, สัตว์ 0.8
  materialId: Id;  // 'human-body'
  start: Waypoint; behavior: AgentBehavior;
}
interface Zone {
  id: Id; name: string; levelId: Id;
  roomId?: Id;       // ตั้งไว้ = ใช้ polygon ของห้องนั้น
  polygon: Vec2[];   // ใช้เมื่อไม่มี roomId
  appliesTo: 'person' | 'pet' | 'any'; enabled: boolean;
}
interface Incident { id: Id; kind: 'fall'; agentId: Id; t: number; duration: number }
interface PopulationSettings { people: number; pets: number; fallsPerHour: number }
interface Stair { id: Id; fromLevelId: Id /* ล่าง */; toLevelId: Id /* บน */; bottom: Vec2; top: Vec2; width: number }
interface RadioIface { band: Band; channel: number; txPowerDbm: number }
interface Radio {
  id: Id; levelId: Id; name: string; role: 'ap' | 'client' | 'sensor-node';
  position: Vec3; ifaces: RadioIface[]; antennaGainDbi: number;
}
// ── เพิ่มใน M6 ──
interface Link {
  id: Id; name: string;
  transmitterId: Id;                                  // Radio (role 'ap')
  receiver: { levelId: Id; position: Vec3 };          // ตำแหน่ง Receiver (laptop) สูงจากพื้น ~0.8–1.0 m
  band: Band;
  monitoredRoomId: Id;
  kind: 'virtual' | 'real';                           // virtual = sim สร้าง Readings, real = รับจาก helper
}

interface SceneDoc {
  version: 1; seed: number;
  materials: Material[]; levels: Level[]; walls: Wall[]; openings: Opening[]; rooms: Room[];
  objects: SceneObject[]; agents: Agent[]; radios: Radio[]; stairs: Stair[]; zones: Zone[];
  incidents: Incident[]; population: PopulationSettings;
  links: Link[];   // M6 (ก่อน M6 ให้มีเป็น [] ไว้เลย)
}
```

### 5.1 Materials เริ่มต้น (dB ต่อการทะลุ 1 ครั้ง)

| id | name | 2.4 | 5 | color |
|---|---|---|---|---|
| drywall | Drywall | 3 | 4 | #d8d2c4 |
| wood-door | Wood door | 3 | 4 | #a1662f |
| brick | Brick | 8 | 12 | #b5573c |
| concrete-wall | Concrete wall 15cm | 12 | 18 | #9a9a94 |
| concrete-slab | Concrete slab | 18 | 25 | #7d7d78 |
| glass | Glass | 2 | 3 | #bfe3ee |
| glass-lowe | Glass low-E | 20 | 25 | #8fc8dc |
| wood-furniture | Wood furniture | 2 | 3 | #c08a4e |
| metal | Metal | 25 | 30 | #9fa6ad |
| human-body | Human body | 4 | 6 | #e8b98c |

ชื่อวัสดุที่แสดงบน UI เป็นภาษาไทย เช่น ผนัง**อิฐ** หรือ ประตู**ไม้**

### 5.2 Validation (`validateDoc` คืนรายการ `{ path, message }`)

- **id:** ไม่ซ้ำกันทั้ง doc
- **การอ้างอิง:** ทุก `levelId`, `wallId`, `materialId`, `roomId`, `agentId`, `transmitterId` และ `monitoredRoomId` ต้องมีอยู่จริง
- **polygon:** ห้องและ zone (ที่ไม่มี `roomId`) ต้องมี ≥ 3 จุด
- **ผนัง:** ยาว > 0
- **Opening:** `0 ≤ offset` และ `offset + width ≤ ความยาวผนัง`, `sill + height ≤ wall.height`
- **บันได:** `fromLevelId` ต้องต่ำกว่า `toLevelId`
- **ตัวเลข:** ต้องเป็น finite ทั้งหมด และขนาดต้อง > 0
- **parse:** ต้อง throw `SceneParseError` พร้อม `.issues` เมื่อ JSON เสีย, รูปร่างผิด หรือไม่ผ่าน validate

### 5.3 Ops (pure, คืน doc ใหม่)

- **ตัวอย่าง:** `addWall`, `updateWall`, `addOpening`, `toggleOpening`, `addRoom`, `addObject`, `updateObject`, `addRadio`, `updateRadioIface`, `addZone`, `updateZone`, `addLevel`, `removeLevel` (ลบของในชั้นนั้นด้วย), `removeEntity(id)` (ลบแบบ cascade เช่น ลบผนังแล้วลบ opening ของผนังนั้นด้วย), `addIncident`, `addLink`, `updateLink`
- **ความผิดพลาด:** op ที่ทำไม่ได้ให้ throw `SceneOpError` ที่มีข้อความภาษาไทย แล้ว UI แสดงเป็น toast

### 5.4 บ้านตัวอย่าง (`sampleHouse()`)

บ้านเดี่ยว 2 ชั้นแบบไทย ขนาด 10 × 12 m ให้ AI สร้างเป็นฟังก์ชันใน core และใช้เป็น doc เริ่มต้นเมื่อ localStorage ว่าง

- **doc:** `seed: 42`, `population: { people: 3, pets: 1, fallsPerHour: 0 }`
- **ชั้น:**
  - ชั้น 1: elevation 0, height 3.0
  - ชั้น 2: elevation 3.2, height 2.8
  - ทั้งสองชั้นใช้ slab `concrete-slab`

**ห้อง** (polygon เป็น `[x, z]`):

| ชั้น | ห้อง | polygon | กล้อง |
|---|---|---|---|
| 1 | ห้องนั่งเล่น | (0,0)(6,0)(6,6)(0,6) | ✓ |
| 1 | ห้องทานข้าว | (6,0)(10,0)(10,3)(6,3) | ✓ |
| 1 | ห้องครัว | (6,3)(10,3)(10,6)(6,6) | ✓ |
| 1 | ห้องนอนแขก | (0,6)(4,6)(4,12)(0,12) | ✗ |
| 1 | ห้องน้ำ | (4,6)(6,6)(6,12)(4,12) | ✗ |
| 1 | โถงบันได | (6,6)(10,6)(10,12)(6,12) | ✓ |
| 2 | ห้องนอนใหญ่ | (0,0)(5,0)(5,7)(0,7) | ✗ |
| 2 | โถง (รูปตัว L) | (5,0)(7,0)(7,12)(0,12)(0,7)(5,7) | ✓ |
| 2 | ห้องนอน 2 | (7,0)(10,0)(10,4)(7,4) | ✗ |
| 2 | ห้องนอน 3 | (7,4)(10,4)(10,8)(7,8) | ✗ |
| 2 | ห้องน้ำ 2 | (7,8)(10,8)(10,12)(7,12) | ✗ |

**ผนัง:**

| ชั้น | ผนัง | วัสดุ / ความหนา / สูง | พิกัด |
|---|---|---|---|
| 1 | ผนังนอก | brick 0.2 m สูง 3.0 | ขอบ 0..10 × 0..12 |
| 1 | ผนังใน | brick 0.1 m | (6,0)–(6,6), (6,3)–(10,3), (0,6)–(10,6), (4,6)–(4,12), (6,6)–(6,12) |
| 2 | ผนังนอก | brick 0.2 m สูง 2.8 | ขอบ 0..10 × 0..12 |
| 2 | ผนังใน | drywall 0.1 m | (5,0)–(5,7), (7,0)–(7,12), (0,7)–(5,7), (7,4)–(10,4), (7,8)–(10,8) |

**ประตูและหน้าต่าง** (ปิดอยู่ทั้งหมดตอนเริ่ม):
- ประตูไม้: ประตูหน้ากว้าง 1.0 m ที่ผนังด้าน z=0 ของห้องนั่งเล่น และทุกห้องต้องมีประตูกว้าง 0.9 m เข้าถึงได้ รวม 10 บาน
- หน้าต่างกระจก กว้าง 1.2 m sill 0.9 m: ห้องละบานบนผนังนอก
- หน้าต่าง low-E กว้าง 0.9 m: 1 บานในห้องนอนใหญ่

**ของ** (`position` เป็นกึ่งกลางฐาน `y = 0`):

| ชั้น | ชื่อ | position | size | วัสดุ |
|---|---|---|---|---|
| 1 | โซฟา | (2, 0, 4.5) | 2.2×0.8×0.9 | wood-furniture |
| 1 | โต๊ะทานข้าว | (8, 0, 1.5) | 1.6×0.75×0.9 | wood-furniture |
| 1 | ตู้เย็น | (9.3, 0, 4.7) | 0.7×1.8×0.7 | metal |
| 1 | ตู้เหล็ก | (8, 0, 10.5) | 0.8×1.8×0.4 | metal |
| 1 | เตียงนอนห้องแขก | (2, 0, 9.5) | 1.9×0.5×1.4 | wood-furniture |
| 2 | ตู้เสื้อผ้า | (1, 0, 6.2) | 1.5×2×0.6 | wood-furniture |
| 2 | เตียงนอนใหญ่ | (2.5, 0, 2.5) | 2×0.5×1.8 | wood-furniture |
| 2 | เตียงนอน 2 | (8.5, 0, 1.8) | 1.9×0.5×1.4 | wood-furniture |
| 2 | เตียงนอน 3 | (8.5, 0, 5.8) | 1.9×0.5×1.4 | wood-furniture |

**บันได:** จากชั้น 1 ไปชั้น 2 โดย bottom (6.5, 7.5), top (6.5, 10.5), กว้าง 1.0

**AP** (role `ap`, gain 3 dBi):

| ชื่อ | ชั้น | position | 2.4 GHz | 5 GHz |
|---|---|---|---|---|
| เราเตอร์หลัก | 1 | (3, 2, 3) | ch 6 / 20 dBm | ch 36 / 23 dBm |
| Mesh AP ชั้น 2 | 2 | (6, 2, 2) | ch 11 / 20 dBm | ch 149 / 23 dBm |

**Zone:**

| ชื่อ | พื้นที่ | ใช้กับ | สถานะ |
|---|---|---|---|
| ห้องครัว (ห้ามเข้า) | ผูกกับห้องครัว | `pet` | เปิด |
| ห้องนอนใหญ่ (ห้ามเข้า) | ผูกกับห้องนอนใหญ่ | `person` | เปิด |
| ประตูหน้า | polygon (2.25,0.2)(3.75,0.2)(3.75,1.7)(2.25,1.7) | `any` | ปิด |

**Agent:** สร้างจาก `populate(doc, {people: 3, pets: 1, fallsPerHour: 0}, 42)` แต่ต้อง populate **หลังจากเพิ่ม Zone แล้ว** และห้าม spawn ใน Zone ที่ห้าม agent ชนิดนั้น นอกจากนี้ใส่ Incident ล้ม 1 ครั้งให้คนแรกในช่วงต้นชั่วโมง เพื่อให้เดโมมีเหตุล้มให้เห็น

**M1 เสร็จเมื่อ:**
- มี test ครอบ validate, ops ทุกตัว (เช่น cascade delete, op ที่ throw) และ parse ที่ปฏิเสธ input เสีย
- `serialize(parse(serialize(sampleHouse())))` ได้ byte เดียวกับ `serialize(sampleHouse())`
- `validateDoc(sampleHouse())` ไม่มี issue
- ทำได้เมื่อ M0 เสร็จแล้ว ยังไม่ต้องมี UI

---

## 6. M2 — UI shell + Scene editor (โหมด Edit)

### 6.1 Layout (CSS grid)

```
┌──────────────────────── TopBar 48px ────────────────────────┐
│ Rail ซ้าย 300px │        Canvas (เต็มพื้นที่)       │ Rail ขวา 340px │
│                 │                                  │               │
├─────────────────┴──── Timeline 96px (Monitor) ────┴───────────────┤
```

- **Rail:** หุบเหลือ 56px ได้ เมื่อจอกว้าง < 1280px ให้หุบเป็นค่าเริ่มต้น
- **TopBar (ซ้าย → ขวา):**
  - โลโก้ + ชื่อ "บ้านตัวอย่าง 2 ชั้น"
  - Segmented **Monitor | Edit**
  - ตัวเลือกชั้น
  - Segmented **Plan | 3D**
  - SignalControl (popover ที่มี เปิด/ปิด heatmap, ย่านความถี่ 2.4/5 GHz, แหล่งสัญญาณ "ดีที่สุด" หรือ AP รายตัว)
  - ปุ่ม Undo/Redo (เฉพาะ Edit)
  - ชิปนับ "วิกฤต" / "เตือน"
  - ปุ่ม **เริ่มเดโม**
  - เมนูไฟล์ (ใหม่, เปิด, บันทึกเป็น JSON, โหลดบ้านตัวอย่าง)

### 6.2 Design tokens (`theme/tokens.css`)

ใช้ OKLCH ทั้งหมด neutral อมสี hue 265

```css
--bg: oklch(0.17 0.012 265); --surface-1: oklch(0.205 0.012 265); --surface-2: oklch(0.24 0.013 265);
--surface-3: oklch(0.29 0.014 265); --line: oklch(0.32 0.012 265);
--ink: oklch(0.95 0.005 265); --ink-2: oklch(0.78 0.01 265); --ink-3: oklch(0.62 0.012 265);
--accent: oklch(0.72 0.15 285);            /* selection, ปุ่มหลัก, focus — accent เดียว */
--critical: oklch(0.66 0.21 25); --critical-solid: oklch(0.5 0.19 25);   /* Alert เท่านั้น */
--warning: oklch(0.82 0.15 80); --ok: oklch(0.76 0.14 155);
--person-1..8: oklch(0.75 0.13 H) โดย H = 217,105,291,142,328,179,254,5   /* ข้ามช่วง 20–90° ที่สงวนให้ alert */
--pet-1..4:    oklch(0.72 0.045 H) โดย H = 120,200,260,320
--font-ui: 'IBM Plex Sans Thai'; --font-mono: 'IBM Plex Mono';
--fs: 12/13(base)/15/18/22/28px; --lh: 1.45 (สระและวรรณยุกต์ไทยต้องมีที่);
--sp: 4/8/12/16/24px; --r: 4/6/10px; --ease: cubic-bezier(0.25,1,0.5,1); --dur: 150/250ms;
```

- **ตัวเลข:** ใช้ฟอนต์ mono แบบ tabular
- **three.js:** ใช้สี hex ที่แปลงจาก token เดียวกัน (`theme/palette.ts`)

### 6.3 Canvas

- **กล้อง:**
  - Plan = orthographic มองจากบน
  - 3D = perspective หมุนได้
  - ชั้นที่เลือกแสดงชัด ชั้นอื่นจาง (3D) หรือซ่อน (Plan)
- **Plan view:** ตัดผนังที่ความสูง 1.2 m เพื่อให้เห็นช่องประตู
- **สิ่งที่วาด:** ห้อง (พื้นสีอ่อน), ผนัง (กล่องตามวัสดุ), ประตู/หน้าต่าง (ช่องในผนัง พร้อมสีตอนปิด), ของ (กล่อง), AP (ไอคอน), บันได, Zone (ขอบประสีเหลืองอำพันโปร่งแสง)
- **ป้ายชื่อห้องและ agent:** ใช้ **DOM overlay** แยกจาก canvas (project พิกัดโลกเป็นพิกัดจอทุกเฟรม) **ห้ามใช้ drei `<Html>`** เพราะ crash (removeChild) และขนาดเพี้ยนในกล้อง ortho
- **ป้ายกันทับกัน:** ป้ายชื่อห้องต้องไม่ทับไอคอน AP ให้เลื่อนออกเมื่อชนกัน
- **ระหว่างลาก** (วาดผนัง, ย้ายของ) ให้ปิด OrbitControls ชั่วคราว ไม่งั้นกล้องจะเลื่อนตาม

### 6.4 เครื่องมือ (โหมด Edit, แถบเครื่องมือแนวตั้ง)

| เครื่องมือ | ปุ่ม | พฤติกรรม |
|---|---|---|
| Select | V | คลิกเลือกได้ทุกอย่าง, ลากย้ายของ/AP, `[` `]` หมุนของ ±15°, Delete/Backspace ลบ |
| Wall | W | คลิกจุดต่อจุด snap grid 0.1 m และ snap ปลายผนังเดิมในรัศมี 0.25 m, Esc จบ |
| Door | D | คลิกบนผนังเพื่อใส่ประตูกว้าง 0.9 m, Space สลับเปิด/ปิด |
| Window | N | เหมือน Door แต่เป็นหน้าต่าง กว้าง 1.2 m sill 0.9 m |
| Room | R | คลิกจุด polygon, Enter ปิดรูป, ตั้งชื่อใน Inspector |
| Object | O | คลิกวางกล่อง 1×1×1 m แล้วปรับใน Inspector |
| AP | A | คลิกวาง router dual-band (2.4 ch6 20 dBm + 5 ch36 23 dBm) |
| Zone | Z | วาด polygon หรือ "ผูกกับห้อง" ใน Inspector |

- **Rail ซ้าย (Edit):** แท็บ "ชั้น" (เพิ่ม/ลบ/เปลี่ยนชื่อ/ความสูงชั้น) และ "วัสดุ" (แก้ dB ได้)
- **Rail ขวา (Edit):** Inspector ของสิ่งที่เลือก (ฟิลด์ตัวเลขที่มีหน่วยกำกับ) เปิดเองเมื่อมีการเลือก
- **Undo/Redo:**
  - Cmd/Ctrl+Z และ Shift+Cmd/Ctrl+Z ทุก edit ผ่าน `apply(fn, { coalesce? })`
  - การลากสไลเดอร์ให้รวมเป็น undo ขั้นเดียว
- **Autosave:** เก็บ doc ลง localStorage ทุกครั้งที่แก้ เมื่อ reload ต้องได้ scene เดิม
- **ค่าใน store:** หลังแก้ doc ทุกครั้ง `activeLevelId` และ `selection` ต้องยังชี้ของที่มีอยู่ ถ้าของถูกลบให้ reset

**M2 เสร็จเมื่อ:**
- E2E ครอบ: วาดผนัง (snap ถูก), ใส่/สลับประตู, วาดห้อง, วาง/หมุน/ลบของ, วาง AP, เพิ่ม/ลบชั้น, แก้วัสดุ, undo/redo, save/open ไฟล์, autosave หลัง reload, Plan/3D
- **Fixture ของ E2E:** test ต้อง fail ถ้ามี `pageerror` หรือ `console.error` และ project พิกัดโลกเป็นพิกัดจอด้วยกล้องจริง (`__r3f`) ห้าม hardcode พิกัดพิกเซล
- บ้านตัวอย่างแสดงครบทั้ง 2 ชั้น ห้องไม่กลับด้าน และเฟอร์นิเจอร์วางบนพื้น

---

## 7. M3 — Simulator คนและสัตว์

**แนวคิด:** **Plan ล่วงหน้าทั้งชั่วโมง** เป็นลิสต์ segment แทนการจำลองทีละ tick ทำให้ query สถานะที่เวลาใดก็ได้ด้วย binary search (ลาก scrubber ย้อนไปมาได้ทันที)

```ts
type Segment =
  | { kind: 'idle'; t0; t1; levelId; p: Vec2 }
  | { kind: 'walk'; t0; t1; levelId; path: Vec2[] }      // ความเร็วคงที่ตาม polyline
  | { kind: 'stair'; t0; t1; stairId; up: boolean }
  | { kind: 'fallen'; t0; t1; levelId; p: Vec2 };
interface AgentState { levelId; position: Vec3 /* world */; heading; moving: boolean; posture: 'standing'|'walking'|'fallen' }
planAll(doc, horizon = 3600): Map<agentId, { segments, warnings }>   // memoize บน doc
sampleWorld(doc, plans, t): (AgentState & { agentId; onStairLevels: [Id,Id] | null })[]  // = Ground Truth
```

| เรื่อง | กติกา |
|---|---|
| **PRNG** | mulberry32 seed = `doc.seed XOR fnv1a(agent.id)` แยกต่อ agent ไม่ขึ้นกับลำดับ |
| **Navgrid** | ต่อชั้น cell 0.2 m, margin 1 m รอบ bbox ของผนัง/ห้อง/ของ cell ถูก block ถ้าห่างจากผนัง ≤ `thickness/2 + radius` **ยกเว้นช่วงที่มีประตู** (เปิดหรือปิดก็ผ่านได้) หน้าต่างนับเป็นผนัง ของสูง > 0.3 m block, cache ต่อ (doc, level, radius, kind) |
| **Navgrid หลบ Zone** | เหมือน navgrid ปกติ แต่ block cell ใน Zone ที่เปิดอยู่และใช้กับ agent ชนิดนั้น |
| **Pathfinding** | A* 8 ทิศ (ห้ามตัดมุม) heuristic แบบ octile แล้ว string-pull ด้วย line-of-sight จุดเริ่ม/ปลายที่ไม่ว่าง snap ไป cell ว่างใกล้สุดภายใน 1 m ไปไม่ถึงคืน `null` |
| **ข้ามชั้น** | BFS หาเส้นทางผ่านบันได เดินไปจุดขึ้น แล้วสร้าง segment `stair` ใช้เวลา = `hypot(ระยะแนวนอน, ต่างระดับ) / (speed × 0.6)` |
| **roam (คน)** | สุ่มห้องจากทุกชั้น ถ่วงน้ำหนักด้วย √พื้นที่ โดยห้องที่เป็น Zone ห้ามชนิดนี้น้ำหนัก × 0.1 แล้วสุ่มจุดว่างในห้องนั้นและเดินไป idle 15–120 s ถ้าไปไม่ถึงลองใหม่สูงสุด 10 ครั้ง ไม่ได้ให้ idle 10 s |
| **wander (สัตว์)** | สุ่มจุดว่าง**ในห้อง**บนชั้นนั้น (ห้ามออกนอกบ้าน) พัก 5–40 s |
| **การเข้า Zone** | `RESTRICTED_VISIT_CHANCE = 0.1` คือ 10% ของเป้าหมายจงใจเข้า Zone ห้าม (เพื่อให้มีการบุกรุกให้เดโม) ที่เหลือเดินอ้อมด้วย navgrid หลบ Zone ถ้าเป้าหมายไปถึงได้เฉพาะเมื่อตัดผ่าน Zone ให้ข้ามเป้าหมายนั้นแบบเงียบ |
| **ล้ม** | Incident ตัด segment ที่ครอบเวลานั้น (ตำแหน่ง interpolate) แล้วแทรก `fallen` ยาว `duration` จากนั้นเดินต่อ |
| **populate()** | แทนที่ agent และ incident ทั้งหมด เป็น deterministic จาก seed |

**รายละเอียด populate():**

- **คน:**
  - ชื่อวนจาก [สมชาย, สมศรี, มานี, ปิติ, ชูใจ, วีระ, ดวงใจ, ประเสริฐ, เก่ง, มาลี, สมหญิง, อรุณ] สีวน `--person-*`
  - spawn ในห้องสุ่มที่ไม่ใช่ Zone ห้าม
  - สูง 1.5–1.8 m เร็ว 1.0–1.4 m/s นิ่งตอนเริ่ม 0–30 s behavior `roam`
- **สัตว์:**
  - สลับ "แมว 1", "หมา 1", ... สีวน `--pet-*`
  - อยู่ชั้นล่างสุด spawn ในห้อง behavior `wander` ทั้งชั้น
- **การล้ม:** Poisson ตาม `fallsPerHour` ต่อคน เว้นระยะ ≥ 300 s ล้มนาน 90–300 s
- **id:** แบบ sequential `agent_p_0`, `agent_c_0`, `incident_0` (ห้ามใช้ `crypto.randomUUID` เพราะผลจะไม่ซ้ำ)

**M3 เสร็จเมื่อ:**
- vitest: doc เดียวกันได้ segment เดียวกันทุกครั้ง, ไม่มีจุดใดของ path อยู่ใน cell ที่ block, ข้ามชั้นได้, incident ตัด segment ถูกเวลา, คนไม่ spawn ใน Zone ห้าม, agent ไม่ออกนอกบ้าน
- agent 4 ตัวของบ้านตัวอย่างเดินครบ 1 ชั่วโมงโดยไม่มี warning

---

## 8. M4 — Alerts + โหมด Monitor

### 8.1 `computeAlerts(doc, stateAt, horizon, step = 0.5): Alert[]`

```ts
interface Alert {
  id; t; kind: 'zone-entry' | 'fall' | 'fall-no-recovery' | 'motion-in-zone' /* M6 */;
  severity: 'warning' | 'critical';
  source: 'simulated' | 'observed';           // ทุก Alert ต้องมี
  agentId?; zoneId?; roomId?; levelId; position?: Vec3; message: string;  // ข้อความภาษาไทย
}
type StateAt = (t: number) => AgentState[];   // seam: วันนี้ส่ง Ground Truth, อนาคตส่งสถานะที่ Twin ประมาณได้
```

- **zone-entry** (warning):
  - agent ที่ชนิดตรงกับ `appliesTo` เปลี่ยนจากอยู่นอกเป็นอยู่ใน Zone ที่เปิดอยู่บนชั้นเดียวกัน
  - **sample แรกใช้เป็นจุดตั้งต้น:** ถ้าเริ่มต้นอยู่ใน Zone อยู่แล้วไม่นับว่า "เข้า"
  - ข้อความ: `{ชื่อ} เข้าพื้นที่ห้ามเข้า: {zone}`
- **fall** (critical):
  - posture เปลี่ยนเป็น `fallen`
  - ข้อความ: `ตรวจพบคนล้ม: {ชื่อ} ที่ {ห้อง}` (ถ้าไม่อยู่ในห้องใดแต่อยู่ใกล้บันได ใช้ "บันได")
- **fall-no-recovery** (critical):
  - ล้มต่อเนื่อง ≥ 60 s แจ้งครั้งเดียวต่อการล้ม 1 ครั้ง
  - ข้อความ: `{ชื่อ} ล้มและยังไม่ลุกเกิน 60 วินาที`
- **เป้าความถี่:** บ้านตัวอย่าง + populate ค่าเริ่มต้น ต้องเกิด Alert ไม่เกิน ~10 ครั้งต่อชั่วโมง ถ้าเกินแปลว่า sim หรือกติกา Zone มีปัญหา

### 8.2 โหมด Monitor (ค่าเริ่มต้นเมื่อเปิดแอป)

- **Rail ซ้าย "ในบ้านตอนนี้"** (badge = จำนวนคน) มีส่วนพับได้เรียงดังนี้:
  1. **ผู้อยู่อาศัย:** รายชื่อพร้อมจุดสี, ห้องปัจจุบัน และสถานะ (กำลังเดิน / ยืนอยู่ / อยู่นิ่ง / ล้ม) คลิกแล้วกล้องเลื่อนไปหา
  2. **พื้นที่ห้ามเข้า:** Switch เปิด/ปิด, ตัวเลือก ใช้กับคน / สัตว์เลี้ยง / ทุกคน, สถานะ "ว่าง" หรือรายชื่อคนที่อยู่ข้างใน
  3. **สัญญาณ:** รายการห้องพร้อม dBm เฉลี่ยและระดับ (ดีมาก / ดี / พอใช้ / อ่อน / ไม่มี) ← M5
  4. **จำลอง:** stepper คน 0–12 และสัตว์เลี้ยง 0–6, ตัวเลือก "โอกาสล้ม" ปิด / ต่ำ (0.5/ชม.) / สูง (3/ชม.), ปุ่ม **สุ่มใหม่** (populate ด้วย seed ใหม่, ล้าง alert, t=0, play) และปุ่มสีแดง **จำลองคนล้ม** (สร้าง Incident ที่ t ปัจจุบัน นาน 180 s ให้คนที่เลือกหรือสุ่ม)
- **Rail ขวา "การแจ้งเตือน":**
  - feed เรียงจากใหม่ไปเก่า แสดงเวลา sim, ไอคอน, ข้อความ และป้าย Source
  - คลิกแล้วกล้องเลื่อนไปหา กดรับทราบได้
  - รายการล้มเปลี่ยนเป็น "ลุกขึ้นแล้ว" เมื่อคนลุก
  - ตัวกรอง: ทั้งหมด / จำลอง / ของจริง
- **บน canvas:**
  - แถบแดง CriticalBanner เมื่อมีคนล้มที่ยังไม่รับทราบ (มีตัวนับเวลาที่ล้ม)
  - toast แจ้ง Alert ใหม่
  - Legend สัญลักษณ์
  - agent เป็นทรงกระบอกสีประจำตัว คนล้มเป็นแนวนอนพร้อมวงแดงกะพริบ
- **Timeline (ล่าง):**
  - ปุ่ม play/pause (Space), ความเร็ว ×1 / ×5 / ×20 / ×60
  - scrubber 0–60 นาที แสดงแถบกิจกรรมและจุด Alert
  - นาฬิกาเวลาจำลองแบบ `HH:MM:SS` และป้าย "สิ้นสุด HH:MM"
  - ปุ่ม Home/End
- **ปุ่ม "เริ่มเดโม":** โหลดบ้านตัวอย่าง → โหมด Monitor → ชั้น 1 → t=0 → ×20 → play

**M4 เสร็จเมื่อ:**
- vitest ของ computeAlerts ครอบ: entry, จุดตั้งต้นจาก sample แรก, appliesTo, Zone ที่ปิดอยู่, fall, no-recovery ครั้งเดียว, ผลซ้ำได้
- กดเริ่มเดโมแล้วภายใน 1 นาทีจริงเห็นคนเดิน ได้ Alert อย่างน้อย 1 ครั้ง และ banner ล้มขึ้น
- ไม่มี error ใน console

---

## 9. M5 — Propagation + WiFi heatmap

### 9.1 Model (multi-wall, ดัดแปลงจาก COST 231)

```
PL = FSPL(1m, f) + 10·n·log10(max(d, 0.5)) + Σ loss(ผนัง/opening) + Σ loss(ของ) + Σ loss(คน) + Σ loss(slab)
FSPL(1m, f) = 20·log10(f_MHz) − 27.55         f: 2.4 → 2437 MHz (40.2 dB), 5 → 5500 MHz (47.3 dB)
n = 2.0                                       (เพราะนับ loss ของผนังแยกไว้แล้ว)
RSSI = max(−100, txPower + antennaGain − PL)  (rx 0 dBi)
```

- **Ray:** เส้นตรง 3D จาก tx ไป rx
- **ผนัง:** ทดสอบจุดตัด 2D กับเส้นกลางผนังของทุกชั้นที่ ray ผ่านช่วงความสูง แล้วเช็กความสูง ray ณ จุดตัดว่าอยู่ใน `0..wall.height`
  - ถ้าจุดตัดตกใน opening (ตามแนว `offset..offset+width` และสูง `sill..sill+height`): opening เปิด = 0 dB, ปิด = loss ของวัสดุ opening (แทนผนัง)
- **รอยต่อผนัง:** จุดตัดที่ห่างกันตามแนว ray < 3 cm นับเป็นการทะลุครั้งเดียว ใช้ค่าที่ loss สูงสุด ไม่งั้นจะเกิดเส้นทแยงบน heatmap
- **ของ:** ray ตัดสี่เหลี่ยมฐานที่หมุนแล้ว (slab method) และช่วงความสูงต้องซ้อนกับ `[base, base+size.y]`
- **คน/สัตว์:** ray เข้าใกล้กว่า radius และความสูง ray ≤ ความสูงตัว (ล้ม = 0.3 m) คิด loss ของ `human-body`
- **Slab:** นับ 1 ครั้งต่อพื้นชั้นที่อยู่ระหว่างความสูงของ tx กับ rx
- **ไม่มี** reflection/diffraction (เป็นข้อจำกัดที่รู้แล้ว)
- **ตัวเลขที่ต้องผ่าน test:**
  - LOS 5 m, 20 dBm + 3 dBi, 2.4 GHz → **−31.2 dBm**
  - มีผนังอิฐคั่น → **−39.2 dBm**
  - คนยืนบนเส้น → +4 dB (2.4) / +6 dB (5)

**API:**
- `traceLink(doc, tx, rx, band, agents)` คืน `{ pathLossDb, distance, obstructions: { kind, id, name (ไทย), lossDb }[] }`
- `computeHeatmap(doc, { levelId, band, source: 'best' | radioId, agents, cell = 0.25, rxHeight = 1.0 })`
  - คำนวณเฉพาะ cell ที่จุดกึ่งกลางอยู่ในห้อง (นอกห้อง = NaN)
  - 'best' = ค่าสูงสุดจาก AP ทุกตัว
- `roomCoverage` = ค่าเฉลี่ยและ p10 ต่อห้อง ระดับจากค่าเฉลี่ย: ≥ −50 ดีมาก, ≥ −67 ดี, ≥ −75 พอใช้, ≥ −85 อ่อน, ต่ำกว่านั้น ไม่มี

### 9.2 แสดงผล

- **Worker:**
  - คำนวณใน Web Worker (comlink) และรับเฉพาะ request ล่าสุด
  - ระหว่าง sim เล่น คำนวณใหม่ไม่เกิน 4 ครั้งต่อวินาที และเฉพาะตอนที่มี agent ขยับ
- **Layer:** `DataTexture` บนพื้นชั้นที่ +0.03 m, opacity 0.62 (Plan) / 0.55 (3D)
- **Colormap:** OKLCH ไล่ indigo → mint ความสว่างเพิ่มตามสัญญาณ อ่านได้แม้เป็นภาพขาวดำ ไม่มีแดงหรือเหลืองอำพัน LUT 256 ช่อง clamp ที่ปลายสเกล

| dBm | L | C | H |
|---|---|---|---|
| −90 | 0.30 | 0.10 | 285 |
| −75 | 0.42 | 0.14 | 275 |
| −67 | 0.50 | 0.13 | 255 |
| −55 | 0.58 | 0.11 | 225 |
| −40 | 0.66 | 0.11 | 190 |
| −30 | 0.74 | 0.10 | 168 |

- **Legend:** "ความแรงสัญญาณ (dBm)" พร้อมช่วง อ่อน / พอใช้ / ดี / ดีมาก
- **Hover probe** (Plan): RSSI ต่อ AP และรายการสิ่งกีดขวางของ link ที่แรงที่สุด
- **AP Inspector:** สไลเดอร์ tx power 0–30 dBm, ช่อง 2.4 (1–13) และ 5 (36–165) heatmap เปลี่ยนทันที

**M5 เสร็จเมื่อ:**
- vitest ครอบ: ตัวเลขตรวจสอบข้างบน, opening เปิด/ปิด, รอยต่อผนัง, ความสูงของของ, ข้ามชั้น, คนบังสัญญาณ
- heatmap บ้านตัวอย่างทั้ง 2 ชั้นคำนวณได้ < 200 ms
- เปิด/ปิดประตูแล้ว heatmap เปลี่ยนทันที
- คนเดินบังสัญญาณแล้วเห็นสีเปลี่ยน

---

## 10. M6 — Virtual Link + Motion Detection + Placement Plan

**เป้าหมาย Pilot:** ห้องเล็ก 1 ห้อง (**Monitored Room**) กับ 1 **Link** ระบบต้องตอบได้ว่า "มีการเคลื่อนไหวในห้องไหม" ทีละช่วงเวลา

- แยกคนกับสัตว์ไม่ได้
- **"ไม่มีการเคลื่อนไหว" ≠ "ห้องว่าง"** (คนที่นอนหลับหรือล้มอยู่ก็นิ่ง) ห้ามใช้คำว่า "ห้องว่าง" ใน UI

### 10.1 Coverage ของ Link

- **นิยาม:** จุด p อยู่ใน Coverage ถ้า `|tx−p| + |p−rx| − |tx−rx| ≤ Δ` (วงรีรอบเส้น Link) โดย `Δ = 0.5 m` เป็นค่าเริ่มต้นที่ปรับได้ (กว้างกว่า first Fresnel zone เพราะ RSSI ไวต่อการเคลื่อนไหวในวงกว้างกว่านั้น)
- **คิดในระนาบ XZ ของชั้น Monitored Room เท่านั้น**
- **แสดงบน canvas:** วงรีโปร่งแสงสี accent

### 10.2 Virtual Link readings (`sensing/link.ts`)

สร้าง Reading ทุก `1 / rateHz` วินาที (ค่าเริ่มต้น `rateHz = 2` ใกล้เคียงกับที่ Mac อ่านได้จริง)

```
base(t)    = RSSI จาก traceLink(tx → rx, band, agents ณ t)           // คนที่บังเส้นทำให้ลดลง
shadow     = N(0, 4 dB) ค่าคงที่ต่อ Link (seed จาก link.id)
noise(t)   = N(0, σ_noise = 1.0 dB) ต่อ Reading
motion(t)  = Σ ต่อ agent ที่ moving และอยู่ใน Coverage:  N(0, σ_motion · w)
             σ_motion = 3.0 dB,  w = 1 − excess/Δ  (excess = |tx−p|+|p−rx|−|tx−rx|)
reading(t) = round(base + shadow + noise + motion)  แล้ว clamp ที่ −95 dBm   // quantize 1 dB เหมือนเครื่องจริง
```

- **RNG:** seeded จาก `doc.seed + link.id + index ของ Reading` เพื่อให้ผลซ้ำได้และ scrub ย้อนได้
- **ห้ามรั่ว:** โมดูลนี้เป็นที่เดียวที่อ่าน Ground Truth ได้ ส่วนตัวตรวจจับรับแค่ `Reading[]`

```ts
interface Reading { linkId: Id; t: number /* s */; rssi: number /* dBm */ }
```

### 10.3 Baseline

- **คืออะไร:** Readings ที่อัดไว้ตอนห้องเป้าหมาย**ไม่มีอะไรเคลื่อนไหว** ยาว 60 s เก็บเป็น `{ linkId, recordedAt, windowStdMean, windowStdSd }` คือค่าเฉลี่ยและ SD ของ std ใน rolling window
- **Virtual Link:**
  - ปุ่ม "อัด Baseline" ใน sim หาช่วง 60 s ที่ Ground Truth ไม่มีการเคลื่อนไหวในห้อง
  - ถ้าหาไม่เจอ ให้สร้าง Readings ชุดพิเศษที่ไม่มี agent
- **Link จริง:** ผู้ทดสอบกดอัดเองตอนห้องว่าง
- **อัดใหม่:** เมื่อย้าย Transmitter หรือ Receiver ให้ Baseline เดิมเป็นโมฆะและเตือนให้อัดใหม่
- **ที่เก็บ:** localStorage แยกจาก doc (ไม่ undo และไม่อยู่ในไฟล์บ้าน)

### 10.4 Motion Detection (`sensing/detect.ts`, pure)

```
ทุก 0.5 s:  s = std ของ Readings ใน window 4 s ล่าสุด
on  เมื่อ s > windowStdMean + k_on  · windowStdSd   ติดกัน 2 ครั้ง     (k_on  = 3)
off เมื่อ s < windowStdMean + k_off · windowStdSd   ต่อเนื่อง 4 s      (k_off = 1.5)
output: { t, motion: boolean, score: s }[]
```

ค่า k, window และ Δ เป็นค่าเริ่มต้น ให้ปรับจนผ่านเกณฑ์ข้อ 10.6 โดยต้องได้จากสถานการณ์ทดสอบหลายแบบ ห้าม overfit seed เดียว

### 10.5 Placement Plan (`sensing/placement.ts`)

- **input:** Monitored Room + Transmitter (router ที่มีอยู่)
- **วิธีค้นหา:** ลองตำแหน่ง Receiver บน grid 0.25 m ภายในห้องและในระยะ 1 m นอกผนังห้อง ความสูง 0.9 m
- **คะแนน:** `areaIn = สัดส่วนพื้นที่ห้องที่อยู่ใน Coverage`, `leak = สัดส่วนพื้นที่ Coverage ที่อยู่นอกห้อง` → `score = areaIn − 0.5·leak`
- **เงื่อนไข:** baseline RSSI ≥ −80 dBm
- **output:** 3 อันดับแรก แสดงเป็นจุดบนผังพร้อม % ห้องที่ครอบคลุม กด "ใช้ตำแหน่งนี้" แล้วสร้าง Link
- **ห้องที่ Transmitter อยู่ไกลเกินไป:** ถ้า Coverage ครอบห้องได้ไม่ถึง 30% ให้แนะนำว่า "ควรย้าย Transmitter หรือเพิ่มอุปกรณ์"

### 10.6 Ground Truth และการให้คะแนน (`sensing/score.ts`)

- **Ground Truth ณ เวลา t** = มี agent ใดที่ `moving` และอยู่**ที่ใดก็ได้ในห้อง** (ไม่ใช่แค่ใกล้เส้น Link ดังนั้นวาง Link ไม่ดีจะถูกนับเป็นพลาด)
- **Motion episode** = ช่วงต่อเนื่องที่ Ground Truth เป็นจริง ≥ 2 s (ช่องว่าง < 2 s ให้รวมเป็นช่วงเดียว)
- **จับได้ (Detection):** episode ที่ verdict เป็นจริงภายใน **5 s** นับจากจุดเริ่ม episode
- **Missed Detection:** episode ที่จับไม่ได้
- **False Alarm:** จุดที่ verdict เปลี่ยนจากเท็จเป็นจริง โดยที่ไม่มี Ground Truth motion ในช่วง ±5 s
- **เกณฑ์ผ่าน:** จับได้ **≥ 90%** ของ episode และ False Alarm **≤ 1 ครั้งต่อชั่วโมง**
- **UI:** แผง "ผลตรวจจับ" แสดงอัตราจับได้, latency เฉลี่ย, False Alarm/ชม. และป้าย ผ่าน/ไม่ผ่าน

### 10.7 UI ของ M6

- **โหมด Edit:** เครื่องมือ **Link** (ปุ่ม L) คลิกห้องที่ต้องการเฝ้า แล้วระบบแสดง Placement Plan ให้เลือก (ไม่ต้องวางเองทีละจุด)
- **โหมด Monitor:**
  - **แผง "การตรวจจับ"** ใน rail ซ้าย: Link ทั้งหมด, สถานะ "มีการเคลื่อนไหว" / "ไม่มีการเคลื่อนไหว", กราฟ RSSI สด 60 s พร้อมเส้น threshold, ปุ่มอัด Baseline, ผลตรวจจับ
  - **บน canvas:** เส้น Link และวงรี Coverage ห้องที่มีการเคลื่อนไหวขึ้นขอบเรืองสี accent พร้อมป้าย "จำลอง"
- **Alert:**
  - `motion-in-zone` (warning) เกิดเมื่อ Motion Detection เป็นจริงในห้องที่ซ้อนกับ Zone ที่เปิดอยู่และ **`appliesTo: 'any'` เท่านั้น** (WiFi แยกคนกับสัตว์ไม่ได้ จึง trigger Zone ที่เป็น person หรือ pet อย่างเดียวไม่ได้)
  - source = `simulated` สำหรับ Virtual Link

**M6 เสร็จเมื่อ:**
- vitest ครอบ: Coverage, Readings ผลซ้ำได้และแกว่งมากขึ้นเมื่อคนเดินในวงรี, detector (hysteresis), score (กรณีจับได้, พลาด, เตือนผิด, latency ขอบ 5 s), Placement Plan เลือกตำแหน่งที่ครอบห้องได้มากกว่า
- **ทดสอบด้วยสถานการณ์อย่างน้อย 5 seed:**
  - Link จาก Placement Plan ในห้องนอนแขกของบ้านตัวอย่าง **ผ่านเกณฑ์** ทั้งที่มีคน 3 คนและสัตว์ 1 ตัว
  - วาง Link แย่ๆ (มุมห้อง เส้นสั้น) แล้วต้องเห็นอัตราจับได้ลดลงชัดเจน
- **ตัวตรวจจับไม่ import อะไรจาก `sim/`** ให้ตรวจด้วย test หรือ lint rule

---

## 11. M7 — Link จริง (Observed), Test Session, Live Mirror

### 11.1 Mac RSSI helper (`helper/mac-rssi`, Swift CLI)

- **ทำไมต้องมี:** browser อ่าน WiFi ของเครื่องไม่ได้ จึงต้องมีโปรแกรมเล็กๆ รันบน Mac
- **การอ่านค่า:** `CWWiFiClient.shared().interface()?.rssiValue()` และ `noiseMeasurement()`, `wlanChannel()`
  - poll ที่ 2 Hz (ปรับได้ด้วย `--rate`)
  - macOS รุ่นใหม่อาจต้องอนุญาต Location Services ให้ Terminal เพื่ออ่านข้อมูล WiFi ให้เขียนวิธีตั้งค่าใน README ของ helper
- **การส่งข้อมูล:**
  - เปิด WebSocket server ที่ `ws://127.0.0.1:8787` และส่ง JSON ต่อ Reading: `{ "ts": <ms epoch>, "rssi": -52, "noise": -92, "channel": 36 }`
  - bind เฉพาะ localhost เท่านั้น
- **build/run:** `swift build -c release && .build/release/mac-rssi`
- **ฝั่งแอป:** Link ชนิด `real` เชื่อม WebSocket นี้, แปลงเป็น `Reading` (t = เวลาจริง) แล้วส่งเข้า**ตัวตรวจจับตัวเดียวกับ M6** ถ้าหลุดให้ reconnect ทุก 2 s และแสดงสถานะ เชื่อมต่อแล้ว / ไม่ได้เชื่อมต่อ
- **Android** (ทางเลือก ยังไม่ทำ): `WifiManager.getConnectionInfo().getRssi()` ส่งเข้า WebSocket schema เดียวกัน iPhone อ่าน RSSI ไม่ได้

### 11.2 การตั้ง Pilot จริง

1. ใน twin วาดห้องจริงที่จะทดสอบ (ห้องเล็ก 1 ห้อง) และวาง router ให้ตรงตำแหน่งจริง
2. ใช้ Placement Plan หาตำแหน่ง laptop แล้ววาง laptop จริงตามนั้น
3. สร้าง Link ชนิด `real` → อัด Baseline ตอนห้องว่าง 60 s
4. ทุกครั้งที่ย้ายอุปกรณ์ต้องอัด Baseline ใหม่

### 11.3 Test Session

- **หน้าจอ:** ปุ่ม เริ่ม/หยุด Session และปุ่ม **Activity Mark** ขนาดใหญ่ 3 ปุ่มสำหรับกดระหว่างทดสอบ:
  - **เดิน** (= มีการเคลื่อนไหว)
  - **นิ่ง** (= อยู่ในห้องแต่ไม่ขยับ)
  - **ออกจากห้อง** (= ไม่มีการเคลื่อนไหว)
- **ใช้บนมือถือได้:** ผู้ทดสอบอยู่ในห้อง จึงต้องเปิดหน้านี้บนมือถือผ่าน LAN ได้ (dev server bind `0.0.0.0`) หน้าจอต้องปุ่มใหญ่และกดง่าย
- **การให้คะแนน:**
  - Activity Mark แปลงเป็นช่วงเวลาแทน Ground Truth แล้วใช้ `score.ts` ตัวเดียวกัน
  - ช่วง 3 s หลังกด mark ไม่นับคะแนน เพราะคนกดช้ากว่าเหตุการณ์จริง
- **Export:** JSON ของ Session ที่มี Readings + Marks + verdicts + ผลคะแนน เพื่อนำไปปรับค่า detector ภายหลัง
- **คำศัพท์:** Activity Mark ไม่ใช่ Ground Truth (คำนี้สงวนไว้ให้ sim)

### 11.4 Live Mirror และ Source

- **Live Mirror:** ผล Motion Detection จาก Link จริงแสดงบนห้องที่ตรงกันใน twin **คู่กับ** สิ่งที่จำลอง (ไม่ต้องหยุด sim)
- **ป้าย "ของจริง":** ของจริงต้องมีป้ายชัดเจนตลอด (สีและไอคอนต่างจากของจำลอง แต่ห้ามใช้แดงหรือเหลืองอำพัน) เช่น ขอบห้องเส้นทึบพร้อมป้าย "ของจริง · มีการเคลื่อนไหว" ส่วนของจำลองใช้เส้นประพร้อมป้าย "จำลอง"
- **Alert จาก Link จริง:** source = `observed` และ feed กรองดูเฉพาะของจริงได้

**M7 เสร็จเมื่อ:**
- helper รันบน Mac แล้วแอปแสดง RSSI สด
- มีโหมดจำลอง helper (`--fake` ส่งค่าสุ่มที่แกว่งเมื่อกดปุ่ม) สำหรับ E2E และสำหรับคนที่ไม่มี Mac
- Test Session บันทึก, ให้คะแนน และ export ได้
- เห็น Observed กับ Simulated บนจอพร้อมกัน โดยแยกออกจากกันได้ชัดเจน
- E2E ใช้ fake helper ครอบ: เชื่อมต่อ, อัด Baseline, verdict เปลี่ยน, ป้าย "ของจริง" แสดง, ตัวกรอง Alert

---

## 12. แนวทาง test

- **core:** ใช้ vitest ทุกฟังก์ชัน pure ต้องมี test ที่ assert ค่าจริง ไม่ใช่แค่ "ไม่ throw"
- **E2E:**
  - ใช้ fixture ที่ล้าง localStorage ก่อนทุก test
  - รอ canvas render ให้เสร็จ (`__r3f.gl.info.render.frame > 1`)
  - fail เมื่อมี console.error
- **ตรวจว่า test จับบั๊กได้จริง:** ลองแก้โค้ดให้ผิด (mutation check) แล้ว test ต้อง fail ถ้าไม่ fail แปลว่า test กลวง
- **รันใน browser ที่ถูกซ่อน:** ResizeObserver ไม่ทำงาน ทำให้ canvas ว่าง ให้ทดสอบด้วย Playwright headless หรือ dispatch `resize` event ห้ามสรุปว่าเป็นบั๊กของ R3F
- **test ที่เขียนโดย model ราคาถูก:** ต้องมีคนตรวจ เพราะมักได้ test กลวงหรือข้าม scenario

---

## 13. ข้อจำกัดที่รู้แล้ว และงานหลัง Pilot

| ข้อจำกัด | ผล |
|---|---|
| ไม่มี reflection/multipath ใน PL | ค่าสัมบูรณ์คลาดในห้องโลหะหรือทางเดินยาว (Virtual Link ใช้ noise model แทน) |
| วัสดุใช้ค่า default | ต้อง calibrate จากการวัดจริง |
| Agent เป็นทรงกระบอก | พอสำหรับ RSSI แต่ใช้กับ CSI ไม่ได้ |
| ข้ามชั้นไม่มีช่องบันได | ชั้นบนได้สัญญาณจาก AP ชั้นล่างต่ำกว่าจริงเล็กน้อย |

**งานหลัง Pilot (ยังไม่ทำในสเปกนี้):**
- หาตำแหน่งคนด้วยหลาย Link (RTI)
- ใช้ CSI (ESP32-S3 + esp-csi, Intel AX210 + PicoScenes)
- ตรวจการล้มด้วย WiFi
- กล้องเสมือน (เคารพ `cameraAllowed`)
- ขยายไปทั้งบ้าน (Home Deployment)
- MQTT bridge + Home Assistant (twin สั่งงานบ้านจริง)
