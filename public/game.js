/* กติกาหมากรุก 3 คน (ใช้ร่วมกันทั้งเซิร์ฟเวอร์และเบราว์เซอร์)
 * กระดาน: 4 แถว (r: 0=ขอบนอก ... 3=ใกล้ศูนย์กลาง) x 24 ไฟล์ (f) เรียงเป็นวงกลม = 96 ช่อง
 * ผู้เล่น p ครอง f = 8p .. 8p+7  (แถว 0 = หมากหลัก, แถว 1 = เบี้ย)
 * เดินผ่านจุดศูนย์กลางได้: ออกจากแถว 3 ไปด้านตรงข้าม (f+12) แล้ววิ่งออกด้านนอก */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Game = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const RANKS = 4, FILES = 24;
  const BACK = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

  function newGame() {
    const board = [];
    for (let r = 0; r < RANKS; r++) board.push(new Array(FILES).fill(null));
    for (let p = 0; p < 3; p++) {
      for (let i = 0; i < 8; i++) {
        board[0][p * 8 + i] = { t: BACK[i], o: p };
        board[1][p * 8 + i] = { t: 'p', o: p, d: 1 };
      }
    }
    return { board, turn: 0, alive: [true, true, true], over: false, draw: false, winner: null, last: null };
  }

  // เดิน 1 ก้าวในทิศ (dr, df); dr>0 = เข้าหาศูนย์กลาง. ข้ามศูนย์กลางแล้วทิศ dr กลับด้าน
  function step(r, f, dr, df) {
    let nr = r + dr, nf = f + df, ndr = dr;
    if (nr < 0) return null;
    if (nr > RANKS - 1) { nr = RANKS - 1; nf += 12; ndr = -dr; }
    nf = ((nf % FILES) + FILES) % FILES;
    return { r: nr, f: nf, dr: ndr, df };
  }

  function slide(board, r, f, dirs, owner, out) {
    for (const [dr0, df0] of dirs) {
      let cur = { r, f, dr: dr0, df: df0 };
      for (let i = 0; i < 48; i++) {
        const s = step(cur.r, cur.f, cur.dr, cur.df);
        if (!s || (s.r === r && s.f === f)) break;
        const occ = board[s.r][s.f];
        if (occ) { if (occ.o !== owner) out.push([s.r, s.f]); break; }
        out.push([s.r, s.f]);
        cur = s;
      }
    }
  }

  function knightTargets(r, f) {
    const res = [];
    for (const a of [1, -1]) for (const b of [1, -1]) {
      const seqs = [
        [['f', a], ['f', a], ['l', b]],
        [['f', a], ['l', b], ['l', b]],
        [['l', b], ['l', b], ['f', a]],
        [['l', b], ['f', a], ['f', a]],
      ];
      for (const seq of seqs) {
        let cr = r, cf = f, dr = null, ok = true;
        for (const [axis, sg] of seq) {
          if (axis === 'f') {
            const s = step(cr, cf, dr === null ? sg : dr, 0);
            if (!s) { ok = false; break; }
            cr = s.r; cf = s.f; dr = s.dr;
          } else { cf = (cf + sg + FILES) % FILES; dr = null; }
        }
        if (ok && !(cr === r && cf === f)) res.push([cr, cf]);
      }
    }
    return res;
  }

  // ช่องที่หมากที่ (r,f) ไปได้ (ไม่มีกฎเช็ค)
  function moves(board, r, f) {
    const pc = board[r][f];
    if (!pc) return [];
    const out = [];
    switch (pc.t) {
      case 'r': slide(board, r, f, ORTHO, pc.o, out); break;
      case 'b': slide(board, r, f, DIAG, pc.o, out); break;
      case 'q': slide(board, r, f, ORTHO.concat(DIAG), pc.o, out); break;
      case 'n': for (const [tr, tf] of knightTargets(r, f)) { const o = board[tr][tf]; if (!o || o.o !== pc.o) out.push([tr, tf]); } break;
      case 'k': for (const [dr, df] of ORTHO.concat(DIAG)) { const s = step(r, f, dr, df); if (s) { const o = board[s.r][s.f]; if (!o || o.o !== pc.o) out.push([s.r, s.f]); } } break;
      case 'p': {
        const d = pc.d || 1;
        const s = step(r, f, d, 0);
        if (s && !board[s.r][s.f]) {
          out.push([s.r, s.f]);
          if (r === 1 && d === 1) { const s2 = step(s.r, s.f, s.dr, 0); if (s2 && !board[s2.r][s2.f]) out.push([s2.r, s2.f]); }
        }
        for (const df of [1, -1]) {
          const c = step(r, f, d, df);
          if (c) { const o = board[c.r][c.f]; if (o && o.o !== pc.o) out.push([c.r, c.f]); }
        }
        break;
      }
    }
    const seen = new Set();
    return out.filter(([a, b]) => { const k = a * 100 + b; if (seen.has(k)) return false; seen.add(k); return true; });
  }

  function legalMoves(state, r, f) {
    const pc = state.board[r] && state.board[r][f];
    if (!pc || state.over || pc.o !== state.turn) return [];
    return moves(state.board, r, f);
  }

  function hasMoves(s, p) {
    for (let r = 0; r < RANKS; r++) for (let f = 0; f < FILES; f++) {
      const pc = s.board[r][f];
      if (pc && pc.o === p && moves(s.board, r, f).length) return true;
    }
    return false;
  }

  function eliminate(s, p) {
    s.alive[p] = false;
    for (let r = 0; r < RANKS; r++) for (let f = 0; f < FILES; f++) {
      const pc = s.board[r][f];
      if (pc && pc.o === p) s.board[r][f] = null;
    }
  }

  function checkWinner(s) {
    const a = [0, 1, 2].filter(i => s.alive[i]);
    if (a.length === 1) { s.over = true; s.winner = a[0]; return true; }
    if (a.length === 0) { s.over = true; s.draw = true; return true; }
    return false;
  }

  // เลื่อนตาไปคนถัดไปที่ยังเดินได้ (คนที่เดินไม่ได้เลยจะถูกข้ามตา)
  function advance(s, passed) {
    let t = s.turn;
    for (let i = 0; i < 3; i++) {
      t = (t + 1) % 3;
      if (!s.alive[t]) continue;
      if (hasMoves(s, t)) { s.turn = t; return; }
      passed.push(t);
    }
    s.over = true; s.draw = true; s.winner = null;
  }

  function applyMove(s, player, from, to) {
    if (s.over) return { ok: false, error: 'เกมจบแล้ว' };
    if (s.turn !== player) return { ok: false, error: 'ยังไม่ใช่ตาของคุณ' };
    const [fr, ff] = from, [tr, tf] = to;
    const inRange = (a, b) => Number.isInteger(a) && Number.isInteger(b) && a >= 0 && a < RANKS && b >= 0 && b < FILES;
    if (!inRange(fr, ff) || !inRange(tr, tf)) return { ok: false, error: 'ตำแหน่งไม่ถูกต้อง' };
    const pc = s.board[fr][ff];
    if (!pc || pc.o !== player) return { ok: false, error: 'ไม่ใช่หมากของคุณ' };
    const legal = moves(s.board, fr, ff);
    if (!legal.some(m => m[0] === tr && m[1] === tf)) return { ok: false, error: 'เดินแบบนี้ไม่ได้' };

    const captured = s.board[tr][tf];
    // เบี้ยข้ามศูนย์กลางแล้วต้องเดินออกด้านนอก
    if (pc.t === 'p') {
      const dd = Math.abs(tr - fr);
      if (!(dd === 2 && fr === 1)) {
        const dir = pc.d || 1;
        const probe = step(fr, ff, dir, 0), probeDiag1 = step(fr, ff, dir, 1), probeDiag2 = step(fr, ff, dir, -1);
        const hit = [probe, probeDiag1, probeDiag2].find(x => x && x.r === tr && x.f === tf);
        if (hit) pc.d = hit.dr;
      }
    }
    s.board[tr][tf] = pc;
    s.board[fr][ff] = null;
    let promoted = false;
    if (pc.t === 'p' && pc.d === -1 && tr === 0) { pc.t = 'q'; delete pc.d; promoted = true; }

    const res = { ok: true, captured: captured ? { t: captured.t, o: captured.o } : null, eliminated: null, promoted, passed: [] };
    s.last = { from: [fr, ff], to: [tr, tf] };
    if (captured && captured.t === 'k') { eliminate(s, captured.o); res.eliminated = captured.o; }
    if (!checkWinner(s)) advance(s, res.passed);
    return res;
  }

  function resign(s, p) {
    const res = { passed: [] };
    if (s.over || !s.alive[p]) return res;
    eliminate(s, p);
    if (!checkWinner(s) && s.turn === p) advance(s, res.passed);
    return res;
  }

  return { RANKS, FILES, newGame, step, moves, legalMoves, hasMoves, applyMove, resign };
});
