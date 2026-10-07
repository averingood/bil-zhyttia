// Готування від першої особи: рецепт на холодильнику, потім — вибрати продукти.
// Біль може накрити частину записки, як ключове слово на планерці: що з'їло ядро, доводиться
// згадувати чи вгадувати. Від промахів залежить лише смак (радість), поїсти вдається завжди.
// Про правила гри не знає: повертає { misses } — скільки зайвих продуктів поклав.
(function (root) {
  'use strict';
  const C = root.GAME_CONFIG;
  const W = 412, H = 344, LW = 206, LH = 172;
  const NOTE_SECONDS = 4.5;
  const rnd = (n) => Math.floor(Math.random() * n);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  const RECIPES = [
    ['Суп', ['картопля', 'морква', 'цибуля', 'лавровий лист']],
    ['Гречка з овочами', ['гречка', 'морква', 'цибуля', 'олія']],
    ['Омлет', ['яйця', 'молоко', 'сир', 'зелень']],
    ['Салат', ['огірок', 'помідор', 'цибуля', 'олія']],
    ['Макарони з сиром', ['макарони', 'сир', 'масло', 'перець']],
    ['Борщ', ['буряк', 'капуста', 'картопля', 'морква']],
  ];
  const ALL = [...new Set(RECIPES.flatMap((r) => r[1]).concat(['рис', 'часник', 'квасоля', 'гриби']))];
  // Колір продукту в каструлі — щоб у кадрі було видно, що кладеш.
  const COL = { 'картопля': '#d9b26a', 'морква': '#e07a2a', 'цибуля': '#e8dcc0', 'лавровий лист': '#5c7a45', 'гречка': '#7a5236',
    'олія': '#e8c25a', 'яйця': '#f3ead6', 'молоко': '#f6f6f2', 'сир': '#f0c850', 'зелень': '#5c9a55', 'огірок': '#4f8a45', 'помідор': '#c0392b',
    'макарони': '#eed48a', 'масло': '#f5e08a', 'перець': '#3a3a3a', 'буряк': '#8a2846', 'капуста': '#b8d898', 'рис': '#f3f0e6',
    'часник': '#ece6d6', 'квасоля': '#8a3a2a', 'гриби': '#a07a5a' };

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
  // Стільниця з каструлею: продукти падають у воду.
  function drawStove(t, picked) {
    R(0, 0, LW, 46, '#d9d4c7');
    for (let y = 7; y < 46; y += 8) R(0, y, LW, 1, '#c4bfb2');
    R(0, 46, LW, LH - 46, '#aeb4ba'); R(0, 46, LW, 3, '#c9ced3');
    R(40, 120, 126, 40, '#2a2c33'); R(52, 150, 102, 6, '#3a3d45');            // плита
    R(56, 70, 94, 64, '#5f6670'); R(56, 70, 94, 6, '#7d858f'); R(44, 82, 12, 5, '#3a3d45'); R(150, 82, 12, 5, '#3a3d45');
    R(62, 76, 82, 18, '#3e6f88');                                            // вода
    picked.forEach((name, i) => R(68 + i * 18 + Math.round(Math.sin(t * 2 + i) * 2), 80 + (i % 2) * 5, 10, 7, COL[name] || '#d9b26a'));
    for (let i = 0; i < 4; i++) R(70 + i * 20 + Math.round(Math.sin(t * 2.4 + i) * 2), 60 - ((t * 6 + i * 3) % 14 | 0), 2, 5, 'rgba(255,255,255,0.5)');
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

    const [title, need] = RECIPES[rnd(RECIPES.length)];
    const options = shuffle(need.concat(shuffle(ALL.filter((x) => !need.includes(x))).slice(0, 4)));
    const now = () => performance.now() / 1000;
    const noteFrom = now() + 0.4, noteEnd = noteFrom + NOTE_SECONDS;
    // Біль на записці: ядро встигає вирости й тримається до кінця показу — закрите вже не повернеться.
    const A = C.actions.cook;
    const glitch = Math.random() < Math.max(A.minCover, C.painCover[o.state] || 0)
      ? { start: noteFrom + 1.2 + Math.random() * 1.4, end: noteEnd + 0.2 } : null;
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
      $q('#scCount').textContent = 'обери ' + need.length + ' продукти';
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
      $q('.cook-opts').innerHTML = '';
      msg(misses === 0 ? 'Смачно. Саме те, що треба.' : misses === 1 ? 'Нормально. Чогось бракує, але їсти можна.' : 'Їстівно, але зовсім не те. «' + title + '» мав бути інакшим.',
        misses === 0 ? 'good' : misses === 1 ? '' : 'bad');
      setTimeout(() => close(misses), 1300);
    }

    const kd = (e) => {
      if (mode === 'pick' && /^Digit[1-8]$/.test(e.code)) { e.preventDefault(); e.stopPropagation(); toggle(Number(e.code.slice(5)) - 1); return; }
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
      if (mode === 'note') drawFridge(); else drawStove(t, picked);
      g.imageSmoothingEnabled = false;
      g.drawImage(low, 0, 0, W, H);
      if (mode === 'note') {
        // Записка: назва й продукти. Рядки лівим краєм — біль з'їдає середину, щось видно збоку.
        g.textBaseline = 'top'; g.fillStyle = '#3a2f22';
        g.font = '24px Handjet'; g.fillText(title + ':', 118, 96);
        g.font = '22px Handjet';
        need.forEach((name, i) => g.fillText('— ' + name, 118, 132 + i * 32));
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
