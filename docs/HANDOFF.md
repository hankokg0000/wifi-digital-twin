# Handoff — WiFi Digital Twin

อัปเดต: 2026-11-19 · สำหรับคนที่จะมารับงานต่อ อ่านไฟล์นี้ก่อน แล้วค่อยไป [CONTEXT.md](../CONTEXT.md) (ศัพท์) และ [design.md](design.md) (ออกแบบละเอียด)

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

| งาน | สถานะ | Commit |
|---|---|---|
| Scene editor, simulator, Zone/Alert, UI ops console, propagation + heatmap | ✅ | ถึง `08eab89` |
| **Pilot: Motion Detection ผ่านผนัง (ของจริง)** — Mac อ่าน RSSI จาก hotspot, Baseline, Recording/Replay, Live Mirror, Alert "ของจริง" + filter, `docs/DEMO.md` | ✅ | `e35290a` |
| ปรับภาพ Monitor (ตัดผนังเตี้ย, ซ่อนชั้นบน, ป้ายไม่ทับกัน, สีห้องตามสถานะ, ชื่อภาษาอังกฤษ) | ✅ | `e35290a` |
| **Live Link เฟส 1** — สถานที่ (Site), ห้องด่วน (Quick Room), สวิตช์ ของจริง/จำลอง | ✅ ทดสอบใน browser แล้ว | `694f7f0` |
| **Live Link เฟส 2** — วางอุปกรณ์บนผัง, เส้น Live Link + แถบ Coverage, ห้องที่เฝ้าอัตโนมัติ | 🟡 **เขียนโค้ดแล้ว ยังไม่ commit ยังไม่ได้ลองใน browser ยังไม่มี test** | — |
| **Live Link เฟส 3** — ปรับเทียบ, Signal Health, ป้ายการบัง | ⬜ ยังไม่เริ่ม | — |

- **Branch:** `main` ← `dev` ← `feature/live-link` (ทำงานอยู่บน `feature/live-link`) ทำครบ 3 เฟสแล้ว merge เข้า `dev` แล้วค่อยเข้า `main`
- **Test:** vitest 308 ผ่าน (เฟส 1) · Playwright E2E ยังไม่ได้รันใหม่ตั้งแต่งาน sensing (ต้องรันบน port อื่น ดู §7)
- **Deploy:**
  - Vercel: https://wifi-digital-twin.vercel.app — ได้แค่ simulation เพราะตัวอ่าน RSSI ทำงานเฉพาะใน dev server (`.vercel/` ถูก ignore)
  - เดโมของจริงให้คนอื่นดู: รัน `pnpm dev` บน Mac + `ngrok http 5173` (โดเมน ngrok อนุญาตไว้ใน `vite.config.ts`) สัญญาณมาจาก Mac เครื่องนั้นเครื่องเดียว คนเปิดลิงก์แค่ดู และต้องอัด Baseline ใน browser ตัวเอง
- **ข้อมูลทดสอบค้าง:** `.wdt-data/sites.json` มีสถานที่ "ห้องทดสอบ" (4×5 m) ที่สร้างตอนทดสอบ ลบได้ (ไฟล์นี้ถูก ignore)

---

## 3. รันโปรเจกต์

ต้องใช้ Node 24, pnpm และ macOS (Xcode command line tools: `swiftc`) ถ้าจะอ่าน RSSI จริง เครื่องอื่นจะได้ค่าจำลอง

```bash
pnpm install
pnpm dev          # http://localhost:5173 (เจ้าของมักเปิดค้างไว้ อย่าปิด/ฆ่า)
pnpm test         # vitest
pnpm e2e          # Playwright
pnpm build        # tsc -b && vite build
```

- **โหมดจำลอง:** บ้านตัวอย่าง 2 ชั้น กด "เริ่มเดโม" ให้คน/สัตว์เดิน ดู heatmap และ Alert
- **โหมดของจริง** (ปุ่ม ของจริง/จำลอง ซ้ายบน): เลือกสถานที่หรือ "ห้องใหม่" → อัด Baseline ตอนห้องนิ่ง → เดินผ่านแนว hotspot↔Mac → ขึ้น "มีการเคลื่อนไหว" + Alert ของจริง (บทเดโมเต็มใน `docs/DEMO.md`)

---

## 4. โครงสร้างโค้ด

```
src/core/            pure TypeScript (ไม่มี React/three) — test ใน Node ได้
  scene/             SceneDoc: types, validate, ops (immutable), serialize/parse, sample-house
  sim/               navgrid, A*, populate() สุ่มคน/สัตว์ (ชื่ออังกฤษ), การล้ม, หลบ Zone
  alerts/            computeAlerts() + observedAlertFor() (Alert ของจริง)
  rf/                multi-wall model, traceLink/traceWorld, heatmap, roomCoverage
  sensing/           Motion Detection: Baseline, detector (hysteresis), Recording
  live/              sites.ts (ไม่มี import — plugin ใช้ด้วย), quickRoom.ts, linkGeometry.ts (เฟส 2)
src/ui/
  store/             zustand slices; docSlice มี reality 'sim'|'real' + simStash (โหมดของจริงไม่ autosave ทับผังจริงใน localStorage)
  sensing/           sensingStore (EventSource /api/rssi/stream, Baseline ใน localStorage), SensingPanel, SensingChart
  live/              liveStore (Sites จาก server, การวางอุปกรณ์), LiveDriver, LiveSetup, useLiveLink
  canvas/            R3F: walls, rooms (RoomMesh = Live Mirror), agents, LiveLinkLayer, labels (priority + collision)
  monitor/ edit/ inspector/ tools/ panels/ shell/ rf/ theme/
vite-plugins/
  rssi.ts            dev-only: compile + spawn helper Swift, SSE /api/rssi/stream (status/sites/readings), /api/sites
  sites.ts           isLocalWrite (กัน ngrok เขียน), createSitesStore (.wdt-data/sites.json)
helper/mac-rssi/     rssi.swift (CoreWLAN) → JSON {ts,rssi,noise,channel} ต่อบรรทัด 10 Hz
docs/                HANDOFF (ไฟล์นี้), DEMO (บทเดโม), plans/live-link.md (แผนงานปัจจุบัน), design.md, SPEC.md
```

---

## 5. งานที่กำลังทำ: Live Link

**แผนละเอียด (ไฟล์ ฟังก์ชัน signature เกณฑ์ test): [plans/live-link.md](plans/live-link.md)** ตกลงกับเจ้าของแล้วทุกข้อ ห้ามเปลี่ยนโดยไม่ถาม

### 5.1 สิ่งที่ตกลงกัน (สรุป)
1. วางอุปกรณ์จากแผง "ตรวจจับ WiFi" ในโหมด Monitor: คลิกจุด hotspot แล้วคลิกจุด Mac (วางนอกห้องได้)
2. ตอนจับได้: เส้น + แถบ Coverage เรืองเด่น ห้องที่เส้นผ่านเรืองจาง
3. ห้องที่เฝ้า = ห้องที่เส้นผ่านยาวสุด อัตโนมัติ แก้เองได้
4. ปรับเทียบตอนอัด Baseline (ค่าชดเชย = วัดจริง − twin ทำนาย) แล้วโชว์ "twin ทำนายคนขวางลด X dB / วัดได้ Y dB"
5. ตำแหน่งอุปกรณ์/สถานที่เก็บที่ dev server แชร์ทุกคน แก้ได้จาก localhost เท่านั้น · Baseline แยกต่อ browser
6. ห้องด่วน กว้าง×ยาว + บันทึกเป็นชื่อสถานที่ สลับได้ (ห้องกว้างเห็นแถบ Coverage ว่าคลุมแค่ไหน)
7. สวิตช์ ของจริง/จำลอง
8. ผนังใช้ค่าเริ่มต้น (drywall) ไม่ให้เลือก
9. Signal Health: การ์ดแถวเดียวใต้กราฟ (ไฟ · dBm · คุณภาพ · SNR) กดขยายเป็นเช็กลิสต์ · ป้ายการบังกลางเส้นบนผัง
10. เช็กเครือข่าย: จำ gateway + channel ตอนตั้งค่า เปลี่ยนแล้วขึ้นแดง
11. ระยะ: ก่อนปรับเทียบ "จาก RSSI ≈ X m / บนผัง Y m" · หลังปรับเทียบเตือน "อุปกรณ์อาจถูกย้าย" ถ้าเลื่อน > 6 dB
12. ป้ายการบัง: "−6 dB · บังระดับกลาง" + ขีดอ้างอิง "คน 1 คนขวาง ≈ −X dB (twin)" **ห้ามนับจำนวนคน**
13. เกณฑ์ไฟ: แดง = ไม่มีค่าใหม่ > 2 วิ / เปลี่ยนเครือข่าย / RSSI < −85 · เหลือง = ไม่มี Baseline / < 5 Hz / −75…−85 / แกว่ง > 2 dB ตอนนิ่ง / อุปกรณ์อาจถูกย้าย / ระยะต่าง > 2 เท่า · เขียว = "พร้อมเดโม"

### 5.2 ทำต่อจากตรงนี้ (เรียงลำดับ)
1. **ตรวจเฟส 2 ใน browser** (โหมดของจริง, มีสถานที่):
   - กด "วางตำแหน่งอุปกรณ์" → คลิก 2 จุดได้ทั้ง Plan และ 3D, คลิกขวา/Esc ยกเลิก, ไม่ไปเลือก object อื่น, กล้องยังหมุน/ซูมได้ตอนไม่ได้วาง
   - เส้นกับแถบขึ้นถูกที่, ตอน "มีการเคลื่อนไหว" เส้นและห้องที่เส้นผ่านเรือง, ตอน offline เส้นเป็นเส้นประเทา
   - dropdown ห้องที่เฝ้ามีตัวเลือก "อัตโนมัติ" · ตำแหน่งยังอยู่หลัง reload · เปิดผ่าน ngrok เห็นเส้นเดียวกันแต่ปุ่มกดไม่ได้
   - วางอุปกรณ์นอกห้องแล้วกล้องยังเห็นครบ (bounds รวม radio แล้ว)
2. **เขียน test `src/core/live/linkGeometry.test.ts`** ตามรายการในแผน แล้วทำ mutation check
3. commit เฟส 2
4. **เฟส 3** ตามแผน (plugin ส่ง gateway + poll 5 วิ, calibration.ts, health.ts, BaselineContext, diagnostics, SignalHealthCard, ป้ายการบัง) + test + mutation check
5. อัปเดต `CONTEXT.md` (Site, Quick Room, Calibration Offset, Signal Health, Live Mirror ความหมายใหม่, Monitored Room) และ `docs/DEMO.md` ข้อ 2–3 ให้ใช้ ของจริง → ห้องใหม่ → วางตำแหน่งอุปกรณ์
6. รัน E2E (port อื่น) แก้ที่พัง → merge `feature/live-link` → `dev` (ถามเจ้าของก่อน)

### 5.3 หลัง Live Link (ตกลงทิศทางแล้ว ยังไม่ออกแบบละเอียด)
- **ESP32 เฟสแรก:** เป้าคือ "จับคนนิ่ง" ด้วยการประมวลผลสัญญาณ (CSI, จังหวะหายใจ 0.1–0.5 Hz, FFT) **ไม่ใช้ AI** ใช้ 1–2 บอร์ด แต่ละคู่บอร์ด = 1 Link บนผังด้วยระบบ Live Link นี้
- ตำแหน่งละเอียด/ตรวจคนล้ม ต้องใช้ ML + เก็บข้อมูลจริง ไว้ทีหลัง
- ทางให้ระบบบน cloud แสดงข้อมูลจริง: agent บนเครื่องส่งค่า → realtime relay (เช่น Ably) → หน้าเว็บ Vercel (คุยไว้ ยังไม่ทำ) · ทางเสียบ ESP32 ผ่าน USB + Web Serial ก็เป็นตัวเลือก

---

## 6. คำถามที่ยังค้าง / พักไว้

- **ชื่อโปรเจกต์:** เสนอ WaveTwin (แนะนำ), Kinwave, RippleSense, WaiSense — เจ้าของยังไม่เลือก ยังไม่ได้เช็กเครื่องหมายการค้า/โดเมน
- **ผังจริงจากการสแกน:** พักไว้ ใช้ห้องด่วนแทนก่อน (WiFi สร้างผังเองไม่ได้)
- **Pitch deck:** อยู่ใน claude.ai artifact (เด็ค 11 หน้า "WiFi Digital Twin — Demo & Pilot") มีข้อเสนอค้าง: แก้หน้า 11 เป็นเริ่ม ESP32 1–2 ตัว, เพิ่มหน้า "ช่องทางขาย", เพิ่มหน้าเทียบกับกล้อง/เรดาร์ mmWave
- **บั๊ก/ข้อจำกัดที่รู้แล้ว:**
  - top bar ที่ความกว้าง ~1024 px ปุ่ม Monitor/Edit ชนป้ายสถานะ (มีมาก่อนงาน Live Link; ≥ 1280 px ปกติ)
  - บันไดที่ขึ้นจากชั้นที่ดูอยู่โผล่เหนือระดับตัดผนังใน 3D
  - สีห้องตามสถานะดูจาก state สด ไม่สนว่า Alert ถูกรับทราบแล้วหรือยัง
  - Vite เตือน import ไม่มีนามสกุลใน `vite-plugins/*` (ไม่กระทบการทำงาน)

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
- **RSSI ของจริง:** Mac ชอบสลับกลับไป WiFi ห้องเอง (เช็ก gateway: iPhone hotspot = `172.20.10.1`) ทุกครั้งที่เปลี่ยนเครือข่ายหรือย้ายอุปกรณ์ต้องอัด Baseline ใหม่ · helper ที่ compile แล้วอยู่ `node_modules/.cache/mac-rssi/`
- **โหมดของจริงสลับ doc ใน store:** อย่าเขียน autosave/persist โดยไม่เช็ก `reality === 'sim'` ไม่งั้นผังบ้านตัวอย่างของผู้ใช้จะถูกทับด้วยห้องด่วน
- **id ของห้องด่วนกำหนดตายตัว** (`${siteId}-room`, `-live-tx`, `-live-rx` …) และ Live Link หาจาก id ที่ลงท้าย `-live-tx/-live-rx` ห้ามเปลี่ยนรูปแบบโดยไม่แก้ `liveLinkOf`
- **`src/core/live/sites.ts` ต้องไม่มี import** เพราะ `tsconfig.node.json` (composite) include ไฟล์นี้ให้ plugin ใช้

---

## 8. วิธีทำงานที่ตกลงกับเจ้าของโปรเจกต์

- **สื่อสาร:** คุยภาษาไทย ออกแบบและคุยให้เข้าใจตรงกันก่อนเขียนงานใหม่ ถามเป็นตัวเลือก (choices) และใส่ข้อแนะนำไว้ด้วย
- **ความง่ายของผู้ใช้:** ไม่อยากให้ผู้ใช้ต้องเพิ่มของเองทีละชิ้น ให้กดปุ่มแล้วสุ่มให้
- **ลำดับความสำคัญ:**
  - อยากเห็น demo ก่อน test จำนวนมาก
  - UI ต้องสวยระดับนำเสนอโครงการได้
- **การใช้ AI agent:** ถ้าใช้หลายตัวแบ่งงาน ให้ตัวเก่งสุดวางแผน ตัวกลางเขียนโค้ด ตัวถูกสุดเขียน/รัน test (ใน Claude Code: Opus / Sonnet / Haiku)
  - test ที่ Haiku เขียนต้องตรวจซ้ำ เคยได้ test กลวงและข้าม scenario
  - ควรมี helper และ test ตัวอย่างให้ก่อน แล้วลองแก้โค้ดให้ผิดดูว่า test จับได้จริง (mutation check)
- **ภาษาที่ใช้ในโค้ดและ UI:** ใช้ศัพท์ตาม [CONTEXT.md](../CONTEXT.md) เช่น Reading ไม่ใช่ sample, False Alarm ไม่ใช่ false positive
- **Git:** แตก branch จาก `dev` ต่องาน commit/push เมื่อเจ้าของสั่งเท่านั้น
- **การพูดถึงความสามารถ:** อย่าเคลมเกินจริง เช่น "แม่นกว่ากล้อง/เรดาร์" หรือ "รู้ว่าเป็นใคร" — จุดขายคือครอบคลุมทั้งบ้านด้วยอุปกรณ์น้อย ติดตั้งง่าย ไม่มีกล้อง และเป็นแพลตฟอร์มรวมเซนเซอร์บน twin
