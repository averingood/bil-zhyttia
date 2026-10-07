// Прогін гри без графіки: node sim.js [кількість ігор] [днів]
// Кілька простих стратегій грають на однакових зернах, щоб побачити,
// чи не виграє одна стратегія завжди і чи не скочується гра в спіраль.
'use strict';
const L = require('./logic.js');
const C = require('./config.js');

const N = Number(process.argv[2]) || 500;
const DAYS = Number(process.argv[3]) || C.days;

const can = (s, id) => L.check(s, id).available && L.energyCost(s, id) <= s.energy;
const ok = (s, id) => L.check(s, id).available;

function deadlinePressure(s) {
  let dl = s.day;
  while (dl % C.work.deadlineEvery !== 0) dl++;
  const left = C.work.unitsPerDeadline - s.workWeek;
  return left / Math.max(1, dl - s.day + 1);
}

// Розважлива: не позичає, їсть, тримає дедлайн, відповідає друзям.
function careful(s, opt = {}) {
  if (!s.fed && can(s, 'cook')) return 'cook';
  if (opt.meds != null && ok(s, 'meds') && s.medsToday === 0 && s.money > 90 && L.pain(s) >= opt.meds) return 'meds';
  if (L.inviteToday(s) && can(s, 'friends')) return 'friends';
  if (deadlinePressure(s) >= 0.9 && can(s, 'work')) return 'work';
  // Гравець, що слухається підказки «без вправ уже 2 дн.», поки м'язи не задубіли.
  if (opt.antiDetrain && (s.daysNoExercise || 0) >= C.night.detrain.afterDays - 1 && L.stateKey(s) !== 'strong' && can(s, 'exercise')) return 'exercise';
  if (s.joy < 40 && can(s, 'friends')) return 'friends';
  if (s.joy < 55 && can(s, 'create')) return 'create';
  if (opt.exercise === true && L.stateKey(s) !== 'strong' && can(s, 'exercise')) return 'exercise';
  // Тренування має сенс, коли −1 завтра перекидає біль через межу стану.
  if (opt.exercise === 'smart' && can(s, 'exercise')) {
    const fc = L.forecastNight(s);
    if (fc && (fc.pain === 4 || fc.pain === 7 || s.trainings % C.night.trainingsPerBaseDrop === 4)) return 'exercise';
  }
  if (deadlinePressure(s) > 0 && can(s, 'work')) return 'work';
  if (can(s, 'create')) return 'create';
  if (ok(s, 'rest') && s.energy === 0) return 'rest';
  if (L.pain(s) >= 6 && can(s, 'stretch')) return 'stretch';
  if (!s.fed && ok(s, 'delivery') && s.money > 70) return 'delivery';
  return null;
}

// Жадібна: використовує всі 4 слоти, позичає, багато працює.
function greedy(s) {
  if (!s.fed && ok(s, 'cook')) return 'cook';
  if (L.inviteToday(s) && ok(s, 'friends')) return 'friends';
  if (s.joy < 35 && ok(s, 'friends')) return 'friends';
  if (ok(s, 'work')) return 'work';
  return null;
}

function random(s) {
  const ids = L.ACTION_IDS.filter((id) => ok(s, id));
  if (!ids.length || Math.random() < 0.1) return null;
  return ids[Math.floor(Math.random() * ids.length)];
}

const STRATS = {
  'розважлива': (s) => careful(s),
  '+вправи завжди': (s) => careful(s, { exercise: true }),
  '+вправи з розумом': (s) => careful(s, { exercise: 'smart' }),
  '+вправи проти задубіння': (s) => careful(s, { antiDetrain: true }),
  '+ліки при болю≥6': (s) => careful(s, { meds: 6 }),
  '+ліки щодня': (s) => careful(s, { meds: 0 }),
  // Знеболювальне перед роботою, якщо воно переводить біль у легший стан.
  '+ліки перед роботою': (s) => {
    const next = careful(s);
    if (next === 'work' && ok(s, 'meds') && s.medsToday === 0 && s.money > 60 &&
      L.stateOfPain(Math.max(0, L.pain(s) - C.actions.meds.reliefToday)) !== L.stateKey(s)) return 'meds';
    return next;
  },
  // Кава замість відпочинку: та сама сила, але слот лишається на справу.
  '+кава замість відпочинку': (s) => {
    const next = careful(s);
    if (next === 'rest' && ok(s, 'coffee')) return 'coffee';
    return next;
  },
  // Кава, щоб устигнути ще роботу.
  '+кава для роботи': (s) => {
    const next = careful(s);
    if (next !== 'work' && next !== 'cook' && ok(s, 'coffee') && ok(s, 'work') && s.energy < L.energyCost(s, 'work') &&
      s.energy + C.actions.coffee.gain >= L.energyCost(s, 'work')) return 'coffee';
    return next;
  },
  // Раніше спати, коли тимчасового болю 2+, а їжа вже є.
  '+раніше спати': (s) => {
    const next = careful(s);
    if (s.fed && ok(s, 'sleep') && s.extra >= 2 && next !== 'friends' && next !== 'work') return 'sleep';
    return next;
  },
  'жадібна': greedy,
  'випадкова': random,
};

function play(strat, diff, seed, days) {
  const s = L.createGame({ difficulty: diff, seed, days: days || DAYS });
  while (!s.lost && !s.finished) {
    let guard = 0;
    while (s.slot < L.slotsOf(s) && guard++ < 10) {
      const id = strat(s);
      if (!id) break;
      if (!L.doAction(s, id).ok || s.lost) break;
    }
    if (s.lost) break;
    L.endDay(s);
  }
  return s;
}

const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0) + '%';
const avg = (arr) => (arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '—');

module.exports = { STRATS, play };
if (require.main === module) for (const diff of Object.keys(C.difficulty)) {
  console.log(`\n=== ${C.difficulty[diff].name} (база ${C.difficulty[diff].basePain}), ${DAYS} днів, ${N} ігор ===`);
  console.log('стратегія'.padEnd(18), 'дожили'.padEnd(7), 'радість/гроші/лікарня'.padEnd(19),
    'день пр.'.padEnd(9), 'гроші', ' радість', ' сильн.дні', ' позич.', ' відмов', ' дедл.проп');
  for (const [name, strat] of Object.entries(STRATS)) {
    const games = [];
    for (let i = 0; i < N; i++) games.push(play(strat, diff, 1000 + i));
    const alive = games.filter((g) => !g.lost);
    const lost = games.filter((g) => g.lost);
    const by = (c) => lost.filter((g) => g.lost.cause === c).length;
    console.log(
      name.padEnd(18),
      pct(alive.length, N).padEnd(7),
      `${pct(by('joy'), N)}/${pct(by('money'), N)}/${avg(games.map((g) => g.stats.hospital))}`.padEnd(19),
      String(avg(lost.map((g) => g.lost.day))).padEnd(9),
      String(avg(alive.map((g) => g.money))).padStart(5),
      String(avg(alive.map((g) => g.joy))).padStart(8),
      String(avg(games.map((g) => g.stats.stateDays.strong))).padStart(10),
      String(avg(games.map((g) => g.stats.borrowed))).padStart(7),
      String(avg(games.map((g) => g.stats.invitesRefused))).padStart(7),
      String(avg(games.map((g) => g.stats.deadlinesMissed))).padStart(9),
    );
  }
}
