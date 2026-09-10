-- Системный каталог голосовых заданий (этап 4).
-- Идемпотентно: фиксированные id, повторный прогон обновляет карточки.

INSERT INTO zh_voice_tasks (
  id, user_id, source, title, description, type, hsk_level, archived, status, payload
) VALUES
(
  'a1090000-0000-4000-8000-000000000001',
  NULL, 'system',
  'Такси до школы',
  'Оставь водителю короткое голосовое: куда ехать.',
  'voicemail', 1, false, 'ready',
  $${
    "language":"zh","type":"voicemail","hsk_level":1,"time_target_sec":20,
    "description":"Оставь водителю короткое голосовое: куда ехать.",
    "situation_ru":"Ты садишься в такси.",
    "instruction_ru":"Скажи, что нужно ехать в школу, и поблагодари.",
    "checklist":[{"id":"where","label_ru":"Куда ехать"},{"id":"thanks","label_ru":"Вежливо поблагодарить"}],
    "vocabulary":[
      {"hanzi":"学校","pinyin":"xuéxiào","translation_ru":"школа","hsk_level":1},
      {"hanzi":"去","pinyin":"qù","translation_ru":"ехать / идти","hsk_level":1},
      {"hanzi":"谢谢","pinyin":"xièxie","translation_ru":"спасибо","hsk_level":1},
      {"hanzi":"师傅","pinyin":"shīfu","translation_ru":"водитель (обращение)","hsk_level":1}
    ],
    "stimulus_zh":null,"stimulus_pinyin":null,"stimulus_ru":null,"scene_ru":null,
    "model_answer_zh":"师傅，去学校。谢谢。",
    "model_answer_pinyin":"shīfu, qù xuéxiào. xièxie.",
    "model_answer_ru":"Шофёр, в школу. Спасибо."
  }$$::jsonb
),
(
  'a1090000-0000-4000-8000-000000000002',
  NULL, 'system',
  'Живот болит',
  'Одним голосовым скажи, что болит и что хочешь отдохнуть.',
  'explain', 1, false, 'ready',
  $${
    "language":"zh","type":"explain","hsk_level":1,"time_target_sec":20,
    "description":"Одним голосовым скажи, что болит и что хочешь отдохнуть.",
    "situation_ru":"Тебе плохо, пишешь голосовое другу.",
    "instruction_ru":"Скажи, что болит живот, и что ты хочешь отдыхать.",
    "checklist":[{"id":"where","label_ru":"Где болит"},{"id":"want","label_ru":"Что хочешь сделать"}],
    "vocabulary":[
      {"hanzi":"肚子","pinyin":"dùzi","translation_ru":"живот","hsk_level":1},
      {"hanzi":"疼","pinyin":"téng","translation_ru":"болеть","hsk_level":1},
      {"hanzi":"我","pinyin":"wǒ","translation_ru":"я","hsk_level":1},
      {"hanzi":"想","pinyin":"xiǎng","translation_ru":"хотеть","hsk_level":1}
    ],
    "stimulus_zh":null,"stimulus_pinyin":null,"stimulus_ru":null,"scene_ru":null,
    "model_answer_zh":"我肚子疼。我想休息。",
    "model_answer_pinyin":"wǒ dùzi téng. wǒ xiǎng xiūxi.",
    "model_answer_ru":"У меня болит живот. Хочу отдохнуть."
  }$$::jsonb
),
(
  'a1090000-0000-4000-8000-000000000003',
  NULL, 'system',
  'Погода сегодня',
  'Послушай две фразы и перескажи своими словами.',
  'retell', 1, false, 'ready',
  $${
    "language":"zh","type":"retell","hsk_level":1,"time_target_sec":20,
    "description":"Послушай две фразы и перескажи своими словами.",
    "situation_ru":"Короткий текст про погоду.",
    "instruction_ru":"Перескажи, какая сегодня погода и что человек хочет делать.",
    "checklist":[{"id":"weather","label_ru":"Какая погода"},{"id":"plan","label_ru":"Что хочет делать"}],
    "vocabulary":[
      {"hanzi":"今天","pinyin":"jīntiān","translation_ru":"сегодня","hsk_level":1},
      {"hanzi":"天气","pinyin":"tiānqì","translation_ru":"погода","hsk_level":1},
      {"hanzi":"很好","pinyin":"hěn hǎo","translation_ru":"очень хорошая","hsk_level":1},
      {"hanzi":"去","pinyin":"qù","translation_ru":"идти","hsk_level":1}
    ],
    "stimulus_zh":"今天天气很好。我想去公园。",
    "stimulus_pinyin":"jīntiān tiānqì hěn hǎo. wǒ xiǎng qù gōngyuán.",
    "stimulus_ru":"Сегодня очень хорошая погода. Я хочу пойти в парк.",
    "scene_ru":null,
    "model_answer_zh":"今天天气很好。他想去公园。",
    "model_answer_pinyin":"jīntiān tiānqì hěn hǎo. tā xiǎng qù gōngyuán.",
    "model_answer_ru":"Сегодня погода очень хорошая. Он хочет в парк."
  }$$::jsonb
),
(
  'a1090000-0000-4000-8000-000000000004',
  NULL, 'system',
  'Маме: я дома поздно',
  'Голосовое маме: придёшь домой поздно.',
  'voicemail', 1, false, 'ready',
  $${
    "language":"zh","type":"voicemail","hsk_level":1,"time_target_sec":20,
    "description":"Голосовое маме: придёшь домой поздно.",
    "situation_ru":"Ты ещё на учёбе, пишешь маме голосовое.",
    "instruction_ru":"Скажи маме, что сегодня придёшь домой поздно.",
    "checklist":[{"id":"who","label_ru":"Обращение к маме"},{"id":"when","label_ru":"Когда будешь дома"}],
    "vocabulary":[
      {"hanzi":"妈妈","pinyin":"māma","translation_ru":"мама","hsk_level":1},
      {"hanzi":"回家","pinyin":"huí jiā","translation_ru":"возвращаться домой","hsk_level":1},
      {"hanzi":"晚","pinyin":"wǎn","translation_ru":"поздно","hsk_level":1},
      {"hanzi":"今天","pinyin":"jīntiān","translation_ru":"сегодня","hsk_level":1}
    ],
    "stimulus_zh":null,"stimulus_pinyin":null,"stimulus_ru":null,"scene_ru":null,
    "model_answer_zh":"妈妈，我今天很晚回家。",
    "model_answer_pinyin":"māma, wǒ jīntiān hěn wǎn huí jiā.",
    "model_answer_ru":"Мама, я сегодня вернусь домой очень поздно."
  }$$::jsonb
),
(
  'a1090000-0000-4000-8000-000000000005',
  NULL, 'system',
  'Такси в аэропорт',
  'Скажи водителю, куда ехать, и что не торопиться.',
  'voicemail', 2, false, 'ready',
  $${
    "language":"zh","type":"voicemail","hsk_level":2,"time_target_sec":25,
    "description":"Скажи водителю, куда ехать, и что не торопиться.",
    "situation_ru":"Ты садишься в такси до аэропорта.",
    "instruction_ru":"Скажи, что едете в аэропорт, и попроси не торопиться.",
    "checklist":[{"id":"where","label_ru":"Куда ехать"},{"id":"pace","label_ru":"Не спешить"}],
    "vocabulary":[
      {"hanzi":"机场","pinyin":"jīchǎng","translation_ru":"аэропорт","hsk_level":2},
      {"hanzi":"师傅","pinyin":"shīfu","translation_ru":"водитель","hsk_level":1},
      {"hanzi":"着急","pinyin":"zhāojí","translation_ru":"торопиться","hsk_level":2},
      {"hanzi":"请","pinyin":"qǐng","translation_ru":"пожалуйста","hsk_level":1}
    ],
    "stimulus_zh":null,"stimulus_pinyin":null,"stimulus_ru":null,"scene_ru":null,
    "model_answer_zh":"师傅，去机场。请不着急。",
    "model_answer_pinyin":"shīfu, qù jīchǎng. qǐng bù zhāojí.",
    "model_answer_ru":"Шофёр, на аэропорт. Пожалуйста, не торопитесь."
  }$$::jsonb
),
(
  'a1090000-0000-4000-8000-000000000006',
  NULL, 'system',
  'Потерял телефон',
  'Объясни другу, что случилось и что нужно помочь.',
  'explain', 2, false, 'ready',
  $${
    "language":"zh","type":"explain","hsk_level":2,"time_target_sec":25,
    "description":"Объясни другу, что случилось и что нужно помочь.",
    "situation_ru":"Ты не находишь телефон, оставляешь голосовое другу.",
    "instruction_ru":"Скажи, что у тебя нет телефона, и попроси помочь найти.",
    "checklist":[{"id":"what","label_ru":"Что случилось"},{"id":"ask","label_ru":"Просьба помочь"}],
    "vocabulary":[
      {"hanzi":"手机","pinyin":"shǒujī","translation_ru":"телефон","hsk_level":2},
      {"hanzi":"没有","pinyin":"méiyǒu","translation_ru":"нет / не имеется","hsk_level":1},
      {"hanzi":"帮","pinyin":"bāng","translation_ru":"помогать","hsk_level":2},
      {"hanzi":"找","pinyin":"zhǎo","translation_ru":"искать","hsk_level":2}
    ],
    "stimulus_zh":null,"stimulus_pinyin":null,"stimulus_ru":null,"scene_ru":null,
    "model_answer_zh":"我的手机没有了。请帮我找一找。",
    "model_answer_pinyin":"wǒ de shǒujī méiyǒu le. qǐng bāng wǒ zhǎo yi zhǎo.",
    "model_answer_ru":"Моего телефона нет. Пожалуйста, помоги поискать."
  }$$::jsonb
),
(
  'a1090000-0000-4000-8000-000000000007',
  NULL, 'system',
  'Друг опоздает',
  'Перескажи короткую новость: друг придёт позже.',
  'retell', 2, false, 'ready',
  $${
    "language":"zh","type":"retell","hsk_level":2,"time_target_sec":25,
    "description":"Перескажи короткую новость: друг придёт позже.",
    "situation_ru":"Ты услышал голосовое друга.",
    "instruction_ru":"Перескажи, почему друг опоздает и когда он придёт.",
    "checklist":[{"id":"why","label_ru":"Почему опаздывает"},{"id":"when","label_ru":"Когда придёт"}],
    "vocabulary":[
      {"hanzi":"朋友","pinyin":"péngyou","translation_ru":"друг","hsk_level":1},
      {"hanzi":"晚","pinyin":"wǎn","translation_ru":"поздно","hsk_level":1},
      {"hanzi":"因为","pinyin":"yīnwèi","translation_ru":"потому что","hsk_level":2},
      {"hanzi":"工作","pinyin":"gōngzuò","translation_ru":"работа","hsk_level":1}
    ],
    "stimulus_zh":"我今天晚一点来。因为我有工作。",
    "stimulus_pinyin":"wǒ jīntiān wǎn yìdiǎn lái. yīnwèi wǒ yǒu gōngzuò.",
    "stimulus_ru":"Я сегодня приду чуть позже. Потому что у меня работа.",
    "scene_ru":null,
    "model_answer_zh":"朋友今天晚一点来，因为他有工作。",
    "model_answer_pinyin":"péngyou jīntiān wǎn yìdiǎn lái, yīnwèi tā yǒu gōngzuò.",
    "model_answer_ru":"Друг сегодня придёт позже, потому что у него работа."
  }$$::jsonb
),
(
  'a1090000-0000-4000-8000-000000000008',
  NULL, 'system',
  'Кофе с собой',
  'Голосовое в кафе: что заказать и что с собой.',
  'voicemail', 2, false, 'ready',
  $${
    "language":"zh","type":"voicemail","hsk_level":2,"time_target_sec":25,
    "description":"Голосовое в кафе: что заказать и что с собой.",
    "situation_ru":"Ты заказываешь кофе навынос, как голосовое кассиру.",
    "instruction_ru":"Скажи, что хочешь одну чашку кофе, и что это с собой.",
    "checklist":[{"id":"what","label_ru":"Что заказать"},{"id":"how","label_ru":"С собой, не в зале"}],
    "vocabulary":[
      {"hanzi":"咖啡","pinyin":"kāfēi","translation_ru":"кофе","hsk_level":2},
      {"hanzi":"一杯","pinyin":"yì bēi","translation_ru":"одна чашка","hsk_level":1},
      {"hanzi":"带走","pinyin":"dài zǒu","translation_ru":"с собой","hsk_level":2},
      {"hanzi":"要","pinyin":"yào","translation_ru":"хотеть / надо","hsk_level":1}
    ],
    "stimulus_zh":null,"stimulus_pinyin":null,"stimulus_ru":null,"scene_ru":null,
    "model_answer_zh":"你好，我要一杯咖啡，带走。",
    "model_answer_pinyin":"nǐ hǎo, wǒ yào yì bēi kāfēi, dài zǒu.",
    "model_answer_ru":"Здравствуйте, одну чашку кофе с собой."
  }$$::jsonb
),
(
  'a1090000-0000-4000-8000-000000000009',
  NULL, 'system',
  'Голосовое врачу',
  'Объясни, где болит и сколько дней.',
  'explain', 3, false, 'ready',
  $${
    "language":"zh","type":"explain","hsk_level":3,"time_target_sec":35,
    "description":"Объясни, где болит и сколько дней.",
    "situation_ru":"Ты оставляешь голосовое в клинику до приёма.",
    "instruction_ru":"Скажи, что болит голова уже два дня, и попроси записаться к врачу.",
    "checklist":[{"id":"where","label_ru":"Где болит"},{"id":"howlong","label_ru":"Сколько дней"},{"id":"ask","label_ru":"Просьба о приёме"}],
    "vocabulary":[
      {"hanzi":"头","pinyin":"tóu","translation_ru":"голова","hsk_level":1},
      {"hanzi":"疼","pinyin":"téng","translation_ru":"болеть","hsk_level":1},
      {"hanzi":"两天","pinyin":"liǎng tiān","translation_ru":"два дня","hsk_level":1},
      {"hanzi":"医生","pinyin":"yīshēng","translation_ru":"врач","hsk_level":1},
      {"hanzi":"预约","pinyin":"yùyuē","translation_ru":"запись / бронь","hsk_level":3}
    ],
    "stimulus_zh":null,"stimulus_pinyin":null,"stimulus_ru":null,"scene_ru":null,
    "model_answer_zh":"医生，我头疼两天了。请帮我预约。",
    "model_answer_pinyin":"yīshēng, wǒ tóu téng liǎng tiān le. qǐng bāng wǒ yùyuē.",
    "model_answer_ru":"Доктор, голова болит уже два дня. Пожалуйста, запишите меня."
  }$$::jsonb
),
(
  'a1090000-0000-4000-8000-000000000010',
  NULL, 'system',
  'Опаздываю на работу',
  'Голосовое коллеге: опоздаешь и когда будешь.',
  'voicemail', 3, false, 'ready',
  $${
    "language":"zh","type":"voicemail","hsk_level":3,"time_target_sec":35,
    "description":"Голосовое коллеге: опоздаешь и когда будешь.",
    "situation_ru":"Пробка, ты пишешь коллеге голосовое.",
    "instruction_ru":"Скажи, что сегодня опоздаешь, потому что много машин, и что будешь через 20 минут.",
    "checklist":[{"id":"late","label_ru":"Что опоздаешь"},{"id":"why","label_ru":"Почему"},{"id":"when","label_ru":"Когда будешь"}],
    "vocabulary":[
      {"hanzi":"迟到","pinyin":"chídào","translation_ru":"опоздать","hsk_level":3},
      {"hanzi":"因为","pinyin":"yīnwèi","translation_ru":"потому что","hsk_level":2},
      {"hanzi":"车","pinyin":"chē","translation_ru":"машина","hsk_level":1},
      {"hanzi":"分钟","pinyin":"fēnzhōng","translation_ru":"минута","hsk_level":2}
    ],
    "stimulus_zh":null,"stimulus_pinyin":null,"stimulus_ru":null,"scene_ru":null,
    "model_answer_zh":"对不起，我今天会迟到。因为车很多。我二十分钟以后到。",
    "model_answer_pinyin":"duìbuqǐ, wǒ jīntiān huì chídào. yīnwèi chē hěn duō. wǒ èrshí fēnzhōng yǐhòu dào.",
    "model_answer_ru":"Извини, сегодня опоздаю. Машин много. Буду через двадцать минут."
  }$$::jsonb
),
(
  'a1090000-0000-4000-8000-000000000011',
  NULL, 'system',
  'Новость про дождь',
  'Перескажи короткую сводку погоды.',
  'retell', 3, false, 'ready',
  $${
    "language":"zh","type":"retell","hsk_level":3,"time_target_sec":35,
    "description":"Перескажи короткую сводку погоды.",
    "situation_ru":"Ты услышал прогноз.",
    "instruction_ru":"Перескажи, когда будет дождь и что лучше взять с собой.",
    "checklist":[{"id":"when","label_ru":"Когда дождь"},{"id":"advice","label_ru":"Что взять"}],
    "vocabulary":[
      {"hanzi":"下雨","pinyin":"xià yǔ","translation_ru":"идти дождю","hsk_level":2},
      {"hanzi":"下午","pinyin":"xiàwǔ","translation_ru":"после полудня","hsk_level":1},
      {"hanzi":"伞","pinyin":"sǎn","translation_ru":"зонт","hsk_level":3},
      {"hanzi":"应该","pinyin":"yīnggāi","translation_ru":"следует","hsk_level":3}
    ],
    "stimulus_zh":"今天下午会下雨。出门的时候应该带伞。",
    "stimulus_pinyin":"jīntiān xiàwǔ huì xià yǔ. chūmén de shíhou yīnggāi dài sǎn.",
    "stimulus_ru":"Сегодня после обеда будет дождь. Выходя, следует взять зонт.",
    "scene_ru":null,
    "model_answer_zh":"今天下午会下雨，出门应该带伞。",
    "model_answer_pinyin":"jīntiān xiàwǔ huì xià yǔ, chūmén yīnggāi dài sǎn.",
    "model_answer_ru":"Сегодня после обеда будет дождь, на улицу стоит взять зонт."
  }$$::jsonb
),
(
  'a1090000-0000-4000-8000-000000000012',
  NULL, 'system',
  'Сломался телефон',
  'Объясни в сервисе, что случилось и что нужно.',
  'explain', 3, false, 'ready',
  $${
    "language":"zh","type":"explain","hsk_level":3,"time_target_sec":35,
    "description":"Объясни в сервисе, что случилось и что нужно.",
    "situation_ru":"Голосовое в мастерскую.",
    "instruction_ru":"Скажи, что телефон не включается с вчера, и попроси посмотреть.",
    "checklist":[{"id":"what","label_ru":"Что случилось"},{"id":"when","label_ru":"С какого времени"},{"id":"ask","label_ru":"Просьба проверить"}],
    "vocabulary":[
      {"hanzi":"手机","pinyin":"shǒujī","translation_ru":"телефон","hsk_level":2},
      {"hanzi":"开","pinyin":"kāi","translation_ru":"включать","hsk_level":1},
      {"hanzi":"昨天","pinyin":"zuótiān","translation_ru":"вчера","hsk_level":1},
      {"hanzi":"看看","pinyin":"kànkan","translation_ru":"посмотреть","hsk_level":1}
    ],
    "stimulus_zh":null,"stimulus_pinyin":null,"stimulus_ru":null,"scene_ru":null,
    "model_answer_zh":"我的手机从昨天开始不能开。请帮我看看。",
    "model_answer_pinyin":"wǒ de shǒujī cóng zuótiān kāishǐ bù néng kāi. qǐng bāng wǒ kànkan.",
    "model_answer_ru":"Телефон с вчерашнего дня не включается. Пожалуйста, посмотрите."
  }$$::jsonb
),
(
  'a1090000-0000-4000-8000-000000000013',
  NULL, 'system',
  'Перенести встречу',
  'Голосовое коллеге: перенести встречу на завтра утро.',
  'voicemail', 4, false, 'ready',
  $${
    "language":"zh","type":"voicemail","hsk_level":4,"time_target_sec":45,
    "description":"Голосовое коллеге: перенести встречу на завтра утро.",
    "situation_ru":"Сегодня не успеваешь на встречу.",
    "instruction_ru":"Извинись, предложи перенести встречу на завтра утро и спроси, удобно ли.",
    "checklist":[{"id":"sorry","label_ru":"Извинение"},{"id":"when","label_ru":"Новое время"},{"id":"ask","label_ru":"Спросить, удобно ли"}],
    "vocabulary":[
      {"hanzi":"会议","pinyin":"huìyì","translation_ru":"встреча / совещание","hsk_level":4},
      {"hanzi":"改","pinyin":"gǎi","translation_ru":"менять","hsk_level":3},
      {"hanzi":"明天","pinyin":"míngtiān","translation_ru":"завтра","hsk_level":1},
      {"hanzi":"方便","pinyin":"fāngbiàn","translation_ru":"удобно","hsk_level":3}
    ],
    "stimulus_zh":null,"stimulus_pinyin":null,"stimulus_ru":null,"scene_ru":null,
    "model_answer_zh":"不好意思，今天的会议能不能改到明天早上？你方便吗？",
    "model_answer_pinyin":"bù hǎoyìsi, jīntiān de huìyì néng bu néng gǎi dào míngtiān zǎoshang? nǐ fāngbiàn ma?",
    "model_answer_ru":"Извини, сегодняшнюю встречу можно перенести на завтра утро? Тебе удобно?"
  }$$::jsonb
),
(
  'a1090000-0000-4000-8000-000000000014',
  NULL, 'system',
  'Коротко про матч',
  'Перескажи спортивную новость в трёх предложениях.',
  'retell', 4, false, 'ready',
  $${
    "language":"zh","type":"retell","hsk_level":4,"time_target_sec":45,
    "description":"Перескажи спортивную новость в трёх предложениях.",
    "situation_ru":"Ты услышал новость про футбол.",
    "instruction_ru":"Перескажи, кто выиграл, какой счёт и когда была игра.",
    "checklist":[{"id":"who","label_ru":"Кто выиграл"},{"id":"score","label_ru":"Счёт"},{"id":"when","label_ru":"Когда играли"}],
    "vocabulary":[
      {"hanzi":"比赛","pinyin":"bǐsài","translation_ru":"соревнование / матч","hsk_level":3},
      {"hanzi":"赢","pinyin":"yíng","translation_ru":"выиграть","hsk_level":4},
      {"hanzi":"比分","pinyin":"bǐfēn","translation_ru":"счёт","hsk_level":4},
      {"hanzi":"昨天","pinyin":"zuótiān","translation_ru":"вчера","hsk_level":1}
    ],
    "stimulus_zh":"昨天晚上有一场足球比赛。北京队赢了。最后比分是二比一。",
    "stimulus_pinyin":"zuótiān wǎnshang yǒu yì chǎng zúqiú bǐsài. Běijīng duì yíng le. zuìhòu bǐfēn shì èr bǐ yī.",
    "stimulus_ru":"Вчера вечером был футбольный матч. Пекин выиграл. Счёт 2:1.",
    "scene_ru":null,
    "model_answer_zh":"昨天晚上北京队赢了足球比赛，比分是二比一。",
    "model_answer_pinyin":"zuótiān wǎnshang Běijīng duì yíng le zúqiú bǐsài, bǐfēn shì èr bǐ yī.",
    "model_answer_ru":"Вчера вечером пекинская команда выиграла матч со счётом 2:1."
  }$$::jsonb
),
(
  'a1090000-0000-4000-8000-000000000015',
  NULL, 'system',
  'Горло болит',
  'Объясни, что болит горло и пить горячую воду не помогает.',
  'explain', 2, false, 'ready',
  $${
    "language":"zh","type":"explain","hsk_level":2,"time_target_sec":25,
    "description":"Объясни, что болит горло и пить горячую воду не помогает.",
    "situation_ru":"Голосовое другу, который спрашивает, как ты.",
    "instruction_ru":"Скажи, что болит горло, и что ты уже пил горячую воду.",
    "checklist":[{"id":"where","label_ru":"Где болит"},{"id":"did","label_ru":"Что уже сделал"}],
    "vocabulary":[
      {"hanzi":"嗓子","pinyin":"sǎngzi","translation_ru":"горло","hsk_level":2},
      {"hanzi":"疼","pinyin":"téng","translation_ru":"болеть","hsk_level":1},
      {"hanzi":"喝","pinyin":"hē","translation_ru":"пить","hsk_level":1},
      {"hanzi":"热水","pinyin":"rè shuǐ","translation_ru":"горячая вода","hsk_level":1}
    ],
    "stimulus_zh":null,"stimulus_pinyin":null,"stimulus_ru":null,"scene_ru":null,
    "model_answer_zh":"我嗓子疼。我喝了热水。",
    "model_answer_pinyin":"wǒ sǎngzi téng. wǒ hē le rè shuǐ.",
    "model_answer_ru":"У меня болит горло. Я пил горячую воду."
  }$$::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  type = EXCLUDED.type,
  hsk_level = EXCLUDED.hsk_level,
  archived = EXCLUDED.archived,
  status = EXCLUDED.status,
  payload = EXCLUDED.payload,
  updated_at = NOW();
