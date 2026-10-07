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
  function lines(x, y, w, seed) {
    for (let i = 0; i < 13; i++) {
      const len = i === 12 ? w * 0.45 : w * (0.78 + ((seed * 7 + i * 13) % 20) / 100);
      R(x, y + i * 7, Math.min(w, len), 2, '#8f8676');
    }
  }

  // flip — 0..1: сторінка ліворуч переїжджає з правого боку.
  function drawScene(t, flip, page) {
    // Тло: ковдра на колінах, теплий вечірній світ лампи.
    R(0, 0, LW, LH, '#3a3340');
    for (let y = 0; y < LH; y += 6) R(0, y, LW, 2, '#40384a');
    // Обкладинка, що визирає по краях.
    R(18, 18, 170, 134, '#6b2f2f'); R(18, 150, 170, 4, '#4a1f1f');
    // Сторінки.
    R(24, 22, 78, 126, '#efe6d2'); R(104, 22, 78, 126, '#f3ead6');
    R(101, 22, 4, 126, '#d6cbb4');
    lines(32, 34, 62, page * 2); lines(112, 34, 62, page * 2 + 1);
    R(56, 136, 14, 2, '#b3a892'); R(136, 136, 14, 2, '#b3a892');
    // Сторінка, що перегортається: звужується до корінця і розгортається ліворуч.
    if (flip > 0 && flip < 1) {
      const k = Math.cos(flip * Math.PI);          // 1 → −1
      const w = Math.abs(k) * 78, x = k > 0 ? 104 : 104 - w;
      R(x, 22 - Math.sin(flip * Math.PI) * 6, w, 126, k > 0 ? '#e8dfca' : '#f6eedb');
      if (w > 8) lines(x + 6, 34, Math.max(4, w - 14), page * 2 + 3);
    }
    // Руки тримають книжку знизу.
    for (const x0 of [6, 170]) {
      R(x0, 120, 30, 52, '#2d4763'); R(x0 + 4, 112, 22, 16, '#e0ac84'); R(x0 + 4, 112, 22, 2, '#c48b67');
    }
    R(14, 104, 12, 10, '#e0ac84'); R(180, 104, 12, 10, '#e0ac84');   // великі пальці на сторінках
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
