// Правила гри без графіки: ресурс, біль, чотири сфери. Працює і в браузері, і в node (sim.js).
// Стан змінюється лише тут; ui.js тільки показує і передає рішення гравця.
(function (root) {
  'use strict';
  let C = typeof module !== 'undefined' && module.exports ? require('./config.js') : root.GAME_CONFIG;

  const ZONES = {
    sofa:    { name: 'Диван' },
    desk:    { name: 'Робочий стіл' },
    mat:     { name: 'Килимок' },
    kitchen: { name: 'Кухня' },
    shelf:   { name: 'Аптечка' },
    books:   { name: 'Книжки' },
    synth:   { name: 'Синтезатор' },
  };

  // sphere — у яку сферу дія вкладає (для підказок і кольору).
  const ACTIONS = {
    work:     { zone: 'desk',    label: 'Робота', sphere: 'money' },
    games:    { zone: 'desk',    label: 'Пограти в ігри', sphere: 'soul' },
    create:   { zone: 'synth',   label: 'Писати пісню', sphere: 'soul' },
    friends:  { zone: 'sofa',    label: 'Покликати друзів', sphere: 'people' },
    text:     { zone: 'sofa',    label: 'Написати другові', sphere: 'people' },
    exercise: { zone: 'mat',     label: 'Вправи', sphere: 'body' },
    stretch:  { zone: 'mat',     label: 'Розтяжка', sphere: 'body' },
    cook:     { zone: 'kitchen', label: 'Приготувати', sphere: 'body' },
    delivery: { zone: 'kitchen', label: 'Замовити доставку', sphere: 'body' },
    clean:    { zone: 'kitchen', label: 'Прибрати', sphere: 'soul' },
    coffee:   { zone: 'kitchen', label: 'Випити кави', sphere: null },
    course:   { zone: 'shelf',   label: 'Пігулка з курсу', sphere: 'body' },
    meds:     { zone: 'shelf',   label: 'Знеболювальне', sphere: null },
    read:     { zone: 'books',   label: 'Почитати', sphere: 'soul' },
  };
  const ACTION_IDS = Object.keys(ACTIONS);

  const SPHERES = {
    money:  { name: 'Гроші', fall: 'Гроші скінчилися', ending: 'money' },
    people: { name: 'Люди', fall: 'Люди відвернулися', ending: 'friends' },
    body:   { name: 'Тіло', fall: 'Тіло здалося', ending: 'body' },
    soul:   { name: 'Душа', fall: 'Душа згасла', ending: 'joy' },
  };
  const SPHERE_IDS = Object.keys(SPHERES);
  const SOFT = ['people', 'body', 'soul'];   // сфери 0–10 (гроші — у ₴)

  // ---------- випадковість з зерном ----------
  function rand(s) {
    let t = (s.rng = (s.rng + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const pick = (s, arr) => arr[Math.floor(rand(s) * arr.length)];
  const clampS = (v) => Math.max(0, Math.min(C.sphereMax, v));
  const signed = (v) => (v > 0 ? '+' : '−') + Math.abs(v);

  // ---------- біль ----------
  const rawPain = (s) => s.base + s.extra;
  const pain = (s) => Math.max(C.painMin, Math.min(C.painMax, rawPain(s) - s.relief));
  function stateOfPain(p) {
    for (const k of Object.keys(C.states)) if (p >= C.states[k].min && p <= C.states[k].max) return k;
    return p < 1 ? 'light' : 'strong';
  }
  const stateKey = (s) => stateOfPain(pain(s));

  // Ціна дії в ресурсі за сьогоднішнім станом; null — у цьому стані недоступно.
  function spoonCost(s, id) {
    const c = C.actions[id].spoons;
    return typeof c === 'number' ? c : c[stateKey(s)];
  }

  // ---------- журнал ----------
  function journalFor(s, day) {
    let j = s.journal.find((e) => e.day === day);
    if (!j) { j = { day, morningPain: 0, state: 'light', did: [], refused: [], tried: [], night: [] }; s.journal.push(j); }
    return j;
  }

  // ---------- нова гра ----------
  function createGame(opts) {
    opts = opts || {};
    const SU = C.setup, clampN = (v, r) => Math.max(r.min, Math.min(r.max, Math.round(v != null ? v : r.def)));
    const basePain = clampN(opts.basePain, SU.basePain), friendsN = clampN(opts.friends, SU.friends), money = clampN(opts.money, SU.money);
    const seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 2 ** 31);
    const s = {
      seed, rng: seed | 0, days: opts.days || C.days, day: 1,
      setup: { money, friends: friendsN, basePain },
      baseStart: basePain, base: basePain, extra: SU.startExtra, relief: 0,
      courseStreak: 0, courseDrop: 0, courseToday: 0, doctorDrop: 0,
      money, people: C.start.people, body: C.start.body, soul: C.start.soul,
      spoons: 0, spoonsMorning: 0, spent: 0, borrowed: 0, spoonTomorrow: 0,
      friendNames: C.friends.names.slice(0, friendsN),
      invites: {}, future: [], pending: [],
      used: {}, fed: false, foodType: null, painkiller: false, coffeeToday: 0, textedToday: false,
      book: { i: 0, done: 0 }, song: { n: 1, done: 0, title: null },
      journal: [], history: [], lost: null, finished: false,
      stats: { meetings: 0, invitesAccepted: 0, invitesRefused: 0, earned: 0, songs: 0, songTitles: [], booksRead: 0,
        flares: 0, hospital: 0, exercise: 0, hungry: 0, borrowed: 0, strongDays: 0, coursePills: 0, talkHeard: 0, talkMissed: 0 },
    };
    // Книжки на полиці — у випадковому порядку, щоб не щоразу «Тигролови».
    s.bookOrder = C.books.map((_, i) => i);
    for (let i = s.bookOrder.length - 1; i > 0; i--) { const k = Math.floor(rand(s) * (i + 1)); [s.bookOrder[i], s.bookOrder[k]] = [s.bookOrder[k], s.bookOrder[i]]; }
    // Перша пропозиція від друзів — на 3-й день, щоб календар не був порожнім.
    addInvite(s, 3);
    startDay(s, []);
    return s;
  }

  // Ранок: те, що настало з календаря, ресурс з болю, зв'язки сфер.
  function startDay(s, ev) {
    s.relief = 0; s.spent = 0; s.borrowed = 0; s.used = {};
    s.fed = false; s.foodType = null; s.painkiller = false; s.coffeeToday = 0;
    for (const f of s.future.filter((x) => x.day === s.day)) {
      if (f.kind === 'relief') { s.extra -= f.amount; ev.push({ kind: 'good', text: 'Вправи окупились: біль −' + f.amount }); }
      if (f.kind === 'rebound') { s.extra += f.amount; ev.push({ kind: 'pain', text: 'Знеболювальне відпустило: біль +' + f.amount }); }
    }
    s.future = s.future.filter((x) => x.day > s.day);
    const L = C.links;
    let sp = C.spoons[Math.max(0, Math.min(10, pain(s)))];
    if (s.soul >= L.soulHigh) { sp++; ev.push({ kind: 'good', text: 'Душа на місці: ресурс +1' }); }
    if (s.soul <= L.soulLow) { sp--; ev.push({ kind: 'bad', text: 'На душі порожньо: ресурс −1' }); }
    if (s.spoonTomorrow) { sp -= s.spoonTomorrow; ev.push({ kind: 'bad', text: 'Учора взяв наперед: ресурс −' + s.spoonTomorrow }); s.spoonTomorrow = 0; }
    if (sp <= 3 && s.people >= L.peopleHelp) { sp++; ev.push({ kind: 'good', text: 'Друг підхопив у поганий ранок: ресурс +1' }); }
    s.spoons = s.spoonsMorning = Math.max(1, sp);
    const st = stateKey(s);
    if (st === 'strong') s.stats.strongDays++;
    const j = journalFor(s, s.day);
    j.morningPain = pain(s); j.state = st;
    s.history.push({ day: s.day, pain: pain(s), money: s.money, people: s.people, body: s.body, soul: s.soul, spoons: s.spoons });
  }

  // ---------- друзі ----------
  function addInvite(s, day) {
    if (day > s.days || s.invites[day]) return null;
    s.invites[day] = { name: pick(s, s.friendNames), status: 'open', line: Math.floor(rand(s) * C.friends.inviteLines.length) };
    return s.invites[day];
  }
  function inviteToday(s) {
    const inv = s.invites[s.day];
    return inv && inv.status === 'open' ? inv : null;
  }
  function inviteText(inv) { return (C.friends.inviteLines[inv.line] || C.friends.inviteLines[0]).text; }
  // Відмова: явна (кнопкою) або мовчазна (день скінчився без зустрічі).
  function refuseInvite(s) {
    const inv = inviteToday(s);
    if (!inv) return null;
    inv.status = 'refused';
    s.people = clampS(s.people - C.friends.refuse);
    s.stats.invitesRefused++;
    const line = pick(s, C.friends.refusalLines);
    journalFor(s, s.day).refused.push('Відмовив ' + inv.name + ': Люди −' + C.friends.refuse);
    return { name: inv.name, line, text: inv.name + ': «' + line + '» Люди −' + C.friends.refuse };
  }

  // ---------- перевірка дії ----------
  function check(s, id) {
    const a = C.actions[id];
    const no = (reason) => ({ available: false, reason });
    if (s.lost || s.finished) return no('Гра завершена');
    const cost = spoonCost(s, id);
    if (cost == null) return no('При сильному болю (' + C.states.strong.min + '+) на це немає сил');
    if (a.perDay && (s.used[id] || 0) >= a.perDay) return no('Сьогодні вже було');
    const price = (a.money || 0) + (id === 'course' ? C.course.money : 0);
    if (price && s.money < price) return no('Не вистачає грошей');
    if (cost > s.spoons + (C.maxBorrow - s.borrowed)) return no('Не вистачає ресурсу, навіть якщо взяти наперед');
    const p = pain(s);
    switch (id) {
      case 'cook': case 'delivery':
        if (s.fed) return no('Їжа на сьогодні вже є');
        break;
      case 'create':
        if (p > a.maxPain) return no('З болем ' + (a.maxPain + 1) + '+ пісня не пишеться');
        break;
      case 'read':
        if (p > a.maxPain) return no('Рядки розпливаються: з болем ' + (a.maxPain + 1) + '+ не читається');
        if (!bookNow(s)) return no('Усі книжки на полиці прочитані');
        break;
      case 'friends':
        if (!s.friendNames.length) return no('Кликати нікого');
        break;
    }
    return { available: true, reason: null };
  }

  // ---------- дія ----------
  // opts: результати міні-ігор (score, synth, cook, mat, runner) або deferTalk/noTalk для друзів.
  let pendingTalk = null;
  function doAction(s, id, opts) {
    opts = opts || {};
    const a = C.actions[id];
    const j = journalFor(s, s.day);
    const chk = check(s, id);
    if (!chk.available) {
      if (!s.lost && !s.finished) { const t = ACTIONS[id].label + ': ' + chk.reason.toLowerCase(); if (!j.tried.includes(t)) j.tried.push(t); }
      return { ok: false, reason: chk.reason };
    }
    const st = stateKey(s);
    // Ресурс: бракує — беремо в завтра.
    const cost = spoonCost(s, id);
    let borrowedNow = 0;
    if (cost > s.spoons) { borrowedNow = cost - s.spoons; s.spoons = 0; s.borrowed += borrowedNow; s.spoonTomorrow += borrowedNow; s.stats.borrowed += borrowedNow; }
    else s.spoons -= cost;
    s.spent += cost;
    if (a.money) s.money -= a.money;
    s.used[id] = (s.used[id] || 0) + 1;
    let note = '', guests = null;

    switch (id) {
      case 'work': {
        const pay = opts.score != null ? Math.max(0, Math.round(opts.score)) : a.pay[st];
        if (pay > 0) s.pending.push({ day: s.day + a.payDelay, amount: pay });
        note = pay > 0 ? '+' + pay + ' ₴ прийде на день ' + (s.day + a.payDelay) : 'нічого не зароблено';
        break;
      }
      case 'games': {
        const run = opts.runner || { cleared: rand(s) < (a.painChance[st] || 0.25) ? 1 + Math.floor(rand(s) * 2) : a.jumps };
        const gain = a.soul + Math.floor(run.cleared / a.perJumps) - 1;
        s.soul = clampS(s.soul + gain);
        s.spoonTomorrow += a.tomorrow;
        note = 'Душа +' + gain + ', засидівся — завтра ресурс −' + a.tomorrow;
        break;
      }
      case 'create': {
        const fake = opts.synth ? opts.synth.fake : (rand(s) < (C.painCover[st] || 0) * 0.6 ? 1 : 0);
        const gain = a.soul[Math.min(fake, a.soul.length - 1)];
        s.soul = clampS(s.soul + gain);
        songTitle(s);
        s.song.done++;
        note = 'Душа +' + gain + (fake ? ' (фальшивих нот: ' + fake + ')' : '') + ', «' + s.song.title + '» ' + s.song.done + '/' + a.songSessions;
        if (s.song.done >= a.songSessions) {
          s.soul = clampS(s.soul + a.songSoul);
          s.stats.songs++; s.stats.songTitles.push(s.song.title);
          s.lastSongDone = s.song.title;
          note += '; дописав! Душа +' + a.songSoul;
          s.song = { n: s.song.n + 1, done: 0, title: null };
        }
        break;
      }
      case 'friends': {
        const inv = inviteToday(s);
        const gain = a.people[st] + (inv ? a.invited : 0);
        s.people = clampS(s.people + gain);
        s.stats.meetings++;
        const names = inv ? [inv.name] : [pick(s, s.friendNames)];
        if (inv) { inv.status = 'accepted'; s.stats.invitesAccepted++; }
        const food = inv && (C.friends.inviteLines[inv.line] || {}).food;
        if (food && !s.fed) { s.fed = true; s.foodType = 'guests'; }
        s.lastVisitInvited = !!inv;
        guests = names;
        note = names.join(' і ') + ' в гостях, Люди +' + gain + (st === 'strong' ? ' (з болем ти «не тут»)' : '') + (food ? ', принесли ' + food : '');
        if (opts.deferTalk) pendingTalk = true;
        else if (!opts.noTalk) {
          // Без міні-гри розмова розігрується сама: що сильніший біль, то частіше пропускаєш суть.
          const missed = rand(s) < (C.painCover[st] || 0) * 0.7;
          if (missed) { s.people = clampS(s.people - 1); s.stats.talkMissed++; note += '; пропустив суть розмови, Люди −1'; }
          else s.stats.talkHeard++;
        }
        break;
      }
      case 'text':
        s.people = clampS(s.people + a.people);
        s.textedToday = true;
        note = 'Люди +' + a.people + '; хтось, може, захоче зайти';
        break;
      case 'exercise': {
        let q = 'good';
        if (opts.mat) { const sh = opts.mat.total ? opts.mat.right / opts.mat.total : 1; q = sh >= a.mat.reliefShare ? 'good' : sh >= a.mat.baseShare ? 'partial' : 'short'; }
        s.exerciseQuality = q;
        if (q === 'good') {
          s.body = clampS(s.body + a.body);
          s.future.push({ day: s.day + a.reliefIn, kind: 'relief', amount: a.relief });
          s.stats.exercise++;
          note = 'Тіло +' + a.body + ', на день ' + (s.day + a.reliefIn) + ' біль −' + a.relief;
        } else if (q === 'partial') {
          s.body = clampS(s.body + a.partialBody);
          s.stats.exercise++;
          note = 'частково: Тіло +' + a.partialBody + ', без полегшення потім';
        } else note = 'замало рухів — не зараховано';
        break;
      }
      case 'stretch':
        s.body = clampS(s.body + a.body);
        s.relief += a.reliefToday;
        note = 'Тіло +' + a.body + ', біль сьогодні −' + a.reliefToday;
        break;
      case 'cook': {
        s.fed = true; s.foodType = 'cook';
        s.body = clampS(s.body + a.body);
        const misses = opts.cook ? opts.cook.misses : (rand(s) < (C.painCover[st] || 0) ? 1 : 0);
        if (misses === 0) s.soul = clampS(s.soul + a.soulIfTasty);
        note = 'їжа є, Тіло +' + a.body + (misses === 0 ? ', смачно: Душа +' + a.soulIfTasty : ', щось не те поклав');
        break;
      }
      case 'delivery':
        s.fed = true; s.foodType = 'delivery';
        note = 'їжа є, −' + a.money + ' ₴';
        break;
      case 'clean':
        s.soul = clampS(s.soul + a.soul);
        note = 'вдома чисто, Душа +' + a.soul;
        break;
      case 'coffee':
        s.spoons += a.gain; s.coffeeToday++;
        note = 'ресурс +' + a.gain + ', загострення вночі ймовірніше (' + Math.round(flareChanceTonight(s) * 100) + '%)';
        break;
      case 'course': {
        s.money -= C.course.money;
        s.courseToday = s.day;
        s.stats.coursePills++;
        const n = s.courseStreak + 1, next = C.course.steps.find((x) => x >= n);
        note = 'курс: ' + n + '-й день поспіль, −' + C.course.money + ' ₴' + (next === n ? '; уночі базовий біль −' + C.course.drop : next ? ' (до ефекту ' + (next - n) + ' дн.)' : '');
        break;
      }
      case 'meds': {
        const before = pain(s);
        s.relief += a.reliefToday;
        s.painkiller = true;
        s.future.push({ day: s.day + 1, kind: 'rebound', amount: a.rebound });
        note = 'біль ' + before + ' → ' + pain(s) + ', завтра відкат +' + a.rebound;
        if (rand(s) < a.side.chance) { s.soul = clampS(s.soul - a.side.soul); note += '; туман у голові: Душа −' + a.side.soul; }
        break;
      }
      case 'read': {
        const b = bookNow(s);
        s.soul = clampS(s.soul + a.soul);
        s.book.done++;
        note = '«' + b[0] + '» ' + s.book.done + '/' + b[1] + ', Душа +' + a.soul;
        if (s.book.done >= b[1]) {
          s.soul = clampS(s.soul + a.finishSoul);
          s.stats.booksRead++; s.lastBookDone = b[0];
          note += '; дочитав! Душа +' + a.finishSoul;
          s.book = { i: s.book.i + 1, done: 0 };
        }
        break;
      }
    }
    if (borrowedNow) note += '; взяв наперед ресурс ' + borrowedNow;
    j.did.push(ACTIONS[id].label + ' (' + note + ')');
    return { ok: true, note, borrowed: borrowedNow, guests };
  }

  // Розмова від першої особи: kinds — відповіді на теми ('right'|'meh'|'wrong'|'silent').
  function applyTalk(s, kinds) {
    if (!pendingTalk) return '';
    pendingTalk = null;
    const T = C.friends.talk.joy;
    const sum = (kinds || []).reduce((acc, k) => acc + (T[k] || 0), 0);
    const d = sum > 0 ? 1 : sum < 0 ? -1 : 0;
    s.people = clampS(s.people + d);
    if ((kinds || []).some((k) => k === 'silent' || k === 'wrong')) s.stats.talkMissed++; else s.stats.talkHeard++;
    s.lastTalkMissed = d < 0;
    return d > 0 ? 'розмова вдалась: Люди +1' : d < 0 ? 'біль заглушив розмову: Люди −1' : 'розмова як розмова';
  }

  function recalcBase(s) {
    s.base = Math.max(C.painMin, s.baseStart - Math.min(C.maxRelief, s.courseDrop + s.doctorDrop));
  }

  // ---------- загострення й тиск ----------
  function flareChanceTonight(s) {
    const t = C.links.bodyFlare.find(([min]) => s.body >= min);
    return Math.min(1, (t ? t[1] : 0.3) + s.coffeeToday * C.actions.coffee.flareAdd);
  }
  function flareSize(s) {
    const t = C.night.flareSizes, sum = t.reduce((a, x) => a + x[1], 0);
    let r = rand(s) * sum;
    for (const [p, w] of t) { if ((r -= w) < 0) return p; }
    return t[t.length - 1][0];
  }
  const weekOf = (d) => Math.max(0, Math.floor((d - 1) / 7));
  const pressureOf = (d) => Math.floor(((d - 1) * (d - 1)) / C.pressureK);
  const dailyCost = (d) => C.costs[Math.min(C.costs.length - 1, weekOf(d))];

  // ---------- ніч ----------
  // opts.forceFlare — для прогнозу. Повертає { events, flare, hospital }.
  function endDay(s, opts) {
    opts = opts || {};
    if (s.lost || s.finished) return { events: [], flare: false, hospital: false };
    const ev = [], j = journalFor(s, s.day), N = C.night, L = C.links;
    const st = stateKey(s);

    const ref = refuseInvite(s);
    if (ref) ev.push({ kind: 'friends', text: ref.text });
    if (!s.fed) { s.body = clampS(s.body - C.hungry.body); s.stats.hungry++; ev.push({ kind: 'bad', text: 'Без їжі: Тіло −' + C.hungry.body }); }
    // Оплата, що настає завтра, приходить уночі — до витрат.
    const due = s.pending.filter((x) => x.day <= s.day + 1);
    if (due.length) {
      const sum = due.reduce((acc, x) => acc + x.amount, 0);
      s.money += sum; s.stats.earned += sum;
      s.pending = s.pending.filter((x) => x.day > s.day + 1);
      ev.push({ kind: 'money', text: 'Надійшла оплата за роботу: +' + sum + ' ₴' });
    }
    const cost = dailyCost(s.day);
    s.money -= cost;
    ev.push({ kind: 'money', text: 'Витрати на життя: −' + cost + ' ₴' });

    // Сфери тануть: самі собою і від тиску життя.
    for (const k of SOFT) s[k] = clampS(s[k] - C.decay);
    ev.push({ kind: 'info', text: 'Сфери тануть самі собою: Люди, Тіло, Душа −' + C.decay });
    const pr = pressureOf(s.day);
    if (pr) {
      let pool = []; const hit = [];
      for (let i = 0; i < pr; i++) {
        if (!pool.length) pool = SOFT.slice();
        const k = pool.splice(Math.floor(rand(s) * pool.length), 1)[0]; s[k] = clampS(s[k] - 1); hit.push(SPHERES[k].name);
      }
      ev.push({ kind: 'bad', text: 'Життя тисне: ' + hit.join(', ') + ' ще −1' });
    }
    if (st === 'strong') { s.soul = clampS(s.soul - L.strongSoul); ev.push({ kind: 'pain', text: 'День у сильному болю гнітить: Душа −' + L.strongSoul }); }

    // Біль на завтра.
    s.extra = Math.max(0, s.extra - N.drift);
    if (s.spoons === 0 || s.borrowed > 0) { s.extra += N.exhausted; ev.push({ kind: 'pain', text: 'Вичерпав увесь ресурс: завтра біль +' + N.exhausted }); }
    else if (s.spoons >= N.earlyRest) { s.extra -= 1; ev.push({ kind: 'good', text: 'Лишив сил на себе: завтра біль −1' }); }
    if (s.body <= L.bodyWeak) { s.extra += 1; ev.push({ kind: 'pain', text: 'Тіло слабке: завтра біль +1' }); }
    s.extra = Math.max(-2, s.extra);

    // Курс лікування.
    if (s.courseToday === s.day) {
      s.courseStreak++;
      if (C.course.steps.includes(s.courseStreak)) { s.courseDrop += C.course.drop; ev.push({ kind: 'good', text: s.courseStreak + ' днів курсу поспіль: базовий біль −' + C.course.drop }); }
    } else if (s.courseStreak > 0) {
      ev.push({ kind: 'pain', text: 'Пропустив пігулку: курс з нуля' + (s.courseDrop ? ', дія ліків минає — базовий біль +' + s.courseDrop : '') });
      s.courseStreak = 0; s.courseDrop = 0;
    }
    // Лікар.
    if (C.doctor.days.includes(s.day)) {
      if (s.body >= C.doctor.good) { s.doctorDrop++; ev.push({ kind: 'good', text: 'Прийом у лікаря: тіло тримається — базовий біль −1' }); }
      else if (s.body <= C.doctor.bad) { s.doctorDrop--; ev.push({ kind: 'pain', text: 'Прийом у лікаря: тіло слабке, стало гірше — базовий біль +1' }); }
      else ev.push({ kind: 'info', text: 'Прийом у лікаря: без змін (Тіло ' + s.body + ')' });
    }
    recalcBase(s);

    // Загострення: шанс тримає Тіло.
    const flare = opts.forceFlare != null ? opts.forceFlare : rand(s) < flareChanceTonight(s);
    if (flare) {
      const size = flareSize(s);
      s.extra += size; s.stats.flares++;
      ev.push({ kind: 'flare', text: (N.flareNames[size] || 'Загострення') + ' вночі: біль +' + size });
    }

    // Нові пропозиції від друзів.
    const share = s.friendNames.length / C.friends.baseCount;
    const inviteChance = Math.min(0.8, (C.friends.inviteChance + (s.textedToday ? C.actions.text.inviteBoost : 0)) * share);
    s.textedToday = false;
    if (rand(s) < inviteChance) {
      const inv = addInvite(s, s.day + C.friends.leadDays);
      if (inv) ev.push({ kind: 'friends', text: inv.name + ' пропонує зайти в день ' + (s.day + C.friends.leadDays) });
    }

    // Біль 10 — лікарня: наступний день випадає.
    let hospital = false;
    if (rawPain(s) >= C.painMax && s.day < s.days) {
      hospital = true;
      s.money -= C.hospital.cost; s.stats.hospital++;
      ev.push({ kind: 'bad', text: 'Біль дійшов до 10. Швидка, лікарня: день випадає, −' + C.hospital.cost + ' ₴' });
    }

    j.night = ev.map((e) => e.text);
    checkLose(s, s.day);
    if (!s.lost) {
      if (s.day >= s.days) s.finished = true;
      else {
        s.day++;
        if (hospital) {
          // День у лікарні: витрати й тануть сфери, дій немає; біль збивають.
          const jh = journalFor(s, s.day); jh.hospital = true;
          s.money -= dailyCost(s.day);
          for (const k of SOFT) s[k] = clampS(s[k] - C.decay);
          s.extra = C.hospital.extraAfter;
          s.history.push({ day: s.day, pain: C.painMax, money: s.money, people: s.people, body: s.body, soul: s.soul, spoons: 0 });
          checkLose(s, s.day);
          if (!s.lost) { if (s.day >= s.days) s.finished = true; else s.day++; }
        }
        if (!s.lost && !s.finished) startDay(s, ev);
      }
    }
    return { events: ev, flare, hospital: hospital ? 1 : false };
  }

  function checkLose(s, day) {
    if (s.lost) return;
    const fallen = s.money <= 0 ? 'money' : SOFT.find((k) => s[k] <= 0);
    if (fallen) s.lost = { cause: SPHERES[fallen].ending, sphere: fallen, day, sphereName: SPHERES[fallen].name, text: SPHERES[fallen].fall };
  }

  // ---------- допоміжне ----------
  function songTitle(s) {
    if (!s.song.title) {
      const used = new Set(s.stats.songTitles);
      const free = C.songTitles.filter((t) => !used.has(t));
      s.song.title = pick(s, free.length ? free : C.songTitles);
    }
    return s.song.title;
  }
  function bookNow(s) { const i = (s.book || { i: 0 }).i; return C.books[s.bookOrder ? s.bookOrder[i] : i] || null; }

  // Частина дня для освітлення кімнати: за тим, скільки ресурсу вже витрачено.
  function dayPhase(s) { return Math.min(3, Math.floor((s.spent / Math.max(1, s.spoonsMorning)) * 4)); }

  const clone = (s) => JSON.parse(JSON.stringify(s));

  // Прогноз ночі: без загострення і з ним.
  function forecastNight(s) {
    if (s.lost || s.finished) return null;
    const a = clone(s), b = clone(s);
    const ra = endDay(a, { forceFlare: false }), rb = endDay(b, { forceFlare: true });
    return { lost: a.lost, lostFlare: b.lost, hospital: !!ra.hospital, hospitalFlare: !!rb.hospital,
      pain: a.lost || a.finished ? null : pain(a), painFlare: b.lost || b.finished ? null : pain(b) };
  }

  function preview(s, id) {
    const chk = check(s, id), cost = spoonCost(s, id);
    const out = { id, zone: ACTIONS[id].zone, label: ACTIONS[id].label, sphere: ACTIONS[id].sphere,
      available: chk.available, reason: chk.reason, cost, borrow: 0, effects: [], fatal: null };
    if (!chk.available) return out;
    out.borrow = Math.max(0, cost - s.spoons);
    const after = clone(s), saved = pendingTalk;
    doAction(after, id, id === 'friends' ? { noTalk: true } : id === 'cook' ? { cook: { misses: 0 } } : id === 'create' ? { synth: { fake: 0 } }
      : id === 'games' ? { runner: { cleared: C.actions.games.jumps } } : null);
    pendingTalk = saved;
    const fx = out.effects;
    for (const k of SOFT) if (after[k] !== s[k]) fx.push({ t: SPHERES[k].name + ' ' + signed(after[k] - s[k]), kind: k });
    if (after.money !== s.money) fx.push({ t: signed(after.money - s.money) + ' ₴', kind: 'money' });
    if (after.pending.length > s.pending.length) { const p = after.pending[after.pending.length - 1]; fx.push({ t: '+' + p.amount + ' ₴ на день ' + p.day, kind: 'money' }); }
    if (pain(after) !== pain(s)) fx.push({ t: 'біль ' + pain(s) + '→' + pain(after) + ' сьогодні', kind: 'pain' });
    for (const f of after.future.slice(s.future.length)) fx.push(f.kind === 'relief' ? { t: 'день ' + f.day + ': біль −' + f.amount, kind: 'good' } : { t: 'завтра відкат +' + f.amount, kind: 'pain' });
    if (after.spoonTomorrow - s.spoonTomorrow - out.borrow > 0) fx.push({ t: 'завтра ресурс −' + (after.spoonTomorrow - s.spoonTomorrow - out.borrow), kind: 'pain' });
    if (id === 'coffee') fx.push({ t: 'ресурс +' + C.actions.coffee.gain + '; загострення ' + Math.round(flareChanceTonight(s) * 100) + '%→' + Math.round(flareChanceTonight(after) * 100) + '%', kind: 'pain' });
    if (after.fed && !s.fed) fx.push({ t: 'їжа на день є', kind: 'info' });
    if (id === 'course') fx.push({ t: 'курс ' + (s.courseStreak + 1) + '-й день', kind: 'info' });
    if (out.borrow) fx.push({ t: 'наперед: завтра ресурс −' + out.borrow + ' і біль +' + C.night.exhausted, kind: 'pain' });
    return out;
  }

  function zoneActions(s, zone) { return ACTION_IDS.filter((id) => ACTIONS[id].zone === zone).map((id) => preview(s, id)); }

  // Календар: що вже відомо на найближчі дні.
  function calendar(s, len) {
    const out = [];
    const need = C.course.steps.find((x) => x > s.courseStreak);
    const courseDay = need && s.courseStreak > 0 ? s.day + (need - s.courseStreak) - 1 : null;
    for (let d = s.day; d < s.day + (len || 5) && d <= s.days; d++) {
      const inv = s.invites[d], ev = [];
      const pay = s.pending.filter((p) => p.day === d).reduce((a, p) => a + p.amount, 0);
      if (pay) ev.push({ t: '+' + pay + '₴', k: 'pay' });
      if (inv && inv.status !== 'cancelled') ev.push({ t: '♥ ' + inv.name, k: inv.status === 'refused' ? 'inv refused' : 'inv' });
      for (const f of s.future.filter((x) => x.day === d)) ev.push(f.kind === 'relief' ? { t: 'біль −' + f.amount, k: 'good' } : { t: 'відкат +' + f.amount, k: 'bad' });
      if (C.doctor.days.includes(d)) ev.push({ t: 'лікар', k: 'doc' });
      if (pressureOf(d) > pressureOf(d - 1)) ev.push({ t: 'тиск ' + pressureOf(d), k: 'bad' });
      if (courseDay === d) ev.push({ t: 'курс ' + need, k: 'good' });
      out.push({ day: d, cost: dailyCost(d), events: ev });
    }
    return out;
  }

  // Підказки на день.
  function hints(s) {
    const out = [];
    if (s.lost || s.finished) return out;
    const inv = inviteToday(s);
    if (inv) out.push({ kind: 'friends', t: inv.name + ' хоче прийти сьогодні. Якщо не покличеш — Люди −' + C.friends.refuse + '.' });
    if (!s.fed) out.push({ kind: 'money', t: 'Їжі ще немає: приготуй або замов. Без їжі — Тіло −' + C.hungry.body + '.' });
    for (const k of SOFT) if (s[k] <= 2) out.push({ kind: 'fatal', t: SPHERES[k].name + ' на межі (' + s[k] + '): уночі ще −1' + (pressureOf(s.day) ? ' і, можливо, тиск' : '') + '.' });
    const cost = dailyCost(s.day), incoming = s.pending.filter((p) => p.day <= s.day + 1).reduce((a, p) => a + p.amount, 0);
    if (s.money + incoming - cost <= 0) out.push({ kind: 'fatal', t: 'Уночі витрати ' + cost + ' ₴, а грошей ' + s.money + ' ₴' + (incoming ? ' (+' + incoming + ' надійде)' : '') + ' — не вистачить.' });
    if (s.courseStreak > 0 && s.courseToday !== s.day) out.push({ kind: 'pain', t: 'Курсова пігулка ще не випита: пропуск — курс з нуля' + (s.courseDrop ? ' і базовий біль +' + s.courseDrop : '') + '.' });
    const nd = C.doctor.days.find((d) => d >= s.day);
    if (nd && nd - s.day <= 3) out.push({ kind: 'info', t: 'Лікар уночі після дня ' + nd + ': Тіло ' + C.doctor.good + '+ — базовий біль −1, ' + C.doctor.bad + ' і нижче — +1. Зараз ' + s.body + '.' });
    out.push({ kind: 'pain', t: 'Шанс загострення вночі ' + Math.round(flareChanceTonight(s) * 100) + '% — що міцніше Тіло, то менше.' });
    if (s.spoons === 0) out.push({ kind: 'pain', t: 'Ресурс на нулі: завтра біль +' + C.night.exhausted + '.' });
    else if (s.spoons >= C.night.earlyRest) out.push({ kind: 'good', t: 'Лягти, лишивши ресурс ' + C.night.earlyRest + '+, — завтра біль −1.' });
    return out;
  }

  function sleepGainText(s) {
    return s.spoons >= C.night.earlyRest ? 'завтра біль −1' : s.spoons === 0 ? 'завтра біль +' + C.night.exhausted : 'без змін';
  }

  function summary(s) {
    const st = s.stats, kept = [], lostItems = [];
    if (st.meetings) kept.push('Зустрічі з друзями: ' + st.meetings);
    if (st.earned) kept.push('Зароблено ' + st.earned + ' ₴');
    if (st.exercise) kept.push('Днів із вправами: ' + st.exercise);
    if (st.coursePills) kept.push('Курсових пігулок: ' + st.coursePills);
    if (st.songs) kept.push('Пісні: ' + st.songTitles.map((t) => '«' + t + '»').join(', '));
    const read = (s.bookOrder || C.books.map((_, i) => i)).slice(0, s.book.i).map((i) => C.books[i]);
    if (read.length) kept.push('Книжки прочитано: ' + read.map((x) => '«' + x[0] + '»').join(', '));
    kept.push('Наприкінці: ' + s.money + ' ₴, Люди ' + s.people + ', Тіло ' + s.body + ', Душа ' + s.soul + ', біль ' + pain(s));
    if (st.flares) lostItems.push('Загострень: ' + st.flares);
    if (st.strongDays) lostItems.push('Днів у сильному болю: ' + st.strongDays);
    if (st.hospital) lostItems.push('Лікарня: ' + st.hospital + ' р.');
    if (st.invitesRefused) lostItems.push('Відмов друзям: ' + st.invitesRefused);
    if (st.hungry) lostItems.push('Днів без їжі: ' + st.hungry);
    if (st.borrowed) lostItems.push('Ресурсу взято наперед: ' + st.borrowed);
    if (st.talkMissed) lostItems.push('Не почув друзів: ' + st.talkMissed + ' р.');
    return { lost: s.lost ? Object.assign({}, s.lost) : null, daysLived: s.lost ? s.lost.day : s.days, days: s.days, kept, lostItems, history: s.history };
  }

  const api = {
    ZONES, ACTIONS, ACTION_IDS, SPHERES, SPHERE_IDS,
    createGame, doAction, endDay, applyTalk, refuseInvite, check, preview, zoneActions,
    forecastNight, calendar, hints, summary, sleepGainText, songTitle, bookNow, inviteToday, inviteText,
    pain, rawPain, stateKey, stateOfPain, spoonCost, energyCost: spoonCost, dayPhase, flareChanceTonight, dailyCost, pressureOf, clone,
    setConfig(cfg) { C = cfg; },
    get config() { return C; },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
