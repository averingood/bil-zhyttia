// Прогін гри без графіки: node sim.js [кількість ігор]
// Мета ядра: виграти не можна (21-й день не переживає ніхто), але добра гра триває помітно довше,
// а сфера, що сиплеться, буває різною.
'use strict';
const L = require('./logic.js');
const C = require('./config.js');

const N = Number(process.argv[2]) || 400;
const ok = (s, id) => L.check(s, id).available;
const free = (s, id) => ok(s, id) && L.spoonCost(s, id) <= s.spoons;   // без позики
const SOFT = ['people', 'body', 'soul'];

// Розважливий: їсть, п'є курс, підтягує найнижчу сферу, не позичає, лишає ложку на себе, коли можна.
function careful(s, opt = {}) {
  if (opt.course !== false && ok(s, 'course') && s.money > 30) return 'course';
  if (opt.loan !== false && ok(s, 'loan') && s.money < L.dailyCost(s.day) * 2 && !s.pending.length) return 'loan';
  if (opt.block && ok(s, 'block') && L.pain(s) >= 7 && s.money > 140) return 'block';
  if (L.inviteToday(s) && free(s, 'friends')) return 'friends';
  if (!s.fed) { if (free(s, 'cook')) return 'cook'; if (ok(s, 'delivery') && s.money > 40) return 'delivery'; }
  // Гроші: скільки днів протримаємось.
  const incoming = s.pending.reduce((a, p) => a + p.amount, 0);
  const runway = (s.money + incoming) / L.dailyCost(s.day);
  const needs = [
    ['money', runway * 1.2],
    ['people', s.people], ['body', s.body + (opt.bodyFirst ? -2 : 0)], ['soul', s.soul],
  ].sort((a, b) => a[1] - b[1]);
  for (const [k] of needs) {
    const id = k === 'money' ? 'work'
      : k === 'people' ? (free(s, 'friends') ? 'friends' : 'text')
      : k === 'body' ? (free(s, 'exercise') ? 'exercise' : 'stretch')
      : (free(s, 'create') ? 'create' : free(s, 'read') ? 'read' : 'games');
    if (free(s, id)) return id;
  }
  if (opt.coffee && ok(s, 'coffee') && s.money > 60) return 'coffee';
  return null;
}

// Не відпочиває: витрачає все й бере наперед.
function greedy(s) { const n = careful(s); if (n) return n; for (const id of ['work', 'exercise', 'friends', 'create']) if (ok(s, id)) return id; return null; }

// Розміреність: лишає 2 ложки на себе, якщо день не критичний.
function paced(s) {
  const n = careful(s);
  if (!n) return null;
  const critical = SOFT.some((k) => s[k] <= 3) || !s.fed || (L.inviteToday(s) && n === 'friends');
  if (!critical && s.spoons - L.spoonCost(s, n) < C.night.earlyRest) return null;
  return n;
}

function random(s) {
  const ids = L.ACTION_IDS.filter((id) => free(s, id));
  if (!ids.length || Math.random() < 0.15) return null;
  return ids[Math.floor(Math.random() * ids.length)];
}

const STRATS = {
  'розважлива': (s) => careful(s),
  'без курсу': (s) => careful(s, { course: false }),
  'тіло понад усе': (s) => careful(s, { bodyFirst: true }),
  'розмірена': paced,
  'жадібна (бере наперед)': greedy,
  'з кавою': (s) => careful(s, { coffee: true }),
  'з процедурою': (s) => careful(s, { block: true }),
  'без позик': (s) => careful(s, { loan: false }),
  'випадкова': random,
};

const SETUPS = {
  'легко (200 ₴, біль 2)': { money: 200, basePain: 2 },
  'за замовч. (160 ₴, біль 4)': {},
  'тяжко (130 ₴, біль 5)': { money: 130, basePain: 5 },
};

function play(strat, setup, seed) {
  const s = L.createGame(Object.assign({ seed }, setup));
  while (!s.lost && !s.finished) {
    let guard = 0;
    while (guard++ < 12) { const id = strat(s); if (!id || !L.doAction(s, id).ok) break; }
    L.endDay(s);
  }
  return s;
}

module.exports = { STRATS, SETUPS, play };
if (require.main === module) for (const [sn, setup] of Object.entries(SETUPS)) {
  console.log(`\n=== ${sn}: ${N} ігор ===`);
  console.log('стратегія'.padEnd(24), 'дожили', 'медіана', 'мін–макс', '  гроші/люди/тіло/душа');
  for (const [name, strat] of Object.entries(STRATS)) {
    const days = [], by = { money: 0, people: 0, body: 0, soul: 0 }; let fin = 0;
    for (let i = 0; i < N; i++) {
      const s = play(strat, setup, 1000 + i);
      if (s.lost) { days.push(s.lost.day); by[s.lost.sphere]++; } else { fin++; days.push(C.days + 1); }
    }
    days.sort((a, b) => a - b);
    const pct = (v) => Math.round((100 * v) / N) + '%';
    console.log(name.padEnd(24), pct(fin).padEnd(6), String(days[N >> 1]).padEnd(7), (days[0] + '–' + days[N - 1]).padEnd(9),
      ' ', [by.money, by.people, by.body, by.soul].map(pct).join('/'));
  }
}
