// Робота: відеопланерка від першої особи. Директорка двічі каже щось із деталлю
// (день і час, кількість, версія) і питає про неї. На відповідь — кілька секунд.
// Біль може накрити саме ключове слово. Про правила гри не знає:
// отримує біль і повертає, скільки заробила зустріч.
(function (root) {
  'use strict';
  const C = root.GAME_CONFIG;
  const W = 412, H = 344, LW = 206, LH = 172;
  const CPS = 26;                                   // символів субтитрів на секунду
  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rnd(a.length)];
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- стіл і монітор ----------
  function makeDesk() {
    const c = document.createElement('canvas'); c.width = LW; c.height = LH;
    const g = c.getContext('2d');
    const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    R(0, 0, LW, LH, '#2a504d');
    for (let y = 0; y < 128; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < LW; x += 4) R(x, y, 1, 1, '#2f5956');
    R(186, 10, 14, 30, '#171a22'); R(188, 12, 10, 26, '#c9c3a8');
    R(0, 126, LW, LH - 126, '#4f3222'); R(0, 126, LW, 2, '#6e4630');
    for (let x = 0; x < LW; x += 23) R(x, 130 + (x % 3), 14, 1, '#5a3926');
    R(20, 4, 166, 116, '#171a22'); R(22, 6, 162, 112, '#22262d'); R(26, 10, 154, 104, '#171a22');
    R(96, 118, 14, 8, '#22262d'); R(80, 124, 46, 4, '#22262d');
    R(48, 136, 110, 20, '#171a22'); R(50, 138, 106, 16, '#7d858f');
    for (let r = 0; r < 3; r++) for (let k = 0; k < 13; k++) R(52 + k * 8, 140 + r * 5, 6, 3, '#9aa2ac');
    R(166, 132, 14, 16, '#171a22'); R(167, 133, 12, 14, '#d4a03e'); R(179, 137, 3, 6, '#171a22');
    R(8, 100, 4, 28, '#33373f'); R(2, 92, 16, 9, '#d4a03e');
    return c;
  }
  let DESK = null;

  // ---------- люди в дзвінку ----------
  const PEOPLE = {
    boss: { name: 'Наталія Ігорівна', short: 'Наталія', hair: '#3a2a20', skin: '#e8b892', top: '#3b4263', long: true, bg: '#2c3348' },
    c1: { name: 'Віра', hair: '#b8502f', skin: '#ecc09c', top: '#3fa3c4', long: true, bg: '#2a3a3f' },
    c2: { name: 'Остап', hair: '#1d1a1f', skin: '#d9a47e', top: '#8fd16a', long: false, bg: '#36302a' },
    c3: { name: 'Ліна', hair: '#e8c25a', skin: '#f0c8a8', top: '#a77fd6', long: true, bg: '#2f2a3a' },
    me: { name: 'Ти', hair: '#3a2a20', skin: '#e0ac84', top: '#c4842f', long: false, bg: '#262a33' },
  };
  function face(g, p, x, y, w, h, o) {
    g.fillStyle = p.bg; g.fillRect(x, y, w, h);
    const s = Math.max(2, Math.floor(Math.min(w, h) / 22));
    const cx = x + Math.floor(w / 2), top = y + Math.floor(h * 0.18);
    const R = (dx, dy, dw, dh, col) => { g.fillStyle = col; g.fillRect(cx + dx * s, top + dy * s, dw * s, dh * s); };
    R(-6, 12, 12, 8, p.top); R(-7, 14, 14, 6, p.top);
    R(-1, 10, 2, 2, p.skin);
    if (p.long) { R(-6, 1, 2, 11, p.hair); R(4, 1, 2, 11, p.hair); }
    R(-4, 1, 8, 10, p.skin);
    R(-5, -1, 10, 3, p.hair); R(-4, -2, 8, 1, p.hair);
    const ey = o.wince ? 5 : 4;
    if (!o.blink) { R(-3, ey, 1, 1, '#1d1d24'); R(2, ey, 1, 1, '#1d1d24'); } else { R(-3, ey, 2, 1, '#1d1d24'); R(2, ey, 2, 1, '#1d1d24'); }
    if (o.wince) { R(-3, 3, 2, 1, p.hair); R(1, 3, 2, 1, p.hair); }
    const open = o.talking && Math.floor(o.t * 9) % 2 === 0;
    R(-1, 8, 3, open ? 2 : 1, open ? '#6b2a2a' : (o.wince ? '#7a4a3a' : '#a0604a'));
  }

  // ---------- що каже директорка ----------
  const DAYS = ['понеділок', 'вівторок', 'середу', 'четвер', 'п’ятницю'];
  const PROJECTS = ['Пекарні', 'Велопрокату', 'Чайни', 'Книгарні', 'Кав’ярні'];
  const ITEMS = [['банер', 'банери', 'банерів'], ['макет', 'макети', 'макетів'], ['пост', 'пости', 'постів']];
  const plural = (n, f) => (n % 10 === 1 && n % 100 !== 11 ? f[0] : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? f[1] : f[2]);
  const other = (v, n) => (v + 1 + rnd(n - 1)) % n;
  function makeQuestion() {
    const proj = pick(PROJECTS), kind = rnd(3);
    if (kind === 0) {
      const d = rnd(5), h = 10 + rnd(8), m = pick(['00', '30']);
      const key = DAYS[d] + ' о ' + h + ':' + m, h2 = h + (Math.random() < 0.5 ? 2 : -2);
      return {
        text: 'Отже, презентацію для ' + proj + ' переносимо на ' + key + '. Клієнт просив пізніше.', key,
        ask: 'Ти встигнеш до цього часу? Нагадай, коли показуємо?',
        opts: shuffle([{ t: 'У ' + key, ok: true }, { t: 'У ' + DAYS[d] + ' о ' + h2 + ':' + m }, { t: 'У ' + DAYS[other(d, 5)] + ' о ' + h + ':' + m }]),
      };
    }
    if (kind === 1) {
      const it = pick(ITEMS), n = 2 + rnd(6), n2 = n + (n > 3 ? -2 : 2), n3 = n + 1;
      const key = n + ' ' + plural(n, it);
      return {
        text: 'Для ' + proj + ' цього тижня треба ' + key + ', решту відкладаємо.', key,
        ask: 'Скільки ' + it[2] + ' береш на тиждень?',
        opts: shuffle([{ t: 'Беру ' + key, ok: true }, { t: 'Беру ' + n2 + ' ' + plural(n2, it) }, { t: 'Беру ' + n3 + ' ' + plural(n3, it) }]),
      };
    }
    const a = 1 + rnd(4), b = rnd(10), key = 'версію ' + a + '.' + b;
    return {
      text: 'Клієнт з ' + proj + ' погодив ' + key + ', далі працюємо тільки з нею.', key,
      ask: 'З якою версією працюєш далі?',
      // «З 3.0» у піксельному шрифті читається як «3 3.0», тож слово, а не прийменник.
      opts: shuffle([{ t: 'Версія ' + a + '.' + b, ok: true }, { t: 'Версія ' + a + '.' + ((b + 3) % 10) }, { t: 'Версія ' + ((a % 4) + 1) + '.' + b }]),
    };
  }

  // ---------- зустріч ----------
  // o: { wrap, canvas, bar, pain, state, painkiller, payDay, onDone }
  function start(o) {
    if (!DESK) DESK = makeDesk();
    const M = C.work.meeting;
    const fx = root.PainFX.create();
    const el = document.createElement('div');
    el.className = 'scene';
    el.innerHTML = `<canvas width="${W}" height="${H}"></canvas>`;
    o.wrap.appendChild(el);
    const view = el.querySelector('canvas'), g = view.getContext('2d');
    g.imageSmoothingEnabled = false;
    // Сцена вписується в поле цілком: копіювати розмір кімнати не можна — та не буває меншою за 1×
    // і на низькому вікні вилазить за край, обрізаючи низ кадру.
    const fit = () => {
      const aw = o.wrap.clientWidth, ah = o.wrap.clientHeight;
      if (!aw || !ah) return;
      const k = Math.min(aw / W, ah / H), w = Math.round(W * k), h = Math.round(H * k);
      Object.assign(el.style, { left: Math.round((aw - w) / 2) + 'px', top: Math.round((ah - h) / 2) + 'px', width: w + 'px', height: h + 'px' });
    };
    fit();
    const ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(o.wrap);

    o.bar.innerHTML = `<div class="sc-head"><span class="ab-zone">Планерка</span><span class="ab-meta" id="scCount"></span></div>
      <div class="sc-bar"><div class="sc-timer" hidden><i></i></div><span class="sc-repeat"></span></div>
      <div class="sc-answers"></div><p class="sc-msg"></p>`;
    const $q = (sel) => o.bar.querySelector(sel);

    const t0 = performance.now() / 1000;
    let n = 0, repeatLeft = true, score = 0, right = 0, cur = null, done = false, keyHandler = null;
    const notes = [];

    function play(again) {
      const q = again ? cur.q : makeQuestion();
      const now = performance.now() / 1000;
      const start = now + root.PainFX.LEAD;
      const typed = start + q.text.length / CPS, end = typed + 1.4;
      // Біль накриває ключові слова: як часто — за станом.
      let glitch = null;
      if (Math.random() < C.painCover[o.state]) {
        const ks = start + q.text.indexOf(q.key) / CPS;
        glitch = { start: ks - 0.1, end: end + 0.1 };
      }
      cur = { q, start, typed, end, glitch, again, asking: false };
      $q('#scCount').textContent = 'питання ' + (n + 1) + ' з ' + M.questions;
      $q('.sc-answers').innerHTML = ''; $q('.sc-repeat').innerHTML = ''; $q('.sc-timer').hidden = true;
    }

    function ask() {
      cur.asking = true; cur.askAt = performance.now() / 1000;
      $q('.sc-answers').innerHTML = cur.q.opts.map((op, i) => `<button class="ans" data-i="${i}"><kbd>${i + 1}</kbd>${esc(op.t)}</button>`).join('');
      $q('.sc-answers').querySelectorAll('.ans').forEach((b) => { b.onclick = () => answer(Number(b.dataset.i)); });
      if (repeatLeft) {
        $q('.sc-repeat').innerHTML = `<button class="btn" type="button"><kbd>R</kbd> Вибач, зв’язок підвис, повтори?</button>`;
        $q('.sc-repeat button').onclick = repeat;
      }
      $q('.sc-timer').hidden = false;
      setKeys((e) => {
        if (/^Digit[1-3]$/.test(e.code)) answer(Number(e.code.slice(5)) - 1);
        else if (e.code === 'KeyR' && repeatLeft) repeat();
        else return false;
      });
    }

    function answer(i) {
      if (!cur || !cur.asking) return;
      cur.asking = false; setKeys(null);
      const ok = i != null && cur.q.opts[i] && cur.q.opts[i].ok;
      const pay = ok ? (cur.again ? M.payRepeat : M.payRight) : M.payWrong;
      score += pay; if (ok) right++;
      notes.push(pay);
      $q('.sc-answers').querySelectorAll('.ans').forEach((b, k) => { b.disabled = true; if (cur.q.opts[k].ok) b.classList.add('right'); else if (k === i) b.classList.add('wrong'); });
      $q('.sc-repeat').innerHTML = ''; $q('.sc-timer').hidden = true;
      const reply = i == null ? 'Ти з нами? Гаразд, рухаємось далі.' : ok ? 'Чудово, дякую.' : 'Ні, це не так. Уважніше, будь ласка.';
      $q('.sc-msg').className = 'sc-msg ' + (pay > 0 ? 'good' : 'bad');
      $q('.sc-msg').textContent = reply + ' ' + (pay > 0 ? '+' : '−') + Math.abs(pay) + ' ₴';
      cur.reaction = { text: reply, from: performance.now() / 1000, until: performance.now() / 1000 + 1.8 };
      setTimeout(() => { if (done) return; n++; $q('.sc-msg').textContent = ''; if (n < M.questions) play(); else finish(); }, 1900);
    }

    function repeat() {
      if (!repeatLeft || !cur.asking) return;
      repeatLeft = false; cur.asking = false; setKeys(null);
      $q('.sc-msg').className = 'sc-msg'; $q('.sc-msg').textContent = 'Повторюють. За це питання тепер +' + M.payRepeat + ' ₴.';
      play(true);
    }

    function finish() {
      done = true;
      $q('#scCount').textContent = '';
      $q('.sc-answers').innerHTML = '';
      $q('.sc-msg').className = 'sc-msg ' + (score > 0 ? 'good' : 'bad');
      $q('.sc-msg').textContent = 'Зустріч завершено: ' + (score >= 0 ? '+' : '−') + Math.abs(score) + ' ₴' +
        (score > 0 && o.payDay ? ', прийде на день ' + o.payDay : score < 0 ? ', штраф одразу' : '') + '.';
      setKeys((e) => { if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') close(); else return false; });
      // Виходити нема з чого обирати — сцена закривається сама, Enter пришвидшує.
      setTimeout(close, 500);
    }

    function setKeys(h) {
      if (keyHandler) window.removeEventListener('keydown', keyHandler, true);
      keyHandler = null;
      if (!h) return;
      keyHandler = (e) => { if (h(e) !== false) { e.preventDefault(); e.stopPropagation(); } };
      window.addEventListener('keydown', keyHandler, true);
    }

    let closed = false, raf = 0;
    function close() {
      if (closed) return;
      closed = true; setKeys(null); cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      el.remove(); o.bar.innerHTML = '';
      o.onDone({ score, right, questions: M.questions });
    }

    // ---------- кадр ----------
    const SCREEN = { x: 60, y: 28, w: 292, h: 192 };
    const B = { x: 64, y: 44, w: 182, h: 112 };
    const TILES = { c1: { x: 250, y: 44, w: 98, h: 26 }, c2: { x: 250, y: 72, w: 98, h: 26 }, c3: { x: 250, y: 100, w: 98, h: 26 }, me: { x: 250, y: 128, w: 98, h: 28 } };
    const wrapText = (text, maxW) => {
      const words = text.split(' '), lines = []; let line = '';
      for (const w of words) { const test = line ? line + ' ' + w : w; if (g.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; }
      if (line) lines.push(line);
      return lines;
    };
    const blinkOf = (k, t) => (Math.floor(t * 1.3 + k.length * 0.7) % 5 === 0) && ((t * 1.3 + k.length * 0.7) % 1 < 0.15);

    function frame(nowMs) {
      fit();   // поле міняється, коли заповнюється панель дій; спостерігач розміру іноді запізнюється
      const t = nowMs / 1000;
      if (cur && !cur.asking && !cur.reaction && !done && t >= cur.end) ask();
      if (cur && cur.asking) {
        const left = M.answerSeconds - (t - cur.askAt);
        $q('.sc-timer i').style.width = Math.max(0, left / M.answerSeconds * 100) + '%';
        if (left <= 0) answer(null);
      }
      // Погляд наближений до монітора.
      const k = 380 / SCREEN.w;
      g.setTransform(k, 0, 0, k, 16 - SCREEN.x * k, 8 - SCREEN.y * k);
      g.drawImage(DESK, 0, 0, W, H);
      const S = SCREEN;
      g.fillStyle = '#14161f'; g.fillRect(S.x, S.y, S.w, S.h);
      g.fillStyle = '#20243a'; g.fillRect(S.x, S.y, S.w, 12);
      g.textBaseline = 'top';
      g.font = '10px Handjet'; g.fillStyle = '#ece3cf'; g.fillText('Планерка · дизайн-відділ', S.x + 6, S.y + 1);
      const live = Math.floor(t - t0);
      g.fillStyle = '#e2584a'; g.fillRect(S.x + S.w - 62, S.y + 4, 4, 4);
      g.fillStyle = '#ece3cf'; g.fillText('наживо ' + String(Math.floor(live / 60)).padStart(2, '0') + ':' + String(live % 60).padStart(2, '0'), S.x + S.w - 55, S.y + 1);

      let talking = false, sub = null;
      if (cur && cur.reaction && t < cur.reaction.until) { talking = t < cur.reaction.until - 0.6; sub = { text: cur.reaction.text, start: cur.reaction.from }; }
      else if (cur && !cur.asking && !cur.reaction && t >= cur.start && t < cur.end) {
        talking = t < cur.typed + 0.3;
        sub = { text: cur.q.text, start: cur.start };
      }
      face(g, PEOPLE.boss, B.x, B.y, B.w, B.h, { talking, blink: blinkOf('boss', t), t });
      if (talking) { g.strokeStyle = '#6fcf8a'; g.lineWidth = 2; g.strokeRect(B.x + 1, B.y + 1, B.w - 2, B.h - 2); }
      g.fillStyle = 'rgba(15,17,26,.75)'; g.fillRect(B.x, B.y + B.h - 12, 84, 12);
      g.fillStyle = '#ece3cf'; g.font = '10px Handjet'; g.fillText(PEOPLE.boss.name, B.x + 4, B.y + B.h - 12);
      const wince = o.state === 'strong' || (o.state === 'medium' && Math.floor(t / 3) % 3 === 0);
      for (const key of ['c1', 'c2', 'c3', 'me']) {
        const T = TILES[key], p = PEOPLE[key];
        face(g, p, T.x, T.y, T.w, T.h, { talking: false, blink: blinkOf(key, t), t, wince: key === 'me' && wince });
        g.fillStyle = 'rgba(15,17,26,.75)'; g.fillRect(T.x, T.y + T.h - 10, 34, 10);
        g.fillStyle = '#ece3cf'; g.font = '9px Handjet'; g.fillText(p.name, T.x + 3, T.y + T.h - 10);
      }
      root.PainFX.gloom(g, W, H, o.joy != null ? o.joy : 60);   // субтитри лишаються чіткими
      const sy = 160;
      g.fillStyle = '#0f111a'; g.fillRect(S.x + 4, sy, S.w - 8, 56);
      if (cur && cur.asking) {
        g.fillStyle = '#d4a03e'; g.font = '11px Handjet'; g.fillText(PEOPLE.boss.short + ':', S.x + 10, sy + 4);
        g.fillStyle = '#ece3cf'; g.font = '13px Handjet';
        wrapText(cur.q.ask, S.w - 24).slice(0, 2).forEach((l, i) => g.fillText(l, S.x + 10, sy + 18 + i * 15));
      } else if (sub) {
        const shown = Math.max(0, Math.min(sub.text.length, Math.floor((t - sub.start) * CPS)));
        g.fillStyle = '#d4a03e'; g.font = '11px Handjet'; g.fillText(PEOPLE.boss.short + ':', S.x + 10, sy + 4);
        g.fillStyle = '#ece3cf'; g.font = '13px Handjet';
        wrapText(sub.text.slice(0, shown), S.w - 24).slice(0, 2).forEach((l, i) => g.fillText(l, S.x + 10, sy + 18 + i * 15));
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      fx.draw(g, W, H, t, o.pain, cur && cur.glitch, o.painkiller);
      raf = requestAnimationFrame(frame);
    }

    play();
    raf = requestAnimationFrame(frame);
    return { close };
  }

  root.Meeting = { start };
})(typeof globalThis !== 'undefined' ? globalThis : this);
