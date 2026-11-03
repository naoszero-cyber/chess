(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const COLORS = ['#d8433f', '#3f74e0', '#2fb463'];
  const COLOR_TH = ['แดง', 'น้ำเงิน', 'เขียว'];
  const GLYPH = { k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F\uFE0E' };
  const EDGES = [1, 0.7697, 0.5924, 0.4559, 0.3509]; // รัศมีขอบแต่ละแถว (อัตราส่วนคงที่ ทำให้ช่องเป็นสี่เหลี่ยมใกล้จัตุรัส)
  const DEG = Math.PI / 180;

  let ws = null, st = null, sel = null, targets = [], retry = 0, toastTimer = null, boardCache = null;
  let listTimer = null;

  // ---------- เก็บเซสชันไว้กลับเข้าห้องหลังหลุด ----------
  const getSaved = () => { try { return JSON.parse(localStorage.getItem('c3_session') || 'null'); } catch (e) { return null; } };
  const setSaved = v => { try { v ? localStorage.setItem('c3_session', JSON.stringify(v)) : localStorage.removeItem('c3_session'); } catch (e) { /* ignore */ } };
  const getName = () => { try { return localStorage.getItem('c3_name') || ''; } catch (e) { return ''; } };
  const setName = n => { try { localStorage.setItem('c3_name', n); } catch (e) { /* ignore */ } };

  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  // ---------- เชื่อมต่อ ----------
  function connect() {
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
    ws.onopen = () => {
      retry = 0; setConn('');
      const s = getSaved();
      if (s) send({ t: 'rejoin', code: s.code, token: s.token });
      send({ t: 'list' });
    };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } onMessage(m); };
    ws.onclose = () => { setConn('กำลังเชื่อมต่อใหม่…'); setTimeout(connect, Math.min(1000 * ++retry, 5000)); };
    ws.onerror = () => {};
  }
  function setConn(t) { $('conn').textContent = t; $('conn2').textContent = t; }
  function send(o) { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(o)); return true; } toast('ยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์'); return false; }

  function onMessage(m) {
    switch (m.t) {
      case 'joined': setSaved({ code: m.code, token: m.token }); break;
      case 'state': st = m; sel = null; targets = []; showGame(); render(); break;
      case 'rooms': renderRooms(m.list); break;
      case 'error': toast(m.msg); break;
      case 'rejoin_failed': setSaved(null); st = null; showLobby(); break;
      case 'left': setSaved(null); st = null; showLobby(); break;
    }
  }

  // ---------- ล็อบบี้ ----------
  function showLobby() {
    $('lobby').hidden = false; $('game').hidden = true;
    send({ t: 'list' });
    clearInterval(listTimer); listTimer = setInterval(() => { if (!$('lobby').hidden && ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'list' })); }, 4000);
  }
  function showGame() { $('lobby').hidden = true; $('game').hidden = false; clearInterval(listTimer); }

  function renderRooms(list) {
    const ul = $('rooms'); ul.innerHTML = '';
    $('noRooms').hidden = list.length > 0;
    list.forEach(r => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = `${r.code} · ห้องของ ${r.host} · ${r.count}/3`;
      const b = document.createElement('button'); b.textContent = 'เข้าห้อง';
      b.onclick = () => joinRoom(r.code);
      li.append(span, b); ul.appendChild(li);
    });
  }
  function nameValue() { const n = $('name').value.trim(); if (!n) { toast('กรอกชื่อก่อน'); $('name').focus(); return null; } setName(n); return n; }
  function joinRoom(code) { const n = nameValue(); if (n) send({ t: 'join', code, name: n }); }

  $('name').value = getName();
  $('create').onclick = () => { const n = nameValue(); if (n) send({ t: 'create', name: n }); };
  $('join').onclick = () => { const c = $('code').value.trim(); if (c.length !== 4) { toast('รหัสห้องมี 4 ตัวอักษร'); return; } joinRoom(c); };
  $('code').addEventListener('keydown', e => { if (e.key === 'Enter') $('join').click(); });
  $('copy').onclick = () => { if (st && navigator.clipboard) navigator.clipboard.writeText(st.code).then(() => toast('คัดลอกรหัสห้องแล้ว: ' + st.code), () => {}); };
  $('rematch').onclick = () => send({ t: 'rematch' });
  $('resign').onclick = () => { if (confirm('ยอมแพ้ใช่ไหม? หมากทั้งหมดของคุณจะถูกเอาออกจากกระดาน')) send({ t: 'resign' }); };
  $('leave').onclick = () => {
    const playing = st && st.status === 'playing' && st.alive[st.you];
    if (playing && !confirm('ออกจากห้องจะนับเป็นยอมแพ้ ต้องการออกใช่ไหม?')) return;
    send({ t: 'leave' });
  };

  // ---------- วาดผล ----------
  function render() {
    $('copy').textContent = 'ห้อง ' + st.code;
    const pl = $('players'); pl.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const p = st.players[i];
      const d = document.createElement('div');
      d.className = 'pl' + (st.status === 'playing' && st.turn === i ? ' turn' : '') + (!st.alive[i] ? ' out' : '');
      d.style.borderLeftColor = COLORS[i];
      const n = document.createElement('div'); n.className = 'n';
      n.textContent = p ? p.name + (i === st.you ? ' (คุณ)' : '') : 'ว่าง';
      const s = document.createElement('div'); s.className = 's';
      s.textContent = COLOR_TH[i] + (!p ? '' : !st.alive[i] ? ' · ตกรอบ' : !p.connected ? ' · หลุด' : '');
      d.append(n, s); pl.appendChild(d);
    }
    const b = $('banner'); b.className = 'banner';
    const nm = i => (st.players[i] ? st.players[i].name : '?');
    if (st.status === 'waiting') {
      const c = st.players.filter(Boolean).length;
      b.textContent = `รอผู้เล่น ${c}/3 · ส่งรหัสห้อง ${st.code} ให้เพื่อน`;
    } else if (st.status === 'over') {
      b.textContent = st.draw ? 'เกมจบ: เสมอ' : (st.winner === st.you ? 'คุณชนะ!' : `${nm(st.winner)} (${COLOR_TH[st.winner]}) ชนะ`);
    } else if (st.turn === st.you) { b.textContent = 'ตาของคุณ'; b.classList.add('me'); }
    else b.textContent = `รอ ${nm(st.turn)} (${COLOR_TH[st.turn]}) เดิน`;

    $('resign').hidden = !(st.status === 'playing' && st.alive[st.you]);
    $('rematch').hidden = st.status !== 'over';
    const log = $('log'); log.innerHTML = '';
    st.log.forEach(t => { const d = document.createElement('div'); d.textContent = t; log.appendChild(d); });
    log.scrollTop = log.scrollHeight;

    boardCache = buildBoard();
    draw();
  }

  function buildBoard() {
    if (st.status === 'waiting') return Game.newGame().board;
    const b = [];
    for (let r = 0; r < 4; r++) b.push(new Array(24).fill(null));
    st.pieces.forEach(p => { b[p.r][p.f] = { t: p.t, o: p.o, d: p.d || 1 }; });
    return b;
  }

  // มุมหน้าจอ (องศา) ของขอบไฟล์ fe โดยหมุนให้ฝั่งของเราอยู่ด้านล่าง ไฟล์เพิ่มจากซ้ายไปขวา
  const mid = () => (st.you * 8 + 4) * 15;
  const ang = fe => 90 - (fe * 15 - mid());

  function geom() {
    const cv = $('board');
    const w = Math.min($('game').clientWidth || 360, 640, Math.max(300, window.innerHeight * 0.75));
    return { cv, S: w, cx: w / 2, cy: w / 2, R: w / 2 - 10 };
  }

  function squarePath(ctx, g, r, f) {
    const ro = EDGES[r] * g.R, ri = EDGES[r + 1] * g.R;
    ctx.beginPath();
    ctx.arc(g.cx, g.cy, ro, ang(f) * DEG, ang(f + 1) * DEG, true);
    ctx.arc(g.cx, g.cy, ri, ang(f + 1) * DEG, ang(f) * DEG, false);
    ctx.closePath();
  }
  function squareCenter(g, r, f) {
    const rm = (EDGES[r] + EDGES[r + 1]) / 2 * g.R, a = ang(f + 0.5) * DEG;
    return { x: g.cx + rm * Math.cos(a), y: g.cy + rm * Math.sin(a) };
  }

  function draw() {
    if (!st) return;
    const g = geom(), cv = g.cv, dpr = window.devicePixelRatio || 1;
    cv.style.width = g.S + 'px'; cv.style.height = g.S + 'px';
    cv.width = Math.round(g.S * dpr); cv.height = Math.round(g.S * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, g.S, g.S);

    // แถบสีของแต่ละฝั่งที่ขอบนอก
    for (let p = 0; p < 3; p++) {
      ctx.beginPath();
      ctx.arc(g.cx, g.cy, g.R + 5, ang(p * 8) * DEG, ang(p * 8 + 8) * DEG, true);
      ctx.lineWidth = 6; ctx.strokeStyle = COLORS[p]; ctx.lineCap = 'butt'; ctx.stroke();
    }
    const last = st.last, isLast = (r, f) => last && ((last.from[0] === r && last.from[1] === f) || (last.to[0] === r && last.to[1] === f));
    const isTarget = (r, f) => targets.some(t => t[0] === r && t[1] === f);

    for (let r = 0; r < 4; r++) for (let f = 0; f < 24; f++) {
      squarePath(ctx, g, r, f);
      ctx.fillStyle = (r + f) % 2 === 0 ? '#efe6c8' : '#2f6b3d';
      ctx.fill();
      if (isLast(r, f)) { ctx.fillStyle = 'rgba(233,185,73,.45)'; ctx.fill(); }
      if (sel && sel[0] === r && sel[1] === f) { ctx.fillStyle = 'rgba(233,185,73,.8)'; ctx.fill(); }
    }
    // เส้นแบ่งส่วนของผู้เล่น
    ctx.strokeStyle = '#0f2a1e'; ctx.lineWidth = 2;
    for (let p = 0; p < 3; p++) {
      const a = ang(p * 8) * DEG;
      ctx.beginPath(); ctx.moveTo(g.cx + EDGES[4] * g.R * Math.cos(a), g.cy + EDGES[4] * g.R * Math.sin(a));
      ctx.lineTo(g.cx + g.R * Math.cos(a), g.cy + g.R * Math.sin(a)); ctx.stroke();
    }
    // ศูนย์กลาง
    ctx.beginPath(); ctx.arc(g.cx, g.cy, EDGES[4] * g.R, 0, Math.PI * 2);
    ctx.fillStyle = '#12301f'; ctx.fill();
    ctx.strokeStyle = '#2f6048'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#6f9a82'; ctx.font = `${Math.max(10, g.R * 0.075)}px "IBM Plex Sans Thai",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ทะลุได้', g.cx, g.cy);

    // หมาก
    for (let r = 0; r < 4; r++) for (let f = 0; f < 24; f++) {
      const pc = boardCache[r][f]; if (!pc) continue;
      const c = squareCenter(g, r, f);
      const rm = (EDGES[r] + EDGES[r + 1]) / 2 * g.R;
      const size = Math.min((EDGES[r] - EDGES[r + 1]) * g.R, rm * 15 * DEG) * 0.92;
      ctx.beginPath(); ctx.arc(c.x, c.y, size * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = COLORS[pc.o]; ctx.fill();
      ctx.lineWidth = Math.max(1, size * 0.06); ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.font = `${size * 0.78}px "Segoe UI Symbol","Noto Sans Symbols 2","DejaVu Sans",serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff'; ctx.fillText(GLYPH[pc.t], c.x, c.y + size * 0.04);
    }
    // จุดแสดงทางเดินที่ไปได้
    targets.forEach(([r, f]) => {
      const c = squareCenter(g, r, f), cap = boardCache[r][f];
      const size = Math.min((EDGES[r] - EDGES[r + 1]) * g.R, (EDGES[r] + EDGES[r + 1]) / 2 * g.R * 15 * DEG);
      ctx.beginPath();
      if (cap) { ctx.arc(c.x, c.y, size * 0.56, 0, Math.PI * 2); ctx.lineWidth = Math.max(2, size * 0.1); ctx.strokeStyle = '#e9b949'; ctx.stroke(); }
      else { ctx.arc(c.x, c.y, size * 0.2, 0, Math.PI * 2); ctx.fillStyle = 'rgba(233,185,73,.95)'; ctx.fill(); }
    });
  }

  function hit(x, y) {
    const g = geom(), dx = x - g.cx, dy = y - g.cy, rad = Math.hypot(dx, dy) / g.R;
    if (rad > 1 || rad < EDGES[4]) return null;
    let r = 0; while (r < 3 && rad < EDGES[r + 1]) r++;
    const a = Math.atan2(dy, dx) / DEG;
    const theta = mid() + (90 - a);
    const f = Math.floor((((theta / 15) % 24) + 24) % 24);
    return [r, f];
  }

  $('board').addEventListener('click', e => {
    if (!st || st.status !== 'playing' || st.turn !== st.you) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sq = hit(e.clientX - rect.left, e.clientY - rect.top);
    if (!sq) { sel = null; targets = []; draw(); return; }
    if (sel && targets.some(t => t[0] === sq[0] && t[1] === sq[1])) {
      send({ t: 'move', from: sel, to: sq });
      sel = null; targets = []; draw(); return;
    }
    const pc = boardCache[sq[0]][sq[1]];
    if (pc && pc.o === st.you) {
      sel = sq;
      targets = Game.legalMoves({ board: boardCache, turn: st.you, over: false }, sq[0], sq[1]);
    } else { sel = null; targets = []; }
    draw();
  });

  window.addEventListener('resize', () => { if (st) draw(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (st) draw(); });

  showLobby();
  connect();
})();
