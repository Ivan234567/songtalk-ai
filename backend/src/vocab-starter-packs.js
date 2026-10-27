/**
 * Пять демо-списков A1–A2 по 20 слов.
 * Добавляются в библиотеку по желанию, не как платная функция.
 */

function pack(key, title, description, level, words) {
  return Object.freeze({
    key,
    title,
    description,
    level,
    icon: 'list',
    language: 'en',
    words: Object.freeze(words),
  })
}

function entries(partOfSpeech, pairs) {
  return pairs.map(([word, gloss]) => ({ word, gloss, partOfSpeech }))
}

export const STARTER_PACKS = Object.freeze([
  pack('intro', 'Знакомство', 'Приветствия и простые ответы, A1', 'A1', entries('фраза', [
    ['hello', 'привет'],
    ['hi', 'привет'],
    ['goodbye', 'до свидания'],
    ['please', 'пожалуйста'],
    ['thank you', 'спасибо'],
    ['thanks', 'спасибо'],
    ['sorry', 'извини'],
    ['excuse me', 'простите'],
    ['yes', 'да'],
    ['no', 'нет'],
    ['name', 'имя'],
    ['friend', 'друг'],
    ['good', 'хороший'],
    ['morning', 'утро'],
    ['evening', 'вечер'],
    ['welcome', 'добро пожаловать'],
    ['nice', 'приятный'],
    ['meet', 'встречать'],
    ['how', 'как'],
    ['fine', 'хорошо'],
  ])),
  pack('family', 'Семья', 'Люди рядом, A1', 'A1', entries('существительное', [
    ['mother', 'мама'],
    ['father', 'папа'],
    ['sister', 'сестра'],
    ['brother', 'брат'],
    ['family', 'семья'],
    ['baby', 'малыш'],
    ['child', 'ребёнок'],
    ['boy', 'мальчик'],
    ['girl', 'девочка'],
    ['man', 'мужчина'],
    ['woman', 'женщина'],
    ['parents', 'родители'],
    ['son', 'сын'],
    ['daughter', 'дочь'],
    ['grandmother', 'бабушка'],
    ['grandfather', 'дедушка'],
    ['husband', 'муж'],
    ['wife', 'жена'],
    ['people', 'люди'],
    ['friend', 'друг'],
  ])),
  pack('home', 'Дом', 'Дом и вещи вокруг, A1', 'A1', entries('существительное', [
    ['house', 'дом'],
    ['home', 'дом'],
    ['room', 'комната'],
    ['door', 'дверь'],
    ['window', 'окно'],
    ['table', 'стол'],
    ['chair', 'стул'],
    ['bed', 'кровать'],
    ['kitchen', 'кухня'],
    ['bathroom', 'ванная'],
    ['water', 'вода'],
    ['book', 'книга'],
    ['phone', 'телефон'],
    ['key', 'ключ'],
    ['light', 'свет'],
    ['floor', 'пол'],
    ['wall', 'стена'],
    ['garden', 'сад'],
    ['street', 'улица'],
    ['city', 'город'],
  ])),
  pack('food', 'Еда', 'Еда и напитки, A1–A2', 'A2', entries('существительное', [
    ['food', 'еда'],
    ['bread', 'хлеб'],
    ['milk', 'молоко'],
    ['tea', 'чай'],
    ['coffee', 'кофе'],
    ['apple', 'яблоко'],
    ['egg', 'яйцо'],
    ['rice', 'рис'],
    ['meat', 'мясо'],
    ['fish', 'рыба'],
    ['soup', 'суп'],
    ['cheese', 'сыр'],
    ['sugar', 'сахар'],
    ['salt', 'соль'],
    ['breakfast', 'завтрак'],
    ['dinner', 'ужин'],
    ['hungry', 'голодный'],
    ['eat', 'есть'],
    ['drink', 'пить'],
    ['water', 'вода'],
  ])),
  pack('everyday', 'Каждый день', 'Простые действия и время, A2', 'A2', entries('глагол', [
    ['go', 'идти'],
    ['come', 'приходить'],
    ['see', 'видеть'],
    ['want', 'хотеть'],
    ['like', 'нравиться'],
    ['have', 'иметь'],
    ['make', 'делать'],
    ['work', 'работа'],
    ['school', 'школа'],
    ['today', 'сегодня'],
    ['tomorrow', 'завтра'],
    ['morning', 'утро'],
    ['night', 'ночь'],
    ['time', 'время'],
    ['day', 'день'],
    ['week', 'неделя'],
    ['happy', 'счастливый'],
    ['tired', 'уставший'],
    ['big', 'большой'],
    ['small', 'маленький'],
  ])),
])

export function listStarterPacks(language) {
  const lang = language === 'zh' ? 'zh' : 'en'
  return STARTER_PACKS
    .filter((item) => item.language === lang)
    .map((item) => ({
      key: item.key,
      title: item.title,
      description: item.description,
      level: item.level,
      icon: item.icon,
      word_count: item.words.length,
    }))
}

export function findStarterPack(key, language) {
  const lang = language === 'zh' ? 'zh' : 'en'
  return STARTER_PACKS.find((item) => item.key === key && item.language === lang) || null
}
