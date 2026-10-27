/**
 * Системные стартовые наборы для быстрого старта библиотеки.
 * Слова попадают в user_vocabulary пользователя при добавлении набора.
 */

export const STARTER_PACKS = Object.freeze([
  Object.freeze({
    key: 'numbers',
    title: 'Числа',
    description: 'Счёт и числительные',
    icon: '#',
    language: 'en',
    words: Object.freeze([
      { word: 'one', gloss: 'один', partOfSpeech: 'числительное' },
      { word: 'two', gloss: 'два', partOfSpeech: 'числительное' },
      { word: 'three', gloss: 'три', partOfSpeech: 'числительное' },
      { word: 'four', gloss: 'четыре', partOfSpeech: 'числительное' },
      { word: 'five', gloss: 'пять', partOfSpeech: 'числительное' },
      { word: 'six', gloss: 'шесть', partOfSpeech: 'числительное' },
      { word: 'seven', gloss: 'семь', partOfSpeech: 'числительное' },
      { word: 'eight', gloss: 'восемь', partOfSpeech: 'числительное' },
      { word: 'nine', gloss: 'девять', partOfSpeech: 'числительное' },
      { word: 'ten', gloss: 'десять', partOfSpeech: 'числительное' },
      { word: 'eleven', gloss: 'одиннадцать', partOfSpeech: 'числительное' },
      { word: 'twelve', gloss: 'двенадцать', partOfSpeech: 'числительное' },
      { word: 'thirteen', gloss: 'тринадцать', partOfSpeech: 'числительное' },
      { word: 'fourteen', gloss: 'четырнадцать', partOfSpeech: 'числительное' },
      { word: 'fifteen', gloss: 'пятнадцать', partOfSpeech: 'числительное' },
      { word: 'sixteen', gloss: 'шестнадцать', partOfSpeech: 'числительное' },
      { word: 'seventeen', gloss: 'семнадцать', partOfSpeech: 'числительное' },
      { word: 'eighteen', gloss: 'восемнадцать', partOfSpeech: 'числительное' },
      { word: 'nineteen', gloss: 'девятнадцать', partOfSpeech: 'числительное' },
      { word: 'twenty', gloss: 'двадцать', partOfSpeech: 'числительное' },
      { word: 'hundred', gloss: 'сто', partOfSpeech: 'числительное' },
    ]),
  }),
  Object.freeze({
    key: 'colors',
    title: 'Цвета',
    description: 'Основная палитра',
    icon: 'palette',
    language: 'en',
    words: Object.freeze([
      { word: 'red', gloss: 'красный', partOfSpeech: 'прилагательное' },
      { word: 'blue', gloss: 'синий', partOfSpeech: 'прилагательное' },
      { word: 'green', gloss: 'зелёный', partOfSpeech: 'прилагательное' },
      { word: 'yellow', gloss: 'жёлтый', partOfSpeech: 'прилагательное' },
      { word: 'black', gloss: 'чёрный', partOfSpeech: 'прилагательное' },
      { word: 'white', gloss: 'белый', partOfSpeech: 'прилагательное' },
      { word: 'orange', gloss: 'оранжевый', partOfSpeech: 'прилагательное' },
      { word: 'pink', gloss: 'розовый', partOfSpeech: 'прилагательное' },
      { word: 'purple', gloss: 'фиолетовый', partOfSpeech: 'прилагательное' },
      { word: 'brown', gloss: 'коричневый', partOfSpeech: 'прилагательное' },
      { word: 'grey', gloss: 'серый', partOfSpeech: 'прилагательное' },
      { word: 'gold', gloss: 'золотой', partOfSpeech: 'прилагательное' },
    ]),
  }),
  Object.freeze({
    key: 'calendar',
    title: 'Дни и месяцы',
    description: 'Основы календаря',
    icon: 'calendar',
    language: 'en',
    words: Object.freeze([
      { word: 'Monday', gloss: 'понедельник', partOfSpeech: 'существительное' },
      { word: 'Tuesday', gloss: 'вторник', partOfSpeech: 'существительное' },
      { word: 'Wednesday', gloss: 'среда', partOfSpeech: 'существительное' },
      { word: 'Thursday', gloss: 'четверг', partOfSpeech: 'существительное' },
      { word: 'Friday', gloss: 'пятница', partOfSpeech: 'существительное' },
      { word: 'Saturday', gloss: 'суббота', partOfSpeech: 'существительное' },
      { word: 'Sunday', gloss: 'воскресенье', partOfSpeech: 'существительное' },
      { word: 'January', gloss: 'январь', partOfSpeech: 'существительное' },
      { word: 'February', gloss: 'февраль', partOfSpeech: 'существительное' },
      { word: 'March', gloss: 'март', partOfSpeech: 'существительное' },
      { word: 'April', gloss: 'апрель', partOfSpeech: 'существительное' },
      { word: 'May', gloss: 'май', partOfSpeech: 'существительное' },
      { word: 'June', gloss: 'июнь', partOfSpeech: 'существительное' },
      { word: 'July', gloss: 'июль', partOfSpeech: 'существительное' },
      { word: 'August', gloss: 'август', partOfSpeech: 'существительное' },
      { word: 'September', gloss: 'сентябрь', partOfSpeech: 'существительное' },
      { word: 'October', gloss: 'октябрь', partOfSpeech: 'существительное' },
      { word: 'November', gloss: 'ноябрь', partOfSpeech: 'существительное' },
      { word: 'December', gloss: 'декабрь', partOfSpeech: 'существительное' },
    ]),
  }),
  Object.freeze({
    key: 'greetings',
    title: 'Приветствия',
    description: 'Привет, пожалуйста, спасибо',
    icon: 'hand',
    language: 'en',
    words: Object.freeze([
      { word: 'hello', gloss: 'привет', partOfSpeech: 'междометие' },
      { word: 'hi', gloss: 'привет', partOfSpeech: 'междометие' },
      { word: 'goodbye', gloss: 'до свидания', partOfSpeech: 'междометие' },
      { word: 'please', gloss: 'пожалуйста', partOfSpeech: 'наречие' },
      { word: 'thank you', gloss: 'спасибо', partOfSpeech: 'фраза' },
      { word: 'thanks', gloss: 'спасибо', partOfSpeech: 'междометие' },
      { word: 'sorry', gloss: 'извините', partOfSpeech: 'прилагательное' },
      { word: 'excuse me', gloss: 'простите', partOfSpeech: 'фраза' },
      { word: 'yes', gloss: 'да', partOfSpeech: 'частица' },
      { word: 'no', gloss: 'нет', partOfSpeech: 'частица' },
      { word: 'good morning', gloss: 'доброе утро', partOfSpeech: 'фраза' },
      { word: 'good evening', gloss: 'добрый вечер', partOfSpeech: 'фраза' },
      { word: 'how are you', gloss: 'как дела', partOfSpeech: 'фраза' },
      { word: 'nice to meet you', gloss: 'приятно познакомиться', partOfSpeech: 'фраза' },
      { word: 'welcome', gloss: 'добро пожаловать', partOfSpeech: 'междометие' },
    ]),
  }),
])

export function listStarterPacks(language) {
  const lang = language === 'zh' ? 'zh' : 'en'
  return STARTER_PACKS
    .filter((pack) => pack.language === lang)
    .map((pack) => ({
      key: pack.key,
      title: pack.title,
      description: pack.description,
      icon: pack.icon,
      word_count: pack.words.length,
    }))
}

export function findStarterPack(key, language) {
  const lang = language === 'zh' ? 'zh' : 'en'
  return STARTER_PACKS.find((pack) => pack.key === key && pack.language === lang) || null
}
