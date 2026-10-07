// «Ложки»: прототип ядра. Одна валюта (ложки), біль як погода, чотири сфери, що самі тануть.
// Виграти не можна: тіло з часом слабшає, і рано чи пізно одна зі сфер сиплеться.
// Питання гри — яка і коли.
(function (root) {
  'use strict';

  const R = {
    days: 21,
    start: { money: 6, people: 6, body: 6, soul: 6, pain: 4 },
    max: 10,
    // Біль зранку: базовий + тимчасовий. Базовий з часом росте — це і робить програш неминучим.
    baseRise: [6, 11, 16],          // у ці дні базовий +1
    flare: { chance: 0.2, pain: 2, bodyGoodMult: 0.5 },
    drift: 1,                        // тимчасовий спадає на стільки за ніч
    // Тиск життя: щоночі кожна сфера −1, а ще pressure(day) випадкових сфер — ще −1.
    pressure: (d) => Math.floor((d - 1) / 3),
    // Ложки від болю: що сильніше болить, то менше.
    spoons: (p) => (p <= 2 ? 6 : p <= 4 ? 5 : p <= 6 ? 4 : p <= 8 ? 3 : 2),
    // Зв'язки між сферами — по одному на сферу.
    links: {
      moneyLow: 2,      // гроші ≤ — тіло −1 щоночі (ні ліків, ні нормальної їжі)
      peopleHigh: 6,    // люди ≥ — у день з ≤3 ложками друг підхоплює: +1 ложка
      bodyLow: 3,       // тіло ≤ — завтра біль +1
      bodyHigh: 7,      // тіло ≥ — загострення вдвічі рідше
      soulHigh: 7,      // душа ≥ — +1 ложка зранку
      soulLow: 2,       // душа ≤ — −1 ложка зранку
    },
  };

  const SPHERES = {
    money:  { name: 'Гроші', icon: '₴', fall: 'Гроші скінчилися' },
    people: { name: 'Люди', icon: '♥', fall: 'Люди відвернулися' },
    body:   { name: 'Тіло', icon: '✚', fall: 'Тіло здалося' },
    soul:   { name: 'Душа', icon: '♪', fall: 'Душа згасла' },
  };

  // Дії: вартість у ложках і віддача; біль б'є по кожній сфері по-своєму.
  // gain(p) — скільки піднімає сферу при болю p; cost(p) — ложки; blocked(p) — причина, якщо не можна.
  const ACTIONS = [
    { id: 'work', sphere: 'money', name: 'Працювати', cost: () => 2,
      gain: (p) => (p >= 8 ? 1 : p >= 6 ? 2 : 3), why: 'з болем важко зосередитись — заробляєш менше' },
    { id: 'gig', sphere: 'money', name: 'Дрібна підробітка', cost: () => 1, gain: () => 1 },
    { id: 'meet', sphere: 'people', name: 'Зустрітися', cost: () => 2,
      gain: (p) => (p >= 7 ? 1 : p >= 5 ? 2 : 3), why: 'з болем ти «не тут» — зустріч дає менше' },
    { id: 'text', sphere: 'people', name: 'Написати другові', cost: () => 1, gain: () => 1 },
    { id: 'exercise', sphere: 'body', name: 'Вправи', cost: (p) => (p >= 7 ? 3 : 2),
      gain: () => 2, painTomorrow: -1, why: 'з болем вправи дорожчі, але найпотрібніші' },
    { id: 'meds', sphere: 'body', name: 'Ліки', cost: () => 0, gain: () => 1, money: -1, painToday: -2, perDay: 1 },
    { id: 'create', sphere: 'soul', name: 'Писати пісню', cost: () => 2, gain: () => 3,
      blocked: (p) => (p >= 7 ? 'з болем 7+ не пишеться' : null), why: 'сильний біль глушить творчість' },
    { id: 'rest', sphere: 'soul', name: 'Почитати, відпочити', cost: () => 1, gain: () => 1 },
  ];

  function mulberry(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const clamp = (v) => Math.max(0, Math.min(R.max, v));

  function create(seed) {
    const s = {
      day: 1, rnd: mulberry(seed != null ? seed : Math.floor(Math.random() * 2 ** 31)),
      base: R.start.pain, extra: 0, relief: 0,
      money: R.start.money, people: R.start.people, body: R.start.body, soul: R.start.soul,
      spoons: 0, spoonsMorning: 0, used: {}, log: [], history: [], lost: null, painTomorrow: 0,
    };
    morning(s, []);
    return s;
  }

  const pain = (s) => Math.max(1, Math.min(10, s.base + s.extra - s.relief));

  function morning(s, ev) {
    s.relief = 0; s.used = {};
    const L = R.links;
    let sp = R.spoons(pain(s));
    if (s.soul >= L.soulHigh) { sp++; ev.push('Душа на місці: +1 ложка'); }
    if (s.soul <= L.soulLow) { sp--; ev.push('На душі порожньо: −1 ложка'); }
    if (sp <= 3 && s.people >= L.peopleHigh) { sp++; ev.push('Друг підхопив у поганий день: +1 ложка'); }
    s.spoons = s.spoonsMorning = Math.max(1, sp);
    s.history.push({ day: s.day, pain: pain(s), money: s.money, people: s.people, body: s.body, soul: s.soul, spoons: s.spoons });
  }

  function check(s, a) {
    if (s.lost) return 'гра скінчилась';
    const p = pain(s);
    if (a.blocked && a.blocked(p)) return a.blocked(p);
    if (a.perDay && (s.used[a.id] || 0) >= a.perDay) return 'сьогодні вже було';
    if (a.money && s.money + a.money < 0) return 'немає грошей';
    if (a.cost(p) > s.spoons) return 'не вистачає ложок';
    return null;
  }

  function act(s, id) {
    const a = ACTIONS.find((x) => x.id === id);
    if (check(s, a)) return null;
    const p = pain(s);
    s.spoons -= a.cost(p);
    const g = a.gain(p);
    s[a.sphere] = clamp(s[a.sphere] + g);
    if (a.money) s.money = clamp(s.money + a.money);
    if (a.painToday) s.relief += -a.painToday;
    if (a.painTomorrow) s.painTomorrow += a.painTomorrow;
    s.used[a.id] = (s.used[a.id] || 0) + 1;
    return { gain: g };
  }

  // Ніч: усі сфери тануть, зв'язки, біль на завтра. Повертає події ночі.
  function endDay(s) {
    if (s.lost) return [];
    const ev = [], L = R.links;
    for (const k of Object.keys(SPHERES)) s[k] = clamp(s[k] - 1);
    {
      // Більше за чотири — ідемо по колу: деякі сфери отримують ще −1.
      let keys = [], n = R.pressure(s.day);
      for (let i = 0; i < n; i++) {
        if (!keys.length) keys = Object.keys(SPHERES);
        const k = keys.splice(Math.floor(s.rnd() * keys.length), 1)[0]; s[k] = clamp(s[k] - 1);
      }
      if (n) ev.push('Життя тисне: ще −1 у ' + n + (n === 1 ? ' сфері' : ' сферах'));
    }
    if (s.money <= L.moneyLow) { s.body = clamp(s.body - 1); ev.push('Грошей обмаль — ні ліків, ні нормальної їжі: тіло −1'); }
    // Біль на завтра.
    s.extra = Math.max(0, s.extra - R.drift) + s.painTomorrow;
    s.extra = Math.max(-2, s.extra);
    s.painTomorrow = 0;
    if (s.body <= L.bodyLow) { s.extra += 1; ev.push('Тіло слабке: завтра біль +1'); }
    const fc = R.flare.chance * (s.body >= L.bodyHigh ? R.flare.bodyGoodMult : 1);
    if (s.rnd() < fc) { s.extra += R.flare.pain; ev.push('Загострення вночі: біль +' + R.flare.pain); }
    s.day++;
    if (R.baseRise.includes(s.day)) { s.base++; ev.push('Тіло з часом здає: базовий біль +1 (тепер ' + s.base + ')'); }
    // Сфера на нулі — посипалась.
    const fallen = Object.keys(SPHERES).find((k) => s[k] <= 0);
    if (fallen) s.lost = { sphere: fallen, day: s.day - 1 };
    else if (s.day > R.days) s.lost = { sphere: null, day: R.days };
    if (!s.lost) morning(s, ev);
    s.log.push({ day: s.day - 1, ev });
    return ev;
  }

  const api = { R, SPHERES, ACTIONS, create, pain, check, act, endDay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Spoons = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
