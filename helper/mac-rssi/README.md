# mac-rssi

โปรแกรมเล็ก ๆ (Swift) ที่อ่านความแรงสัญญาณ WiFi (RSSI) ของเครื่อง Mac นี้ผ่าน CoreWLAN
แล้วพิมพ์ออกมาเป็น JSON หนึ่งบรรทัดต่อครั้ง เช่น `{"ts":1731800000000,"rssi":-58,"noise":-96,"channel":100}`

ไม่ต้องรันเอง: `pnpm dev` จะคอมไพล์ (ไปที่ `node_modules/.cache/mac-rssi/rssi`) และเปิดให้อัตโนมัติ
เมื่อมีหน้าเว็บเชื่อมต่อ แล้วส่งต่อให้แอปผ่าน `/api/rssi/stream`

รันเองด้วยมือ:

```sh
swiftc -O helper/mac-rssi/rssi.swift -o /tmp/rssi
/tmp/rssi --hz 10
```

ถ้าไม่มี WiFi จะพิมพ์ `{"error":"no wifi interface"}` วินาทีละครั้ง
ไม่มี Mac / ไม่มี swiftc: ตั้ง `RSSI_FAKE=1 pnpm dev` เพื่อใช้ข้อมูลจำลอง
