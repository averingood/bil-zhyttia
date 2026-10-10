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
  let panelView = null;      // на прийомі лікаря панель показує вечірній стан, поки він не скаже, що змінилось
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
        painkiller: !!game.painkiller,
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
    endTogUpdate();
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
  // Перед міні-грою — коротко: як грати і від чого залежить результат. «Більше не показувати» — для кожної гри окремо.
  const introOf = (id) => ({
    friends: ['Розмова з друзями', ['Друг розповідає новину — обери відповідь, що пасує.', 'Біль може заглушити слова: тоді можна перепитати.'],
      ['Обидві відповіді влучні — Стосунки +1.', 'Одна — Настрій −1.', 'Жодної — Стосунки −1 і Настрій −1.']],
    work: ['Планерка', ['Керівник ставить питання — обери правильну відповідь.', 'Не розчув через біль — можна перепитати.'],
      ['Правильна відповідь — +20 ₴, після перепитування — +10 ₴, хибна — нічого. Гроші прийдуть завтра.']],
    games: ['Гра-пробіжка', ['Персонаж біжить сам. Стрибай над перешкодами: ' + (isPhone() ? 'кнопка «Стрибок».' : 'пробіл або кнопка «Стрибок».'), 'Біль може смикнути саме перед стрибком.'],
      ['Настрій + стільки, скільки перешкод перестрибнув (від 0 до ' + C.actions.games.jumps + ').', 'Біль −' + C.actions.games.ease + '.']],
    create: ['Синтезатор', ['Зіграй три ноти: ' + (isPhone() ? 'торкайся клавіш.' : 'клацай клавіші або натискай літери на клавіатурі.'), 'Що сильніший біль, то частіше рука здригається і нота фальшивить.'],
      ['Настрій + стільки, скільки чистих нот (від 0 до ' + C.actions.create.notes + ').', 'Пісня пишеться за ' + C.actions.create.songSessions + ' сесії; дописану скинеш друзям — зацінять: Стосунки + стільки, скільки друзів, яким ти не винен.']],
    read: ['Читання', ['Читай розворот і гортай сторінки, коли дочитаєш.'],
      ['Настрій +' + C.actions.read.soul + ' за сесію.', 'Дочитана книжка — ще Настрій +' + C.actions.read.finishSoul + '.']],
    cook: ['Готування', ['На холодильнику — рецепт. Запам’ятай продукти.', 'Потім обери з полиці ті самі ' + 5 + '.'],
      ['Їжа є в будь-якому разі: Тіло +' + C.actions.cook.body + '.', 'Усі продукти правильні — смачно: Настрій +' + C.actions.cook.soulIfTasty + '.']],
    exercise: ['ЛФК', ['Тренер на екрані телефона показує рухи — стрілки по черзі.', 'Запам’ятай порядок і повтори його' + (isPhone() ? ' кнопками.' : ': клавіші ← ↑ → ↓ або кнопки.')],
      ['Дві третини рухів і більше — Тіло +' + C.actions.exercise.body + ', біль −' + C.actions.exercise.reliefToday + ' сьогодні й −' + C.actions.exercise.reliefNext + ' завтра.', 'Хоча б третина — Тіло +' + C.actions.exercise.partialBody + ', без полегшення.']],
  })[id];
  let introPass = null;   // пояснення щойно прочитали — цього разу гра стартує без нього
  const introSeen = (id) => { if (introPass === id) { introPass = null; return true; } try { return localStorage.getItem('zapas.intro.' + id) === '1'; } catch (e) { return false; } };
  function withIntro(id, go) {
    const it = introOf(id);
    if (!it || introSeen(id)) { go(); return; }
    const was = phase;
    phase = 'ask';
    openModal(`<h2>${esc(it[0])}</h2>
      <p class="lbl">Як грати</p><ul class="tl">${it[1].map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <p class="lbl">Результат</p><ul class="tl">${it[2].map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <label class="gm-row"><input type="checkbox" id="introNo"><span>Більше не показувати</span></label>
      <div class="row"><button class="btn primary" id="introGo">Почати</button></div>`, false);
    $('introGo').focus();
    $('introGo').onclick = () => {
      if ($('introNo').checked) { try { localStorage.setItem('zapas.intro.' + id, '1'); } catch (e) { /* не страшно */ } }
      closeModal(); phase = was; introPass = id; go();
    };
  }

  function runScene(Scene, extra, toOpts, id, p) {
    if (introOf(id) && !introSeen(id)) { withIntro(id, () => runScene(Scene, extra, toOpts, id, p)); return; }
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

  // sure — уже погодився (прийняв запрошення): без другого натиску «узяти наперед».
  function act(id, sure) {
    if (phase !== 'play') return;
    const p = G.preview(game, id);
    if (!p.available) {
      G.doAction(game, id);   // щоденник запам'ятовує спробу
      toast(p.reason);
      renderAll();
      return;
    }
    if (p.borrow && armed !== id && !sure) {   // узяти наперед — лише другим натиском
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
    if (gameOn('work') && id === 'work' && window.Meeting) return runScene(window.Meeting, { canvas, day: game.day, payDay: game.day + C.actions.work.payDelay }, (r) => ({ score: r.score }), id, p);
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
  // Голодні гості: удвох — «ми», сам — від себе, у своєму роді.
  const HUNGRY_PAIR = ['Ми голодні як вовки. Нагодуєш?', 'Йдемо просто з роботи, нічого не їли. Є щось у холодильнику?', 'Слухай, а в тебе є що поїсти? Ми ще не обідали.'];
  const HUNGRY_ONE = [(f) => 'Я голодн' + (f ? 'а як вовчиця' : 'ий як вовк') + '. Нагодуєш?', (f) => 'Іду просто з роботи, нічого не ' + (f ? 'їла' : 'їв') + '. Є щось у холодильнику?',
    (f) => 'Слухай, а в тебе є що поїсти? Я ще не ' + (f ? 'обідала' : 'обідав') + '.'];
  // Друзі голодні: нагодувати за гроші чи лишити голодними (Стосунки −1).
  function askFeed(p) {
    const F = C.actions.friends, can = game.money >= F.treat;
    phase = 'ask';
    const who = game.callGuests || [], one = who.length === 1, fem = one && C.friends.female.includes(who[0]);
    const line = one ? HUNGRY_ONE[Math.floor(Math.random() * HUNGRY_ONE.length)](fem) : HUNGRY_PAIR[Math.floor(Math.random() * HUNGRY_PAIR.length)];
    openModal(`<h2>${one ? esc(who[0]) + ' ' + (fem ? 'голодна' : 'голодний') : esc(who.join(' і ')) + ' голодні'}</h2>
      <p>${esc(who.join(' і '))} ${one ? 'пише' : 'пишуть'}: «${esc(line)}»</p>
      <div class="row"><button class="btn primary" data-feed="yes" ${can ? '' : 'disabled'}>Нагодувати · −${F.treat} ₴</button>
      <button class="btn" data-feed="no">Нічим пригостити · Стосунки −1</button></div>
      ${can ? '' : '<p class="sub">Грошей на їжу немає.</p>'}`, false);
    $('modal').querySelectorAll('[data-feed]').forEach((b) => { b.onclick = () => { closeModal(); phase = 'play'; finishAction('friends', p, { feed: b.dataset.feed === 'yes' }); }; });
    $('modal').querySelector(can ? '[data-feed=yes]' : '[data-feed=no]').focus();
  }
  function showDelta(b, title, tags, delay) {
    const a = snap(), parts = title ? [{ t: title, k: 'ttl' }] : [];
    const covered = new Set();
    for (const tg of tags || []) { parts.push({ t: tg.t, k: tg.k || '' }); (tg.covers || []).forEach((c) => covered.add(c)); }
    const sg = (v) => (v > 0 ? '+' : '−') + Math.abs(v);
    for (const k of ['people', 'body', 'soul']) if (a[k] !== b[k] && !covered.has(k)) parts.push({ t: G.SPHERES[k].name + ' ' + sg(a[k] - b[k]), k: a[k] > b[k] ? 'good' : 'bad' });
    if (a.pending > b.pending) parts.push({ t: '+' + (a.pending - b.pending) + ' ₴ ' + (C.actions.work.payDelay === 1 ? 'завтра' : 'через ' + C.actions.work.payDelay + ' дні'), k: 'good' });
    if (a.money !== b.money && !covered.has('money')) parts.push({ t: sg(a.money - b.money) + ' ₴', k: a.money > b.money ? 'good' : 'bad' });
    if (a.pain !== b.pain) parts.push({ t: 'біль ' + b.pain + '→' + a.pain, k: a.pain < b.pain ? 'good' : 'bad' });
    if (a.tomorrow > b.tomorrow) parts.push({ t: 'завтра ресурс −' + (a.tomorrow - b.tomorrow), k: 'bad' });
    if (a.future > b.future) { const f = game.future[game.future.length - 1]; parts.push(f.kind === 'relief' ? { t: (f.day === game.day + 1 ? 'завтра' : 'день ' + f.day) + ': біль −' + f.amount, k: 'good' } : { t: 'завтра відкат +' + f.amount, k: 'bad' }); }
    if (a.fed && !b.fed && !covered.has('fed') && game.foodType === 'guests') parts.push({ t: 'друзі нагодували', k: 'good' });
    if (a.bookI > b.bookI) parts.push({ t: 'дочитав «' + game.lastBookDone + '»!', k: 'good' });
    if (a.songN > b.songN) parts.push({ t: 'дописав «' + game.lastSongDone + '» — друзі зацінили!', k: 'good' });
    if (parts.length <= (title ? 1 : 0)) return;
    const el = document.createElement('div');
    el.className = 'delta';
    el.innerHTML = parts.map((x) => `<span class="${x.k}">${esc(x.t)}</span>`).join('');
    // delay — показати пізніше (після попередньої плашки), але з тим, що змінилось уже зараз.
    setTimeout(() => { $('canvasWrap').appendChild(el); setTimeout(() => el.remove(), 3600); }, delay || 0);
  }

  function finishAction(id, p, opts) {
    const talk = id === 'friends' && window.FriendTalk && gameOn('friends');
    const before = snap();
    const autoTalk = id === 'friends' && !talk;
    const r = G.doAction(game, id, Object.assign({}, opts, talk || autoTalk ? { deferTalk: true } : null));
    // Дописав пісню — спершу смс від друзів, а вже тоді плашка з тим, що змінилось.
    if (r.ok && r.sms && r.sms.length) showSms(r.sms, () => showDelta(before, null, r.tags));
    else if (r.ok) showDelta(before, null, r.tags);
    // Друзі: зайшли, сіли — і тоді розмова від першої особи; після неї прощаються.
    // Без міні-гри розмова розігрується сама, а її підсумок — окремою плашкою, коли наговорились і встають.
    room.playAction(id, r.guests, talk ? () => startTalk(r.guests) : null, r.ok && autoTalk ? () => {
      const b2 = snap(), note = G.applyTalk(game, G.autoTalkKinds(game));
      if (!note) return;
      const j = game.journal.find((e) => e.day === game.day);
      if (j && j.did.length) j.did[j.did.length - 1] = j.did[j.did.length - 1].replace(/\)$/, '; ' + note + ')');
      showDelta(b2, TALK_TITLE[game.lastTalk]);
      renderAll();
    } : null);
    if (talk) {
      phase = 'scene';
      held.clear(); applyKeys();
      $('actionBar').innerHTML = `<div class="sc-head"><span class="ab-zone">У гостях</span><span class="ab-meta">${esc(r.guests.join(' і '))} ${r.guests.length > 1 ? 'заходять' : 'заходить'}…</span></div>`;
    }
    if (id === 'work' || id === 'games') workingT = 1.8;   // монітор світиться лише від роботи й ігор
    if (r.borrowed) toast('Узяв наперед ресурс ' + r.borrowed + ': завтра на стільки менше ресурсу' + (C.borrowPain ? ' і біль +' + C.borrowPain * r.borrowed : '') + ', шанс загострення вночі +' + Math.round(C.night.exhausted * 100) + '%.');
    renderAll();
  }

  const TALK_TITLE = { good: 'Розмова вдалась:', meh: 'Розмова так собі:', bad: 'Розмова не склалась:' };

  // Смс від друзів: з'являються по одній, як у телефоні. Кому винен — відписує байдуже.
  function showSms(list, then) {
    const was = phase;
    phase = 'ask';
    openModal(`<h2>Скинув друзям свою пісню «${esc(game.lastSongDone || '')}»</h2><div class="sms-list"></div>
      <div class="row"><button class="btn primary" id="smsOk">Закрити</button></div>`, false);
    const box = $('modal').querySelector('.sms-list');
    const timers = list.map((m, i) => setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'sms' + (m.debt ? ' cold' : '');
      el.innerHTML = `<b>${esc(m.from)}</b><span>${esc(m.text)}</span>`;
      box.appendChild(el);
    }, 350 + i * 750));
    $('smsOk').focus();
    $('smsOk').onclick = () => { timers.forEach(clearTimeout); closeModal(); if (phase === 'ask') phase = was; renderAll(); then && then(); };
  }

  function startTalk(names) {
    if (!introSeen('friends')) { withIntro('friends', () => startTalk(names)); return; }
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
        showDelta(before, TALK_TITLE[game.lastTalk]);
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
    // Борг на сьогодні, а грошей уночі не вистачить — попередити, як і про кінець гри.
    // Останній день курсу: кому не віддав — того друга втратиш. Інакше — борг на сьогодні, а грошей уночі не вистачить.
    const lastDay = game.day >= game.days && game.loans.length;
    const debts = lastDay ? [] : (fc && !fc.lost && fc.debts) || [];
    const debtText = lastDay
      ? `Сьогодні останній день курсу. Неповернений борг: ${game.loans.map((l) => esc(G.config.friends.dat && G.config.friends.dat[l.from] || l.from) + ' ' + l.amount + ' ₴').join(', ')} — втратиш ${game.loans.length > 1 ? 'друзів' : 'друга'}. Повернути можна на дивані, якщо є гроші.`
      : debts.map((d) => `Сьогодні треба віддати ${d.amount} ₴ ${esc(d.dat)}, а грошей уночі не вистачить: Стосунки −${C.actions.loan.late}, нагадає в день ${d.again}. Поки винен — ${esc(d.from)} не приходить; не віддаси до кінця курсу — втратиш друга.`).join(' ');
    if (fc && (fc.lost || fc.hospital || debts.length || lastDay)) {
      const title = fc.lost ? 'Після цієї ночі гра закінчиться' : fc.hospital ? 'Цієї ночі доведеться викликати швидку' : lastDay ? 'Втратиш ' + (game.loans.length > 1 ? 'друзів' : 'друга') : 'Борг не буде повернено — ризикуєш втратити друга';
      const text = fc.lost ? esc(lossWarning(fc.lost, fc)) : (fc.hospital ? `Біль дійде до 10 — доведеться викликати швидку: укол зніме біль до мінімуму, Тіло +${C.hospital.body}. −${C.hospital.cost} ₴, Настрій −${C.hospital.soul}.` + (debtText ? ' ' : '') : '') + debtText;
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
    room.endVisit(true);   // гості, що ще сиділи, ідуть до ночі — і розмова з ними зараховується сьогодні
    const dayWas = game.day, left = game.spoons, pre = G.clone(game);
    const r = G.endDay(game);
    armed = null;
    if (r.doctor) { doctorScene(r.doctor, () => afterNight(r, dayWas, left), pre); return; }
    afterNight(r, dayWas, left);
  }
  function afterNight(r, dayWas, left) {
    // Нічна швидка з уколом — лише якщо гра триває; якщо ця ніч кінцева, буде одна фінальна сцена.
    if (r.hospital && !game.lost) {
      phase = 'cut';
      held.clear(); applyKeys();
      room.playHospital(1, dayWas + 1, () => { $('cutCaption').hidden = true; nightReport(r, dayWas, left); });
      renderAll();
      return;
    }
    nightReport(r, dayWas, left);
  }

  // Прийом лікаря: заходить, сідає з тобою на диван і по черзі каже висновки за тиждень.
  // pre — стан на вечір: панель показує його, а мінімум болю й Тіло змінює лише тоді, коли лікар про це сказав.
  const DOC_READ_MS = 1600;   // скільки дати прочитати репліку лікаря, перш ніж панель зміниться
  function doctorScene(v, next, pre) {
    phase = 'doctor';
    panelView = pre || null;
    held.clear(); applyKeys();
    const bar = $('actionBar');
    let shown = 0, done = false, keyH = null;
    const finish = () => {
      if (done) return;
      done = true; sceneAbort = null;
      if (keyH) window.removeEventListener('keydown', keyH, true);
      if (revealT) { clearTimeout(revealT); revealT = null; revealFn = null; }
      panelView = null;
      room.endVisit(false);   // прощається й іде
      const b = v.after - v.before;
      showDelta(snap(), null,
        [{ t: (v.final ? 'Фінальний огляд: ' : 'Огляд: ') + (b ? 'мінімум болю ' + v.before + ' → ' + v.after : 'мінімум болю без змін (' + v.after + ')'), k: b < 0 ? 'good' : b > 0 ? 'bad' : '' }]);
      next();
    };
    const draw = () => {
      const last = shown >= v.lines.length;
      bar.innerHTML = `<div class="sc-head"><span class="ab-zone">${v.final ? 'Фінальний огляд' : 'Прийом лікаря'}</span><span class="ab-meta">день ${v.day}</span></div>
        <ul class="doc-lines">${v.lines.slice(0, shown).map((l) => `<li class="${l.k}">${esc(l.t)}</li>`).join('')}</ul>
        ${shown ? `<div class="sc-answers"><button class="ans primary doc-next" type="button"><kbd>Пробіл</kbd>${last ? 'Попрощатися' : 'Далі'}</button></div>` : '<p class="sc-msg">Лікар заходить…</p>'}`;
      const b = bar.querySelector('.doc-next');
      if (b) b.onclick = step;
    };
    const step = () => { if (done) return; if (shown >= v.lines.length) { finish(); return; } shown++; reveal(v.lines[shown - 1]); room.say(0, 'talk'); draw(); };
    // Спершу читаєш репліку — і лише тоді панель оновлюється: мінімум болю (а з ним і біль), Тіло після уколу.
    // Натиснув «Далі» раніше — попередня зміна застосовується одразу, нічого не губиться.
    let revealT = null, revealFn = null;
    const flushReveal = () => { if (revealT) { clearTimeout(revealT); revealT = null; const f = revealFn; revealFn = null; f && f(); } };
    const reveal = (l) => {
      flushReveal();
      if (!panelView || !l || (l.base == null && !l.body && !l.money)) return;
      revealFn = () => {
        if (!panelView) return;
        if (l.base != null) panelView.base = l.base;
        if (l.body) panelView.body = Math.min(C.sphereMax, panelView.body + l.body);
        if (l.money) panelView.money += l.money;
        renderPanel();
      };
      revealT = setTimeout(() => { revealT = null; const f = revealFn; revealFn = null; f && f(); }, DOC_READ_MS);
    };
    keyH = (e) => { if (shown && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); e.stopPropagation(); step(); } };
    window.addEventListener('keydown', keyH, true);
    sceneAbort = () => { shown = v.lines.length; finish(); };
    room.startVisit(['Лікар'], () => { shown = 1; reveal(v.lines[0]); room.say(0, 'talk'); draw(); }, false, true);
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
      <p>Увечері ${docDay}-го дня — ${final ? 'фінальний огляд лікаря' : 'прийом лікаря'}. Він подивиться, як минув тиждень${final ? '' : ', і покаже, як на це відреагував твій організм'}.</p>
      <p>Вам прописано:</p>
      <ul class="tl">
        <li><b>Пігулки з курсу</b> (аптечка): 1 в день${!D.pillsWeeks[w - 1] ? ' — підтримуюча доза, ' + C.course.money[w - 1] + ' ₴, без пропусків: пропуск піднімає мінімум болю' : w > 1 ? ' — доза вища, ' + C.course.money[w - 1] + ' ₴' : ''}</li>
        <li><b>ЛФК</b> (килимок): ${D.lfkWeeks[w - 1] ? D.lfk.good + ' рази на тиждень' : 'за бажанням'}</li>
      </ul>
      <div class="row"><button class="btn primary" id="wkOk">Зрозуміло</button></div>`, true);
    $('wkOk').onclick = closeModal;
    $('wkOk').focus();
  }

  function nightReport(r, dayWas, left) {
    phase = r.hospital ? 'report' : 'night';
    const items = r.events.length ? r.events : [{ kind: '', text: 'Тиха ніч.' }];
    openModal(`
      <h2>${r.hospital ? 'Нічна швидка' : 'Ніч після дня ' + dayWas}</h2>
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
    // Кінець гри: замість дій — підсумок, щоденник, нова гра; свято триває в кімнаті.
    if (phase === 'end') {
      if (el.dataset.end === '1') return;
      el.dataset.end = '1';
      el.innerHTML = `<div class="ab-head"><span class="ab-zone">${game.lost ? 'Кінець' : 'Свято'}</span><span class="ab-meta">${game.lost ? '' : 'Курс лікування завершено'}</span></div>
        <div class="row end-row"><button class="btn primary" data-end="sum">Підсумок</button><button class="btn" data-end="journal">Щоденник</button><button class="btn" data-end="new">Нова гра</button></div>`;
      el.querySelector('[data-end=sum]').onclick = () => showEnd();
      el.querySelector('[data-end=journal]').onclick = showJournal;
      el.querySelector('[data-end=new]').onclick = showSetup;
      return;
    }
    delete el.dataset.end;
    const z = room.currentZone();
    const banner = gigBanner() + inviteBanner();
    const meta = 'Лишилось ресурсу: ' + game.spoons + ' з ' + game.spoonsMorning + (game.borrowed ? ' · узято наперед ' + game.borrowed : '');
    if (!z) {
      el.innerHTML = banner + `<div class="ab-head"><span class="ab-zone">${room.walking ? 'Іде…' : 'Квартира'}</span><span class="ab-meta">${meta}</span></div>
        <p class="ab-empty">${isPhone() ? 'Торкнись меблів у кімнаті або зони нижче — з\'являться дії.' : 'Клікни на меблі або йди стрілками. Біля зони з\'являться дії, клавіші 1–9 їх обирають.'}
        ${game.spoons === 0 ? '<br>Ресурс скінчився. Можна взяти наперед — або лягти (' + (isPhone() ? '«Завершити день» унизу' : 'E') + ').' : ''}</p>`;
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
    return `<div class="invite"><span class="inv-msg"><b>${esc(g.from)}</b> пропонує підробіток на сьогодні: +${g.pay || A.pay} ₴ одразу.</span>
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
  // Прийняв запрошення — одразу: герой іде до дивана й кличе, без повторних натисків.
  let pendingSure = false;
  function acceptInvite() {
    if (phase !== 'play') return;
    if (room.currentZone() === 'sofa') { act('friends', true); return; }
    pending = 'friends'; pendingSure = true;
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
    const id = pending, sure = pendingSure;
    pending = null; pendingSure = false;
    if (id && G.ACTIONS[id].zone === z) act(id, sure);
  };

  // Значок 🎮 — на діях, чия міні-гра зараз увімкнена.
  function padIcon() { return '<span class="pad" aria-label="Міні-гра від першої особи">🎮</span>'; }
  // Ефект словами → значками: «Стосунки +2» — серце +2, «ресурс 2» — два трикутники.
  const SPH_BY_NAME = { 'Стосунки': 'people', 'Тіло': 'body', 'Настрій': 'soul' };
  function fxHTML(t) {
    return esc(t)
      .replace(/(Стосунки|Тіло|Настрій) /g, (m, n) => `<span class="fx-i" style="--c:${SPH_COLOR[SPH_BY_NAME[n]]}" title="${n}">${pixIcon(SPH_BY_NAME[n])}</span>`)
      .replace(/ресурс ([+−]?)(\d+)/g, (m, sg, n) => +n <= 4 ? sg + '<span class="fx-tri" title="ресурс">' + '<i class="tri on"></i>'.repeat(+n) + '</span>' : m);
  }
  function actionButton(a, i) {
    const cost = a.cost == null ? '' : a.cost === 0 ? 'без ресурсу' : 'ресурс ' + a.cost;
    let body;
    if (!a.available) body = `<span class="a-why">${esc(a.reason)}</span>`;
    else {
      // Окремо: що дає, яка ціна (гроші, ресурс, біль, ризики) і просто довідка.
      const kindOf = (f) => f.kind === 'info' ? 'info' : f.kind === 'pain' ? 'loss' : f.kind === 'good' ? 'gain' : /−/.test(f.t) && !/\+/.test(f.t) ? 'loss' : 'gain';
      // Ціна: гроші, ресурс і все, що дія забирає чи чим ризикуєш.
      const extra = { loss: a.cost ? [{ t: 'ресурс ' + a.cost, kind: 'energy' }] : [] };
      const row = (k, label) => {
        const fx = a.effects.filter((f) => kindOf(f) === k);
        // Порядок ціни: гроші, ресурс, а тоді ризики й інше.
        const at = fx.findIndex((f) => !(f.kind === 'money' && /₴/.test(f.t) && !/шанс/.test(f.t)));
        fx.splice(at < 0 ? fx.length : at, 0, ...(extra[k] || []));
        return fx.length ? `<span class="a-row a-${k}">${label ? '<b>' + label + '</b>' : ''}${fx.map((f) => `<span class="${f.kind}">${fxHTML(f.t)}</span>`).join(' · ')}</span>` : ''; };
      body = `<span class="a-fx">${row('gain', 'дає')}${row('loss', 'ціна')}${row('info', '')}</span>`;
      if (a.borrow) body += `<span class="a-warn${armed === a.id ? ' fatal' : ''}">${armed === a.id ? 'Натисни ще раз, щоб узяти ' + a.borrow + ' наперед.' : 'Бракує ресурсу' + (C.borrowPain ? ': завтра біль +' + C.borrowPain * a.borrow : '') + '.'}</span>`;
    }
    const cls = ['act', a.available ? '' : 'off', armed === a.id ? 'armed' : ''].join(' ');
    const pad = gameOn(a.id) && a.available ? padIcon() : '';
    return `<button class="${cls}" data-id="${a.id}" aria-disabled="${!a.available}">
      <kbd>${i + 1}</kbd><span class="a-name">${esc(a.label)}</span><span class="a-cost">${a.available ? '' : cost}</span>${body}${pad}</button>`;
  }

  function renderChips() {
    const el = $('zoneChips');
    if (!game || phase === 'setup' || phase === 'end') { el.innerHTML = ''; return; }
    const here = room.currentZone();
    el.innerHTML = Object.keys(G.ZONES).map((z) =>
      `<button class="chip ${z === here ? 'here' : ''}" data-z="${z}">${esc(G.ZONES[z].name)}</button>`).join('');
    el.querySelectorAll('.chip').forEach((b) => { b.onclick = () => { if (phase === 'play') room.walkToZone(b.dataset.z); }; });
  }

  // ---------- бокова панель ----------
  const triSvg = (cls) => `<i class="tri ${cls}"></i>`;

  // Гроші показуємо в ₴, а шкалу — по 20 ₴ на поділку.
  // «1–2 → 6, 3–4 → 5, …» із таблиці ресурсу за болем.
  // «Біль 1–2 → 6» — по рядку на кожен щабель.
  function spoonRows() {
    const out = []; let from = 1;
    for (let p = 1; p <= C.painMax; p++) if (p === C.painMax || C.spoons[p + 1] !== C.spoons[p]) { out.push('<li>Біль ' + (from === p ? p : from + '–' + p) + ' → ' + C.spoons[p] + '</li>'); from = p + 1; }
    return out.join('');
  }
  function spoonRanges() {
    const out = []; let from = 1;
    for (let p = 1; p <= C.painMax; p++) if (p === C.painMax || C.spoons[p + 1] !== C.spoons[p]) { out.push((from === p ? p : from + '–' + p) + ' → ' + C.spoons[p]); from = p + 1; }
    return out.join(', ');
  }
  function sphereSec(s, k, tip) {
    const isMoney = k === 'money';
    const v = isMoney ? Math.round(s.money / 20) : s[k];
    const danger = isMoney ? s.money < G.dailyCost(s.day) * 2 : v <= 2;
    // Стосунки на нулі — Настрій вище стелі не росте: ці поділки заблоковані.
    const cap = k === 'soul' && s.people <= 0 ? C.lonelyCap : C.sphereMax;
    const cells = Array.from({ length: C.sphereMax }, (_, i) => `<i class="${i < v ? 'on' : i >= cap ? 'lock' : ''}"></i>`).join('');
    return `<div class="sec tipped sph ${danger ? 'danger' : ''}" tabindex="0" data-k="${k}" style="--c:${SPH_COLOR[k]}">
      <div class="sec-h"><span class="lbl">${G.SPHERES[k].name}</span><span class="val">${isMoney ? s.money + ' ₴' : v}</span></div>
      <div class="meter">${cells}</div>
      <div class="tip">${tip}<p class="why">${isMoney ? 'На нулі: ' + C.graceMoney + ' дні знайти гроші на оренду, інакше виселять.'
        : k === 'people' ? 'На нулі: самотньо — Настрій не піднімається вище ' + C.lonelyCap + '.'
        : k === 'soul' ? 'На нулі: ' + C.apathy.map((id, i) => { const l = G.ACTIONS[id].label; return i && l !== l.toUpperCase() ? l.toLowerCase() : l; }).join(', ') + ' — не під силу.'
        : 'На нулі: наступного дня підніми вище нуля — інакше госпіталізація і кінець гри.'}</p></div></div>`;
  }

  function renderPanel() {
    const el = $('panel');
    if (!game) { el.innerHTML = ''; return; }
    const s = panelView || game, st = G.stateKey(s), p = G.pain(s), col = STATE_COLOR[st], L = C.links;
    const ended = !!(s.finished || s.lost);   // кінець гри: лише підсумковий стан і кнопки

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
      <span class="e-cost">−${d.cost} ₴</span>${d.events.map((e) => `<span class="e-${e.k.split(' ')[0]} ${e.k.split(' ')[1] || ''}">${esc(e.t)}</span>`).join('')}</div>`).join('');

    const hints = G.hints(s);
    const fc = G.forecastNight(s);
    const flareP = Math.round(G.flareChanceTonight(s) * 100);
    const incoming = s.pending.slice().sort((a, b) => a.day - b.day).map((x) => `+${x.amount} ₴ на день ${x.day}`).join(', ') || 'нічого';

    el.style.boxShadow = `inset 0 0 ${Math.max(0, p - 3) * 9}px ${Math.max(0, p - 3) * 3}px rgba(5,5,12,.75)`;
    el.innerHTML = `
      <button class="m-close" id="mClose" type="button" aria-label="Закрити стан">✕ Закрити</button>
      <div class="p-head">
        ${s.finished ? `<div class="p-day">День ${s.days + 1}</div><span class="sub">курс завершено!</span>`
          : s.lost ? `<div class="p-day">День ${s.day}</div><span class="sub">кінець</span>`
          : `<div class="p-day">День ${s.day} <small>з ${s.days}</small></div><span class="sub">курс лікування</span>`}
      </div>

      <div class="sec tipped" tabindex="0" data-k="pain">
        <div class="sec-h"><span class="lbl">Біль</span><span><span class="state-tag" style="--c:${col}">${p}</span> <span class="sub">мінімум ${G.minNow(s)}${G.minNow(s) < s.base ? ' (блокада)' : ''}</span></span></div>
        <div class="pain-scale">${Array.from({ length: 10 }, (_, i) => `<i class="${i < G.minNow(s) ? 'floor' : i < p ? 'over' : ''}"></i>`).join('')}</div>
        <div class="tip">
          <p><b>Зараз:</b> біль ${p}, мінімум ${G.minNow(s)}${G.minNow(s) < s.base ? ' — блокада до дня ' + s.blockMin.until + ', потім знову ' + s.base : ''}. Шанс загострення вночі ${flareP}%.</p>
          <ul class="tl">
            <li><b>Піднімають:</b> загострення вночі (від 1 до 3), ресурс, узятий наперед (+${C.borrowPain} за кожен), голод з ${C.hungry.painFrom}-го дня поспіль (+1 щоночі).</li>
            <li><b>Знімають:</b> розтяжка −${C.actions.stretch.reliefToday}, знеболювальне −${C.actions.meds.reliefToday}, ЛФК −${C.actions.exercise.reliefToday} сьогодні й завтра, ігри −${C.actions.games.ease}; сон — на стільки, скільки ресурсу лишив невикористаним. Нижче мінімуму — ніколи.</li>
            <li><b>Блокада</b> (${C.actions.block.money} ₴) — єдине, що опускає сам мінімум: −${C.actions.block.minDrop} на ${C.actions.block.minDays} дні.</li>
            <li><b>Мінімум</b> реагує на лікування — пігулки й ЛФК за тиждень.</li>
            <li>З болем ${C.states.strong.min}+ не пишеш, не читаєш, не готуєш.</li>
          </ul>
        </div>
      </div>

${ended ? '' : `      <div class="sec tipped" tabindex="0" data-k="res">
        <div class="sec-h"><span class="lbl">Ресурс</span></div>
        <div class="tris">${tri}</div>
        <div class="tip">
          <p><b>Зараз:</b> лишилось ${s.spoons} з ${s.spoonsMorning}${s.borrowed ? ' (ще ' + s.borrowed + ' взято наперед)' : ''}.${eaten ? ' Без болю було б ' + C.spoons[0] + '.' : ''}</p>
          <p><b>Базовий ресурс на ранок</b> (залежно від болю):</p>
          <ul class="tl">${spoonRows()}</ul>
          <ul class="tl">
            <li><b>Бонус:</b> Настрій ${L.soulHigh}+ дає +1 ресурс.</li>
            <li>За кожен позичений ресурс сьогодні: −1 ресурс${C.borrowPain ? ' і +' + C.borrowPain + ' біль' : ''} завтра (можна позичити до ${C.maxBorrow} ресурсів з наступного дня).</li>
            <li>Залишок ресурсу знижує завтрашній біль на кількість збереженого ресурсу (але не нижче мінімуму).</li>
          </ul>
        </div>
      </div>

`}
      ${sphereSec(s, 'money', `<p><b>Зараз:</b> ${s.money} ₴${s.pending.length ? ', надійде: ' + incoming : ''}; уночі оренда ${G.dailyCost(s.day)} ₴.${s.loans.length ? ' Борги: ' + s.loans.map((l) => esc(l.from) + ' ' + l.amount + ' ₴ до дня ' + l.due).join(', ') + '.' : ''}</p>
        <ul class="tl">
          <li><b>Заробити:</b> робота (ресурс ${C.actions.work.spoons}, гроші ${C.actions.work.payDelay === 1 ? 'завтра' : 'через ' + C.actions.work.payDelay + ' дні'}), підробіток від друга.</li>
          <li><b>Витрати:</b> оренда щоночі ${C.costs.join(' / ')} ₴ по тижнях, пігулки ${C.course.money.join(' / ')} ₴, двічі на тиждень — несподіваний рахунок.</li>
          <li><b>Позика:</b> ${C.actions.loan.amount} ₴ на ${C.actions.loan.dueIn} днів, Стосунки −${C.actions.loan.people}. Поки винен — цей друг не приходить; повернув — Стосунки +${C.actions.loan.repayPeople}.</li>
        </ul>`)}
      ${sphereSec(s, 'people', `<p><b>Зараз:</b> ${s.people}.${s.people < C.actions.loan.minPeople ? ' Позичити нема в кого.' : ''}</p>
        <ul class="tl">
          <li><b>Підняти:</b> зустріч +${C.actions.friends.people.light} (удала розмова ще +1), написати +${C.actions.text.people}, дописана пісня — + стільки, скільки друзів, яким не винен, настолки +${C.actions.board.people} за кожного гостя, повернути борг +${C.actions.loan.repayPeople}.</li>
          <li><b>Втрати:</b> відмова на запрошення, невдала розмова, позика, підробіток, голодні гості без частування — по −1; удари життя; щоночі −${C.decay}.</li>
          <li><b>Дає:</b> підробіток — з ${L.gigLow.min} зрідка (+${L.gigLow.pay} ₴), з ${L.peopleGood} частіше (+${C.actions.gig.pay} ₴).</li>
        </ul>`)}
      ${sphereSec(s, 'body', `<p><b>Зараз:</b> ${s.body}; шанс загострення вночі ${flareP}%.</p>
        <ul class="tl">
          <li><b>Підняти:</b> ЛФК +${C.actions.exercise.body}, розтяжка +${C.actions.stretch.body}, їжа +${C.actions.cook.body}, блокада +${C.actions.block.body}; укол лікаря на прийомі — до ${C.doctor.rescueTo}, швидка +${C.hospital.body}.</li>
          <li><b>Втрати:</b> без їжі −${C.hungry.body}, далі щодня поспіль −${C.hungry.body * 2}, −${C.hungry.body * 3}…; удари життя; щоночі −${C.decay}.</li>
          <li><b>Шанс загострення:</b> ${C.links.bodyFlare.map(([m, c], i, a) => (i === 0 ? m + '+' : m + '–' + (a[i - 1][0] - 1)) + ' → ' + Math.round(c * 100) + '%').join(', ')}.</li>
        </ul>`)}
      ${sphereSec(s, 'soul', `<p><b>Зараз:</b> ${s.soul}.${s.soul >= L.soulGood ? ' Спокій допомагає.' : s.soul <= L.soulBad ? ' Пригніченість шкодить.' : ''}</p>
        <ul class="tl">
          <li><b>Підняти:</b> пісня від 0 до ${C.actions.create.notes}, ігри від 0 до ${C.actions.games.jumps}, книжка +${C.actions.read.soul}, смачна їжа +${C.actions.cook.soulIfTasty}, настолки +${C.actions.board.soul} за гостя, знеболювальне +${C.actions.meds.soul}.</li>
          <li><b>Втрати:</b> день у сильному болю −${L.strongSoul}; невдала розмова, відмова від підробітку −1; удари життя; щоночі −${C.decay}.</li>
          <li><b>${L.soulGood}+:</b> ресурс +1 зранку, шанс загострення −${Math.round(L.soulFlare * 100)}%, робота +${L.soulPay} ₴.</li>
          <li><b>${L.soulBad} і нижче:</b> шанс загострення +${Math.round(L.soulFlare * 100)}%, робота −${L.soulPay} ₴.</li>
        </ul>`)}

      ${ended ? `<div class="btns end-btns">
        <button class="btn primary" id="sumBtn">Підсумок</button>
        <button class="btn" id="journalBtn">Щоденник</button>
        <button class="btn" id="newBtn">Нова гра</button>
      </div>` : `<div class="sec">
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
      <button class="btn ghost" id="restartBtn">Почати заново</button>`}
      ${DEBUG && !ended ? `<div class="dbg"><span class="sub">Налагодження (лише локально)</span>
        <div class="dbg-grid">
          <span>Біль</span><button class="btn" data-dbg="pain:min">1</button><button class="btn" data-dbg="pain:max">10</button>
          ${['people', 'body', 'soul'].map((k) => `<span>${G.SPHERES[k].name}</span><button class="btn" data-dbg="${k}:min">0</button><button class="btn" data-dbg="${k}:max">10</button>`).join('')}
          <span>Гроші</span><input type="range" id="dbgMoney" min="0" max="400" step="10" value="${Math.max(0, Math.min(400, s.money))}"><b id="dbgMoneyV">${s.money} ₴</b>
        </div>
        <div class="row"><button class="btn primary" data-dbg="win">Перескочити до кінця 21-го дня</button></div></div>` : ''}
      ${!ended && fc && fc.lost ? `<div class="warn" style="color:var(--fatal)">${esc(lossWarning(fc.lost, fc))}</div>` : ''}
    `;
    if (tipIndex != null) showTip(tipIndex);
    // Телефон: розгорнута підказка секції лишається розгорнутою після перемальовки.
    if (openSec != null) { const sec = el.querySelectorAll('.sec.tipped')[openSec]; if (sec) sec.classList.add('open'); }
    $('mClose').onclick = () => setSheet(false);
    if ($('endBtn')) $('endBtn').onclick = endDayClick;
    $('journalBtn').onclick = showJournal;
    if ($('restartBtn')) $('restartBtn').onclick = askRestart;
    if ($('sumBtn')) $('sumBtn').onclick = () => { if (phase === 'end') showEnd(); };
    if ($('newBtn')) $('newBtn').onclick = showSetup;
    document.querySelectorAll('[data-dbg]').forEach((b) => { b.onclick = () => debugSet(b.dataset.dbg); });
    const dm = $('dbgMoney');
    if (dm) { dm.oninput = () => { $('dbgMoneyV').textContent = dm.value + ' ₴'; }; dm.onchange = () => { if (phase !== 'play') return; game.money = +dm.value; renderAll(); }; }
  }

  // Попередження про кінець — чесно: що саме станеться і чи ще можна встигнути щось зробити сьогодні.
  // Чесно: скільки сфера має зараз і що саме вночі зіб'є її до нуля.
  function lossWarning(lost, fc) {
    const k = lost.sphere, name = G.SPHERES[k].name, crisis = (game.crisis || {})[k], end = ' — кінець (' + lost.text.toLowerCase() + ').';
    if (k === 'money') return crisis != null
      ? 'Сьогодні останній день знайти гроші на оренду. Не знайдеш — уночі виселять.'
      : 'Уночі гроші скінчаться, оренду платити буде нічим, а часу на порятунок не лишиться: виселять.';
    // Причини коротко: «знову без їжі −2, тане саме собою −1».
    const why = [];
    for (const e of (fc && fc.events) || []) {
      if (!e.text.includes(name)) continue;
      const pre = e.text.split(':')[0], m = e.text.match(new RegExp(name + '[^−]*−(\\d+)')) || e.text.match(/−(\d+)/);
      if (!m) continue;
      const label = pre.startsWith('Сфери тануть') ? 'тане саме собою' : pre.toLowerCase();
      why.push(label + ' −' + m[1]);
    }
    const because = why.length ? ' (' + why.join(', ') + ')' : '';
    const now = game[k];
    if (crisis != null && now <= 0) return name + ' на нулі. Не піднімеш сьогодні — уночі' + end;
    return name + ' зараз ' + now + ', уночі впаде до нуля' + because + end;
  }

  // Налагодження: виставити сферу чи біль на край; або перескочити в останній вечір курсу й подивитись фінал.
  function debugSet(cmd) {
    if (phase !== 'play') return;
    if (cmd === 'win') {
      // Останній день, усе живе — завершуєш день і бачиш перемогу (лікар, друзі, фінальний огляд).
      game.day = game.days; game.people = Math.max(game.people, 6); game.body = Math.max(game.body, 6); game.soul = Math.max(game.soul, 6);
      game.money = Math.max(game.money, 200); game.crisis = {}; game.extra = 0; game.fed = true;
      renderAll();
      return;
    }
    const [k, v] = cmd.split(':');
    if (k === 'pain') { const want = v === 'max' ? 10 : 1; game.extra = want - G.minNow(game); }
    else game[k] = v === 'max' ? C.sphereMax : 0;
    renderAll();
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
  // Телефон (і будь-який дотик): наведення немає — підказка розгортається під секцією по торканню.
  $('panel').addEventListener('pointerover', (e) => { if (e.pointerType === 'touch' || isPhone()) return; const i = secIndex(e.target); if (i >= 0 && i !== tipIndex) showTip(i); else if (i < 0) hideTip(); });
  $('panel').addEventListener('pointerleave', hideTip);
  $('panel').addEventListener('focusin', (e) => { if (isPhone()) return; const i = secIndex(e.target); if (i >= 0) showTip(i); });
  $('panel').addEventListener('click', (e) => {
    if (!isPhone() || e.target.closest('button, a, input')) return;
    const i = secIndex(e.target);
    if (i < 0) return;
    openSec = openSec === i ? null : i;
    document.querySelectorAll('#panel .sec.tipped').forEach((sec, k) => sec.classList.toggle('open', k === openSec));
  });
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

  function renderAll() {
    // Кінець гри: кімната на весь кадр — без рядка дій і зон; кнопки — внизу правої панелі.
    document.body.classList.toggle('ended', !!game && !!(game.finished || game.lost) && phase !== 'night' && phase !== 'report' && phase !== 'doctor');
    renderPanel(); renderActions(); renderChips(); renderSceneToggle(); renderMobile();
  }

  // ---------- телефон ----------
  // Вузький екран: над кімнатою — стиснутий рядок стану (торкнись — відкриється вся панель шторкою),
  // унизу — завжди під рукою «Стан», «Щоденник», «Завершити день».
  const PHONE = window.matchMedia('(max-width: 700px)');
  const isPhone = () => PHONE.matches;
  let openSec = null;   // яка підказка секції розгорнута на телефоні
  let mTip = null;      // яка підказка зі значка верхньої панелі відкрита
  // Підказка значка — той самий текст, що й на панелі; «Плани» — найближчі події.
  function mTipHTML(k) {
    if (k === 'plans') {
      // День: календар на кілька днів і плани; звідси ж — уся панель (там «Почати заново»).
      const cal = $('panel').querySelector('.cal'), h = $('panel').querySelector('.hints');
      return (cal ? '<span class="lbl">Календар</span>' + cal.outerHTML : '') + (h ? '<span class="lbl">Плани</span>' + h.outerHTML : '')
        + '<button type="button" class="btn ms-all" data-all-panel>Уся панель стану</button>';
    }
    const sec = $('panel').querySelector('.sec[data-k="' + k + '"]');
    if (!sec) return '';
    const name = sec.querySelector('.lbl');
    return '<p><b>' + (name ? esc(name.textContent) : '') + '</b></p>' + sec.querySelector('.tip').innerHTML;
  }
  function setSheet(on) {
    document.body.classList.toggle('sheet', !!on);
    if (on) $('panel').scrollTop = 0;
    renderMobile();
  }
  PHONE.addEventListener && PHONE.addEventListener('change', () => { if (!isPhone()) setSheet(false); hideTip(); renderAll(); });
  // Піксельні іконки сфер (7×7): монета, серце, людина з руками вгору, усмішка.
  const PIX = {
    money: ['..###..', '.#...#.', '#..#..#', '#..#..#', '#..#..#', '.#...#.', '..###..'],
    people: ['.##.##.', '#######', '#######', '#######', '.#####.', '..###..', '...#...'],
    body: ['#..#..#', '#.###.#', '.#####.', '..###..', '..###..', '..#.#..', '.##.##.'],
    soul: ['.#####.', '#######', '##.#.##', '#######', '#.###.#', '##...##', '.#####.'],
  };
  function pixIcon(k) {
    const rows = PIX[k];
    let r = '';
    rows.forEach((line, y) => [...line].forEach((ch, x) => { if (ch === '#') r += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));
    return `<svg class="pix" viewBox="0 0 7 7" aria-hidden="true" shape-rendering="crispEdges">${r}</svg>`;
  }
  function renderMobile() {
    const top = $('mStatus'), bar = $('mBar');
    if (!game || phase === 'setup') { top.innerHTML = ''; bar.innerHTML = ''; document.body.classList.remove('sheet'); return; }
    const s = panelView || game, p = G.pain(s), st = G.stateKey(s), ended = !!(s.finished || s.lost);
    // Значки: кожен — окрема кнопка; торкнувся — під панеллю його підказка. Сфери показують і максимум (/10).
    const sph = ['money', 'people', 'body', 'soul'].map((k) => {
      const v = k === 'money' ? s.money : s[k];
      const danger = k === 'money' ? s.money < G.dailyCost(s.day) * 2 : v <= 2;
      return `<button type="button" class="ms-i ms-sph${danger ? ' danger' : ''}${mTip === k ? ' on' : ''}" data-tip="${k}" style="--c:${SPH_COLOR[k]}" aria-label="${G.SPHERES[k].name}">${pixIcon(k)}<b>${v}</b><small>${k === 'money' ? '₴' : '/' + (k === 'soul' && s.people <= 0 ? C.lonelyCap + '🔒' : C.sphereMax)}</small></button>`;
    }).join('');
    // Ресурс — ті самі трикутники, що й на панелі: повні, витрачені, узяті наперед і рябі червоні — з'їдені болем.
    const trisEl = $('panel').querySelector('.sec[data-k="res"] .tris');
    const tris = ended || !trisEl ? '' : trisEl.innerHTML;
    const fatal = ended ? null : G.hints(s).find((h) => h.kind === 'fatal');
    top.innerHTML = `<div class="ms">
        <div class="ms-row">
          <button type="button" class="ms-i ms-day${mTip === 'plans' ? ' on' : ''}" data-tip="plans" aria-label="Плани">${s.finished ? 'День ' + (s.days + 1) : 'День ' + s.day}<small>/${s.days}</small></button>
          <button type="button" class="ms-i ms-pain${mTip === 'pain' ? ' on' : ''}" data-tip="pain" aria-label="Біль"><small>біль</small><span class="state-tag" style="--c:${STATE_COLOR[st]}">${p}</span><small>мін ${G.minNow(s)}</small></button>
          ${ended ? '' : `<button type="button" class="ms-i ms-res${mTip === 'res' ? ' on' : ''}" data-tip="res" aria-label="Ресурс">${tris}</button>`}
        </div>
        <div class="ms-sphs">${sph}</div>
      </div>${fatal ? `<p class="ms-fatal">${esc(fatal.t)}</p>` : ''}${mTip ? `<div class="ms-tip">${mTipHTML(mTip)}</div>` : ''}`;
    top.querySelectorAll('[data-tip]').forEach((b) => { b.onclick = () => { mTip = mTip === b.dataset.tip ? null : b.dataset.tip; renderMobile(); }; });
    const tipEl = top.querySelector('.ms-tip');
    if (tipEl) tipEl.onclick = (e) => { const all = e.target.closest('[data-all-panel]'); mTip = null; if (all) setSheet(true); else renderMobile(); };
    const busy = phase !== 'play' && phase !== 'end';
    bar.hidden = busy;
    document.body.classList.toggle('busy', phase !== 'play');
    bar.innerHTML = ended
      ? `<button class="btn primary" data-m="sum">Підсумок</button><button class="btn" data-m="journal">Щоденник</button><button class="btn" data-m="new">Нова гра</button>`
      : `<button class="btn" data-m="state">${document.body.classList.contains('sheet') ? 'Сховати' : 'Календар'}</button><button class="btn" data-m="journal">Щоденник</button><button class="btn primary ${s.spoons === 0 ? 'pulse' : ''}" data-m="end">Завершити день</button>`;
    bar.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => {
      const m = b.dataset.m;
      if (m === 'state') { if (document.body.classList.contains('sheet')) setSheet(false); else { mTip = mTip === 'plans' ? null : 'plans'; window.scrollTo(0, 0); renderMobile(); } }
      else if (m === 'journal') { setSheet(false); showJournal(); }
      else if (m === 'end') { setSheet(false); endDayClick(); }
      else if (m === 'sum') { if (phase === 'end') showEnd(); }
      else if (m === 'new') showSetup();
    }; });
  }

  function canSkipAnim() { return (room.visit && !(room.visit.hold && (phase === 'scene' || phase === 'doctor') && sceneAbort)) || !!room.bubble || workingT > 0; }
  function renderSceneToggle() {
    const sk = $('skipBtn');
    if (sk) sk.hidden = !game || !(((phase === 'scene' || phase === 'doctor') && sceneAbort) || phase === 'cut' || canSkipAnim());
    const b = $('sceneTog');
    b.hidden = !game || phase === 'setup' || phase === 'scene' || phase === 'cut' || !!(game.finished || game.lost);
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
      <div class="gm-btns"><button class="btn" type="button" data-all="1">Усі</button><button class="btn" type="button" data-all="0">Жодної</button><button class="btn primary gm-close" type="button">Готово</button></div>`;
    m.querySelector('.gm-close').onclick = () => { m.hidden = true; };
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
  // Торкнувся поза відкритим меню — воно лише закривається; те, що було під пальцем, не натискається.
  document.addEventListener('click', (e) => {
    const m = $('gamesMenu');
    if (m.hidden || m.contains(e.target) || $('sceneTog').contains(e.target)) return;
    m.hidden = true;
    e.stopPropagation(); e.preventDefault();
  }, true);
  $('skipBtn').onclick = () => { skipNow(); renderAll(); };
  $('endTog').onclick = () => showEnd();

  // ---------- вікна ----------
  let modalClosable = false;
  function openModal(html, closable) {
    modalClosable = !!closable;
    const m = $('modal');
    m.innerHTML = `<div class="dlg" role="dialog" aria-modal="true">${html}</div>`;
    m.hidden = false;
    // Клік поза вікном закриває те, що можна закрити (щоденник, правила тижня…).
    m.onclick = (e) => { if (e.target === m && modalClosable) closeModal(); };
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
      <p>У тебе хронічний біль. Попереду ${C.days}-денний курс лікування.</p>
      <p>Щоранку біль вирішує, скільки в тебе сил — <b>ресурсу</b>. Кожна справа коштує ресурсу й підтримує одну з чотирьох сфер: <b>Гроші</b>, <b>Стосунки</b>, <b>Тіло</b>, <b>Настрій</b>. Щоночі сфери трохи тануть, а часом життя ще й б'є.</p>
      <p><b>Біль</b> не опускається нижче свого мінімуму. Загострення піднімають його; сон знімає стільки, скільки ресурсу лишив невикористаним. Лікуєшся як слід — мінімум знижується; результати лікування підбиваються на прийомах лікаря.</p>
      <div class="opts"><span class="lbl">Твоє життя</span>
        ${slider('money', 'Гроші на старті', SU.money, ' ₴', 'щоночі знімається оренда, яка дорожчає щотижня')}
      </div>
      <p class="sub">${isPhone() ? 'Керування: торкайся меблів чи зон під кімнатою; угорі — стан дня (торкнись, щоб розгорнути), унизу — «Завершити день».' : 'Керування: клік по меблях або стрілки/WASD, цифри обирають дію, E завершує день, J — щоденник, M — міні-ігри.'}</p>
      <div class="row"><button class="btn primary" id="startBtn">Почати</button></div>
    `, false);
    for (const k of ['money']) {
      const inp = $('su-' + k);
      inp.oninput = () => { $('su-' + k + '-v').textContent = inp.value + (k === 'money' ? ' ₴' : ''); };
    }
    $('startBtn').focus();
    $('startBtn').onclick = () => {
      setupChoice = { money: +$('su-money').value, basePain: SU.basePain.def };
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
      const head = 'ранковий біль ' + j.morningPain + ', ' + C.states[j.state].name.toLowerCase();
      return `<section class="jday"><h3>День ${j.day} · ${head}</h3>
        ${part('Зроблено', j.did)}${part('Відмовився і втратив', j.refused)}${part('Хотів, але не міг', j.tried)}${part('Ніч', j.night)}
        ${!j.did.length && !j.refused.length && !j.tried.length && !j.night.length ? '<p class="sub">Поки нічого.</p>' : ''}</section>`;
    }).join('');
  }
  function showJournal() {
    if (!game) return;
    const back = phase === 'end' ? showEnd : closeModal;
    // Кнопка закриття — вгорі, щоб не гортати до кінця; Esc теж закриває.
    openModal(`<div class="j-head"><h2>Щоденник</h2>${phase === 'end' ? '<button class="btn primary" id="jClose">До підсумку</button>' : '<button class="x-close" id="jClose" title="Закрити (Esc)" aria-label="Закрити">✕</button>'}</div>${journalHTML()}`, phase !== 'end');
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
      // Свято: лише друзі, яким нічого не винен; кімната — за болем і настроєм; без грошей — коробки.
      // Стосунки на нулі — ніхто не прийде; інакше лише ті, кому нічого не винен. why — чому ніхто не прийшов.
      const free = game.friendNames.filter((n) => !game.loans.some((l) => l.from === n));
      const why = game.people <= 0 ? 'Стосунки на нулі — друзі віддалились' : !free.length ? 'Усім друзям винен гроші' : '';
      const party = { why, guests: game.people <= 0 ? [] : free, joy: game.soul * 10, pain: G.pain(game), boxes: game.money <= 0 };
      // Підсумок — не одразу: спершу дати дочитати підпис і побачити останній кадр.
      room.playEnding(game.lost ? game.lost.cause : 'win', () => setTimeout(() => { if (phase === 'cut') showEnd(); }, game.lost ? 2500 : 0), party);
      renderAll();
      return;
    }
    phase = 'end';
    const sm = G.summary(game);
    const last = Object.assign({}, sm.history[sm.history.length - 1], { money: game.money, people: game.people, body: game.body, soul: game.soul, pain: G.pain(game), day: sm.daysLived });
    const hist = sm.history.concat(sm.history[sm.history.length - 1].day < sm.daysLived ? [last] : []);
    const head = sm.lost
      ? `<h2>${esc(sm.lost.text)} на ${sm.lost.day}-й день</h2><p class="lost-line">Курс лікування — ${sm.days} ${dayWord(sm.days)}. Ти протримався ${sm.lost.day} ${dayWord(sm.lost.day)}.</p>`
      : `<h2>Курс лікування завершено</h2><p>Усі ${sm.days} ${dayWord(sm.days)} позаду.${game.money <= 0 ? ' Грошей не лишилось — доведеться з’їжджати, але до кінця ти дотягнув.' : ''}</p>`;
    // Лікування окремо, решта — здобутки й утрати; підсумковий стан — окремим рядком.
    const cure = sm.kept.concat(sm.lostItems).filter((x) => x.startsWith('Мінімум болю'));
    const kept = sm.kept.filter((x) => !x.startsWith('Мінімум болю') && !x.startsWith('Наприкінці'));
    const lostL = sm.lostItems.filter((x) => !x.startsWith('Мінімум болю'));
    const state = `Біль ${G.pain(game)} (мінімум ${game.base}) · Настрій ${game.soul} · Стосунки ${game.people} · Тіло ${game.body} · ${game.money < 0 ? '−' + Math.abs(game.money) : game.money} ₴`;
    const won = !sm.lost;
    // Фінал «Настрій згас» — про найтемніше. Поруч — куди звернутися, якщо так зараз і в житті.
    const support = sm.lost && sm.lost.sphere === 'soul'
      ? `<p class="sub">Якщо тобі зараз так само порожньо — ти не сам. Lifeline Ukraine: 7333 (цілодобово, безкоштовно з мобільного).</p>` : '';
    openModal(`
      ${head}${support}
      <canvas id="endChart" width="760" height="260" class="end-chart"></canvas>
      <div class="legend">${['money', 'people', 'body', 'soul', 'pain'].map((k) => `<span style="--c:${SPH_HEX[k]}"><i></i>${k === 'pain' ? 'біль' : G.SPHERES[k].name}</span>`).join('')}</div>
      ${cure.length ? `<p><b>Лікування:</b> ${esc(cure.join('; '))}</p>` : ''}
      <p><b>Підсумковий стан:</b> ${esc(state)}</p>
      <div class="cols">
        <div><h3>Здобутки</h3><ul>${kept.length ? kept.map((x) => `<li>${esc(x)}</li>`).join('') : '<li>Нічого помітного</li>'}</ul></div>
        <div><h3>Втрачено</h3><ul>${lostL.length ? lostL.map((x) => `<li>${esc(x)}</li>`).join('') : '<li>Нічого помітного</li>'}</ul></div>
      </div>
      <div class="row">
        <button class="btn" id="eWatch">${won ? 'Дивитися свято' : 'Сховати'}</button>
        <button class="btn" id="eJournal">Щоденник</button>
        <button class="btn primary" id="eNew">Нова гра</button>
      </div>
    `, true);
    drawChart($('endChart'), hist, sm.days);
    $('eJournal').onclick = showJournal;
    $('eNew').onclick = showSetup;
    $('eWatch').onclick = closeModal;
    renderAll();
  }
  // Свято триває за вікном підсумку: сховав — дивишся; кнопка «Підсумок» повертає вікно.
  function endTogUpdate() {
    const b = $('endTog');
    if (!b) return;
    const want = false;   // кнопка «Підсумок» тепер унизу правої панелі
    if (b.hidden === want) b.hidden = !want;
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
