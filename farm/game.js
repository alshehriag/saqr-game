'use strict';
// «مزرعة الشيوخ — مين شيخ المزرعة؟» — جولات قصيرة، والفائز بكل جولة ياخذ ختم. أول من يجمع ٣ أختام يتتوّج
// المضيف يشغّل المحاكاة كلها، وكل لاعب يتحكم بحركته هو، والعرض عند الكل من نفس «اللقطة»
const W = 720, H = 1080, NEED = 3, BASE_SPD = 215, CAP = 6;
const PENS = [
  { x: 16, y: 70, w: 210, h: 170, g: 'r' }, { x: 494, y: 70, w: 210, h: 170, g: 'l' },
  { x: 16, y: 842, w: 210, h: 170, g: 'r' }, { x: 494, y: 842, w: 210, h: 170, g: 'l' }];
const COL = SPR.COLORS;
const ROUNDS = {
  sleep: { n: 'لا تصحّون جاي', ic: '😴', d: 'امشوا لين توصلون باب البيت وجاي نايم. إذا فتح عيونه 👀 وقّفوا مكانكم… اللي يتحرك يرجع من أول!', time: 70, spd: .55 },
  hungry: { n: 'جاي جوعان', ic: '🐟', d: 'يلاحق الكل! اشردوا منه، ولمّوا علب التونة وارموها له عشان ينشغل… بس انتبهوا، فيه علب فاضية!', time: 75, spd: 1 },
  herd: { n: 'جمّع القطيع', ic: '🐑', d: 'المسوا الخرفان وتمشي وراكم، ودخّلوها زرايبكم. البعير بثلاث نقاط. وانتبهوا: جاي يلاحق اللي معه أكبر قطيع!', time: 60, spd: 1 } };
const RKEYS = Object.keys(ROUNDS);

const $ = s => document.querySelector(s);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const inPen = (p, i, m = 0) => { const r = PENS[i]; return p.x > r.x - m && p.x < r.x + r.w + m && p.y > r.y - m && p.y < r.y + r.h + m; };
const penC = i => ({ x: PENS[i].x + PENS[i].w / 2, y: PENS[i].y + PENS[i].h / 2 });
const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ───────────── الصوت ─────────────
const AU = { ctx: null, on: localStorage.getItem('farm-snd') !== '0' };
function au() {
  if (!AU.ctx) { try { if (navigator.audioSession && !VOICE.on) navigator.audioSession.type = 'playback'; } catch (e) {} try { AU.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (AU.ctx && AU.ctx.state !== 'running') { try { AU.ctx.resume(); } catch (e) {} }
  return AU.on && AU.ctx ? AU.ctx : null;
}
// الآيفون ما يشغّل الصوت إلا بعد لمسة حقيقية (touchend/click)، وزر الصامت يكتم Web Audio — نفتح الصوت بمقطع صامت ونخليه «تشغيل» مو «رنين»
function unlockAudio() {
  const c = au(); if (!c || AU.unlocked) return;
  try { const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch (e) {}
  try { const el = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQbFAZC1CQEwTJ9mjRvBA4UOLD8nKVOWfh+UlK3z/177OXrfOdKl7pyn3Xf//WreyTRUoAWgBgkOAGbZHBgG1OF6zM82DWbZaUmMBptgQhGjsyYqc9ae9XFz280948NMBWInljyzsNRFLPWdnZGWrddDsjK1unuSrVN9jJsK8KuQtQCtMBjCEtImISdNKJOopIpBFpNSMbIHCSRpRR5iakjTiyzLhchUUBwCgyKiweBv/7UsQbg8isVNoMPMjAAAA0gAAABEVFGmgqK////9bP/6XCykxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'); el.volume = 0; el.play().catch(() => {}); } catch (e) {}
  AU.unlocked = c.state === 'running'; loadSfx();
}
['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlockAudio, { capture: true, passive: true }));
// أصوات حقيقية: معلّق سعودي (Puck) + مواء بسس + مؤثرات — تتحمّل مرة وحدة بعد أول لمسة
const SFXN = ['welcome', 'r_sleep', 'r_hungry', 'r_herd', 'c3', 'c2', 'c1', 'go', 'awake', 'busted', 'caught', 'fake', 'tunaeat', 'target', 'stamp', 'pick', 'crown', 'last10', 'meow', 'pop', 'whoosh', 'cheer'];
const BUF = {}; let sfxLoading = false, voSrc = null;
function loadSfx() {
  const c = AU.ctx; if (!c || sfxLoading) return; sfxLoading = true;
  SFXN.forEach(n => fetch('snd/' + n + '.mp3').then(r => r.arrayBuffer()).then(b => new Promise((res, rej) => c.decodeAudioData(b, res, rej))).then(buf => { BUF[n] = buf; if (n === 'welcome' && MODE === 'menu' && !AU.welcomed) { AU.welcomed = true; play('welcome', 1, true); } }).catch(() => {}));
}
function play(n, vol = 1, vo = false, rate = 1) {
  const c = au(); if (!c || !BUF[n]) return false;
  try { const s = c.createBufferSource(), g = c.createGain(); s.buffer = BUF[n]; s.playbackRate.value = rate; g.gain.value = vol; s.connect(g).connect(c.destination);
    if (vo) { if (voSrc) try { voSrc.stop(); } catch (e) {} voSrc = s; } s.start(); return true; } catch (e) { return false; }
}
const VO = (n) => play(n, 1, true);
document.addEventListener('visibilitychange', () => { if (!document.hidden && NET.r && NET.host && MODE !== 'play') NET.emit('lobby', { list: NET.list }); if (!document.hidden && AU.ctx) { AU.unlocked = false; try { AU.ctx.resume(); } catch (e) {} } });
function tone(f1, f2, dur, type = 'sine', vol = .12, delay = 0) {
  const c = au(); if (!c) return; const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + .02);
}
const SND = {
  pick() { play('pop', .6, false, 1.15) || tone(520, 880, .09, 'sine', .1); }, bank() { tone(660, 660, .1, 'triangle', .12); tone(990, 990, .16, 'triangle', .12, .09); },
  bad() { tone(500, 180, .35, 'triangle', .12); }, caught() { tone(400, 90, .5, 'sawtooth', .07); },
  stir() { play('meow', .8) || (tone(300, 340, .12, 'triangle', .08), tone(340, 300, .12, 'triangle', .08, .14)); },
  awake() { tone(880, 880, .12, 'square', .07); tone(660, 660, .2, 'square', .07, .14); },
  memo() { tone(110, 60, .2, 'square', .12); tone(220, 220, .08, 'triangle', .08, .22); },
  tick() { tone(1000, 1000, .06, 'square', .05); }, go() { tone(1320, 1320, .25, 'square', .07); },
  stamp() { tone(90, 50, .25, 'square', .16); tone(140, 70, .15, 'triangle', .1, .05); },
  win() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, f, .3, 'triangle', .1, i * .15)); },
  throw() { play('whoosh', .7) || tone(400, 900, .15, 'sine', .1); },
  dash() { play('whoosh', .45, false, 1.3); } };

// ───────────── الإدخال ─────────────
const IN = { jx: 0, jy: 0, id: null, ox: 0, oy: 0, keys: {}, act: false };
function setupInput(cv) {
  const start = (id, x, y) => { IN.id = id; IN.ox = x; IN.oy = y; IN.jx = IN.jy = 0; };
  const move = (x, y) => { const dx = x - IN.ox, dy = y - IN.oy, m = Math.hypot(dx, dy), R = 55;
    if (m > R) { IN.ox = x - dx / m * R; IN.oy = y - dy / m * R; } const k = Math.min(1, m / R) / (m || 1); IN.jx = dx * k; IN.jy = dy * k; };
  const end = () => { IN.id = null; IN.jx = IN.jy = 0; };
  cv.addEventListener('touchstart', e => { au(); const t = e.changedTouches[0]; if (IN.id === null) start(t.identifier, t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchmove', e => { for (const t of e.changedTouches) if (t.identifier === IN.id) move(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
  const te = e => { for (const t of e.changedTouches) if (t.identifier === IN.id) end(); };
  cv.addEventListener('touchend', e => { unlockAudio(); te(e); }); cv.addEventListener('touchcancel', te);
  cv.addEventListener('mousedown', e => { au(); start('m', e.clientX, e.clientY); });
  addEventListener('mousemove', e => { if (IN.id === 'm') move(e.clientX, e.clientY); });
  addEventListener('mouseup', () => { if (IN.id === 'm') end(); });
  addEventListener('keydown', e => { IN.keys[e.key.toLowerCase()] = 1; if (e.key === ' ' || e.key === 'Shift') { IN.act = true; e.preventDefault(); } });
  addEventListener('keyup', e => { IN.keys[e.key.toLowerCase()] = 0; });
  const db = $('#act'); const tap = e => { unlockAudio(); IN.act = true; e.preventDefault(); e.stopPropagation(); };
  db.addEventListener('touchstart', tap, { passive: false }); db.addEventListener('mousedown', tap);
}
function readDir() {
  let x = IN.jx, y = IN.jy; const k = IN.keys;
  const kx = (k['arrowright'] || k['d'] ? 1 : 0) - (k['arrowleft'] || k['a'] ? 1 : 0), ky = (k['arrowdown'] || k['s'] ? 1 : 0) - (k['arrowup'] || k['w'] ? 1 : 0);
  if (kx || ky) { const m = Math.hypot(kx, ky); x = kx / m; y = ky / m; }
  return { x, y };
}

// ═════════════ المحاكاة (عند المضيف) ═════════════
let S = null;
function emit(kind, x, y, txt, slot = -1) { S.ev.push({ e: [S.evId++, kind, x | 0, y | 0, txt, slot], t: S.clock }); }
function newMatch(list) {
  S = { clock: 0, players: [], stamps: list.map(() => 0), ph: 'intro', tm: 0, rd: 'sleep', played: [], ev: [], evId: 1, nid: 1, animals: [], tunas: [], rank: [], win: -1, pick: -1, opts: [], champ: -1,
    jay: { x: W / 2, y: H / 2, f: 1, st: 'sleep', t: 0, tx: W / 2, ty: H / 2 } };
  list.forEach((pl, i) => S.players.push({ slot: i, u: pl.u, name: pl.nm, ch: pl.ch, bot: !!pl.bot, wasHuman: !pl.bot, x: 0, y: 0, f: 1, stun: 0, out: 0, tp: 0, hold: 0, fake: 0,
    dashT: 0, dashCd: 0, trail: [], sc: 0, hist: [], seen: performance.now(), act: 0, ai: { t: 0 }, mv: 0 }));
  beginRound('sleep');
}
function place(p, x, y) { p.x = x; p.y = y; p.rx = x; p.ry = y; p.tp++; p.hist = []; }
function beginRound(k) {
  const s = S; s.rd = k; s.ph = 'intro'; s.tm = 5; s.rTime = ROUNDS[k].time; s.animals = []; s.tunas = []; s.rank = []; s.win = -1; s.outOrder = []; s.played.push(k);
  const n = s.players.length, j = s.jay; j.f = 1; j.t = 0; j.angry = 0;
  s.players.forEach(p => { p.out = 0; p.stun = 0; p.hold = 0; p.trail = []; p.sc = 0; p.dashT = 0; p.mv = 0; p.ai = { t: 0 }; });
  if (k === 'sleep') { const xs = n === 2 ? [270, 450] : n === 3 ? [200, 360, 520] : [150, 290, 430, 570]; s.players.forEach((p, i) => place(p, xs[i], 1000)); Object.assign(j, { x: W / 2, y: 255, st: 'sleep', t: rnd(2.5, 4) }); }
  if (k === 'hungry') { const sp = [[150, 860], [570, 860], [150, 600], [570, 600]]; s.players.forEach((p, i) => place(p, sp[i][0], sp[i][1])); Object.assign(j, { x: W / 2, y: 200, st: 'chase', t: 0, tgt: -1, tgtT: 0 }); s.tunaT = 3; }
  if (k === 'herd') { s.players.forEach((p, i) => { const c = penC(i); place(p, PENS[i].g === 'r' ? PENS[i].x + PENS[i].w + 40 : PENS[i].x - 40, c.y); });
    for (let i = 0; i < 16; i++) spawnAnimal(i < 3 ? 'c' : 's'); Object.assign(j, { x: W / 2, y: H / 2, st: 'walk', t: 4, tx: W / 2, ty: H / 2, tgt: -1 }); }
  emit('round', W / 2, H / 2, k);
}
function endRound(rank) {
  const s = S; s.rank = rank; s.win = rank[0]; s.stamps[s.win]++; s.ph = 'result'; s.tm = 4.2; emit('stamp', W / 2, H / 2, '', s.win);
}
function afterResult() {
  const s = S, best = Math.max(...s.stamps);
  if (best >= NEED) { s.champ = s.stamps.indexOf(best); s.ph = 'crown'; s.tm = 0; emit('crown', W / 2, H / 2, '', s.champ); return; }
  s.pick = s.rank[s.rank.length - 1]; const others = RKEYS.filter(k => k !== s.rd); s.opts = shuffle(others).slice(0, 2);
  s.ph = 'pick'; s.tm = s.players[s.pick].bot ? 2 : 9;
}
function choose(c) { if (S.ph !== 'pick' || !S.opts.includes(c)) return; emit('chosen', W / 2, H / 2, c, S.pick); beginRound(c); }

function spd(p) { let v = BASE_SPD * ROUNDS[S.rd].spd; if (S.rd === 'herd') { const cam = p.trail.filter(id => (aById(id) || {}).k === 'c').length; v *= Math.max(.7, 1 - .1 * cam); } if (p.dashT > 0) v *= 2.4; return v; }
function moveP(p, dir, dt) {
  if (p.stun > 0 || p.out || S.ph !== 'play') { p.mv = 0; return; }
  const v = spd(p); let dx = dir.x, dy = dir.y; if (p.dashT > 0 && !dx && !dy) dx = p.f;
  p.x = clamp(p.x + dx * v * dt, 20, W - 20); p.y = clamp(p.y + dy * v * dt, 24, H - 20);
  if (Math.abs(dx) > .1) p.f = dx > 0 ? 1 : -1; p.mv = Math.hypot(dx, dy);
  if (S.rd === 'sleep') pushOut(p, S.jay.x, S.jay.y, 62);
}
function pushOut(o, cx, cy, r) { const dx = o.x - cx, dy = o.y - cy, m = Math.hypot(dx, dy); if (m < r && m > .01) { o.x = cx + dx / m * r; o.y = cy + dy / m * r; } }
function doAct(p) { // زر الحركة: يرمي تونة لو معه، وإلا اندفاع
  if (S.ph !== 'play' || p.out) return;
  if (S.rd === 'hungry' && p.hold) { throwTuna(p); return; }
  if (p.dashCd <= 0 && p.stun <= 0 && S.rd !== 'sleep') { p.dashT = .28; p.dashCd = 2.2; if (p.slot === ME.slot && !p.bot) SND.dash(); }
}

function stepSim(dt) {
  const s = S; s.clock += dt; s.ev = s.ev.filter(o => s.clock - o.t < 2.5);
  for (const p of s.players) { p.stun = Math.max(0, p.stun - dt); p.dashT = Math.max(0, p.dashT - dt); p.dashCd -= dt;
    if (!p.bot && p.slot !== ME.slot && performance.now() - p.seen > 7000) { p.bot = true; emit('info', p.x, p.y, 'النت فصل عند ' + p.name + ' — الكمبيوتر يلعب بداله'); } }
  if (s.ph === 'intro') { const before = Math.ceil(s.tm); s.tm -= dt; if (Math.ceil(s.tm) !== before && s.tm > 0 && s.tm <= 3) emit('count', 0, 0, String(Math.ceil(s.tm))); if (s.tm <= 0) { s.ph = 'play'; s.tm = s.rTime; emit('go', 0, 0, ''); } }
  else if (s.ph === 'result') { s.tm -= dt; if (s.tm <= 0) afterResult(); }
  else if (s.ph === 'pick') { s.tm -= dt; if (s.players[s.pick].bot && s.tm < 1) choose(s.opts[Math.random() * 2 | 0]); else if (s.tm <= 0) choose(s.opts[0]); }
  for (const p of s.players) {
    if (p.bot) botThink(p, dt);
    else if (p.slot === ME.slot) { if (IN.act) { IN.act = false; doAct(p); } moveP(p, readDir(), dt); }
    else if (p.rx != null) { const k = 1 - Math.exp(-dt * 14); p.x += (p.rx - p.x) * k; p.y += (p.ry - p.y) * k; }
    const h = p.hist, l = h[h.length - 1]; if (!l || Math.hypot(l.x - p.x, l.y - p.y) > 5) { h.push({ x: p.x, y: p.y }); if (h.length > 90) h.shift(); }
  }
  if (s.ph !== 'play') { if (s.rd === 'herd') stepAnimals(dt); return; }
  s.tm -= dt;
  if (s.rd === 'sleep') stepSleep(dt); else if (s.rd === 'hungry') stepHungry(dt); else stepHerd(dt);
}

// ── جولة «لا تصحّون جاي» ──
function stepSleep(dt) {
  const s = S, j = s.jay; j.t -= dt;
  if (j.t <= 0) {
    if (j.st === 'sleep') { if (Math.random() < .28) { j.st = 'fake'; j.t = .7; } else { j.st = 'stir'; j.t = .75; } emit('stir', j.x, j.y, ''); }
    else if (j.st === 'fake') { j.st = 'sleep'; j.t = rnd(1.4, 3.5); emit('fake', j.x, j.y - 90, 'هههه… رجع نام 😴'); }
    else if (j.st === 'stir') { j.st = 'awake'; j.t = rnd(1.7, 2.8); j.grace = .5; s.players.forEach(p => p.ref = null); emit('awake', j.x, j.y, ''); }
    else { j.st = 'sleep'; j.t = rnd(1.5, 4.2); emit('sleep', j.x, j.y - 90, 'Zzz…'); }
  }
  if (j.st === 'awake') { j.grace -= dt;
    if (j.grace <= 0) for (const p of s.players) { const q = p.slot === ME.slot || p.bot ? p : { x: p.rx, y: p.ry };
      if (!p.ref) { p.ref = { x: q.x, y: q.y }; continue; }
      if (Math.hypot(q.x - p.ref.x, q.y - p.ref.y) > 22) { emit('busted', q.x, q.y, 'جاي شافك! 👀 ارجع من أول', p.slot); place(p, p.x, 1000); p.ref = { x: p.x, y: 1000 }; } } }
  const fin = s.players.find(p => p.y < 330);
  if (fin || s.tm <= 0) endRound(s.players.slice().sort((a, b) => a.y - b.y).map(p => p.slot));
}
// ── جولة «جاي جوعان» ──
function stepHungry(dt) {
  const s = S, j = s.jay, alive = s.players.filter(p => !p.out), el = s.rTime - s.tm;
  s.tunaT -= dt; if (s.tunaT <= 0 && s.tunas.filter(t => !t.thrown).length < 2) { s.tunaT = rnd(4, 7); const p = { x: rnd(60, W - 60), y: rnd(120, H - 80) }; s.tunas.push({ id: s.nid++, x: p.x, y: p.y, thrown: 0 }); }
  for (const t of s.tunas.slice()) if (!t.thrown) for (const p of alive) if (!p.hold && dist(p, t) < 34) { p.hold = 1; p.fake = Math.random() < .3; s.tunas.splice(s.tunas.indexOf(t), 1); emit('tuna', p.x, p.y, 'جبت تونة 🐟 لا قرّب جاي اضغط «ارمها»', p.slot); break; }
  j.angry = Math.max(0, j.angry - dt);
  if (j.st === 'eat') { j.t -= dt; const t = s.tunas.find(t => t.id === j.food); if (t && dist(j, t) > 8) { stepTo(j, t, 320 * dt); } else if (t) { if (j.t <= 0) { s.tunas.splice(s.tunas.indexOf(t), 1); j.st = 'chase'; j.tgtT = 0; } } else { j.st = 'chase'; } }
  else if (j.st === 'rest') { j.t -= dt; if (j.t <= 0) { j.st = 'chase'; j.tgtT = 0; } }
  else {
    j.tgtT -= dt; let tg = s.players[j.tgt]; if (!tg || tg.out || j.tgtT <= 0) { if (!j.angry || !tg || tg.out) { tg = alive.slice().sort((a, b) => dist(a, j) - dist(b, j))[0]; j.tgt = tg ? tg.slot : -1; } j.tgtT = 2.5; }
    tg = s.players[j.tgt]; if (tg && !tg.out) {
      const v = (135 + el * 2.3 + (j.angry > 0 ? 55 : 0) + (el > 60 ? 80 : 0)) * dt; stepTo(j, tg, v);
      if (dist(j, tg) < 38) { tg.out = 1; tg.hold = 0; s.outOrder.push(tg.slot); emit('caught', tg.x, tg.y, 'جاي صاد ' + tg.name + '! 😵', tg.slot); j.st = 'rest'; j.t = 1.1; }
    }
  }
  const left = s.players.filter(p => !p.out).length;
  if (left <= 1 || s.tm <= 0) { const al = shuffle(s.players.filter(p => !p.out).map(p => p.slot)); endRound(al.concat(s.outOrder.slice().reverse())); }
}
function stepTo(o, t, v) { const dx = t.x - o.x, dy = t.y - o.y, m = Math.hypot(dx, dy) || 1; const k = Math.min(1, v / m); o.x += dx * k; o.y += dy * k; if (Math.abs(dx) > 2) o.f = dx > 0 ? 1 : -1; }
function throwTuna(p) {
  p.hold = 0; const j = S.jay;
  if (p.fake) { j.st = 'chase'; j.tgt = p.slot; j.tgtT = 4; j.angry = 3.5; emit('fake', p.x, p.y, 'التونة طلعت فاضية! 😾 جاي زعلان ويبيك أنت', p.slot); }
  else { const t = { id: S.nid++, x: clamp(p.x - p.f * 70, 30, W - 30), y: p.y + 10, thrown: 1 }; S.tunas.push(t); j.st = 'eat'; j.food = t.id; j.t = 2.6; emit('throw', t.x, t.y, 'جاي انشغل بالتونة 😋', p.slot); }
}
// ── جولة «جمّع القطيع» ──
function aById(id) { return S.animals.find(a => a.id === id); }
function freeSpot() { for (let k = 0; k < 40; k++) { const p = { x: rnd(40, W - 40), y: rnd(40, H - 40) }; if (S.players.some((q, i) => inPen(p, i, 40)) || S.players.some(q => dist(q, p) < 110)) continue; return p; } return { x: W / 2, y: H / 2 }; }
function spawnAnimal(k) { const p = freeSpot(); const a = { id: S.nid++, k, x: p.x, y: p.y, own: -1, hd: rnd(0, 6.28), wT: 0, vx: 0, vy: 0, f: 1 }; S.animals.push(a); return a; }
function stepAnimals(dt) {
  const s = S;
  for (const a of s.animals) {
    a.wT = Math.max(0, a.wT - dt);
    if (a.own >= 0) { const p = s.players[a.own], i = p.trail.indexOf(a.id); if (i < 0) { a.own = -1; continue; }
      const h = p.hist, tg = h[Math.max(0, h.length - 1 - (i + 1) * 7)] || p, k = 1 - Math.exp(-dt * 9); const nx = a.x + (tg.x - a.x) * k; if (Math.abs(nx - a.x) > .2) a.f = nx > a.x ? 1 : -1; a.x = nx; a.y += (tg.y - a.y) * k; continue; }
    const sp = a.k === 'c' ? 34 : 50; a.hd += rnd(-1.5, 1.5) * dt; let vx = Math.cos(a.hd) * sp, vy = Math.sin(a.hd) * sp; if (a.wT > 0) { vx += a.vx; vy += a.vy; }
    a.x += vx * dt; a.y += vy * dt; if (Math.abs(vx) > 2) a.f = vx > 0 ? 1 : -1;
    if (a.x < 24 || a.x > W - 24) { a.hd = Math.PI - a.hd; a.x = clamp(a.x, 24, W - 24); } if (a.y < 30 || a.y > H - 24) { a.hd = -a.hd; a.y = clamp(a.y, 30, H - 24); }
    s.players.forEach((q, i) => { if (inPen(a, i, 14)) { const r = PENS[i], c = penC(i); const ex = a.x < c.x ? r.x - 15 : r.x + r.w + 15, ey = a.y < c.y ? r.y - 15 : r.y + r.h + 15; if (Math.abs(ex - a.x) < Math.abs(ey - a.y)) a.x = ex; else a.y = ey; a.hd += Math.PI; } });
  }
}
function stepHerd(dt) {
  const s = S, j = s.jay; stepAnimals(dt);
  for (const p of s.players) {
    if (p.stun > 0) continue;
    for (const a of s.animals) if (a.own === -1 && a.wT <= 0 && p.trail.length < CAP && dist(p, a) < (a.k === 'c' ? 42 : 34)) { a.own = p.slot; p.trail.push(a.id); emit('pick', a.x, a.y, a.k === 'c' ? '+بعير' : '+خروف', p.slot); }
    if (p.trail.length && inPen(p, p.slot)) { let got = 0; for (const id of p.trail) { const a = aById(id); if (a) { s.animals.splice(s.animals.indexOf(a), 1); got += a.k === 'c' ? 3 : 1; } } p.trail = []; p.sc += got; emit('bank', p.x, p.y, '+' + got, p.slot); }
  }
  if (s.animals.filter(a => a.own === -1).length < 12 && Math.random() < dt * 2) spawnAnimal(Math.random() < .18 ? 'c' : 's');
  j.t -= dt;
  if (j.st === 'flop') { if (j.t <= 0) { j.st = 'walk'; j.t = 2; } }
  else { const tg = s.players.filter(p => p.trail.length >= 2 && p.stun <= 0).sort((a, b) => b.trail.length - a.trail.length)[0];
    if (tg) { if (j.tgt !== tg.slot) emit('target', tg.x, tg.y, '😼 جاي جايك! دخّل قطيعك الزريبة بسرعة', tg.slot); j.tgt = tg.slot; j.st = 'chase'; stepTo(j, tg, (150 + (s.rTime - s.tm) * 1.2) * dt);
      if (dist(j, tg) < 40) { for (const id of tg.trail) { const a = aById(id); if (a) { const an = rnd(0, 6.28); a.own = -1; a.wT = .7; a.vx = Math.cos(an) * 170; a.vy = Math.sin(an) * 170; } } tg.trail = []; tg.stun = 1.1; j.st = 'flop'; j.t = 2.2; j.tgt = -1; emit('scatter', tg.x, tg.y, 'جاي فرّق قطيعك! 😼', tg.slot); } }
    else { j.tgt = -1; j.st = 'walk'; if (dist(j, { x: j.tx, y: j.ty }) < 10) { const p = freeSpot(); j.tx = p.x; j.ty = p.y; } stepTo(j, { x: j.tx, y: j.ty }, 45 * dt); } }
  if (s.tm <= 0) endRound(shuffle(s.players.slice()).sort((a, b) => b.sc - a.sc).map(p => p.slot));
}

// ── الكمبيوتر ──
function botThink(p, dt) {
  const s = S, ai = p.ai, j = s.jay; ai.t -= dt;
  if (s.ph !== 'play') { p.mv = 0; return; }
  if (s.rd === 'sleep') {
    if (ai.spd == null) { ai.spd = rnd(.55, .95); ai.react = rnd(.12, .45); ai.greedy = Math.random() < .22; }
    let go = j.st === 'sleep' || j.st === 'fake' || (j.st === 'stir' && ai.greedy);
    if (j.st === 'awake') { ai.stopT = (ai.stopT || 0) + dt; go = ai.greedy && ai.stopT < ai.react; } else ai.stopT = 0;
    if (j.st === 'sleep' && Math.random() < dt * .3) ai.greedy = Math.random() < .2;
    moveP(p, go ? { x: (W / 2 - p.x) * .002, y: -ai.spd } : { x: 0, y: 0 }, dt); return;
  }
  if (s.rd === 'hungry') {
    if (p.out) return; const dj = dist(p, j);
    if (p.hold && dj < 170 && j.st === 'chase' && j.tgt === p.slot) doAct(p);
    let tx, ty; const tuna = s.tunas.find(t => !t.thrown && !p.hold && dist(t, p) < 260 && dist(t, j) > 160);
    if (tuna && (j.tgt !== p.slot || dj > 220)) { tx = tuna.x - p.x; ty = tuna.y - p.y; }
    else { tx = p.x - j.x; ty = p.y - j.y; const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m; tx += (W / 2 - p.x) / 400; ty += (H / 2 - p.y) / 500; if (j.tgt !== p.slot && dj > 260) { tx *= .2; ty *= .2; } }
    const m = Math.hypot(tx, ty) || 1; if (dj < 95 && j.tgt === p.slot && p.dashCd <= 0 && Math.random() < .5) doAct(p);
    moveP(p, { x: tx / m * .82, y: ty / m * .82 }, dt); return;
  }
  if (ai.t <= 0) { ai.t = rnd(.35, .7); const own = penC(p.slot);
    if (p.trail.length >= (ai.want || 3) || (p.trail.length && (s.tm < 10 || (j.tgt === p.slot && dist(p, j) < 220)))) { ai.tx = own.x; ai.ty = own.y; ai.want = 2 + (Math.random() * 3 | 0); }
    else { let best = null, bd = 1e9; for (const a of s.animals) { if (a.own !== -1) continue; const d = dist(p, a) / (a.k === 'c' ? 1.6 : 1); if (d < bd) { bd = d; best = a; } } if (best) { ai.tx = best.x; ai.ty = best.y; } } }
  if (j.tgt === p.slot && dist(p, j) < 90 && p.dashCd <= 0) doAct(p);
  const dx = (ai.tx || p.x) - p.x, dy = (ai.ty || p.y) - p.y, m = Math.hypot(dx, dy); moveP(p, m < 8 ? { x: 0, y: 0 } : { x: dx / m * .8, y: dy / m * .8 }, dt);
}

// ═════════════ اللقطة والعرض (نفسها عند المضيف والضيف) ═════════════
const ME = { slot: 0 };
function snap() {
  const s = S, j = s.jay; return {
    ph: s.ph, rd: s.rd, tm: Math.ceil(s.tm * 10), sp: s.stamps, rk: s.rank, wn: s.win, pk: s.pick, op: s.opts, ch: s.champ,
    P: s.players.map(p => [p.slot, p.x | 0, p.y | 0, p.f, Math.round(p.stun * 10), p.out, p.tp, p.hold, p.sc, p.bot ? 1 : 0, p.trail.length, p.dashT > 0 ? 1 : 0, p.mv > .1 ? 1 : 0]),
    A: s.rd === 'herd' ? s.animals.map(a => [a.id, a.k, a.x | 0, a.y | 0, a.own, a.f]) : [],
    T: s.tunas.map(t => [t.id, t.x | 0, t.y | 0, t.thrown]),
    J: [j.x | 0, j.y | 0, j.st, j.f, j.tgt == null ? -1 : j.tgt, j.angry > 0 ? 1 : 0],
    E: s.ev.map(o => o.e) };
}
let V = null; const seenEv = new Set();
function newView(list) {
  V = { players: list.map((p, i) => ({ slot: i, name: p.nm, ch: p.ch, bot: !!p.bot, x: W / 2, y: H / 2, f: 1, stun: 0, out: 0, tp: -1, hold: 0, sc: 0, dashT: 0, dashCd: 0, mv: 0 })),
    animals: new Map(), tunas: [], jay: { x: W / 2, y: H / 2, f: 1, st: 'sleep' }, ph: 'intro', rd: 'sleep', tm: 0, sp: list.map(() => 0), rk: [], wn: -1, pk: -1, op: [], ch: -1, lastSnap: performance.now() };
}
function applySnap(d, direct) {
  V.lastSnap = performance.now(); Object.assign(V, { ph: d.ph, rd: d.rd, tm: d.tm / 10, sp: d.sp, rk: d.rk, wn: d.wn, pk: d.pk, op: d.op, ch: d.ch });
  for (const r of d.P) { const p = V.players[r[0]]; if (!p) continue; const self = r[0] === ME.slot && !direct;
    if (self) { if (p.tp !== r[6]) { p.tp = r[6]; p.x = r[1]; p.y = r[2]; } }
    else { if (direct || p.tp !== r[6]) { p.x = r[1]; p.y = r[2]; } p.tp = r[6]; p.tx = r[1]; p.ty = r[2]; p.f = r[3]; p.dashT = r[11] ? .1 : 0; p.mv = r[12]; }
    p.stun = r[4] / 10; p.out = r[5]; p.hold = r[7]; p.sc = r[8]; p.bot = !!r[9]; p.tl = r[10]; }
  const ids = new Set();
  for (const r of d.A) { ids.add(r[0]); let a = V.animals.get(r[0]); if (!a) { a = { id: r[0], k: r[1], x: r[2], y: r[3] }; V.animals.set(r[0], a); } a.tx = r[2]; a.ty = r[3]; a.own = r[4]; a.f = r[5]; if (direct) { a.x = r[2]; a.y = r[3]; } }
  for (const id of V.animals.keys()) if (!ids.has(id)) V.animals.delete(id);
  V.tunas = d.T; const j = V.jay; j.tx = d.J[0]; j.ty = d.J[1]; j.st = d.J[2]; j.f = d.J[3]; j.tgt = d.J[4]; j.angry = d.J[5];
  if (direct || j.st === 'sleep' || j.st === 'flop' || Math.hypot(j.x - j.tx, j.y - j.ty) > 200) { j.x = j.tx; j.y = j.ty; }
  for (const e of d.E) if (!seenEv.has(e[0])) { seenEv.add(e[0]); onEvent(e); }
}
function stepClient(dt) {
  const k = 1 - Math.exp(-dt * 12);
  for (const p of V.players) {
    if (p.slot === ME.slot) { p.dashCd -= dt; p.dashT = Math.max(0, p.dashT - dt); clientMove(p, dt); }
    else if (p.tx != null) { p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; } }
  for (const a of V.animals.values()) { a.x += (a.tx - a.x) * k; a.y += (a.ty - a.y) * k; }
  const j = V.jay; j.x += (j.tx - j.x) * k; j.y += (j.ty - j.y) * k;
}
let actCount = 0;
function clientMove(p, dt) {
  if (IN.act) { IN.act = false; if (V.ph === 'play' && !p.out) { if (V.rd === 'hungry' && p.hold) { actCount++; SND.throw(); } else if (p.dashCd <= 0 && p.stun <= 0 && V.rd !== 'sleep') { p.dashT = .28; p.dashCd = 2.2; SND.dash(); } } }
  if (V.ph !== 'play' || p.out || p.stun > 0) { p.mv = 0; return; }
  const dir = readDir(); let v = BASE_SPD * ROUNDS[V.rd].spd; if (V.rd === 'herd') { const cam = [...V.animals.values()].filter(a => a.own === ME.slot && a.k === 'c').length; v *= Math.max(.7, 1 - .1 * cam); } if (p.dashT > 0) v *= 2.4;
  let dx = dir.x, dy = dir.y; if (p.dashT > 0 && !dx && !dy) dx = p.f;
  p.x = clamp(p.x + dx * v * dt, 20, W - 20); p.y = clamp(p.y + dy * v * dt, 24, H - 20); if (Math.abs(dx) > .1) p.f = dx > 0 ? 1 : -1; p.mv = Math.hypot(dx, dy);
  if (V.rd === 'sleep') pushOut(p, V.jay.x, V.jay.y, 62);
}

// ───────────── الأحداث ─────────────
const POPS = [], PARTS = [];
function burst(x, y, n, cols, sp = 160) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, v = sp * (.4 + Math.random() * .6); PARTS.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, t: 0, life: .7 + Math.random() * .4, c: cols[i % cols.length], k: 'star', s: 5 + Math.random() * 5 }); } }
function onEvent(e) {
  const [, kind, x, y, txt, slot] = e, mine = slot === ME.slot;
  const pop = (c, big) => POPS.push({ x, y, txt, color: c, t: 0, big });
  switch (kind) {
    case 'round': SND.memo(); setTimeout(() => VO('r_' + txt), 500); break;
    case 'count': if (!VO('c' + txt)) SND.tick(); bigText(txt); break;
    case 'go': if (!VO('go')) SND.go(); bigText('يلا!'); break;
    case 'stir': SND.stir(); break;
    case 'awake': if (!VO('awake')) SND.awake(); play('meow', .7, false, .8); flash('#d93a2f'); bigText('وقّف! 👀'); break;
    case 'fake': pop('#ffe14d', true); if (mine) { if (!VO('fake')) SND.bad(); toast(txt, 'bad'); } break;
    case 'sleep': pop('#fff'); break;
    case 'busted': pop('#ff8a7a', true); if (mine) { if (!VO('busted')) SND.bad(); toast(txt, 'bad'); flash('#d93a2f'); } break;
    case 'tuna': if (mine) { SND.pick(); toast(txt, 'good'); } break;
    case 'throw': pop('#ffe14d', true); burst(x, y, 8, ['#ff9ad5', '#fff']); play('meow', .6, false, 1.2); if (mine) { SND.throw(); VO('tunaeat'); } break;
    case 'caught': pop('#ff8a7a', true); burst(x, y, 12, ['#fff', '#d9d2c5'], 220); play('meow', .9, false, .7) || SND.caught(); if (mine) { VO('caught'); toast('جاي صادك! 😵 اقعد تفرّج على الباقين', 'bad'); flash('#d93a2f'); } else toast(txt, 'info'); break;
    case 'pick': if (mine) { pop('#fff'); SND.pick(); } break;
    case 'bank': pop('#ffe14d', true); burst(x, y, 14, ['#ffe14d', '#fff', '#ffb14d']); if (mine) SND.bank(); break;
    case 'target': if (mine) { if (!VO('target')) SND.stir(); toast(txt, 'bad'); } break;
    case 'scatter': pop('#ff9ad5', true); burst(x, y, 12, ['#fff', '#e3d9c8'], 220); play('meow', .8, false, .9); if (mine) { SND.bad(); flash('#c2367f'); } break;
    case 'stamp': SND.stamp(); play('cheer', .5); if (mine) setTimeout(() => VO('stamp'), 400); break;
    case 'crown': play('cheer', .8) || SND.win(); setTimeout(() => VO('crown'), 300); break;
    case 'info': toast(txt, 'info'); break;
  }
}
let toastT = 0;
function toast(t, cls) { const el = $('#toast'); el.textContent = t; el.className = 'show ' + cls; clearTimeout(toastT); toastT = setTimeout(() => el.className = '', 2200); }
function bigText(t) { const el = $('#big'); el.textContent = t; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
function flash(c) { const el = $('#flash'); el.style.background = c; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }

// ───────────── الرسم ─────────────
let cv, cx, DPR = 1, SC = 1, OX = 0, OY = 0; const BG = {};
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1); cv.width = innerWidth * DPR; cv.height = innerHeight * DPR;
  const top = 92, bot = innerWidth < innerHeight ? 128 : 12; SC = Math.min(innerWidth / W, (innerHeight - top - bot) / H); OX = (innerWidth - W * SC) / 2; OY = top;
  for (const k in BG) delete BG[k];
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function spr(g, k, x, y, sc = 1, flip = 1, sy = 1) { const im = SPR.IMG[k], d = SPR.DIM[k]; if (!im || !im.complete) return; g.save(); g.translate(x, y); g.scale(flip * sc, sc * sy); g.drawImage(im, d[0], d[1], d[2], d[3]); g.restore(); }
let _hay; function hayTile() { if (_hay) return _hay; const c = document.createElement('canvas'); c.width = c.height = 18; const g = c.getContext('2d'); g.fillStyle = '#f3d98c'; g.fillRect(0, 0, 18, 18); g.strokeStyle = '#ddb85c'; g.lineWidth = 2; g.beginPath(); g.moveTo(2, 14); g.lineTo(9, 4); g.moveTo(10, 16); g.lineTo(16, 8); g.stroke(); return _hay = c; }
function fence(g, p, col) {
  // سياج خشب: أعمدة وعارضتين، والبوابة مفتوحة جهة الملعب
  const gx = p.g === 'r' ? p.x + p.w : p.x, y1 = p.y + p.h / 2 - 44, y2 = p.y + p.h / 2 + 44, ox = p.g === 'r' ? p.x : p.x + p.w;
  const segs = [[gx, y1, gx, p.y], [gx, p.y, ox, p.y], [ox, p.y, ox, p.y + p.h], [ox, p.y + p.h, gx, p.y + p.h], [gx, p.y + p.h, gx, y2]];
  g.lineCap = 'round';
  for (const [x1, ya, x2, yb] of segs) { for (const [off, w] of [[-6, 6], [5, 6]]) { g.strokeStyle = '#6b3f1d'; g.lineWidth = w + 3; g.beginPath(); g.moveTo(x1, ya + off); g.lineTo(x2, yb + off); g.stroke(); g.strokeStyle = '#b07a45'; g.lineWidth = w; g.beginPath(); g.moveTo(x1, ya + off); g.lineTo(x2, yb + off); g.stroke(); } }
  for (const [x1, ya, x2, yb] of segs) { const L = Math.hypot(x2 - x1, yb - ya), n = Math.max(1, Math.round(L / 34));
    for (let k = 0; k <= n; k++) { const x = x1 + (x2 - x1) * k / n, y = ya + (yb - ya) * k / n; g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(x + 2, y + 12, 7, 3, 0, 0, 7); g.fill();
      g.fillStyle = '#6b3f1d'; rr(g, x - 6, y - 16, 12, 28, 4); g.fill(); g.fillStyle = '#c48a52'; rr(g, x - 4, y - 14, 8, 24, 3); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(x, y - 15, 4.5, 0, 7); g.fill(); } }
}
function getBg(rd, n) {
  const key = rd + n; if (BG[key]) return BG[key];
  const c = document.createElement('canvas'); c.width = Math.ceil(W * SC * DPR); c.height = Math.ceil(H * SC * DPR); const g = c.getContext('2d'); g.scale(SC * DPR, SC * DPR);
  let seed = rd.length * 31 + 7; const r = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  g.save(); rr(g, 0, 0, W, H, 34); g.clip();
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#b4e07a'); gr.addColorStop(1, '#86c556'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,.05)'; for (let y = 0; y < H; y += 120) g.fillRect(0, y, W, 60);
  for (let i = 0; i < 26; i++) { const x = r() * W, y = r() * H, rad = 40 + r() * 70, gg = g.createRadialGradient(x, y, 0, x, y, rad); gg.addColorStop(0, i % 2 ? 'rgba(70,140,40,.16)' : 'rgba(255,255,200,.14)'); gg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gg; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); }
  const road = (draw, w) => { g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#c9a160'; g.lineWidth = w + 10; draw(); g.stroke(); g.strokeStyle = '#ead09a'; g.lineWidth = w; draw(); g.stroke(); g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = w * .35; draw(); g.stroke(); };
  if (rd === 'sleep') {
    road(() => { g.beginPath(); g.moveTo(W / 2, 250); g.lineTo(W / 2, H + 60); }, 300);
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(160,120,70,.35)'; g.beginPath(); g.ellipse(W / 2 - 140 + r() * 280, 300 + r() * 760, 3 + r() * 4, 2 + r() * 3, 0, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.9)'; for (let x = 20; x < W; x += 40) { rr(g, x, 984, 22, 10, 4); g.fill(); }
    g.font = '800 26px Tajawal'; g.textAlign = 'center'; g.fillStyle = 'rgba(90,58,28,.6)'; g.fillText('البداية', W / 2, 1045);
    g.fillStyle = 'rgba(0,0,0,.15)'; rr(g, 74, 306, W - 148, 26, 12); g.fill();
    g.fillStyle = '#c8312b'; rr(g, 70, 300, W - 140, 26, 12); g.fill(); g.fillStyle = '#e2b33c'; for (let x = 80; x < W - 80; x += 28) { g.beginPath(); g.moveTo(x, 313); g.lineTo(x + 9, 304); g.lineTo(x + 18, 313); g.lineTo(x + 9, 322); g.fill(); }
    g.strokeStyle = '#1c1c1c'; g.lineWidth = 2; rr(g, 70, 300, W - 140, 26, 12); g.stroke();
  } else { road(() => { g.beginPath(); g.moveTo(-30, H / 2); g.bezierCurveTo(W * .3, H / 2 - 40, W * .7, H / 2 + 40, W + 30, H / 2); }, 56); road(() => { g.beginPath(); g.moveTo(W / 2, -30); g.bezierCurveTo(W / 2 - 40, H * .3, W / 2 + 40, H * .7, W / 2, H + 30); }, 48); }
  // عشب وورود وحجارة
  for (let i = 0; i < 90; i++) { const x = r() * W, y = r() * H; g.fillStyle = r() < .5 ? 'rgba(60,130,40,.5)' : 'rgba(90,160,50,.55)'; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 2, y - 10, x + 5, y - 14); g.quadraticCurveTo(x + 5, y - 6, x + 9, y); g.fill(); }
  const flower = (x, y, c) => { g.fillStyle = c; for (let k = 0; k < 5; k++) { const a = k * 1.2566; g.beginPath(); g.arc(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 3.2, 0, 7); g.fill(); } g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(x, y, 2.5, 0, 7); g.fill(); };
  for (let i = 0; i < 14; i++) { const cx0 = r() * W, cy0 = r() * H, col = ['#fff', '#ffb3c7', '#fff4a8', '#c9b6ff'][i % 4]; for (let k = 0; k < 4; k++) flower(cx0 + (r() - .5) * 40, cy0 + (r() - .5) * 30, col); }
  for (let i = 0; i < 8; i++) { const x = r() * W, y = r() * H, s = 6 + r() * 8; g.fillStyle = 'rgba(0,0,0,.12)'; g.beginPath(); g.ellipse(x + 2, y + s * .6, s, s * .4, 0, 0, 7); g.fill(); g.fillStyle = '#b9b2a6'; g.beginPath(); g.ellipse(x, y, s, s * .7, 0, 0, 7); g.fill(); g.fillStyle = '#d6d0c5'; g.beginPath(); g.ellipse(x - s * .25, y - s * .25, s * .45, s * .3, 0, 0, 7); g.fill(); }
  const bush = (x, y, s) => { g.fillStyle = 'rgba(0,0,0,.15)'; g.beginPath(); g.ellipse(x, y + s * .7, s * 1.3, s * .4, 0, 0, 7); g.fill(); [[-.6, 0, .75], [.6, 0, .75], [0, -.35, .9]].forEach(([dx, dy, k]) => { g.fillStyle = '#4f9d2a'; g.beginPath(); g.arc(x + dx * s, y + dy * s, s * k, 0, 7); g.fill(); }); [[-.7, -.2, .35], [.3, -.6, .35]].forEach(([dx, dy, k]) => { g.fillStyle = '#7cc243'; g.beginPath(); g.arc(x + dx * s, y + dy * s, s * k, 0, 7); g.fill(); }); g.fillStyle = '#e4574b'; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x + (r() - .5) * s * 1.4, y - r() * s * .6, 2.5, 0, 7); g.fill(); } };
  // ظل خفيف على الأطراف
  const vg = g.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * .75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(40,60,10,.22)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
  g.restore();
  g.strokeStyle = 'rgba(59,42,26,.35)'; g.lineWidth = 4; rr(g, 2, 2, W - 4, H - 4, 32); g.stroke();
  if (rd === 'herd') for (let i = 0; i < n; i++) { const p = PENS[i]; g.save(); g.fillStyle = 'rgba(0,0,0,.12)'; rr(g, p.x + 4, p.y + 6, p.w, p.h, 16); g.fill(); g.fillStyle = g.createPattern(hayTile(), 'repeat'); rr(g, p.x, p.y, p.w, p.h, 16); g.fill(); fence(g, p, COL[i]); g.restore(); }
  if (rd === 'sleep') { spr(g, 'house', W / 2, 150, 1.25); [[90, 250], [W - 90, 250], [40, 600], [W - 40, 760]].forEach(([x, y]) => spr(g, 'palm', x, y, 1)); bush(110, 470, 22); bush(W - 100, 560, 20); bush(90, 880, 18); bush(W - 80, 950, 22); }
  else if (rd === 'hungry') { [[110, 330], [W - 110, 420], [W / 2 + 150, 760], [160, 980]].forEach(([x, y]) => spr(g, 'palm', x, y, .9)); bush(W - 90, 200, 22); bush(90, 700, 20); bush(W - 150, 990, 18); }
  else { [[300, 34], [425, H - 12], [30, H / 2 - 40], [W - 30, H / 2 - 130], [W / 2 + 130, 310], [220, H - 290]].forEach(([x, y]) => spr(g, 'palm', x, y, .9)); bush(W / 2 - 150, 360, 18); bush(W / 2 + 160, 730, 18); }
  return BG[key] = c;
}
const KIMG = { s: ['sheep', .82], c: ['camel', .72] };
let T0 = performance.now();
function render() {
  const g = cx, t = (performance.now() - T0) / 1000; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.drawImage(getBg(V.rd, V.players.length), OX, OY, W * SC, H * SC); g.translate(OX, OY); g.scale(SC, SC);
  const j = V.jay, list = [];
  if (V.rd === 'herd') V.players.forEach(p => { const P = PENS[p.slot], ty = p.slot < 2 ? P.y - 4 : P.y + P.h + 4; g.font = '800 22px Tajawal'; const nm = p.name + '  ' + p.sc, tw = g.measureText(nm).width + 30;
    g.fillStyle = COL[p.slot]; rr(g, P.x + P.w / 2 - tw / 2, ty - 20, tw, 40, 20); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(nm, P.x + P.w / 2, ty + 1);
    const n = Math.min(14, Math.round(p.sc * .8)); for (let k = 0; k < n; k++) { const h = Math.sin((k + 1) * 91.7 + p.slot * 13.3) * 43758.5, rx = h - Math.floor(h), h2 = Math.sin((k + 1) * 37.1 + p.slot * 7.9) * 12345.6, ry = h2 - Math.floor(h2); spr(g, 'sheep', P.x + 30 + rx * (P.w - 60), P.y + 34 + ry * (P.h - 60), .55, k % 2 ? 1 : -1); } });
  g.textBaseline = 'alphabetic';
  for (const a of V.animals.values()) list.push({ y: a.y, d: () => { if (a.own >= 0) { g.globalAlpha = .35; g.fillStyle = COL[a.own]; g.beginPath(); g.ellipse(a.x, a.y + 14, 20, 6, 0, 0, 7); g.fill(); g.globalAlpha = 1; } const K = KIMG[a.k]; spr(g, K[0], a.x, a.y + Math.sin(t * 6 + a.id) * 1.2, K[1], a.f || 1); } });
  for (const tu of V.tunas) list.push({ y: tu[2], d: () => { if (!tu[3]) { g.fillStyle = 'rgba(255,240,140,.5)'; g.beginPath(); g.arc(tu[1], tu[2], 30 + Math.sin(t * 6) * 4, 0, 7); g.fill(); } spr(g, 'tuna', tu[1], tu[2] + (tu[3] ? 0 : Math.sin(t * 4) * 3), 1.1); } });
  V.players.forEach(p => list.push({ y: p.y, d: () => drawPlayer(g, p, t) }));
  list.push({ y: j.y + 20, d: () => drawJay(g, j, t) });
  list.sort((a, b) => a.y - b.y).forEach(o => o.d());
  const dt = 1 / 60;
  V.players.forEach(p => { if (!p.out && (p.mv || 0) > .1 && Math.random() < (p.dashT > 0 ? .9 : .25)) PARTS.push({ x: p.x + (Math.random() - .5) * 16, y: p.y + 26, vx: -(p.f || 1) * 20, vy: -10, t: 0, life: .5, c: 'rgba(200,170,120,.55)', k: 'dust', s: 5 + Math.random() * 4 }); });
  for (let i = PARTS.length - 1; i >= 0; i--) { const o = PARTS[i]; o.t += dt; if (o.t > o.life) { PARTS.splice(i, 1); continue; } o.x += o.vx * dt; o.y += o.vy * dt; const f = 1 - o.t / o.life;
    if (o.k === 'dust') { o.vy *= .96; g.fillStyle = o.c; g.globalAlpha = f; g.beginPath(); g.arc(o.x, o.y, o.s * (1.6 - f * .6), 0, 7); g.fill(); }
    else { o.vy += 300 * dt; g.globalAlpha = f; g.fillStyle = o.c; star(g, o.x, o.y, o.s); } g.globalAlpha = 1; }
  if (PARTS.length > 300) PARTS.splice(0, PARTS.length - 300);
  for (let i = POPS.length - 1; i >= 0; i--) { const o = POPS[i]; o.t += 1 / 60; if (o.t > 1.6) { POPS.splice(i, 1); continue; }
    g.globalAlpha = Math.min(1, 2 - o.t * 1.25); g.font = (o.big ? '800 30px' : '800 22px') + ' Tajawal'; g.textAlign = 'center'; g.direction = /^[+\-]?\d/.test(o.txt) ? 'ltr' : 'rtl'; g.lineWidth = 6; g.strokeStyle = '#3b2a1a'; const y = o.y - 50 - o.t * 40; g.strokeText(o.txt, o.x, y); g.fillStyle = o.color; g.fillText(o.txt, o.x, y); g.globalAlpha = 1; g.direction = 'rtl'; }
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (IN.id !== null) { g.globalAlpha = .35; g.fillStyle = '#fff'; g.beginPath(); g.arc(IN.ox, IN.oy, 55, 0, 7); g.fill(); g.globalAlpha = .8; g.beginPath(); g.arc(IN.ox + IN.jx * 55, IN.oy + IN.jy * 55, 24, 0, 7); g.fill(); g.globalAlpha = 1; }
}
function drawPlayer(g, p, t) {
  const moving = (p.mv || 0) > .1, bob = moving ? Math.abs(Math.sin(t * 12)) * -4 : 0, img = (p.ch === 'h' ? 'herder' : 'farmer') + p.slot;
  if (p.out) { g.globalAlpha = .45; spr(g, img, p.x, p.y, .9, p.f); g.globalAlpha = 1; g.font = '28px sans-serif'; g.textAlign = 'center'; g.fillText('😵', p.x, p.y - 44); return; }
  if (p.slot === ME.slot) { g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 4; g.beginPath(); g.ellipse(p.x, p.y + 28, 28, 9, 0, 0, 7); g.stroke(); }
  if (p.dashT > 0) { g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 4; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(p.x - p.f * (30 + k * 8), p.y - 10 + k * 10); g.lineTo(p.x - p.f * (55 + k * 8), p.y - 10 + k * 10); g.stroke(); } }
  spr(g, img, p.x, p.y + bob, 1, p.f, moving ? 1 + Math.sin(t * 24) * .02 : 1);
  if (p.hold) spr(g, 'tuna', p.x + p.f * 22, p.y - 2, .8);
  g.font = '800 17px Tajawal'; g.textAlign = 'center'; g.lineWidth = 5; g.strokeStyle = '#fff'; g.strokeText(p.name, p.x, p.y + 52); g.fillStyle = COL[p.slot]; g.fillText(p.name, p.x, p.y + 52);
  if (p.stun > 0) { g.font = '22px sans-serif'; for (let k = 0; k < 3; k++) { const an = t * 5 + k * 2.1; g.fillText('⭐', p.x + Math.cos(an) * 22, p.y - 48 + Math.sin(an) * 6); } }
  if (V.jay.tgt === p.slot && V.jay.st === 'chase' && V.ph === 'play') { const y = p.y - 60 + Math.sin(t * 10) * 4; g.fillStyle = '#d93a2f'; g.beginPath(); g.moveTo(p.x - 13, y - 16); g.lineTo(p.x + 13, y - 16); g.lineTo(p.x, y); g.fill(); }
}
function star(g, x, y, r) { g.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, q = k % 2 ? r * .45 : r; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } g.closePath(); g.fill(); }
function drawJay(g, j, t) {
  const st = j.st;
  if (st === 'sleep' || st === 'stir' || st === 'fake') {
    const wob = st === 'stir' || st === 'fake' ? Math.sin(t * 40) * 3 : 0; spr(g, 'jayFlop', j.x + wob, j.y, .62);
    g.textAlign = 'center';
    if (st === 'sleep') { g.font = '800 30px Lalezar'; g.fillStyle = 'rgba(59,42,26,.7)'; g.fillText('z', j.x + 70, j.y - 40 - (t * 12 % 16)); g.fillText('Z', j.x + 90, j.y - 70 - (t * 12 % 16)); }
    else { g.fillStyle = '#d93a2f'; g.font = '800 46px Lalezar'; g.fillText('؟!', j.x + 80, j.y - 50); }
  } else if (st === 'awake') {
    const r = 120 + Math.sin(t * 8) * 8, gr = g.createRadialGradient(j.x, j.y, 10, j.x, j.y, r); gr.addColorStop(0, 'rgba(217,58,47,.4)'); gr.addColorStop(1, 'rgba(217,58,47,0)'); g.fillStyle = gr; g.beginPath(); g.arc(j.x, j.y, r, 0, 7); g.fill();
    spr(g, 'jayAwake', j.x, j.y, .62);
  } else if (st === 'flop' || st === 'rest') spr(g, 'jayFlop', j.x, j.y, .5);
  else if (st === 'eat') { spr(g, 'jayWalk', j.x, j.y, .85, j.f || 1); g.font = '26px sans-serif'; g.textAlign = 'center'; g.fillText('😋', j.x, j.y - 60); }
  else { const big = V.rd === 'hungry' ? .95 : .78; if (j.angry) { g.fillStyle = 'rgba(217,58,47,.3)'; g.beginPath(); g.arc(j.x, j.y, 60, 0, 7); g.fill(); }
    spr(g, 'jayWalk', j.x, j.y + Math.abs(Math.sin(t * 12)) * -3, big, j.f || 1);
    if (st === 'chase') { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 4; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(j.x - (j.f || 1) * (50 + k * 6), j.y - 14 + k * 12); g.lineTo(j.x - (j.f || 1) * (80 + k * 6), j.y - 14 + k * 12); g.stroke(); } } }
}

// ───────────── الواجهة أثناء المباراة ─────────────
let hudKey = '', uiKey = '';
function hud() {
  const key = V.players.map(p => p.name + (NET.list[p.slot] ? vBadge(NET.list[p.slot].u) : '') + V.sp[p.slot] + (p.out ? 'x' : '') + (V.rd === 'herd' ? p.sc : '')).join(',') + V.rd;
  if (key !== hudKey) { hudKey = key; $('#chips').innerHTML = V.players.map(p => `<div class="chip${p.slot === ME.slot ? ' me' : ''}${p.out ? ' out' : ''}" style="--c:${COL[p.slot]}"><b>${'🏅'.repeat(Math.min(NEED, V.sp[p.slot])) + '<u>○</u>'.repeat(Math.max(0, NEED - V.sp[p.slot]))}</b><span>${esc(p.name)}${V.rd === 'herd' ? ' ' + p.sc : ''}${NET.list[p.slot] ? vBadge(NET.list[p.slot].u) : ''}</span></div>`).join(''); }
  const sec = Math.max(0, Math.ceil(V.tm)), txt = V.ph === 'play' ? Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0') : '—'; const el = $('#timer'); if (el.textContent !== txt) { el.textContent = txt; el.classList.toggle('hot', V.ph === 'play' && sec <= 10); } if (V.ph === 'play' && sec === 10 && V.l10 !== V.rd + V.sp.join()) { V.l10 = V.rd + V.sp.join(); VO('last10'); }
  const rule = V.ph === 'play' || V.ph === 'intro' ? ROUNDS[V.rd].ic + ' ' + ROUNDS[V.rd].n : ''; if ($('#rule').textContent !== rule) $('#rule').textContent = rule;
  if (IN.id !== null && !IN.hid) { IN.hid = 1; $('#hint').style.display = 'none'; }
  const me = V.players[ME.slot], b = $('#act');
  const lbl = V.rd === 'sleep' ? 'بشويش' : V.rd === 'hungry' && me && me.hold ? 'ارمها<br>🐟' : 'اركض<br>💨'; if (b.dataset.l !== lbl) { b.dataset.l = lbl; b.innerHTML = lbl; }
  b.style.display = V.rd === 'sleep' ? 'none' : ''; b.classList.toggle('cd', (!(me && me.hold && V.rd === 'hungry') && !!me && me.dashCd > 0)); b.classList.toggle('tuna', !!(me && me.hold && V.rd === 'hungry'));
  const k = V.ph + '|' + V.rd + '|' + V.wn + '|' + V.pk + '|' + V.op.join() + '|' + V.ch; if (k === uiKey) return; uiKey = k;
  document.querySelectorAll('.ov').forEach(o => o.classList.remove('show', 'fade'));
  if (V.ph === 'intro') { const R = ROUNDS[V.rd], c = $('#intro'); c.querySelector('.ic').textContent = R.ic; c.querySelector('.mt').textContent = R.n; c.querySelector('.md').textContent = R.d;
    c.querySelector('.rn').textContent = 'الجولة ' + (V.sp.reduce((a, b) => a + b, 0) + 1); c.classList.add('show'); setTimeout(() => { if (V && V.ph === 'intro') c.classList.add('fade'); }, 3400); }
  if (V.ph === 'result') { const w = V.players[V.wn], c = $('#result'); c.querySelector('.mt').textContent = w.slot === ME.slot ? 'خذيت الختم! 🏅' : w.name + ' خذ الختم 🏅';
    c.querySelector('.rows').innerHTML = V.rk.map((s, i) => { const p = V.players[s]; return `<div class="rk" style="--c:${COL[s]}"><i>${i + 1}</i><span>${esc(p.name)}</span><b>${'🏅'.repeat(V.sp[s]) || '—'}</b></div>`; }).join('');
    c.classList.add('show'); }
  if (V.ph === 'pick') { const c = $('#pick'), p = V.players[V.pk], mine = V.pk === ME.slot;
    if (mine) setTimeout(() => VO('pick'), 300);
    c.querySelector('.mt').textContent = mine ? 'جيت الأخير… اختار الجولة الجاية!' : p.name + ' جا الأخير… وهو اللي بيختار الجولة الجاية';
    c.querySelector('.opts').innerHTML = V.op.map(o => `<button class="opt" data-o="${o}" ${mine ? '' : 'disabled'}><i>${ROUNDS[o].ic}</i>${ROUNDS[o].n}</button>`).join('');
    c.querySelectorAll('.opt').forEach(b => b.onclick = () => { if (S) choose(b.dataset.o); else NET.emit('pick', { s: ME.slot, c: b.dataset.o }); c.querySelectorAll('.opt').forEach(x => x.disabled = true); b.classList.add('sel'); });
    c.classList.add('show'); }
  if (V.ph === 'crown') showCrown();
}
function showCrown() {
  const w = V.players[V.ch], c = $('#crown');
  c.querySelector('.mt').textContent = w.slot === ME.slot ? 'كفو! أنت شيخ المزرعة 👑' : w.name + ' صار شيخ المزرعة 👑';
  c.querySelector('.who').innerHTML = `<img src="${SPR.IMG[(w.ch === 'h' ? 'herder' : 'farmer') + w.slot].src}"><img class="jj" src="${SPR.IMG.jayFlop.src}">`;
  c.querySelector('.rows').innerHTML = V.players.slice().sort((a, b) => V.sp[b.slot] - V.sp[a.slot]).map(p => `<div class="rk" style="--c:${COL[p.slot]}"><span>${esc(p.name)}</span><b>${'🏅'.repeat(V.sp[p.slot]) || '—'}</b></div>`).join('');
  $('#again').style.display = S ? '' : 'none'; $('#waitHost').style.display = S ? 'none' : ''; c.classList.add('show'); confetti();
}
function confetti() { const box = $('#confetti'); box.innerHTML = ''; for (let i = 0; i < 60; i++) { const d = document.createElement('i'); d.style.left = Math.random() * 100 + '%'; d.style.background = COL[i % 4]; d.style.animationDelay = Math.random() * 1.5 + 's'; d.style.animationDuration = 2 + Math.random() * 2 + 's'; box.appendChild(d); } }

// ───────────── الحلقة ─────────────
let MODE = 'menu', lastT = 0, sendT = 0;
function loop(now) {
  requestAnimationFrame(loop); const dt = Math.min(.05, (now - lastT) / 1000 || 0); lastT = now;
  if (MODE !== 'play') return;
  if (S) { stepSim(dt); const d = snap(); applySnap(d, true); sendT -= dt; if (NET.r && sendT <= 0) { sendT = .12; NET.emit('st', d); } }
  else if (V) { stepClient(dt); sendT -= dt; const me = V.players[ME.slot];
    if (me && sendT <= 0) { sendT = .1; NET.emit('in', { s: ME.slot, x: me.x | 0, y: me.y | 0, f: me.f, mv: me.mv > .1 ? 1 : 0, d: me.dashT > 0 ? 1 : 0, a: actCount, tp: me.tp }); }
    if (performance.now() - V.lastSnap > 7000 && !V.lost) { V.lost = true; toast('النت فصل عن صاحب الغرفة…', 'bad'); setTimeout(() => { if (V && V.lost) { MODE = 'menu'; netClose(); showScreen('menu'); } }, 4000); } }
  render(); hud();
}

// لو صفحة المضيف صارت بالخلفية (المتصفح يوقف الرسم)، نكمّل المحاكاة ونرسل للاعبين عشان اللعب ما يتجمد عندهم
setInterval(() => {
  const now = performance.now(); if (MODE !== 'play' || !S || now - lastT < 250) return; // الرسم واقف (الصفحة مخفية أو مغطاة)
  let dt = Math.min(2, (now - lastT) / 1000); lastT = now;
  while (dt > 0) { const d = Math.min(.05, dt); stepSim(d); dt -= d; }
  if (NET.r) NET.emit('st', snap());
}, 120);
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
    return { emit(t, d) { ref.push({ t, d: JSON.stringify(d) }).catch(e => { if (!NET.errShown) { NET.errShown = 1; toast('السيرفر رفض الاتصال: ' + (e.code || e), 'bad'); } }); }, on(t, fn) { fns[t] = fn; }, leave() { q.off(); }, clear() { return ref.remove(); } }; } };
}
function localRoom() { return { join(name) { const bc = new BroadcastChannel(name), fns = {}; bc.onmessage = e => { const f = fns[e.data.t]; if (f) f(e.data.d); };
  return { emit(t, d) { bc.postMessage({ t, d }); }, on(t, fn) { fns[t] = fn; }, leave() { bc.close(); }, clear() { return Promise.resolve(); } }; } }; }
const LOCAL = /[?&]local=1/.test(location.search);
function myProfile() { return { u: NET.uid, nm: (($('#name').value || '').trim() || 'لاعب').slice(0, 12), ch: PROF.ch }; }
function openRoom(host, code) {
  const api = LOCAL ? localRoom() : fbRoom(); if (!api) { toast('ما قدرت أتصل بالسيرفر، شيّك على النت.', 'bad'); return; }
  netClose(); NET.host = host; NET.code = code; NET.r = api.join('saqr-pvp-farm' + code, host); NET.list = host ? [myProfile()] : []; NET.seen = {}; // قواعد Firebase تسمح بس بالغرف اللي تبدأ بـ saqr-pvp-
  NET.r.on('hi', d => { if (!NET.host || d.u === NET.uid) return; NET.seen[d.u] = performance.now();
    let e = NET.list.find(x => x.u === d.u); if (!e) { if (NET.list.length >= 4 || MODE === 'play') { NET.emit('full', { to: d.u }); return; } NET.list.push(e = { u: d.u }); } e.nm = String(d.nm || '').slice(0, 12); e.ch = d.ch; drawLobby(); });
  NET.r.on('lobby', d => { if (NET.host || d.u === NET.uid) return; NET.list = d.list; drawLobby(); });
  NET.r.on('full', d => { if (d.to === NET.uid && !NET.list.some(x => x.u === NET.uid)) lobbyMsg('الغرفة فل أو اللعب بدا', 'bad'); });
  NET.r.on('start', d => { if (NET.host || d.u === NET.uid) return; const me = d.list.findIndex(x => x.u === NET.uid); if (me < 0) return; startClient(d.list, me); });
  NET.r.on('st', d => { if (NET.host || d.u === NET.uid || MODE !== 'play' || !V) return; applySnap(d, false); });
  NET.r.on('in', d => { if (!NET.host || !S) return; const p = S.players[d.s]; if (!p || p.u !== d.u) return;
    if (d.tp === p.tp) { p.rx = d.x; p.ry = d.y; } p.f = d.f; p.mv = d.mv; p.seen = performance.now(); if (p.bot && p.wasHuman) p.bot = false;
    if (d.d && p.dashT <= 0) p.dashT = .2; if (d.a > p.act) { p.act = d.a; if (S.rd === 'hungry' && p.hold && S.ph === 'play') throwTuna(p); } });
  NET.r.on('rtc', d => vSignal(d));
  NET.r.on('vjoin', d => { if (d.to && d.to !== NET.uid) return; vJoin(d); });
  NET.r.on('vstate', d => { if (d.u === NET.uid) return; VOICE.users[d.u] = { on: d.on, m: d.m }; if (!d.on) vClose(d.u); voiceUI(); });
  NET.r.on('pick', d => { if (NET.host && S && S.pick === d.s && S.players[d.s].u === d.u) choose(d.c); });
  NET.r.on('bye', d => { if (d.u === NET.uid) return; if (NET.host) { const i = NET.list.findIndex(x => x.u === d.u); if (i >= 0 && MODE !== 'play') { NET.list.splice(i, 1); drawLobby(); } }
    else if (NET.list[0] && NET.list[0].u === d.u) { toast('صاحب الغرفة طلع منها', 'bad'); if (MODE !== 'play') { netClose(); showScreen('menu'); } } });
  clearInterval(NET.iv); NET.iv = setInterval(() => { if (MODE === 'play') return;
    if (NET.host) { const now = performance.now(); NET.list = NET.list.filter(x => x.u === NET.uid || x.bot || now - (NET.seen[x.u] || now) < 6000); NET.emit('lobby', { list: NET.list }); drawLobby(); }
    else NET.emit('hi', myProfile()); if (VOICE.on && Math.random() < .25) NET.emit('vjoin', {}); }, 1000);
  if (!host) NET.emit('hi', myProfile());
  $('#code').textContent = code; showScreen('lobby'); drawLobby();
}
function netClose() { if (VOICE.on) { NET.emit('vstate', { on: false }); voiceOff(); } if (NET.r) { NET.emit('bye', {}); try { NET.r.leave(); } catch (e) {} } clearInterval(NET.iv); NET.r = null; }
function lobbyMsg(t, c) { const el = $('#lobbyMsg'); el.textContent = t; el.className = 'msg ' + (c || ''); }
function drawLobby() {
  const L = NET.list; let h = '';
  for (let i = 0; i < 4; i++) { const p = L[i]; h += p ? `<div class="pl" style="--c:${COL[i]}"><img src="${SPR.IMG[(p.ch === 'h' ? 'herder' : 'farmer') + i].src}"><span>${esc(p.nm)}${p.u === NET.uid ? ' (أنت)' : ''}${i === 0 ? ' 👑' : ''}${vBadge(p.u)}</span>${p.bot ? '<em>كمبيوتر</em>' : ''}${NET.host && p.bot ? `<button class="x" data-i="${i}">✕</button>` : ''}</div>` : `<div class="pl empty"><span>ننتظر لاعب…</span></div>`; }
  $('#plist').innerHTML = h; document.querySelectorAll('#plist .x').forEach(b => b.onclick = () => { NET.list.splice(+b.dataset.i, 1); drawLobby(); });
  $('#hostCtl').style.display = NET.host ? '' : 'none'; $('#guestWait').style.display = NET.host ? 'none' : '';
  $('#startBtn').disabled = L.length < 2; $('#addBot').disabled = L.length >= 4; lobbyMsg(NET.host ? (L.length < 2 ? 'خلّك في اللعبة لين يدخلون — لو طلعت منها الغرفة توقف' : '') : (L.length ? '' : 'لحظة، قاعد أدخّلك الغرفة…'));
}
let botN = 0; const BOTNAMES = ['أبو بعير', 'راعي الغنم', 'أم سعيد', 'أبو فهد', 'شيخ الحلال', 'أبو تونة'];
function botEntry(i) { botN++; return { u: 'bot' + botN, nm: BOTNAMES[botN % BOTNAMES.length], ch: (botN + i) % 2 ? 'f' : 'h', bot: 1 }; }


// ───────────── المحادثة الصوتية (WebRTC بين الجوالات مباشرة، و Firebase بس للتعارف) ─────────────
const VOICE = { on: false, muted: false, stream: null, pcs: {}, els: {}, users: {}, speak: {} };
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }];
function vName(u) { const p = (NET.list || []).find(x => x.u === u); return p ? p.nm : 'لاعب'; }
async function voiceOn() {
  if (VOICE.on) { voiceMute(!VOICE.muted); return; }
  if (!NET.r) { toast('الصوت يشتغل داخل غرفة أونلاين بس', 'info'); return; }
  try {
    try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch (e) {}
    VOICE.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (e) { try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e2) {} toast('ما سمحت للمايك… افتح الإعدادات واسمح لـSafari بالمايك', 'bad'); return; }
  VOICE.on = true; VOICE.muted = false; au(); unlockAudio(); watchLevel(NET.uid, VOICE.stream);
  NET.emit('vjoin', {}); vState(); voiceUI(); toast('🎙️ الصوت شغّال — تكلم وربعك يسمعونك', 'good');
}
function voiceMute(m) { VOICE.muted = m; if (VOICE.stream) VOICE.stream.getAudioTracks().forEach(t => t.enabled = !m); vState(); voiceUI(); }
function vState() { NET.emit('vstate', { on: VOICE.on, m: VOICE.muted }); VOICE.users[NET.uid] = { on: VOICE.on, m: VOICE.muted }; }
function voiceOff() {
  for (const u in VOICE.pcs) vClose(u); if (VOICE.stream) VOICE.stream.getTracks().forEach(t => t.stop());
  VOICE.stream = null; VOICE.on = false; VOICE.users = {}; try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {} voiceUI();
}
function vClose(u) { try { VOICE.pcs[u].close(); } catch (e) {} delete VOICE.pcs[u]; const el = VOICE.els[u]; if (el) { el.srcObject = null; el.remove(); } delete VOICE.els[u]; }
function vPeer(u) {
  if (VOICE.pcs[u]) return VOICE.pcs[u];
  const pc = new RTCPeerConnection({ iceServers: ICE }); VOICE.pcs[u] = pc;
  VOICE.stream.getTracks().forEach(t => pc.addTrack(t, VOICE.stream));
  pc.onicecandidate = e => { if (e.candidate) NET.emit('rtc', { to: u, c: e.candidate.toJSON() }); };
  pc.ontrack = e => { let el = VOICE.els[u]; if (!el) { el = document.createElement('audio'); el.autoplay = true; el.setAttribute('playsinline', ''); document.body.appendChild(el); VOICE.els[u] = el; }
    el.srcObject = e.streams[0]; el.play().catch(() => {}); watchLevel(u, e.streams[0]); };
  pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') { vClose(u); if (NET.uid < u) setTimeout(() => vCall(u), 1500); } voiceUI(); };
  return pc;
}
async function vCall(u) { if (!VOICE.on) return; const pc = vPeer(u); const o = await pc.createOffer(); await pc.setLocalDescription(o); NET.emit('rtc', { to: u, sdp: pc.localDescription.toJSON() }); }
async function vSignal(d) {
  if (!VOICE.on || d.to !== NET.uid) return; const u = d.u;
  try {
    if (d.sdp) { if (d.sdp.type === 'offer' && VOICE.pcs[u] && VOICE.pcs[u].signalingState !== 'stable') vClose(u);
      const pc = vPeer(u); await pc.setRemoteDescription(d.sdp); (pc._q || []).forEach(c => pc.addIceCandidate(c).catch(() => {})); pc._q = [];
      if (d.sdp.type === 'offer') { const a = await pc.createAnswer(); await pc.setLocalDescription(a); NET.emit('rtc', { to: u, sdp: pc.localDescription.toJSON() }); } }
    else if (d.c) { const pc = VOICE.pcs[u]; if (pc && pc.remoteDescription) pc.addIceCandidate(d.c).catch(() => {}); else if (pc) (pc._q = pc._q || []).push(d.c); else { vPeer(u)._q = [d.c]; } }
  } catch (e) {}
}
function vJoin(d) { if (d.u === NET.uid) return; VOICE.users[d.u] = { on: true, m: false }; voiceUI();
  if (!VOICE.on || (VOICE.pcs[d.u] && VOICE.pcs[d.u].connectionState === 'connected')) return;
  if (NET.uid < d.u) vCall(d.u); else NET.emit('vjoin', { to: d.u }); }
function watchLevel(u, stream) { try { const c = AU.ctx; if (!c) return; const src = c.createMediaStreamSource(stream), an = c.createAnalyser(); an.fftSize = 256; src.connect(an); const buf = new Uint8Array(an.fftSize);
  const tick = () => { if (!VOICE.on) return; an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); const was = VOICE.speak[u]; VOICE.speak[u] = m > 10; if (was !== VOICE.speak[u]) voiceUI(); setTimeout(tick, 120); }; tick(); } catch (e) {} }
function voiceUI() {
  const lab = '🎙️'; document.querySelectorAll('.micb').forEach(b => { b.classList.toggle('on', VOICE.on && !VOICE.muted); b.classList.toggle('mut', VOICE.on && VOICE.muted); b.querySelector('i') ? b.querySelector('i').textContent = lab : b.textContent = lab; });
  const vb = $('#voiceBtn'); if (vb) vb.innerHTML = !VOICE.on ? '🎙️ شغّل الصوت وكلّم ربعك' : VOICE.muted ? '🔇 المايك مكتوم — اضغط عشان تتكلم' : '🎙️ الصوت شغّال — اضغط للكتم';
  if (vb) vb.className = 'btn ' + (VOICE.on && !VOICE.muted ? 'g' : 'k');
  hudKey = ''; if (MODE !== 'play' && $('#plist')) drawLobby();
}
function vBadge(u) { const s = VOICE.users[u]; if (!s || !s.on) return ''; return s.m ? ' 🔇' : VOICE.speak[u] ? ' 🗣️' : ' 🎙️'; }
// ───────────── البدء ─────────────
function resetPlay() { POPS.length = 0; PARTS.length = 0; hudKey = uiKey = ''; seenEv.clear(); IN.act = false; actCount = 0; document.querySelectorAll('.ov').forEach(o => o.classList.remove('show', 'fade')); }
function startHost(list) { resetPlay(); ME.slot = Math.max(0, list.findIndex(x => x.u === NET.uid)); newView(list); newMatch(list); MODE = 'play'; showScreen('game'); if (NET.r) NET.emit('start', { list }); }
function startClient(list, me) { resetPlay(); S = null; ME.slot = me; NET.list = list; newView(list); MODE = 'play'; showScreen('game'); }
function showScreen(id) { const m = $('#mic'); if (m) m.style.display = NET.r ? '' : 'none'; document.querySelectorAll('.scr').forEach(s => s.classList.toggle('on', s.id === id)); document.body.classList.toggle('playing', id === 'game'); }

const PROF = { ch: localStorage.getItem('farm-ch') || 'f' };
function initUI() {
  $('#name').value = localStorage.getItem('farm-name') || ''; $('#name').oninput = () => localStorage.setItem('farm-name', $('#name').value);
  const setCh = c => { PROF.ch = c; localStorage.setItem('farm-ch', c); document.querySelectorAll('.chp').forEach(b => b.classList.toggle('on', b.dataset.c === c)); };
  document.querySelectorAll('.chp').forEach(b => b.onclick = () => setCh(b.dataset.c)); setCh(PROF.ch);
  $('#chF').src = SPR.IMG.farmer0.src; $('#chH').src = SPR.IMG.herder0.src; $('#heroJay').src = SPR.IMG.jayFlop.src;
  document.querySelectorAll('[data-img]').forEach(im => im.src = SPR.IMG[im.dataset.img].src);
  let bots = 3; const setB = n => { bots = n; document.querySelectorAll('.bn').forEach(b => b.classList.toggle('on', +b.dataset.n === n)); }; document.querySelectorAll('.bn').forEach(b => b.onclick = () => setB(+b.dataset.n)); setB(3);
  $('#solo').onclick = () => { au(); netClose(); NET.host = true; const list = [myProfile()]; for (let i = 0; i < bots; i++) list.push(botEntry(i)); NET.list = list; startHost(list); };
  $('#create').onclick = () => { au(); openRoom(true, String(1000 + Math.random() * 9000 | 0)); };
  $('#join').onclick = () => { au(); const c = ($('#joinCode').value || '').replace(/\D/g, ''); if (c.length !== 4) { $('#joinCode').classList.add('err'); return; } openRoom(false, c); };
  $('#addBot').onclick = () => { if (NET.list.length < 4) { NET.list.push(botEntry(NET.list.length)); drawLobby(); } };
  $('#startBtn').onclick = () => { au(); if (NET.list.length < 2) return; const go = () => startHost(NET.list.slice()); NET.r ? NET.r.clear().then(go, go) : go(); };
  $('#leave').onclick = () => { netClose(); showScreen('menu'); };
  $('#share').onclick = () => { const url = location.origin + location.pathname + '?r=' + NET.code + (LOCAL ? '&local=1' : ''), txt = 'تعال العب معنا «مزرعة الشيوخ» 🐑😼 خلنا نشوف مين بيصير شيخ المزرعة! رمز الغرفة: ' + NET.code;
    if (navigator.share) navigator.share({ title: 'مزرعة الشيوخ', text: txt, url }).catch(() => {}); else { navigator.clipboard && navigator.clipboard.writeText(txt + '\n' + url); lobbyMsg('نسخت الدعوة، أرسلها لربعك', 'good'); } };
  $('#again').onclick = () => { if (!S) return; const list = NET.list.filter(x => x.bot || x.u === NET.uid || S.players.some(p => p.u === x.u && !p.bot)); if (list.length < 2) { MODE = 'menu'; showScreen(NET.r ? 'lobby' : 'menu'); return; } const go = () => startHost(list); NET.r ? NET.r.clear().then(go, go) : go(); };
  $('#toMenu').onclick = () => { MODE = 'menu'; S = null; V = null; document.querySelectorAll('.ov').forEach(o => o.classList.remove('show')); if (NET.r && NET.host) { showScreen('lobby'); drawLobby(); } else { netClose(); showScreen('menu'); } };
  $('#voiceBtn').onclick = () => { au(); voiceOn(); }; $('#mic').onclick = e => { e.stopPropagation(); au(); voiceOn(); };
  $('#snd').onclick = () => { AU.on = !AU.on; localStorage.setItem('farm-snd', AU.on ? '1' : '0'); $('#snd').textContent = AU.on ? '🔊' : '🔇'; }; $('#snd').textContent = AU.on ? '🔊' : '🔇';
  let arm = 0; $('#quit').onclick = () => { if (Date.now() - arm > 2500) { arm = Date.now(); toast('اضغط مرة ثانية عشان تطلع', 'info'); return; } MODE = 'menu'; S = null; V = null; document.querySelectorAll('.ov').forEach(o => o.classList.remove('show')); netClose(); showScreen('menu'); };
  const m = location.search.match(/[?&]r=(\d{4})/); if (m) $('#joinCode').value = m[1];
}
addEventListener('beforeunload', () => netClose());
SPR.ready.then(() => {
  cv = $('#cv'); cx = cv.getContext('2d'); setupInput(cv); addEventListener('resize', resize); resize(); initUI();
  document.fonts && document.fonts.ready.then(() => { for (const k in BG) delete BG[k]; });
  requestAnimationFrame(loop);
  if (/[?&]auto=solo/.test(location.search)) $('#solo').click();
});
