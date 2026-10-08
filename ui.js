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
  // Міні-ігри від першої особи; вимкнено — результат рахується сам. Пам'ятаємо між сесіями.
  let setupChoice = { money: C.setup.money.def, basePain: C.setup.basePain.def, scenes: loadScenes() };
  function loadScenes() { try { return localStorage.getItem('zapas.scenes') !== '0'; } catch (e) { return true; } }
  function toggleScenes() {
    setupChoice.scenes = !setupChoice.scenes;
    try { localStorage.setItem('zapas.scenes', setupChoice.scenes ? '1' : '0'); } catch (e) { /* не страшно */ }
    toast(setupChoice.scenes ? 'Міні-ігри увімкнено' : 'Міні-ігри вимкнено: результат рахується сам, за станом болю');
    renderAll();
  }

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
        slot: phase === 'night' ? 4 : G.dayPhase(game),
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
      const a = G.zoneActions(game, z)[Number(e.code.slice(5)) - 1];
      if (a) act(a.id);
      return;
    }
    if (e.code === 'KeyE') endDayClick();
    if (e.code === 'KeyM') toggleScenes();
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
  function runScene(Scene, extra, toOpts, id, p) {
    phase = 'scene';
    held.clear(); applyKeys();
    Scene.start(sceneOpts(Object.assign({}, extra, { onDone: (res) => { phase = 'play'; finishAction(id, p, toOpts(res)); } })));
    renderAll();
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
    const sc = setupChoice.scenes;
    if (sc && id === 'create' && window.SynthGame) return runScene(window.SynthGame, { title: G.songTitle(game) }, (r) => ({ synth: r }), id, p);
    if (sc && id === 'games' && window.RunGame) return runScene(window.RunGame, { jumps: C.actions.games.jumps, painChance: C.actions.games.painChance }, (r) => ({ runner: r }), id, p);
    if (sc && id === 'cook' && window.CookGame) return runScene(window.CookGame, {}, (r) => ({ cook: r }), id, p);
    if (sc && id === 'exercise' && window.MatGame) return runScene(window.MatGame, {}, (r) => ({ mat: r }), id, p);
    if (sc && id === 'work' && window.Meeting) return runScene(window.Meeting, { canvas, payDay: game.day + C.actions.work.payDelay }, (r) => ({ score: r.score }), id, p);
    if (sc && id === 'read' && window.ReadGame) {
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
  function showDelta(b) {
    const a = snap(), parts = [];
    const sg = (v) => (v > 0 ? '+' : '−') + Math.abs(v);
    for (const k of ['people', 'body', 'soul']) if (a[k] !== b[k]) parts.push({ t: G.SPHERES[k].name + ' ' + sg(a[k] - b[k]), k: a[k] > b[k] ? 'good' : 'bad' });
    if (a.pending > b.pending) parts.push({ t: '+' + (a.pending - b.pending) + ' ₴ через ' + C.actions.work.payDelay + ' дні', k: 'good' });
    if (a.money !== b.money) parts.push({ t: sg(a.money - b.money) + ' ₴', k: a.money > b.money ? 'good' : 'bad' });
    if (a.pain !== b.pain) parts.push({ t: 'біль ' + b.pain + '→' + a.pain, k: a.pain < b.pain ? 'good' : 'bad' });
    if (a.tomorrow > b.tomorrow) parts.push({ t: 'завтра ресурс −' + (a.tomorrow - b.tomorrow), k: 'bad' });
    if (a.future > b.future) { const f = game.future[game.future.length - 1]; parts.push(f.kind === 'relief' ? { t: 'день ' + f.day + ': біль −' + f.amount, k: 'good' } : { t: 'завтра відкат +' + f.amount, k: 'bad' }); }
    if (a.fed && !b.fed) parts.push({ t: game.foodType === 'guests' ? 'друзі нагодували' : 'їжа на день є', k: game.foodType === 'guests' ? 'good' : '' });
    if (a.bookI > b.bookI) parts.push({ t: 'дочитав «' + game.lastBookDone + '»!', k: 'good' });
    if (a.songN > b.songN) parts.push({ t: 'дописав «' + game.lastSongDone + '»!', k: 'good' });
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
    if (r.ok) showDelta(before);
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
    window.FriendTalk.start(sceneOpts({
      canvas, names, invited: !!game.lastVisitInvited, missedLast: !!game.lastTalkMissed,
      onDone: (res) => {
        const before = snap();
        const note = G.applyTalk(game, res.kinds);
        showDelta(before);
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
      const text = fc.lost ? esc(fc.lost.text) + '.' : `Біль дійде до 10, приїде швидка: день випаде, −${C.hospital.cost} ₴.`;
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
    };
    renderAll();
  }

  // ---------- рядок дій ----------
  function renderActions() {
    const el = $('actionBar');
    if (phase === 'scene' || phase === 'cut') return;
    if (!game || phase === 'setup') { el.innerHTML = ''; return; }
    const z = room.currentZone();
    const banner = inviteBanner();
    const meta = 'Ресурс ' + game.spoons + ' з ' + game.spoonsMorning + (game.borrowed ? ' · узято наперед ' + game.borrowed : '');
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
  }

  function inviteBanner() {
    const inv = G.inviteToday(game);
    if (!inv || phase !== 'play') return '';
    const p = G.preview(game, 'friends');
    return `<div class="invite"><span class="inv-msg"><b>${esc(inv.name)}</b> пише: «${esc(G.inviteText(inv))}»</span>
      <span class="inv-btns">
        <button class="btn primary" data-inv="yes" ${p.available ? '' : 'aria-disabled="true"'}>Покликати${p.cost != null ? ' · ресурс ' + p.cost : ''}</button>
        <button class="btn" data-inv="no">Відмовити · Стосунки −${C.friends.refuse}</button>
      </span>
      ${p.available && p.borrow ? `<span class="warn">Наперед ${p.borrow}: завтра на стільки менше ресурсу</span>` : ''}
      ${!p.available ? `<span class="warn">${esc(p.reason)}</span>` : ''}</div>`;
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
    if (r) toast(r.text);
    renderAll();
  }
  room.onArrive = (z) => {
    const id = pending;
    pending = null;
    if (id && G.ACTIONS[id].zone === z) act(id);
  };

  function actionButton(a, i) {
    const cost = a.cost == null ? '' : a.cost === 0 ? 'без ресурсу' : 'ресурс ' + a.cost;
    let body;
    if (!a.available) body = `<span class="a-why">${esc(a.reason)}</span>`;
    else {
      body = `<span class="a-fx">${a.effects.map((f) => `<span class="${f.kind}">${esc(f.t)}</span>`).join(' · ')}</span>`;
      if (a.borrow) body += `<span class="a-warn${armed === a.id ? ' fatal' : ''}">${armed === a.id ? 'Натисни ще раз, щоб узяти ' + a.borrow + ' наперед.' : 'Бракує ресурсу: доведеться взяти ' + a.borrow + ' з завтра.'}</span>`;
    }
    const cls = ['act', a.available ? '' : 'off', armed === a.id ? 'armed' : ''].join(' ');
    return `<button class="${cls}" data-id="${a.id}" aria-disabled="${!a.available}">
      <kbd>${i + 1}</kbd><span class="a-name">${esc(a.label)}</span><span class="a-cost">${cost}</span>${body}</button>`;
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
  function sphereSec(s, k, tip) {
    const isMoney = k === 'money';
    const v = isMoney ? Math.round(s.money / 20) : s[k];
    const danger = isMoney ? s.money < G.dailyCost(s.day) * 2 : v <= 2;
    const cells = Array.from({ length: C.sphereMax }, (_, i) => `<i class="${i < v ? 'on' : ''}"></i>`).join('');
    return `<div class="sec tipped sph ${danger ? 'danger' : ''}" tabindex="0" style="--c:${SPH_COLOR[k]}">
      <div class="sec-h"><span class="lbl">${G.SPHERES[k].name}</span><span class="val">${isMoney ? s.money + ' ₴' : v}</span></div>
      <div class="meter">${cells}</div>
      <div class="tip">${tip}</div></div>`;
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
    const incoming = s.pending.slice().sort((a, b) => a.day - b.day).map((x) => `д.${x.day} +${x.amount}`).join(', ') || 'немає';
    const pills = G.pillsInWeek(s), active = G.courseActive(s);

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
          <p>Зранку ресурс ${s.spoonsMorning}${eaten ? ', біль з\'їв ' + eaten : ''}${s.coffeeToday ? ', +' + C.actions.coffee.gain + ' від кави' : ''}${s.borrowed ? ', узято наперед ' + s.borrowed : ''}.
          Біль зараз ${p} (${C.states[st].name.toLowerCase()}): базовий ${s.base}, тимчасовий ${s.extra >= 0 ? '+' : '−'}${Math.abs(s.extra)}${s.relief ? ', знято сьогодні −' + s.relief : ''}. Шанс загострення вночі ${flareP}%.</p>
          <p class="why"><b>Ресурс</b> — сили на день, кожна справа коштує ресурсу. Біль з'їдає частину: для болю 1…10 лишається ${C.spoons.slice(1).join(' / ')}.
          Емоції ${L.soulHigh}+ дають ще +1. Стосунки ${L.peopleHelp}+ підхоплюють у поганий ранок: +1. Бракує — можна взяти до ${C.maxBorrow} із завтра.
          Ліг з нулем чи взяв наперед — шанс загострення вночі +${Math.round(C.night.exhausted * 100)}%; лишив ${C.night.earlyRest}+ — завтра біль −1.</p>
          <p class="why"><b>Біль б'є по всьому, але по-різному:</b> менше ресурсу; робота дає менше грошей; з друзями ти «не тут» — зустріч дає менше; вправи дорожчі; з болем 7+ не пишеться і не читається, не встояти біля плити; день у сильному болю пригнічує емоції.</p>
          <p class="why"><b>Знижують біль:</b> курс ліків (−${C.course.drop}, поки за ${C.course.window} днів випито ${C.course.need}+ пігулок), лікар на днях ${C.doctor.days.join(' і ')} (якщо курс діє), платна процедура (різко, але дорого), вправи (через ${C.actions.exercise.reliefIn} дні −${C.actions.exercise.relief}), розтяжка, знеболювальне й процедура (знімають тимчасовий біль), лягти з запасом. Лікуванням базовий нижче ніж −${C.maxRelief} не опустиш.
          <b>Підвищують:</b> загострення (шанс тримає Тіло; перевтома, кава й знеболювальне його підвищують), а ще кава й знеболювальне.</p>
        </div>
      </div>

      ${sphereSec(s, 'money', `<p>Гроші: ${s.money} ₴. Очікується: ${incoming}.</p>
        <p class="why">Щоночі витрати на життя: ${C.costs.join(' / ')} ₴ за тижнями. Робота — ресурс ${C.actions.work.spoons}, гроші через ${C.actions.work.payDelay} дні; з болем заробляєш менше. Гроші тримають тіло: їжа, ліки. На нулі — кінець. Бракує — можна позичити ${C.actions.loan.amount} ₴ у друзів (диван): незручно, Стосунки −${C.actions.loan.people}; через ${C.actions.loan.dueIn} днів віддаєш, а не зможеш — Стосунки −${C.actions.loan.late}.${s.loan ? ' Борг ' + s.loan.amount + ' ₴ ' + esc(s.loan.from) + ' — віддати в день ' + s.loan.due + '.' : ''}</p>`)}
      ${sphereSec(s, 'people', `<p class="why">Друзі. Зустріч — ресурс ${C.actions.friends.spoons} (якщо друзі самі напросились — ${C.actions.friends.inviteSpoons}): +4 при легкому болю, +3 при помітному, +2 при сильному; на їхнє запрошення ще +${C.actions.friends.invited}. Написати — ресурс ${C.actions.text.spoons}, +${C.actions.text.people}, і кличуть частіше. Відмова чи пропущена зустріч — −${C.friends.refuse}. Стосунки ${L.peopleHelp}+ підхоплюють у поганий ранок.</p>`)}
      ${sphereSec(s, 'body', `<p>Шанс загострення вночі зараз ${flareP}%.</p><p class="why">Вправи (+${C.actions.exercise.body}, через ${C.actions.exercise.reliefIn} дні біль −1), розтяжка (+1), своя їжа (+1). Без їжі — −${C.hungry.body}. Тіло тримає біль: що міцніше, то рідше загострення. Якщо Тіло на прийомі ${C.doctor.rescueBody} і нижче, лікар зробить платний укол (${C.doctor.rescueCost} ₴): +${C.doctor.rescue}.</p>`)}
      ${sphereSec(s, 'soul', `<p>${(() => {
        // Скільки ще сесій до кінця — щоб було ясно, що пісню треба дописати, а книжку дочитати.
        const A = C.actions.create, R = C.actions.read, b = G.bookNow(s);
        const left = (n) => n + ' ' + (n === 1 ? 'сесія' : n < 5 ? 'сесії' : 'сесій');
        const song = s.song.title && s.song.done
          ? 'Пишеш пісню «' + esc(s.song.title) + '»: готово ' + s.song.done + ' з ' + A.songSessions + ' сесій за синтезатором. Ще ' + left(A.songSessions - s.song.done) + ' — і дописана пісня дасть Емоції +' + A.songSoul + '.'
          : 'Пісня пишеться за ' + A.songSessions + ' сесії за синтезатором; дописана дає Емоції +' + A.songSoul + '.';
        const book = !b ? 'Усі книжки прочитані.'
          : s.book.done ? 'Читаєш «' + esc(b[0]) + '»: прочитано ' + s.book.done + ' з ' + b[1] + ' сесій. Ще ' + left(b[1] - s.book.done) + ' — і дочитана книжка дасть Емоції +' + R.finishSoul + '.'
          : 'На черзі «' + esc(b[0]) + '» — ' + b[1] + ' сесії читання; дочитана дає Емоції +' + R.finishSoul + '.';
        return song + '</p><p>' + book;
      })()}</p>
        <p class="why">Кожна сесія за синтезатором чи з книжкою трохи піднімає Емоції, а бонус дає лише дописана пісня чи дочитана книжка — тож починати варто те, що встигнеш закінчити. Ще дають Емоції ігри й смачна їжа. Емоції ${L.soulHigh}+ — зранку ресурс +1. Сильний біль пригнічує: −1 за ніч.</p>`)}

      <div class="sec">
        <span class="lbl">Календар</span>
        <div class="cal" style="grid-template-columns: repeat(5, 1fr)">${cal}</div>
      </div>

      <div class="sec tipped" tabindex="0">
        <div class="sec-h"><span class="lbl">Курс лікування</span><span class="val">${pills}/${C.course.window}</span></div>
        <div class="tip"><p>Пігулок за останні ${C.course.window} днів: ${pills}${s.courseToday === s.day ? ' (сьогоднішня теж)' : ''}. ${active ? 'Курс діє: базовий біль −' + C.course.drop + '.' : 'Курс не діє: треба ' + C.course.need + ' з ' + C.course.window + '.'}</p>
        <p class="why">Пігулка — ${C.course.money} ₴, без ресурсу, раз на день. Курс діє, поки за останні ${C.course.window} днів випито хоча б ${C.course.need} пігулок: базовий біль −${C.course.drop}. Пропускати можна, але не часто — інакше курс перестане діяти. Лікар приймає ввечері днів ${C.doctor.days.join(' і ')}: якщо курс діє — підсилює лікування, біль слабшає ще на 1. Якщо Тіло слабке (${C.doctor.rescueBody} і нижче) — платний укол для відновлення: Тіло +${C.doctor.rescue}, −${C.doctor.rescueCost} ₴. Гірше лікар не робить.</p></div>
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
      ${fc && fc.lost ? `<div class="warn" style="color:var(--fatal)">Після ночі: ${esc(fc.lost.text.toLowerCase())}</div>` : fc && fc.lostFlare ? `<div class="warn">Якщо вночі загострення — ${esc(fc.lostFlare.text.toLowerCase())}</div>` : ''}
    `;
    if (tipIndex != null) showTip(tipIndex);
    $('endBtn').onclick = endDayClick;
    $('journalBtn').onclick = showJournal;
    $('restartBtn').onclick = askRestart;
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
    openModal(`
      <h1>Біль життя</h1>
      <p>Ти живеш із хронічним болем і проходиш ${C.days}-денний курс лікування. Щоранку біль вирішує, скільки в тебе <b>ресурсу</b> — сил на день; решту з'їдає біль.
      Кожна справа коштує ресурсу. На них тримаються чотири сфери життя: <b>Гроші</b>, <b>Стосунки</b>, <b>Тіло</b> і <b>Емоції</b>. Щоночі кожна трохи тане, а життя тисне дедалі сильніше.</p>
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
      setupChoice = { money: +$('su-money').value, basePain: +$('su-basePain').value, scenes: setupChoice.scenes };
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
    // Фінал «Емоції згасли» — про найтемніше. Поруч — куди звернутися, якщо так зараз і в житті.
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
    const list = [['money', 'Гроші'], ['friends', 'Стосунки'], ['body', 'Тіло'], ['joy', 'Емоції'], ['win', 'перемога (дожив до кінця)']];
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
  window.zapas = { get game() { return game; }, room, refresh: renderAll };

  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ game, phase, hero: { x: room.hero.x, y: room.hero.y } }));
  if (hot && hot.ready) hot.ready(start); else start(hot && hot.data ? hot.data : {});
})();
