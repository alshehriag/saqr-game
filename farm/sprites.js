// رسومات «مزرعة الشيوخ» — كلها SVG تتحول لصور مرة وحدة عند التحميل
(function () {
  const COLORS = ['#e4574b', '#3d8bd9', '#f08a1c', '#8a5cd0'];
  const DARK = ['#8e2d22', '#1f5a99', '#9a520a', '#55338f'];
  const wrap = (vb, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><defs>${defs}</defs>${body}</svg>`;
  const FLUFF = `<filter id="f" x="-25%" y="-25%" width="150%" height="150%"><feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="8"/></filter>`;
  const SADU = `<pattern id="sd" width="16" height="12" patternUnits="userSpaceOnUse"><rect width="16" height="12" fill="#c8312b"/><path d="M0 12 L8 3 L16 12" fill="#1c1c1c"/><path d="M4 12 L8 7 L12 12" fill="#f4e7c8"/></pattern>`;
  const SHM = `<pattern id="sh" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#fff"/><rect width="3.5" height="3.5" fill="#d9302a"/><rect x="3.5" y="3.5" width="3.5" height="3.5" fill="#d9302a"/></pattern>`;

  const SVG = {};
  SVG.sheep = wrap('-34 -30 68 56', `
    <ellipse cx="0" cy="20" rx="24" ry="5" fill="#000" opacity=".15"/>
    <rect x="-13" y="6" width="5" height="14" rx="2" fill="#3a2f2a"/><rect x="7" y="6" width="5" height="14" rx="2" fill="#3a2f2a"/>
    <g fill="#fffaf0" stroke="#d6cdbd" stroke-width="2"><circle cx="-12" cy="0" r="11"/><circle cx="10" cy="0" r="11"/><circle cx="0" cy="-7" r="12"/><circle cx="-4" cy="6" r="11"/><circle cx="6" cy="5" r="10"/></g>
    <circle cx="-2" cy="-1" r="12" fill="#fffaf0"/>
    <ellipse cx="21" cy="-5" rx="8" ry="9" fill="#3a2f2a"/><ellipse cx="16" cy="-12" rx="6" ry="3" fill="#3a2f2a" transform="rotate(-30 16 -12)"/>
    <circle cx="24" cy="-7" r="2" fill="#fff"/>`);
  SVG.rabbit = wrap('-26 -38 54 58', `
    <ellipse cx="0" cy="15" rx="17" ry="4" fill="#000" opacity=".15"/>
    <ellipse cx="4" cy="-22" rx="4" ry="12" fill="#f4efe9" stroke="#c9beb2" stroke-width="2" transform="rotate(-12 4 -22)"/>
    <ellipse cx="13" cy="-21" rx="4" ry="12" fill="#f4efe9" stroke="#c9beb2" stroke-width="2" transform="rotate(14 13 -21)"/>
    <ellipse cx="13" cy="-21" rx="1.6" ry="8" fill="#f6a9b8" transform="rotate(14 13 -21)"/>
    <ellipse cx="-2" cy="4" rx="15" ry="11" fill="#f4efe9" stroke="#c9beb2" stroke-width="2"/>
    <circle cx="-16" cy="2" r="5" fill="#fff" stroke="#c9beb2" stroke-width="2"/>
    <circle cx="9" cy="-6" r="9" fill="#f4efe9" stroke="#c9beb2" stroke-width="2"/>
    <circle cx="12" cy="-8" r="1.8" fill="#3a2f2a"/><circle cx="17" cy="-4" r="1.8" fill="#f17c95"/>`);
  SVG.camel = wrap('-46 -50 104 92', `
    <ellipse cx="0" cy="34" rx="40" ry="6" fill="#000" opacity=".15"/>
    <g fill="#b97c3a"><rect x="-26" y="8" width="7" height="28" rx="3"/><rect x="-14" y="8" width="7" height="28" rx="3"/><rect x="10" y="8" width="7" height="28" rx="3"/><rect x="20" y="8" width="7" height="28" rx="3"/></g>
    <ellipse cx="0" cy="4" rx="32" ry="16" fill="#d9a35b"/><ellipse cx="-4" cy="-12" rx="16" ry="13" fill="#d9a35b"/>
    <rect x="-18" y="-16" width="28" height="14" rx="3" fill="url(#sd)"/>
    <path d="M26 0 Q34 -10 36 -32" stroke="#d9a35b" stroke-width="12" fill="none" stroke-linecap="round"/>
    <ellipse cx="43" cy="-34" rx="12" ry="7" fill="#d9a35b"/><ellipse cx="34" cy="-41" rx="3" ry="5" fill="#b97c3a"/>
    <circle cx="44" cy="-36" r="2" fill="#2a1d12"/><path d="M-32 0 q-8 6 -4 14" stroke="#b97c3a" stroke-width="3" fill="none"/>`, SADU);
  SVG.worm = wrap('-36 -30 72 48', `
    <ellipse cx="0" cy="12" rx="30" ry="4" fill="#000" opacity=".12"/>
    <g fill="#8fd14f" stroke="#4f8f22" stroke-width="2"><circle cx="-24" cy="4" r="7"/><circle cx="-13" cy="0" r="8"/><circle cx="-1" cy="3" r="8"/><circle cx="11" cy="0" r="8"/></g>
    <g fill="#ffd23f"><circle cx="-24" cy="2" r="2"/><circle cx="-13" cy="-3" r="2"/><circle cx="-1" cy="0" r="2"/><circle cx="11" cy="-3" r="2"/></g>
    <circle cx="23" cy="-3" r="10" fill="#a6e05f" stroke="#4f8f22" stroke-width="2"/><circle cx="26" cy="-5" r="2.3" fill="#222"/>
    <path d="M20 -12 l-4 -9 M27 -12 l3 -9" stroke="#4f8f22" stroke-width="2"/><circle cx="16" cy="-22" r="2.5" fill="#e4574b"/><circle cx="30" cy="-22" r="2.5" fill="#e4574b"/>`);

  const farmer = (c, d) => wrap('-30 -42 64 78', `
    <ellipse cx="0" cy="30" rx="22" ry="6" fill="#000" opacity=".18"/>
    <rect x="-15" y="-4" width="30" height="34" rx="12" fill="${c}" stroke="${d}" stroke-width="3"/>
    <circle cx="0" cy="-18" r="14" fill="#e9b48a" stroke="#a8724a" stroke-width="2"/>
    <ellipse cx="0" cy="-27" rx="25" ry="7" fill="#e6c35c" stroke="#a88523" stroke-width="2"/>
    <path d="M-12 -28 q12 -18 24 0z" fill="#e6c35c" stroke="#a88523" stroke-width="2"/>
    <path d="M-12 -30 h24" stroke="${c}" stroke-width="3"/>
    <circle cx="5" cy="-16" r="2" fill="#2a1d12"/><path d="M2 -10 q4 3 8 0" stroke="#2a1d12" stroke-width="2" fill="none"/>
    <path d="M14 6 L30 -20" stroke="#7a4a1f" stroke-width="5" stroke-linecap="round"/>`);
  const herder = (c, d) => wrap('-34 -42 66 78', `
    <ellipse cx="0" cy="30" rx="22" ry="6" fill="#000" opacity=".18"/>
    <rect x="-15" y="-4" width="30" height="34" rx="12" fill="#fff" stroke="${c}" stroke-width="5"/>
    <rect x="-15" y="18" width="30" height="7" fill="${c}"/>
    <circle cx="0" cy="-17" r="14" fill="#c99067"/>
    <path d="M-17 -18 q0 -20 17 -20 q17 0 17 20 l4 22 l-10 -6 l-6 -14 l-10 0 l-6 14 l-10 6z" fill="url(#sh)" stroke="#a62520" stroke-width="1.5"/>
    <ellipse cx="0" cy="-30" rx="15" ry="5" fill="none" stroke="#1c1c1c" stroke-width="4"/>
    <circle cx="5" cy="-15" r="2" fill="#2a1d12"/><path d="M1 -9 q4 3 8 0" stroke="#2a1d12" stroke-width="2" fill="none"/>
    <path d="M14 6 L30 -22 q4 -8 -4 -10" stroke="#7a4a1f" stroke-width="5" fill="none" stroke-linecap="round"/>`, SHM);

  // جاي يمشي (من الجنب): أبيض كريمي منفوش، أطراف رمادية، طوق أخضر
  SVG.jayWalk = wrap('-62 -56 124 100', `
    <ellipse cx="0" cy="34" rx="44" ry="7" fill="#000" opacity=".16"/>
    <g filter="url(#f)">
      <path d="M-34 -6 Q-62 -30 -48 -50" stroke="#ece4d6" stroke-width="18" fill="none" stroke-linecap="round"/>
      <rect x="-30" y="10" width="13" height="24" rx="6" fill="#efe8dc"/><rect x="-12" y="12" width="13" height="22" rx="6" fill="#efe8dc"/>
      <rect x="14" y="12" width="13" height="22" rx="6" fill="#efe8dc"/><rect x="28" y="10" width="13" height="24" rx="6" fill="#efe8dc"/>
      <ellipse cx="0" cy="2" rx="40" ry="24" fill="#f5eee2"/>
      <circle cx="36" cy="-16" r="22" fill="#f5eee2"/>
    </g>
    <g fill="#b3aca4"><ellipse cx="-23" cy="34" rx="8" ry="4"/><ellipse cx="-5" cy="34" rx="8" ry="4"/><ellipse cx="21" cy="34" rx="8" ry="4"/><ellipse cx="35" cy="34" rx="8" ry="4"/></g>
    <path d="M22 -30 l-4 -16 l14 8z M44 -32 l8 -14 l2 16z" fill="#d7cfc4" stroke="#bdb3a7" stroke-width="2"/>
    <circle cx="40" cy="-16" r="16" fill="#cfc8bf" opacity=".55"/>
    <path d="M34 -20 q4 3 8 0 M44 -20 q4 3 8 0" stroke="#5b534c" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M45 -12 l4 4 l4 -4z" fill="#f29aa6"/>
    <path d="M20 0 Q32 8 46 -2" stroke="#b5e03c" stroke-width="7" fill="none" stroke-linecap="round"/>
    <circle cx="34" cy="5" r="3.5" fill="#ffd23f" stroke="#a88523" stroke-width="1"/>`, FLUFF);
  // جاي منبطح على ظهره — مثل الصور بالضبط
  SVG.jayFlop = wrap('-110 -160 220 280', `
    <ellipse cx="6" cy="92" rx="78" ry="12" fill="#000" opacity=".15"/>
    <g filter="url(#f)">
      <path d="M-30 -60 L-58 -112" stroke="#f3ece0" stroke-width="34" stroke-linecap="round"/>
      <path d="M30 -60 L64 -104" stroke="#f3ece0" stroke-width="34" stroke-linecap="round"/>
      <path d="M-34 30 L-88 84" stroke="#f3ece0" stroke-width="30" stroke-linecap="round"/>
      <path d="M34 30 L90 82" stroke="#f3ece0" stroke-width="30" stroke-linecap="round"/>
      <path d="M6 -96 Q30 -132 6 -150" stroke="#e8e0d2" stroke-width="20" fill="none" stroke-linecap="round"/>
      <ellipse cx="0" cy="-22" rx="56" ry="82" fill="#f5eee2"/>
      <circle cx="0" cy="58" r="44" fill="#f3ece0"/>
    </g>
    <g fill="#b3aca4"><circle cx="-60" cy="-116" r="12"/><circle cx="66" cy="-108" r="12"/><circle cx="-90" cy="87" r="12"/><circle cx="92" cy="85" r="12"/></g>
    <path d="M-20 -40 q8 -8 16 0 M6 -10 q8 -8 16 0 M-26 -2 q8 -8 16 0" stroke="#e3d9c8" stroke-width="3" fill="none"/>
    <path d="M-40 26 Q0 44 40 26" stroke="#b5e03c" stroke-width="11" fill="none" stroke-linecap="round"/>
    <path d="M-30 31 l4 -4 M-14 35 l4 -4 M2 37 l4 -4 M18 35 l4 -4" stroke="#2b2b2b" stroke-width="3"/>
    <path d="M-32 84 l-8 22 l22 -10z M32 84 l8 22 l-22 -10z" fill="#d7cfc4" stroke="#bdb3a7" stroke-width="2"/>
    <circle cx="0" cy="66" r="30" fill="#bdb6ad" opacity=".35"/>
    <path d="M-22 72 q8 6 16 0 M6 72 q8 6 16 0" stroke="#5b534c" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <path d="M-6 50 l6 8 l6 -8z" fill="#f29aa6" stroke="#c46d7a" stroke-width="1.5"/>
    <path d="M-14 58 l-26 -4 M-14 62 l-26 4 M14 58 l26 -4 M14 62 l26 4" stroke="#9b938b" stroke-width="1.5"/>`, FLUFF);
  SVG.palm = wrap('-50 -80 100 90', `
    <ellipse cx="0" cy="4" rx="22" ry="5" fill="#000" opacity=".15"/>
    <rect x="-5" y="-40" width="10" height="44" rx="4" fill="#8a5a2b"/>
    <g fill="#3f8f2a"><path d="M0 -42 q-34 -6 -46 10 q20 -14 46 -6z"/><path d="M0 -42 q34 -6 46 10 q-20 -14 -46 -6z"/><path d="M0 -44 q-18 -26 -38 -24 q22 4 38 24z"/><path d="M0 -44 q18 -26 38 -24 q-22 4 -38 24z"/></g>
    <circle cx="-3" cy="-38" r="4" fill="#c8641c"/><circle cx="4" cy="-37" r="4" fill="#c8641c"/>`);
  // جاي صاحي: نفس الانبطاحة بس عيونه مفتوحة 👀
  SVG.jayAwake = SVG.jayFlop.replace('<path d="M-22 72 q8 6 16 0 M6 72 q8 6 16 0" stroke="#5b534c" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
    '<g><circle cx="-14" cy="72" r="11" fill="#d8f06a" stroke="#5b534c" stroke-width="3"/><circle cx="14" cy="72" r="11" fill="#d8f06a" stroke="#5b534c" stroke-width="3"/><ellipse cx="-14" cy="73" rx="3.5" ry="8" fill="#1c1c1c"/><ellipse cx="14" cy="73" rx="3.5" ry="8" fill="#1c1c1c"/><circle cx="-11" cy="68" r="2.5" fill="#fff"/><circle cx="17" cy="68" r="2.5" fill="#fff"/></g>');
  // بيت نجدي طين مع باب ملوّن
  SVG.house = wrap('-150 -120 300 150', `
    <ellipse cx="0" cy="24" rx="150" ry="10" fill="#000" opacity=".15"/>
    <rect x="-140" y="-70" width="280" height="92" rx="6" fill="#c98d55"/>
    <rect x="-140" y="-70" width="280" height="14" fill="#b57a45"/>
    <g fill="#f3e6cf">${Array.from({ length: 14 }, (_, i) => `<path d="M${-140 + i * 20} -70 l10 -18 l10 18z"/>`).join('')}</g>
    <rect x="-60" y="-118" width="120" height="50" rx="4" fill="#c98d55"/>
    <g fill="#f3e6cf">${Array.from({ length: 6 }, (_, i) => `<path d="M${-60 + i * 20} -118 l10 -14 l10 14z"/>`).join('')}</g>
    <g fill="#5a3a1c"><path d="M-110 -30 l10 -16 l10 16z"/><path d="M90 -30 l10 -16 l10 16z"/><path d="M-80 -30 l10 -16 l10 16z"/><path d="M60 -30 l10 -16 l10 16z"/><path d="M-20 -96 l10 -14 l10 14z"/><path d="M0 -96 l10 -14 l10 14z"/></g>
    <rect x="-30" y="-44" width="60" height="66" rx="3" fill="#7a3d1c" stroke="#5a2a10" stroke-width="3"/>
    <rect x="-24" y="-38" width="48" height="54" fill="#2f7a6a"/>
    <path d="M-24 -38 l12 12 l12 -12 l12 12 l12 -12 v12 l-12 12 l-12 -12 l-12 12 l-12 -12z" fill="#e2b33c"/>
    <path d="M-24 0 l12 12 l12 -12 l12 12 l12 -12 v16 h-48z" fill="#c8312b"/>
    <circle cx="16" cy="-6" r="3" fill="#e2b33c"/>
    <rect x="-24" y="-12" width="48" height="6" fill="#f3e6cf"/>`);
  SVG.tuna = wrap('-24 -24 48 44', `
    <ellipse cx="0" cy="14" rx="20" ry="5" fill="#000" opacity=".18"/>
    <rect x="-18" y="-10" width="36" height="22" rx="4" fill="#cfd6dc" stroke="#7d8a95" stroke-width="2"/>
    <ellipse cx="0" cy="-10" rx="18" ry="6" fill="#e9eef2" stroke="#7d8a95" stroke-width="2"/>
    <rect x="-18" y="-4" width="36" height="12" fill="#2e78c7"/>
    <path d="M-9 2 q7 -6 14 0 q-7 6 -14 0z M5 2 l5 -4 v8z" fill="#ffcf4a"/>
    <circle cx="-5" cy="1" r="1.2" fill="#222"/>`);
  // أغراض الغميضة
  SVG.box = wrap('-44 -46 88 80', `
    <ellipse cx="0" cy="28" rx="40" ry="7" fill="#000" opacity=".18"/>
    <path d="M-36 -10 L0 -24 L36 -10 L36 26 L0 34 L-36 26z" fill="#c9965a" stroke="#7a5228" stroke-width="3" stroke-linejoin="round"/>
    <path d="M-36 -10 L0 4 L36 -10 M0 4 V34" stroke="#7a5228" stroke-width="3" fill="none"/>
    <path d="M-36 -10 L-44 -26 L-8 -40 L0 -24z M36 -10 L44 -26 L8 -40 L0 -24z" fill="#ddb077" stroke="#7a5228" stroke-width="3" stroke-linejoin="round"/>
    <rect x="-24" y="10" width="16" height="6" fill="#e9d2ad" transform="skewY(-20)"/>`);
  SVG.basket = wrap('-40 -48 80 82', `
    <ellipse cx="0" cy="28" rx="34" ry="7" fill="#000" opacity=".18"/>
    <path d="M-30 -20 L30 -20 L24 28 L-24 28z" fill="#d9b26a" stroke="#8a6326" stroke-width="3" stroke-linejoin="round"/>
    <g stroke="#a87d3a" stroke-width="2.5"><path d="M-28 -6 H28 M-26 8 H26 M-25 20 H25"/><path d="M-14 -20 L-12 28 M0 -20 V28 M14 -20 L12 28"/></g>
    <path d="M-26 -22 q8 -18 20 -6 q8 -14 18 -2 q10 -10 14 6z" fill="#7ab8e8" stroke="#3d7aa8" stroke-width="2"/>
    <path d="M-6 -30 q10 -12 22 2" fill="#f2a7c3" stroke="#b5587f" stroke-width="2"/>`);
  SVG.sofa = wrap('-56 -44 112 76', `
    <ellipse cx="0" cy="26" rx="52" ry="7" fill="#000" opacity=".18"/>
    <rect x="-50" y="-30" width="100" height="40" rx="12" fill="#b23a3a" stroke="#6e1f1f" stroke-width="3"/>
    <rect x="-52" y="4" width="104" height="22" rx="8" fill="#c94a4a" stroke="#6e1f1f" stroke-width="3"/>
    <g fill="#e2b33c"><path d="M-40 -20 l6 -6 l6 6 l-6 6z M-6 -20 l6 -6 l6 6 l-6 6z M28 -20 l6 -6 l6 6 l-6 6z"/></g>
    <path d="M-50 12 H50" stroke="#1c1c1c" stroke-width="2" stroke-dasharray="6 4"/>`);
  SVG.barrel = wrap('-36 -48 72 84', `
    <ellipse cx="0" cy="30" rx="30" ry="7" fill="#000" opacity=".18"/>
    <path d="M-26 -34 Q-34 0 -26 30 L26 30 Q34 0 26 -34z" fill="#3d8bd9" stroke="#1f5a99" stroke-width="3"/>
    <ellipse cx="0" cy="-34" rx="26" ry="8" fill="#5fa3e6" stroke="#1f5a99" stroke-width="3"/>
    <g stroke="#1f5a99" stroke-width="3" fill="none"><path d="M-30 -12 Q0 -6 30 -12"/><path d="M-30 12 Q0 18 30 12"/></g>`);
  // أكل جاي
  SVG.fish = wrap('-34 -22 68 44', `
    <ellipse cx="0" cy="14" rx="26" ry="5" fill="#000" opacity=".15"/>
    <path d="M-22 0 q18 -18 40 0 q-22 18 -40 0z" fill="#8fc6e8" stroke="#3d7aa8" stroke-width="2.5"/>
    <path d="M-20 0 l-12 -10 v20z" fill="#8fc6e8" stroke="#3d7aa8" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="10" cy="-3" r="2.6" fill="#1c1c1c"/><path d="M-4 -6 q4 6 0 12" stroke="#3d7aa8" stroke-width="2" fill="none"/>`);
  SVG.chicken = wrap('-30 -30 60 56', `
    <ellipse cx="0" cy="20" rx="22" ry="5" fill="#000" opacity=".15"/>
    <path d="M-4 -24 q22 -4 22 16 q0 14 -18 16 l-10 10 q-6 6 -10 0 q-6 -2 -2 -8 l10 -10 q-10 -20 8 -24z" fill="#d98a3a" stroke="#8a4e16" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="-18" cy="16" r="5" fill="#fff4e0" stroke="#b8a888" stroke-width="2"/><circle cx="-12" cy="22" r="5" fill="#fff4e0" stroke="#b8a888" stroke-width="2"/>
    <path d="M2 -16 q8 -2 10 6" stroke="#f2b26a" stroke-width="3" fill="none"/>`);
  for (let i = 0; i < 4; i++) { SVG['farmer' + i] = farmer(COLORS[i], DARK[i]); SVG['herder' + i] = herder(COLORS[i], DARK[i]); }

  const IMG = {}; let left = 0;
  const ready = new Promise(res => {
    for (const k in SVG) {
      left++; const im = new Image();
      im.onload = im.onerror = () => { if (--left === 0) res(); };
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(SVG[k]); IMG[k] = im;
    }
  });
  // كل صورة: الأبعاد الأصلية من viewBox عشان نرسمها بمقاسها الصحيح
  const DIM = {}; for (const k in SVG) { const m = SVG[k].match(/viewBox="([^"]+)"/)[1].split(' ').map(Number); DIM[k] = m; }
  window.SPR = { IMG, DIM, ready, COLORS, DARK, SVG };
})();
