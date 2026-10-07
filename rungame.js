// Ігри на компі від першої особи: монітор у темній кімнаті, на екрані піксельний бігунець.
// Чотири перешкоди, перед першою — секунда-дві чистого бігу. Біль не вгадаєш: перед якоюсь
// перешкодою накриває спалах — натискання не спрацьовує, бігунець падає. GAME OVER.
// Повертає { cleared, pain } — скільки перестрибнув і чи впав через біль.
(function (root) {
  'use strict';
  const W = 412, H = 344, LW = 206, LH = 172;
  const SX = 32, SY = 14, SW = 142, SH = 86;          // екран монітора в низькій роздільності
  const GROUND = SY + 74, RX = SX + 18, RW = 6, RH = 9;   // земля й бігунець
  const SPEED = 70, JUMP_T = 0.55, JUMP_H = 22, OW = 5, OH = 9;

  const low = document.createElement('canvas'); low.width = LW; low.height = LH;
  const lg = low.getContext('2d');
  const R = (x, y, w, h, c) => { lg.fillStyle = c; lg.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

  // Бігунець: голова, тулуб, ноги перебирають; упав — лежить боком.
  function runner(x, y, t, fallen, col) {
    if (fallen) { R(x - 2, GROUND - 4, 10, 4, col); R(x + 8, GROUND - 5, 3, 3, col); return; }
    R(x + 2, y - RH, 3, 3, col); R(x + 1, y - RH + 3, 4, 3, col);
    const step = Math.floor(t * 12) % 2;
    R(x + (step ? 0 : 1), y - 3, 2, 3, col); R(x + (step ? 4 : 3), y - 3, 2, 3, col);
    R(x + 5, y - RH + 3, 2, 1, col);                 // рука вперед
  }

  function drawScene(t, st) {
    // Темна кімната, лише монітор світить.
    R(0, 0, LW, LH, '#12141b');
    for (let y = 2; y < 116; y += 4) for (let x = (y % 8) ? 2 : 0; x < LW; x += 6) R(x, y, 1, 1, '#171a22');
    const glow = lg.createRadialGradient(103, 70, 10, 103, 70, 140);
    glow.addColorStop(0, 'rgba(110,190,220,0.18)'); glow.addColorStop(1, 'rgba(110,190,220,0)');
    lg.fillStyle = glow; lg.fillRect(0, 0, LW, LH);
    // Стіл.
    R(0, 116, LW, LH - 116, '#2a2220'); R(0, 116, LW, 2, '#3a2f2a');
    // Холодна чашка ліворуч.
    R(4, 104, 14, 14, '#c9c3b8'); R(4, 104, 14, 2, '#e0dbd0'); R(6, 106, 10, 2, '#4a2e1c'); R(18, 108, 3, 6, '#c9c3b8');
    // Монітор: рамка, ніжка, екран.
    R(SX - 6, SY - 6, SW + 12, SH + 14, '#1b1d24'); R(SX - 6, SY - 6, SW + 12, 2, '#2a2d36');
    R(96, SY + SH + 8, 14, 10, '#1b1d24'); R(86, 114, 34, 4, '#23262e');
    R(SX + SW - 4, SY + SH + 3, 2, 1, st.over ? '#e2584a' : '#6fcf8a');      // лампочка живлення
    R(SX, SY, SW, SH, '#0d1f2a');
    // Гра: зірочки, земля з камінцями, що їдуть назад.
    for (let k = 0; k < 9; k++) R(SX + ((k * 37 - st.dist * 0.2) % SW + SW) % SW, SY + 8 + (k * 13) % 30, 1, 1, '#2e5566');
    R(SX, GROUND, SW, 1, '#6fcf8a');
    for (let k = 0; k < 14; k++) R(SX + ((k * 23 - st.dist) % SW + SW) % SW, GROUND + 3 + (k % 3) * 3, 2, 1, '#2f6a52');
    for (const o of st.obs) if (o.x > SX - OW && o.x < SX + SW) {
      R(o.x, GROUND - OH, OW, OH, '#f2d36b'); R(o.x - 2, GROUND - 6, 2, 3, '#f2d36b'); R(o.x + OW, GROUND - 7, 2, 3, '#f2d36b');
    }
    runner(RX, GROUND - st.jumpY, t, st.over, st.over ? '#e2584a' : '#eef2f3');
    // Рядки розгортки — легкий CRT.
    for (let y = SY; y < SY + SH; y += 2) R(SX, y, SW, 1, 'rgba(0,0,0,0.18)');
    // Клавіатура.
    R(18, 128, 170, 34, '#1d1f26'); R(18, 128, 170, 2, '#2a2d36');
    for (let r = 0; r < 3; r++) for (let k = 0; k < 13; k++) R(22 + k * 12.6 + r * 3, 132 + r * 7, 10, 5, '#2c2f38');
    const dip = st.pressAt != null && t - st.pressAt < 0.18 ? 1 : 0;
    R(64, 153 + dip, 78, 6, dip ? '#3a3e4a' : '#33363f');                   // пробіл
    // Руки: ліва на WASD, права великим пальцем на пробілі.
    R(20, 150, 34, 30, '#2d4763'); R(20, 150, 34, 3, '#3a5a7c');
    R(26, 138, 22, 14, '#e0ac84'); R(26, 138, 22, 2, '#efc39c');
    for (let k = 0; k < 3; k++) R(28 + k * 6, 133, 4, 6, '#e0ac84');
    const sh = st.shake;
    R(138 + sh, 152, 40, 30, '#2d4763'); R(138 + sh, 152, 40, 3, '#3a5a7c');
    R(140 + sh, 140, 24, 14, '#e0ac84'); R(140 + sh, 140, 24, 2, '#efc39c'); R(140 + sh, 152, 24, 2, '#c48b67');
    R(128 + sh, 148 + dip * 2, 14, 5, '#e0ac84'); R(128 + sh, 148 + dip * 2, 14, 1, '#efc39c');   // великий палець
  }

  // o: { wrap, bar, pain, state, painkiller, joy, jumps, painChance, onDone }
  function start(o) {
    const N = o.jumps || 4;
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

    o.bar.innerHTML = `<div class="sc-head"><span class="ab-zone">Ігри</span><span class="ab-meta" id="scCount"></span></div>
      <div class="sc-bar"><span class="mat-input"></span><span class="sc-repeat"></span></div>
      <div class="sc-answers"><button class="ans primary run-jump" type="button"><kbd>Пробіл</kbd>Стрибок</button></div>
      <p class="sc-msg">Перестрибни ${N} перешкоди.</p>`;
    fit();
    const $q = (sel) => o.bar.querySelector(sel);
    const now = () => performance.now() / 1000;

    // Перша перешкода — за ~1.8 с бігу, далі з проміжками 1–1.6 с.
    const obs = [];
    let x = SX + SW + 4;
    for (let i = 0; i < N; i++) { obs.push({ x, done: false }); x += 70 + Math.random() * 42; }
    // Біль: перед якою перешкодою (не першою) накриє. Шанс — від стану.
    const chance = (o.painChance || {})[o.state] != null ? o.painChance[o.state] : 0.25;
    let painAt = -1;
    for (let i = 1; i < N; i++) if (Math.random() < chance) { painAt = i; break; }

    const st = { obs, dist: 0, jumpY: 0, over: false, pressAt: null, shake: 0 };
    let jumpFrom = null, cleared = 0, done = false, glitch = null, painOn = false, lastT = now(), shakeUntil = 0;
    const count = () => {
      $q('#scCount').textContent = 'перешкода ' + Math.min(cleared + 1, N) + ' з ' + N;
      $q('.sc-bar .mat-input').textContent = '★'.repeat(cleared) + '·'.repeat(N - cleared);
    };
    count();
    const msg = (t, k) => { const m = $q('.sc-msg'); m.className = 'sc-msg ' + (k || ''); m.textContent = t; };

    function jump() {
      if (done) return;
      const t = now();
      st.pressAt = t;
      if (painOn) { shakeUntil = t + 0.3; msg('Біль смикнув — рука не натиснула.', 'bad'); return; }
      if (jumpFrom == null) jumpFrom = t;
    }
    function finish(pain) {
      done = true;
      $q('.sc-answers').innerHTML = '';
      if (cleared >= N) msg('Усі ' + N + ' перешкоди! Ще б раунд… але вже пізно.', 'good');
      else msg(pain ? 'Біль не дав натиснути. GAME OVER — перестрибнув ' + cleared + ' з ' + N + '.' : 'Не встиг. GAME OVER — перестрибнув ' + cleared + ' з ' + N + '.', pain ? 'bad' : '');
      setTimeout(() => close(pain), 1700);
    }
    const kd = (e) => {
      if (!['Space', 'ArrowUp', 'KeyW', 'Enter'].includes(e.code)) return;
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat) jump();
    };
    window.addEventListener('keydown', kd, true);
    view.addEventListener('pointerdown', jump);
    $q('.run-jump').onclick = jump;

    let closed = false, raf = 0;
    function close(pain) {
      if (closed) return;
      closed = true; cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd, true);
      if (ro) ro.disconnect();
      el.remove(); o.bar.innerHTML = '';
      o.onDone({ cleared, pain: !!pain && cleared < N });
    }
    function frame() {
      fit();
      const t = now(), dt = Math.min(0.05, t - lastT); lastT = t;
      if (!done) {
        const dx = SPEED * dt;
        st.dist += dx;
        for (const ob of obs) ob.x -= dx;
        if (jumpFrom != null) {
          const p = (t - jumpFrom) / JUMP_T;
          if (p >= 1) { jumpFrom = null; st.jumpY = 0; } else st.jumpY = 4 * JUMP_H * p * (1 - p);
        }
        // Спалах болю: за ~0.9 с до «своєї» перешкоди — і поки не впаде.
        if (painAt >= 0 && !painOn && obs[painAt].x - RX < SPEED * 0.9) {
          painOn = true; jumpFrom = null; st.jumpY = 0;
          glitch = { start: t, end: t + 3, grow: 0.15 };
          msg('Накриває…', 'bad');
        }
        for (let i = 0; i < obs.length; i++) {
          const ob = obs[i];
          if (ob.done) continue;
          if (ob.x < RX + RW && ob.x + OW > RX && st.jumpY < OH) {          // врізався
            st.over = true; ob.done = true;
            if (glitch) glitch.end = t + 0.5;
            finish(painOn && i === painAt);
            break;
          }
          if (ob.x + OW < RX) { ob.done = true; cleared++; count(); if (cleared >= N) finish(false); }
        }
      }
      st.shake = t < shakeUntil ? Math.round(Math.sin(t * 60) * 2) : 0;
      lg.clearRect(0, 0, LW, LH);
      drawScene(t, st);
      g.imageSmoothingEnabled = false;
      g.drawImage(low, 0, 0, W, H);
      // Рахунок і GAME OVER — чітким шрифтом поверх екрана.
      g.font = '18px Handjet'; g.textBaseline = 'top'; g.fillStyle = '#6fcf8a';
      g.fillText('СТРИБКИ ' + cleared + '/' + N, (SX + 4) * 2, (SY + 3) * 2);
      if (done) {
        g.font = '40px Handjet'; g.textAlign = 'center';
        g.fillStyle = st.over ? '#e2584a' : '#f2d36b';
        g.fillText(st.over ? 'GAME OVER' : 'YOU WIN', (SX + SW / 2) * 2, (SY + 26) * 2);
        g.textAlign = 'left';
      }
      root.PainFX.gloom(g, W, H, o.joy != null ? o.joy : 60);
      fx.draw(g, W, H, t, o.pain, glitch, o.painkiller);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }

  root.RunGame = { start };
})(typeof globalThis !== 'undefined' ? globalThis : this);
