// Усі числа балансу. Логіка читає їх звідси й нічого не вигадує сама,
// тож після прогонів правиться лише цей файл.
(function (root) {
  'use strict';

  const CONFIG = {
    days: 14,
    dayOptions: [14, 30],
    // Скільки дій за день, залежить від ранкового болю (див. states.*.slots).
    // Назви частин дня — під кожну кількість слотів, щоб день ішов від ранку до вечора.
    slotNames: {
      3: ['Ранок', 'День', 'Вечір'],
      4: ['Ранок', 'День', 'Пообіддя', 'Вечір'],
      5: ['Ранок', 'Обід', 'День', 'Пообіддя', 'Вечір'],
      6: ['Ранок', 'Пізній ранок', 'Обід', 'Пообіддя', 'Надвечір’я', 'Вечір'],
    },
    painMax: 10,

    // Головна таблиця: стан болю визначає майже все.
    states: {
      light: {
        name: 'Легкий', min: 0, max: 3,
        energy: 7, slots: 6, cookCost: 1,
        joyMult: 1.0, joyDaily: -1, hintsVisible: true,
      },
      medium: {
        name: 'Помітний', min: 4, max: 6,
        energy: 5, slots: 4, cookCost: 2,
        joyMult: 0.7, joyDaily: -3, hintsVisible: true,
      },
      strong: {
        name: 'Сильний', min: 7, max: 10,
        energy: 3, slots: 3, cookCost: null, // null = готувати недоступно
        joyMult: 0.4, joyDaily: -6, hintsVisible: false,
      },
    },

    start: { money: 170, joy: 60, extraPain: 0 },   // +20 відтоді, як прибирання забирає слоти

    difficulty: {
      easy:   { name: 'Легше',    basePain: 3, flareChance: 0.05 },
      normal: { name: 'Середньо', basePain: 5, flareChance: 0.08 },
      hard:   { name: 'Тяжко',    basePain: 7, flareChance: 0.12 },
    },

    actions: {
      work:     { energy: 2, payDelay: 3 },
      create:   { energy: 1, joy: 6, streakBonus: 1, streakMax: 4 },
      friends:  { energy: 2, inviteEnergy: 1, joy: 10 },   // прийняти тих, хто сам просився, легше, ніж кликати
      // Вправи окупаються завтра, розтяжка допомагає одразу.
      exercise: { energy: 2, reliefTomorrow: 1, perDay: 1,
        // Килимок від першої особи: повтор рухів за тренером. Кожен правильний рух — у залік,
        // помилки не караються. Третина рухів — день до бази, дві третини — ще й −1 на завтра.
        // Біль накриває щонайбільше одну стрілку в серії, коротким спалахом.
        mat: { series: [3, 4], step: 0.75, grow: 0.25, baseShare: 1 / 3, reliefShare: 2 / 3,
          spike: { light: 0.3, medium: 0.5, strong: 0.7 } } },
      stretch:  { energy: 1, reliefToday: 1 },
      cook:     { money: 5 },               // сили беруться з таблиці станів
      delivery: { energy: 0, money: 18 },
      // Знеболювальне: біль сьогодні −3. Побічна дія — туман: бриф на роботі розмитий.
      meds:     { energy: 0, reliefToday: 3, money: 12, perDay: 1, freeSlot: true },   // ковтнути пігулку — не справа на пів дня
      rest:     { energy: 0, gain: 1, perDay: 1 },
      // Лягти раніше: решта дня згорає, зате вночі тимчасовий біль спадає швидше.
      sleep:    { energy: 0, extraDrift: 1 },
      // Читання відволікає від болю: трохи радості й −1 біль до ночі. Книжка — кілька сесій,
      // дочитана дає більшу радість. З болем 7+ рядки розпливаються.
      read:     { energy: 1, joy: 3, reliefToday: 1, maxPain: 6, perDay: 1, finishJoy: 12 },
      // Прибирання: скидає безлад, трохи радості від порядку.
      clean:    { energy: 2, joy: 3 },
      // Кава: сила зараз, розплата вночі — шанс загострення росте з кожною чашкою. Слота не займає.
      coffee:   { energy: 0, gain: 1, perDay: 2, flareAdd: 0.08, freeSlot: true },
    },

    night: {
      painDrift: 1,          // на скільки біль повертається до бази за ніч
      borrowPain: 1,         // біль завтра за кожну позичену одиницю
      hungerEnergyPenalty: 1,
      trainingsPerBaseDrop: 5,
      minBasePain: 1,
      flarePain: 2,
      // Без вправ м'язи дубіють: з третього дня поспіль щоночі тимчасовий +1,
      // а кожен тиждень без вправ забирає день прогресу до бази.
      detrain: { afterDays: 3, pain: 1, rollbackEvery: 7 },
      // Лягти з болем 7+ — ризик безсоння: зранку на силу менше. Рано лягти — ризик менший.
      badNight: { minPain: 7, chance: 0.35, earlyChance: 0.15, energy: 1 },
    },
    // Книжки на полиці: назва і скільки сесій читання.
    books: [['Тигролови', 3], ['Intermezzo', 3], ['Місто', 4], ['Сад Гетсиманський', 4], ['Лісова пісня', 3],
      ['Кайдашева сім’я', 4], ['Чорна рада', 4], ['Маруся Чурай', 3]],
    // Хатні справи: безлад росте щодня (і від готування та гостей), з порогів псує радість.
    chores: { startMess: 1, perDay: 1, cookAdd: 0, guestsAdd: 1, annoyAt: 6, annoyJoy: -2, badAt: 9, badJoy: -4, max: 10 },
    // Кілька днів без зустрічей — радість тане швидше.
    lonely: { afterDays: 4, joy: -3 },

    joy: {
      max: 100,
      creativityOffBelow: 20,
      creativityOnAbove: 30,
      refuseInvite: -6,
      borrowPenalty: 3,      // перевтома: радість за кожну позичену силу
      adaptTo: 40,           // до цього рівня радість щоночі трохи повертається (звикання)
      adaptRate: 0.15,       // частка відстані до adaptTo, яку радість проходить за ніч
      repeatMult: 0.5,       // множник для повторної творчості чи друзів у той самий день
    },

    work: {
      // Одна робота — планерка: директорка двічі питає про деталь зі своєї фрази.
      meeting: {
        questions: 2,
        answerSeconds: 7,
        payRight: 17,          // правильна відповідь
        payWrong: -5,          // хибна відповідь або мовчання — штраф одразу
        payRepeat: 8,          // правильно після «повтори, будь ласка»
      },
      deadlineEvery: 7,
      unitsPerDeadline: 5,   // звичайний графік 5/7
      missesForPartTime: 2,
      partTimeMult: 0.6,
    },

    rent: { every: 7, amount: 100 },

    // Біль 10 — не кінець гри, а швидка і лікарня.
    hospital: { days: 2, cost: 60, joy: -10, extraAfter: 1 },

    // Біль на ключовому слові: як часто ядро накриває те, що треба почути (планерка й розмови).
    painCover: { light: 0, medium: 0.55, strong: 0.92 },
    // Без міні-ігор (симуляція або вимкнено): влучання, якщо почув, і якщо біль закрив слово.
    heardAccuracy: 0.95,
    coveredAccuracy: 0.4,

    friends: {
      // Розмова під час візиту: друг розповідає новину, ти реагуєш.
      talk: {
        topics: 2,
        answerSeconds: 7,
        joy: { right: 3, meh: 0, wrong: -3, silent: -2 },
        warmth: { right: 1, wrong: -1, silent: -1, min: -5, max: 3 },
        warmthInvite: 0.03,    // кожен пункт «теплоти» — плюс/мінус до шансу запрошення
      },
      // Шанс щоночі отримати нову пропозицію залежить від зустрічей за тиждень.
      inviteBase: 0.12,
      invitePerMeeting: 0.07,
      inviteMax: 0.5,
      leadDays: 3,           // за скільки днів пропозиція з'являється в календарі
      lookback: 7,
      initialMeetings: 2,    // наче до початку гри вже були зустрічі
      names: ['Оля', 'Марко', 'Ірина', 'Тарас', 'Соня', 'Дмитро'],
      // food: гості приносять їжу — того дня їсти вже не треба.
      inviteLines: [
        { text: 'Можна до тебе сьогодні?' },
        { text: 'Ми з піцою. Відчиниш?', food: 'піцу' },
        { text: 'Давно не бачились. Заскочу ввечері?' },
        { text: 'Є настрій на настолки. Ти як?' },
        { text: 'Наварила борщу, занесу тобі?', food: 'борщ' },
      ],
      refusalLines: [
        'Ти ж учора був у порядку.',
        'Знову? Ну, як знаєш.',
        'Ми вже й торт купили…',
        'Гаразд. Напиши, коли зможеш.',
        'Може, наступного разу.',
        'Ти останнім часом зовсім зник.',
      ],
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
  else root.GAME_CONFIG = CONFIG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
