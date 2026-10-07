// Вправи на килимку від першої особи: повтор рухів за тренером.
// Тренер у телефоні показує послідовність стрілок, гравець повторює її клавішами.
// Кожен правильний рух іде в залік, помилки не караються: це підтримка, а не іспит.
// Біль коротким спалахом накриває щонайбільше одну стрілку в серії.
// Про правила гри не знає: повертає { right, total }.
(function (root) {
  'use strict';
  const C = root.GAME_CONFIG;
  const W = 412, H = 344, LW = 206, LH = 172;
  const rnd = (n) => Math.floor(Math.random() * n);
  const ARR = ['←', '↑', '→', '↓'], CODES = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'];

  // ---------- кадр: стіна, підлога, килимок, телефон між руками ----------
  const low = document.createElement('canvas'); low.width = LW; low.height = LH;
  const lg = low.getContext('2d');
  const R = (x, y, w, h, c) => { lg.fillStyle = c; lg.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

  function drawScene() {
    R(0, 0, LW, 46, '#2f5b57');
    for (let y = 2; y < 44; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < LW; x += 4) R(x, y, 1, 1, '#356360');
    R(0, 44, LW, 3, '#5a3a26');
    R(0, 47, LW, LH - 47, '#6b4a32');
    for (let k = 0, y = 50; y < LH; k++, y += 4 + k * 1.6) R(0, y, LW, 1, '#5c3f2a');
    for (let y = 52; y < LH; y++) {
      const f = (y - 52) / (LH - 52), half = 22 + f * 64;
      R(103 - half, y, half * 2, 1, y % 7 === 0 ? '#36456f' : '#3d4d7a');
      R(103 - half, y, 2, 1, '#2c3860'); R(103 + half - 2, y, 2, 1, '#2c3860');
    }
    R(150, 60, 4, 8, '#26282e'); R(154, 63, 10, 2, '#4a4d55'); R(164, 60, 4, 8, '#26282e');
    // Телефон лежить на килимку між руками — саме там, куди дістає ядро болю.
    R(78, 92, 50, 72, '#15161b'); R(81, 96, 44, 64, '#cfe0dc');
    for (const [x0, dir] of [[50, 1], [128, -1]]) {
      R(x0, 128, 28, LH - 128, '#2d4763'); R(x0 + 2, 128, 24, 3, '#3a5a7c');
      R(x0 + 4 + dir * 2, 116, 20, 14, '#e0ac84'); R(x0 + 4 + dir * 2, 116, 20, 2, '#c48b67');
      for (let k = 0; k < 4; k++) R(x0 + 6 + dir * 2 + k * 5, 114, 3, 3, '#e0ac84');
    }
  }

  // ---------- сцена ----------
  // o: { wrap, bar, pain, state, painkiller, joy, onDone }
  function start(o) {
    const M = C.actions.exercise.mat;
    const fx = root.PainFX.create();
    const el = document.createElement('div');
    el.className = 'scene';
    el.innerHTML = `<canvas width="${W}" height="${H}"></canvas>`;
    o.wrap.appendChild(el);
    const view = el.querySelector('canvas'), g = view.getContext('2d');
    g.imageSmoothingEnabled = false;
    // Як і в інших сценах: вписуємось у поле цілком.
    const fit = () => {
      const aw = o.wrap.clientWidth, ah = o.wrap.clientHeight;
      if (!aw || !ah) return;
      const k = Math.min(aw / W, ah / H), w = Math.round(W * k), h = Math.round(H * k);
      Object.assign(el.style, { left: Math.round((aw - w) / 2) + 'px', top: Math.round((ah - h) / 2) + 'px', width: w + 'px', height: h + 'px' });
    };
    const ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(o.wrap);

    o.bar.innerHTML = `<div class="sc-head"><span class="ab-zone">Вправи</span><span class="ab-meta" id="scCount"></span></div>
      <div class="sc-bar"><span class="mat-input"></span><span class="sc-repeat"></span></div>
      <div class="sc-answers">${ARR.map((a, i) => `<button class="ans mat-arrow" type="button" data-a="${i}" disabled><kbd>${a}</kbd>${['ліво', 'вгору', 'право', 'вниз'][i]}</button>`).join('')}</div>
      <p class="sc-msg">Дивись на телефон: тренер показує рухи.</p>`;
    fit();
    const $q = (sel) => o.bar.querySelector(sel);
    const now = () => performance.now() / 1000;
    const STEP = M.step;

    let round = 0, right = 0, total = 0, seq = [], input = [], mode = 'show', showFrom = 0, glitch = null, done = false;

    function msg(text, cls) { const m = $q('.sc-msg'); m.className = 'sc-msg ' + (cls || ''); m.textContent = text; }
    function setButtons(on) { o.bar.querySelectorAll('.mat-arrow').forEach((b) => { b.disabled = !on; }); }
    function newRound() {
      seq = Array.from({ length: M.series[round] }, () => rnd(4));
      input = []; mode = 'show'; showFrom = now() + root.PainFX.LEAD * 0.6; glitch = null;
      // Щонайбільше одна стрілка: короткий спалах рівно на її показ.
      if (Math.random() < (M.spike[o.state] || 0)) {
        const k = rnd(seq.length);
        glitch = { start: showFrom + k * STEP, end: showFrom + k * STEP + STEP * 0.75, grow: M.grow };
      }
      $q('#scCount').textContent = 'серія ' + (round + 1) + ' з ' + M.series.length + ' · дивись';
      $q('.mat-input').textContent = '';
      setButtons(false);
    }
    function press(a) {
      if (done || mode !== 'input') return;
      input.push(a);
      $q('.mat-input').textContent = input.map((v) => ARR[v]).join(' ');
      if (input.length < seq.length) return;
      const ok = input.filter((v, i) => v === seq[i]).length;
      right += ok; total += seq.length; mode = 'wait'; setButtons(false);
      msg('Серія ' + (round + 1) + ': зараховано ' + ok + ' з ' + seq.length +
        (ok === seq.length ? '. Чисто!' : ok ? '. Кожен рух іде в залік.' : '. Нічого, буває.'), ok ? 'good' : '');
      setTimeout(() => {
        if (done) return;
        round++;
        if (round < M.series.length) newRound(); else finish();
      }, 1200);
    }
    function finish() {
      done = true;
      $q('#scCount').textContent = '';
      $q('.sc-answers').innerHTML = '';
      const share = total ? right / total : 0;
      const q = share >= M.reliefShare ? 'завтра біль менший.' : share >= M.baseShare ? 'день іде до бази.' : 'цього разу не зараховано, але й гірше не стало.';
      msg('Зараховано рухів ' + right + ' з ' + total + ': ' + q, share >= M.baseShare ? 'good' : '');
      setTimeout(close, 500);
    }

    const kd = (e) => {
      const a = CODES.indexOf(e.code);
      if (a < 0) return;
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat) press(a);
    };
    window.addEventListener('keydown', kd, true);
    o.bar.querySelectorAll('.mat-arrow').forEach((b) => { b.onclick = () => press(Number(b.dataset.a)); });

    let closed = false, raf = 0;
    function close() {
      if (closed) return;
      closed = true; cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd, true);
      if (ro) ro.disconnect();
      el.remove(); o.bar.innerHTML = '';
      o.onDone({ right, total });
    }

    function frame() {
      fit();
      const t = now();
      if (mode === 'show' && t > showFrom + seq.length * STEP + 0.3) {
        mode = 'input'; setButtons(true);
        $q('#scCount').textContent = 'серія ' + (round + 1) + ' з ' + M.series.length + ' · повтори';
        msg('Повтори рухи стрілками, по черзі.', '');
      }
      lg.clearRect(0, 0, LW, LH);
      drawScene();
      g.imageSmoothingEnabled = false;
      g.drawImage(low, 0, 0, W, H);
      // Екран телефона: стрілки тренера або те, що вже повторив.
      const px = 81 * 2, py = 96 * 2;
      g.textBaseline = 'top';
      if (mode === 'show' && t > showFrom) {
        const i = Math.floor((t - showFrom) / STEP);
        if (i < seq.length && (t - showFrom) % STEP < STEP * 0.75) {
          g.font = '56px Handjet'; g.fillStyle = '#15161b'; g.fillText(ARR[seq[i]], px + 26, py + 30);
        }
        g.font = '16px Handjet'; g.fillStyle = '#3a4048'; g.fillText((Math.min(i, seq.length - 1) + 1) + '/' + seq.length, px + 6, py + 4);
      } else if (mode === 'input' || mode === 'wait') {
        g.font = '16px Handjet'; g.fillStyle = '#3a4048'; g.fillText('твоя черга', px + 10, py + 6);
        g.font = '22px Handjet'; g.fillStyle = '#15161b'; g.fillText(input.map((v) => ARR[v]).join(' '), px + 8, py + 50);
      }
      root.PainFX.gloom(g, W, H, o.joy != null ? o.joy : 60);
      fx.draw(g, W, H, t, o.pain, glitch, o.painkiller);
      raf = requestAnimationFrame(frame);
    }
    newRound();
    raf = requestAnimationFrame(frame);
  }

  root.MatGame = { start };
})(typeof globalThis !== 'undefined' ? globalThis : this);
