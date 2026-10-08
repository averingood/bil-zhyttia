// Готування від першої особи: рецепт на холодильнику, потім — вибрати продукти.
// Біль може накрити частину записки, як ключове слово на планерці: що з'їло ядро, доводиться
// згадувати чи вгадувати. Від промахів залежить лише смак (Емоції), поїсти вдається завжди.
// Про правила гри не знає: повертає { misses } — скільки зайвих продуктів поклав.
(function (root) {
  'use strict';
  const C = root.GAME_CONFIG;
  const W = 412, H = 344, LW = 206, LH = 172;
  const NOTE_SECONDS = 3;   // глянути на записку — коротко, як у житті
  const rnd = (n) => Math.floor(Math.random() * n);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // Рецепт: назва, 5 продуктів і колір готової страви.
  const RECIPES = [
    ['Суп', ['картопля', 'морква', 'цибуля', 'лавровий лист', 'кріп'], '#e3c26a'],
    ['Гречка з овочами', ['гречка', 'морква', 'цибуля', 'олія', 'часник'], '#7a5236'],
    ['Омлет', ['яйця', 'молоко', 'сир', 'зелень', 'помідор'], '#f0d060'],
    ['Салат', ['огірок', 'помідор', 'цибуля', 'олія', 'кріп'], '#7ab060'],
    ['Макарони з сиром', ['макарони', 'сир', 'масло', 'перець', 'часник'], '#f0d890'],
    ['Борщ', ['буряк', 'капуста', 'картопля', 'морква', 'цибуля'], '#b8323a'],
  ];
  const ALL = [...new Set(RECIPES.flatMap((r) => r[1]).concat(['рис', 'часник', 'квасоля', 'гриби']))];
  // Колір продукту в каструлі — щоб у кадрі було видно, що кладеш.
  const COL = { 'картопля': '#d9b26a', 'морква': '#e07a2a', 'цибуля': '#e8dcc0', 'лавровий лист': '#5c7a45', 'гречка': '#7a5236',
    'олія': '#e8c25a', 'яйця': '#f3ead6', 'молоко': '#f6f6f2', 'сир': '#f0c850', 'зелень': '#5c9a55', 'огірок': '#4f8a45', 'помідор': '#c0392b',
    'макарони': '#eed48a', 'масло': '#f5e08a', 'перець': '#3a3a3a', 'буряк': '#8a2846', 'капуста': '#b8d898', 'рис': '#f3f0e6',
    'часник': '#ece6d6', 'квасоля': '#8a3a2a', 'гриби': '#a07a5a', 'кріп': '#6aa84f' };

  const low = document.createElement('canvas'); low.width = LW; low.height = LH;
  const lg = low.getContext('2d');
  const R = (x, y, w, h, c) => { lg.fillStyle = c; lg.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

  // Дверцята холодильника впритул: магніти й записка посередині, низько — там, куди дістає біль.
  function drawFridge() {
    R(0, 0, LW, LH, '#e6e8ea');
    for (let x = 0; x < LW; x += 7) R(x, 0, 1, LH, '#dcdfe2');
    R(0, 18, LW, 3, '#c9ced3'); R(186, 40, 6, 60, '#b5bcc3');                // шов і ручка
    R(20, 30, 10, 10, '#c0392b'); R(170, 120, 12, 8, '#2f8f9a'); R(28, 140, 9, 9, '#e8c25a');
    R(52, 40, 104, 124, '#f6efd9'); R(52, 40, 104, 3, '#ffffff'); R(150, 40, 6, 124, '#ece2c6');
    R(98, 34, 12, 10, '#d07a2c');                                            // магніт, що тримає записку
  }
  // Еліпс піксель за пікселем: вигляд трохи згори, тому каструля — овал, а не коло.
  function oval(cx, cy, rx, ry, col) {
    for (let y = -ry; y <= ry; y++) {
      const w = Math.round(rx * Math.sqrt(1 - (y * y) / (ry * ry)));
      R(cx - w, cy + y, w * 2 + 1, 1, col);
    }
  }
  const mixHex = (a, b, k) => { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b);
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join(''); };

  // Плита згори: каструля кипить, продукти кружляють, після варіння вода стає кольором страви.
  // cookK — 0..1, наскільки страва вже готова; dish — її колір.
  function drawStove(t, picked, cookK, dish) {
    // Стільниця з крапчастого каменю.
    R(0, 0, LW, LH, '#c9c4b8');
    for (let i = 0; i < 260; i++) { const x = (i * 73) % LW, y = (i * 37 + (i >> 3) * 11) % LH; R(x, y, 1, 1, i % 3 ? '#b5afa2' : '#ddd8cc'); }
    // Склокерамічна плита.
    R(20, 16, 166, 140, '#121317'); R(20, 16, 166, 2, '#2a2c33');
    oval(170, 30, 10, 7, '#1d1e24'); oval(170, 30, 7, 5, '#121317');   // друга конфорка, вимкнена
    // Розжарена конфорка під каструлею — помаранчеве кільце пульсує.
    const glow = 0.6 + Math.sin(t * 3) * 0.15;
    oval(103, 92, 66, 48, 'rgba(255,110,40,' + (0.25 * glow).toFixed(2) + ')');
    // Каструля: тінь, стінки, вода.
    oval(105, 98, 62, 45, 'rgba(0,0,0,0.35)');
    R(30, 86, 14, 8, '#4a4d55'); R(162, 86, 14, 8, '#4a4d55');           // ручки
    oval(103, 92, 60, 43, '#8a919a'); oval(103, 92, 56, 40, '#b5bcc3'); oval(103, 93, 52, 35, '#5f6670');
    const water = '#4f8fb0', base = cookK > 0 ? mixHex(water, dish, Math.min(1, cookK)) : water;
    oval(103, 94, 48, 31, base);
    oval(95, 87, 22, 9, mixHex(base, '#ffffff', 0.18));                    // відблиск
    // Продукти кружляють у воді.
    picked.forEach((name, i) => {
      const a = t * 0.6 + i * 1.3, x = 103 + Math.cos(a) * (20 + (i % 2) * 12), y = 94 + Math.sin(a) * (11 + (i % 2) * 6);
      R(x - 3, y - 2, 6, 4, COL[name] || '#d9b26a'); R(x - 3, y - 2, 6, 1, mixHex(COL[name] || '#d9b26a', '#ffffff', 0.3));
    });
    // Кипіння: бульбашки народжуються, ростуть і лопаються.
    for (let i = 0; i < 14; i++) {
      const life = (t * 1.4 + i * 0.37) % 1, seed = Math.floor(t * 1.4 + i * 0.37) * 31 + i * 17;
      const bx = 103 + ((seed * 13) % 80) - 40, by = 94 + ((seed * 7) % 50) - 25;
      if (((bx - 103) / 46) ** 2 + ((by - 94) / 29) ** 2 > 1) continue;
      const r = life < 0.8 ? 1 + Math.floor(life * 3) : 0;
      if (r) { R(bx - r, by - r, r * 2, r * 2, mixHex(base, '#ffffff', 0.45)); R(bx - r + 1, by - r + 1, Math.max(1, r * 2 - 2), Math.max(1, r * 2 - 2), mixHex(base, '#ffffff', 0.15)); }
      else R(bx - 2, by, 4, 1, mixHex(base, '#ffffff', 0.6));               // лопнула — бризки
    }
    // Пара над каструлею.
    for (let i = 0; i < 5; i++) {
      const k = (t * 0.5 + i * 0.2) % 1, x = 80 + i * 9 + Math.sin(t * 2 + i) * 4, y = 72 - k * 50;
      R(x, y, 3, 5, 'rgba(255,255,255,' + (0.45 * (1 - k)).toFixed(2) + ')');
    }
    // Дошка з ножем і сільничка поруч.
    R(4, 118, 30, 46, '#b88a52'); R(4, 118, 30, 2, '#d0a46a'); R(10, 124, 3, 30, '#c9ced3'); R(10, 150, 3, 8, '#2a2c33');
    R(184, 120, 10, 14, '#eef2f3'); R(184, 120, 10, 3, '#9aa1a8');
  }

  // o: { wrap, bar, pain, state, painkiller, joy, onDone }
  function start(o) {
    const fx = root.PainFX.create();
    const el = document.createElement('div');
    el.className = 'scene';
    el.innerHTML = `<canvas width="${W}" height="${H}"></canvas>`;
    o.wrap.appendChild(el);
    const view = el.querySelector('canvas'), g = view.getContext('2d');
    g.imageSmoothingEnabled = false;
    const fit = () => {
      const aw = o.wrap.clientWidth, ah = o.wrap.clientHeight;
      if (!aw || !ah) return;
      const k = Math.min(aw / W, ah / H), w = Math.round(W * k), h = Math.round(H * k);
      Object.assign(el.style, { left: Math.round((aw - w) / 2) + 'px', top: Math.round((ah - h) / 2) + 'px', width: w + 'px', height: h + 'px' });
    };
    const ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(o.wrap);

    const [title, need, dishCol] = RECIPES[rnd(RECIPES.length)];
    let cookedAt = 0, dish = dishCol;
    const options = shuffle(need.concat(shuffle(ALL.filter((x) => !need.includes(x))).slice(0, 4)));
    const now = () => performance.now() / 1000;
    const noteFrom = now() + 0.4, noteEnd = noteFrom + NOTE_SECONDS;
    // Біль на записці: ядро встигає вирости й тримається до кінця показу — закрите вже не повернеться.
    const A = C.actions.cook;
    const glitch = Math.random() < Math.max(A.minCover, C.painCover[o.state] || 0)
      ? { start: noteFrom + 0.7 + Math.random() * 1.0, end: noteEnd + 0.2 } : null;
    let mode = 'note', picked = [];

    o.bar.innerHTML = `<div class="sc-head"><span class="ab-zone">Готування</span><span class="ab-meta" id="scCount">запам’ятай рецепт</span></div>
      <div class="sc-bar"><div class="sc-timer"><i></i></div><span class="mat-input"></span></div>
      <div class="sc-answers cook-opts"></div>
      <p class="sc-msg">На холодильнику записка з рецептом.</p>`;
    fit();
    const $q = (sel) => o.bar.querySelector(sel);
    const msg = (t, cls) => { const m = $q('.sc-msg'); m.className = 'sc-msg ' + (cls || ''); m.textContent = t; };

    function toPick() {
      mode = 'pick';
      $q('.sc-timer').hidden = true;
      $q('#scCount').textContent = 'обери ' + need.length + ' продуктів';
      $q('.cook-opts').innerHTML = options.map((name, i) => `<button class="ans" type="button" data-i="${i}"><kbd>${i + 1}</kbd>${name}</button>`).join('') +
        `<button class="ans primary" type="button" id="cookGo" disabled><kbd>Enter</kbd>Варити</button>`;
      o.bar.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => toggle(Number(b.dataset.i)); });
      $q('#cookGo').onclick = cook;
      msg('Що там було в рецепті?', '');
    }
    function toggle(i) {
      if (mode !== 'pick') return;
      const name = options[i], at = picked.indexOf(name);
      if (at >= 0) picked.splice(at, 1);
      else if (picked.length < need.length) picked.push(name);
      o.bar.querySelectorAll('[data-i]').forEach((b) => { b.classList.toggle('right', picked.includes(options[Number(b.dataset.i)])); });
      $q('#cookGo').disabled = picked.length !== need.length;
      $q('.mat-input').textContent = picked.join(', ');
    }
    function cook() {
      if (mode !== 'pick' || picked.length !== need.length) return;
      mode = 'done';
      const misses = picked.filter((x) => !need.includes(x)).length;
      // Страва набирає свій колір; з промахами — каламутніший.
      cookedAt = now(); dish = misses >= 2 ? mixHex(dishCol, '#6b6052', 0.6) : misses === 1 ? mixHex(dishCol, '#8a8070', 0.3) : dishCol;
      $q('.cook-opts').innerHTML = '';
      msg(misses === 0 ? 'Смачно. Саме те, що треба.' : misses === 1 ? 'Нормально. Чогось бракує, але їсти можна.' : 'Їстівно, але зовсім не те. «' + title + '» мав бути інакшим.',
        misses === 0 ? 'good' : misses === 1 ? '' : 'bad');
      setTimeout(() => close(misses), 2200);
    }

    const kd = (e) => {
      if (mode === 'pick' && /^Digit[1-9]$/.test(e.code)) { e.preventDefault(); e.stopPropagation(); toggle(Number(e.code.slice(5)) - 1); return; }
      if (mode === 'pick' && e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); cook(); return; }
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('keydown', kd, true);

    let closed = false, raf = 0;
    function close(misses) {
      if (closed) return;
      closed = true; cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd, true);
      if (ro) ro.disconnect();
      el.remove(); o.bar.innerHTML = '';
      o.onDone({ misses: misses || 0 });
    }

    function frame() {
      fit();
      const t = now();
      lg.clearRect(0, 0, LW, LH);
      if (mode === 'note') {
        $q('.sc-timer i').style.width = Math.max(0, Math.min(1, (noteEnd - t) / NOTE_SECONDS)) * 100 + '%';
        if (t > noteEnd) toPick();
      }
      if (mode === 'note') drawFridge(); else drawStove(t, picked, cookedAt ? (t - cookedAt) / 1.2 : 0, dish);
      g.imageSmoothingEnabled = false;
      g.drawImage(low, 0, 0, W, H);
      if (mode === 'note') {
        // Записка: назва й продукти. Рядки лівим краєм — біль з'їдає середину, щось видно збоку.
        g.textBaseline = 'top'; g.fillStyle = '#3a2f22';
        g.font = '24px Handjet'; g.fillText(title + ':', 118, 92);
        g.font = '22px Handjet';
        need.forEach((name, i) => g.fillText('— ' + name, 118, 124 + i * 29));
      }
      root.PainFX.gloom(g, W, H, o.joy != null ? o.joy : 60);
      // Від першої особи біль є завжди — навіть у легкий день хвилі видно.
      fx.draw(g, W, H, t, Math.max(2, o.pain), mode === 'note' ? glitch : null, o.painkiller);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }

  root.CookGame = { start };
})(typeof globalThis !== 'undefined' ? globalThis : this);
