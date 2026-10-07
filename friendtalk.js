// Розмова з друзями від першої особи: друг розповідає новину, ти реагуєш.
// Біль може накрити саме те слово, з якого зрозуміло, добра це новина чи погана.
// Про правила гри не знає: повертає, як ти реагував на кожну тему.
(function (root) {
  'use strict';
  const C = root.GAME_CONFIG;
  const W = 412, H = 344, LW = 206, LH = 172;
  const CPS = 24;
  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rnd(a.length)];
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let g = null;   // контекст поточної сцени — його використовують функції малювання нижче

  // ---------- друзі ----------
  const FRIENDS = {
    'Оля':    { f: true,  H: '#b8502f', S: '#ecc09c', G: '#3fa3c4' },
    'Марко':  { f: false, H: '#1d1a1f', S: '#d9a47e', G: '#8fd16a' },
    'Ірина':  { f: true,  H: '#e8c25a', S: '#f0c8a8', G: '#a77fd6' },
    'Тарас':  { f: false, H: '#6b4a2a', S: '#e0ac84', G: '#d9dde8' },
    'Соня':   { f: true,  H: '#1d1a1f', S: '#a8754f', G: '#e07a9a' },
    'Дмитро': { f: false, H: '#e8c25a', S: '#e8b892', G: '#6f8fe0' },
  };
  const NAMES = Object.keys(FRIENDS);
  // Слово за родом друга: g('чекала', 'чекав').
  const gen = (name) => (fem, masc) => (FRIENDS[name].f ? fem : masc);

  // ---------- теми ----------
  // Кожна тема має добрий і поганий варіант; різниця — лише в кількох словах (ключ).
  // Ключ стоїть у різних місцях фрази: біль накриває середину, тож іноді його видно збоку.
  const T2 = (good, gk, bad, bk) => () => pick([{ good: true, text: good, key: gk }, { good: false, text: bad, key: bk }]);
  const TOPICS = [
    (g) => pick([
      { good: true, text: 'Мене нарешті взяли на ту роботу, про яку я ' + g('розповідала', 'розповідав') + '!', key: 'нарешті взяли' },
      { good: false, text: 'Мене все-таки не взяли на ту роботу, про яку я ' + g('розповідала', 'розповідав') + '.', key: 'все-таки не взяли' },
    ]),
    T2('Ми знайшли квартиру біля парку, переїжджаємо вже в суботу!', 'знайшли квартиру',
      'Нас виселяють з квартири до кінця місяця, треба шукати нову.', 'виселяють з квартири'),
    T2('Кіт нарешті одужав, ветеринар каже, що все позаду.', 'нарешті одужав',
      'Кіт знову захворів, ветеринар каже, що це надовго.', 'знову захворів'),
    (g) => pick([
      { good: true, text: 'Я ' + g('склала', 'склав') + ' той іспит з першого разу!', key: g('склала', 'склав') },
      { good: false, text: 'Я ' + g('завалила', 'завалив') + ' той іспит, доведеться перескладати.', key: g('завалила', 'завалив') },
    ]),
    T2('Квитки до моря вже куплені, їдемо через два тижні!', 'вже куплені',
      'Поїздку до моря скасували, гроші повернуть не скоро.', 'скасували'),
    T2('Сестра народила здорового сина, вчора їх виписали!', 'народила здорового сина',
      'Сестру поклали в лікарню, лікарі поки нічого не кажуть.', 'поклали в лікарню'),
    T2('Мене підвищили, тепер я керую цілим відділом!', 'підвищили',
      'Мене понизили, тепер я знову простий менеджер.', 'понизили'),
    T2('Ремонт нарешті закінчився, я вже готую на новій кухні!', 'нарешті закінчився',
      'Ремонт знову затягнувся, майстри зникли разом із грошима.', 'зникли разом із грошима'),
    T2('Ми з Тарасом помирилися, вже тиждень жодної сварки.', 'помирилися',
      'Ми з Тарасом розійшлися, я досі не можу в це повірити.', 'розійшлися'),
    T2('Мій велосипед знайшли, вчора подзвонили з поліції!', 'знайшли',
      'Мій велосипед вкрали просто з-під під’їзду.', 'вкрали'),
    T2('Мама пройшла обстеження, лікар каже, що все чисто.', 'все чисто',
      'Мама пройшла обстеження, лікар каже, що потрібна операція.', 'потрібна операція'),
    T2('Мою книжку взяли у видавництво, вона вийде навесні!', 'взяли у видавництво',
      'Видавництво відмовило мені вже втретє, рукопис знову в шухляді.', 'відмовило мені вже втретє'),
    (g) => pick([
      { good: true, text: 'Я нарешті ' + g('здала', 'здав') + ' на права, з першої спроби!', key: 'з першої спроби' },
      { good: false, text: 'Я знову не ' + g('здала', 'здав') + ' на права, це вже четверта спроба.', key: 'знову не ' + g('здала', 'здав') },
    ]),
    T2('Нам схвалили іпотеку, з’їжджаємо від батьків!', 'схвалили іпотеку',
      'Нам відмовили в іпотеці, далі живемо з батьками.', 'відмовили в іпотеці'),
    T2('Мій грант схвалили, цілий рік можу займатися своїм проєктом.', 'грант схвалили',
      'Мій грант не схвалили, проєкт доведеться закрити.', 'не схвалили'),
    T2('Собака з притулку нарешті почав їсти й гратися, ожив зовсім!', 'почав їсти й гратися',
      'Собаку з притулку довелося повернути, він кидався на дітей.', 'довелося повернути'),
    T2('Бабуся переїхала ближче до нас, тепер бачимося щонеділі.', 'переїхала ближче',
      'Бабуся впала вдома і зламала стегно, тепер лежить.', 'зламала стегно'),
    (g) => pick([
      { good: true, text: 'Я ' + g('виграла', 'виграв') + ' конкурс фотографій, мою роботу повісять у галереї!', key: g('виграла', 'виграв') + ' конкурс' },
      { good: false, text: 'Я ' + g('програла', 'програв') + ' конкурс, журі навіть не подивилося мої роботи.', key: g('програла', 'програв') + ' конкурс' },
    ]),
    T2('Брата нарешті відпустили у відпустку, він уже вдома!', 'відпустили у відпустку',
      'Брат знову поїхав на схід, цього разу надовго.', 'знову поїхав'),
    T2('Ми зібрали всю суму на операцію для Даринки!', 'зібрали всю суму',
      'Нам досі бракує половини суми на операцію для Даринки.', 'бракує половини'),
    T2('Моя мігрень нарешті минула, вже місяць без нападів.', 'нарешті минула',
      'Моя мігрень повернулася, знову щодня лежу в темряві.', 'повернулася'),
    T2('Мене прийняли на магістратуру за кордоном, з вересня їду!', 'прийняли',
      'Мене не прийняли на магістратуру, вже вдруге поспіль.', 'не прийняли'),
    T2('Сусіди-гуляки нарешті з’їхали, вночі тепер тиша.', 'нарешті з’їхали',
      'Сусіди почали ремонт, свердлять щодня з восьмої ранку.', 'почали ремонт'),
    T2('Наш маленький бізнес отримав інвестиції, наймаємо людей!', 'отримав інвестиції',
      'Наш маленький бізнес закрився, гроші просто скінчилися.', 'закрився'),
    (g) => pick([
      { good: true, text: 'Я ' + g('пробігла', 'пробіг') + ' свій перший марафон до самого кінця!', key: g('пробігла', 'пробіг') },
      { good: false, text: 'Я ' + g('зійшла', 'зійшов') + ' з марафону на двадцятому кілометрі, коліно не витримало.', key: g('зійшла', 'зійшов') + ' з марафону' },
    ]),
  ];
  // Реакції: влучна (тон), загальна (безпечно, але порожньо), хибна (протилежний тон).
  function replies(t, g) {
    const goodR = pick(['Вітаю! Ти ж так цього ' + g('чекала', 'чекав') + '!', 'Оце новина! Дуже за тебе радий.', 'Нарешті! Треба відсвяткувати.',
      'Як класно! Ти це ' + g('заслужила', 'заслужив') + '.', 'Ура! Я знав, що все вийде.', 'Це ж чудово! Розкажи все по порядку.',
      'Нарешті хороші новини, я такий радий!', 'Неймовірно! Ти молодець.', 'Ох, як я за тебе радий!', 'Оце так! Треба відзначити.',
      'Ти ж про це ' + g('мріяла', 'мріяв') + '!', 'Супер! І як ти почуваєшся?', 'Яка гарна новина! Обіймаю.',
      'Ну нарешті! Я тримав за тебе кулаки.', 'Клас! Аж настрій піднявся.']);
    const badR = pick(['Ох, шкода… Як ти це переносиш?', 'Мені дуже прикро. Можу чимось допомогти?', 'Це неприємно. Тримайся, я поруч.',
      'Ох… Це дуже важко. Як ти?', 'Мені так шкода. Хочеш про це поговорити?', 'Жах… Чим тобі допомогти?', 'Співчуваю. Це несправедливо.',
      'Мені дуже жаль. Ти не ' + g('сама', 'сам') + '.', 'Розумію, це болить. Я з тобою.', 'Як прикро… Скажи, якщо щось треба.',
      'Ой… Тримайся, будь ласка.', 'Мені шкода. Як ти тримаєшся?', 'Це жахливо. Обіймаю тебе.',
      'Ох, ні. Давно ти ' + g('дізналася', 'дізнався') + '?', 'Важко таке чути. Я поруч, якщо що.']);
    const meh = pick(['Ого. І що тепер?', 'Зрозумів. І як ти?', 'Ясно. Розкажи ще.', 'Он воно як.', 'І що ти думаєш?',
      'Ну, буває всяке.', 'Хм. А далі що?', 'Зрозуміло. І як воно?', 'Цікаво. А ти як до цього?', 'Ага. І що робитимеш?',
      'Отакої. Ну, побачимо.', 'Он як. Розкажи детальніше.', 'Ну ясно. А решта як?', 'Почув. І як тобі з цим?', 'Ого. Не чекав.']);
    return shuffle([
      { t: t.good ? goodR : badR, kind: 'right' },
      { t: meh, kind: 'meh' },
      { t: t.good ? badR : goodR, kind: 'wrong' },
    ]);
  }
  // Запрошення з деталлю: тут ключ — час.
  const INVITES = [
    (day, key) => 'У ' + day + ' в мене день народження, приходь ' + key + ', будуть тільки свої.',
    (day, key) => 'У ' + day + ' граємо в мене в настолки, починаємо ' + key + ', приходь!',
    (day, key) => 'У ' + day + ' йдемо в кіно на прем’єру, сеанс ' + key + ', підеш з нами?',
    (day, key) => 'У ' + day + ' в нашого друга концерт у клубі, починається ' + key + ', приходь послухати!',
    (day, key) => 'У ' + day + ' я готую велику вечерю, збираємося ' + key + ', чекаю тебе.',
  ];
  function inviteTopic(g) {
    const HOURS = ['п’ятій', 'шостій', 'сьомій', 'восьмій', 'дев’ятій'];
    const day = pick(['суботу', 'неділю', 'п’ятницю', 'четвер', 'середу']), h = pick(HOURS);
    const other = pick(HOURS.filter((x) => x !== h));
    const key = 'о ' + h;
    return {
      text: pick(INVITES)(day, key), key, invite: true,
      opts: shuffle([
        { t: pick(['Буду ' + key + ', обіцяю!', 'Домовились, ' + key + '!', 'Записав: ' + key + '.', 'Прийду ' + key + ', дякую!', 'Чудово, буду ' + key + '.']), kind: 'right' },
        { t: pick(['Подивлюсь, як почуватимусь.', 'Спробую, але не обіцяю.', 'Як буде сила, то прийду.', 'Я ще не знаю, як буде.', 'Може, прийду, побачимо.']), kind: 'meh' },
        { t: pick(['Прийду о ' + other + ', гаразд?', 'О ' + other + ' буду!', 'Тоді до зустрічі о ' + other + '.', 'Записав: о ' + other + '.', 'Буду о ' + other + ', не раніше.']), kind: 'wrong' },
      ]),
    };
  }
  // Що кажуть друзі, коли їх не почули.
  const COMMENTS = {
    any: ['Ти мене взагалі слухаєш?', 'Ти неуважний сьогодні.', 'Ти мало спиш, мабуть.', 'Робота тебе з’їла зовсім.', 'Тобі треба відпустку.',
      'Якщо тобі нецікаво, так і скажи.', 'Ну, бачу, ти зайнятий своїми думками.', 'Гаразд, не буду тебе втомлювати.', 'Ти завжди якийсь розсіяний останнім часом.'],
    called: ['Покликав нас, а сам десь не тут.'],
    invited: (g) => ['Я, здається, не вчасно прийш' + g('ла', 'ов') + '.'],
    again: ['Минулого разу було так само.'],
  };

  // ---------- сцена в низькій роздільності (як кімната), потім ×2 ----------
  const low = document.createElement('canvas'); low.width = LW; low.height = LH;
  const lg = low.getContext('2d');
  let target = lg;     // куди малює R: сцена або окреме полотно для людини
  const R = (x, y, w, h, c) => { target.fillStyle = c; target.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  // Людину малюємо окремо й збільшуємо вдвічі — це ж ближчий план.
  const pc = document.createElement('canvas'); pc.width = 64; pc.height = 80;
  const pctx = pc.getContext('2d');
  const shade = (hexc, f) => {
    const n = parseInt(hexc.slice(1), 16); let r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
    if (f > 0) { r += (255 - r) * f; gg += (255 - gg) * f; b += (255 - b) * f; } else { r *= 1 + f; gg *= 1 + f; b *= 1 + f; }
    return '#' + [r, gg, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  };
  const OL = '#24160f';

  // Фон рахуємо один раз: стіна, вікно з вечірнім містом, штори, диван.
  function drawBackdrop() {
    // Стіна: шпалери з тонкими смугами, до стелі темніше.
    for (let y = 0; y < LH; y++) R(0, y, LW, 1, shade('#2f5f5c', -0.25 * Math.max(0, 1 - y / 40)));
    for (let x = 4; x < LW; x += 9) for (let y = 0; y < 96; y += 2) R(x, y, 1, 1, '#356a66');
    // Вікно: небо смугами, місто, рама, підвіконня.
    const wx = 56, wy = 10, ww = 94, wh = 60;
    R(wx - 4, wy - 4, ww + 8, wh + 8, OL);
    R(wx - 3, wy - 3, ww + 6, wh + 6, '#e9e4d6');
    const sky = ['#f4d79a', '#f1c88e', '#eaa877', '#e2875a', '#c96a5a', '#9a5a63', '#6a4c66'];
    sky.forEach((c, i) => R(wx, wy + i * (wh / sky.length), ww, wh / sky.length + 1, c));
    R(wx + 60, wy + 12, 9, 9, '#fff1c8'); R(wx + 61, wy + 11, 7, 11, '#fff1c8'); R(wx + 59, wy + 13, 11, 7, '#fff1c8');   // сонце, що сідає
    const city = [[0, 20, 14], [13, 28, 10], [22, 16, 12], [33, 34, 8], [40, 22, 16], [55, 30, 9], [63, 18, 13], [75, 26, 11], [85, 14, 9]];
    for (const [cx, h, w] of city) {
      R(wx + cx, wy + wh - h, w, h, '#33455a');
      for (let yy = wy + wh - h + 3; yy < wy + wh - 2; yy += 4) for (let xx = wx + cx + 2; xx < wx + cx + w - 1; xx += 3)
        if (((xx * 7 + yy * 13) % 5) < 2) R(xx, yy, 1, 2, '#f2d36b');
    }
    R(wx + ww / 2 - 1, wy, 3, wh, '#e9e4d6'); R(wx, wy + wh / 2 - 1, ww, 3, '#e9e4d6');                       // рама
    R(wx - 6, wy + wh + 3, ww + 12, 4, '#e9e4d6'); R(wx - 6, wy + wh + 7, ww + 12, 1, shade('#e9e4d6', -0.35)); // підвіконня
    R(wx + 6, wy + wh - 2, 6, 5, '#a9603a'); R(wx + 5, wy + wh - 8, 8, 6, '#4f8f4a'); R(wx + 7, wy + wh - 11, 4, 3, '#5c9a55'); // вазон на підвіконні
    // Штори зі складками і карниз.
    R(40, 3, 126, 2, OL);
    for (const [x0, dir] of [[42, 1], [148, -1]]) {
      for (let i = 0; i < 16; i++) {
        const fold = i % 4 === 0 ? -0.25 : i % 4 === 2 ? 0.12 : 0;
        R(x0 + i, 5, 1, 92 + (i % 3), shade('#8a3f36', fold));
      }
      R(dir > 0 ? x0 + 15 : x0, 5, 1, 94, OL);
    }
    // Диван: спинка з подушками, бильця, сидіння.
    const top = 78;
    R(6, top - 1, 194, 52, OL);
    R(7, top, 192, 50, '#8a4a2a');
    for (const [x0, w] of [[14, 87], [105, 87]]) {
      R(x0 - 1, top + 3, w + 2, 42, OL);
      R(x0, top + 4, w, 40, '#9b5631');
      R(x0, top + 4, w, 3, '#b8703f');                                 // світло з вікна по верху
      R(x0 + 2, top + 7, 1, 35, '#b8703f');
      R(x0 + w - 3, top + 7, 2, 36, '#7a3f22');                        // тінь з боку
      for (const bx of [x0 + w / 4, x0 + w / 2, x0 + (3 * w) / 4]) { R(bx, top + 16, 1, 1, '#5e2f19'); R(bx, top + 30, 1, 1, '#5e2f19'); }
    }
    R(7, top, 192, 1, '#c27a48');
    // Бильця: заокруглені зверху.
    for (const x0 of [0, 186]) {
      R(x0, 100, 20, 72, OL);
      R(x0 + 1, 102, 18, 70, '#9b5631');
      R(x0 + 2, 100, 16, 2, '#9b5631');
      R(x0 + 3, 101, 12, 2, '#c27a48');
      R(x0 + (x0 ? 1 : 16), 104, 2, 68, '#7a3f22');
    }
    // Сидіння.
    R(20, 126, 166, 46, OL);
    R(21, 127, 164, 45, '#a8633a');
    R(21, 127, 164, 2, '#c27a48');
    R(103, 127, 1, 45, '#7a3f22');
  }
  let BACKDROP = null;   // рахується при першому показі

  // Людина по пояс: волосся, обличчя з очима, бровами, носом і ротом, кофта з тінню, руки на колінах.
  function person(cx, base, p, o) {
    cx = Math.round(cx);
    const skinD = shade(p.S, -0.18), GD = shade(p.G, -0.22), GL = shade(p.G, 0.18), HD = shade(p.H, -0.25);
    const head = [9, 13, 15, 17, 17, 17, 17, 17, 17, 17, 17, 16, 16, 15, 13, 11, 9];   // ширина обличчя по рядках
    const hy = base - 70;                                                               // верх голови
    // Довге волосся позаду голови, на плечі.
    if (p.f) { R(cx - 11, hy + 2, 22, 38, OL); R(cx - 10, hy + 3, 20, 36, p.H); R(cx - 10, hy + 20, 3, 18, HD); R(cx + 7, hy + 20, 3, 18, HD); }
    // Тулуб: кофта з округлими плечима.
    // Шия довга, щоб голова не сиділа прямо на плечах.
    R(cx - 4, hy + 17, 8, 13, OL); R(cx - 3, hy + 17, 6, 13, skinD);
    const ty = base - 48;
    // Плечі похилі: вгорі вужче, донизу ширше.
    const rows = 48;
    for (let r = 0; r < rows; r++) {
      const half = r < 6 ? 9 + r * 1.5 : r < 40 ? 18 : 18 - (r - 40) * 0.5;
      R(cx - half - 1, ty + r, half * 2 + 2, 1, OL);
    }
    for (let r = 1; r < rows - 1; r++) {
      const half = r < 6 ? 9 + r * 1.5 - 1 : r < 40 ? 17 : 17 - (r - 40) * 0.5;
      R(cx - half, ty + r, half * 2, 1, p.G);
      R(cx - half, ty + r, 2, 1, GL);                                       // світло з вікна
      R(cx + half - 4, ty + r, 4, 1, GD);                                   // тінь
    }
    R(cx - 5, ty + 1, 10, 3, GD); R(cx - 3, ty + 1, 6, 2, skinD);           // комір
    R(cx - 15, ty + 10, 1, 26, GD); R(cx + 14, ty + 10, 1, 26, GD);         // лінія рукавів
    // Руки на колінах.
    R(cx - 15, base - 13, 30, 7, OL); R(cx - 14, base - 12, 28, 5, GD);
    R(cx - 7, base - 12, 5, 4, p.S); R(cx + 2, base - 12, 5, 4, p.S);
    // Голова з контуром.
    head.forEach((w, i) => R(cx - Math.ceil(w / 2) - 1, hy + 2 + i, w + 2, 1, OL));
    R(cx - 4, hy + 1, 9, 1, OL);
    head.forEach((w, i) => R(cx - Math.floor(w / 2), hy + 2 + i, w, 1, p.S));
    R(cx - 9, hy + 8, 1, 4, p.S); R(cx + 9, hy + 8, 1, 4, p.S);           // вуха
    R(cx + 5, hy + 4, 3, 12, skinD);                                        // тінь на щоці
    // Волосся зверху.
    R(cx - 8, hy + 1, 17, 4, p.H); R(cx - 6, hy, 13, 1, p.H);
    if (p.f) { R(cx - 9, hy + 3, 3, 11, p.H); R(cx + 7, hy + 3, 3, 11, p.H); R(cx - 4, hy + 4, 6, 2, p.H); }
    else { R(cx - 9, hy + 3, 2, 5, p.H); R(cx + 8, hy + 3, 2, 5, p.H); R(cx - 2, hy + 4, 8, 1, p.H); }
    R(cx - 7, hy + 1, 5, 1, shade(p.H, 0.25));                              // відблиск на волоссі
    // Брови, очі, ніс, рум’янець, рот.
    const ey = hy + 9;
    R(cx - 6, ey - 2, 3, 1, HD); R(cx + 3, ey - 2, 3, 1, HD);
    const blink = (Math.floor(o.t * 1.1 + o.seed) % 6 === 0) && ((o.t * 1.1 + o.seed) % 1 < 0.14);
    if (blink) { R(cx - 6, ey + 1, 3, 1, '#2a1a14'); R(cx + 3, ey + 1, 3, 1, '#2a1a14'); }
    else {
      R(cx - 6, ey, 3, 2, '#f4f1ea'); R(cx + 3, ey, 3, 2, '#f4f1ea');
      R(cx - 5, ey, 2, 2, '#2a1a14'); R(cx + 3, ey, 2, 2, '#2a1a14');
    }
    R(cx, ey + 3, 1, 2, skinD);
    R(cx - 7, ey + 4, 2, 1, '#e8938a'); R(cx + 5, ey + 4, 2, 1, '#e8938a');
    const open = o.talking && Math.floor(o.t * 9) % 2 === 0;
    if (open) { R(cx - 2, ey + 6, 5, 2, '#5a1f1f'); R(cx - 1, ey + 7, 3, 1, '#c45a5a'); }
    else R(cx - 2, ey + 6, 5, 1, '#9a4a40');
    return { x: cx * 2, y: hy * 2 };
  }

  // Журнальний столик на передньому плані: закриває низ, на ньому чашки і піца.
  function drawTable() {
    const ty = 128;
    R(0, ty - 1, LW, LH - ty + 1, OL);
    R(0, ty, LW, 8, '#7a4f33');                       // стільниця
    R(0, ty, LW, 1, '#9b6a45');
    for (let x = 6; x < LW; x += 17) R(x, ty + 3, 9, 1, '#6a432b');
    R(0, ty + 8, LW, 2, '#3a2418');                   // тінь під краєм
    R(0, ty + 10, LW, LH - ty - 10, '#5a3926');       // передня стінка
    for (let x = 0; x < LW; x += 24) R(x, ty + 10, 1, LH - ty - 10, '#4a2e1f');
    // Чашки й коробка піци.
    R(34, ty - 9, 11, 10, OL); R(35, ty - 8, 9, 9, '#e6e8ea'); R(44, ty - 6, 3, 4, OL); R(35, ty - 8, 9, 2, '#5a3a2a');
    R(160, ty - 8, 10, 9, OL); R(161, ty - 7, 8, 8, '#d4a03e'); R(169, ty - 5, 3, 3, OL); R(161, ty - 7, 8, 2, '#4a2a1a');
    R(78, ty - 5, 52, 6, OL); R(79, ty - 4, 50, 5, '#c9a36b'); R(79, ty - 4, 50, 1, '#e0bd85'); R(98, ty - 3, 12, 2, '#b0453a');
  }

  function drawRoom(mode, t, talkers) {
    if (!BACKDROP) { drawBackdrop(); BACKDROP = lg.getImageData(0, 0, LW, LH); }
    lg.putImageData(BACKDROP, 0, 0);
    lg.imageSmoothingEnabled = false;
    const anchors = {};
    const xs = talkers.length === 1 ? [103] : [56, 150];
    talkers.forEach((tk, i) => {
      pctx.clearRect(0, 0, 64, 80);
      target = pctx;
      person(32, 78, FRIENDS[tk.name], { t, talking: tk.talking, seed: i * 2.3 });
      target = lg;
      // Сидить на дивані: низ кофти на рівні сидіння.
      lg.drawImage(pc, xs[i] - 64, 172 - 160, 128, 160);
      anchors[tk.name] = { x: xs[i] * 2, y: 20 };
    });
    drawTable();
    g.drawImage(low, 0, 0, W, H);
    return anchors;
  }


  function wrap(text, maxW) {
    const words = text.split(' '), lines = []; let line = '';
    for (const w of words) { const test = line ? line + ' ' + w : w; if (g.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; }
    if (line) lines.push(line);
    return lines;
  }
  // Субтитри на тій самій висоті, що й на планерці.
  function drawSpeech(name, text, shown, wait) {
    const x = 21, y = 180, w = 370, h = 73;
    g.fillStyle = 'rgba(15,17,26,.92)'; g.fillRect(x, y, w, h);
    if (!wait) { g.fillStyle = '#d4a03e'; g.font = '14px Handjet'; g.fillText(name + ':', x + 8, y + 5); }
    g.fillStyle = wait ? '#9aa0b8' : '#ece3cf'; g.font = '17px Handjet';
    wrap(text.slice(0, shown), w - 16).slice(0, 2).forEach((l, i) => g.fillText(l, x + 8, y + 24 + i * 20));
  }

  // o: { wrap, canvas, bar, names, invited, pain, state, painkiller, missedLast, onDone }
  function start(o) {
    const T = C.friends.talk;
    const fx = root.PainFX.create();
    const el = document.createElement('div');
    el.className = 'scene';
    el.innerHTML = `<canvas width="${W}" height="${H}"></canvas>`;
    o.wrap.appendChild(el);
    const view = el.querySelector('canvas');
    g = view.getContext('2d');
    g.imageSmoothingEnabled = false;
    // Сцена вписується в поле цілком: копіювати розмір кімнати не можна — та не буває меншою за 1×
    // і на низькому вікні вилазить за край, обрізаючи низ кадру.
    const fit = () => {
      const aw = o.wrap.clientWidth, ah = o.wrap.clientHeight;
      if (!aw || !ah) return;
      const k = Math.min(aw / W, ah / H), w = Math.round(W * k), h = Math.round(H * k);
      Object.assign(el.style, { left: Math.round((aw - w) / 2) + 'px', top: Math.round((ah - h) / 2) + 'px', width: w + 'px', height: h + 'px' });
    };
    fit();
    const ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(o.wrap);
    o.bar.innerHTML = `<div class="sc-head"><span class="ab-zone">У гостях</span><span class="ab-meta" id="scCount"></span></div>
      <div class="sc-bar"><div class="sc-timer joy" hidden><i></i></div><span class="sc-repeat"></span></div>
      <div class="sc-answers"></div><p class="sc-msg"></p>`;
    const $q = (sel) => o.bar.querySelector(sel);

    const names = o.names.filter((nm) => FRIENDS[nm]).slice(0, 2);
    if (!names.length) names.push('Марко');
    // Теми: новини, іноді друга тема — запрошення з часом.
    const pool = shuffle(TOPICS.slice()), topics = [];
    for (let i = 0; i < T.topics; i++) {
      const speaker = names[i % names.length], gg = gen(speaker);
      if (i === 1 && Math.random() < 0.35) { topics.push({ speaker, ...inviteTopic(gg) }); continue; }
      const tp = pool[i % pool.length](gg);
      topics.push({ speaker, ...tp, opts: replies(tp, gg) });
    }
    // «Минулого разу було так само» — лише про попередній візит, не про цей.
    let n = 0, repeatLeft = true, cur = null, done = false, keyHandler = null;
    const missedBefore = !!o.missedLast;
    const kinds = [], comments = [];

    function play(again) {
      const tp = topics[n], now = performance.now() / 1000;
      const start = now + root.PainFX.LEAD, typed = start + tp.text.length / CPS, end = typed + 1.6;
      let glitch = null;
      if (Math.random() < C.painCover[o.state]) {
        const ks = start + tp.text.indexOf(tp.key) / CPS;
        glitch = { start: ks - 0.1, end: end + 0.1 };
      }
      cur = { tp, start, typed, end, glitch, again, asking: false };
      $q('#scCount').textContent = 'тема ' + (n + 1) + ' з ' + topics.length;
      $q('.sc-answers').innerHTML = ''; $q('.sc-repeat').innerHTML = ''; $q('.sc-timer').hidden = true;
    }

    function ask() {
      cur.asking = true; cur.askAt = performance.now() / 1000;
      const gg = gen(cur.tp.speaker);
      $q('.sc-answers').innerHTML = cur.tp.opts.map((op, i) => `<button class="ans" data-i="${i}"><kbd>${i + 1}</kbd>${esc(op.t)}</button>`).join('');
      $q('.sc-answers').querySelectorAll('.ans').forEach((b) => { b.onclick = () => answer(Number(b.dataset.i)); });
      if (repeatLeft) {
        $q('.sc-repeat').innerHTML = `<button class="btn" type="button"><kbd>R</kbd> Вибач, я відволікся, що ти ${gg('казала', 'казав')}?</button>`;
        $q('.sc-repeat button').onclick = repeat;
      }
      $q('.sc-timer').hidden = false;
      setKeys((e) => {
        if (/^Digit[1-3]$/.test(e.code)) answer(Number(e.code.slice(5)) - 1);
        else if (e.code === 'KeyR' && repeatLeft) repeat();
        else return false;
      });
    }

    function answer(i) {
      if (!cur || !cur.asking) return;
      cur.asking = false; setKeys(null);
      const op = i == null ? null : cur.tp.opts[i];
      let kind = op ? op.kind : 'silent';
      if (kind === 'right' && cur.again) kind = 'meh';   // після «що ти казав?» бонусу вже немає
      kinds.push(kind);
      const gg = gen(cur.tp.speaker);
      $q('.sc-answers').querySelectorAll('.ans').forEach((b, k) => { b.disabled = true; b.classList.add(cur.tp.opts[k].kind); });
      $q('.sc-repeat').innerHTML = ''; $q('.sc-timer').hidden = true;
      let say;
      if (kind === 'right') say = pick(['Дякую! Я ' + gg('знала', 'знав') + ', що ти зрозумієш.', 'Так, саме так!', 'От і я про це.',
        'Дякую, це важливо для мене.', 'Ти завжди знаєш, що сказати.', 'Приємно, що ти зі мною.', 'Ось за це я тебе й люблю.',
        'Як добре, що я тобі ' + gg('розповіла', 'розповів') + '.', 'Дякую, аж легше стало.', 'Ти мене розумієш.',
        'Отож! Я так і ' + gg('знала', 'знав') + '.', 'Дякую, друже.', 'Добре, що ми побачилися.', 'Саме це мені й треба було почути.', 'Ти найкращий.']);
      else if (kind === 'meh') say = pick(['Ну так.', 'Ага.', 'Та нормально.', 'Ну, якось так.', 'Угу.', 'Та нічого.', 'Ну, побачимо.',
        'Та таке.', 'Мабуть.', 'Ну, як є.', 'Ага, ну.', 'Та живемо.', 'Ну, ясно.', 'Може, й так.', 'Та воно якось буде.']);
      else {
        const p = COMMENTS.any.slice();
        p.push(...(o.invited ? COMMENTS.invited(gg) : COMMENTS.called));
        if (missedBefore) p.push(...COMMENTS.again, ...COMMENTS.again);
        say = pick(p);
        comments.push(say);
      }
      const d = T.joy[kind];
      $q('.sc-msg').className = 'sc-msg ' + (d > 0 ? 'good' : d < 0 ? 'bad' : '');
      $q('.sc-msg').textContent = (kind === 'silent' ? 'Ти промовчав. ' : '') + 'Радість ' + (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d) +
        (d < 0 ? ', кличуть рідше' : kind === 'right' ? ', ' + cur.tp.speaker + ' теплішає' : '');
      cur.reaction = { text: say, from: performance.now() / 1000, until: performance.now() / 1000 + 2.2 };
      setTimeout(() => { if (done) return; n++; $q('.sc-msg').textContent = ''; if (n < topics.length) play(); else finish(); }, 2400);
    }

    function repeat() {
      if (!repeatLeft || !cur.asking) return;
      repeatLeft = false; cur.asking = false; setKeys(null);
      $q('.sc-msg').className = 'sc-msg'; $q('.sc-msg').textContent = 'Повторює. Найкраще тепер — просто нейтрально.';
      play(true);
    }

    function finish() {
      done = true;
      $q('#scCount').textContent = '';
      const sum = kinds.reduce((a, k) => a + T.joy[k], 0);
      $q('.sc-answers').innerHTML = '';
      $q('.sc-msg').className = 'sc-msg ' + (sum > 0 ? 'good' : sum < 0 ? 'bad' : '');
      $q('.sc-msg').textContent = 'Розмова: радість ' + (sum > 0 ? '+' : sum < 0 ? '−' : '±') + Math.abs(sum) + '.';
      setKeys((e) => { if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') close(); else return false; });
      // Виходити нема з чого обирати — сцена закривається сама, Enter пришвидшує.
      setTimeout(close, 500);
    }

    function setKeys(h) {
      if (keyHandler) window.removeEventListener('keydown', keyHandler, true);
      keyHandler = null;
      if (!h) return;
      keyHandler = (e) => { if (h(e) !== false) { e.preventDefault(); e.stopPropagation(); } };
      window.addEventListener('keydown', keyHandler, true);
    }

    let closed = false, raf = 0;
    function close() {
      if (closed) return;
      closed = true; setKeys(null); cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      el.remove(); o.bar.innerHTML = '';
      o.onDone({ kinds, comments });
    }

    function frame(nowMs) {
      fit();   // поле міняється, коли заповнюється панель дій; спостерігач розміру іноді запізнюється
      const t = nowMs / 1000;
      g = view.getContext('2d');
      if (cur && !cur.asking && !cur.reaction && !done && t >= cur.end) ask();
      if (cur && cur.asking) {
        const left = T.answerSeconds - (t - cur.askAt);
        $q('.sc-timer i').style.width = Math.max(0, left / T.answerSeconds * 100) + '%';
        if (left <= 0) answer(null);
      }
      let speech = null;
      if (cur) {
        if (cur.reaction && t < cur.reaction.until) speech = { name: cur.tp.speaker, text: cur.reaction.text, shown: Math.floor((t - cur.reaction.from) * CPS) };
        else if (!cur.reaction && cur.asking) speech = { name: cur.tp.speaker, text: cur.tp.speaker + ' чекає, що ти скажеш…', shown: 999, wait: true };
        else if (!cur.reaction && t >= cur.start && t < cur.end) {
          speech = { name: cur.tp.speaker, text: cur.tp.text, shown: Math.min(cur.tp.text.length, Math.floor((t - cur.start) * CPS)) };
        }
      }
      const talkers = names.map((nm) => ({ name: nm, talking: !!(speech && !speech.wait && speech.name === nm && speech.shown < speech.text.length) }));
      drawRoom('close', t, talkers);
      root.PainFX.gloom(g, W, H, o.joy != null ? o.joy : 60);   // субтитри лишаються чіткими
      g.textBaseline = 'top';
      if (speech) drawSpeech(speech.name, speech.text, Math.max(0, speech.shown), speech.wait);
      fx.draw(g, W, H, t, o.pain, cur && cur.glitch, o.painkiller);
      raf = requestAnimationFrame(frame);
    }

    play();
    raf = requestAnimationFrame(frame);
    return { close };
  }

  root.FriendTalk = { start };
})(typeof globalThis !== 'undefined' ? globalThis : this);
