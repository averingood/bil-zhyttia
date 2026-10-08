// Синтезатор від першої особи: зіграти три ноти, будь-які клавіші.
// Біль не можна вгадати: будь-яке натискання може несподівано відгукнутися спалахом —
// рука здригається, нота фальшива. Повертає { fake } — скільки фальшивих.
(function (root) {
  'use strict';
  const W = 412, H = 344, LW = 206, LH = 172;
  const NOTES = 3, KEYS = 15;                       // білих клавіш у кадрі
  const KX = 8, KW = 12.6, KY = 112, KH = 52;       // клавіатура в низькій роздільності
  const rnd = (n) => Math.floor(Math.random() * n);

  const low = document.createElement('canvas'); low.width = LW; low.height = LH;
  const lg = low.getContext('2d');
  const R = (x, y, w, h, c) => { lg.fillStyle = c; lg.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

  // Звук: проста пилка з м'яким згасанням; фальшива — розстроєна пара тонів.
  let audio = null;
  const soundOn = () => { try { return localStorage.getItem('zapas.synthSound') !== '0'; } catch (e) { return true; } };
  function tone(i, fake) {
    if (!soundOn()) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const scale = [0, 2, 4, 5, 7, 9, 11];
      const semi = scale[i % 7] + 12 * Math.floor(i / 7);
      const f = 220 * Math.pow(2, semi / 12);
      const now = audio.currentTime;
      const g = audio.createGain(); g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.18, now + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + (fake ? 0.5 : 0.9));
      const lp = audio.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = fake ? 900 : 1800;
      g.connect(lp); lp.connect(audio.destination);
      for (const d of fake ? [-0.7, 0.55] : [0, 7.02]) {
        const o = audio.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = f * Math.pow(2, d / 12);
        o.connect(g); o.start(now); o.stop(now + 1);
      }
    } catch (e) { /* без звуку теж можна */ }
  }

  // pressed: { i, at, fake }[]; bend — тремтіння від спалаху.
  // handX — де зараз рука (плавно ковзає), dip — 0..1, наскільки пальці втиснули клавішу.
  function drawScene(t, pressed, shake, fakeFlash, handX, dip) {
    // Тло: стіна кімнати, гірлянда, що мерехтить, і тепле світло лампи збоку.
    R(0, 0, LW, LH, '#243a3a');
    for (let y = 1; y < 70; y += 3) for (let x = (y % 2) * 2; x < LW; x += 5) R(x, y, 1, 1, '#294242');
    for (let x = 0; x < LW; x += 2) R(x, 14 + Math.round(Math.sin(x * 0.06) * 4), 2, 1, '#1a2a2a');   // дріт гірлянди
    const bulbs = ['#f2d36b', '#e2584a', '#6fcf8a', '#7ab0e8'];
    for (let k = 0; k < 13; k++) {
      const x = 6 + k * 16, y = 15 + Math.round(Math.sin(x * 0.06) * 4);
      const on = Math.sin(t * 2.2 + k * 1.7) > -0.3;
      R(x, y, 3, 4, on ? bulbs[k % 4] : '#3a3d45');
      if (on) R(x - 1, y - 1, 5, 6, 'rgba(255,230,160,0.12)');
    }
    const gl = lg.createRadialGradient(30, 10, 0, 30, 10, 150);
    gl.addColorStop(0, 'rgba(255,200,130,0.16)'); gl.addColorStop(1, 'rgba(255,200,130,0)');
    lg.fillStyle = gl; lg.fillRect(0, 0, LW, LH);
    // Пюпітр із нотним аркушем: кожна чиста нота з'являється на станах, фальшива — перекреслена.
    R(118, 26, 66, 46, '#2a2c33'); R(121, 29, 60, 40, '#efe6d2');
    for (let l = 0; l < 5; l++) R(124, 40 + l * 5, 54, 1, '#b5a98f');   // стани нижче — над ними назва пісні
    pressed.forEach((p, k) => {
      const nx = 130 + k * 16, ny = 54 - (p.i % 7) * 2.5;
      R(nx, ny, 4, 3, p.fake ? '#c0392b' : '#3a2f22'); R(nx + 3, ny - 9, 1, 10, p.fake ? '#c0392b' : '#3a2f22');
      if (p.fake) { R(nx - 2, ny - 6, 9, 1, '#c0392b'); R(nx - 2, ny + 3, 9, 1, '#c0392b'); }
    });
    R(148, 70, 6, 8, '#2a2c33');                                                // ніжка пюпітра
    // Корпус синтезатора й панель.
    const sx = Math.round(shake);
    R(2 + sx, 70, LW - 4, 100, '#16171c'); R(2 + sx, 70, LW - 4, 3, '#2e3038');
    R(10 + sx, 78, 60, 24, '#0e1a1a'); R(12 + sx, 80, 56, 20, fakeFlash ? '#3a1414' : '#123232');   // дисплей
    // Хвиля на дисплеї: рівна, коли граєш чисто; рвана після фальшивої ноти.
    for (let x = 0; x < 54; x++) {
      const a = pressed.length ? 6 * Math.exp(-(t - pressed[pressed.length - 1].at) * 1.5) : 1;
      const y = 90 + Math.round(Math.sin(x * 0.45 + t * 9) * a + (fakeFlash ? (Math.random() - 0.5) * 6 : 0));
      R(13 + x + sx, y, 1, 1, fakeFlash ? '#e2584a' : '#6fcf8a');
    }
    for (let k = 0; k < 6; k++) {                                              // ручки
      const kx = 82 + k * 18 + sx;
      R(kx, 82, 10, 10, '#3a3d45'); R(kx + 4, 83 + (k % 3), 2, 4, '#eef2f3');
    }
    for (let k = 0; k < 4; k++) R(190 + sx, 80 + k * 5, 4, 3, k === Math.floor(t * 2) % 4 ? '#e8c25a' : '#3a3d45');   // лампочки
    // Клавіші: білі, натиснута — темніша й нижча; фальшива — червона.
    const last = new Map();
    pressed.forEach((p) => last.set(p.i, p));
    for (let i = 0; i < KEYS; i++) {
      const p = last.get(i), down = p && t - p.at < 0.35;
      const x = KX + i * KW + sx;
      R(x, KY + (down ? 2 : 0), KW - 1, KH, down ? (p.fake ? '#f0b0a8' : '#d8dce0') : '#f3f4f2');
      R(x, KY + KH - 4 + (down ? 2 : 0), KW - 1, 4, '#c9ced3');
    }
    for (let i = 0; i < KEYS - 1; i++) if ([0, 1, 3, 4, 5].includes(i % 7)) R(KX + i * KW + KW * 0.65 + sx, KY, KW * 0.7, KH * 0.58, '#15161b');
    // Ноти злітають над клавішами: чиста — жовта, фальшива — червона й зламана.
    pressed.forEach((p) => {
      const age = t - p.at; if (age > 1.6) return;
      const x = KX + p.i * KW + 3 + Math.sin(age * 6) * 2 + sx, y = KY - 8 - age * 26;
      if (p.fake) { R(x, y, 2, 6, '#e2584a'); R(x + 2, y - 1, 3, 2, '#e2584a'); R(x - 2, y + 4, 3, 2, '#e2584a'); R(x + 3, y + 3, 2, 2, '#e2584a'); }
      else { R(x + 2, y, 2, 7, '#f2d36b'); R(x + 2, y, 5, 2, '#f2d36b'); R(x - 1, y + 5, 4, 3, '#f2d36b'); }
    });
    // Одна рука знизу: пальці лежать на клавішах, вказівний — на тій, що грає.
    const x = Math.round(handX + sx), d = Math.round(dip * 3), fy = KY + 14 + d;
    R(x - 6, fy + 30, 30, LH, '#2d4763'); R(x - 6, fy + 30, 30, 3, '#3a5a7c'); R(x + 18, fy + 32, 6, LH, '#243a52');   // рукав
    R(x - 3, fy + 12, 24, 20, '#e0ac84'); R(x - 3, fy + 12, 24, 3, '#efc39c'); R(x - 3, fy + 28, 24, 4, '#c48b67');   // долоня
    for (let k = 0; k < 4; k++) {
      const len = k === 0 || k === 3 ? 12 : 15, top = fy + 14 - len + (k === 1 ? d : 0);
      R(x + k * 5 + 1, top, 4, len, '#e0ac84'); R(x + k * 5 + 1, top, 4, 2, '#efc39c'); R(x + k * 5 + 4, top + 2, 1, len - 3, '#c48b67');
    }
    R(x - 7, fy + 16, 6, 6, '#e0ac84'); R(x - 7, fy + 16, 6, 2, '#efc39c');                                          // великий палець
  }

  // o: { wrap, bar, pain, state, painkiller, joy, onDone }
  function start(o) {
    const fx = root.PainFX.create();
    const el = document.createElement('div');
    el.className = 'scene';
    // Кнопка звуку — у самому кадрі, вгорі ліворуч.
    el.innerHTML = `<canvas width="${W}" height="${H}"></canvas><button class="synth-mute" type="button" id="synthMute"></button>`;
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

    o.bar.innerHTML = `<div class="sc-head"><span class="ab-zone">Синтезатор</span><span class="ab-meta" id="scCount"></span></div>
      <div class="sc-bar"><span class="mat-input"></span><span class="sc-repeat"></span></div>
      <div class="sc-answers"><p class="mat-input" style="font-size:20px;color:var(--muted)">Зіграй три ноти: клікни по клавішах або натискай літери на клавіатурі.</p>
</div>
      <p class="sc-msg"></p>`;
    fit();
    const $q = (sel) => o.bar.querySelector(sel);
    const now = () => performance.now() / 1000;
    const t0 = now();
    // Біль не вгадаєш: кожне натискання може відгукнутися спалахом. Що сильніший біль, то частіше.
    const chance = { light: 0.2, medium: 0.35, strong: 0.55 }[o.state] || 0.35;
    let glitch = null;
    const muteBtn = el.querySelector('#synthMute');
    const paintMute = () => { muteBtn.textContent = soundOn() ? '🔊 Звук: увімк.' : '🔈 Звук: вимк.'; };
    muteBtn.onclick = () => { try { localStorage.setItem('zapas.synthSound', soundOn() ? '0' : '1'); } catch (e) { /* не страшно */ } paintMute(); };
    paintMute();
    let handX = KX + 9 * KW, lastT = now();
    const pressed = [];
    let done = false, fakeUntil = 0, shakeUntil = 0;
    const count = () => { $q('#scCount').textContent = 'нота ' + Math.min(pressed.length + 1, NOTES) + ' з ' + NOTES; $q('.sc-bar .mat-input').textContent = pressed.map((p) => (p.fake ? '✗' : '♪')).join(' '); };
    count();

    function play(i) {
      if (done) return;
      const t = now();
      const hurt = Math.random() < chance;
      if (hurt) glitch = { start: t + 0.02, end: t + 0.45, grow: 0.12 };   // спалах уже після натискання
      pressed.push({ i, at: t, fake: hurt });
      tone(i, hurt);
      if (hurt) { fakeUntil = t + 0.6; shakeUntil = t + 0.35; }
      const m = $q('.sc-msg'); m.className = 'sc-msg ' + (hurt ? 'bad' : 'good');
      m.textContent = hurt ? 'Біль смикнув руку — сфальшивив.' : 'Чисто.';
      count();
      if (pressed.length >= NOTES) {
        done = true;
        const fake = pressed.filter((p) => p.fake).length;
        m.className = 'sc-msg ' + (fake ? '' : 'good');
        m.textContent = fake === 0 ? 'Три чисті ноти. Пісня росте.' : fake === NOTES ? 'Сьогодні все фальшиво. Але сів і зіграв.' : 'Фальшивих нот: ' + fake + '. Біль заважав, але пісня однаково росте.';
        setTimeout(() => close(fake), 1500);
      }
    }
    const kd = (e) => {
      if (!/^Key[A-Z]$|^Digit\d$|^Space$/.test(e.code)) return;
      e.preventDefault(); e.stopPropagation();
      if (e.repeat) return;
      const code = e.code.charCodeAt(e.code.length - 1);
      play(code % KEYS);
    };
    window.addEventListener('keydown', kd, true);
    // Лише по клавішах: клік по корпусу чи стіні нічого не грає.
    view.addEventListener('pointerdown', (e) => {
      const r = view.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * LW, y = (e.clientY - r.top) / r.height * LH;
      if (y < KY || y > KY + KH || x < KX || x > KX + KEYS * KW) return;
      play(Math.min(KEYS - 1, Math.floor((x - KX) / KW)));
    });

    let closed = false, raf = 0;
    function close(fake) {
      if (closed) return;
      closed = true; cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd, true);
      if (ro) ro.disconnect();
      el.remove(); o.bar.innerHTML = '';
      o.onDone({ fake: fake || 0 });
    }
    function frame() {
      fit();
      const t = now(), dt = Math.min(0.05, t - lastT); lastT = t;
      const shake = t < shakeUntil ? Math.sin(t * 60) * 2 : 0;
      // Рука плавно ковзає до клавіші; вказівний палець — над її серединою.
      const last = pressed[pressed.length - 1];
      const tx = last ? KX + last.i * KW + KW / 2 - 8 : handX;
      handX += (tx - handX) * (1 - Math.exp(-dt * 14));
      const since = last ? t - last.at : 9, dip = since < 0.25 ? Math.sin(since / 0.25 * Math.PI) : 0;
      lg.clearRect(0, 0, LW, LH);
      drawScene(t, pressed, shake, t < fakeUntil, handX, dip);
      g.imageSmoothingEnabled = false;
      g.drawImage(low, 0, 0, W, H);
      // Назва пісні вгорі нотного аркуша; задовга — обрізається трикрапкою.
      if (o.title) {
        g.font = '15px Handjet'; g.fillStyle = '#3a2f22'; g.textBaseline = 'top';
        let tt = '«' + o.title + '»';
        while (g.measureText(tt).width > 112 && tt.length > 4) tt = tt.slice(0, -2) + '…';
        g.fillText(tt, 248, 60);
      }
      root.PainFX.gloom(g, W, H, o.joy != null ? o.joy : 60);
      fx.draw(g, W, H, t, Math.max(2, o.pain), glitch, o.painkiller);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }

  root.SynthGame = { start };
})(typeof globalThis !== 'undefined' ? globalThis : this);
