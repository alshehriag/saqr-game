// المؤثرات: جسيمات الدخان واللهب، الانفجارات، المعالجة اللاحقة
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const M = THREE.MathUtils;

// ---------- نظام جسيمات بلوحات موجّهة للكاميرا
class Particles {
  constructor(scene, tex, cap, additive) {
    this.cap = cap; this.n = 0; this.additive = additive;
    const g = new THREE.InstancedBufferGeometry(); g.index = new THREE.PlaneGeometry(1, 1).index;
    const base = new THREE.PlaneGeometry(1, 1); g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.iDat = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.iPos); g.setAttribute('iDat', this.iDat); g.setAttribute('iCol', this.iCol);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 }, uLight: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: new THREE.Color(0.4, 0.4, 0.45) }, uFlash: { value: new THREE.Vector4(0, 0, 0, 0) }, uFlashC: { value: new THREE.Color(1, 0.6, 0.25) } },
      vertexShader: `attribute vec3 iPos; attribute vec4 iDat; attribute vec3 iCol; varying vec2 vUv; varying vec3 vCol; varying float vA; varying float vFog; varying float vFl;
        uniform float fogDensity; uniform vec4 uFlash;
        void main(){ vec4 mv = modelViewMatrix * vec4(iPos,1.0); float c=cos(iDat.z), s=sin(iDat.z); vec2 p = mat2(c,-s,s,c)*position.xy*iDat.x; mv.xy += p;
          float d=length(mv.xyz); vUv=uv; vCol=iCol; vA=iDat.y*smoothstep(4.0,14.0+iDat.x*2.2,d); vFog = 1.0-exp(-fogDensity*fogDensity*d*d);
          float fd = distance(iPos,uFlash.xyz); vFl = uFlash.w/(1.0+fd*fd*0.0004);
          gl_Position = projectionMatrix*mv; }`,
      fragmentShader: additive
        ? `uniform sampler2D map; varying vec2 vUv; varying vec3 vCol; varying float vA; varying float vFog;
           void main(){ vec4 t=texture2D(map,vUv); float a=t.a*vA; a*=a*1.4; gl_FragColor=vec4(vCol*a*(1.0-vFog),1.0); }`
        : `uniform sampler2D map; uniform vec3 fogColor,uLight,uAmb,uFlashC; varying vec2 vUv; varying vec3 vCol; varying float vA; varying float vFog; varying float vFl;
           void main(){ vec4 t=texture2D(map,vUv); float a=t.a*vA; if(a<0.004) discard;
             vec3 c = vCol*(uAmb + uLight*t.r) + uFlashC*vFl*t.r; c=mix(c,fogColor,vFog); gl_FragColor=vec4(c,a); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    if (additive) { this.mat.blending = THREE.CustomBlending; this.mat.blendSrc = THREE.OneFactor; this.mat.blendDst = THREE.OneFactor; }
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 11 : 10; scene.add(this.mesh);
    this.geo = g;
    // حالة على المعالج
    this.v = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.s0 = new Float32Array(cap); this.s1 = new Float32Array(cap); this.a0 = new Float32Array(cap); this.spin = new Float32Array(cap);
    this.drag = new Float32Array(cap); this.rise = new Float32Array(cap); this.c0 = new Float32Array(cap * 3); this.c1 = new Float32Array(cap * 3);
  }
  spawn(o) {
    let i = this.n; if (i >= this.cap) { i = (Math.random() * this.cap) | 0; } else this.n++;
    const p = this.iPos.array, v = this.v;
    p[i * 3] = o.x; p[i * 3 + 1] = o.y; p[i * 3 + 2] = o.z; v[i * 3] = o.vx || 0; v[i * 3 + 1] = o.vy || 0; v[i * 3 + 2] = o.vz || 0;
    this.life[i] = 0; this.max[i] = o.life; this.s0[i] = o.s0; this.s1[i] = o.s1 ?? o.s0; this.a0[i] = o.a ?? 1; this.spin[i] = o.spin ?? (Math.random() - 0.5) * 0.8;
    this.drag[i] = o.drag ?? 1; this.rise[i] = o.rise ?? 0; this.iDat.array[i * 4 + 2] = Math.random() * 6.28;
    const c = o.c0, e = o.c1 || o.c0; this.c0.set(c, i * 3); this.c1.set(e, i * 3);
  }
  update(dt, wind) {
    const p = this.iPos.array, d = this.iDat.array, col = this.iCol.array, v = this.v;
    for (let i = 0; i < this.n; i++) {
      this.life[i] += dt; let t = this.life[i] / this.max[i];
      if (t >= 1) { // حذف بالتبديل مع الأخير
        const l = --this.n; if (i !== l) {
          for (let k = 0; k < 3; k++) { p[i * 3 + k] = p[l * 3 + k]; v[i * 3 + k] = v[l * 3 + k]; this.c0[i * 3 + k] = this.c0[l * 3 + k]; this.c1[i * 3 + k] = this.c1[l * 3 + k]; }
          d[i * 4 + 2] = d[l * 4 + 2];
          this.life[i] = this.life[l]; this.max[i] = this.max[l]; this.s0[i] = this.s0[l]; this.s1[i] = this.s1[l]; this.a0[i] = this.a0[l]; this.spin[i] = this.spin[l]; this.drag[i] = this.drag[l]; this.rise[i] = this.rise[l];
        } i--; continue;
      }
      const k = Math.exp(-this.drag[i] * dt); v[i * 3] *= k; v[i * 3 + 1] = v[i * 3 + 1] * k + this.rise[i] * dt; v[i * 3 + 2] *= k;
      p[i * 3] += (v[i * 3] + wind.x * t) * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += (v[i * 3 + 2] + wind.z * t) * dt;
      const e = 1 - (1 - t) * (1 - t);
      d[i * 4] = this.s0[i] + (this.s1[i] - this.s0[i]) * e;
      d[i * 4 + 1] = this.a0[i] * Math.min(1, t * 12) * (1 - t) * (this.additive ? 1 : (1 - t * 0.4));
      d[i * 4 + 2] += this.spin[i] * dt;
      const ct = Math.min(1, t * 2.5);
      for (let c = 0; c < 3; c++) col[i * 3 + c] = this.c0[i * 3 + c] + (this.c1[i * 3 + c] - this.c0[i * 3 + c]) * ct;
    }
    this.geo.instanceCount = this.n;
    this.iPos.needsUpdate = this.iDat.needsUpdate = this.iCol.needsUpdate = true;
  }
}

export function buildFX(scene, renderer, camera, T, W, Q) {
  const F = { rate: 1 };
  const smoke = F.smoke = new Particles(scene, T.puff, 3200, false);
  const fire = F.fire = new Particles(scene, T.puff, 1000, true);
  const wind = new THREE.Vector3(3.5, 0, 1.5);
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  // ---------- لهب المحرك: مخروطان متوهجان + هالة
  const flameMat = (inner) => new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uPow: { value: 1 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform float uT;
      void main(){ vUv=uv; vec3 p=position; float w = (1.0-uv.y); p.x += sin(uT*37.0+uv.y*9.0)*0.05*w; p.z += cos(uT*31.0+uv.y*7.0)*0.05*w;
        vec4 mv=modelViewMatrix*vec4(p,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform float uT; uniform float uPow;
      void main(){ float along = vUv.y; float rim = pow(abs(dot(normalize(vN),vV)), ${inner ? '1.2' : '2.2'});
        float dia = 0.75+0.25*sin(along*${inner ? '34.0' : '18.0'} - uT*60.0);
        float a = rim * pow(along, ${inner ? '0.9' : '1.5'}) * dia;
        vec3 c = mix(vec3(1.0,0.32,0.06), vec3(1.0,0.86,0.6), pow(along,2.0)); ${inner ? 'c = mix(c, vec3(0.85,0.92,1.0), along*0.8);' : ''}
        gl_FragColor = vec4(c*a*uPow*${inner ? '5.0' : '2.2'},1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, side: THREE.DoubleSide,
  });
  F.makeFlame = (r, len) => {
    const g = new THREE.Group();
    const cone = (rr, ll, inner) => { const geo = new THREE.CylinderGeometry(rr, rr * 0.05, ll, 16, 12, true); geo.translate(0, -ll / 2, 0); const m = new THREE.Mesh(geo, flameMat(inner)); m.renderOrder = 12; return m; };
    const a = cone(r * 1.25, len, false), b = cone(r * 0.7, len * 0.55, true);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffc890, fog: false })); glow.scale.setScalar(r * 9); glow.renderOrder = 13;
    const light = new THREE.PointLight(0xffa860, 0, 260, 1.6); light.position.y = -len * 0.3;
    g.add(a, b, glow); g.userData = { a, b, glow, light, r, len };
    g.userData.set = (pow, t) => { g.visible = pow > 0.01; a.material.uniforms.uT.value = b.material.uniforms.uT.value = t; a.material.uniforms.uPow.value = b.material.uniforms.uPow.value = pow;
      const fl = 0.9 + Math.sin(t * 53) * 0.06 + Math.sin(t * 91) * 0.04; a.scale.set(1, pow * fl, 1); b.scale.set(1, pow * fl, 1); glow.material.opacity = pow * 0.7; glow.scale.setScalar(r * 9 * (0.8 + pow * 0.4) * fl); light.intensity = pow * 900 * (W.preset.night ? 1 : 0.5) * fl; };
    return g;
  };

  // ---------- ذيل الدخان (طبقات: لهب قصير، دخان أبيض كثيف، ثم رمادي يتمدد)
  const lit = () => W.preset.night ? [0.5, 0.55, 0.68] : (W.time === 'sunset' ? [1.0, 0.82, 0.66] : [1, 0.98, 0.94]);
  F.trail = (pos, dir, speed, dt, o) => {
    const st = o.state; st.acc = (st.acc || 0) + dt * (o.rate ?? 55) * F.rate;
    const L = lit(), k = o.size ?? 1;
    while (st.acc >= 1) {
      st.acc -= 1; const j = Math.random();
      tmp.copy(pos).addScaledVector(dir, -j * speed * dt);
      const sx = (Math.random() - 0.5) * 5 * k, sy = (Math.random() - 0.5) * 5 * k, sz = (Math.random() - 0.5) * 5 * k;
      smoke.spawn({ x: tmp.x, y: tmp.y, z: tmp.z, vx: -dir.x * 26 + sx, vy: -dir.y * 26 + sy, vz: -dir.z * 26 + sz, life: (o.life ?? 5.5) * (0.7 + Math.random() * 0.6), s0: 1.6 * k, s1: (11 + Math.random() * 8) * k, a: o.alpha ?? 0.62, drag: 1.6, rise: 0.8,
        c0: [L[0] * 1.3, L[1] * 1.18, L[2] * 1.05], c1: [L[0] * 1.0, L[1] * 1.0, L[2] * 1.0] });
      if (Math.random() < 0.5) fire.spawn({ x: tmp.x, y: tmp.y, z: tmp.z, vx: -dir.x * 40 + sx, vy: -dir.y * 40 + sy, vz: -dir.z * 40 + sz, life: 0.22, s0: 1.5 * k, s1: 3.4 * k, a: 0.9, drag: 2, c0: [1.6, 0.8, 0.3], c1: [0.8, 0.2, 0.04] });
    }
  };
  // سحابة الإقلاع: دخان وغبار يندفعان أفقياً على الأرض
  F.padBlast = (pos, dt, pow) => {
    const L = lit(), n = Math.ceil(70 * dt * pow * F.rate);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, sp = 8 + Math.random() * 20, dusty = Math.random() < 0.45;
      smoke.spawn({ x: pos.x + Math.cos(a) * 1.5, y: pos.y + 0.6 + Math.random() * 1.2, z: pos.z + Math.sin(a) * 1.5, vx: Math.cos(a) * sp, vy: 1 + Math.random() * 5, vz: Math.sin(a) * sp, life: 6 + Math.random() * 5, s0: 3, s1: 20 + Math.random() * 16, a: dusty ? 0.5 : 0.7, drag: 0.9, rise: 1.6,
        c0: dusty ? [L[0] * 0.95, L[1] * 0.8, L[2] * 0.6] : [L[0] * 1.25, L[1] * 1.18, L[2] * 1.08], c1: dusty ? [L[0] * 0.8, L[1] * 0.68, L[2] * 0.5] : [L[0] * 0.92, L[1] * 0.92, L[2] * 0.92] });
    }
  };

  // ---------- انفجارات
  const firePool = []; let firePi = 0; for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xff7a30, 0, 140, 1.7); scene.add(l); firePool.push(l); }
  const flashes = []; for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffb060, 0, 900, 1.3); scene.add(l); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0, color: new THREE.Color(1, 0.75, 0.46).multiplyScalar(6) })); s.renderOrder = 14; scene.add(s); flashes.push({ l, s, t: 9, k: 1 }); }
  const rings = [], ringGeo = new THREE.RingGeometry(0.86, 1, 64); ringGeo.rotateX(-Math.PI / 2);
  const shellGeo = new THREE.SphereGeometry(1, 24, 16);
  const debrisN = 140, debris = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.9 }), debrisN);
  debris.castShadow = true; debris.frustumCulled = false; scene.add(debris);
  const dd = [], dObj = new THREE.Object3D(); for (let i = 0; i < debrisN; i++) { dd.push({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), s: 1, t: 0 }); dObj.scale.setScalar(0); dObj.updateMatrix(); debris.setMatrixAt(i, dObj.matrix); }
  let dNext = 0; const fires = [], decals = [];
  F.flashAmt = 0; F.lastBlast = new THREE.Vector3();

  F.explode = (pos, k = 1, o = {}) => {
    const ground = !!o.ground, L = lit();
    F.lastBlast.copy(pos); F.flashAmt = Math.max(F.flashAmt, Math.min(1.4, k));
    const fl = flashes.sort((a, b) => b.t - a.t)[0]; fl.t = 0; fl.k = k; fl.l.position.copy(pos).setY(pos.y + (ground ? 6 * k : 0)); fl.s.position.copy(fl.l.position);
    // كرة النار
    for (let i = 0; i < 46 * F.rate; i++) { tmp.randomDirection(); if (ground) tmp.y = Math.abs(tmp.y) * 0.9; const sp = (10 + Math.random() * 30) * k;
      fire.spawn({ x: pos.x + tmp.x * 2 * k, y: pos.y + tmp.y * 2 * k, z: pos.z + tmp.z * 2 * k, vx: tmp.x * sp, vy: tmp.y * sp + (ground ? 8 * k : 0), vz: tmp.z * sp, life: 0.7 + Math.random() * 0.9, s0: 5 * k, s1: (16 + Math.random() * 12) * k, a: 1, drag: 2.2, rise: 6, c0: [2.2, 1.5, 0.7], c1: [1.2, 0.3, 0.05] }); }
    // دخان أسود يتحول رمادياً ويرتفع
    for (let i = 0; i < 60 * F.rate; i++) { tmp.randomDirection(); if (ground) tmp.y = Math.abs(tmp.y); const sp = (6 + Math.random() * 26) * k;
      smoke.spawn({ x: pos.x + tmp.x * 3 * k, y: pos.y + tmp.y * 3 * k, z: pos.z + tmp.z * 3 * k, vx: tmp.x * sp, vy: tmp.y * sp + (ground ? 10 * k : 2), vz: tmp.z * sp, life: 6 + Math.random() * 7, s0: 6 * k, s1: (26 + Math.random() * 22) * k, a: 0.8, drag: 1.1, rise: ground ? 3.2 : 1.2, c0: [0.12, 0.1, 0.09], c1: [L[0] * 0.42, L[1] * 0.4, L[2] * 0.38] }); }
    if (ground) {
      // غبار على شكل حلقة تندفع على الأرض
      for (let i = 0; i < 70 * F.rate; i++) { const a = Math.random() * 6.283, sp = (30 + Math.random() * 50) * k;
        smoke.spawn({ x: pos.x + Math.cos(a) * 4, y: pos.y + 1 + Math.random() * 2, z: pos.z + Math.sin(a) * 4, vx: Math.cos(a) * sp, vy: 2 + Math.random() * 6, vz: Math.sin(a) * sp, life: 5 + Math.random() * 6, s0: 5 * k, s1: (22 + Math.random() * 16) * k, a: 0.55, drag: 1.0, rise: 1.2, c0: [L[0] * 0.92, L[1] * 0.75, L[2] * 0.52], c1: [L[0] * 0.8, L[1] * 0.68, L[2] * 0.5] }); }
      // عمود تراب يرتفع
      for (let i = 0; i < 24 * F.rate; i++) smoke.spawn({ x: pos.x + (Math.random() - 0.5) * 6 * k, y: pos.y + 2, z: pos.z + (Math.random() - 0.5) * 6 * k, vx: (Math.random() - 0.5) * 10, vy: (30 + Math.random() * 45) * k, vz: (Math.random() - 0.5) * 10, life: 5 + Math.random() * 4, s0: 5 * k, s1: 24 * k, a: 0.7, drag: 1.3, rise: 2, c0: [0.35, 0.26, 0.18], c1: [L[0] * 0.6, L[1] * 0.5, L[2] * 0.4] });
      // موجة صدمة على الأرض
      const rm = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xfff2dc, transparent: true, opacity: 0.7, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })); rm.position.copy(pos).setY(pos.y + 0.4); scene.add(rm); rings.push({ m: rm, t: 0, k, flat: true });
      // حفرة محترقة ونار باقية
      const dm = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: T.scorch, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })); dm.rotation.x = -Math.PI / 2; dm.rotation.z = Math.random() * 6; dm.position.copy(pos).setY(pos.y + 0.14); dm.scale.setScalar(42 * k); scene.add(dm); decals.push(dm);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(5.5 * k, 1.5 * k, 8, 22), new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1, flatShading: true })); rim.rotation.x = Math.PI / 2; rim.scale.z = 0.45; rim.position.copy(pos).setY(pos.y - 0.2); rim.receiveShadow = true; scene.add(rim); decals.push(rim);
      const pl = firePool[firePi++ % firePool.length]; pl.position.copy(pos).setY(pos.y + 4);
      fires.push({ p: pos.clone(), t: 0, k, acc: 0, l: pl });
    } else {
      const sm = new THREE.Mesh(shellGeo, new THREE.MeshBasicMaterial({ color: 0xfff0e0, transparent: true, opacity: 0.35, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.BackSide })); sm.position.copy(pos); scene.add(sm); rings.push({ m: sm, t: 0, k, flat: false });
    }
    // شظايا بفيزياء
    for (let i = 0; i < (o.debris ?? 34); i++) { const d = dd[dNext = (dNext + 1) % debrisN]; d.on = true; d.t = 0; d.p.copy(pos); d.v.randomDirection(); if (ground) d.v.y = Math.abs(d.v.y) + 0.25; d.v.multiplyScalar((18 + Math.random() * 60) * Math.sqrt(k)); if (o.vel) d.v.addScaledVector(o.vel, 0.5); d.r.set(Math.random() * 9, Math.random() * 9, Math.random() * 9); d.s = (0.3 + Math.random() * 1.1) * Math.sqrt(k); d.hot = Math.random() < 0.4; }
  };

  // ---------- طلقات خطّاطة للمدافع
  const tracerN = 80, tracers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.12, 9, 5), new THREE.MeshBasicMaterial({ color: 0xffc070, fog: false }), tracerN); tracers.frustumCulled = false; scene.add(tracers);
  const tr = []; for (let i = 0; i < tracerN; i++) { tr.push({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), t: 0, life: 1 }); dObj.scale.setScalar(0); dObj.updateMatrix(); tracers.setMatrixAt(i, dObj.matrix); }
  let trNext = 0; const yAxis = new THREE.Vector3(0, 1, 0);
  F.tracer = (from, dir, speed, life) => { const t = tr[trNext = (trNext + 1) % tracerN]; t.on = true; t.p.copy(from); t.v.copy(dir).multiplyScalar(speed); t.t = 0; t.life = life; };
  F.flak = (pos) => { const L = lit(); for (let i = 0; i < 5; i++) { tmp.randomDirection(); smoke.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: tmp.x * 8, vy: tmp.y * 8, vz: tmp.z * 8, life: 3.5, s0: 2, s1: 11, a: 0.75, drag: 2, c0: [0.1, 0.1, 0.1], c1: [L[0] * 0.3, L[1] * 0.3, L[2] * 0.3] }); } fire.spawn({ x: pos.x, y: pos.y, z: pos.z, life: 0.16, s0: 5, s1: 9, a: 1, c0: [2, 1.5, 0.8], c1: [1, 0.4, 0.1] }); };

  // شعاع
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); beam.frustumCulled = false; scene.add(beam);
  F.beam = (a, b, op) => { beam.visible = op > 0.01; if (!beam.visible) return; tmp.subVectors(b, a); const l = tmp.length(); beam.position.copy(a).addScaledVector(tmp, 0.5); beam.quaternion.setFromUnitVectors(yAxis, tmp.normalize()); beam.scale.set(1, l, 1); beam.material.opacity = op; };

  F.update = (dt, time, groundY, rdt = dt) => {
    const p = W.preset; [smoke, fire].forEach(s => { s.mat.uniforms.fogColor.value.copy(scene.fog.color); s.mat.uniforms.fogDensity.value = scene.fog.density; });
    smoke.mat.uniforms.uLight.value.copy(W.sun.color).multiplyScalar(Math.min(1, p.sunI * 0.36)); smoke.mat.uniforms.uAmb.value.setRGB(0.42, 0.44, 0.5).multiplyScalar(p.night ? 0.25 : 1);
    smoke.update(dt, wind); fire.update(dt, wind);
    F.flashAmt = Math.max(0, F.flashAmt - rdt * 2.4);
    let best = null;
    flashes.forEach(f => { f.t += Math.max(dt, rdt * 0.45); const e = Math.max(0, 1 - f.t / 0.9); const i = e * e; f.l.intensity = i * 60000 * f.k * (W.preset.night ? 1.25 : 1); f.l.distance = 1100 * Math.sqrt(f.k); f.s.material.opacity = Math.max(0, 1 - f.t / 0.35); f.s.scale.setScalar(120 * f.k * (0.6 + f.t * 3)); if (i > 0 && (!best || i > best.i)) best = { i, f }; });
    if (best) smoke.mat.uniforms.uFlash.value.set(best.f.l.position.x, best.f.l.position.y, best.f.l.position.z, best.i * 4 * best.f.k); else smoke.mat.uniforms.uFlash.value.w = 0;
    for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.t += dt; const dur = r.flat ? 1.5 : 0.7, t = r.t / dur; if (t >= 1) { scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); continue; } const s = (r.flat ? 12 + 190 * (1 - (1 - t) * (1 - t)) : 6 + 70 * t) * r.k; r.m.scale.setScalar(s); r.m.material.opacity = (r.flat ? 0.6 : 0.35) * (1 - t) * (1 - t); }
    let any = false;
    for (let i = 0; i < debrisN; i++) { const d = dd[i]; if (!d.on) continue; any = true; d.t += dt; d.v.y -= 9.8 * 2.2 * dt; d.p.addScaledVector(d.v, dt); const gy = groundY(d.p.x, d.p.z);
      if (d.p.y < gy + 0.2) { d.p.y = gy + 0.2; if (Math.abs(d.v.y) < 3) { d.v.set(0, 0, 0); d.r.set(0, 0, 0); } else { d.v.y *= -0.32; d.v.x *= 0.6; d.v.z *= 0.6; } }
      if (d.hot && d.t < 2.2 && Math.random() < 0.5 * F.rate) smoke.spawn({ x: d.p.x, y: d.p.y, z: d.p.z, life: 1.6, s0: 0.8, s1: 4, a: 0.5, drag: 1, rise: 1, c0: [0.5, 0.3, 0.15], c1: [0.3, 0.3, 0.3] });
      if (d.t > 14) { d.on = false; dObj.scale.setScalar(0); } else { dObj.position.copy(d.p); dObj.rotation.set(d.r.x * d.t, d.r.y * d.t, d.r.z * d.t); dObj.scale.setScalar(d.s); }
      dObj.updateMatrix(); debris.setMatrixAt(i, dObj.matrix); }
    if (any) debris.instanceMatrix.needsUpdate = true;
    const L = lit();
    if (fires.length > 8) fires.splice(0, fires.length - 8);
    fires.forEach(f => { f.t += dt; const pow = Math.max(0.25, 1 - f.t / 40); f.acc += dt * 26 * F.rate; f.l.intensity = (900 + Math.sin(time * 23) * 200 + Math.sin(time * 41) * 150) * pow * f.k;
      while (f.acc >= 1) { f.acc -= 1; const x = f.p.x + (Math.random() - 0.5) * 9 * f.k, z = f.p.z + (Math.random() - 0.5) * 9 * f.k;
        fire.spawn({ x, y: f.p.y + 0.8, z, vy: 4 + Math.random() * 5, life: 0.7 + Math.random() * 0.6, s0: 3.2 * f.k, s1: 1.2, a: 0.9 * pow, rise: 5, drag: 0.5, c0: [1.8, 1.0, 0.35], c1: [1.0, 0.25, 0.04] });
        if (Math.random() < 0.45) smoke.spawn({ x, y: f.p.y + 3, z, vy: 7 + Math.random() * 4, life: 9 + Math.random() * 6, s0: 4 * f.k, s1: 26 * f.k, a: 0.55, drag: 0.15, rise: 0.8, c0: [0.09, 0.08, 0.08], c1: [L[0] * 0.3, L[1] * 0.3, L[2] * 0.3] }); } });
    let anyT = false;
    for (let i = 0; i < tracerN; i++) { const t = tr[i]; if (!t.on) continue; anyT = true; t.t += dt; t.p.addScaledVector(t.v, dt); if (t.t > t.life) { t.on = false; dObj.scale.setScalar(0); } else { dObj.position.copy(t.p); dObj.quaternion.setFromUnitVectors(yAxis, tmp2.copy(t.v).normalize()); dObj.scale.setScalar(1); } dObj.updateMatrix(); tracers.setMatrixAt(i, dObj.matrix); dObj.rotation.set(0, 0, 0); }
    if (anyT) tracers.instanceMatrix.needsUpdate = true;
  };
  F.reset = () => { smoke.n = fire.n = 0; firePool.forEach(l => l.intensity = 0); fires.length = 0; decals.forEach(d => scene.remove(d)); decals.length = 0; rings.forEach(r => scene.remove(r.m)); rings.length = 0; dd.forEach(d => d.on = false); for (let i = 0; i < debrisN; i++) { dObj.scale.setScalar(0); dObj.updateMatrix(); debris.setMatrixAt(i, dObj.matrix); } debris.instanceMatrix.needsUpdate = true; tr.forEach(t => t.on = false); F.beam(tmp, tmp, 0); };

  // ---------- المعالجة اللاحقة
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: Q.msaa });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.28, 0.38, 2.5); composer.addPass(bloom);
  const fin = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uAsp: { value: 1 }, uBlur: { value: 0 }, uHeat: { value: new THREE.Vector3(0.5, 0.5, 0) }, uSun: { value: new THREE.Vector3(0.5, 0.5, 0) }, uSunC: { value: new THREE.Color(1, 0.9, 0.7) },
      uNV: { value: 0 }, uFocus: { value: new THREE.Vector3(0.5, 0.5, 0) }, uFlash: { value: 0 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uSat: { value: 1.08 }, uLetter: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uT,uAsp,uBlur,uNV,uFlash,uSat,uLetter; uniform vec3 uHeat,uSun,uSunC,uFocus,uTint; varying vec2 vUv;
      float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      void main(){ vec2 uv=vUv;
        // تشوه حراري خلف المحرك
        if(uHeat.z>0.001){ vec2 d=(uv-uHeat.xy)*vec2(uAsp,1.0); float f=exp(-dot(d,d)*90.0)*uHeat.z; uv += (vec2(vn(uv*46.0+vec2(0.0,uT*9.0)), vn(uv*46.0+vec2(7.0,-uT*8.0)))-0.5)*0.022*f; }
        vec3 c;
        // ضبابية حركة شعاعية خفيفة + عمق مجال تقريبي حول نقطة التركيز
        float fo = uFocus.z * smoothstep(0.10,0.55, length((uv-uFocus.xy)*vec2(uAsp,1.0)));
        float amt = uBlur * smoothstep(0.15,0.75,length(uv-0.5)) ;
        if(amt+fo>0.0015){ vec3 a=vec3(0.0); vec2 dir=(uv-0.5)*amt*0.09; float rr=fo*0.012;
          for(int i=0;i<8;i++){ float fi=float(i); float an=fi*2.39996; vec2 o=dir*(fi/7.0-0.5)*2.0 + vec2(cos(an),sin(an)*uAsp)*rr*sqrt((fi+0.5)/8.0); a+=texture2D(tDiffuse,uv+o).rgb; } c=a/8.0; }
        else c=texture2D(tDiffuse,uv).rgb;
        // وهج العدسة
        if(uSun.z>0.001){ vec2 sp=uSun.xy; vec2 d=(uv-sp)*vec2(uAsp,1.0); float r=length(d);
          float g = 0.007/(r*r*26.0+0.02) + exp(-abs(d.y)*90.0)*exp(-abs(d.x)*4.0)*0.10;
          vec2 ax=(vec2(0.5)-sp); float gh=0.0;
          for(int i=1;i<=4;i++){ float k=float(i)*0.52; vec2 gp=sp+ax*k*1.9; float gr=length((uv-gp)*vec2(uAsp,1.0)); float rad=0.025+0.02*float(i); gh += smoothstep(rad,rad*0.75,gr)*0.035 + smoothstep(0.012,0.0,abs(gr-rad*1.25))*0.02; }
          c += uSunC*(g+gh*vec3(0.7,0.9,1.0).r)*uSun.z; }
        c += vec3(1.0,0.8,0.55)*uFlash*0.35;
        // تدرج ألوان سينمائي: ظلال باردة وإضاءات دافئة
        float l=dot(c,vec3(0.2126,0.7152,0.0722)); c=mix(vec3(l),c,uSat);
        c*=mix(vec3(0.94,1.0,1.08), vec3(1.07,1.0,0.92), smoothstep(0.0,0.8,l)); c*=uTint;
        c = pow(max(c,0.0), vec3(1.06));
        // رؤية ليلية
        if(uNV>0.5){ float g=dot(c,vec3(0.3,0.6,0.1))*3.2; g=g/(1.0+g*0.8); g += (h21(uv*vec2(913.0,771.0)+uT)-0.5)*0.09; g*=0.9+0.1*sin(uv.y*900.0);
          float tube=smoothstep(0.82,0.42,length((uv-0.5)*vec2(uAsp,1.0)*1.05)); c=vec3(0.12,1.0,0.28)*g*tube*0.85; }
        float v=smoothstep(1.05,0.35,length((uv-0.5)*vec2(0.9,1.0))); c*=mix(0.62,1.0,v);
        c += (h21(uv*vec2(1021.0,877.0)+fract(uT)*31.0)-0.5)*0.012*max(l,0.08);
        c *= 1.0 - uLetter*step(0.5-0.045*uLetter, abs(uv.y-0.5))*0.0;
        gl_FragColor=vec4(c,1.0); }`,
  });
  composer.addPass(fin); composer.addPass(new OutputPass());
  const U = fin.uniforms, v3 = new THREE.Vector3();
  F.post = { blur: 0, heat: 0, heatPos: new THREE.Vector3(), focus: 0, focusPos: new THREE.Vector3(), nv: false };
  F.resize = (w, h, pr) => { composer.setPixelRatio(pr); composer.setSize(w, h); U.uAsp.value = w / h; };
  F.render = (time) => {
    bloom.enabled = Q.post && Q.bloom; bloom.strength = W.preset.night ? 0.42 : 0.28;
    U.uT.value = time; U.uBlur.value = Q.blur ? F.post.blur : 0; U.uFlash.value = F.flashAmt * F.flashAmt; U.uNV.value = F.post.nv ? 1 : 0;
    const proj = (p, out, amt) => { v3.copy(p).project(camera); const ok = v3.z < 1 && Math.abs(v3.x) < 1.6 && Math.abs(v3.y) < 1.6; out.set(v3.x * 0.5 + 0.5, v3.y * 0.5 + 0.5, ok ? amt : 0); };
    proj(F.post.heatPos, U.uHeat.value, Q.heat ? F.post.heat : 0);
    proj(F.post.focusPos, U.uFocus.value, Q.blur ? F.post.focus : 0);
    v3.copy(camera.position).addScaledVector(W.sunDir, 10000); const facing = camera.getWorldDirection(new THREE.Vector3()).dot(W.sunDir);
    proj(v3, U.uSun.value, (W.preset.night || !Q.flare) ? 0 : M.smoothstep(facing, 0.35, 0.9) * (W.time === 'sunset' ? 0.45 : 0.75));
    U.uSunC.value.copy(W.sun.color);
    if (Q.post) composer.render(); else renderer.render(scene, camera);
  };
  return F;
}
