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

  // Висота стиснута: з повною меблі й стіни були завеликі, і герой виглядав карликом.
  // Спрайти людей не залежать від неї, тож стискаються лише меблі, стіни й усе, що на них.
  const ZS = 0.78;
  const P = (x, y, z) => [OX + (x - y) * TW2, OY + (x + y) * TH2 - (z || 0) * ZS];

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
  // Фінал без радості: усе чорне.
  const HERO_BLACK = { ...HERO_PAL, G: '#1c1d23', D: '#121318', J: '#24252c', K: '#0b0b0f' };

  const CROUCH_LEGS = ['JJJJJJJJ', 'KK....KK'];
  const SLEEP_HEAD = ['.HHHH.', 'HHHHHH', 'HSSSSH', 'SESSES', '.SBBS.'];
  const SEATED = ['..HHHH..', '.HHHHHH.', '.HSSSSH.', '.SESSES.', '..SSSS..', '.GGGGGG.', 'GGGGGGGG', 'SGGGGGGS', '.JJJJJJ.'];
  const SEATED_BACK = ['..HHHH..', '.HHHHHH.', '.HHHHHH.', '.SHHHHS.', '..SSSS..', '.GGGGGG.', 'GGGGGGGG', 'SGGGGGGS', '.JJJJJJ.'];
  // Кожен друг упізнаваний: своє волосся і свій одяг. Одяг холодних кольорів —
  // на рудому дивані теплі губилися.
  const FRIENDS = {
    // Дідуслав — сивий, у коричневому кардигані; Ковбасій — рудуватий, у червоній картатій сорочці;
    // Любава — довге винне волосся, малинова сукня; Одарка — біляві коси, біла вишиванка; Андрій — чорне, у чорній шкірянці.
    'Дідуслав': { long: false, H: '#c9c6c0', S: '#e2b48c', G: '#7a6247', J: '#3a3530' },
    'Ковбасій': { long: false, H: '#8a3f1c', S: '#e8b892', G: '#c8463a', J: '#33405e' },
    'Любава':   { long: true,  H: '#5a1830', S: '#f0c8a8', G: '#b8326e', J: '#2b2f3a' },
    'Одарка':   { long: true,  H: '#e8c25a', S: '#f0c8a8', G: '#efe8dc', J: '#7a2a2a' },
    'Андрій':   { long: false, H: '#1d1a1f', S: '#c99573', G: '#2a2a30', J: '#1f2a3a', shades: true },
  };
  // Темні окуляри в мініатюрі: смуга через рядок очей, на лінзах — відблиск.
  const SHADES_ROW = '.QqQQqQ.';
  const withShades = (rows, pal) => (pal.shades ? rows.map((r) => (r === '.SESSES.' ? SHADES_ROW : r)) : rows);
  function friendLook(name) {
    const f = FRIENDS[name] || FRIENDS['Андрій'];
    return {
      long: f.long,
      pal: { H: f.H, S: f.S, E: '#1d1d24', B: f.long ? f.S : shade(f.S, -0.15), G: f.G, D: shade(f.G, -0.2), J: f.J, K: '#15161b',
        shades: !!f.shades, Q: '#0d0d10', q: '#6f8ba3' },
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
  // Вечір настолок: подушки по той бік журнального столика (сидять обличчям до столика).
  // Двоє — по той бік столика (від дивана), третій — збоку, з боку комп'ютерного столу.
  const BOARD_SPOTS = [[3.8, 4.35], [3.8, 5.25], [2.9, 3.7]];
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
  // Госпіталізація з ношами: медики стають у проході між диваном і столиком (передній — ближче до виходу)
  // і несуть коридором під столиком, повз крісло-мішок, до дверей — ноші не проходять крізь меблі.
  const STRETCHER_SPOTS = [[1.9, 5.0], [1.9, 3.65]];
  const STRETCHER_OUT = [[1.9, 5.95], [3.85, 5.95], [3.85, 8.5], DOOR_IN, DOOR];
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
    games: ['.......', '.......', '.#####.', '#.#####', '###.#.#', '#.#####', '.##.##.'],
    block: ['...#...', '...#...', '.#####.', '...#...', '...#...', '..###..', '...#...'],
    loan: ['..###..', '.#...#.', '#..#..#', '#.###.#', '#..#..#', '.#...#.', '..###..'],
    text: ['.#####.', '.#...#.', '.#...#.', '.#...#.', '.#####.', '.##.##.', '.#####.'],
    clean: ['.....#.', '....#..', '...#...', '..#....', '.###...', '#####..', '#.#.#..'],
    course: ['.......', '..##...', '.####..', '.##.##.', '..####.', '...##..', '.......'],
    read: ['.......', '##.##..', '#.#.#..', '#.#.#..', '#.#.#..', '##.##..', '.......'],
    coffee: ['..#.#..', '.#.#...', '.......', '#####..', '#####.#', '#####.#', '.###...'],
  };
  const ICON_COL = {
    work: '#2f6f8a', create: '#7a4fa0', friends: '#c0392b', exercise: '#33373f', stretch: '#2f8a7a',
    cook: '#a0602a', delivery: '#a0602a', meds: '#c0392b', rest: '#2d4763', sleep: '#2d4763', coffee: '#5a3a24', block: '#2f6f8a', loan: '#a0802a', text: '#c0392b', clean: '#2f8a7a', course: '#2f6f8a', read: '#7a4fa0', games: '#3f7a3a',
  };

  const GUITAR = ['...KK..', '...KK..', '...KK..', '...NN..', '...NN..', '...NN..', '...NN..', '..BBBB.', '.BBBBBB', '.BBOOBB', '..BBBB.',
    '.BBBBBB', 'BBBOOBBB', 'BBBBBBB', '.BBBBB.'];
  const LEAVES = ['...g.g..', '..gGgGg.', '.gGgGgGg', 'gGgGgGgG', '.gGgggG.', '..g.Gg..'];

  // ---------- кімната ----------

  // Місця, де стоїть герой, коли користується зоною.
  const STAND = {
    desk: [1.55, 2.45], shelf: [4.3, 1.45], kitchen: [7.2, 1.6],
    sofa: [2.05, 3.95], mat: [6.6, 5.1], books: [1.1, 2.35], synth: [1.7, 7.95],
  };

  // Де можна стояти, щоб користуватися зоною: прямокутник підлоги біля меблів [x, y, ширина, глибина].
  // Підходиш стрілками з будь-якого боку — зона відкривається, а не лише в одній точці STAND.
  const REACH = {
    desk: [1.2, 1.3, 2.0, 1.5],      // перед столом з компом, аж до правого краю стільниці
    books: [0.35, 1.3, 0.85, 1.6],   // біля книжкової шафи
    shelf: [3.3, 0.35, 2.05, 1.4],   // перед комодом з ліками
    kitchen: [5.35, 0.35, 4.3, 1.75],
    sofa: [1.35, 3.3, 2.5, 3.1],     // між диваном і столиком, біля столика
    mat: [5.0, 4.3, 3.2, 1.6],
    synth: [0.35, 6.2, 1.8, 2.45],   // біля синтезатора — і збоку, і спереду
  };

  const BLOCKS = [
    [0.2, 0.1, 2.7, 1.25],   // стіл
    [3.6, 0.1, 1.4, 0.7],    // комод під ліками
    [5.6, 0.1, 3.05, 0.95],  // кухонна тумба
    [8.7, 0.1, 1.0, 0.9],    // холодильник
    [0.1, 1.65, 0.7, 0.85],  // книжкова шафа
    [0.1, 6.55, 0.75, 1.7],  // синтезатор на стійці
    [0.1, 3.4, 1.25, 2.8],   // диван
    [2.45, 4.2, 0.9, 1.2],   // журнальний столик (посередині килима)
    [0.95, 7.2, 0.35, 0.35], // стільчик біля синтезатора
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
      this.slumpPending = false;
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
      if (x || y) { this.standUp(); this.path = []; this.target = null; this.slumpPending = false; }
    }

    get walking() { return this.path.length > 0 || this.keys.x !== 0 || this.keys.y !== 0; }

    currentZone() {
      if (this.hero.sitting) return 'sofa';
      if (this.walking) return null;
      const { x, y } = this.hero;
      let best = null, bd = Infinity;
      for (const z in STAND) {
        const r = REACH[z], d = Math.hypot(x - STAND[z][0], y - STAND[z][1]);
        const inside = r ? x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3] : false;
        if ((inside || d < 0.8) && d < bd) { bd = d; best = z; }   // кілька зон поруч — ближча за точкою STAND
      }
      return best;
    }

    speed() {
      if (this.cut && this.cut.slow) return 0.75;   // фінал без радості: важкий, повільний крок
      return { light: 2.6, medium: 1.9, strong: 1.1 }[this.view.state] || 2;
    }

    heroPal() { return this.hero.black ? HERO_BLACK : HERO_PAL; }

    // Заціпеніння (радість 0): герой сам іде до крісла-мішка й сідає. Будь-який рух гравця це скасовує.
    slumpToBag() {
      if (this.hero.sitting || this.walking || this.visit || this.cut) return;
      this.path = this.findPath(BAG_FRONT[0], BAG_FRONT[1]);
      this.target = null;
      this.slumpPending = true;
    }

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
      // Дійшов до мішка в заціпенінні — сідає.
      if (this.slumpPending && !this.path.length && !this.keys.x && !this.keys.y) {
        this.slumpPending = false;
        if (Math.hypot(h.x - BAG_FRONT[0], h.y - BAG_FRONT[1]) < 0.2) { h.sit = 1; h.sitting = true; h.x = BAG_FRONT[0]; h.y = BAG_FRONT[1]; }
      }
      if (this.bubble && (this.bubble.t -= dt) <= 0) this.bubble = null;
      this.updateVisit(dt);
      if (this.cut) this.updateCut(dt);
      this.speech = this.speech.filter((sp) => (sp.t -= dt) > 0 || sp.delay > 0)
        .map((sp) => { if (sp.delay > 0) { sp.delay -= dt; sp.t += dt; } return sp; });
    }

    // onSeated — коли всі сіли: тоді починається розмова від першої особи, а візит чекає на неї.
    playAction(id, guests, onSeated) {
      if (id === 'friends') { this.startVisit(guests, onSeated); return; }
      if (id === 'board') { this.startVisit(guests, null, true); return; }
      this.bubble = { id, t: id === 'rest' ? 2.4 : 1.6 };
      // Відпочинок — посидіти в кріслі-мішку, а не розкладати диван серед дня.
      if (id === 'rest') this.slumpToBag();
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
      // Свято не обриваємо: гості одразу на місцях, далі воно триває.
      if (c.win) {
        c.medics.forEach((m) => { const end = m.path[m.path.length - 1]; if (end) { m.x = end[0]; m.y = end[1]; } m.path = []; m.wait = 0; });
        if (c.phase === 'enter') { c.phase = 'party'; c.t = 5.3; }
        if (!c.shown) { c.shown = true; c.onDone && c.onDone(); }
        return;
      }
      this.cut = null;
      this.heroAway = false;
      this.hero.x = 5; this.hero.y = 3.2; this.path = [];
      c.onDone && c.onDone();
    }

    // Нова гра: герой удома, на ногах і посеред кімнати — хоч би де його лишила фінальна сцена.
    resetHero() {
      this.cut = null; this.bubble = null; this.target = null; this.path = [];
      this.heroAway = false; this.hero.sitting = false; this.hero.sit = 0;
      this.hero.black = false; this.slumpPending = false;
      this.hero.x = 5; this.hero.y = 3.2;
    }

    // Дострокове завершення: коротка сцена перед підсумком.
    // kind: 'joy' — радість на нулі, 'money' — гроші скінчились.
    playEnding(kind, onDone, opts) {
      if (kind === 'win') { this.playWin(onDone, opts); return; }
      // Тіло здалося — госпіталізація: та сама сцена швидкої, але додому вже не повертаєшся.
      if (kind === 'body') { this.playHospital(1, 0, onDone); this.cut.final = true; this.cut.slot = this.view.slot; return; }   // лежить у ліжку, швидка, ноші
      this.endVisit(true);
      const onBag = kind === 'joy' && this.hero.sit >= 1;
      this.bubble = null; this.heroAway = false; this.slumpPending = false;
      if (!onBag) { this.hero.sitting = false; this.hero.sit = 0; }
      this.cut = { ending: kind, phase: onBag ? 'sit' : 'walk', t: 0, onDone, slot: this.view.slot, caption: '', flash: 0, medics: [],
        sleeping: false, drain: 0, joy0: this.view.joy || 30, boxes: 0 };
      this.path = onBag ? [] : kind === 'joy' || kind === 'friends' ? this.findPath(BAG_FRONT[0], BAG_FRONT[1]) : this.findPath(5.4, 7.0);
      this.target = null;
    }

    // Свято в кінці курсу: приходять друзі, яким ти нічого не винен. Без кінця — можна дивитися.
    // opts: { guests: [імена], joy: 0–100, pain: 1–10, boxes: треба з'їжджати }. Кімната — за підсумковим болем і настроєм.
    playWin(onDone, opts) {
      opts = opts || {};
      this.endVisit(true);
      this.bubble = null; this.heroAway = false; this.slumpPending = false;
      this.hero.sitting = false; this.hero.sit = 0; this.hero.black = false;
      this.hero.x = 4.3; this.hero.y = 4.7; this.path = []; this.target = null;
      const spots = [[3.2, 3.9], [3.3, 5.7], [4.6, 6.5], [5.5, 6.0], [5.9, 4.6]];
      const names = (opts.guests || ['Дідуслав', 'Ковбасій', 'Любава', 'Одарка', 'Андрій']).slice().sort(() => Math.random() - 0.5);
      const medics = names.map((n, i) => {
        const l = friendLook(n);
        const m = { x: DOOR[0] + (i % 2) * 0.5, y: DOOR[1] + (i % 2) * 0.3, pal: l.pal, long: l.long, path: [], wait: i * 0.7 };
        m.path = [[DOOR_IN[0] + (i % 2) * 0.5, DOOR_IN[1]], ...this.findPath(spots[i][0], spots[i][1], DOOR_IN[0] + (i % 2) * 0.5, DOOR_IN[1])];
        return m;
      });
      const joy = opts.joy != null ? opts.joy : 100, pain = opts.pain != null ? opts.pain : 1;
      this.cut = { ending: 'win', win: true, phase: 'enter', t: 0, onDone, slot: 1, caption: '', flash: 0, medics, confetti: [],
        joy, pain, alone: !names.length, boxes: opts.boxes ? 3 : 0, bright: joy >= 60 && pain <= 4, shown: false };
    }

    updateEnding(dt) {
      const c = this.cut;
      const go = (p) => { c.phase = p; c.t = 0; };
      if (c.ending === 'win') {
        // Свято таке, яким є підсумок: кімната за болем і настроєм наприкінці.
        this.view.joy = c.joy; this.view.pain = c.pain; this.view.state = c.pain >= 7 ? 'strong' : c.pain >= 4 ? 'medium' : 'light';
        this.lit.joy = c.joy; this.lit.pain = c.pain;
        const h = this.hero;
        const face = (a) => { const dx = h.x - a.x, dy = h.y - a.y; a.back = dx + dy < 0; if (Math.abs(dx - dy) > 0.05) a.dir = dx - dy > 0 ? 1 : -1; };
        // Конфеті сиплеться згори, поки триває свято.
        if (c.phase !== 'enter' || c.t > 1) {
          // Конфеті — за настроєм: яскраве, приглушене чи сіре.
          const pal = c.joy >= 60 ? ['#e2584a', '#f2d36b', '#6fcf8a', '#7ab0e8', '#e58fa8'] : c.joy >= 35 ? ['#a8665c', '#b9a66e', '#7e9a82', '#7f93a8', '#a58290'] : ['#6f7480', '#8a8a8a', '#5c6270', '#9a948a', '#4d525c'];
          const rate = c.joy >= 60 ? 0.5 : c.joy >= 35 ? 0.3 : 0.15;
          for (let k = 0; k < 3; k++) if (Math.random() < rate) c.confetti.push({ x: Math.random(), y: -0.02, v: (c.joy >= 35 ? 0.12 : 0.07) + Math.random() * 0.15, w: Math.random() * 6, col: pal[Math.floor(Math.random() * pal.length)] });
          c.confetti.forEach((p) => { p.y += p.v * dt; p.w += dt * 4; });
          c.confetti = c.confetti.filter((p) => p.y < 1.05);
        }
        if (c.phase === 'enter') {
          c.caption = 'Двадцять перший день позаду';
          let done = true;
          for (const m of c.medics) { if ((m.wait -= dt) > 0) { done = false; continue; } if (!this.moveActor(m, dt, 2.2)) done = false; }
          if (done) { c.medics.forEach(face); go('party'); }
        } else if (c.phase === 'party') {
          // Свято без кінця: підписи один раз, далі просто живе кімната.
          c.medics.forEach(face);
          const first = c.alone ? ['Курс лікування завершено', 'Святкуєш сам'] : ['Курс лікування завершено', 'Друзі прийшли привітати'];
          c.caption = c.t < 2.6 ? first[0] : c.t < 5.2 ? first[1] : c.boxes && c.t < 7.8 ? 'Коробки зібрані — доведеться з’їжджати' : '';
          // Друзі по черзі пританцьовують.
          c.medics.forEach((m, i) => { m.moving = Math.floor(c.t * 1.5 + i) % 3 === 0; m.walkT = (m.walkT || 0) + dt; });
          if (!c.shown && c.t > 5.4) { c.shown = true; const cb = c.onDone; cb && cb(); }
        }
        return;
      }
      if (c.ending === 'friends') {
        // Останній друг пішов: сісти на мішок, телефон мовчить, світ тьмяніє.
        if (c.phase === 'walk') {
          c.caption = 'Стосунки розпалися';
          if (!this.path.length) { this.hero.sit = 1; this.hero.sitting = true; this.hero.x = BAG_FRONT[0]; this.hero.y = BAG_FRONT[1]; go('quiet'); }
        } else if (c.phase === 'quiet') {
          c.drain = Math.min(1, c.t / 4);
          c.caption = c.t < 2.2 ? 'Друзі перестали писати.' : 'Телефон мовчить.';
          if (c.t > 6) go('done');
        }
      } else if (c.ending === 'joy') {
        // Пуф → підвестися → вікно над диваном → світло заливає кімнату. Кімната тим часом вицвітає.
        c.drain = Math.min(1, c.drain + dt / 6);
        if (c.phase === 'walk') {
          c.caption = 'Настрій згас';
          if (!this.path.length) { this.hero.sit = 1; this.hero.sitting = true; this.hero.x = BAG_FRONT[0]; this.hero.y = BAG_FRONT[1]; go('sit'); }
        } else if (c.phase === 'sit') {
          c.caption = 'Настрій згас';
          if (c.t > 2.4) { this.setHeroSit(0); this.path = this.findPath(STAND.sofa[0], STAND.sofa[1]); go('towin'); }
        } else if (c.phase === 'towin') {
          // Підвестися й підійти до вікна над диваном.
          c.caption = 'Нічого не хочеться.';
          if (!this.path.length) { this.hero.back = true; this.hero.dir = -1; go('open'); }
        } else if (c.phase === 'open') {
          c.caption = 'Ти відчиняєш вікно.';
          c.windowOpen = Math.min(1, c.t / 1.2);
          if (c.t > 2.2) go('out');
        } else if (c.phase === 'out') {
          // Світло з вікна заливає кімнату — і тебе в ній уже немає.
          c.caption = 'І виходиш туди.';
          c.whiteout = Math.min(1, c.t / 2.4);
          if (c.whiteout >= 1) this.heroAway = true;
          if (c.t > 3.6) go('done');
        }
      } else {
        if (c.phase === 'walk') {
          c.caption = 'Гроші скінчилися';
          if (!this.path.length) go('pack');
        } else if (c.phase === 'pack') {
          c.boxes = Math.min(3, Math.floor(c.t / 0.6) + 1);
          c.caption = 'Гроші скінчилися. Нема чим платити за життя.';
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
      if (c.ending === 'joy' || c.ending === 'friends' || c.ending === 'body') this.view.joy = c.joy0 * (1 - c.drain);
    }

    updateCut(dt) {
      const c = this.cut;
      c.t += dt;
      if (c.ending) { this.updateEnding(dt); return; }
      const go = (p) => { c.phase = p; c.t = 0; };
      switch (c.phase) {
        case 'sleep':
          c.caption = c.final ? 'Тіло здалося' : 'Ніч';
          if (c.t > 1.0) go('flash');
          break;
        case 'flash':
          c.flash = 1;
          c.caption = c.final ? 'Тіло здалося' : 'Біль дійшов до 10. Викликали швидку';
          if (c.t > 1.6) {
            const spots = c.final ? STRETCHER_SPOTS : MEDIC_SPOTS;
            c.medics = MEDICS.map((pal, i) => {
              const m = { x: DOOR[0] + i * 0.5, y: DOOR[1] + i * 0.3, pal, path: [] };
              m.path = [[DOOR_IN[0] + i * 0.5, DOOR_IN[1]], ...this.findPath(spots[i][0], spots[i][1], DOOR_IN[0] + i * 0.5, DOOR_IN[1])];
              return m;
            });
            go('enter');
          }
          break;
        case 'enter':
          if (c.medics.map((m) => this.moveActor(m, dt, 2.2)).every(Boolean)) go('lift');
          break;
        case 'lift':
          if (c.final) {
            // Фінал: не встає — кладуть на ноші.
            if (c.t > 0.5 && !c.stretcher) { c.sleeping = false; c.stretcher = true; this.heroAway = true; c.slot = 3; }   // медики вмикають світло
          } else if (c.sleeping && c.t > 0.5) {
            c.sleeping = false;
            this.hero.x = 2.15; this.hero.y = 4.9; this.hero.back = false;
          }
          c.caption = c.final ? 'Госпіталізація' : 'Тебе забирають у лікарню';
          if (c.t > 1.4) {
            if (c.final && c.medics.length === 2) {
              // Ноші: передній іде коридором, задній — слідом тим самим шляхом.
              const [m0, m1] = c.medics;
              m0.path = STRETCHER_OUT.map((q) => q.slice());
              c.trail = [[m1.x, m1.y], [m0.x, m0.y]];
            } else c.medics.forEach((m, i) => { m.path = [...this.findPath(DOOR_IN[0] + i * 0.5, DOOR_IN[1], m.x, m.y), [DOOR[0] + i * 0.5, DOOR[1] + i * 0.3]]; });
            if (!c.final) this.path = [...this.findPath(DOOR_IN[0] + 0.25, DOOR_IN[1] - 0.4), [DOOR[0] + 0.25, DOOR[1]]];
            go('out');
          }
          break;
        case 'out': {
          // Медики підлаштовуються під його крок.
          let done;
          if (c.final && c.medics.length === 2) {
            // Несуть ноші: передній медик іде шляхом, задній тримає ноші на сталій відстані позаду.
            const [m0, m1] = c.medics;
            done = this.moveActor(m0, dt, 1.4);
            // Задній — на відстані gap позаду вздовж сліду переднього (не навпростець через стіл).
            const tr = c.trail || (c.trail = [[m1.x, m1.y]]);
            const last = tr[tr.length - 1];
            if (Math.hypot(m0.x - last[0], m0.y - last[1]) > 0.02) tr.push([m0.x, m0.y]);
            let left = 1.35, k = tr.length - 1, px = m0.x, py = m0.y;
            while (k > 0) {
              const [ax, ay] = tr[k - 1], seg = Math.hypot(px - ax, py - ay);
              if (seg >= left) { px += (ax - px) * (left / seg); py += (ay - py) * (left / seg); left = 0; break; }
              left -= seg; px = ax; py = ay; k--;
            }
            const dx = m0.x - px, dy = m0.y - py;
            m1.x = px; m1.y = py;
            if (Math.abs(dx - dy) > 0.05) m1.dir = dx - dy > 0 ? 1 : -1;
            m1.back = dx + dy < -0.1;
            m1.moving = m0.moving; m1.walkT = m0.walkT;
          } else done = c.medics.map((m) => this.moveActor(m, dt, Math.min(2.2, this.speed()))).every(Boolean);
          if (done && !this.path.length) {
            this.heroAway = true; c.medics = []; c.flash = 0;
            go('away');
          }
          break;
        }
        case 'away': {
          if (c.final) {
            c.slot = 4;
            c.caption = 'Курс лікування доведеться починати заново.';
            if (c.t > 2.4) { const done = c.onDone; this.cut = null; done && done(); return; }
            break;
          }
          // Дні в лікарні пролітають: ранок, день, пообіддя, вечір, ніч.
          const perDay = 1.5;
          const k = Math.floor(c.t / perDay);
          c.slot = Math.min(4, Math.floor((c.t % perDay) / (perDay / 5)));
          c.caption = 'Ніч у лікарні';
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

    // board — вечір настолок: заходять усі, двоє на дивані, решта на подушках по той бік столика.
    // heroSofa — герой сидить на дивані поруч із гостем (лікар), а не на мішку.
    startVisit(names, onSeated, board, heroSofa) {
      this.speech = [];
      names = names && names.length ? names : ['Андрій'];
      const one = names.length === 1;
      const friends = names.slice(0, board ? 5 : heroSofa ? 1 : 2).map((name, i) => {
        const look = name === 'Лікар' ? { pal: MEDICS[0], long: false } : friendLook(name);
        const floor = board && i >= 2;
        const spot = floor ? BOARD_SPOTS[i - 2] : null;
        const front = floor ? spot : heroSofa ? SEAT_FRONT[1] : one ? SEAT_ONE_FRONT : SEAT_FRONT[i];
        const inX = DOOR_IN[0] + (i % 3) * 0.45, inY = DOOR_IN[1] - Math.floor(i / 3) * 0.5;
        const a = { name, x: DOOR[0] + (i % 3) * 0.45, y: DOOR[1] + Math.floor(i / 3) * 0.3, pal: look.pal, long: look.long,
          seated: false, sit: 0, sitDir: 0, path: [], seat: floor ? spot : heroSofa ? SEATS[1] : one ? SEAT_ONE : SEATS[i], front, floor };
        // Спершу — крок за поріг; решта шляху — після привітання.
        a.path = [[inX, inY]];
        a.rest = this.findPath(front[0], front[1], inX, inY);
        return a;
      });
      this.visit = { phase: 'enter', t: 0, friends, onSeated: onSeated || null, hold: false, board: !!board, heroSofa: !!heroSofa };
      // Герой іде до крісла-мішка біля входу й зустрічає гостей там — ніхто ні з ким не розминається.
      // З лікарем — до дивана: сядуть поруч.
      this.setHeroSit(0);
      const hs = this.heroStand();
      this.path = this.findPath(hs[0], hs[1]);
      this.target = null;
    }

    // «Пропустити» для візиту: якщо попереду розмова — одразу всі сидять і вона починається; інакше гості просто йдуть.
    skipVisit() {
      const v = this.visit;
      if (!v) return false;
      if (v.onSeated && !v.hold) {
        this.speech = [];
        v.friends.forEach((f) => { f.path = []; f.moving = false; f.x = f.front[0]; f.y = f.front[1]; f.sit = 1; f.sitDir = 0; f.seated = true; });
        const hs = this.heroStand();
        this.path = []; this.hero.x = hs[0]; this.hero.y = hs[1]; this.hero.sit = 1; this.hero.sitDir = 0; this.hero.sitting = true;
        v.phase = 'talk'; v.t = 0; v.hold = true;
        const cb = v.onSeated; v.onSeated = null; cb();
        return true;
      }
      if (v.hold) return false;   // іде розмова від першої особи — її пропускає сцена
      this.endVisit(true);
      return true;
    }

    // Де герой стоїть, перш ніж сісти: біля мішка, а з лікарем — перед диваном.
    heroStand() { return this.visit && this.visit.heroSofa ? SEAT_FRONT[0] : BAG_FRONT; }

    setHeroSit(v) {
      const h = this.hero, was = h.sit > 0;
      h.sit = v; h.sitDir = 0; h.sitting = v > 0;
      if (was && !v) { const hs = this.heroStand(); h.x = hs[0]; h.y = hs[1]; }
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
        if (this.hero.sitting) { const hs = this.heroStand(); this.setHeroSit(0); this.hero.x = hs[0]; this.hero.y = hs[1]; }
      } else if (this.visit.phase !== 'leave' && this.visit.phase !== 'standup') this.leaveVisit();
    }

    // Обличчям одне до одного: друзі дивляться на героя, герой — на них.
    faceEachOther() {
      const v = this.visit, h = this.hero;
      const face = (a, tx, ty) => { const dx = tx - a.x, dy = ty - a.y; a.back = dx + dy < 0; if (Math.abs(dx - dy) > 0.05) a.dir = dx - dy > 0 ? 1 : -1; };
      v.friends.forEach((f) => face(f, h.x, h.y));
      face(h, v.friends[0].x, v.friends[0].y);
    }

    updateVisit(dt) {
      const v = this.visit;
      if (!v) return;
      if (v.board) this.view.slot = 3;   // настолки — вечір: за вікном сутінки, горить лампа
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
        // Друзі переступають поріг — і одразу вітаються з героєм, обличчям до обличчя.
        if (this.path.length) return;   // спершу герой підходить до мішка
        const done = v.friends.map((f) => this.moveActor(f, dt, sp)).every(Boolean);
        if (done) {
          v.phase = 'greet'; v.t = 0;
          this.faceEachOther();
          this.say(0, 'talk');   // «рука, що махає» в пікселях читалася як корона
          this.say('hero', 'talk', 0.35);
          if (v.friends[1]) this.say(1, 'talk', 0.7);
        }
      } else if (v.phase === 'greet') {
        this.faceEachOther();
        if (v.t > 1.4) {
          // Привіталися — гості йдуть на диван, герой лишається біля мішка.
          v.friends.forEach((f) => { f.path = f.rest || []; });
          v.phase = 'walk'; v.t = 0;
        }
      } else if (v.phase === 'walk') {
        const done = v.friends.map((f) => this.moveActor(f, dt, sp)).every(Boolean);
        // Герой проводжає гостей поглядом.
        const h = this.hero, f0 = v.friends[0], dx = f0.x - h.x, dy = f0.y - h.y;
        h.back = dx + dy < 0; if (Math.abs(dx - dy) > 0.05) h.dir = dx - dy > 0 ? 1 : -1;
        if (done) {
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
          // Настолки: сміються й перекидаються репліками всі по колу, довше.
          if (v.board) {
            const who = [...v.friends.map((_, i) => i), 'hero'];
            for (let k = 0; k < 14; k++) this.say(who[k % who.length], k % 3 === 1 ? 'heart' : 'talk', 0.3 + k * 0.75);
            return;
          }
          // Перемовляються по черзі, іноді хтось вклинюється.
          const order = v.friends[1] ? [0, 'hero', 1, 0, 'hero', 1, 'hero'] : [0, 'hero', 0, 'hero', 0, 'hero'];
          order.forEach((who, i) => this.say(who, 'talk', 0.3 + i * 1.15 + (i % 3 === 2 ? -0.4 : 0)));
        }
      } else if (v.phase === 'talk') {
        if (v.t > (v.board ? 12 : 8.6) && !v.hold) this.leaveVisit();
      } else if (v.phase === 'standup') {
        if (people.every((a) => !a.sit)) {
          if (this.hero.sitting) this.setHeroSit(0);
          v.phase = 'leave'; v.t = 0;
          this.faceEachOther();
          this.say(0, 'talk');
          if (v.friends[1]) this.say(1, 'heart', 0.4);
          this.say('hero', 'talk', 0.9);
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
      spriteO(ctx, withShades(rows, pal), pal, x, y);
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
      if (this.cut) for (const m of this.cut.medics) actors.push({ a: m, draw: () => this.drawWalker(ctx, m, m.pal, m.long) });
      // Ноші між медиками — окремий «актор» посередині, щоб правильно ховатись за меблями.
      if (this.cut && this.cut.stretcher && this.cut.medics.length === 2) {
        const [m0, m1] = this.cut.medics;
        // Ноші — між медиками за глибиною: задній позаду, передній трохи закриває свій край.
        actors.push({ a: { x: (m0.x + m1.x) / 2, y: (m0.y + m1.y) / 2 }, draw: () => this.drawStretcher(ctx, m0, m1) });
      }
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

    // Життя за вікном: своє для кожної частини дня. Усе обрізається рамкою вікна (y 3.9–5.9, z 30–49).
    drawSkyLife(ctx, slot, night) {
      const t = this.t, Y0 = 3.92, Y1 = 5.88, Z0 = 30, Z1 = 48.5;
      const px = (y, z, col, w, h) => {
        if (y < Y0 || y > Y1 || z < Z0 || z > Z1) return;
        const p = P(0, y, z); ctx.fillStyle = col; ctx.fillRect(Math.round(p[0]), Math.round(p[1]), w || 1, h || 1);
      };
      // Хмара — кілька «пухнастих» смуг, що пливуть і обрізаються рамкою.
      const cloud = (y, z, len, col) => {
        for (let i = 0; i < len; i++) {
          const yy = y + i * 0.09, bump = (i > 0 && i < len - 1) ? 1.4 : 0;
          px(yy, z + bump, col, 2, 1); px(yy, z, col, 2, 1);
        }
      };
      const drift = (speed, off, span) => Y0 - 0.6 + ((t * speed + off) % (span + 0.6));
      const span = Y1 - Y0 + 0.6;
      if (night || slot >= 4) {
        // Ніч: місяць, зірки мерехтять, зрідка — падуча зірка.
        const stars = [[4.05, 46], [4.4, 42], [4.7, 47.5], [5.05, 44], [5.35, 46.5], [5.7, 41.5], [4.25, 39], [5.5, 39.5], [4.9, 40.5]];
        stars.forEach(([y, z], i) => { if (Math.sin(t * (1.3 + i * 0.37) + i * 2) > -0.35) px(y, z, i % 3 ? '#e8ecf5' : '#fff6c8'); });
        px(5.45, 44.5, '#f3ecd0', 3, 3); px(5.55, 45.5, '#c9c4ad', 2, 2);   // місяць-серп
        const sh = (t % 9) / 9;
        if (sh < 0.12) { const k = sh / 0.12; for (let j = 0; j < 4; j++) px(4.0 + k * 1.4 + j * 0.06, 48 - k * 7 - j * 0.6, j ? '#9aa6c4' : '#ffffff'); }
        return;
      }
      if (slot === 0) {
        // Ранок: низьке сонце зі світінням, рожеві хмарки.
        const rise = Math.min(4, (t % 60) * 0.05);
        const glow = Math.sin(t * 1.5) > 0 ? '#ffe6b0' : '#fff0c8';
        px(4.25, 32 + rise, glow, 5, 4); px(4.3, 33 + rise, '#ffd27a', 3, 3);
        cloud(drift(0.03, 0.2, span), 43, 7, '#f5c6c0');
        cloud(drift(0.022, 1.3, span), 39, 5, '#f8d8cf');
      } else if (slot === 1) {
        // День: білі хмари пливуть, зрідка пролітає пташка.
        cloud(drift(0.05, 0, span), 45, 8, '#ffffff');
        cloud(drift(0.035, 1.1, span), 40, 6, '#f2f6fa');
        cloud(drift(0.06, 2.0, span), 47, 4, '#ffffff');
        const b = (t % 11) / 11;
        if (b < 0.4) { const by = Y0 + b / 0.4 * (Y1 - Y0), bz = 42 + Math.sin(t * 3) * 1.5, f = Math.floor(t * 6) % 2;
          px(by, bz, '#2d3348'); px(by + 0.07, bz + (f ? 1 : -1), '#2d3348'); px(by - 0.07, bz + (f ? 1 : -1), '#2d3348'); }
      } else if (slot === 2) {
        // Пообіддя: золоте сонце вище, мерехтить, хмари повільні й теплі.
        const pulse = Math.sin(t * 2) > 0.3;
        px(5.3, 44, pulse ? '#fff1b8' : '#ffe8a0', 5, 5); px(5.35, 45, '#ffd060', 3, 3);
        cloud(drift(0.025, 0.4, span), 40, 7, '#fbe6c4');
        cloud(drift(0.018, 1.6, span), 46.5, 5, '#fff3dc');
      } else {
        // Вечір: помаранчевий диск сідає за будинки, рожеві хмари, перші зірки.
        const sink = (t % 40) / 40 * 5;
        px(4.6, 36 - sink, '#ff9a5a', 5, 4); px(4.65, 37 - sink, '#ffcf7a', 3, 2);
        cloud(drift(0.02, 0.6, span), 44, 8, '#e88a8a');
        cloud(drift(0.015, 1.8, span), 41, 5, '#c97a9a');
        [[4.2, 47.5], [5.6, 46]].forEach(([y, z], i) => { if (Math.sin(t * 1.1 + i * 3) > 0.2) px(y, z, '#fff3d0'); });
      }
    }

    drawWallDecor(ctx) {
      const slot = this.view.slot;
      const night = this.lit.lamp > 0.8;
      const sky = hexOf(this.lit.sky);
      const dark = (f) => hexOf(this.lit.sky.map((v) => v * (1 - f) + 18 * f * this.lit.lamp));
      // Вікно над диваном.
      wallL(ctx, 3.75, 6.05, 23, 51, PAL.sheet);
      wallL(ctx, 3.9, 5.9, 25, 49, sky);
      // Небо малюється лише в межах скла: пікселі хмар і сонця ширші за точку й інакше вилазять на стіну.
      ctx.save();
      ctx.beginPath();
      [P(0, 3.9, 25), P(0, 5.9, 25), P(0, 5.9, 49), P(0, 3.9, 49)].forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
      ctx.closePath(); ctx.clip();
      this.drawSkyLife(ctx, slot, night);
      ctx.restore();
      wallL(ctx, 3.9, 5.9, 25, 30, dark(0.35));
      wallL(ctx, 4.1, 4.4, 25, 34, dark(0.45));
      wallL(ctx, 5.2, 5.6, 25, 37, dark(0.4));
      if (night) {
        wallL(ctx, 5.3, 5.35, 32, 33, '#f2d36b'); if (Math.sin(this.t * 0.7) > -0.6) wallL(ctx, 4.2, 4.25, 27, 28, '#f2d36b');
        if (Math.sin(this.t * 0.45 + 1) > 0) wallL(ctx, 5.4, 5.45, 29, 30, '#f2d36b');
        ctx.fillStyle = '#e8ecf5';
        const a = P(0, 4.2, 45); ctx.fillRect(a[0], a[1], 1, 1);
        const b = P(0, 5.5, 43); ctx.fillRect(b[0], b[1], 1, 1);
      }
      wallL(ctx, 4.85, 4.95, 25, 49, PAL.sheet);
      wallL(ctx, 3.9, 5.9, 37, 38.5, PAL.sheet);
      // Відчинене вікно у фіналі: стулка відходить, з вікна б'є світло.
      const wo = this.cut && this.cut.windowOpen;
      if (wo) {
        wallL(ctx, 4.95, 4.95 + 0.95 * wo, 25, 49, 'rgba(255,248,225,' + (0.55 + 0.35 * wo) + ')');
        wallL(ctx, 4.95 + 0.95 * wo - 0.08, 4.95 + 0.95 * wo, 25, 49, PAL.sheet);
      }

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

      // Полиця з ліками. У фіналі перемоги її вже немає: курс завершено.
      const healed = this.cut && this.cut.win;
      rec = 'shelf';
      if (!healed) {
      wallR(ctx, 4.0, 4.7, 34, 48, '#e6e8ea');
      wallR(ctx, 4.27, 4.43, 36, 46, PAL.red);
      wallR(ctx, 4.1, 4.6, 39.5, 42.5, PAL.red);
      box(ctx, 3.65, 0, 26, 1.4, 0.5, 2, PAL.woodD);
      box(ctx, 3.75, 0.12, 28, 0.2, 0.2, 7, '#d07a2c', { outline: false });
      box(ctx, 4.1, 0.12, 28, 0.2, 0.2, 5, '#e6e8ea', { outline: false });
      box(ctx, 4.42, 0.12, 28, 0.2, 0.2, 6, PAL.red, { outline: false });
      box(ctx, 4.75, 0.12, 28, 0.2, 0.2, 8, PAL.blue, { outline: false });
      } else {
        // Замість аптечки — полиця з кубком і грамотою над нею.
        wallR(ctx, 4.0, 4.7, 34, 46, '#3a2f22');
        wallR(ctx, 4.06, 4.64, 35, 45, '#f3ead6');
        wallR(ctx, 4.15, 4.55, 42, 43, '#b08d3c'); wallR(ctx, 4.15, 4.45, 39, 40, '#8f8676'); wallR(ctx, 4.15, 4.5, 37, 38, '#8f8676');
        box(ctx, 3.65, 0, 26, 1.4, 0.5, 2, PAL.woodD);
        box(ctx, 4.05, 0.12, 28, 0.42, 0.26, 1, '#6b5220');
        box(ctx, 4.18, 0.18, 29, 0.16, 0.14, 2, '#c9962a', { outline: false });
        box(ctx, 4.02, 0.1, 31, 0.48, 0.3, 5, '#f2c43a');
        box(ctx, 4.06, 0.12, 35, 0.4, 0.26, 1, '#ffe27a', { outline: false });
        const sh = Math.floor(this.t * 3) % 2;
        L(ctx, P(4.1, 0.1, 33), P(4.1, 0.1, 35), sh ? '#fff6c8' : '#ffe27a');
      }
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
      // Сонячна пляма з вікна — м'яке напівпрозоре світло, а не рідкі точки (на малому рівні вони виглядали як сміття).
      if (lvl < 0.12) return;
      ctx.save();
      ctx.globalAlpha = Math.min(0.32, lvl * 0.45);
      poly(ctx, [P(x0, 3.9 + shift), P(x0 + len, 4.1 + shift), P(x0 + len, 6.1 + shift), P(x0, 6.0 + shift)], col);
      ctx.restore();
    }

    // Диван розкладений на ніч і коли він дрімає; з гостями — складений.
    bedOut() {
      return this.sleeping() || this.view.night;
    }
    sleeping() { return !!(this.cut && this.cut.sleeping); }

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
        // Немитий посуд на тумбі: що більше безладу, то вища стопка, далі — друга.
        const plates = Math.min(6, v.mess || 0);
        for (let i = 0; i < plates; i++) {
          const x = i < 3 ? 5.75 : 8.15, z = 19 + (i % 3) * 2;
          box(ctx, x, 0.3, z, 0.4, 0.4, 1, i % 2 ? '#d8dcdf' : '#c2c8cc', { outline: i % 3 === 2 });
          if (i % 3 === 2) { const s2 = P(x + 0.2, 0.5, z + 1); ctx.fillStyle = '#8a6a3a'; ctx.fillRect(s2[0], s2[1], 2, 1); }
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

      // Безлад на підлозі: речі з'являються раніше, ніж безлад почне дратувати, і множаться далі.
      const mess = v.mess || 0;
      if (mess >= 4) add(-30, () => {
        // Сіра футболка з принтом і шкарпетки біля столу. Не червоне: червона пляма на підлозі читалася як кров.
        poly(ctx, [P(3.7, 2.3, 0), P(4.7, 2.2, 0), P(4.75, 2.95, 0), P(3.75, 3.05, 0)], '#8d939c');
        poly(ctx, [P(3.7, 2.3, 0), P(3.95, 2.28, 0), P(4.0, 3.02, 0), P(3.75, 3.05, 0)], '#767c85');
        poly(ctx, [P(4.05, 2.5, 1), P(4.35, 2.47, 1), P(4.37, 2.72, 1), P(4.08, 2.75, 1)], '#e6e8ea');
        poly(ctx, [P(4.9, 2.6, 0), P(5.2, 2.55, 0), P(5.22, 2.7, 0), P(4.92, 2.75, 0)], '#e6e8ea');
        poly(ctx, [P(5.0, 2.85, 0), P(5.3, 2.8, 0), P(5.32, 2.95, 0), P(5.02, 3.0, 0)], '#d8dcdf');
        if (mess >= 6) {
          // Джинси біля килимка і тарілка на підлозі.
          poly(ctx, [P(4.9, 6.0, 0), P(5.8, 5.85, 0), P(5.9, 6.4, 0), P(5.0, 6.6, 0)], '#3b5a7a');
          box(ctx, 3.2, 7.4, 0, 0.45, 0.4, 1, '#d8dcdf');
        }
        if (mess >= 9) {
          poly(ctx, [P(6.4, 3.0, 0), P(7.2, 2.9, 0), P(7.25, 3.4, 0), P(6.45, 3.5, 0)], '#c4842f');
          box(ctx, 2.9, 3.0, 0, 0.3, 0.3, 3, '#7d858f');
        }
      }, null);

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
      }, 'books', [0.1, 1.65, 0.7, 0.85]);

      // Диван-ліжко.
      add(4.6, () => this.drawSofa(ctx), 'sofa', [0.1, 3.4, 1.25, 2.8]);

      // Журнальний столик: посередині килима, ближче до дивана.
      add(7.75, () => {
        for (const [lx, ly] of [[2.5, 4.25], [3.2, 4.25], [2.5, 5.25], [3.2, 5.25]]) box(ctx, lx, ly, 0, 0.1, 0.1, 6, PAL.woodD, { outline: false });
        box(ctx, 2.45, 4.2, 6, 0.9, 1.2, 2, PAL.wood);
        box(ctx, 2.6, 4.4, 8, 0.4, 0.5, 1, PAL.blue, { outline: false });
        // Друзі принесли поїсти: коробка на столику до кінця дня.
        if (v.food === 'guests' || v.food === 'shared') {
          box(ctx, 2.55, 4.55, 9, 0.6, 0.6, 2, '#c9a36b');
          L(ctx, P(2.7, 5.15, 11), P(3, 5.15, 11), PAL.red);
        }
        box(ctx, 3.05, 4.95, 8, 0.15, 0.15, 3, '#e6e8ea', { outline: false });
        // Телефон: блимає, коли друзі пишуть.
        box(ctx, 3.05, 4.4, 8, 0.2, 0.12, 1, '#1d1f26', { outline: false });
        if (v.invite && Math.floor(t * 3) % 2 === 0) {
          const ph = P(3.15, 4.46, 9); ctx.fillStyle = '#9ff2dc'; ctx.fillRect(ph[0] - 1, ph[1], 3, 1);
          ctx.fillRect(ph[0], ph[1] - 4, 1, 2);
        }
        // Настолка на столику: поле, фішки, кубик.
        if (this.visit && this.visit.board) {
          box(ctx, 2.5, 4.45, 8, 0.8, 0.75, 1, '#e8d9a8');
          for (const [fx, fy, c] of [[2.6, 4.55, PAL.red], [3.05, 4.6, PAL.blue], [2.75, 5.0, '#6fcf8a'], [3.1, 4.95, PAL.mustard]]) box(ctx, fx, fy, 9, 0.08, 0.08, 2, c, { outline: false });
          box(ctx, 2.9, 4.8, 9, 0.1, 0.1, 1, '#f3f4f2', { outline: false });
        }
        if (this.guests) {
          box(ctx, 2.65, 5.05, 8, 0.15, 0.15, 3, PAL.mustard, { outline: false });
          box(ctx, 3, 4.35, 8, 0.25, 0.25, 1, '#c98a4f', { outline: false });
        }
      }, null, [2.45, 4.2, 0.9, 1.2]);

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

      // Вечір настолок: подушки на підлозі й друзі на них.
      if (this.visit && this.visit.board) {
        BOARD_SPOTS.forEach(([cx, cy], i) => {
          add(cx + cy + 0.05, () => {
            box(ctx, cx - 0.3, cy - 0.3, 0, 0.6, 0.6, 2, ['#c0605a', '#5f7fb0', '#c9a24a'][i]);
            const f = this.visit.friends.find((x) => x.floor && x.seat === BOARD_SPOTS[i]);
            if (f && f.sit > 0) {
              const from = P(f.front[0], f.front[1], 0).map(Math.round), to = P(cx, cy, 2).map(Math.round);
              this.drawSitter(ctx, f, f.pal, f.long, from, [to[0], to[1] - 1], i !== 2);   // з боку компа — обличчям до нас
            }
          }, null, [cx - 0.3, cy - 0.3, 0.6, 0.6]);
        });
      }

      // Крісло-мішок: тут герой сидить, коли в гостях друзі.
      add(9.5, () => {
        const p = P(BAG[0], BAG[1], 0).map(Math.round);
        const bx = p[0] - 10, by = p[1] - 12;
        const pal = { O: PAL.ol, L: '#6f80a8', M: '#4c5b82', D: '#3a4668', d: '#2e3854', S: '#36415f' };
        sprite(ctx, BEANBAG, pal, bx, by);
        if (this.hero.sit > 0 && !(this.visit && this.visit.heroSofa)) {
          // Сідає у вм'ятину; коли сів, нижній край мішка накриває ноги.
          const from = P(BAG_FRONT[0], BAG_FRONT[1], 0).map(Math.round);
          this.drawSitter(ctx, this.hero, this.heroPal(), false, from, [p[0], p[1] - 7], true);
          if (this.hero.sit >= 1) sprite(ctx, BEANBAG.slice(-BAG_FRONT_ROWS), pal, bx, by + BEANBAG.length - BAG_FRONT_ROWS);
        }
      }, null, [2.15, 6.6, 0.6, 0.6]);

      // Синтезатор на X-подібній стійці вздовж стіни: тут пишуться пісні. Поруч — маленький стільчик.
      add(7.6, () => {
        for (const y of [6.75, 7.4, 8.05]) {
          L(ctx, P(0.2, y, 0), P(0.7, y, 10), PAL.metal);
          L(ctx, P(0.7, y, 0), P(0.2, y, 10), PAL.metal);
        }
        box(ctx, 0.12, 6.6, 10, 0.68, 1.6, 3, '#1f2026');                      // корпус
        box(ctx, 0.18, 6.68, 13, 0.36, 1.44, 1, '#eef2f3', { outline: false });   // білі клавіші
        for (let i = 0; i < 16; i++) L(ctx, P(0.18, 6.7 + i * 0.09, 14), P(0.54, 6.7 + i * 0.09, 14), '#c9ced3');
        for (let i = 0; i < 16; i++) if ([1, 2, 4, 5, 6].includes(i % 7)) box(ctx, 0.18, 6.66 + i * 0.09, 14, 0.2, 0.05, 1, '#16171b', { outline: false });   // чорні
        box(ctx, 0.56, 6.7, 13, 0.18, 1.4, 1, '#30333b', { outline: false });   // панель
        box(ctx, 0.58, 6.8, 14, 0.12, 0.4, 1, '#1f4d4a', { outline: false });   // дисплей
        const d = P(0.64, 6.95, 15); ctx.fillStyle = '#6fcf8a'; ctx.fillRect(d[0], d[1], 2, 1);
        for (const [y, c] of [[7.4, '#e2584a'], [7.6, '#e8c25a'], [7.8, '#eef2f3'], [8.0, '#eef2f3']]) { const k = P(0.64, y, 14); ctx.fillStyle = c; ctx.fillRect(k[0], k[1], 1, 1); }
      }, 'synth', [0.1, 6.55, 0.75, 1.7]);
      add(8.6, () => {
        for (const [x, y] of [[1.0, 7.25], [1.25, 7.25], [1.0, 7.5], [1.25, 7.5]]) L(ctx, P(x, y, 0), P(x, y, 6), PAL.woodD);
        box(ctx, 0.95, 7.2, 6, 0.35, 0.35, 2, PAL.wood);                          // сидіння
        box(ctx, 0.98, 7.23, 8, 0.29, 0.29, 1, '#3a2f2a', { outline: false });    // м'яка подушечка
      }, 'synth', [0.95, 7.2, 0.35, 0.35]);
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
      box(ctx, 0.1, 3.4, 9, 1.25, 0.3, 6, PAL.sofa);
      box(ctx, 0.1, 5.9, 9, 1.25, 0.3, 6, PAL.sofa);
      // Гості після бильців, інакше переднє бильце розрізає їх навпіл.
      if (this.visit) {
        // Герой на дивані поруч із лікарем — він сидить далі від нас, тож малюємо першим.
        if (this.visit.heroSofa && this.hero.sit > 0) {
          const from = P(SEAT_FRONT[0][0], SEAT_FRONT[0][1], 0).map(Math.round), to = P(SEATS[0][0], SEATS[0][1], 12).map(Math.round);
          this.drawSitter(ctx, this.hero, this.heroPal(), false, from, [to[0], to[1] - 1], false);
        }
        this.visit.friends.forEach((f) => {
          if (!(f.sit > 0) || f.floor) return;
          const from = P(f.front[0], f.front[1], 0).map(Math.round), to = P(f.seat[0], f.seat[1], 12).map(Math.round);
          this.drawSitter(ctx, f, f.pal, f.long, from, [to[0], to[1] - 1], false);
        });
      }
    }

    drawHero(ctx) {
      if (this.sleeping()) return; // він на дивані під ковдрою
      this.drawWalker(ctx, this.hero, this.heroPal());
    }

    // Ноші в ізометрії: рама з ручками, матрац, ти під синьою ковдрою, голова на подушці.
    drawStretcher(ctx, m0, m1) {
      const dx = m1.x - m0.x, dy = m1.y - m0.y, len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len, px = -uy, py = ux;          // уздовж і впоперек нош
      const cx = (m0.x + m1.x) / 2, cy = (m0.y + m1.y) / 2;
      const L = 0.62, Wd = 0.24, Z = 7;                              // половина довжини, половина ширини, висота
      const pt = (a, b, z) => P(cx + ux * a + px * b, cy + uy * a + py * b, z);
      const quad = (a0, a1, b0, b1, z, col) => poly(ctx, [pt(a0, b0, z), pt(a1, b0, z), pt(a1, b1, z), pt(a0, b1, z)], col);
      // Ручки й рама.
      for (const b of [-Wd, Wd]) { const p0 = pt(-L - 0.18, b, Z), p1 = pt(L + 0.18, b, Z); line(ctx, p0[0], p0[1], p1[0], p1[1], '#3a3d45'); line(ctx, p0[0], p0[1] + 1, p1[0], p1[1] + 1, '#2a2d33'); }
      // Бокова стінка матраца й верх.
      poly(ctx, [pt(-L, Wd, Z - 1), pt(L, Wd, Z - 1), pt(L, Wd, Z + 1), pt(-L, Wd, Z + 1)], '#b9c2cc');
      quad(-L, L, -Wd, Wd, Z + 1, '#e8ecef');
      // Ковдра: від ніг до грудей, з горбиком тіла.
      quad(-L + 0.05, L - 0.28, -Wd + 0.04, Wd - 0.04, Z + 2, '#5f86b8');
      quad(-L + 0.2, L - 0.4, -Wd + 0.08, Wd - 0.08, Z + 3, '#7aa0cf');
      // Голова на подушці біля переднього краю.
      quad(L - 0.26, L - 0.04, -Wd + 0.06, Wd - 0.06, Z + 2, '#f3f4f2');
      // Герой: голова на подушці — лежить на ношах, а не стирчить угору; плечі над ковдрою.
      const hp = pt(L - 0.15, 0, Z + 2).map(Math.round), sp = pt(L - 0.34, 0, Z + 2).map(Math.round);
      ctx.fillStyle = PAL.hood; ctx.fillRect(sp[0] - 3, sp[1] - 1, 7, 2);                    // плечі в худі
      ctx.fillStyle = '#24160f'; ctx.fillRect(hp[0] - 3, hp[1] - 3, 7, 5);
      ctx.fillStyle = PAL.skin; ctx.fillRect(hp[0] - 2, hp[1] - 2, 5, 3);
      ctx.fillStyle = PAL.hair; ctx.fillRect(hp[0] - 2, hp[1] - 3, 5, 1);
      ctx.fillStyle = '#1d1d24'; ctx.fillRect(hp[0] - 1, hp[1] - 1, 1, 1); ctx.fillRect(hp[0] + 1, hp[1] - 1, 1, 1);   // заплющені очі
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
      spriteO(ctx, withShades(rows, pal), pal, fx - 4, y);
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
      const lamp = this.visit && this.visit.board ? 1 : this.lit.lamp;
      const lights = lamp > 0.02 ? [
        [...P(1.55, 0.4, 28), v.working ? 52 : 26, [0.8, 1.05, 1.05]],
        [...P(0.45, 0.35, 30), 30, [1.05, 0.95, 0.75]],
      ] : [];
      // Настолки: тепле коло світла над столиком — гірлянда/свічки.
      if (this.visit && this.visit.board) lights.push([...P(2.9, 4.8, 12), 46, [1.08, 1.02, 0.92]]);   // ледь тепле коло — без перебору
      const p = this.lit.pain;
      const strong = v.state === 'strong';
      const happy = !!(this.cut && this.cut.win && this.cut.bright);   // свято з добрим підсумком: тепло, яскраво, без тіні по краях
      const cozy = !!(this.visit && this.visit.board);   // настолки: лампове тепле світло
      // Біль звужує кадр: краї гаснуть дизерингом, кольори вицвітають.
      const r0 = happy ? 9 : 1.34 - p * 0.088 + (strong ? Math.sin(this.t * 1.7) * 0.035 : 0) - 0.2 * (root.PainFX ? root.PainFX.gloomOf(this.lit.joy) : 0);
      // Радість фарбує світ: мало радості — сіро й тьмяно, багато — соковито.
      const j = Math.max(0, Math.min(100, this.lit.joy)) / 100;
      // Нейтрально на 60 (старт): нижче сірішає, вище стає соковитішим.
      // Нижче 60 — похмурість (спільна крива з PainFX): вицвітає, темнішає, холоднішає, краї підступають.
      const gl = root.PainFX ? root.PainFX.gloomOf(this.lit.joy) : 0;
      const sat = happy ? 1.35 : (1 - Math.max(0, p - 3) * 0.07) * (gl > 0 ? 1 - 0.85 * gl : Math.min(1.25, 0.4 + j));
      const bright = happy ? 1.16 : gl > 0 ? 1 - 0.4 * gl : Math.min(1.04, 0.85 + 0.25 * j);
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
          r *= mr * bright * coolR * (happy ? 1.08 : cozy ? 1.04 : 1); g *= mg * bright * (happy ? 1.03 : cozy ? 1.0 : 1); b *= mb * bright * coolB * (happy ? 0.9 : cozy ? 0.94 : 1);
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
      if (this.cut && this.cut.win) {
        for (const p of this.cut.confetti) {
          ctx.fillStyle = p.col;
          ctx.fillRect(Math.round(p.x * W + Math.sin(p.w) * 3), Math.round(p.y * H), Math.sin(p.w * 1.3) > 0 ? 2 : 1, 2);
        }
        const d = null;
        if (d && d.anchor) {
          const open = Math.floor(this.t * 6) % 2;
          ctx.fillStyle = '#e0ac84';
          ctx.fillRect(d.anchor[0] - 4 - (open ? 2 : 0), d.anchor[1] - 6, 3, 4);
          ctx.fillRect(d.anchor[0] + 1 + (open ? 2 : 0), d.anchor[1] - 6, 3, 4);
          if (!open) { ctx.fillStyle = '#f2d36b'; ctx.fillRect(d.anchor[0] - 1, d.anchor[1] - 10, 1, 2); ctx.fillRect(d.anchor[0] - 4, d.anchor[1] - 9, 1, 1); ctx.fillRect(d.anchor[0] + 3, d.anchor[1] - 9, 1, 1); }
        }
      }
      // Знеболювальне: туман у голові — легке двоїння й засвіт, кімната трохи «пливе». Лише картинка.
      if (this.view.painkiller && !this.cut) {
        const t = this.t, dx = Math.round(1 + Math.sin(t * 0.9)), dy = Math.round(Math.sin(t * 0.6) * 0.8);
        ctx.save();
        ctx.globalAlpha = 0.22; ctx.drawImage(ctx.canvas, dx, dy);
        ctx.globalAlpha = 1;
        const gl = ctx.createRadialGradient(W * 0.62, H * 0.2, 0, W * 0.62, H * 0.2, W * 0.75);
        gl.addColorStop(0, 'rgba(255,248,230,' + (0.16 + Math.sin(t * 1.3) * 0.03).toFixed(3) + ')');
        gl.addColorStop(1, 'rgba(255,248,230,0)');
        ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
      if (this.cut && this.cut.whiteout) {
        ctx.fillStyle = 'rgba(255,250,236,' + (this.cut.whiteout * 0.92) + ')';
        ctx.fillRect(0, 0, W, H);
      }
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
