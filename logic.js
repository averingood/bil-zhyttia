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
    exercise: { zone: 'mat',     label: 'ЛФК', sphere: 'body' },
    stretch:  { zone: 'mat',     label: 'Розтяжка', sphere: 'body' },
    cook:     { zone: 'kitchen', label: 'Приготувати', sphere: 'body' },
    delivery: { zone: 'kitchen', label: 'Замовити доставку', sphere: 'body' },
    coffee:   { zone: 'kitchen', label: 'Випити кави', sphere: null },
    course:   { zone: 'shelf',   label: 'Пігулка з курсу', sphere: 'body' },
    meds:     { zone: 'shelf',   label: 'Знеболювальне', sphere: null },
    block:    { zone: 'shelf',   label: 'Платна процедура', sphere: null },
    board:    { zone: 'sofa',    label: 'Покликати на настолки', sphere: 'people' },
    loan:     { zone: 'sofa',    label: 'Позичити в друзів', sphere: 'money' },
    repay:    { zone: 'sofa',    label: 'Повернути борг', sphere: 'money' },
    gig:      { zone: null,      label: 'Підробіток від друга', sphere: 'money' },   // не в меню: друг пропонує сам, як запрошення
    read:     { zone: 'books',   label: 'Почитати', sphere: 'soul' },
  };
  const ACTION_IDS = Object.keys(ACTIONS);

  const SPHERES = {
    money:  { name: 'Гроші', fall: 'Нема чим платити — виселили', ending: 'money' },
    people: { name: 'Стосунки', fall: 'Стосунки розпалися', ending: 'friends' },
    body:   { name: 'Тіло', fall: 'Тіло здалося: госпіталізація', ending: 'body' },
    soul:   { name: 'Настрій', fall: 'Настрій згас', ending: 'joy' },
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
  // Самотність: поки Стосунки на нулі, Настрій не піднімається вище стелі.
  const lonelyCap = (s) => { if (s.people <= 0 && s.soul > C.lonelyCap) s.soul = C.lonelyCap; };
  // Сфери, нуль у яких означає кінець гри (Стосунки й Настрій — лише обмеження).
  const FATAL = ['body'];
  const signed = (v) => (v > 0 ? '+' : '−') + Math.abs(v);

  // ---------- біль ----------
  const rawPain = (s) => s.base + s.extra;
  const pain = (s) => Math.max(C.painMin, Math.min(C.painMax, rawPain(s) - s.relief));
  function stateOfPain(p) {
    for (const k of Object.keys(C.states)) if (p >= C.states[k].min && p <= C.states[k].max) return k;
    return p < 1 ? 'light' : 'strong';
  }
  const stateKey = (s) => stateOfPain(pain(s));
  // Як часто біль накриває ключове слово (міні-ігри й їхній автоматичний результат).
  const coverOf = (p) => C.painCover[Math.max(0, Math.min(C.painCover.length - 1, Math.round(p)))] || 0;

  // Ціна дії в ресурсі за сьогоднішнім станом; null — у цьому стані недоступно.
  function spoonCost(s, id) {
    // Друзі, що просяться самі: ресурс inviteSpoons (зараз стільки ж, як покликати).
    if (id === 'friends' && inviteToday(s)) return C.actions.friends.inviteSpoons;
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
    const basePain = clampN(opts.basePain, SU.basePain), friendsN = C.friends.count, money = clampN(opts.money, SU.money);
    const seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 2 ** 31);
    const s = {
      seed, rng: seed | 0, days: opts.days || C.days, day: 1,
      setup: { money, basePain },
      baseStart: basePain, base: basePain, extra: SU.startExtra, relief: 0,
      baseShift: 0, courseToday: 0, pillDays: [], lfkDays: [], doctorVisits: [], blockDay: -99, loans: [],
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
    // Несподівані витрати: двічі на тиждень — у першій половині (дні 2–4) і в другій (5–7), звістка вночі, платити — наступної ночі.
    s.surpriseDays = [];
    for (let w = 0; w * 7 + 2 < s.days; w++)
      for (const [from, span] of [[2, 3], [5, 3]]) {
        const d = w * 7 + from + Math.floor(rand(s) * span);
        if (d < s.days) s.surpriseDays.push(d);
      }
    s.bill = null;
    startDay(s, []);
    return s;
  }

  // Ранок: те, що настало з календаря, ресурс з болю, зв'язки сфер.
  function startDay(s, ev) {
    s.relief = 0; s.spent = 0; s.borrowed = 0; s.used = {};
    s.fed = false; s.foodType = null; s.painkiller = false; s.coffeeToday = 0;
    for (const f of s.future.filter((x) => x.day === s.day)) {
      if (f.kind === 'relief') { s.extra = Math.max(0, s.extra - f.amount); ev.push({ kind: 'good', text: (f.from === 'block' ? 'Процедура ще діє' : 'ЛФК ще діє') + ': біль −' + f.amount }); }
      if (f.kind === 'rebound') { s.extra += f.amount; ev.push({ kind: 'pain', text: 'Знеболювальне відпустило: біль +' + f.amount }); }
    }
    s.future = s.future.filter((x) => x.day > s.day);
    const L = C.links;
    let sp = C.spoons[Math.max(0, Math.min(10, pain(s)))];
    if (s.soul >= L.soulHigh) { sp++; ev.push({ kind: 'good', text: 'Настрій добрий: ресурс +1' }); }
    if (s.spoonTomorrow) { sp -= s.spoonTomorrow; ev.push({ kind: 'bad', text: 'Учора взяв наперед: ресурс −' + s.spoonTomorrow }); s.spoonTomorrow = 0; }
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
    const pool = freeFriends(s);
    if (!pool.length) return null;
    const name = pick(s, pool), v = (C.friends.voices || {})[name];
    // Іноді просяться вдвох — тоді вдвох і приходять; інакше приходить лише той, хто писав.
    const rest = pool.filter((n) => n !== name);
    const withName = v && v.pair && rest.length && rand(s) < C.friends.invitePair ? pick(s, rest) : null;
    const lines = withName ? v.pair : v ? v.invite : C.friends.inviteLines;
    s.invites[day] = { name, with: withName, status: 'open', line: Math.floor(rand(s) * lines.length) };
    return s.invites[day];
  }
  // Підробіток від друга: пропозиція на сьогодні, як запрошення.
  function gigToday(s) { return s.gig && s.gig.day === s.day ? s.gig : null; }
  function refuseGig(s) {
    const g = gigToday(s);
    if (!g) return null;
    s.gig = null;
    s.soul = clampS(s.soul - C.actions.gig.refuse);
    journalFor(s, s.day).refused.push(g.from + (C.friends.female.includes(g.from) ? ' пропонувала' : ' пропонував') + ' підробіток — відмовився: Настрій −' + C.actions.gig.refuse);
    return { name: g.from, text: g.from + (C.friends.female.includes(g.from) ? ' пропонувала' : ' пропонував') + ' підробіток — відмовився: Настрій −' + C.actions.gig.refuse };
  }
  function inviteToday(s) {
    const inv = s.invites[s.day];
    return inv && inv.status === 'open' ? inv : null;
  }
  // Рядок запрошення в роді того, хто пише.
  // Рядок запрошення: у кожного друга свій голос; про запас — загальні рядки.
  function inviteLine(inv) {
    const v = (C.friends.voices || {})[inv.name];
    if (v && inv.with && v.pair) return v.pair[inv.line % v.pair.length];
    return v ? v.invite[inv.line % v.invite.length] : C.friends.inviteLines[inv.line] || C.friends.inviteLines[0];
  }
  function inviteText(inv) {
    const l = inviteLine(inv);
    const t = !C.friends.female.includes(inv.name) && l.textM ? l.textM : l.text;
    return inv.with ? t.split('{o}').join(C.friends.instr[inv.with] || inv.with) : t;
  }
  // Хто проситься: «Любава» чи «Любава і Дідуслав»; дієслово в числі.
  function inviteWho(inv) { return inv.with ? inv.name + ' і ' + inv.with : inv.name; }
  const inviteVerb = (inv, one, many) => (inv.with ? many : one);
  // Імена у відмінках: «у Ковбасія», «Одарці».
  const nGen = (n) => (C.friends.gen || {})[n] || n, nDat = (n) => (C.friends.dat || {})[n] || n;
  const inviteWhoDat = (inv) => nDat(inv.name) + (inv.with ? ' і ' + nDat(inv.with) : '');
  // Борги: кому винен — того не кличеш і він не проситься.
  const owes = (s, name) => s.loans.some((l) => l.from === name);
  const freeFriends = (s) => s.friendNames.filter((n) => !owes(s, n));
  const nextLoan = (s) => s.loans.slice().sort((x, y) => x.due - y.due)[0] || null;
  // Відмова: явна (кнопкою) або мовчазна (день скінчився без зустрічі).
  function refuseInvite(s) {
    const inv = inviteToday(s);
    if (!inv) return null;
    inv.status = 'refused';
    s.people = clampS(s.people - C.friends.refuse);
    s.stats.invitesRefused++;
    const v = (C.friends.voices || {})[inv.name];
    const line = pick(s, v ? v.refuse : C.friends.refusalLines);
    journalFor(s, s.day).refused.push('Відмовив ' + inviteWhoDat(inv) + ': Стосунки −' + C.friends.refuse);
    return { name: inv.name, nameDat: inviteWhoDat(inv), line, text: inv.name + ': «' + line + '» Стосунки −' + C.friends.refuse };
  }

  // ---------- перевірка дії ----------
  function check(s, id) {
    const a = C.actions[id];
    const no = (reason) => ({ available: false, reason });
    if (s.lost || s.finished) return no('Гра завершена');
    const cost = spoonCost(s, id);
    if (cost == null) return no('При сильному болю (' + C.states.strong.min + '+) на це немає сил');
    if (a.perDay && (s.used[id] || 0) >= a.perDay) return no('Сьогодні вже було');
    const price = (a.money || 0) + (id === 'course' ? pillPrice(s) : 0);
    if (price && s.money < price) return no('Не вистачає грошей');
    if (cost > s.spoons + (C.maxBorrow - s.borrowed)) return no('Не вистачає ресурсу, навіть якщо взяти наперед');
    const p = pain(s);
    if (s.soul <= 0 && C.apathy.includes(id)) return no('Настрій на нулі — на це зараз немає сил');
    switch (id) {
      case 'cook':
        // Друзі нагодували — готувати однаково можна.
        if (s.fed && s.foodType !== 'guests') return no('Їжа на сьогодні вже є');
        break;
      case 'delivery':
        if (s.fed) return no(s.foodType === 'guests' ? 'Друзі вже погодували' : s.foodType === 'shared' ? 'Ви вже поїли з друзями' : 'Їжа на сьогодні вже є');
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
        if (!inviteToday(s) && !freeFriends(s).length) return no('Ти всім винен — спершу поверни борги');
        break;
      case 'block':
        if (s.day - s.blockDay < a.cooldown) return no('Наступна процедура — не раніше дня ' + (s.blockDay + a.cooldown));
        break;
      case 'gig':
        if (!gigToday(s)) return no('Сьогодні ніхто не пропонував підробіток');
        break;
      case 'repay': {
        const l = nextLoan(s);
        if (!l) return no('Боргів немає');
        if (s.money < l.amount) return no('Не вистачає грошей: треба ' + l.amount + ' ₴');
        break;
      }
      case 'coffee':
        // З другої чашки кава бере із завтра — не більше, ніж можна взяти наперед.
        if (s.coffeeToday >= 1 && a.secondTomorrow && s.spoonTomorrow + a.secondTomorrow > C.maxBorrow) return no('Завтрашній ресурс уже весь узято наперед');
        break;
      case 'board':
        if (s.day - (s.boardDay != null ? s.boardDay : -99) < a.cooldown) return no('Настолки — раз на тиждень: наступні з дня ' + (s.boardDay + a.cooldown));
        if (!freeFriends(s).length) return no('Ти всім винен — кликати нікого');
        break;
      case 'loan':
        if (s.people < a.minPeople) return no('Стосунки на нулі — позичити нема в кого');
        if (!freeFriends(s).length) return no('Ти вже позичив у всіх п’ятьох');
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
    const tags = [];   // що сталося — для плашки над кімнатою: { t, k, covers: ['money'|'people'|…] }

    switch (id) {
      case 'work': {
        const base = opts.score != null ? Math.max(0, Math.round(opts.score)) : a.pay[st];
        const mod = base > 0 ? soulPayMod(s) : 0;   // Настрій: зосереджений — більше, пригнічений — менше
        const pay = Math.max(0, base + mod);
        if (pay > 0) s.pending.push({ day: s.day + a.payDelay, amount: pay });
        note = pay > 0 ? '+' + pay + ' ₴ прийде ' + (a.payDelay === 1 ? 'завтра' : 'на день ' + (s.day + a.payDelay)) + (mod ? ' (настрій: ' + signed(mod) + ' ₴)' : '') : 'нічого не зароблено';
        break;
      }
      case 'games': {
        // Без міні-гри — так само, як у сцені: перед кожною перешкодою, крім першої, біль може накрити, і на ній падаєш.
        let auto = a.jumps;
        if (!opts.runner) for (let i = 1; i < a.jumps; i++) if (rand(s) < (a.painChance[st] != null ? a.painChance[st] : 0.25)) { auto = i; break; }
        const run = opts.runner || { cleared: auto };
        const gain = run.cleared;   // Настрій — за кожну перестрибнуту перешкоду, від 0 до 4
        s.soul = clampS(s.soul + gain);
        ease(s, a.ease);   // гра відволікає від болю
        const late = rand(s) < a.tomorrowChance;
        if (late) s.spoonTomorrow += a.tomorrow;
        note = (gain ? 'Настрій +' + gain : 'впав на першій перешкоді — Настрій без змін') + ', біль відступив на ' + a.ease + (late ? '; засидівся — завтра ресурс −' + a.tomorrow : '');
        break;
      }
      case 'create': {
        // Без міні-гри: кожну ноту біль може зробити фальшивою.
        let fake = 0;
        if (opts.synth) fake = opts.synth.fake; else for (let i = 0; i < a.notes; i++) if (rand(s) < coverOf(pain(s)) * 0.6) fake++;
        const gain = Math.max(0, a.notes - fake);   // Настрій — за кожну чисту ноту
        s.soul = clampS(s.soul + gain);
        songTitle(s);
        s.song.done++;
        note = (gain ? 'Настрій +' + gain : 'усе фальшиво — Настрій без змін') + (fake && gain ? ' (фальшивих нот: ' + fake + ')' : '') + (fake ? ', але пісня росте: «' : ', пісня росте: «') + s.song.title + '»: сесія ' + s.song.done + ' з ' + a.songSessions;
        if (s.song.done >= a.songSessions) {
          s.soul = clampS(s.soul + a.songSoul);
          s.stats.songs++; s.stats.songTitles.push(s.song.title);
          s.lastSongDone = s.song.title;
          note += '; дописав! Настрій +' + a.songSoul;
          s.song = { n: s.song.n + 1, done: 0, title: null };
        }
        break;
      }
      case 'friends': {
        const inv = inviteToday(s);
        const gain = a.people[st] + (inv ? a.invited : 0);
        s.people = clampS(s.people + gain);
        s.stats.meetings++;
        // Приходять по одному або вдвох: хто кликав (чи кого покликав ти) і, буває, ще хтось за компанію.
        // Запросився — приходить той, хто писав (удвох — якщо й просилися вдвох). Покликав сам — буває, хтось ще за компанію.
        const names = inv ? [inv.name].concat(inv.with ? [inv.with] : []) : (s.callGuests || callGuests(s));
        s.callGuests = null;
        if (inv) { inv.status = 'accepted'; s.stats.invitesAccepted++; }
        // Близькі (Стосунки високі) частіше приходять з їжею.
        // Покликав сам — частуєш (з шансом treatChance прийдуть голодні: −treat ₴).
        // Просяться самі — приходять з їжею (invitedFood).
        const DISHES = ['піцу', 'борщ', 'вареники', 'пиріг'];
        // Голодні: гравець обирає — нагодувати (−treat ₴) чи ні (Стосунки −1). Без вибору — годуємо, якщо є гроші.
        if (!inv && s.hungryNow == null) rollHungry(s);
        let treat = 0, unfed = false;
        if (!inv && s.hungryNow) {
          if (opts.feed !== false && s.money >= a.treat) {
            treat = a.treat; s.money -= treat;
            const ateToo = !s.fed; if (ateToo) { s.fed = true; s.foodType = 'shared'; }   // поїли разом
            tags.push({ t: 'гості прийшли голодні: −' + treat + ' ₴ на їжу' + (ateToo ? ', поїли разом' : ''), k: 'bad', covers: ['money', 'fed'] });
          }
          else { unfed = true; s.people = clampS(s.people - 1); tags.push({ t: 'гості лишились голодні: Стосунки +' + gain + ' −1', k: 'bad', covers: ['people'] }); }
        }
        s.hungryNow = null;
        const hungry = !!s.hungryNow || treat > 0 || unfed;
        // Їжу приносять лише ті, хто просився сам: як сказали в запрошенні, а близькі (Стосунки 7+) — іноді й без слів.
        // Покликав сам — їжі не несуть (або прийдуть голодні, або ні).
        // Їжу приносять лише ті, хто про неї написав у запрошенні («Наварила борщу…»). Мовчки — ні.
        const food = hungry || !inv ? null : inviteLine(inv).food || (a.invitedFood ? pick(s, DISHES) : null);
        if (food && !s.fed) {
          s.fed = true; s.foodType = 'guests';
          tags.push({ t: inv.name + (C.friends.female.includes(inv.name) ? ' принесла ' : ' приніс ') + food + ' — нагодували', k: 'good', covers: ['fed'] });
        }
        s.lastVisitInvited = !!inv;
        guests = names;
        note = names.join(' і ') + ' в гостях, Стосунки +' + gain + (treat ? ', прийшли голодні — −' + treat + ' ₴ на їжу' : unfed ? ', прийшли голодні, не нагодував — Стосунки −1' : '') + (food ? ', принесли ' + food + ' — друзі нагодували' : '');
        if (opts.deferTalk) pendingTalk = true;
        else if (!opts.noTalk) {
          // Без міні-гри розмова розігрується сама — за тими ж правилами, що й міні-гра.
          note += '; ' + talkResult(s, autoTalkKinds(s));
        }
        break;
      }
      case 'text':
        s.people = clampS(s.people + a.people);
        s.textedToday = true;
        note = 'Стосунки +' + a.people + '; хтось, може, захоче зайти';
        break;
      case 'exercise': {
        let q = 'good';
        if (opts.mat) { const sh = opts.mat.total ? opts.mat.right / opts.mat.total : 1; q = sh >= a.mat.reliefShare ? 'good' : sh >= a.mat.baseShare ? 'partial' : 'short'; }
        s.exerciseQuality = q;
        if (q === 'good') {
          s.body = clampS(s.body + a.body);
          ease(s, a.reliefToday);
          s.future.push({ day: s.day + 1, kind: 'relief', amount: a.reliefNext });
          s.stats.exercise++; s.lfkDays.push(s.day);
          note = 'ЛФК: Тіло +' + a.body + ', біль −' + a.reliefToday + ' сьогодні й −' + a.reliefNext + ' завтра';
        } else if (q === 'partial') {
          s.body = clampS(s.body + a.partialBody);
          s.stats.exercise++; s.lfkDays.push(s.day);
          note = 'ЛФК частково: Тіло +' + a.partialBody + ', без полегшення';
        } else note = 'замало рухів — не зараховано';
        break;
      }
      case 'stretch':
        s.body = clampS(s.body + a.body);
        ease(s, a.reliefToday);
        note = 'Тіло +' + a.body + ', біль −' + a.reliefToday;
        break;
      case 'cook': {
        s.fed = true; s.foodType = 'cook';
        s.body = clampS(s.body + a.body);
        const misses = opts.cook ? opts.cook.misses : (rand(s) < coverOf(pain(s)) ? 1 : 0);
        if (misses === 0) s.soul = clampS(s.soul + a.soulIfTasty);
        note = 'їжа є, Тіло +' + a.body + (misses === 0 ? ', смачно: Настрій +' + a.soulIfTasty : ', щось не те поклав');
        break;
      }
      case 'delivery':
        s.fed = true; s.foodType = 'delivery';
        s.body = clampS(s.body + (a.body || 0));
        note = 'їжа є' + (a.body ? ', Тіло +' + a.body : '') + ', −' + a.money + ' ₴';
        break;
      case 'coffee':
        s.spoons += a.gain; s.coffeeToday++;
        // Друга чашка: сили зараз — у борг завтрашньому ранку.
        note = 'ресурс +' + a.gain + ', шанс загострення вночі +' + Math.round(a.flareAdd * 100) + '%';
        if (s.coffeeToday >= 2 && a.secondTomorrow) { s.spoonTomorrow += a.secondTomorrow; note = s.coffeeToday + '-га кава: ' + note + ', завтра ресурс −' + a.secondTomorrow; }
        break;
      case 'course': {
        const price = pillPrice(s);
        s.money -= price;
        s.courseToday = s.day;
        s.pillDays.push(s.day);
        s.stats.coursePills++;
        note = 'пігулка з курсу, −' + price + ' ₴';   // скільки випив за тиждень — гравець пам'ятає сам; лікар перевірить
        break;
      }
      case 'meds': {
        const before = pain(s);
        ease(s, a.reliefToday);
        s.painkiller = true;
        s.soul = clampS(s.soul + (a.soul || 0));
        note = 'біль ' + before + ' → ' + pain(s) + (a.soul ? ', полегшало: Настрій +' + a.soul : '') + ', шанс загострення вночі +' + Math.round(a.flareAdd * 100) + '%';
        break;
      }
      case 'block':
        s.blockDay = s.day;
        ease(s, a.reliefToday);
        a.reliefNext.forEach((v, i) => s.future.push({ day: s.day + 1 + i, kind: 'relief', amount: v, from: 'block' }));
        s.body = clampS(s.body + a.body);
        s.stats.blocks = (s.stats.blocks || 0) + 1;
        note = 'біль −' + a.reliefToday + ' сьогодні, −' + a.reliefNext.join(' і −') + ' наступні дні, Тіло +' + a.body + ', −' + a.money + ' ₴';
        break;
      case 'repay': {
        const l = nextLoan(s);
        s.money -= l.amount; s.loans = s.loans.filter((x) => x !== l);
        const rp = C.actions.loan.repayPeople || 0;
        s.people = clampS(s.people + rp);
        note = 'борг ' + l.amount + ' ₴ (' + l.from + ') повернуто раніше строку' + (rp ? ', Стосунки +' + rp : '');
        tags.push({ t: 'віддав борг ' + nDat(l.from) + ': −' + l.amount + ' ₴', k: '', covers: ['money'] });
        break;
      }
      case 'gig': {
        const gpay = s.gig.pay || a.pay;
        s.money += gpay; s.stats.earned += gpay;
        s.people = clampS(s.people - (a.people || 0));
        note = s.gig.from + (C.friends.female.includes(s.gig.from) ? ' підкинула' : ' підкинув') + ' підробіток: +' + gpay + ' ₴ одразу' + (a.people ? '; брати гроші від друга незручно: Стосунки −' + a.people : '');
        s.gig = null;
        break;
      }
      case 'board': {
        s.boardDay = s.day;
        // Приходять усі, кому ти не винен; Стосунки — за кожного.
        guests = freeFriends(s);
        const gainB = a.people * guests.length;
        s.people = clampS(s.people + gainB);
        const soulB = a.soul * guests.length;
        s.soul = clampS(s.soul + soulB);
        s.stats.meetings++; s.stats.boards = (s.stats.boards || 0) + 1;
        // Хто де сяде — щоразу інакше.
        for (let i = guests.length - 1; i > 0; i--) { const k = Math.floor(rand(s) * (i + 1)); [guests[i], guests[k]] = [guests[k], guests[i]]; }
        // Їли разом — голодним цього дня вже не будеш.
        const ate = !s.fed; if (ate) { s.fed = true; s.foodType = 'shared'; }
        note = 'вечір настолок: прийшли ' + guests.join(', ') + '; Стосунки +' + gainB + ', Настрій +' + soulB + ', −' + a.money + ' ₴ на частування' + (ate ? ', поїли разом' : '');
        tags.push({ t: 'настолки: прийшли ' + guests.length + ' — Стосунки +' + gainB + ', Настрій +' + soulB, k: 'good', covers: ['people', 'soul'] });
        break;
      }
      case 'loan': {
        // У кого — випадково з тих, кому ще не винен (і не з того, хто сьогодні проситься в гості).
        const inv = inviteToday(s), pool = freeFriends(s);
        const pool2 = pool.filter((n) => !inv || (n !== inv.name && n !== inv.with));
        const from = pick(s, pool2.length ? pool2 : pool), amount = a.amount;
        s.money += amount;
        s.people = clampS(s.people - a.people);
        const l = { amount, due: s.day + a.dueIn, from };
        s.loans.push(l);
        s.stats.loans = (s.stats.loans || 0) + 1;
        note = '+' + amount + ' ₴ від ' + nGen(from) + ', незручно просити: Стосунки −' + a.people + '; віддати до дня ' + l.due + '. Доки не віддаси, ' + from + ' не прийде в гості';
        tags.push({ t: 'позичив у ' + nGen(from) + ': +' + amount + ' ₴, віддати до дня ' + l.due, k: '', covers: ['money'] });
        break;
      }
      case 'read': {
        const b = bookNow(s);
        s.soul = clampS(s.soul + a.soul);
        s.book.done++;
        note = '«' + b[0] + '»: сесія ' + s.book.done + ' з ' + b[1] + ', Настрій +' + a.soul;
        if (s.book.done >= b[1]) {
          s.soul = clampS(s.soul + a.finishSoul);
          s.stats.booksRead++; s.lastBookDone = b[0];
          note += '; дочитав! Настрій +' + a.finishSoul;
          s.book = { i: s.book.i + 1, done: 0 };
        }
        break;
      }
    }
    if (borrowedNow) note += '; взяв наперед ресурс ' + borrowedNow;
    j.did.push(ACTIONS[id].label + ' (' + note + ')');
    lonelyCap(s);
    return { ok: true, note, borrowed: borrowedNow, guests, tags };
  }

  // Розмова від першої особи: kinds — відповіді на теми ('right'|'meh'|'wrong'|'silent').
  function applyTalk(s, kinds) {
    if (!pendingTalk) return '';
    pendingTalk = null;
    return talkResult(s, kinds);
  }
  // Покликав друзів сам: чи прийдуть голодні (кидаємо до дії, щоб гравець міг вибрати, чим пригостити).
  function rollHungry(s) {
    const a = C.actions.friends;
    s.hungryNow = !inviteToday(s) && !!a.treat && rand(s) < a.treatChance;
    if (s.hungryNow) s.callGuests = callGuests(s);   // хто саме голодний — знаємо наперед, щоб і репліка була від них
    return s.hungryNow;
  }
  // Покликав сам: хтось один, а буває, ще хтось за компанію.
  function callGuests(s) {
    const first = pick(s, freeFriends(s)), names = [first];
    if (rand(s) < C.friends.pairChance) { const rest = freeFriends(s).filter((n) => n !== first); if (rest.length) names.push(pick(s, rest)); }
    return names;
  }
  // Розмова без міні-гри: кожну тему біль може накрити (coverOf) — тоді вгадуєш навпіл.
  function autoTalkKinds(s) {
    const c = coverOf(pain(s)), out = [];
    for (let i = 0; i < C.friends.talk.topics; i++) out.push(rand(s) < c && rand(s) < 0.5 ? 'wrong' : 'right');
    return out;
  }
  function talkResult(s, kinds) {
    const T = C.friends.talk.joy;
    const sum = (kinds || []).reduce((acc, k) => acc + (T[k] || 0), 0);
    // Вдалась — Стосунки +1. Так собі — Настрій −1. Не склалась (біль заглушив, відповідав невлад) — Стосунки −1 і Настрій −1.
    const d = sum > 0 ? 1 : sum < 0 ? -1 : 0;
    if (d > 0) s.people = clampS(s.people + 1);
    if (d < 0) s.people = clampS(s.people - 1);
    if (d <= 0) s.soul = clampS(s.soul - 1);
    if ((kinds || []).some((k) => k === 'silent' || k === 'wrong')) s.stats.talkMissed++; else s.stats.talkHeard++;
    s.lastTalkMissed = d < 0;
    s.lastTalk = d > 0 ? 'good' : d < 0 ? 'bad' : 'meh';
    return d > 0 ? 'розмова вдалась: Стосунки +1' : d < 0 ? 'розмова не склалась: Стосунки −1, Настрій −1' : 'розмова так собі: Настрій −1';
  }

  // Огляд лікаря: що він каже (рядки для сцени) і що змінилось.
  function doctorVisit(s) {
    const D = C.doctor, d = s.day, lines = [];
    const before = s.base, final = d === D.days[D.days.length - 1];
    const pills = inWeek(s.pillDays, d), lfk = inWeek(s.lfkDays, d), wk = weekIdx(d), keep = D.pills.keep[wk];
    let shift = 0;
    if (!D.pillsWeeks[wk]) {
      // Підтримуюча доза: мінімум болю не знижує, лише тримає досягнуте.
      lines.push(pills >= D.pills.full
        ? { t: 'Підтримуюча — ' + pills + ' з ' + D.week + ', як годинник. Швейцарський. Ну, майже.', k: 'good' }
        : { t: 'Підтримуюча — ' + pills + ' з ' + D.week + '. Пропусків ' + (D.week - pills) + ', і кожен — плюс до мінімуму болю. Бухгалтерія сходиться, на жаль.', k: 'bad' });
    } else if (pills >= D.pills.full) { shift--; lines.push({ t: 'Пігулки: ' + pills + ' з ' + D.week + '! Зразковий пацієнт — аж підозріло. Мінімум болю знижую.', k: 'good' }); }
    else if (pills >= keep) lines.push({ t: 'Пігулки: ' + pills + ' з ' + D.week + '. Один день вирішили пожити небезпечно? Мінімум лишаю як є.', k: '' });
    else { shift++; lines.push({ t: 'Пігулки: ' + pills + ' з ' + D.week + '. Ліки в шухляді не діють — перевіряли. Мінімум болю росте.', k: 'bad' }); }
    if (D.lfkWeeks[wk]) {
      if (lfk >= D.lfk.good) { shift--; lines.push({ t: 'ЛФК: ' + lfk + ' ' + timesWord(lfk) + '. Суглоби аж співають — мінімум болю вниз.', k: 'good' }); }
      else if (lfk > 0) lines.push({ t: 'ЛФК: ' + lfk + ' ' + timesWord(lfk) + '. Килимок уже думає, що він просто меблі. Треба хоча б ' + D.lfk.good + '.', k: '' });
      else { shift++; lines.push({ t: 'ЛФК: жодного разу. Килимок подав на розлучення. Мінімум болю росте.', k: 'bad' }); }
    }
    // Наступний тиждень: доза вища (і дорожча); на останній — ЛФК на власний розсуд.
    if (!final) {
      const nw = wk + 1;
      lines.push({ t: D.pillsWeeks[nw]
        ? 'З завтра доза вища: пігулка ' + C.course.money[nw] + ' ₴. Ліки дорожчають, як і все в цьому житті.'
        : 'Останній тиждень — підтримуюча доза, ' + C.course.money[nw] + ' ₴ щодня. Пропустите хоч день — мінімум болю зросте на ' + (C.course.missMin[nw] || 1) + '. Я не лякаю, я констатую.' + (!D.lfkWeeks[nw] ? ' ЛФК — як хочете, я вже не дивлюся.' : ''), k: '' });
    }
    s.baseShift += shift;
    recalcBase(s);
    if (s.body <= D.rescueBody) {
      if (!D.rescueCost || s.money >= D.rescueCost) { s.money -= D.rescueCost; s.body = clampS(s.body + D.rescue); lines.push({ t: 'Тіло ледве тримається — вколю вам щось бадьоре. Тіло +' + D.rescue + (D.rescueCost ? ', −' + D.rescueCost + ' ₴' : ', безкоштовно — не дякуйте, дякуйте бюджету') + '.', k: 'good' }); }
      else lines.push({ t: 'Тіло слабке, укол би допоміг — але на нього (' + D.rescueCost + ' ₴) грошей немає.', k: 'bad' });
    }
    const after = s.base;
    const verdict = after !== before ? 'мінімум болю ' + before + ' → ' + after : 'мінімум болю без змін (' + after + ')';
    lines.push({ t: final ? 'Ну що ж. Ваш мінімум болю тепер ' + after + ' (починали з ' + s.baseStart + '). Лікування завершено — йдіть живіть, поки дозволяють.'
      : 'Отже, ' + verdict + (after === before ? '. Стабільність — ознака майстерності. Або лінощів.' : '.') + ' Побачимось через тиждень — якщо доживемо обидва.', k: after < before ? 'good' : after > before ? 'bad' : '' });
    const v = { day: d, final, pills, lfk, before, after, lines, summary: (final ? 'Фінальний огляд лікаря: ' : 'Огляд лікаря: ') + verdict };
    s.doctorVisits.push(v);
    journalFor(s, d).night.push(v.summary);
    return v;
  }
  const timesWord = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'раз' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'рази' : 'разів');

  // Зняти біль: не «до ночі», а насправді — він далі спадає вже з нового рівня. Нижче мінімуму — ніколи.
  function ease(s, n) { s.extra = Math.max(0, s.extra - n); }

  // Курсові пігулки за останні window днів (включно з сьогодні) і чи діє курс.
  // За тиждень до огляду лікаря (включно з днем огляду).
  const inWeek = (days, d) => days.filter((x) => x > d - C.doctor.week && x <= d).length;
  function pillsInWeek(s) { return inWeek(s.pillDays, s.day); }
  function lfkInWeek(s) { return inWeek(s.lfkDays, s.day); }

  function recalcBase(s) {
    s.base = Math.max(C.painMin, Math.min(s.baseStart + C.doctor.maxUp, s.baseStart + s.baseShift));
  }

  // ---------- загострення й тиск ----------
  // Перевтома: ресурс на нулі чи взятий наперед.
  const exhaustedNow = (s) => s.spoons === 0 || s.borrowed > 0;
  function flareChanceTonight(s) {
    const t = C.links.bodyFlare.find(([min]) => s.body >= min);
    const base = Math.max(0, (t ? t[1] : 0.3) + s.coffeeToday * C.actions.coffee.flareAdd + (exhaustedNow(s) ? C.night.exhausted : 0) + (s.painkiller ? C.actions.meds.flareAdd : 0) + soulFlareMod(s));
    // Щотижня загострення частішають; межа — flareCap.
    return Math.min(C.flareCap, base + C.flareWeek[weekIdx(s.day)]);
  }
  // Настрій тримають біль: спокій — рідше загострення, пригніченість — частіше.
  function soulFlareMod(s) { const L = C.links; return s.soul >= L.soulGood ? -L.soulFlare : s.soul <= L.soulBad ? L.soulFlare : 0; }
  function soulPayMod(s) { const L = C.links; return s.soul >= L.soulGood ? L.soulPay : s.soul <= L.soulBad ? -L.soulPay : 0; }
  function flareSize(s) {
    const t = C.night.flareSizes, sum = t.reduce((a, x) => a + x[1], 0);
    let r = rand(s) * sum;
    for (const [p, w] of t) { if ((r -= w) < 0) return p; }
    return t[t.length - 1][0];
  }
  const weekOf = (d) => Math.max(0, Math.floor((d - 1) / 7));
  // Тиждень курсу: 0, 1, 2 (для ударів, частоти загострень і дози ліків).
  const weekIdx = (d) => Math.min(2, Math.max(0, Math.floor((d - 1) / 7)));
  const pillPrice = (s) => C.course.money[weekIdx(s.day)];
  const pressureOf = () => 0;   // стара таблиця тиску — більше не діє (удари тепер окремі)
  const dailyCost = (d) => C.costs[Math.min(C.costs.length - 1, weekOf(d))];

  // ---------- ніч ----------
  // opts.forceFlare — для прогнозу. Повертає { events, flare, hospital }.
  function endDay(s, opts) {
    opts = opts || {};
    if (s.lost || s.finished) return { events: [], flare: false, hospital: false };
    const ev = [], j = journalFor(s, s.day), N = C.night, L = C.links;
    const peopleAtDusk = s.people;   // підробіток пропонують за тим, які стосунки були за день, до нічного танення
    const st = stateKey(s);

    const ref = refuseInvite(s);
    if (ref) ev.push({ kind: 'friends', text: ref.text });
    // Криза: сфера, що була на нулі, сьогодні піднята — врятована, і цієї ночі її не чіпає ніщо (ні голод, ні танення, ні тиск).
    s.crisis = s.crisis || {}; s.crisesUsed = s.crisesUsed || {};
    const safe = {};
    for (const k of FATAL) if (s.crisis[k] != null && s[k] > 0) {
      delete s.crisis[k]; safe[k] = true;
      ev.push({ kind: 'good', text: 'Вибрався: ' + SPHERES[k].name + ' вище нуля' });
    }
    let hunger = null;   // якщо вночі лікарня — там нагодують, і голод скасовується
    if (!s.fed) {
      s.hungryStreak = (s.hungryStreak || 0) + 1;
      const loss = safe.body ? 0 : C.hungry.body * s.hungryStreak;   // що довше без їжі, то сильніше
      s.body = clampS(s.body - loss); s.stats.hungry++;
      hunger = { loss, ev: { kind: 'bad', text: (s.hungryStreak > 1 ? 'Знову без їжі' : 'Без їжі') + ': Тіло −' + loss } };
      if (loss) ev.push(hunger.ev);
    } else s.hungryStreak = 0;
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
    for (const k of SOFT) if (!safe[k]) s[k] = clampS(s[k] - C.decay);
    ev.push({ kind: 'info', text: 'Сфери тануть самі собою: ' + SOFT.filter((k) => !safe[k]).map((k) => SPHERES[k].name).join(', ') + ' −' + C.decay });
    // Удар життя: не щоночі — з шансом, що росте щотижня; щонайбільше один за ніч.
    // Справедливо: сфери на межі (≤ mercy) і щойно врятовані обходить, поки є інші.
    {
      const B = C.blows, w = weekIdx(s.day);
      if (rand(s) < B.chance[w]) {
        const pool = SOFT.filter((k) => !safe[k]);   // будь-яка сфера, хоч і найслабша; лише щойно врятоване Тіло цієї ночі не чіпає
        if (pool.length) {
          const k = pick(s, pool), size = B.size[w];
          const f = pick(s, s.friendNames), fem = C.friends.female.includes(f);
          const text = pick(s, B[k]).replace('{fi}', (C.friends.instr || {})[f] || f).replace('{f}', f).replace('{a}', fem ? 'лася' : 'вся').replace('{b}', fem ? 'ла' : 'в');
          s[k] = clampS(s[k] - size);
          ev.push({ kind: 'bad', blow: true, text: text + ': ' + SPHERES[k].name + ' −' + size });
        }
      }
    }
    if (st === 'strong' && s.soul > C.mercy) { s.soul = clampS(s.soul - L.strongSoul); ev.push({ kind: 'pain', text: 'День у сильному болю пригнічує: Настрій −' + L.strongSoul }); }

    // Біль на завтра.
    s.extra = Math.max(0, s.extra - N.drift);
    // Висока доза: пропущена пігулка — біль повертається вже завтра.
    const miss = C.course.missMin[weekIdx(s.day)];
    if (miss && s.courseToday !== s.day && s.day < s.days) {
      const was = s.base; s.baseShift += miss; recalcBase(s);
      if (s.base > was) ev.push({ kind: 'pain', text: 'Пропустив підтримуючу пігулку: мінімум болю ' + was + ' → ' + s.base });
    }
    // Узяв ресурс наперед — тіло платить за перевтому.
    if (s.borrowed > 0 && C.borrowBody && !safe.body) {
      const loss = C.borrowBodyFlat ? C.borrowBody : C.borrowBody * s.borrowed;
      s.body = clampS(s.body - loss);
      ev.push({ kind: 'bad', text: 'Узяв наперед ресурс ' + s.borrowed + ': перевтома, Тіло −' + loss });
    }
    if (s.borrowed > 0 && C.borrowPain) { s.extra += C.borrowPain * s.borrowed; ev.push({ kind: 'pain', text: 'Узяв наперед ресурс ' + s.borrowed + ': завтра біль +' + C.borrowPain * s.borrowed }); }
    if (exhaustedNow(s)) ev.push({ kind: 'pain', text: 'Вичерпав увесь ресурс: шанс загострення вночі +' + Math.round(N.exhausted * 100) + '%' });
    else if (s.spoons >= N.earlyRest && s.extra > 0) { s.extra -= 1; ev.push({ kind: 'good', text: 'Лишив сил на себе: завтра біль −1' }); }
    s.extra = Math.max(0, s.extra);   // нижче мінімуму біль не буває

    // Лікар: огляд увечері — оцінює тиждень (пігулки й ЛФК), після нього змінюється мінімум болю; слабке тіло — укол.
    let doctor = null;
    if (C.doctor.days.includes(s.day)) { doctor = doctorVisit(s); ev.push({ kind: doctor.after < doctor.before ? 'good' : doctor.after > doctor.before ? 'pain' : 'info', text: doctor.summary }); }
    // Несподіваний рахунок: сьогодні платимо той, про який дізнались учора; і, може, приходить новий.
    if (s.bill && s.bill.due === s.day) {
      s.money -= s.bill.amount; s.stats.surprises = (s.stats.surprises || 0) + s.bill.amount;
      ev.push({ kind: 'money', text: s.bill.name + ': −' + s.bill.amount + ' ₴' });
      s.bill = null;
    }
    if (s.surpriseDays.includes(s.day) && s.day < s.days) {
      const [name, amount] = pick(s, C.surprises);
      s.bill = { name, amount, due: s.day + 1 };
      ev.push({ kind: 'bad', text: 'Несподівано: ' + name.toLowerCase() + ' — завтра треба заплатити ' + amount + ' ₴' });
    }
    // Борг: настав день — віддаєш, якщо є з чого; нема — друг ображається.
    for (const l of s.loans.slice().sort((x, y) => x.due - y.due)) {
      if (s.day < l.due) continue;
      const A = C.actions.loan;
      if (s.money > l.amount) { s.money -= l.amount; ev.push({ kind: 'money', text: 'Повернув борг ' + nDat(l.from) + ': −' + l.amount + ' ₴' }); s.loans = s.loans.filter((x) => x !== l); }
      else { s.people = clampS(s.people - A.late); l.due = s.day + A.again; ev.push({ kind: 'friends', text: 'Не зміг повернути борг ' + nDat(l.from) + ': Стосунки −' + A.late + '. Нагадає в день ' + l.due }); }
    }
    recalcBase(s);

    // Загострення: шанс тримає Тіло.
    const flare = opts.forceFlare != null ? opts.forceFlare : rand(s) < flareChanceTonight(s);
    if (flare) {
      const size = flareSize(s);
      s.extra += size; s.stats.flares++;
      ev.push({ kind: 'flare', text: (N.flareNames[size] || 'Загострення') + ' вночі: біль +' + size });
    }

    // Близькі друзі підкидають підробіток на завтра.
    // Пропозицію підробітку, на яку не відповів, друг сприймає як відмову.
    if (gigToday(s)) { const r = refuseGig(s); ev.push({ kind: 'friends', text: r.text }); }
    if (s.gig && s.gig.day <= s.day) s.gig = null;
    if (peopleAtDusk >= C.links.peopleGood) s.gigWait = (s.gigWait || 0) + 1; else s.gigWait = 0;
    // Шанс щоночі, а якщо близькі поруч уже кілька ночей і досі нічого — пропонують напевно.
    const GL = C.links.gigLow, close = peopleAtDusk >= C.links.peopleGood;
    if (!s.gig && s.day < s.days && (close ? rand(s) < C.links.gigChance || s.gigWait >= C.links.gigSure : peopleAtDusk >= GL.min && rand(s) < GL.chance)) {
      s.gigWait = 0;
      // Близькі (7+) — більше; просто знайомі (3–6) — менше.
      s.gig = { day: s.day + 1, from: pick(s, s.friendNames), pay: close ? C.actions.gig.pay : GL.pay };
      ev.push({ kind: 'money', text: s.gig.from + ' пропонує завтра підробіток: +' + s.gig.pay + ' ₴ за ресурс ' + C.actions.gig.spoons });
    }
    // Нові пропозиції від друзів.
    const share = s.friendNames.length / C.friends.baseCount;
    const inviteChance = Math.min(0.8, (C.friends.inviteChance + (s.textedToday ? C.actions.text.inviteBoost : 0)) * share);
    s.textedToday = false;
    if (rand(s) < inviteChance) {
      const inv = addInvite(s, s.day + C.friends.leadDays);
      if (inv) ev.push({ kind: 'friends', text: inviteWho(inv) + ' ' + inviteVerb(inv, 'пропонує', 'пропонують') + ' зайти в день ' + (s.day + C.friends.leadDays) });
    }

    // Біль 10 — ніч у лікарні: знеболили до мінімуму, нагодували, підлікували Тіло; зранку вже вдома.
    let hospital = false;
    if (rawPain(s) >= C.painMax && s.day < s.days) {
      hospital = true;
      s.money -= C.hospital.cost; s.stats.hospital++;
      if (hunger) { s.body = clampS(s.body + hunger.loss); s.stats.hungry--; s.hungryStreak = 0; const hi = ev.indexOf(hunger.ev); if (hi >= 0) ev.splice(hi, 1); }
      s.extra = C.hospital.extraAfter;
      const rest = ev.findIndex((e) => e.text.startsWith('Лишив сил на себе')); if (rest >= 0) ev.splice(rest, 1);   // біль і так — базовий
      const bodyWas = s.body;
      s.body = Math.max(s.body, C.hospital.body);
      ev.push({ kind: 'bad', text: 'Біль дійшов до 10. Швидка, ніч у лікарні: знеболили, нагодували' + (s.body > bodyWas ? ', Тіло підлікували до ' + s.body : '') + '; зранку вже вдома. −' + C.hospital.cost + ' ₴' });
    }

    checkLose(s, s.day, ev);
    // Кінцева ніч: окремої лікарні з поверненням немає — тіло здалося, то й так госпіталізація.
    if (s.lost && hospital && s.lost.sphere === 'body') { hospital = false; s.money += C.hospital.cost; s.stats.hospital--; ev.splice(ev.findIndex((e) => e.text.startsWith('Біль дійшов до 10')), 1); }
    j.night = ev.map((e) => e.text);
    if (!s.lost) {
      if (s.day >= s.days) s.finished = true;
      else {
        s.day++;
        if (!s.lost && !s.finished) startDay(s, ev);
      }
    }
    return { events: ev, flare, hospital: hospital ? 1 : false, doctor };
  }

  // Нуль — ще не кінець. Стосунки/Тіло/Настрій: криза — наступного дня треба підняти вище нуля (перевіряється
  // наступної ночі ще до танення). Скільки разів — без обмежень: поки щоразу піднімаєш, тримаєшся.
  // Гроші: на нулі є C.graceMoney днів, щоб знайти, чим платити; не знайшов — виселяють.
  // В останній день курсу часу вже немає: нуль — кінець.
  function checkLose(s, day, ev) {
    if (s.lost) return;
    if (day >= s.days) return;   // дожив до кінця курсу — уночі вже ніхто не виселяє й не госпіталізує: свято
    ev = ev || [];
    s.crisis = s.crisis || {}; s.crisesUsed = s.crisesUsed || {};
    const lose = (k) => { s.lost = { cause: SPHERES[k].ending, sphere: k, day, sphereName: SPHERES[k].name, text: SPHERES[k].fall }; };
    // Гроші.
    if (s.money <= 0) {
      if (day >= s.days) { lose('money'); return; }
      if (s.crisis.money == null) {
        s.crisis.money = day + C.graceMoney;
        ev.push({ kind: 'flare', text: 'Гроші на нулі! ' + C.graceMoney + ' дні, щоб знайти, чим платити (до кінця дня ' + s.crisis.money + '), — інакше виселять' });
      } else if (day >= s.crisis.money) { lose('money'); return; }
    } else if (s.crisis.money != null) { delete s.crisis.money; ev.push({ kind: 'good', text: 'Вибрався: гроші знову є' }); }
    // Стосунки й Настрій — не кінець: лише стеля й обмеження. Кінець — Тіло на нулі два дні поспіль.
    lonelyCap(s);
    for (const k of FATAL) {
      if (s[k] > 0) continue;
      if (s.crisis[k] != null || day >= s.days) { lose(k); return; }   // не підняв за день — кінець
      s.crisesUsed[k] = (s.crisesUsed[k] || 0) + 1;
      s.crisis[k] = day + 1;
      ev.push({ kind: 'flare', text: SPHERES[k].name + ' на нулі! Завтра треба підняти вище нуля — інакше кінець' });
    }
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
    return { lost: a.lost, lostFlare: b.lost, hospital: !!ra.hospital, hospitalFlare: !!rb.hospital, events: ra.events,
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
    for (const k of SOFT) if (after[k] !== s[k]) {
      let txt = SPHERES[k].name + ' ' + signed(after[k] - s[k]);
      // Де результат залежить від міні-гри — кажемо чесно, від чого.
      if (id === 'cook' && k === 'soul') txt = SPHERES[k].name + ' +' + C.actions.cook.soulIfTasty + ', якщо смачно';
      if (id === 'create' && k === 'soul') txt = SPHERES[k].name + ' 0…+' + C.actions.create.notes + ' (скільки чистих нот)';
      if (id === 'games' && k === 'soul') txt = SPHERES[k].name + ' 0…+' + C.actions.games.jumps + ' (скільки перешкод перестрибнеш)';
      fx.push({ t: txt, kind: k });
    }
    // Біль уже на мінімумі — знеболення нічого не зніме, кажемо прямо.
    if (['stretch', 'meds', 'games', 'exercise', 'block'].includes(id) && s.extra <= 0) fx.push({ t: 'біль уже на мінімумі (' + s.base + ')', kind: 'info' });
    // Самотність: дія підняла б Настрій, але стеля — поки Стосунки на нулі.
    if (s.people <= 0 && s.soul >= C.lonelyCap) {
      const probe = clone(s); probe.people = 1; const pa = clone(probe), sv = pendingTalk;
      doAction(pa, id, id === 'friends' ? { noTalk: true } : id === 'cook' ? { cook: { misses: 0 } } : id === 'create' ? { synth: { fake: 0 } } : id === 'games' ? { runner: { cleared: C.actions.games.jumps } } : null);
      pendingTalk = sv;
      if (pa.soul > after.soul) fx.push({ t: 'Настрій не вище ' + C.lonelyCap + ', поки Стосунки на нулі', kind: 'info' });
    }
    // Сфера вже 10: дія підняла б її, але нікуди — кажемо про це, а не мовчимо.
    for (const k of SOFT) if (s[k] >= 10 && after[k] === s[k]) {
      const probe = clone(s); probe[k] = 9; const pa = clone(probe), sv = pendingTalk;
      doAction(pa, id, id === 'friends' ? { noTalk: true } : id === 'cook' ? { cook: { misses: 0 } } : id === 'create' ? { synth: { fake: 0 } } : id === 'games' ? { runner: { cleared: C.actions.games.jumps } } : null);
      pendingTalk = sv;
      if (pa[k] > probe[k]) fx.push({ t: SPHERES[k].name + ' вже 10 — вище нікуди', kind: 'info' });
    }
    // Друзі: чи прийдуть голодні — випадок, тож показуємо шанс, а не наперед відомий результат.
    const fa = C.actions.friends, hungry = id === 'friends' && !inviteToday(s) && fa.treat && fa.treatChance < 1;
    if (hungry) fx.push({ t: Math.round(fa.treatChance * 100) + '%: прийдуть голодні — нагодувати (−' + fa.treat + ' ₴) чи Стосунки −1', kind: 'money' });
    else if (after.money !== s.money) fx.push({ t: signed(after.money - s.money) + ' ₴', kind: 'money' });
    if (after.pending.length > s.pending.length) { const p = after.pending[after.pending.length - 1]; fx.push({ t: '+' + p.amount + ' ₴ ' + (p.day === s.day + 1 ? 'завтра' : 'на день ' + p.day), kind: 'money' }); }
    if (pain(after) !== pain(s)) fx.push({ t: 'біль зараз ' + pain(s) + '→' + pain(after), kind: pain(after) < pain(s) ? 'good' : 'pain' });
    for (const f of after.future.slice(s.future.length)) fx.push(f.kind === 'relief' ? { t: (f.day === s.day + 1 ? 'завтра' : 'день ' + f.day) + ': біль −' + f.amount, kind: 'good' } : { t: 'завтра відкат +' + f.amount, kind: 'pain' });
    if (id === 'games') fx.push({ t: 'Засидишся: ' + Math.round(C.actions.games.tomorrowChance * 100) + '% шанс втратити ' + C.actions.games.tomorrow + ' ресурс завтра', kind: 'pain' });
    else if (after.spoonTomorrow - s.spoonTomorrow - out.borrow > 0) fx.push({ t: 'завтра ресурс −' + (after.spoonTomorrow - s.spoonTomorrow - out.borrow), kind: 'pain' });
    if (id === 'meds') fx.push({ t: 'шанс загострення вночі +' + Math.round(C.actions.meds.flareAdd * 100) + '%', kind: 'pain' });
    if (id === 'coffee') {
      fx.push({ t: 'ресурс +' + C.actions.coffee.gain, kind: 'good' });
      fx.push({ t: 'шанс загострення вночі +' + Math.round(C.actions.coffee.flareAdd * 100) + '%', kind: 'pain' });
    }
    // Про власну їжу не пишемо (приготував чи замовив — і так ясно); лише коли годують друзі.
    if (after.fed && !s.fed && after.foodType === 'guests') fx.push({ t: 'друзі нагодують', kind: 'info' });
    if (id === 'cook' && s.foodType === 'guests') fx.push({ t: 'друзі вже погодували', kind: 'info' });
    // Пісню треба дописати, книжку — дочитати: показуємо, скільки лишилось до бонусу.
    if (id === 'create') {
      const A = C.actions.create, n = s.song.done + 1;
      fx.push(n >= A.songSessions ? { t: 'остання сесія: пісню дописано (з бонусом +' + A.songSoul + ')', kind: 'good' } : { t: 'пісня: сесія ' + n + ' з ' + A.songSessions + ', дописана дасть +' + A.songSoul, kind: 'info' });
    }
    if (id === 'read') {
      const b = bookNow(s), n = s.book.done + 1;
      fx.push(n >= b[1] ? { t: 'остання сесія: книжку дочитано (з бонусом +' + C.actions.read.finishSoul + ')', kind: 'good' } : { t: '«' + b[0] + '»: сесія ' + n + ' з ' + b[1] + ', дочитана дасть +' + C.actions.read.finishSoul, kind: 'info' });
    }
    if (id === 'friends' && inviteToday(s)) fx.push({ t: inviteWho(inviteToday(s)) + (inviteToday(s).with ? ' самі просяться' : ' сам' + (C.friends.female.includes(inviteToday(s).name) ? 'а' : '') + ' проситься'), kind: 'info' });
    if (id === 'repay' && nextLoan(s)) fx.push({ t: 'борг ' + nDat(nextLoan(s).from) + ' закрито — знову зможе прийти', kind: 'good' });
    if (id === 'loan') { const l = after.loans[after.loans.length - 1]; fx.push({ t: 'у кого — випадково; віддати ' + l.amount + ' ₴ за ' + C.actions.loan.dueIn + ' днів, інакше Стосунки −' + C.actions.loan.late + '; поки винен — не прийде в гості', kind: 'pain' }); fx.push({ t: 'можна ще в ' + (freeFriends(s).length - 1) + ' з ' + s.friendNames.length, kind: 'info' }); }
    if (id === 'board') fx.push({ t: 'прийдуть ' + freeFriends(s).length + ' (кому не винен)', kind: 'info' });
    if (out.borrow) fx.push({ t: 'наперед: завтра ресурс −' + out.borrow + ', шанс загострення вночі +' + Math.round(C.night.exhausted * 100) + '%', kind: 'pain' });
    return out;
  }

  function zoneActions(s, zone) { return ACTION_IDS.filter((id) => ACTIONS[id].zone === zone && (id !== 'repay' || s.loans.length)).map((id) => preview(s, id)); }

  // Календар: що вже відомо на найближчі дні.
  function calendar(s, len) {
    const out = [];
    for (let d = s.day; d < s.day + (len || 5) && d <= s.days; d++) {
      const inv = s.invites[d], ev = [];
      const pay = s.pending.filter((p) => p.day === d).reduce((a, p) => a + p.amount, 0);
      if (pay) ev.push({ t: '+' + pay + '₴', k: 'pay' });
      if (inv && inv.status !== 'cancelled') ev.push({ t: '♥ ' + inviteWho(inv), k: inv.status === 'refused' ? 'inv refused' : 'inv' });
      for (const f of s.future.filter((x) => x.day === d)) ev.push(f.kind === 'relief' ? { t: 'біль −' + f.amount, k: 'good' } : { t: 'відкат +' + f.amount, k: 'bad' });
      if (C.doctor.days.includes(d)) ev.push({ t: 'лікар', k: 'doc' });
      for (const [k, dd] of Object.entries(s.crisis || {})) if (dd === d) ev.push({ t: 'край: ' + SPHERES[k].name, k: 'bad' });
      for (const l of s.loans) if (l.due === d) ev.push({ t: 'борг −' + l.amount + '₴', k: 'bad' });
      if (s.gig && s.gig.day === d) ev.push({ t: 'підробіток', k: 'pay' });
      if (s.bill && s.bill.due === d) ev.push({ t: '−' + s.bill.amount + '₴', k: 'bad' });
      out.push({ day: d, cost: dailyCost(d), events: ev });
    }
    return out;
  }

  // Підказки — лише плани з календаря, словами: що на сьогодні й найближчі дні.
  // Нічого не радимо (ліки, їжа, вправи): гравець пам'ятає сам і стикається з наслідками, коли забув.
  function hints(s) {
    const out = [];
    if (s.lost || s.finished) return out;
    const when = (d) => (d === s.day ? 'Сьогодні' : d === s.day + 1 ? 'Завтра' : 'День ' + d);
    if (s.people <= 0) out.push({ kind: 'bad', t: 'Стосунки на нулі: самотньо — Настрій не піднімається вище ' + C.lonelyCap + '.' });
    if (s.soul <= 0) out.push({ kind: 'bad', t: 'Настрій на нулі: ' + C.apathy.map((id, i) => { const l = ACTIONS[id].label; return i && l !== l.toUpperCase() ? l.toLowerCase() : l; }).join(', ') + ' — зараз не під силу.' });
    for (const [k, d] of Object.entries(s.crisis || {})) out.push({ kind: 'fatal', t: k === 'money'
      ? 'Гроші на нулі: до кінця дня ' + d + ' знайди, чим платити, — інакше виселять.'
      : s[k] > 0 ? SPHERES[k].name + ' вчора було на нулі, зараз ' + s[k] + ': не дай йому знову впасти до нуля цієї ночі, інакше кінець.'
      : SPHERES[k].name + ' на нулі: сьогодні підніми вище нуля, інакше кінець.' });
    for (const d of calendar(s, 4)) {
      const w = when(d.day);
      const inv = s.invites[d.day];
      if (inv && inv.status === 'open') out.push({ kind: 'friends', t: w + ': ' + inviteWho(inv) + (d.day === s.day ? ' ' + inviteVerb(inv, 'хоче', 'хочуть') + ' прийти. Якщо не покличеш — Стосунки −' + C.friends.refuse + '.' : ' ' + inviteVerb(inv, 'пропонує', 'пропонують') + ' зайти.') });
      const pay = s.pending.filter((p) => p.day === d.day).reduce((a, p) => a + p.amount, 0);
      if (pay) out.push({ kind: 'money', t: w + ': надійде оплата за роботу, +' + pay + ' ₴.' });
      for (const f of s.future.filter((x) => x.day === d.day && x.kind === 'relief')) out.push({ kind: 'good', t: w + ': ' + (f.from === 'block' ? 'процедура ще діє' : 'ЛФК ще діє') + ', біль −' + f.amount + '.' });
      if (C.doctor.days.includes(d.day)) out.push({ kind: 'info', t: w + ': увечері прийом у лікаря.' });
      if (s.bill && s.bill.due === d.day) out.push({ kind: 'money', t: w + ': ' + s.bill.name.toLowerCase() + ' — заплатити ' + s.bill.amount + ' ₴ (знімуть уночі).' });
      if (s.gig && s.gig.day === d.day) out.push({ kind: 'money', t: w + ': ' + s.gig.from + ' пропонує підробіток, +' + (s.gig.pay || C.actions.gig.pay) + ' ₴. Не візьмеш — Настрій −' + C.actions.gig.refuse + '.' });
      for (const l of s.loans) if (l.due === d.day) out.push({ kind: 'money', t: w + ': треба віддати борг ' + nDat(l.from) + ', ' + l.amount + ' ₴.' });
      if (d.day > s.day && dailyCost(d.day) > dailyCost(d.day - 1)) out.push({ kind: 'money', t: w + ': витрати на життя зростуть до ' + dailyCost(d.day) + ' ₴ за ніч.' });
    }
    if (!out.length) out.push({ kind: 'info', t: 'Найближчі дні в календарі порожні.' });
    return out;
  }

  function sleepGainText(s) {
    // Відпочинок знімає 1 понад нічне −1, але не нижче мінімуму болю.
    return s.spoons >= C.night.earlyRest && s.extra >= 2 ? 'завтра біль −1' : s.spoons === 0 ? 'шанс загострення вночі +' + Math.round(C.night.exhausted * 100) + '%' : 'без змін';
  }

  function summary(s) {
    const st = s.stats, kept = [], lostItems = [];
    if (st.meetings) kept.push('Зустрічі з друзями: ' + st.meetings);
    if (st.earned) kept.push('Зароблено ' + st.earned + ' ₴');
    if (st.exercise) kept.push('Днів із ЛФК: ' + st.exercise);
    if (st.coursePills) kept.push('Прийнято пігулок: ' + st.coursePills);
    // Лікування: як мінявся мінімум болю від огляду до огляду.
    if (s.doctorVisits.length) {
      const line = 'Мінімум болю: ' + s.baseStart + s.doctorVisits.map((v) => ' → ' + v.after).join('') + (s.doctorVisits.some((v) => v.final) ? ' (фінальний огляд)' : '');
      (s.base < s.baseStart ? kept : s.base > s.baseStart ? lostItems : kept).push(line);
    }
    if (st.songs) kept.push('Пісні: ' + st.songTitles.map((t) => '«' + t + '»').join(', '));
    const read = (s.bookOrder || C.books.map((_, i) => i)).slice(0, s.book.i).map((i) => C.books[i]);
    if (read.length) kept.push('Книжки прочитано: ' + read.map((x) => '«' + x[0] + '»').join(', '));
    kept.push('Наприкінці: ' + s.money + ' ₴, Стосунки ' + s.people + ', Тіло ' + s.body + ', Настрій ' + s.soul + ', біль ' + pain(s));
    if (st.flares) lostItems.push('Загострень: ' + st.flares);
    if (st.strongDays) lostItems.push('Днів у сильному болю: ' + st.strongDays);
    if (st.hospital) lostItems.push('Лікарня: ' + st.hospital + ' р.');
    if (st.invitesRefused) lostItems.push('Відмов друзям: ' + st.invitesRefused);
    if (st.hungry) lostItems.push('Днів без їжі: ' + st.hungry);
    if (st.borrowed) lostItems.push('Ресурсу взято наперед: ' + st.borrowed);
    // Кому так і не віддав — ті друзі вже не прийдуть.
    const lostTo = [...new Set(s.loans.map((l) => l.from))];
    if (lostTo.length) lostItems.push('Втрачено ' + lostTo.length + ' ' + (lostTo.length === 1 ? 'друга' : 'друзів') + ' через борг: ' + lostTo.join(', '));
    if (st.loans) lostItems.push('Позичав у друзів: ' + st.loans + ' р.' + (s.loans.length ? ', не повернуто ' + s.loans.reduce((x, l) => x + l.amount, 0) + ' ₴' : ''));
    if (st.blocks) kept.push('Платних процедур: ' + st.blocks);
    if (st.talkMissed) lostItems.push('Не почув друзів: ' + st.talkMissed + ' р.');
    return { lost: s.lost ? Object.assign({}, s.lost) : null, daysLived: s.lost ? s.lost.day : s.days, days: s.days, kept, lostItems, history: s.history };
  }

  const api = {
    ZONES, ACTIONS, ACTION_IDS, SPHERES, SPHERE_IDS,
    createGame, doAction, endDay, applyTalk, refuseInvite, check, preview, zoneActions,
    gigToday, refuseGig, forecastNight, calendar, hints, summary, sleepGainText, songTitle, bookNow, inviteToday, inviteText, inviteWho, autoTalkKinds, rollHungry, pillPrice,
    pillsInWeek, lfkInWeek, pain, rawPain, stateKey, coverOf, stateOfPain, spoonCost, energyCost: spoonCost, dayPhase, flareChanceTonight, dailyCost, pressureOf, clone,
    setConfig(cfg) { C = cfg; },
    get config() { return C; },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GameLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
