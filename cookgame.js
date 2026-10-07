// Готування від першої особи: дошка, овочі, ніж — п'ять разів нарізати.
// Механіки майже немає, сцена для того, щоб показати: від першої особи біль є завжди.
// Хвилі не зникають, а час від часу коротко спалахує ядро — руки на мить зупиняються.
(function (root) {
  'use strict';
  const W = 412, H = 344, LW = 206, LH = 172;
  const CHOPS = 5;

  const low = document.createElement('canvas'); low.width = LW; low.height = LH;
  const lg = low.getContext('2d');
  const R = (x, y, w, h, c) => { lg.fillStyle = c; lg.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

  // chops — скільки вже нарізано; knife — 0..1, де 1 — ніж унизу.
  function drawScene(t, chops, knife) {
    // Плитка над стільницею й сама стільниця.
    R(0, 0, LW, 40, '#d9d4c7');
    for (let y = 0; y < 40; y += 8) for (let x = (y / 8) % 2 ? 6 : 0; x < LW; x += 12) R(x, y, 1, 8, '#c4bfb2');
    for (let y = 7; y < 40; y += 8) R(0, y, LW, 1, '#c4bfb2');
    R(0, 40, LW, LH - 40, '#aeb4ba'); R(0, 40, LW, 3, '#c9ced3');
    for (let x = 0; x < LW; x += 3) if ((x * 7) % 11 < 2) R(x, 50 + (x * 13) % 100, 1, 1, '#9aa1a8');
    // Каструля на плиті позаду, з парою.
    R(146, 18, 46, 26, '#5f6670'); R(146, 18, 46, 4, '#7d858f'); R(140, 24, 6, 3, '#3a3d45'); R(192, 24, 6, 3, '#3a3d45');
    for (let i = 0; i < 3; i++) R(156 + i * 11 + Math.round(Math.sin(t * 2 + i) * 2), 10 - ((t * 5 + i * 2) % 6 | 0), 2, 4, 'rgba(255,255,255,0.55)');
    // Дошка.
    R(30, 62, 132, 86, '#7a5236'); R(32, 64, 128, 82, '#b88a52'); R(32, 64, 128, 3, '#d0a46a');
    for (let y = 70; y < 146; y += 9) R(34, y, 124, 1, '#a87a44');
    // Морквина: ціла частина справа, нарізані кружальця зліва.
    const left = 60 + chops * 9;
    R(left, 96, 150 - left - 30, 12, '#e07a2a'); R(left, 96, 150 - left - 30, 3, '#f0a050');
    R(120, 92, 12, 6, '#5c9a55'); R(124, 88, 4, 6, '#3f7a45');
    for (let i = 0; i < chops; i++) {
      const cx = 82 + (i % 3) * 8, cy = 118 + Math.floor(i / 3) * 9 + (i % 2) * 2;   // купка в центрі: зліва її ховає рука з ножем
      R(cx, cy, 6, 6, '#e07a2a'); R(cx + 1, cy + 1, 4, 4, '#f0a050'); R(cx + 2, cy + 2, 2, 2, '#e07a2a');
    }
    // Ліва рука притримує морквину.
    R(118, 104, 30, 16, '#e0ac84'); R(118, 104, 30, 3, '#efc39c');
    for (let k = 0; k < 4; k++) R(116, 106 + k * 4, 4, 3, '#e0ac84');
    R(140, 118, 40, LH - 118, '#2d4763'); R(140, 118, 40, 4, '#3a5a7c');
    // Права рука з ножем: передпліччя навскіс від лівого нижнього кута, кисть тримає руків'я, лезо вниз до дошки.
    const ky = Math.round(78 + knife * 18), hx = left - 10, hy = ky - 30;
    for (let i = 0; i <= 12; i++) {
      const f = i / 12, x = hx - 6 - f * 50, y = hy + 8 + f * (LH - hy - 8);
      R(x, y, 24, 10, '#2d4763'); R(x, y, 24, 2, '#3a5a7c');
    }
    R(hx - 4, hy, 20, 14, '#e0ac84'); R(hx - 4, hy, 20, 3, '#efc39c');      // кисть
    R(hx + 2, hy - 6, 7, 10, '#2a2c33');                                   // руків'я
    R(hx + 4, hy + 12, 3, ky - hy - 4, '#c9ced3'); R(hx + 4, hy + 12, 1, ky - hy - 4, '#eef2f3');   // лезо
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

    o.bar.innerHTML = `<div class="sc-head"><span class="ab-zone">Готування</span><span class="ab-meta" id="scCount"></span></div>
      <div class="sc-bar"><span class="mat-input"></span><span class="sc-repeat"></span></div>
      <div class="sc-answers"><button class="ans primary cook-chop" type="button"><kbd>Пробіл</kbd>Нарізати</button></div>
      <p class="sc-msg">Щось просте: морква, картопля, суп.</p>`;
    fit();
    const $q = (sel) => o.bar.querySelector(sel);
    const now = () => performance.now() / 1000;
    let chops = 0, chopAt = -9, done = false, glitch = null;
    const count = () => { $q('#scCount').textContent = 'нарізано ' + chops + ' з ' + CHOPS; };
    count();

    // Біль тут нічого не забирає — просто є: хвилі весь час і короткі спалахи час від часу.
    // Спалахи створюються один раз: розмір ядра обирається на спалах, а не на кадр.
    const spikes = [];
    for (let i = 0; i < 2 + (o.state === 'strong' ? 2 : o.state === 'medium' ? 1 : 0); i++) {
      const st = now() + 1.2 + i * 2.2 + Math.random() * 1.2;
      spikes.push({ start: st, end: st + 0.5, grow: 0.3 });
    }

    function chop() {
      if (done || now() - chopAt < 0.3) return;
      if (glitch && now() > glitch.start - 0.2 && now() < glitch.end) {
        const m = $q('.sc-msg'); m.className = 'sc-msg'; m.textContent = 'Біль накотив — руки на мить завмерли.';
        return;
      }
      chopAt = now(); chops++;
      count();
      if (chops >= CHOPS) {
        done = true;
        $q('.sc-answers').innerHTML = '';
        const m = $q('.sc-msg'); m.className = 'sc-msg good'; m.textContent = 'Готово. Просто, але своє.';
        setTimeout(close, 900);
      }
    }
    const kd = (e) => {
      if (e.code !== 'Space' && e.code !== 'Enter') return;
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat) chop();
    };
    window.addEventListener('keydown', kd, true);
    $q('.cook-chop').onclick = chop;

    let closed = false, raf = 0;
    function close() {
      if (closed) return;
      closed = true; cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd, true);
      if (ro) ro.disconnect();
      el.remove(); o.bar.innerHTML = '';
      o.onDone({ chops });
    }
    function frame() {
      fit();
      const t = now();
      glitch = spikes.find((s) => t < s.end + 0.3) || null;
      const since = t - chopAt, knife = since < 0.12 ? since / 0.12 : since < 0.3 ? 1 - (since - 0.12) / 0.18 : 0;
      lg.clearRect(0, 0, LW, LH);
      drawScene(t, chops, Math.max(0, knife));
      g.imageSmoothingEnabled = false;
      g.drawImage(low, 0, 0, W, H);
      root.PainFX.gloom(g, W, H, o.joy != null ? o.joy : 60);
      // Від першої особи біль є завжди: навіть легкий день тут видно хвилями.
      fx.draw(g, W, H, t, Math.max(2, o.pain), glitch, o.painkiller);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }

  root.CookGame = { start };
})(typeof globalThis !== 'undefined' ? globalThis : this);
