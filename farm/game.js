'use strict';
// «مزرعة الشيوخ» — لعبة جماعية من 2 إلى 4 لاعبين
// المضيف يشغّل المحاكاة (الحيوانات، جاي، التعاميم، الكمبيوتر) وكل لاعب يتحكم بحركته هو
const W = 720, H = 1080, ROUND = 150, MEMO_EVERY = 40, CAP = 5, BASE_SPD = 215;
const PENS = [
  { x: 16, y: 70, w: 220, h: 180, g: 'r' }, { x: 484, y: 70, w: 220, h: 180, g: 'l' },
  { x: 16, y: 832, w: 220, h: 180, g: 'r' }, { x: 484, y: 832, w: 220, h: 180, g: 'l' }];
const COL = SPR.COLORS;
const KIND = {
  s: { n: 'خروف', pts: 1, spd: 55, img: 'sheep', sc: .82, r: 30 },
  r: { n: 'أرنب', pts: 2, spd: 75, img: 'rabbit', sc: .85, r: 28 },
  c: { n: 'جمل', pts: 3, spd: 38, img: 'camel', sc: .72, r: 38 },
  w: { n: 'دودة', pts: 0, spd: 22, img: 'worm', sc: .78, r: 28 } };
const MEMOS = {
  start: { t: 'بسم الله نبدأ', d: 'اجمعوا الحيوانات لحظائركم: الخروف بنقطة، الأرنب بنقطتين، والجمل بثلاث. والدودة لا تدخلونها حظيرتكم!' },
  noRabbit: { t: 'يُمنع جمع الأرانب', d: 'الأرانب محمية لين التعميم الجاي' },
  camelX2: { t: 'الإبل بضعف النقاط', d: 'كل جمل يدخل الحظيرة بست نقاط' },
  sheepX2: { t: 'الخرفان بنقطتين', d: 'موسم الخرفان، جمّعوا' },
  fast: { t: 'سرعة للجميع', d: 'كل اللاعبين أسرع لين التعميم الجاي' },
  sleepy: { t: 'الحيوانات نعسانة', d: 'كل شي بطيء… والأرانب ما تهرب' },
  freeSteal: { t: 'الحظائر مفتوحة', d: 'السرقة من حظائر غيركم بدون انتظار!' },
  noSteal: { t: 'يُمنع السرقة', d: 'الحظائر مقفلة بأمر الإدارة' },
  swap: { t: 'تبادل حظائر', d: 'المتصدّر والأخير تبادلوا حظائرهم فورًا!' },
  jayAwake: { t: 'جاي صاحي', d: 'هداياه… ومقالبه… أكثر من العادة' },
  worms: { t: 'موسم الدود', d: 'الدود انتشر — ودّوه حظائر غيركم' } };
const MEMO_POOL = Object.keys(MEMOS).filter(k => k !== 'start');

const $ = s => document.querySelector(s);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const inPen = (p, i, m = 0) => { const r = PENS[i]; return p.x > r.x - m && p.x < r.x + r.w + m && p.y > r.y - m && p.y < r.y + r.h + m; };
const penC = i => ({ x: PENS[i].x + PENS[i].w / 2, y: PENS[i].y + PENS[i].h / 2 });
const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const pts = (k, memo) => k === 'c' ? (memo === 'camelX2' ? 6 : 3) : k === 's' ? (memo === 'sheepX2' ? 2 : 1) : k === 'r' ? 2 : 0;
const score = p => p.pen.reduce((a, b) => a + b.p, 0) + p.bonus;

// ───────────── الصوت (خفيف ولطيف) ─────────────
const AU = { ctx: null, on: localStorage.getItem('farm-snd') !== '0' };
function au() { if (!AU.ctx) { try { AU.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (AU.ctx && AU.ctx.state === 'suspended') AU.ctx.resume(); return AU.on ? AU.ctx : null; }
function tone(f1, f2, dur, type = 'sine', vol = .12, delay = 0) {
  const c = au(); if (!c) return; const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + .02);
}
const SND = {
  pick() { tone(520, 880, .09, 'sine', .1); },
  bank() { tone(660, 660, .1, 'triangle', .12); tone(990, 990, .16, 'triangle', .12, .09); },
  steal() { tone(700, 300, .18, 'square', .05); },
  bump() { tone(180, 90, .15, 'square', .08); },
  worm() { tone(300, 160, .25, 'sawtooth', .05); },
  gift() { [880, 1100, 1320, 1760].forEach((f, i) => tone(f, f, .12, 'triangle', .08, i * .06)); },
  trick() { tone(500, 200, .35, 'triangle', .1); },
  memo() { tone(110, 60, .2, 'square', .12); tone(220, 220, .08, 'triangle', .08, .22); },
  tick() { tone(1000, 1000, .05, 'square', .04); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, f, .25, 'triangle', .1, i * .14)); } };

// ───────────── الإدخال: عصا عائمة + كيبورد + زر اندفاع ─────────────
const IN = { jx: 0, jy: 0, id: null, ox: 0, oy: 0, cx: 0, cy: 0, keys: {}, dash: false };
function setupInput(cv) {
  const start = (id, x, y) => { IN.id = id; IN.ox = IN.cx = x; IN.oy = IN.cy = y; IN.jx = IN.jy = 0; };
  const move = (x, y) => { IN.cx = x; IN.cy = y; const dx = x - IN.ox, dy = y - IN.oy, m = Math.hypot(dx, dy), R = 55;
    if (m > R) { IN.ox = x - dx / m * R; IN.oy = y - dy / m * R; } const k = Math.min(1, m / R) / (m || 1); IN.jx = dx * k; IN.jy = dy * k; };
  const end = () => { IN.id = null; IN.jx = IN.jy = 0; };
  cv.addEventListener('touchstart', e => { au(); const t = e.changedTouches[0]; if (IN.id === null) start(t.identifier, t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchmove', e => { for (const t of e.changedTouches) if (t.identifier === IN.id) move(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
  const te = e => { for (const t of e.changedTouches) if (t.identifier === IN.id) end(); };
  cv.addEventListener('touchend', te); cv.addEventListener('touchcancel', te);
  cv.addEventListener('mousedown', e => { au(); start('m', e.clientX, e.clientY); });
  addEventListener('mousemove', e => { if (IN.id === 'm') move(e.clientX, e.clientY); });
  addEventListener('mouseup', () => { if (IN.id === 'm') end(); });
  addEventListener('keydown', e => { IN.keys[e.key.toLowerCase()] = 1; if (e.key === ' ' || e.key === 'Shift') { IN.dash = true; e.preventDefault(); } });
  addEventListener('keyup', e => { IN.keys[e.key.toLowerCase()] = 0; });
  const db = $('#dash'); const tap = e => { au(); IN.dash = true; e.preventDefault(); e.stopPropagation(); };
  db.addEventListener('touchstart', tap, { passive: false }); db.addEventListener('mousedown', tap);
}
function readDir() {
  if ((IN.jx || IN.jy) && !IN.hid) { IN.hid = 1; const h = $('#hint'); if (h) h.style.opacity = 0; }
  let x = IN.jx, y = IN.jy; const k = IN.keys;
  const kx = (k['arrowright'] || k['d'] ? 1 : 0) - (k['arrowleft'] || k['a'] ? 1 : 0), ky = (k['arrowdown'] || k['s'] ? 1 : 0) - (k['arrowup'] || k['w'] ? 1 : 0);
  if (kx || ky) { const m = Math.hypot(kx, ky); x = kx / m; y = ky / m; }
  return { x, y };
}

// ───────────── المحاكاة (عند المضيف) ─────────────
let S = null; // حالة اللعبة عند المضيف
function newSim(list) {
  S = { t: ROUND, memo: 'start', mi: 1, nextMemo: ROUND - MEMO_EVERY, players: [], animals: [], nid: 1, ev: [], evId: 1, phase: 'play', endT: 0,
    jay: { x: W / 2, y: H / 2, f: 1, st: 'walk', stT: 7, glow: 0, glowCd: 6, tx: W / 2, ty: H / 2 } };
  list.forEach((pl, i) => { const c = penC(i), gx = PENS[i].g === 'r' ? PENS[i].x + PENS[i].w + 40 : PENS[i].x - 40;
    S.players.push({ slot: i, u: pl.u, name: pl.nm, ch: pl.ch, bot: !!pl.bot, x: gx, y: c.y, f: PENS[i].g === 'r' ? 1 : -1, hist: [], trail: [], pen: [], bonus: 0,
      stun: 0, boost: 0, dashT: 0, dashCd: 0, stealCd: 0, bumpCd: 0, seen: performance.now(), ai: { t: 0, tx: gx, ty: c.y }, mv: 0 }); });
  for (let i = 0; i < 16; i++) spawnAnimal();
  return S;
}
function freeSpot() {
  for (let k = 0; k < 40; k++) { const p = { x: rnd(40, W - 40), y: rnd(40, H - 40) };
    if (PENS.some((r, i) => inPen(p, i, 40))) continue; if (S.players.some(q => dist(q, p) < 110)) continue; return p; }
  return { x: W / 2 + rnd(-100, 100), y: H / 2 + rnd(-200, 200) };
}
function spawnAnimal(k) {
  if (!k) { const r = Math.random(); k = r < .48 ? 's' : r < .7 ? 'r' : r < .85 ? 'c' : 'w'; }
  const p = freeSpot(); const a = { id: S.nid++, k, x: p.x, y: p.y, vx: 0, vy: 0, own: -1, wT: 0, hd: rnd(0, 6.28) }; S.animals.push(a); return a;
}
function emit(kind, x, y, txt, slot = -1) { const e = [S.evId++, kind, x | 0, y | 0, txt, slot]; S.ev.push({ e, t: S.t }); onEvent(e); }
function attach(p, a) { a.own = p.slot; p.trail.push(a.id); }
function aById(id) { return S.animals.find(a => a.id === id); }
function release(a, vx = 0, vy = 0) { a.own = -1; a.vx = vx; a.vy = vy; a.wT = .6; }
function playerSpeed(p, memo, camels) { let s = BASE_SPD * (memo === 'fast' ? 1.3 : 1) * (p.boost > 0 ? 1.45 : 1) * Math.max(.72, 1 - .08 * camels); if (p.dashT > 0) s *= 2.5; return s; }

function pushOut(o, cx, cy, r) { const dx = o.x - cx, dy = o.y - cy, m = Math.hypot(dx, dy); if (m < r && m > .01) { o.x = cx + dx / m * r; o.y = cy + dy / m * r; } else if (m <= .01) o.x += r; }
function moveSelfLike(p, dir, dt, memo, camels, jay) {
  if (p.stun > 0) return;
  const s = playerSpeed(p, memo, camels); let dx = dir.x, dy = dir.y;
  if (p.dashT > 0 && !dx && !dy) { dx = p.f; }
  p.x = clamp(p.x + dx * s * dt, 20, W - 20); p.y = clamp(p.y + dy * s * dt, 24, H - 20);
  if (Math.abs(dx) > .1) p.f = dx > 0 ? 1 : -1; p.mv = Math.hypot(dx, dy);
  if (jay && jay.st === 'flop') pushOut(p, jay.x, jay.y, 56);
}

function stepSim(dt) {
  const s = S; if (s.phase === 'end') { s.endT += dt; return; }
  s.t -= dt; if (s.t <= 0) { s.t = 0; s.phase = 'end'; emit('end', W / 2, H / 2, ''); return; }
  if (s.t <= s.nextMemo && s.t > 5) { s.nextMemo -= MEMO_EVERY; let k; do { k = MEMO_POOL[Math.random() * MEMO_POOL.length | 0]; } while (k === s.memo); setMemo(k); }
  const memo = s.memo, sleepy = memo === 'sleepy';
  // اللاعبين
  for (const p of s.players) {
    p.stun = Math.max(0, p.stun - dt); p.boost = Math.max(0, p.boost - dt); p.stealCd -= dt; p.bumpCd -= dt; p.dashCd -= dt; p.dashT = Math.max(0, p.dashT - dt);
    const camels = p.trail.reduce((n, id) => n + ((aById(id) || {}).k === 'c' ? 1 : 0), 0);
    if (p.bot) botThink(p, dt, camels);
    else if (p.slot === ME.slot) { localControl(p, dt, memo, camels, s.jay); }
    else { // لاعب بعيد: نقرّب موقعه بنعومة من آخر موقع وصلنا
      if (p.rx != null) { const k = 1 - Math.exp(-dt * 14); p.x += (p.rx - p.x) * k; p.y += (p.ry - p.y) * k; }
      if (performance.now() - p.seen > 7000 && !p.bot) { p.bot = true; emit('info', p.x, p.y, 'انقطع ' + p.name + ' — الكمبيوتر يلعب مكانه', p.slot); }
    }
    const h = p.hist, last = h[h.length - 1]; if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 5) { h.push({ x: p.x, y: p.y }); if (h.length > 90) h.shift(); }
  }
  // التقاط، إيداع، سرقة، اصطدام
  for (const p of s.players) {
    if (p.stun > 0) continue;
    for (const a of s.animals) {
      if (a.own !== -1 || p.trail.length >= CAP || a.wT > 0) continue;
      if (dist(p, a) > KIND[a.k].r + 8) continue;
      if (a.k === 'r' && memo === 'noRabbit') continue;
      attach(p, a); emit(a.k === 'w' ? 'wormOn' : 'pick', a.x, a.y, a.k === 'w' ? 'دودة! 🐛' : '+' + KIND[a.k].n, p.slot);
    }
    for (let i = 0; i < s.players.length; i++) {
      if (!inPen(p, i)) continue; const q = s.players[i];
      if (i === p.slot) { if (p.trail.length) bankAll(p); continue; }
      // إيصال الدود لحظيرة غيرك
      const worms = p.trail.filter(id => (aById(id) || {}).k === 'w');
      for (const id of worms) { p.trail.splice(p.trail.indexOf(id), 1); s.animals.splice(s.animals.indexOf(aById(id)), 1); wormEat(q, p); }
      if (memo !== 'noSteal' && p.stealCd <= 0 && q.pen.length && p.trail.length < CAP) {
        const j = Math.random() * q.pen.length | 0, it = q.pen.splice(j, 1)[0]; const a = { id: s.nid++, k: it.k, x: p.x, y: p.y, vx: 0, vy: 0, own: -1, wT: 0, hd: 0 };
        s.animals.push(a); attach(p, a); p.stealCd = memo === 'freeSteal' ? .45 : 2.2; emit('steal', p.x, p.y, 'سرق ' + KIND[it.k].n + ' من ' + q.name + '!', p.slot);
      }
    }
    if (p.dashT > 0 && p.bumpCd <= 0) for (const q of s.players) {
      if (q === p || q.stun > 0 || !q.trail.length || dist(p, q) > 46) continue;
      let n = 0; while (q.trail.length && p.trail.length < CAP && n < 2) { p.trail.push(q.trail.pop()); n++; }
      p.trail.forEach(id => { const a = aById(id); if (a) a.own = p.slot; });
      q.stun = .8; p.bumpCd = 1; emit('bump', q.x, q.y, 'خبطة! أخذ ' + n, p.slot); break;
    }
  }
  // الحيوانات
  for (const a of s.animals) {
    a.wT = Math.max(0, a.wT - dt);
    if (a.own >= 0) { const p = s.players[a.own], i = p.trail.indexOf(a.id); if (i < 0) { a.own = -1; continue; }
      const h = p.hist, j = h.length - 1 - (i + 1) * 7, tg = h[Math.max(0, j)] || p; const k = 1 - Math.exp(-dt * 9);
      const nx = a.x + (tg.x - a.x) * k; if (Math.abs(nx - a.x) > .2) a.f = nx > a.x ? 1 : -1; a.x = nx; a.y += (tg.y - a.y) * k; continue; }
    const K = KIND[a.k]; let sp = K.spd * (sleepy ? .45 : 1);
    a.hd += rnd(-1.5, 1.5) * dt; let vx = Math.cos(a.hd) * sp, vy = Math.sin(a.hd) * sp;
    if (a.k === 'r' && !sleepy) { let n = null, nd = 120; for (const p of s.players) { const d = dist(p, a); if (d < nd) { nd = d; n = p; } }
      if (n) { const dx = a.x - n.x, dy = a.y - n.y, m = Math.hypot(dx, dy) || 1; vx = dx / m * 150; vy = dy / m * 150; a.hd = Math.atan2(dy, dx); } }
    if (a.wT > 0) { vx += a.vx; vy += a.vy; }
    a.x += vx * dt; a.y += vy * dt; if (Math.abs(vx) > 2) a.f = vx > 0 ? 1 : -1;
    if (a.x < 24 || a.x > W - 24) { a.hd = Math.PI - a.hd; a.x = clamp(a.x, 24, W - 24); }
    if (a.y < 30 || a.y > H - 24) { a.hd = -a.hd; a.y = clamp(a.y, 30, H - 24); }
    for (let i = 0; i < 4; i++) if (inPen(a, i, 14)) { const r = PENS[i], c = penC(i); const ex = a.x < c.x ? r.x - 15 : r.x + r.w + 15, ey = a.y < c.y ? r.y - 15 : r.y + r.h + 15;
      if (Math.abs(ex - a.x) < Math.abs(ey - a.y)) a.x = ex; else a.y = ey; a.hd += Math.PI; }
    if (s.jay.st === 'flop') pushOut(a, s.jay.x, s.jay.y, 60);
  }
  const free = s.animals.filter(a => a.own === -1).length; if (free < 13 && Math.random() < dt * 1.5) spawnAnimal();
  if (s.animals.length > 40) { const i = s.animals.findIndex(a => a.own === -1 && a.k === 'w'); if (i >= 0) s.animals.splice(i, 1); }
  stepJay(dt);
  s.ev = s.ev.filter(o => o.t - s.t < 2.5);
}
function setMemo(k) {
  S.memo = k; S.mi++;
  if (k === 'swap') { const ord = S.players.slice().sort((a, b) => score(b) - score(a)), A = ord[0], B = ord[ord.length - 1];
    if (A !== B) { [A.pen, B.pen] = [B.pen, A.pen]; [A.bonus, B.bonus] = [B.bonus, A.bonus]; } }
  if (k === 'worms') for (let i = 0; i < 5; i++) spawnAnimal('w');
  if (k === 'jayAwake') S.jay.glowCd = Math.min(S.jay.glowCd, 2);
  emit('memo', W / 2, H / 2, k);
}
function bankAll(p) {
  let got = 0;
  for (const id of p.trail.slice()) { const a = aById(id); if (!a) continue; S.animals.splice(S.animals.indexOf(a), 1);
    if (a.k === 'w') wormEat(p, p); else { const v = pts(a.k, S.memo); p.pen.push({ k: a.k, p: v }); got += v; } }
  p.trail = []; if (got) emit('bank', p.x, p.y, '+' + got, p.slot);
}
function wormEat(q, by) {
  const i = q.pen.findIndex(x => x.k !== 'w'); const c = penC(q.slot);
  if (i >= 0) { const it = q.pen.splice(i, 1)[0]; emit('worm', c.x, c.y, by === q ? 'الدودة أكلت ' + KIND[it.k].n + ' من حظيرتك!' : 'دودة ' + by.name + ' أكلت ' + KIND[it.k].n + ' من ' + q.name, by.slot); }
  else emit('worm', c.x, c.y, 'الدودة ما لقت شي تاكله 😅', by.slot);
}
function stepJay(dt) {
  const j = S.jay; j.stT -= dt; j.glowCd -= dt; j.glow = Math.max(0, j.glow - dt);
  if (j.glowCd <= 0 && !j.glow) { j.glow = 7; j.glowCd = S.memo === 'jayAwake' ? 7 : 17; }
  if (j.st === 'flop') { if (j.stT <= 0) { j.st = 'walk'; j.stT = rnd(7, 11); } }
  else { const d = Math.hypot(j.tx - j.x, j.ty - j.y); if (d < 10) { const p = freeSpot(); j.tx = p.x; j.ty = p.y; }
    const sp = 42 * dt; j.x += (j.tx - j.x) / (d || 1) * sp; j.y += (j.ty - j.y) / (d || 1) * sp; if (Math.abs(j.tx - j.x) > 3) j.f = j.tx > j.x ? 1 : -1;
    if (j.stT <= 0 && !j.glow) { j.st = 'flop'; j.stT = 4.5; emit('flop', j.x, j.y, 'جاي انبطح وسدّ الطريق!'); } }
  if (j.glow > 0) for (const p of S.players) if (p.stun <= 0 && dist(p, j) < 52) { j.glow = 0; jayTouch(p); break; }
}
function jayTouch(p) {
  const j = S.jay, good = Math.random() < .5, r = Math.random();
  if (good) {
    if (r < .34) { p.bonus += 3; emit('gift', p.x, p.y, '🎁 هدية جاي: +٣ نقاط', p.slot); }
    else if (r < .67) { p.boost = 6; emit('gift', p.x, p.y, '⚡ جاي عطاك سرعة', p.slot); }
    else { let n = 0; for (const a of S.animals.slice().sort((a, b) => dist(a, p) - dist(b, p))) { if (p.trail.length >= CAP) break; if (a.own === -1 && a.k !== 'w' && dist(a, p) < 260) { attach(p, a); n++; } }
      emit('gift', p.x, p.y, '🧲 مغناطيس جاي جاب لك ' + n, p.slot); }
  } else {
    if (r < .34) { p.stun = 2.6; j.st = 'flop'; j.stT = 2.6; j.x = p.x + 10; j.y = p.y + 30; emit('trick', p.x, p.y, '😼 مقلب! جاي انبطح عليك', p.slot); }
    else if (r < .67 && p.trail.length) { for (const id of p.trail) { const a = aById(id); if (a) { const an = rnd(0, 6.28); release(a, Math.cos(an) * 160, Math.sin(an) * 160); } } p.trail = []; emit('trick', p.x, p.y, '😼 مقلب! جاي طيّر قطيعك', p.slot); }
    else { const c = penC(p.slot); let n = 0; for (let k = 0; k < 2 && p.pen.length; k++) { const it = p.pen.splice(Math.random() * p.pen.length | 0, 1)[0]; const a = spawnAnimal(it.k); a.x = c.x + (PENS[p.slot].g === 'r' ? 150 : -150); a.y = c.y + rnd(-40, 40); n++; }
      emit('trick', p.x, p.y, n ? '😼 مقلب! جاي فتح حظيرتك وهرّب ' + n : '😼 جاي يضحك عليك… حظيرتك فاضية', p.slot); }
  }
}
// الكمبيوتر
function botThink(p, dt, camels) {
  const s = S, ai = p.ai; ai.t -= dt;
  if (ai.t <= 0) {
    ai.t = rnd(.35, .7); ai.dash = false; const own = penC(p.slot);
    const hasWorm = p.trail.some(id => (aById(id) || {}).k === 'w');
    const others = s.players.filter(q => q !== p);
    if (hasWorm) { const tq = others.slice().sort((a, b) => score(b) - score(a))[0]; const c = penC(tq.slot); ai.tx = c.x; ai.ty = c.y; }
    else if (p.trail.length >= (ai.want || 3) || (p.trail.length && s.t < 14)) { ai.tx = own.x; ai.ty = own.y; ai.want = 2 + (Math.random() * 3 | 0); }
    else if (s.jay.glow > 0 && dist(p, s.jay) < 320 && Math.random() < .7) { ai.tx = s.jay.x; ai.ty = s.jay.y; }
    else if (s.memo !== 'noSteal' && Math.random() < (s.memo === 'freeSteal' ? .4 : .12)) { const tq = others.slice().sort((a, b) => b.pen.length - a.pen.length)[0]; if (tq.pen.length) { const c = penC(tq.slot); ai.tx = c.x; ai.ty = c.y; } }
    else { let best = null, bd = 1e9; for (const a of s.animals) { if (a.own !== -1 || a.k === 'w' || (a.k === 'r' && s.memo === 'noRabbit')) continue; const d = dist(p, a) / (a.k === 'c' ? 1.5 : 1); if (d < bd) { bd = d; best = a; } }
      if (best) { ai.tx = best.x; ai.ty = best.y; if (best.k === 'r' && bd < 140) ai.dash = Math.random() < .5; }
      const vic = others.find(q => q.trail.length >= 2 && dist(p, q) < 110); if (vic && Math.random() < .35) { ai.tx = vic.x; ai.ty = vic.y; ai.dash = true; } }
  }
  if (ai.dash && p.dashCd <= 0) { p.dashT = .28; p.dashCd = 2.4; ai.dash = false; }
  const dx = ai.tx - p.x, dy = ai.ty - p.y, m = Math.hypot(dx, dy);
  const dir = m < 8 ? { x: 0, y: 0 } : { x: dx / m * .8, y: dy / m * .8 };
  moveSelfLike(p, dir, dt, s.memo, camels, s.jay);
}

// ───────────── تحكم اللاعب المحلي (مضيف أو ضيف) ─────────────
const ME = { slot: 0 };
function localControl(p, dt, memo, camels, jay) {
  if (IN.dash) { IN.dash = false; if (p.dashCd <= 0 && p.stun <= 0) { p.dashT = .28; p.dashCd = 2.4; } }
  moveSelfLike(p, readDir(), dt, memo, camels, jay);
}

// ───────────── لقطة الحالة للشبكة ─────────────
function snap() {
  const s = S; return {
    t: Math.ceil(s.t * 10), m: s.memo, mi: s.mi, ph: s.phase,
    P: s.players.map(p => [p.slot, p.x | 0, p.y | 0, p.f, Math.round(p.stun * 10), p.boost > 0 ? 1 : 0, p.dashT > 0 ? 1 : 0, p.bot ? 1 : 0, score(p), p.pen.map(x => x.k).join('')]),
    A: s.animals.map(a => [a.id, a.k, a.x | 0, a.y | 0, a.own, a.f || 1]),
    J: [s.jay.x | 0, s.jay.y | 0, s.jay.st === 'flop' ? 1 : 0, s.jay.glow > 0 ? 1 : 0, s.jay.f],
    E: s.ev.map(o => o.e) };
}
// عند الضيف: نحول اللقطة لحالة عرض
let V = null; // حالة العرض عند الضيف
const seenEv = new Set();
function applySnap(d) {
  if (!V) V = { players: [], animals: new Map(), jay: { x: W / 2, y: H / 2, f: 1, st: 'walk', glow: 0 }, memo: 'start', mi: 0, t: ROUND, phase: 'play' };
  V.t = d.t / 10; V.phase = d.ph; V.lastSnap = performance.now();
  if (d.mi !== V.mi) { const first = !V.mi || d.mi === 1; V.mi = d.mi; V.memo = d.m; if (!first) { showMemo(d.m); SND.memo(); } else $('#rule').textContent = '📜 ' + MEMOS[d.m].t; }
  for (const r of d.P) { let p = V.players[r[0]]; if (!p) continue;
    if (r[0] !== ME.slot) { p.tx = r[1]; p.ty = r[2]; p.f = r[3]; p.mv = Math.hypot(r[1] - (p.lx || r[1]), r[2] - (p.ly || r[2])) > 1 ? 1 : 0; p.lx = r[1]; p.ly = r[2]; p.dashT = r[6] ? .1 : 0; }
    p.stun = r[4] / 10; p.boost = r[5] ? 1 : 0; p.bot = !!r[7]; p.sc = r[8]; p.penStr = r[9]; }
  const ids = new Set();
  for (const r of d.A) { ids.add(r[0]); let a = V.animals.get(r[0]); if (!a) { a = { id: r[0], k: r[1], x: r[2], y: r[3] }; V.animals.set(r[0], a); } a.tx = r[2]; a.ty = r[3]; a.own = r[4]; a.f = r[5]; }
  for (const id of V.animals.keys()) if (!ids.has(id)) V.animals.delete(id);
  const j = V.jay; j.tx = d.J[0]; j.ty = d.J[1]; j.st = d.J[2] ? 'flop' : 'walk'; j.glow = d.J[3]; j.f = d.J[4]; if (j.st === 'flop') { j.x = j.tx; j.y = j.ty; }
  for (const e of d.E) if (!seenEv.has(e[0])) { seenEv.add(e[0]); onEvent(e); }
}
function stepClient(dt) {
  const k = 1 - Math.exp(-dt * 12);
  for (const p of V.players) { if (!p) continue; if (p.slot === ME.slot) { const camels = [...V.animals.values()].filter(a => a.own === ME.slot && a.k === 'c').length;
      p.dashCd -= dt; p.dashT = Math.max(0, p.dashT - dt); localControl(p, dt, V.memo, camels, V.jay); }
    else if (p.tx != null) { p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; } }
  for (const a of V.animals.values()) { a.x += (a.tx - a.x) * k; a.y += (a.ty - a.y) * k; }
  const j = V.jay; j.x += (j.tx - j.x) * k; j.y += (j.ty - j.y) * k;
}

// ───────────── الأحداث: نصوص طايرة + أصوات ─────────────
const POPS = [];
function onEvent(e) {
  const [, kind, x, y, txt, slot] = e, mine = slot === ME.slot;
  if (kind === 'memo') { if (S) { showMemo(txt); SND.memo(); } return; }
  if (kind === 'end') return;
  const color = { pick: '#fff', bank: '#ffe14d', steal: '#ff8a7a', bump: '#ffb14d', worm: '#b6f07a', wormOn: '#b6f07a', gift: '#ffe14d', trick: '#ff9ad5', flop: '#fff', info: '#fff' }[kind] || '#fff';
  if (kind !== 'pick' || mine) POPS.push({ x, y, txt, color, t: 0, big: kind === 'bank' || kind === 'gift' || kind === 'trick' });
  if (mine || kind === 'memo') { const f = { pick: SND.pick, bank: SND.bank, steal: SND.steal, bump: SND.bump, worm: SND.worm, wormOn: SND.worm, gift: SND.gift, trick: SND.trick }[kind]; if (f) f(); }
  else if (kind === 'steal' || kind === 'bump' || kind === 'worm') SND.bump();
  if ((kind === 'gift' || kind === 'trick') && mine) toast(txt, kind === 'gift' ? 'good' : 'bad');
  if ((kind === 'steal' || kind === 'worm') && !mine && txt.includes(myName())) toast(txt, 'bad'); else if (kind === 'info') toast(txt, 'info');
}
function myName() { const P = S ? S.players : V ? V.players : []; const p = P[ME.slot]; return p ? p.name : '\u0000'; }
let toastT = 0;
function toast(t, cls) { const el = $('#toast'); el.textContent = t; el.className = 'show ' + cls; clearTimeout(toastT); toastT = setTimeout(() => el.className = '', 2200); }
let memoTO = 0;
function showMemo(k) {
  const m = MEMOS[k]; if (!m) return; const el = $('#memo');
  el.querySelector('.mt').textContent = m.t; el.querySelector('.md').textContent = m.d;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(memoTO); memoTO = setTimeout(() => el.classList.remove('show'), k === 'start' ? 4200 : 3200);
  $('#rule').textContent = '📜 ' + m.t;
}

// ───────────── الرسم ─────────────
let cv, cx, bg, DPR = 1, SC = 1, OX = 0, OY = 0;
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1); cv.width = innerWidth * DPR; cv.height = innerHeight * DPR;
  const top = 92, bot = innerWidth < innerHeight ? 128 : 12; SC = Math.min(innerWidth / W, (innerHeight - top - bot) / H); OX = (innerWidth - W * SC) / 2; OY = top;
  drawBg();
}
function drawBg() {
  bg = document.createElement('canvas'); bg.width = Math.ceil(W * SC * DPR); bg.height = Math.ceil(H * SC * DPR); const g = bg.getContext('2d');
  g.scale(SC * DPR, SC * DPR);
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#a3d76e'); gr.addColorStop(1, '#79bd4a'); g.fillStyle = gr; rr(g, 0, 0, W, H, 34); g.fill();
  g.save(); rr(g, 0, 0, W, H, 34); g.clip();
  g.strokeStyle = 'rgba(226,195,140,.9)'; g.lineCap = 'round'; g.lineWidth = 60;
  g.beginPath(); g.moveTo(-20, H / 2); g.bezierCurveTo(W * .3, H / 2 - 40, W * .7, H / 2 + 40, W + 20, H / 2); g.stroke();
  g.lineWidth = 50; g.beginPath(); g.moveTo(W / 2, -20); g.bezierCurveTo(W / 2 - 40, H * .3, W / 2 + 40, H * .7, W / 2, H + 20); g.stroke();
  g.fillStyle = 'rgba(70,140,40,.45)'; let seed = 7; const r = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 70; i++) { const x = r() * W, y = r() * H; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 4, y - 12); g.lineTo(x + 8, y); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 0; i < 26; i++) { const x = r() * W, y = r() * H; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); g.fillStyle = i % 2 ? 'rgba(255,220,80,.7)' : 'rgba(255,255,255,.6)'; }
  // حوض ماء
  g.fillStyle = '#8a5a2b'; rr(g, W - 120, H / 2 + 60, 74, 26, 9); g.fill(); g.fillStyle = '#5fb4e8'; rr(g, W - 114, H / 2 + 65, 62, 14, 6); g.fill();
  g.restore();
  // الحظائر
  PENS.forEach((p, i) => {
    g.save(); const hay = g.createPattern(hayTile(), 'repeat'); g.fillStyle = hay; rr(g, p.x, p.y, p.w, p.h, 16); g.fill();
    g.strokeStyle = COL[i]; g.lineWidth = 9; g.setLineDash([24, 10]); g.lineCap = 'round';
    const gx = p.g === 'r' ? p.x + p.w : p.x, gy1 = p.y + p.h / 2 - 42, gy2 = p.y + p.h / 2 + 42;
    g.beginPath(); g.moveTo(gx, gy1); g.lineTo(gx, p.y + (p.g === 'r' ? 0 : 0));
    if (p.g === 'r') { g.lineTo(p.x, p.y); g.lineTo(p.x, p.y + p.h); g.lineTo(gx, p.y + p.h); g.lineTo(gx, gy2); }
    else { g.lineTo(p.x + p.w, p.y); g.lineTo(p.x + p.w, p.y + p.h); g.lineTo(gx, p.y + p.h); g.lineTo(gx, gy2); }
    g.stroke(); g.setLineDash([]); g.fillStyle = '#7a4a1f'; [gy1, gy2].forEach(y => { g.beginPath(); g.arc(gx, y, 8, 0, 7); g.fill(); }); g.restore();
  });
  // نخيل
  [[300, 34], [425, H - 12], [30, H / 2 - 40], [W - 30, H / 2 - 130], [W / 2 + 130, 310], [220, H - 290]].forEach(([x, y]) => spr(g, 'palm', x, y, .9));
}
let _hay; function hayTile() { if (_hay) return _hay; const c = document.createElement('canvas'); c.width = c.height = 18; const g = c.getContext('2d'); g.fillStyle = '#f1d27a'; g.fillRect(0, 0, 18, 18); g.strokeStyle = '#d9b14f'; g.lineWidth = 2; g.beginPath(); g.moveTo(2, 14); g.lineTo(9, 4); g.moveTo(10, 16); g.lineTo(16, 8); g.stroke(); return _hay = c; }
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function spr(g, k, x, y, sc = 1, flip = 1, sy = 1) {
  const im = SPR.IMG[k], d = SPR.DIM[k]; if (!im || !im.complete) return;
  g.save(); g.translate(x, y); g.scale(flip * sc, sc * sy); g.drawImage(im, d[0], d[1], d[2], d[3]); g.restore();
}
function penItems(g, i, str, t) {
  const p = PENS[i], n = Math.min(str.length, 14);
  for (let k = 0; k < n; k++) { const h = Math.sin((k + 1) * 91.7 + i * 13.3) * 43758.5, rx = h - Math.floor(h), h2 = Math.sin((k + 1) * 37.1 + i * 7.9) * 12345.6, ry = h2 - Math.floor(h2);
    const x = p.x + 30 + rx * (p.w - 60), y = p.y + 34 + ry * (p.h - 60) + Math.sin(t * 2 + k) * 1.5; const K = KIND[str[k]]; if (K) spr(g, K.img, x, y, K.sc * .7, k % 2 ? 1 : -1); }
  if (str.length > 14) { g.fillStyle = '#3b2a1a'; g.font = '800 22px Tajawal'; g.textAlign = 'center'; g.fillText('+' + (str.length - 14), p.x + p.w / 2, p.y + p.h - 12); }
}
let T0 = performance.now();
function render() {
  const g = cx, t = (performance.now() - T0) / 1000; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.drawImage(bg, OX, OY, W * SC, H * SC); g.translate(OX, OY); g.scale(SC, SC);
  const host = !!S, players = host ? S.players : V.players.filter(Boolean), animals = host ? S.animals : [...V.animals.values()], jay = host ? S.jay : V.jay;
  // الحظائر: الأسماء والمحتوى
  players.forEach(p => { const i = p.slot, P = PENS[i], str = host ? p.pen.map(x => x.k).join('') : (p.penStr || ''); penItems(g, i, str, t);
    const ty = i < 2 ? P.y - 4 : P.y + P.h + 4; g.font = '800 22px Tajawal'; const nm = p.name + '  ' + (host ? score(p) : (p.sc || 0)); const tw = g.measureText(nm).width + 30;
    g.fillStyle = COL[i]; rr(g, P.x + P.w / 2 - tw / 2, ty - 20, tw, 40, 20); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(nm, P.x + P.w / 2, ty + 1); });
  // ترتيب حسب العمق
  const list = [];
  animals.forEach(a => list.push({ y: a.y, d: () => { const K = KIND[a.k], hop = a.k === 'r' ? Math.abs(Math.sin(t * 9 + a.id)) * -6 : Math.sin(t * 6 + a.id) * 1.2;
    if (a.own >= 0) { g.fillStyle = COL[a.own]; g.globalAlpha = .35; g.beginPath(); g.ellipse(a.x, a.y + 14, 20, 6, 0, 0, 7); g.fill(); g.globalAlpha = 1; }
    spr(g, K.img, a.x, a.y + hop, K.sc, a.f || 1); } }));
  players.forEach(p => list.push({ y: p.y, d: () => drawPlayer(g, p, t) }));
  list.push({ y: jay.y + (jay.st === 'flop' ? 30 : 0), d: () => drawJay(g, jay, t) });
  list.sort((a, b) => a.y - b.y).forEach(o => o.d());
  // نصوص طايرة
  for (let i = POPS.length - 1; i >= 0; i--) { const o = POPS[i]; o.t += 1 / 60; if (o.t > 1.6) { POPS.splice(i, 1); continue; }
    g.globalAlpha = Math.min(1, 2 - o.t * 1.25); g.font = (o.big ? '800 30px' : '800 22px') + ' Tajawal'; g.textAlign = 'center'; g.lineWidth = 6; g.strokeStyle = '#3b2a1a';
    const y = o.y - 40 - o.t * 40; g.strokeText(o.txt, o.x, y); g.fillStyle = o.color; g.fillText(o.txt, o.x, y); g.globalAlpha = 1; }
  // العصا
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (IN.id !== null) { g.globalAlpha = .35; g.fillStyle = '#fff'; g.beginPath(); g.arc(IN.ox, IN.oy, 55, 0, 7); g.fill(); g.globalAlpha = .8; g.beginPath(); g.arc(IN.ox + IN.jx * 55, IN.oy + IN.jy * 55, 24, 0, 7); g.fill(); g.globalAlpha = 1; }
}
function drawPlayer(g, p, t) {
  const moving = (p.mv || 0) > .1, bob = moving ? Math.abs(Math.sin(t * 12)) * -4 : 0;
  if (p.slot === ME.slot) { g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 4; g.beginPath(); g.ellipse(p.x, p.y + 28, 28, 9, 0, 0, 7); g.stroke(); }
  if (p.boost > 0) { g.fillStyle = 'rgba(255,230,80,.45)'; g.beginPath(); g.arc(p.x, p.y, 38, 0, 7); g.fill(); }
  if (p.dashT > 0) { g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 4; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(p.x - p.f * (30 + k * 8), p.y - 10 + k * 10); g.lineTo(p.x - p.f * (55 + k * 8), p.y - 10 + k * 10); g.stroke(); } }
  spr(g, (p.ch === 'h' ? 'herder' : 'farmer') + p.slot, p.x, p.y + bob, 1, p.f, moving ? 1 + Math.sin(t * 24) * .02 : 1);
  if (p.stun > 0) { g.font = '22px sans-serif'; g.textAlign = 'center'; for (let k = 0; k < 3; k++) { const an = t * 5 + k * 2.1; g.fillText('⭐', p.x + Math.cos(an) * 22, p.y - 48 + Math.sin(an) * 6); } }
}
function drawJay(g, j, t) {
  if (j.glow) { const r = 62 + Math.sin(t * 6) * 6, gr = g.createRadialGradient(j.x, j.y, 5, j.x, j.y, r); gr.addColorStop(0, 'rgba(255,243,160,.95)'); gr.addColorStop(1, 'rgba(255,216,74,0)'); g.fillStyle = gr; g.beginPath(); g.arc(j.x, j.y, r, 0, 7); g.fill();
    g.fillStyle = '#fff6a8'; for (let k = 0; k < 4; k++) { const an = t * 2 + k * 1.57, x = j.x + Math.cos(an) * 52, y = j.y + Math.sin(an) * 40; star(g, x, y, 7); } }
  if (j.st === 'flop') spr(g, 'jayFlop', j.x, j.y, .5);
  else spr(g, 'jayWalk', j.x, j.y + Math.abs(Math.sin(t * 7)) * -2, .72, j.f || 1);
  if (j.glow) { g.font = '800 24px Tajawal'; g.textAlign = 'center'; g.lineWidth = 6; g.strokeStyle = '#3b2a1a'; g.strokeText('بونس… ولا مقلب؟', j.x, j.y - 62); g.fillStyle = '#ffe14d'; g.fillText('بونس… ولا مقلب؟', j.x, j.y - 62); }
  else if (j.st === 'flop') { g.font = '800 22px Lalezar'; g.fillStyle = 'rgba(59,42,26,.6)'; g.fillText('z', j.x + 40, j.y - 30 - (t * 10 % 12)); }
}
function star(g, x, y, r) { g.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, rr2 = k % 2 ? r * .4 : r; g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } g.closePath(); g.fill(); }

// ───────────── الشريط العلوي ─────────────
let hudKey = '';
function hud() {
  const host = !!S, players = host ? S.players : V.players.filter(Boolean), t = host ? S.t : V.t;
  const key = players.map(p => (host ? score(p) : p.sc) + (p.bot ? 'b' : '')).join(',');
  if (key !== hudKey) { hudKey = key; $('#chips').innerHTML = players.map(p => `<div class="chip${p.slot === ME.slot ? ' me' : ''}" style="--c:${COL[p.slot]}"><b>${host ? score(p) : (p.sc || 0)}</b><span>${esc(p.name)}</span></div>`).join(''); }
  const sec = Math.ceil(t), txt = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); const el = $('#timer');
  if (el.textContent !== txt) { el.textContent = txt; el.classList.toggle('hot', sec <= 10); if (sec <= 10 && sec > 0) SND.tick(); }
  const me = players.find(p => p.slot === ME.slot); if (me) $('#dash').classList.toggle('cd', (me.dashCd || 0) > 0);
}

// ───────────── الحلقة الرئيسية ─────────────
let MODE = 'menu', lastT = 0, sendT = 0, endShown = false;
function loop(now) {
  requestAnimationFrame(loop); const dt = Math.min(.05, (now - lastT) / 1000 || 0); lastT = now;
  if (MODE !== 'play') return;
  if (S) { stepSim(dt); sendT -= dt; if (NET.r && sendT <= 0) { sendT = .12; NET.emit('st', snap()); } if (S.phase === 'end' && !endShown && S.endT > .8) showEnd(); }
  else if (V) { stepClient(dt); sendT -= dt; const me = V.players[ME.slot];
    if (me && sendT <= 0) { sendT = .1; NET.emit('in', { s: ME.slot, x: me.x | 0, y: me.y | 0, f: me.f, d: me.dashT > 0 ? 1 : 0, mv: me.mv > .1 ? 1 : 0 }); }
    if (V.phase === 'end' && !endShown) showEnd();
    if (performance.now() - V.lastSnap > 7000 && !V.lost) { V.lost = true; toast('انقطع الاتصال بالمضيف…', 'bad'); setTimeout(() => { if (V && V.lost) showScreen('menu'), MODE = 'menu'; }, 4000); } }
  render(); hud();
}

// ───────────── النهاية ─────────────
function showEnd() {
  endShown = true; const host = !!S, players = (host ? S.players : V.players.filter(Boolean)).map(p => ({ slot: p.slot, name: p.name, s: host ? score(p) : p.sc || 0, ch: p.ch }));
  players.sort((a, b) => b.s - a.s); const win = players[0];
  $('#endTitle').textContent = win.slot === ME.slot ? 'فزتي! 🏆' : 'فاز ' + win.name + ' 🏆';
  if (win.slot === ME.slot) $('#endTitle').textContent = 'فزت! 🏆';
  $('#rank').innerHTML = players.map((p, i) => `<div class="rk" style="--c:${COL[p.slot]}"><i>${['🥇', '🥈', '🥉', '4'][i]}</i><span>${esc(p.name)}</span><b>${p.s}</b></div>`).join('');
  $('#again').style.display = host ? '' : 'none'; $('#waitHost').style.display = host ? 'none' : '';
  showScreen('end'); SND.win();
}

// ───────────── الشبكة ─────────────
const NET = { r: null, host: false, uid: Math.random().toString(36).slice(2, 10), code: '', list: [], seen: {}, iv: 0,
  emit(t, d) { if (this.r) try { this.r.emit(t, Object.assign({ u: this.uid }, d)); } catch (e) {} } };
function fbRoom() {
  const fb = window.firebase, cfg = window.FBCFG; if (!fb || !cfg) return null;
  try { if (!fb.apps.length) fb.initializeApp(cfg); } catch (e) { return null; } const db = fb.database();
  let off = 0; db.ref('.info/serverTimeOffset').on('value', s => { off = s.val() || 0; });
  const PC = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz', kts = k => { let t = 0; for (let i = 0; i < 8; i++) t = t * 64 + PC.indexOf(k[i]); return t; };
  return { join(name, clear) { const room = db.ref('rooms/' + name.replace(/[^\w-]/g, '')), ref = room.child('m'), fns = {};
    if (clear) room.remove(); const q = ref.limitToLast(80); q.on('child_added', s => { if (kts(s.key) < Date.now() + off - 12000) return; const v = s.val(); const f = v && fns[v.t]; if (f) { try { f(JSON.parse(v.d)); } catch (e) {} } });
    return { emit(t, d) { ref.push({ t, d: JSON.stringify(d) }); }, on(t, fn) { fns[t] = fn; }, leave() { q.off(); }, clear() { return ref.remove(); } }; } };
}
function localRoom() { return { join(name) { const bc = new BroadcastChannel(name), fns = {}; bc.onmessage = e => { const f = fns[e.data.t]; if (f) f(e.data.d); };
  return { emit(t, d) { bc.postMessage({ t, d }); }, on(t, fn) { fns[t] = fn; }, leave() { bc.close(); }, clear() { return Promise.resolve(); } }; } }; }
const LOCAL = /[?&]local=1/.test(location.search);
function roomApi() { return LOCAL ? localRoom() : fbRoom(); }
function myProfile() { return { u: NET.uid, nm: (($('#name').value || '').trim() || 'لاعب').slice(0, 12), ch: PROF.ch }; }

async function openRoom(host, code) {
  const api = roomApi(); if (!api) { lobbyMsg('ما قدرت أتصل بخادم اللعب. تأكد من الإنترنت.', 'bad'); return; }
  netClose(); NET.host = host; NET.code = code; NET.r = api.join('farm-' + code, host); NET.list = host ? [myProfile()] : []; NET.seen = {}; NET.started = false;
  NET.r.on('hi', d => { if (!NET.host || d.u === NET.uid) return; NET.seen[d.u] = performance.now();
    let e = NET.list.find(x => x.u === d.u); if (!e) { if (NET.list.length >= 4 || MODE === 'play') { NET.emit('full', { to: d.u }); return; } NET.list.push(e = { u: d.u }); } e.nm = esc(d.nm).slice(0, 12); e.ch = d.ch; drawLobby(); });
  NET.r.on('lobby', d => { if (NET.host || d.u === NET.uid) return; NET.list = d.list; NET.hostSeen = performance.now(); drawLobby(); });
  NET.r.on('full', d => { if (d.to === NET.uid && !NET.list.some(x => x.u === NET.uid)) { lobbyMsg('الغرفة مليانة (٤ لاعبين) أو اللعب بدأ', 'bad'); } });
  NET.r.on('start', d => { if (NET.host || d.u === NET.uid) return; const me = d.list.findIndex(x => x.u === NET.uid); if (me < 0) return; startClient(d.list, me); });
  NET.r.on('st', d => { if (NET.host || d.u === NET.uid || MODE !== 'play' || !V) return; applySnap(d); });
  NET.r.on('in', d => { if (!NET.host || !S) return; const p = S.players[d.s]; if (!p || p.u !== d.u) return; p.rx = d.x; p.ry = d.y; p.f = d.f; p.mv = d.mv; p.seen = performance.now(); if (p.bot && p.wasHuman) p.bot = false;
    if (d.d && p.dashT <= 0) p.dashT = .2; });
  NET.r.on('bye', d => { if (d.u === NET.uid) return; if (NET.host) { const i = NET.list.findIndex(x => x.u === d.u); if (i >= 0 && MODE !== 'play') { NET.list.splice(i, 1); drawLobby(); } }
    else if (NET.list[0] && NET.list[0].u === d.u) { toast('المضيف طلع من الغرفة', 'bad'); if (MODE !== 'play') { netClose(); showScreen('menu'); } } });
  clearInterval(NET.iv); NET.iv = setInterval(() => {
    if (MODE === 'play') return;
    if (NET.host) { const now = performance.now(); NET.list = NET.list.filter(x => x.u === NET.uid || x.bot || now - (NET.seen[x.u] || now) < 6000); NET.emit('lobby', { list: NET.list }); drawLobby(); }
    else NET.emit('hi', myProfile());
  }, 1000);
  if (!host) NET.emit('hi', myProfile());
  $('#code').textContent = code; showScreen('lobby'); drawLobby();
}
function netClose() { if (NET.r) { NET.emit('bye', {}); try { NET.r.leave(); } catch (e) {} } clearInterval(NET.iv); NET.r = null; NET.list = []; }
function lobbyMsg(t, c) { const el = $('#lobbyMsg'); el.textContent = t; el.className = 'msg ' + (c || ''); }
function drawLobby() {
  const L = NET.list, el = $('#plist'); let h = '';
  for (let i = 0; i < 4; i++) { const p = L[i]; h += p ? `<div class="pl" style="--c:${COL[i]}"><img src="${SPR.IMG[(p.ch === 'h' ? 'herder' : 'farmer') + i].src}"><span>${esc(p.nm)}${p.u === NET.uid ? ' (أنت)' : ''}${i === 0 ? ' 👑' : ''}</span>${p.bot ? '<em>كمبيوتر</em>' : ''}${NET.host && p.bot ? `<button class="x" data-i="${i}">✕</button>` : ''}</div>` : `<div class="pl empty"><span>بانتظار لاعب…</span></div>`; }
  el.innerHTML = h; el.querySelectorAll('.x').forEach(b => b.onclick = () => { NET.list.splice(+b.dataset.i, 1); drawLobby(); });
  $('#hostCtl').style.display = NET.host ? '' : 'none'; $('#guestWait').style.display = NET.host ? 'none' : '';
  $('#startBtn').disabled = L.length < 2; $('#addBot').disabled = L.length >= 4;
  if (!NET.host) lobbyMsg(L.length ? '' : 'جاري الدخول للغرفة…');
}
let botN = 0; const BOTNAMES = ['أبو جمل', 'راعي الغنم', 'أم ركبة', 'الفلاح الفصيح', 'شيخ المزرعة'];
function addBot() { if (NET.list.length >= 4) return; NET.list.push({ u: 'bot' + (++botN), nm: BOTNAMES[botN % BOTNAMES.length], ch: Math.random() < .5 ? 'f' : 'h', bot: 1 }); drawLobby(); }

// ───────────── البدء ─────────────
function resetPlay() { POPS.length = 0; endShown = false; hudKey = ''; seenEv.clear(); $('#rule').textContent = ''; IN.dash = false; }
function startHost(list) {
  resetPlay(); V = null; ME.slot = list.findIndex(x => x.u === NET.uid); if (ME.slot < 0) ME.slot = 0;
  newSim(list); S.players.forEach(p => { if (!p.bot) p.wasHuman = true; });
  MODE = 'play'; showScreen('game'); showMemo('start'); SND.memo();
  if (NET.r) { NET.started = true; NET.emit('start', { list }); }
}
function startClient(list, me) {
  resetPlay(); S = null; ME.slot = me; NET.list = list;
  V = { players: list.map((p, i) => ({ slot: i, name: p.nm, ch: p.ch, bot: !!p.bot, x: penC(i).x + (PENS[i].g === 'r' ? 150 : -150), y: penC(i).y, f: 1, stun: 0, dashCd: 0, dashT: 0, mv: 0 })),
    animals: new Map(), jay: { x: W / 2, y: H / 2, tx: W / 2, ty: H / 2, f: 1, st: 'walk', glow: 0 }, memo: 'start', mi: 1, t: ROUND, phase: 'play', lastSnap: performance.now() };
  MODE = 'play'; showScreen('game'); showMemo('start'); SND.memo();
}
function showScreen(id) { document.querySelectorAll('.scr').forEach(s => s.classList.toggle('on', s.id === id)); document.body.classList.toggle('playing', id === 'game' || id === 'end'); }

// ───────────── الواجهة ─────────────
const PROF = { ch: localStorage.getItem('farm-ch') || 'f' };
function initUI() {
  $('#name').value = localStorage.getItem('farm-name') || '';
  $('#name').oninput = () => localStorage.setItem('farm-name', $('#name').value);
  const setCh = c => { PROF.ch = c; localStorage.setItem('farm-ch', c); document.querySelectorAll('.chp').forEach(b => b.classList.toggle('on', b.dataset.c === c)); };
  document.querySelectorAll('.chp').forEach(b => b.onclick = () => setCh(b.dataset.c)); setCh(PROF.ch);
  $('#chF').src = SPR.IMG.farmer0.src; $('#chH').src = SPR.IMG.herder0.src; $('#heroJay').src = SPR.IMG.jayFlop.src;
  let bots = 3; const setB = n => { bots = n; document.querySelectorAll('.bn').forEach(b => b.classList.toggle('on', +b.dataset.n === n)); }; document.querySelectorAll('.bn').forEach(b => b.onclick = () => setB(+b.dataset.n)); setB(3);
  $('#solo').onclick = () => { au(); netClose(); NET.host = true; const list = [myProfile()]; for (let i = 0; i < bots; i++) { botN++; list.push({ u: 'bot' + botN, nm: BOTNAMES[(botN) % BOTNAMES.length], ch: i % 2 ? 'f' : 'h', bot: 1 }); } NET.list = list; startHost(list); };
  $('#create').onclick = () => { au(); openRoom(true, String(1000 + Math.random() * 9000 | 0)); };
  $('#join').onclick = () => { au(); const c = ($('#joinCode').value || '').replace(/\D/g, ''); if (c.length !== 4) { $('#joinCode').focus(); $('#joinCode').classList.add('err'); return; } openRoom(false, c); };
  $('#addBot').onclick = addBot;
  $('#startBtn').onclick = () => { au(); if (NET.list.length < 2) return; const go = () => startHost(NET.list.slice()); if (NET.r && NET.r.clear) NET.r.clear().then(go, go); else go(); };
  $('#leave').onclick = () => { netClose(); showScreen('menu'); };
  $('#share').onclick = () => { const url = location.origin + location.pathname + '?r=' + NET.code + (LOCAL ? '&local=1' : ''), txt = 'تعال العب معي «مزرعة الشيوخ» 🐑😼 رمز الغرفة: ' + NET.code;
    if (navigator.share) navigator.share({ title: 'مزرعة الشيوخ', text: txt, url }).catch(() => {}); else { navigator.clipboard && navigator.clipboard.writeText(txt + '\n' + url); lobbyMsg('نسخت الرابط، أرسله لهم', 'good'); } };
  $('#again').onclick = () => { if (NET.r) { NET.list = NET.list.filter(x => x.bot || x.u === NET.uid || S.players.some(p => p.u === x.u && !p.bot)); }
    if (NET.list.length < 2) { showScreen(NET.r ? 'lobby' : 'menu'); MODE = 'menu'; return; } const go = () => startHost(NET.list.slice()); if (NET.r && NET.r.clear) NET.r.clear().then(go, go); else go(); };
  $('#toMenu').onclick = () => { MODE = 'menu'; S = null; V = null; if (NET.r && NET.host) { showScreen('lobby'); drawLobby(); } else { netClose(); showScreen('menu'); } };
  $('#snd').onclick = () => { AU.on = !AU.on; localStorage.setItem('farm-snd', AU.on ? '1' : '0'); $('#snd').textContent = AU.on ? '🔊' : '🔇'; }; $('#snd').textContent = AU.on ? '🔊' : '🔇';
  $('#quit').onclick = () => { if (!confirmQuit()) return; MODE = 'menu'; S = null; V = null; netClose(); showScreen('menu'); };
  const m = location.search.match(/[?&]r=(\d{4})/); if (m) { $('#joinCode').value = m[1]; }
}
let quitArm = 0; function confirmQuit() { const now = Date.now(); if (now - quitArm < 2500) return true; quitArm = now; toast('اضغط مرة ثانية للخروج', 'info'); return false; }
addEventListener('beforeunload', () => netClose());

SPR.ready.then(() => {
  cv = $('#cv'); cx = cv.getContext('2d'); setupInput(cv); addEventListener('resize', resize); resize(); initUI();
  document.fonts && document.fonts.ready.then(() => drawBg());
  requestAnimationFrame(loop);
  if (/[?&]auto=solo/.test(location.search)) $('#solo').click();
});
