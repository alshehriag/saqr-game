// صقر الصحراء — قيادة دفاع جوي: رادار حي، IFF، اشتباك متعدد بتوجيه تلقائي، ضرر موضعي
import * as THREE from 'three';
import { buildTextures } from './tex.js?v=7';
import { buildWorld, heightAt, HOME, ENEMY } from './world.js?v=7';
import { buildFX } from './fx.js?v=7';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const M = THREE.MathUtils, V3 = THREE.Vector3, $ = (id) => document.getElementById(id);
const UP = new V3(0, 1, 0), tA = new V3(), tB = new V3(), tC = new V3();
const store = { get(k, d) { try { return localStorage.getItem('sd3_' + k) ?? d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('sd3_' + k, v); } catch (e) { } } };

// ---------- الجودة
const TIERS = {
  low: { prMax: 1, shadows: false, bloom: false, blur: false, heat: false, flare: false, rate: 0.4 },
  med: { prMax: 1.25, shadows: true, bloom: true, blur: false, heat: false, flare: true, rate: 0.65 },
  high: { prMax: 2, shadows: true, bloom: true, blur: true, heat: true, flare: true, rate: 1 },
};
const Q = { post: true, shadowMap: 1024, terrainSeg: 200, rocks: 220, palms: 18, msaa: 0, auto: true, tier: 'med', pr: 1 };
let qPref = store.get('q', 'auto');

const canvas = $('c'), view = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 1.6, 0.5, 80000); scene.add(camera);
const T = buildTextures(1), W = buildWorld(scene, renderer, T, Q), F = buildFX(scene, renderer, camera, T, W, Q);
W.enemy.group.visible = false; scene.remove(W.tel);
Object.values(W.home.sys).forEach(o => o.visible = false);   // نعيد توزيع المنظومات كبطاريات
{ const sc = W.sun.shadow.camera; sc.left = sc.bottom = -270; sc.right = sc.top = 270; sc.updateProjectionMatrix(); }
W.sun.shadow.autoUpdate = false;
const shC = new V3(30, 0, -10);
const shadowOnce = () => { W.updateSun(tA.copy(shC)); W.sun.shadow.needsUpdate = true; };

// ---------- دمج المجسمات الثابتة: يقلّل عمليات الرسم في كل إطار بشكل كبير
const _inv = new THREE.Matrix4(), _mm = new THREE.Matrix4();
const skipMerge = (o) => !o.isMesh || o.isInstancedMesh || o.material.isMeshBasicMaterial || o.material.isShaderMaterial || o.material.isSpriteMaterial || Array.isArray(o.material);
function normGeo(g) { g = g.index ? g.toNonIndexed() : g.clone(); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.normal) g.computeVertexNormals(); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); g.morphAttributes = {}; return g; }
function mergeInto(root, meshes) { // يدمج الشبكات في فضاء root المحلي، شبكة واحدة لكل مادة
  if (!meshes.length) return; root.updateMatrixWorld(true); _inv.copy(root.matrixWorld).invert(); const B = new Map();
  for (const o of meshes) { const key = o.material.uuid + (o.castShadow ? 'c' : '') + (o.receiveShadow ? 'r' : ''); let b = B.get(key); if (!b) B.set(key, b = { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, g: [] }); _mm.multiplyMatrices(_inv, o.matrixWorld); const g = normGeo(o.geometry); g.applyMatrix4(_mm); b.g.push(g); }
  for (const o of meshes) o.parent && o.parent.remove(o);
  for (const b of B.values()) { const g = b.g.length === 1 ? b.g[0] : mergeGeometries(b.g, false); if (!g) continue; const mm = new THREE.Mesh(g, b.mat); mm.castShadow = b.cast; mm.receiveShadow = b.recv; root.add(mm); }
}
function compactGroup(root) { const ms = []; root.updateMatrixWorld(true); root.traverse(o => { if (o !== root && o.visible && !skipMerge(o)) ms.push(o); }); mergeInto(root, ms); return root; }
function compactBase(group, keep) { // الأصول تُضغط كل واحد على حدة، والباقي يُدمج كله
  group.updateMatrixWorld(true); const loose = [];
  for (const c of [...group.children]) {
    if (!c.visible) continue;
    if (keep.has(c)) { if (!c.isMesh) compactGroup(c); continue; }
    if (c.isMesh) { if (!skipMerge(c)) loose.push(c); continue; }
    if (c.isInstancedMesh) continue;
    const ex = []; c.traverse(o => { if (o !== c && o.isMesh && !o.isInstancedMesh) (skipMerge(o) ? ex : loose).push(o); else if (o.isSprite || o.isPoints || o.isLight) ex.push(o); });
    ex.forEach(o => group.attach(o));
  }
  mergeInto(group, loose);
  for (const c of [...group.children]) if (!c.isMesh && !c.isLight && !keep.has(c) && c.visible) { let has = false; c.traverse(o => { if (o !== c && (o.isMesh || o.isSprite || o.isLight)) has = true; }); if (!has) group.remove(c); }
}
let VW = 1, VH = 1;
function resize() { VW = view.clientWidth; VH = view.clientHeight; renderer.setPixelRatio(Q.pr); renderer.setSize(VW, VH, false); camera.aspect = VW / VH; camera.updateProjectionMatrix(); F.resize(VW, VH, Q.pr); radarResize(); }
function applyTier(name) {
  Q.tier = name; Object.assign(Q, TIERS[name]); F.rate = Q.rate; Q.pr = Math.min(devicePixelRatio || 1, Q.prMax);
  renderer.shadowMap.enabled = Q.shadows; W.sun.castShadow = Q.shadows; scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); });
  resize(); shadowOnce(); $('qv').textContent = (Q.auto ? 'تلقائي: ' : '') + { low: 'منخفضة', med: 'متوسطة', high: 'عالية' }[name];
}
function setQuality(pref) { qPref = pref; store.set('q', pref); Q.auto = pref === 'auto'; applyTier(Q.auto ? 'med' : pref); }
addEventListener('resize', resize); try { let rzT = 0; new ResizeObserver(() => { clearTimeout(rzT); rzT = setTimeout(() => { if (view.clientWidth !== VW || view.clientHeight !== VH) resize(); }, 60); }).observe(view); } catch (e) { }

// ---------- الصوت
const A = { ctx: null, on: store.get('snd', '1') === '1' };
function audioInit() {
  if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
  try {
    const C = window.AudioContext || window.webkitAudioContext, ctx = A.ctx = new C();
    A.master = ctx.createGain(); A.master.gain.value = A.on ? 0.5 : 0; A.master.connect(ctx.destination);
    const len = ctx.sampleRate * 2, mk = (brown) => { const b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0); let l = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; if (brown) { l = (l + 0.02 * w) / 1.02; d[i] = l * 3.5; } else d[i] = w; } return b; };
    A.white = mk(false); A.brown = mk(true);
  } catch (e) { A.ctx = null; }
}
function boom(k = 1, delay = 0) {
  if (!A.ctx) return; const c = A.ctx, t = c.currentTime + delay, s = c.createBufferSource(); s.buffer = A.brown;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1200, t); f.frequency.exponentialRampToValueAtTime(70, t + 1.5);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.1 * k, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 1.9); s.connect(f); f.connect(g); g.connect(A.master); s.start(t); s.stop(t + 2);
}
function jetSnd(k = 1) { if (!A.ctx) return; const c = A.ctx, t = c.currentTime, s = c.createBufferSource(); s.buffer = A.white; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.6; f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(300, t + 3.2);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7 * k, t + 0.9); g.gain.exponentialRampToValueAtTime(0.001, t + 4); s.connect(f); f.connect(g); g.connect(A.master); s.start(t); s.stop(t + 4.1); }
function launchSnd(k = 1) { if (!A.ctx) return; const c = A.ctx, t = c.currentTime;
  const s = c.createBufferSource(); s.buffer = A.brown; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(260, t + 2.6);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.95 * k, t + 0.06); g.gain.exponentialRampToValueAtTime(0.001, t + 3); s.connect(f); f.connect(g); g.connect(A.master); s.start(t); s.stop(t + 3.1);
  const w = c.createBufferSource(); w.buffer = A.white; const wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 1600; wf.Q.value = 0.7; const wg = c.createGain(); wg.gain.setValueAtTime(0.0001, t); wg.gain.exponentialRampToValueAtTime(0.25 * k, t + 0.03); wg.gain.exponentialRampToValueAtTime(0.001, t + 0.9); w.connect(wf); wf.connect(wg); wg.connect(A.master); w.start(t); w.stop(t + 1);
  const o = c.createOscillator(); o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.5); const og = c.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.7 * k, t + 0.02); og.gain.exponentialRampToValueAtTime(0.001, t + 0.6); o.connect(og); og.connect(A.master); o.start(t); o.stop(t + 0.7); }
function boomFar(k = 1, delay = 0) { if (!A.ctx) return; const c = A.ctx, t = c.currentTime + delay, s = c.createBufferSource(); s.buffer = A.brown;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(380, t); f.frequency.exponentialRampToValueAtTime(55, t + 2.4);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9 * k, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 3); s.connect(f); f.connect(g); g.connect(A.master); s.start(t); s.stop(t + 3.1); }
function squelch() { if (!A.ctx) return; const c = A.ctx, t = c.currentTime, w = c.createBufferSource(); w.buffer = A.white; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 2; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); w.connect(f); f.connect(g); g.connect(A.master); w.start(t); w.stop(t + 0.2); }
let radioT = -99, radioHide = 0, callT = -99;
function radio(text, speak = true) { if (G.mode !== 'bat' || G.time - radioT < 4) return; radioT = G.time; squelch(); const r = $('radio'); r.textContent = text; r.classList.add('on'); clearTimeout(radioHide); radioHide = setTimeout(() => r.classList.remove('on'), 2600); if (speak && G.time - callT > 2) say(text); }
function hitCall(destroyed) { if (G.time - callT < 2.5) return; callT = G.time; const L = destroyed ? ['دمّرناه! كفو!', 'راح عليهم!', 'تم التدمير!'] : ['أصبناه!', 'إصابة مباشرة!', 'في الصميم!']; say(L[(Math.random() * L.length) | 0]); }
function rocketSnd(k = 1) { if (!A.ctx) return; const c = A.ctx, t = c.currentTime, s = c.createBufferSource(); s.buffer = A.brown; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.6; f.frequency.setValueAtTime(240, t); f.frequency.exponentialRampToValueAtTime(900, t + 1.6); const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * k, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 2.2); s.connect(f); f.connect(g); g.connect(A.master); s.start(t); s.stop(t + 2.3); }
function beep(f = 880, d = 0.08, v = 0.1, delay = 0) { if (!A.ctx) return; const c = A.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(A.master); o.start(t); o.stop(t + d + 0.02); }
function radarAlarm() {
  if (A.ctx) { const c = A.ctx; for (let i = 0; i < 2; i++) { const t = c.currentTime + i * 0.42, o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(620, t); o.frequency.linearRampToValueAtTime(1180, t + 0.3); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.13, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400; o.connect(f); f.connect(g); g.connect(A.master); o.start(t); o.stop(t + 0.4); } }
  const r = $('rbox'); r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash');
  try { navigator.vibrate && navigator.vibrate([90, 60, 90]); } catch (e) { }
}
let arVoice = null; const pickVoice = () => { try { const sc = v => (/^ar[-_]SA/i.test(v.lang) ? 4 : 0) + (/enhanced|premium|natural|neural|محسّن|محسن/i.test(v.name) ? 8 : 0) + (/google|microsoft/i.test(v.name) ? 2 : 0); arVoice = speechSynthesis.getVoices().filter(v => /^ar/i.test(v.lang)).sort((a, b) => sc(b) - sc(a))[0] || null; } catch (e) { } };
try { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; } catch (e) { }
const SAYMAP = { 'الرادار يعمل': 'الرادار شغّال! يالله يا شباب، عيونكم على الشاشة!', 'هدف معادٍ': 'انتبه! هدف معادي!', 'تم الاعتراض': 'أصبناه! كفو والله!', 'تهديد وشيك': 'انتبهوا! تهديد قريب، تحركوا بسرعة!', 'أُصيبت القاعدة': 'انضربت القاعدة! شدّوا حيلكم!', 'إصابة في القاعدة': 'انضربت القاعدة! شدّوا حيلكم!', 'سقط داخل القاعدة': 'طاح داخل القاعدة!', 'السماء آمنة': 'السما نظيفة! كفو عليكم يا أبطال!', 'فشلت المهمة': 'ما قدرنا هالمرة، نعيدها ونرجع أقوى!', 'خطّط الضربة': 'جهّز ضربتك يا بطل!', 'انطلقت الضربة': 'أطلقنا! يالله يا شباب!', 'دُمّر الهدف': 'دمّرناه! كفو!', 'نجحت الضربة': 'الضربة نجحت! كفو عليك!', 'فشلت الضربة': 'ما وصلنا للهدف، نعيد الخطة!', 'تعطّلت منظومة': 'عطّلنا منظومتهم!', 'أسقطتَ هدفاً صديقاً': 'لا لا! هذا صديق!', 'دُمّر رادار الإنذار المبكر': 'راح رادار الإنذار! انتبهوا!', 'هدف ثانٍ': 'هدف ثاني جاي!', 'تم': '' };
function say(text) { text = SAYMAP[text] ?? text; if (!text) return; if (!A.on || !arVoice) return; try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.voice = arVoice; u.lang = arVoice.lang; u.rate = 1.04; u.pitch = 1; u.volume = 1; speechSynthesis.speak(u); } catch (e) { } }

// ---------- قاعدة المنظومات: أسماء مستوحاة، وأرقام لعبة مقرّبة (ليست بيانات حقيقية)
const TIER = { upper: { t: 'طبقة عليا', len: 6.4, r: 0.2, color: 0xe6e6e2, model: 'octo' }, mid: { t: 'بعيد ومتوسط', len: 5.6, r: 0.22, color: 0xd9d7cf, model: 'quad' }, short: { t: 'قصير المدى', len: 3.6, r: 0.16, color: 0xcfc8b0, model: 'quadS' }, gun: { t: 'مدفع', model: 'gun' }, beam: { t: 'طاقة موجّهة', model: 'beam' } };
const D = (name, org, tier, o) => { const T0 = TIER[tier]; return Object.assign({ name, org, tier, note: T0.t, min: 0, minAlt: 0, turn: 2.2, fuse: 45, per: 4, rl: 45, nL: 4 }, T0.len ? { len: T0.len, r: T0.r, color: T0.color } : {}, o); };
const DB = {
  thd: D('ثااد', 'أمريكا', 'upper', { sa: 'تشغّلها', min: 3000, max: 28000, minAlt: 4000, v: 1500, turn: 1.6, fuse: 70, rl: 60, nL: 3, pk: { b: 0.92, c: 0, d: 0 } }),
  arr: D('أرووو', 'إسرائيل', 'upper', { min: 4000, max: 30000, minAlt: 6000, v: 1700, turn: 1.5, fuse: 70, rl: 60, nL: 3, pk: { b: 0.9, c: 0, d: 0 } }),
  s5: D('إس فااايف', 'روسيا', 'upper', { min: 3000, max: 30000, minAlt: 3000, v: 1600, turn: 1.6, fuse: 70, rl: 60, nL: 3, pk: { b: 0.88, c: 0.3, d: 0 } }),
  pat: D('باتريوووت', 'أمريكا', 'mid', { sa: 'تشغّلها', min: 1000, max: 18000, minAlt: 30, v: 1150, fuse: 50, pk: { b: 0.75, c: 0.88, d: 0.7 } }),
  s4: D('إس فووور', 'روسيا', 'mid', { min: 1500, max: 20000, minAlt: 20, v: 1100, fuse: 50, pk: { b: 0.65, c: 0.85, d: 0.6 } }),
  samp: D('ساااامب', 'فرنسا وإيطاليا', 'mid', { min: 1000, max: 16000, minAlt: 20, v: 1100, fuse: 50, pk: { b: 0.7, c: 0.85, d: 0.65 } }),
  hq9: D('إتش كيو ناااين', 'الصين', 'mid', { min: 1000, max: 18000, minAlt: 25, v: 1100, fuse: 50, pk: { b: 0.6, c: 0.8, d: 0.6 } }),
  kms: D('تشيونغوووغ', 'كوريا الجنوبية', 'mid', { sa: 'متعاقد عليها', min: 1000, max: 15000, minAlt: 20, v: 1000, fuse: 50, pk: { b: 0.7, c: 0.85, d: 0.7 } }),
  brk: D('باراااك', 'إسرائيل والهند', 'mid', { min: 800, max: 14000, minAlt: 15, v: 1000, fuse: 45, pk: { b: 0.5, c: 0.85, d: 0.75 } }),
  sling: D('سلينننغ', 'إسرائيل', 'mid', { min: 1000, max: 16000, minAlt: 30, v: 1200, fuse: 50, nL: 3, pk: { b: 0.75, c: 0.85, d: 0.6 } }),
  hawk: D('هووووك', 'أمريكا', 'mid', { sa: 'تشغّلها', min: 1000, max: 12000, minAlt: 30, v: 800, turn: 1.8, per: 3, nL: 3, pk: { b: 0.15, c: 0.7, d: 0.55 } }),
  shn: D('شاهييين', 'فرنسا', 'short', { sa: 'تشغّلها', min: 500, max: 9000, minAlt: 15, maxAlt: 5000, v: 800, turn: 3.2, fuse: 35, rl: 30, nL: 2, pk: { b: 0.25, c: 0.85, d: 0.88 } }),
  nas: D('ناسااامز', 'النرويج وأمريكا', 'short', { min: 500, max: 10000, minAlt: 15, maxAlt: 8000, v: 900, turn: 3, fuse: 35, rl: 30, per: 6, nL: 3, pk: { b: 0.1, c: 0.85, d: 0.85 } }),
  iris: D('آيريييس', 'ألمانيا', 'short', { min: 500, max: 10000, minAlt: 15, maxAlt: 8000, v: 950, turn: 3.2, fuse: 35, rl: 30, per: 8, nL: 3, pk: { b: 0.15, c: 0.88, d: 0.88 } }),
  buk: D('بووووك', 'روسيا', 'short', { min: 1000, max: 12000, minAlt: 15, maxAlt: 10000, v: 900, turn: 2.6, fuse: 40, rl: 35, nL: 2, pk: { b: 0.3, c: 0.8, d: 0.75 } }),
  tor: D('تووور', 'روسيا', 'short', { min: 500, max: 8000, minAlt: 10, maxAlt: 6000, v: 850, turn: 3.4, fuse: 30, rl: 30, per: 8, nL: 2, pk: { b: 0.2, c: 0.85, d: 0.9 } }),
  pan: D('بانتسيييير', 'روسيا', 'short', { sa: 'حسب التقارير', min: 300, max: 7000, minAlt: 5, maxAlt: 5000, v: 1000, turn: 3.5, fuse: 30, rl: 30, per: 12, nL: 2, pk: { b: 0.05, c: 0.8, d: 0.9 } }),
  dome: D('آيرون دووووم', 'إسرائيل', 'short', { min: 500, max: 9000, minAlt: 10, maxAlt: 7000, v: 700, turn: 3, fuse: 35, rl: 40, per: 20, nL: 3, pk: { b: 0.15, c: 0.8, d: 0.85 } }),
  akash: D('أكاااش', 'الهند', 'short', { min: 1000, max: 12000, minAlt: 20, maxAlt: 10000, v: 850, turn: 2.6, fuse: 40, rl: 35, per: 3, nL: 3, pk: { b: 0.2, c: 0.8, d: 0.75 } }),
  stg: D('ستنقررر', 'أمريكا', 'short', { noRadar: true, min: 200, max: 4000, minAlt: 5, maxAlt: 3000, v: 650, turn: 4, fuse: 25, rl: 20, per: 2, nL: 3, len: 1.6, r: 0.08, pk: { b: 0, c: 0.45, d: 0.75 } }),
  cram: D('سي راااام', 'أمريكا', 'gun', { type: 'gun', max: 1500, maxAlt: 1200, cd: 3, nL: 2, pk: { b: 0.15, c: 0.6, d: 0.8 } }),
  vulc: D('فولكااانو', 'أمريكا', 'gun', { sa: 'تشغّلها', type: 'gun', max: 1200, maxAlt: 1000, cd: 3, nL: 2, pk: { b: 0, c: 0.4, d: 0.65 } }),
  skg: D('سكايقااارد', 'سويسرا', 'gun', { sa: 'تشغّلها', type: 'gun', max: 3000, maxAlt: 2500, cd: 3.5, nL: 2, pk: { b: 0.05, c: 0.55, d: 0.8 } }),
  gep: D('جيبااارد', 'ألمانيا', 'gun', { type: 'gun', max: 3500, maxAlt: 3000, cd: 3.5, nL: 2, pk: { b: 0, c: 0.55, d: 0.82 } }),
  ibeam: D('آيرون بييييم', 'إسرائيل', 'beam', { type: 'beam', max: 5000, maxAlt: 3000, cd: 5, nL: 1, pk: { b: 0, c: 0.45, d: 0.95 } }),
  silent: D('سايلنت هنتررر', 'الصين', 'beam', { sa: 'حسب التقارير', type: 'beam', max: 3000, maxAlt: 1500, cd: 5, nL: 1, pk: { b: 0, c: 0.2, d: 0.9 } }),
};
const PRESETS = {
  sa: { n: 'السعودية', l: ['thd', 'pat', 'kms', 'hawk', 'shn', 'pan', 'skg', 'vulc', 'silent'] },
  us: { n: 'أمريكا', l: ['thd', 'pat', 'hawk', 'nas', 'stg', 'cram', 'vulc'] },
  ru: { n: 'روسيا', l: ['s5', 's4', 'buk', 'tor', 'pan'] },
  cn: { n: 'الصين', l: ['hq9', 'silent'] },
  il: { n: 'إسرائيل', l: ['arr', 'sling', 'brk', 'dome', 'ibeam'] },
  eu: { n: 'أوروبا', l: ['samp', 'iris', 'nas', 'gep', 'skg', 'stg'] },
  kr: { n: 'كوريا الجنوبية', l: ['kms', 'pat', 'vulc'] },
  in: { n: 'الهند', l: ['s4', 'brk', 'akash'] },
  all: { n: 'كل المنظومات', l: Object.keys(DB) },
};
const MAXSYS = 5;
let SYS = {}, SYSK = [];
// المقذوفات المعادية: لكل نوع مساره الواقعي
const KIND = {
  b: { name: 'سكووود', model: 'scud', v: 1000, dmgR: 35, len: 11, r: 0.5, smoke: 18 },               // باليستي: من الأعلى بزاوية حادة
  c: { name: 'كروووز', model: 'cruise', v: 240, dmgR: 22, len: 6, r: 0.3, smoke: 10, low: 60 },         // كروز: منخفض جداً ثم انقضاض
  d: { name: 'شاااهد', v: 65, dmgR: 10, drone: true, low: 170 },                        // مسيّرة: بطيئة على ارتفاع منخفض
  f: { name: 'مدنية', v: 240, friend: true, plane: 2.4 },
  j: { name: 'صديقة', v: 280, friend: true, plane: 1 },
};
const MISSIONS = [
  { name: 'نوبة النهار', time: 'day', seq: 'c d b f c D b j c d', gap: 9 },
  { name: 'غروب مزدحم', time: 'sunset', seq: 'D c b c f b D c j b c D b', gap: 6.5 },
  { name: 'ليلة طويلة', time: 'night', seq: 'b b c D c f b D c j b b c D c b', gap: 5 },
];
const CLS = { unknown: 'مجهول', hostile: 'معادٍ', friend: 'صديق' };
const G = { pops: [], state: 'menu', time: 0, t: 0, tracks: [], shots: [], fq: [], sel: null, selSet: new Set(), follow: null, autoIFF: store.get('aiff', '0') === '1', assets: [], rCap: 30000,
  cam: { mode: 'base', yaw: 0.25, el: 0.92, dist: 420, center: new V3(55, 0, -15), fw: 0, t: 0, pos: new V3(), look: new V3(), fdir: new V3(0, 1, 0) } };
window.__game = G;

// ---------- أصول القاعدة: كل منصة ورادار ومبنى يتضرر وحده
const burnt = new THREE.MeshStandardMaterial({ color: 0x1c1916, roughness: 1, metalness: 0.1 });
function asset(o, list = G.assets) { o.alive = true; o.objs = o.objs || [o.obj]; o.objs.forEach(ob => { ob.userData.t0 = { r: ob.rotation.clone(), s: ob.scale.clone(), p: ob.position.clone() }; }); list.push(o); return o; }
function wreck(a) {
  a.objs.forEach(o => { o.traverse(c => { if (c.isMesh && !c.isInstancedMesh && c.material !== W.mats.lamp) { if (!c.userData.m0) c.userData.m0 = c.material; c.material = burnt; } });
    o.rotation.z += (Math.random() - 0.5) * 0.35; o.rotation.x += (Math.random() - 0.5) * 0.25; o.scale.y *= a.flat ? 0.35 : 0.5; o.position.y -= a.boss ? 4 : 0.5; });
  shadowOnce();
}
const SCM = new Map();
function scorch(a) { if (a.dmg1) return; a.dmg1 = true;
  (a.objs || []).forEach(o => o.traverse(c => { if (c.isMesh && !c.isInstancedMesh && c.material && !c.material.isMeshBasicMaterial && !c.userData.m0) { let s = SCM.get(c.material); if (!s) { s = c.material.clone(); s.color = c.material.color.clone().multiplyScalar(0.42); SCM.set(c.material, s); } c.userData.m0 = c.material; c.material = s; } }));
  F.explode(tC.set(a.x + (Math.random() - 0.5) * a.r, 0, a.z + (Math.random() - 0.5) * a.r), 0.45, { ground: true, debris: 10 }); }
function restoreAll(list = G.assets) { list.forEach(a => a.dmg1 = false); list.forEach(a => { a.alive = true; if (a.hp0) a.hp = a.hp0; if (a.ammo0 !== undefined) { a.ammo = a.ammo0; a.reloads = 2; a.rt = 0; } a.cd = 0; a.objs.forEach(o => { const t = o.userData.t0; o.rotation.copy(t.r); o.scale.copy(t.s); o.position.copy(t.p); o.traverse(c => { if (c.userData.m0) { c.material = c.userData.m0; delete c.userData.m0; } }); }); }); shadowOnce(); }
function buildInfra() {
  const kids = W.home.group.children.filter(c => !(c.geometry && c.geometry.type === 'PlaneGeometry') && !c.isInstancedMesh && c.visible);
  const near = (x, z, r) => kids.filter(c => Math.hypot(c.position.x - x, c.position.z - z) < r);
  [['حظيرة الطائرات 1', -120, -50, 18, 6, true], ['حظيرة الطائرات 2', -120, -14, 18, 6, true], ['حظيرة الطائرات 3', -84, 26, 18, 6, true], ['رادار الإنذار المبكر', -58, -96, 9, 10], ['برج المراقبة', -52, 34, 6, 4], ['خزانات الوقود', 91, -63, 14, 5], ['مبنى القيادة', 60, 96, 15, 6]]
    .forEach(([name, x, z, r, val, flat]) => asset({ name, objs: near(x, z, r), x, z, r: r * 0.8, val, kind: name.startsWith('رادار') ? 'ew' : 'infra', w: name.startsWith('رادار') ? 4 : 1, flat }));
}
buildInfra();
// مواقع افتراضية حسب الطبقة
const SLOTS = { upper: [[165, 45], [-160, -130]], mid: [[95, 0], [-150, 95], [30, 150], [150, -130]], short: [[-5, -110], [150, -120], [-110, -170], [-170, 30], [100, 150]], gun: [[40, -62], [-80, 62], [10, 40]], beam: [[-30, -55], [120, 80]] };
function autoPlace(keys) { const used = {}, out = {}; keys.forEach(k => { const t = DB[k].tier, i = used[t] = (used[t] || 0), s = SLOTS[t][i % SLOTS[t].length], o = Math.floor(i / SLOTS[t].length) * 35; used[t]++; out[k] = [s[0] + o, s[1] + o]; }); return out; }
let batObjs = [];
function makeBattery(k, cx, cz, paint, list, objs, reloads = 2, mod) {
  const S = Object.assign({}, DB[k]); S.cx = cx; S.cz = cz; if (mod) { S.rl *= mod.rl; if (!S.type) S.nL += mod.xl; }
  const add = (o, x, z) => { o.position.set(x, 0, z); compactGroup(o); scene.add(o); objs.push(o); return o; };
  if (S.type) {
    S.mounts = Array.from({ length: S.nL }, (_, i) => { const x = cx + (i - (S.nL - 1) / 2) * 22, z = cz, o = add(S.type === 'gun' ? W.gunMount() : W.beamMount(), x, z); o.rotation.y = Math.PI;
      return asset({ name: S.name + (S.nL > 1 ? ' ' + (i + 1) : ''), obj: o, x, z, r: 4, val: 5, sys: k, kind: 'mount', cd: 0, w: 1.5, bat: true }, list); });
  } else {
    const md = TIER[S.tier].model, sc = md === 'quadS' ? 0.75 : 1, tm = md === 'octo' ? 'octo' : 'quad';
    if (S.noRadar) S.radar = { alive: true, fake: true };
    else { const ro = add(W.truck(paint, 'radar'), cx, cz); ro.scale.setScalar(sc); ro.rotation.y = Math.PI; S.radar = asset({ name: 'رادار ' + S.name, obj: ro, x: cx, z: cz, r: 6, val: 12, sys: k, kind: 'radar', w: 4, bat: true }, list); }
    S.launchers = Array.from({ length: S.nL }, (_, i) => { const a = (i - (S.nL - 1) / 2) * 0.85, R = S.noRadar ? 14 : 30, x = cx + Math.sin(a) * R, z = cz - Math.cos(a) * R, o = add(W.truck(paint, tm), x, z);
      o.scale.setScalar(S.noRadar ? 0.45 : sc); o.rotation.y = Math.PI + a * 0.5;
      return asset({ name: `منصة ${S.name} ${i + 1}`, obj: o, x, z, r: S.noRadar ? 4 : 6, val: S.noRadar ? 3 : 6, sys: k, kind: 'launcher', ammo: S.per, ammo0: S.per, reloads, rt: 0, w: 2, bat: true }, list); });
  }
  return S;
}
function buildBatteries() {
  batObjs.forEach(o => scene.remove(o)); batObjs = []; G.assets = G.assets.filter(a => !a.bat); SYS = {}; SYSK = G.loadout.slice();
  for (const k of SYSK) { const [cx, cz] = G.place[k] || autoPlace([k])[k]; SYS[k] = makeBattery(k, cx, cz, W.mats.tan, G.assets, batObjs, 2, G.mode === 'bat' ? G.up : null); }
  G.valTotal = G.assets.reduce((s, a) => s + a.val, 0); buildSysButtons(); shadowOnce();
}
const integrity = () => Math.round(100 * G.assets.reduce((s, a) => s + (a.alive ? a.val : 0), 0) / G.valTotal);

// ---------- مجسمات
function planeModel(scale, color) {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.6 });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.8, 16, 12), m); fus.rotation.x = Math.PI / 2; g.add(fus);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3, 12), m); nose.rotation.x = Math.PI / 2; nose.position.z = 9.5; g.add(nose);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(22, 0.25, 3.2), m); wing.position.z = -0.5; g.add(wing);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 2), m); tl.position.z = -7; g.add(tl);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.4, 2.4), m); fin.position.set(0, 1.8, -7); g.add(fin);
  g.scale.setScalar(scale); return g;
}
// ---------- طائرة «إيييقل» (مستوحاة من ف-15): ذيلان عموديان ومحركان وجناح مثلثي
const JMAT = new THREE.MeshStandardMaterial({ color: 0x8e979f, roughness: 0.55, metalness: 0.5, side: THREE.DoubleSide }), JDARK = new THREE.MeshStandardMaterial({ color: 0x2d3338, roughness: 0.35, metalness: 0.7 });
const JGLOW = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
function plate(pts, d = 0.22) { const s = new THREE.Shape(); pts.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); s.closePath(); return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); }
function f15Model() {
  const g = new THREE.Group(), add = (geo, mat, x, y, z, rx = 0, ry = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, ry, 0); o.castShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(2.3, 1.3, 13), JMAT, 0, 0, -1);
  add(new THREE.CylinderGeometry(0.12, 0.8, 6, 12), JMAT, 0, 0.15, 8.5, Math.PI / 2);
  const cp = add(new THREE.SphereGeometry(0.62, 12, 8), JDARK, 0, 0.85, 5.2); cp.scale.set(1, 0.85, 2.8);
  [-1, 1].forEach(sd => { add(new THREE.BoxGeometry(1.1, 1.4, 4.5), JMAT, sd * 1.55, -0.1, 2.2); add(new THREE.CylinderGeometry(0.62, 0.66, 6, 12), JDARK, sd * 0.68, 0, -7.4, Math.PI / 2);
    add(plate([[7.2, 0.6], [9.8, 4.8], [11.1, 4.8], [10.9, 0.6]], 0.16), JMAT, sd * 1.5, 0, 0, 0, Math.PI / 2); });
  const w = [[1.1, -2.6], [7.6, 3.2], [7.6, 4.8], [1.1, 5.2]]; add(plate([...w, ...w.slice().reverse().map(([x, y]) => [-x, y])]), JMAT, 0, -0.05, 0, -Math.PI / 2);
  const h = [[0.9, 7.6], [4.4, 9.7], [4.4, 10.7], [0.9, 10.9]]; add(plate([...h, ...h.slice().reverse().map(([x, y]) => [-x, y]), [-0.9, 7.6]], 0.14), JMAT, 0, -0.1, 0, -Math.PI / 2);
  g.userData.glow = [-1, 1].map(sd => add(new THREE.ConeGeometry(0.55, 3.6, 10, 1, true), JGLOW, sd * 0.68, 0, -12.2, -Math.PI / 2));
  g.scale.setScalar(1.25); return g;
}
function droneModel() {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x8b8a80, roughness: 0.7, metalness: 0.3 }), s = new THREE.Shape();
  s.moveTo(0, -1.8); s.lineTo(1.6, 1.2); s.lineTo(0, 0.8); s.lineTo(-1.6, 1.2); s.closePath();
  const w = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false }), m); w.rotation.x = -Math.PI / 2; g.add(w);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 3, 8), m); b.rotation.x = Math.PI / 2; g.add(b); g.scale.setScalar(1.6); return g;
}
// ---------- مجسمات الصواريخ: شكل مختلف لكل فئة، والهندسة والمواد مشتركة لتخفيف الحمل
const MCACHE = {};
const pm = (c, met = 0.35, ro = 0.55) => new THREE.MeshStandardMaterial({ color: c, metalness: met, roughness: ro });
const MM = { white: pm(0xe9e8e2, 0.2, 0.45), olive: pm(0x5d6346, 0.3, 0.7), sand: pm(0xb9a878, 0.3, 0.6), dark: pm(0x222326, 0.5, 0.6), red: pm(0xa3261c, 0.2, 0.6), grey: pm(0x8c9096, 0.6, 0.4) };
function lathe(R, L, nose, ogive) { const p = [new THREE.Vector2(R * 0.85, 0), new THREE.Vector2(R, 0.05), new THREE.Vector2(R, L - nose)]; for (let i = 1; i <= 10; i++) { const t = i / 10; p.push(new THREE.Vector2(R * (ogive ? Math.sqrt(1 - t * t) : 1 - t) + 0.005, L - nose + nose * t)); } const g = new THREE.LatheGeometry(p, 20); g.translate(0, -L / 2, 0); return g; }
function finGeo(span, root, tip, sweep) { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(span, -sweep); s.lineTo(span, -sweep - tip); s.lineTo(0, -root); const e = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false }); e.translate(0, 0, -0.02); return e; }
function ring(g, R, y, h, mat) { const c = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.01, R * 1.01, h, 20), mat); c.position.y = y; g.add(c); }
function fins(g, geo, mat, R, y, n = 4, off = Math.PI / 4) { for (let i = 0; i < n; i++) { const p = new THREE.Group(), f = new THREE.Mesh(geo, mat); f.position.set(R * 0.95, y, 0); p.rotation.y = off + i * Math.PI * 2 / n; p.add(f); g.add(p); } }
function buildModel(type) {
  const g = new THREE.Group(); let L, R;
  if (type === 'scud') { // باليستي: جسم سميك، رأس حربي مخروطي طويل، أربع زعانف كبيرة
    L = 11; R = 0.45; g.add(new THREE.Mesh(lathe(R, L, 3.2, false), MM.olive)); ring(g, R, L / 2 - 3.25, 0.08, MM.dark); ring(g, R, -L / 2 + 2.2, 0.12, MM.dark);
    fins(g, finGeo(0.95, 1.6, 0.7, 0.5), MM.olive, R, -L / 2 + 1.7);
  } else if (type === 'cruise') { // كروز: جسم أسطواني، جناحان، ذيل صليبي، مدخل هواء سفلي
    L = 6; R = 0.27; g.add(new THREE.Mesh(lathe(R, L, 0.9, true), MM.grey));
    const w = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.55, 0.05), MM.grey); w.position.set(0, 0.1, 0); g.add(w);
    fins(g, finGeo(0.42, 0.55, 0.25, 0.2), MM.grey, R, -L / 2 + 0.6);
    const ins = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.9, 0.24), MM.dark); ins.position.set(0, -L / 2 + 1.5, -R); g.add(ins);
  } else if (type === 'upper') { // طبقة عليا: نحيل جداً بلا زعانف ورأس مدبب مغطى
    L = 6.2; R = 0.18; g.add(new THREE.Mesh(lathe(R, L, 1.4, false), MM.white)); ring(g, R, L / 2 - 1.5, 0.1, MM.dark); ring(g, R * 1.15, -L / 2 + 1.2, 1.6, MM.white);
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.15, R * 1.35, 0.4, 16), MM.dark); fl.position.y = -L / 2 + 0.2; g.add(fl);
  } else if (type === 'mid') { // متوسط: نحيل، رأس مخروطي، زعانف ذيل صغيرة
    L = 5.3; R = 0.2; g.add(new THREE.Mesh(lathe(R, L, 1.1, false), MM.white)); ring(g, R, L / 2 - 1.15, 0.06, MM.red);
    fins(g, finGeo(0.32, 0.7, 0.35, 0.25), MM.white, R, -L / 2 + 0.75);
  } else { // قصير: صغير بزعانف أمامية وخلفية
    L = 3; R = 0.1; g.add(new THREE.Mesh(lathe(R, L, 0.5, true), MM.sand));
    fins(g, finGeo(0.12, 0.2, 0.1, 0.05), MM.sand, R, L / 2 - 0.6, 4, 0); fins(g, finGeo(0.2, 0.4, 0.2, 0.15), MM.sand, R, -L / 2 + 0.45);
  }
  g.userData = { L, R, tailUp: -L / 2, bo: new THREE.Group() }; return g;
}
const modelOf = (spec) => spec.model || (spec.tier === 'upper' ? 'upper' : spec.tier === 'mid' ? 'mid' : 'short');
function makeMissile(spec, color) {
  const type = modelOf(spec), base = MCACHE[type] || (MCACHE[type] = buildModel(type)), obj = base.clone(); obj.userData = base.userData;
  const fl = F.makeFlame(base.userData.R * 1.1, base.userData.L * 0.7); fl.position.y = base.userData.tailUp; obj.add(fl); fl.userData.set(0, 0); scene.add(obj);
  return { obj, flame: fl, pos: obj.position, dir: new V3(0, 1, 0), vel: new V3(), v: 0, trail: {}, alive: true, t: 0, rocket: true, model: type };
}
const _mx = new THREE.Matrix4(), _r = new V3(), _z = new V3();
function orient(e) { if (e.rocket) { _r.crossVectors(e.dir, UP); if (_r.lengthSq() < 1e-4) _r.set(1, 0, 0); _r.normalize(); _z.crossVectors(_r, e.dir); _mx.makeBasis(_r, e.dir, _z); e.obj.quaternion.setFromRotationMatrix(_mx); } else { tA.copy(e.pos).add(e.dir); e.obj.lookAt(tA); } }
function steerToward(dir, want, maxAng) { const ang = dir.angleTo(want); if (ang < 1e-4) return; dir.lerp(want, Math.min(1, maxAng / ang)).normalize(); }
function tail(e, out) { return out.copy(e.pos).addScaledVector(e.dir, e.rocket ? e.obj.userData.tailUp : -2); }
const nearCam = (p, d) => camera.position.distanceToSquared(p) < d * d;
// حلقة نقطة الإصابة المتوقعة للهدف المحدد
const aimRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5b45, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
aimRing.renderOrder = 15; aimRing.visible = false; scene.add(aimRing);

// ---------- واجهة عامة
let bannerT = 0;
function banner(text, sub = '', cls = '', dur = 2.4, speak = true) { $('banner').className = 'show ' + cls; $('bt').textContent = text; $('bs').textContent = sub; bannerT = dur; if (speak) say(text); }
function show(id, on) { $(id).classList.toggle('hid', !on); }
function log(msg, cls = '') { const l = $('log'), d = document.createElement('div'); d.className = cls; d.textContent = msg; l.prepend(d); while (l.children.length > 6) l.lastChild.remove(); }

// ---------- المهمة
function start(mi) {
  audioInit(); clear(); leaveAtk(); restoreAll(); buildBatteries(); const Ms = G.M = MISSIONS[mi]; G.mi = mi; W.setTime(G.todPick && G.todPick !== 'auto' ? G.todPick : Ms.time); shadowOnce();
  F.post.nv = false; show('nvb', !!W.preset.night); $('nvb').classList.remove('on');
  Object.assign(G, { state: 'play', t: 0, score: 0, kills: 0, leaks: 0, nextId: 1, sel: null, follow: null, rCap: 30000, failWhy: '', endT: 0 }); G.selSet.clear(); toBase();
  G.queue = []; let at = 4;
  Ms.seq.split(' ').forEach(k => { const brg = (Math.random() - 0.5) * 3.4; if (k === 'D') { for (let i = 0; i < 3; i++) G.queue.push({ k: 'd', at: at + i * 1.6, brg: brg + (i - 1) * 0.05 }); } else G.queue.push({ k, at, brg }); at += Ms.gap * (0.75 + Math.random() * 0.5); });
  G.queue.sort((a, b) => a.at - b.at);
  show('menu', false); show('result', false); $('mname').textContent = Ms.name; log('بدأت المهمة: ' + Ms.name);
  banner('الرادار يعمل', 'حدّد الأهداف واشتبك. Shift لتحديد أكثر من هدف', '', 3); uiAll();
}
function clear() {
  clearAtk();
  G.tracks.forEach(t => { scene.remove(t.obj); t.mk && t.mk.remove(); }); G.shots.forEach(s => s.obj && scene.remove(s.obj)); G.tracks = []; G.shots = []; G.fq = []; F.reset();
  $('log').innerHTML = ''; $('chips').innerHTML = ''; aimRing.visible = false;
}
function pickAim() {
  const live = G.assets.filter(a => a.alive); if (!live.length) return { a: null, p: new V3(30, 0, -10) };
  let s = live.reduce((x, a) => x + a.w, 0) * Math.random(); for (const a of live) { s -= a.w; if (s <= 0) return { a, p: new V3(a.x, 0, a.z) }; } return { a: live[0], p: new V3(live[0].x, 0, live[0].z) };
}
function spawn(q) {
  const K = KIND[q.k], id = 'T' + String(G.nextId++).padStart(2, '0'), a = q.brg, sa = Math.sin(a), ca = -Math.cos(a);
  const t = { id, nid: q.net, k: q.k, K, t: 0, alive: true, cls: 'unknown', iff: 'none', iffT: 0, known: false, engaged: 0, dir: new V3(), vel: new V3(), v: K.v, trail: {}, sweep: 0, seen: false, rpos: new V3(), warned: false };
  if (K.friend) {
    t.obj = planeModel(K.plane, q.k === 'f' ? 0xe9e9ea : 0x7d8791); scene.add(t.obj); t.pos = t.obj.position;
    const d0 = q.k === 'f' ? 28000 : 22000, alt = q.k === 'f' ? 9500 : 2600, off = q.k === 'f' ? (Math.random() < 0.5 ? -1 : 1) * (6000 + Math.random() * 9000) : (Math.random() - 0.5) * 3000;
    t.pos.set(sa * d0, alt, ca * d0); t.aim = new V3(-ca * off, alt, sa * off); t.dir.subVectors(t.aim, t.pos).normalize();
  } else {
    const aim = q.aimA ? { a: q.aimA, p: new V3(q.aimA.x, 0, q.aimA.z) } : pickAim(); t.aimA = aim.a; const cep = q.k === 'b' ? 22 : q.k === 'c' ? 8 : 4; t.aim = aim.p.add(tA.set((Math.random() - 0.5) * 2 * cep, 0, (Math.random() - 0.5) * 2 * cep));
    if (q.k === 'b') { const m = makeMissile(K, 0x6f7460); Object.assign(t, { obj: m.obj, flame: m.flame, pos: m.pos, rocket: true }); const d0 = 15000 + Math.random() * 3000; t.pos.set(t.aim.x + sa * d0, 20000 + Math.random() * 3000, t.aim.z + ca * d0); }
    else if (q.k === 'c') { const m = makeMissile(K, 0x6f7460); Object.assign(t, { obj: m.obj, flame: m.flame, pos: m.pos, rocket: true }); const d0 = 9000; t.pos.set(sa * d0, 0, ca * d0); t.pos.y = Math.max(0, heightAt(t.pos.x, t.pos.z)) + K.low; }
    else { t.obj = droneModel(); scene.add(t.obj); t.pos = t.obj.position; const d0 = 5600 + Math.random() * 800; t.pos.set(sa * d0, K.low + Math.random() * 60, ca * d0); }
    t.dir.subVectors(q.k === 'b' ? t.aim : tA.set(t.aim.x, t.pos.y, t.aim.z), t.pos).normalize();
    if (q.from) { t.pos.copy(q.from); if (!q.drop) F.explode(tC.copy(q.from).setY(1), q.k === 'b' ? 0.3 : 0.16, { debris: 0 });
      if (q.drop) { const T = q.T || 9; t.arc = true; t.g = 2 * t.pos.y / (T * T); t.vel.set((t.aim.x - t.pos.x) / T, 0, (t.aim.z - t.pos.z) / T); t.v = t.vel.length(); t.dir.copy(t.vel).normalize(); }
      else if (q.k === 'b') { const T = q.T || 26 + Math.random() * 3; t.arc = true; t.g = 30; t.vel.set((t.aim.x - t.pos.x) / T, t.g * T / 2, (t.aim.z - t.pos.z) / T); t.v = t.vel.length(); t.dir.copy(t.vel).normalize(); }
      else { t.v = K.v * (q.k === 'd' ? (G.pvp ? 3 : 2.8) : (G.pvp ? 1.35 : 1.3)); tA.set(t.aim.x - t.pos.x, 0, t.aim.z - t.pos.z).normalize(); t.dir.set(tA.x * 0.75, 0.66, tA.z * 0.75).normalize(); } }
  }
  orient(t); G.tracks.push(t);
  const mk = t.mk = document.createElement('div'); mk.className = 'mk unknown'; mk.dataset.id = id; mk.innerHTML = `<b>${id}</b>`; $('marks').appendChild(mk);
  radarAlarm(); log(`${id} هدف جديد · ${(range(t) / 1000).toFixed(0)} كم`); if (G.autoIFF) startIFF(t);
}
const range = (t) => t.pos.length();
const detected = (t) => Math.hypot(t.pos.x, t.pos.z) <= G.rCap;
function select(t, add) { add = add || G.multi;
  if (!t || !t.alive) return;
  if (add) { if (G.selSet.has(t)) { G.selSet.delete(t); if (G.sel === t) G.sel = [...G.selSet].pop() || null; } else { G.selSet.add(t); G.sel = t; } }
  else { G.selSet.clear(); G.selSet.add(t); G.sel = t; }
  if (G.state === 'play') startIFF(t); uiAll();
}
function selectAllHostile() { G.selSet.clear(); G.tracks.filter(t => t.cls === 'hostile' && detected(t)).forEach(t => G.selSet.add(t)); G.sel = [...G.selSet][0] || G.sel; uiAll(); }
function startIFF(t) { if (!t || !t.alive || t.iff !== 'none') return; t.iff = 'busy'; t.iffT = 2.6 + Math.random() * 1.2; beep(1500, 0.05, 0.07); beep(1500, 0.05, 0.07, 0.12); }
function classify(t, c, bySystem) {
  if (!t || !t.alive) return; t.cls = c; t.mk.className = 'mk ' + c; if (bySystem) t.known = true;
  log(`${t.id} صُنّف ${CLS[c]}${bySystem ? ` (${t.K.name})` : ' يدوياً'}`, c === 'hostile' ? 'bad' : (c === 'friend' ? 'ok' : '')); uiAll();
}

// ---------- الاشتباك: تطلق وتنسى، ودفعة على عدة أهداف
function sysState(k) {
  const S = SYS[k];
  if (S.type) { const m = S.mounts.filter(a => a.alive); return { on: m.length > 0, ammo: Infinity, ready: m.some(a => a.cd <= 0), n: m.length, tot: S.mounts.length }; }
  const L = S.launchers.filter(a => a.alive), rl = L.filter(a => a.rt > 0); return { on: S.radar.alive && L.length > 0, radar: S.radar.alive, ammo: L.reduce((s, a) => s + a.ammo, 0), n: L.length, tot: S.launchers.length, reserve: L.reduce((s, a) => s + a.reloads * S.per, 0), reloading: rl.length, rlT: rl.length ? Math.min(...rl.map(a => a.rt)) : 0 };
}
function why(k, t) {
  const S = SYS[k], st = sysState(k);
  if (!st.on) return S.type ? 'مدمّر' : (!st.radar ? 'الرادار مدمّر' : 'المنصات مدمّرة');
  if (st.ammo <= 0) return st.reloading ? 'جارٍ التلقيم' : 'نفدت الذخيرة'; if (!t) return ''; if (t.cls !== 'hostile') return 'غير معادٍ';
  const r = range(t); if (r > S.max) return 'بعيد'; if (r < S.min) return 'قريب جداً';
  if (t.pos.y < (S.minAlt || 0)) return 'منخفض'; if (t.pos.y > (S.maxAlt ?? 1e9)) return 'مرتفع'; return 'ok';
}
function engage(k) {
  if (G.state !== 'play') return; const S = SYS[k], list = [...G.selSet].filter(t => t.alive && detected(t));
  if (!list.length) return banner('اختر هدفاً أولاً', '', 'warn', 1.3, false);
  const ok = list.filter(t => why(k, t) === 'ok'); if (!ok.length) return banner(S.name + ': ' + (why(k, G.sel && G.selSet.has(G.sel) ? G.sel : list[0]) || 'لا هدف صالح'), '', 'warn', 1.6, false);
  let cap = S.type ? S.mounts.filter(a => a.alive && a.cd <= 0).length : sysState(k).ammo;
  const already = G.fq.filter(q => q.k === k).length; cap -= already;
  if (cap <= 0) return banner(S.name + (S.type ? ' يعيد التجهيز' : ': لا منصة جاهزة'), '', 'warn', 1.3, false);
  const per = G.dbl && !S.type ? 2 : 1; let q = 0, nt = 0;
  for (let i = 0; i < ok.length && q < cap; i++) { nt++; for (let j = 0; j < per && q < cap; j++) G.fq.push({ k, tgt: ok[i], at: G.t + (already + q++) * 0.4 }); }
  if (nt > 1 || per > 1) banner(`${S.name}: ${q} صواريخ على ${nt} ${nt > 1 ? 'أهداف' : 'هدف'}`, per > 1 ? 'دفعة مزدوجة' : '', 'ok', 1.6, false);
  if (ok.length < list.length) log(`${list.length - ok.length} هدف خارج قدرة ${S.name}`, 'warn');
}
function launchOne(k, t) {
  const S = SYS[k]; if (!t.alive || why(k, t) !== 'ok') return;
  if (S.type) {
    const mt = S.mounts.filter(a => a.alive && a.cd <= 0).sort((a, b) => Math.hypot(a.x - t.pos.x, a.z - t.pos.z) - Math.hypot(b.x - t.pos.x, b.z - t.pos.z))[0]; if (!mt) return;
    mt.cd = S.cd; t.engaged++; mt.obj.getWorldPosition(tA);
    G.shots.push({ type: S.type, k, S, tgt: t, t: 0, dur: S.type === 'gun' ? 2.2 : 1.8, from: tA.clone().setY(tA.y + (S.type === 'gun' ? 2.6 : 4)), alive: true, acc: 0 });
    log(`${S.name} يشتبك مع ${t.id}`); rocketSnd(0.3); return;
  }
  const L = S.launchers.filter(a => a.alive && a.ammo > 0).sort((a, b) => b.ammo - a.ammo)[0]; if (!L) return;
  L.ammo--; t.engaged++; L.obj.getWorldPosition(tA);
  const m = makeMissile(S, S.color); m.pos.copy(tA).setY(tA.y + 6); tB.set(t.pos.x - m.pos.x, 0, t.pos.z - m.pos.z).normalize(); m.dir.set(tB.x * 0.35, 0.94, tB.z * 0.35).normalize(); m.v = 80; orient(m);
  Object.assign(m, { k, S, tgt: t }); G.shots.push(m);
  F.explode(tC.copy(m.pos).setY(1), 0.14, { debris: 0 }); F.padBlast && F.padBlast(tC, 0.4, 1); rocketSnd(1); log(`${S.name} أُطلق على ${t.id}`);
  if (G.mode !== 'bat') { const chip = m.chip = document.createElement('button'); chip.className = 'chip new'; setTimeout(() => chip.classList.remove('new'), 900); chip.innerHTML = `<b>${S.name}</b><i>${t.id}</i>`; chip.onclick = () => followShot(m); $('chips').appendChild(chip); }
}
function followShot(m) { if (!m.alive) return; G.follow = m; G.cam.mode = 'follow'; G.cam.t = 0;[...$('chips').children].forEach(c => c.classList.toggle('on', c === m.chip)); show('backb', true); }
function toBase() { G.follow = null; G.cam.mode = (G.mode === 'bat' && G.foeView && G.state !== 'menu') ? 'foe' : (G.mode === 'bat' && !G.topView && G.state !== 'menu') ? 'ground' : 'base'; G.cam.t = 0;[...$('chips').children].forEach(c => c.classList.remove('on')); show('backb', false); }
function endShot(m) { m.alive = false; if (m.obj) scene.remove(m.obj); if (m.chip) m.chip.remove(); if (G.follow === m) { G.cam.mode = 'blast'; G.cam.t = 0; G.blast = m.pos.clone(); G.follow = null; } }
function killTrack(t, byUs) {
  if (t.nid && G.pvp) netSend(byUs ? 'x' : 'h', { id: t.nid });
  t.alive = false; scene.remove(t.obj); t.mk.remove(); G.selSet.delete(t); if (G.sel === t) G.sel = [...G.selSet][0] || null;
  if (byUs) {
    if (t.K.friend) { G.failWhy = 'أُسقط هدف صديق'; G.forceFail = true; banner('أسقطتَ هدفاً صديقاً', t.K.name + ' ' + t.id, 'warn', 4); log(`${t.id} كان صديقاً`, 'bad'); }
    else { G.kills++; G.score += 100; const close = G.mode === 'bat' && t.aim && t.pos.distanceTo(t.aim) < 700 && G.time - (G.lastSave || -99) > 10;
      if (close) { G.lastSave = G.time; G.slowT = 1.3; banner('فاتنا بشعرة!', `${t.K.name} اعتُرض قرب القاعدة`, 'ok', 2); say('فاتنا بشعرة!'); } else banner('تم الاعتراض', `${t.K.name} ${t.id}`, 'ok', 1.6); log(`${t.id} دُمّر`, 'ok'); }
  }
}
function resolve(s, t) {
  const hit = Math.random() < (s.S.pk[t.k] ?? 0.9) * (G.mode === 'bat' ? 0.72 + G.up.pk : 1);
  if (hit) { F.explode(t.pos.clone(), t.K.drone ? 0.5 : 0.95, { vel: t.vel, debris: t.K.drone ? 16 : 40 }); boom(0.9, Math.min(1.5, camera.position.distanceTo(t.pos) / 3000)); killTrack(t, true); }
  else { log(`${s.S.name} أخطأ ${t.id}`, 'bad'); banner(s.S.name + ' أخطأ', 'أعد الاشتباك مع ' + t.id, 'warn', 1.6, false); }
  return hit;
}
function impact(t) { // ضرر موضعي حول نقطة السقوط فقط
  const ip = t.pos.clone(); ip.y = Math.max(0, heightAt(ip.x, ip.z)); const K = t.K;
  F.explode(ip, K.drone ? 0.6 : (t.k === 'b' ? 1.6 : 1.1), { ground: true, vel: t.vel, debris: 40 }); boom(1.2);
  const hit = G.assets.filter(a => a.alive && Math.hypot(a.x - ip.x, a.z - ip.z) < K.dmgR + a.r);
  hit.forEach(a => { if (G.pvp && (a.hp ?? 1) > 1) { a.hp--; scorch(a); log(`إصابة: ${a.name}`, 'bad'); return; } a.alive = false; wreck(a); log(`دُمّر: ${a.name}`, 'bad'); if (a.kind === 'ew') { G.rCap = 10000; banner('دُمّر رادار الإنذار المبكر', 'مدى الكشف صار 10 كم', 'warn', 3); } });
  G.leaks++; killTrack(t, false);
  if (hit.length) { const rad = hit.find(a => a.kind === 'radar'); banner(rad ? 'دُمّر ' + rad.name : 'إصابة في القاعدة', hit.map(a => a.name).join('، '), 'warn', 2.8); }
  else banner('سقط داخل القاعدة', 'بلا ضرر على المنظومات', 'warn', 2);
  G.lastHome = ip.clone(); if (G.cam.mode === 'base' && G.mode !== 'bat') { G.cam.focus = ip.clone().setY(0); G.cam.focusT = 4; }
  G.camShake = Math.max(0, 1 - camera.position.distanceTo(ip) / 2500);
}

function update(dt, rdt) {
  G.time += dt; if (G.state === 'cine') return cineTick(rdt); if (G.mode === 'atk' && (G.state === 'aplan' || G.state === 'astrike')) return updateAtk(dt, rdt);
  if (G.state !== 'play') { F.update(dt, G.time, heightAt, rdt); return; }
  if (G.mode === 'bat') battleTick(dt, rdt);
  G.t += dt; G.assets.forEach(a => { if (a.cd > 0) a.cd -= dt;
    if (a.kind === 'launcher' && a.alive && a.ammo === 0 && (a.reloads > 0 || a.rt > 0)) { const S = SYS[a.sys]; if (a.rt > 0 && a.rt - dt <= 0) radio(a.name + ' جاهزة', false);
      if (a.rt <= 0) { a.rt = S.rl; a.reloads--; log(`${a.name}: بدأ التلقيم (${S.rl} ث)`); }
      else if ((a.rt -= dt) <= 0) { a.rt = 0; a.ammo = S.per; log(`${a.name}: جاهزة، ${S.per} صواريخ`, 'ok'); beep(900, 0.08, 0.07); } } });
  while (G.queue.length && G.queue[0].at <= G.t) spawn(G.queue.shift());
  while (G.fq.length && G.fq[0].at <= G.t) { const q = G.fq.shift(); launchOne(q.k, q.tgt); }
  for (const t of G.tracks) {
    if (!t.alive) continue; t.t += dt; const K = t.K;
    if (t.iff === 'busy' && (t.iffT -= dt) <= 0) { t.iff = 'done'; if (K.friend) { classify(t, 'friend', true); beep(1000, 0.1, 0.08); } else { classify(t, 'hostile', true); beep(520, 0.16, 0.1); banner('هدف معادٍ', `${K.name} ${t.id}`, 'warn', 1.6); } }
    if ((t.k === 'c' || t.k === 'd') && t.t > 0.8) { // تتبّع التضاريس ثم انقضاض على الهدف
      const hd = Math.hypot(t.aim.x - t.pos.x, t.aim.z - t.pos.z); tA.copy(t.aim);
      if (hd > (t.k === 'c' ? 700 : 380)) tA.y = Math.max(0, heightAt(t.pos.x + t.dir.x * 300, t.pos.z + t.dir.z * 300)) + K.low;
      tA.sub(t.pos).normalize(); steerToward(t.dir, tA, (t.k === 'c' ? 0.7 : 0.9) * dt);
    }
    if (t.arc) { t.vel.y -= t.g * dt; t.v = t.vel.length(); t.dir.copy(t.vel).normalize(); } else t.vel.copy(t.dir).multiplyScalar(t.v); t.pos.addScaledVector(t.vel, dt); orient(t);
    if (t.flame) t.flame.userData.set(t.k === 'b' ? 0.9 : 0.5, G.time);
    if (K.smoke && nearCam(t.pos, 9000)) F.trail(tail(t, tB), t.dir, t.v, dt, G.mode === 'bat' ? { state: t.trail, rate: K.smoke * 0.8, size: t.k === 'b' ? 1.4 : 0.8, life: 10, alpha: 0.5 } : { state: t.trail, rate: K.smoke, size: t.k === 'b' ? 1.1 : 0.5, life: 4, alpha: 0.4 });
    if (K.friend) { if (t.t > 10 && Math.hypot(t.pos.x, t.pos.z) > 31000) { t.alive = false; scene.remove(t.obj); t.mk.remove(); G.selSet.delete(t); if (G.sel === t) G.sel = null; log(`${t.id} غادر المجال`); } continue; }
    const eta = t.pos.distanceTo(t.aim) / t.v;
    if (!t.warned && eta < 9 && t.cls === 'hostile') { t.warned = true; banner('تهديد وشيك', `${t.id} يصيب ${t.aimA ? t.aimA.name : 'القاعدة'} خلال ${Math.ceil(eta)} ث`, 'warn', 2.2); beep(660, 0.2, 0.12); beep(660, 0.2, 0.12, 0.3); }
    if (t.pos.y <= Math.max(0, heightAt(t.pos.x, t.pos.z)) + 1) impact(t);
  }
  for (const s of G.shots) {
    if (!s.alive) continue; s.t += dt; const t = s.tgt;
    if (s.type) {
      if (!t.alive) { s.alive = false; if (s.type === 'beam') F.beam(tA, tA, 0); continue; }
      if (s.type === 'gun') { s.acc += dt; while (s.acc > 0.05) { s.acc -= 0.05; tA.copy(t.pos).addScaledVector(t.vel, s.from.distanceTo(t.pos) / 1000).add(tC.randomDirection().multiplyScalar(14)).sub(s.from).normalize(); F.tracer(s.from, tA, 1000, 2); } if (Math.random() < dt * 6) F.flak(tC.copy(t.pos).add(tA.randomDirection().multiplyScalar(30))); }
      else F.beam(s.from, t.pos, 0.5 + Math.sin(G.time * 50) * 0.15);
      if (s.t >= s.dur) { s.alive = false; if (s.type === 'beam') F.beam(tA, tA, 0); if (range(t) <= s.S.max * 1.1) resolve(s, t); }
      continue;
    }
    s.v = Math.min(s.S.v, s.v + s.S.v * 0.7 * dt);
    if (s.missed) { if ((s.missT -= dt) <= 0) { F.explode(s.pos.clone(), 0.35, { debris: 8 }); endShot(s); continue; } }
    else if (!t.alive) { s.missed = true; s.missT = 0.6; }
    else if (s.t > 0.6) { // توجيه تلقائي نحو نقطة الالتقاء
      const d = s.pos.distanceTo(t.pos), tt = d / Math.max(300, s.v + t.v * 0.5); tA.copy(t.pos).addScaledVector(t.vel, tt).sub(s.pos).normalize(); steerToward(s.dir, tA, s.S.turn * dt);
      if (d < s.S.fuse || (s.pd !== undefined && s.pd < s.S.fuse * 3 && d > s.pd)) { if (resolve(s, t)) { endShot(s); continue; } s.missed = true; s.missT = 1; }
      s.pd = d;
    }
    s.vel.copy(s.dir).multiplyScalar(s.v); s.pos.addScaledVector(s.vel, dt); orient(s); s.flame.userData.set(0.9, G.time);
    if (nearCam(s.pos, 7000)) F.trail(tail(s, tB), s.dir, s.v, dt, G.mode === 'bat' ? { state: s.trail, rate: s.t < 3 ? 40 : 22, size: 0.95, life: 9 } : { state: s.trail, rate: s.t < 3 ? 60 : 34, size: 0.75, life: 4.5 });
    if (s.pos.y < heightAt(s.pos.x, s.pos.z) || s.t > 40) { F.explode(s.pos.clone(), 0.35, { debris: 6 }); endShot(s); }
  }
  G.tracks = G.tracks.filter(t => t.alive); G.shots = G.shots.filter(s => s.alive);
  F.rate = Q.rate * Math.min(1, 6 / Math.max(1, G.shots.length + G.tracks.length * 0.5)) * (F.smoke.n > 2000 ? 0.35 : F.smoke.n > 1400 ? 0.7 : 1);
  F.update(dt, G.time, heightAt, rdt);
  if (bannerT > 0 && (bannerT -= rdt) <= 0) $('banner').className = '';
  const integ = integrity(), anySys = SYSK.some(k => sysState(k).on);
  if (G.forceFail || integ < 30 || !anySys) { if (!G.failWhy) G.failWhy = !anySys ? 'دُمّرت كل منظومات الدفاع' : 'دُمّرت القاعدة'; if (G.mode === 'bat') { G.forceFail = false; return startCine(G.lastHome || HOMEC, () => finishBat(false), 'سقطت قاعدتك', G.failWhy, false); } return finish(false); }
  if (G.mode !== 'bat' && !G.queue.length && !G.fq.length && !G.tracks.some(t => !t.K.friend)) { if ((G.endT += dt) > 3) finish(true); } else G.endT = 0;
}
function finish(win) {
  G.state = 'result'; G.forceFail = false; toBase(); const next = MISSIONS[G.mi + 1], integ = integrity();
  $('result').className = win ? 'ov win' : 'ov lose'; $('rt').textContent = win ? 'السماء آمنة' : 'فشلت المهمة';
  $('rs').textContent = win ? `سلامة القاعدة ${integ}٪` : G.failWhy;
  $('rd').textContent = `اعتراضات: ${G.kills} · اختراقات: ${G.leaks} · النقاط: ${G.score + integ * 5}`; show('rn', win && !!next); show('result', true); say(win ? 'السماء آمنة' : 'فشلت المهمة');
}

// ---------- الكاميرا
let shake = 0; const GROUND = new V3(30, 210, 400); Object.assign(G.cam, { gy: 0, gp: -0.42, gfov: 66 });
const VIEWS = { mid: { p: [30, 30, 205], gp: -0.2, fov: 62 }, eye: { p: [20, 2.4, 190], gp: 0.08, fov: 64 }, tower: { p: [30, 48, 330], gp: -0.1, fov: 64 }, high: { p: [30, 210, 400], gp: -0.42, fov: 66 } };
try { G.view = localStorage.getItem('saqrView') || 'mid'; } catch (e) { G.view = 'mid'; }
function setView(k) { const v = VIEWS[k] || VIEWS.mid; G.view = VIEWS[k] ? k : 'mid'; GROUND.set(...v.p); Object.assign(G.cam, { gy: 0, gp: v.gp, gfov: v.fov }); try { localStorage.setItem('saqrView', G.view); } catch (e) {} viewUI(); }
function viewUI() { document.querySelectorAll('#campnl [data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === G.view)); $('camh').textContent = Math.round(GROUND.y) + ' م'; }
function autoLook(rdt) {
  let p = null, best = 1e9;
  for (const s of G.shots) if (s.pos && s.t < 3 && s.t < best) { best = s.t; p = s.pos; }
  if (!p) for (const mu of G.mun) if (mu.t < 3.5 && mu.t < best) { best = mu.t; p = mu.pos; }
  if (!p) for (const t of G.tracks) { const d = t.pos.distanceTo(GROUND); if (!t.K.friend && d < 7000 && d < best) { best = d; p = t.pos; } }
  if (!p) p = tB.set(EC.x, 400, EC.z);
  const dx = p.x - GROUND.x, dz = p.z - GROUND.z, gy = Math.atan2(dx, -dz), gp = M.clamp(Math.atan2(p.y - GROUND.y, Math.hypot(dx, dz)) * 0.6, 0.04, 0.3);
  let d = gy - G.cam.gy; d = Math.atan2(Math.sin(d), Math.cos(d)); const k = Math.min(1, rdt * 1.4); G.cam.gy += d * k; G.cam.gp += (gp - G.cam.gp) * k;
}
function updateCamera(rdt) {
  const c = G.cam; c.t += rdt; let fov = 50;
  if (G.camShake) { shake = Math.max(shake, G.camShake); G.camShake = 0; }
  if (c.mode === 'follow' && G.follow && G.follow.alive) {
    // من خلف الصاروخ الاعتراضي: يظهر الصاروخ في أسفل الكادر والهدف أمامه
    const m = G.follow, tg = m.tgt && m.tgt.alive ? m.tgt.pos : tB.copy(m.pos).addScaledVector(m.dir, 2000);
    tA.subVectors(tg, m.pos); const dist = tA.length(); tA.normalize();
    if (c.t < 0.05) c.fdir.copy(m.dir); c.fdir.lerp(tA.lerp(m.dir, M.clamp(1 - m.t / 2, 0, 0.7)), Math.min(1, rdt * 3.5)).normalize();
    tC.copy(UP).addScaledVector(c.fdir, -c.fdir.y); if (tC.lengthSq() < 0.05) tC.set(0, 0, 1); tC.normalize();
    camera.position.copy(m.pos).addScaledVector(c.fdir, -(m.camB || 24)).addScaledVector(tC, m.camU || 6.5);
    c.look.copy(m.pos).addScaledVector(c.fdir, Math.min(Math.max(dist, 200), 4000)); fov = 55;
    F.post.heatPos.copy(m.pos); F.post.heat = 0.5;
  } else if (c.mode === 'ground') {
    camera.position.lerp(GROUND, c.t < 0.05 ? 1 : Math.min(1, rdt * 4));
    const cp = Math.cos(c.gp); c.look.copy(camera.position).add(tA.set(Math.sin(c.gy) * cp, Math.sin(c.gp), -Math.cos(c.gy) * cp).multiplyScalar(100)); fov = c.gfov; F.post.heat = 0;
  } else if (c.mode === 'foe') {
    camera.position.lerp(tB.set(EC.x + 20, 270, EC.z + 480), c.t < 0.05 ? 1 : Math.min(1, rdt * 2.5)); c.look.set(EC.x + 5, 0, EC.z - 25); fov = 50; F.post.heat = 0;
  } else if (c.mode === 'cine' && G.cine) {
    const p = G.cine.p, a = 0.6 + c.t * 0.16, R = Math.max(95, 170 - c.t * 10); camera.position.set(p.x + Math.sin(a) * R, 40 + c.t * 4, p.z + Math.cos(a) * R); c.look.set(p.x, 12 + c.t * 2, p.z); fov = 44; F.post.focus = 1; F.post.focusPos.copy(c.look); F.post.heat = 0;
  } else if (c.mode === 'blast') { c.look.lerp(G.blast, Math.min(1, rdt * 5)); fov = 50; if (c.t > 2.6) toBase(); F.post.heat = 0; }
  else {
    if (c.mode !== 'base') toBase();
    // منظر علوي للقاعدة؛ يقترب تلقائياً من مكان الإصابة ثم يعود
    if (c.focus && (c.focusT -= rdt) <= 0) c.focus = null;
    c.fw += ((c.focus ? 1 : 0) - c.fw) * Math.min(1, rdt * 2.2);
    tB.copy(c.center); if (c.focus) c.lastF = c.focus; if (c.lastF) tB.lerp(c.lastF, c.fw);
    const dist = M.lerp(c.dist, Math.min(c.dist, 300), c.fw), ce = Math.cos(c.el);
    c.pos.set(tB.x + Math.sin(c.yaw) * ce * dist, Math.sin(c.el) * dist, tB.z + Math.cos(c.yaw) * ce * dist);
    camera.position.lerp(c.pos, c.t < 0.05 ? 1 : Math.min(1, rdt * 6)); c.look.lerp(tB, c.t < 0.05 ? 1 : Math.min(1, rdt * 6)); F.post.heat = 0;
  }
  shake = Math.max(0, shake - rdt * 1.3); const s = shake * shake;
  camera.lookAt(c.look); camera.position.x += Math.sin(G.time * 71) * s * 2; camera.position.y += Math.sin(G.time * 89) * s * 2;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, rdt * 5); camera.updateProjectionMatrix(); }
  for (const t of G.tracks) { tA.copy(t.pos).project(camera); const on = detected(t) && tA.z < 1 && Math.abs(tA.x) < 1 && Math.abs(tA.y) < 1; t.mk.style.display = on ? '' : 'none'; if (on) { t.mk.style.transform = `translate(${(tA.x * 0.5 + 0.5) * VW}px,${(-tA.y * 0.5 + 0.5) * VH}px)`; t.mk.classList.toggle('sel', G.selSet.has(t)); } }
  if (G.mode === 'atk' || G.mode === 'bat') atkMarks();
  const st = G.sel; aimRing.visible = !!(st && st.alive && st.cls === 'hostile' && st.aim && c.mode === 'base');
  if (aimRing.visible) { aimRing.position.copy(st.aim).setY(0.6); aimRing.scale.setScalar(st.K.dmgR); aimRing.material.opacity = 0.55 + Math.sin(G.time * 8) * 0.3; }
}

// ---------- الرادار الحي
const rc = $('radar'), rx = rc.getContext('2d'); let RS = 300, rdpr = 1;
function radarResize() { RS = rc.clientWidth || 300; rdpr = Math.min(2, devicePixelRatio || 1); rc.width = rc.height = Math.round(RS * rdpr); }
G.rRange = +store.get('rr', 20000) || 20000;
const COL = { unknown: '#f2c14e', hostile: '#ff5b45', friend: '#63e08a' };
function drawRadar(rdt) {
  const g = rx, S = RS, c = S / 2, R = S / 2 - 10, RR = G.rRange, k = R / RR; g.setTransform(rdpr, 0, 0, rdpr, 0, 0);
  g.fillStyle = '#06110b'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(99,224,138,.22)'; g.lineWidth = 1; g.fillStyle = 'rgba(99,224,138,.5)'; g.font = '10px system-ui'; g.textAlign = 'left';
  const step = RR > 20000 ? 10000 : RR > 10000 ? 5000 : RR > 5000 ? 2000 : 1000;
  for (let d = step; d < RR; d += step) { const rr = d * k; g.beginPath(); g.arc(c, c, rr, 0, 7); g.stroke(); g.fillText((d / 1000) + ' كم', c + 3, c - rr + 11); }
  g.beginPath(); g.arc(c, c, R, 0, 7); g.stroke();
  if (G.rCap < RR) { g.fillStyle = 'rgba(255,91,69,.08)'; g.beginPath(); g.arc(c, c, R, 0, 7); g.arc(c, c, G.rCap * k, 0, 7, true); g.fill(); }
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.beginPath(); g.moveTo(c + Math.sin(a) * R * 0.1, c - Math.cos(a) * R * 0.1); g.lineTo(c + Math.sin(a) * R, c - Math.cos(a) * R); g.globalAlpha = i % 3 ? 0.35 : 0.8; g.stroke(); } g.globalAlpha = 1;
  g.fillStyle = 'rgba(99,224,138,.5)'; g.textAlign = 'center'; g.fillText('ش', c, 12);
  if (G.hoverSys) { const s = SYS[G.hoverSys]; g.strokeStyle = 'rgba(233,182,92,.85)'; g.setLineDash([4, 4]); g.beginPath(); g.arc(c, c, Math.min(s.max * k, R), 0, 7); g.stroke(); if (s.min) { g.beginPath(); g.arc(c, c, s.min * k, 0, 7); g.stroke(); } g.setLineDash([]); }
  const sw = G.sweep = ((G.sweep || 0) + rdt * (Math.PI * 2 / 3.2)) % (Math.PI * 2);
  if (g.createConicGradient) { const gr = g.createConicGradient(sw - Math.PI / 2, c, c); gr.addColorStop(0, 'rgba(99,224,138,0)'); gr.addColorStop(0.86, 'rgba(99,224,138,0)'); gr.addColorStop(1, 'rgba(99,224,138,.3)'); g.fillStyle = gr; g.beginPath(); g.arc(c, c, R, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(140,255,180,.9)'; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.sin(sw) * R, c - Math.cos(sw) * R); g.stroke();
  for (const t of G.tracks) {
    t.sx = t.sy = -999; if (!detected(t)) continue;
    let a = Math.atan2(t.pos.x, -t.pos.z); if (a < 0) a += Math.PI * 2; let da = sw - a; if (da < 0) da += Math.PI * 2;
    if (da < 0.25 || !t.seen) { t.seen = true; t.rpos.copy(t.pos); t.sweep = 1; } else t.sweep = Math.max(0.35, t.sweep - rdt * 0.28);
    const x = c + t.rpos.x * k, y = c + t.rpos.z * k, col = COL[t.cls]; if (Math.hypot(x - c, y - c) > R) continue;
    g.globalAlpha = t.sweep; g.strokeStyle = g.fillStyle = col; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + t.dir.x * 14 / Math.hypot(t.dir.x, t.dir.z || 1e-3) * Math.hypot(t.dir.x, t.dir.z), y + t.dir.z * 14); g.stroke();
    g.beginPath(); if (t.cls === 'hostile') { g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.closePath(); } else if (t.cls === 'friend') g.arc(x, y, 5, 0, 7); else g.rect(x - 5, y - 5, 10, 10);
    g.stroke(); if (t.iff === 'busy') { g.beginPath(); g.arc(x, y, 9 + (G.time * 12) % 6, 0, 7); g.stroke(); }
    g.globalAlpha = 1; g.font = '10px system-ui'; g.textAlign = 'left'; g.fillText(t.id.slice(1) + (t.known ? ' ' + t.K.name : ''), x + 8, y - 6);
    if (G.selSet.has(t)) { g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(x - 10, y - 10, 20, 20); }
    t.sx = x; t.sy = y;
  }
  g.fillStyle = '#9fe8ff'; for (const s of G.shots) if (s.pos) { g.beginPath(); g.arc(c + s.pos.x * k, c + s.pos.z * k, 2.2, 0, 7); g.fill(); }
  g.fillStyle = '#e9b65c'; g.fillRect(c - 3, c - 3, 6, 6);
  g.save(); g.textAlign = 'center'; g.font = '700 11px system-ui'; g.fillStyle = 'rgba(140,255,180,.85)'; g.fillText('المدى ' + (RR / 1000) + ' كم', c, S - 22); g.restore();
}
const rZoom = (d) => { const L = [5000, 10000, 20000, 30000]; let i = L.indexOf(G.rRange); if (i < 0) i = 2; G.rRange = L[M.clamp(i + d, 0, 3)]; store.set('rr', G.rRange); };
$('rzi').onclick = () => rZoom(-1); $('rzo').onclick = () => rZoom(1);
rc.addEventListener('wheel', e => { e.preventDefault(); const L = [5000, 10000, 20000, 30000]; let i = L.indexOf(G.rRange); if (i < 0) i = 2; i = M.clamp(i + (e.deltaY > 0 ? 1 : -1), 0, L.length - 1); G.rRange = L[i]; store.set('rr', G.rRange); }, { passive: false });
rc.addEventListener('pointerdown', e => { const b = rc.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top; let best = null, bd = 26; for (const t of G.tracks) { const d = Math.hypot(t.sx - x, t.sy - y); if (d < bd) { bd = d; best = t; } } if (best) select(best, e.shiftKey || e.ctrlKey || e.metaKey); });

// ---------- اللوحة
function uiAll() {
  const t = G.sel && G.sel.alive ? G.sel : (G.sel = null), integ = integrity();
  $('hp').style.transform = `scaleX(${integ / 100})`; $('hpn').textContent = integ; $('hp').style.background = integ > 60 ? 'var(--ok)' : integ > 40 ? 'var(--unk)' : 'var(--bad)';
  $('sc').textContent = G.score ?? 0; $('left').textContent = (G.queue ? G.queue.length : 0) + G.tracks.filter(x => !x.K.friend).length;
  const vis = G.tracks.filter(detected);
  $('tl').innerHTML = vis.map(x => `<button data-id="${x.id}" class="tr ${x.cls}${G.selSet.has(x) ? ' on' : ''}"><b>${x.id}</b><span>${CLS[x.cls]}${x.iff === 'busy' ? ' …' : ''}</span><i>${x.known ? x.K.name : '—'}${x.engaged ? ' · ×' + x.engaged : ''}</i><em>${(range(x) / 1000).toFixed(1)} كم</em></button>`).join('') || '<p class="mut">لا أهداف على الرادار</p>';
  const d = $('det'), many = G.selSet.size > 1;
  if (!t) d.innerHTML = '<p class="mut">حدّد هدفاً من الرادار أو القائمة. Shift لإضافة أهداف، A لكل المعادية.</p>';
  else {
    const r = range(t), hr = Math.hypot(t.pos.x, t.pos.z), toB = -(t.pos.x * t.dir.x + t.pos.z * t.dir.z) / Math.max(1, hr) / Math.max(0.05, Math.hypot(t.dir.x, t.dir.z));
    const st = t.iff === 'busy' ? 'جارٍ الاستجواب…' : t.iff === 'done' ? 'تم التعريف' : 'لم يُستجوب';
    const tgtTxt = t.cls === 'hostile' && t.aimA ? `<div class="aimt">يستهدف: <b>${t.aimA.name}</b> · الوصول ${Math.ceil(t.pos.distanceTo(t.aim) / t.v)} ث</div>` : '';
    d.innerHTML = `<div class="dh ${t.cls}"><b>${t.id}</b><span>${CLS[t.cls]}</span><i>${t.known ? t.K.name : 'نوع غير معروف'}</i>${many ? `<em>+${G.selSet.size - 1} محدد</em>` : ''}</div>
      <div class="dg"><div><small>المدى</small><b>${(r / 1000).toFixed(1)} كم</b></div><div><small>الارتفاع</small><b>${t.pos.y > 2000 ? (t.pos.y / 1000).toFixed(1) + ' كم' : Math.round(t.pos.y) + ' م'}</b></div><div><small>السرعة</small><b>${Math.round(t.v * 3.6)} كم/س</b></div><div><small>يتجه للقاعدة</small><b>${toB > 0.96 ? 'نعم' : toB > 0.7 ? 'تقريباً' : 'لا'}</b></div></div>
      ${tgtTxt}<div class="iff"><span>IFF: ${st}</span><button id="bh">معادٍ <kbd>H</kbd></button><button id="bf">صديق <kbd>F</kbd></button></div>`;
    $('bh').onclick = () => classify(t, 'hostile', false); $('bf').onclick = () => classify(t, 'friend', false);
  }
  SYSK.forEach(k => { const S = SYS[k], b = $('sy-' + k), st = sysState(k), w = why(k, t), ok = w === 'ok';
    b.className = 'sy' + (ok ? ' ok' : '') + (!st.on ? ' dead' : '');
    b.querySelector('em').textContent = !st.on ? '✕' : S.type ? (st.ready ? 'جاهز' : 'تجهيز') : (st.ammo > 0 ? st.ammo : (st.reloading ? 'تلقيم ' + Math.ceil(st.rlT) : 0));
    b.querySelector('u').textContent = ok ? 'ضمن القدرة' : (w || ''); });
  $('assets').innerHTML = SYSK.map(k => { const S = SYS[k], st = sysState(k);
      if (S.type) return `<div class="as${st.on ? '' : ' off'}"><b>${S.name}</b><span>${st.n}/${st.tot} سليم</span>${st.ready ? '' : '<span class="y">تجهيز</span>'}</div>`;
      return `<div class="as${st.on ? '' : ' off'}"><b>${S.name}</b>${S.radar.fake ? '' : `<span class="${S.radar.alive ? 'g' : 'r'}">رادار ${S.radar.alive ? '✓' : '✕'}</span>`}<span>منصات ${st.n}/${st.tot}</span><span>جاهز ${st.ammo}</span><span>احتياط ${st.reserve}</span>${st.reloading ? `<span class="y">تلقيم ${st.reloading} · ${Math.ceil(st.rlT)} ث</span>` : ''}</div>`; }).join('')
    + G.assets.filter(a => a.kind === 'ew' || a.kind === 'infra').filter(a => !a.alive).map(a => `<div class="as off"><b>${a.name}</b><span class="r">مدمّر</span></div>`).join('');
}
$('tl').addEventListener('pointerdown', e => { const b = e.target.closest('[data-id]'); if (b) select(G.tracks.find(t => t.id === b.dataset.id), e.shiftKey || e.ctrlKey || e.metaKey); });
$('marks').addEventListener('pointerdown', e => { const b = e.target.closest('[data-id]'); if (b) { e.stopPropagation(); select(G.tracks.find(t => t.id === b.dataset.id), e.shiftKey || e.ctrlKey || e.metaKey); } });
function buildSysButtons() {
  $('systems').innerHTML = SYSK.map((k, i) => `<button class="sy" id="sy-${k}" data-k="${k}"><kbd>${i + 1}</kbd><b>${SYS[k].name}</b><i>${SYS[k].note}</i><u></u><em></em></button>`).join('');
  $('systems').querySelectorAll('.sy').forEach(b => { b.onclick = () => { audioInit(); engage(b.dataset.k); }; b.onpointerenter = () => G.hoverSys = b.dataset.k; b.onpointerleave = () => G.hoverSys = null; });
}

// ---------- الإدخال
let drag = null; const pts = new Map(); let pinch0 = 0, dist0 = 0;
canvas.addEventListener('pointerdown', e => { pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); dist0 = G.cam.dist; drag = null; } });
addEventListener('pointermove', e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2 && pinch0) { const [a, b] = [...pts.values()]; G.cam.dist = M.clamp(dist0 * pinch0 / Math.max(20, Math.hypot(a[0] - b[0], a[1] - b[1])), 160, 2200); } });
addEventListener('pointerup', e => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; }); addEventListener('pointercancel', e => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; });
canvas.addEventListener('pointerdown', e => { audioInit(); if (pts.size > 1) return; drag = { x: e.clientX, y: e.clientY, yaw: G.cam.yaw, el: G.cam.el, gy: G.cam.gy, gp: G.cam.gp }; });
addEventListener('pointermove', e => { if (drag && !pinch0 && G.cam.mode === 'ground') { G.lastDrag = performance.now(); G.cam.gy = drag.gy - (e.clientX - drag.x) * 0.004; G.cam.gp = M.clamp(drag.gp + (e.clientY - drag.y) * 0.003, -0.5, 0.9); return; } if (!drag || pinch0 || G.cam.mode !== 'base') return; G.cam.yaw = drag.yaw - (e.clientX - drag.x) * 0.005; G.cam.el = M.clamp(drag.el + (e.clientY - drag.y) * 0.004, 0.35, 1.45); });
addEventListener('pointerup', () => drag = null);
canvas.addEventListener('wheel', e => { e.preventDefault(); G.cam.dist = M.clamp(G.cam.dist * (e.deltaY > 0 ? 1.12 : 0.89), 160, 2200); }, { passive: false });
addEventListener('keydown', e => {
  if (e.repeat || G.state !== 'play') return; const t = G.sel, n = '12345'.indexOf(e.key);
  if (n >= 0) engage(SYSK[n]); else if (e.code === 'KeyD') toggleDbl(); else if (e.code === 'KeyA') selectAllHostile(); else if (e.code === 'KeyH' && t) classify(t, 'hostile', false); else if (e.code === 'KeyF' && t) classify(t, 'friend', false);
  else if (e.code === 'Tab') { e.preventDefault(); const l = G.tracks.filter(detected); if (l.length) select(l[(l.indexOf(t) + 1) % l.length], e.shiftKey); } else if (e.code === 'Escape' || e.code === 'KeyB') toBase(); else if (e.code === 'KeyV') { const s = G.shots.filter(x => x.chip); if (s.length) followShot(s[(s.indexOf(G.follow) + 1) % s.length]); }
});
$('backb').onclick = toBase;
$('camb').onclick = e => { e.stopPropagation(); const o = $('campnl').classList.toggle('hid'); $('camb').classList.toggle('on', !o); $('campnl').classList.toggle('gv', G.cam.mode === 'ground'); viewUI(); };
$('camx').onclick = () => { show('campnl', false); $('camb').classList.remove('on'); };
document.querySelectorAll('#campnl [data-v]').forEach(b => b.onclick = () => { setView(b.dataset.v); if (G.state === 'play' && G.mode === 'bat') toBase(); });
$('cup').onclick = () => { GROUND.y = M.clamp(GROUND.y < 10 ? GROUND.y + 4 : GROUND.y * 1.5, 2, 420); G.view = 'custom'; viewUI(); };
$('cdn').onclick = () => { GROUND.y = M.clamp(GROUND.y <= 12 ? GROUND.y - 4 : GROUND.y / 1.5, 2, 420); G.view = 'custom'; viewUI(); };
$('cfw').onclick = () => { GROUND.z = M.clamp(GROUND.z - 60, 120, 700); G.view = 'custom'; viewUI(); };
$('cbk').onclick = () => { GROUND.z = M.clamp(GROUND.z + 60, 120, 700); G.view = 'custom'; viewUI(); };
$('zin').onclick = () => { if (G.cam.mode === 'ground') G.cam.gfov = M.clamp(G.cam.gfov * 0.8, 18, 75); else G.cam.dist = M.clamp(G.cam.dist * 0.78, 120, 2200); }; $('zout').onclick = () => { if (G.cam.mode === 'ground') G.cam.gfov = M.clamp(G.cam.gfov * 1.25, 18, 75); else G.cam.dist = M.clamp(G.cam.dist * 1.28, 120, 2200); };
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => { $('side').dataset.tab = b.dataset.t; document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b)); });
$('helpb').onclick = () => show('help', true); $('helpx').onclick = () => show('help', false);
$('mmulti').onclick = () => { G.multi = !G.multi; $('mmulti').classList.toggle('on', G.multi); };
$('mall').onclick = () => { if (G.state === 'play') { selectAllHostile(); G.multi = true; $('mmulti').classList.add('on'); } };
G.dbl = store.get('dbl', '0') === '1'; const dblUI = () => { $('dbl').classList.toggle('on', G.dbl); $('dbl').innerHTML = `دفعة مزدوجة: ${G.dbl ? 'تعمل' : 'متوقفة'} <kbd>D</kbd>`; };
function toggleDbl() { G.dbl = !G.dbl; store.set('dbl', G.dbl ? '1' : '0'); dblUI(); } $('dbl').onclick = toggleDbl; dblUI();
$('aiff').onclick = () => { G.autoIFF = !G.autoIFF; store.set('aiff', G.autoIFF ? '1' : '0'); aiffUI(); if (G.autoIFF) G.tracks.forEach(startIFF); };
const aiffUI = () => { $('aiff').classList.toggle('on', G.autoIFF); $('aiff').textContent = 'IFF لكل هدف: ' + (G.autoIFF ? 'يعمل' : 'متوقف'); }; aiffUI();
$('nvb').onclick = () => { F.post.nv = !F.post.nv; $('nvb').classList.toggle('on', F.post.nv); };
const sndUI = () => $('snd').textContent = A.on ? 'الصوت: يعمل' : 'الصوت: صامت'; sndUI();
$('snd').onclick = () => { A.on = !A.on; store.set('snd', A.on ? '1' : '0'); audioInit(); if (A.master) A.master.gain.value = A.on ? 0.5 : 0; sndUI(); };
const seg = (id, items, cur, cb) => { const el = $(id); el.innerHTML = ''; Object.entries(items).forEach(([k, v]) => { const b = document.createElement('button'); b.textContent = v; b.className = k === cur ? 'on' : ''; b.onclick = () => { [...el.children].forEach(c => c.classList.remove('on')); b.classList.add('on'); cb(k); }; el.appendChild(b); }); };
G.todPick = 'auto'; seg('s-tod', { auto: 'حسب المهمة', day: 'نهار', sunset: 'غروب', night: 'ليل' }, 'auto', k => { G.todPick = k; W.setTime(k === 'auto' ? 'day' : k); shadowOnce(); });
seg('s-q', { auto: 'تلقائي', low: 'منخفضة', med: 'متوسطة', high: 'عالية' }, qPref, k => setQuality(k));
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => openLoadout(+b.dataset.go));
$('rr').onclick = () => G.pvp ? (NET.host && NET.peer ? $('pvpstart').onclick() : null) : G.mode === 'bat' ? startBattle() : G.mode === 'atk' ? startAtk(G.ai) : start(G.mi); $('rn').onclick = () => G.mode === 'bat' ? openUpgrade() : G.mode === 'atk' ? startAtk(G.ai + 1) : openLoadout(G.mi + 1);
const menu = () => { if (G.pvp) netLeave(); show('rr', true); clear(); leaveAtk(); restoreAll(); G.state = 'menu'; toBase(); show('result', false); show('menu', true); uiAll(); }; $('rm').onclick = menu; $('menub').onclick = menu;


// ---------- شاشة اختيار المنظومات
G.loadout = (store.get('lo', '') || 'thd,pat,kms,shn,skg').split(',').filter(k => DB[k]).slice(0, MAXSYS);
try { G.place = JSON.parse(store.get('pl', '{}')) || {}; } catch (e) { G.place = {}; }
G.preset = store.get('ps', 'sa'); if (!PRESETS[G.preset]) G.preset = 'sa';
function openLoadout(mi) { G.nextMi = mi; show('menu', false); show('result', false); show('loadout', true); renderLoadout(); }
function renderLoadout() {
  $('presets').innerHTML = Object.entries(PRESETS).map(([k, p]) => `<button data-p="${k}" class="${k === G.preset ? 'on' : ''}">${p.n}</button>`).join('');
  $('presets').querySelectorAll('button').forEach(b => b.onclick = () => { G.preset = b.dataset.p; store.set('ps', G.preset); const l = PRESETS[G.preset].l; if (G.preset !== 'all') G.loadout = l.slice(0, MAXSYS); renderLoadout(); });
  const pool = PRESETS[G.preset].l;
  $('lgrid').innerHTML = Object.keys(TIER).map(tier => { const ks = pool.filter(k => DB[k].tier === tier); if (!ks.length) return '';
    return `<h5>${TIER[tier].t}</h5><div class="lrow">` + ks.map(k => { const S = DB[k], on = G.loadout.includes(k);
      return `<button class="lc${on ? ' on' : ''}" data-k="${k}"><b>${S.name}</b><i>${S.org}</i>${S.sa ? `<em class="sa">السعودية · ${S.sa}</em>` : ''}<small>${S.type ? 'مدى ' + (S.max / 1000) + ' كم' : (S.min / 1000) + '–' + (S.max / 1000) + ' كم'}${S.minAlt >= 3000 ? ' · فوق ' + (S.minAlt / 1000) + ' كم' : ''}</small><s>${bestVs(S)}</s></button>`; }).join('') + '</div>'; }).join('');
  $('lgrid').querySelectorAll('.lc').forEach(b => b.onclick = () => { const k = b.dataset.k, i = G.loadout.indexOf(k);
    if (i >= 0) G.loadout.splice(i, 1); else if (G.loadout.length < MAXSYS) G.loadout.push(k); else { $('lcount').classList.add('bad'); setTimeout(() => $('lcount').classList.remove('bad'), 500); return; } renderLoadout(); });
  $('lcount').textContent = `${G.loadout.length}/${MAXSYS}`; $('lnext').disabled = !G.loadout.length;
}
function bestVs(S) { const n = { b: 'باليستي', c: 'كروز', d: 'مسيّرات' }; return Object.entries(S.pk).filter(([, v]) => v >= 0.75).map(([k]) => n[k]).join('، ') || 'محدود'; }
$('lback').onclick = () => { show('loadout', false); show('menu', true); };
$('lnext').onclick = () => { store.set('lo', G.loadout.join(',')); const ap = autoPlace(G.loadout); G.loadout.forEach(k => { if (!G.place[k]) G.place[k] = ap[k]; }); show('loadout', false); show('deploy', true); G.dSel = G.loadout[0]; renderDeploy(); };

// ---------- شاشة نشر البطاريات
const dm = $('dmap'), dx = dm.getContext('2d'); const DMR = 240;
const BCOL = { upper: '#9fe8ff', mid: '#e9b65c', short: '#63e08a', gun: '#ff9a6b', beam: '#d58cff' };
function renderDeploy() {
  $('dlist').innerHTML = G.loadout.map((k, i) => `<button data-k="${k}" class="${k === G.dSel ? 'on' : ''}"><i style="background:${BCOL[DB[k].tier]}"></i><b>${i + 1}. ${DB[k].name}</b><span>${DB[k].note}</span></button>`).join('');
  $('dlist').querySelectorAll('button').forEach(b => b.onclick = () => { G.dSel = b.dataset.k; renderDeploy(); });
  const S = dm.clientWidth || 460, dpr = Math.min(2, devicePixelRatio || 1); dm.width = dm.height = S * dpr; const g = dx; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const s = S / (DMR * 2), P = (x, z) => [S / 2 + x * s, S / 2 + z * s];
  g.fillStyle = '#b8955f'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.setLineDash([5, 4]); g.strokeRect(S / 2 - 215 * s, S / 2 - 215 * s, 430 * s, 430 * s); g.setLineDash([]);
  g.strokeStyle = '#3a3a3a'; g.lineWidth = 11 * s; [[[-240, 60], [240, 60]], [[-30, -200], [-30, 180]], [[95, -150], [95, 90]]].forEach(([a, b]) => { g.beginPath(); g.moveTo(...P(...a)); g.lineTo(...P(...b)); g.stroke(); });
  g.lineWidth = 1; g.font = '10px system-ui'; g.textAlign = 'center';
  G.assets.filter(a => !a.bat).forEach(a => { const [x, y] = P(a.x, a.z); g.fillStyle = 'rgba(70,70,70,.55)'; g.beginPath(); g.arc(x, y, a.r * s * 1.25, 0, 7); g.fill(); g.fillStyle = '#1b1b1b'; g.fillText(a.name.replace('حظيرة الطائرات', 'حظيرة'), x, y + a.r * s * 1.25 + 11); });
  G.loadout.forEach((k, i) => { const [px, pz] = G.place[k], [x, y] = P(px, pz), on = k === G.dSel, rr = (DB[k].type ? 20 : 34) * s;
    g.fillStyle = BCOL[DB[k].tier] + (on ? 'cc' : '88'); g.strokeStyle = on ? '#fff' : 'rgba(0,0,0,.5)'; g.lineWidth = on ? 2.5 : 1; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#0b0e11'; g.font = '700 12px system-ui'; g.fillText(String(i + 1), x, y + 4); g.font = '700 11px system-ui'; g.fillStyle = '#111'; g.fillText(DB[k].name, x, y - rr - 4); });
  g.fillStyle = 'rgba(0,0,0,.6)'; g.font = '700 12px system-ui'; g.fillText('↑ الشمال: جهة التهديد الغالبة', S / 2, 16);
}
dm.addEventListener('pointerdown', e => { if (!G.dSel) return; const b = dm.getBoundingClientRect(), S = b.width, s = S / (DMR * 2);
  const x = M.clamp((e.clientX - b.left - S / 2) / s, -205, 205), z = M.clamp((e.clientY - b.top - S / 2) / s, -205, 205); G.place[G.dSel] = [Math.round(x), Math.round(z)];
  const i = G.loadout.indexOf(G.dSel); G.dSel = G.loadout[(i + 1) % G.loadout.length]; renderDeploy(); });
$('dauto').onclick = () => { Object.assign(G.place, autoPlace(G.loadout)); renderDeploy(); };
$('dback').onclick = () => { show('deploy', false); show('loadout', true); renderLoadout(); };
$('dgo').onclick = () => { store.set('pl', JSON.stringify(G.place)); show('deploy', false); start(G.nextMi ?? 0); };
// حجم الرادار
$('rsz').onclick = () => { $('rbox').classList.toggle('big'); radarResize(); };

// ---------- الوضع الهجومي: خطّط الضربة على قاعدة خصم يدافع آلياً
const EC = new V3(ENEMY.x, 0, ENEMY.z);
const ATK = [
  { name: 'ضربة تمهيدية', time: 'day', nSys: 3, delay: 6, ch: 1, gap: 3, tries: 1, pkf: 0.5, reloads: 0, inv: { b: 6, c: 10, d: 16 }, goals: ['مركز القيادة'] },
  { name: 'قاعدة محصّنة', time: 'sunset', nSys: 4, delay: 4, ch: 1, gap: 2, tries: 1, pkf: 0.62, reloads: 1, inv: { b: 8, c: 12, d: 20 }, goals: ['مركز القيادة', 'رادار الإنذار المبكر'] },
  { name: 'القلعة', time: 'night', nSys: 5, delay: 2.5, ch: 2, gap: 1.4, tries: 2, pkf: 0.72, reloads: 1, inv: { b: 10, c: 14, d: 24 }, goals: ['مركز القيادة', 'رادار الإنذار المبكر', 'خزانات الوقود'] },
];
const POW = { b: 2, c: 1, d: 0.5 }, FT = { b: 25.4, c: 37.5, d: 64.6 }, WK = ['b', 'c', 'd'];
const WNOTE = { b: 'قوة 2 · سريع من الأعلى', c: 'قوة 1 · منخفض دقيق', d: 'قوة 0.5 · بطيئة للإشغال' };
const TIMING = { tot: 'وصول متزامن', dfirst: 'المسيّرات أولاً', now: 'إطلاق فوري' };
Object.assign(G, { jets: [], eA: [], eSys: {}, mun: [], eshots: [], lq: [], plan: new Map(), inv: { b: 0, c: 0, d: 0 }, timing: 'tot', speed: 1, ePreset: store.get('eps', 'ru'), ws: { n: 0, hit: 0, shot: 0 } });
if (!PRESETS[G.ePreset] || G.ePreset === 'all') G.ePreset = 'ru';
let eBuilt = false, eBat = []; const HINT0 = $('hint').innerHTML;
function buildEnemyInfra() {
  if (eBuilt) return; eBuilt = true; Object.values(W.enemy.sys).forEach(o => o.visible = false);
  const kids = W.enemy.group.children.filter(c => !(c.geometry && c.geometry.type === 'PlaneGeometry') && !c.isInstancedMesh && c.visible);
  const near = (x, z, r) => kids.filter(c => Math.hypot(c.position.x - x, c.position.z - z) < r);
  [['مركز القيادة', 0, 0, 19, 20, 3], ['حظيرة الطائرات 1', -120, -50, 18, 6, 2], ['حظيرة الطائرات 2', -120, -14, 18, 6, 2], ['حظيرة الطائرات 3', -84, 26, 18, 6, 2], ['رادار الإنذار المبكر', -58, -96, 9, 10, 1], ['برج المراقبة', -52, 34, 6, 4, 1], ['خزانات الوقود', 91, -63, 14, 6, 1], ['مبنى الإمداد', 60, 96, 15, 5, 1]]
    .forEach(([name, x, z, r, val, hp]) => asset({ name, objs: near(x, z, r), x: EC.x + x, z: EC.z + z, r: r * 0.8, val, hp, hp0: hp, kind: 'infra', supply: name === 'مبنى الإمداد' || name === 'خزانات الوقود', flat: name.startsWith('حظيرة') }, G.eA));
  [['منصة باليستي 1', 'b', -170, 150, 'erector'], ['منصة باليستي 2', 'b', -120, 172, 'erector'], ['منصة كروز 1', 'c', 150, 168, 'quad'], ['منصة كروز 2', 'c', 192, 138, 'quad'], ['منصة مسيّرات 1', 'd', -45, 180, 'cargo'], ['منصة مسيّرات 2', 'd', 0, 192, 'cargo']]
    .forEach(([name, sub, x, z, kind]) => { const o = W.truck(W.mats.olive, kind); o.position.set(EC.x + x, 0, EC.z + z); o.rotation.y = Math.PI; if (kind === 'quad' && o.userData.pack) o.userData.pack.rotation.x = -0.5; compactGroup(o); scene.add(o);
      asset({ name, obj: o, x: EC.x + x, z: EC.z + z, r: 7, val: 6, hp: 1, hp0: 1, kind: 'eoff', sub }, G.eA); });
}
const supMul = () => { const n = G.eA.filter(a => a.supply && a.alive).length; return n >= 2 ? 1 : n === 1 ? 1.7 : 2.6; };
function buildEnemyBatteries(L) {
  eBat.forEach(o => scene.remove(o)); eBat = []; G.eA = G.eA.filter(a => !a.bat); G.eSys = {};
  const pick = (L.pick || []).filter(k => DB[k]).slice(0, 5), order = ['mid', 'short', 'gun', 'upper', 'short', 'beam', 'mid', 'gun', 'short'];
  if (!pick.length) for (const pool of [PRESETS[G.ePreset].l, Object.keys(DB)]) for (const t of order) { if (pick.length >= L.nSys) break; const k = pool.find(k => DB[k].tier === t && !pick.includes(k)); if (k) pick.push(k); }
  const pl = autoPlace(pick);
  pick.forEach(k => { const S = G.eSys[k] = makeBattery(k, EC.x + pl[k][0], EC.z + pl[k][1], W.mats.olive, G.eA, eBat, L.reloads); S.key = k; });
}
function clearAtk() {
  (G.jets || []).forEach(j => { scene.remove(j.obj); if (j.sam) scene.remove(j.sam.obj); }); G.jets = [];
  (G.mun || []).forEach(m => scene.remove(m.obj)); (G.eshots || []).forEach(s => s.obj && scene.remove(s.obj)); (G.eA || []).forEach(a => { if (a.mk) { a.mk.remove(); a.mk = null; } });
  G.mun = []; G.eshots = []; G.lq = []; if (G.plan) G.plan.clear(); G.aSel = null;
}
function leaveAtk() {
  if (G.mode !== 'atk' && G.mode !== 'bat') return; clearAtk(); G.mode = 'def'; show('mapbox', false); show('homep', false); show('foep', false); $('app').classList.remove('batm'); G.foeView = false; $('marks').classList.remove('foe'); show('mtools', true); G.topView = false; removeBoss(); G.speed = 1; W.enemy.group.visible = false; eBat.forEach(o => scene.remove(o)); eBat = []; G.eA = G.eA.filter(a => !a.bat); G.eSys = {};
  shC.set(30, 0, -10); G.cam.center.set(55, 0, -15); G.cam.dist = 420; G.cam.lastF = null; G.cam.focus = null; G.cam.fw = 0;
  $('side').classList.remove('atk'); show('rbox', true); $('hpw').querySelector('small').textContent = 'سلامة القاعدة'; $('left').previousElementSibling.textContent = 'أهداف متبقية'; $('hint').innerHTML = HINT0; $('hp').style.background = 'var(--ok)'; batObjs.forEach(o => o.visible = true);
}
function startAtk(ai) {
  audioInit(); clear(); leaveAtk(); buildEnemyInfra(); const L = G.AL = ATK[ai]; G.ai = ai; G.mode = 'atk';
  restoreAll(G.eA); buildEnemyBatteries(L); W.enemy.group.visible = true; batObjs.forEach(o => o.visible = false);
  W.setTime(G.todPick && G.todPick !== 'auto' ? G.todPick : L.time); shC.set(EC.x + 20, 0, EC.z - 10); shadowOnce();
  F.post.nv = false; show('nvb', !!W.preset.night); $('nvb').classList.remove('on');
  Object.assign(G, { state: 'aplan', at: 0, score: 0, wave: 0, endT: 0, inv: { ...L.inv }, follow: null, speed: 1 }); G.ws = { n: 0, hit: 0, shot: 0 };
  G.cam.center.set(EC.x + 20, 0, EC.z - 10); G.cam.dist = 560; G.cam.el = 0.95; G.cam.yaw = 0.2; G.cam.lastF = null; G.cam.focus = null; G.cam.fw = 0; toBase();
  G.eA.forEach((a, i) => { const mk = a.mk = document.createElement('div'); mk.className = 'mk tg' + (L.goals.includes(a.name) ? ' goal' : '') + (a.kind === 'radar' ? ' rad' : ''); mk.dataset.a = i; mk.innerHTML = `<b>${a.name}</b>`; $('marks').appendChild(mk); });
  G.aSel = G.eA.find(a => a.name === L.goals[0]);
  $('side').classList.add('atk'); show('rbox', false); show('menu', false); show('result', false); $('mname').textContent = 'هجوم · ' + L.name; $('hpw').querySelector('small').textContent = 'قاعدة الخصم'; $('left').previousElementSibling.textContent = 'ذخائر متبقية'; $('hint').innerHTML = 'اسحب لتدوير المنظر · العجلة للتقريب · اضغط علامة الهدف لتحديده · <kbd>Shift</kbd> مع + يضيف 5 · <kbd>Enter</kbd> إطلاق · <kbd>B</kbd> القاعدة';
  log('الاستطلاع جاهز: ' + Object.values(G.eSys).map(S => S.name).join('، ')); banner('خطّط الضربة', 'اختر هدفاً ووزّع عليه الذخائر ثم أطلق', '', 3.2); uiAtk();
}
const avail = (k) => G.inv[k] - [...G.plan.values()].reduce((s, p) => s + p[k], 0);
const planN = () => [...G.plan.values()].reduce((s, p) => s + p.b + p.c + p.d, 0);
function planAdd(a, k, n) { if (!a || !a.alive || G.state !== 'aplan') return; const p = G.plan.get(a) || { b: 0, c: 0, d: 0 }; n = Math.max(-p[k], Math.min(n, avail(k))); p[k] += n; if (p.b + p.c + p.d) G.plan.set(a, p); else G.plan.delete(a); }
function launchStrike() {
  if (G.state !== 'aplan' || !planN()) return; const items = [], used = new Set();
  G.plan.forEach((p, a) => WK.forEach(k => { for (let i = 0; i < p[k]; i++) { items.push({ k, a }); used.add(k); G.inv[k]--; } }));
  const T = Math.max(...[...used].map(k => FT[k])), brg0 = (Math.random() - 0.5) * 0.5;
  items.forEach((q, i) => { q.brg = brg0 + (Math.random() - 0.5) * 0.9; q.at = (G.timing === 'now' ? 0 : T - FT[q.k] + (G.timing === 'dfirst' && q.k !== 'd' && used.has('d') ? 12 : 0)) + Math.random() * 2.5; });
  G.lq = items.sort((a, b) => a.at - b.at); G.plan.clear(); G.state = 'astrike'; G.at = 0; G.endT = 0; G.wave++; G.ws = { n: 0, hit: 0, shot: 0 };
  banner('انطلقت الضربة', `${items.length} ذخيرة · ${TIMING[G.timing]}`, 'ok', 2.6); rocketSnd(1); log(`الموجة ${G.wave}: ${items.length} ذخيرة`); uiAtk();
}
const LPADS = [[-40, 70], [0, 62], [45, 70], [90, 66], [-75, 80], [130, 78]];
function spawnMun(q) {
  const K = KIND[q.k], a = q.a, cep = q.k === 'b' ? 22 : q.k === 'c' ? 8 : 4, sa = Math.sin(q.brg), ca = Math.cos(q.brg);
  const m = { k: q.k, K, t: 0, alive: true, dir: new V3(), vel: new V3(), v: K.v, trail: {}, eng: 0, el: {}, aimA: a };
  m.aim = new V3(a.x + (Math.random() - 0.5) * 2 * cep, 0, a.z + (Math.random() - 0.5) * 2 * cep); m.tgt = { alive: true, pos: m.aim };
  if (q.k === 'd') { m.obj = droneModel(); scene.add(m.obj); m.pos = m.obj.position; }
  else { const r = makeMissile(K, 0xb9a878); Object.assign(m, { obj: r.obj, flame: r.flame, pos: r.pos, rocket: true }); }
  if (q.home) {
    const L = LPADS[(Math.random() * LPADS.length) | 0]; m.pos.set(L[0] + (Math.random() - 0.5) * 8, q.k === 'd' ? 3 : 5, L[1] + (Math.random() - 0.5) * 8);
    F.explode(tC.copy(m.pos).setY(1), q.k === 'b' ? 0.3 : 0.16, { debris: 0 }); F.padBlast(tC, 0.5, 1);
    if (q.k === 'b') { const T = 24 + Math.random() * 3; m.arc = true; m.g = 30; m.vel.set((m.aim.x - m.pos.x) / T, m.g * T / 2, (m.aim.z - m.pos.z) / T); m.v = m.vel.length(); m.dir.copy(m.vel).normalize(); }
    else { m.v = K.v * (q.k === 'd' ? 3 : 1.35); tA.set(m.aim.x - m.pos.x, 0, m.aim.z - m.pos.z).normalize(); m.dir.set(tA.x * 0.75, 0.66, tA.z * 0.75).normalize(); }
    orient(m); G.mun.push(m); G.ws.n++; if (G.pvp) netFire(m, a);
    if ($('chips').children.length < 14) { const chip = m.chip = document.createElement('button'); chip.className = 'chip new'; setTimeout(() => chip.classList.remove('new'), 900); chip.innerHTML = `<b>${K.name}</b><i>${a.name}</i>`; chip.onclick = () => followShot(m); $('chips').appendChild(chip); }
    return;
  }
  if (q.k === 'd') m.pos.set(EC.x + sa * 4200, 170 + Math.random() * 60, EC.z + ca * 4200);
  else if (q.k === 'b') m.pos.set(m.aim.x + sa * 15000, 20500, m.aim.z + ca * 15000);
  else { m.pos.set(EC.x + sa * 9000, 0, EC.z + ca * 9000); m.pos.y = Math.max(0, heightAt(m.pos.x, m.pos.z)) + K.low; }
  m.dir.subVectors(q.k === 'b' ? m.aim : tA.set(m.aim.x, m.pos.y, m.aim.z), m.pos).normalize(); orient(m); G.mun.push(m); G.ws.n++;
  if ($('chips').children.length < 14) { const chip = m.chip = document.createElement('button'); chip.className = 'chip'; chip.innerHTML = `<b>${K.name}</b><i>${a.name}</i>`; chip.onclick = () => followShot(m); $('chips').appendChild(chip); }
}
function eState(S) {
  if (S.type) { const m = S.mounts.filter(a => a.alive); return { on: m.length > 0, n: m.length, tot: S.mounts.length }; }
  const Ls = S.launchers.filter(a => a.alive); return { on: S.radar.alive && Ls.length > 0, radar: S.radar.alive, n: Ls.length, tot: S.launchers.length, ammo: Ls.reduce((s, a) => s + a.ammo, 0) };
}
function enemyAI(dt) { // دفاع غير احترافي: تأخر في الرد، قنوات اشتباك محدودة، ذخيرة تنفد
  const L = G.AL;
  for (const k in G.eSys) {
    const S = G.eSys[k], st = eState(S);
    (S.type ? S.mounts : S.launchers).forEach(a => { if (a.cd > 0) a.cd -= dt; if (a.kind === 'launcher' && a.alive && a.ammo === 0) { if (a.rt > 0) { if ((a.rt -= dt) <= 0) { a.rt = 0; a.ammo = S.per; } } else if (a.reloads > 0) { a.reloads--; a.rt = S.rl * supMul(); } } });
    if (!st.on || G.at < (S.nextT || 0) || G.eshots.filter(s => s.S === S).length >= L.ch) continue;
    let best = null, be = 1e9;
    for (const m of G.mun) {
      if (!m.alive || (S.pk[m.k] || 0) < 0.05 || m.eng >= 1 || (m.tries || 0) >= L.tries) continue;
      const r = Math.hypot(m.pos.x - S.cx, m.pos.y, m.pos.z - S.cz); if (r > S.max || r < S.min || m.pos.y < (S.minAlt || 0) || m.pos.y > (S.maxAlt ?? 1e9)) continue;
      if (m.el[k] === undefined) m.el[k] = G.at; if (G.at - m.el[k] < L.delay) continue;
      const eta = m.pos.distanceTo(m.aim) / m.v; if (eta < be) { be = eta; best = m; }
    }
    if (!best) continue; S.nextT = G.at + L.gap; best.tries = (best.tries || 0) + 1;
    if (S.type) { const mt = S.mounts.find(a => a.alive && a.cd <= 0); if (!mt) continue; mt.cd = S.cd; best.eng++; G.eshots.push({ type: S.type, S, tgt: best, t: 0, dur: S.type === 'gun' ? 2.2 : 1.8, from: new V3(mt.x, S.type === 'gun' ? 2.6 : 4, mt.z), acc: 0, alive: true }); }
    else { const La = S.launchers.filter(a => a.alive && a.ammo > 0).sort((a, b) => b.ammo - a.ammo)[0]; if (!La) continue; La.ammo--; best.eng++;
      const s = makeMissile(S, 0x6f7460); s.pos.set(La.x, 6, La.z); tB.set(best.pos.x - La.x, 0, best.pos.z - La.z).normalize(); s.dir.set(tB.x * 0.35, 0.94, tB.z * 0.35).normalize(); s.v = 80; orient(s); Object.assign(s, { S, tgt: best }); G.eshots.push(s);
      F.explode(tC.set(La.x, 1, La.z), 0.14, { debris: 0 }); }
  }
}
function eResolve(s, m) {
  const hit = Math.random() < (s.S.pk[m.k] || 0) * G.AL.pkf; if (hit && G.mode === 'bat') G.pops.push({ x: m.pos.x, z: m.pos.z, t: 0, s: 'اعتُرض', c: '#9fe8ff' });
  if (hit) { F.explode(m.pos.clone(), m.K.drone ? 0.5 : 0.95, { vel: m.vel, debris: 30 }); boom(0.7, Math.min(1.5, camera.position.distanceTo(m.pos) / 3000)); G.ws.shot++; log(`${s.S.name} اعترض ${m.K.name}`, 'bad'); endShot(m); } else m.eng--;
  return hit;
}
function munImpact(m) {
  if (G.pvp) { const ip = m.pos.clone(); ip.y = 0; F.explode(ip, (m.K.drone ? 0.6 : (m.k === 'b' ? 1.6 : 1.1)) * 1.3, { ground: true, vel: m.vel, debris: 40 }); boomFar(m.k === 'b' ? 1.1 : 0.8, 0.8); G.camShake = Math.max(G.camShake || 0, 0.3); G.ws.hit++; endShot(m); return; }
  const ip = m.pos.clone(); ip.y = 0; F.explode(ip, (m.K.drone ? 0.6 : (m.k === 'b' ? 1.6 : 1.1)) * (G.mode === 'bat' ? 1.3 : 1), { ground: true, vel: m.vel, debris: 40 }); if (G.mode === 'bat') { boomFar(m.k === 'b' ? 1.1 : 0.8, 0.8); G.camShake = Math.max(G.camShake || 0, 0.3); } else boom(1.1, Math.min(1.2, camera.position.distanceTo(ip) / 3000)); G.ws.hit++; let anyHit = false, anyDead = false;
  G.eA.filter(a => a.alive && Math.hypot(a.x - ip.x, a.z - ip.z) < m.K.dmgR + a.r).forEach(a => {
    const pw = POW[m.k] * (G.mode === 'bat' ? G.up.pow : 1); a.hp = Math.round(((a.hp ?? 1) - pw) * 10) / 10; anyHit = true; if (a.boss && a.hp > 0) G.revenge = Math.min(2, (G.revenge || 0) + 1); if (G.mode === 'bat' && a.hp > 0) scorch(a); if (a.hp <= 0) anyDead = true; if (G.mode === 'bat') G.pops.push({ x: a.x, z: a.z, t: 0, s: a.hp <= 0 ? 'دُمّر' : '−' + pw, c: a.hp <= 0 ? '#ffd166' : '#ff5b45' });
    if (a.hp <= 0) { a.alive = false; wreck(a); if (G.mode === 'bat') { if (a.kind === 'eoff') banner('دمّرت ' + a.name, 'قلّ إطلاق الخصم عليك', 'ok', 2.2); else if (a.supply) banner('ضربت إمداداته', 'إطلاقه وتلقيم دفاعه صار أبطأ', 'ok', 2.4); else if (a.kind === 'radar') banner('عمّيت ' + a.name, 'منظومته الدفاعية تعطّلت', 'ok', 2.2); } G.score += a.val * 10; log(`دُمّر: ${a.name}`, 'ok'); if (a.mk) a.mk.style.display = 'none'; if (G.AL.goals.includes(a.name)) banner('دُمّر الهدف', a.name, 'ok', 2.4); else if (a.kind === 'radar') banner('تعطّلت منظومة', a.name, 'ok', 2); }
    else log(`أُصيب: ${a.name} · بقي ${a.hp}`, 'warn');
  });
  if (!G.cam.focus && G.cam.mode === 'base' && G.mode !== 'bat') { G.cam.focus = ip.clone(); G.cam.focusT = 2.5; }
  if (G.state !== 'cine' && G.AL.goals.every(n => !G.eA.find(x => x.name === n).alive)) { const gl = G.eA.find(x => x.name === G.AL.goals[G.AL.goals.length - 1]); startCine(gl.alive ? ip : tC.set(gl.x, 0, gl.z), () => G.mode === 'atk' ? finishAtk(true) : finishBat(true), 'دُمّر الهدف', 'كل أهداف الخصم المطلوبة سقطت', true); }
  if (G.mode !== 'bat') G.camShake = Math.max(0, 1 - camera.position.distanceTo(ip) / 2500); endShot(m);
  if (G.mode === 'bat') { if (anyHit) hitCall(anyDead); else G.pops.push({ x: ip.x, z: ip.z, t: 0, s: 'خارج الهدف', c: '#cccccc' }); }
}
function updateAtk(dt, rdt) {
  if (G.state === 'astrike' || G.batTick) {
    F.rate = Math.min(F.rate, Q.rate * Math.min(1, 6 / Math.max(1, G.mun.length + G.eshots.length)) * (F.smoke.n > 2000 ? 0.35 : F.smoke.n > 1400 ? 0.7 : 1));
    G.at += dt; while (G.lq.length && G.lq[0].at <= G.at) spawnMun(G.lq.shift());
    for (const m of G.mun) {
      if (!m.alive) continue; m.t += dt; const K = m.K;
      if (m.k !== 'b' && !(m.t < 0.8 && m.k === 'c')) { const hd = Math.hypot(m.aim.x - m.pos.x, m.aim.z - m.pos.z); tA.copy(m.aim); if (hd > (m.k === 'c' ? 700 : 380)) tA.y = Math.max(0, heightAt(m.pos.x + m.dir.x * 300, m.pos.z + m.dir.z * 300)) + K.low; tA.sub(m.pos).normalize(); steerToward(m.dir, tA, (m.k === 'c' ? 0.7 : 0.9) * dt); }
      if (m.arc) { m.vel.y -= m.g * dt; m.v = m.vel.length(); m.dir.copy(m.vel).normalize(); } else m.vel.copy(m.dir).multiplyScalar(m.v); m.pos.addScaledVector(m.vel, dt); orient(m); if (m.flame) m.flame.userData.set(m.k === 'b' ? 0.9 : 0.5, G.time);
      if (K.smoke && nearCam(m.pos, 9000)) F.trail(tail(m, tB), m.dir, m.v, dt, G.mode === 'bat' ? { state: m.trail, rate: K.smoke * 0.8, size: m.k === 'b' ? 1.4 : 0.8, life: 11, alpha: 0.5 } : { state: m.trail, rate: K.smoke, size: m.k === 'b' ? 1.1 : 0.5, life: 4, alpha: 0.4 });
      if (m.pos.y <= Math.max(0, heightAt(m.pos.x, m.pos.z)) + 1) munImpact(m);
    }
    if (!G.pvp) enemyAI(dt);
    for (const s of G.eshots) {
      if (!s.alive) continue; s.t += dt; const t = s.tgt;
      if (s.type) {
        if (!t.alive) { s.alive = false; if (s.type === 'beam') F.beam(tA, tA, 0); continue; }
        if (s.type === 'gun') { s.acc += dt; while (s.acc > 0.05) { s.acc -= 0.05; tA.copy(t.pos).addScaledVector(t.vel, s.from.distanceTo(t.pos) / 1000).add(tC.randomDirection().multiplyScalar(14)).sub(s.from).normalize(); F.tracer(s.from, tA, 1000, 2); } if (Math.random() < dt * 6) F.flak(tC.copy(t.pos).add(tA.randomDirection().multiplyScalar(30))); }
        else F.beam(s.from, t.pos, 0.5 + Math.sin(G.time * 50) * 0.15);
        if (s.t >= s.dur) { s.alive = false; if (s.type === 'beam') F.beam(tA, tA, 0); if (s.from.distanceTo(t.pos) <= s.S.max * 1.15) eResolve(s, t); else t.eng--; }
        continue;
      }
      s.v = Math.min(s.S.v, s.v + s.S.v * 0.7 * dt);
      if (s.missed) { if ((s.missT -= dt) <= 0) { F.explode(s.pos.clone(), 0.35, { debris: 8 }); s.alive = false; scene.remove(s.obj); continue; } }
      else if (!t.alive) { s.missed = true; s.missT = 0.6; }
      else if (s.t > 0.6) { const d = s.pos.distanceTo(t.pos), tt = d / Math.max(300, s.v + t.v * 0.5); tA.copy(t.pos).addScaledVector(t.vel, tt).sub(s.pos).normalize(); steerToward(s.dir, tA, s.S.turn * dt);
        if (d < s.S.fuse || (s.pd !== undefined && s.pd < s.S.fuse * 3 && d > s.pd)) { if (eResolve(s, t)) { s.alive = false; scene.remove(s.obj); continue; } s.missed = true; s.missT = 1; } s.pd = d; }
      s.vel.copy(s.dir).multiplyScalar(s.v); s.pos.addScaledVector(s.vel, dt); orient(s); s.flame.userData.set(0.9, G.time);
      if (nearCam(s.pos, 9000)) F.trail(tail(s, tB), s.dir, s.v, dt, { state: s.trail, rate: s.t < 3 ? 50 : 28, size: 0.7, life: 4 });
      if (s.pos.y < heightAt(s.pos.x, s.pos.z) || s.t > 40) { s.alive = false; scene.remove(s.obj); }
    }
    G.mun = G.mun.filter(m => m.alive); G.eshots = G.eshots.filter(s => s.alive);
    if (!G.batTick) { if (!G.lq.length && !G.mun.length && !G.eshots.length) { if ((G.endT += dt) > 2.5) waveEnd(); } else G.endT = 0; }
  }
  if (G.batTick) return;
  F.update(dt, G.time, heightAt, rdt);
  if (bannerT > 0 && (bannerT -= rdt) <= 0) $('banner').className = '';
}
function waveEnd() {
  const L = G.AL, w = G.ws, done = L.goals.every(n => !G.eA.find(a => a.name === n).alive), left = G.inv.b + G.inv.c + G.inv.d; G.speed = 1; toBase();
  log(`نتيجة الموجة ${G.wave}: أصابت ${w.hit} · اعتُرضت ${w.shot} من ${w.n}`, w.hit ? 'ok' : 'bad');
  if (done) return finishAtk(true); if (!left) return finishAtk(false);
  G.state = 'aplan'; banner(`أصابت ${w.hit} واعتُرضت ${w.shot}`, 'خطّط الموجة التالية', w.hit ? 'ok' : 'warn', 3); uiAtk();
}
function finishAtk(win) {
  G.state = 'result'; const L = G.AL, left = G.inv.b + G.inv.c + G.inv.d, sc = G.score + (win ? left * 15 : 0);
  $('result').className = win ? 'ov win' : 'ov lose'; $('rt').textContent = win ? 'نجحت الضربة' : 'فشلت الضربة'; $('rs').textContent = win ? 'دُمّرت كل الأهداف المطلوبة' : 'نفدت الذخائر قبل تدمير الأهداف';
  $('rd').textContent = `موجات: ${G.wave} · ذخائر متبقية: ${left} · النقاط: ${sc}`; show('rn', win && !!ATK[G.ai + 1]); show('result', true); say(win ? 'نجحت الضربة' : 'فشلت الضربة');
}
function atkMarks() {
  for (const a of G.eA) { if (!a.mk) continue; tA.set(a.x, 5, a.z).project(camera); const on = a.alive && !a.pvpOff && (G.cam.mode === 'base' || G.cam.mode === 'foe') && tA.z < 1 && Math.abs(tA.x) < 1 && Math.abs(tA.y) < 1; a.mk.style.display = on ? '' : 'none';
    if (on) { a.mk.style.transform = `translate(${(tA.x * 0.5 + 0.5) * VW}px,${(-tA.y * 0.5 + 0.5) * VH}px)`; a.mk.classList.toggle('sel', a === G.aSel); a.mk.classList.toggle('pl', G.plan.has(a)); } }
}
function uiAtk() {
  if (G.mode !== 'atk') return; const L = G.AL, plan = G.state === 'aplan', a = G.aSel && G.aSel.alive ? G.aSel : (G.aSel = null);
  const tot = G.eA.reduce((s, x) => s + x.val, 0), integ = Math.round(100 * G.eA.reduce((s, x) => s + (x.alive ? x.val : 0), 0) / tot);
  $('hp').style.transform = `scaleX(${integ / 100})`; $('hpn').textContent = integ; $('hp').style.background = 'var(--bad)'; $('sc').textContent = G.score; $('left').textContent = G.inv.b + G.inv.c + G.inv.d;
  const pstr = (p) => p ? WK.filter(k => p[k]).map(k => `${p[k]} ${KIND[k].name}`).join(' + ') : '';
  let h = `<div class="sec"><h4>المطلوب تدميره</h4><div class="goals">${L.goals.map(n => { const d = !G.eA.find(x => x.name === n).alive; return `<span class="${d ? 'g' : ''}">${d ? '✓' : '○'} ${n}</span>`; }).join('')}</div></div>`;
  if (plan) {
    h += `<div class="sec"><h4>الهدف المحدد</h4>${a ? `<div class="dh hostile"><b>${a.name}</b><i>تحمّل ${a.hp ?? 1} · قيمة ${a.val}</i></div>` : '<p class="mut">اختر هدفاً من المشهد أو القائمة</p>'}
      ${WK.map(k => `<div class="stp"><span><b>${KIND[k].name}</b><small>${WNOTE[k]}</small></span><em>متاح ${avail(k)}</em><button data-pm="${k}:-1">−</button><u>${a && G.plan.get(a) ? G.plan.get(a)[k] : 0}</u><button data-pm="${k}:1">+</button></div>`).join('')}</div>
      <div class="sec"><h4>توقيت الوصول</h4><div class="seg">${Object.entries(TIMING).map(([k, v]) => `<button data-tm="${k}" class="${k === G.timing ? 'on' : ''}">${v}</button>`).join('')}</div>
      <div class="btns"><button data-act="clr">مسح الخطة</button><button data-act="go" class="pri" ${planN() ? '' : 'disabled'}>أطلق الضربة (${planN()})</button></div></div>`;
  } else h += `<div class="sec"><h4 class="hrow">الضربة جارية <button class="pill" data-act="spd">السرعة ×${G.speed}</button></h4><div class="dg"><div><small>لم تُطلق</small><b>${G.lq.length}</b></div><div><small>في الجو</small><b>${G.mun.length}</b></div><div><small>أصابت</small><b>${G.ws.hit}</b></div><div><small>اعتُرضت</small><b>${G.ws.shot}</b></div></div></div>`;
  const rows = G.eA.map((x, i) => [x, i]).filter(([x]) => x.alive).sort(([x], [y]) => (L.goals.includes(y.name) - L.goals.includes(x.name)) || ((y.kind === 'radar') - (x.kind === 'radar')) || (y.val - x.val));
  h += `<div class="sec"><h4>أهداف قاعدة الخصم</h4><div id="atl">${rows.map(([x, i]) => `<button data-a="${i}" class="tr${x === a ? ' on' : ''}${L.goals.includes(x.name) ? ' hostile' : ''}"><span>${x.name}</span><i>${pstr(G.plan.get(x))}</i><em>${x.hp ?? 1}</em></button>`).join('')}</div></div>`;
  h += `<div class="sec"><h4>دفاعات الخصم</h4><div class="aslist">${Object.values(G.eSys).map(S => { const st = eState(S); return `<div class="as${st.on ? '' : ' off'}"><b>${S.name}</b><span>${S.note}</span>${S.type || S.radar.fake ? '' : `<span class="${st.radar ? 'g' : 'r'}">رادار ${st.radar ? '✓' : '✕'}</span>`}<span>${st.n}/${st.tot}</span>${st.ammo !== undefined ? `<span>ذخيرة ${st.ammo}</span>` : ''}</div>`; }).join('')}</div></div>`;
  $('atk').innerHTML = h;
}
$('atk').addEventListener('pointerdown', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return; audioInit(); const d = b.dataset;
  if (d.jet) { launchJet(); return; }
  if (d.fire) { G.holdK = d.fire; G.holdT = 0.45; fireBat(d.fire); return; }
  if (d.a !== undefined) G.aSel = G.eA[+d.a]; else if (d.pm) { const [k, n] = d.pm.split(':'); planAdd(G.aSel, k, (+n) * (e.shiftKey ? 5 : 1)); } else if (d.tm) G.timing = d.tm;
  else if (d.act === 'go') return launchStrike(); else if (d.act === 'clr') G.plan.clear(); else if (d.act === 'spd') G.speed = G.speed === 1 ? 3 : 1; else if (d.act === 'more') G.batMore = !G.batMore; G.mode === 'bat' ? uiBat() : uiAtk();
});
['pointerup', 'pointercancel', 'blur'].forEach(ev => addEventListener(ev, () => { G.holdK = null; }));
$('marks').addEventListener('pointerdown', e => { const b = e.target.closest('[data-a]'); if (b && (G.mode === 'atk' || G.mode === 'bat')) { e.stopPropagation(); G.aSel = G.eA[+b.dataset.a]; G.mode === 'bat' ? uiBat() : uiAtk(); } });
addEventListener('keydown', e => { if (G.mode !== 'atk' || e.repeat) return; if (e.code === 'KeyB' || e.code === 'Escape') toBase(); else if (e.code === 'Enter' && G.state === 'aplan') launchStrike(); });
// قائمة الوضعين
const modeUI = (k) => { G.menuMode = k; show('ms-def', k === 'def'); show('how-def', k === 'def'); show('ms-atk', k === 'atk'); show('how-atk', k === 'atk'); show('ms-bat', k === 'bat'); show('erow', k === 'atk' || k === 'bat'); $('msub').textContent = k === 'def' ? 'قيادة دفاع جوي: راقب الرادار، عرّف الهدف، ثم اشتبك.' : k === 'bat' ? 'معركة حية: دفاعك آلي، وأنت تختار أهداف الخصم وترمي.' : 'قيادة الضربة: ادرس قاعدة الخصم، وزّع ذخائرك، واخترق دفاعاته.'; };
seg('s-mode', { bat: 'معركة', def: 'دفاع', atk: 'هجوم' }, 'bat', modeUI); modeUI('bat');
seg('s-epre', Object.fromEntries(Object.entries(PRESETS).filter(([k]) => k !== 'all').map(([k, p]) => [k, p.n])), G.ePreset, k => { G.ePreset = k; store.set('eps', k); });
document.querySelectorAll('[data-atk]').forEach(b => b.onclick = () => startAtk(+b.dataset.atk));

// ---------- وضع المعركة: قصف متبادل حي، دفاعك آلي، وأنت تضرب أهداف الخصم
const AMMO = { l: { n: 'خفيف', b: 5, c: 8, d: 12 }, m: { n: 'متوسط', b: 10, c: 16, d: 24 }, h: { n: 'ثقيل', b: 15, c: 24, d: 36 }, o: { n: 'مفتوحة' } };
G.ammoLvl = store.get('al', 'm'); if (!AMMO[G.ammoLvl]) G.ammoLvl = 'm';
const HOMEC = new V3(55, 0, -15);
const STAGES = [
  { name: 'الاشتباك الأول', time: 'day', nSys: 3, pkf: 0.35, rate: 1.25, goals: ['مركز القيادة'] },
  { name: 'عين الخصم', time: 'day', nSys: 3, pkf: 0.42, rate: 1.1, goals: ['مركز القيادة', 'رادار الإنذار المبكر'] },
  { name: 'غروب النار', time: 'sunset', nSys: 4, pkf: 0.5, rate: 1, goals: ['مركز القيادة', 'رادار الإنذار المبكر'] },
  { name: 'ليلة القصف', time: 'night', nSys: 4, pkf: 0.55, rate: 0.9, goals: ['مركز القيادة', 'خزانات الوقود', 'رادار الإنذار المبكر'] },
  { name: 'المخبأ', time: 'night', nSys: 5, pkf: 0.58, rate: 0.8, goals: ['المخبأ المحصّن'], boss: true },
];
const UPG = [
  { id: 'rl', n: 'تلقيم أسرع', d: 'منصات دفاعك تُلقَّم أسرع بـ40٪', f: u => u.rl *= 0.6 },
  { id: 'xl', n: 'منصة دفاع إضافية', d: 'منصة إطلاق إضافية لكل منظومة صواريخ', f: u => u.xl++ },
  { id: 'b5', n: '+5 سكووود', d: 'تضاف لذخيرتك في كل معركة', f: u => u.ammo.b += 5 },
  { id: 'c8', n: '+8 كروووز', d: 'تضاف لذخيرتك في كل معركة', f: u => u.ammo.c += 8 },
  { id: 'd12', n: '+12 شاااهد', d: 'تضاف لذخيرتك في كل معركة', f: u => u.ammo.d += 12 },
  { id: 'je', n: '+1 طلعة إيييقل', d: 'طلعة قصف إضافية في كل معركة', f: u => u.ammo.e++ },
  { id: 'pw', n: 'رؤوس حربية أقوى', d: 'كل إصابة تضر أكثر بـ50٪', f: u => u.pow *= 1.5 },
  { id: 'pk', n: 'دفاع أدق', d: 'اعتراض دفاعك الآلي أدق', f: u => u.pk += 0.1 },
  { id: 'wv', n: 'موجة أسرع', d: 'زر موجة الاعتراض يعود أسرع', f: u => u.wave = Math.max(8, u.wave - 6) },
];
const newUp = () => ({ rl: 1, xl: 0, ammo: { b: 0, c: 0, d: 0, e: 0 }, pow: 1, pk: 0, wave: 20, picked: [] });
G.up = newUp(); G.stage = 0;
let bossObj = null;
function removeBoss() { if (bossObj) { scene.remove(bossObj); bossObj = null; } G.eA = G.eA.filter(a => !a.tmp); }
function addBoss() {
  const g = new THREE.Group(), cm = W.mats.concrete, dm = W.mats.dark, x = EC.x + 60, z = EC.z - 150;
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(26, 34, 9, 8, 1), cm); mound.position.y = 4.5; mound.scale.z = 0.8; g.add(mound);
  const top = new THREE.Mesh(new THREE.BoxGeometry(30, 4, 22), cm); top.position.y = 11; g.add(top);
  const door = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 2), dm); door.position.set(0, 3, 27); g.add(door);
  const vent = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 5, 10), W.mats.steel); vent.position.set(-9, 15, -4); g.add(vent);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 18, 6), W.mats.steel); ant.position.set(9, 22, 3); g.add(ant);
  g.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); g.position.set(x, 0, z); compactGroup(g); scene.add(g); bossObj = g;
  asset({ name: 'المخبأ المحصّن', obj: g, x, z, r: 26, val: 30, hp: 14, hp0: 14, kind: 'infra', boss: true, tmp: true }, G.eA);
}
function startCampaign() { G.up = newUp(); G.stage = 0; startBattle(); }
function openUpgrade() {
  const pool = UPG.slice().sort(() => Math.random() - 0.5).slice(0, 3); show('result', false); show('upg', true);
  $('upgl').innerHTML = pool.map(u => `<button data-u="${u.id}"><b>${u.n}</b><i>${u.d}</i></button>`).join('');
  $('upgt').textContent = `قبل المعركة ${G.stage + 2} من 5: «${STAGES[G.stage + 1].name}»`;
  $('upgl').querySelectorAll('button').forEach(b => b.onclick = () => { const u = UPG.find(x => x.id === b.dataset.u); u.f(G.up); G.up.picked.push(u.n); show('upg', false); G.stage++; startBattle(); });
}
function startBattle() {
  audioInit(); clear(); leaveAtk(); removeBoss(); buildEnemyInfra(); restoreAll(); restoreAll(G.eA); const ST = G.ST = G.pvp ? { name: 'معركة نفرين', time: 'day', nSys: 5, pkf: 0, rate: 1, goals: ['مركز القيادة', 'رادار الإنذار المبكر'] } : STAGES[G.stage];
  const L = G.AL = { pick: G.pvp ? NET.peerSys : null, name: ST.name, time: ST.time, nSys: ST.nSys, delay: 5, ch: 1, gap: 2.5, tries: 1, pkf: ST.pkf, reloads: 1, goals: ST.goals };
  G.mode = 'bat'; buildEnemyBatteries(L); if (ST.boss) addBoss(); W.enemy.group.visible = true;
  G.place = Object.assign(autoPlace(G.loadout), G.place); buildBatteries(); batObjs.forEach(o => o.visible = true);
  W.setTime(G.todPick && G.todPick !== 'auto' ? G.todPick : ST.time); shC.set(30, 0, -10); shadowOnce();
  F.post.nv = false; show('nvb', !!W.preset.night);
  const A0 = AMMO[G.ammoLvl]; G.openAmmo = G.ammoLvl === 'o'; G.revenge = 0; G.inv = G.openAmmo ? { b: 0, c: 0, d: 0, e: 0 } : { b: A0.b + G.up.ammo.b, c: A0.c + G.up.ammo.c, d: A0.d + G.up.ammo.d, e: JSORT[G.ammoLvl] + G.up.ammo.e };
  Object.assign(G, { state: 'play', t: 0, at: 0, score: 0, kills: 0, leaks: 0, nextId: 1, sel: null, follow: null, rCap: 30000, failWhy: '', forceFail: false, endT: 0, queue: [], fq: [], nextThreat: 10, topView: false, speed: 1, cine: null, pv: { x: 0, z: 0, k: 1 }, pops: [], holdK: null, waveCd: 0, slowT: 0, lastSave: -99 }); G.ws = { n: 0, hit: 0, shot: 0 }; G.selSet.clear();
  G.cam.center.copy(HOMEC); G.cam.dist = 420; G.cam.el = 0.92; G.cam.yaw = 0.25; G.cam.lastF = null; G.cam.focus = null; G.cam.fw = 0; setView(G.view); G.lastDrag = 0; toBase();
  G.eA.forEach((a, i) => { const mk = a.mk = document.createElement('div'); mk.className = 'mk tg' + (L.goals.includes(a.name) ? ' goal' : '') + (a.kind === 'radar' ? ' rad' : ''); mk.dataset.a = i; mk.innerHTML = `<b>${a.name}</b>`; $('marks').appendChild(mk); });
  G.eA.forEach(a => { a.pvpOff = G.pvp && (a.kind === 'eoff' || a.name === 'مبنى الإمداد'); if (a.pvpOff && a.mk) a.mk.style.display = 'none'; });
  if (G.pvp) G.assets.forEach(a => { a.hp = a.hp0 = ({ 'مبنى القيادة': 3, 'حظيرة الطائرات 1': 2, 'حظيرة الطائرات 2': 2, 'حظيرة الطائرات 3': 2 })[a.name] || 1; });
  G.aSel = G.eA.find(a => a.name === L.goals[0]);
  G.foeView = false; $('marks').classList.remove('foe'); $('foep').innerHTML = '👁 قاعدة الخصم'; $('app').classList.add('batm');
  $('side').classList.add('atk'); show('rbox', false); show('mtools', false); show('mapbox', true); show('homep', true); show('foep', true); show('menu', false); show('result', false);
  $('hpw').querySelector('small').textContent = 'قاعدة الخصم';
  if (G.pvp) { NET.sent = false; NET.last = performance.now(); NET.stT = 0; $('mname').textContent = 'نفرين · غرفة ' + NET.code; banner('ابدأ القتال!', 'دمّر مركز قيادة خصمك ورادار إنذاره', '', 3.2); say('بسم الله، المعركة بدأت'); uiBat(); return; }
  log(`المعركة ${G.stage + 1} من 5: ${ST.name}`); $('mname').textContent = `${G.stage + 1}/5 · ${ST.name}`; banner(`المعركة ${G.stage + 1} من 5`, ST.boss ? 'دمّر المخبأ المحصّن، وانتبه لرشقاته الانتقامية' : ST.name, ST.boss ? 'warn' : '', 3.2); uiBat();
}
const JSORT = { l: 2, m: 3, h: 4 };
function launchJet() {
  if (G.mode !== 'bat' || G.state !== 'play') return; const a = G.aSel;
  if (!a || !a.alive) return banner('اختر هدفاً أولاً', '', 'warn', 1.2, false);
  if (G.jets.some(j => j.alive)) return banner('إيييقل في الجو', 'انتظر رجوعها للقاعدة', 'warn', 1.4, false);
  if (!G.openAmmo && G.inv.e <= 0) return banner('انتهت طلعات إيييقل', '', 'warn', 1.4, false);
  if (!G.openAmmo) G.inv.e--;
  const obj = f15Model(); scene.add(obj); const j = { alive: true, obj, pos: obj.position, dir: new V3(0, 0, -1), v: 290, t: 0, ph: 'in', a, aim: new V3(a.x, 0, a.z), roll: 0, bombs: 3, trail: {}, camB: 75, camU: 17, K: { name: 'إيييقل' } };
  j.tgt = { alive: true, pos: j.aim }; j.pos.set(GROUND.x + 18, 42, GROUND.z + 1500);
  const ms = Object.values(G.eSys).filter(S => !S.type), on = ms.filter(S => eState(S).on);
  j.samMode = G.pvp ? null : on.length && Math.random() < G.AL.pkf * 0.75 * on.length / Math.max(1, Object.keys(G.eSys).length) ? 'kill' : on.length && Math.random() < 0.55 ? 'miss' : null; j.samS = on[(Math.random() * on.length) | 0];
  G.jets.push(j); jetSnd(0.8); if (G.pvp) netSend('jet', {}); radio('إيييقل أقلعت، متجهة إلى ' + a.name, true); banner('إيييقل في الطريق', a.name, 'ok', 1.6, false);
  if ($('chips').children.length < 14) { const chip = j.chip = document.createElement('button'); chip.className = 'chip new jetc'; setTimeout(() => chip.classList.remove('new'), 900); chip.innerHTML = `<b>✈ إيييقل</b><i>${a.name}</i>`; chip.onclick = () => followShot(j); $('chips').appendChild(chip); }
  uiBat(); return true;
}
function endJet(j, lost) { j.alive = false; scene.remove(j.obj); if (j.sam) scene.remove(j.sam.obj); if (j.chip) j.chip.remove(); if (G.follow === j) { if (lost) { G.cam.mode = 'blast'; G.cam.t = 0; G.blast = j.pos.clone(); G.follow = null; } else toBase(); } uiBat(); }
function dropBombs(j) {
  j.bombs = 0; j.ph = 'out'; j.tgt.alive = false; radio('إيييقل: القنابل انطلقت!', true); G.ws.n += 3;
  for (let i = 0; i < 3; i++) {
    const r = makeMissile(KIND.c, 0x50555b), m = Object.assign(r, { k: 'c', K: Object.assign({}, KIND.c, { name: 'قنبلة إيييقل', smoke: 0 }), t: 2, eng: 0, el: {}, aimA: j.a, flame: null, bomb: true });
    m.aim = new V3(j.a.x + (i - 1) * 9 + (Math.random() - 0.5) * 6, 0, j.a.z + (Math.random() - 0.5) * 8); m.tgt = { alive: true, pos: m.aim };
    m.pos.copy(j.pos).add(tC.set((i - 1) * 3, -2.5, 0)); const T = 9 + i * 0.25; m.arc = true; m.g = 2 * m.pos.y / (T * T); m.vel.set((m.aim.x - m.pos.x) / T, 0, (m.aim.z - m.pos.z) / T); m.v = m.vel.length(); m.dir.copy(m.vel).normalize(); orient(m); G.mun.push(m); if (G.pvp) netFire(m, j.a, T);
  }
}
function jetTick(dt) {
  for (const j of G.jets) {
    if (!j.alive) continue; j.t += dt;
    const hx = j.aim.x - j.pos.x, hz = j.aim.z - j.pos.z, hd = Math.hypot(hx, hz); let alt, wx, wz;
    if (j.ph === 'in') { alt = j.t < 6 ? 42 : 620; wx = hx / hd; wz = hz / hd; if (hd < 2700 && !(j.samMode === 'kill' && j.sam)) dropBombs(j); }
    else { const rx = GROUND.x - j.pos.x, rz = GROUND.z + 2200 - j.pos.z, rd = Math.hypot(rx, rz); wx = rx / rd; wz = rz / rd; alt = j.pos.z > -2600 ? 110 : 620; if (j.pos.z > GROUND.z + 1700) { radio('إيييقل رجعت سالمة', true); endJet(j); continue; } }
    if (j.dir.x * wx + j.dir.z * wz < 0.2) { const hl = Math.hypot(j.dir.x, j.dir.z) || 1; wx = -j.dir.z / hl; wz = j.dir.x / hl; }
    tA.set(wx, M.clamp((alt - j.pos.y) * 0.004, -0.22, 0.3), wz).normalize(); const y0 = Math.atan2(j.dir.x, j.dir.z); steerToward(j.dir, tA, dt * 0.55); let dy = Math.atan2(j.dir.x, j.dir.z) - y0; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    j.roll += (M.clamp(-dy / Math.max(dt, 1e-3) * 1.6, -1.2, 1.2) - j.roll) * Math.min(1, dt * 3);
    j.pos.addScaledVector(j.dir, j.v * dt); j.obj.lookAt(tC.copy(j.pos).add(j.dir)); j.obj.rotateZ(j.roll);
    const ab = j.t < 6 || j.ph === 'out' && j.pos.z > -2600 ? 1.5 : 0.9; j.obj.userData.glow.forEach(g => g.scale.set(1, ab * (0.8 + Math.random() * 0.35), 1));
    if (!j.pass && camera.position.distanceTo(j.pos) < 260) { j.pass = true; jetSnd(1.1); }
    if (j.pos.y > 300 && nearCam(j.pos, 6000)) F.trail(tC.copy(j.pos).addScaledVector(j.dir, -15), j.dir, j.v, dt, { state: j.trail, rate: 10, size: 0.45, life: 3, alpha: 0.22 });
    if (j.samMode && !j.sam && j.ph === 'in' && hd < 4600 && j.samS) { const S = j.samS, La = S.launchers.find(x => x.alive) || { x: S.cx, z: S.cz }; const s = j.sam = makeMissile(S, 0x6f7460); s.pos.set(La.x, 6, La.z); s.dir.set(0, 1, 0); s.v = 120; s.t = 0; s.trail = {}; orient(s); F.explode(tC.set(La.x, 1, La.z), 0.14, { debris: 0 }); radio('صاروخ أرض جو على إيييقل!', true); }
    const s = j.sam; if (s && s.alive) {
      s.t += dt; s.v = Math.min(950, s.v + 700 * dt); const off = j.samMode === 'miss' ? 70 : 0; tA.copy(j.pos).addScaledVector(j.dir, j.v * 0.25).add(tB.set(off, off * 0.4, 0)).sub(s.pos).normalize(); steerToward(s.dir, tA, dt * (s.t < 1 ? 1.2 : 2.6));
      s.pos.addScaledVector(s.dir, s.v * dt); orient(s); s.flame.userData.set(0.8, G.time); F.trail(tail(s, tB), s.dir, s.v, dt, { state: s.trail, rate: 34, size: 0.8, life: 7, alpha: 0.45 });
      const d = s.pos.distanceTo(j.pos);
      if (j.samMode === 'miss' && d < 260 && !j.flared) { j.flared = true; for (let i = 0; i < 6; i++) F.explode(tC.copy(j.pos).addScaledVector(j.dir, -20 - i * 9).add(tB.set((Math.random() - 0.5) * 14, -i * 3, 0)), 0.07, { debris: 0 }); radio('إيييقل: أطلقت المشاعل، نجت!', true); }
      if (j.samMode === 'miss' && (d < 75 || s.t > 14)) { F.explode(s.pos.clone(), 0.35, { debris: 6 }); s.alive = false; scene.remove(s.obj); }
      else if (d < 22) { F.explode(j.pos.clone(), 1.3, { debris: 26 }); F.explode(tC.copy(j.pos).addScaledVector(j.dir, 20), 0.7, { debris: 10 }); s.alive = false; banner('أُسقطت إيييقل!', 'دفاعات الخصم أصابتها', 'warn', 2.4); radio('فقدنا إيييقل!', true); G.jetLost = (G.jetLost || 0) + 1; endJet(j, true); }
    }
  }
}
// ---------- معركة نفرين: كل جوال يحكم على قاعدته (اعتراض وضرر)، ويرسل حالتها للخصم
const NET = { r: null, uid: Math.random().toString(36).slice(2, 9), code: '', host: false, peer: null, peerSys: null, last: 0, sent: false, seq: 1, hiT: 0, goT: 0, gotSt: false };
let roomBase;
async function getRoom() {
  if (roomBase !== undefined && roomBase) return roomBase;
  if (/[?&]local\b/.test(location.search)) return roomBase = localRoom();
  if (window.FBCFG) return roomBase = fbRoom();
  try { roomBase = window.claude && window.claude.use ? await Promise.race([window.claude.use('room'), new Promise(r => setTimeout(() => r(null), 10000))]) : null; } catch (e) { roomBase = null; }
  return roomBase;
}
function fbRoom() {
  const fb = window.firebase, cfg = window.FBCFG; if (!fb || !cfg) return null;
  try { if (!fb.apps.length) fb.initializeApp(cfg); } catch (e) { return null; } const db = fb.database();
  let off = 0; db.ref('.info/serverTimeOffset').on('value', s => { off = s.val() || 0; });
  const PC = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz', kts = k => { let t = 0; for (let i = 0; i < 8; i++) t = t * 64 + PC.indexOf(k[i]); return t; };
  return { join(name) { const room = db.ref('rooms/' + name.replace(/[^\w-]/g, '')), ref = room.child('m'), fns = {};
    if (NET.host) room.remove(); const q = ref.limitToLast(60); q.on('child_added', s => { if (kts(s.key) < Date.now() + off - 15000) return; const v = s.val(); const f = v && fns[v.t]; if (f) { try { f(JSON.parse(v.d)); } catch (e) {} } });
    return { emit(t, d) { ref.push({ t, d: JSON.stringify(d) }); }, on(t, fn) { fns[t] = fn; }, leave() { q.off(); } }; } };
}
function localRoom() { return { join(name) { const bc = new BroadcastChannel(name), fns = {}; bc.onmessage = e => { const f = fns[e.data.t]; if (f) f(e.data.d); }; return { emit(t, d) { bc.postMessage({ t, d }); }, on(t, fn) { fns[t] = fn; }, leave() { bc.close(); } }; } }; }
function netSend(ty, o = {}) { if (!NET.r) return; try { NET.r.emit('g', Object.assign({ ty, u: NET.uid }, o)); } catch (e) {} }
function netLeave() { if (NET.r) { netSend('bye'); try { NET.r.leave && NET.r.leave(); } catch (e) {} } clearInterval(NET.iv); NET.r = null; NET.peer = null; NET.peerSys = null; G.pvp = false; }
async function netOpen(code, host) {
  pvpStatus('جاري الاتصال…'); const base = await getRoom();
  if (!base) { pvpStatus(window.FBCFG ? 'ما قدرت أتصل بخادم اللعب. تأكد من الإنترنت وجرّب مرة ثانية.' : 'معركة النفرين تشتغل من رابط النسخة الأونلاين.', 'bad'); return false; }
  NET.host = host; try { NET.r = await base.join('saqr-pvp-' + code); } catch (e) { NET.r = null; }
  if (!NET.r) { pvpStatus('تعذّر دخول الغرفة', 'bad'); return false; }
  Object.assign(NET, { code, host, peer: null, peerSys: null, gotSt: false }); NET.r.on('g', (d) => netMsg(d && d.data && d.data.ty ? d.data : d));
  clearInterval(NET.iv); NET.iv = setInterval(() => { if (!NET.peer) netSend('hi', { sys: G.loadout, host }); else if (NET.host && G.goPending && !NET.gotSt) netSend('go', G.goPending); }, 1200);
  netSend('hi', { sys: G.loadout, host }); pvpLobby(); return true;
}
function netMsg(d) {
  if (!d || d.u === NET.uid || !d.ty) return; if (NET.peer && d.u !== NET.peer) return; NET.last = performance.now();
  if (d.ty === 'hi') { const first = !NET.peer; NET.peer = d.u; NET.peerSys = d.sys; if (first) { netSend('hi', { sys: G.loadout, host: NET.host }); pvpLobby(); } return; }
  if (d.ty === 'bye') { if (G.pvp && G.state === 'play') pvpDrop('خرج خصمك من المعركة'); else { NET.peer = null; pvpLobby(); } return; }
  if (d.ty === 'go') { if (!NET.host && !(G.pvp && (G.state === 'play' || G.state === 'cine'))) { G.ammoLvl = d.ammo; G.todPick = d.tod; startPvp(); } return; }
  if (!G.pvp) return;
  if (d.ty === 'st') { NET.gotSt = true; G.goPending = null; applySt(d); return; }
  if (G.state !== 'play') return;
  if (d.ty === 'f') netIncoming(d);
  else if (d.ty === 'x') { const m = G.mun.find(m => m.nid === d.id && m.alive); if (m) { F.explode(m.pos.clone(), m.K.drone ? 0.5 : 0.95, { vel: m.vel, debris: 30 }); G.pops.push({ x: m.pos.x, z: m.pos.z, t: 0, s: 'اعتُرض', c: '#9fe8ff' }); G.ws.shot++; boom(0.6, 1.4); endShot(m); } }
  else if (d.ty === 'jet') { banner('طائرة معادية!', 'خصمك أرسل طلعة قصف', 'warn', 2); radio('رصدنا طائرة معادية متجهة لنا!', true); }
  else if (d.ty === 'end') pvpWin();
}
function netFire(m, a, T) {
  m.nid = NET.uid + (NET.seq++); const same = G.eA.filter(x => x.name === a.name), ti = Math.max(0, same.indexOf(a));
  if (!T && m.arc) T = Math.hypot(m.aim.x - m.pos.x, m.aim.z - m.pos.z) / Math.max(1, Math.hypot(m.vel.x, m.vel.z));
  netSend('f', { id: m.nid, k: m.bomb ? 'b' : m.k, tgt: a.name, ti, T: T || 0, drop: m.bomb ? 1 : 0 });
}
const homeName = n => n === 'مركز القيادة' ? 'مبنى القيادة' : n, foeName = n => n === 'مبنى القيادة' ? 'مركز القيادة' : n;
function netIncoming(d) {
  const same = G.assets.filter(a => a.name === homeName(d.tgt)), A = same[d.ti] && same[d.ti].alive ? same[d.ti] : same.find(a => a.alive) || null;
  const L = G.eA.find(a => a.kind === 'eoff' && a.sub === d.k) || { x: EC.x, z: EC.z + 160 };
  const from = d.drop ? new V3((A ? A.x : 30) + (Math.random() - 0.5) * 40, 600, (A ? A.z : 0) - 2500) : new V3(L.x + (Math.random() - 0.5) * 8, d.k === 'd' ? 3 : 6, L.z);
  spawn({ k: d.k, brg: 0, from, aimA: A, T: d.T, drop: !!d.drop, net: d.id });
  if (d.drop) radio('قنابل طائرة الخصم تنزل علينا!', true); else radio(d.k === 'b' ? 'خصمك أطلق باليستي!' : d.k === 'c' ? 'كروز من خصمك قادم' : 'مسيّرات خصمك في الطريق');
}
function homeSt() { const c = {}; return G.assets.filter(a => !a.tmp).map(a => { const n = foeName(a.name), i = c[n] = (c[n] ?? -1) + 1; return [n, i, a.alive ? 1 : 0, a.hp ?? 1]; }); }
function applySt(d) {
  if (!Array.isArray(d.a)) return; const grp = {}; G.eA.forEach(a => { if (!a.tmp) (grp[a.name] = grp[a.name] || []).push(a); });
  for (const [n, i, alive, hp] of d.a) { const a = (grp[n] || [])[i]; if (!a || !a.alive) continue;
    if (!alive) { a.alive = false; a.hp = 0; wreck(a); G.pops.push({ x: a.x, z: a.z, t: 0, s: 'دُمّر', c: '#ffd166' }); banner('دمّرت ' + a.name, 'عند خصمك', 'ok', 2); hitCall(true); }
    else if (hp < (a.hp ?? 1)) { G.pops.push({ x: a.x, z: a.z, t: 0, s: '−' + Math.round(((a.hp ?? 1) - hp) * 10) / 10, c: '#ff5b45' }); a.hp = hp; scorch(a); hitCall(false); } }
  G.eInteg = d.i; if (G.state === 'play' && G.AL.goals.every(n => !G.eA.some(x => x.name === n && x.alive))) pvpWin(); uiBat();
}
function pvpWin() { if (G.state !== 'play') return; const gl = G.eA.find(x => x.name === 'مركز القيادة'); G.AL.goals.forEach(n => G.eA.filter(x => x.name === n && x.alive).forEach(x => { x.alive = false; wreck(x); })); startCine(new V3(gl.x, 0, gl.z), () => finishBat(true), 'سقطت قاعدة خصمك', 'انتصرت في معركة النفرين', true); }
function pvpDrop(why) { if (G.state !== 'play') return; G.state = 'result'; finishBat(false); $('result').className = 'ov'; $('rt').textContent = 'انتهت المعركة'; $('rs').textContent = why; netLeave(); }
function pvpTick(dt) {
  if ((NET.stT -= dt) <= 0) { NET.stT = 1.5; netSend('st', { a: homeSt(), i: integrity() }); }
  if (G.state !== 'play') return;
  if (!NET.sent) { const dead = n => !G.assets.some(a => a.name === n && a.alive);
    if (dead('مبنى القيادة') && dead('رادار الإنذار المبكر')) { G.failWhy = 'دمّر خصمك مبنى القيادة والرادار'; G.forceFail = true; }
    if (G.forceFail || integrity() < 30 || !SYSK.some(k => sysState(k).on)) { NET.sent = true; netSend('st', { a: homeSt(), i: integrity() }); [0, 700, 1500].forEach(t => setTimeout(() => netSend('end'), t)); } }
  if (performance.now() - NET.last > 25000) pvpDrop('انقطع الاتصال بخصمك');
}
function startPvp() { G.pvp = true; G.up = newUp(); G.stage = 0; show('pvp', false); startBattle(); }
function pvpStatus(t, cls = '') { const e = $('pvpst'); e.textContent = t; e.className = 'pvpst ' + cls; }
function pvpLobby() {
  show('pvp1', false); show('pvp2', true); $('pvpshow').textContent = NET.code;
  if (!NET.peer) { pvpStatus(NET.host ? 'أعطِ صاحبك هذا الرقم، وانتظر دخوله…' : 'بانتظار المضيف…'); $('pvpstart').disabled = true; show('pvpstart', NET.host); return; }
  const ps = (NET.peerSys || []).map(k => DB[k] ? DB[k].name : k).join('، ');
  pvpStatus(NET.host ? `دخل خصمك! منظوماته: ${ps}` : `أنت داخل. منظومات خصمك: ${ps}. بانتظار المضيف يبدأ…`, 'ok'); $('pvpstart').disabled = false; show('pvpstart', NET.host);
}
$('pvpgo').onclick = () => { audioInit(); show('menu', false); show('pvp', true); show('pvp1', true); show('pvp2', false); pvpStatus(''); $('pvpcode').value = '';
  if (!window.FBCFG && !/[?&]local\b/.test(location.search)) { show('pvp1', false); $('pvpst').innerHTML = 'معركة النفرين تشتغل من النسخة الأونلاين، وبدون حساب:<br><a href="https://alshehriag.github.io/saqr-game/" target="_blank" rel="noopener" style="color:var(--sand);font-weight:900">alshehriag.github.io/saqr-game</a>'; } };
$('pvpnew').onclick = () => netOpen(String(1000 + Math.floor(Math.random() * 9000)), true);
$('pvpjoin').onclick = () => { const c = $('pvpcode').value.replace(/\D/g, ''); if (c.length !== 4) return pvpStatus('اكتب رقم الغرفة (4 أرقام)', 'bad'); netOpen(c, false); };
$('pvpstart').onclick = () => { if (!NET.peer) return; NET.gotSt = false; G.goPending = { ammo: G.ammoLvl, tod: G.todPick || 'day' }; netSend('go', G.goPending); startPvp(); };
$('pvpx').onclick = () => { netLeave(); show('pvp', false); show('menu', true); };
function fireBat(k) {
  if (G.mode !== 'bat' || G.state !== 'play') return; const a = G.aSel;
  if (!a || !a.alive) return banner('اختر هدفاً أولاً', '', 'warn', 1.2, false);
  if (!G.openAmmo && G.inv[k] <= 0) { G.holdK = null; return banner('نفد ' + KIND[k].name, '', 'warn', 1.2, false); }
  if (!G.openAmmo) G.inv[k]--; spawnMun({ k, a, brg: 0, home: true }); launchSnd(k === 'b' ? 1 : k === 'c' ? 0.75 : 0.45); uiBat(); return true;
}
function autoDefend() {
  for (const t of G.tracks) {
    if (!t.alive || t.K.friend) continue;
    if (t.cls !== 'hostile') { t.cls = 'hostile'; t.known = true; t.iff = 'done'; t.mk.className = 'mk hostile'; }
    if ((t.engaged || 0) >= 1 || G.shots.some(s => s.alive && s.tgt === t) || G.fq.some(q => q.tgt === t)) continue;
    for (const k of SYSK) { const S = SYS[k]; if (G.t - (S.lastAuto || -99) < 3.5) continue; if (why(k, t) === 'ok' && (!S.type || S.mounts.some(a => a.alive && a.cd <= 0))) { S.lastAuto = G.t; launchOne(k, t); break; } }
  }
}
function battleTick(dt, rdt) {
  G.batTick = true; updateAtk(dt, rdt); G.batTick = false; autoDefend(); jetTick(dt); if (G.pvp) { pvpTick(dt); return; }
  if (G.revenge > 0 && G.time - (G.revT || -99) > 3) { G.revenge--; G.revT = G.time; const B = G.eA.find(a => a.boss && a.alive); if (B) { for (let i = 0; i < 3; i++) spawn({ k: i === 1 ? 'c' : 'b', brg: 0, from: new V3(B.x - 12 + i * 12, 8, B.z + 20) }); banner('رشقة انتقامية!', 'المخبأ يرد عليك', 'warn', 2); radio('رشقة انتقامية من المخبأ!'); } }
  G.nextThreat -= dt * (1 / (G.ST ? G.ST.rate : 1) - 1);
  if ((G.nextThreat -= dt) <= 0) { const off = G.eA.filter(a => a.kind === 'eoff' && a.alive);
    if (!off.length) { G.nextThreat = 1e9; banner('أسكتّ صواريخ الخصم', 'لم يعد يقدر يطلق عليك', 'ok', 3); return; }
    G.nextThreat = (14 / off.length + 4) * supMul() * (0.8 + Math.random() * 0.4) * Math.max(0.45, 1 - G.t / 240); const L = off[(Math.random() * off.length) | 0]; radio(L.sub === 'b' ? 'رصد إطلاق باليستي من الشمال' : L.sub === 'c' ? 'كروز منخفض قادم' : 'مسيّرات في الطريق إلينا');
    for (let i = 0, n = L.sub === 'd' ? 2 : 1; i < n; i++) spawn({ k: L.sub, brg: 0, from: new V3(L.x + i * 6, L.sub === 'd' ? 3 : 6, L.z) }); }
}
function waveFire() {
  if (G.mode !== 'bat' || G.state !== 'play' || G.waveCd > 0) return; const near = G.tracks.filter(t => t.alive && !t.K.friend && t.pos.distanceTo(HOMEC) < 4500); if (!near.length) return;
  let n = 0; for (const t of near) { t.cls = 'hostile'; let c = 0; for (const k of SYSK) { if (c >= 2) break; const S = SYS[k]; if (why(k, t) !== 'ok' || (S.type && !S.mounts.some(a => a.alive && a.cd <= 0))) continue; launchOne(k, t); c++; n++; } }
  G.waveCd = G.up.wave; banner('موجة اعتراض!', `${n} اعتراض على ${near.length} ${near.length > 1 ? 'أهداف' : 'هدف'}`, 'ok', 1.6); radio('كل المنصات، أطلقوا!'); launchSnd(0.8);
}
function waveUI(rdt) {
  G.waveCd = Math.max(0, (G.waveCd || 0) - rdt); const b = $('wave'), close = G.state === 'play' && G.tracks.some(t => t.alive && !t.K.friend && t.pos.distanceTo(HOMEC) < 2500);
  b.classList.toggle('hid', !(close || G.waveCd > 0) || G.state !== 'play'); b.classList.toggle('ready', close && G.waveCd <= 0); b.disabled = G.waveCd > 0; b.querySelector('i').textContent = G.waveCd > 0 ? Math.ceil(G.waveCd) + ' ث' : 'خطر قريب!';
}
$('wave').addEventListener('pointerdown', e => { e.stopPropagation(); audioInit(); waveFire(); });
function finishBat(win) {
  G.state = 'result'; const left = G.openAmmo ? 0 : G.inv.b + G.inv.c + G.inv.d, sc = G.score + (win ? integrity() * 5 + left * 10 : 0);
  $('result').className = win ? 'ov win' : 'ov lose'; $('rt').textContent = win ? 'انتصرت في المعركة' : 'سقطت قاعدتك';
  $('rs').textContent = win ? `دُمّرت أهداف الخصم · سلامة قاعدتك ${integrity()}٪` : (G.failWhy || 'دُمّرت القاعدة');
  $('rd').textContent = `ذخائر أصابت: ${G.ws.hit} · اعتُرضت: ${G.ws.shot} · النقاط: ${sc}`; const last = G.stage >= STAGES.length - 1; if (win && last) { $('rt').textContent = 'انتصرت في الحملة!'; $('rs').textContent = 'دمّرت المخبأ وأنهيت المعارك الخمس'; } else if (win) $('rt').textContent = `انتصرت في المعركة ${G.stage + 1} من 5`;
  $('rn').textContent = 'اختر ترقية والمعركة التالية'; show('rn', win && !last && !G.pvp); show('rr', !G.pvp || (NET.host && !!NET.peer)); if (G.pvp) { $('rd').textContent += NET.host ? ' · اضغط «إعادة» لجولة ثانية' : ' · المضيف يقدر يبدأ جولة ثانية'; $('rt').textContent = win ? 'انتصرت على خصمك!' : 'خصمك هزمك'; $('rs').textContent = win ? 'سقطت قاعدة خصمك' : (G.failWhy || 'سقطت قاعدتك'); } show('result', true); say(win ? (last ? 'كفو! انتصرنا في الحملة' : 'السماء آمنة') : 'فشلت المهمة');
}
// ---------- مشهد التدمير: حركة بطيئة وانفجارات ثانوية ودوران حول الهدف ثم النتيجة
function startCine(pos, then, title, sub, good) {
  if (G.state === 'cine') return; G.state = 'cine'; G.cine = { p: pos.clone().setY(Math.max(0, pos.y)), t: 0, then, n: 0 }; G.cam.mode = 'cine'; G.cam.t = 0;
  [...$('chips').children].forEach(c => c.remove()); show('backb', false); banner(title, sub, good ? 'ok' : 'warn', 5);
}
const CINE_EX = [0.25, 0.9, 1.6, 2.4, 3.3];
function cineTick(rdt) {
  const C = G.cine; C.t += rdt;
  while (C.n < CINE_EX.length && C.t >= CINE_EX[C.n]) { const k = C.n++, r = k ? 14 : 0; F.explode(tA.set(C.p.x + (Math.random() - 0.5) * 2 * r, 0, C.p.z + (Math.random() - 0.5) * 2 * r), k === 0 ? 1.7 : 0.8 + Math.random() * 0.4, { ground: true, debris: k ? 25 : 60 }); boom(k ? 0.7 : 1.3, 0.05); G.camShake = k ? 0.35 : 0.9; }
  F.update(rdt * 0.4, G.time, heightAt, rdt * 0.4);
  if (bannerT > 0 && (bannerT -= rdt) <= 0) $('banner').className = '';
  if (C.t > 7.5) { G.state = 'post'; G.cam.mode = 'base'; G.cam.focus = null; G.cam.fw = 0; G.cam.lastF = null; F.post.focus = 0; C.then(); }
}
// خريطة قاعدة الخصم الصغيرة
const em = $('emap'), ex = em.getContext('2d'); let emT = 0;
const pipCam = new THREE.PerspectiveCamera(36, 1, 40, 5000);
G.pv = { x: 0, z: 0, k: 1 };
function pipPose() { const big = $('mapbox').classList.contains('big'), cx = EC.x + 15 + G.pv.x, cz = EC.z - 15 + G.pv.z, H = (big ? 470 : 560) / G.pv.k; pipCam.position.set(cx, H, cz + H * 0.42); pipCam.lookAt(cx, 0, cz); }
function renderPip() {
  if (G.mode !== 'bat' || G.state !== 'play' || $('mapbox').classList.contains('hid')) return;
  const r = em.getBoundingClientRect(), cr = canvas.getBoundingClientRect(); if (!r.width) return;
  pipCam.aspect = r.width / r.height; pipCam.updateProjectionMatrix(); pipPose();
  const x = r.left - cr.left, y = cr.bottom - r.bottom, fd = scene.fog.density;
  renderer.setScissorTest(true); renderer.setScissor(x, y, r.width, r.height); renderer.setViewport(x, y, r.width, r.height);
  scene.fog.density = fd * 0.4; renderer.render(scene, pipCam); scene.fog.density = fd;
  renderer.setScissorTest(false); renderer.setViewport(0, 0, VW, VH);
}
function drawEmap(rdt) {
  G.pops = G.pops.filter(p => (p.t += rdt) < 1.6);
  if ((emT += rdt) < 0.05) return; emT = 0; const S = em.clientWidth || 160, dpr = Math.min(2, devicePixelRatio || 1); if (em.width !== Math.round(S * dpr)) em.width = em.height = Math.round(S * dpr);
  const g = ex; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, S, S); pipCam.aspect = 1; pipCam.updateProjectionMatrix(); pipPose(); pipCam.updateMatrixWorld();
  const P = (x, y, z) => { tA.set(x, y, z).project(pipCam); return [(tA.x * 0.5 + 0.5) * S, (-tA.y * 0.5 + 0.5) * S]; };
  g.lineWidth = 1.6; g.font = '700 10px system-ui'; g.textAlign = 'center';
  for (const a of G.eA) { const [x, y] = P(a.x, 4, a.z), goal = G.AL.goals.includes(a.name); a.ex = x; a.ey = y; if (!a.alive || a.pvpOff) continue;
    const col = goal ? '#ff5b45' : a.kind === 'eoff' ? '#d58cff' : a.supply ? '#63e08a' : a.kind === 'radar' ? '#9fe8ff' : 'rgba(233,182,92,.85)', r = goal ? 7 : a.kind === 'eoff' || a.supply ? 5 : 4;
    g.strokeStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke();
    if (goal) { g.fillStyle = col; g.fillText(a.name.replace('رادار الإنذار المبكر', 'رادار الإنذار'), x, y - 10); }
    if (a === G.aSel) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r + 5, 0, 7); g.stroke(); g.lineWidth = 1.6; } }
  g.font = '900 13px system-ui'; g.textAlign = 'center';
  for (const p of G.pops) { const [x, y] = P(p.x, 10, p.z), k = p.t / 1.6; g.globalAlpha = 1 - k * k; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(p.s, x, y - 14 - k * 26); g.fillStyle = p.c; g.fillText(p.s, x, y - 14 - k * 26); } g.globalAlpha = 1;
}
function pickAt(x, y) { let best = null, bd = 26; for (const a of G.eA) { if (!a.alive || a.pvpOff) continue; const d = Math.hypot(a.ex - x, a.ey - y); if (d < bd) { bd = d; best = a; } } if (best) { G.aSel = best; uiBat(); emT = 1; } }
const pvClamp = () => { const P = G.pv; P.k = M.clamp(P.k, 1, 4); P.x = M.clamp(P.x, -480, 480); P.z = M.clamp(P.z, -480, 480); emT = 1; };
const pvZoom = (f) => { G.pv.k *= f; pvClamp(); };
const pvReset = () => { G.pv.x = G.pv.z = 0; G.pv.k = 1; emT = 1; };
const EP = new Map(); let eDrag = false, ePinch = 0, eTap = 0;
em.addEventListener('pointerdown', e => { e.preventDefault(); try { em.setPointerCapture(e.pointerId); } catch (_) {} EP.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY }); if (EP.size === 1) eDrag = false; else { eDrag = true; const [p, q] = [...EP.values()]; ePinch = Math.hypot(p.x - q.x, p.y - q.y); } });
em.addEventListener('pointermove', e => { const p = EP.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (EP.size >= 2) { const [a, b] = [...EP.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (ePinch > 0) pvZoom(d / ePinch); ePinch = d; return; }
  if (!eDrag && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 7) eDrag = true; if (!eDrag) return;
  const r = em.getBoundingClientRect(), H = ($('mapbox').classList.contains('big') ? 470 : 560) / G.pv.k, wpp = 2 * H * Math.tan(M.degToRad(18)) / r.height;
  G.pv.x -= dx * wpp; G.pv.z -= dy * wpp * 1.15; pvClamp(); });
const eUp = e => { const p = EP.get(e.pointerId); if (!p) return; EP.delete(e.pointerId); if (EP.size) { ePinch = 0; return; }
  if (!eDrag && e.type === 'pointerup') { const now = performance.now(), b = em.getBoundingClientRect(); if (now - eTap < 300) { pvReset(); eTap = 0; return; } eTap = now; pickAt(e.clientX - b.left, e.clientY - b.top); } };
em.addEventListener('pointerup', eUp); em.addEventListener('pointercancel', eUp);
em.addEventListener('wheel', e => { e.preventDefault(); pvZoom(e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
$('pzin').onclick = () => pvZoom(1.4); $('pzout').onclick = () => pvZoom(1 / 1.4); $('pzrs').onclick = pvReset;
function foeView(on) { G.foeView = on; $('marks').classList.toggle('foe', on); show('mapbox', !on && G.mode === 'bat'); $('foep').innerHTML = on ? '↩ قاعدتي' : '👁 قاعدة الخصم'; toBase(); }
$('foep').onclick = () => { if (G.mode === 'bat' && G.state === 'play') foeView(!G.foeView); };
$('emttl').onclick = () => { $('mapbox').classList.toggle('mini'); emT = 1; };
function toggleView() { G.topView = !G.topView; G.cam.center.copy(HOMEC); G.cam.lastF = null; G.cam.focus = null; G.cam.fw = 0; toBase(); uiBat(); }
$('homep').onclick = () => { if (G.mode === 'bat') { if (G.foeView) foeView(false); toggleView(); } };
$('pipsz').onclick = () => { $('mapbox').classList.toggle('big'); emT = 1; };
function uiBat() {
  if (G.mode !== 'bat') return; const L = G.AL, a = G.aSel && G.aSel.alive ? G.aSel : (G.aSel = null);
  const tot = G.eA.reduce((s, x) => s + x.val, 0), ei = Math.round(100 * G.eA.reduce((s, x) => s + (x.alive ? x.val : 0), 0) / tot), hi = integrity();
  $('hp').style.transform = `scaleX(${ei / 100})`; $('hpn').textContent = ei; $('hp').style.background = 'var(--bad)'; $('sc').textContent = G.score;
  $('left').textContent = G.openAmmo ? '∞' : G.inv.b + G.inv.c + G.inv.d; $('homep').innerHTML = `${G.topView ? 'منظر أرضي' : 'منظر علوي'} · قاعدتك <b style="color:${hi > 60 ? 'var(--ok)' : hi > 40 ? 'var(--unk)' : 'var(--bad)'}">${hi}٪</b>`;
  let h = `<div class="sec"><h4>المطلوب تدميره</h4><div class="goals">${L.goals.map(n => { const x = G.eA.find(y => y.name === n), d = !x.alive; return `<span class="${d ? 'g' : ''}">${d ? '✓' : '○'} ${n}${d ? '' : ` · تحمّل ${x.hp}`}</span>`; }).join('')}</div></div>`;
  h += `<div class="sec"><h4>الهدف المحدد</h4>${a ? `<div class="dh hostile"><b>${a.name}</b><i>تحمّل ${a.hp ?? 1}</i></div>` : '<p class="mut">اضغط هدفاً على القاعدة أو الخريطة الصغيرة</p>'}
    <div class="fire">${WK.map(k => `<button data-fire="${k}" ${a ? '' : 'disabled'}><b>${KIND[k].name}</b><small>${WNOTE[k]}</small><em>${G.openAmmo ? '∞' : G.inv[k]}</em></button>`).join('')}<button class="jetb" data-jet="1" ${a ? '' : 'disabled'}><span><b>✈ إيييقل</b><small>ف-15 · طلعة قصف بثلاث قنابل · قد تُسقط</small></span><em>${G.jets.some(j => j.alive) ? 'في الجو' : G.openAmmo ? '∞' : G.inv.e}</em></button></div></div>`;
  h += `<button class="morebtn" data-act="more">${G.batMore ? 'إخفاء التفاصيل ▴' : 'المزيد: دفاعك وأهداف الخصم ▾'}</button><div id="batmore" class="${G.batMore ? '' : 'hid'}">`;
  h += `<div class="sec"><h4 class="hrow">في الجو <button class="pill" data-act="spd">السرعة ×${G.speed}</button></h4><div class="dg"><div><small>ذخائرك</small><b>${G.mun.length}</b></div><div><small>أصابت</small><b>${G.ws.hit}</b></div><div><small>اعتُرضت</small><b>${G.ws.shot}</b></div><div><small>تهديدات عليك</small><b>${G.tracks.filter(t => !t.K.friend).length}</b></div></div></div>`;
  h += `<div class="sec"><h4>دفاعك الآلي</h4><div class="aslist">${SYSK.map(k => { const S = SYS[k], st = sysState(k); return `<div class="as${st.on ? '' : ' off'}"><b>${S.name}</b><span>${st.n}/${st.tot}</span>${S.type ? '' : `<span>جاهز ${st.ammo}</span>`}${st.reloading ? '<span class="y">تلقيم</span>' : ''}</div>`; }).join('')}</div></div>`;
  const offN = (k) => G.eA.filter(x => x.kind === 'eoff' && x.sub === k && x.alive).length, sup = G.eA.filter(x => x.supply);
  h += `<div class="sec"><h4>قدرات الخصم</h4><div class="aslist"><div class="as${offN('b') ? '' : ' off'}"><b>باليستي</b><span>منصات ${offN('b')}/2</span></div><div class="as${offN('c') ? '' : ' off'}"><b>كروز</b><span>منصات ${offN('c')}/2</span></div><div class="as${offN('d') ? '' : ' off'}"><b>مسيّرات</b><span>منصات ${offN('d')}/2</span></div><div class="as${sup.every(x => x.alive) ? '' : ' off'}"><b>الإمداد</b><span>${sup.filter(x => x.alive).length}/2 سليم</span><span class="y">${supMul() > 1 ? 'إطلاقه وتلقيمه أبطأ ×' + supMul() : ''}</span></div></div></div>`;
  const rows = G.eA.map((x, i) => [x, i]).filter(([x]) => x.alive && !x.pvpOff).sort(([x], [y]) => (L.goals.includes(y.name) - L.goals.includes(x.name)) || ((y.kind === 'eoff') - (x.kind === 'eoff')) || ((y.kind === 'radar') - (x.kind === 'radar')) || ((!!y.supply) - (!!x.supply)));
  h += `<div class="sec"><h4>أهداف قاعدة الخصم</h4><div id="atl">${rows.map(([x, i]) => `<button data-a="${i}" class="tr${x === a ? ' on' : ''}${L.goals.includes(x.name) ? ' hostile' : ''}"><span>${x.name}</span><i>${x.kind === 'eoff' ? 'هجوم' : x.supply ? 'إمداد' : (x.kind === 'radar' || x.kind === 'launcher' || x.kind === 'mount') ? 'دفاع' : ''}</i><em>${x.hp ?? 1}</em></button>`).join('')}</div></div>`;
  h += `<div class="sec"><h4>دفاعات الخصم</h4><div class="aslist">${Object.values(G.eSys).map(S => { const st = eState(S); return `<div class="as${st.on ? '' : ' off'}"><b>${S.name}</b>${S.type || S.radar.fake ? '' : `<span class="${st.radar ? 'g' : 'r'}">رادار ${st.radar ? '✓' : '✕'}</span>`}<span>${st.n}/${st.tot}</span></div>`; }).join('')}</div></div>`;
  h += '</div>'; $('atk').innerHTML = h;
}
const ammoUI = () => {}; seg('s-ammo', Object.fromEntries(Object.entries(AMMO).map(([k, v]) => [k, v.n])), G.ammoLvl, k => { G.ammoLvl = k; store.set('al', k); });
$('batgo').onclick = () => startCampaign();

// ---------- الحلقة
let last = performance.now(), fAcc = 0, fN = 0, lowT = 0, uiT = 0;
function frame(now) {
  requestAnimationFrame(frame); if (G.freeze) { last = now; return; }
  const rdt = Math.min(0.05, (now - last) / 1000); last = now;
  const sc = G.slowT > 0 ? 0.3 : 1; if (G.slowT > 0) G.slowT -= rdt;
  if (G.holdK && G.mode === 'bat' && G.state === 'play' && (G.holdT -= rdt) <= 0) { G.holdT = 0.32; fireBat(G.holdK); }
  if (G.mode === 'bat') waveUI(rdt);
  for (let i = 0, n = (G.mode === 'atk' || G.mode === 'bat') ? G.speed : 1; i < n; i++) update(rdt * sc, i ? 0 : rdt); updateCamera(rdt); drawRadar(rdt); F.render(G.time); renderPip();
  if (G.mode === 'bat') drawEmap(rdt);
  if ((uiT += rdt) > 0.35) { uiT = 0; if (G.state === 'play') (G.mode === 'bat' ? uiBat() : uiAll()); else if (G.mode === 'atk' && G.state === 'astrike') uiAtk(); }
  fAcc += rdt; fN++; if (fAcc >= 1) { const fps = fN / fAcc; fAcc = 0; fN = 0; G.fps = fps; $('fps').textContent = Math.round(fps) + ' إطار/ث';
    if (Q.auto && !document.hidden) { const min = 0.7, top = Math.min(devicePixelRatio || 1, Q.prMax); if (fps < 48 && Q.pr > min) { Q.pr = Math.max(min, Q.pr * 0.86); resize(); } else if (fps > 58 && Q.pr < top) { Q.pr = Math.min(top, Q.pr * 1.04); resize(); }
      lowT = fps < 40 && Q.pr <= min + 0.01 ? lowT + 1 : 0; if (lowT >= 2 && Q.tier !== 'low') { lowT = 0; applyTier(Q.tier === 'high' ? 'med' : 'low'); } } }
}
G.sim = (sec, step = 1 / 60, noRender) => { for (let t = 0; t < sec - 1e-6; t += step) { update(step, step); updateCamera(step); } if (!noRender) { if (G.mode === 'bat') { emT = 1; drawEmap(1); } drawRadar(0.016); G.mode === 'bat' ? uiBat() : G.mode === 'atk' ? uiAtk() : uiAll(); F.render(G.time); renderPip(); } };
G.api = { scene, renderer, waveFire, VIEWS, setView, startBattle, fireBat, makeMissile, orient, startAtk, planAdd, launchStrike, eState, openLoadout, buildBatteries, start, engage, startIFF, classify, select, selectAllHostile, followShot, toBase, F, W, camera, SYS, sysState, why, integrity };

buildEnemyInfra(); { const keep = new Set(); [...G.assets, ...G.eA].forEach(a => (a.objs || []).forEach(o => keep.add(o))); compactBase(W.home.group, keep); compactBase(W.enemy.group, keep); }
G.place = Object.assign(autoPlace(G.loadout), G.place); buildBatteries(); setQuality(qPref); W.setTime('day'); shadowOnce(); show('load', false); show('menu', true); uiAll();
requestAnimationFrame(frame);
