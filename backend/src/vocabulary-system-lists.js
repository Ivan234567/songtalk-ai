/**
 * Системные тематические списки словаря (быстрый старт).
 * Слова заданы заранее для en/zh — без генерации ИИ и без списания баланса.
 */

function t(translation) {
  return [{ translation, source: 'system' }]
}

function enWord(word, translation, extra = {}) {
  return {
    word,
    translations: t(translation),
    difficulty_level: extra.difficulty_level || 'A1',
    part_of_speech: extra.part_of_speech || null,
  }
}

function zhWord(word, pinyin, translation, extra = {}) {
  return {
    word,
    pinyin,
    translations: t(translation),
    hsk_level: extra.hsk_level || 1,
    part_of_speech: extra.part_of_speech || null,
  }
}

export const SYSTEM_WORD_LISTS = [
  {
    id: 'numbers',
    title: 'Числа',
    subtitle: 'Счёт и числительные',
    color: '#94a3b8',
    icon: 'hash',
    emoji: '🔢',
    words: {
      en: [
        enWord('one', 'один', { part_of_speech: 'numeral' }),
        enWord('two', 'два', { part_of_speech: 'numeral' }),
        enWord('three', 'три', { part_of_speech: 'numeral' }),
        enWord('four', 'четыре', { part_of_speech: 'numeral' }),
        enWord('five', 'пять', { part_of_speech: 'numeral' }),
        enWord('six', 'шесть', { part_of_speech: 'numeral' }),
        enWord('seven', 'семь', { part_of_speech: 'numeral' }),
        enWord('eight', 'восемь', { part_of_speech: 'numeral' }),
        enWord('nine', 'девять', { part_of_speech: 'numeral' }),
        enWord('ten', 'десять', { part_of_speech: 'numeral' }),
        enWord('eleven', 'одиннадцать', { part_of_speech: 'numeral' }),
        enWord('twelve', 'двенадцать', { part_of_speech: 'numeral' }),
      ],
      zh: [
        zhWord('一', 'yī', 'один', { part_of_speech: 'numeral' }),
        zhWord('二', 'èr', 'два', { part_of_speech: 'numeral' }),
        zhWord('三', 'sān', 'три', { part_of_speech: 'numeral' }),
        zhWord('四', 'sì', 'четыре', { part_of_speech: 'numeral' }),
        zhWord('五', 'wǔ', 'пять', { part_of_speech: 'numeral' }),
        zhWord('六', 'liù', 'шесть', { part_of_speech: 'numeral' }),
        zhWord('七', 'qī', 'семь', { part_of_speech: 'numeral' }),
        zhWord('八', 'bā', 'восемь', { part_of_speech: 'numeral' }),
        zhWord('九', 'jiǔ', 'девять', { part_of_speech: 'numeral' }),
        zhWord('十', 'shí', 'десять', { part_of_speech: 'numeral' }),
        zhWord('十一', 'shí yī', 'одиннадцать', { part_of_speech: 'numeral' }),
        zhWord('十二', 'shí èr', 'двенадцать', { part_of_speech: 'numeral' }),
      ],
    },
  },
  {
    id: 'colors',
    title: 'Цвета',
    subtitle: 'Основная палитра',
    color: '#a78bfa',
    icon: 'palette',
    emoji: '🎨',
    words: {
      en: [
        enWord('red', 'красный', { part_of_speech: 'adjective' }),
        enWord('blue', 'синий', { part_of_speech: 'adjective' }),
        enWord('green', 'зелёный', { part_of_speech: 'adjective' }),
        enWord('yellow', 'жёлтый', { part_of_speech: 'adjective' }),
        enWord('black', 'чёрный', { part_of_speech: 'adjective' }),
        enWord('white', 'белый', { part_of_speech: 'adjective' }),
        enWord('orange', 'оранжевый', { part_of_speech: 'adjective' }),
        enWord('pink', 'розовый', { part_of_speech: 'adjective' }),
        enWord('purple', 'фиолетовый', { part_of_speech: 'adjective' }),
        enWord('brown', 'коричневый', { part_of_speech: 'adjective' }),
        enWord('gray', 'серый', { part_of_speech: 'adjective' }),
        enWord('gold', 'золотой', { part_of_speech: 'adjective' }),
      ],
      zh: [
        zhWord('红色', 'hóng sè', 'красный', { part_of_speech: 'noun' }),
        zhWord('蓝色', 'lán sè', 'синий', { part_of_speech: 'noun' }),
        zhWord('绿色', 'lǜ sè', 'зелёный', { part_of_speech: 'noun' }),
        zhWord('黄色', 'huáng sè', 'жёлтый', { part_of_speech: 'noun' }),
        zhWord('黑色', 'hēi sè', 'чёрный', { part_of_speech: 'noun' }),
        zhWord('白色', 'bái sè', 'белый', { part_of_speech: 'noun' }),
        zhWord('橙色', 'chéng sè', 'оранжевый', { part_of_speech: 'noun' }),
        zhWord('粉色', 'fěn sè', 'розовый', { part_of_speech: 'noun' }),
        zhWord('紫色', 'zǐ sè', 'фиолетовый', { part_of_speech: 'noun' }),
        zhWord('棕色', 'zōng sè', 'коричневый', { part_of_speech: 'noun' }),
        zhWord('灰色', 'huī sè', 'серый', { part_of_speech: 'noun' }),
        zhWord('金色', 'jīn sè', 'золотой', { part_of_speech: 'noun' }),
      ],
    },
  },
  {
    id: 'days-months',
    title: 'Дни и месяцы',
    subtitle: 'Основы календаря',
    color: '#fb923c',
    icon: 'calendar',
    emoji: '📅',
    words: {
      en: [
        enWord('Monday', 'понедельник', { part_of_speech: 'noun' }),
        enWord('Tuesday', 'вторник', { part_of_speech: 'noun' }),
        enWord('Wednesday', 'среда', { part_of_speech: 'noun' }),
        enWord('Thursday', 'четверг', { part_of_speech: 'noun' }),
        enWord('Friday', 'пятница', { part_of_speech: 'noun' }),
        enWord('Saturday', 'суббота', { part_of_speech: 'noun' }),
        enWord('Sunday', 'воскресенье', { part_of_speech: 'noun' }),
        enWord('January', 'январь', { part_of_speech: 'noun' }),
        enWord('February', 'февраль', { part_of_speech: 'noun' }),
        enWord('March', 'март', { part_of_speech: 'noun' }),
        enWord('April', 'апрель', { part_of_speech: 'noun' }),
        enWord('May', 'май', { part_of_speech: 'noun' }),
        enWord('June', 'июнь', { part_of_speech: 'noun' }),
        enWord('July', 'июль', { part_of_speech: 'noun' }),
        enWord('August', 'август', { part_of_speech: 'noun' }),
        enWord('September', 'сентябрь', { part_of_speech: 'noun' }),
        enWord('October', 'октябрь', { part_of_speech: 'noun' }),
        enWord('November', 'ноябрь', { part_of_speech: 'noun' }),
        enWord('December', 'декабрь', { part_of_speech: 'noun' }),
      ],
      zh: [
        zhWord('星期一', 'xīng qī yī', 'понедельник', { part_of_speech: 'noun' }),
        zhWord('星期二', 'xīng qī èr', 'вторник', { part_of_speech: 'noun' }),
        zhWord('星期三', 'xīng qī sān', 'среда', { part_of_speech: 'noun' }),
        zhWord('星期四', 'xīng qī sì', 'четверг', { part_of_speech: 'noun' }),
        zhWord('星期五', 'xīng qī wǔ', 'пятница', { part_of_speech: 'noun' }),
        zhWord('星期六', 'xīng qī liù', 'суббота', { part_of_speech: 'noun' }),
        zhWord('星期天', 'xīng qī tiān', 'воскресенье', { part_of_speech: 'noun' }),
        zhWord('一月', 'yī yuè', 'январь', { part_of_speech: 'noun' }),
        zhWord('二月', 'èr yuè', 'февраль', { part_of_speech: 'noun' }),
        zhWord('三月', 'sān yuè', 'март', { part_of_speech: 'noun' }),
        zhWord('四月', 'sì yuè', 'апрель', { part_of_speech: 'noun' }),
        zhWord('五月', 'wǔ yuè', 'май', { part_of_speech: 'noun' }),
        zhWord('六月', 'liù yuè', 'июнь', { part_of_speech: 'noun' }),
        zhWord('七月', 'qī yuè', 'июль', { part_of_speech: 'noun' }),
        zhWord('八月', 'bā yuè', 'август', { part_of_speech: 'noun' }),
        zhWord('九月', 'jiǔ yuè', 'сентябрь', { part_of_speech: 'noun' }),
        zhWord('十月', 'shí yuè', 'октябрь', { part_of_speech: 'noun' }),
        zhWord('十一月', 'shí yī yuè', 'ноябрь', { part_of_speech: 'noun' }),
        zhWord('十二月', 'shí èr yuè', 'декабрь', { part_of_speech: 'noun' }),
      ],
    },
  },
  {
    id: 'greetings',
    title: 'Приветствия',
    subtitle: 'Привет, пожалуйста, спасибо',
    color: '#4ade80',
    icon: 'spark',
    emoji: '✨',
    words: {
      en: [
        enWord('hello', 'привет', { part_of_speech: 'interjection' }),
        enWord('hi', 'привет', { part_of_speech: 'interjection' }),
        enWord('good morning', 'доброе утро', { part_of_speech: 'phrase' }),
        enWord('good afternoon', 'добрый день', { part_of_speech: 'phrase' }),
        enWord('good evening', 'добрый вечер', { part_of_speech: 'phrase' }),
        enWord('goodbye', 'до свидания', { part_of_speech: 'interjection' }),
        enWord('bye', 'пока', { part_of_speech: 'interjection' }),
        enWord('see you', 'увидимся', { part_of_speech: 'phrase' }),
        enWord('please', 'пожалуйста', { part_of_speech: 'adverb' }),
        enWord('thank you', 'спасибо', { part_of_speech: 'phrase' }),
        enWord('thanks', 'спасибо', { part_of_speech: 'noun' }),
        enWord("you're welcome", 'пожалуйста / не за что', { part_of_speech: 'phrase' }),
        enWord('sorry', 'извините', { part_of_speech: 'adjective' }),
        enWord('excuse me', 'простите', { part_of_speech: 'phrase' }),
        enWord('nice to meet you', 'приятно познакомиться', { part_of_speech: 'phrase' }),
      ],
      zh: [
        zhWord('你好', 'nǐ hǎo', 'привет', { part_of_speech: 'phrase' }),
        zhWord('您好', 'nín hǎo', 'здравствуйте', { part_of_speech: 'phrase' }),
        zhWord('早上好', 'zǎo shang hǎo', 'доброе утро', { part_of_speech: 'phrase' }),
        zhWord('晚上好', 'wǎn shang hǎo', 'добрый вечер', { part_of_speech: 'phrase' }),
        zhWord('再见', 'zài jiàn', 'до свидания', { part_of_speech: 'phrase' }),
        zhWord('拜拜', 'bái bái', 'пока', { part_of_speech: 'phrase' }),
        zhWord('请', 'qǐng', 'пожалуйста', { part_of_speech: 'verb' }),
        zhWord('谢谢', 'xiè xie', 'спасибо', { part_of_speech: 'verb' }),
        zhWord('不客气', 'bú kè qi', 'не за что', { part_of_speech: 'phrase' }),
        zhWord('对不起', 'duì bu qǐ', 'извините', { part_of_speech: 'phrase' }),
        zhWord('不好意思', 'bù hǎo yì si', 'простите', { part_of_speech: 'phrase' }),
        zhWord('认识你很高兴', 'rèn shi nǐ hěn gāo xìng', 'приятно познакомиться', { part_of_speech: 'phrase' }),
        zhWord('欢迎', 'huān yíng', 'добро пожаловать', { part_of_speech: 'verb' }),
        zhWord('晚安', 'wǎn ān', 'спокойной ночи', { part_of_speech: 'phrase' }),
        zhWord('早安', 'zǎo ān', 'доброе утро', { part_of_speech: 'phrase' }),
      ],
    },
  },
  {
    id: 'family',
    title: 'Семья',
    subtitle: 'Мать, отец, родственники',
    color: '#f472b6',
    icon: 'people',
    emoji: '👨‍👩‍👧',
    words: {
      en: [
        enWord('mother', 'мать', { part_of_speech: 'noun' }),
        enWord('father', 'отец', { part_of_speech: 'noun' }),
        enWord('parents', 'родители', { part_of_speech: 'noun' }),
        enWord('sister', 'сестра', { part_of_speech: 'noun' }),
        enWord('brother', 'брат', { part_of_speech: 'noun' }),
        enWord('son', 'сын', { part_of_speech: 'noun' }),
        enWord('daughter', 'дочь', { part_of_speech: 'noun' }),
        enWord('grandmother', 'бабушка', { part_of_speech: 'noun' }),
        enWord('grandfather', 'дедушка', { part_of_speech: 'noun' }),
        enWord('husband', 'муж', { part_of_speech: 'noun' }),
        enWord('wife', 'жена', { part_of_speech: 'noun' }),
        enWord('child', 'ребёнок', { part_of_speech: 'noun' }),
      ],
      zh: [
        zhWord('妈妈', 'mā ma', 'мама', { part_of_speech: 'noun' }),
        zhWord('爸爸', 'bà ba', 'папа', { part_of_speech: 'noun' }),
        zhWord('父母', 'fù mǔ', 'родители', { part_of_speech: 'noun' }),
        zhWord('姐姐', 'jiě jie', 'старшая сестра', { part_of_speech: 'noun' }),
        zhWord('哥哥', 'gē ge', 'старший брат', { part_of_speech: 'noun' }),
        zhWord('妹妹', 'mèi mei', 'младшая сестра', { part_of_speech: 'noun' }),
        zhWord('弟弟', 'dì di', 'младший брат', { part_of_speech: 'noun' }),
        zhWord('儿子', 'ér zi', 'сын', { part_of_speech: 'noun' }),
        zhWord('女儿', 'nǚ ér', 'дочь', { part_of_speech: 'noun' }),
        zhWord('奶奶', 'nǎi nai', 'бабушка', { part_of_speech: 'noun' }),
        zhWord('爷爷', 'yé ye', 'дедушка', { part_of_speech: 'noun' }),
        zhWord('孩子', 'hái zi', 'ребёнок', { part_of_speech: 'noun' }),
      ],
    },
  },
  {
    id: 'body',
    title: 'Части тела',
    subtitle: 'С головы до пят',
    color: '#f87171',
    icon: 'person',
    emoji: '🧍',
    words: {
      en: [
        enWord('head', 'голова', { part_of_speech: 'noun' }),
        enWord('hair', 'волосы', { part_of_speech: 'noun' }),
        enWord('eye', 'глаз', { part_of_speech: 'noun' }),
        enWord('ear', 'ухо', { part_of_speech: 'noun' }),
        enWord('nose', 'нос', { part_of_speech: 'noun' }),
        enWord('mouth', 'рот', { part_of_speech: 'noun' }),
        enWord('tooth', 'зуб', { part_of_speech: 'noun' }),
        enWord('face', 'лицо', { part_of_speech: 'noun' }),
        enWord('neck', 'шея', { part_of_speech: 'noun' }),
        enWord('shoulder', 'плечо', { part_of_speech: 'noun' }),
        enWord('arm', 'рука (от плеча)', { part_of_speech: 'noun' }),
        enWord('hand', 'кисть руки', { part_of_speech: 'noun' }),
        enWord('finger', 'палец', { part_of_speech: 'noun' }),
        enWord('chest', 'грудь', { part_of_speech: 'noun' }),
        enWord('back', 'спина', { part_of_speech: 'noun' }),
        enWord('stomach', 'живот', { part_of_speech: 'noun' }),
        enWord('leg', 'нога', { part_of_speech: 'noun' }),
        enWord('knee', 'колено', { part_of_speech: 'noun' }),
        enWord('foot', 'ступня', { part_of_speech: 'noun' }),
        enWord('skin', 'кожа', { part_of_speech: 'noun' }),
      ],
      zh: [
        zhWord('头', 'tóu', 'голова', { part_of_speech: 'noun' }),
        zhWord('头发', 'tóu fa', 'волосы', { part_of_speech: 'noun' }),
        zhWord('眼睛', 'yǎn jing', 'глаза', { part_of_speech: 'noun' }),
        zhWord('耳朵', 'ěr duo', 'уши', { part_of_speech: 'noun' }),
        zhWord('鼻子', 'bí zi', 'нос', { part_of_speech: 'noun' }),
        zhWord('嘴巴', 'zuǐ ba', 'рот', { part_of_speech: 'noun' }),
        zhWord('牙齿', 'yá chǐ', 'зубы', { part_of_speech: 'noun' }),
        zhWord('脸', 'liǎn', 'лицо', { part_of_speech: 'noun' }),
        zhWord('脖子', 'bó zi', 'шея', { part_of_speech: 'noun' }),
        zhWord('肩膀', 'jiān bǎng', 'плечо', { part_of_speech: 'noun' }),
        zhWord('手', 'shǒu', 'рука', { part_of_speech: 'noun' }),
        zhWord('手指', 'shǒu zhǐ', 'палец', { part_of_speech: 'noun' }),
        zhWord('胳膊', 'gē bo', 'рука (от плеча)', { part_of_speech: 'noun' }),
        zhWord('腿', 'tuǐ', 'нога', { part_of_speech: 'noun' }),
        zhWord('脚', 'jiǎo', 'ступня', { part_of_speech: 'noun' }),
        zhWord('肚子', 'dù zi', 'живот', { part_of_speech: 'noun' }),
        zhWord('背', 'bèi', 'спина', { part_of_speech: 'noun' }),
        zhWord('膝盖', 'xī gài', 'колено', { part_of_speech: 'noun' }),
        zhWord('身体', 'shēn tǐ', 'тело', { part_of_speech: 'noun' }),
        zhWord('心', 'xīn', 'сердце', { part_of_speech: 'noun' }),
      ],
    },
  },
  {
    id: 'food',
    title: 'Еда и напитки',
    subtitle: 'Хлеб, вода и многое другое',
    color: '#f59e0b',
    icon: 'utensils',
    emoji: '🍽',
    words: {
      en: [
        enWord('bread', 'хлеб', { part_of_speech: 'noun' }),
        enWord('water', 'вода', { part_of_speech: 'noun' }),
        enWord('tea', 'чай', { part_of_speech: 'noun' }),
        enWord('coffee', 'кофе', { part_of_speech: 'noun' }),
        enWord('milk', 'молоко', { part_of_speech: 'noun' }),
        enWord('juice', 'сок', { part_of_speech: 'noun' }),
        enWord('rice', 'рис', { part_of_speech: 'noun' }),
        enWord('meat', 'мясо', { part_of_speech: 'noun' }),
        enWord('fish', 'рыба', { part_of_speech: 'noun' }),
        enWord('chicken', 'курица', { part_of_speech: 'noun' }),
        enWord('egg', 'яйцо', { part_of_speech: 'noun' }),
        enWord('cheese', 'сыр', { part_of_speech: 'noun' }),
        enWord('apple', 'яблоко', { part_of_speech: 'noun' }),
        enWord('banana', 'банан', { part_of_speech: 'noun' }),
        enWord('vegetable', 'овощ', { part_of_speech: 'noun' }),
        enWord('soup', 'суп', { part_of_speech: 'noun' }),
        enWord('salt', 'соль', { part_of_speech: 'noun' }),
        enWord('sugar', 'сахар', { part_of_speech: 'noun' }),
        enWord('breakfast', 'завтрак', { part_of_speech: 'noun' }),
        enWord('dinner', 'ужин', { part_of_speech: 'noun' }),
      ],
      zh: [
        zhWord('水', 'shuǐ', 'вода', { part_of_speech: 'noun' }),
        zhWord('茶', 'chá', 'чай', { part_of_speech: 'noun' }),
        zhWord('咖啡', 'kā fēi', 'кофе', { part_of_speech: 'noun' }),
        zhWord('米饭', 'mǐ fàn', 'рис', { part_of_speech: 'noun' }),
        zhWord('面包', 'miàn bāo', 'хлеб', { part_of_speech: 'noun' }),
        zhWord('肉', 'ròu', 'мясо', { part_of_speech: 'noun' }),
        zhWord('鱼', 'yú', 'рыба', { part_of_speech: 'noun' }),
        zhWord('鸡蛋', 'jī dàn', 'яйцо', { part_of_speech: 'noun' }),
        zhWord('牛奶', 'niú nǎi', 'молоко', { part_of_speech: 'noun' }),
        zhWord('苹果', 'píng guǒ', 'яблоко', { part_of_speech: 'noun' }),
        zhWord('香蕉', 'xiāng jiāo', 'банан', { part_of_speech: 'noun' }),
        zhWord('菜', 'cài', 'овощи / блюдо', { part_of_speech: 'noun' }),
        zhWord('汤', 'tāng', 'суп', { part_of_speech: 'noun' }),
        zhWord('盐', 'yán', 'соль', { part_of_speech: 'noun' }),
        zhWord('糖', 'táng', 'сахар', { part_of_speech: 'noun' }),
        zhWord('早饭', 'zǎo fàn', 'завтрак', { part_of_speech: 'noun' }),
        zhWord('晚饭', 'wǎn fàn', 'ужин', { part_of_speech: 'noun' }),
        zhWord('果汁', 'guǒ zhī', 'сок', { part_of_speech: 'noun' }),
        zhWord('面条', 'miàn tiáo', 'лапша', { part_of_speech: 'noun' }),
        zhWord('水果', 'shuǐ guǒ', 'фрукты', { part_of_speech: 'noun' }),
      ],
    },
  },
  {
    id: 'verbs',
    title: 'Основные глаголы',
    subtitle: 'Быть, иметь, идти',
    color: '#60a5fa',
    icon: 'bolt',
    emoji: '⚡',
    words: {
      en: [
        enWord('be', 'быть', { part_of_speech: 'verb' }),
        enWord('have', 'иметь', { part_of_speech: 'verb' }),
        enWord('do', 'делать', { part_of_speech: 'verb' }),
        enWord('go', 'идти, ехать', { part_of_speech: 'verb' }),
        enWord('come', 'приходить', { part_of_speech: 'verb' }),
        enWord('see', 'видеть', { part_of_speech: 'verb' }),
        enWord('know', 'знать', { part_of_speech: 'verb' }),
        enWord('think', 'думать', { part_of_speech: 'verb' }),
        enWord('want', 'хотеть', { part_of_speech: 'verb' }),
        enWord('like', 'нравиться', { part_of_speech: 'verb' }),
        enWord('eat', 'есть', { part_of_speech: 'verb' }),
        enWord('drink', 'пить', { part_of_speech: 'verb' }),
        enWord('speak', 'говорить', { part_of_speech: 'verb' }),
        enWord('say', 'сказать', { part_of_speech: 'verb' }),
        enWord('make', 'делать, создавать', { part_of_speech: 'verb' }),
        enWord('take', 'брать', { part_of_speech: 'verb' }),
        enWord('give', 'давать', { part_of_speech: 'verb' }),
        enWord('get', 'получать', { part_of_speech: 'verb' }),
        enWord('work', 'работать', { part_of_speech: 'verb' }),
        enWord('live', 'жить', { part_of_speech: 'verb' }),
      ],
      zh: [
        zhWord('是', 'shì', 'быть', { part_of_speech: 'verb' }),
        zhWord('有', 'yǒu', 'иметь', { part_of_speech: 'verb' }),
        zhWord('去', 'qù', 'идти, ехать', { part_of_speech: 'verb' }),
        zhWord('来', 'lái', 'приходить', { part_of_speech: 'verb' }),
        zhWord('看', 'kàn', 'смотреть', { part_of_speech: 'verb' }),
        zhWord('知道', 'zhī dào', 'знать', { part_of_speech: 'verb' }),
        zhWord('想', 'xiǎng', 'хотеть / думать', { part_of_speech: 'verb' }),
        zhWord('要', 'yào', 'хотеть, нужно', { part_of_speech: 'verb' }),
        zhWord('喜欢', 'xǐ huan', 'нравиться', { part_of_speech: 'verb' }),
        zhWord('吃', 'chī', 'есть', { part_of_speech: 'verb' }),
        zhWord('喝', 'hē', 'пить', { part_of_speech: 'verb' }),
        zhWord('说', 'shuō', 'говорить', { part_of_speech: 'verb' }),
        zhWord('做', 'zuò', 'делать', { part_of_speech: 'verb' }),
        zhWord('给', 'gěi', 'давать', { part_of_speech: 'verb' }),
        zhWord('走', 'zǒu', 'идти', { part_of_speech: 'verb' }),
        zhWord('工作', 'gōng zuò', 'работать', { part_of_speech: 'verb' }),
        zhWord('住', 'zhù', 'жить', { part_of_speech: 'verb' }),
        zhWord('学', 'xué', 'учиться', { part_of_speech: 'verb' }),
        zhWord('听', 'tīng', 'слушать', { part_of_speech: 'verb' }),
        zhWord('写', 'xiě', 'писать', { part_of_speech: 'verb' }),
      ],
    },
  },
]

export function getSystemWordListMeta(language) {
  const lang = language === 'zh' ? 'zh' : 'en'
  return SYSTEM_WORD_LISTS.map((pack) => ({
    id: pack.id,
    title: pack.title,
    subtitle: pack.subtitle,
    color: pack.color,
    icon: pack.icon,
    word_count: (pack.words[lang] || []).length,
  }))
}

export function getSystemWordListById(id) {
  return SYSTEM_WORD_LISTS.find((pack) => pack.id === id) || null
}

function publicCategory(category, wordCount) {
  return {
    ...category,
    word_count: wordCount ?? category.word_count ?? 0,
  }
}

export function registerVocabularySystemListRoutes(app, {
  supabase,
  safeSupabaseCall,
  getBearerToken,
  resolveVocabularyLanguage,
  normalizeWord,
}) {
  async function requireUser(req, res) {
    const token = getBearerToken(req)
    if (!token) {
      res.status(401).json({ error: 'Missing Authorization Bearer token' })
      return null
    }
    let userData
    let userErr
    try {
      const result = await Promise.resolve(supabase.auth.getUser(token))
      userData = result.data
      userErr = result.error
    } catch (authError) {
      const errorCode = authError?.cause?.code || authError?.code || authError?.error?.code
      if (errorCode === 'UND_ERR_CONNECT_TIMEOUT' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNRESET') {
        res.status(502).json({ error: 'Не удалось подключиться к Supabase (таймаут соединения).' })
        return null
      }
      throw authError
    }
    if (userErr || !userData?.user) {
      res.status(401).json({ error: 'Invalid or expired token' })
      return null
    }
    return userData.user
  }

  async function findCategoryByName(userId, name, language) {
    const { data, error } = await safeSupabaseCall(
      () => supabase
        .from('vocabulary_categories')
        .select('*')
        .eq('user_id', userId)
        .eq('language', language)
        .eq('name', name)
        .maybeSingle(),
      { timeoutMs: 10000, maxRetries: 1 },
    )
    if (error) throw error
    return data || null
  }

  async function ensureWordsInCategory({ userId, language, category, sourceWords }) {
    const prepared = []
    const seen = new Set()
    for (const item of sourceWords) {
      const normalized = normalizeWord(item.word)
      if (!normalized || seen.has(normalized)) continue
      seen.add(normalized)
      prepared.push({
        word: normalized,
        translations: Array.isArray(item.translations) ? item.translations : t(String(item.translation || '').trim()),
        difficulty_level: item.difficulty_level || (language === 'zh' ? null : 'A1'),
        part_of_speech: item.part_of_speech || null,
        pinyin: typeof item.pinyin === 'string' && item.pinyin.trim() ? item.pinyin.trim() : null,
        hsk_level: [1, 2, 3, 4, 5, 6].includes(Number(item.hsk_level)) ? Number(item.hsk_level) : null,
      })
    }

    if (prepared.length === 0) {
      return { imported: 0, linked: 0, skipped: 0 }
    }

    const wordKeys = prepared.map((w) => w.word)
    const { data: existingRows, error: existingError } = await safeSupabaseCall(
      () => supabase
        .from('user_vocabulary')
        .select('id, word')
        .eq('user_id', userId)
        .eq('language', language)
        .in('word', wordKeys),
      { timeoutMs: 15000, maxRetries: 2 },
    )
    if (existingError) throw existingError

    const existingByWord = new Map((existingRows || []).map((row) => [row.word, row.id]))
    const now = new Date().toISOString()
    const toInsert = prepared
      .filter((item) => !existingByWord.has(item.word))
      .map((item) => {
        const row = {
          user_id: userId,
          word: item.word,
          language,
          translations: item.translations,
          contexts: [],
          difficulty_level: item.difficulty_level,
          part_of_speech: item.part_of_speech,
          mastery_level: 1,
          times_seen: 1,
          next_review_at: now,
        }
        if (language === 'zh') {
          row.pinyin = item.pinyin
          row.hsk_level = item.hsk_level
        }
        return row
      })

    let imported = 0
    if (toInsert.length > 0) {
      const { data: inserted, error: insertError } = await safeSupabaseCall(
        () => supabase.from('user_vocabulary').insert(toInsert).select('id, word'),
        { timeoutMs: 20000, maxRetries: 2 },
      )
      if (insertError) throw insertError
      imported = inserted?.length || 0
      for (const row of inserted || []) {
        existingByWord.set(row.word, row.id)
      }
    }

    const vocabIds = prepared.map((item) => existingByWord.get(item.word)).filter(Boolean)
    const { data: existingLinks, error: linksError } = await safeSupabaseCall(
      () => supabase
        .from('user_vocabulary_categories')
        .select('vocabulary_id')
        .eq('user_id', userId)
        .eq('category_id', category.id)
        .in('vocabulary_id', vocabIds),
      { timeoutMs: 15000, maxRetries: 2 },
    )
    if (linksError) throw linksError

    const linkedSet = new Set((existingLinks || []).map((row) => row.vocabulary_id))
    const newLinks = vocabIds
      .filter((id) => !linkedSet.has(id))
      .map((vocabulary_id) => ({
        user_id: userId,
        vocabulary_id,
        category_id: category.id,
      }))

    if (newLinks.length > 0) {
      const { error: linkInsertError } = await safeSupabaseCall(
        () => supabase.from('user_vocabulary_categories').insert(newLinks),
        { timeoutMs: 15000, maxRetries: 2 },
      )
      if (linkInsertError) throw linkInsertError
    }

    return {
      imported,
      linked: newLinks.length,
      skipped: prepared.length - imported,
    }
  }

  app.get('/api/vocabulary/system-lists', async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const language = await resolveVocabularyLanguage(req, user.id)
      const lists = getSystemWordListMeta(language)

      const { data: categories, error } = await safeSupabaseCall(
        () => supabase
          .from('vocabulary_categories')
          .select('id, name')
          .eq('user_id', user.id)
          .eq('language', language),
        { timeoutMs: 10000, maxRetries: 1 },
      )
      if (error) throw error

      const byName = new Map((categories || []).map((row) => [row.name, row.id]))
      return res.json({
        ok: true,
        language,
        lists: lists.map((pack) => ({
          ...pack,
          in_library: byName.has(pack.title),
          category_id: byName.get(pack.title) || null,
        })),
      })
    } catch (error) {
      console.error('[api/vocabulary/system-lists] Error:', error)
      return res.status(500).json({ error: 'Failed to load system word lists', details: error.message })
    }
  })

  app.post('/api/vocabulary/system-lists/:id', async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const language = await resolveVocabularyLanguage(req, user.id)
      const pack = getSystemWordListById(req.params.id)
      if (!pack) {
        return res.status(404).json({ error: 'System list not found' })
      }
      const sourceWords = pack.words[language] || []
      if (sourceWords.length === 0) {
        return res.status(400).json({ error: 'No words for the current learning language' })
      }

      let category = await findCategoryByName(user.id, pack.title, language)
      let created = false
      if (!category) {
        const { data: createdCategory, error: createError } = await safeSupabaseCall(
          () => supabase
            .from('vocabulary_categories')
            .insert({
              user_id: user.id,
              name: pack.title,
              description: pack.subtitle,
              color: pack.color,
              icon: pack.emoji || pack.icon,
              language,
            })
            .select()
            .single(),
          { timeoutMs: 15000, maxRetries: 2 },
        )
        if (createError) {
          if (createError.code === '23505') {
            category = await findCategoryByName(user.id, pack.title, language)
          } else {
            throw createError
          }
        } else {
          category = createdCategory
          created = true
        }
      }
      if (!category) {
        return res.status(500).json({ error: 'Failed to create category' })
      }

      const stats = await ensureWordsInCategory({
        userId: user.id,
        language,
        category,
        sourceWords,
      })

      return res.json({
        ok: true,
        created,
        imported: stats.imported,
        linked: stats.linked,
        skipped: stats.skipped,
        category: publicCategory(category, sourceWords.length),
      })
    } catch (error) {
      console.error('[api/vocabulary/system-lists/:id] Error:', error)
      return res.status(500).json({ error: 'Failed to install system list', details: error.message })
    }
  })

  app.post('/api/vocabulary/custom-list', async (req, res) => {
    try {
      const user = await requireUser(req, res)
      if (!user) return
      const language = await resolveVocabularyLanguage(req, user.id)
      const { name, description, color, icon, words } = req.body || {}
      const title = typeof name === 'string' ? name.trim() : ''
      if (!title) {
        return res.status(400).json({ error: 'Category name is required' })
      }
      if (!Array.isArray(words) || words.length === 0) {
        return res.status(400).json({ error: 'At least one word is required' })
      }

      const sourceWords = words.slice(0, 80).map((item) => {
        const row = item && typeof item === 'object' ? item : {}
        const translation = typeof row.translation === 'string' ? row.translation.trim() : ''
        return {
          word: row.word,
          pinyin: row.pinyin,
          hsk_level: row.hsk_level,
          difficulty_level: language === 'zh' ? null : (row.difficulty_level || 'A1'),
          part_of_speech: row.part_of_speech || null,
          translations: translation ? t(translation) : (Array.isArray(row.translations) ? row.translations : []),
        }
      })

      const existing = await findCategoryByName(user.id, title, language)
      if (existing) {
        return res.status(409).json({ error: 'Category with this name already exists', category: existing })
      }

      const { data: category, error: createError } = await safeSupabaseCall(
        () => supabase
          .from('vocabulary_categories')
          .insert({
            user_id: user.id,
            name: title,
            description: typeof description === 'string' && description.trim() ? description.trim() : null,
            color: typeof color === 'string' && color.trim() ? color.trim() : '#7ad7a7',
            icon: typeof icon === 'string' && icon.trim() ? icon.trim() : '✨',
            language,
          })
          .select()
          .single(),
        { timeoutMs: 15000, maxRetries: 2 },
      )
      if (createError) {
        if (createError.code === '23505') {
          return res.status(409).json({ error: 'Category with this name already exists' })
        }
        throw createError
      }

      const stats = await ensureWordsInCategory({
        userId: user.id,
        language,
        category,
        sourceWords,
      })

      return res.json({
        ok: true,
        created: true,
        imported: stats.imported,
        linked: stats.linked,
        skipped: stats.skipped,
        category: publicCategory(category, stats.imported + stats.skipped),
      })
    } catch (error) {
      console.error('[api/vocabulary/custom-list] Error:', error)
      return res.status(500).json({ error: 'Failed to create custom list', details: error.message })
    }
  })
}
