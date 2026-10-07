// Вправи на килимку від першої особи: «Слухай тіло».
// Повтор — утримувати пробіл, поки заповнюється смужка. Іноді посеред повтору
// спалахує біль (ядро розростається знизу) — тоді треба відпустити. Дотиснути
// крізь біль — перестаратися. Про правила гри не знає: повертає { reps, strain }.
(function (root) {
  'use strict';
  const C = root.GAME_CONFIG;
  const W = 412, H = 344, LW = 206, LH = 172;
  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rnd(a.length)];

  // ---------- кадр: стіна, підлога, килимок, телефон з відео, руки ----------
  const low = document.createElement('canvas'); low.width = LW; low.height = LH;
  const lg = low.getContext('2d');
  const R = (x, y, w, h, c) => { lg.fillStyle = c; lg.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

  function drawScene(t, push, strained) {
    // Стіна і плінтус.
    R(0, 0, LW, 46, '#2f5b57');
    for (let y = 2; y < 44; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < LW; x += 4) R(x, y, 1, 1, '#356360');
    R(0, 44, LW, 3, '#5a3a26');
    // Підлога: дошки, що тікають до стіни.
    R(0, 47, LW, LH - 47, '#6b4a32');
    for (let k = 0, y = 50; y < LH; k++, y += 4 + k * 1.6) R(0, y, LW, 1, '#5c3f2a');
    // Килимок: трапеція від стіни до глядача.
    for (let y = 52; y < LH; y++) {
      const f = (y - 52) / (LH - 52), half = 22 + f * 64;
      R(103 - half, y, half * 2, 1, y % 7 === 0 ? '#36456f' : '#3d4d7a');
      R(103 - half, y, 2, 1, '#2c3860'); R(103 + half - 2, y, 2, 1, '#2c3860');
    }
    // Гантелі праворуч від килимка.
    R(150, 60, 4, 8, '#26282e'); R(154, 63, 10, 2, '#4a4d55'); R(164, 60, 4, 8, '#26282e');
    // Телефон, що спирається на стіну, з відео фізіотерапевта.
    R(86, 12, 34, 44, '#15161b'); R(88, 14, 30, 38, '#cfe0dc');
    const loop = (Math.sin(t * 2.4) + 1) / 2;            // тренер у відео повільно повторює рух
    R(100, 40 - Math.round(loop * 4), 6, 6, '#c48b67');   // голова
    R(98, 46 - Math.round(loop * 4), 10, 4, '#2f8f9a');   // спина
    R(96, 49, 3, 3, '#2f8f9a'); R(107, 49, 3, 3, '#2f8f9a');
    R(88, 17, 30, 1, '#b4c9c4');
    // Руки на килимку: передпліччя з рукавами худі. Тиснуть, коли тримаєш повтор.
    const dy = Math.round(push * 5), shake = strained ? Math.round(Math.sin(t * 40)) : 0;
    for (const [x0, dir] of [[50, 1], [128, -1]]) {
      const x = x0 + shake;
      R(x, 128 - dy, 28, LH - 128 + dy, '#2d4763');                     // рукав
      R(x + 2, 128 - dy, 24, 3, '#3a5a7c');
      R(x + 4 + dir * 2, 116 - dy, 20, 14, '#e0ac84');                  // кисть
      R(x + 4 + dir * 2, 116 - dy, 20, 2, '#c48b67');
      for (let k = 0; k < 4; k++) R(x + 6 + dir * 2 + k * 5, 114 - dy, 3, 3, '#e0ac84');
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
      <div class="sc-bar"><div class="sc-timer"><i style="width:0%"></i></div><span class="sc-repeat"></span></div>
      <div class="sc-answers"><button class="ans primary mat-hold" type="button"><kbd>Пробіл</kbd>Тримати повтор</button>
        <p class="mat-tip">Тримай, поки смужка не заповниться. Спалахнув біль — відпускай.</p></div>
      <p class="sc-msg"></p>`;
    fit();
    const $q = (sel) => o.bar.querySelector(sel);
    const now = () => performance.now() / 1000;

    let rep = 0, reps = 0, strain = 0, done = false;
    // cur: { holding, holdStart, spikeAt, readyAt, over }
    let cur = null, glitch = null, strainedUntil = 0;
    const chance = M.spike[o.state] || 0;

    function next() {
      if (rep >= M.reps) { finish(); return; }
      cur = { holding: false, holdStart: 0, spikeAt: null, readyAt: now(), over: false, spike: Math.random() < chance };
      glitch = null;
      $q('#scCount').textContent = 'повтор ' + (rep + 1) + ' з ' + M.reps;
      $q('.sc-timer i').style.width = '0%';
    }
    function msg(text, cls) { const m = $q('.sc-msg'); m.className = 'sc-msg ' + (cls || ''); m.textContent = text; }
    function endRep(text, cls) {
      cur.over = true; cur.holding = false; rep++;
      msg(text + ' Зараховано ' + reps + ' з ' + M.reps + '.', cls);
      setTimeout(() => { if (!done) next(); }, 700);
    }

    function press() {
      if (done || !cur || cur.over || cur.holding) return;
      cur.holding = true; cur.holdStart = now();
      if (cur.spike) {
        // Ядро починає рости трохи після початку повтору і накриває до кінця смужки.
        cur.spikeAt = cur.holdStart + M.holdSeconds * (0.55 + Math.random() * 0.3);
        glitch = { start: cur.spikeAt, end: cur.spikeAt + 0.5 };
      }
    }
    function release() {
      if (done || !cur || cur.over || !cur.holding) return;
      const t = now();
      // Той самий підсумок, що й у кадрі: кадри бувають рідкими, а час — ні.
      if (cur.spikeAt && t >= cur.spikeAt) { strain++; strainedUntil = t + 0.8; endRep('Крізь біль — перестарався.', 'bad'); }
      else if (t - cur.holdStart >= M.holdSeconds) { reps++; endRep('Повтор є.', 'good'); }
      else if (cur.spikeAt && t > cur.spikeAt - 1.1) endRep('Відпустив вчасно: тіло подякує.', 'good');
      else endRep('Рано відпустив, повтор не вийшов.', '');
    }

    function finish() {
      done = true;
      $q('#scCount').textContent = '';
      $q('.sc-answers').innerHTML = '';
      const q = strain > 0 ? 'Перестарався: завтра болітиме більше.' : reps < M.minReps ? 'Замало повторів: вправи не зараховано.' : 'Вправи зараховано.';
      msg('Повторів ' + reps + ' з ' + M.reps + '. ' + q, strain > 0 || reps < M.minReps ? 'bad' : 'good');
      setTimeout(close, 500);
    }

    // Клавіші: пробіл тримати; Enter теж, бо пробіл буває зайнятий.
    const isHold = (e) => e.code === 'Space' || e.code === 'Enter';
    const kd = (e) => { if (!isHold(e)) return; e.preventDefault(); e.stopPropagation(); if (!e.repeat) press(); };
    const ku = (e) => { if (!isHold(e)) return; e.preventDefault(); e.stopPropagation(); release(); };
    window.addEventListener('keydown', kd, true);
    window.addEventListener('keyup', ku, true);
    const hb = $q('.mat-hold');
    hb.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
    window.addEventListener('pointerup', release);

    let closed = false, raf = 0;
    function close() {
      if (closed) return;
      closed = true; cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd, true);
      window.removeEventListener('keyup', ku, true);
      window.removeEventListener('pointerup', release);
      if (ro) ro.disconnect();
      el.remove(); o.bar.innerHTML = '';
      o.onDone({ reps, strain });
    }

    function frame() {
      fit();
      const t = now();
      let push = 0;
      if (cur && cur.holding) {
        const p = Math.min(1, (t - cur.holdStart) / M.holdSeconds);
        push = p;
        $q('.sc-timer i').style.width = Math.round(p * 100) + '%';
        if (cur.spikeAt && t >= cur.spikeAt) {
          strain++; strainedUntil = t + 0.8;
          endRep('Крізь біль — перестарався.', 'bad');
        } else if (p >= 1) { reps++; endRep('Повтор є.', 'good'); }
      } else if (cur && !cur.over && t - cur.readyAt > 8) endRep('Повтор пропущено.', '');
      lg.clearRect(0, 0, LW, LH);
      drawScene(t, push, t < strainedUntil);
      g.imageSmoothingEnabled = false;
      g.drawImage(low, 0, 0, W, H);
      root.PainFX.gloom(g, W, H, o.joy != null ? o.joy : 60);
      fx.draw(g, W, H, t, o.pain, glitch, o.painkiller);
      raf = requestAnimationFrame(frame);
    }
    setTimeout(next, root.PainFX.LEAD * 500);
    raf = requestAnimationFrame(frame);
  }

  root.MatGame = { start };
})(typeof globalThis !== 'undefined' ? globalThis : this);
