// ЛФК на килимку від першої особи: повтор рухів за тренером.
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

  // Дизеринг 2×2 — та сама піксельна мова, що й у кімнаті.
  const dith = (x, y) => ((x + y) & 1) === 0;

  function drawScene(t, coach) {
    // Стіна з легким візерунком і вечірнім вікном.
    R(0, 0, LW, 50, '#2f5b57');
    for (let y = 1; y < 48; y += 3) for (let x = (y % 2) * 2; x < LW; x += 5) R(x, y, 1, 1, '#356360');
    R(14, 6, 44, 34, '#1f2a33'); R(16, 8, 40, 30, '#e9b97a'); R(16, 8, 40, 12, '#f3cf95');
    R(16, 26, 9, 12, '#3a4458'); R(27, 22, 7, 16, '#435069'); R(36, 28, 10, 10, '#3a4458'); R(47, 24, 8, 14, '#435069');
    R(35, 8, 2, 30, '#1f2a33'); R(16, 22, 40, 2, '#1f2a33');
    R(12, 40, 48, 3, '#d8cbb0');                                      // підвіконня
    R(150, 10, 34, 26, '#1d1d24'); R(152, 12, 30, 22, '#c9c3a8');     // картина
    for (let i = 0; i < 6; i++) R(156 + i * 4, 28 - i * 2, 4, 2 + i * 2, i % 2 ? '#7a8f6a' : '#5f7a8a');
    R(120, 38, 6, 6, '#e6e8ea'); R(122, 40, 1, 2, '#555'); R(124, 40, 1, 2, '#555');   // розетка
    R(0, 48, LW, 4, '#5a3a26'); R(0, 48, LW, 1, '#7a5236');
    // Підлога: дошки сходяться до точки над кадром.
    R(0, 52, LW, LH - 52, '#6b4a32');
    for (let k = -8; k <= 8; k++) {
      const xb = 103 + k * 26;
      for (let y = 52; y < LH; y++) { const f = (y + 40) / (LH + 40); R(Math.round(103 + (xb - 103) * f), y, 1, 1, '#5c3f2a'); }
    }
    for (let y = 56, k = 0; y < LH; k++, y += 5 + k * 1.4) R(0, Math.round(y), LW, 1, '#5f412c');
    // Килимок: трапеція зі смугами, світлий кант і згорнутий кінець біля стіни.
    for (let y = 58; y < LH; y++) {
      const f = (y - 58) / (LH - 58), half = 24 + f * 66;
      const stripe = Math.floor((y - 58) / (4 + f * 6)) % 2;
      R(103 - half, y, half * 2, 1, stripe ? '#3d4d7a' : '#42548a');
      R(103 - half, y, 2, 1, '#5b6ea6'); R(103 + half - 2, y, 2, 1, '#2c3860');
    }
    R(78, 52, 50, 7, '#33416a'); R(78, 52, 50, 2, '#5b6ea6'); R(78, 58, 50, 1, '#232d4a');
    // Пляшка води й рушник поруч.
    R(170, 70, 7, 16, '#9fd0e0'); R(170, 70, 7, 3, '#e6e8ea'); R(171, 74, 2, 10, '#c8ecf6');
    R(14, 92, 30, 10, '#c4842f'); R(14, 92, 30, 2, '#dfa457'); for (let x = 16; x < 44; x += 4) R(x, 101, 2, 2, '#a86a22');
    R(150, 66, 4, 9, '#26282e'); R(154, 69, 10, 3, '#4a4d55'); R(164, 66, 4, 9, '#26282e');
    // Тінь під телефоном і руками.
    for (let y = 158; y < 164; y++) for (let x = 60; x < 146; x++) if (dith(x, y)) R(x, y, 1, 1, 'rgba(15,17,30,0.55)');
    // Телефон на підставці, з тренером угорі екрана.
    // Телефон лежить боком: широкий екран, щоб уся серія стрілок уміщалась.
    R(70, 152, 66, 6, '#2a2c33');
    R(60, 102, 86, 54, '#15161b'); R(62, 104, 82, 50, '#22242b');
    R(65, 106, 76, 44, '#cfe0dc'); R(61, 127, 1, 4, '#3a3d45');
    const bob = Math.round(Math.sin(t * 3) * 1);
    if (coach) R(130, 109 + bob, 4, 4, '#c48b67'); if (coach) { R(129, 113 + bob, 6, 6, '#2f8f9a'); R(129, 119, 2, 4, '#26282e'); R(133, 119, 2, 4, '#26282e'); }
    // Руки: передпліччя в рукавах із тінню, кисті з пальцями. Ледь «дихають».
    const br = Math.round(Math.sin(t * 1.6) * 0.8);
    for (const [x0, dir] of [[26, 1], [152, -1]]) {   // руки ширше, щоб не закривати екран
      R(x0, 132 + br, 30, LH - 132, '#2d4763'); R(x0 + (dir > 0 ? 24 : 0), 132 + br, 6, LH - 132, '#243a52');
      R(x0 + 2, 132 + br, 26, 3, '#3a5a7c'); R(x0, 128 + br, 30, 5, '#3a5a7c');
      const hx = x0 + 3 + dir * 2;
      R(hx, 116 + br, 24, 14, '#e0ac84'); R(hx, 126 + br, 24, 4, '#c48b67');
      for (let k = 0; k < 4; k++) { R(hx + 1 + k * 6, 111 + br + (k === 0 || k === 3 ? 2 : 0), 4, 6, '#e0ac84'); R(hx + 1 + k * 6, 116 + br, 4, 1, '#c48b67'); }
      R(dir > 0 ? hx + 22 : hx - 4, 120 + br, 6, 5, '#e0ac84');    // великий палець
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

    o.bar.innerHTML = `<div class="sc-head"><span class="ab-zone">ЛФК</span><span class="ab-meta" id="scCount"></span></div>
      <div class="sc-bar"><div class="sc-timer" hidden><i></i></div><span class="mat-input"></span></div>
      <div class="sc-answers mat-keys">${ARR.map((a, i) => `<button class="ans mat-arrow" type="button" data-a="${i}" style="grid-area:${['l', 'u', 'r', 'd'][i]}" disabled><kbd>${a}</kbd>${['ліво', 'вгору', 'право', 'вниз'][i]}</button>`).join('')}</div>
      <p class="sc-msg">Дивись на телефон: тренер показує рухи.</p>`;
    // Плашка-пояснення поверх сцени: що робити на ЛФК. Тримається весь перший підхід.
    const hint = document.createElement('div');
    hint.className = 'mat-hint';
    hint.innerHTML = '<b>Як робити ЛФК</b>1. Тренер на екрані телефона показує рухи — стрілки по черзі.<br>2. Запам’ятай порядок.<br>3. Повтори його: клавіші ← ↑ → ↓ або кнопки внизу.';
    el.appendChild(hint);
    fit();
    const $q = (sel) => o.bar.querySelector(sel);
    const now = () => performance.now() / 1000;
    const STEP = M.step;

    let round = 0, right = 0, total = 0, seq = [], input = [], mode = 'show', showFrom = 0, glitch = null, done = false, inputAt = 0;

    function msg(text, cls) { const m = $q('.sc-msg'); m.className = 'sc-msg ' + (cls || ''); m.textContent = text; }
    function setButtons(on) { o.bar.querySelectorAll('.mat-arrow').forEach((b) => { b.disabled = !on; }); }
    function newRound() {
      if (round > 0 && hint.parentNode) hint.remove();   // далі гравець уже знає
      seq = Array.from({ length: M.series[round] }, () => rnd(4));
      input = []; mode = 'show'; showFrom = now() + root.PainFX.LEAD * 0.6; glitch = null;
      // Щонайбільше одна стрілка: короткий спалах рівно на її показ.
      // Не на останню стрілку: інакше спад болю тягнеться в «повтори» і здається, що біль запізнився.
      if (Math.random() < (M.spike[o.state] || 0)) {
        const k = rnd(seq.length - 1);
        glitch = { start: showFrom + k * STEP - 0.05, end: showFrom + k * STEP + STEP * 0.75, grow: M.grow };
      }
      $q('#scCount').textContent = 'серія ' + (round + 1) + ' з ' + M.series.length + ' · дивись';
      $q('.mat-input').textContent = '';
      setButtons(false);
    }
    function press(a) {
      if (done || mode !== 'input') return;
      input.push(a);
      $q('.mat-input').textContent = input.map((v) => (v < 0 ? '×' : ARR[v])).join(' ');
      if (input.length < seq.length) return;
      $q('.sc-timer').hidden = true;
      const ok = input.filter((v, i) => v === seq[i]).length;
      right += ok; total += seq.length; mode = 'wait'; setButtons(false);
      msg('Серія ' + (round + 1) + ': зараховано ' + ok + ' з ' + seq.length +
        (ok === seq.length ? '. Чисто!' : ok ? '. Кожен рух іде в залік.' : '. Нічого, буває.'), ok ? 'good' : '');
      setTimeout(() => {
        if (done || closed) return;
        round++;
        if (round < M.series.length) newRound(); else finish();
      }, 1200);
    }
    function finish() {
      done = true;
      $q('#scCount').textContent = '';
      $q('.sc-answers').innerHTML = '';
      const share = total ? right / total : 0;
      const E = C.actions.exercise;
      const q = share >= M.reliefShare ? 'Тіло +' + E.body + ', біль −' + E.reliefToday + ' сьогодні й −' + E.reliefNext + ' завтра.' : share >= M.baseShare ? 'частково: Тіло +' + E.partialBody + ', без полегшення потім.' : 'замало — не зараховано, але й гірше не стало.';
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
    // «Пропустити»: ui може закрити сцену — результат тоді рахується автоматично.
    if (o.registerAbort) o.registerAbort(() => close());
    function close() {
      if (closed) return;
      closed = true; cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd, true);
      if (ro) ro.disconnect();
      el.remove(); o.bar.innerHTML = '';
      o.onDone({ right, total });
    }

    function frame() {
      if (closed) return;   // сцену закрили («Пропустити») — кадр, що вже стояв у черзі, нічого не малює
      fit();
      const t = now();
      if (mode === 'input') {
        // Таймер на повтор: не встиг — решта рухів серії мимо.
        const left = M.inputSeconds - (t - inputAt);
        $q('.sc-timer i').style.width = Math.max(0, left / M.inputSeconds * 100) + '%';
        if (left <= 0) { while (input.length < seq.length - 1) input.push(-1); press(-1); }
      }
      if (mode === 'show' && t > showFrom + seq.length * STEP + 0.3) {
        mode = 'input'; setButtons(true); inputAt = t; $q('.sc-timer').hidden = false;
        $q('#scCount').textContent = 'серія ' + (round + 1) + ' з ' + M.series.length + ' · повтори';
        msg('Повтори рухи стрілками, по черзі.', '');
      }
      lg.clearRect(0, 0, LW, LH);
      drawScene(t, mode === 'show');   // тренер на екрані, лише поки показує
      g.imageSmoothingEnabled = false;
      g.drawImage(low, 0, 0, W, H);
      // Екран телефона: стрілки тренера або те, що вже повторив.
      const px = 65 * 2, py = 106 * 2;
      g.textBaseline = 'top';
      if (mode === 'show' && t > showFrom) {
        const i = Math.floor((t - showFrom) / STEP);
        if (i < seq.length && (t - showFrom) % STEP < STEP * 0.75) {
          g.font = '56px Handjet'; g.fillStyle = '#15161b'; g.fillText(ARR[seq[i]], px + 58, py + 18);
        }
        g.font = '16px Handjet'; g.fillStyle = '#3a4048'; g.fillText((Math.min(i, seq.length - 1) + 1) + '/' + seq.length, px + 6, py + 4);
      } else if (mode === 'input' || mode === 'wait') {
        g.font = '16px Handjet'; g.fillStyle = '#3a4048'; g.fillText('твоя черга', px + 8, py + 4);
        g.font = '22px Handjet'; g.fillStyle = '#15161b'; g.fillText(input.map((v) => (v < 0 ? '×' : ARR[v])).join(' '), px + 10, py + 34);
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
