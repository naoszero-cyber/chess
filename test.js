'use strict';
const assert = require('assert');
const Game = require('./public/game.js');

// 1) ตั้งต้น: 48 ตัว, ทางเดินเริ่มต้นของแดง
const s = Game.newGame();
let count = 0; s.board.forEach(r => r.forEach(c => { if (c) count++; }));
assert.strictEqual(count, 48);
let total = 0;
for (let f = 0; f < 8; f++) for (let r = 0; r < 2; r++) total += Game.legalMoves(s, r, f).length;
console.log('แดงมีทางเดินเริ่มต้น', total, 'ทาง');
assert.ok(total > 0);

// 2) เบี้ยข้ามศูนย์กลาง: เบี้ยแดงที่ (3,f) เดินตรงไปโผล่ (3,f+12) ทิศออกนอก
const t = Game.newGame();
t.board = t.board.map(r => r.map(() => null));
t.board[3][2] = { t: 'p', o: 0, d: 1 };
t.board[0][4] = { t: 'k', o: 0 }; t.board[0][12] = { t: 'k', o: 1 }; t.board[0][20] = { t: 'k', o: 2 };
let r = Game.applyMove(t, 0, [3, 2], [3, 14]);
assert.ok(r.ok, JSON.stringify(r));
assert.strictEqual(t.board[3][14].d, -1);

// 3) เรือทะลุศูนย์กลางจับของฝั่งตรงข้าม
const u = Game.newGame();
u.board = u.board.map(r => r.map(() => null));
u.board[1][2] = { t: 'r', o: 0 };
u.board[1][14] = { t: 'p', o: 1, d: 1 };
u.board[0][4] = { t: 'k', o: 0 }; u.board[0][12] = { t: 'k', o: 1 }; u.board[0][20] = { t: 'k', o: 2 };
const mv = Game.moves(u.board, 1, 2);
assert.ok(mv.some(m => m[0] === 1 && m[1] === 14), 'เรือต้องจับผ่านศูนย์กลางได้');

// 4) จับคิง = ตกรอบ หมากหายหมด
const v = Game.newGame();
v.board = v.board.map(r => r.map(() => null));
v.board[2][5] = { t: 'r', o: 0 };
v.board[0][5] = { t: 'k', o: 1 };   // เรือแดงจับคิงน้ำเงินตรงๆ ผ่านไฟล์เดียวกัน
v.board[0][4] = { t: 'k', o: 0 }; v.board[0][20] = { t: 'k', o: 2 };
v.board[1][12] = { t: 'p', o: 1, d: 1 };
const rr = Game.applyMove(v, 0, [2, 5], [0, 5]);
assert.ok(rr.ok && rr.eliminated === 1, JSON.stringify(rr));
assert.strictEqual(v.alive[1], false);
assert.ok(v.board.every(row => row.every(c => !c || c.o !== 1)), 'หมากน้ำเงินต้องหายหมด');
assert.strictEqual(v.turn, 2, 'ตาต้องข้ามน้ำเงินไปเขียว');

// 5) สุ่มเล่นหลายเกม: ไม่พังและตัวนับหมากไม่เกิน
let finished = 0, maxMoves = 0;
for (let g = 0; g < 200; g++) {
  const st = Game.newGame();
  let n = 0;
  while (!st.over && n < 4000) {
    const all = [];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 24; b++) {
      const pc = st.board[a][b];
      if (pc && pc.o === st.turn) Game.moves(st.board, a, b).forEach(m => all.push([[a, b], m]));
    }
    assert.ok(all.length > 0, 'ผู้เล่นที่ถึงตาต้องมีทางเดิน');
    const [from, to] = all[Math.floor(Math.random() * all.length)];
    const res = Game.applyMove(st, st.turn, from, to);
    assert.ok(res.ok, JSON.stringify(res));
    n++;
  }
  if (st.over) finished++;
  maxMoves = Math.max(maxMoves, n);
  let c2 = 0; st.board.forEach(r => r.forEach(c => { if (c) c2++; }));
  assert.ok(c2 <= 48);
}
console.log('สุ่มเล่น 200 เกม จบเอง', finished, 'เกม (ยาวสุด', maxMoves, 'ตา)');
console.log('ผ่านทุกการทดสอบกติกา');
