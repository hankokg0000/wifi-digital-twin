# Handoff — WiFi Digital Twin

อัปเดต: 2026-11-12 · สำหรับคนที่จะมารับงานต่อ อ่านไฟล์นี้ก่อน แล้วค่อยไป [CONTEXT.md](../CONTEXT.md) (ศัพท์) และ [design.md](design.md) (ออกแบบละเอียด)

> ถ้าจะสร้างใหม่ทั้งหมดจากเอกสารโดยไม่ใช้โค้ดนี้ ใช้ [SPEC.md](SPEC.md) + [CONTEXT.md](../CONTEXT.md) (มีคำสั่งสำหรับ AI agent อยู่บนหัวไฟล์)

---

## 1. โปรเจกต์นี้คืออะไร ทำไปเพื่ออะไร

**Digital twin ของบ้านทั้งหลัง** ที่ตรวจจับคนและกิจกรรมจาก **สัญญาณ WiFi** (และกล้อง ในห้องที่อนุญาต) รวมถึงในห้องที่ไม่มีเซนเซอร์มองเห็นโดยตรง เพราะสัญญาณ WiFi วิ่งทะลุผนังห้องนั้น

- **แกนหลักคือ WiFi Sensing แบบ device-free:** คนไม่ต้องพกมือถือหรืออุปกรณ์ใด ระบบดูจากการที่ร่างกายรบกวนสัญญาณระหว่างอุปกรณ์ การติดตามมือถือ (Device Tracking) อยู่นอก scope
- **"2-way" มีสองความหมาย:**
  1. sync สองทิศ คือ บ้านจริง → twin (sensing) และ twin → บ้านจริง (สั่งไฟ, แอร์, AP)
  2. sensing สองแหล่ง คือ WiFi กับกล้องตรวจสอบกันเอง ห้องนอนและห้องน้ำห้ามมีกล้อง จึงใช้ WiFi
- **เริ่มแบบ sim-first:** ยังไม่มี hardware ทุกอย่างรันใน browser ก่อน มี simulator คน/สัตว์ให้ทดสอบ
- **ตัวทดสอบหลัก:** web app 3D ใช้งานจริงและนำเสนอโครงการได้ (dark ops console)

> หลักสำคัญ: **World ≠ Twin.** World คือความจริง (ใน sim คือ Ground Truth) ส่วน Twin คือสิ่งที่ระบบประมาณจากเซนเซอร์ ห้ามให้ตัวตรวจจับอ่าน World ตรงๆ และเซนเซอร์เสมือนต้องส่งข้อมูลรูปแบบเดียวกับของจริง

---

## 2. สถานะปัจจุบัน

| Phase | สถานะ | Commit |
|---|---|---|
| 0 — Scene editor (ผนัง, ประตู/หน้าต่าง, ห้อง, ของ, router, หลายชั้น, บันไดบ้าน, save/load JSON) | ✅ เสร็จ | `cea5189` |
| Simulator คน/สัตว์ + Zone ห้ามเข้า + Alert (บุกรุก, ล้ม) | ✅ เสร็จ | `9b112de` |
| Refactor (แยก ops/serialize/parse, store slices) | ✅ เสร็จ | `b145375` |
| UI dark ops console, โหมด Monitor/Edit | ✅ เสร็จ | `0869107` |
| 1 — Propagation multi-wall + heatmap WiFi live | ✅ เสร็จ | `3082505` |
| **Pilot: Motion Detection ผ่านผนัง** | 🟡 ออกแบบ/ตกลงศัพท์เสร็จ ยังไม่เริ่มเขียนโค้ด | — |

**Test ล่าสุดผ่านหมด:** vitest 180, Playwright E2E 29, build

**ยังไม่ commit:** `CONTEXT.md` และไฟล์นี้

---

## 3. รันโปรเจกต์

ต้องใช้ Node 24 และ pnpm

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # vitest (core + store)
pnpm e2e          # Playwright; ใช้ dev server ที่ 5173 ถ้ามีอยู่แล้ว
pnpm build        # tsc -b && vite build
```

แอปเปิดมาที่โหมด **Monitor** โดยมีบ้านตัวอย่าง 2 ชั้นโหลดไว้แล้ว:

- กดปุ่มเพื่อสุ่มคน/สัตว์ แล้วกด play ให้ sim เดิน
- ดู heatmap และ Alert
- สลับไปโหมด **Edit** เพื่อแก้ผัง

---

## 4. โครงสร้างโค้ด

```
src/core/            pure TypeScript (ไม่มี React/three) — test ใน Node ได้
  scene/             SceneDoc: types, validate, ops (immutable), serialize/parse (deterministic), sample-house
  sim/               navgrid 0.2 m, A*, บันได, populate() สุ่มคน/สัตว์, roam/wander, การล้ม, หลบ Zone
  alerts/            computeAlerts() — มี seam `stateAt` ไว้สลับจาก ground truth เป็นค่าที่ประมาณได้
  rf/                multi-wall model: FSPL(1m) + 10·n·log10(d) + loss ต่อการทะลุ wall/opening/object/คน/พื้น, heatmap, roomCoverage
src/ui/
  store/             zustand slices (doc, view, mode, alerts, heatmap); apply(fn, {coalesce}) = undo ได้
  canvas/            R3F scene: walls, rooms, agents, HeatmapLayer (DataTexture), CameraRig
  monitor/           แผงโหมด Monitor: SimControls, AlertsFeed, Occupants, Zones, Signal, Timeline
  edit/ inspector/ tools/ panels/   โหมด Edit
  rf/                colormap (indigo→mint, −90…−30 dBm), legend
  theme/             OKLCH tokens (สีแดง/เหลืองอำพันสงวนไว้สำหรับ Alert เท่านั้น)
e2e/                 Playwright specs (*.e2e.ts) + helpers.ts
docs/design.md       ออกแบบละเอียด Phase 0–1, data model, propagation, roadmap
CONTEXT.md           ศัพท์โดเมน (glossary) — ใช้คำตามนี้ในโค้ดและ UI
```

**Stack:**

- Vite 8, React 19, TypeScript strict
- @react-three/fiber 9.8 + drei 10, zustand 5
- comlink (worker), lucide-react, ฟอนต์ IBM Plex Sans Thai/Mono
- vitest, Playwright

---

## 5. งานถัดไป: Pilot — Motion Detection ผ่านผนัง

ผ่าน grilling session แล้ว ตกลงกันดังนี้ (ศัพท์ทั้งหมดดูใน [CONTEXT.md](../CONTEXT.md))

### 5.1 ขอบเขต

- **ห้องเล็ก 1 ห้อง** (Monitored Room) มี 1 Link:
  - **Transmitter** = router ที่บ้าน
  - **Receiver** = Mac laptop อ่าน RSSI (iPhone อ่าน RSSI ไม่ได้ ส่วน Android ใช้ได้)
- **เป้าหมาย:** Motion Detection ตอบใช่/ไม่ ต่อหน้าต่างเวลาว่ามีอะไรเคลื่อนไหวในห้อง
  - แยกคนกับสัตว์ไม่ได้
  - "ไม่มีการเคลื่อนไหว" ≠ "ห้องว่าง" (คนนอนหลับหรือล้มอยู่ก็นิ่ง)
- **หลักการ:**
  - เทียบความแกว่งของ Readings กับ **Baseline** ที่อัดไว้ตอนห้องว่าง
  - อัด Baseline ใหม่ทุกครั้งที่ย้ายอุปกรณ์
  - ใช้ hysteresis กันการกะพริบ
- **วางอุปกรณ์:** ให้ Coverage ของ Link อยู่ในห้องเป้าหมาย ส่วนตัวอุปกรณ์จะอยู่นอกห้องก็ได้
- **เกณฑ์ผ่าน:**
  - จับได้ ≥ 90% ภายใน 5 วินาที
  - False Alarm ≤ 1 ครั้งต่อชั่วโมง

### 5.2 บทบาทของ twin

| บทบาท | ทำอะไร |
|---|---|
| **Placement Plan** | แนะนำตำแหน่ง Transmitter/Receiver ให้ Coverage ครอบห้องเป้าหมาย |
| **Virtual Link** | sim สร้าง Readings จากคนจำลอง ใช้พัฒนาตัวตรวจจับและวัดผลเทียบ Ground Truth ก่อนมีของจริง โดยใช้ **ตัวตรวจจับตัวเดียวกัน** กับ Link จริง |
| **Live Mirror** | แสดงผลจริงบนห้องใน twin คู่กับ Simulated Activity โดยของจริง (**Observed**) ต้องมีป้ายบอกชัดเจน |
| **Alert Source** | ทุก Alert มีป้าย Simulated/Observed และกรองดูเฉพาะ Observed ได้ |
| **Zone** | Motion Detection จาก WiFi trigger ได้เฉพาะ Zone ที่ใช้กับ "ทุกอย่าง" (any) เพราะแยกคน/สัตว์ไม่ได้ |
| **Test Session** | ตอนทดสอบของจริง คนทดสอบกดปุ่ม **Activity Mark** ("เดิน" / "นิ่ง" / "ออกจากห้อง") เป็นความจริงไว้ให้คะแนน |

**Ground Truth สำหรับให้คะแนน:** ถ้ามีอะไรเคลื่อนไหว **ที่ใดก็ได้ในห้อง** ถือว่ามีการเคลื่อนไหว ไม่จำกัดเฉพาะใกล้เส้น Link ดังนั้นการวางอุปกรณ์ไม่ดีจะถูกนับเป็น Missed Detection

### 5.3 แผนลงมือ (เสนอ ยังไม่เริ่ม)

1. เขียน pilot spec ลง `docs/design.md` (ขอบเขต + เกณฑ์ผ่านด้านบน)
2. **Virtual Link** ใน `src/core/`:
   - สร้าง Readings จาก rf model + model ความแกว่ง (multipath/fading) เมื่อมีคนอยู่ใกล้เส้นทางสัญญาณ (Fresnel zone)
   - มี noise ของเซนเซอร์
   - ใช้ seeded RNG ให้ผลซ้ำได้
3. **Motion Detection** (pure TS):
   - variance ต่อหน้าต่างเวลาเทียบกับ Baseline
   - มี hysteresis
4. **ตัววัดผล:** Missed Detection / False Alarm / latency เทียบ Ground Truth
5. **UI:**
   - วาง Link
   - Placement Plan overlay
   - ปุ่มอัด Baseline
   - สถานะ Motion บนห้อง
   - ป้าย Source บน Alert พร้อม filter
   - หน้าจอ Test Session ที่มีปุ่ม Activity Mark
6. **ตัวอ่านค่าจริง:**
   - browser อ่าน WiFi ของเครื่องไม่ได้ จึงต้องมีโปรแกรมเล็กๆ บน Mac (CoreWLAN, Swift) อ่าน RSSI แล้วส่งเข้าแอป (เช่นผ่าน WebSocket บน localhost)
   - Android ใช้ `WifiInfo.getRssi()`

### 5.4 ยังไม่ตัดสิน (ไว้หลัง pilot)

- หาตำแหน่งคนด้วยหลาย Link (RTI)
- ใช้ CSI (ESP32-S3 + esp-csi, Intel AX210 + PicoScenes) แทน RSSI เพื่อความไว
- ตรวจการล้มด้วย WiFi
- ขยายไปทั้งบ้าน (Home Deployment)
- อาจเขียน ADR เรื่อง "WiFi Sensing = device-free เท่านั้น" (เสนอไว้แล้ว ผู้ใช้ยังไม่ตอบ)

---

## 6. คำถามที่ยังค้าง

1. **การสแกนห้องเพื่อสร้างผัง:**
   - แนะนำ Apple RoomPlan (iPhone/iPad ที่มี LiDAR) ซึ่งได้ผนัง ประตู หน้าต่าง และของเป็น parametric
   - ทางสำรองคือ trace จากแบบแปลน
   - WiFi สร้างผังห้องเองไม่ได้
   - ยังไม่ได้ถามว่ามีอุปกรณ์ LiDAR หรือแบบแปลนไหม
2. ห้องที่ห้ามมีกล้อง: สมมติไว้ว่าเป็นห้องนอน + ห้องน้ำ (ยังไม่ยืนยัน)
3. **บั๊กเล็กที่รู้แล้วแต่ยังไม่แก้:**
   - "สมชาย" เกิดในห้องนอนใหญ่ซึ่งเป็น Zone ห้ามเข้า เพราะบ้านตัวอย่าง populate ก่อนเพิ่ม Zone
   - ไอคอน router ทับป้ายชื่อห้องนั่งเล่น

---

## 7. ข้อควรรู้ / กับดัก

- **Canvas ว่างใน browser pane ที่ซ่อนอยู่:** ResizeObserver ไม่ทำงาน แก้ด้วย `window.dispatchEvent(new Event('resize'))` หรือทดสอบผ่าน Playwright headless (ตั้ง swiftshader ไว้แล้วใน `playwright.config.ts`) อย่าโทษ R3F
- **Dev hooks:**
  - `window.__sceneStore` คือ zustand store
  - `window.__r3f` ใช้ `__r3f.get()` ได้ camera/gl
  - E2E ใช้สองตัวนี้ project พิกัดโลก → พิกัดจอ (`e2e/helpers.ts`: `worldToScreen`, `clickWorld`, `dragWorld`)
- **Fixture ของ E2E:** test จะ fail ทันทีถ้ามี `pageerror` หรือ `console.error` ที่ไม่ได้อนุญาต
- **ถ้ามี dev server ของคนอื่นรันที่ 5173 อยู่:** ให้รัน E2E บน port อื่นด้วย config ชั่วคราวที่ตั้ง `reuseExistingServer: false` และปิด server ตัวเองบน port นั้นก่อน
- **Rendering:**
  - Shape ของห้องต้องใช้ −z ไม่งั้นกลับด้าน
  - ป้ายชื่อใช้ DOM overlay (`LabelsOverlay`) ไม่ใช้ drei `Html` เพราะ crash และขนาดเพี้ยนในมุมมอง ortho
  - ใน plan view ตัดที่ความสูง 1.2 m เพื่อให้เห็นประตู
- **Alert noise:** เริ่มแรกเกิด ~40 ครั้งต่อชั่วโมง แก้แล้วเหลือ ~9 โดย:
  - spawn เฉพาะในบ้าน
  - navgrid หลบ Zone
  - ใช้ sample แรกเป็น baseline
  - `RESTRICTED_VISIT_CHANCE = 0.1`

  ถ้าแก้ sim ระวังค่ากลับมาเพิ่ม
- **Determinism:** sim ใช้ seeded mulberry32 ส่วน serialize เป็น byte-identical อย่าใส่ `Math.random()` หรือ key ที่ไม่เรียงลำดับ

---

## 8. วิธีทำงานที่ตกลงกับเจ้าของโปรเจกต์

- **สื่อสาร:** คุยภาษาไทย ออกแบบและคุยให้เข้าใจตรงกันก่อนเขียนงานใหม่ ถามเป็นตัวเลือก (choices) และใส่ข้อแนะนำไว้ด้วย
- **ความง่ายของผู้ใช้:** ไม่อยากให้ผู้ใช้ต้องเพิ่มของเองทีละชิ้น ให้กดปุ่มแล้วสุ่มให้
- **ลำดับความสำคัญ:**
  - อยากเห็น demo ก่อน test จำนวนมาก
  - UI ต้องสวยระดับนำเสนอโครงการได้
- **การใช้ AI agent:** ถ้าใช้หลายตัวแบ่งงาน ให้ Opus วางแผน, Sonnet เขียนโค้ด, Haiku เขียนและรัน test
  - test ที่ Haiku เขียนต้องตรวจซ้ำ เคยได้ test กลวงและข้าม scenario
  - ควรมี helper และ test ตัวอย่างให้ก่อน แล้วลองแก้โค้ดให้ผิดดูว่า test จับได้จริง (mutation check)
- **ภาษาที่ใช้ในโค้ดและ UI:** ใช้ศัพท์ตาม [CONTEXT.md](../CONTEXT.md) เช่น Reading ไม่ใช่ sample, False Alarm ไม่ใช่ false positive
