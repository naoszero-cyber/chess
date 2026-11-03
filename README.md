# หมากรุก 3 คน ออนไลน์

Node.js + WebSocket (`ws`) — เซิร์ฟเวอร์ตัวเดียว เก็บห้องไว้ในหน่วยความจำ ไม่ต้องใช้ฐานข้อมูล

## รันในเครื่อง
```
npm install
npm start        # เปิดที่ http://localhost:3000
npm test         # ทดสอบกติกา
```

## Deploy (SnapDeploy)
- Build: `npm install`   Start: `npm start`
- อ่านพอร์ตจาก `PORT` อัตโนมัติ และฟังที่ `0.0.0.0`
- Health check: `GET /healthz`
- ใช้ได้เฉพาะแบบ instance เดียว (ห้องอยู่ในหน่วยความจำ) ห้ามตั้งให้ scale หลาย instance
- โฮสต์ต้องรองรับ WebSocket (เว็บใช้ `wss://` อัตโนมัติเมื่อเปิดผ่าน https)

## โครงสร้าง
- `server.js` — HTTP + WebSocket, ห้อง, ตา, ตัดสินผู้เล่นที่หลุด (90 วินาที)
- `public/game.js` — กติกาทั้งหมด (ใช้ร่วมกันทั้งเซิร์ฟเวอร์และเบราว์เซอร์)
- `public/index.html`, `public/client.js` — หน้าเว็บ + วาดกระดานด้วย canvas
