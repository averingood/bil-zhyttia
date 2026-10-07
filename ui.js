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
  let phase = 'setup';       // setup | play | night | end
  let armed = null;          // дія, яку треба підтвердити другим натиском
  let workingT = 0;
  let lastZone = undefined;
  let lastWalking = null;
  let pending = null;
  let autoEndT = 0;          // скільки вже чекаємо, щоб ніч настала сама
  let autoEndedDay = 0;      // не відкривати вікно вдруге, якщо гравець повернувся        // дія, яку виконати, коли герой дійде до зони
  // scenes — планерка й розмови з друзями від першої особи; вимкнено — результат рахується сам.
  // Перемикається в самій грі (біля столу й дивана, клавіша M), тож пам'ятаємо між сесіями.
  let numbIdle = 0;          // скільки герой стоїть без діла з радістю 0   // панель перемальовується часто — довідка не має згортатися сама
  let setupChoice = { money: C.setup.money.def, friends: C.setup.friends.def, minBase: C.setup.minBase.def, days: C.days, scenes: loadScenes() };
  function loadScenes() { try { return localStorage.getItem('zapas.scenes') !== '0'; } catch (e) { return true; } }
  function toggleScenes() {
    setupChoice.scenes = !setupChoice.scenes;
    try { localStorage.setItem('zapas.scenes', setupChoice.scenes ? '1' : '0'); } catch (e) { /* не страшно */ }
    toast(setupChoice.scenes ? 'Міні-ігри увімкнено: планерки й розмови від першої особи' : 'Міні-ігри вимкнено: результат рахується сам, за станом болю');
    renderAll();
  }

  const STATE_COLOR = { light: 'var(--light)', medium: 'var(--medium)', strong: 'var(--strong)' };

  // ---------- розмір полотна ----------

  function fit() {
    const wrap = $('canvasWrap');
    const aw = wrap.clientWidth, ah = wrap.clientHeight;
    if (!aw || !ah) return;
    let k = Math.min(aw / W, ah / H);
    // Цілий масштаб чіткіший, але не ціною третини екрана.
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
        slot: phase === 'night' ? 4 : G.dayPhase(game, Math.min(game.slot, G.slotsOf(game) - 1)),
        pain: G.pain(game),
        state: G.stateKey(game),
        working: workingT > 0,
        food: game.foodType,
        night: phase === 'night',
        joy: game.joy,
        mess: game.mess,
        invite: phase === 'play' && !!G.inviteToday(game),
      });
    }
    // Радість 0: коли герой постоїть без діла, він сам іде сидіти на мішок.
    if (game && phase === 'play' && game.joy <= 0 && !room.visit && !room.cut && !room.walking && !room.hero.sitting && !room.bubble) {
      numbIdle += dt;
      if (numbIdle > 3) { numbIdle = 0; room.slumpToBag(); }
    } else numbIdle = 0;
    room.update(dt);
    room.render();
    const cap = $('cutCaption'), text = room.cut ? room.cut.caption : '';
    if (cap.textContent !== text) cap.textContent = text;
    cap.hidden = !text;
    autoEndDay(dt);
    const z = room.currentZone();
    if (z !== lastZone || room.walking !== lastWalking) {
      lastZone = z; lastWalking = room.walking;
      if (z !== armed) armed = null;
      renderActions();
      renderChips();
    }
    requestAnimationFrame(frame);
  }

  // Коли слоти скінчилися, робити вже нічого: ніч настає сама,
  // щойно дограла анімація дії й пішли гості.
  function autoEndDay(dt) {
    const idle = phase === 'play' && game && !game.lost && !game.finished &&
      game.slot >= G.slotsOf(game) && $('modal').hidden && autoEndedDay !== game.day &&
      !room.bubble && !room.visit && !room.walking && workingT <= 0;
    autoEndT = idle ? autoEndT + dt : 0;
    if (autoEndT > 0.9) {
      autoEndT = 0;
      autoEndedDay = game.day;
      endDayClick();
    }
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
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
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
      const list = G.zoneActions(game, z);
      const a = list[Number(e.code.slice(5)) - 1];
      if (a) act(a.id);
      return;
    }
    if (e.code === 'KeyE') endDayClick();
    if (e.code === 'KeyM') toggleScenes();
    if (e.code === 'KeyJ') showJournal();
  });
  window.addEventListener('keyup', (e) => {
    if (DIRS[e.code]) { held.delete(e.code); applyKeys(); }
  });
  window.addEventListener('blur', () => { held.clear(); applyKeys(); });

  // ---------- дії ----------

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
  }

  function act(id) {
    if (phase !== 'play') return;
    const p = G.preview(game, id);
    if (!p.available) {
      G.doAction(game, id); // щоденник запам'ятовує спробу
      toast(p.reason);
      renderAll();
      return;
    }
    if ((p.fatal || p.nightFatal || p.nightHospital) && armed !== id) {
      armed = id;
      renderActions();
      return;
    }
    armed = null;
    if (id !== 'friends') room.endVisit(false);
    // Пісня — три ноти на синтезаторі; натиснув у спалах болю — фальшиво, радості менше.
    if (id === 'create' && setupChoice.scenes && window.SynthGame) {
      phase = 'scene';
      held.clear(); applyKeys();
      window.SynthGame.start({
        wrap: $('canvasWrap'), bar: $('actionBar'), title: G.songTitle(game),
        pain: G.pain(game), state: G.stateKey(game), painkiller: game.medsToday > 0, joy: game.joy,
        onDone: (res) => { phase = 'play'; finishAction(id, p, { synth: res }); },
      });
      renderAll();
      return;
    }
    // Ігри — бігунець на моніторі: 4 перешкоди, біль може не дати натиснути стрибок.
    if (id === 'games' && setupChoice.scenes && window.RunGame) {
      phase = 'scene';
      held.clear(); applyKeys();
      const a = C.actions.games;
      window.RunGame.start({
        wrap: $('canvasWrap'), bar: $('actionBar'), jumps: a.jumps, painChance: a.painChance,
        pain: G.pain(game), state: G.stateKey(game), painkiller: game.medsToday > 0, joy: game.joy,
        onDone: (res) => { phase = 'play'; finishAction(id, p, { runner: res }); },
      });
      renderAll();
      return;
    }
    // Готування — рецепт на холодильнику й вибір продуктів; біль може накрити записку.
    if (id === 'cook' && setupChoice.scenes && window.CookGame) {
      phase = 'scene';
      held.clear(); applyKeys();
      window.CookGame.start({
        wrap: $('canvasWrap'), bar: $('actionBar'),
        pain: G.pain(game), state: G.stateKey(game), painkiller: game.medsToday > 0, joy: game.joy,
        onDone: (res) => { phase = 'play'; finishAction(id, p, { cook: res }); },
      });
      renderAll();
      return;
    }
    // Читання — розгорнута книжка від першої особи, три перегортання.
    if (id === 'read' && setupChoice.scenes && window.ReadGame) {
      const b = G.bookNow(game);
      phase = 'scene';
      held.clear(); applyKeys();
      window.ReadGame.start({
        wrap: $('canvasWrap'), bar: $('actionBar'),
        pain: G.pain(game), state: G.stateKey(game), painkiller: game.medsToday > 0, joy: game.joy,
        book: b ? b[0] : '', session: game.book.done + 1, sessions: b ? b[1] : 0,
        onDone: () => { phase = 'play'; finishAction(id, p); },
      });
      renderAll();
      return;
    }
    // Вправи — повтор рухів за тренером від першої особи: правильні рухи стають якістю вправ.
    if (id === 'exercise' && setupChoice.scenes && window.MatGame) {
      phase = 'scene';
      held.clear(); applyKeys();
      window.MatGame.start({
        wrap: $('canvasWrap'), bar: $('actionBar'),
        pain: G.pain(game), state: G.stateKey(game), painkiller: game.medsToday > 0, joy: game.joy,
        onDone: (res) => { phase = 'play'; finishAction(id, p, { mat: res }); },
      });
      renderAll();
      return;
    }
    // Робота — планерка від першої особи; результат стає оплатою.
    if (id === 'work' && setupChoice.scenes && window.Meeting) {
      phase = 'scene';
      held.clear(); applyKeys();
      window.Meeting.start({
        wrap: $('canvasWrap'), canvas, bar: $('actionBar'),
        pain: G.pain(game), state: G.stateKey(game), painkiller: game.medsToday > 0, joy: game.joy,
        payDay: game.day + C.actions.work.payDelay,
        onDone: (res) => { phase = 'play'; finishAction(id, p, { score: res.score }); },
      });
      renderAll();
      return;
    }
    finishAction(id, p);
  }

  // ---------- що змінила дія: коротка нотатка над кімнатою ----------
  function snap() {
    return {
      money: game.money, joy: game.joy, energy: game.energy, borrowed: game.borrowed, pain: G.pain(game),
      pending: game.pending.reduce((a, x) => a + x.amount, 0), warmth: game.warmth || 0, trainings: game.trainings,
      fed: game.fed, workWeek: game.workWeek, exQ: game.exerciseQuality, bookI: game.book ? game.book.i : 0, songN: game.song ? game.song.n : 1, mess: game.mess,
    };
  }
  function showDelta(b, extra) {
    const a = snap(), parts = [];
    const sg = (v) => (v > 0 ? '+' : '−') + Math.abs(v);
    if (a.pending > b.pending) parts.push({ t: '+' + (a.pending - b.pending) + ' ₴ через ' + C.actions.work.payDelay + ' дні', k: 'good' });
    if (a.money !== b.money) parts.push({ t: sg(a.money - b.money) + ' ₴', k: a.money > b.money ? 'good' : 'bad' });
    if (a.energy !== b.energy) parts.push({ t: 'ресурс ' + (a.energy > b.energy ? '+' : '−') + Math.abs(a.energy - b.energy), k: a.energy > b.energy ? 'good' : '' });
    if (a.borrowed > b.borrowed) parts.push({ t: 'позичено ' + (a.borrowed - b.borrowed) + ': завтра біль +' + (a.borrowed - b.borrowed), k: 'bad' });
    if (a.joy !== b.joy) parts.push({ t: 'радість ' + sg(a.joy - b.joy), k: a.joy > b.joy ? 'good' : 'bad' });
    if (a.pain !== b.pain) parts.push({ t: 'біль ' + b.pain + '→' + a.pain, k: a.pain < b.pain ? 'good' : 'bad' });
    if (a.exQ !== b.exQ && a.exQ) {
      if (a.exQ === 'good') parts.push({ t: 'тимчасовий біль завтра −' + C.actions.exercise.reliefTomorrow, k: 'good' });
      if (a.exQ === 'partial') parts.push({ t: 'вправи частково: без −1 на завтра', k: '' });
      if (a.exQ === 'short') parts.push({ t: 'замало рухів: вправи не зараховано', k: '' });
      if (a.trainings > b.trainings) parts.push({ t: G.baseProgressText(game), k: '' });
    }
    if (a.fed && !b.fed) parts.push({ t: 'їжа на день є', k: '' });
    if (a.bookI > b.bookI) parts.push({ t: 'дочитав «' + game.lastBookDone + '»!', k: 'good' });
    if (a.songN > b.songN) parts.push({ t: 'дописав «' + game.lastSongDone + '»!', k: 'good' });
    if (a.mess < b.mess) parts.push({ t: 'вдома чисто', k: 'good' });
    if (a.workWeek > b.workWeek) parts.push({ t: 'робота ' + a.workWeek + '/' + C.work.unitsPerDeadline, k: '' });
    if (a.warmth < b.warmth) parts.push({ t: 'друзі кликатимуть рідше', k: 'bad' });
    if (a.warmth > b.warmth) parts.push({ t: 'друзі кликатимуть частіше', k: 'good' });
    if (extra) parts.push(...extra);
    if (!parts.length) return;
    const el = document.createElement('div');
    el.className = 'delta';
    el.innerHTML = parts.map((x) => `<span class="${x.k}">${esc(x.t)}</span>`).join('');
    $('canvasWrap').appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }

  function finishAction(id, p, opts) {
    const talk = id === 'friends' && setupChoice.scenes && window.FriendTalk;
    const before = snap();
    const r = G.doAction(game, id, Object.assign({}, opts, talk ? { deferTalk: true } : null));
    if (r.ok) showDelta(before,
      id === 'coffee' ? [{ t: 'шанс загострення вночі ' + Math.round(G.flareChanceTonight(game) * 100) + '%', k: 'bad' }]
      : null);
    // Друзі: зайшли, сіли — і тоді розмова від першої особи; після неї прощаються.
    // Поки заходять, нічого іншого робити не можна, щоб не зірвати візит.
    room.playAction(id, r.guests, talk ? () => startTalk(r.guests) : null);
    if (talk) {
      phase = 'scene';
      held.clear(); applyKeys();
      $('actionBar').innerHTML = `<div class="sc-head"><span class="ab-zone">У гостях</span><span class="ab-meta">${esc(r.guests.join(' і '))} ${r.guests.length > 1 ? 'заходять' : 'заходить'}…</span></div>`;
    }
    if (id === 'work' || id === 'games') workingT = 1.8;   // монітор світиться лише від роботи й ігор, не від синтезатора
    if (r.borrowed) toast('Позичено ресурсу ' + r.borrowed + '. Завтра біль +' + r.borrowed + ', уночі радість −' + r.borrowed * C.joy.borrowPenalty + '.');
    renderAll();
    if (game.lost) setTimeout(showEnd, 900);
  }

  function startTalk(names) {
    phase = 'scene';
    held.clear(); applyKeys();
    window.FriendTalk.start({
      wrap: $('canvasWrap'), canvas, bar: $('actionBar'),
      names, invited: !!game.lastVisitInvited, missedLast: !!game.lastTalkMissed,
      pain: G.pain(game), state: G.stateKey(game), painkiller: game.medsToday > 0, joy: game.joy,
      onDone: (res) => {
        const before = snap();
        const note = G.applyTalk(game, res.kinds, res.comments);
        showDelta(before);
        const j = game.journal.find((e) => e.day === game.day);
        if (j && j.did.length) j.did[j.did.length - 1] = j.did[j.did.length - 1].replace(/\)$/, '; ' + note + ')');
        phase = 'play';
        room.endVisit(false);
        renderAll();
        if (game.lost) setTimeout(showEnd, 900);
      },
    });
    renderAll();
  }

  function endDayClick() {
    if (phase !== 'play') return;
    const fc = G.forecastNight(game);
    if (fc && (fc.lost || fc.hospital)) {
      const title = fc.lost ? 'Після цієї ночі гра закінчиться' : 'Цієї ночі доведеться в лікарню';
      const text = fc.lost
        ? esc(fc.lost.text) + '.'
        : `Біль дійде до 10, приїде швидка: ${C.hospital.days} дні без дому, ${C.hospital.cost} ₴ і радість −${Math.abs(C.hospital.joy)}. Оренда й дедлайни в ці дні не чекатимуть.`;
      openModal(`
        <h2>${title}</h2>
        <p>${text} Можна ще щось змінити, якщо лишилися слоти.</p>
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
    const dayWas = game.day;
    const unused = G.slotsOf(game) - game.slot;
    const r = G.endDay(game);
    room.endVisit(true);
    armed = null;
    // Лікарня: спершу сцена в кімнаті, потім звіт.
    if (r.hospital) {
      phase = 'cut';
      held.clear(); applyKeys();
      room.playHospital(r.hospital, dayWas, () => { $('cutCaption').hidden = true; nightReport(r, dayWas, unused); });
      renderAll();
      return;
    }
    nightReport(r, dayWas, unused);
  }

  function nightReport(r, dayWas, unused) {
    // Після лікарні він уже вдома і вже ранок — звіт без нічного тла.
    phase = r.hospital ? 'report' : 'night';
    const items = r.events.length ? r.events : [{ kind: '', text: 'Тиха ніч.' }];
    openModal(`
      <h2>${r.hospital ? 'Швидка і лікарня' : 'Ніч після дня ' + dayWas}</h2>
      ${unused > 0 ? `<p class="sub">Лишилося невикористаних слотів: ${unused}.</p>` : ''}
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
      if (r.flare) {
        const w = $('canvasWrap');
        w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake');
      }
      if (r.hospital) toast('Повернувся з лікарні. День ' + game.day + '. Біль ' + G.pain(game) + ', ресурс: ' + game.energy + '.');
      else toast('Ранок. Біль ' + G.pain(game) + ', ' + C.states[G.stateKey(game)].name.toLowerCase() +
        '. Ресурс: ' + game.energy + (r.flare ? '. Уночі було загострення.' : '.') + inviteNote());
      renderAll();
    };
    renderAll();
  }

  // ---------- рядок дій ----------

  function renderActions() {
    const el = $('actionBar');
    if (phase === 'scene' || phase === 'cut') return;      // рядок дій зайняла сцена або фінальна анімація
    if (!game || phase === 'setup') { el.innerHTML = ''; return; }
    const z = room.currentZone();
    const banner = debtBanner() + inviteBanner();
    const slotTxt = game.slot < G.slotsOf(game)
      ? G.slotName(game, game.slot) + ' · слот ' + (game.slot + 1) + ' з ' + G.slotsOf(game)
      : 'Слоти скінчилися';
    if (!z) {
      el.innerHTML = banner + `<div class="ab-head"><span class="ab-zone">${room.walking ? 'Іде…' : 'Квартира'}</span><span class="ab-meta">${slotTxt}</span></div>
        <p class="ab-empty">Клікни на меблі або йди стрілками. Біля зони з'являться дії, клавіші 1–9 їх обирають.
        ${game.slot >= G.slotsOf(game) ? '<br>День скінчився, скоро ніч.' : ''}</p>`;
      bindInvite(el); bindDebt(el);
      return;
    }
    const list = G.zoneActions(game, z);
    el.innerHTML = banner + `<div class="ab-head"><span class="ab-zone">${esc(G.ZONES[z].name)}</span><span class="ab-meta">${slotTxt}</span></div>
      <div class="ab-list">${list.map((a, i) => actionButton(a, i)).join('')}</div>`;
    el.querySelectorAll('.act').forEach((b) => { b.onclick = () => act(b.dataset.id); });
    bindInvite(el); bindDebt(el);
  }

  function inviteBanner() {
    const inv = G.inviteToday(game);
    if (!inv || phase !== 'play') return '';
    const p = G.preview(game, 'friends');
    return `<div class="invite"><span class="inv-msg"><b>${esc(inv.name)}</b> пише: «${esc(G.inviteText(inv))}»</span>
      <span class="inv-btns">
        <button class="btn primary" data-inv="yes" ${p.available ? '' : 'aria-disabled="true"'}>Покликати${p.cost != null ? ' · ресурс ' + p.cost : ''}</button>
        <button class="btn" data-inv="no">Відмовити · радість −${Math.abs(C.joy.refuseInvite)}</button>
      </span>
      ${p.available && p.borrow ? `<span class="warn">Позичиш ${p.borrow}: завтра біль +${p.borrow * C.night.borrowPain}, радість −${p.borrow * C.joy.borrowPenalty}</span>` : ''}
      ${!p.available ? `<span class="warn">${esc(p.reason)}</span>` : ''}</div>`;
  }

  // Позика: список друзів. Хто позичив — не приходить, поки не повернеш.
  function showBorrow() {
    if (phase !== 'play') return;
    const L = C.friends.loan;
    const rows = (game.friendNames || C.friends.names).map((n) => {
      const d = (game.debts || {})[n], gone = (game.lostFriends || {})[n];
      if (gone) return '';
      const why = d ? 'уже винен ' + d.amount + ' ₴' : '';
      return `<button class="btn ${why ? '' : 'primary'}" data-borrow="${esc(n)}" ${why ? 'disabled' : ''}>${esc(n)}${why ? ' · ' + why : ' · ' + L.amount + ' ₴'}</button>`;
    }).join('');
    openModal(`<h2>Позичити ${L.amount} ₴</h2>
      <p class="sub">Поки борг не повернеш, цей друг не прийде в гості й не кличе. Через ${L.askAfter} днів спитає про гроші — не повернеш того дня, і друга втрачено назавжди. Втратиш усіх — кінець гри.</p>
      <div class="borrow-list">${rows}</div>
      <div class="row"><button class="btn" id="borrowClose">Не треба</button></div>`, true);
    document.querySelectorAll('[data-borrow]').forEach((b) => { b.onclick = () => {
      const r = G.borrow(game, b.dataset.borrow);
      closeModal();
      if (r) toast('Позичив ' + r.amount + ' ₴ у ' + r.name + '. Поки не повернеш, ' + r.name + ' не прийде.');
      renderAll();
    }; });
    $('borrowClose').onclick = closeModal;
  }

  // Нагадування про борг: повернути зараз або «поки не можу».
  function debtBanner() {
    const a = G.debtAsk(game);
    if (!a || phase !== 'play') return '';
    return `<div class="invite"><span class="inv-msg"><b>${esc(a.name)}</b> пише: «Слухай, а можеш повернути ${a.amount} ₴?»</span>
      <span class="inv-btns">
        <button class="btn primary" data-debt="pay" ${game.money < a.amount ? 'aria-disabled="true"' : ''}>Повернути ${a.amount} ₴</button>
        <button class="btn" data-debt="later">Не можу · втратиш друга</button>
      </span>
      <span class="warn">Не повернеш сьогодні — ${esc(a.name)} більше не напише${G.friendsLeft(game).length === 1 ? '. Це останній друг: після цього — кінець гри' : ''}.</span></div>`;
  }
  function bindDebt(el) {
    const pay = el.querySelector('[data-debt=pay]'), later = el.querySelector('[data-debt=later]');
    if (pay) pay.onclick = () => { const a = G.debtAsk(game); const r = a && G.repay(game, a.name); if (r) toast('Повернув ' + r.amount + ' ₴ ' + r.name + '.'); else toast('Не вистачає грошей'); renderAll(); };
    if (later) later.onclick = () => {
      const a = G.debtAsk(game); const r = a && G.loseFriend(game, a.name);
      if (r) toast(r.text);
      renderAll();
      if (game.lost) setTimeout(showEnd, 900);
    };
  }

  function bindInvite(el) {
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
    const r = G.refuseInvite(game);
    if (r) toast(r.name + ': «' + r.line + '»');
    renderAll();
    if (game.lost) setTimeout(showEnd, 900);
  }

  room.onArrive = (z) => {
    const id = pending;
    pending = null;
    if (id && G.ACTIONS[id].zone === z) act(id);
  };

  function actionButton(a, i) {
    const cost = a.cost == null ? '' : a.cost === 0 ? 'без ресурсу' : 'ресурс ' + a.cost;
    let body = '';
    if (!a.available) {
      body = `<span class="a-why">${esc(a.reason)}</span>`;
    } else {
      body = `<span class="a-fx">${a.effects.map((f) => `<span class="${f.kind}">${esc(f.t)}</span>`).join(' · ')}</span>`;
      if (a.borrow) body += `<span class="a-warn">Позичиш ${a.borrow}: завтра біль +${a.borrow * C.night.borrowPain}, радість −${a.borrow * C.joy.borrowPenalty}</span>`;
      if (a.fatal) body += `<span class="a-warn fatal">${armed === a.id ? 'Натисни ще раз, щоб підтвердити. ' : ''}Після цього: ${esc(a.fatal.text.toLowerCase())}</span>`;
      else if (a.nightFatal) body += `<span class="a-warn fatal">${armed === a.id ? 'Натисни ще раз, щоб підтвердити. ' : ''}Після ночі гра закінчиться: ${esc(a.nightFatal.text.toLowerCase())}</span>`;
      else if (a.nightHospital) body += `<span class="a-warn fatal">${armed === a.id ? 'Натисни ще раз, щоб підтвердити. ' : ''}Уночі біль дійде до 10: лікарня, ${C.hospital.days} дні і ${C.hospital.cost} ₴</span>`;
    }
    const cls = ['act', a.available ? '' : 'off', armed === a.id ? 'armed' : ''].join(' ');
    return `<button class="${cls}" data-id="${a.id}" aria-disabled="${!a.available}">
      <kbd>${i + 1}</kbd><span class="a-name">${esc(a.label)}</span><span class="a-cost">${cost}</span>${body}</button>`;
  }

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
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

  function renderPanel() {
    const el = $('panel');
    if (!game) { el.innerHTML = ''; return; }
    const s = game;
    const st = G.stateKey(s);
    const cfg = C.states[st];
    const hidden = !cfg.hintsVisible;
    const p = G.pain(s);
    const col = STATE_COLOR[st];

    const slots = (C.slotNames[G.slotsOf(s)] || C.slotNames[4]).map((n, i) =>
      `<div class="slot ${i < s.slot ? 'done' : ''} ${i === s.slot ? 'now' : ''}">${n}</div>`).join('');

    // Сили: заповнені — що лишилося, штриховані — позичені.
    const spent = Math.max(0, s.energyMorning + s.restedToday * C.actions.rest.gain - s.energy - s.borrowed);
    let pips = '';
    for (let i = 0; i < s.energy; i++) pips += '<span class="pip on"></span>';
    for (let i = 0; i < spent; i++) pips += '<span class="pip"></span>';
    for (let i = 0; i < s.borrowed; i++) pips += '<span class="pip borrow" title="позичено"></span>';

    // Біль: суцільні клітинки — зараз, пунктир — те, що зняли ліками чи розтяжкою.
    const full = Math.min(C.painMax, s.base + s.extra);
    let cells = '';
    for (let i = 1; i <= C.painMax; i++) {
      let c = 'pc';
      if (i <= p) c += i > s.base ? ' extra' : ' on';
      else if (i <= full) c += ' relief';
      if (i === s.base) c += ' base';
      cells += `<div class="${c}" style="--c:${col}"></div>`;
    }

    const pend = s.pending.slice().sort((a, b) => a.day - b.day);
    const pendTxt = pend.length ? pend.map((x) => `д.${x.day} +${x.amount}`).join(', ') : 'немає';

    const cal = G.calendar(s, 7).map((d, i) => {
      const ev = [];
      if (d.rent) ev.push(`<span class="e-rent">−${d.rent}₴</span>`);
      if (d.deadline) ev.push(`<span class="e-dl">здати ${d.deadline}</span>`);
      if (d.invite) ev.push(`<span class="e-inv ${d.invite.status === 'refused' ? 'refused' : ''}">♥ ${esc(d.invite.name)}</span>`);
      if (d.payout) ev.push(`<span class="e-pay">+${d.payout}₴</span>`);
      const fog = hidden && i >= 2 ? ' fog' : '';
      return `<div class="cd ${i === 0 ? 'today' : ''}${fog}"><span class="n">${d.day}</span>${ev.join('')}</div>`;
    }).join('');

    const hints = G.hints(s);
    // Попередження про програш видно завжди, навіть крізь туман болю.
    const fatalHints = hints.filter((h) => h.kind === 'fatal');
    const hintList = (arr) => `<ul class="hints">${arr.map((h) => `<li class="${h.kind}">${esc(h.t)}</li>`).join('')}</ul>`;
    const bp = G.baseProgress(s);
    const fc = G.forecastNight(s);
    const endWarn = fc && (fc.lost || fc.hospital);
    const allUsed = s.slot >= G.slotsOf(s);
    const inv = G.inviteToday(s);

    el.style.boxShadow = `inset 0 0 ${Math.max(0, p - 3) * 9}px ${Math.max(0, p - 3) * 3}px rgba(5,5,12,.75)`;

    el.innerHTML = `
      <div class="p-head">
        <div class="p-day">День ${s.day} <small>з ${s.days}</small></div>
        <span class="sub">мін. біль ${s.setup.minBase} · друзів ${s.setup.friends}</span>
      </div>
      <div class="slots" style="grid-template-columns: repeat(${G.slotsOf(s) > 4 ? 3 : G.slotsOf(s)}, 1fr)">${slots}</div>

      <div class="sec tipped" tabindex="0">
        <div class="sec-h"><span class="lbl">Ресурс</span><span class="val">${s.energy}</span></div>
        <div class="pips">${pips}</div>
        <div class="tip">
          <p>Зранку ${s.energyMorning}${s.restedToday ? ', +' + C.actions.rest.gain * s.restedToday + ' після відпочинку' : ''}.</p>
          ${s.borrowed ? `<p class="warn">Позичено ${s.borrowed}: завтра біль +${s.borrowed * C.night.borrowPain}, уночі радість −${s.borrowed * C.joy.borrowPenalty}.</p>` : ''}
          <p class="why">Ресурс видається зранку за станом болю: легкий ${C.states.light.energy}, помітний ${C.states.medium.energy}, сильний ${C.states.strong.energy}. Бракує — можна позичити, але кожна одиниця завтра повернеться болем +${C.night.borrowPain} і радістю −${C.joy.borrowPenalty}.</p>
        </div>
      </div>

      <div class="sec tipped" tabindex="0">
        <div class="sec-h"><span class="lbl">Біль</span><span><span class="state-tag" style="--c:${col}">${cfg.name}</span> <span class="val">${p}</span></span></div>
        <div class="painbar">${cells}</div>
        <div class="tip">
          <p>Базовий ${s.base} · тимчасовий ${s.extra >= 0 ? '+' : '−'}${Math.abs(s.extra)}${s.relief ? ' · знято сьогодні −' + s.relief : ''}.</p>
          <p class="why"><b>Базовий</b> — той, до якого все повертається. Знижують: вправи (кожні ${C.night.trainingsPerBaseDrop} днів −1), курс ліків (−${C.actions.course.baseDrop}, поки п’єш щодня і рухаєшся хоча б раз на ${C.actions.course.moveEvery} дні), дзвінок лікарю (−${C.actions.doctor.baseDrop}, лише з болем ${C.actions.doctor.minPain}+). Підвищують: тиждень без вправ (+1), ${C.night.chronic.flares} загострення за тиждень (+1) — не вище стартового +${C.night.chronic.cap}. Лікуванням — не нижче ${G.minBase(game)}: тримає на плаву, але не виліковує.</p>
          <p class="why"><b>Тимчасовий</b> — надбавка до базового. Росте: загострення вночі +${C.night.flareSizes[0][0]}…+${C.night.flareSizes[C.night.flareSizes.length - 1][0]} (буває легке, буває жорстке), кожна позичена одиниця ресурсу +${C.night.borrowPain}. Спадає: сам на ${C.night.painDrift} за ніч, після вправ −${C.actions.exercise.reliefTomorrow}, якщо лягти раніше — ще −${C.actions.sleep.extraDrift}.</p>
          <p class="why"><b>Лише сьогодні</b> — знеболювальне −${C.actions.meds.reliefToday}, розтяжка −${C.actions.stretch.reliefToday}. До ночі, потім знято.</p>
        </div>
      </div>

      <div class="sec tipped" tabindex="0">
        <div class="sec-h"><span class="lbl">Гроші</span><span class="val" style="color:var(--money)">${s.money} ₴</span></div>
        ${Object.entries(s.debts || {}).map(([n, d]) => `<div class="debt"><span>Винен ${esc(n)} ${d.amount} ₴</span>
          <button class="btn ghost" data-repay="${esc(n)}" ${s.money < d.amount ? 'disabled' : ''}>Повернути</button></div>`).join('')}
        ${phase === 'play' && (s.friendNames || C.friends.names).some((n) => G.canBorrow(s, n)) ? `<button class="btn ghost" id="borrowBtn">Позичити ${C.friends.loan.amount} ₴ у друзів</button>` : ''}
        <div class="tip">
          <p class="${hidden ? 'fog' : ''}">Очікується: ${pendTxt}.</p>
          ${Object.entries(s.debts || {}).map(([n, d]) => `<p>Борг ${esc(n)} ${d.amount} ₴ — спитає в день ${d.askDay}.</p>`).join('')}
          <p class="why">Оренда ${G.rentOf(s)} ₴ кожні ${C.rent.every} днів. За роботу платять через ${C.actions.work.payDelay} дні. Гроші на нулі — кінець гри. У кожного друга можна позичити ${C.friends.loan.amount} ₴: поки винен — не приходить, через ${C.friends.loan.askAfter} днів спитає; не повернеш — друга втрачено.</p>
        </div>
      </div>

      <div class="sec tipped" tabindex="0">
        <div class="sec-h"><span class="lbl">Радість</span><span class="val" style="color:var(--joy)">${s.joy}</span></div>
        <div class="joybar"><i style="width:${s.joy}%"></i><b style="left:${C.joy.creativityOffBelow}%"></b><b style="left:${C.joy.creativityOnAbove}%"></b></div>
        <div class="tip">
          ${s.daysAlone && !s.friendsToday ? `<p ${s.daysAlone >= C.lonely.afterDays - 1 ? 'class="warn"' : ''}>Без зустрічей ${s.daysAlone} дн.${s.daysAlone >= C.lonely.afterDays ? ': самотньо, радість ' + C.lonely.joy + ' щоночі, поки когось не побачиш' : ' · з ' + C.lonely.afterDays + '-ї ночі радість ' + C.lonely.joy + ' щоночі'}.</p>` : ''}
          ${s.creativityBlocked ? `<p class="warn">Писати пісні не виходить, поки радість не підніметься до ${C.joy.creativityOnAbove}+.</p>` : ''}
          <p class="why">Щоночі біль забирає радість: легкий ${C.states.light.joyDaily}, помітний ${C.states.medium.joyDaily}, сильний ${C.states.strong.joyDaily}. Дають радість друзі, пісні, книжки, розтяжка, смачна їжа, чистий дім. На нулі — заціпеніння: гра триває, але лишаються тільки доставка, комп і друзі, якщо самі покличуть. Решта сфер котиться вниз.</p>
        </div>
      </div>

      <div class="sec tipped" tabindex="0">
        <div class="sec-h"><span class="lbl">Дім</span><span class="val" ${(s.mess || 0) >= C.chores.annoyAt ? 'style="color:var(--strong)"' : ''}>${esc(G.messText(s.mess || 0))}</span></div>
        <div class="tip">
          <p>${(() => { const b = G.bookNow(s); return b ? 'Книжка «' + esc(b[0]) + '»: ' + s.book.done + ' з ' + b[1] + ' сесій.' : 'Усі книжки прочитані.'; })()}</p>
          <p>${s.song && s.song.title ? 'Пісня «' + esc(s.song.title) + '»: ' + s.song.done + ' з ' + C.actions.create.songSessions + ' сесій за синтезатором.' : 'Нова пісня ще не розпочата.'}</p>
          <p class="why">Безлад росте щодня, після гостей — більше. Понад ${C.chores.freeUpTo} — щоночі забирає радість, і що гірше, то більше. Прибрати можна на кухні.</p>
        </div>
      </div>

      <div class="sec tipped" tabindex="0">
        <div class="sec-h"><span class="lbl">Вправи</span><span class="val">${bp.atMin ? '—' : bp.done + '/' + bp.per}</span></div>
        <div class="tip">
          <p>${bp.atMin ? 'Базовий біль на мінімумі.' : bp.dropTonight ? 'Уночі базовий біль ' + s.base + ' → ' + (s.base - 1) + '.'
            : 'Ще ' + (bp.per - bp.done) + ' ' + (bp.per - bp.done === 1 ? 'день' : bp.per - bp.done < 5 ? 'дні' : 'днів') + ' вправ, і базовий біль ' + s.base + ' → ' + (s.base - 1) + '.'}</p>
          ${s.courseStreak || s.courseToday ? `<p>${s.courseOn ? (G.courseWorks(s) ? 'Курс ліків діє: базовий біль −' + C.actions.course.baseDrop + ', не пропускай і рухайся' : 'Курс не діє без руху: зроби вправи чи розтяжку') : 'Курс ліків: ' + (s.courseStreak + (s.courseToday ? 1 : 0)) + ' з ' + C.actions.course.days + ' днів'}${s.courseToday ? ' · сьогодні випито' : ''}.</p>` : ''}
          ${s.daysNoExercise && !(s.exerciseToday && s.exerciseQuality !== 'short') ? `<p ${s.daysNoExercise >= C.night.detrain.afterDays - 1 ? 'class="warn"' : ''}>Без вправ ${s.daysNoExercise} дн.${s.daysNoExercise >= C.night.detrain.afterDays ? ': м’язи задубіли' : ''}.</p>` : ''}
          <p class="why">Кожні ${C.night.trainingsPerBaseDrop} днів вправ — базовий біль −1. Без вправ: на ${C.night.detrain.afterDays}-тю ніч тимчасовий +${C.night.detrain.pain}, за тиждень — базовий +1.</p>
        </div>
      </div>

      <div class="sec tipped" tabindex="0">
        <div class="sec-h"><span class="lbl">Робота за тиждень</span><span class="val">${s.workWeek}/${C.work.unitsPerDeadline}</span></div>
        <div class="tip">
          <p>${(() => {
            let dl = s.day; while (dl % C.work.deadlineEvery !== 0) dl++;
            const left = dl - s.day;
            return dl > s.days ? 'Дедлайнів більше немає' : left === 0 ? 'Дедлайн сьогодні (рахується вночі)' : 'До дедлайну ' + left + ' ' + (left === 1 ? 'день' : left < 5 ? 'дні' : 'днів') + ' (день ' + dl + ')';
          })()}${s.misses ? ' · пропущено ' + s.misses : ''}${s.unpaidUnits ? ' · без оплати ще ' + s.unpaidUnits : ''}${s.partTime ? ' · частковий графік ×' + C.work.partTimeMult : ''}.</p>
          <p class="why">Щотижня треба ${C.work.unitsPerDeadline} одиниць роботи. Недороблене стає неоплачуваними днями; два пропущені дедлайни — частковий графік.</p>
        </div>
      </div>

      <div class="sec">
        <span class="lbl">Календар</span>
        <div class="cal">${cal}</div>
      </div>

      <div class="sec">
        <span class="lbl">Підказки</span>
        ${hidden
          ? `<div class="fogwrap"><div class="fog">${hintList(hints.filter((h) => h.kind !== 'fatal'))}</div>
             <div class="fognote">Біль заважає думати наперед</div></div>${fatalHints.length ? hintList(fatalHints) : ''}`
          : hintList(hints)}
      </div>

      <div class="btns">
        <button class="btn primary ${allUsed ? 'pulse' : ''}" id="endBtn">${allUsed ? 'Завершити день' : 'Лягти раніше'} <kbd>E</kbd></button>
        <button class="btn" id="journalBtn">Щоденник</button>
      </div>
      ${!allUsed ? `<div class="sub">Слоти ще лишилися: якщо лягти зараз — ${esc(G.sleepGainText(s))}.</div>` : ''}
      <button class="btn ghost" id="restartBtn">Почати заново</button>
      ${inv ? `<div class="warn">Якщо завершити день без зустрічі: відмова ${esc(inv.name)}, радість −${Math.abs(C.joy.refuseInvite)}</div>` : ''}
      ${endWarn ? `<div class="warn" style="color:var(--fatal)">${fc.lost ? 'Після ночі гра закінчиться: ' + esc(fc.lost.text.toLowerCase()) : 'Уночі біль дійде до 10: лікарня'}</div>` : ''}
    `;
    if (tipIndex != null) showTip(tipIndex);   // панель перемалювалась — підказка лишається з новими числами
    $('endBtn').onclick = endDayClick;
    document.querySelectorAll('[data-repay]').forEach((b) => { b.onclick = () => { if (phase !== 'play') return; const r = G.repay(game, b.dataset.repay); if (r) toast('Повернув ' + r.amount + ' ₴ ' + r.name + '. Тепер знову можна в гості.'); renderAll(); }; });
    if ($('borrowBtn')) $('borrowBtn').onclick = showBorrow;
    $('journalBtn').onclick = showJournal;
    $('restartBtn').onclick = askRestart;
  }

  // ---------- підказки секцій ----------
  // Окреме вікно поверх сторінки: панель прокручується й обрізала б підказку всередині себе.
  let tipIndex = null;
  function showTip(i) {
    const secs = [...document.querySelectorAll('#panel .sec.tipped')], sec = secs[i], box = $('tipBox');
    if (!sec) { hideTip(); return; }
    tipIndex = i;
    box.innerHTML = sec.querySelector('.tip').innerHTML;
    box.hidden = false;
    const r = sec.getBoundingClientRect(), pr = $('panel').getBoundingClientRect(), bw = box.offsetWidth, bh = box.offsetHeight;
    let left, top;
    if (pr.left > bw + 24) { left = pr.left - bw - 12; top = r.top; }          // ліворуч від панелі, навпроти секції
    else { left = Math.max(12, r.left); top = r.bottom + 6; }                 // вузький екран — під секцією
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

  // Нова гра з поточної: спершу підтвердження, щоб не стерти день випадковим кліком.
  function askRestart() {
    if (phase !== 'play') return;
    openModal(`
      <h2>Почати заново?</h2>
      <p>Поточна гра (день ${game.day} з ${game.days}) пропаде. Можна буде обрати іншу тяжкість і тривалість.</p>
      <div class="row">
        <button class="btn" data-k="back">Повернутися</button>
        <button class="btn primary" data-k="go">Почати заново</button>
      </div>`, true);
    $('modal').querySelector('[data-k=back]').onclick = closeModal;
    $('modal').querySelector('[data-k=go]').onclick = () => { room.endVisit(true); showSetup(); };
    $('modal').querySelector('[data-k=back]').focus();
  }

  function renderAll() { renderPanel(); renderActions(); renderChips(); renderSceneToggle(); }

  // Один перемикач міні-ігор у кутку над кімнатою: видно одразу, а не лише біля зони.
  function renderSceneToggle() {
    const b = $('sceneTog');
    b.hidden = !game || phase === 'setup' || phase === 'scene' || phase === 'cut';
    b.classList.toggle('on', setupChoice.scenes);
    b.innerHTML = 'Міні-ігри: ' + (setupChoice.scenes ? 'увімк.' : 'вимк.') + ' <kbd>M</kbd>';
  }
  $('sceneTog').onclick = () => { if (phase === 'play') toggleScenes(); };

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
    const diffs = slider('money', 'Гроші на старті', SU.money, ' ₴', 'оренда ' + C.rent.amount + ' ₴ щотижня') +
      slider('friends', 'Друзі', SU.friends, '', 'що більше, то частіше кличуть і є в кого позичити') +
      slider('minBase', 'Мінімальний базовий біль', SU.minBase, '', 'нижче лікування не опустить; на старті базовий ще +' + SU.startExtra);
    openModal(`
      <h1>Біль життя</h1>
      <p>Ти живеш із хронічним болем і майже не виходиш з квартири. Кожен день має стільки слотів і ресурсу, скільки дозволяє ранковий біль.
      Розподіляй їх між роботою, радістю і тим, що знижує біль. Ресурс можна позичати, але завтра він повернеться болем.</p>
      <p class="sub">Треба прожити ${C.days} днів. Оренда кожні ${C.rent.every} днів, дедлайн щотижня. Гроші на нулі — кінець; радість на нулі — заціпеніння. Біль 10 — це лікарня.</p>
      <div class="opts"><span class="lbl">Твоє життя</span>${diffs}</div>
      <p class="sub">Керування: клік по меблях або стрілки/WASD, цифри обирають дію, E завершує день, J відкриває щоденник, M вмикає чи вимикає міні-ігри (планерки й розмови).</p>
      <div class="row"><button class="btn primary" id="startBtn">Почати</button></div>
    `, false);
    for (const k of ['money', 'friends', 'minBase']) {
      const inp = $('su-' + k);
      inp.oninput = () => { $('su-' + k + '-v').textContent = inp.value + (k === 'money' ? ' ₴' : ''); };
    }
    $('startBtn').focus();
    $('startBtn').onclick = () => {
      setupChoice = { money: +$('su-money').value, friends: +$('su-friends').value, minBase: +$('su-minBase').value, days: C.days, scenes: setupChoice.scenes };
      newGame(setupChoice);
    };
  }

  function newGame(opts) {
    endingPlayed = false;
    game = G.createGame(opts);
    closeModal();
    phase = 'play';
    room.endVisit(true); room.resetHero();
    $('cutCaption').hidden = true;
    lastZone = undefined;
    renderAll();
    toast('День 1. Біль ' + G.pain(game) + ', ' + C.states[G.stateKey(game)].name.toLowerCase() + '. Ресурс: ' + game.energy + '.' + inviteNote());
  }

  function inviteNote() {
    const inv = G.inviteToday(game);
    return inv ? ' ' + inv.name + ' пише, хоче зайти.' : '';
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

  // Дострокове завершення: спершу сцена в кімнаті, потім підсумок.
  let endingPlayed = false;
  function showEnd() {
    if (game && game.lost && !endingPlayed && ['joy', 'money', 'friends'].includes(game.lost.cause)) {
      endingPlayed = true;
      phase = 'cut';
      closeModal();
      held.clear(); applyKeys();
      room.playEnding(game.lost.cause, () => { $('cutCaption').hidden = true; showEnd(); });
      renderAll();
      return;
    }
    phase = 'end';
    const sm = G.summary(game);
    const head = sm.lost
      ? `<h2>День ${sm.lost.day} з ${sm.days}</h2><p class="lost-line">${esc(sm.lost.sphere)} на нулі: ${esc(sm.lost.text.toLowerCase())} у день ${sm.lost.day}.</p>`
      : `<h2>${sm.days} днів позаду</h2><p>Ось що лишилося в твоєму житті і що з нього випало.</p>`;
    openModal(`
      ${head}
      <div class="cols">
        <div><h3>Збережено</h3><ul>${sm.kept.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
        <div><h3>Втрачено</h3><ul>${sm.lostItems.length ? sm.lostItems.map((x) => `<li>${esc(x)}</li>`).join('') : '<li>Нічого помітного</li>'}</ul></div>
      </div>
      <div class="row">
        <button class="btn" id="eJournal">Щоденник</button>
        <button class="btn primary" id="eNew">Нова гра</button>
      </div>
    `, false);
    $('eJournal').onclick = showJournal;
    $('eNew').onclick = showSetup;
    renderAll();
  }

  // ---------- старт ----------

  function start(data) {
    fit();
    if (data && data.game) {
      game = data.game; phase = ['night', 'work', 'scene', 'cut', 'report'].includes(data.phase) ? 'play' : data.phase || 'play';
      if (data.hero) Object.assign(room.hero, data.hero);
      if (phase === 'end') showEnd(); else if (phase === 'setup') showSetup(); else renderAll();
    } else {
      showSetup();
    }
    requestAnimationFrame((t) => { prev = t; frame(t); });
  }

  // Для налагодження з консолі: zapas.game.extra = 4; zapas.refresh()
  window.zapas = { get game() { return game; }, room, refresh: renderAll };

  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ game, phase, hero: { x: room.hero.x, y: room.hero.y } }));
  if (hot && hot.ready) hot.ready(start); else start(hot && hot.data ? hot.data : {});
})();
