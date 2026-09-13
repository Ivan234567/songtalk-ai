-- Системный каталог китайских сценариев HSK 1 (базовые темы).
-- Идемпотентно: фиксированные id, повторный прогон обновляет карточки.
-- Лексика реплик — только HSK 1. Формальность 你 (您 в HSK 1 нет).

INSERT INTO zh_scenarios (
  id, user_id, source, title, description, hsk_level,
  textbook_title, lesson_no, starter, formality, slang_mode,
  archived, status, payload
) VALUES
-- 1. Знакомство
(
  'a1080000-0000-4000-8000-000000000001',
  NULL, 'system',
  'Знакомство',
  'Поздоровайся, назови имя и скажи, что приятно познакомиться.',
  1, 'HSK 1', 'Тема 1', 'ai', 'ni', 'off', false, 'ready',
  $${
    "language":"zh",
    "description":"Поздоровайся, назови имя и скажи, что приятно познакомиться.",
    "goals":["Поздороваться","Назвать своё имя","Сказать, что приятно познакомиться"],
    "textbook":{"title":"HSK 1","lesson_no":"Тема 1"},
    "starter":"ai","formality":"ni","slang_mode":"off",
    "user_role":"Новый студент",
    "ai_role":"Однокурсник",
    "ai_personality":"warm",
    "grammar_focus":"叫 — «меня зовут»: 我叫…",
    "setting_ru":"В классе в первый день",
    "scenario_text_ru":"Первый день в языковой школе. Однокурсник подходит познакомиться.",
    "character_opening":"你好！你叫什么名字？",
    "suggested_first_line":"你好！我叫安娜。",
    "suggested_first_line_pinyin":"nǐ hǎo! wǒ jiào Ānnà.",
    "max_score_tips_ru":"Говорите полными фразами, не одним словом.\n1) Поздороваться: «你好！»\n2) Имя: «我叫安娜.»\n3) Знакомство: «很高兴认识你.»",
    "steps":[
      {"id":"greet","order":1,"title_ru":"Поздороваться","expected_user_action":"Сказать 你好","ai_context":"Ответь приветствием и спроси имя, если ещё не спросил.","keywords":["你好","nǐ hǎo"],"example_zh":"你好！"},
      {"id":"name","order":2,"title_ru":"Назвать имя","expected_user_action":"Сказать, как тебя зовут: 我叫…","ai_context":"Повтори имя и представься сам: 我叫…","keywords":["叫","名字","我叫"],"example_zh":"我叫安娜。"},
      {"id":"nice","order":3,"title_ru":"Приятно познакомиться","expected_user_action":"Сказать 很高兴认识你","ai_context":"Ответь тем же и попрощайся, если сцена закрыта.","keywords":["高兴","认识","认识你"],"example_zh":"很高兴认识你。"}
    ],
    "vocabulary":[
      {"hanzi":"你好","pinyin":"nǐ hǎo","translation_ru":"привет / здравствуй","hsk_level":1,"usage":"must_say"},
      {"hanzi":"叫","pinyin":"jiào","translation_ru":"звать(ся)","hsk_level":1,"usage":"must_say"},
      {"hanzi":"名字","pinyin":"míngzi","translation_ru":"имя","hsk_level":1,"usage":"must_say"},
      {"hanzi":"认识","pinyin":"rènshi","translation_ru":"быть знакомым","hsk_level":1,"usage":"must_say"},
      {"hanzi":"高兴","pinyin":"gāoxìng","translation_ru":"радостный","hsk_level":1,"usage":"must_say"},
      {"hanzi":"什么","pinyin":"shénme","translation_ru":"что","hsk_level":1,"usage":"model"},
      {"hanzi":"你","pinyin":"nǐ","translation_ru":"ты","hsk_level":1,"usage":"model"}
    ]
  }$$::jsonb
),
-- 2. Страна и учёба
(
  'a1080000-0000-4000-8000-000000000002',
  NULL, 'system',
  'Страна и учёба',
  'Скажи, кто ты, что ты студент и что учишь китайский.',
  1, 'HSK 1', 'Тема 2', 'ai', 'ni', 'off', false, 'ready',
  $${
    "language":"zh",
    "description":"Скажи, кто ты, что ты студент и что учишь китайский.",
    "goals":["Ответить, кто ты / откуда","Сказать, что ты студент","Сказать, что учишь китайский"],
    "textbook":{"title":"HSK 1","lesson_no":"Тема 2"},
    "starter":"ai","formality":"ni","slang_mode":"off",
    "user_role":"Студент языковой школы",
    "ai_role":"Однокурсник",
    "ai_personality":"chatty",
    "grammar_focus":"是 — «я есть…»: 我是学生",
    "setting_ru":"В коридоре школы",
    "scenario_text_ru":"Новый однокурсник спрашивает, кто ты и что учишь.",
    "character_opening":"你好！你是哪国人？",
    "suggested_first_line":"我是学生。",
    "suggested_first_line_pinyin":"wǒ shì xuésheng.",
    "max_score_tips_ru":"Полные фразы.\n1) Кто ты: «我是学生.» или «我是中国人.»\n2) Учёба: «我学习汉语.»\n3) Можно спросить в ответ: «你呢？」",
    "steps":[
      {"id":"who","order":1,"title_ru":"Сказать, кто ты","expected_user_action":"Ответить 我是… (студент / из какой страны)","ai_context":"Прими ответ и спроси, студент ли он, если ещё не ясно.","keywords":["是","人","哪国"],"example_zh":"我是学生。"},
      {"id":"student","order":2,"title_ru":"Сказать, что студент","expected_user_action":"Сказать 我是学生","ai_context":"Кивни и спроси, что он учит.","keywords":["学生","xuésheng"],"example_zh":"我是学生。"},
      {"id":"chinese","order":3,"title_ru":"Сказать, что учишь китайский","expected_user_action":"Сказать 我学习汉语","ai_context":"Похвали коротко: 汉语很好！ и закрой сцену.","keywords":["学习","汉语"],"example_zh":"我学习汉语。"}
    ],
    "vocabulary":[
      {"hanzi":"是","pinyin":"shì","translation_ru":"быть / являться","hsk_level":1,"usage":"must_say"},
      {"hanzi":"学生","pinyin":"xuésheng","translation_ru":"студент","hsk_level":1,"usage":"must_say"},
      {"hanzi":"学习","pinyin":"xuéxí","translation_ru":"учиться","hsk_level":1,"usage":"must_say"},
      {"hanzi":"汉语","pinyin":"Hànyǔ","translation_ru":"китайский язык","hsk_level":1,"usage":"must_say"},
      {"hanzi":"中国","pinyin":"Zhōngguó","translation_ru":"Китай","hsk_level":1,"usage":"model"},
      {"hanzi":"哪","pinyin":"nǎ","translation_ru":"какой / который","hsk_level":1,"usage":"model"},
      {"hanzi":"人","pinyin":"rén","translation_ru":"человек","hsk_level":1,"usage":"model"}
    ]
  }$$::jsonb
),
-- 3. Семья
(
  'a1080000-0000-4000-8000-000000000003',
  NULL, 'system',
  'Моя семья',
  'Расскажи, сколько человек в семье и кто есть дома.',
  1, 'HSK 1', 'Тема 3', 'ai', 'ni', 'off', false, 'ready',
  $${
    "language":"zh",
    "description":"Расскажи, сколько человек в семье и кто есть дома.",
    "goals":["Сказать, сколько человек в семье","Назвать папу и маму","Сказать, есть ли ещё кто-то"],
    "textbook":{"title":"HSK 1","lesson_no":"Тема 3"},
    "starter":"ai","formality":"ni","slang_mode":"off",
    "user_role":"Новый друг",
    "ai_role":"Однокурсник",
    "ai_personality":"warm",
    "grammar_focus":"有 / 几 — «есть / сколько»: 我家有三个人",
    "setting_ru":"За чаем после урока",
    "scenario_text_ru":"Однокурсник спрашивает про твою семью.",
    "character_opening":"你家有几个人？",
    "suggested_first_line":"我家有三个人。",
    "suggested_first_line_pinyin":"wǒ jiā yǒu sān ge rén.",
    "max_score_tips_ru":"Полные фразы.\n1) Число: «我家有三个人.»\n2) Кто: «我有爸爸和妈妈.»\n3) Можно добавить: «我有一个朋友.»",
    "steps":[
      {"id":"howmany","order":1,"title_ru":"Сколько человек","expected_user_action":"Сказать, сколько человек в семье: 有几个人","ai_context":"Повтори число и спроси, кто это.","keywords":["几","有","个人"],"example_zh":"我家有三个人。"},
      {"id":"parents","order":2,"title_ru":"Папа и мама","expected_user_action":"Назвать папу и/или маму","ai_context":"Уточни: 你有爸爸妈妈吗？ если не назвал.","keywords":["爸爸","妈妈","有"],"example_zh":"我有爸爸和妈妈。"},
      {"id":"more","order":3,"title_ru":"Кто ещё","expected_user_action":"Сказать про сына/дочь/друга или что больше никого нет","ai_context":"Коротко отреагируй и закрой тему семьи.","keywords":["儿子","女儿","朋友"],"example_zh":"我有一个朋友。"}
    ],
    "vocabulary":[
      {"hanzi":"家","pinyin":"jiā","translation_ru":"семья / дом","hsk_level":1,"usage":"must_say"},
      {"hanzi":"有","pinyin":"yǒu","translation_ru":"иметь / есть","hsk_level":1,"usage":"must_say"},
      {"hanzi":"爸爸","pinyin":"bàba","translation_ru":"папа","hsk_level":1,"usage":"must_say"},
      {"hanzi":"妈妈","pinyin":"māma","translation_ru":"мама","hsk_level":1,"usage":"must_say"},
      {"hanzi":"几","pinyin":"jǐ","translation_ru":"сколько (немного)","hsk_level":1,"usage":"model"},
      {"hanzi":"个","pinyin":"gè","translation_ru":"счётное слово","hsk_level":1,"usage":"model"},
      {"hanzi":"朋友","pinyin":"péngyou","translation_ru":"друг","hsk_level":1,"usage":"model"}
    ]
  }$$::jsonb
),
-- 4. Возраст
(
  'a1080000-0000-4000-8000-000000000004',
  NULL, 'system',
  'Сколько тебе лет',
  'Назови свой возраст и спроси возраст собеседника.',
  1, 'HSK 1', 'Тема 4', 'ai', 'ni', 'off', false, 'ready',
  $${
    "language":"zh",
    "description":"Назови свой возраст и спроси возраст собеседника.",
    "goals":["Назвать свой возраст","Спросить, сколько лет собеседнику","Сказать возраст кого-то из семьи"],
    "textbook":{"title":"HSK 1","lesson_no":"Тема 4"},
    "starter":"ai","formality":"ni","slang_mode":"off",
    "user_role":"Студент",
    "ai_role":"Однокурсник",
    "ai_personality":"patient",
    "grammar_focus":"几岁 — возраст: 我二十岁",
    "setting_ru":"В классе на перемене",
    "scenario_text_ru":"Однокурсник спрашивает, сколько тебе лет.",
    "character_opening":"你几岁？",
    "suggested_first_line":"我二十岁。",
    "suggested_first_line_pinyin":"wǒ èrshí suì.",
    "max_score_tips_ru":"Полные фразы с 岁.\n1) Свой возраст: «我二十岁.»\n2) Вопрос: «你几岁？」\n3) Семья: «我爸爸四十岁.»",
    "steps":[
      {"id":"myage","order":1,"title_ru":"Назвать возраст","expected_user_action":"Сказать 我…岁","ai_context":"Повтори возраст и скажи свой, если спросят.","keywords":["岁","suì"],"example_zh":"我二十岁。"},
      {"id":"askage","order":2,"title_ru":"Спросить возраст","expected_user_action":"Спросить 你几岁？","ai_context":"Ответь своим возрастом коротко: 我十八岁.","keywords":["几岁","你几岁"],"example_zh":"你几岁？"},
      {"id":"familyage","order":3,"title_ru":"Возраст в семье","expected_user_action":"Назвать возраст папы, мамы или друга","ai_context":"Можно спросить 你爸爸几岁？ если ученик молчит.","keywords":["爸爸","妈妈","岁"],"example_zh":"我爸爸四十岁。"}
    ],
    "vocabulary":[
      {"hanzi":"岁","pinyin":"suì","translation_ru":"год (возраст)","hsk_level":1,"usage":"must_say"},
      {"hanzi":"几","pinyin":"jǐ","translation_ru":"сколько","hsk_level":1,"usage":"must_say"},
      {"hanzi":"我","pinyin":"wǒ","translation_ru":"я","hsk_level":1,"usage":"must_say"},
      {"hanzi":"爸爸","pinyin":"bàba","translation_ru":"папа","hsk_level":1,"usage":"model"},
      {"hanzi":"大","pinyin":"dà","translation_ru":"большой / взрослый","hsk_level":1,"usage":"model"},
      {"hanzi":"十","pinyin":"shí","translation_ru":"десять","hsk_level":1,"usage":"model"}
    ]
  }$$::jsonb
),
-- 5. Который час
(
  'a1080000-0000-4000-8000-000000000005',
  NULL, 'system',
  'Который час',
  'Скажи, сколько сейчас времени, и договорись о встрече.',
  1, 'HSK 1', 'Тема 5', 'ai', 'ni', 'off', false, 'ready',
  $${
    "language":"zh",
    "description":"Скажи, сколько сейчас времени, и договорись о встрече.",
    "goals":["Сказать, сколько сейчас времени","Назвать время встречи","Подтвердить день: сегодня или завтра"],
    "textbook":{"title":"HSK 1","lesson_no":"Тема 5"},
    "starter":"ai","formality":"ni","slang_mode":"off",
    "user_role":"Однокурсник, вы договариваетесь встретиться",
    "ai_role":"Однокурсник",
    "ai_personality":"hurried",
    "ai_personality_note":"Спешит на урок, но вежлив",
    "grammar_focus":"现在 + 点 — время: 现在三点",
    "setting_ru":"У школы",
    "scenario_text_ru":"Вы хотите встретиться. Нужно понять, который час и когда прийти.",
    "character_opening":"现在几点？",
    "suggested_first_line":"现在三点。",
    "suggested_first_line_pinyin":"xiànzài sān diǎn.",
    "max_score_tips_ru":"Говорите время целиком.\n1) Сейчас: «现在三点.»\n2) Встреча: «明天上午九点.»\n3) Подтверждение: «好，明天见.»",
    "steps":[
      {"id":"now","order":1,"title_ru":"Сколько сейчас","expected_user_action":"Сказать 现在…点","ai_context":"Подтверди время и спроси, когда встретимся.","keywords":["现在","点"],"example_zh":"现在三点。"},
      {"id":"meet","order":2,"title_ru":"Время встречи","expected_user_action":"Предложить время: 上午/下午…点","ai_context":"Повтори предложенное время.","keywords":["上午","下午","点"],"example_zh":"明天上午九点。"},
      {"id":"when","order":3,"title_ru":"Сегодня или завтра","expected_user_action":"Уточнить 今天 или 明天","ai_context":"Подтверди 好 и попрощайся.","keywords":["今天","明天"],"example_zh":"明天见。"}
    ],
    "vocabulary":[
      {"hanzi":"现在","pinyin":"xiànzài","translation_ru":"сейчас","hsk_level":1,"usage":"must_say"},
      {"hanzi":"点","pinyin":"diǎn","translation_ru":"час (о времени)","hsk_level":1,"usage":"must_say"},
      {"hanzi":"明天","pinyin":"míngtiān","translation_ru":"завтра","hsk_level":1,"usage":"must_say"},
      {"hanzi":"上午","pinyin":"shàngwǔ","translation_ru":"утро / до полудня","hsk_level":1,"usage":"must_say"},
      {"hanzi":"下午","pinyin":"xiàwǔ","translation_ru":"после полудня","hsk_level":1,"usage":"model"},
      {"hanzi":"今天","pinyin":"jīntiān","translation_ru":"сегодня","hsk_level":1,"usage":"model"},
      {"hanzi":"分钟","pinyin":"fēnzhōng","translation_ru":"минута","hsk_level":1,"usage":"model"}
    ]
  }$$::jsonb
),
-- 6. В магазине
(
  'a1080000-0000-4000-8000-000000000006',
  NULL, 'system',
  'В магазине',
  'Скажи, что хочешь купить, спроси цену и купи.',
  1, 'HSK 1', 'Тема 6', 'ai', 'ni', 'off', false, 'ready',
  $${
    "language":"zh",
    "description":"Скажи, что хочешь купить, спроси цену и купи.",
    "goals":["Сказать, что хочешь купить","Спросить, сколько стоит","Согласиться купить"],
    "textbook":{"title":"HSK 1","lesson_no":"Тема 6"},
    "starter":"ai","formality":"ni","slang_mode":"off",
    "user_role":"Покупатель",
    "ai_role":"Продавец",
    "ai_personality":"hurried",
    "grammar_focus":"多少钱 — цена: 这个多少钱？",
    "setting_ru":"В маленьком магазине",
    "scenario_text_ru":"Ты в магазине. Нужно купить яблоки или одежду и узнать цену.",
    "character_opening":"你好！你想买什么？",
    "suggested_first_line":"我想买苹果。",
    "suggested_first_line_pinyin":"wǒ xiǎng mǎi píngguǒ.",
    "max_score_tips_ru":"Полные фразы.\n1) Что купить: «我想买苹果.» или «我想买衣服.»\n2) Цена: «多少钱？»\n3) Покупка: «好，我买.»",
    "steps":[
      {"id":"want","order":1,"title_ru":"Что купить","expected_user_action":"Сказать 我想买…","ai_context":"Покажи товар и назови цену, когда спросят. Цена: 五块.","keywords":["想","买","苹果","衣服"],"example_zh":"我想买苹果。"},
      {"id":"price","order":2,"title_ru":"Спросить цену","expected_user_action":"Спросить 多少钱","ai_context":"Ответь 五块. Не используй слова выше HSK 1.","keywords":["多少","钱","多少钱"],"example_zh":"这个多少钱？"},
      {"id":"buy","order":3,"title_ru":"Купить","expected_user_action":"Согласиться: 好，我买","ai_context":"Поблагодари 谢谢 и закрой покупку.","keywords":["买","好"],"example_zh":"好，我买。"}
    ],
    "vocabulary":[
      {"hanzi":"买","pinyin":"mǎi","translation_ru":"покупать","hsk_level":1,"usage":"must_say"},
      {"hanzi":"想","pinyin":"xiǎng","translation_ru":"хотеть","hsk_level":1,"usage":"must_say"},
      {"hanzi":"苹果","pinyin":"píngguǒ","translation_ru":"яблоко","hsk_level":1,"usage":"must_say"},
      {"hanzi":"多少","pinyin":"duōshao","translation_ru":"сколько","hsk_level":1,"usage":"must_say"},
      {"hanzi":"钱","pinyin":"qián","translation_ru":"деньги","hsk_level":1,"usage":"must_say"},
      {"hanzi":"块","pinyin":"kuài","translation_ru":"юань","hsk_level":1,"usage":"model"},
      {"hanzi":"衣服","pinyin":"yīfu","translation_ru":"одежда","hsk_level":1,"usage":"model"},
      {"hanzi":"这","pinyin":"zhè","translation_ru":"это","hsk_level":1,"usage":"model"}
    ]
  }$$::jsonb
),
-- 7. В столовой
(
  'a1080000-0000-4000-8000-000000000007',
  NULL, 'system',
  'В столовой',
  'Закажи, что есть и что пить, и поблагодари.',
  1, 'HSK 1', 'Тема 7', 'ai', 'ni', 'off', false, 'ready',
  $${
    "language":"zh",
    "description":"Закажи, что есть и что пить, и поблагодари.",
    "goals":["Сказать, что хочешь есть","Сказать, что хочешь пить","Поблагодарить"],
    "textbook":{"title":"HSK 1","lesson_no":"Тема 7"},
    "starter":"ai","formality":"ni","slang_mode":"off",
    "user_role":"Гость в столовой",
    "ai_role":"Сотрудник столовой",
    "ai_personality":"professional",
    "grammar_focus":"想 + глагол — «хочу…»: 我想吃米饭",
    "setting_ru":"В школьной столовой",
    "scenario_text_ru":"Обед. Сотрудник спрашивает, что ты хочешь есть и пить.",
    "character_opening":"你好！你想吃什么？",
    "suggested_first_line":"我想吃米饭。",
    "suggested_first_line_pinyin":"wǒ xiǎng chī mǐfàn.",
    "max_score_tips_ru":"Полные фразы с 想.\n1) Еда: «我想吃米饭.» или «我想吃菜.»\n2) Питьё: «我想喝茶.» / «我想喝水.»\n3) Спасибо: «谢谢.»",
    "steps":[
      {"id":"eat","order":1,"title_ru":"Что есть","expected_user_action":"Сказать 我想吃…","ai_context":"Прими заказ и спроси, что пить.","keywords":["吃","米饭","菜"],"example_zh":"我想吃米饭。"},
      {"id":"drink","order":2,"title_ru":"Что пить","expected_user_action":"Сказать 我想喝…","ai_context":"Спроси 你想喝茶？ Если нет — 你想喝水？","keywords":["喝","茶","水"],"example_zh":"我想喝茶。"},
      {"id":"thanks","order":3,"title_ru":"Поблагодарить","expected_user_action":"Сказать 谢谢","ai_context":"Ответь 不客气.","keywords":["谢谢","xièxie"],"example_zh":"谢谢。"}
    ],
    "vocabulary":[
      {"hanzi":"吃","pinyin":"chī","translation_ru":"есть","hsk_level":1,"usage":"must_say"},
      {"hanzi":"喝","pinyin":"hē","translation_ru":"пить","hsk_level":1,"usage":"must_say"},
      {"hanzi":"米饭","pinyin":"mǐfàn","translation_ru":"рис (варёный)","hsk_level":1,"usage":"must_say"},
      {"hanzi":"茶","pinyin":"chá","translation_ru":"чай","hsk_level":1,"usage":"must_say"},
      {"hanzi":"水","pinyin":"shuǐ","translation_ru":"вода","hsk_level":1,"usage":"model"},
      {"hanzi":"菜","pinyin":"cài","translation_ru":"блюдо / еда","hsk_level":1,"usage":"model"},
      {"hanzi":"想","pinyin":"xiǎng","translation_ru":"хотеть","hsk_level":1,"usage":"must_say"},
      {"hanzi":"谢谢","pinyin":"xièxie","translation_ru":"спасибо","hsk_level":1,"usage":"must_say"}
    ]
  }$$::jsonb
),
-- 8. Такси до школы
(
  'a1080000-0000-4000-8000-000000000008',
  NULL, 'system',
  'Такси до школы',
  'Скажи водителю, куда ехать, и поблагодари.',
  1, 'HSK 1', 'Тема 8', 'ai', 'ni', 'off', false, 'ready',
  $${
    "language":"zh",
    "description":"Скажи водителю, куда ехать, и поблагодари.",
    "goals":["Сказать, куда ехать","Подтвердить, что это школа","Поблагодарить"],
    "textbook":{"title":"HSK 1","lesson_no":"Тема 8"},
    "starter":"ai","formality":"ni","slang_mode":"off",
    "user_role":"Пассажир",
    "ai_role":"Водитель такси",
    "ai_personality":"patient",
    "grammar_focus":"去 + место — «ехать в…»: 我去学校",
    "setting_ru":"В такси",
    "scenario_text_ru":"Ты садишься в такси. Водитель спрашивает, куда ехать.",
    "character_opening":"你好，你去哪儿？",
    "suggested_first_line":"我去学校。",
    "suggested_first_line_pinyin":"wǒ qù xuéxiào.",
    "max_score_tips_ru":"Полные фразы.\n1) Куда: «我去学校.»\n2) Подтверждение: «是，去学校.»\n3) Спасибо: «谢谢.»",
    "steps":[
      {"id":"where","order":1,"title_ru":"Куда ехать","expected_user_action":"Сказать 我去学校 или другое место HSK 1","ai_context":"Переспроси 学校？ и жди подтверждения.","keywords":["去","学校","哪儿"],"example_zh":"我去学校。"},
      {"id":"confirm","order":2,"title_ru":"Подтвердить место","expected_user_action":"Подтвердить, что едете в школу","ai_context":"Коротко 好.","keywords":["是","学校"],"example_zh":"是，去学校。"},
      {"id":"thanks","order":3,"title_ru":"Поблагодарить","expected_user_action":"Сказать 谢谢","ai_context":"Ответь 不客气.","keywords":["谢谢","xièxie"],"example_zh":"谢谢。"}
    ],
    "vocabulary":[
      {"hanzi":"去","pinyin":"qù","translation_ru":"идти / ехать","hsk_level":1,"usage":"must_say"},
      {"hanzi":"学校","pinyin":"xuéxiào","translation_ru":"школа","hsk_level":1,"usage":"must_say"},
      {"hanzi":"出租车","pinyin":"chūzūchē","translation_ru":"такси","hsk_level":1,"usage":"model"},
      {"hanzi":"哪儿","pinyin":"nǎr","translation_ru":"где","hsk_level":1,"usage":"model"},
      {"hanzi":"坐","pinyin":"zuò","translation_ru":"сидеть / ехать (на транспорте)","hsk_level":1,"usage":"model"},
      {"hanzi":"谢谢","pinyin":"xièxie","translation_ru":"спасибо","hsk_level":1,"usage":"must_say"}
    ]
  }$$::jsonb
),
-- 9. Где больница
(
  'a1080000-0000-4000-8000-000000000009',
  NULL, 'system',
  'Где больница',
  'Спроси, где больница, уточни ориентир и поблагодари.',
  1, 'HSK 1', 'Тема 9', 'user', 'ni', 'off', false, 'ready',
  $${
    "language":"zh",
    "description":"Спроси, где больница, уточни ориентир и поблагодари.",
    "goals":["Спросить, где больница","Уточнить: впереди или сзади","Поблагодарить"],
    "textbook":{"title":"HSK 1","lesson_no":"Тема 9"},
    "starter":"user","formality":"ni","slang_mode":"off",
    "user_role":"Прохожий, ищешь больницу",
    "ai_role":"Местный житель",
    "ai_personality":"warm",
    "grammar_focus":"在哪儿 — местоположение: 医院在哪儿？",
    "setting_ru":"На улице в городе",
    "scenario_text_ru":"Ты на улице и не знаешь, где больница. Спроси прохожего.",
    "character_opening":"你好！你去哪儿？",
    "suggested_first_line":"你好，医院在哪儿？",
    "suggested_first_line_pinyin":"nǐ hǎo, yīyuàn zài nǎr?",
    "max_score_tips_ru":"Ты начинаешь разговор.\n1) Вопрос: «医院在哪儿？»\n2) Уточнение: «在前面吗？» / «在后面吗？»\n3) Спасибо: «谢谢.»",
    "steps":[
      {"id":"ask","order":1,"title_ru":"Спросить, где больница","expected_user_action":"Спросить 医院在哪儿","ai_context":"Ответь 医院在前面. Не используй 走 / 请问 — их нет в HSK 1.","keywords":["医院","在","哪儿"],"example_zh":"医院在哪儿？"},
      {"id":"front","order":2,"title_ru":"Уточнить ориентир","expected_user_action":"Уточнить 前面 или 后面","ai_context":"Подтверди 是，在前面.","keywords":["前面","后面"],"example_zh":"在前面吗？"},
      {"id":"thanks","order":3,"title_ru":"Поблагодарить","expected_user_action":"Сказать 谢谢","ai_context":"Ответь 不客气.","keywords":["谢谢","xièxie"],"example_zh":"谢谢。"}
    ],
    "vocabulary":[
      {"hanzi":"医院","pinyin":"yīyuàn","translation_ru":"больница","hsk_level":1,"usage":"must_say"},
      {"hanzi":"在","pinyin":"zài","translation_ru":"находиться в","hsk_level":1,"usage":"must_say"},
      {"hanzi":"哪儿","pinyin":"nǎr","translation_ru":"где","hsk_level":1,"usage":"must_say"},
      {"hanzi":"前面","pinyin":"qiánmiàn","translation_ru":"впереди","hsk_level":1,"usage":"must_say"},
      {"hanzi":"后面","pinyin":"hòumiàn","translation_ru":"сзади","hsk_level":1,"usage":"model"},
      {"hanzi":"怎么","pinyin":"zěnme","translation_ru":"как","hsk_level":1,"usage":"model"},
      {"hanzi":"谢谢","pinyin":"xièxie","translation_ru":"спасибо","hsk_level":1,"usage":"must_say"}
    ]
  }$$::jsonb
),
-- 10. Погода
(
  'a1080000-0000-4000-8000-00000000000a',
  NULL, 'system',
  'Какая сегодня погода',
  'Скажи, какая сегодня погода, и что ты хочешь делать.',
  1, 'HSK 1', 'Тема 10', 'ai', 'ni', 'off', false, 'ready',
  $${
    "language":"zh",
    "description":"Скажи, какая сегодня погода, и что ты хочешь делать.",
    "goals":["Оценить сегодняшнюю погоду","Сказать, холодно, жарко или дождь","Сказать, что хочешь делать"],
    "textbook":{"title":"HSK 1","lesson_no":"Тема 10"},
    "starter":"ai","formality":"ni","slang_mode":"off",
    "user_role":"Однокурсник",
    "ai_role":"Однокурсник",
    "ai_personality":"chatty",
    "grammar_focus":"怎么样 — оценка: 今天天气怎么样？",
    "setting_ru":"У окна в классе",
    "scenario_text_ru":"Перед уроком однокурсник спрашивает про погоду.",
    "character_opening":"今天天气怎么样？",
    "suggested_first_line":"今天很冷。",
    "suggested_first_line_pinyin":"jīntiān hěn lěng.",
    "max_score_tips_ru":"Полные фразы.\n1) Оценка: «今天天气很好.» / «今天很冷.»\n2) Дождь: «今天下雨.»\n3) План: «我想睡觉.» или «我不想去学校.»",
    "steps":[
      {"id":"weather","order":1,"title_ru":"Какая погода","expected_user_action":"Ответить, какая сегодня погода","ai_context":"Согласись и уточни: холодно, жарко или дождь.","keywords":["天气","怎么样","今天"],"example_zh":"今天天气很好。"},
      {"id":"feel","order":2,"title_ru":"Холодно, жарко или дождь","expected_user_action":"Сказать 冷 / 热 / 下雨","ai_context":"Коротко отреагируй и спроси, что хочет делать.","keywords":["冷","热","下雨"],"example_zh":"今天很冷。"},
      {"id":"plan","order":3,"title_ru":"Что хочешь делать","expected_user_action":"Сказать 我想… (睡觉 / 去学校 / 看电影)","ai_context":"Ответь своим планом и закрой разговор.","keywords":["想","睡觉","看"],"example_zh":"我想睡觉。"}
    ],
    "vocabulary":[
      {"hanzi":"今天","pinyin":"jīntiān","translation_ru":"сегодня","hsk_level":1,"usage":"must_say"},
      {"hanzi":"天气","pinyin":"tiānqì","translation_ru":"погода","hsk_level":1,"usage":"must_say"},
      {"hanzi":"冷","pinyin":"lěng","translation_ru":"холодный","hsk_level":1,"usage":"must_say"},
      {"hanzi":"热","pinyin":"rè","translation_ru":"жаркий","hsk_level":1,"usage":"must_say"},
      {"hanzi":"下雨","pinyin":"xià yǔ","translation_ru":"идти (о дожде)","hsk_level":1,"usage":"must_say"},
      {"hanzi":"怎么样","pinyin":"zěnmeyàng","translation_ru":"как / каков","hsk_level":1,"usage":"model"},
      {"hanzi":"睡觉","pinyin":"shuìjiào","translation_ru":"спать","hsk_level":1,"usage":"model"}
    ]
  }$$::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  hsk_level = EXCLUDED.hsk_level,
  textbook_title = EXCLUDED.textbook_title,
  lesson_no = EXCLUDED.lesson_no,
  starter = EXCLUDED.starter,
  formality = EXCLUDED.formality,
  slang_mode = EXCLUDED.slang_mode,
  archived = EXCLUDED.archived,
  status = EXCLUDED.status,
  payload = EXCLUDED.payload,
  updated_at = NOW();

-- Дочерние таблицы: пересобираем по payload, чтобы GET /:id совпадал со списком.
DELETE FROM zh_scenario_steps
WHERE scenario_id IN (
  'a1080000-0000-4000-8000-000000000001',
  'a1080000-0000-4000-8000-000000000002',
  'a1080000-0000-4000-8000-000000000003',
  'a1080000-0000-4000-8000-000000000004',
  'a1080000-0000-4000-8000-000000000005',
  'a1080000-0000-4000-8000-000000000006',
  'a1080000-0000-4000-8000-000000000007',
  'a1080000-0000-4000-8000-000000000008',
  'a1080000-0000-4000-8000-000000000009',
  'a1080000-0000-4000-8000-00000000000a'
);

DELETE FROM zh_scenario_vocab
WHERE scenario_id IN (
  'a1080000-0000-4000-8000-000000000001',
  'a1080000-0000-4000-8000-000000000002',
  'a1080000-0000-4000-8000-000000000003',
  'a1080000-0000-4000-8000-000000000004',
  'a1080000-0000-4000-8000-000000000005',
  'a1080000-0000-4000-8000-000000000006',
  'a1080000-0000-4000-8000-000000000007',
  'a1080000-0000-4000-8000-000000000008',
  'a1080000-0000-4000-8000-000000000009',
  'a1080000-0000-4000-8000-00000000000a'
);

INSERT INTO zh_scenario_steps (scenario_id, sort_order, title_ru, expected_user_action, ai_context, keywords, example_zh)
SELECT
  s.id,
  (step->>'order')::int,
  step->>'title_ru',
  step->>'expected_user_action',
  NULLIF(step->>'ai_context', ''),
  ARRAY(SELECT jsonb_array_elements_text(COALESCE(step->'keywords', '[]'::jsonb))),
  NULLIF(step->>'example_zh', '')
FROM zh_scenarios s
CROSS JOIN LATERAL jsonb_array_elements(s.payload->'steps') AS step
WHERE s.id IN (
  'a1080000-0000-4000-8000-000000000001',
  'a1080000-0000-4000-8000-000000000002',
  'a1080000-0000-4000-8000-000000000003',
  'a1080000-0000-4000-8000-000000000004',
  'a1080000-0000-4000-8000-000000000005',
  'a1080000-0000-4000-8000-000000000006',
  'a1080000-0000-4000-8000-000000000007',
  'a1080000-0000-4000-8000-000000000008',
  'a1080000-0000-4000-8000-000000000009',
  'a1080000-0000-4000-8000-00000000000a'
);

INSERT INTO zh_scenario_vocab (scenario_id, hanzi, pinyin, translation_ru, hsk_level, usage, sort_order)
SELECT
  s.id,
  v->>'hanzi',
  COALESCE(v->>'pinyin', ''),
  COALESCE(v->>'translation_ru', ''),
  NULLIF(v->>'hsk_level', '')::smallint,
  CASE WHEN v->>'usage' IN ('must_say', 'model') THEN v->>'usage' ELSE 'model' END,
  (ord - 1)
FROM zh_scenarios s
CROSS JOIN LATERAL jsonb_array_elements(s.payload->'vocabulary') WITH ORDINALITY AS t(v, ord)
WHERE s.id IN (
  'a1080000-0000-4000-8000-000000000001',
  'a1080000-0000-4000-8000-000000000002',
  'a1080000-0000-4000-8000-000000000003',
  'a1080000-0000-4000-8000-000000000004',
  'a1080000-0000-4000-8000-000000000005',
  'a1080000-0000-4000-8000-000000000006',
  'a1080000-0000-4000-8000-000000000007',
  'a1080000-0000-4000-8000-000000000008',
  'a1080000-0000-4000-8000-000000000009',
  'a1080000-0000-4000-8000-00000000000a'
);
