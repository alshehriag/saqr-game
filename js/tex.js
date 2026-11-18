// خامات مولّدة بالكود (ألوان + خرائط نتوء)
import * as THREE from 'three';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// ضجيج قيمة سلس قابل للتكرار
export function makeNoise(seed = 1) {
  const r = rng(seed), P = new Uint8Array(512), G = new Float32Array(256);
  for (let i = 0; i < 256; i++) { P[i] = i; G[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = P[i]; P[i] = P[j]; P[j] = t; }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  const f = t => t * t * t * (t * (t * 6 - 15) + 10);
  const n2 = (x, y, per = 256) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const x0 = ((xi % per) + per) % per, x1 = (x0 + 1) % per, y0 = ((yi % per) + per) % per, y1 = (y0 + 1) % per;
    const X0 = x0 & 255, X1 = x1 & 255, Y0 = y0 & 255, Y1 = y1 & 255;
    const a = G[P[P[X0] + Y0]], b = G[P[P[X1] + Y0]], c = G[P[P[X0] + Y1]], d = G[P[P[X1] + Y1]];
    const u = f(xf), v = f(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y, oct = 4, per = 256) => {
    let s = 0, a = 0.5, n = 0, p = per;
    for (let i = 0; i < oct; i++) { s += a * n2(x, y, p); n += a; x *= 2; y *= 2; p *= 2; a *= 0.5; }
    return s / n;
  };
  return { n2, fbm };
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function tex(c, repeat = 1, srgb = true, aniso = 4) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = aniso;
  return t;
}

// يحوّل دالة ارتفاع قابلة للتكرار إلى خريطة نتوء
function normalFromHeight(size, hf, strength) {
  const c = canvas(size, size), g = c.getContext('2d'), img = g.createImageData(size, size), d = img.data;
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) H[y * size + x] = hf(x / size, y / size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xl = H[y * size + ((x + size - 1) % size)], xr = H[y * size + ((x + 1) % size)];
    const yu = H[((y + size - 1) % size) * size + x], yd = H[((y + 1) % size) * size + x];
    let nx = (xl - xr) * strength, ny = (yu - yd) * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * size + x) * 4;
    d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { c, H };
}

export function buildTextures(q) {
  const S = q >= 2 ? 1024 : 512, T = {};
  const N = makeNoise(7), N2 = makeNoise(31);

  // ---- رمل: تموجات ريح + حبيبات
  {
    const per = 8;
    const hf = (u, v) => {
      const warp = N.fbm(u * per, v * per, 3, per);
      const phase = u * 38 + v * 9 + warp * 1.3;
      const rip = Math.sin(phase * Math.PI * 2);
      const ripple = Math.pow(rip * 0.5 + 0.5, 1.35);
      const grain = N2.fbm(u * 128, v * 128, 2, 128);
      const mask = 0.35 + 0.65 * N.fbm(u * per + 9, v * per + 4, 2, per);
      return ripple * 0.53 * mask + grain * 0.12;
    };
    const { c: nc, H } = normalFromHeight(S, hf, 3.4);
    T.sandN = tex(nc, 1, false, 8);
    const c = canvas(S, S), g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S, h = H[y * S + x];
      const tone = N.fbm(u * 4 + 3, v * 4 + 7, 4, 4), sp = N2.n2(u * 256, v * 256, 256);
      const k = 0.87 + h * 0.095 + (tone - 0.5) * 0.17 + (sp - 0.5) * 0.075;
      const i = (y * S + x) * 4;
      d[i] = Math.min(255, 208 * k); d[i + 1] = Math.min(255, 173 * k); d[i + 2] = Math.min(255, 127 * k * (0.94 + tone * 0.1)); d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    T.sand = tex(c, 1, true, 8);
  }

  // ---- خامة عامة: نقش إسفلت / خرسانة
  const speckle = (size, base, vary, cracks, seed) => {
    const n = makeNoise(seed), c = canvas(size, size), g = c.getContext('2d'), img = g.createImageData(size, size), d = img.data;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const a = n.fbm(u * 6, v * 6, 4, 6), b = n.n2(u * 200, v * 200, 200);
      let k = 1 + (a - 0.5) * vary + (b - 0.5) * vary * 0.9;
      if (cracks) { const cr = Math.abs(n.fbm(u * 5 + 20, v * 5 + 20, 4, 5) - 0.5); if (cr < 0.005) k *= 0.72; }
      const i = (y * size + x) * 4;
      d[i] = base[0] * k; d[i + 1] = base[1] * k; d[i + 2] = base[2] * k; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0); return c;
  };
  const bumpN = (size, scale, str, seed) => {
    const n = makeNoise(seed);
    return normalFromHeight(size, (u, v) => n.fbm(u * scale, v * scale, 4, scale) * 0.6 + n.n2(u * 160, v * 160, 160) * 0.4, str).c;
  };
  T.asphalt = tex(speckle(512, [58, 57, 55], 0.5, true, 11), 1);
  T.asphaltN = tex(bumpN(512, 24, 2.2, 12), 1, false);
  T.concrete = tex(speckle(512, [172, 165, 150], 0.3, true, 21), 1);
  T.concreteN = tex(bumpN(512, 12, 1.6, 22), 1, false);

  // ---- صاج مموّج للحظائر
  {
    const s = 256, hf = (u, v) => Math.sin(u * Math.PI * 2 * 16) * 0.5 + 0.5;
    T.corrN = tex(normalFromHeight(s, hf, 3.2).c, 1, false);
    const c = canvas(s, s), g = c.getContext('2d'), n = makeNoise(5);
    g.fillStyle = '#9a9684'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) { // صدأ وخطوط سيلان
      const x = Math.random() * s, y = Math.random() * s, a = n.fbm(x / 40, y / 40, 3, 6);
      g.fillStyle = `rgba(${90 + a * 60},${60 + a * 30},${35},${0.05 + a * 0.08})`; g.fillRect(x, y, 1 + Math.random() * 2, 6 + Math.random() * 40);
    }
    T.corr = tex(c, 1);
  }

  // ---- معدن مطلي: ألواح وبراغي وخدوش
  {
    const s = 512, c = canvas(s, s), g = c.getContext('2d'), n = makeNoise(41);
    g.fillStyle = '#fff'; g.fillRect(0, 0, s, s);
    const img = g.getImageData(0, 0, s, s), d = img.data;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const k = 0.86 + n.fbm(x / s * 8, y / s * 8, 4, 8) * 0.2 + (n.n2(x / 2, y / 2, 256) - 0.5) * 0.05, i = (y * s + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255 * Math.min(1, k);
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke(); g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,0.4)';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(i * s / 4 + 8 + k * 21, j * s / 4 + 8, 1.6, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(40,30,20,0.10)'; g.lineWidth = 1;
    for (let i = 0; i < 160; i++) { const x = Math.random() * s, y = Math.random() * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - .5) * 30, y + Math.random() * 60); g.stroke(); }
    T.panel = tex(c, 1);
    // خشونة: أماكن مصقولة ومخدوشة
    const rc = canvas(256, 256), rg = rc.getContext('2d'), ri = rg.createImageData(256, 256), rd = ri.data;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const k = 0.45 + n.fbm(x / 256 * 10 + 5, y / 256 * 10, 4, 10) * 0.5, i = (y * 256 + x) * 4;
      rd[i] = 0; rd[i + 1] = 255 * k; rd[i + 2] = 255; rd[i + 3] = 255;
    }
    rg.putImageData(ri, 0, 0);
    T.metalRough = tex(rc, 1, false);
    T.panelN = tex(bumpN(256, 30, 0.6, 43), 1, false);
  }

  // ---- سياج شبك (شفافية)
  {
    const s = 128, c = canvas(s, s), g = c.getContext('2d');
    g.clearRect(0, 0, s, s); g.strokeStyle = 'rgba(120,118,108,1)'; g.lineWidth = 2.2;
    for (let i = -s; i < s * 2; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + s, s); g.stroke(); g.beginPath(); g.moveTo(i, s); g.lineTo(i + s, 0); g.stroke(); }
    T.fence = tex(c, 1);
  }

  // ---- سعف النخيل (شفافية)
  {
    const w = 128, h = 512, c = canvas(w, h), g = c.getContext('2d');
    g.strokeStyle = '#5a5a2a'; g.lineWidth = 4; g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 0); g.stroke();
    for (let y = 8; y < h - 10; y += 7) {
      const len = (w / 2 - 4) * Math.sin((y / h) * Math.PI * 0.92 + 0.12);
      const sh = 70 + Math.random() * 50;
      g.strokeStyle = `rgb(${sh * 0.62 | 0},${sh | 0},${sh * 0.32 | 0})`; g.lineWidth = 3.2;
      g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w / 2 - len, y - 26); g.stroke();
      g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w / 2 + len, y - 26); g.stroke();
    }
    T.frond = tex(c, 1); T.frond.wrapS = T.frond.wrapT = THREE.ClampToEdgeWrapping;
  }

  // ---- جذع النخلة
  {
    const s = 128, hf = (u, v) => Math.abs(((v * 12 + u * 2) % 1) - 0.5) * 2;
    T.trunkN = tex(normalFromHeight(s, hf, 4).c, 1, false);
  }

  // ---- نفثة دخان ناعمة بحواف غير منتظمة
  {
    const s = 128, c = canvas(s, s), g = c.getContext('2d'), img = g.createImageData(s, s), d = img.data, n = makeNoise(77);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const dx = (x - s / 2) / (s / 2), dy = (y - s / 2) / (s / 2), r = Math.hypot(dx, dy);
      const nn = n.fbm(x / s * 5, y / s * 5, 4, 5);
      let a = 1 - THREE.MathUtils.smoothstep(r + (nn - 0.5) * 0.75, 0.2, 0.95);
      const sh = 0.62 + nn * 0.38 - dy * 0.18;   // إضاءة علوية خفيفة
      const i = (y * s + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255 * Math.min(1, sh); d[i + 3] = 255 * a;
    }
    g.putImageData(img, 0, 0);
    T.puff = new THREE.CanvasTexture(c); T.puff.colorSpace = THREE.NoColorSpace;
  }

  // ---- وهج دائري (للهب والوميض والعدسة)
  const glow = (s, stops) => {
    const c = canvas(s, s), g = c.getContext('2d'), gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    stops.forEach(([p, col]) => gr.addColorStop(p, col)); g.fillStyle = gr; g.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  T.glow = glow(128, [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,240,200,0.8)'], [0.5, 'rgba(255,160,60,0.25)'], [1, 'rgba(255,100,20,0)']]);
  T.flare0 = glow(256, [[0, 'rgba(255,255,255,1)'], [0.08, 'rgba(255,250,230,0.9)'], [0.3, 'rgba(255,220,160,0.2)'], [1, 'rgba(255,200,120,0)']]);
  T.flareRing = glow(128, [[0, 'rgba(255,255,255,0)'], [0.72, 'rgba(160,200,255,0)'], [0.86, 'rgba(160,200,255,0.25)'], [1, 'rgba(160,200,255,0)']]);
  T.flareDot = glow(64, [[0, 'rgba(255,220,180,0.5)'], [1, 'rgba(255,200,150,0)']]);

  // ---- أثر احتراق على الأرض
  T.scorch = glow(256, [[0, 'rgba(8,6,5,0.95)'], [0.35, 'rgba(20,15,10,0.8)'], [0.7, 'rgba(40,28,18,0.35)'], [1, 'rgba(60,40,25,0)']]);

  return T;
}
