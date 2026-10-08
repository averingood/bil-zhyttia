// Склеює логіку, кімнату і DOM. Стан гри змінюється лише через GameLogic.
(function () {
  'use strict';
  const G = window.GameLogic;
  const C = window.GAME_CONFIG;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const canvas = $('room');
  const room = new window.Room(canvas);
  const { W, H } = window.Room.size;

  let game = null;
  let phase = 'setup';       // setup | play | scene | cut | night | report | end
  let armed = null;          // дія, яку треба підтвердити другим натиском
  let workingT = 0;
  let lastZone = undefined;
  let lastWalking = null;
  let pending = null;        // дія, яку виконати, коли герой дійде до зони
  let lastPainSeen = null;    // щоб трусити картинку, щойно біль посилюється
  let lowIdle = 0;           // скільки герой стоїть без діла з порожньою душею
  // Міні-ігри від першої особи — кожну можна вимкнути окремо; вимкнена — результат рахується сам.
  // Пам'ятаємо між сесіями.
  const MINI_GAMES = [
    ['friends', 'Розмова з друзями'], ['work', 'Планерка (робота)'], ['games', 'Гра-пробіжка'],
    ['create', 'Синтезатор (пісня)'], ['read', 'Читання'], ['cook', 'Готування'], ['exercise', 'ЛФК на килимку'],
  ];
  let setupChoice = { money: C.setup.money.def, basePain: C.setup.basePain.def };
  let gamesOn = loadGames();
  function loadGames() {
    const all = (v) => Object.fromEntries(MINI_GAMES.map(([id]) => [id, v]));
    try {
      const saved = JSON.parse(localStorage.getItem('zapas.games') || 'null');
      if (saved) return Object.assign(all(true), saved);
      return all(localStorage.getItem('zapas.scenes') !== '0');   // старе спільне налаштування
    } catch (e) { return all(true); }
  }
  function saveGames() { try { localStorage.setItem('zapas.games', JSON.stringify(gamesOn)); } catch (e) { /* не страшно */ } }
  const gameOn = (id) => !!gamesOn[id];

  // Налагодження: на localhost (чи з ?debug) — кнопки скинути сфери до нуля.
  const DEBUG = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || /[?&]debug\b/.test(location.search);
  const STATE_COLOR = { light: 'var(--light)', medium: 'var(--medium)', strong: 'var(--strong)' };
  const SPH_COLOR = { money: 'var(--money)', people: 'var(--joy)', body: 'var(--light)', soul: 'var(--soul)' };
  const SPH_HEX = { money: '#e6c35a', people: '#e58fa8', body: '#8fcf7e', soul: '#8fb4ff', pain: '#df5b4f' };
  const dayWord = (n) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'день' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'дні' : 'днів'; };

  // ---------- розмір полотна ----------
  function fit() {
    const wrap = $('canvasWrap');
    const aw = wrap.clientWidth, ah = wrap.clientHeight;
    if (!aw || !ah) return;
    let k = Math.min(aw / W, ah / H);
    if (k >= 2 && Math.floor(k) / k > 0.9) k = Math.floor(k);
    k = Math.max(1, k);
    canvas.style.width = Math.round(W * k) + 'px';
    canvas.style.height = Math.round(H * k) + 'px';
  }
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe($('canvasWrap'));

  // ---------- головний цикл ----------
  let prev = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    if (workingT > 0) workingT -= dt;
    if (game) {
      room.setView({
        slot: phase === 'night' ? 4 : phase === 'doctor' ? 3 : G.dayPhase(game),
        pain: G.pain(game),
        state: G.stateKey(game),
        working: workingT > 0,
        food: game.foodType,
        night: phase === 'night',
        joy: game.soul * 10,
        mess: 0,
        invite: phase === 'play' && !!G.inviteToday(game),
      });
    }
    // Порожня душа: постоявши без діла, герой сам сідає на мішок.
    if (game && phase === 'play' && game.soul <= 1 && !room.visit && !room.cut && !room.walking && !room.hero.sitting && !room.bubble) {
      lowIdle += dt;
      if (lowIdle > 3) { lowIdle = 0; room.slumpToBag(); }
    } else lowIdle = 0;
    // Біль посилився — картинка здригається. Перевіряємо, лише коли гравець бачить кімнату (без вікон зверху).
    if (game && (phase === 'play' || phase === 'scene') && $('modal').hidden) {
      const p = G.pain(game);
      if (lastPainSeen != null && p > lastPainSeen) shake();
      lastPainSeen = p;
    }
    room.update(dt);
    room.render();
    { const sk = $('skipBtn'), want = !!game && (((phase === 'scene' || phase === 'doctor') && !!sceneAbort) || phase === 'cut' || canSkipAnim()); if (sk.hidden === want) sk.hidden = !want; }
    const cap = $('cutCaption'), text = room.cut ? room.cut.caption : '';
    if (cap.textContent !== text) cap.textContent = text;
    cap.hidden = !text;
    const z = room.currentZone();
    if (z !== lastZone || room.walking !== lastWalking) {
      lastZone = z; lastWalking = room.walking;
      if (z !== armed) armed = null;
      renderActions();
      renderChips();
    }
    requestAnimationFrame(frame);
  }

  function shake() {
    const w = $('canvasWrap');
    w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake');
  }

  // ---------- миша і клавіші ----------
  function canvasPoint(e) {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  }
  canvas.addEventListener('click', (e) => {
    if (phase === 'cut') { room.skipCut(); return; }
    if (phase !== 'play') return;
    room.clickAt(...canvasPoint(e));
  });
  canvas.addEventListener('mousemove', (e) => {
    const [x, y] = canvasPoint(e);
    const z = room.hitZone(x, y);
    const lab = $('hoverLabel');
    canvas.classList.toggle('pointer', !!z);
    if (!z || phase !== 'play') { lab.hidden = true; return; }
    const a = room.zoneAnchor(z);
    const r = canvas.getBoundingClientRect(), wr = $('canvasWrap').getBoundingClientRect();
    lab.textContent = G.ZONES[z].name;
    lab.style.left = (r.left - wr.left + (a[0] / W) * r.width) + 'px';
    lab.style.top = (r.top - wr.top + (a[1] / H) * r.height) + 'px';
    lab.hidden = false;
  });
  canvas.addEventListener('mouseleave', () => { $('hoverLabel').hidden = true; });

  const held = new Set();
  const DIRS = {
    ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
    ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
  };
  function applyKeys() {
    let x = 0, y = 0;
    for (const k of held) { x += DIRS[k][0]; y += DIRS[k][1]; }
    room.setKeys(Math.sign(x), Math.sign(y));
  }
  // Esc — «Пропустити»: сцену від першої особи, анімацію чи фінал. Слухаємо першими (capture),
  // щоб сцени не перехопили клавішу.
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || !game || !$('modal').hidden) return;
    if (((phase === 'scene' || phase === 'doctor') && sceneAbort) || phase === 'cut' || canSkipAnim()) {
      e.preventDefault(); e.stopImmediatePropagation();
      skipNow(); renderAll();
    }
  }, true);
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Escape' && !$('gamesMenu').hidden) { $('gamesMenu').hidden = true; return; }
    if (!$('modal').hidden) {
      if (e.code === 'Escape' && modalClosable) closeModal();
      return;
    }
    if (phase === 'cut' && (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape')) { room.skipCut(); return; }
    if (phase !== 'play') return;
    if (DIRS[e.code]) { held.add(e.code); applyKeys(); e.preventDefault(); return; }
    if (/^Digit[1-9]$/.test(e.code)) {
      const z = room.currentZone();
      if (!z) return;
      const a = G.zoneActions(game, z)[Number(e.code.slice(5)) - 1];
      if (a) act(a.id);
      return;
    }
    if (e.code === 'KeyE') endDayClick();
    if (e.code === 'KeyM') toggleGamesMenu();
    if (e.code === 'KeyJ') showJournal();
  });
  window.addEventListener('keyup', (e) => { if (DIRS[e.code]) { held.delete(e.code); applyKeys(); } });
  window.addEventListener('blur', () => { held.clear(); applyKeys(); });

  // ---------- дії ----------
  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
  }

  // Спільне для сцен від першої особи.
  function sceneOpts(extra) {
    return Object.assign({
      wrap: $('canvasWrap'), bar: $('actionBar'),
      pain: G.pain(game), state: G.stateKey(game), painkiller: game.painkiller, joy: game.soul * 10,
    }, extra);
  }
  // «Пропустити»: закриває сцену, і результат рахується так, ніби міні-ігри вимкнені.
  let sceneAbort = null, sceneSkipped = false;
  function runScene(Scene, extra, toOpts, id, p) {
    phase = 'scene';
    held.clear(); applyKeys();
    sceneSkipped = false;
    Scene.start(sceneOpts(Object.assign({}, extra, {
      registerAbort: (fn) => { sceneAbort = fn; },
      onDone: (res) => { sceneAbort = null; phase = 'play'; finishAction(id, p, sceneSkipped ? null : toOpts(res)); },
    })));
    renderAll();
  }
  function skipNow() {
    if (phase === 'cut') { room.skipCut(); return; }
    // Звичайні анімації: візит друзів, бульбашка дії, світіння монітора.
    if (room.visit && room.skipVisit()) { renderAll(); return; }
    if (room.bubble || workingT > 0) { room.bubble = null; workingT = 0; return; }
    if ((phase === 'scene' || phase === 'doctor') && sceneAbort) { sceneSkipped = true; sceneAbort(); }
  }

  function act(id) {
    if (phase !== 'play') return;
    const p = G.preview(game, id);
    if (!p.available) {
      G.doAction(game, id);   // щоденник запам'ятовує спробу
      toast(p.reason);
      renderAll();
      return;
    }
    if (p.borrow && armed !== id) {   // узяти наперед — лише другим натиском
      armed = id;
      renderActions();
      return;
    }
    armed = null;
    if (id !== 'friends') room.endVisit(false);
    if (gameOn('create') && id === 'create' && window.SynthGame) return runScene(window.SynthGame, { title: G.songTitle(game) }, (r) => ({ synth: r }), id, p);
    if (gameOn('games') && id === 'games' && window.RunGame) return runScene(window.RunGame, { jumps: C.actions.games.jumps, painChance: C.actions.games.painChance }, (r) => ({ runner: r }), id, p);
    if (gameOn('cook') && id === 'cook' && window.CookGame) return runScene(window.CookGame, {}, (r) => ({ cook: r }), id, p);
    if (gameOn('exercise') && id === 'exercise' && window.MatGame) return runScene(window.MatGame, {}, (r) => ({ mat: r }), id, p);
    if (gameOn('work') && id === 'work' && window.Meeting) return runScene(window.Meeting, { canvas, payDay: game.day + C.actions.work.payDelay }, (r) => ({ score: r.score }), id, p);
    if (id === 'friends') {
      // Покликав сам — друзі можуть прийти голодні: вибір, чим пригостити.
      if (!G.inviteToday(game) && game.hungryNow == null && G.rollHungry(game)) { askFeed(p); return; }
      finishAction(id, p);
      return;
    }
    if (gameOn('read') && id === 'read' && window.ReadGame) {
      const b = G.bookNow(game);
      return runScene(window.ReadGame, { book: b ? b[0] : '', session: game.book.done + 1, sessions: b ? b[1] : 0 }, () => ({}), id, p);
    }
    finishAction(id, p);
  }

  // ---------- що змінила дія: коротка нотатка над кімнатою ----------
  function snap() {
    return {
      money: game.money, people: game.people, body: game.body, soul: game.soul, spoons: game.spoons, pain: G.pain(game),
      pending: game.pending.reduce((a, x) => a + x.amount, 0), fed: game.fed, bookI: game.book.i, songN: game.song.n,
      tomorrow: game.spoonTomorrow, future: game.future.length,
    };
  }
  // tags — що саме сталося (з логіки): «гості прийшли голодні: −10 ₴». Те, що вони пояснюють, не дублюємо голою цифрою.
  const HUNGRY_LINES = ['Ми голодні як вовки. Нагодуєш?', 'Йдемо просто з роботи, нічого не їли. Є щось у холодильнику?', 'Слухай, а в тебе є що поїсти? Ми ще не обідали.'];
  // Друзі голодні: нагодувати за гроші чи лишити голодними (Стосунки −1).
  function askFeed(p) {
    const F = C.actions.friends, can = game.money >= F.treat;
    phase = 'ask';
    openModal(`<h2>Друзі голодні</h2>
      <p>«${esc(HUNGRY_LINES[Math.floor(Math.random() * HUNGRY_LINES.length)])}»</p>
      <div class="row"><button class="btn primary" data-feed="yes" ${can ? '' : 'disabled'}>Нагодувати · −${F.treat} ₴</button>
      <button class="btn" data-feed="no">Нічим пригостити · Стосунки −1</button></div>
      ${can ? '' : '<p class="sub">Грошей на їжу немає.</p>'}`, false);
    $('modal').querySelectorAll('[data-feed]').forEach((b) => { b.onclick = () => { closeModal(); phase = 'play'; finishAction('friends', p, { feed: b.dataset.feed === 'yes' }); }; });
    $('modal').querySelector(can ? '[data-feed=yes]' : '[data-feed=no]').focus();
  }
  function showDelta(b, title, tags) {
    const a = snap(), parts = title ? [{ t: title, k: 'ttl' }] : [];
    const covered = new Set();
    for (const tg of tags || []) { parts.push({ t: tg.t, k: tg.k || '' }); (tg.covers || []).forEach((c) => covered.add(c)); }
    const sg = (v) => (v > 0 ? '+' : '−') + Math.abs(v);
    for (const k of ['people', 'body', 'soul']) if (a[k] !== b[k] && !covered.has(k)) parts.push({ t: G.SPHERES[k].name + ' ' + sg(a[k] - b[k]), k: a[k] > b[k] ? 'good' : 'bad' });
    if (a.pending > b.pending) parts.push({ t: '+' + (a.pending - b.pending) + ' ₴ через ' + C.actions.work.payDelay + ' дні', k: 'good' });
    if (a.money !== b.money && !covered.has('money')) parts.push({ t: sg(a.money - b.money) + ' ₴', k: a.money > b.money ? 'good' : 'bad' });
    if (a.pain !== b.pain) parts.push({ t: 'біль ' + b.pain + '→' + a.pain, k: a.pain < b.pain ? 'good' : 'bad' });
    if (a.tomorrow > b.tomorrow) parts.push({ t: 'завтра ресурс −' + (a.tomorrow - b.tomorrow), k: 'bad' });
    if (a.future > b.future) { const f = game.future[game.future.length - 1]; parts.push(f.kind === 'relief' ? { t: 'день ' + f.day + ': біль −' + f.amount, k: 'good' } : { t: 'завтра відкат +' + f.amount, k: 'bad' }); }
    if (a.fed && !b.fed && !covered.has('fed')) parts.push({ t: game.foodType === 'guests' ? 'друзі нагодували' : 'їжа на день є', k: game.foodType === 'guests' ? 'good' : '' });
    if (a.bookI > b.bookI) parts.push({ t: 'дочитав «' + game.lastBookDone + '»!', k: 'good' });
    if (a.songN > b.songN) parts.push({ t: 'дописав «' + game.lastSongDone + '»!', k: 'good' });
    if (parts.length <= (title ? 1 : 0)) return;
    const el = document.createElement('div');
    el.className = 'delta';
    el.innerHTML = parts.map((x) => `<span class="${x.k}">${esc(x.t)}</span>`).join('');
    $('canvasWrap').appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }

  function finishAction(id, p, opts) {
    const talk = id === 'friends' && window.FriendTalk && gameOn('friends');
    const before = snap();
    const r = G.doAction(game, id, Object.assign({}, opts, talk ? { deferTalk: true } : null));
    if (r.ok) showDelta(before, null, r.tags);
    // Друзі: зайшли, сіли — і тоді розмова від першої особи; після неї прощаються.
    room.playAction(id, r.guests, talk ? () => startTalk(r.guests) : null);
    if (talk) {
      phase = 'scene';
      held.clear(); applyKeys();
      $('actionBar').innerHTML = `<div class="sc-head"><span class="ab-zone">У гостях</span><span class="ab-meta">${esc(r.guests.join(' і '))} ${r.guests.length > 1 ? 'заходять' : 'заходить'}…</span></div>`;
    }
    if (id === 'work' || id === 'games') workingT = 1.8;   // монітор світиться лише від роботи й ігор
    if (r.borrowed) toast('Узяв наперед ресурс ' + r.borrowed + ': завтра на стільки менше, і шанс загострення вночі +' + Math.round(C.night.exhausted * 100) + '%.');
    renderAll();
  }

  function startTalk(names) {
    phase = 'scene';
    held.clear(); applyKeys();
    sceneSkipped = false;
    window.FriendTalk.start(sceneOpts({
      canvas, names, invited: !!game.lastVisitInvited, missedLast: !!game.lastTalkMissed, used: game.talkUsed || (game.talkUsed = []),
      registerAbort: (fn) => { sceneAbort = fn; },
      onDone: (res) => {
        sceneAbort = null;
        const before = snap();
        // Пропущено: розмова «сама» — біль іноді не дає почути суть.
        const kinds = sceneSkipped ? G.autoTalkKinds(game) : res.kinds;
        const note = G.applyTalk(game, kinds);
        showDelta(before, { good: 'Розмова вдалась:', meh: 'Розмова так собі:', bad: 'Розмова не склалась:' }[game.lastTalk]);
        const j = game.journal.find((e) => e.day === game.day);
        if (j && j.did.length && note) j.did[j.did.length - 1] = j.did[j.did.length - 1].replace(/\)$/, '; ' + note + ')');
        phase = 'play';
        room.endVisit(false);
        renderAll();
      },
    }));
    renderAll();
  }

  function endDayClick() {
    if (phase !== 'play') return;
    const fc = G.forecastNight(game);
    if (fc && (fc.lost || fc.hospital)) {
      const title = fc.lost ? 'Після цієї ночі гра закінчиться' : 'Цієї ночі доведеться в лікарню';
      const text = fc.lost ? esc(lossWarning(fc.lost)) : `Біль дійде до 10, приїде швидка: день випаде, −${C.hospital.cost} ₴.`;
      openModal(`
        <h2>${title}</h2>
        <p>${text} Можна ще щось змінити, якщо лишився ресурс.</p>
        <div class="row">
          <button class="btn" data-k="back">Повернутися</button>
          <button class="btn primary" data-k="go">Завершити день</button>
        </div>`, true);
      $('modal').querySelector('[data-k=back]').onclick = closeModal;
      $('modal').querySelector('[data-k=go]').onclick = () => { closeModal(); doEndDay(); };
      return;
    }
    doEndDay();
  }

  function doEndDay() {
    const dayWas = game.day, left = game.spoons;
    const r = G.endDay(game);
    room.endVisit(true);
    armed = null;
    if (r.doctor) { doctorScene(r.doctor, () => afterNight(r, dayWas, left)); return; }
    afterNight(r, dayWas, left);
  }
  function afterNight(r, dayWas, left) {
    // Лікарня з поверненням додому — лише якщо гра триває; якщо ця ніч кінцева, буде одна фінальна сцена.
    if (r.hospital && !game.lost) {
      phase = 'cut';
      held.clear(); applyKeys();
      room.playHospital(1, dayWas + 1, () => { $('cutCaption').hidden = true; nightReport(r, dayWas, left); });
      renderAll();
      return;
    }
    nightReport(r, dayWas, left);
  }

  // Прийом у лікаря: заходить, сідає з тобою на диван і по черзі каже висновки за тиждень.
  function doctorScene(v, next) {
    phase = 'doctor';
    held.clear(); applyKeys();
    const bar = $('actionBar');
    let shown = 0, done = false, keyH = null;
    const finish = () => {
      if (done) return;
      done = true; sceneAbort = null;
      if (keyH) window.removeEventListener('keydown', keyH, true);
      room.endVisit(false);   // прощається й іде
      const b = v.after - v.before;
      showDelta(snap(), null,
        [{ t: (v.final ? 'Фінальний огляд: ' : 'Лікар: ') + (b ? 'базовий біль ' + v.before + ' → ' + v.after : 'базовий біль без змін (' + v.after + ')'), k: b < 0 ? 'good' : b > 0 ? 'bad' : '' }]);
      next();
    };
    const draw = () => {
      const last = shown >= v.lines.length;
      bar.innerHTML = `<div class="sc-head"><span class="ab-zone">${v.final ? 'Фінальний огляд' : 'Прийом у лікаря'}</span><span class="ab-meta">день ${v.day}</span></div>
        <ul class="doc-lines">${v.lines.slice(0, shown).map((l) => `<li class="${l.k}">${esc(l.t)}</li>`).join('')}</ul>
        ${shown ? `<div class="sc-answers"><button class="ans primary doc-next" type="button"><kbd>Пробіл</kbd>${last ? 'Попрощатися' : 'Далі'}</button></div>` : '<p class="sc-msg">Лікар заходить…</p>'}`;
      const b = bar.querySelector('.doc-next');
      if (b) b.onclick = step;
    };
    const step = () => { if (done) return; if (shown >= v.lines.length) { finish(); return; } shown++; room.say(0, 'talk'); draw(); };
    keyH = (e) => { if (shown && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); e.stopPropagation(); step(); } };
    window.addEventListener('keydown', keyH, true);
    sceneAbort = () => { shown = v.lines.length; finish(); };
    room.startVisit(['Лікар'], () => { shown = 1; room.say(0, 'talk'); draw(); }, false, true);
    draw();
    renderAll();
  }

  // Початок тижня: що перевірить лікар. Далі гра не нагадує — тримаєш у голові сам.
  function weekIntro() {
    const D = C.doctor, w = Math.floor((game.day - 1) / D.week) + 1, docDay = D.days[w - 1];
    if (!docDay || (game.day - 1) % D.week) return;
    const final = docDay === D.days[D.days.length - 1];
    // Лише призначення — без наслідків: з ними гравець стикається на прийомі.
    openModal(`<h2>Тиждень ${w} з ${D.days.length}</h2>
      <p>Увечері ${docDay}-го дня — ${final ? 'фінальний огляд у лікаря' : 'прийом лікаря'}. Він подивиться, як минув тиждень.</p>
      <p>Вам прописано:</p>
      <ul class="tl">
        <li><b>Пігулки з курсу</b> (аптечка): 1 в день</li>
        <li><b>ЛФК</b> (килимок): ${D.lfk.good}+ рази на тиждень</li>
      </ul>
      <div class="row"><button class="btn primary" id="wkOk">Зрозуміло</button></div>`, true);
    $('wkOk').onclick = closeModal;
    $('wkOk').focus();
  }

  function nightReport(r, dayWas, left) {
    phase = r.hospital ? 'report' : 'night';
    const items = r.events.length ? r.events : [{ kind: '', text: 'Тиха ніч.' }];
    openModal(`
      <h2>${r.hospital ? 'Швидка і лікарня' : 'Ніч після дня ' + dayWas}</h2>
      ${left > 0 ? `<p class="sub">Лишився ресурс: ${left}.</p>` : ''}
      <ul class="night-list">${items.map((e) => `<li class="${e.kind}">${esc(e.text)}</li>`).join('')}</ul>
      <div class="row"><button class="btn primary" data-k="go">${game.lost || game.finished ? 'Підсумок' : 'Ранок дня ' + game.day}</button></div>
    `, false);
    const go = $('modal').querySelector('[data-k=go]');
    go.focus();
    go.onclick = () => {
      closeModal();
      if (game.lost || game.finished) { showEnd(); return; }
      phase = 'play';
      if (!r.hospital) { room.hero.x = window.Room.STAND.sofa[0]; room.hero.y = window.Room.STAND.sofa[1]; }
      room.path = [];
      toast('Ранок дня ' + game.day + '. Біль ' + G.pain(game) + ', ' + C.states[G.stateKey(game)].name.toLowerCase() +
        '. Ресурс: ' + game.spoons + (r.flare ? '. Уночі було загострення.' : '.') + inviteNote());
      renderAll();
      weekIntro();
    };
    renderAll();
  }

  // ---------- рядок дій ----------
  function renderActions() {
    const el = $('actionBar');
    if (tipIndex == null) $('tipBox').hidden = true;   // підказка значка 🎮 не має лишатися після перемальовки
    if (phase === 'scene' || phase === 'cut' || phase === 'doctor') return;
    if (!game || phase === 'setup') { el.innerHTML = ''; return; }
    const z = room.currentZone();
    const banner = gigBanner() + inviteBanner();
    const meta = 'Лишилось ресурсу: ' + game.spoons + ' з ' + game.spoonsMorning + (game.borrowed ? ' · узято наперед ' + game.borrowed : '');
    if (!z) {
      el.innerHTML = banner + `<div class="ab-head"><span class="ab-zone">${room.walking ? 'Іде…' : 'Квартира'}</span><span class="ab-meta">${meta}</span></div>
        <p class="ab-empty">Клікни на меблі або йди стрілками. Біля зони з'являться дії, клавіші 1–9 їх обирають.
        ${game.spoons === 0 ? '<br>Ресурс скінчився. Можна взяти наперед — або лягти (E).' : ''}</p>`;
      bindInvite(el);
      return;
    }
    const list = G.zoneActions(game, z);
    el.innerHTML = banner + `<div class="ab-head"><span class="ab-zone">${esc(G.ZONES[z].name)}</span><span class="ab-meta">${meta}</span></div>
      <div class="ab-list">${list.map((a, i) => actionButton(a, i)).join('')}</div>`;
    el.querySelectorAll('.act').forEach((b) => { b.onclick = () => act(b.dataset.id); });
    bindInvite(el);
    fitBar(el);
  }
  // Підказка до значка 🎮 — у плаваючому вікні (рядок дій обрізає все, що виходить за край).
  function bindPads(el) {
    el.querySelectorAll('.pad').forEach((ic) => {
      ic.onmouseenter = () => { const box = $('tipBox'), r = ic.getBoundingClientRect(); box.innerHTML = '<p><b>Тут міні-гра від першої особи.</b></p><p>Не хочеш її — вимкни в меню «Міні-ігри» над кімнатою (клавіша M): тоді результат порахується сам.</p>'; box.hidden = false;
        box.style.left = Math.max(12, Math.min(r.left - box.offsetWidth + r.width, window.innerWidth - box.offsetWidth - 12)) + 'px'; box.style.top = Math.max(12, r.top - box.offsetHeight - 8) + 'px'; };
      ic.onmouseleave = () => { if (tipIndex == null) $('tipBox').hidden = true; };
    });
  }
  // Без прокрутки: якщо на вузькому екрані не влазить — блок підростає, а не ріже вміст.
  function fitBar(el) { el.style.height = ''; if (el.scrollHeight > el.clientHeight + 1) el.style.height = 'auto'; }

  function inviteBanner() {
    const inv = G.inviteToday(game);
    if (!inv || phase !== 'play') return '';
    const p = G.preview(game, 'friends');
    return `<div class="invite"><span class="inv-msg"><b>${esc(inv.name)}</b> пише: «${esc(G.inviteText(inv))}»</span>
      <span class="inv-btns">
        <button class="btn primary" data-inv="yes" ${p.available ? '' : 'aria-disabled="true"'}>Покликати${p.cost != null ? ' · ресурс ' + p.cost : ''}${p.available && gameOn('friends') ? ' ' + padIcon() : ''}</button>
        <button class="btn" data-inv="no">Відмовити · Стосунки −${C.friends.refuse}</button>
      </span>
      ${p.available && p.borrow ? `<span class="warn">Наперед ${p.borrow}: завтра на стільки менше ресурсу</span>` : ''}
      ${!p.available ? `<span class="warn">${esc(p.reason)}</span>` : ''}</div>`;
  }
  // Підробіток від друга — пропозиція, як запрошення: взятися чи відмовитись.
  function gigBanner() {
    const g = G.gigToday(game);
    if (!g || phase !== 'play') return '';
    const p = G.preview(game, 'gig'), A = C.actions.gig;
    return `<div class="invite"><span class="inv-msg"><b>${esc(g.from)}</b> пропонує підробіток на сьогодні: +${A.pay} ₴ одразу.</span>
      <span class="inv-btns">
        <button class="btn primary" data-gig="yes" ${p.available ? '' : 'aria-disabled="true"'}>Взятися · ресурс ${A.spoons}</button>
        <button class="btn" data-gig="no">Відмовитись · Настрій −${A.refuse}</button>
      </span>${!p.available ? `<span class="warn">${esc(p.reason)}</span>` : ''}</div>`;
  }
  function bindInvite(el) {
    const gy = el.querySelector('[data-gig=yes]'), gn = el.querySelector('[data-gig=no]');
    if (gy) gy.onclick = () => { if (phase === 'play') act('gig'); };
    if (gn) gn.onclick = () => { if (phase !== 'play') return; const b = snap(); const r = G.refuseGig(game); if (r) { toast(r.text); showDelta(b, 'Відмовився від підробітку:'); } renderAll(); };
    bindPads(el);
    const yes = el.querySelector('[data-inv=yes]'), no = el.querySelector('[data-inv=no]');
    if (yes) yes.onclick = acceptInvite;
    if (no) no.onclick = declineInvite;
  }
  function acceptInvite() {
    if (phase !== 'play') return;
    if (room.currentZone() === 'sofa') { act('friends'); return; }
    pending = 'friends';
    room.walkToZone('sofa');
  }
  function declineInvite() {
    if (phase !== 'play') return;
    const b = snap();
    const r = G.refuseInvite(game);
    if (r) { toast(r.text); showDelta(b, 'Відмовив ' + (r.nameDat || r.name) + ':'); }
    renderAll();
  }
  room.onArrive = (z) => {
    const id = pending;
    pending = null;
    if (id && G.ACTIONS[id].zone === z) act(id);
  };

  // Значок 🎮 — на діях, чия міні-гра зараз увімкнена.
  function padIcon() { return '<span class="pad" aria-label="Міні-гра від першої особи">🎮</span>'; }
  function actionButton(a, i) {
    const cost = a.cost == null ? '' : a.cost === 0 ? 'без ресурсу' : 'ресурс ' + a.cost;
    let body;
    if (!a.available) body = `<span class="a-why">${esc(a.reason)}</span>`;
    else {
      body = `<span class="a-fx">${a.effects.map((f) => `<span class="${f.kind}">${esc(f.t)}</span>`).join(' · ')}</span>`;
      if (a.borrow) body += `<span class="a-warn${armed === a.id ? ' fatal' : ''}">${armed === a.id ? 'Натисни ще раз, щоб узяти ' + a.borrow + ' наперед.' : 'Бракує ресурсу: доведеться взяти ' + a.borrow + ' з завтра.'}</span>`;
    }
    const cls = ['act', a.available ? '' : 'off', armed === a.id ? 'armed' : ''].join(' ');
    const pad = gameOn(a.id) && a.available ? padIcon() : '';
    return `<button class="${cls}" data-id="${a.id}" aria-disabled="${!a.available}">
      <kbd>${i + 1}</kbd><span class="a-name">${esc(a.label)}</span><span class="a-cost">${cost}</span>${body}${pad}</button>`;
  }

  function renderChips() {
    const el = $('zoneChips');
    if (!game || phase === 'setup') { el.innerHTML = ''; return; }
    const here = room.currentZone();
    el.innerHTML = Object.keys(G.ZONES).map((z) =>
      `<button class="chip ${z === here ? 'here' : ''}" data-z="${z}">${esc(G.ZONES[z].name)}</button>`).join('');
    el.querySelectorAll('.chip').forEach((b) => { b.onclick = () => { if (phase === 'play') room.walkToZone(b.dataset.z); }; });
  }

  // ---------- бокова панель ----------
  const triSvg = (cls) => `<i class="tri ${cls}"></i>`;

  // Гроші показуємо в ₴, а шкалу — по 20 ₴ на поділку.
  // «1–2 → 6, 3–4 → 5, …» із таблиці ресурсу за болем.
  function spoonRanges() {
    const out = []; let from = 1;
    for (let p = 1; p <= C.painMax; p++) if (p === C.painMax || C.spoons[p + 1] !== C.spoons[p]) { out.push((from === p ? p : from + '–' + p) + ' → ' + C.spoons[p]); from = p + 1; }
    return out.join(', ');
  }
  function sphereSec(s, k, tip) {
    const isMoney = k === 'money';
    const v = isMoney ? Math.round(s.money / 20) : s[k];
    const danger = isMoney ? s.money < G.dailyCost(s.day) * 2 : v <= 2;
    const cells = Array.from({ length: C.sphereMax }, (_, i) => `<i class="${i < v ? 'on' : ''}"></i>`).join('');
    return `<div class="sec tipped sph ${danger ? 'danger' : ''}" tabindex="0" style="--c:${SPH_COLOR[k]}">
      <div class="sec-h"><span class="lbl">${G.SPHERES[k].name}</span><span class="val">${isMoney ? s.money + ' ₴' : v}</span></div>
      <div class="meter">${cells}</div>
      <div class="tip">${tip}<p class="why">${isMoney ? 'На нулі: ' + C.graceMoney + ' дні знайти гроші, інакше виселять.'
        : 'На нулі: день на порятунок. Запас криз ' + (C.crises - ((s.crisesUsed || {})[k] || 0)) + ' з ' + C.crises + '.'}</p></div></div>`;
  }

  function renderPanel() {
    const el = $('panel');
    if (!game) { el.innerHTML = ''; return; }
    const s = game, st = G.stateKey(s), p = G.pain(s), col = STATE_COLOR[st], L = C.links;

    // Ресурс і біль — одна шкала: повні трикутники — що лишилося, бліді — витрачене,
    // червоні — узяте наперед, рябі червоні — те, що зранку з'їв біль.
    const morningPain = (s.history[s.history.length - 1] || {}).pain || p;
    const eaten = Math.max(0, C.spoons[0] - C.spoons[Math.min(10, morningPain)]);
    const used = Math.max(0, s.spoonsMorning + s.coffeeToday * C.actions.coffee.gain - s.spoons);
    let tri = '';
    for (let i = 0; i < s.spoons; i++) tri += triSvg('on');
    for (let i = 0; i < used; i++) tri += triSvg('used');
    for (let i = 0; i < s.borrowed; i++) tri += triSvg('borrow');
    for (let i = 0; i < eaten; i++) tri += triSvg('eaten');

    const cal = G.calendar(s, 5).map((d, i) => `<div class="cd ${i === 0 ? 'today' : ''}"><span class="n">${d.day}</span>
      <span class="e-cost">−${d.cost}₴</span>${d.events.map((e) => `<span class="e-${e.k.split(' ')[0]} ${e.k.split(' ')[1] || ''}">${esc(e.t)}</span>`).join('')}</div>`).join('');

    const hints = G.hints(s);
    const fc = G.forecastNight(s);
    const flareP = Math.round(G.flareChanceTonight(s) * 100);
    const incoming = s.pending.slice().sort((a, b) => a.day - b.day).map((x) => `+${x.amount} ₴ на день ${x.day}`).join(', ') || 'нічого';

    el.style.boxShadow = `inset 0 0 ${Math.max(0, p - 3) * 9}px ${Math.max(0, p - 3) * 3}px rgba(5,5,12,.75)`;
    el.innerHTML = `
      <div class="p-head">
        <div class="p-day">День ${s.day} <small>з ${s.days}</small></div>
        <span class="sub">курс лікування</span>
      </div>

      <div class="sec tipped" tabindex="0">
        <div class="sec-h"><span class="lbl">Ресурс</span><span><span class="state-tag" style="--c:${col}">біль ${p}</span></span></div>
        <div class="tris">${tri}</div>
        <div class="tip">
          <p><b>Зараз:</b> лишилось ${s.spoons} з ${s.spoonsMorning}, виданих зранку${s.borrowed ? ' (ще ' + s.borrowed + ' взято наперед)' : ''}.${eaten ? ' Без болю було б ' + C.spoons[0] + ' — біль забрав ' + eaten + '.' : ''}</p>
          <p><b>Біль ${p}:</b> базовий ${s.base}${s.extra ? ', тимчасовий ' + (s.extra > 0 ? '+' : '−') + Math.abs(s.extra) : ''}. Шанс загострення вночі ${flareP}%.</p>
          <ul class="tl">
            <li><b>Ранок дає</b> за болем: ${spoonRanges()}. Настрій ${L.soulHigh}+ — ще +1.</li>
            <li><b>Бракує</b> — візьми до ${C.maxBorrow} із завтра (шанс загострення +${Math.round(C.night.exhausted * 100)}%). Лишиш ${C.night.earlyRest}+ — завтра біль −1.</li>
            <li><b>Біль заважає:</b> менше ресурсу й заробітку, зустрічі слабші; з болем 7+ не пишеш, не читаєш, не готуєш.</li>
            <li><b>Базовий біль</b> міняє лише лікар (дні ${C.doctor.days.join(', ')}): дивиться, як ти пив пігулки й робив ЛФК за тиждень.</li>
            <li><b>Тимчасово знижують:</b> ЛФК (−${C.actions.exercise.reliefToday} сьогодні й завтра), розтяжка, знеболювальне, процедура.</li>
            <li><b>Загострення частіші</b> від кави, знеболювального, перевтоми, слабкого Тіла й поганого настрою.</li>
          </ul>
        </div>
      </div>

      ${sphereSec(s, 'money', `<p><b>Зараз:</b> ${s.money} ₴, надійде: ${incoming}; уночі витрати ${G.dailyCost(s.day)} ₴.${s.loans.length ? ' Борги: ' + s.loans.map((l) => esc(l.from) + ' ' + l.amount + ' ₴ до дня ' + l.due).join(', ') + '.' : ''}</p>
        <ul class="tl">
          <li><b>Заробити:</b> робота (ресурс ${C.actions.work.spoons}, гроші через ${C.actions.work.payDelay} дні; біль і настрій змінюють суму), підробіток від друга.</li>
          <li><b>Витрати:</b> щоночі ${C.costs.join(' / ')} ₴ по тижнях; двічі на тиждень — несподіваний рахунок.</li>
          <li><b>Позика:</b> ${C.actions.loan.amount} ₴ на ${C.actions.loan.dueIn} днів у випадкового друга, якому ще не винен (до ${s.friendNames.length} боргів), Стосунки −${C.actions.loan.people}; не віддав вчасно — −${C.actions.loan.late}. Кому винен — той не приходить у гості.</li>
        </ul>`)}
      ${sphereSec(s, 'people', `<p><b>Зараз:</b> ${s.people}.${s.people >= L.peopleGood ? ' Близькі поруч — діють бонуси нижче.' : s.people < C.actions.loan.minPeople ? ' Позичити нема в кого.' : ''}</p>
        <ul class="tl">
          <li><b>Підняти:</b> покликати друзів +${C.actions.friends.people.light} (ресурс ${C.actions.friends.spoons}; покликав сам — ${Math.round(C.actions.friends.treatChance * 100)}%, що прийдуть голодні: −${C.actions.friends.treat} ₴), написати +${C.actions.text.people}, настолки раз на тиждень +${C.actions.board.people} за кожного, хто прийшов (${C.actions.board.money} ₴).</li>
          <li><b>Втрати:</b> відмова −${C.friends.refuse}, позика −${C.actions.loan.people}, підробіток −${C.actions.gig.people}, щоночі тане.</li>
          <li><b>${L.peopleGood}+ дає:</b> підробіток (${Math.round(L.gigChance * 100)}% щоночі, +${C.actions.gig.pay} ₴), гості з їжею (${Math.round(L.foodChance * 100)}%).</li>
        </ul>`)}
      ${sphereSec(s, 'body', `<p><b>Зараз:</b> ${s.body}; шанс загострення вночі ${flareP}%.</p>
        <ul class="tl">
          <li><b>Підняти:</b> ЛФК +${C.actions.exercise.body} (і біль −${C.actions.exercise.reliefToday} сьогодні й завтра), розтяжка +${C.actions.stretch.body}, своя їжа +${C.actions.cook.body}.</li>
          <li><b>Втрати:</b> без їжі −${C.hungry.body}, щоночі тане.</li>
          <li><b>Дає:</b> що міцніше, то рідше загострення: ${C.links.bodyFlare.map(([m, c], i, a) => (i === 0 ? m + '+' : i === a.length - 1 ? 'нижче' : m + '–' + (a[i - 1][0] - 1)) + ' → ' + Math.round(c * 100) + '%').join(', ')}.</li>
          <li><b>Лікар:</b> Тіло ${C.doctor.rescueBody} і нижче — платний укол, +${C.doctor.rescue} за ${C.doctor.rescueCost} ₴.</li>
        </ul>`)}
      ${sphereSec(s, 'soul', `<p><b>Зараз:</b> ${s.soul}.${s.soul >= L.soulGood ? ' Спокій допомагає.' : s.soul <= L.soulBad ? ' Пригніченість шкодить.' : ''}</p>
        <p>${(() => {
          const A = C.actions.create, R = C.actions.read, b = G.bookNow(s);
          const song = s.song.title && s.song.done ? 'Пісня «' + esc(s.song.title) + '»: ' + s.song.done + ' з ' + A.songSessions : 'Нова пісня: ' + A.songSessions + ' сесії';
          const book = !b ? 'книжки прочитані' : (s.book.done ? 'книжка «' + esc(b[0]) + '»: ' + s.book.done + ' з ' + b[1] : 'книжка «' + esc(b[0]) + '»: ' + b[1] + ' сесій');
          return song + ' (дописана +' + A.songSoul + '); ' + book + (b ? ' (дочитана +' + R.finishSoul + ')' : '') + '.';
        })()}</p>
        <ul class="tl">
          <li><b>Підняти:</b> пісня +${C.actions.create.soul[0]}, книжка +${C.actions.read.soul}, ігри +${C.actions.games.soul - 1}…+${C.actions.games.soul + 1}, смачна їжа +${C.actions.cook.soulIfTasty}.</li>
          <li><b>${L.soulGood}+ дає:</b> ресурс +1 зранку, загострення −${Math.round(L.soulFlare * 100)}%, робота +${L.soulPay} ₴. <b>${L.soulBad} і нижче:</b> загострення +${Math.round(L.soulFlare * 100)}%, робота −${L.soulPay} ₴.</li>
          <li><b>Втрати:</b> день у сильному болю −${L.strongSoul}, щоночі тане.</li>
        </ul>`)}

      <div class="sec">
        <span class="lbl">Календар</span>
        <div class="cal" style="grid-template-columns: repeat(5, 1fr)">${cal}</div>
      </div>

      <div class="sec">
        <span class="lbl">Плани</span>
        <ul class="hints">${hints.map((h) => `<li class="${h.kind}">${esc(h.t)}</li>`).join('')}</ul>
      </div>

      <div class="btns">
        <button class="btn primary ${s.spoons === 0 ? 'pulse' : ''}" id="endBtn">Завершити день <kbd>E</kbd></button>
        <button class="btn" id="journalBtn">Щоденник</button>
      </div>
      <div class="sub">Якщо лягти зараз: ${esc(G.sleepGainText(s))}.</div>
      <button class="btn ghost" id="restartBtn">Почати заново</button>
      ${DEBUG ? `<div class="dbg"><span class="sub">Налагодження (лише локально): скинути до нуля, потім завершити день</span>
        <div class="row">${['money', 'people', 'body', 'soul'].map((k) => `<button class="btn" data-zero="${k}">${G.SPHERES[k].name} → 0</button>`).join('')}</div></div>` : ''}
      ${fc && fc.lost ? `<div class="warn" style="color:var(--fatal)">${esc(lossWarning(fc.lost))}</div>` : ''}
    `;
    if (tipIndex != null) showTip(tipIndex);
    $('endBtn').onclick = endDayClick;
    $('journalBtn').onclick = showJournal;
    $('restartBtn').onclick = askRestart;
    document.querySelectorAll('[data-zero]').forEach((b) => { b.onclick = () => { if (phase !== 'play') return; game[b.dataset.zero] = 0; toast(G.SPHERES[b.dataset.zero].name + ' → 0. Заверши день, щоб побачити, що буде.'); renderAll(); }; });
  }

  // Попередження про кінець — чесно: що саме станеться і чи ще можна встигнути щось зробити сьогодні.
  function lossWarning(lost) {
    const k = lost.sphere, name = G.SPHERES[k].name, crisis = (game.crisis || {})[k];
    if (k === 'money') return crisis != null
      ? 'Сьогодні останній день знайти гроші. Не знайдеш — уночі виселять.'
      : 'Уночі гроші скінчаться, а часу на порятунок не лишиться: виселять.';
    if (crisis != null) return name + ' на нулі. Не піднімеш сьогодні — уночі кінець (' + lost.text.toLowerCase() + ').';
    if (game.day >= game.days) return 'Останній день: якщо ' + name.toLowerCase() + ' впаде до нуля, порятунку вже не буде.';
    return 'Уночі ' + name.toLowerCase() + ' впаде до нуля, а запасу криз уже немає — кінець (' + lost.text.toLowerCase() + ').';
  }

  // ---------- підказки секцій ----------
  let tipIndex = null;
  function showTip(i) {
    const secs = [...document.querySelectorAll('#panel .sec.tipped')], sec = secs[i], box = $('tipBox');
    if (!sec) { hideTip(); return; }
    tipIndex = i;
    box.innerHTML = sec.querySelector('.tip').innerHTML;
    box.hidden = false;
    const r = sec.getBoundingClientRect(), pr = $('panel').getBoundingClientRect(), bw = box.offsetWidth, bh = box.offsetHeight;
    let left, top;
    if (pr.left > bw + 24) { left = pr.left - bw - 12; top = r.top; }
    else { left = Math.max(12, r.left); top = r.bottom + 6; }
    top = Math.max(12, Math.min(top, window.innerHeight - bh - 12));
    box.style.left = left + 'px'; box.style.top = top + 'px';
  }
  function hideTip() { tipIndex = null; $('tipBox').hidden = true; }
  const secIndex = (el) => { const sec = el && el.closest && el.closest('#panel .sec.tipped'); return sec ? [...document.querySelectorAll('#panel .sec.tipped')].indexOf(sec) : -1; };
  $('panel').addEventListener('pointerover', (e) => { const i = secIndex(e.target); if (i >= 0 && i !== tipIndex) showTip(i); else if (i < 0) hideTip(); });
  $('panel').addEventListener('pointerleave', hideTip);
  $('panel').addEventListener('focusin', (e) => { const i = secIndex(e.target); if (i >= 0) showTip(i); });
  $('panel').addEventListener('focusout', hideTip);
  $('panel').addEventListener('scroll', () => { if (tipIndex != null) showTip(tipIndex); });

  function askRestart() {
    if (phase !== 'play') return;
    openModal(`
      <h2>Почати заново?</h2>
      <p>Поточна гра (день ${game.day} з ${game.days}) пропаде.</p>
      <div class="row">
        <button class="btn" data-k="back">Повернутися</button>
        <button class="btn primary" data-k="go">Почати заново</button>
      </div>`, true);
    $('modal').querySelector('[data-k=back]').onclick = closeModal;
    $('modal').querySelector('[data-k=go]').onclick = () => { room.endVisit(true); showSetup(); };
    $('modal').querySelector('[data-k=back]').focus();
  }

  function renderAll() { renderPanel(); renderActions(); renderChips(); renderSceneToggle(); }

  function canSkipAnim() { return (room.visit && !(room.visit.hold && (phase === 'scene' || phase === 'doctor') && sceneAbort)) || !!room.bubble || workingT > 0; }
  function renderSceneToggle() {
    const sk = $('skipBtn');
    if (sk) sk.hidden = !game || !(((phase === 'scene' || phase === 'doctor') && sceneAbort) || phase === 'cut' || canSkipAnim());
    const b = $('sceneTog');
    b.hidden = !game || phase === 'setup' || phase === 'scene' || phase === 'cut';
    const n = MINI_GAMES.filter(([id]) => gameOn(id)).length;
    b.classList.toggle('on', n > 0);
    b.innerHTML = 'Міні-ігри: ' + n + ' з ' + MINI_GAMES.length + ' ▾ <kbd>M</kbd>';
    if (b.hidden) $('gamesMenu').hidden = true;
  }
  // Меню міні-ігор: галочка — граєш сам, без галочки — результат рахується автоматично.
  function renderGamesMenu() {
    const m = $('gamesMenu');
    m.innerHTML = `<p class="gm-head">Від першої особи:</p>${MINI_GAMES.map(([id, name]) =>
      `<label class="gm-row"><input type="checkbox" data-g="${id}" ${gameOn(id) ? 'checked' : ''}><span>${esc(name)}</span></label>`).join('')}
      <p class="gm-note">Без галочки — дія без гри, результат рахується сам.</p>
      <div class="gm-btns"><button class="btn" type="button" data-all="1">Усі</button><button class="btn" type="button" data-all="0">Жодної</button></div>`;
    m.querySelectorAll('[data-g]').forEach((c) => { c.onchange = () => { gamesOn[c.dataset.g] = c.checked; saveGames(); renderAll(); }; });
    m.querySelectorAll('[data-all]').forEach((b) => { b.onclick = () => { MINI_GAMES.forEach(([id]) => { gamesOn[id] = b.dataset.all === '1'; }); saveGames(); renderGamesMenu(); renderAll(); }; });
  }
  function toggleGamesMenu() {
    const m = $('gamesMenu');
    if (m.hidden && phase !== 'play') return;
    m.hidden = !m.hidden;
    if (!m.hidden) renderGamesMenu();
  }
  $('sceneTog').onclick = (e) => { e.stopPropagation(); toggleGamesMenu(); };
  $('gamesMenu').onclick = (e) => e.stopPropagation();
  document.addEventListener('click', () => { $('gamesMenu').hidden = true; });
  $('skipBtn').onclick = () => { skipNow(); renderAll(); };

  // ---------- вікна ----------
  let modalClosable = false;
  function openModal(html, closable) {
    modalClosable = !!closable;
    const m = $('modal');
    m.innerHTML = `<div class="dlg" role="dialog" aria-modal="true">${html}</div>`;
    m.hidden = false;
    held.clear(); applyKeys();
  }
  function closeModal() { $('modal').hidden = true; $('modal').innerHTML = ''; }

  function showSetup() {
    phase = 'setup';
    const SU = C.setup;
    const slider = (key, label, r, unit, note) => `
      <label class="opt setup-row"><span>${label}</span>
        <input type="range" id="su-${key}" min="${r.min}" max="${r.max}" step="${r.step || 1}" value="${setupChoice[key]}">
        <b id="su-${key}-v">${setupChoice[key]}${unit}</b><small>${note}</small></label>`;
    openModal(`
      <h1>Біль життя</h1>
      <p>Ти живеш із хронічним болем і проходиш ${C.days}-денний курс лікування. Щоранку біль вирішує, скільки в тебе <b>ресурсу</b> — сил на день; решту з'їдає біль.
      Кожна справа коштує ресурсу. На них тримаються чотири сфери життя: <b>Гроші</b>, <b>Стосунки</b>, <b>Тіло</b> і <b>Настрій</b>. Щоночі кожна трохи тане, а життя тисне дедалі сильніше.</p>
      <div class="opts"><span class="lbl">Твоє життя</span>
        ${slider('money', 'Гроші на старті', SU.money, ' ₴', 'щоночі витрати на життя, щотижня дорожче')}
        ${slider('basePain', 'Базовий біль', SU.basePain, '', 'на старті ще +' + SU.startExtra + ' тимчасового, що сам спадає')}
      </div>
      <p class="sub">Керування: клік по меблях або стрілки/WASD, цифри обирають дію, E завершує день, J — щоденник, M — міні-ігри.</p>
      <div class="row"><button class="btn primary" id="startBtn">Почати</button></div>
    `, false);
    for (const k of ['money', 'basePain']) {
      const inp = $('su-' + k);
      inp.oninput = () => { $('su-' + k + '-v').textContent = inp.value + (k === 'money' ? ' ₴' : ''); };
    }
    $('startBtn').focus();
    $('startBtn').onclick = () => {
      setupChoice = { money: +$('su-money').value, basePain: +$('su-basePain').value };
      newGame(setupChoice);
    };
  }

  function newGame(opts) {
    endingPlayed = false;
    game = G.createGame(opts);
    lastPainSeen = null;
    closeModal();
    phase = 'play';
    room.endVisit(true); room.resetHero();
    $('cutCaption').hidden = true;
    lastZone = undefined;
    renderAll();
    toast('День 1. Біль ' + G.pain(game) + ', ' + C.states[G.stateKey(game)].name.toLowerCase() + '. Ресурс: ' + game.spoons + '.' + inviteNote());
    weekIntro();
  }

  function inviteNote() {
    const inv = G.inviteToday(game);
    return inv ? ' ' + G.inviteWho(inv) + (inv.with ? ' хочуть зайти.' : ' пише, хоче зайти.') : '';
  }

  function journalHTML() {
    return game.journal.slice().reverse().map((j) => {
      const part = (k, arr) => arr.length ? `<div><span class="k">${k}</span><ul>${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
      const head = j.hospital ? 'у лікарні' : 'ранковий біль ' + j.morningPain + ', ' + C.states[j.state].name.toLowerCase();
      return `<section class="jday"><h3>День ${j.day} · ${head}</h3>
        ${part('Зроблено', j.did)}${part('Відмовився і втратив', j.refused)}${part('Хотів, але не міг', j.tried)}${part('Ніч', j.night)}
        ${!j.did.length && !j.refused.length && !j.tried.length && !j.night.length ? '<p class="sub">Поки нічого.</p>' : ''}</section>`;
    }).join('');
  }
  function showJournal() {
    if (!game) return;
    const back = phase === 'end' ? showEnd : closeModal;
    openModal(`<h2>Щоденник</h2>${journalHTML()}<div class="row"><button class="btn primary" id="jClose">${phase === 'end' ? 'До підсумку' : 'Закрити'}</button></div>`, phase !== 'end');
    $('jClose').onclick = back;
    $('jClose').focus();
  }

  // Графік сфер і болю за дні — на екрані підсумку.
  function drawChart(c, hist, days) {
    const g = c.getContext('2d'), Wc = c.width, Hc = c.height, pad = 30;
    g.clearRect(0, 0, Wc, Hc);
    g.strokeStyle = '#2b3049'; g.lineWidth = 1;
    for (let v = 0; v <= 10; v += 2) { const y = Hc - pad - (v / 10) * (Hc - 2 * pad); g.beginPath(); g.moveTo(pad, y); g.lineTo(Wc - 8, y); g.stroke(); }
    g.fillStyle = '#9aa0b8'; g.font = '16px Handjet';
    for (let d = 1; d <= days; d += 4) g.fillText(d, pad + ((d - 1) / (days - 1)) * (Wc - pad - 8) - 3, Hc - 8);
    const val = (h, k) => (k === 'money' ? Math.min(10, h.money / 20) : h[k]);
    for (const k of ['money', 'people', 'body', 'soul', 'pain']) {
      g.strokeStyle = SPH_HEX[k]; g.lineWidth = k === 'pain' ? 2 : 3; g.setLineDash(k === 'pain' ? [5, 4] : []);
      g.beginPath();
      hist.forEach((h, i) => { const x = pad + ((h.day - 1) / (days - 1)) * (Wc - pad - 8), y = Hc - pad - (Math.max(0, val(h, k)) / 10) * (Hc - 2 * pad); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
    }
    g.setLineDash([]);
  }

  let endingPlayed = false;
  function showEnd() {
    if (game && (game.lost || game.finished) && !endingPlayed) {
      endingPlayed = true;
      phase = 'cut';
      closeModal();
      held.clear(); applyKeys();
      room.playEnding(game.lost ? game.lost.cause : 'win', () => { $('cutCaption').hidden = true; showEnd(); });
      renderAll();
      return;
    }
    phase = 'end';
    const sm = G.summary(game);
    const last = Object.assign({}, sm.history[sm.history.length - 1], { money: game.money, people: game.people, body: game.body, soul: game.soul, pain: G.pain(game), day: sm.daysLived });
    const hist = sm.history.concat(sm.history[sm.history.length - 1].day < sm.daysLived ? [last] : []);
    const head = sm.lost
      ? `<h2>${esc(sm.lost.text)} на ${sm.lost.day}-й день</h2><p class="lost-line">Курс лікування — ${sm.days} ${dayWord(sm.days)}. Ти протримався ${sm.lost.day} ${dayWord(sm.lost.day)}.</p>`
      : `<h2>Курс лікування завершено</h2><p>Усі ${sm.days} ${dayWord(sm.days)} позаду. Жодна сфера не посипалась — таке трапляється рідко.</p>`;
    // Фінал «Настрій згас» — про найтемніше. Поруч — куди звернутися, якщо так зараз і в житті.
    const support = sm.lost && sm.lost.sphere === 'soul'
      ? `<p class="sub">Якщо тобі зараз так само порожньо — ти не сам. Lifeline Ukraine: 7333 (цілодобово, безкоштовно з мобільного).</p>` : '';
    openModal(`
      ${head}${support}
      <canvas id="endChart" width="760" height="260" class="end-chart"></canvas>
      <div class="legend">${['money', 'people', 'body', 'soul', 'pain'].map((k) => `<span style="--c:${SPH_HEX[k]}"><i></i>${k === 'pain' ? 'біль' : G.SPHERES[k].name}</span>`).join('')}</div>
      <div class="cols">
        <div><h3>Збережено</h3><ul>${sm.kept.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
        <div><h3>Втрачено</h3><ul>${sm.lostItems.length ? sm.lostItems.map((x) => `<li>${esc(x)}</li>`).join('') : '<li>Нічого помітного</li>'}</ul></div>
      </div>
      <div class="row">
        <button class="btn" id="eJournal">Щоденник</button>
        <button class="btn primary" id="eNew">Нова гра</button>
      </div>
    `, false);
    drawChart($('endChart'), hist, sm.days);
    $('eJournal').onclick = showJournal;
    $('eNew').onclick = showSetup;
    renderAll();
  }

  // Перегляд усіх чотирьох фіналів підряд: адреса з ?endings (щоб подивитися, не граючи).
  function demoEndings() {
    const list = [['money', 'Гроші'], ['friends', 'Стосунки'], ['body', 'Тіло'], ['joy', 'Настрій'], ['win', 'перемога (дожив до кінця)']];
    game = G.createGame({});
    game.soul = 3;
    let i = 0;
    const next = () => {
      if (i >= list.length) { $('cutCaption').hidden = true; toast('Це всі фінали.'); showSetup(); return; }
      const [kind, name] = list[i++];
      room.resetHero(); room.endVisit(true);
      room.setView({ joy: 30 });
      phase = 'cut';
      toast('Фінал ' + i + ' з ' + list.length + ': ' + name + ' (клік чи пробіл — пропустити)');
      room.playEnding(kind, () => setTimeout(next, 900));
      renderAll();
    };
    closeModal();
    next();
  }

  // ---------- старт ----------
  function start(data) {
    fit();
    if (/[?&]endings\b/.test(location.search)) { demoEndings(); requestAnimationFrame((t) => { prev = t; frame(t); }); return; }
    if (data && data.game && data.game.spoonsMorning != null) {
      game = data.game; phase = ['night', 'scene', 'cut', 'report'].includes(data.phase) ? 'play' : data.phase || 'play';
      if (data.hero) Object.assign(room.hero, data.hero);
      if (phase === 'end') showEnd(); else if (phase === 'setup') showSetup(); else renderAll();
    } else showSetup();
    requestAnimationFrame((t) => { prev = t; frame(t); });
  }

  // Для налагодження з консолі: zapas.game.extra = 4; zapas.refresh()
  // Якщо щось упало — показати текст помилки, щоб її можна було сфотографувати й надіслати.
  window.addEventListener('error', (e) => {
    const where = e.filename ? ' (' + e.filename.split('/').pop().split('?')[0] + ':' + e.lineno + ')' : '';
    toast('Помилка: ' + (e.message || e.error) + where);
  });
  window.zapas = { get game() { return game; }, get phase() { return phase; }, room, refresh: renderAll };

  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ game, phase, hero: { x: room.hero.x, y: room.hero.y } }));
  if (hot && hot.ready) hot.ready(start); else start(hot && hot.data ? hot.data : {});
})();
