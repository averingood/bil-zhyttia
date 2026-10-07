// Кімната: ізометричний піксельний малюнок, пересування героя, зони.
// Про правила гри не знає нічого, крім того, що читає зі стану для вигляду.
(function (root) {
  'use strict';

  // Полотно обрізане впритул до квартири, щоб вона займала всю сцену.
  const W = 206, H = 172;
  const OX = 98, OY = 66, TW2 = 10, TH2 = 5;
  const RX = 10, RY = 9, WH = 58, T = 0.4, SL = 6;

  const PAL = {
    ol: '#171a22',
    // Глибокий синьо-зелений замість сірого: темно, але тепло поруч із деревом.
    wallL: '#2f5f5c', wallR: '#3b716b', trim: '#24443f', capTop: '#9cb3a6', capSide: '#1f3836',
    floorA: '#93653f', floorB: '#845a37', seam: '#6a4529', slab: '#3a2a24', slabD: '#291e1b',
    wood: '#6e4630', woodL: '#8f603f', woodD: '#4f3222',
    metal: '#33373f', metalL: '#59606b', steel: '#b9bfc6', fridge: '#d3d6d2', cabinet: '#7b5a3f',
    sofa: '#94532f', sofaD: '#74401f', cushion: '#a8633a',
    navy: '#2d4763', sheet: '#d8d6cc', mat: '#3d4f7a', rug: '#6d3530', rugB: '#8c4a3c', teal: '#3f7a72',
    mustard: '#d4a03e', red: '#b0453a', blue: '#5b83ab', screen: '#5fc7b3', screenOff: '#253844',
    skin: '#e0ac84', skinD: '#c48b67', hair: '#3a2a20', hood: '#c4842f', hoodD: '#a06a22', jeans: '#2f3d57', shoe: '#1c1d22',
  };


  // Світло частин дня. Кімната не перемикається між ними, а плавно перетікає (див. update).
  // Ранок, день, пообіддя, вечір і окремо ніч (індекс 4) — лише поки він спить.
  const SKY = [[241, 200, 142], [159, 208, 234], [236, 196, 128], [214, 120, 92], [27, 34, 64]];
  const TINT = [[1.03, 1.0, 0.93], [1, 1, 1], [1.04, 0.96, 0.86], [0.9, 0.76, 0.72], [0.42, 0.46, 0.66]];
  const LAMP = [0, 0, 0, 0.55, 1];
  const PATCH = [[2.6, 0.3, 0.35], [1.4, 0, 0.28], [2.2, 0.4, 0.32], [3.4, 0.8, 0.22], [3.4, 0.8, 0]];
  const PATCH_COL = [[255, 226, 166], [255, 244, 212], [255, 214, 150], [255, 150, 92], [255, 150, 92]];
  const hexOf = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

  // ---------- примітиви ----------

  const P = (x, y, z) => [OX + (x - y) * TW2, OY + (x + y) * TH2 - (z || 0)];

  let rec = null; // зона, чиї межі зараз записуються
  const bounds = {};
  function extend(x0, y0, x1, y1) {
    if (!rec) return;
    const b = bounds[rec] || (bounds[rec] = [Infinity, Infinity, -Infinity, -Infinity]);
    b[0] = Math.min(b[0], x0); b[1] = Math.min(b[1], y0);
    b[2] = Math.max(b[2], x1); b[3] = Math.max(b[3], y1);
  }

  // Заливка стовпчиками дає чисті піксельні краї без згладжування.
  function poly(ctx, pts, col) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    }
    extend(minX, minY, maxX, maxY);
    ctx.fillStyle = col;
    const n = pts.length;
    for (let x = Math.floor(minX); x < Math.ceil(maxX); x++) {
      const cx = x + 0.5;
      let y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        if ((a[0] <= cx && b[0] > cx) || (b[0] <= cx && a[0] > cx)) {
          const y = a[1] + ((cx - a[0]) * (b[1] - a[1])) / (b[0] - a[0]);
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      const t = Math.round(y0), bt = Math.round(y1);
      if (bt > t) ctx.fillRect(x, t, 1, bt - t);
    }
  }

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

  function polyDither(ctx, pts, col, level) {
    let minX = Infinity, maxX = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); }
    ctx.fillStyle = col;
    for (let x = Math.floor(minX); x < Math.ceil(maxX); x++) {
      const cx = x + 0.5;
      let y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[0] <= cx && b[0] > cx) || (b[0] <= cx && a[0] > cx)) {
          const y = a[1] + ((cx - a[0]) * (b[1] - a[1])) / (b[0] - a[0]);
          y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
      }
      for (let y = Math.round(y0); y < Math.round(y1); y++) if (bayer(x, y) < level) ctx.fillRect(x, y, 1, 1);
    }
  }

  function line(ctx, x0, y0, x1, y1, col) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    ctx.fillStyle = col;
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let i = 0; i < 400; i++) {
      ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  const L = (ctx, a, b, col) => line(ctx, a[0], a[1], b[0], b[1], col);

  const shadeCache = {};
  function shade(hex, f) {
    const k = hex + f;
    if (shadeCache[k]) return shadeCache[k];
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (f > 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    const out = '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    return (shadeCache[k] = out);
  }

  function box(ctx, x, y, z, w, d, h, col, o) {
    o = o || {};
    const T0 = P(x, y, z + h), T1 = P(x + w, y, z + h), T2 = P(x + w, y + d, z + h), T3 = P(x, y + d, z + h);
    const B1 = P(x + w, y, z), B2 = P(x + w, y + d, z), B3 = P(x, y + d, z);
    poly(ctx, [B3, B2, T2, T3], o.left || col);
    poly(ctx, [B1, B2, T2, T1], o.right || shade(col, -0.22));
    poly(ctx, [T0, T1, T2, T3], o.top || shade(col, 0.16));
    if (o.outline === false) return;
    const hi = shade(o.top || col, 0.3);
    L(ctx, T1, T2, hi); L(ctx, T2, T3, hi);
    if (h > 2) L(ctx, T2, B2, shade(col, -0.35));
    const oc = PAL.ol;
    L(ctx, T0, T1, oc); L(ctx, T0, T3, oc);
    L(ctx, T3, B3, oc); L(ctx, B3, B2, oc); L(ctx, B2, B1, oc); L(ctx, B1, T1, oc);
  }

  // Прямокутники на площинах стін: права стіна y=0, ліва x=0.
  const wallR = (ctx, x0, x1, z0, z1, col) => poly(ctx, [P(x0, 0, z0), P(x1, 0, z0), P(x1, 0, z1), P(x0, 0, z1)], col);
  const wallL = (ctx, y0, y1, z0, z1, col) => poly(ctx, [P(0, y0, z0), P(0, y1, z0), P(0, y1, z1), P(0, y0, z1)], col);
  const faceY = (ctx, yy, x0, x1, z0, z1, col) => poly(ctx, [P(x0, yy, z0), P(x1, yy, z0), P(x1, yy, z1), P(x0, yy, z1)], col);
  const faceX = (ctx, xx, y0, y1, z0, z1, col) => poly(ctx, [P(xx, y0, z0), P(xx, y1, z0), P(xx, y1, z1), P(xx, y0, z1)], col);

  function sprite(ctx, rows, pal, x, y) {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === '.' || !pal[ch]) continue;
        ctx.fillStyle = pal[ch];
        ctx.fillRect(x + c, y + r, 1, 1);
      }
    }
  }

  // Темний контур навколо спрайта, щоб люди не зливалися з меблями.
  function spriteO(ctx, rows, pal, x, y) {
    ctx.fillStyle = PAL.ol;
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] === '.' || !pal[rows[r][c]]) continue;
      ctx.fillRect(x + c - 1, y + r, 1, 1); ctx.fillRect(x + c + 1, y + r, 1, 1);
      ctx.fillRect(x + c, y + r - 1, 1, 1); ctx.fillRect(x + c, y + r + 1, 1, 1);
    }
    sprite(ctx, rows, pal, x, y);
  }

  // ---------- спрайти ----------

  const HERO_TOP = ['..HHHH..', '.HHHHHH.', '.HSSSSH.', '.SESSES.', '.SSSSSS.', '..SBBS..', '.GGSSGG.',
    'GGGGGGGG', 'GGGDDGGG', 'GGGGGGGG', 'SGGGGGGS', '.JJJJJJ.'];
  const HERO_BACK = ['..HHHH..', '.HHHHHH.', '.HHHHHH.', '.HHHHHH.', '.SHHHHS.', '..SSSS..', '.GGGGGG.',
    'GGGGGGGG', 'GGGGGGGG', 'GGGGGGGG', 'SGGGGGGS', '.JJJJJJ.'];
  const LEGS = [
    ['.JJ..JJ.', '.JJ..JJ.', '.KK..KK.'],
    ['.JJ..JJ.', 'JJ....JJ', 'KK....KK'],
    ['..JJJJ..', '...JJ...', '...KK...'],
  ];
  const HERO_PAL = { H: PAL.hair, S: PAL.skin, E: '#1d1d24', B: PAL.skinD, G: PAL.hood, D: PAL.hoodD, J: PAL.jeans, K: PAL.shoe };

  const CROUCH_LEGS = ['JJJJJJJJ', 'KK....KK'];
  const SLEEP_HEAD = ['.HHHH.', 'HHHHHH', 'HSSSSH', 'SESSES', '.SBBS.'];
  const SEATED = ['..HHHH..', '.HHHHHH.', '.HSSSSH.', '.SESSES.', '..SSSS..', '.GGGGGG.', 'GGGGGGGG', 'SGGGGGGS', '.JJJJJJ.'];
  const SEATED_BACK = ['..HHHH..', '.HHHHHH.', '.HHHHHH.', '.SHHHHS.', '..SSSS..', '.GGGGGG.', 'GGGGGGGG', 'SGGGGGGS', '.JJJJJJ.'];
  // Кожен друг упізнаваний: своє волосся і свій одяг. Одяг холодних кольорів —
  // на рудому дивані теплі губилися.
  const FRIENDS = {
    'Оля':    { long: true,  H: '#b8502f', S: '#ecc09c', G: '#3fa3c4', J: '#2b2f3a' },
    'Марко':  { long: false, H: '#1d1a1f', S: '#d9a47e', G: '#8fd16a', J: '#3a3f6b' },
    'Ірина':  { long: true,  H: '#e8c25a', S: '#f0c8a8', G: '#a77fd6', J: '#2b2f3a' },
    'Тарас':  { long: false, H: '#6b4a2a', S: '#e0ac84', G: '#d9dde8', J: '#33405e' },
    'Соня':   { long: true,  H: '#1d1a1f', S: '#a8754f', G: '#e07a9a', J: '#2b2f3a' },
    'Дмитро': { long: false, H: '#e8c25a', S: '#e8b892', G: '#6f8fe0', J: '#2b2f3a' },
  };
  function friendLook(name) {
    const f = FRIENDS[name] || FRIENDS['Марко'];
    return {
      long: f.long,
      pal: { H: f.H, S: f.S, E: '#1d1d24', B: f.long ? f.S : shade(f.S, -0.15), G: f.G, D: shade(f.G, -0.2), J: f.J, K: '#15161b' },
    };
  }
  const LONG_TOP = ['..HHHH..', '.HHHHHH.', 'HHSSSSHH', 'HSESSESH', 'HSSSSSSH', 'HHSSSSHH', 'HGGSSGGH',
    'GGGGGGGG', 'GGGDDGGG', 'GGGGGGGG', 'SGGGGGGS', '.JJJJJJ.'];
  const LONG_BACK = ['..HHHH..', '.HHHHHH.', 'HHHHHHHH', 'HHHHHHHH', 'HHHHHHHH', 'HHHHHHHH', 'HHGGGGHH',
    'GGGGGGGG', 'GGGGGGGG', 'GGGGGGGG', 'SGGGGGGS', '.JJJJJJ.'];
  const LONG_SEATED = ['..HHHH..', '.HHHHHH.', 'HHSSSSHH', 'HSESSESH', 'HHSSSSHH', 'HGGGGGGH', 'GGGGGGGG', 'SGGGGGGS', '.JJJJJJ.'];

  // Розмова без слів: у бульбашках рядки, схожі на текст; значки — для привітання й прощання.
  const SAY_ICONS = {
    heart: ['.#.#.', '#####', '#####', '.###.', '..#..'],
    bang: ['..#..', '..#..', '..#..', '.....', '..#..'],
    ask: ['.###.', '#...#', '..##.', '.....', '..#..'],
    note: ['..##.', '..#.#', '..#..', '###..', '##...'],
    wave: ['#.#.#', '#.#.#', '#####', '.####', '..##.'],
  };
  const DOOR = [5.9, 9.7];        // звідки заходять гості: з глядацького боку
  const DOOR_IN = [5.9, 8.5];
  const SEATS = [[0.8, 4.15], [0.8, 5.1]];
  const SEAT_FRONT = [[1.8, 4.15], [1.8, 5.1]];
  const SEAT_ONE = [0.8, 4.6], SEAT_ONE_FRONT = [1.8, 4.6];   // коли гість один — посередині
  const MEDICS = [
    { H: '#3a2a20', S: '#e0ac84', E: '#1d1d24', B: '#c48b67', G: '#eef2f3', D: '#c9d4d9', J: '#2f8f9a', K: '#15161b' },
    { H: '#1d1a1f', S: '#a8754f', E: '#1d1d24', B: '#91623f', G: '#eef2f3', D: '#c9d4d9', J: '#2f8f9a', K: '#15161b' },
  ];
  const MEDIC_SPOTS = [[2.55, 3.75], [2.4, 6.1]];   // біля розкладеного дивана
  const BAG = [2.45, 6.9];        // крісло-мішок ліворуч від килима
  const BAG_FRONT = [3.35, 6.9];
  // Крісло-мішок: висока м'яка спинка ззаду, вм'ятина для сидіння, складки тканини.
  const BEANBAG = [
    '......OOOOOO........',
    '....OOLLLLLLOO......',
    '...OLLLMMMMMLLO.....',
    '..OLLMMMMMMMMMMO....',
    '.OLMMMDDDDDDMMMMO...',
    '.OLMMDDddddDDMMMMO..',
    'OLMMDDddddddDDMMMMO.',
    'OLMMDDddddddDDMMMMSO',
    'OLMMMDDDDDDDDMMMMSSO',
    'OMMMMMMMMMMMMMMMSSSO',
    'OMMMMMSMMMMMMMMSSSSO',
    '.OMMMMMSMMMMMMSSSSO.',
    '..OSSMMMMMMMMSSSSO..',
    '...OOSSSSSSSSSSOO...',
    '.....OOOOOOOOOO.....',
  ];
  const BAG_FRONT_ROWS = 6;     // нижні ряди мішка лягають поверх героя

  const ICONS = {
    work: ['#######', '#.....#', '#.##..#', '#.....#', '#.###.#', '#######', '..###..'],
    create: ['...##..', '...#.#.', '...#..#', '...#...', '.###...', '####...', '.##....'],
    friends: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...', '.......'],
    exercise: ['.......', '##...##', '##...##', '#######', '##...##', '##...##', '.......'],
    stretch: ['.......', '#......', '.#...#.', '..#.#.#', '...#...', '.......', '.......'],
    cook: ['..#.#..', '.#.#...', '.......', '#######', '.#####.', '.#####.', '..###..'],
    delivery: ['.......', '.#####.', '#..#..#', '#######', '#..#..#', '#######', '.......'],
    meds: ['.......', '..###..', '.#####.', '.##.##.', '..###..', '.......', '.......'],
    rest: ['####...', '...#...', '..#....', '####.##', '.....#.', '....##.', '.......'],
    sleep: ['..###..', '.##....', '##.....', '##.....', '##.....', '.##....', '..###..'],
    coffee: ['..#.#..', '.#.#...', '.......', '#####..', '#####.#', '#####.#', '.###...'],
  };
  const ICON_COL = {
    work: '#2f6f8a', create: '#7a4fa0', friends: '#c0392b', exercise: '#33373f', stretch: '#2f8a7a',
    cook: '#a0602a', delivery: '#a0602a', meds: '#c0392b', rest: '#2d4763', sleep: '#2d4763', coffee: '#5a3a24',
  };

  const GUITAR = ['...KK..', '...KK..', '...KK..', '...NN..', '...NN..', '...NN..', '...NN..', '..BBBB.', '.BBBBBB', '.BBOOBB', '..BBBB.',
    '.BBBBBB', 'BBBOOBBB', 'BBBBBBB', '.BBBBB.'];
  const LEAVES = ['...g.g..', '..gGgGg.', '.gGgGgGg', 'gGgGgGgG', '.gGgggG.', '..g.Gg..'];

  // ---------- кімната ----------

  // Місця, де стоїть герой, коли користується зоною.
  const STAND = {
    desk: [1.55, 2.45], shelf: [4.3, 1.45], kitchen: [7.2, 1.6],
    sofa: [2.05, 3.95], mat: [6.6, 5.1],
  };

  const BLOCKS = [
    [0.2, 0.1, 2.7, 1.25],   // стіл
    [3.6, 0.1, 1.4, 0.7],    // комод під ліками
    [5.6, 0.1, 3.05, 0.95],  // кухонна тумба
    [8.7, 0.1, 1.0, 0.9],    // холодильник
    [0.1, 1.65, 0.7, 0.85],  // книжкова шафа
    [0.1, 3.4, 1.25, 2.8],   // диван
    [2.9, 4.2, 0.9, 1.2],    // журнальний столик
    [0.12, 6.45, 0.65, 0.6], // столик з лампою
    [0.2, 8.1, 0.55, 0.55],  // вазон біля стіни
    [2.15, 6.6, 0.6, 0.6],   // крісло-мішок
    [9.15, 8.05, 0.6, 0.6],  // великий вазон
  ];

  class Room {
    constructor(canvas) {
      this.canvas = canvas;
      canvas.width = W; canvas.height = H;
      this.ctx = canvas.getContext('2d');
      this.hero = { x: 5, y: 3.2, dir: 1, back: false, walkT: 0, moving: false };
      this.path = [];
      this.target = null;
      this.keys = { x: 0, y: 0 };
      this.bubble = null;
      this.visit = null;
      this.speech = [];
      this.game = null;
      this.view = { slot: 0, pain: 0, state: 'light', working: false, food: null, night: false, invite: false, joy: 60 };
      this.onArrive = null;
      this.t = 0;
      this.lit = { tint: TINT[0], sky: SKY[0], lamp: 0, patch: PATCH[0], patchCol: PATCH_COL[0], pain: 0, joy: 60 };
      this.planks = [];
      let seed = 7;
      const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let j = 0; j < RY * 2; j++) this.planks.push([r() * 3 + 1, r() * 3 + 5, r() * 2 + 8]);
    }

    static get size() { return { W, H }; }

    setView(v) { Object.assign(this.view, v); }

    // ---------- пересування ----------

    blocked(x, y) {
      const m = 0.25;
      if (x < 0.35 || y < 0.35 || x > RX - 0.35 || y > RY - 0.35) return true;
      for (const b of BLOCKS) if (x > b[0] - m && x < b[0] + b[2] + m && y > b[1] - m && y < b[1] + b[3] + m) return true;
      return false;
    }

    findPath(tx, ty, sx0, sy0) {
      const S = 0.5, cols = RX / S, rows = RY / S;
      const idx = (c, r) => r * cols + c;
      const cell = (x, y) => [Math.min(cols - 1, Math.max(0, Math.floor(x / S))), Math.min(rows - 1, Math.max(0, Math.floor(y / S)))];
      const center = (c, r) => [(c + 0.5) * S, (r + 0.5) * S];
      const free = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && !this.blocked(...center(c, r));
      let [gc, gr] = cell(tx, ty);
      if (!free(gc, gr)) {
        let best = null, bd = Infinity;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          if (!free(c, r)) continue;
          const [cx, cy] = center(c, r), d = (cx - tx) ** 2 + (cy - ty) ** 2;
          if (d < bd) { bd = d; best = [c, r]; }
        }
        if (!best) return [];
        [gc, gr] = best;
      }
      const [sc, sr] = cell(sx0 != null ? sx0 : this.hero.x, sy0 != null ? sy0 : this.hero.y);
      const prev = new Map();
      const q = [[sc, sr]];
      prev.set(idx(sc, sr), null);
      while (q.length) {
        const [c, r] = q.shift();
        if (c === gc && r === gr) break;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const nc = c + dc, nr = r + dr;
          if (!free(nc, nr) || prev.has(idx(nc, nr))) continue;
          if (dc && dr && (!free(c + dc, r) || !free(c, r + dr))) continue;
          prev.set(idx(nc, nr), [c, r]);
          q.push([nc, nr]);
        }
      }
      if (!prev.has(idx(gc, gr))) return [];
      const out = [];
      let cur = [gc, gr];
      while (cur) { out.unshift(center(cur[0], cur[1])); cur = prev.get(idx(cur[0], cur[1])); }
      out.shift();
      if (!this.blocked(tx, ty)) { out.pop(); out.push([tx, ty]); }
      return out;
    }

    walkTo(x, y, zone) {
      this.standUp();
      this.path = this.findPath(x, y);
      this.target = zone || null;
      if (!this.path.length && zone) this.arrive();
    }

    walkToZone(zone) {
      const [x, y] = STAND[zone];
      if (Math.hypot(this.hero.x - x, this.hero.y - y) < 0.1) { this.target = zone; this.arrive(); return; }
      this.walkTo(x, y, zone);
    }

    arrive() {
      const z = this.target;
      this.target = null;
      if (z && this.onArrive) this.onArrive(z);
    }

    setKeys(x, y) {
      this.keys.x = x; this.keys.y = y;
      if (x || y) { this.standUp(); this.path = []; this.target = null; }
    }

    get walking() { return this.path.length > 0 || this.keys.x !== 0 || this.keys.y !== 0; }

    currentZone() {
      if (this.hero.sitting) return 'sofa';
      if (this.walking) return null;
      let best = null, bd = 0.8;
      for (const z in STAND) {
        const d = Math.hypot(this.hero.x - STAND[z][0], this.hero.y - STAND[z][1]);
        if (d < bd) { bd = d; best = z; }
      }
      return best;
    }

    speed() { return { light: 2.6, medium: 1.9, strong: 1.1 }[this.view.state] || 2; }

    update(dt) {
      this.t += dt;
      // Близько півтори секунди на перехід між частинами дня.
      const s = this.view.slot, k = 1 - Math.exp(-dt * 1.8), l = this.lit;
      l.tint = mix(l.tint, TINT[s], k);
      l.sky = mix(l.sky, SKY[s], k);
      l.lamp += (LAMP[s] - l.lamp) * k;
      l.patch = mix(l.patch, PATCH[s], k);
      l.patchCol = mix(l.patchCol, PATCH_COL[s], k);
      l.pain += (this.view.pain - l.pain) * (1 - Math.exp(-dt * 2.5));
      l.joy += (this.view.joy - l.joy) * (1 - Math.exp(-dt * 1.5));
      const h = this.hero;
      let mx = 0, my = 0;
      if (this.keys.x || this.keys.y) {
        // Екранні напрямки в координати підлоги.
        mx = this.keys.x + this.keys.y; my = -this.keys.x + this.keys.y;
        const n = Math.hypot(mx, my) || 1; mx /= n; my /= n;
        const step = this.speed() * dt;
        const nx = h.x + mx * step, ny = h.y + my * step;
        if (!this.blocked(nx, ny)) { h.x = nx; h.y = ny; }
        else if (!this.blocked(nx, h.y)) h.x = nx;
        else if (!this.blocked(h.x, ny)) h.y = ny;
      } else if (this.path.length) {
        const [tx, ty] = this.path[0];
        const dx = tx - h.x, dy = ty - h.y, d = Math.hypot(dx, dy);
        const step = this.speed() * dt;
        if (d <= step) {
          h.x = tx; h.y = ty; this.path.shift();
          if (!this.path.length) this.arrive();
        } else { mx = dx / d; my = dy / d; h.x += mx * step; h.y += my * step; }
      }
      h.moving = !!(mx || my);
      if (h.moving) {
        h.walkT += dt;
        const sdx = mx - my, sdy = mx + my;
        if (Math.abs(sdx) > 0.05) h.dir = sdx > 0 ? 1 : -1;
        h.back = sdy < -0.1;
      } else h.walkT = 0;
      if (this.bubble && (this.bubble.t -= dt) <= 0) this.bubble = null;
      this.updateVisit(dt);
      if (this.cut) this.updateCut(dt);
      this.speech = this.speech.filter((sp) => (sp.t -= dt) > 0 || sp.delay > 0)
        .map((sp) => { if (sp.delay > 0) { sp.delay -= dt; sp.t += dt; } return sp; });
    }

    // onSeated — коли всі сіли: тоді починається розмова від першої особи, а візит чекає на неї.
    playAction(id, guests, onSeated) {
      if (id === 'friends') { this.startVisit(guests, onSeated); return; }
      this.bubble = { id, t: id === 'rest' || id === 'sleep' ? 2.4 : 1.6 };
    }

    // ---------- лікарня: швидка вночі, дні без дому, повернення ----------

    playHospital(days, firstDay, onDone) {
      this.endVisit(true);
      this.bubble = null; this.path = []; this.hero.sitting = false; this.hero.sit = 0; this.heroAway = false;
      this.cut = { phase: 'sleep', t: 0, days, firstDay, onDone, slot: 4, sleeping: true, caption: '', flash: 0, medics: [] };
      this.applyCutView();
    }

    applyCutView() {
      const c = this.cut;
      this.view.slot = c.slot;
      this.view.night = c.slot === 4;
    }

    skipCut() {
      const c = this.cut;
      if (!c) return;
      this.cut = null;
      this.heroAway = false;
      this.hero.x = 5; this.hero.y = 3.2; this.path = [];
      c.onDone && c.onDone();
    }

    // Нова гра: герой удома, на ногах і посеред кімнати — хоч би де його лишила фінальна сцена.
    resetHero() {
      this.cut = null; this.bubble = null; this.target = null; this.path = [];
      this.heroAway = false; this.hero.sitting = false; this.hero.sit = 0;
      this.hero.x = 5; this.hero.y = 3.2;
    }

    // Дострокове завершення: коротка сцена перед підсумком.
    // kind: 'joy' — радість на нулі, 'money' — гроші скінчились.
    playEnding(kind, onDone) {
      this.endVisit(true);
      this.bubble = null; this.hero.sitting = false; this.hero.sit = 0; this.heroAway = false;
      this.cut = { ending: kind, phase: 'walk', t: 0, onDone, slot: this.view.slot, caption: '', flash: 0, medics: [],
        sleeping: false, drain: 0, joy0: this.view.joy || 30, boxes: 0 };
      this.path = kind === 'joy' ? this.findPath(BAG_FRONT[0], BAG_FRONT[1]) : this.findPath(5.4, 7.0);
      this.target = null;
    }

    updateEnding(dt) {
      const c = this.cut;
      const go = (p) => { c.phase = p; c.t = 0; };
      if (c.ending === 'joy') {
        if (c.phase === 'walk') {
          c.caption = 'Радість упала до нуля';
          if (!this.path.length) { this.hero.sit = 1; this.hero.sitting = true; this.hero.x = BAG_FRONT[0]; this.hero.y = BAG_FRONT[1]; go('drain'); }
        } else if (c.phase === 'drain') {
          // Кімната повільно втрачає колір: радість — це те, що фарбувало світ.
          c.drain = Math.min(1, c.t / 3);
          c.caption = c.t < 2.4 ? 'Радість упала до нуля' : 'Нічого не хочеться. Навіть друзям писати.';
          if (c.t > 6) go('done');
        }
      } else {
        if (c.phase === 'walk') {
          c.caption = 'Гроші скінчилися';
          if (!this.path.length) go('pack');
        } else if (c.phase === 'pack') {
          c.boxes = Math.min(3, Math.floor(c.t / 0.6) + 1);
          c.caption = 'Гроші скінчилися. Оренду нема чим платити.';
          if (c.t > 2.8) {
            this.path = [...this.findPath(DOOR_IN[0], DOOR_IN[1]), [DOOR[0], DOOR[1]]];
            go('leave');
          }
        } else if (c.phase === 'leave') {
          c.caption = 'Доведеться з’їхати.';
          if (!this.path.length) { this.heroAway = true; if (c.t > 1.2) go('done'); }
          else c.t = 0;
        }
      }
      if (c.phase === 'done') { const cb = c.onDone; this.cut = null; cb && cb(); return; }
      this.view.slot = c.slot;
      this.view.night = false;
      if (c.ending === 'joy') this.view.joy = c.joy0 * (1 - c.drain);
    }

    updateCut(dt) {
      const c = this.cut;
      c.t += dt;
      if (c.ending) { this.updateEnding(dt); return; }
      const go = (p) => { c.phase = p; c.t = 0; };
      switch (c.phase) {
        case 'sleep':
          c.caption = 'Ніч';
          if (c.t > 1.0) go('flash');
          break;
        case 'flash':
          c.flash = 1;
          c.caption = 'Біль дійшов до 10. Викликали швидку';
          if (c.t > 1.6) {
            c.medics = MEDICS.map((pal, i) => {
              const m = { x: DOOR[0] + i * 0.5, y: DOOR[1] + i * 0.3, pal, path: [] };
              m.path = [[DOOR_IN[0] + i * 0.5, DOOR_IN[1]], ...this.findPath(MEDIC_SPOTS[i][0], MEDIC_SPOTS[i][1], DOOR_IN[0] + i * 0.5, DOOR_IN[1])];
              return m;
            });
            go('enter');
          }
          break;
        case 'enter':
          if (c.medics.map((m) => this.moveActor(m, dt, 2.2)).every(Boolean)) go('lift');
          break;
        case 'lift':
          if (c.sleeping && c.t > 0.5) {
            c.sleeping = false;
            this.hero.x = 2.15; this.hero.y = 4.9; this.hero.back = false;
          }
          c.caption = 'Тебе забирають у лікарню';
          if (c.t > 1.4) {
            c.medics.forEach((m, i) => { m.path = [...this.findPath(DOOR_IN[0] + i * 0.5, DOOR_IN[1], m.x, m.y), [DOOR[0] + i * 0.5, DOOR[1] + i * 0.3]]; });
            this.path = [...this.findPath(DOOR_IN[0] + 0.25, DOOR_IN[1] - 0.4), [DOOR[0] + 0.25, DOOR[1]]];
            go('out');
          }
          break;
        case 'out': {
          // Медики підлаштовуються під його крок.
          const done = c.medics.map((m) => this.moveActor(m, dt, Math.min(2.2, this.speed()))).every(Boolean);
          if (done && !this.path.length) {
            this.heroAway = true; c.medics = []; c.flash = 0;
            go('away');
          }
          break;
        }
        case 'away': {
          // Дні в лікарні пролітають: ранок, день, пообіддя, вечір, ніч.
          const perDay = 1.5;
          const k = Math.floor(c.t / perDay);
          c.slot = Math.min(4, Math.floor((c.t % perDay) / (perDay / 5)));
          c.caption = 'День ' + (c.firstDay + 1 + Math.min(k, c.days - 1)) + ' · лікарня';
          if (c.t >= c.days * perDay) {
            c.slot = 0;
            this.heroAway = false;
            this.hero.x = DOOR[0]; this.hero.y = DOOR[1];
            this.path = [[DOOR_IN[0], DOOR_IN[1]], ...this.findPath(5, 3.2, DOOR_IN[0], DOOR_IN[1])];
            c.caption = 'Повернувся додому';
            go('back');
          }
          break;
        }
        case 'back':
          if (!this.path.length && c.t > 0.6) {
            const done = c.onDone;
            this.cut = null;
            done && done();
            return;
          }
          break;
      }
      if (this.cut) this.applyCutView();
    }

    // ---------- візит друзів ----------

    get guests() { return !!this.visit; }

    // kind: 'talk' — рядки «тексту», або назва значка з SAY_ICONS.
    say(who, kind, delay) {
      const icon = kind === 'talk' ? null : kind;
      const w = 12 + Math.floor(Math.random() * 7);
      const lines = 1 + Math.floor(Math.random() * 3);
      // Кожен рядок — «слова» різної довжини; останній коротший.
      const rows = [];
      for (let i = 0; i < lines; i++) {
        const len = i === lines - 1 && lines > 1 ? Math.max(4, Math.floor(w * (0.35 + Math.random() * 0.35))) : w;
        const words = [];
        let x = 0;
        while (x < len) {
          const wl = Math.min(len - x, 2 + Math.floor(Math.random() * 4));
          if (wl >= 1) words.push([x, wl]);
          x += wl + 1;
        }
        rows.push(words);
      }
      const dur = 1.1 + lines * 0.35;
      this.speech.push({ who, icon, t: dur, dur, delay: delay || 0, w, rows });
    }

    moveActor(a, dt, speed) {
      if (!a.path.length) { a.moving = false; return true; }
      const [tx, ty] = a.path[0];
      const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy), step = speed * dt;
      if (d <= step) { a.x = tx; a.y = ty; a.path.shift(); }
      else {
        const mx = dx / d, my = dy / d;
        a.x += mx * step; a.y += my * step;
        const sdx = mx - my, sdy = mx + my;
        if (Math.abs(sdx) > 0.05) a.dir = sdx > 0 ? 1 : -1;
        a.back = sdy < -0.1;
      }
      a.moving = true; a.walkT = (a.walkT || 0) + dt;
      return false;
    }

    startVisit(names, onSeated) {
      this.speech = [];
      names = names && names.length ? names : ['Марко'];
      const one = names.length === 1;
      const friends = names.slice(0, 2).map((name, i) => {
        const look = friendLook(name);
        const front = one ? SEAT_ONE_FRONT : SEAT_FRONT[i];
        const a = { name, x: DOOR[0] + i * 0.5, y: DOOR[1] + i * 0.3, pal: look.pal, long: look.long,
          seated: false, sit: 0, sitDir: 0, path: [], seat: one ? SEAT_ONE : SEATS[i], front };
        a.path = [[DOOR_IN[0] + i * 0.5, DOOR_IN[1]], ...this.findPath(front[0], front[1], DOOR_IN[0] + i * 0.5, DOOR_IN[1])];
        return a;
      });
      this.visit = { phase: 'enter', t: 0, friends, onSeated: onSeated || null, hold: false };
      // Герой іде до крісла-мішка, поки гості заходять.
      this.setHeroSit(0);
      this.path = this.findPath(BAG_FRONT[0], BAG_FRONT[1]);
      this.target = null;
    }

    setHeroSit(v) {
      const h = this.hero, was = h.sit > 0;
      h.sit = v; h.sitDir = 0; h.sitting = v > 0;
      if (was && !v) { h.x = BAG_FRONT[0]; h.y = BAG_FRONT[1]; }
    }

    // Гравець пішов сам: герой підводиться одразу, гості прощаються.
    standUp() {
      if (this.hero.sitting) this.setHeroSit(0);
      if (this.visit && this.visit.phase !== 'leave' && this.visit.phase !== 'standup') this.leaveVisit();
    }

    leaveVisit() {
      const v = this.visit;
      if (!v) return;
      v.phase = 'standup'; v.t = 0;
      v.friends.forEach((f) => { f.seated = false; if (f.sit > 0) f.sitDir = -1; });
      if (this.hero.sit > 0) this.hero.sitDir = -1;
    }

    // Гості йдуть самі, коли візит закінчився; immediate — прибрати без проводів.
    endVisit(immediate) {
      if (!this.visit) return;
      if (immediate) {
        this.visit = null; this.speech = [];
        if (this.hero.sitting) { this.setHeroSit(0); this.hero.x = BAG_FRONT[0]; this.hero.y = BAG_FRONT[1]; }
      } else if (this.visit.phase !== 'leave' && this.visit.phase !== 'standup') this.leaveVisit();
    }

    // Обличчям одне до одного: друзі дивляться на героя, герой — на них.
    faceEachOther() {
      const v = this.visit, h = this.hero;
      v.friends.forEach((f) => { f.back = (h.x - f.x) + (h.y - f.y) < 0; });
      const f0 = v.friends[0];
      h.back = (f0.x - h.x) + (f0.y - h.y) < 0;
    }

    updateVisit(dt) {
      const v = this.visit;
      if (!v) return;
      v.t += dt;
      const sp = 2.1, SIT = 0.75;   // секунд на те, щоб сісти чи встати
      const people = [this.hero, ...v.friends];
      for (const a of people) {
        if (!a.sitDir) continue;
        a.sit = Math.max(0, Math.min(1, (a.sit || 0) + a.sitDir * dt / SIT));
        if (a.sit === 0 || a.sit === 1) a.sitDir = 0;
      }
      this.hero.sitting = this.hero.sit > 0;

      if (v.phase === 'enter') {
        // Друзі заходять, коли герой уже звільнив прохід біля дивана.
        if (v.t < 1.3) return;
        const done = v.friends.map((f) => this.moveActor(f, dt, sp)).every(Boolean);
        if (done && !this.path.length) {
          v.phase = 'greet'; v.t = 0;
          this.faceEachOther();
          this.say(0, 'wave');
          if (v.friends[1]) this.say(1, 'talk', 0.5);
          this.say('hero', 'talk', 1.1);
        }
      } else if (v.phase === 'greet') {
        this.faceEachOther();
        if (v.t > 2.2) {
          v.friends.forEach((f) => { f.sitDir = 1; f.moving = false; });
          this.hero.sit = 0.001; this.hero.sitDir = 1; this.hero.sitting = true;
          v.phase = 'sitdown'; v.t = 0;
        }
      } else if (v.phase === 'sitdown') {
        if (people.every((a) => a.sit >= 1)) {
          v.friends.forEach((f) => { f.seated = true; });
          v.phase = 'talk'; v.t = 0;
          // Розмова від першої особи: візит стоїть, поки вона не скінчиться.
          if (v.onSeated) { v.hold = true; const cb = v.onSeated; v.onSeated = null; cb(); return; }
          // Перемовляються по черзі, іноді хтось вклинюється.
          const order = v.friends[1] ? [0, 'hero', 1, 0, 'hero', 1, 'hero'] : [0, 'hero', 0, 'hero', 0, 'hero'];
          order.forEach((who, i) => this.say(who, 'talk', 0.3 + i * 1.15 + (i % 3 === 2 ? -0.4 : 0)));
        }
      } else if (v.phase === 'talk') {
        if (v.t > 8.6 && !v.hold) this.leaveVisit();
      } else if (v.phase === 'standup') {
        if (people.every((a) => !a.sit)) {
          if (this.hero.sitting) this.setHeroSit(0);
          v.phase = 'leave'; v.t = 0;
          this.faceEachOther();
          this.say(0, 'wave');
          if (v.friends[1]) this.say(1, 'heart', 0.4);
          this.say('hero', 'wave', 0.9);
          v.friends.forEach((f, i) => {
            f.x = f.front[0]; f.y = f.front[1];
            f.path = [...this.findPath(DOOR_IN[0] + i * 0.5, DOOR_IN[1], f.x, f.y), [DOOR[0] + i * 0.5, DOOR[1] + i * 0.3]];
          });
          v.waitBye = 1.0;   // спершу помахати, потім іти
        }
      } else if (v.phase === 'leave') {
        if ((v.waitBye -= dt) > 0) return;
        const done = v.friends.map((f) => this.moveActor(f, dt, sp)).every(Boolean);
        if (done) { this.visit = null; }
      }
    }

    // Сідання і вставання: повернутися, присісти, зсунутися на сидіння.
    drawSitter(ctx, a, pal, long, from, to, back) {
      const s = a.sit || 0;
      let rows;
      const top = long ? (back ? LONG_BACK : LONG_TOP) : (back ? HERO_BACK : HERO_TOP);
      if (s >= 1) rows = back ? SEATED_BACK : (long ? LONG_SEATED : SEATED);
      else if (s < 0.3) rows = top.concat(LEGS[0]);
      else rows = top.concat(CROUCH_LEGS);
      const k = s < 0.3 ? 0 : s >= 1 ? 1 : (s - 0.3) / 0.7;
      const e = k * k * (3 - 2 * k);
      const bx = Math.round(from[0] + (to[0] - from[0]) * e), by = Math.round(from[1] + (to[1] - from[1]) * e);
      const x = bx - 4, y = by - rows.length + 1;
      spriteO(ctx, rows, pal, x, y);
      a.anchor = [bx, y - 2];
    }

    // Де над головою говорить кожен: для бульбашок у DOM.
    speakerAnchor(who) {
      if (who === 'hero') return this.hero.anchor || null;
      const f = this.visit && this.visit.friends[who];
      return f ? f.anchor : null;
    }

    // ---------- координати для миші ----------

    screenToFloor(sx, sy) {
      const a = (sx - OX) / TW2, b = (sy - OY) / TH2;
      return [(a + b) / 2, (b - a) / 2];
    }

    hitZone(sx, sy) {
      let best = null, area = Infinity;
      for (const z in bounds) {
        const b = bounds[z];
        if (sx >= b[0] - 1 && sx <= b[2] + 1 && sy >= b[1] - 1 && sy <= b[3] + 1) {
          const a = (b[2] - b[0]) * (b[3] - b[1]);
          if (a < area) { area = a; best = z; }
        }
      }
      return best;
    }

    zoneAnchor(z) {
      const b = bounds[z];
      return b ? [(b[0] + b[2]) / 2, b[1]] : null;
    }

    clickAt(sx, sy) {
      const z = this.hitZone(sx, sy);
      if (z) { this.walkToZone(z); return z; }
      const [x, y] = this.screenToFloor(sx, sy);
      if (x > 0 && y > 0 && x < RX && y < RY) this.walkTo(x, y);
      return null;
    }

    // ---------- малювання ----------

    render() {
      const ctx = this.ctx;
      for (const k in bounds) delete bounds[k];
      ctx.fillStyle = '#1e2230';
      ctx.fillRect(0, 0, W, H);
      this.drawShell(ctx);
      this.drawWallDecor(ctx);
      this.drawLightPatch(ctx);

      const items = this.objects();
      items.sort((a, b) => a.key - b.key);
      // Кожна людина стає одразу після останньої речі, перед якою вона стоїть.
      const actors = [];
      if (!(this.hero.sit > 0) && !this.heroAway) actors.push({ a: this.hero, draw: () => this.drawHero(ctx) });
      if (this.cut) for (const m of this.cut.medics) actors.push({ a: m, draw: () => this.drawWalker(ctx, m, m.pal) });
      if (this.visit) for (const f of this.visit.friends) if (!(f.sit > 0)) actors.push({ a: f, draw: () => this.drawWalker(ctx, f, f.pal, f.long) });
      const placed = actors.map((ac) => {
        let at = 0;
        items.forEach((it, i) => {
          const f = it.foot;
          // Попереду, якщо людина глибша за найближчу до неї точку меблів:
          // старе правило «правіше або нижче» садило героя на стільницю.
          let front = true;
          if (f) {
            const cx = Math.max(f[0], Math.min(ac.a.x, f[0] + f[2]));
            const cy = Math.max(f[1], Math.min(ac.a.y, f[1] + f[3]));
            front = ac.a.x + ac.a.y > cx + cy;
          }
          if (front && (f || it.key < 0)) at = i + 1;
        });
        return { at, depth: ac.a.x + ac.a.y, draw: ac.draw };
      });
      placed.sort((p, q) => q.at - p.at || q.depth - p.depth);
      for (const p of placed) items.splice(p.at, 0, { key: 0, draw: p.draw });
      for (const it of items) { rec = it.zone || null; it.draw(); rec = null; }

      this.postprocess(ctx);
      this.drawMarkers(ctx);
      if (this.bubble) this.drawBubble(ctx);
      this.drawSpeech(ctx);
    }

    drawShell(ctx) {
      // Плита підлоги спереду.
      poly(ctx, [P(0, RY, 0), P(RX, RY, 0), P(RX, RY, -SL), P(0, RY, -SL)], PAL.slab);
      poly(ctx, [P(RX, 0, 0), P(RX, RY, 0), P(RX, RY, -SL), P(RX, 0, -SL)], PAL.slabD);

      // Дошки.
      for (let j = 0; j < RY * 2; j++) {
        const y0 = j / 2, y1 = y0 + 0.5;
        poly(ctx, [P(0, y0), P(RX, y0), P(RX, y1), P(0, y1)], j % 2 ? PAL.floorA : PAL.floorB);
        for (const xs of this.planks[j]) L(ctx, P(xs, y0), P(xs, y1 - 0.1), PAL.seam);
      }
      L(ctx, P(0, RY), P(RX, RY), shade(PAL.floorA, 0.2));
      L(ctx, P(RX, 0), P(RX, RY), shade(PAL.floorB, 0.1));

      // Стіни і плінтуси.
      poly(ctx, [P(0, 0, 0), P(0, RY, 0), P(0, RY, WH), P(0, 0, WH)], PAL.wallL);
      poly(ctx, [P(0, 0, 0), P(RX, 0, 0), P(RX, 0, WH), P(0, 0, WH)], PAL.wallR);
      wallL(ctx, 0, RY, 0, 3, PAL.trim);
      wallR(ctx, 0, RX, 0, 3, PAL.trim);
      L(ctx, P(0, 0, 0), P(0, 0, WH), shade(PAL.wallL, -0.25));

      // Товщина стін зверху і на торцях.
      poly(ctx, [P(-T, -T, WH), P(0, -T, WH), P(0, RY, WH), P(-T, RY, WH)], PAL.capTop);
      poly(ctx, [P(-T, -T, WH), P(RX, -T, WH), P(RX, 0, WH), P(-T, 0, WH)], PAL.capTop);
      poly(ctx, [P(-T, RY, -SL), P(0, RY, -SL), P(0, RY, WH), P(-T, RY, WH)], PAL.capSide);
      poly(ctx, [P(RX, -T, -SL), P(RX, 0, -SL), P(RX, 0, WH), P(RX, -T, WH)], shade(PAL.capSide, -0.2));
      const o = PAL.ol;
      L(ctx, P(-T, -T, WH), P(-T, RY, WH), o); L(ctx, P(-T, -T, WH), P(RX, -T, WH), o);
      L(ctx, P(-T, RY, WH), P(-T, RY, -SL), o); L(ctx, P(RX, -T, WH), P(RX, -T, -SL), o);
      L(ctx, P(-T, RY, -SL), P(RX, RY, -SL), o); L(ctx, P(RX, RY, -SL), P(RX, -T, -SL), o);
      L(ctx, P(0, 0, WH), P(0, RY, WH), shade(PAL.capTop, -0.25)); L(ctx, P(0, 0, WH), P(RX, 0, WH), shade(PAL.capTop, -0.25));
    }

    drawWallDecor(ctx) {
      const slot = this.view.slot;
      const night = this.lit.lamp > 0.8;
      const sky = hexOf(this.lit.sky);
      const dark = (f) => hexOf(this.lit.sky.map((v) => v * (1 - f) + 18 * f * this.lit.lamp));
      // Вікно над диваном.
      wallL(ctx, 3.75, 6.05, 23, 51, PAL.sheet);
      wallL(ctx, 3.9, 5.9, 25, 49, sky);
      wallL(ctx, 3.9, 5.9, 25, 30, dark(0.35));
      wallL(ctx, 4.1, 4.4, 25, 34, dark(0.45));
      wallL(ctx, 5.2, 5.6, 25, 37, dark(0.4));
      if (night) {
        wallL(ctx, 5.3, 5.35, 32, 33, '#f2d36b'); wallL(ctx, 4.2, 4.25, 27, 28, '#f2d36b');
        ctx.fillStyle = '#e8ecf5';
        const a = P(0, 4.2, 45); ctx.fillRect(a[0], a[1], 1, 1);
        const b = P(0, 5.5, 43); ctx.fillRect(b[0], b[1], 1, 1);
      }
      wallL(ctx, 4.85, 4.95, 25, 49, PAL.sheet);
      wallL(ctx, 3.9, 5.9, 37, 38.5, PAL.sheet);

      // Постер з горами в дальньому кінці лівої стіни.
      wallL(ctx, 7.0, 8.5, 22, 42, PAL.ol);
      wallL(ctx, 7.1, 8.4, 24, 40, '#e3c27a');
      poly(ctx, [P(0, 7.1, 24), P(0, 7.75, 36), P(0, 8.4, 24)], PAL.navy);
      poly(ctx, [P(0, 7.65, 34), P(0, 7.75, 36), P(0, 7.88, 33.5)], PAL.sheet);
      poly(ctx, [P(0, 7.1, 24), P(0, 7.35, 29), P(0, 7.7, 24)], '#3b5f55');
      wallL(ctx, 8.05, 8.2, 35, 38, PAL.red);

      // Права стіна: мапа й платівка над столом.
      wallR(ctx, 0.5, 2.2, 33, 51, PAL.ol);
      wallR(ctx, 0.6, 2.1, 35, 49, '#c9c3a8');
      L(ctx, P(0.7, 0, 45), P(1.3, 0, 40), PAL.blue); L(ctx, P(1.3, 0, 40), P(1.9, 0, 43), PAL.blue);
      L(ctx, P(0.9, 0, 37), P(1.6, 0, 47), '#7a8f6a');
      wallR(ctx, 1.55, 1.65, 41, 43, PAL.red);
      wallR(ctx, 2.45, 3.05, 37, 47, PAL.ol);
      wallR(ctx, 2.68, 2.82, 41, 43, PAL.red);

      // Полиця з ліками.
      rec = 'shelf';
      wallR(ctx, 4.0, 4.7, 34, 48, '#e6e8ea');
      wallR(ctx, 4.27, 4.43, 36, 46, PAL.red);
      wallR(ctx, 4.1, 4.6, 39.5, 42.5, PAL.red);
      box(ctx, 3.65, 0, 26, 1.4, 0.5, 2, PAL.woodD);
      box(ctx, 3.75, 0.12, 28, 0.2, 0.2, 7, '#d07a2c', { outline: false });
      box(ctx, 4.1, 0.12, 28, 0.2, 0.2, 5, '#e6e8ea', { outline: false });
      box(ctx, 4.42, 0.12, 28, 0.2, 0.2, 6, PAL.red, { outline: false });
      box(ctx, 4.75, 0.12, 28, 0.2, 0.2, 8, PAL.blue, { outline: false });
      rec = null;

      // Годинник: стрілка показує частину дня.
      wallR(ctx, 5.15, 5.55, 39, 48, PAL.ol);
      wallR(ctx, 5.2, 5.5, 40, 47, '#e6e8ea');
      const c = P(5.35, 0, 43.5);
      const hand = [[0, -3], [3, 0], [2, 2], [0, 3], [-3, 0]][slot];
      line(ctx, c[0], c[1], c[0] + hand[0], c[1] + hand[1], PAL.ol);

      // Кухонна шафка.
      rec = 'kitchen';
      box(ctx, 5.8, 0, 31, 2.0, 0.45, 12, PAL.cabinet);
      L(ctx, P(6.8, 0.45, 32), P(6.8, 0.45, 42), shade(PAL.cabinet, -0.4));
      rec = null;
    }

    drawLightPatch(ctx) {
      const [len, shift, lvl] = this.lit.patch;
      if (lvl < 0.03) return;
      const col = hexOf(this.lit.patchCol);
      const x0 = this.bedOut() ? 2.7 : 1.45;
      polyDither(ctx, [P(x0, 3.9 + shift), P(x0 + len, 4.1 + shift), P(x0 + len, 6.1 + shift), P(x0, 6.0 + shift)], col, lvl);
    }

    // Диван розкладений на ніч і коли він дрімає; з гостями — складений.
    bedOut() {
      return this.sleeping() || this.view.night;
    }
    sleeping() { return !!(this.bubble && (this.bubble.id === 'rest' || this.bubble.id === 'sleep')) || !!(this.cut && this.cut.sleeping); }

    objects() {
      const ctx = this.ctx, v = this.view, t = this.t;
      const list = [];
      const add = (key, draw, zone, foot) => list.push({ key, draw, zone, foot });

      // Пласкі речі лягають першими.
      add(-50, () => {
        poly(ctx, [P(1.5, 3.3), P(4.3, 3.3), P(4.3, 6.3), P(1.5, 6.3)], PAL.rug);
        poly(ctx, [P(1.65, 3.45), P(4.15, 3.45), P(4.15, 6.15), P(1.65, 6.15)], PAL.rugB);
        poly(ctx, [P(1.85, 3.65), P(3.95, 3.65), P(3.95, 5.95), P(1.85, 5.95)], PAL.rug);
      });
      add(-40, () => {
        poly(ctx, [P(5.2, 4.6), P(8.0, 4.6), P(8.0, 5.6), P(5.2, 5.6)], PAL.mat);
        L(ctx, P(5.2, 5.6), P(8.0, 5.6), shade(PAL.mat, -0.4));
        L(ctx, P(8.0, 4.6), P(8.0, 5.6), shade(PAL.mat, -0.4));
        L(ctx, P(5.4, 4.7), P(5.4, 5.5), shade(PAL.mat, 0.25));
      }, 'mat');
      add(13.5, () => {
        box(ctx, 8.25, 4.75, 0, 0.45, 0.14, 3, PAL.metal);
        box(ctx, 8.25, 5.2, 0, 0.45, 0.14, 3, PAL.metal);
      }, 'mat', [8.25, 4.75, 0.45, 0.6]);

      // Робочий стіл у кутку.
      add(2.0, () => {
        box(ctx, 2.1, 0.15, 0, 0.8, 1.1, 15, PAL.metal);
        box(ctx, 0.25, 1.1, 0, 0.12, 0.12, 15, PAL.metal);
        box(ctx, 0.2, 0.1, 15, 2.7, 1.25, 2, PAL.woodD);
        box(ctx, 1.45, 0.3, 17, 0.25, 0.25, 4, '#22262d');
        box(ctx, 0.85, 0.2, 21, 1.4, 0.14, 14, '#22262d');
        faceY(ctx, 0.34, 0.93, 2.17, 23, 33, v.working ? PAL.screen : (v.slot >= 3 ? '#1d4a5c' : PAL.screenOff));
        if (v.working) {
          for (let i = 0; i < 4; i++) {
            const w = 0.3 + ((i * 37 + Math.floor(t * 4)) % 5) * 0.12;
            L(ctx, P(1.03, 0.34, 31 - i * 2), P(1.03 + w, 0.34, 31 - i * 2), '#1f5f55');
          }
        }
        box(ctx, 1.1, 0.7, 17, 0.9, 0.28, 1, '#7d858f', { outline: false });
        box(ctx, 2.45, 0.75, 17, 0.15, 0.15, 3, PAL.mustard, { outline: false });
        box(ctx, 0.3, 0.2, 17, 0.22, 0.22, 1, PAL.metal, { outline: false });
        L(ctx, P(0.41, 0.31, 18), P(0.41, 0.31, 30), PAL.metal);
        box(ctx, 0.28, 0.2, 29, 0.35, 0.3, 3, PAL.mustard);
      }, 'desk', [0.2, 0.1, 2.7, 1.25]);
      add(3.4, () => {
        box(ctx, 1.5, 1.75, 0, 0.1, 0.1, 8, PAL.metal, { outline: false });
        box(ctx, 1.23, 1.7, 0, 0.65, 0.2, 1, PAL.metal, { outline: false });
        box(ctx, 1.25, 1.5, 8, 0.6, 0.55, 2, '#2a2d33');
        box(ctx, 1.25, 2.0, 10, 0.6, 0.1, 12, '#2a2d33');
      }, 'desk', [1.23, 1.5, 0.65, 0.6]);

      // Комод під полицею з ліками.
      add(4.7, () => {
        box(ctx, 3.6, 0.1, 0, 1.4, 0.7, 14, PAL.wood);
        L(ctx, P(3.6, 0.8, 7), P(5.0, 0.8, 7), PAL.woodD);
        for (const z of [4, 11]) { const k = P(4.3, 0.8, z); ctx.fillStyle = PAL.steel; ctx.fillRect(k[0], k[1], 2, 1); }
      }, 'shelf', [3.6, 0.1, 1.4, 0.7]);

      // Кухня праворуч: тумба з плитою і холодильник.
      add(7.6, () => {
        box(ctx, 5.6, 0.1, 0, 3.0, 0.9, 17, PAL.cabinet);
        box(ctx, 5.6, 0.1, 17, 3.05, 0.95, 2, '#aeb4ba');
        for (const x of [6.35, 7.1, 7.85]) L(ctx, P(x, 1.0, 2), P(x, 1.0, 15), shade(PAL.cabinet, -0.4));
        for (const x of [6.2, 6.95, 7.7, 8.45]) { const k = P(x, 1.0, 12); ctx.fillStyle = PAL.steel; ctx.fillRect(k[0], k[1], 1, 1); }
        poly(ctx, [P(7.3, 0.3, 19), P(7.6, 0.3, 19), P(7.6, 0.6, 19), P(7.3, 0.6, 19)], '#22252b');
        poly(ctx, [P(7.75, 0.3, 19), P(8.05, 0.3, 19), P(8.05, 0.6, 19), P(7.75, 0.6, 19)], '#22252b');
        box(ctx, 6.1, 0.3, 19, 0.5, 0.35, 1, PAL.steel, { outline: false });
        if (v.food === 'cook') {
          box(ctx, 7.28, 0.28, 19, 0.36, 0.36, 5, PAL.steel);
          const s = P(7.46, 0.46, 27);
          ctx.fillStyle = 'rgba(235,240,245,0.7)';
          for (let i = 0; i < 3; i++) ctx.fillRect(s[0] + Math.round(Math.sin(t * 3 + i) * 1.5), s[1] - i * 3 - ((t * 6) % 3 | 0), 1, 2);
        }
        if (v.food === 'delivery') {
          box(ctx, 6.75, 0.3, 19, 0.5, 0.42, 6, '#b88a52');
          L(ctx, P(7.0, 0.72, 20), P(7.0, 0.72, 24), '#7a5a32');
        }
      }, 'kitchen', [5.6, 0.1, 3.05, 0.95]);
      add(9.6, () => {
        box(ctx, 8.7, 0.1, 0, 1.0, 0.9, 44, PAL.fridge);
        L(ctx, P(8.7, 1.0, 30), P(9.7, 1.0, 30), shade(PAL.fridge, -0.35));
        L(ctx, P(8.9, 1.0, 33), P(8.9, 1.0, 39), PAL.metal);
        L(ctx, P(8.9, 1.0, 20), P(8.9, 1.0, 26), PAL.metal);
        const m = P(9.3, 1.0, 36); ctx.fillStyle = PAL.mustard; ctx.fillRect(m[0], m[1], 2, 2);
        const m2 = P(9.45, 1.0, 22); ctx.fillStyle = PAL.red; ctx.fillRect(m2[0], m2[1], 2, 2);
      }, 'kitchen', [8.7, 0.1, 1.0, 0.9]);

      // Книжкова шафа біля лівої стіни.
      add(2.6, () => {
        box(ctx, 0.1, 1.65, 0, 0.7, 0.85, 44, PAL.woodD);
        const cols = [PAL.red, PAL.mustard, PAL.blue, PAL.teal, PAL.sheet, PAL.woodL, '#7a5a8a'];
        for (const zb of [2, 16, 30]) {
          faceX(ctx, 0.8, 1.69, 2.46, zb - 1, zb + 11, shade(PAL.woodD, -0.45));
          for (let i = 0; i < 7; i++) {
            const y0 = 1.71 + i * 0.105, hgt = 7 + ((i * 7 + zb) % 4);
            faceX(ctx, 0.8, y0, y0 + 0.085, zb, zb + hgt, cols[(i + zb) % cols.length]);
          }
        }
        box(ctx, 0.3, 1.9, 44, 0.3, 0.3, 5, '#a9603a');
        const p = P(0.45, 2.05, 49);
        sprite(ctx, LEAVES, { g: '#3f7a45', G: '#5c9a55' }, p[0] - 4, p[1] - 6);
      }, null, [0.1, 1.65, 0.7, 0.85]);

      // Диван-ліжко.
      add(4.6, () => this.drawSofa(ctx), 'sofa', [0.1, 3.4, 1.25, 2.8]);

      // Журнальний столик.
      add(8.2, () => {
        for (const [lx, ly] of [[2.95, 4.25], [3.65, 4.25], [2.95, 5.25], [3.65, 5.25]]) box(ctx, lx, ly, 0, 0.1, 0.1, 6, PAL.woodD, { outline: false });
        box(ctx, 2.9, 4.2, 6, 0.9, 1.2, 2, PAL.wood);
        box(ctx, 3.05, 4.4, 8, 0.4, 0.5, 1, PAL.blue, { outline: false });
        // Друзі принесли поїсти: коробка на столику до кінця дня.
        if (v.food === 'guests') {
          box(ctx, 3.0, 4.55, 9, 0.6, 0.6, 2, '#c9a36b');
          L(ctx, P(3.15, 5.15, 11), P(3.45, 5.15, 11), PAL.red);
        }
        box(ctx, 3.5, 4.95, 8, 0.15, 0.15, 3, '#e6e8ea', { outline: false });
        // Телефон: блимає, коли друзі пишуть.
        box(ctx, 3.5, 4.4, 8, 0.2, 0.12, 1, '#1d1f26', { outline: false });
        if (v.invite && Math.floor(t * 3) % 2 === 0) {
          const ph = P(3.6, 4.46, 9); ctx.fillStyle = '#9ff2dc'; ctx.fillRect(ph[0] - 1, ph[1], 3, 1);
          ctx.fillRect(ph[0], ph[1] - 4, 1, 2);
        }
        if (this.guests) {
          box(ctx, 3.1, 5.05, 8, 0.15, 0.15, 3, PAL.mustard, { outline: false });
          box(ctx, 3.45, 4.35, 8, 0.25, 0.25, 1, '#c98a4f', { outline: false });
        }
      }, null, [2.9, 4.2, 0.9, 1.2]);

      // Коробки, коли доводиться з’їжджати.
      if (this.cut && this.cut.boxes) {
        const spots = [[5.9, 7.7], [6.5, 7.3], [6.3, 8.1]];
        for (let b = 0; b < this.cut.boxes; b++) {
          const [bx, by] = spots[b];
          add(bx + by + 0.6, () => {
            box(ctx, bx, by, 0, 0.5, 0.45, 7, '#b88a52');
            L(ctx, P(bx + 0.25, by + 0.45, 1), P(bx + 0.25, by + 0.45, 7), '#7a5a32');
          }, null, [bx, by, 0.5, 0.45]);
        }
      }

      // Крісло-мішок: тут герой сидить, коли в гостях друзі.
      add(9.5, () => {
        const p = P(BAG[0], BAG[1], 0).map(Math.round);
        const bx = p[0] - 10, by = p[1] - 12;
        const pal = { O: PAL.ol, L: '#6f80a8', M: '#4c5b82', D: '#3a4668', d: '#2e3854', S: '#36415f' };
        sprite(ctx, BEANBAG, pal, bx, by);
        if (this.hero.sit > 0) {
          // Сідає у вм'ятину; коли сів, нижній край мішка накриває ноги.
          const from = P(BAG_FRONT[0], BAG_FRONT[1], 0).map(Math.round);
          this.drawSitter(ctx, this.hero, HERO_PAL, false, from, [p[0], p[1] - 7], true);
          if (this.hero.sit >= 1) sprite(ctx, BEANBAG.slice(-BAG_FRONT_ROWS), pal, bx, by + BEANBAG.length - BAG_FRONT_ROWS);
        }
      }, null, [2.15, 6.6, 0.6, 0.6]);

      // Столик з лампою, гітара, вазон.
      add(7.3, () => {
        box(ctx, 0.12, 6.45, 0, 0.65, 0.6, 10, PAL.wood);
        box(ctx, 0.35, 6.65, 10, 0.18, 0.18, 1, PAL.metal, { outline: false });
        L(ctx, P(0.44, 6.74, 11), P(0.44, 6.74, 18), PAL.metal);
        box(ctx, 0.27, 6.58, 17, 0.35, 0.35, 5, '#e6d7b0');
      }, null, [0.12, 6.45, 0.65, 0.6]);
      add(7.7, () => {
        const p = P(0.3, 7.4, 0);
        sprite(ctx, GUITAR, { K: PAL.ol, N: PAL.woodD, B: '#b5652e', O: '#2a1c14' }, p[0] - 4, p[1] - 15);
      }, null, [0.1, 7.2, 0.4, 0.45]);
      add(8.9, () => {
        box(ctx, 0.2, 8.1, 0, 0.55, 0.55, 8, '#a9603a');
        const p = P(0.47, 8.37, 8);
        sprite(ctx, LEAVES, { g: '#2f6a3a', G: '#4f8f4a' }, p[0] - 4, p[1] - 10);
        sprite(ctx, LEAVES, { g: '#2f6a3a', G: '#4f8f4a' }, p[0] - 3, p[1] - 15);
      }, null, [0.2, 8.1, 0.55, 0.55]);
      add(16.8, () => {
        box(ctx, 9.15, 8.05, 0, 0.6, 0.6, 8, '#a9603a');
        const p = P(9.45, 8.35, 8);
        sprite(ctx, LEAVES, { g: '#2f6a3a', G: '#4f8f4a' }, p[0] - 4, p[1] - 10);
        sprite(ctx, LEAVES, { g: '#2f6a3a', G: '#4f8f4a' }, p[0] - 2, p[1] - 15);
      }, null, [9.15, 8.05, 0.6, 0.6]);

      return list;
    }

    drawSofa(ctx) {
      const open = this.bedOut();
      if (open) {
        // Розкладений: сидіння висунуте вперед, зверху постіль.
        box(ctx, 0.1, 3.4, 0, 2.55, 2.8, 6, PAL.sofaD);
        box(ctx, 0.1, 3.4, 6, 0.35, 2.8, 16, PAL.sofa);
        box(ctx, 0.1, 3.4, 6, 1.25, 0.25, 9, PAL.sofa);
        box(ctx, 0.45, 3.6, 6, 2.15, 2.4, 3, PAL.sheet);
        box(ctx, 0.55, 3.7, 9, 0.55, 0.9, 3, '#eef0f2');
        box(ctx, 0.5, 4.55, 9, 2.1, 1.45, 2, PAL.navy);
        L(ctx, P(1.3, 4.55, 11), P(1.3, 6.0, 11), shade(PAL.navy, 0.25));
        L(ctx, P(2.0, 4.55, 11), P(2.0, 6.0, 11), shade(PAL.navy, 0.25));
        if (this.sleeping()) {
          box(ctx, 0.75, 4.55, 11, 0.9, 1.3, 2, shade(PAL.navy, 0.12), { outline: false });
          const hd = P(0.85, 4.15, 12);
          sprite(ctx, SLEEP_HEAD, HERO_PAL, hd[0] - 3, hd[1] - 5);
        }
        box(ctx, 0.1, 5.95, 6, 1.25, 0.25, 9, PAL.sofa);
        return;
      }
      box(ctx, 0.1, 3.4, 0, 1.25, 2.8, 9, PAL.sofaD);
      box(ctx, 0.1, 3.4, 9, 0.35, 2.8, 13, PAL.sofa);
      box(ctx, 0.45, 3.7, 9, 0.9, 1.1, 3, PAL.cushion);
      box(ctx, 0.45, 4.8, 9, 0.9, 1.1, 3, PAL.cushion);
      if (!this.guests) box(ctx, 0.47, 5.45, 12, 0.25, 0.4, 6, PAL.mustard);
      box(ctx, 0.1, 3.4, 9, 1.25, 0.3, 6, PAL.sofa);
      box(ctx, 0.1, 5.9, 9, 1.25, 0.3, 6, PAL.sofa);
      // Гості після бильців, інакше переднє бильце розрізає їх навпіл.
      if (this.visit) {
        this.visit.friends.forEach((f) => {
          if (!(f.sit > 0)) return;
          const from = P(f.front[0], f.front[1], 0).map(Math.round), to = P(f.seat[0], f.seat[1], 12).map(Math.round);
          this.drawSitter(ctx, f, f.pal, f.long, from, [to[0], to[1] - 1], false);
        });
      }
    }

    drawHero(ctx) {
      if (this.sleeping()) return; // він на дивані під ковдрою
      this.drawWalker(ctx, this.hero, HERO_PAL);
    }

    drawWalker(ctx, h, pal, long) {
      const [fx, fy] = P(h.x, h.y, 0).map(Math.round);
      ctx.fillStyle = 'rgba(10,10,20,0.28)';
      ctx.fillRect(fx - 3, fy - 1, 7, 1); ctx.fillRect(fx - 4, fy, 9, 1); ctx.fillRect(fx - 3, fy + 1, 7, 1);
      const frame = h.moving ? 1 + (Math.floor(h.walkT / 0.16) % 2) : 0;
      const bob = h.moving && frame === 1 ? -1 : 0;
      const top = long ? (h.back ? LONG_BACK : LONG_TOP) : (h.back ? HERO_BACK : HERO_TOP);
      const rows = top.concat(LEGS[frame]);
      const y = fy - rows.length + 1 + bob;
      spriteO(ctx, rows, pal, fx - 4, y);
      h.anchor = [fx, y - 2];
    }

    drawMarkers(ctx) {
      // Стрілка над зоною, біля якої стоїть герой.
      const z = this.currentZone();
      if (!z || this.bubble) return;
      const a = this.zoneAnchor(z);
      if (!a) return;
      const y = Math.round(a[1] - 6 + Math.sin(this.t * 5) * 1.2);
      const x = Math.round(a[0]);
      ctx.fillStyle = '#f4e3b5';
      ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x - 1, y + 1, 3, 1); ctx.fillRect(x, y + 2, 1, 1);
    }

    drawBubble(ctx) {
      const h = this.hero;
      const [fx, fy] = (this.sleeping() ? P(0.9, 4.2, -12) : P(h.x, h.y, 0)).map(Math.round);
      const x = fx - 6, y = fy - 33 - Math.round(Math.max(0, this.bubble.t - 1.3) * 10);
      ctx.fillStyle = PAL.ol; ctx.fillRect(x - 1, y, 13, 11); ctx.fillRect(x, y - 1, 11, 13);
      ctx.fillStyle = '#f4efe2'; ctx.fillRect(x, y, 11, 11);
      ctx.fillStyle = PAL.ol; ctx.fillRect(x + 5, y + 12, 1, 2);
      sprite(ctx, ICONS[this.bubble.id] || ICONS.rest, { '#': ICON_COL[this.bubble.id] || PAL.ol }, x + 2, y + 2);
    }

    drawSpeech(ctx) {
      for (const sp of this.speech) {
        if (sp.delay > 0) continue;
        const a = this.speakerAnchor(sp.who);
        if (!a) continue;
        const age = sp.dur - sp.t;
        const iw = sp.icon ? 5 : sp.w, ih = sp.icon ? 5 : sp.rows.length * 3 - 2;
        const bw = iw + 4, bh = ih + 4;
        const pop = age < 0.1 ? 1 : 0;               // підстрибує, коли з'являється
        const x = Math.round(a[0] - bw / 2), y = Math.round(a[1] - bh - 3 - pop);
        ctx.fillStyle = PAL.ol;
        ctx.fillRect(x - 1, y, bw + 2, bh); ctx.fillRect(x, y - 1, bw, bh + 2);
        ctx.fillStyle = sp.who === 'hero' ? '#f6dfa8' : '#f4efe2';
        ctx.fillRect(x, y, bw, bh);
        ctx.fillStyle = PAL.ol;
        ctx.fillRect(Math.round(a[0]), y + bh + 1, 1, 2);
        if (sp.icon) {
          sprite(ctx, SAY_ICONS[sp.icon], { '#': sp.icon === 'heart' ? '#c0392b' : '#2d3348' }, x + 2, y + 2);
          continue;
        }
        // Рядки «набираються» зліва направо, один за одним.
        let budget = Math.floor(age / 0.03);
        ctx.fillStyle = sp.who === 'hero' ? '#8a7448' : '#7d8296';
        sp.rows.forEach((words, ln) => {
          for (const [wx, wl] of words) {
            if (budget <= 0) return;
            const n = Math.min(wl, budget);
            ctx.fillRect(x + 2 + wx, y + 2 + ln * 3, n, 1);
            budget -= wl + 1;
          }
        });
      }
    }

    // Світло доби і біль: попіксельна обробка готового кадру.
    postprocess(ctx) {
      const v = this.view;
      const img = ctx.getImageData(0, 0, W, H);
      const d = img.data;
      const tint = this.lit.tint;
      const lamp = this.lit.lamp;
      const lights = lamp > 0.02 ? [
        [...P(0.45, 6.75, 22), 46, [1.08, 0.94, 0.75]],
        [...P(1.55, 0.4, 28), v.working ? 52 : 26, [0.8, 1.05, 1.05]],
        [...P(0.45, 0.35, 30), 30, [1.05, 0.95, 0.75]],
      ] : [];
      const p = this.lit.pain;
      const strong = v.state === 'strong';
      // Біль звужує кадр: краї гаснуть дизерингом, кольори вицвітають.
      const r0 = 1.34 - p * 0.088 + (strong ? Math.sin(this.t * 1.7) * 0.035 : 0) - 0.2 * (root.PainFX ? root.PainFX.gloomOf(this.lit.joy) : 0);
      // Радість фарбує світ: мало радості — сіро й тьмяно, багато — соковито.
      const j = Math.max(0, Math.min(100, this.lit.joy)) / 100;
      // Нейтрально на 60 (старт): нижче сірішає, вище стає соковитішим.
      // Нижче 60 — похмурість (спільна крива з PainFX): вицвітає, темнішає, холоднішає, краї підступають.
      const gl = root.PainFX ? root.PainFX.gloomOf(this.lit.joy) : 0;
      const sat = (1 - Math.max(0, p - 3) * 0.07) * (gl > 0 ? 1 - 0.85 * gl : Math.min(1.25, 0.4 + j));
      const bright = gl > 0 ? 1 - 0.4 * gl : Math.min(1.04, 0.85 + 0.25 * j);
      const coolR = 1 - 0.12 * gl, coolB = 1 + 0.1 * gl;
      const cx = W / 2, cy = H / 2 + 4;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          let r = d[i], g = d[i + 1], b = d[i + 2];
          let mr = tint[0], mg = tint[1], mb = tint[2];
          if (lights.length) {
            for (const L2 of lights) {
              const dist = Math.hypot(x - L2[0], (y - L2[1]) * 1.4);
              let k = 1 - dist / L2[2];
              if (k <= 0) continue;
              k = Math.min(1, Math.floor(k * 4 + bayer(x, y)) / 3) * lamp;
              mr = mr + (L2[3][0] - mr) * k; mg = mg + (L2[3][1] - mg) * k; mb = mb + (L2[3][2] - mb) * k;
            }
          }
          r *= mr * bright * coolR; g *= mg * bright; b *= mb * bright * coolB;
          const l = r * 0.3 + g * 0.59 + b * 0.11;
          r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
          if (r < 0) r = 0; if (g < 0) g = 0; if (b < 0) b = 0;
          const ex = (x - cx) / 128, ey = (y - cy) / 103;
          const e = Math.sqrt(ex * ex + ey * ey);
          const lvl = (e - r0) / 0.22;
          if (lvl > 0) {
            if (lvl > bayer(x, y) * 1.6) { r = 14; g = 11; b = 22; }
            else { r *= 0.6; g *= 0.6; b *= 0.65; }
          }
          d[i] = r > 255 ? 255 : r; d[i + 1] = g > 255 ? 255 : g; d[i + 2] = b > 255 ? 255 : b;
        }
      }
      ctx.putImageData(img, 0, 0);
      // Відблиски швидкої: червоне й синє по черзі.
      if (this.cut && this.cut.flash) {
        ctx.fillStyle = Math.floor(this.t * 4) % 2 ? 'rgba(230,40,50,0.2)' : 'rgba(40,100,240,0.2)';
        ctx.fillRect(0, 0, W, H);
      }
    }
  }

  Room.STAND = STAND;
  root.Room = Room;
})(typeof globalThis !== 'undefined' ? globalThis : this);
