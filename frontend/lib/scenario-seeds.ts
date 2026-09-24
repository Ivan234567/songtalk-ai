export type ScenarioSeed = { id: string; prompt: string };

const EN_BEGINNER: ScenarioSeed[] = [
  { id: 'en-a1-cafe', prompt: 'В кафе заказать чай и булочку и спросить цену' },
  { id: 'en-a1-shop', prompt: 'В магазине купить воду и спросить, сколько стоит' },
  { id: 'en-a1-hello', prompt: 'Познакомиться: сказать имя и откуда вы' },
  { id: 'en-a1-taxi', prompt: 'Вызвать такси: сказать, откуда забрать и куда ехать' },
  { id: 'en-a1-hotel', prompt: 'В отеле сказать свою фамилию и попросить ключ' },
  { id: 'en-a1-food', prompt: 'Заказать рис и воду в простой столовой' },
];

const EN_ELEMENTARY: ScenarioSeed[] = [
  { id: 'en-a2-cafe', prompt: 'В кофейне заказать кофе и десерт и попросить счёт' },
  { id: 'en-a2-taxi', prompt: 'Такси из аэропорта до отеля: терминал и адрес' },
  { id: 'en-a2-clothes', prompt: 'В магазине одежды спросить размер и цену и купить' },
  { id: 'en-a2-directions', prompt: 'Спросить дорогу до станции метро' },
  { id: 'en-a2-pharmacy', prompt: 'В аптеке попросить лекарство от головной боли' },
  { id: 'en-a2-restaurant', prompt: 'Забронировать столик на двоих на вечер' },
];

const EN_INTERMEDIATE: ScenarioSeed[] = [
  { id: 'en-b1-return', prompt: 'Вернуть куртку в магазин: не тот размер' },
  { id: 'en-b1-doctor', prompt: 'Записаться к врачу и коротко описать симптом' },
  { id: 'en-b1-hotel', prompt: 'В отеле попросить другой номер: слишком шумно' },
  { id: 'en-b1-delay', prompt: 'Поезд задерживается: узнать новый путь и время' },
  { id: 'en-b1-cafe', prompt: 'В кафе заменить блюдо: в нём есть орехи' },
  { id: 'en-b1-plans', prompt: 'Договориться с другом, где и во сколько встретиться' },
];

const EN_UPPER: ScenarioSeed[] = [
  { id: 'en-b2-complaint', prompt: 'Вежливо пожаловаться в отеле: номер не убрали' },
  { id: 'en-b2-interview', prompt: 'Короткое собеседование: рассказать, чем занимались' },
  { id: 'en-b2-landlord', prompt: 'Позвонить арендодателю: сломался душ' },
  { id: 'en-b2-meeting', prompt: 'Перенести рабочую встречу на другой день' },
  { id: 'en-b2-restaurant', prompt: 'В ресторане объяснить аллергию и выбрать блюдо' },
  { id: 'en-b2-neighbor', prompt: 'Попросить соседа сделать музыку тише' },
];

const EN_ADVANCED: ScenarioSeed[] = [
  { id: 'en-c1-negotiate', prompt: 'Мягко договориться о скидке на курс' },
  { id: 'en-c1-feedback', prompt: 'Дать коллеге спокойную обратную связь по проекту' },
  { id: 'en-c1-delay', prompt: 'Объяснить клиенту задержку и предложить новый срок' },
  { id: 'en-c1-clinic', prompt: 'Уточнить у врача план лечения и побочные эффекты' },
  { id: 'en-c1-housing', prompt: 'Обсудить с агентом условия аренды квартиры' },
  { id: 'en-c1-event', prompt: 'Согласовать программу короткой встречи с гостем' },
];

const ZH_LESSON: Record<number, ScenarioSeed[]> = {
  1: [
    { id: 'zh1-hello', prompt: 'Познакомиться: 你好, имя и «приятно познакомиться»' },
    { id: 'zh1-shop', prompt: 'Купить яблоки и спросить 多少钱' },
    { id: 'zh1-eat', prompt: 'Заказать рис и чай' },
    { id: 'zh1-family', prompt: 'Рассказать, сколько человек в семье' },
    { id: 'zh1-time', prompt: 'Договориться о встрече: сегодня или завтра и во сколько' },
    { id: 'zh1-age', prompt: 'Сказать свой возраст и спросить возраст собеседника' },
  ],
  2: [
    { id: 'zh2-clothes', prompt: 'В магазине одежды: цвет, размер и цена' },
    { id: 'zh2-taxi', prompt: 'Такси: откуда забрать и куда ехать' },
    { id: 'zh2-weather', prompt: 'Спросить, какая погода, и решить, идти ли гулять' },
    { id: 'zh2-food', prompt: 'В столовой выбрать блюдо и напиток' },
    { id: 'zh2-phone', prompt: 'Позвонить другу и пригласить на ужин' },
    { id: 'zh2-direction', prompt: 'Спросить, как дойти до школы' },
  ],
  3: [
    { id: 'zh3-doctor', prompt: 'У врача: болит горло, спросить, что делать' },
    { id: 'zh3-return', prompt: 'Поменять одежду: размер не подходит' },
    { id: 'zh3-travel', prompt: 'Купить билет на поезд на завтра' },
    { id: 'zh3-hobby', prompt: 'Рассказать, чем любите заниматься в свободное время' },
    { id: 'zh3-hotel', prompt: 'Заселиться в отель и спросить про завтрак' },
    { id: 'zh3-gift', prompt: 'Выбрать подарок другу и спросить совет продавца' },
  ],
  4: [
    { id: 'zh4-clinic', prompt: 'Записаться к врачу и описать, как давно болит' },
    { id: 'zh4-apartment', prompt: 'Смотреть квартиру: спросить цену и что рядом' },
    { id: 'zh4-work', prompt: 'Коротко рассказать о работе и спросить о вакансии' },
    { id: 'zh4-delay', prompt: 'Рейс задержали: узнать новое время' },
    { id: 'zh4-restaurant', prompt: 'В ресторане попросить блюдо без острого' },
    { id: 'zh4-plans', prompt: 'Обсудить планы на выходные и договориться о встрече' },
  ],
  5: [
    { id: 'zh5-complaint', prompt: 'Вежливо сказать в отеле, что номер не убрали' },
    { id: 'zh5-interview', prompt: 'Собеседование: опыт и почему хотите эту работу' },
    { id: 'zh5-neighbor', prompt: 'Попросить соседа сделать тише после одиннадцати' },
    { id: 'zh5-bank', prompt: 'В банке открыть карту и спросить комиссию' },
    { id: 'zh5-course', prompt: 'Уточнить расписание курса и можно ли перенести занятие' },
    { id: 'zh5-travel', prompt: 'Изменить дату билета и узнать доплату' },
  ],
  6: [
    { id: 'zh6-negotiate', prompt: 'Спокойно обсудить скидку на долгую аренду' },
    { id: 'zh6-feedback', prompt: 'Дать коллеге обратную связь по проекту' },
    { id: 'zh6-clinic', prompt: 'Уточнить у врача варианты и побочные эффекты' },
    { id: 'zh6-delay', prompt: 'Объяснить клиенту задержку и предложить новый срок' },
    { id: 'zh6-meeting', prompt: 'Согласовать повестку короткой рабочей встречи' },
    { id: 'zh6-housing', prompt: 'Обсудить условия договора аренды' },
  ],
};

const ZH_LIFE: Record<number, ScenarioSeed[]> = {
  1: [
    { id: 'zhl1-shop', prompt: 'Сегодня в магазине купить воду и яблоки' },
    { id: 'zhl1-eat', prompt: 'Сегодня заказать еду: рис и чай' },
    { id: 'zhl1-hello', prompt: 'Познакомиться с новым соседом: имя и откуда вы' },
    { id: 'zhl1-taxi', prompt: 'Вызвать такси до дома' },
  ],
  2: [
    { id: 'zhl2-clothes', prompt: 'На этой неделе купить куртку: размер и цвет' },
    { id: 'zhl2-taxi', prompt: 'Завтра такси в аэропорт' },
    { id: 'zhl2-food', prompt: 'Сегодня заказать ужин навынос' },
    { id: 'zhl2-friend', prompt: 'Позвонить другу и договориться о встрече' },
  ],
  3: [
    { id: 'zhl3-doctor', prompt: 'На этой неделе к врачу: болит горло' },
    { id: 'zhl3-shop', prompt: 'Поменять купленную рубашку: мала' },
    { id: 'zhl3-ticket', prompt: 'Купить билет на поезд на завтра утром' },
    { id: 'zhl3-hotel', prompt: 'Заселиться в отель сегодня вечером' },
  ],
  4: [
    { id: 'zhl4-clinic', prompt: 'Записаться к терапевту и описать симптом' },
    { id: 'zhl4-flat', prompt: 'Посмотреть квартиру и спросить цену' },
    { id: 'zhl4-flight', prompt: 'Рейс задержали, узнать новое время вылета' },
    { id: 'zhl4-dinner', prompt: 'Заказать ужин без острого' },
  ],
  5: [
    { id: 'zhl5-hotel', prompt: 'Сказать на ресепшен, что номер не убрали' },
    { id: 'zhl5-bank', prompt: 'Открыть карту и спросить комиссию' },
    { id: 'zhl5-class', prompt: 'Перенести занятие на другой день' },
    { id: 'zhl5-ticket', prompt: 'Поменять дату билета' },
  ],
  6: [
    { id: 'zhl6-rent', prompt: 'Обсудить с арендодателем срок и оплату' },
    { id: 'zhl6-work', prompt: 'Объяснить коллеге, почему срок сдвинулся' },
    { id: 'zhl6-doctor', prompt: 'Уточнить у врача, что делать дальше' },
    { id: 'zhl6-meet', prompt: 'Согласовать время и тему встречи' },
  ],
};

export function enSeedsForLevel(level: string): ScenarioSeed[] {
  if (level === 'A1' || level === 'easy') return EN_BEGINNER;
  if (level === 'A2') return EN_ELEMENTARY;
  if (level === 'B2' || level === 'hard') return EN_UPPER;
  if (level === 'C1') return EN_ADVANCED;
  return EN_INTERMEDIATE;
}

export function zhSeedsForLevel(hsk: number, fromLife: boolean): ScenarioSeed[] {
  const band = Math.min(6, Math.max(1, hsk || 1));
  const table = fromLife ? ZH_LIFE : ZH_LESSON;
  return table[band] || table[3];
}

export function pickScenarioSeed(seeds: ScenarioSeed[], usedIds: string[]): ScenarioSeed {
  const fresh = seeds.filter((seed) => !usedIds.includes(seed.id));
  const pool = fresh.length > 0 ? fresh : seeds;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index] || seeds[0];
}
