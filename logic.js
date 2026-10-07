// Логіка гри: чисті функції над звичайним об'єктом стану.
// Жодного DOM і canvas — файл запускається і в браузері, і в node (sim.js).
(function (root) {
  'use strict';

  let C = (typeof module !== 'undefined' && module.exports)
    ? require('./config.js')
    : root.GAME_CONFIG;

  const ZONES = {
    sofa:    { name: 'Диван' },       // тут і гості, і сон: розкладається на ніч
    desk:    { name: 'Робочий стіл' },
    mat:     { name: 'Килимок' },
    kitchen: { name: 'Кухня' },
    shelf:   { name: 'Аптечка' },
    books:   { name: 'Книжки' },
  };

  const ACTIONS = {
    work:     { zone: 'desk',    label: 'Робота' },
    create:   { zone: 'desk',    label: 'Творчість' },
    friends:  { zone: 'sofa',    label: 'Покликати друзів' },
    exercise: { zone: 'mat',     label: 'Вправи' },
    stretch:  { zone: 'mat',     label: 'Розтяжка' },
    cook:     { zone: 'kitchen', label: 'Приготувати' },
    delivery: { zone: 'kitchen', label: 'Замовити доставку' },
    meds:     { zone: 'shelf',   label: 'Знеболювальне' },
    rest:     { zone: 'sofa',    label: 'Відпочити' },
    sleep:    { zone: 'sofa',    label: 'Лягти раніше' },
    read:     { zone: 'books',   label: 'Почитати' },
    clean:    { zone: 'kitchen', label: 'Прибрати й помити посуд' },
    coffee:   { zone: 'kitchen', label: 'Випити кави' },
  };
  const ACTION_IDS = Object.keys(ACTIONS);

  const CAUSES = {
    joy:   { sphere: 'Радість', text: 'Радість упала до нуля' },
    money: { sphere: 'Гроші', text: 'Гроші скінчилися' },
  };

  // ---------- випадковість з відтворюваним зерном ----------

  function rand(s) {
    s.rng = (s.rng + 0x6D2B79F5) | 0;
    let t = s.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function pick(s, arr) { return arr[Math.floor(rand(s) * arr.length)]; }

  // ---------- похідні величини ----------

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rawPain = (s) => s.base + s.extra - s.relief;
  const pain = (s) => clamp(rawPain(s), 0, C.painMax);

  function stateOfPain(p) {
    for (const k of Object.keys(C.states)) {
      const st = C.states[k];
      if (p >= st.min && p <= st.max) return k;
    }
    return p < 0 ? 'light' : 'strong';
  }
  const stateKey = (s) => stateOfPain(pain(s));
  const stateCfg = (s) => C.states[stateKey(s)];
  // Слоти видаються зранку, як і сили: знеболювальне посеред дня їх не додає.
  const slotsOf = (s) => s.slotsToday || C.states[s.morningState || 'medium'].slots;
  const slotName = (s, i) => (C.slotNames[slotsOf(s)] || C.slotNames[4])[i] || '';
  // Частина дня (0 ранок … 3 вечір) для світла в кімнаті.
  const dayPhase = (s, i) => Math.min(3, Math.floor((i * 4) / slotsOf(s)));

  function meetingsRecent(s) {
    const from = s.day - C.friends.lookback;
    return s.meetDays.filter((d) => d > from).length;
  }

  function energyCost(s, id) {
    if (id === 'cook') return stateCfg(s).cookCost;
    if (id === 'friends' && inviteToday(s)) return C.actions.friends.inviteEnergy;
    return C.actions[id].energy;
  }

  function isDeadlineDay(d) { return d % C.work.deadlineEvery === 0; }
  function isRentDay(d) { return d % C.rent.every === 0; }

  function nextDeadline(s) {
    for (let d = s.day; d <= s.days; d++) if (isDeadlineDay(d)) return d;
    return null;
  }

  // ---------- створення гри ----------

  function journalFor(s, day) {
    let j = s.journal.find((e) => e.day === day);
    if (!j) {
      j = { day, morningPain: 0, state: 'light', did: [], refused: [], tried: [], night: [] };
      s.journal.push(j);
    }
    return j;
  }

  function createGame(opts) {
    opts = opts || {};
    const diffKey = opts.difficulty || 'normal';
    const diff = C.difficulty[diffKey];
    const seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 2 ** 31);
    const s = {
      seed, rng: seed | 0,
      difficulty: diffKey, days: opts.days || C.days, flareChance: diff.flareChance,
      day: 1, slot: 0,
      baseStart: diff.basePain, base: diff.basePain, extra: C.start.extraPain, relief: 0,
      energy: 0, energyMorning: 0, borrowed: 0,
      money: C.start.money, joy: C.start.joy,
      trainings: 0, daysNoExercise: 0, daysAlone: 0, sleepPenalty: 0,
      book: { i: 0, done: 0 }, readToday: 0, mess: C.chores.startMess,
      creativityBlocked: false, createStreak: 0, lastCreateDay: 0,
      fed: false, foodType: null, hungerPenalty: 0,
      restedToday: 0, medsToday: 0, exerciseToday: 0, friendsToday: 0,
      pending: [],
      workWeek: 0, misses: 0, partTime: false, partTimeDay: null,
      meetDays: [], invites: {},
      journal: [],
      stats: {
        workUnits: 0, earned: 0, meetings: 0, createDays: 0, maxStreak: 0,
        invitesAccepted: 0, invitesRefused: 0, refusals: [],
        deadlinesMet: 0, deadlinesMissed: 0,
        hungryDays: 0, autoDelivery: 0, borrowed: 0, flares: 0, meds: 0,
        stateDays: { light: 0, medium: 0, strong: 0 }, blockedCreativeDays: 0,
        tried: 0, maxPain: 0, hospital: 0, hospitalDays: 0,
      },
      lost: null, finished: false,
    };
    // Перший тиждень уже має кілька пропозицій, ніби друзі давно домовлялися.
    for (let d = 2; d <= Math.min(1 + C.friends.leadDays, s.days); d++) {
      if (rand(s) < inviteChance(C.friends.initialMeetings, 0)) addInvite(s, d);
    }
    startDay(s);
    return s;
  }

  // warmth — як друзі ставляться після розмов: неуважність знижує шанс запрошень.
  function inviteChance(meetings, warmth) {
    const f = C.friends;
    const c = f.inviteBase + f.invitePerMeeting * meetings + (warmth || 0) * f.talk.warmthInvite;
    return Math.max(0.02, Math.min(f.inviteMax, c));
  }

  // Результат розмови: kinds — 'right' | 'meh' | 'wrong' | 'silent' для кожної теми.
  // Повертає короткий підсумок для журналу.
  function applyTalk(s, kinds, comments) {
    const T = C.friends.talk;
    let joy = 0, missed = false;
    for (const k of kinds) {
      joy += T.joy[k] || 0;
      const w = T.warmth[k] || 0;
      s.warmth = Math.max(T.warmth.min, Math.min(T.warmth.max, (s.warmth || 0) + w));
      if (k === 'wrong' || k === 'silent') missed = true;
    }
    if (joy) addJoy(s, joy);
    s.lastTalkMissed = missed;
    s.stats.talkMissed = (s.stats.talkMissed || 0) + kinds.filter((k) => k === 'wrong' || k === 'silent').length;
    s.stats.talkHeard = (s.stats.talkHeard || 0) + kinds.filter((k) => k === 'right').length;
    const j = journalFor(s, s.day);
    if (comments && comments.length) for (const c of comments) j.refused.push('Друзі: «' + c + '»');
    checkLose(s, s.day);
    return 'розмова: радість ' + (joy >= 0 ? '+' : '−') + Math.abs(joy) + (missed ? ', друзі помітили, що ти не тут' : '');
  }

  function addInvite(s, day) {
    if (s.invites[day]) return;
    s.invites[day] = { name: pick(s, C.friends.names), status: 'open', line: Math.floor(rand(s) * C.friends.inviteLines.length) };
  }

  function startDay(s) {
    s.slot = 0;
    s.relief = 0;
    s.borrowed = 0;
    s.restedToday = 0; s.medsToday = 0; s.exerciseToday = 0; s.friendsToday = 0; s.createToday = 0;
    s.coffeeToday = 0; s.sleptEarly = false; s.exerciseQuality = null; s.readToday = 0;
    s.fed = false; s.foodType = null;
    const st = stateKey(s);
    s.energyMorning = Math.max(0, C.states[st].energy - s.hungerPenalty - (s.sleepPenalty || 0));
    s.energy = s.energyMorning;
    s.hungerPenalty = 0; s.sleepPenalty = 0;
    s.morningState = st;
    s.slotsToday = C.states[st].slots;
    const j = journalFor(s, s.day);
    j.morningPain = pain(s);
    j.state = st;
    s.stats.stateDays[st]++;
    s.stats.maxPain = Math.max(s.stats.maxPain, pain(s));
    if (s.creativityBlocked) s.stats.blockedCreativeDays++;
  }

  // ---------- радість ----------

  function addJoy(s, d) {
    s.joy = clamp(s.joy + d, 0, C.joy.max);
    if (s.joy < C.joy.creativityOffBelow) s.creativityBlocked = true;
    else if (s.creativityBlocked && s.joy > C.joy.creativityOnAbove) s.creativityBlocked = false;
  }

  // ---------- дії ----------

  function check(s, id) {
    const a = C.actions[id];
    if (s.lost || s.finished) return no('Гра завершена');
    if (s.slot >= slotsOf(s)) return no('Слоти на сьогодні скінчилися, час спати');
    switch (id) {
      case 'create':
        if (s.creativityBlocked) return no('Немає настрою на творчість: радість нижче ' +
          C.joy.creativityOffBelow + ', повернеться після ' + C.joy.creativityOnAbove);
        break;
      case 'cook':
        if (s.fed) return no('Їжа на сьогодні вже є');
        if (stateCfg(s).cookCost == null) return no('При сильному болю (' + C.states.strong.min + '+) біля плити не встояти, хоч би скільки було сил. Лишається доставка');
        if (s.money < a.money) return no('Не вистачає грошей на продукти');
        break;
      case 'delivery':
        if (s.fed) return no('Їжа на сьогодні вже є');
        if (s.money < a.money) return no('Не вистачає грошей на доставку');
        break;
      case 'meds':
        if (s.medsToday >= a.perDay) return no('Знеболювальне сьогодні вже було');
        if (s.money < a.money) return no('Не вистачає грошей на знеболювальне');
        break;
      case 'rest':
        if (s.restedToday >= a.perDay) return no('Сьогодні вже відпочивав');
        break;
      case 'exercise':
        if (s.exerciseToday >= a.perDay) return no('Вправи сьогодні вже були, більше тіло не витримає');
        break;
      case 'stretch':
        if (pain(s) <= 0) return no('Зараз нічого не болить');
        break;
      case 'coffee':
        if ((s.coffeeToday || 0) >= a.perDay) return no('Більше кави серце не прийме');
        break;
      case 'read':
        if (pain(s) > a.maxPain) return no('Рядки розпливаються: з болем ' + (a.maxPain + 1) + '+ не читається');
        if ((s.readToday || 0) >= a.perDay) return no('Сьогодні вже читав, далі не йде');
        if (!bookNow(s)) return no('Усі книжки на полиці прочитані');
        break;
      case 'clean':
        if ((s.mess || 0) <= 0) return no('Вдома й так чисто');
        break;
    }
    return { available: true, reason: null };
    function no(reason) { return { available: false, reason }; }
  }

  // Чи накрив біль ключове слово і чи вдалося відповісти — без міні-гри, за ймовірностями.
  function autoHeard(s) {
    const covered = rand(s) < C.painCover[stateKey(s)];
    return rand(s) < (covered ? C.coveredAccuracy : C.heardAccuracy);
  }
  // Оплата за планерку без міні-гри.
  function autoWorkScore(s) {
    const m = C.work.meeting;
    let score = 0;
    for (let i = 0; i < m.questions; i++) score += autoHeard(s) ? m.payRight : m.payWrong;
    return score;
  }
  const maxWorkScore = () => C.work.meeting.questions * C.work.meeting.payRight;
  // Частковий графік урізає заробіток, але не штрафи.
  function workPay(s, score) {
    return score > 0 ? Math.round(score * (s.partTime ? C.work.partTimeMult : 1)) : score;
  }

  function inviteToday(s) {
    const inv = s.invites[s.day];
    return inv && inv.status === 'open' ? inv : null;
  }

  // Відмова друзям: явна (кнопкою) або мовчазна (день скінчився без зустрічі).
  function refuseInvite(s) {
    const inv = inviteToday(s);
    if (!inv || s.lost || s.finished) return null;
    inv.status = 'refused';
    inv.line = pick(s, C.friends.refusalLines);
    addJoy(s, C.joy.refuseInvite);
    s.stats.invitesRefused++;
    s.stats.refusals.push({ day: s.day, name: inv.name, line: inv.line });
    journalFor(s, s.day).refused.push('Відмовив: ' + inv.name + ' (' + signed(C.joy.refuseInvite) + ' радості). «' + inv.line + '»');
    checkLose(s, s.day);
    return { name: inv.name, line: inv.line, text: inv.name + ': «' + inv.line + '» (радість ' + signed(C.joy.refuseInvite) + ')' };
  }

  function actionLabel(s, id) {
    if (id === 'friends' && inviteToday(s)) return 'Прийняти друзів';
    return ACTIONS[id].label;
  }

  // opts.score — скільки заробила сесія макетів (з міні-гри); без нього рахується автоматично.
  let pendingTalkNote = null;
  function doAction(s, id, opts) {
    opts = opts || {};
    const chk = check(s, id);
    const j = journalFor(s, s.day);
    if (!chk.available) {
      // Вичерпані слоти — не бажання, від якого довелося відмовитись.
      if (!s.lost && !s.finished && s.slot < slotsOf(s)) {
        s.stats.tried++;
        const text = ACTIONS[id].label + ': ' + chk.reason.toLowerCase();
        if (!j.tried.includes(text)) j.tried.push(text);
      }
      return { ok: false, reason: chk.reason };
    }
    const a = C.actions[id];
    const cost = energyCost(s, id);
    let borrowedNow = 0;
    if (s.energy >= cost) s.energy -= cost;
    else {
      borrowedNow = cost - s.energy;
      s.energy = 0;
      s.borrowed += borrowedNow;
      s.stats.borrowed += borrowedNow;
    }
    const slotLabel = slotName(s, s.slot);
    let note = '';
    const mult = stateCfg(s).joyMult;

    switch (id) {
      case 'work': {
        const amount = workPay(s, opts.score != null ? opts.score : autoWorkScore(s));
        if (amount > 0) s.pending.push({ day: s.day + a.payDelay, amount });
        if (amount < 0) { s.money += amount; s.stats.fines = (s.stats.fines || 0) - amount; }   // штраф одразу
        s.workWeek++;
        s.stats.workUnits++;
        note = amount > 0 ? '+' + amount + ' ₴ прийде на день ' + (s.day + a.payDelay) : amount < 0 ? 'штраф ' + amount + ' ₴' : 'нічого не зароблено';
        break;
      }
      case 'create': {
        if (s.lastCreateDay === s.day - 1) s.createStreak++;
        else if (s.lastCreateDay !== s.day) s.createStreak = 1;
        if (s.lastCreateDay !== s.day) s.stats.createDays++;
        s.lastCreateDay = s.day;
        s.stats.maxStreak = Math.max(s.stats.maxStreak, s.createStreak);
        const bonus = Math.min(a.streakMax, a.streakBonus * (s.createStreak - 1));
        const again = s.createToday > 0 ? C.joy.repeatMult : 1;
        s.createToday++;
        const gain = Math.round((a.joy + bonus) * mult * again);
        addJoy(s, gain);
        note = 'радість +' + gain + (s.createStreak > 1 ? ', серія ' + s.createStreak + ' дн.' : '');
        break;
      }
      case 'friends': {
        const gain = Math.round(a.joy * mult * (s.friendsToday > 0 ? C.joy.repeatMult : 1));
        addJoy(s, gain);
        s.meetDays.push(s.day);
        s.friendsToday++;
        s.stats.meetings++;
        // Хто прийде: той, хто сам просився, або одна-двоє людей з компанії.
        const inv = inviteToday(s);
        let guests;
        let food = null;
        if (inv) {
          inv.status = 'accepted'; s.stats.invitesAccepted++; guests = [inv.name];
          food = (C.friends.inviteLines[inv.line] || {}).food || null;
        }
        else {
          const names = C.friends.names.slice();
          const first = names.splice(Math.floor(rand(s) * names.length), 1)[0];
          guests = rand(s) < 0.5 ? [first] : [first, pick(s, names)];
        }
        s.lastGuests = guests;
        s.lastVisitInvited = !!inv;
        note = guests.join(' і ') + ' в гостях, радість +' + gain;
        // Принесли поїсти: доставка й готування сьогодні вже не потрібні.
        if (food && !s.fed) { s.fed = true; s.foodType = 'guests'; note += ', принесли ' + food; }
        // Розмову без міні-гри рахуємо одразу; з міні-грою її результат прийде через applyTalk.
        if (!opts.deferTalk) {
          const kinds = [];
          for (let i = 0; i < C.friends.talk.topics; i++) kinds.push(autoHeard(s) ? 'right' : (rand(s) < 0.5 ? 'wrong' : 'meh'));
          pendingTalkNote = applyTalk(s, kinds);
        }
        break;
      }
      case 'exercise': {
        // opts.mat — підсумок міні-гри { right, total }; без неї вправи вдалі.
        const m = opts.mat, M = a.mat, share = m && m.total ? m.right / m.total : 1;
        s.exerciseQuality = share >= M.reliefShare ? 'good' : share >= M.baseShare ? 'partial' : 'short';
        s.exerciseToday++;
        if (s.exerciseQuality !== 'short') s.trainings++;
        note = (m ? 'рухів ' + m.right + ' з ' + m.total + ', ' : '') + (s.exerciseQuality === 'short' ? 'не зараховано'
          : s.exerciseQuality === 'partial' ? 'частково, днів вправ ' + s.trainings : 'днів вправ ' + s.trainings);
        break;
      }
      case 'stretch': {
        const before = pain(s);
        s.relief = Math.min(s.relief + a.reliefToday, s.base + s.extra);
        note = 'біль ' + before + ' → ' + pain(s);
        break;
      }
      case 'cook':
        s.money -= a.money; s.fed = true; s.foodType = 'cook';
        note = '−' + a.money + ' ₴';
        break;
      case 'delivery':
        s.money -= a.money; s.fed = true; s.foodType = 'delivery';
        note = '−' + a.money + ' ₴';
        break;
      case 'meds': {
        const before = pain(s);
        s.relief = Math.min(s.relief + a.reliefToday, s.base + s.extra);
        s.money -= a.money;
        s.medsToday++;
        s.stats.meds++;
        note = 'біль ' + before + ' → ' + pain(s) + ', −' + a.money + ' ₴';
        break;
      }
      case 'rest':
        s.energy += a.gain;
        s.restedToday++;
        note = '+' + a.gain + ' сила';
        break;
      case 'sleep': {
        const skipped = slotsOf(s) - s.slot;
        const gainTxt = sleepGainText(s);
        s.sleptEarly = true;
        s.stats.earlyNights = (s.stats.earlyNights || 0) + 1;
        note = 'пропущено слотів: ' + skipped + ', ' + gainTxt;
        break;
      }
      case 'read': {
        const b = bookNow(s), before = pain(s);
        s.readToday = (s.readToday || 0) + 1;
        s.relief = Math.min(s.relief + a.reliefToday, s.base + s.extra);
        const gain = Math.round(a.joy * mult);
        addJoy(s, gain);
        s.book.done++;
        note = '«' + b[0] + '» ' + s.book.done + '/' + b[1] + ', радість +' + gain + ', біль ' + before + ' → ' + pain(s) + ' до ночі';
        if (s.book.done >= b[1]) {
          addJoy(s, a.finishJoy);
          s.stats.booksRead = (s.stats.booksRead || 0) + 1;
          s.lastBookDone = b[0];
          note += '; дочитав! радість +' + a.finishJoy;
          s.book = { i: s.book.i + 1, done: 0 };
        }
        break;
      }
      case 'clean': {
        const was = s.mess;
        s.mess = 0;
        addJoy(s, a.joy);
        note = 'безлад ' + was + ' → 0, радість +' + a.joy;
        break;
      }
      case 'coffee':
        s.energy += a.gain;
        s.coffeeToday = (s.coffeeToday || 0) + 1;
        s.stats.coffee = (s.stats.coffee || 0) + 1;
        note = '+' + a.gain + ' сила, шанс загострення вночі ' + Math.round(flareChanceTonight(s) * 100) + '%';
        break;
    }
    if (borrowedNow) note += '; позичено ' + borrowedNow;
    if (pendingTalkNote) { note += '; ' + pendingTalkNote; pendingTalkNote = null; }
    j.did.push(slotLabel + ': ' + actionLabel(s, id).toLowerCase() + ' (' + note + ')');
    if (!a.freeSlot) s.slot++;
    if (id === 'sleep') s.slot = slotsOf(s);
    checkLose(s, s.day);
    return { ok: true, note, borrowed: borrowedNow, guests: id === 'friends' ? s.lastGuests : null };
  }

  // Книжка, яку зараз читаємо: [назва, сесій] або null, якщо полиця прочитана.
  function bookNow(s) { return C.books[(s.book || { i: 0 }).i] || null; }
  // Рівень безладу словами — для панелі й підказок.
  function messText(m) {
    const H = C.chores;
    return m <= 0 ? 'чисто' : m < H.annoyAt ? 'трохи безладу' : m < H.badAt ? 'безлад: дратує' : 'безлад: гнітить';
  }

  // Кава підкручує нічне загострення.
  function flareChanceTonight(s) {
    return Math.min(1, s.flareChance + (s.coffeeToday || 0) * C.actions.coffee.flareAdd);
  }

  // Прогрес до зниження бази — однаковий текст у картці дії, панелі й нотатці.
  // done — скільки днів вправ уже в поточному колі з per.
  function baseProgress(s) {
    const per = C.night.trainingsPerBaseDrop;
    const atMin = s.base <= C.night.minBasePain;
    let done = s.trainings % per;
    // Щойно зроблений п'ятий день: база знизиться вночі, коло ще не обнулилося.
    const dropTonight = !atMin && s.trainings > 0 && done === 0 &&
      Math.max(C.night.minBasePain, s.baseStart - Math.floor(s.trainings / per)) < s.base;
    if (dropTonight) done = per;
    return { done, per, atMin, dropTonight };
  }
  function baseProgressText(s) {
    const b = baseProgress(s);
    if (b.atMin) return 'база вже на мінімумі';
    if (b.dropTonight) return 'день вправ ' + b.per + ' з ' + b.per + ': база −1 уночі';
    return 'день вправ ' + b.done + ' з ' + b.per + ' до бази −1';
  }

  // «Лягти раніше» конкретними числами: скільки тимчасового болю лишиться вранці зі сном і без.
  // Лише нічний спад — загострення й позичене зверху однакові в обох випадках.
  function sleepGain(s) {
    const e = Math.max(0, s.extra), drift = C.night.painDrift;
    return { now: e, without: Math.max(0, e - drift), with: Math.max(0, e - drift - C.actions.sleep.extraDrift) };
  }
  function sleepGainText(s) {
    const g = sleepGain(s);
    if (g.now === 0) return 'тимчасового болю нема, сон його не знизить';
    if (g.with === g.without) return 'тимчасовий біль ' + g.now + ' і так спаде до ' + g.without + ' за ніч';
    return 'тимчасовий біль уранці ' + g.with + ' замість ' + g.without;
  }

  // Чи задубіють м'язи цієї ночі, якщо сьогодні без вправ.
  function stiffTonight(s) {
    const D = C.night.detrain, n = (s.daysNoExercise || 0) + 1;
    return n === D.afterDays || (n > D.afterDays && (n - D.afterDays) % D.rollbackEvery === 0);
  }

  function checkLose(s, day) {
    if (s.lost) return;
    let cause = null;
    if (s.joy <= 0) cause = 'joy';
    else if (s.money <= 0) cause = 'money';
    if (cause) s.lost = { cause, day, sphere: CAUSES[cause].sphere, text: CAUSES[cause].text };
  }

  // ---------- ніч ----------

  // opts.forceFlare: true/false — для прогнозу без випадковості.
  function endDay(s, opts) {
    opts = opts || {};
    if (s.lost || s.finished) return { events: [] };
    const ev = [];
    const j = journalFor(s, s.day);
    const N = C.night;
    const endState = stateKey(s);
    const bedPain = pain(s);    // з чим лягаємо: від цього залежить, чи буде безсоння

    // Пропозиція друзів, яку так і не прийняли, — це відмова.
    const refused = refuseInvite(s);
    if (refused) ev.push({ kind: 'friends', text: refused.text });

    // 1. Їжа.
    if (!s.fed) {
      const cost = C.actions.delivery.money;
      if (s.money > cost) {
        s.money -= cost;
        s.stats.autoDelivery++;
        ev.push({ kind: 'money', text: 'Їжі не було, тож замовили доставку: −' + cost + ' ₴' });
      } else {
        s.hungerPenalty = N.hungerEnergyPenalty;
        s.stats.hungryDays++;
        j.refused.push('Лишився без їжі');
        ev.push({ kind: 'bad', text: 'Без їжі: на доставку не вистачило грошей. Завтра −' + N.hungerEnergyPenalty + ' сила' });
      }
    }

    // 2. Біль повертається до бази.
    if (s.extra > 0) {
      const drift = N.painDrift + (s.sleptEarly ? C.actions.sleep.extraDrift : 0);
      const was = s.extra;
      s.extra = Math.max(0, s.extra - drift);
      if (s.sleptEarly && was - s.extra > N.painDrift) ev.push({ kind: 'good', text: 'Ліг раніше: тимчасовий біль спав на ' + (was - s.extra) + ' замість ' + N.painDrift });
    }
    else if (s.extra < 0) s.extra = Math.min(0, s.extra + N.painDrift);

    // 3. Позичене.
    if (s.borrowed > 0) {
      s.extra += s.borrowed * N.borrowPain;
      ev.push({ kind: 'pain', text: 'Позичені сили (' + s.borrowed + '): тимчасовий біль +' + s.borrowed * N.borrowPain });
      const tired = s.borrowed * C.joy.borrowPenalty;
      if (tired) {
        addJoy(s, -tired);
        ev.push({ kind: 'joy', text: 'Перевтома: радість −' + tired });
      }
    }

    // 4. Вправи: м'язи тримають краще, завтра болить менше.
    if (s.exerciseToday > 0) {
      const q = s.exerciseQuality || 'good';
      if (q === 'good') {
        const less = s.exerciseToday * C.actions.exercise.reliefTomorrow;
        s.extra -= less;
        ev.push({ kind: 'good', text: 'Після вправ: тимчасовий біль −' + less });
      } else if (q === 'partial') ev.push({ kind: 'info', text: 'Вправи частково: день іде до бази, але без −1 на завтра' });
      else ev.push({ kind: 'info', text: 'Вправ було замало: не зараховано, але й гірше не стало' });
    }

    // 5. Вправи знижують базу.
    const target = Math.max(N.minBasePain, s.baseStart - Math.floor(s.trainings / N.trainingsPerBaseDrop));
    if (target < s.base) {
      s.base = target;
      ev.push({ kind: 'good', text: s.trainings + '-й день вправ: базовий біль знизився до ' + s.base });
    }

    // 6. Загострення.
    const roll = rand(s);
    const flare = opts.forceFlare != null ? opts.forceFlare : roll < flareChanceTonight(s);
    if (flare) {
      s.extra += N.flarePain;
      s.stats.flares++;
      ev.push({ kind: 'flare', text: 'Загострення вночі: тимчасовий біль +' + N.flarePain });
    }

    // 6а. Пропущені вправи: м'язи дубіють, прогрес до бази тане.
    const D = N.detrain;
    if (s.exerciseToday > 0 && s.exerciseQuality !== 'short') s.daysNoExercise = 0;
    else {
      s.daysNoExercise = (s.daysNoExercise || 0) + 1;
      // Дубіють разово на порозі й далі раз на тиждень — не щоночі, інакше біль не спадає зовсім.
      if (s.daysNoExercise === D.afterDays || (s.daysNoExercise > D.afterDays && (s.daysNoExercise - D.afterDays) % D.rollbackEvery === 0)) {
        s.extra += D.pain;
        ev.push({ kind: 'pain', text: s.daysNoExercise + ' дн. без вправ: м’язи дубіють, тимчасовий біль +' + D.pain });
      }
      if (s.daysNoExercise % D.rollbackEvery === 0 && s.trainings % N.trainingsPerBaseDrop > 0) {
        s.trainings--;
        ev.push({ kind: 'pain', text: 'Тиждень без вправ: до зниження бази знову на день більше' });
      }
    }

    // 6б. Погана ніч: з сильним болем важко заснути. Прогноз її не вгадує — це випадковість.
    const BN = N.badNight;
    if (opts.forceFlare == null && bedPain >= BN.minPain && rand(s) < (s.sleptEarly ? BN.earlyChance : BN.chance)) {
      s.sleepPenalty = BN.energy;
      s.stats.badNights = (s.stats.badNights || 0) + 1;
      ev.push({ kind: 'bad', text: 'Біль не давав заснути: зранку сил −' + BN.energy });
    }

    // 7. Виплати за роботу.
    payout(s, s.day + 1, ev);

    // 8. Радість за станом болю.
    if (C.joy.adaptRate && s.joy > C.joy.adaptTo) {
      const fade = Math.round((s.joy - C.joy.adaptTo) * C.joy.adaptRate);
      if (fade > 0) {
        addJoy(s, -fade);
        ev.push({ kind: 'joy', text: 'Хороше швидко стає звичним: радість −' + fade });
      }
    }
    // Хатні справи: безлад росте сам, від готування й гостей — ще більше.
    const H = C.chores;
    s.mess = Math.min(H.max, (s.mess || 0) + H.perDay + (s.foodType === 'cook' ? H.cookAdd : 0) + (s.friendsToday > 0 ? H.guestsAdd : 0));
    if (s.mess >= H.badAt) { addJoy(s, H.badJoy); ev.push({ kind: 'joy', text: 'Вдома безлад, гнітить: радість ' + signed(H.badJoy) }); }
    else if (s.mess >= H.annoyAt) { addJoy(s, H.annoyJoy); ev.push({ kind: 'joy', text: 'Посуд і речі накопичуються: радість ' + signed(H.annoyJoy) }); }

    // Самотність: кілька днів без зустрічей.
    if (s.friendsToday > 0) s.daysAlone = 0;
    else {
      s.daysAlone = (s.daysAlone || 0) + 1;
      if (s.daysAlone >= C.lonely.afterDays) {
        addJoy(s, C.lonely.joy);
        ev.push({ kind: 'joy', text: s.daysAlone + ' дн. без зустрічей: самотньо, радість ' + signed(C.lonely.joy) });
      }
    }
    const daily = C.states[endState].joyDaily;
    if (daily) {
      addJoy(s, daily);
      ev.push({ kind: 'joy', text: 'День у болю (' + C.states[endState].name.toLowerCase() + '): радість ' + signed(daily) });
    }

    // Події календаря не підлаштовуються під стан.
    calendarNight(s, s.day, ev, j);

    // Нові пропозиції від друзів: що рідше бачилися, то рідше кличуть.
    const target2 = s.day + C.friends.leadDays;
    if (target2 <= s.days && rand(s) < inviteChance(meetingsRecent(s), s.warmth)) {
      if (!s.invites[target2]) {
        addInvite(s, target2);
        ev.push({ kind: 'friends', text: s.invites[target2].name + ' пропонує зайти в день ' + target2 });
      }
    }

    s.relief = 0;
    j.night = ev.map((e) => e.text);
    // Біль 10 — не кінець гри, а лікарня: пропущені дні, гроші і радість.
    const hospital = rawPain(s) >= C.painMax && s.day < s.days ? hospitalize(s, ev) : 0;
    if (!hospital && rawPain(s) >= C.painMax) {
      // Останній день гри: лікарня все одно коштує грошей.
      s.money -= C.hospital.cost; s.extra = C.hospital.extraAfter; s.stats.hospital++;
      ev.push({ kind: 'bad', text: 'Біль дійшов до 10. Швидка, лікарня: −' + C.hospital.cost + ' ₴' });
    }
    if (!hospital && s.day < s.days) {
      const e = s.extra;
      ev.push({ kind: 'info', text: 'Підсумок на ранок: біль ' + pain(s) + ' (база ' + s.base + (e ? ', тимчасовий ' + signed(e) : '') + ')' });
    }
    checkLose(s, s.day);
    if (!s.lost) {
      if (s.day >= s.days) s.finished = true;
      else { s.day++; startDay(s); }
    }
    return { events: ev, flare, hospital };
  }

  function payout(s, upTo, ev) {
    const due = s.pending.filter((p) => p.day <= upTo);
    if (!due.length) return;
    const sum = due.reduce((a, p) => a + p.amount, 0);
    s.money += sum;
    s.stats.earned += sum;
    s.pending = s.pending.filter((p) => p.day > upTo);
    ev.push({ kind: 'money', text: 'Надійшла оплата за роботу: +' + sum + ' ₴' });
  }

  function calendarNight(s, day, ev, j) {
    if (isRentDay(day)) {
      s.money -= C.rent.amount;
      ev.push({ kind: 'money', text: 'Оренда: −' + C.rent.amount + ' ₴' });
    }
    if (isDeadlineDay(day)) {
      const need = C.work.unitsPerDeadline;
      if (s.workWeek >= need) {
        s.stats.deadlinesMet++;
        ev.push({ kind: 'good', text: 'Дедлайн виконано: ' + s.workWeek + '/' + need });
      } else {
        s.misses++;
        s.stats.deadlinesMissed++;
        j.refused.push('Пропущено дедлайн: ' + s.workWeek + '/' + need);
        ev.push({ kind: 'bad', text: 'Дедлайн пропущено: ' + s.workWeek + '/' + need });
        if (!s.partTime && s.misses >= C.work.missesForPartTime) {
          s.partTime = true;
          s.partTimeDay = day;
          j.refused.push('Переведено на частковий графік');
          ev.push({ kind: 'bad', text: 'Два пропущені дедлайни: частковий графік, дохід ×' + C.work.partTimeMult });
        }
      }
      s.workWeek = 0;
    }
  }

  // Дні в лікарні минають без дій, але календар іде своїм ходом:
  // оренда, дедлайни й оплати за роботу нікуди не діваються.
  function hospitalize(s, ev) {
    const H = C.hospital;
    const days = Math.min(H.days, s.days - s.day);
    s.stats.hospital++;
    s.stats.hospitalDays += days;
    s.money -= H.cost;
    addJoy(s, H.joy);
    s.extra = H.extraAfter;
    s.borrowed = 0;
    ev.push({ kind: 'bad', text: 'Біль дійшов до 10. Швидка, лікарня: ' + days + ' ' + (days === 1 ? 'день' : 'дні') +
      ' без дому, −' + H.cost + ' ₴, радість ' + signed(H.joy) });
    for (let k = 1; k <= days; k++) {
      s.day++;
      const j = journalFor(s, s.day);
      j.morningPain = C.painMax; j.state = 'strong'; j.hospital = true;
      j.refused.push('День у лікарні');
      const inv = s.invites[s.day];
      if (inv && inv.status === 'open') { inv.status = 'missed'; j.refused.push('Візит: ' + inv.name + ' — скасовано, ти в лікарні'); }
      const evDay = [];
      calendarNight(s, s.day, evDay, j);
      payout(s, s.day + 1, evDay);
      j.night = evDay.map((e) => e.text);
      for (const e of evDay) ev.push({ kind: e.kind, text: 'День ' + s.day + ' (лікарня): ' + e.text });
    }
    return days;
  }

  // ---------- прогнози й попередження ----------

  const clone = (s) => JSON.parse(JSON.stringify(s));

  function forecastNight(s) {
    if (s.lost || s.finished) return null;
    const a = clone(s); endDay(a, { forceFlare: false });
    const b = clone(s); endDay(b, { forceFlare: true });
    const painOf = (x) => clamp(x.base + x.extra, 0, C.painMax);
    return {
      pain: painOf(a), painFlare: painOf(b),
      state: stateOfPain(painOf(a)),
      energy: a.lost || a.finished ? null : a.energyMorning,
      lost: a.lost, lostFlare: b.lost,
      hospital: a.stats.hospital > s.stats.hospital, hospitalFlare: b.stats.hospital > s.stats.hospital,
      money: a.money, joy: a.joy,
    };
  }

  function preview(s, id) {
    const chk = check(s, id);
    const cost = energyCost(s, id);
    const out = {
      id, zone: ACTIONS[id].zone, label: actionLabel(s, id),
      available: chk.available, reason: chk.reason,
      cost: cost == null ? null : cost,
      borrow: 0, effects: [], fatal: null, nightFatal: null,
    };
    if (!chk.available) return out;
    out.borrow = Math.max(0, cost - s.energy);
    const after = clone(s);
    doAction(after, id, id === 'work' ? { score: maxWorkScore() } : null);
    if (after.lost) { out.fatal = after.lost; return out; }

    const hidden = !stateCfg(s).hintsVisible;
    const fx = out.effects;
    if (after.money !== s.money) fx.push({ t: signed(after.money - s.money) + ' ₴', kind: 'money' });
    if (after.pending.length > s.pending.length) {
      const p = after.pending[after.pending.length - 1];
      fx.push({ t: hidden ? 'оплата: ?' : 'до ' + p.amount + ' ₴ на день ' + p.day, kind: 'money', fog: hidden });
      fx.push({ t: 'робота за тиждень ' + after.workWeek + '/' + C.work.unitsPerDeadline, kind: 'info' });
      // Як часто біль заважатиме чути директорку — і чи допоможе знеболювальне.
      const cover = C.painCover[stateKey(s)];
      if (cover > 0 && !hidden) {
        const relief = C.actions.meds.reliefToday;
        const after2 = C.painCover[stateOfPain(Math.max(0, pain(s) - relief))];
        fx.push({ t: 'біль заглушить ~' + Math.round(cover * 100) + '% питань' + (check(s, 'meds').available && after2 < cover ? ' (зі знеболювальним ~' + Math.round(after2 * 100) + '%)' : ''), kind: 'pain' });
      }
    }
    if (after.joy !== s.joy) fx.push({ t: 'радість ' + signed(after.joy - s.joy), kind: 'joy' });
    if (pain(after) !== pain(s)) fx.push({ t: 'біль сьогодні ' + pain(s) + '→' + pain(after) + ' (до ночі)', kind: 'pain' });
    if (after.energy > s.energy) fx.push({ t: 'сила +' + (after.energy - s.energy), kind: 'energy' });
    if (C.actions[id].freeSlot) fx.push({ t: 'слот не займає', kind: 'info' });
    if (id === 'coffee') fx.push({ t: 'шанс загострення вночі ' + Math.round(flareChanceTonight(s) * 100) + '%→' + Math.round(flareChanceTonight(after) * 100) + '%', kind: 'pain' });
    if (id === 'sleep') {
      // Поточний слот теж іде на сон: увечері це і є «раніше».
      const left = slotsOf(s) - s.slot;
      fx.push({ t: 'решта дня — сон (' + left + ' ' + (left === 1 ? 'слот згорить' : left < 5 ? 'слоти згорять' : 'слотів згорить') + ')', kind: 'info' });
      fx.push({ t: sleepGainText(s), kind: sleepGain(s).with < sleepGain(s).without ? 'pain' : 'info' });
    }
    if (after.fed && !s.fed) fx.push({ t: 'їжа на день є', kind: 'info' });
    if (after.trainings > s.trainings) {
      fx.push({ t: baseProgressText(after), kind: 'info' });
    }
    if (stateKey(after) !== stateKey(s)) fx.push({ t: 'стан: ' + stateCfg(after).name.toLowerCase(), kind: 'info' });

    // Біль завтра — чистий підсумок: вправи −1, але позичена сила +1 його з'їдає.
    const before = forecastNight(s);
    const fc = forecastNight(after);
    if (before && fc && !fc.hospital) {
      const d = fc.pain - before.pain;
      if (hidden && (d || id === 'exercise')) fx.push({ t: 'біль завтра: ?', kind: 'pain', fog: true });
      else if (d) fx.push({ t: 'біль завтра ' + before.pain + '→' + fc.pain, kind: 'pain' });
      else if (id === 'exercise') fx.push({ t: 'біль завтра без змін: позичена сила з\'їдає −1', kind: 'pain' });
    }

    // Чи не закінчиться гра (або не прийде лікарня) після цієї дії, хоча без неї — ні.
    if (fc && fc.lost && !(before && before.lost)) out.nightFatal = fc.lost;
    if (fc && fc.hospital && !(before && before.hospital)) out.nightHospital = true;
    return out;
  }

  function signed(v) { return (v > 0 ? '+' : '−') + Math.abs(v); }

  function zoneActions(s, zone) {
    return ACTION_IDS.filter((id) => ACTIONS[id].zone === zone).map((id) => preview(s, id));
  }

  function calendar(s, len) {
    const out = [];
    for (let d = s.day; d < s.day + (len || 7) && d <= s.days; d++) {
      const inv = s.invites[d];
      out.push({
        day: d,
        rent: isRentDay(d) ? C.rent.amount : 0,
        deadline: isDeadlineDay(d) ? C.work.unitsPerDeadline : 0,
        invite: inv ? { name: inv.name, status: inv.status } : null,
        payout: s.pending.filter((p) => p.day === d).reduce((a, p) => a + p.amount, 0),
      });
    }
    return out;
  }

  function hints(s) {
    const out = [];
    if (s.lost || s.finished) return out;
    const st = stateKey(s);
    const fc = forecastNight(s);
    if (s.borrowed > 0) out.push({ kind: 'pain', t: 'Позичено ' + s.borrowed + ' сил: завтра біль +' + s.borrowed * C.night.borrowPain + ', радість −' + s.borrowed * C.joy.borrowPenalty + '.' });
    if (st === 'light' && s.slot < slotsOf(s) && s.energy <= 1)
      out.push({ kind: 'pain', t: 'Добрий день легко перебрати. Те, що позичиш сьогодні, повернеться болем завтра.' });
    const inv = inviteToday(s);
    if (inv) out.push({ kind: 'friends', t: inv.name + ' хоче прийти сьогодні' + ((C.friends.inviteLines[inv.line] || {}).food ? ' і принести поїсти' : '') + '. Якщо не покличеш, це відмова: радість ' + signed(C.joy.refuseInvite) + '.' });
    if (!s.fed) out.push({ kind: 'money', t: 'Їжі ще немає. Уночі буде автоматична доставка за ' + C.actions.delivery.money + ' ₴.' });
    const dl = nextDeadline(s);
    if (dl) {
      const left = C.work.unitsPerDeadline - s.workWeek;
      if (left > 0) out.push({ kind: 'info', t: 'Дедлайн у день ' + dl + ': ще ' + left + ' од. роботи' + (dl - s.day + 1 > 0 ? ' за ' + (dl - s.day + 1) + ' дн.' : '') + '.' });
    }
    for (let d = s.day; d <= Math.min(s.days, s.day + 6); d++) {
      if (!isRentDay(d)) continue;
      const incoming = s.pending.filter((p) => p.day <= d).reduce((a, p) => a + p.amount, 0);
      out.push({ kind: 'money', t: 'Оренда ' + C.rent.amount + ' ₴ у день ' + d + '. До того надійде ' + incoming + ' ₴.' });
      break;
    }
    if (s.exerciseToday === 0 && stiffTonight(s))
      out.push({ kind: 'pain', t: 'Без вправ уже ' + s.daysNoExercise + ' дн. Якщо й сьогодні без них — уночі тимчасовий біль +' + C.night.detrain.pain + '.' });
    if (s.friendsToday === 0 && (s.daysAlone || 0) + 1 >= C.lonely.afterDays)
      out.push({ kind: 'joy', t: 'Без зустрічей уже ' + s.daysAlone + ' дн. ' + (s.daysAlone >= C.lonely.afterDays
        ? 'Щоночі радість ' + signed(C.lonely.joy) + ', поки когось не побачиш.' : 'Ще день наодинці — уночі радість ' + signed(C.lonely.joy) + '.') });
    {
      const H = C.chores, next = Math.min(H.max, (s.mess || 0) + H.perDay + (s.foodType === 'cook' ? H.cookAdd : 0) + (s.friendsToday > 0 ? H.guestsAdd : 0));
      if (next >= H.annoyAt) out.push({ kind: 'joy', t: 'Вдома ' + messText(s.mess) + '. Якщо не прибрати, уночі радість ' + signed(next >= H.badAt ? H.badJoy : H.annoyJoy) + '.' });
    }
    if (pain(s) >= C.night.badNight.minPain)
      out.push({ kind: 'pain', t: 'З болем ' + pain(s) + ' важко заснути: ' + Math.round(C.night.badNight.chance * 100) + '% шанс поганої ночі (сил −' + C.night.badNight.energy + '). Якщо лягти раніше — ' + Math.round(C.night.badNight.earlyChance * 100) + '%.' });
    if (s.creativityBlocked) out.push({ kind: 'joy', t: 'Творчість вимкнена, поки радість не підніметься вище ' + C.joy.creativityOnAbove + '.' });
    if (fc) {
      out.push({ kind: 'info', t: 'Прогноз на ранок: біль ' + fc.pain + ' (' + C.states[fc.state].name.toLowerCase() + ')' +
        (fc.energy != null ? ', сил ' + fc.energy : '') + '. Якщо буде загострення: ' + fc.painFlare + '.' });
      if (fc.lost) out.push({ kind: 'fatal', t: 'Якщо завершити день зараз: ' + fc.lost.text.toLowerCase() + '.' });
      else if (fc.lostFlare) out.push({ kind: 'fatal', t: 'Якщо вночі буде загострення: ' + fc.lostFlare.text.toLowerCase() + '.' });
      if (fc.hospital) out.push({ kind: 'fatal', t: 'Уночі біль дійде до 10: лікарня, ' + C.hospital.days + ' дні і ' + C.hospital.cost + ' ₴.' });
      else if (fc.hospitalFlare) out.push({ kind: 'pain', t: 'Якщо вночі буде загострення, біль дійде до 10 і доведеться в лікарню.' });
    }
    return out;
  }

  // ---------- підсумок ----------

  function summary(s) {
    const st = s.stats;
    const deadlines = Math.floor(Math.min(s.lost ? s.lost.day : s.days, s.days) / C.work.deadlineEvery);
    const kept = [];
    const lost = [];
    if (st.meetings) kept.push('Зустрічі з друзями: ' + st.meetings + (st.invitesAccepted ? ', з них на їхнє запрошення ' + st.invitesAccepted : ''));
    if (st.createDays) kept.push('Дні з творчістю: ' + st.createDays + (st.maxStreak > 1 ? ', найдовша серія ' + st.maxStreak + ' дн.' : ''));
    if (st.workUnits) kept.push('Зроблено роботи: ' + st.workUnits + ' од., зароблено ' + st.earned + ' ₴' +
      (s.pending.length ? ' (ще ' + s.pending.reduce((a, p) => a + p.amount, 0) + ' ₴ в дорозі)' : ''));
    if (st.deadlinesMet) kept.push('Дедлайни виконано: ' + st.deadlinesMet + ' з ' + deadlines);
    if (s.trainings) kept.push('Днів із вправами: ' + s.trainings + '; базовий біль ' + s.baseStart + (s.base !== s.baseStart ? ' → ' + s.base : ', без змін'));
    if (!s.partTime && deadlines > 0) kept.push('Робота на повний графік');
    kept.push('Наприкінці: ' + s.money + ' ₴, радість ' + s.joy + ', біль ' + pain(s));

    if (st.invitesRefused) lost.push('Відмови друзям: ' + st.invitesRefused + ' (' +
      st.refusals.map((r) => r.name + ', день ' + r.day).join('; ') + ')');
    if (st.deadlinesMissed) lost.push('Пропущені дедлайни: ' + st.deadlinesMissed);
    if (s.partTime) lost.push('Частковий графік із дня ' + s.partTimeDay + ', дохід ×' + C.work.partTimeMult);
    if (st.hungryDays) lost.push('Дні без їжі: ' + st.hungryDays);
    if (st.autoDelivery) lost.push('Вечорів, коли їжу замовляли вже без сил вибирати: ' + st.autoDelivery);
    if (st.borrowed) lost.push('Позичено сил: ' + st.borrowed + ', стільки ж болю наступного дня');
    if (st.stateDays.strong) lost.push('Днів у сильному болю: ' + st.stateDays.strong);
    if (st.blockedCreativeDays) lost.push('Днів, коли творчість була недоступна: ' + st.blockedCreativeDays);
    if (st.flares) lost.push('Загострень: ' + st.flares);
    if (st.badNights) lost.push('Безсонних ночей: ' + st.badNights);
    if (st.booksRead) kept.push('Дочитано книжок: ' + st.booksRead);
    if (st.hospital) lost.push('Лікарня: ' + st.hospital + ' р., ' + st.hospitalDays + ' дн. випало з життя');
    if (st.meds) kept.push('Знеболювальне: ' + st.meds + ' р.');
    if (st.earlyNights) kept.push('Лягав раніше: ' + st.earlyNights + ' р.');
    if (st.coffee) kept.push('Кави випито: ' + st.coffee + ' чаш.');
    if (st.talkHeard) kept.push('Почув друзів: ' + st.talkHeard + ' р.');
    if (st.talkMissed) lost.push('Не почув друзів: ' + st.talkMissed + ' р.' + ((s.warmth || 0) < 0 ? ', кличуть рідше' : ''));
    if (st.fines) lost.push('Штрафи на планерках: ' + st.fines + ' ₴');
    if (st.tried) lost.push('Хотів, але не міг: ' + st.tried + ' р.');

    return {
      lost: s.lost ? Object.assign({}, s.lost) : null,
      daysLived: s.lost ? s.lost.day : s.days,
      days: s.days,
      kept, lostItems: lost,
    };
  }

  const api = {
    ZONES, ACTIONS, ACTION_IDS, CAUSES,
    createGame, doAction, endDay, flareChanceTonight, bookNow, messText, sleepGainText, baseProgress, baseProgressText, maxWorkScore, applyTalk, refuseInvite, check, preview, zoneActions,
    forecastNight, hints, calendar, summary,
    inviteText: (inv) => (C.friends.inviteLines[inv.line] || C.friends.inviteLines[0]).text,
    slotsOf, slotName, dayPhase,
    pain, rawPain, stateKey, stateOfPain, stateCfg, meetingsRecent, inviteToday, energyCost,
    clone,
    setConfig(cfg) { C = cfg; },
    get config() { return C; },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
