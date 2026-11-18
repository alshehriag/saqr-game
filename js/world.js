// العالم: السماء، التضاريس، القواعد، المجسمات
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeNoise } from './tex.js?v=20';

const N = makeNoise(1234), M = THREE.MathUtils;
export const HOME = new THREE.Vector3(0, 0, 0);
export const ENEMY = new THREE.Vector3(260, 0, -5200);
const FLAT_R = 300;

// ---------- ارتفاع الأرض: كثبان غير متناظرة (سفح ريح لطيف + وجه انزلاق حاد)
function duneProfile(t) { t -= Math.floor(t); return t < 0.7 ? M.smootherstep(t / 0.7, 0, 1) : M.smootherstep((1 - t) / 0.3, 0, 1); }
function duneHeight(x, z) {
  const big = N.fbm(x / 2700 + 40, z / 2700 + 40, 3) - 0.5;
  const warp = N.fbm(x / 1500 + 11, z / 1500 + 3, 2) * 2.2;
  const a = 0.28 + N.fbm(x / 1800 + 70, z / 1800 + 20, 2);
  const d = duneProfile((x * 0.54 + z * 0.84) / 920 + warp) * 56 * a * a;
  const apron = duneProfile((x * 0.79 + z * 0.61) / 490 + warp) * 7 * a;
  const h = big * 86 + d + apron;
  const f = Math.min(
    M.smoothstep(Math.hypot(x - HOME.x, z - HOME.z), FLAT_R, FLAT_R + 420),
    M.smoothstep(Math.hypot(x - ENEMY.x, z - ENEMY.z), FLAT_R, FLAT_R + 420));
  const yard = origin => M.smoothstep(Math.max(Math.abs(x - origin.x), Math.abs(z - origin.z)), 234, 315);
  return h * Math.min(f, yard(HOME), yard(ENEMY));
}

const roadZ = x => -351 - x * .27 + 24 * Math.sin(x / 330);
const roadGrade = x => 9 * M.smootherstep(x,440,1550) - 5 * M.smootherstep(-x,440,1470);
const size = 15000, cx = ENEMY.x / 2, cz = ENEMY.z / 2;
// نقاط أكثر حول القاعدتين وبينهما؛ شبكة واحدة بلا شقوق عند الانتقال.
const axis = (cuts, seg) => {
  const values = [cuts[0][0]];
  for (let i = 1; i < cuts.length; i++) {
    const n = Math.max(1, Math.round(seg * cuts[i][1]));
    for (let j = 1; j <= n; j++) values.push(M.lerp(cuts[i - 1][0], cuts[i][0], j / n));
  }
  return Float32Array.from(values);
};
const makeTerrain = seg => {
  const xs = axis([[cx - size / 2], [-950, .12], [-234, .20], [494, .36], [1210, .20], [cx + size / 2, .12]], seg);
  const zs = axis([[cz - size / 2], [-6450, .065], [ENEMY.z - 234, .115], [ENEMY.z + 234, .115], [-234, .39], [234, .115], [1100, .125], [cz + size / 2, .075]], seg);
  const nx = xs.length, nz = zs.length, g = new THREE.PlaneGeometry(1, 1, nx - 1, nz - 1);
  const p = g.attributes.position, uv = g.attributes.uv, col = new Float32Array(p.count * 3);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = xs[i], z = zs[j];
    // نسوّي كامل الخلايا التي تمر بها الحارات، ثم ندمج الأكتاف مع الكثبان.
    const dx = Math.max(x-(xs[i-1]??x),(xs[i+1]??x)-x);
    const dz = Math.max(z-(zs[j-1]??z),(zs[j+1]??z)-z);
    const shoulder = Math.abs(z-roadZ(x)) - (32+dz+.35*dx);
    const blend = (1-M.smoothstep(shoulder,0,115)) * (1-M.smoothstep(Math.abs(x)-dx,1730,1880));
    const h = M.lerp(duneHeight(x,z),roadGrade(x),blend);
    p.setXYZ(k, x, h, z); uv.setXY(k, (x - cx) / size + 0.5, 0.5 - (z - cz) / size);
    const v = 0.89 + (N.fbm(x / 890, z / 890, 3) - 0.5) * 0.27 + M.clamp(h / 100, -0.24, 0.3) * 0.15;
    const warm = N.fbm(x / 1650 + 8, z / 1650, 2);
    col[k * 3] = v * (1 + warm * 0.045); col[k * 3 + 1] = v * 0.98; col[k * 3 + 2] = v * (0.96 - warm * 0.1);
  }
  // كل خلية تلامس دائرة التسوية تبقى مستوية بكاملها، حتى عند حافة القاعدة.
  for (const base of [HOME, ENEMY]) for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const dx = M.clamp(base.x, xs[i], xs[i + 1]) - base.x, dz = M.clamp(base.z, zs[j], zs[j + 1]) - base.z;
    if (dx * dx + dz * dz > FLAT_R * FLAT_R) continue;
    const k = j * nx + i;
    p.setY(k, 0); p.setY(k + 1, 0); p.setY(k + nx, 0); p.setY(k + nx + 1, 0);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  // ارتفاع اللعبة من نفس المثلث المرسوم على جميع الأجهزة.
  const cell = (values, x) => {
    let lo = 0, hi = values.length - 1;
    while (hi - lo > 1) { const mid = (hi + lo) >> 1; if (x < values[mid]) hi = mid; else lo = mid; }
    return lo;
  };
  const surface = (x, z) => {
    if (x < xs[0] || x > xs[nx - 1] || z < zs[0] || z > zs[nz - 1]) return duneHeight(x, z);
    const i = cell(xs, x), j = cell(zs, z), k = j * nx + i;
    const u = (x - xs[i]) / (xs[i + 1] - xs[i]), v = (z - zs[j]) / (zs[j + 1] - zs[j]);
    const a = p.getY(k), b = p.getY(k + nx), c = p.getY(k + 1), d = p.getY(k + nx + 1);
    return u + v <= 1 ? a + (b - a) * v + (c - a) * u : d + (b - d) * (1 - u) + (c - d) * (1 - v);
  };
  return { g, surface };
};
const ground = makeTerrain(112);
export function heightAt(x, z) { return ground.surface(x, z); }

// محور حضري تقريبي؛ الإزاحة تُبقي مباني المشهد خارج ساحة اللعب.

// نموذج نخلة واحد للرصف بطول الطريق.
function roadsidePalms(capacity) {
  const trunk = new THREE.CylinderGeometry(.27,.46,6.8,6).toNonIndexed(); trunk.translate(0,3.3,0); trunk.deleteAttribute('uv');
  const bark=new THREE.Color(0x8a7356), tc=new Float32Array(trunk.attributes.position.count*3);
  for(let i=0;i<tc.length;i+=3)bark.toArray(tc,i);
  trunk.setAttribute('color',new THREE.BufferAttribute(tc,3));
  const verts=[],cols=[];
  for(let i=0;i<11;i++){
    const a=i*2.39996,c=Math.cos(a),s=Math.sin(a),r=3.3+(i%3)*.45, peak=7.4+(i%2)*.45;
    const leaf=[[0,6.55,0],[1.75*c-.5*s,peak,1.75*s+.5*c],[2*c,peak+.28,2*s],[1.75*c+.5*s,peak,1.75*s-.5*c],[r*c,5.95+(i%3)*.3,r*s]];
    for(const k of [0,1,2,0,2,3,1,4,2,2,4,3]){
      verts.push(...leaf[k]); const color=k===2 ? 0x849863 : i%2 ? 0x647c53 : 0x506b49;
      new THREE.Color(color).toArray(cols,cols.length);
    }
  }
  const leaves=new THREE.BufferGeometry(); leaves.setAttribute('position',new THREE.Float32BufferAttribute(verts,3)); leaves.setAttribute('color',new THREE.Float32BufferAttribute(cols,3)); leaves.computeVertexNormals();
  const geo=mergeGeometries([trunk,leaves],false); trunk.dispose(); leaves.dispose();
  const palms=new THREE.InstancedMesh(geo,new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide}),capacity), d=new THREE.Object3D();
  for(let i=0;i<capacity;i++){
    const x=(-.5+((i*.61803398875+.5)%1))*1320, z=roadZ(x)+(i%2?17:-17);
    d.position.set(x,heightAt(x,z)+.85,z); d.rotation.y=i*2.39; d.scale.setScalar(.93+(i%5)*.075); d.updateMatrix(); palms.setMatrixAt(i,d.matrix);
  }
  palms.computeBoundingSphere(); return palms;
}


// حركة مدنية بعيدة، بنموذج واحد ودفعة رسم واحدة.
function avenueTraffic(capacity) {
  const parts=[];
  const panel=(w,h,d,x,y,z,color)=>{
    const g=new THREE.BoxGeometry(w,h,d).toNonIndexed(); g.translate(x,y,z); g.deleteAttribute('uv');
    const rgb=new Float32Array(g.attributes.position.count*3), c=new THREE.Color(color);
    for(let i=0;i<rgb.length;i+=3)c.toArray(rgb,i);
    g.setAttribute('color',new THREE.BufferAttribute(rgb,3)); parts.push(g);
  };
  panel(4.6,.85,2,0,.63,0,0xe5e4da); panel(2.35,.72,1.65,-.18,1.4,0,0x788e99);
  panel(3.5,.35,1.9,0,.25,0,0x393c3e);
  panel(4.25,.035,1.98,0,.065,0,0x373b3c);
  const geo=mergeGeometries(parts,false); parts.forEach(g=>g.dispose());
  const cars=new THREE.InstancedMesh(geo,new THREE.MeshLambertMaterial({vertexColors:true}),capacity);
  const pose=new THREE.Object3D(), lanes=[];
  for(let i=0;i<capacity;i++){
    const sign=i%2===0?1:-1, lane=Math.floor(i/2)%3, slot=Math.floor(i/6);
    lanes.push({sign,offset:sign*(4.2+lane*4.2),speed:sign*(13+lane*3),start:(Math.floor(slot/2)*384 + (slot%2)*24 + lane*173 + (sign+1)*111)%1500});
    cars.setColorAt(i,new THREE.Color([0xfcf8ed,0xbfcdd1,0x86949b,0xe8d7b4,0x9f6460][i%5]));
  }
  // حدود ثابتة للطريق كله حتى تدخل السيارات وتخرج من مجال الرؤية.
  cars.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,0,roadZ(0)),830);
  cars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  let last=-1;
  cars.onBeforeRender=()=>{
    const t=Math.floor(performance.now()/80)*.08; if(last===t)return; last=t;
    for(let i=0;i<cars.count;i++){
      const l=lanes[i], travel=t*l.speed, spacing=4*Math.sin(travel*.006+i);
      const x=M.euclideanModulo(l.start+travel+spacing,1500)-750, z=roadZ(x)+l.offset;
      const tangent=-.27+(24/330)*Math.cos(x/330);
      pose.position.set(x,roadGrade(x)+1.15,z);
      pose.rotation.set(0,-Math.atan(tangent)+(l.sign<0?Math.PI:0),l.sign*Math.atan((roadGrade(x+2)-roadGrade(x-2))/(4*Math.hypot(1,tangent))),'YXZ');
      pose.updateMatrix(); cars.setMatrixAt(i,pose.matrix);
    }
    cars.instanceMatrix.needsUpdate=true;
  };
  cars.onBeforeRender(); return cars;
}


function avenueGeometry(low) {
  const positions = [], colors = [], glow = [], tint = new THREE.Color();
  const face = (a,b,c,d,color,lit=0) => {
    tint.set(color);
    for(const p of [a,b,c,a,c,d]) { positions.push(...p); colors.push(tint.r,tint.g,tint.b); glow.push(lit); }
  };
  const block = (x,y,z,w,h,d,color,lit=0) => {
    const l=x-w/2,r=x+w/2,f=z+d/2,b=z-d/2,t=y+h;
    face([l,y,f],[r,y,f],[r,t,f],[l,t,f],color,lit);
    face([r,y,b],[l,y,b],[l,t,b],[r,t,b],color,lit);
    face([l,y,b],[l,y,f],[l,t,f],[l,t,b],color,lit);
    face([r,y,f],[r,y,b],[r,t,b],[r,t,f],color,lit);
    face([l,t,f],[r,t,f],[r,t,b],[l,t,b],color,lit);
    if(h>6 && w>4){
      const start=positions.length-90;
      for(let k=start;k<positions.length;k+=3) if(positions[k+1]===y) {
        colors[k]*=.65; colors[k+1]*=.65; colors[k+2]*=.65;
      }
    }
  };
  // تدرّج ثابت على الأرض حول الأساس، ضمن نفس دفعة رسم الشارع.
  const footing = (x,z,w,d,base,edge,lift,paving) => {
    const corners=[[-1,1],[1,1],[1,-1],[-1,-1]];
    const corner=(i,pad)=>{const [a,b]=corners[i],px=x+a*(w/2+pad),pz=z+b*(d/2+pad);return [px,paving(px,pz)+lift,pz];};
    for(let i=0;i<4;i++){
      const j=(i+1)%4, start=colors.length;
      face(corner(i,2.4),corner(j,2.4),corner(j,0),corner(i,0),base);
      tint.set(edge); for(const v of [0,1,3]) tint.toArray(colors,start+3*v);
    }
  };
  const point = (x,offset,above) => {
    const z=roadZ(x)+offset; return [x,(Math.abs(offset)<=29 ? roadGrade(x) : heightAt(x,z))+above,z];
  };
  const strip = (x,end,from,to,above,color) => face(point(x,to,above),point(end,to,above),point(end,from,above),point(x,from,above),color);
  // ثلاث حارات في كل اتجاه، فاصل وسطي، أرصفة وطريقا خدمة.
  for(let x=-1728;x<1728;) {
    const step=low && Math.abs(x)>600 ? 72 : 24, end=x+step;
    if (x>=-816 && x<816) {
      strip(x,end,-191,-28,.3,0xb9ac95);
      strip(x,end,-120,-112,.8,0x656766);
      if(x%120===0)strip(x,x+9,-191,-25,.92,0x656766);
      strip(x,end,-32,-27,1,0xd2c6ae);
    }
    strip(x,end,-29,29,.9,0xcfc1a4);
    for(const side of [-1,1]) {
      const lane=(from,to,h,color,start=x,finish=end)=>strip(start,finish,side<0?-to:from,side<0?-from:to,h,color);
      lane(2,15,1.12,0x424a50); lane(19,26,1.12,0x51595d);
      lane(1.9,2.28,1.35,0xd9ae53); lane(14.45,14.85,1.35,0xd8d4bf);
      for(const offset of [6.2,10.4,22.5]) lane(offset,offset+.36,1.4,0xf3e8ca,x+3,x+12);
    }
    strip(x,end,-1.55,1.55,1.18,0x857e62);
    if(x%72===0){
      const [px,y,pz]=point(x,0,1.15);
      block(px,y,pz,.55,8,.55,0x85918f);
      block(px,y+7.7,pz,.5,.4,6.6,0x9ca6a1);
      for(const side of [-1,1])block(px,y+7.7,pz+side*3.45,1.5,.35,1,0xffdf97,2.5);
    }
    x=end;
  }
  for(const x of [-330,-110,225,470]){
    const z=roadZ(x), y=heightAt(x,z);
    block(x,y+1,z+16,.6,8,.6,0x919da0); block(x,y+8.5,z+9,.55,.55,14,0x919da0);
    block(x,y+7,z+7,1.15,3.7,8.2,0x286750);
  }
  // جسر عابر بمنحدرين، درابزين ودعامات؛ يمتد فوق طريقي الخدمة.
  const bridgeX=36, bridgeZ=roadZ(bridgeX);
  const bridgeY=u=>heightAt(bridgeX,bridgeZ+u)+1.45+7*(1-M.smoothstep(Math.abs(u),31,81));
  for(let u=-85;u<85;u+=5){
    const v=u+5, a=bridgeY(u), b=bridgeY(v);
    const deck=(l,r,lift,col)=>face([bridgeX+l,b+lift,bridgeZ+v],[bridgeX+r,b+lift,bridgeZ+v],[bridgeX+r,a+lift,bridgeZ+u],[bridgeX+l,a+lift,bridgeZ+u],col);
    deck(-5,5,0,0x515961);
    for(const side of [-1,1]){
      const x=bridgeX+side*5;
      const pts=[[x,a-1,bridgeZ+u],[x,b-1,bridgeZ+v],[x,b+1,bridgeZ+v],[x,a+1,bridgeZ+u]];
      face(...(side<0?pts:pts.reverse()),0xb6aa94);
      deck(side<0?-5:4.5,side<0?-4.5:5,1,0xd6cab8);
    }
    if(u%10===0)deck(-.18,.18,.06,0xe3d8b7);
  }
  for(const sign of [-1,1]) strip(bridgeX-4.7,bridgeX+4.7,sign<0?-15:2,sign<0?-2:15,1.23,0x383f44);
  for(const u of [-16,16]) block(bridgeX,heightAt(bridgeX,bridgeZ+u),bridgeZ+u,7,8,1.5,0xaaa18c);
  // مكاتب متوسطة الارتفاع في صفوف متباعدة، بأدوار زجاجية ومحلات عند مستوى الشارع.
  for(let i=0;i<52;i++){
    const rear=i%2===1, n=Math.floor(i/2), x=-760+n*61+(rear?26:0), z=roadZ(x)-(rear?148:86)-(i%4)*5;
    const w=24+(i*7%17),d=15+(i*3%11),h=(rear?17:8)+(i*11%17), y=heightAt(x,z)-1.5;
    footing(x,z,w+9,d+8,0x79756a,0xb9ac95,.43,heightAt);
    block(x,y,z,w+9,2.15,d+8,0xc9bba3);
    block(x,y,z,w,h,d,[0xc3b49d,0xa7b4b5,0xcfbfa5,0xa5a7a2][i%4]);
    block(x,y+h,z,w+1,.8,d+1,0xdcd0b9);
    for(let k=0;k<(low?1:3);k++){
      const px=x-w*.36+k*6.2, pz=z+d/2+6.7, py=heightAt(px,pz)+.78;
      block(px,py,pz,2,.82,4.2,[0xb9c1bc,0x626d72,0xe2dfcf][(i+k)%3]);
      block(px,py+.82,pz,1.7,.6,2.25,0x71838a);
    }
    block(x+w*.17,y+h+.8,z-2,w*.26,1.8,d*.36,0xa29b8f);
    for(let j=3;j<h-1;j+=low?7.2:3.6){
      block(x,y+j,z+d/2+.09,w*.92,1.45,.35,0x617f89);
      if(!low && (i+Math.floor(j))%3===0)block(x-w*.21,y+j,z+d/2+.31,w*.25,1.1,.17,0xe0bf84,.95);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3)); g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.setAttribute('nightGlow',new THREE.Float32BufferAttribute(glow,1)); g.computeVertexNormals(); return g;
}


// أفق الرياض، مجسمات زخرفية بتوزيع خيالي خارج الساحات.
function skylineGeometry(bands) {
  const parts = [], tone = new THREE.Color();
  let ox = 0, oy = 0, oz = 0;
  const site = (x,z,w,d) => {
    ox=x; oz=z; oy=heightAt(x,z)-1;
    // ظل تلامس مخبوز فوق ساحة البرج، يتلاشى إلى لون الرصف عند الحافة.
    const ring=[[-1,1],[1,1],[1,-1],[-1,-1]], pts=[], shade=[];
    for(let i=0;i<4;i++) for(const [corner,pad] of [[i,3],[(i+1)%4,3],[(i+1)%4,0],[i,3],[(i+1)%4,0],[i,0]]){
      const px=ring[corner][0]*(w/2+pad), pz=ring[corner][1]*(d/2+pad);
      pts.push(px,heightAt(x+px,z+pz)-oy+.42,pz); tone.set(pad ? 0xb9ac95 : 0x766f64).toArray(shade,shade.length);
    }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3)); g.computeVertexNormals();
    add(g,0xffffff); g.setAttribute('color',new THREE.Float32BufferAttribute(shade,3));
  };
  const add = (source, color, x=0, y=0, z=0, lit=0, glazing=0) => {
    const g = source.index ? source.toNonIndexed() : source;
    g.deleteAttribute('uv'); g.translate(ox+x, oy+y, oz+z);
    const colors = new Float32Array(g.attributes.position.count*3); tone.set(color);
    const position=g.attributes.position;
    for(let i=0;i<position.count;i++){
      const h=position.getY(i)-oy, foot=.64+.36*M.smoothstep(h,0,9);
      colors[3*i]=tone.r*foot; colors[3*i+1]=tone.g*foot; colors[3*i+2]=tone.b*foot;
    }
    g.setAttribute('glazing',new THREE.BufferAttribute(new Float32Array(colors.length/3).fill(glazing),1));
    g.setAttribute('color',new THREE.BufferAttribute(colors,3)); g.setAttribute('nightGlow',new THREE.BufferAttribute(new Float32Array(colors.length/3).fill(lit),1)); parts.push(g);
  };
  const box = (w,h,d,color,x,y,z,lit=0) => add(new THREE.BoxGeometry(w,h,d),color,x,y,z,lit);
  const cylinder = (rt,rb,h,color,y,segments=16) => add(new THREE.CylinderGeometry(rt,rb,h,segments),color,0,y);
  // واجهة مربعة تدور أو تضيق أو تميل بين طابقين.
  const ring = (w,d,y,angle=0,shift=0,slope=0) => [[-1,-1],[-1,1],[1,1],[1,-1]].map(([a,b]) =>
    [shift+a*w*Math.cos(angle)-b*d*Math.sin(angle),y+a*slope,a*w*Math.sin(angle)+b*d*Math.cos(angle)]);
  const shell = (lo,hi,color) => {
    const pos=[];
    for(let j=0;j<4;j++){ const k=(j+1)%4; pos.push(...lo[j],...lo[k],...hi[k],...lo[j],...hi[k],...hi[j]); }
    pos.push(...hi[0],...hi[1],...hi[2],...hi[0],...hi[2],...hi[3]);
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.computeVertexNormals(); add(g,color,0,0,0,0,1);
  };

  // المملكة: فتحة حقيقية من خلال التاج وجسر فوقها.
  site(-100,roadZ(-100)-54,53,25);
  const crown = new THREE.Shape();
  crown.moveTo(-17,0); crown.lineTo(17,0); crown.lineTo(16,115); crown.lineTo(13,115);
  crown.bezierCurveTo(11,91,6,84,0,82); crown.bezierCurveTo(-6,84,-11,91,-13,115);
  crown.lineTo(-16,115); crown.closePath();
  add(new THREE.ExtrudeGeometry(crown,{depth:13,bevelEnabled:false,curveSegments:8}),0x95bbcd,0,0,-6.5,0,1);
  box(31,3,9,0xbcddec,0,114,0,1.6);
  box(53,5,25,0xc4b4a0,0,2,0); box(45,2.6,20,0x80959b,0,5.7,0);
  for(let i=1;i<=bands;i++) box(33-i*.12,.6,13.4,0x7495a8,0,78*i/(bands+1),0,i%3===0?.6:0);

  // مجدول: نفس المسقط يدور تدريجياً حتى السطح.
  site(-8,roadZ(-8)-64,20,18);
  for(let i=0;i<bands;i++){
    const t=i/bands, next=(i+1)/bands, section=u=>ring(10,9,92*u,u*2.18);
    shell(section(t),section(next-.09/bands),0x7ca3b5);
    shell(section(next-.09/bands),section(next),0xbccbd0);
  }

  // الفيصلية: هيكل مفتوح يحمل الكرة الذهبية وينتهي بسارية رفيعة.
  site(-204,roadZ(-204)-50,30,26);
  const facade=(u,rim=0)=>ring(15-10*u+rim,13-9*u+rim,72*u,.16);
  shell(facade(0),facade(1),0x90a5a7);
  for(let i=1;i<bands;i++) { const u=i/bands; shell(facade(u,.12),facade(u+.012,.12),0xdbd2bb); }
  add(new THREE.SphereGeometry(6.2,18,12),0xe5b452,0,81,0,.72);
  for(const [a,b] of [[-1,-1],[-1,1],[1,1],[1,-1]]){
    const from=new THREE.Vector3(a*6.8,70,b*5.4), to=new THREE.Vector3(a*.45,99,b*.45), delta=to.clone().sub(from);
    const g=new THREE.CylinderGeometry(.52,.78,delta.length(),5);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));
    const mid=from.lerp(to,.5); add(g,0xd5bf90,mid.x,mid.y,mid.z);
  }
  cylinder(.18,.64,13,0xe0d5b5,105);

  // رافال: واجهة زجاجية طويلة فوق قاعدة حجرية وتاج متدرج.
  site(284,roadZ(284)-58,34,24);
  box(34,6,24,0xc29d75,0,3,0);
  shell(ring(12,9,5,-.12),ring(12,9,96,-.12),0x668fa3);
  shell(ring(11,8,96,-.12),ring(8,6,107,-.12,2,3),0x91acb7);
  box(1.3,94,1.3,0xd0c4ac,-9,51,10); box(1.3,90,1.3,0xd0c4ac,9,49,8);
  for(let i=1;i<=bands;i++) shell(ring(12.1,9.1,6+i*85/(bands+1),-.12),ring(12.1,9.1,6.7+i*85/(bands+1),-.12),0xa9bec3);

  // أبراج المالية: مجموعة واجهات مضلعة وأسقف مائلة بارتفاعات مختلفة.
  for(const [x,z,h,w,angle,color] of [[87,-474,72,13,.32,0x93aab4],[118,-454,113,15,-.28,0x729cac],[150,-493,89,12,.48,0x91b6be],[174,-452,53,11,-.1,0xb0bab4],[194,-486,68,11,.28,0x839ca7]]) {
    site(x,z,w*2,w*1.48); const waist=ring(w*.85,w*.68,h*.60,angle+.18,2);
    shell(ring(w,w*.74,0,angle),waist,color);
    shell(waist,ring(w*.64,w*.55,h,angle-.06,-2,h*.085),color);
  }

  // برج المياه: ساق خرسانية، خزان يتسع للأعلى وحزام علوي.
  site(-343,roadZ(-343)-65,10,10);
  cylinder(3.8,5.2,36,0xd9c8a6,18); cylinder(15,4,12,0xbb945f,42);
  cylinder(15,15,3.2,0xd8bf8f,49.6); cylinder(14.6,14.6,2.3,0x667e87,52.35);
  cylinder(9,15,2.4,0xd9c69f,54.7); cylinder(.25,.4,5,0xa6a49c,58);
  const merged=mergeGeometries(parts,false); parts.forEach(g=>g.dispose()); return merged;
}



export const TIMES = {
  day:    { elev: 36, az: 232, sunI: 5.2, sunC: 0xffebcf, hemi: [0xbcd3ee, 0x9a7a52, 1.25], fog: 0xc7ab8a, fogD: 0.000116, exp: 0.3, turb: 4.2, ray: 1.35, mie: 0.005, mieG: 0.82, env: 1.0 },
  sunset: { elev: 4.5, az: 196, sunI: 4.4, sunC: 0xffb47d, hemi: [0xb1b2cf, 0xa17153, 1.2], fog: 0xb98568, fogD: 0.000142, exp: 0.36, turb: 6.4, ray: 2.3, mie: 0.005, mieG: 0.86, env: 0.9 },
  night:  { elev: 42, az: 215, sunI: 0.85, sunC: 0xb4c8ec, hemi: [0x536d9b, 0x514045, 1.05], fog: 0x171c2b, fogD: 0.00013, exp: 0.76, turb: 2.6, ray: 0.5, mie: 0.002, mieG: 0.8, env: 0.14, night: true },
};

export function buildWorld(scene, renderer, T, Q, desertBudget = Q) {
  let seed = 1847;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
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
  const skyHaze = { value: new THREE.Color() }, skyHazeStrength = { value: 0.48 };
  sky.material.uniforms.horizonHaze = skyHaze; sky.material.uniforms.horizonHazeStrength = skyHazeStrength;
  sky.material.fragmentShader = sky.material.fragmentShader
    .replace('void main()', 'uniform vec3 horizonHaze; uniform float horizonHazeStrength;\nvoid main()')
    .replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb = mix(gl_FragColor.rgb, horizonHaze, horizonHazeStrength * (1.0 - smoothstep(0.01, 0.24, direction.y)));\n#include <tonemapping_fragment>');
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
    cityNight.value = p.night ? 1 : (name === 'sunset' ? .35 : 0);
    scene.fog.color.set(p.fog); scene.fog.density = p.fogD;
    skyHaze.value.copy(scene.fog.color); skyHazeStrength.value = p.night ? 0.8 : 0.53;
    renderer.toneMappingExposure = p.exp;
    stars.visible = !!p.night;
    // خريطة بيئة من السماء لانعكاسات المعدن
    const es = new THREE.Scene(), s2 = new Sky(); s2.scale.setScalar(1000);
    Object.keys(s2.material.uniforms).forEach(k => { const v = u[k].value; s2.material.uniforms[k].value = v && v.clone ? v.clone() : v; });
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
    lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe2a8).multiplyScalar(4) }),
  };
  MT.glass.userData.envK = 1.6; MT.steel.userData.envK = 1.2;
  const corr = (col) => { const m = mat({ color: col, map: T.corr.clone(), normalMap: T.corrN.clone(), roughness: 0.6, metalness: 0.55, side: THREE.DoubleSide }); m.map.rotation = m.normalMap.rotation = Math.PI / 2; m.map.repeat.set(6, 2); m.normalMap.repeat.set(6, 2); return m; };
  MT.corrA = corr(0xb9b5a2); MT.corrB = corr(0x7d8a6c);
  const sh = (m, cast = true, recv = true) => { m.castShadow = cast; m.receiveShadow = recv; return m; };
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = sh(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)); o.position.set(x, y, z); return o; };
  const cyl = (r1, r2, h, m, seg = 20) => sh(new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m));
  const tiled = (m, rx, ry) => { const c = m.clone(); ['map', 'normalMap'].forEach(k => { if (c[k]) { c[k] = c[k].clone(); c[k].repeat.set(rx, ry); } }); return c; };

  // ---------- التضاريس
  const sand = mat({ map: T.sand.clone(), normalMap: T.sandN.clone(), roughness: 1, metalness: 0, vertexColors: true });
  sand.map.repeat.setScalar(size / 14); sand.normalMap.repeat.setScalar(size / 14);
  sand.normalScale.setScalar(0.24); sand.userData.envK = 0.32;
  sand.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <tonemapping_fragment>',
      'gl_FragColor.rgb *= min(1.0, 2.35 / max(dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.001));\n#include <tonemapping_fragment>');
  };
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
  const terrain = W.terrain = new THREE.Mesh(ground.g, sand); terrain.receiveShadow = true; scene.add(terrain);
  // صخور وشجيرات متناثرة خارج الساحات والطرق؛ دون ظلال إضافية.
  const rockGeo = new THREE.DodecahedronGeometry(1, 0), rp = rockGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i), k = 0.78 + N.n2(x * 3 + 5, y * 3 + z * 2) * 0.43;
    rp.setXYZ(i, x * k, y * k * 0.65, z * k);
  }
  rockGeo.computeVertexNormals();
  const shrubGeo = new THREE.IcosahedronGeometry(1, 0);
  const scatter = [
    { key: 'rocks', g: rockGeo, mat: MT.rock, tint: new THREE.Color(0xa88c70) },
    { key: 'shrubs', g: shrubGeo, mat: mat({ color: 0x8e8960, roughness: 1, flatShading: true }), tint: new THREE.Color(0xb8ae86) },
  ];
  const dummy = new THREE.Object3D(), tint = new THREE.Color(), white = new THREE.Color(0xffffff);
  for (const layer of scatter) {
    const shrub = layer.key === 'shrubs', pieces = shrub ? 3 : 1, total = desertBudget[layer.key] ?? 0;
    layer.pieces = pieces; layer.count = 0; layer.mesh = new THREE.InstancedMesh(layer.g, layer.mat, total * pieces);
    for (let attempts = 0; layer.count < total && attempts < total * 12; attempts++) {
      const base = rand() < 0.5 ? HOME : ENEMY, a = rand() * Math.PI * 2, r = 340 + rand() * 440;
      const near = rand() < 0.45, x = near ? base.x + Math.cos(a) * r : cx + (rand() - 0.5) * 3300;
      const z = near ? base.z + Math.sin(a) * r : ENEMY.z - 720 + rand() * 6640;
      if (Math.abs(x)<1735 && z>roadZ(x)-185 && z<roadZ(x)+34) continue;
      if ([HOME, ENEMY].some(o => Math.abs(x - o.x) < 310 && Math.abs(z - o.z) < 290)) continue;
      if (rand() > 0.24 + N.fbm(x / 350 + 24, z / 350 + 7, 2) * 0.95) continue;
      const s = shrub ? 0.8 + rand() * 2.6 : 0.75 + rand() ** 2 * 3.5, turn = rand() * Math.PI * 2;
      const first = layer.count * pieces;
      for (let i = 0; i < pieces; i++) {
        const angle = turn + i * 2.39996, k = shrub ? s * (0.48 + rand() * 0.36) : s;
        dummy.position.set(x + (shrub ? Math.cos(angle) * s * 0.38 : 0), shrub ? k * 0.25 : -k * 0.09, z + (shrub ? Math.sin(angle) * s * 0.38 : 0));
        dummy.rotation.set(shrub ? 0.26 : rand() * 0.4, angle, 0);
        dummy.scale.set(k, k * (shrub ? 0.56 + rand() * 0.4 : 0.76), k * 0.76); dummy.position.y += heightAt(dummy.position.x, dummy.position.z); dummy.updateMatrix(); layer.mesh.setMatrixAt(first + i, dummy.matrix);
        layer.mesh.setColorAt(first + i, tint.copy(layer.tint).lerp(white, rand() * 0.7));
      }
      layer.count++;
    }
    scene.add(layer.mesh);
  }
  W.setDesertQuality = () => {
    for (const t of [sand.map, sand.normalMap]) if (t.anisotropy !== Q.sandAniso) { t.anisotropy = Q.sandAniso; t.needsUpdate = true; }
    for (const layer of scatter) {
      const count = Math.min(layer.count, Q[layer.key] ?? 0);
      layer.mesh.count = count * layer.pieces;
      layer.mesh.computeBoundingSphere();
    }
    const low = Q.tier === 'low';
    if(low !== avenueLow) { const old=avenue.geometry; avenue.geometry=avenueGeometry(low); old.dispose(); avenueLow=low; }
    traffic.count = Q.traffic;
    streetPalms.count = Math.min(Q.avenuePalms,streetPalms.instanceMatrix.count);
    if (skylineBands !== Q.landmarkBands) {
      const previous = skyline.geometry; skyline.geometry = skylineGeometry(Q.landmarkBands); previous.dispose(); skylineBands = Q.landmarkBands;
    }
  };
  let skylineBands = Q.landmarkBands;
  const cityNight = {value:0}, cityMaterial = mat({vertexColors:true,roughness:0.64,metalness:0.18});
  cityMaterial.onBeforeCompile = shader => {
    shader.uniforms.cityNight = cityNight;
    shader.vertexShader = 'attribute float nightGlow; varying float vGlow;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvGlow=nightGlow;');
    shader.fragmentShader = 'uniform float cityNight; varying float vGlow;\n'+shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlow * cityNight;');
  };
  const traffic = avenueTraffic(desertBudget.traffic); traffic.name='Avenue traffic'; scene.add(traffic);
  const streetPalms = roadsidePalms(desertBudget.avenuePalms); scene.add(streetPalms);
  let avenueLow = Q.tier === 'low';
  const avenue = new THREE.Mesh(avenueGeometry(avenueLow),cityMaterial); avenue.name='City avenue'; scene.add(avenue);
  const glass=cityMaterial.clone();
  glass.onBeforeCompile=shader=>{
    cityMaterial.onBeforeCompile(shader);
    shader.vertexShader='attribute float glazing; varying float vGlazing;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvGlazing=glazing;');
    shader.fragmentShader='varying float vGlazing;\n'+shader.fragmentShader
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.75,roughnessFactor,vGlazing);')
      .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor*=vGlazing;');
  };
  glass.roughness=.33; glass.metalness=.48; glass.userData.envK=1.15;
  const skyline = new THREE.Mesh(skylineGeometry(skylineBands),glass);
  skyline.name = 'Riyadh skyline'; scene.add(skyline);

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
    const flat = (w, d, m, x, z, y = 0.06, rx = w / 7, ry = d / 7) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, d), tiled(m, rx, ry)); o.rotation.x = -Math.PI / 2; o.position.set(x, y, z); o.receiveShadow = true; o.material.polygonOffset = true; o.material.polygonOffsetFactor = o.material.polygonOffsetUnits = -Math.round(y * 70); B.add(o); return o; };
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
    for (let i = 0; i < Q.palms; i++) { const x = -230 + i * (460 / Q.palms) + Math.random() * 6, p = palm(6 + Math.random() * 4); p.userData.palm = 1; p.position.set(x, 0, (i % 2 ? 69 : 51) + Math.random() * 2); B.add(p); }
    for (let i = 0; i < 6; i++) { const p = palm(6 + Math.random() * 3); p.userData.palm = 1; p.position.set(40 + Math.random() * 40, 0, 104 + Math.random() * 14); B.add(p); }
    for (let i = -4; i <= 4; i++) lampPost(B, i * 50 + 12, 53.5, 0);
    // مركبات ومنظومات
    const put = (o, x, z, ry) => { o.position.set(x, 0, z); o.rotation.y = ry; B.add(o); return o; };
    put(W.truck(paint, 'cargo'), -70, 60, Math.PI / 2); put(W.truck(paint, 'cargo'), 150, 62, -Math.PI / 2); put(W.truck(paint, 'cargo'), -98, 4, 0.3);
    const sys = { quad: put(W.truck(paint, 'quad'), 70, -8, Math.PI + 0.25), octo: put(W.truck(paint, 'octo'), 122, -18, Math.PI - 0.2), radar: put(W.truck(paint, 'radar'), 52, 22, Math.PI), gun: put(W.gunMount(), 30, -40, 0), beam: put(W.beamMount(), -24, -52, Math.PI) };
    col(70, -8, 6, 4, 'sys'); col(122, -18, 6, 5, 'sys'); col(52, 22, 5, 5, 'sys');
    for (let i = 0; i < 14; i++) { const b = box(2.4, 0.9, 0.6, MT.concrete, -14 + i * 2.6, 0.45, 28); B.add(b); }
    for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) B.add(box(2.4, 2.5, 6, [MT.red, MT.olive, MT.tan, MT.steel][(i + j) % 4], -150 + i * 3.2, 1.25 + (i % 2 && j ? 2.5 : 0), 20 + j * 7));
    { const S = 1.25, CL = [[60, 96, 16], [91, -65, 15], [-144, 23.5, 12], [3, 28, 20]]; // تكبير المباني والمعدات
      B.children.forEach(c => { if (c.isInstancedMesh || (c.userData && c.userData.palm)) return; const gt = c.geometry && c.geometry.type; if (gt && gt !== 'BoxGeometry' && gt !== 'CylinderGeometry') return;
        const cl = CL.find(([x, z, r]) => Math.hypot(c.position.x - x, c.position.z - z) < r); if (!cl && !c.isGroup) return; if (gt === 'BoxGeometry' && !cl) return;
        if (cl) { c.position.x = cl[0] + (c.position.x - cl[0]) * S; c.position.z = cl[1] + (c.position.z - cl[1]) * S; } c.position.y *= S; c.scale.multiplyScalar(S); });
      W.colliders.forEach(c => { if (c.enemy === enemy && !c._s) { c.r *= S; c.h *= S; c._s = 1; } }); }
    const bermM = MT.berm, flag = (x, z, c) => { const p = cyl(0.12, 0.16, 16, MT.steel, 8); p.position.set(x, 8, z); B.add(p); const f = new THREE.Mesh(new THREE.PlaneGeometry(7, 4.2), new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, side: THREE.DoubleSide })); f.position.set(x + 3.6, 13.6, z); B.add(f); };
    if (enemy) {
      // قاعدة الخصم: مخطط معكوس، أرضية حصوية داكنة، سواتر حول الحظائر، صخور حولها، بلا نخيل
      B.children.forEach(c => { if (c.isInstancedMesh) return; c.position.x *= -1; c.rotation.y *= -1; });
      W.colliders.forEach(c => { if (c.enemy && !c._m) { c.x = origin.x - (c.x - origin.x); c._m = 1; } });
      B.children.filter(c => c.userData && c.userData.palm).forEach(c => { c.visible = false; });
      const gv = MT.gravel || (MT.gravel = mat({ color: 0xf0dcae, map: T.sand, roughness: 1, metalness: 0 })); flat(432, 432, gv, 0, 0, 0.03, 18, 18);
      for (const sx of [103, 137]) { const r = box(3, 5, 82, bermM, sx, 2.5, -32); B.add(r); } B.add(box(37, 5, 3, bermM, 120, 2.5, -74));
      const rk = MT.rock || (MT.rock = mat({ color: 0x75685a, map: T.sand, roughness: 1, metalness: 0 }));
      { const n = 54, im = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rk, n), d = new THREE.Object3D(); for (let i = 0; i < n; i++) { const a = Math.PI * (0.94 + (i / n) * 1.12) + Math.random() * 0.1, r = 262 + Math.random() * 120, s = 4 + Math.random() * 11; d.position.set(Math.cos(a) * r, s * 0.25, Math.sin(a) * r * 0.95 - 20); d.scale.set(s, s * (0.5 + Math.random() * 0.5), s * (0.7 + Math.random() * 0.6)); d.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3); d.updateMatrix(); im.setMatrixAt(i, d.matrix); } im.castShadow = im.receiveShadow = true; B.add(im); }
      flag(18, 14, 0xb3261e);
    } else {
      // قاعدتنا: مهبط مروحيات، خزان ماء، سارية علم، ونخيل أكثر
      const pad = new THREE.Mesh(new THREE.CircleGeometry(17, 40), MT.concrete); pad.rotation.x = -Math.PI / 2; pad.position.set(158, 0.08, 136); pad.receiveShadow = true; B.add(pad);
      const wh = new THREE.MeshStandardMaterial({ color: 0xf2efe2, roughness: 0.9 }); [[-4.5, 0, 1.6, 12], [4.5, 0, 1.6, 12], [0, 0, 9, 1.6]].forEach(([x, z, sx, sz]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), wh); m.rotation.x = -Math.PI / 2; m.position.set(158 + x, 0.11, 136 + z); B.add(m); });
      const ring = new THREE.Mesh(new THREE.RingGeometry(14.2, 15.2, 40), wh); ring.rotation.x = -Math.PI / 2; ring.position.set(158, 0.1, 136); B.add(ring);
      const wt = cyl(5.5, 5.5, 6, MT.white, 18); wt.position.set(-172, 17, 128); B.add(wt); const wc = cyl(0.3, 5.6, 1.6, MT.white, 18); wc.position.set(-172, 20.8, 128); B.add(wc);
      [[-4, -4], [4, -4], [-4, 4], [4, 4]].forEach(([x, z]) => { const l = cyl(0.22, 0.3, 14, MT.steel, 6); l.position.set(-172 + x, 7, 128 + z); B.add(l); });
      flag(36, 104, 0x1f8a4c);
      [[-190, -180], [-180, -192], [188, -184], [176, 190], [190, 176], [-186, 186], [-196, 170]].forEach(([x, z]) => { const p = palm(6 + Math.random() * 4); p.position.set(x, 0, z); B.add(p); });
    }
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
  W.setDesertQuality();
  return W;
}
