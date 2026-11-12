# WiFi Digital Twin

Digital twin ของบ้านทั้งหลังที่ตรวจจับคนและการเคลื่อนไหวจาก **สัญญาณ WiFi** รวมถึงในห้องที่ไม่มีเซนเซอร์มองเห็นโดยตรง เพราะสัญญาณ WiFi วิ่งทะลุผนังห้องนั้น (Non-line-of-sight Detection) โดยคนในบ้านไม่ต้องพกอุปกรณ์ใดๆ (device-free WiFi Sensing)

โปรเจกต์เริ่มแบบ **sim-first** ทุกอย่างรันใน browser พร้อม simulator คนและสัตว์ เพื่อพัฒนาและวัดผลตัวตรวจจับให้เสร็จก่อนต่ออุปกรณ์จริง

## ทำอะไรได้แล้ว

- **Scene editor:** วาดผนัง ประตู หน้าต่าง ห้อง เฟอร์นิเจอร์ router และบันได บ้านหลายชั้นได้ save/load เป็น JSON มีบ้านตัวอย่าง 2 ชั้นมาให้
- **Simulator:** กดปุ่มเดียวสุ่มคนและสัตว์ให้เดินเองทั้งบ้าน (ขึ้นลงบันไดได้) สุ่มเหตุคนล้มได้ ลาก timeline ย้อนไปมาได้
- **พื้นที่ห้ามเข้า + การแจ้งเตือน:** แจ้งเมื่อมีคนบุกรุก, คนล้ม และคนล้มแล้วไม่ลุกเกิน 60 วินาที
- **WiFi heatmap สด:** โมเดลการลดทอนสัญญาณผ่านผนัง ประตู เฟอร์นิเจอร์ ตัวคน และพื้นระหว่างชั้น (2.4 / 5 GHz) คนเดินบังสัญญาณแล้ว heatmap เปลี่ยนตาม
- **UI แบบ ops console:** โหมด Monitor (ดูสถานการณ์) และ Edit (แก้ผัง)

**งานถัดไป:** Pilot ตรวจจับการเคลื่อนไหวผ่านผนังในห้องเดียว ด้วย router + Mac laptop ดูรายละเอียดใน [docs/HANDOFF.md](docs/HANDOFF.md)

## เริ่มใช้งาน

ต้องมี Node 24 และ pnpm

```bash
pnpm install
pnpm dev
```

เปิด http://localhost:5173 แล้วกด **เริ่มเดโม** มุมขวาบน

| คำสั่ง | ทำอะไร |
|---|---|
| `pnpm dev` | dev server |
| `pnpm test` | unit test (vitest) |
| `pnpm e2e` | E2E test (Playwright) |
| `pnpm build` | typecheck + build production |

## เอกสาร

| ไฟล์ | อ่านเมื่อ |
|---|---|
| [docs/HANDOFF.md](docs/HANDOFF.md) | จะรับงานต่อจากโค้ดนี้: ภาพรวม สถานะ งานถัดไป จุดที่ต้องระวัง |
| [CONTEXT.md](CONTEXT.md) | ศัพท์โดเมน ใช้คำตามนี้ในโค้ดและ UI |
| [docs/design.md](docs/design.md) | ออกแบบละเอียด: data model, propagation model, roadmap |
| [docs/SPEC.md](docs/SPEC.md) | จะสร้างใหม่ทั้งหมดจากเอกสาร มีคำสั่งสำหรับ AI agent ให้สร้างทีละ milestone |

## โครงสร้าง

```
src/core/   pure TypeScript ไม่มี React/three ทดสอบใน Node ได้
  scene/    data model, validate, ops, serialize/parse, บ้านตัวอย่าง
  sim/      navgrid, A*, agent planner, populate
  alerts/   คำนวณการแจ้งเตือน
  rf/       propagation model, heatmap, room coverage
src/ui/     React + react-three-fiber + zustand
e2e/        Playwright
docs/       เอกสารออกแบบ
```

**Stack:** Vite · React 19 · TypeScript · three.js / @react-three/fiber · zustand · Web Worker (comlink) · vitest · Playwright

## หลักการออกแบบ

- **World ≠ Twin:** World คือความจริง (ใน sim) ส่วน Twin คือสิ่งที่ระบบประมาณจากเซนเซอร์ ตัวตรวจจับห้ามอ่านตำแหน่งจริง
- **เซนเซอร์เสมือนเหมือนของจริง:** ตัวตรวจจับใช้ชุดเดียวกันทั้งกับข้อมูลจำลองและข้อมูลจริง
- **ผลซ้ำได้:** ทุกอย่างที่สุ่มใช้ seeded PRNG ใช้ doc + seed เดียวกันได้ผลเดิมเสมอ
- **ของจริงต้องติดป้าย:** ผลจากเซนเซอร์จริงแสดงคู่กับสิ่งที่จำลองได้ แต่ต้องมีป้าย "ของจริง" ชัดเจน
