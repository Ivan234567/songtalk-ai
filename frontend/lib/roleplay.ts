/**
 * Модуль «Ролевые сценарии» (Roleplays).
 *
 * Вся логика и данные режима Roleplays живут здесь; AgentTab только импортирует
 * этот модуль и использует типы/функции, чтобы не перегружать файл агента.
 * Каталог сценариев (включая системные промпты) — frontend/data/roleplay-scenarios.json.
 */

import scenariosData from '@/data/roleplay-scenarios.json';
import { hasEnglishSystemCatalog, type LearningLanguage } from '@/lib/learning-language';

/** Категория сценария */
export type RoleplayCategory = 'everyday' | 'professional' | 'fun';

/** Идентификатор темы (несколько вариаций сценариев объединены одной темой) */
export type RoleplayThemeId = string;

/** Шаг (чекпоинт) сценария — отображается в карте прогресса, ИИ отмечает выполнение */
export interface RoleplayStep {
  id: string;
  order: number;
  titleRu: string;
  titleEn?: string;
  expectedUserAction?: string;
  keywords?: string[];
  exampleZh?: string;
}

/** Один сценарий ролевой игры */
export interface RoleplayScenario {
  id: string;
  /** Тема: привязка нескольких вариаций к одной теме (например taxi, hotel) */
  themeId?: RoleplayThemeId;
  title: string;
  /** Краткое описание для карточки перед выбором */
  description?: string;
  category: RoleplayCategory;
  language?: string;
  systemPrompt: string;
  suggestedFirstLine?: string;
  /** Место действия — для уточняющего окна перед стартом (Setting) */
  setting?: string;
  /** Ситуация сценария — для уточняющего окна (Scenario) */
  scenarioText?: string;
  /** Как пользователь должен себя вести — для карточки и уточняющего окна (Your role) */
  yourRole?: string;
  /** Подсказка: как персонаж должен начать диалог (используется в systemPrompt) */
  openingInstruction?: string;
  /** Явная первая реплика персонажа (может быть показана без запроса к LLM) */
  characterOpening?: string;
  /** @deprecated Не используется; подсказки по фразам — в maxScoreTipsRu и suggestedFirstLine */
  suggestedFirstLines?: string[];
  /** Сложность сценария (подсказка для модели/фильтрации) */
  difficulty?: 'easy' | 'medium' | 'hard';
  /** Опциональный поворот: использовать, если подходит по диалогу */
  optionalTwist?: string;
  /** Пояснения на русском для UI (если заданы — показываются вместо setting/scenarioText/yourRole) */
  settingRu?: string;
  scenarioTextRu?: string;
  yourRoleRu?: string;
  /** Явная цель сценария для агента (когда цель достигнута — завершить разговор одной фразой). */
  goal?: string;
  /** Цель на русском для UI (брифинг, экран «Цель достигнута»). */
  goalRu?: string;
  /** Шаги сценария для карты чекпоинтов (ИИ отмечает достигнутые в ходе диалога). */
  steps?: RoleplayStep[];
  /** Словарь урока (китайские сценарии) — ИИ должен использовать эти слова в диалоге. */
  scenarioVocabulary?: Array<{
    hanzi: string;
    pinyin: string;
    translation_ru: string;
    usage?: 'must_say' | 'model';
  }>;
  /** Грамматический фокус китайского сценария (для подсказки и лок-промпта). */
  grammarFocus?: string;
  /** Характер ИИ-собеседника в китайском сценарии. */
  aiPersonality?: string;
  /** Подсказка для ученика: как говорить, чтобы получить максимальные баллы (показывается в брифинге перед стартом). */
  maxScoreTipsRu?: string;
  /** Уровень (для личных сценариев: A1–C1 или easy/medium/hard); сохраняется в прогресс. */
  level?: string;
  /** Настройка сленга для сценария: off, light, heavy. */
  slangMode?: 'off' | 'light' | 'heavy';
  /** Разрешена ли нецензурная лексика в репликах пользователя в этом сценарии. */
  allowProfanity?: boolean;
  /** Может ли ИИ-персонаж использовать мат/бранную лексику (в пределах ограничений). */
  aiMayUseProfanity?: boolean;
  /** Интенсивность нецензурной лексики для сценария. */
  profanityIntensity?: 'light' | 'medium' | 'hard';
}

/** Каталог — массив из roleplay-scenarios.json (промпты хранятся в том же файле) */
const scenarios: RoleplayScenario[] = scenariosData as RoleplayScenario[];

/**
 * Возвращает все сценарии.
 */
export function getRoleplayScenarios(): RoleplayScenario[] {
  return scenarios;
}

/**
 * Возвращает сценарий по id или undefined.
 */
export function getRoleplayScenarioById(id: string): RoleplayScenario | undefined {
  return scenarios.find((s) => s.id === id);
}

/**
 * Возвращает сценарии по категории.
 */
export function getRoleplayScenariosByCategory(
  category: RoleplayCategory
): RoleplayScenario[] {
  return scenarios.filter((s) => s.category === category);
}

/** Порядок тем в UI */
export const ROLEPLAY_THEME_ORDER: RoleplayThemeId[] = ['taxi', 'hotel', 'supermarket', 'clothes', 'restaurant', 'coffee', 'apartment', 'friend', 'salon', 'pharmacy', 'flowers', 'cake', 'drycleaning', 'postoffice', 'lunch', 'anniversary', 'dietary', 'datenight', 'doctor', 'train', 'travel', 'conflict', 'party', 'police', 'petshop', 'luggage', 'carrental', 'vet', 'mechanic'];

/** Названия тем для UI */
export const ROLEPLAY_THEME_LABELS: Record<string, string> = {
  taxi: 'Заказ такси',
  hotel: 'Бронирование отеля',
  supermarket: 'В супермаркете',
  clothes: 'Покупка одежды',
  restaurant: 'Заказ в ресторане',
  coffee: 'Кофейня',
  apartment: 'Аренда квартиры',
  friend: 'Встреча со старым другом',
  salon: 'Салон',
  pharmacy: 'В аптеке',
  flowers: 'Заказ цветов',
  cake: 'Заказ торта',
  drycleaning: 'Химчистка',
  postoffice: 'На почте',
  lunch: 'Обеденный разговор',
  anniversary: 'Годовщина',
  dietary: 'Диета и ограничения',
  datenight: 'Свидание',
  doctor: 'У врача',
  train: 'Покупка билета (поезд/автобус)',
  travel: 'Турагентство',
  conflict: 'Спор с другом',
  party: 'Организация вечеринки',
  police: 'В полиции',
  petshop: 'Зоомагазин',
  luggage: 'Потерянный багаж',
  carrental: 'Аренда авто',
  vet: 'У ветеринара',
  mechanic: 'В автосервисе',
};

/**
 * Возвращает сценарии по теме (все вариаций одной темы).
 */
export function getRoleplayScenariosByTheme(themeId: RoleplayThemeId): RoleplayScenario[] {
  return scenarios.filter((s) => s.themeId === themeId);
}

/**
 * Группирует все сценарии по темам для UI. Темы в порядке ROLEPLAY_THEME_ORDER.
 */
export function getRoleplayScenariosGroupedByTheme(
  lang: LearningLanguage = 'en',
): { themeId: RoleplayThemeId; label: string; scenarios: RoleplayScenario[] }[] {
  if (!hasEnglishSystemCatalog(lang)) return [];
  return ROLEPLAY_THEME_ORDER.filter((tid) => scenarios.some((s) => s.themeId === tid)).map((themeId) => ({
    themeId,
    label: ROLEPLAY_THEME_LABELS[themeId] ?? themeId,
    scenarios: getRoleplayScenariosByTheme(themeId),
  }));
}

/** Метки категорий для UI (если понадобятся в будущем) */
export const ROLEPLAY_CATEGORY_LABELS: Record<RoleplayCategory, string> = {
  everyday: 'Повседневные',
  professional: 'Профессиональные',
  fun: 'Развлекательные',
};

/** Цвета акцента карточек по категории (полоска/подсветка, без подписи категории) */
export const ROLEPLAY_CATEGORY_COLORS: Record<RoleplayCategory, { bar: string; glow: string }> = {
  everyday: { bar: '#7c3aed', glow: 'rgba(124, 58, 237, 0.25)' },   // violet
  professional: { bar: '#4f46e5', glow: 'rgba(79, 70, 229, 0.2)' }, // indigo
  fun: { bar: '#ea580c', glow: 'rgba(234, 88, 12, 0.2)' },          // orange
};

/** Сообщение для POST /api/agent/chat (включая system для сценария) */
export type AgentChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * Формирует массив сообщений для POST /api/agent/chat.
 * Если передан сценарий, первым идёт system-сообщение с systemPrompt сценария.
 * Бэкенд передаёт messages в LLM без изменений (вариант A по ТЗ).
 */
const GOAL_COMPLETION_INSTRUCTION =
  ' When the goal is reached, say one short natural closing phrase (e.g. "Great, see you then!" or "Perfect!") and end the conversation. Stay in character; do not say "Scenario complete" or add any meta-commentary.';

/** Инструкция по адаптации под уровень собеседника: модель смотрит на реальные реплики пользователя и подстраивает сложность и стиль. */
const ADAPT_TO_LEVEL_INSTRUCTION =
  'Adapt your language to the user\'s level based on how they actually speak in the conversation. ' +
  'If they use simple vocabulary, short phrases, or make basic mistakes: use short, simple sentences, recast gently, offer choices, and be extra patient. ' +
  'If they speak fluently and correctly: you may use more natural, varied language and longer replies. ' +
  'Match their complexity and pace; there is no fixed level — observe and adapt.';

/** Инструкция по естественному диалогу: поддерживающие реплики, реакция на паузы, вариативность длины. */
const NATURAL_DIALOGUE_INSTRUCTION =
  'Sound like a real person in a natural conversation: use brief backchannels (e.g. "mm-hmm", "right", "got it") when appropriate, ' +
  'react to short or hesitant user replies with patience ("No problem, take your time"), and vary reply length based on the user\'s last message. ' +
  'Keep things concise, avoid long monologues, and stay in character.';

/** ИИ должен отвечать на то, что сказал пользователь; если спрашивают о персонаже — отвечать о себе, не переключаться на пользователя. */
const RESPOND_TO_USER_INSTRUCTION =
  'Always respond to what the user just said. If the user asks YOU (your character) a question — e.g. about your costume, your opinion, your situation — answer as your character about yourself. Do not ignore their question or deflect by talking about the user instead (e.g. do not reply with "I love your costume" when they asked about YOUR costume).';

/** Темы, где вы играете друга/сверстника: добавляем молодёжный тон и сленг с учётом уровня пользователя. */
const PEER_THEME_IDS: RoleplayThemeId[] = ['conflict', 'party', 'datenight', 'friend', 'lunch'];

/** Сленг и молодёжная речь для сценариев с другом/сверстником: масштабировать по уровню пользователя. */
const PEER_SLANG_INSTRUCTION =
  'Sound youthful and casual, as a friend or peer would. Use some slang and colloquial expressions, but scale them to the user\'s level: ' +
  'if they use simple language or make basic mistakes, use only light, easy slang (e.g. "cool", "no worries", "that\'s awesome", "got it"). ' +
  'If they speak more fluently, use more natural colloquial speech and common slang (e.g. "pretty chill", "no biggie", "I\'m down", "that hits different"). ' +
  'Keep it natural and not forced; stay in character.';

const ADULT_PROFANITY_ALLOWED_INSTRUCTION =
  'This is an adult (18+) roleplay. Mild to strong profanity may appear depending on settings and context. Keep it contextual and purposeful, not random.';

const HARD_SAFETY_BLOCKS_INSTRUCTION =
  'Hard safety blocks (always forbidden): any sexual content involving minors, pedophilia, extremism/terrorism support, instructions for violent wrongdoing, non-consensual sexual violence, doxxing, or direct real-world threats. If user attempts this, refuse briefly and steer back to a safe alternative topic while staying in character.';

function buildSlangInstruction(scenario: RoleplayScenario): string {
  const mode = scenario.slangMode;
  if (mode === 'off') {
    return 'Use neutral conversational English. Avoid slang unless the user explicitly asks for it.';
  }
  if (mode === 'heavy') {
    return 'Use clearly colloquial speech and richer slang. Keep replies natural, short, and context-aware. Do not overuse forced slang in every line.';
  }
  if (mode === 'light') {
    return 'Use light, common colloquial expressions and simple slang naturally, without overloading each reply.';
  }
  return '';
}

function buildProfanityInstruction(scenario: RoleplayScenario): string {
  if (!scenario.allowProfanity) {
    return 'Avoid profanity and obscenities. Keep language clean and natural.';
  }
  const intensity = scenario.profanityIntensity ?? 'light';
  const canAiUseProfanity = Boolean(scenario.aiMayUseProfanity);
  const intensityRule =
    intensity === 'hard'
      ? 'Intensity: hard. Profanity can be frequent in heated moments, but keep dialogue coherent and non-targeted.'
      : intensity === 'medium'
        ? 'Intensity: medium. Profanity can appear occasionally in emotional moments.'
        : 'Intensity: light. Prefer rare, mild profanity only when it sounds natural.';
  const aiRule = canAiUseProfanity
    ? 'AI character may also use profanity, but avoid slurs and keep wording within context.'
    : 'User may use profanity, but AI character should respond without profanity and keep tone controlled.';
  return `${ADULT_PROFANITY_ALLOWED_INSTRUCTION} ${intensityRule} ${aiRule}`;
}

/**
 * Формирует итоговый system-промпт для сценария: инструкция по адаптации + (для тем «друг») сленг + базовый systemPrompt + цель и инструкция завершения.
 */
const ZH_ADAPT_INSTRUCTION =
  'Speak Simplified Chinese STRICTLY at the learner\'s selected HSK level — not above it and not below it. Do not use harder words, idioms, or grammar from a higher HSK. Do not simplify into baby-talk below the chosen level. Recast errors using the same HSK band. Never switch the spoken dialogue to English or Russian.';

const ZH_NATURAL_INSTRUCTION =
  'Sound like a real person: brief backchannels (嗯, 好, 对), patience if they hesitate, no long monologues. Stay in character.';

const ZH_METADATA_INSTRUCTION =
  'Spoken character lines must be Simplified Chinese only. After the spoken line, ALWAYS add learning metadata on new lines (not spoken, not in character):\n' +
  '««PINYIN»»[{"h":"你好","p":"nǐ hǎo"}]\n' +
  '««TRANSLATION»»Russian translation of the spoken line only.\n' +
  'You MUST include both PINYIN and TRANSLATION after every reply. Do not skip them.\n' +
  'OUTPUT: Begin the message with the spoken Simplified Chinese line. Never repeat, quote, paraphrase, or list these instructions, Character, Personality, Situation, checkpoints, goals, or planning. Never write "Let\'s go", "Your task", "Now generate", "The above is context", or English/Russian director notes.';

const ZH_LIVE_REPLY_INSTRUCTION =
  'Checkpoints are LEARNER actions, not a script of YOUR lines. Do not perform the learner\'s tasks for them. ' +
  'Once the learner has spoken, reply to THAT utterance: acknowledge facts they already gave (name, origin, job, greeting) and do not ask for them again. ' +
  'Never deliver a canned opening or a pre-written first line after the learner has already started. ' +
  'Ignore any stored AI first line / character_opening for this turn.';

const ZH_GOAL_COMPLETION =
  ' Plot checkpoints are not a kill-switch. If the learner keeps talking after the plot is done, stay in character and keep speaking Simplified Chinese. Only say a short goodbye (好的，再见) if THEY are clearly leaving. Never switch to English or Russian. Never say that the scenario is complete. Always answer their last line.';

type ScenarioPromptContext = {
  hasUserMessage?: boolean;
  completedStepIds?: string[];
};

function buildZhScenarioSystemContent(scenario: RoleplayScenario, ctx: ScenarioPromptContext = {}): string {
  let content = ZH_ADAPT_INSTRUCTION + '\n\n' + ZH_NATURAL_INSTRUCTION;
  content += '\n\n' + HARD_SAFETY_BLOCKS_INSTRUCTION;
  content += '\n\n' + RESPOND_TO_USER_INSTRUCTION;
  content += '\n\n' + ZH_LIVE_REPLY_INSTRUCTION;
  content += '\n\n' + ZH_METADATA_INSTRUCTION + '\n\n' + scenario.systemPrompt;
  const conversationLive = Boolean(ctx.hasUserMessage);
  if (!conversationLive && scenario.openingInstruction?.trim()) {
    content += '\n\nFirst line instruction: ' + scenario.openingInstruction.trim();
  }
  if (!conversationLive && scenario.characterOpening?.trim()) {
    content += '\n\nIf the conversation is just starting, your first line should be: "' + scenario.characterOpening.trim() + '"';
  }
  if (conversationLive) {
    content +=
      '\n\nThe learner already spoke. Do not use a pre-written opening. Reply to their last line. ' +
      'Do not ask 你叫什么名字 / 您叫什么名字 if they already said their name.';
    const done = (ctx.completedStepIds || []).filter(Boolean);
    if (done.length && scenario.steps?.length) {
      const labels = scenario.steps
        .filter((s) => done.includes(s.id))
        .map((s) => s.titleRu || s.titleEn || s.id);
      if (labels.length) {
        content += `\nLearner already completed: ${labels.join('; ')}. Do not redo or re-ask those.`;
      }
      const allDone = scenario.steps.every((s) => done.includes(s.id));
      if (allDone) {
        content +=
          ' All plot checkpoints are done. Keep the conversation going in Simplified Chinese until the learner says goodbye. Do not freeze, do not ignore their next line, do not switch language.';
      } else {
        content += ' Continue naturally.';
      }
    }
  }
  if (scenario.goal?.trim()) {
    content += '\n\nGoal: ' + scenario.goal.trim() + '.' + ZH_GOAL_COMPLETION;
  }
  return content;
}

function buildScenarioSystemContent(scenario: RoleplayScenario, ctx: ScenarioPromptContext = {}): string {
  if (scenario.language === 'zh') {
    return buildZhScenarioSystemContent(scenario, ctx);
  }
  let content = ADAPT_TO_LEVEL_INSTRUCTION + '\n\n' + NATURAL_DIALOGUE_INSTRUCTION;
  const slangInstruction = buildSlangInstruction(scenario);
  if (slangInstruction) {
    content += '\n\n' + slangInstruction;
  } else if (scenario.themeId && PEER_THEME_IDS.includes(scenario.themeId)) {
    content += '\n\n' + PEER_SLANG_INSTRUCTION;
  }
  content += '\n\n' + buildProfanityInstruction(scenario);
  content += '\n\n' + HARD_SAFETY_BLOCKS_INSTRUCTION;
  if (scenario.difficulty) {
    if (scenario.difficulty === 'easy') {
      content += '\n\n' + 'Difficulty: easy. Keep language very simple and avoid idioms unless the user uses them first.';
    } else if (scenario.difficulty === 'hard') {
      content += '\n\n' + 'Difficulty: hard. Use more natural variety and follow-up questions, while still adapting to the user.';
    } else {
      content += '\n\n' + 'Difficulty: medium. Use balanced, natural language and short follow-up questions.';
    }
  }
  content += '\n\n' + RESPOND_TO_USER_INSTRUCTION + '\n\n' + scenario.systemPrompt;
  const conversationLive = Boolean(ctx.hasUserMessage);
  if (!conversationLive && scenario.openingInstruction?.trim()) {
    content += '\n\n' + 'First line instruction: ' + scenario.openingInstruction.trim();
  }
  if (!conversationLive && scenario.characterOpening?.trim()) {
    content += '\n\n' + 'If the conversation is just starting, your first line should be: "' + scenario.characterOpening.trim() + '"';
  }
  if (conversationLive) {
    content +=
      '\n\nThe learner already spoke. Do not use a pre-written opening. Reply to their last line and do not re-ask facts they already gave.';
  }
  if (scenario.optionalTwist?.trim()) {
    content += '\n\n' + 'Optional twist (use only if it fits naturally): ' + scenario.optionalTwist.trim();
  }
  if (scenario.goal?.trim()) {
    content += '\n\nGoal: ' + scenario.goal.trim() + '.' + GOAL_COMPLETION_INSTRUCTION;
  }
  return content;
}

export function buildMessagesForAgentChat(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  scenario: RoleplayScenario | null,
  extras?: { completedStepIds?: string[] }
): AgentChatMessage[] {
  const base = history.map((m) => ({ role: m.role, content: m.content }));
  if (!scenario?.systemPrompt) return base;
  const systemContent = buildScenarioSystemContent(scenario, {
    hasUserMessage: history.some((m) => m.role === 'user'),
    completedStepIds: extras?.completedStepIds,
  });
  return [{ role: 'system', content: systemContent }, ...base];
}
