'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const Game = require('./public/game.js');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};
const PIECE_TH = { k: 'คิง', q: 'ควีน', r: 'เรือ', b: 'บิชอป', n: 'ม้า', p: 'เบี้ย' };
const COLOR_TH = ['แดง', 'น้ำเงิน', 'เขียว'];
const ABSENT_MS = 90 * 1000;       // ผู้เล่นหลุดเกินเวลานี้ตอนถึงตา = ตกรอบ
const ROOM_IDLE_MS = 15 * 60 * 1000;

// ---------- HTTP (ไฟล์ static) ----------
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent((req.url || '/').split('?')[0]); } catch (e) { res.writeHead(400); return res.end(); }
  if (p === '/healthz') { res.writeHead(200); return res.end('ok'); }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUB, p));
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('ไม่พบหน้านี้'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------- ห้อง ----------
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}
const send = (ws, obj) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };
const cleanName = n => (String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16)) || 'ผู้เล่น';
const nameOf = (room, i) => (room.seats[i] ? room.seats[i].name : '?') + ' (' + COLOR_TH[i] + ')';
const addLog = (room, text) => { room.log.push(text); if (room.log.length > 60) room.log.shift(); };

function snapshot(room, you) {
  const s = room.state, pieces = [];
  if (s) for (let r = 0; r < 4; r++) for (let f = 0; f < 24; f++) {
    const pc = s.board[r][f];
    if (pc) pieces.push({ r, f, t: pc.t, o: pc.o, d: pc.d || 0 });
  }
  return {
    t: 'state', code: room.code, status: room.status, you,
    players: room.seats.map(x => (x ? { name: x.name, connected: x.connected } : null)),
    turn: s ? s.turn : null, alive: s ? s.alive : [true, true, true],
    winner: s ? s.winner : null, draw: s ? !!s.draw : false, last: s ? s.last : null,
    pieces, log: room.log.slice(-40),
  };
}
function broadcast(room) {
  room.lastActive = Date.now();
  room.seats.forEach((st, i) => { if (st && st.ws) send(st.ws, snapshot(room, i)); });
}

function armTimer(room) {
  clearTimeout(room.timer);
  room.timer = null;
  if (room.status !== 'playing') return;
  const turn = room.state.turn, seat = room.seats[turn];
  if (seat && !seat.connected) {
    room.timer = setTimeout(() => {
      if (room.status === 'playing' && room.state.turn === turn && room.seats[turn] && !room.seats[turn].connected) {
        addLog(room, `⏱ ${nameOf(room, turn)} หลุดการเชื่อมต่อนานเกินไป จึงตกรอบ`);
        doResign(room, turn);
      }
    }, ABSENT_MS);
  }
}

function afterState(room, res) {
  const s = room.state;
  (res.passed || []).forEach(p => addLog(room, `⏭ ${nameOf(room, p)} ไม่มีทางเดิน ข้ามตา`));
  if (s.over) {
    room.status = 'over';
    addLog(room, s.draw ? '🤝 เกมจบ: เสมอ' : `🏆 ${nameOf(room, s.winner)} ชนะ!`);
  }
  broadcast(room);
  armTimer(room);
}

function doResign(room, i) {
  if (room.status !== 'playing' || !room.state.alive[i]) return;
  const res = Game.resign(room.state, i);
  afterState(room, res);
}

function startGame(room) {
  room.state = Game.newGame();
  room.status = 'playing';
  room.log = [`▶ เริ่มเกม! ${nameOf(room, 0)} เดินก่อน`];
  broadcast(room);
  armTimer(room);
}

function detach(ws) {
  const m = ws.meta;
  ws.meta = null;
  if (!m) return null;
  const room = rooms.get(m.code);
  if (!room) return null;
  const seat = room.seats[m.seat];
  if (!seat || seat.ws !== ws) return null;
  return { room, seatIdx: m.seat, seat };
}

// ผู้เล่นหลุด (ปิดแท็บ/เน็ตหลุด)
function onDisconnect(ws) {
  const d = detach(ws);
  if (!d) return;
  const { room, seatIdx, seat } = d;
  seat.ws = null; seat.connected = false;
  if (room.status === 'waiting') {
    room.seats[seatIdx] = null;
    if (!room.seats.some(Boolean)) { rooms.delete(room.code); return; }
  }
  broadcast(room);
  armTimer(room);
}

// ผู้เล่นกด "ออกจากห้อง"
function onLeave(ws) {
  const d = detach(ws);
  if (!d) return;
  const { room, seatIdx, seat } = d;
  seat.ws = null; seat.connected = false; seat.token = null;
  if (room.status === 'waiting') {
    room.seats[seatIdx] = null;
    if (!room.seats.some(Boolean)) { rooms.delete(room.code); return; }
    broadcast(room);
  } else if (room.status === 'playing') {
    addLog(room, `🚪 ${nameOf(room, seatIdx)} ออกจากเกม`);
    doResign(room, seatIdx);
  } else broadcast(room);
}

const handlers = {
  create(ws, msg) {
    if (ws.meta) onLeave(ws);
    const code = genCode();
    const token = crypto.randomBytes(12).toString('hex');
    const room = { code, seats: [null, null, null], status: 'waiting', state: null, log: [], timer: null, lastActive: Date.now() };
    room.seats[0] = { name: cleanName(msg.name), token, ws, connected: true };
    rooms.set(code, room);
    ws.meta = { code, seat: 0 };
    send(ws, { t: 'joined', code, seat: 0, token });
    addLog(room, `🏠 ${nameOf(room, 0)} สร้างห้อง ${code}`);
    broadcast(room);
  },
  join(ws, msg) {
    const code = String(msg.code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return send(ws, { t: 'error', msg: 'ไม่พบห้องรหัส ' + code });
    if (room.status !== 'waiting') return send(ws, { t: 'error', msg: 'ห้องนี้เริ่มเล่นแล้ว' });
    const idx = room.seats.findIndex(x => !x);
    if (idx < 0) return send(ws, { t: 'error', msg: 'ห้องเต็มแล้ว' });
    if (ws.meta) onLeave(ws);
    const token = crypto.randomBytes(12).toString('hex');
    room.seats[idx] = { name: cleanName(msg.name), token, ws, connected: true };
    ws.meta = { code, seat: idx };
    send(ws, { t: 'joined', code, seat: idx, token });
    addLog(room, `👋 ${nameOf(room, idx)} เข้าห้อง`);
    if (room.seats.every(Boolean)) startGame(room); else broadcast(room);
  },
  rejoin(ws, msg) {
    const room = rooms.get(String(msg.code || '').toUpperCase());
    const idx = room ? room.seats.findIndex(x => x && x.token && x.token === msg.token) : -1;
    if (idx < 0) return send(ws, { t: 'rejoin_failed' });
    const seat = room.seats[idx];
    if (seat.ws && seat.ws !== ws) { seat.ws.meta = null; try { seat.ws.close(); } catch (e) { /* ignore */ } }
    seat.ws = ws; seat.connected = true;
    ws.meta = { code: room.code, seat: idx };
    send(ws, { t: 'joined', code: room.code, seat: idx, token: seat.token });
    broadcast(room);
    armTimer(room);
  },
  list(ws) {
    const list = [];
    for (const room of rooms.values()) {
      if (room.status !== 'waiting') continue;
      const n = room.seats.filter(Boolean).length;
      if (n < 3) list.push({ code: room.code, host: room.seats.find(Boolean).name, count: n });
      if (list.length >= 20) break;
    }
    send(ws, { t: 'rooms', list });
  },
  move(ws, msg) {
    const m = ws.meta; if (!m) return;
    const room = rooms.get(m.code);
    if (!room || room.status !== 'playing') return;
    if (!Array.isArray(msg.from) || !Array.isArray(msg.to)) return;
    const res = Game.applyMove(room.state, m.seat, msg.from, msg.to);
    if (!res.ok) { send(ws, { t: 'error', msg: res.error }); return send(ws, snapshot(room, m.seat)); }
    if (res.captured) {
      const who = nameOf(room, m.seat);
      if (res.eliminated !== null) addLog(room, `💥 ${who} จับคิงของ ${nameOf(room, res.eliminated)} — ตกรอบ!`);
      else addLog(room, `${who} จับ${PIECE_TH[res.captured.t]}ของ ${nameOf(room, res.captured.o)}`);
    }
    if (res.promoted) addLog(room, `👑 เบี้ยของ ${nameOf(room, m.seat)} เลื่อนเป็นควีน`);
    afterState(room, res);
  },
  resign(ws) {
    const m = ws.meta; if (!m) return;
    const room = rooms.get(m.code);
    if (!room || room.status !== 'playing') return;
    addLog(room, `🏳 ${nameOf(room, m.seat)} ยอมแพ้`);
    doResign(room, m.seat);
  },
  rematch(ws) {
    const m = ws.meta; if (!m) return;
    const room = rooms.get(m.code);
    if (!room || room.status !== 'over') return;
    if (!room.seats.every(x => x && x.connected)) return send(ws, { t: 'error', msg: 'ผู้เล่นยังไม่ครบ 3 คน' });
    startGame(room);
  },
  leave(ws) { onLeave(ws); send(ws, { t: 'left' }); },
};

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, maxPayload: 4096 });
wss.on('connection', ws => {
  ws.isAlive = true; ws.meta = null; ws.msgCount = 0;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
    if (!msg || typeof msg.t !== 'string' || !Object.prototype.hasOwnProperty.call(handlers, msg.t)) return;
    ws.msgCount++;
    if (ws.msgCount > 20) return; // กันสแปม (รีเซ็ตทุกวินาที)
    try { handlers[msg.t](ws, msg); } catch (e) { console.error('handler error', e); }
  });
  ws.on('close', () => onDisconnect(ws));
  ws.on('error', () => {});
});
setInterval(() => wss.clients.forEach(c => { c.msgCount = 0; }), 1000);
setInterval(() => wss.clients.forEach(c => {
  if (!c.isAlive) return c.terminate();
  c.isAlive = false; try { c.ping(); } catch (e) { /* ignore */ }
}), 30000);
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyone = room.seats.some(x => x && x.connected);
    if (!anyone && now - room.lastActive > ROOM_IDLE_MS) { clearTimeout(room.timer); rooms.delete(code); }
  }
}, 60000);

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => console.log('Three-player chess on port ' + PORT));
}
module.exports = { server, wss, rooms };
