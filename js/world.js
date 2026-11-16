// العالم: السماء، التضاريس، القواعد، المجسمات
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { makeNoise } from './tex.js';

const N = makeNoise(1234), M = THREE.MathUtils;
export const HOME = new THREE.Vector3(0, 0, 0);
export const ENEMY = new THREE.Vector3(260, 0, -5200);
const FLAT_R = 300;

// ---------- ارتفاع الأرض: كثبان غير متناظرة (سفح ريح لطيف + وجه انزلاق حاد)
function duneProfile(t) { t -= Math.floor(t); return t < 0.7 ? M.smootherstep(t / 0.7, 0, 1) : M.smootherstep((1 - t) / 0.3, 0, 1); }
export function heightAt(x, z) {
  const big = N.fbm(x / 2600 + 40, z / 2600 + 40, 3) - 0.5;
  const w1 = N.fbm(x / 1300 + 11, z / 1300 + 3, 3) * 4.2;
  const a1 = 0.2 + N.fbm(x / 1700 + 70, z / 1700 + 20, 2);
  const d1 = duneProfile((x * 0.42 + z * 0.91) / 760 + w1) * 46 * a1 * a1;
  const w2 = N.fbm(x / 520 + 5, z / 520 + 9, 3) * 3.4;
  const m2 = M.smoothstep(N.fbm(x / 800 + 31, z / 800 + 17, 2), 0.38, 0.7);
  const d2 = duneProfile((x * 0.72 + z * 0.69) / 250 + w2) * 9 * m2;
  let h = big * 110 + d1 + d2 + (N.fbm(x / 90, z / 90, 2) - 0.5) * 2.2;
  const f = Math.min(
    M.smoothstep(Math.hypot(x - HOME.x, z - HOME.z), FLAT_R, FLAT_R + 420),
    M.smoothstep(Math.hypot(x - ENEMY.x, z - ENEMY.z), FLAT_R, FLAT_R + 420));
  return h * f;
}

export const TIMES = {
  day:    { elev: 36, az: 232, sunI: 5.2, sunC: 0xfff1dc, hemi: [0xbcd3ee, 0x9a7a52, 1.25], fog: 0xb9a78c, fogD: 0.000105, exp: 0.3, turb: 3.2, ray: 1.1, mie: 0.004, mieG: 0.82, env: 1.0 },
  sunset: { elev: 4.5, az: 196, sunI: 4.6, sunC: 0xffa65e, hemi: [0x9aa2c4, 0x8a5a38, 0.9], fog: 0xb07a55, fogD: 0.00013, exp: 0.3, turb: 8, ray: 2.6, mie: 0.006, mieG: 0.86, env: 0.9 },
  night:  { elev: 42, az: 215, sunI: 0.5, sunC: 0x9fb6e8, hemi: [0x27324e, 0x15120f, 0.7], fog: 0x0b0f18, fogD: 0.00012, exp: 0.62, turb: 2, ray: 0.4, mie: 0.002, mieG: 0.8, env: 0.14, night: true },
};

export function buildWorld(scene, renderer, T, Q) {
  const W = { colliders: [], dyn: [], lights: [] };

  // ---------- السماء والشمس
  const sky = new Sky(); sky.scale.setScalar(400000); scene.add(sky);
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = Q.shadows; sun.shadow.mapSize.setScalar(Q.shadowMap);
  const sc = sun.shadow.camera; sc.left = sc.bottom = -170; sc.right = sc.top = 170; sc.near = 10; sc.far = 1400;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6; sun.shadow.radius = 3.5;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x886644, 0.6); scene.add(hemi);
  scene.fog = new THREE.FogExp2(0xccb090, 0.00012);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const sunDir = new THREE.Vector3();
  let envRT = null;

  // نجوم
  const sg = new THREE.BufferGeometry(), sp = [];
  for (let i = 0; i < 1400; i++) { const v = new THREE.Vector3().randomDirection(); if (v.y < 0.02) v.y = Math.abs(v.y) + 0.02; v.multiplyScalar(60000); sp.push(v.x, v.y, v.z); }
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9, depthWrite: false }));
  stars.frustumCulled = false; scene.add(stars);

  W.setTime = (name) => {
    const p = TIMES[name]; W.time = name; W.preset = p;
    const u = sky.material.uniforms;
    const skyElev = p.night ? -6 : p.elev;
    const phi = M.degToRad(90 - skyElev), th = M.degToRad(p.az);
    const sv = new THREE.Vector3().setFromSphericalCoords(1, phi, th);
    u.sunPosition.value.copy(sv); u.turbidity.value = p.turb; u.rayleigh.value = p.ray; u.mieCoefficient.value = p.mie; u.mieDirectionalG.value = p.mieG;
    sunDir.setFromSphericalCoords(1, M.degToRad(90 - p.elev), th);
    sun.color.set(p.sunC); sun.intensity = p.sunI;
    hemi.color.set(p.hemi[0]); hemi.groundColor.set(p.hemi[1]); hemi.intensity = p.hemi[2];
    scene.fog.color.set(p.fog); scene.fog.density = p.fogD;
    renderer.toneMappingExposure = p.exp;
    stars.visible = !!p.night;
    // خريطة بيئة من السماء لانعكاسات المعدن
    const es = new THREE.Scene(), s2 = new Sky(); s2.scale.setScalar(1000);
    Object.keys(u).forEach(k => { const v = u[k].value; s2.material.uniforms[k].value = v && v.clone ? v.clone() : v; });
    es.add(s2);
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(es, 0, 1, 2000); scene.environment = envRT.texture;
    s2.material.dispose(); s2.geometry.dispose();
    scene.traverse(o => { if (o.material && o.material.envMapIntensity !== undefined) o.material.envMapIntensity = p.env * (o.material.userData.envK ?? 1); });
    W.lights.forEach(l => l.visible = !!p.night || name === 'sunset');
  };
  W.sunDir = sunDir; W.sun = sun;
  W.updateSun = (focus) => { // الظل يتبع مركز الاهتمام
    sun.target.position.copy(focus); sun.position.copy(focus).addScaledVector(sunDir, 600);
  };

  // ---------- المواد
  const mat = (o) => new THREE.MeshStandardMaterial(o);
  const MT = W.mats = {
    tan: mat({ color: 0xa8946a, map: T.panel, normalMap: T.panelN, roughnessMap: T.metalRough, metalnessMap: T.metalRough, roughness: 0.85, metalness: 0.35 }),
    olive: mat({ color: 0x5b6247, map: T.panel, normalMap: T.panelN, roughnessMap: T.metalRough, roughness: 0.9, metalness: 0.3 }),
    steel: mat({ color: 0xa9adb2, roughnessMap: T.metalRough, metalnessMap: T.metalRough, roughness: 0.55, metalness: 1 }),
    dark: mat({ color: 0x25262a, roughnessMap: T.metalRough, roughness: 0.8, metalness: 0.6 }),
    rubber: mat({ color: 0x17171a, roughness: 0.95, metalness: 0 }),
    glass: mat({ color: 0x0c1418, roughness: 0.08, metalness: 0.9 }),
    white: mat({ color: 0xe8e6de, roughness: 0.55, metalness: 0.05, flatShading: true }),
    concrete: mat({ color: 0xffffff, map: T.concrete, normalMap: T.concreteN, roughness: 0.92 }),
    asphalt: mat({ color: 0xffffff, map: T.asphalt, normalMap: T.asphaltN, roughness: 0.9 }),
    red: mat({ color: 0xa3261c, roughness: 0.6, metalness: 0.2 }),
    rock: mat({ color: 0x7d6a52, roughness: 1, flatShading: true }),
    trunk: mat({ color: 0x6b5438, normalMap: T.trunkN, roughness: 1 }),
    frond: mat({ map: T.frond, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 }),
    fence: mat({ map: T.fence, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.6 }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xffe2a8 }),
  };
  MT.glass.userData.envK = 1.6; MT.steel.userData.envK = 1.2;
  const corr = (col) => { const m = mat({ color: col, map: T.corr.clone(), normalMap: T.corrN.clone(), roughness: 0.6, metalness: 0.55, side: THREE.DoubleSide }); m.map.rotation = m.normalMap.rotation = Math.PI / 2; m.map.repeat.set(6, 2); m.normalMap.repeat.set(6, 2); return m; };
  MT.corrA = corr(0xb9b5a2); MT.corrB = corr(0x7d8a6c);
  const sh = (m, cast = true, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; return m; };
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = sh(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)); o.position.set(x, y, z); return o; };
  const cyl = (r1, r2, h, m, seg = 20) => sh(new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m));
  const tiled = (m, rx, ry) => { const c = m.clone(); ['map', 'normalMap'].forEach(k => { if (c[k]) { c[k] = c[k].clone(); c[k].repeat.set(rx, ry); } }); return c; };

  // ---------- التضاريس
  {
    const size = 15000, seg = Q.terrainSeg, g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2); g.translate(ENEMY.x / 2, 0, ENEMY.z / 2);
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), h = heightAt(x, z); p.setY(i, h);
      const v = 0.86 + (N.fbm(x / 700, z / 700, 3) - 0.5) * 0.36 + M.clamp(h / 90, -0.2, 0.3) * 0.25;
      const warm = N.fbm(x / 1900 + 8, z / 1900, 2);
      col[i * 3] = v * (1.0 + warm * 0.06); col[i * 3 + 1] = v * (0.97); col[i * 3 + 2] = v * (0.93 - warm * 0.1);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = mat({ map: T.sand, normalMap: T.sandN, roughness: 0.94, metalness: 0, vertexColors: true });
    m.map.repeat.set(size / 9, size / 9); m.normalMap.repeat.set(size / 9, size / 9);
    m.normalScale.set(0.55, 0.55); m.userData.envK = 0.5;
    const t = new THREE.Mesh(g, m); t.receiveShadow = true; scene.add(t); W.terrain = t;
  }
  { // أرض ممتدة حتى الأفق تحت حافة التضاريس
    const d = new THREE.Mesh(new THREE.CircleGeometry(45000, 48), mat({ color: 0xb89a70, roughness: 1 })); d.rotation.x = -Math.PI / 2; d.position.set(ENEMY.x / 2, -70, ENEMY.z / 2); scene.add(d);
  }
  // جبال بعيدة عند الأفق
  {
    const g = new THREE.CylinderGeometry(9500, 9500, 1, 220, 3, true), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i)), y = p.getY(i) + 0.5;
      const ridge = Math.pow(N.fbm(a * 5 + 10, 3, 5), 1.6) * 900 + N.fbm(a * 30, 9, 3) * 90;
      p.setY(i, y * ridge - 40); const k = 1 + y * 0.03; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat({ color: 0x8a7558, roughness: 1, side: THREE.BackSide, flatShading: true }));
    m.position.set(ENEMY.x / 2, 0, ENEMY.z / 2); scene.add(m);
  }
  // صخور مبعثرة
  {
    const g = new THREE.DodecahedronGeometry(1, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 0.7 + N.n2(p.getX(i) * 3 + 5, p.getY(i) * 3 + p.getZ(i) * 2) * 0.6; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k); }
    g.computeVertexNormals();
    const n = Q.rocks, im = new THREE.InstancedMesh(g, MT.rock, n), d = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 2400 + ENEMY.x / 2, z = -Math.random() * 6200 + 500, s = 0.6 + Math.pow(Math.random(), 3) * 7;
      d.position.set(x, heightAt(x, z) - s * 0.15, z); d.rotation.set(Math.random() * 3, Math.random() * 6, 0); d.scale.set(s, s * 0.8, s); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
    }
    im.castShadow = im.receiveShadow = true; scene.add(im);
  }

  // ---------- مجسمات
  const wheel = () => { const g = new THREE.Group(), t = cyl(0.72, 0.72, 0.5, MT.rubber, 22), h = cyl(0.36, 0.36, 0.54, MT.steel, 12); t.rotation.z = h.rotation.z = Math.PI / 2; g.add(t, h); return g; };

  // شاحنة ثقيلة 8×8 مع حمولة اختيارية
  W.truck = (paint, kind) => {
    const g = new THREE.Group();
    g.add(box(2.3, 0.5, 11, MT.dark, 0, 1.25, 0));
    [-4.3, -2.7, 1.9, 3.5].forEach(z => [-1.25, 1.25].forEach(x => { const w = wheel(); w.position.set(x, 0.72, z); g.add(w); }));
    // مقصورة
    const cab = new THREE.Group(); cab.position.set(0, 1.5, 4.5);
    cab.add(box(2.6, 1.9, 2.1, paint, 0, 0.95, 0), box(2.3, 0.75, 0.06, MT.glass, 0, 1.35, 1.07), box(0.06, 0.6, 1.1, MT.glass, 1.31, 1.35, 0.2), box(0.06, 0.6, 1.1, MT.glass, -1.31, 1.35, 0.2),
      box(2.7, 0.35, 0.4, MT.dark, 0, 0.1, 1.2), box(0.5, 0.9, 0.5, MT.dark, 1.0, 2.2, -0.7));
    g.add(cab, box(2.5, 1.2, 1.5, paint, 0, 2.1, 2.5), box(2.2, 0.9, 1.1, MT.dark, 0, 1.95, 1.2));
    if (kind === 'quad' || kind === 'octo') {
      // منصة بحاويات: أربع (2×2) أو ثمانٍ (4×2)
      const piv = new THREE.Group(); piv.position.set(0, 1.7, -4.6); g.add(piv);
      const cols = kind === 'quad' ? 2 : 4, cw = kind === 'quad' ? 1.05 : 0.6, len = kind === 'quad' ? 6.1 : 6.6;
      const pack = new THREE.Group();
      for (let r = 0; r < 2; r++) for (let c = 0; c < cols; c++) {
        const x = (c - (cols - 1) / 2) * (cw + 0.08), y = 0.25 + r * (cw + 0.08) + cw / 2;
        pack.add(box(cw, cw, len, paint, x, y, len / 2));
        pack.add(box(cw * 0.86, cw * 0.86, 0.06, MT.dark, x, y, len + 0.02));
        [1.2, 3, 4.8].forEach(zz => pack.add(box(cw + 0.06, cw + 0.06, 0.1, MT.dark, x, y, zz)));
      }
      pack.add(box(cols * (cw + 0.1), 0.25, len * 0.9, MT.dark, 0, 0.12, len / 2));
      piv.add(pack); pack.rotation.x = -M.degToRad(kind === 'quad' ? 38 : 62); g.userData.pack = pack;
      const ram = cyl(0.12, 0.12, 3, MT.steel, 8); ram.position.set(0, 1.0, 2.0); ram.rotation.x = 0.9; piv.add(ram);
      [[-1.9, -4.9], [1.9, -4.9], [-1.9, -0.6], [1.9, -0.6]].forEach(([x, z]) => { g.add(box(1.0, 0.16, 0.2, MT.dark, x * 0.75, 1.1, z)); const l = cyl(0.1, 0.1, 1.1, MT.steel, 8); l.position.set(x, 0.55, z); g.add(l); g.add(box(0.6, 0.08, 0.6, MT.dark, x, 0.04, z)); });
    } else if (kind === 'radar') {
      // رادار مصفوفة بوجه مسطح مائل
      g.add(box(2.6, 1.4, 4.2, paint, 0, 2.2, -2.6));
      const face = new THREE.Group(); face.position.set(0, 3.0, -2.4); face.rotation.x = -M.degToRad(62);
      face.add(box(3.6, 0.35, 4.8, paint, 0, 0, 0), box(3.1, 0.06, 4.2, MT.olive === paint ? MT.tan : MT.dark, 0, 0.2, 0));
      for (let i = 0; i < 5; i++) face.add(box(3.1, 0.08, 0.05, MT.steel, 0, 0.24, -1.8 + i * 0.9));
      g.add(face);
    } else if (kind === 'erector') {
      // ذراع رفع عمودية وطاولة إطلاق
      g.add(box(2.4, 0.4, 3, MT.dark, 0, 1.6, -5.2), box(0.5, 9.5, 0.5, paint, 0, 6.2, -4.1), box(1.4, 0.3, 0.9, MT.dark, 0, 6, -4.5), box(1.4, 0.3, 0.9, MT.dark, 0, 9.5, -4.5));
      for (let i = 0; i < 6; i++) g.add(box(0.5, 0.08, 0.9, MT.steel, 0, 2.6 + i * 1.5, -4.1));
    } else if (kind === 'cargo') g.add(box(2.5, 2.2, 6.4, paint, 0, 2.6, -1.9));
    return g;
  };

  // مدفع قريب المدى: برج بسبطانات دوّارة وقبة رادار
  W.gunMount = () => {
    const g = new THREE.Group(); g.add(box(2.6, 0.5, 2.6, MT.concrete, 0, 0.25, 0));
    const b = cyl(1.0, 1.15, 1.2, MT.tan, 16); b.position.y = 1.1; g.add(b);
    const top = new THREE.Group(); top.position.y = 1.9; g.add(top);
    const dome = sh(new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12, 0, 7, 0, 1.9), MT.white)); dome.scale.y = 1.6; dome.position.y = 0.8; top.add(dome);
    const br = new THREE.Group(); br.position.set(0, 0.4, 0.8); br.rotation.x = -0.35;
    for (let i = 0; i < 6; i++) { const c = cyl(0.045, 0.045, 2.2, MT.dark, 6); c.rotation.x = Math.PI / 2; c.position.set(Math.cos(i) * 0.13, Math.sin(i) * 0.13, 1.1); br.add(c); }
    top.add(br, box(1.2, 0.8, 1.1, MT.tan, 0, 0.3, 0)); g.userData.top = top; return g;
  };
  // موجّه شعاع: برج بعدسة
  W.beamMount = () => {
    const g = new THREE.Group(); g.add(box(2.4, 2.2, 5, MT.tan, 0, 1.4, 0));
    const p = cyl(0.25, 0.3, 1.2, MT.dark, 10); p.position.set(0, 3.1, 1.2); g.add(p);
    const h = new THREE.Group(); h.position.set(0, 4, 1.2); h.add(box(1.2, 1.0, 1.5, MT.steel, 0, 0, 0));
    const l = cyl(0.36, 0.36, 0.12, MT.glass, 20); l.rotation.x = Math.PI / 2; l.position.set(0, 0, 0.78); h.add(l); g.add(h); g.userData.top = h; return g;
  };

  const hangar = (r, len, m) => {
    const g = new THREE.Group(), a = sh(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 28, 1, true, 0, Math.PI), m)); a.rotation.z = Math.PI / 2; g.add(a);
    [-1, 1].forEach(s => { const e = sh(new THREE.Mesh(new THREE.CircleGeometry(r, 28, 0, Math.PI), m)); e.rotation.y = s * Math.PI / 2; e.position.x = s * len / 2; g.add(e); g.add(box(0.2, r * 0.62, r * 1.1, MT.dark, s * (len / 2 + 0.05), r * 0.31, 0)); });
    for (let i = 0; i < 5; i++) { const rb = sh(new THREE.Mesh(new THREE.TorusGeometry(r + 0.05, 0.12, 6, 20, Math.PI), MT.steel)); rb.rotation.y = Math.PI / 2; rb.position.x = -len / 2 + (i + 0.5) * len / 5; g.add(rb); }
    return g;
  };
  const radome = (r) => {
    const g = new THREE.Group(), b = cyl(r * 0.62, r * 0.7, r * 1.3, MT.concrete, 16); b.position.y = r * 0.65; g.add(b);
    const d = sh(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), MT.white)); d.position.y = r * 1.3 + r * 0.72; g.add(d);
    const rail = sh(new THREE.Mesh(new THREE.TorusGeometry(r * 0.78, 0.06, 6, 24), MT.steel)); rail.rotation.x = Math.PI / 2; rail.position.y = r * 1.45; g.add(rail);
    g.add(box(1.2, 2.2, 0.2, MT.dark, 0, 1.1, r * 0.7)); return g;
  };
  const tank = (r, h) => {
    const g = new THREE.Group(), b = cyl(r, r, h, MT.steel, 24); b.position.y = h / 2; g.add(b);
    const c = sh(new THREE.Mesh(new THREE.SphereGeometry(r, 24, 8, 0, 7, 0, Math.PI / 2), MT.steel)); c.scale.y = 0.28; c.position.y = h; g.add(c);
    [0.3, 0.62, 0.92].forEach(k => { const t = new THREE.Mesh(new THREE.TorusGeometry(r + 0.03, 0.05, 6, 28), MT.dark); t.rotation.x = Math.PI / 2; t.position.y = h * k; g.add(t); });
    g.add(box(0.5, h, 0.08, MT.dark, r + 0.1, h / 2, 0)); return g;
  };
  const tower = () => {
    const g = new THREE.Group(); g.add(box(4, 13, 4, MT.concrete, 0, 6.5, 0), box(6.4, 0.4, 6.4, MT.concrete, 0, 13.2, 0), box(5.6, 2.2, 5.6, MT.glass, 0, 14.5, 0), box(6.6, 0.4, 6.6, MT.concrete, 0, 15.8, 0));
    [[-2.8, -2.8], [2.8, -2.8], [-2.8, 2.8], [2.8, 2.8]].forEach(([x, z]) => g.add(box(0.2, 2.2, 0.2, MT.dark, x, 14.5, z)));
    const a = cyl(0.05, 0.05, 5, MT.steel, 6); a.position.set(1.5, 18.4, 1.5); g.add(a); const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a18 })); l.position.set(1.5, 21, 1.5); g.add(l); W.dyn.push(t => l.visible = (t % 1.4) < 0.5);
    return g;
  };
  const guardTower = () => { const g = new THREE.Group();[[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([x, z]) => { const l = cyl(0.09, 0.09, 6.4, MT.steel, 6); l.position.set(x * 1.1, 3.2, z * 1.1); g.add(l); }); g.add(box(3, 0.2, 3, MT.dark, 0, 6.4, 0), box(3, 1, 0.1, MT.olive, 0, 7, 1.45), box(3, 1, 0.1, MT.olive, 0, 7, -1.45), box(0.1, 1, 3, MT.olive, 1.45, 7, 0), box(0.1, 1, 3, MT.olive, -1.45, 7, 0), box(3.6, 0.15, 3.6, MT.corrA, 0, 8.8, 0)); return g; };
  const palm = (h) => {
    const g = new THREE.Group(), lean = (Math.random() - 0.5) * 1.6, pts = [];
    for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push(new THREE.Vector3(lean * t * t, h * t, 0)); }
    const tr = sh(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.26, 7), MT.trunk)); tr.material.normalMap.repeat.set(2, 6); g.add(tr);
    const fg = new THREE.PlaneGeometry(1.5, 5.2, 2, 7); fg.translate(0, 2.6, 0);
    const p = fg.attributes.position; for (let i = 0; i < p.count; i++) { const t = p.getY(i) / 5.2, x = p.getX(i); p.setZ(i, -t * t * 2.6 - Math.abs(x) * 0.5); } fg.computeVertexNormals();
    const top = new THREE.Group(); top.position.set(lean, h, 0); top.rotation.y = Math.random() * 6;
    for (let i = 0; i < 13; i++) { const f = sh(new THREE.Mesh(fg, MT.frond), true, false), piv = new THREE.Group(); f.rotation.x = -(0.5 + (i % 3) * 0.33 + Math.random() * 0.15); piv.rotation.y = i * 2.4; const s = 0.85 + Math.random() * 0.3; f.scale.setScalar(s); piv.add(f); top.add(piv); }
    g.add(top); return g;
  };
  const lampPost = (root, x, z, ry) => { const g = new THREE.Group(), p = cyl(0.08, 0.11, 8, MT.steel, 8); p.position.y = 4; g.add(p, box(0.16, 0.1, 1.5, MT.steel, 0, 8, 0.7)); const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.5), MT.lamp); l.position.set(0, 7.94, 1.3); g.add(l); g.position.set(x, 0, z); g.rotation.y = ry; root.add(g); W.lights.push(l); };

  // ---------- قاعدة كاملة
  W.buildBase = (origin, enemy) => {
    const B = new THREE.Group(); B.position.copy(origin); scene.add(B);
    const paint = enemy ? MT.olive : MT.tan, col = (x, z, r, h, tag) => W.colliders.push({ x: origin.x + x, z: origin.z + z, r, h, tag, enemy });
    const flat = (w, d, m, x, z, y = 0.06, rx = w / 7, ry = d / 7) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, d), tiled(m, rx, ry)); o.rotation.x = -Math.PI / 2; o.position.set(x, y, z); o.receiveShadow = true; B.add(o); return o; };
    // طرق ومنصات
    flat(520, 11, MT.asphalt, 0, 60); flat(11, 380, MT.asphalt, -30, -10, 0.05); flat(11, 240, MT.asphalt, 95, -30, 0.05);
    flat(46, 46, MT.concrete, 0, 0, 0.09); flat(120, 70, MT.concrete, -105, -30, 0.07); flat(70, 50, MT.concrete, 96, -60, 0.07);
    for (let i = -25; i <= 25; i++) flat(4, 0.3, new THREE.MeshStandardMaterial({ color: 0xd8d2b8, roughness: 0.9 }), i * 10, 60, 0.075, 1, 1);
    // حظائر
    [[-120, -50, MT.corrA], [-120, -14, MT.corrB], [-84, 26, MT.corrA]].forEach(([x, z, m], i) => { const h = hangar(11, 34, m); h.position.set(x, 0, z); if (i === 2) h.rotation.y = Math.PI / 2; B.add(h); col(x, z, 19, 11, 'hangar'); });
    const rd = radome(7); rd.position.set(-58, 0, -96); B.add(rd); col(-58, -96, 8, 21, 'radome');
    const tw = tower(); tw.position.set(-52, 0, 34); B.add(tw); col(-52, 34, 4, 16, 'tower');
    [[84, -70], [98, -70], [91, -56]].forEach(([x, z]) => { const t = tank(5, 8); t.position.set(x, 0, z); B.add(t); col(x, z, 5.5, 9, 'tank'); });
    B.add(box(26, 5, 12, MT.concrete, 60, 2.5, 96)); B.add(box(27, 0.4, 13, MT.dark, 60, 5.2, 96)); col(60, 96, 14, 5, 'bldg');
    for (let i = 0; i < 6; i++) B.add(box(1.6, 1.4, 0.1, MT.glass, 50 + i * 4, 3, 89.95));
    // مركز القيادة المحصّن (الهدف في قاعدة الخصم)
    if (enemy) {
      const bk = new THREE.Group(); bk.position.set(0, 0, 0);
      bk.add(box(30, 7, 22, MT.concrete, 0, 3.5, 0), box(34, 1.2, 26, MT.concrete, 0, 7.6, 0), box(8, 4, 3, MT.dark, 0, 2, 11.5));
      const d = sh(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.5, 20), paint)); d.position.set(8, 8.5, -4); bk.add(d);
      const dish = sh(new THREE.Mesh(new THREE.SphereGeometry(2.4, 18, 8, 0, 7, 0, 1.1), MT.white)); dish.rotation.x = Math.PI - 0.7; dish.position.set(8, 11.4, -4); bk.add(dish);
      const a = cyl(0.08, 0.14, 14, MT.steel, 6); a.position.set(-10, 15, 6); bk.add(a);
      B.add(bk); col(0, 0, 18, 9, 'hq'); W.enemyHQ = bk;
    }
    // سياج
    const R = 215, fm = tiled(MT.fence, R * 2 / 2.4, 1);
    [[0, -R, 0], [0, R, 0], [-R, 0, 1], [R, 0, 1]].forEach(([x, z, r]) => { const f = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, 3.0), fm); f.position.set(x, 1.5, z); f.rotation.y = r * Math.PI / 2; B.add(f); });
    { const n = 4 * 36, im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 2.9, 5), MT.steel, n), d = new THREE.Object3D(); let k = 0;
      for (let s = 0; s < 4; s++) for (let i = 0; i < 36; i++) { const t = -R + (i / 36) * R * 2; d.position.set(s < 2 ? t : (s === 2 ? -R : R), 1.45, s < 2 ? (s === 0 ? -R : R) : t); d.updateMatrix(); im.setMatrixAt(k++, d.matrix); } im.castShadow = true; B.add(im); }
    [[-R + 6, -R + 6], [R - 6, -R + 6], [-R + 6, R - 6], [R - 6, R - 6]].forEach(([x, z]) => { const g = guardTower(); g.position.set(x, 0, z); B.add(g); });
    // ساتر ترابي حول السياج + سلك شائك ملفوف أعلى السياج + حواجز خرسانية عند البوابات
    { const bm = MT.berm || (MT.berm = mat({ color: 0xf0d3a0, map: T.sand, roughness: 1, metalness: 0 })), wm = MT.wire || (MT.wire = mat({ color: 0x3b3d40, roughness: 0.5, metalness: 0.8 }));
      const sh2 = new THREE.Shape(); sh2.moveTo(-7, 0); sh2.lineTo(-1.8, 2.2); sh2.lineTo(1.8, 2.2); sh2.lineTo(7, 0); sh2.closePath();
      const seg = (len) => { const g = new THREE.ExtrudeGeometry(sh2, { depth: len, bevelEnabled: false }); g.translate(0, 0, -len / 2); return g; }, D = R + 10, gap = [40, 82];
      const berm = (x, z, len, ry) => { const m = new THREE.Mesh(seg(len), bm); m.position.set(x, 0, z); m.rotation.y = ry; m.receiveShadow = true; m.castShadow = true; B.add(m); };
      berm(0, -D, D * 2 + 11, Math.PI / 2); berm(0, D, D * 2 + 11, Math.PI / 2);
      for (const sx of [-D, D]) { const a1 = -D - 5, b1 = gap[0], a2 = gap[1], b2 = D + 5; berm(sx, (a1 + b1) / 2, b1 - a1, 0); berm(sx, (a2 + b2) / 2, b2 - a2, 0); }
      const helix = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / 0.9), pts = []; for (let i = 0; i <= n * 8; i++) { const t = i / (n * 8), a = i / 8 * Math.PI * 2; pts.push(new THREE.Vector3(x0 + (x1 - x0) * t + (z1 !== z0 ? Math.cos(a) * 0.38 : 0), 3.05 + Math.sin(a) * 0.38, z0 + (z1 - z0) * t + (z1 === z0 ? Math.cos(a) * 0.38 : 0))); }
        const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 8, 0.035, 3, false), wm); B.add(m); };
      helix(-R, -R, R, -R); helix(-R, R, R, R); helix(-R, -R, -R, R); helix(R, -R, R, R);
      const jm = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 1.1, 0.9), MT.concrete, 24), d = new THREE.Object3D(); let k = 0;
      for (const sx of [-1, 1]) for (let i = 0; i < 12; i++) { d.position.set(sx * (R + 22) + sx * (i % 2) * 3, 0.55, gap[0] + 4 + Math.floor(i / 2) * 6.5); d.rotation.y = Math.PI / 2 + (i % 2 ? 0.3 : -0.3); d.updateMatrix(); jm.setMatrixAt(k++, d.matrix); }
      jm.castShadow = jm.receiveShadow = true; B.add(jm); }
    // نخيل وإنارة على جانب الطريق
    for (let i = 0; i < Q.palms; i++) { const x = -230 + i * (460 / Q.palms) + Math.random() * 6, p = palm(6 + Math.random() * 4); p.position.set(x, 0, (i % 2 ? 69 : 51) + Math.random() * 2); B.add(p); }
    for (let i = 0; i < 6; i++) { const p = palm(6 + Math.random() * 3); p.position.set(40 + Math.random() * 40, 0, 104 + Math.random() * 14); B.add(p); }
    for (let i = -4; i <= 4; i++) lampPost(B, i * 50 + 12, 53.5, 0);
    // مركبات ومنظومات
    const put = (o, x, z, ry) => { o.position.set(x, 0, z); o.rotation.y = ry; B.add(o); return o; };
    put(W.truck(paint, 'cargo'), -70, 60, Math.PI / 2); put(W.truck(paint, 'cargo'), 150, 62, -Math.PI / 2); put(W.truck(paint, 'cargo'), -98, 4, 0.3);
    const sys = { quad: put(W.truck(paint, 'quad'), 70, -8, Math.PI + 0.25), octo: put(W.truck(paint, 'octo'), 122, -18, Math.PI - 0.2), radar: put(W.truck(paint, 'radar'), 52, 22, Math.PI), gun: put(W.gunMount(), 30, -40, 0), beam: put(W.beamMount(), -24, -52, Math.PI) };
    col(70, -8, 6, 4, 'sys'); col(122, -18, 6, 5, 'sys'); col(52, 22, 5, 5, 'sys');
    for (let i = 0; i < 14; i++) { const b = box(2.4, 0.9, 0.6, MT.concrete, -14 + i * 2.6, 0.45, 28); B.add(b); }
    for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) B.add(box(2.4, 2.5, 6, [MT.red, MT.olive, MT.tan, MT.steel][(i + j) % 4], -150 + i * 3.2, 1.25 + (i % 2 && j ? 2.5 : 0), 20 + j * 7));
    return { group: B, sys };
  };

  // ---------- الصاروخ الهجومي: مرحلتان بزعانف وفوّهة
  W.buildRocket = (spec = {}) => {
    const L = spec.len ?? 11, R = spec.r ?? 0.45, bl = L * 0.38, col = spec.color ?? 0xb7a67c;
    const body = mat({ color: col, map: T.panel, normalMap: T.panelN, roughnessMap: T.metalRough, metalnessMap: T.metalRough, roughness: 0.7, metalness: 0.55 });
    const g = new THREE.Group(), up = new THREE.Group(), bo = new THREE.Group(); g.add(up, bo);
    // المرحلة العليا: أنف مقوّس
    const pts = []; const ul = L - bl, nl = ul * 0.36;
    pts.push(new THREE.Vector2(R * 0.8, 0)); pts.push(new THREE.Vector2(R, 0.15)); pts.push(new THREE.Vector2(R, ul - nl));
    for (let i = 1; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(R * Math.sqrt(1 - t * t) * (1 - t * 0.25) + 0.012, ul - nl + nl * t)); }
    const u = sh(new THREE.Mesh(new THREE.LatheGeometry(pts, 28), body)); u.position.y = bl - L / 2; up.add(u);
    const band = (y, h, m, r = R + 0.012, par = up) => { const b = cyl(r, r, h, m, 28); b.position.y = y - L / 2; par.add(b); };
    band(bl + ul * 0.5, 0.22, MT.dark); band(bl + ul - nl - 0.1, 0.12, MT.red); band(bl + 0.5, 0.1, MT.steel);
    const fin = (span, chord, tip, m) => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(span, -chord * 0.1); s.lineTo(span, tip - chord * 0.1); s.lineTo(0, chord); const e = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false }); e.translate(0, 0, -0.025); return e; };
    const ufg = fin(R * 1.3, 0.9, 0.3);
    for (let i = 0; i < 4; i++) { const f = sh(new THREE.Mesh(ufg, body)), p = new THREE.Group(); f.position.set(R * 0.95, bl + 0.4 - L / 2, 0); p.rotation.y = i * Math.PI / 2 + Math.PI / 4; p.add(f); up.add(p); }
    const un = cyl(R * 0.45, R * 0.7, 0.5, MT.dark, 16); un.position.y = bl - 0.2 - L / 2; up.add(un);
    // المعزز
    const RB = R * 1.12, b = cyl(RB, RB, bl - 0.25, body, 28); b.position.y = (bl - 0.25) / 2 + 0.25 - L / 2; bo.add(b);
    const ic = cyl(R, RB, 0.35, MT.dark, 28); ic.position.y = bl + 0.02 - L / 2; bo.add(ic);
    band(0.9, 0.16, MT.dark, RB + 0.012, bo); band(bl * 0.6, 0.1, MT.steel, RB + 0.012, bo);
    const bfg = fin(R * 2.2, 1.7, 0.6);
    for (let i = 0; i < 4; i++) { const f = sh(new THREE.Mesh(bfg, body)), p = new THREE.Group(); f.position.set(RB * 0.95, 0.3 - L / 2, 0); p.rotation.y = i * Math.PI / 2; p.add(f); bo.add(p); }
    const nz = sh(new THREE.Mesh(new THREE.CylinderGeometry(RB * 0.55, RB * 0.82, 0.55, 20, 1, true), MT.dark)); nz.material = MT.dark.clone(); nz.material.side = THREE.DoubleSide; nz.position.y = 0.05 - L / 2; bo.add(nz);
    g.userData = { L, up, bo, tail: -L / 2, tailUp: bl - L / 2 - 0.4 };
    return g;
  };

  W.home = W.buildBase(HOME, false);
  W.enemy = W.buildBase(ENEMY, true);
  // منصة الإطلاق الهجومية في مركز قاعدتنا
  const tel = W.truck(MT.tan, 'erector'); tel.position.set(0, 0, 5.1); scene.add(tel); W.tel = tel;
  const table = cyl(1.6, 1.9, 0.5, MT.dark, 20); table.position.set(0, 0.34, 0); scene.add(table);
  W.padY = 0.6;
  return W;
}
