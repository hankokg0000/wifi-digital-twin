# WiFi Digital Twin — Design (Phase 0–1)

สถานะ: Draft · 2026-09-25

## 1. Vision

Digital twin ของ **บ้านทั้งหลัง** สำหรับ **smart home** ที่รับรู้สภาพบ้าน (คนอยู่ไหน, ประตูเปิดไหม, สัญญาณดีไหม) จาก **WiFi sensing + กล้อง** และสั่งงานกลับไปที่บ้านจริงได้ (2-way)

"2-way" มีสองความหมาย และต้องรองรับทั้งคู่:

1. **Sync สองทิศ** — Real → Twin (sensing) และ Twin → Real (สั่ง actuator: ไฟ, แอร์, AP channel/power, แจ้งเตือน)
2. **Sensing สองแหล่ง** — WiFi และกล้องตรวจสอบกันเอง (cross-validate) ห้องที่ไม่มีกล้อง (ห้องนอน, ห้องน้ำ) ใช้ WiFi เป็นหลัก

เริ่มแบบ **sim-first**: ยังไม่มี hardware ทุกอย่างรันในเบราว์เซอร์ก่อน

## 2. หลักการออกแบบ

- **World ≠ Twin.** World คือความจริง (ตอน sim = ground truth) ส่วน Twin คือสิ่งที่ระบบ*ประมาณ*จากเซนเซอร์ ห้ามให้ Twin อ่าน World ตรงๆ ต้องผ่านเซนเซอร์เท่านั้น
- **Virtual sensor = real sensor.** เซนเซอร์เสมือนต้องส่งข้อความ schema เดียวกับของจริง ภายหลังสลับเป็น ESP32/IP cam ได้โดยไม่ต้องแก้ estimator
- **Message bus รูปร่างแบบ MQTT.** ESP32 และ Home Assistant ใช้ MQTT อยู่แล้ว ตอนนี้ใช้ in-memory bus ที่ตั้งชื่อ topic แบบ MQTT แล้วค่อยต่อ broker จริงทีหลัง
- **Core เป็น pure TypeScript** (ไม่มี React/three) ทดสอบได้ใน Node และนำไปใช้ใน bridge ฝั่ง server ได้ในอนาคต
- **Closed loop ใน sim.** คำสั่งจาก Twin (เช่น ลด AP power) ต้องมีผลกับ World แล้วสะท้อนกลับมาทางเซนเซอร์ เพื่อพิสูจน์ว่า 2-way ทำงานก่อนมี hardware

## 3. ศัพท์ (Ubiquitous language)

| คำ | ความหมาย |
|---|---|
| **World** | สถานะจริงของบ้าน (ใน sim = ground truth) |
| **Twin** | สถานะที่ระบบประมาณได้ พร้อม confidence |
| **Layout** | โครงสร้างคงที่: levels, walls, openings, rooms ใช้ร่วมกันทั้ง World และ Twin |
| **Level** | ชั้นของบ้าน มีความสูงพื้นและความหนาพื้น (slab) |
| **Wall** | segment 2D บน level หนึ่ง มีความหนา ความสูง และ material |
| **Opening** | ประตู/หน้าต่างที่ฝังอยู่ใน wall มีสถานะ open/closed |
| **Room** | polygon บน level มี flag `cameraAllowed` |
| **Object** | สิ่งของที่เป็น box (เฟอร์นิเจอร์, ตู้เย็น) มี material |
| **Agent** | สิ่งเคลื่อนที่ (คน, สัตว์) เป็น cylinder เดินตาม path |
| **Radio** | อุปกรณ์ WiFi: AP, client, sensor node |
| **Sensor** | สิ่งที่แปลง World → Reading (WiFi node, camera) |
| **Reading** | ข้อความดิบจากเซนเซอร์ (RSSI ของ link, detection จากกล้อง) |
| **Estimator** | แปลง Reading ทั้งหลาย → Twin state |
| **Actuator** | สิ่งที่รับ Command แล้วเปลี่ยน World (ไฟ, AP config, lock) |
| **Command** | ข้อความจาก Twin → Actuator |

## 4. Architecture

```
┌──────────────────────── UI (React + R3F) ─────────────────────────┐
│ Editor · 3D view · Heatmap overlay · Twin vs World compare panel  │
└───────────────┬───────────────────────────────▲───────────────────┘
                │ edits                         │ state
┌───────────────▼────────────── core (pure TS) ─┴───────────────────┐
│  scene/        Layout + World document, JSON (de)serialize        │
│  rf/           propagation engine (multi-wall), materials, bands  │
│  sim/          clock, agent motion, actuators apply commands      │
│  sensors/      virtual WiFi node, virtual camera  ──► bus         │
│  bus/          in-memory pub/sub, MQTT-style topics               │
│  twin/         estimators (Phase 3) ◄── bus, publishes twin state │
└───────────────────────────────────────────────────────────────────┘
        rf/ heatmap runs in Web Worker (Comlink)
```

Phase 4 เพิ่ม `bridge/` (Node): MQTT broker ↔ bus, Home Assistant integration

## 5. Stack

- Vite + React + TypeScript (strict)
- `@react-three/fiber` + `@react-three/drei` สำหรับ 3D
- `zustand` สำหรับ UI state (document หลักอยู่ใน core)
- Web Worker + `comlink` สำหรับคำนวณ heatmap
- `vitest` สำหรับ core
- ไม่มี backend ใน Phase 0–1

## 6. Coordinate & units

- หน่วย: เมตร, dBm, dB, MHz, วินาที, radian
- three.js convention: **Y-up**, floor plan อยู่บนระนาบ **XZ**
- Wall/room เก็บเป็นพิกัด 2D `(x, z)` ต่อ level ความสูงจริง = `level.elevation + local y`

## 7. Data model (Phase 0)

```ts
type Id = string;
type Vec2 = [x: number, z: number];
type Vec3 = [x: number, y: number, z: number];
type Band = '2.4' | '5';

interface Material {
  id: Id;
  name: string;
  lossDb: Record<Band, number>;   // penetration loss ต่อการทะลุหนึ่งครั้ง
  color: string;                  // สำหรับ render
}

interface Level {
  id: Id;
  name: string;
  elevation: number;              // m, พื้นของชั้นนี้
  height: number;                 // m, พื้นถึงเพดาน
  slabMaterialId: Id;             // พื้น/เพดานระหว่างชั้น
}

interface Wall {
  id: Id;
  levelId: Id;
  a: Vec2; b: Vec2;
  thickness: number;
  height: number;
  materialId: Id;
}

interface Opening {
  id: Id;
  wallId: Id;
  kind: 'door' | 'window';
  offset: number;                 // m จากจุด a ตามแนว wall
  width: number;
  sill: number;                   // m จากพื้น (ประตู = 0)
  height: number;
  materialId: Id;                 // ตอนปิด
  open: boolean;                  // ตอนเปิด = ไม่มี loss
}

interface Room {
  id: Id;
  levelId: Id;
  name: string;
  polygon: Vec2[];
  cameraAllowed: boolean;         // privacy: ห้องนอน/ห้องน้ำ = false
}

interface SceneObject {
  id: Id;
  levelId: Id;
  name: string;
  position: Vec3;                 // center ของฐาน (local ต่อ level)
  size: Vec3;
  rotationY: number;
  materialId: Id;
}

interface Agent {
  id: Id;
  levelId: Id;
  kind: 'person' | 'pet';
  radius: number;                 // person ≈ 0.2
  height: number;                 // person ≈ 1.7
  path: { t: number; p: Vec2 }[]; // waypoint ตามเวลา, loop
  materialId: Id;                 // 'human-body'
}

interface RadioIface {
  band: Band;
  channel: number;
  txPowerDbm: number;             // AP ในบ้านทั่วไป ≈ 20
}

interface Radio {
  id: Id;
  levelId: Id;
  name: string;
  role: 'ap' | 'client' | 'sensor-node';
  position: Vec3;                 // local ต่อ level
  ifaces: RadioIface[];           // dual-band router = 2 ifaces
  antennaGainDbi: number;
}

interface SceneDoc {
  version: 1;
  materials: Material[];
  levels: Level[];
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  objects: SceneObject[];
  agents: Agent[];
  radios: Radio[];
}
```

`Agent`, `Opening.open` และ `Radio.ifaces` คือ **ส่วนที่เปลี่ยนตามเวลา** ของ World ส่วนที่เหลือเป็น Layout

## 8. Propagation engine (Phase 1)

### Model

Multi-wall model (ดัดแปลงจาก COST 231 MWM):

```
PL(d) = FSPL(1 m, f) + 10·n·log10(d)
        + Σ loss(walls/openings ที่ ray ทะลุ)
        + Σ loss(objects ที่ ray ทะลุ)
        + Σ loss(agents ที่ ray ทะลุ)
        + N_floors · loss(slab)

FSPL(1 m, f) = 20·log10(f_MHz) − 27.55      // 2.4 GHz ≈ 40.0 dB, 5.5 GHz ≈ 47.3 dB
RSSI = txPower + gainTx + gainRx − PL
```

- `n = 2.0` เป็นค่าตั้งต้น เพราะนับ loss ของ wall แยกไว้แล้ว ปรับได้ภายหลังตอน calibrate
- Ray = เส้นตรง 3D จาก Tx ถึง Rx ตรวจการทะลุในระนาบ 2D ต่อ level แล้วเช็กความสูงของ ray ณ จุดตัด (ข้ามโต๊ะเตี้ยได้ถ้า ray สูงกว่า)
- Opening ที่เปิดอยู่ = ช่องว่าง ray ที่ผ่านช่องนั้นไม่นับ loss ของ wall
- ไม่มี reflection/diffraction ใน Phase 1 (ข้อจำกัดที่รู้อยู่แล้ว ดู §11)

### Heatmap

- Grid 0.25 m ต่อ level ที่ความสูงรับ 1.0 m
- บ้าน 15×12 m ≈ 2,900 cell/level/AP × ~150 wall segment → เร็วพอสำหรับ real-time ใน worker
- Output: `Float32Array` RSSI → texture บนพื้นแต่ละชั้น ใช้ colormap แบบ perceptually uniform
- คำนวณใหม่เมื่อ layout/radio เปลี่ยน ส่วน agents ที่เคลื่อนที่ recompute เฉพาะ cell ที่ ray ผ่านใกล้ agent (optimization ทำทีหลังถ้าช้า)

### Material defaults (dB ต่อการทะลุหนึ่งครั้ง, ค่าประมาณ)

| Material | 2.4 GHz | 5 GHz |
|---|---|---|
| Drywall | 3 | 4 |
| Wood door | 3 | 4 |
| Brick | 8 | 12 |
| Concrete wall 15 cm | 12 | 18 |
| Concrete slab (พื้น) | 18 | 25 |
| Glass (ธรรมดา) | 2 | 3 |
| Glass low-E | 20 | 25 |
| Wood furniture | 2 | 3 |
| Metal (ตู้เย็น, ตู้เหล็ก) | 25 | 30 |
| Human body | 4 | 6 |

ค่าในตารางเป็นจุดเริ่มต้นที่แก้ไขได้ใน UI Phase 4 จะ calibrate จากข้อมูลวัดจริง

### Sensor noise (เตรียมไว้ใช้ Phase 2)

- Shadow fading: log-normal σ = 4 dB (คงที่ต่อ link จนกว่า layout จะเปลี่ยน)
- Fast fading: Rician (K ≈ 6 dB เมื่อเป็น LOS) / Rayleigh (เมื่อเป็น NLOS) ต่อ sample
- Quantize เป็น 1 dB, clip ที่ −95 dBm (เลียนแบบ ESP32)

## 9. Bus & topics (ร่างไว้ Phase 0, ใช้จริง Phase 2+)

```
home/sensor/wifi/{nodeId}/rssi       { ts, peers: [{ peerId, rssi }] }
home/sensor/camera/{camId}/detect    { ts, detections: [{ cls, bbox, score }] }
home/actuator/{id}/set               { ts, ...command }
home/actuator/{id}/state             { ts, ...state }
home/twin/state                      { ts, agents: [{ id, pos, cov, conf }], openings: [...] }
home/sim/truth                       { ts, ... }   // มีเฉพาะใน sim ใช้สำหรับ evaluation
```

Payload เป็น JSON, `ts` เป็น ms epoch ห้าม estimator subscribe `home/sim/truth`

## 10. Phase scope & acceptance

### Phase 0 — Scene editor

- วาด wall แบบ snap grid บน level, เพิ่ม/ลบ level
- ใส่ประตู/หน้าต่างลงใน wall, toggle open/closed
- วาด room polygon, ตั้ง `cameraAllowed`
- วาง/หมุน/ปรับขนาด object, วาง radio
- Material library: ดูและแก้ค่า loss
- Save/load `SceneDoc` เป็น JSON + มี sample house 2 ชั้นมาให้
- **Done เมื่อ:** สร้างบ้าน 2 ชั้นประมาณ 8 ห้องได้ใน ~10 นาที, reload แล้วได้ scene เดิมแบบ byte-identical, core มี test ครอบ (de)serialize

### Phase 1 — Propagation + moving agents

- Heatmap ต่อ AP และแบบ best-of-all-AP ต่อ level เลือก band ได้ (2.4 / 5 GHz)
- คลิกจุดใดก็ได้แล้วดู RSSI + รายการสิ่งกีดขวางที่ ray ทะลุ (debug view)
- Agent เดินตาม path, sim clock play/pause/speed
- เปิด/ปิดประตูแล้ว heatmap เปลี่ยน
- **Done เมื่อ:** heatmap update < 200 ms หลังแก้ scene บนบ้านตัวอย่าง, test ของ `rf/` ครอบ FSPL, การนับ wall, opening, การข้ามชั้น, ความสูงของ object

## 11. ข้อจำกัดที่รู้ & ทางแก้ในอนาคต

| ข้อจำกัด | ผลกระทบ | ทางแก้ |
|---|---|---|
| ไม่มี reflection/multipath | ห้องที่ล้อมด้วยโลหะ/ทางเดินยาวจะคลาดเคลื่อน | Phase 4: Sionna RT เป็น optional backend (Python) |
| Material ใช้ค่า default | ความแม่นยำสัมบูรณ์ต่ำ | Calibrate จาก walk survey / ESP32 |
| Agent เป็น cylinder | CSI-level sensing ใช้ไม่ได้ | พอสำหรับ RSSI/RTI ส่วน CSI ต้องใช้ ray tracing |

## 12. Roadmap ถัดไป (ยังไม่ต้องออกแบบละเอียด)

- **Phase 2** — Virtual sensors: ESP32 mesh วัด RSSI ระหว่าง node, กล้องเสมือน (frustum + occlusion raycast, detection = ground truth ที่ฉายภาพ + noise, เคารพ `cameraAllowed`)
- **Phase 3** — Estimators: RTI จาก WiFi, triangulation จากกล้อง, fusion ด้วย particle filter, panel เทียบ Twin กับ Truth (position error, detection rate)
- **Phase 4** — Bridge: MQTT broker, ESP32 firmware, IP cam + detector, calibration
- **Phase 5** — 2-way: Home Assistant integration (entities เข้า twin, commands ออก), automation rules บน twin state (เช่น ไม่มีคนในห้อง → ปิดไฟ; สัญญาณอ่อนในห้อง X → แนะนำจุดวาง AP/mesh)

## 13. Open questions

1. ~~บ้านตัวอย่าง~~ → ตัดสินแล้ว: บ้านเดี่ยว 2 ชั้นแบบทั่วไปในไทย (sample)
2. ห้องไหนห้ามมีกล้อง: สมมติ default = ห้องนอน + ห้องน้ำ (ยังไม่ยืนยัน)
3. ~~Band~~ → ตัดสินแล้ว: 2.4 + 5 GHz เท่านั้น
4. Mesh WiFi: สมมติรองรับหลาย AP ตั้งแต่แรก (data model รองรับอยู่แล้ว) — roaming ยังไม่ทำ
