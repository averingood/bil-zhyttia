// Читання від першої особи: розгорнута книжка в руках, три перегортання сторінки.
// Механіки тут свідомо немає — це тиха пауза: біль лишається хвилями по краях,
// а гравцеві треба лише гортати. Повертає нічого, просто закінчується.
(function (root) {
  'use strict';
  const W = 412, H = 344, LW = 206, LH = 172;

  const low = document.createElement('canvas'); low.width = LW; low.height = LH;
  const lg = low.getContext('2d');
  const R = (x, y, w, h, c) => { lg.fillStyle = c; lg.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

  // Рядки тексту на сторінці — сірі смужки різної довжини, щоб не читати чужий текст.
  // bend — наскільки рядки вигинаються до корінця (сторінка не пласка).
  function lines(x, y, w, seed, bend, side, first) {
    let y0 = y;
    if (first) { R(x + w * 0.2, y0, w * 0.6, 3, '#6b5f4c'); y0 += 10; }        // назва розділу
    for (let i = 0; i < (first ? 11 : 13); i++) {
      const len = i === (first ? 10 : 12) ? w * 0.45 : w * (0.8 + ((seed * 7 + i * 13) % 18) / 100);
      const dy = Math.round(bend * (side < 0 ? 1 : 0));
      for (let px = 0; px < Math.min(w, len); px += 3) {
        const curve = Math.round(bend * Math.pow((side < 0 ? px / w : 1 - px / w), 3));
        R(x + px, y0 + i * 7 - curve + dy * 0, 3, 2, '#8f8676');
      }
    }
  }

  // Сторінка з вигином до корінця: верхній і нижній краї злегка заокруглені.
  function page(x, w, side, col, shade) {
    for (let px = 0; px < w; px++) {
      const k = side < 0 ? px / w : 1 - px / w;             // 0 біля краю, 1 біля корінця
      const lift = Math.round(5 * Math.pow(k, 3));
      R(x + px, 24 - lift + 4, 1, 124 + lift * 0.4, col);
      if (k > 0.9) R(x + px, 24 - lift + 4, 1, 124 + lift * 0.4, k > 0.96 ? shade : 'rgba(150,135,110,0.25)');   // тінь біля корінця
    }
  }

  // flip — 0..1: сторінка ліворуч переїжджає з правого боку.
  function drawScene(t, flip, pg) {
    // Плед на колінах: клітинка.
    R(0, 0, LW, LH, '#5a3a40');
    for (let y = 0; y < LH; y += 16) R(0, y, LW, 5, '#6e4650');
    for (let x = 0; x < LW; x += 16) R(x, 0, 5, LH, 'rgba(120,80,88,0.55)');
    for (let y = 2; y < LH; y += 16) R(0, y, LW, 1, '#8a5a62');
    // Чашка чаю на підлокітнику, з парою.
    R(176, 6, 22, 20, '#d8d0c0'); R(176, 6, 22, 3, '#efe6d2'); R(178, 8, 18, 3, '#6b3f22'); R(198, 11, 5, 9, '#d8d0c0'); R(199, 13, 3, 5, '#5a3a40');
    for (let i = 0; i < 3; i++) R(182 + i * 5 + Math.round(Math.sin(t * 2 + i) * 1.5), 1 - ((t * 4 + i) % 3 | 0), 1, 3, 'rgba(240,235,225,0.6)');
    // Книжка: обкладинка з товщиною і зрізом сторінок знизу.
    R(16, 20, 174, 136, '#6b2f2f'); R(16, 150, 174, 6, '#4a1f1f');
    for (let x = 22; x < 184; x += 2) R(x, 146, 1, 4, x % 4 ? '#e2d8c2' : '#cfc4ad');
    page(22, 81, -1, '#efe6d2', '#ddd2bb');
    page(103, 81, 1, '#f3ead6', '#ddd2bb');
    R(101, 24, 4, 128, '#c9bda4'); R(102, 24, 2, 128, '#b5a98f');      // корінець
    lines(30, 38, 62, pg * 2, 0, -1, pg === 0);
    lines(114, 34, 62, pg * 2 + 1, 0, 1, false);
    // Номери сторінок.
    R(58, 140, 8, 2, '#b3a892'); R(140, 140, 8, 2, '#b3a892');
    // Сторінка, що перегортається: звужується до корінця і розгортається ліворуч, з тінню.
    if (flip > 0 && flip < 1) {
      const k = Math.cos(flip * Math.PI);          // 1 → −1
      const w = Math.abs(k) * 81, x = k > 0 ? 104 : 103 - w, lift = Math.sin(flip * Math.PI) * 10;
      R(x + (k > 0 ? -3 : 3), 30, w, 118, 'rgba(60,40,30,0.25)');
      R(x, 24 - lift, w, 126, k > 0 ? '#e8dfca' : '#f6eedb');
      if (w > 10) lines(x + 6, 34 - lift, Math.max(4, w - 14), pg * 2 + 3, 0, k > 0 ? 1 : -1, false);
    }
    // Руки тримають книжку: рукави, долоні під обкладинкою, великі пальці на сторінках.
    for (const [x0, dir] of [[0, 1], [172, -1]]) {
      R(x0, 118, 34, 54, '#2d4763'); R(x0 + (dir > 0 ? 28 : 0), 118, 6, 54, '#243a52'); R(x0, 114, 34, 5, '#3a5a7c');
      R(x0 + 6, 100, 22, 18, '#e0ac84'); R(x0 + 6, 114, 22, 4, '#c48b67');
    }
    R(20, 96, 10, 14, '#e0ac84'); R(20, 96, 10, 2, '#efc39c'); R(22, 108, 6, 2, '#c48b67');
    R(176, 96, 10, 14, '#e0ac84'); R(176, 96, 10, 2, '#efc39c'); R(178, 108, 6, 2, '#c48b67');
    // Тепле світло лампи зліва згори.
    const gl = lg.createRadialGradient(20, 0, 0, 20, 0, 170);
    gl.addColorStop(0, 'rgba(255,214,150,0.22)'); gl.addColorStop(1, 'rgba(255,214,150,0)');
    lg.fillStyle = gl; lg.fillRect(0, 0, LW, LH);
  }

  // o: { wrap, bar, pain, state, painkiller, joy, book: 'назва', session, sessions, onDone }
  function start(o) {
    const PAGES = 3;
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

    o.bar.innerHTML = `<div class="sc-head"><span class="ab-zone">Читання</span><span class="ab-meta" id="scCount"></span></div>
      <div class="sc-bar"><span class="mat-input">«${String(o.book || '').replace(/[<&]/g, '')}»</span><span class="sc-repeat"></span></div>
      <div class="sc-answers"><button class="ans primary read-flip" type="button"><kbd>Пробіл</kbd>Перегорнути сторінку</button></div>
      <p class="sc-msg">Читаєш. Коли дочитаєш розворот — гортай.</p>`;
    fit();
    const $q = (sel) => o.bar.querySelector(sel);
    const now = () => performance.now() / 1000;
    let page = 0, flipFrom = 0, done = false;
    const count = () => { $q('#scCount').textContent = 'сторінка ' + Math.min(page + 1, PAGES) + ' з ' + PAGES; };
    count();

    function flip() {
      if (done || (flipFrom && now() - flipFrom < 0.55)) return;
      flipFrom = now(); page++;
      if (page >= PAGES) {
        done = true;
        $q('.sc-answers').innerHTML = '';
        const last = o.session != null && o.sessions && o.session >= o.sessions;
        const m = $q('.sc-msg'); m.className = 'sc-msg good';
        m.textContent = last ? 'Остання сторінка. Дочитав!' : 'Закладка на новому місці.';
        setTimeout(close, 1100);
      } else count();
    }
    const kd = (e) => {
      if (e.code !== 'Space' && e.code !== 'ArrowRight' && e.code !== 'Enter') return;
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat) flip();
    };
    window.addEventListener('keydown', kd, true);
    $q('.read-flip').onclick = flip;

    let closed = false, raf = 0;
    // «Пропустити»: ui може закрити сцену — результат тоді рахується автоматично.
    if (o.registerAbort) o.registerAbort(() => close());
    function close() {
      if (closed) return;
      closed = true; cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd, true);
      if (ro) ro.disconnect();
      el.remove(); o.bar.innerHTML = '';
      o.onDone({ pages: page });
    }
    function frame() {
      fit();
      const t = now();
      const f = flipFrom ? Math.min(1, (t - flipFrom) / 0.5) : 1;
      lg.clearRect(0, 0, LW, LH);
      drawScene(t, f, page);
      g.imageSmoothingEnabled = false;
      g.drawImage(low, 0, 0, W, H);
      root.PainFX.gloom(g, W, H, o.joy != null ? o.joy : 60);
      fx.draw(g, W, H, t, o.pain, null, o.painkiller);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }

  root.ReadGame = { start };
})(typeof globalThis !== 'undefined' ? globalThis : this);
