/**
 * Эвристический подбор списков словаря под сценарий / дебат / чат.
 * Без LLM: пересечение токенов + тематические группы + уровень.
 */

export type PracticeListBinding = {
  kind: 'scenario' | 'debate' | 'chat';
  ref: string;
  origin: 'system' | 'user';
  label: string;
};

export type PracticeListContext = {
  /** Заголовок секции в UI */
  label: string;
  /** Свободный текст контекста (название, цель, тема…) */
  text: string;
  /** CEFR / HSK / easy|medium|hard — опционально */
  level?: string | null;
  /** Primary-привязка списка к текущей сцене/дебату/чату */
  binding?: PracticeListBinding | null;
  /** Шаги цели: слова списка привязаны к ним */
  steps?: string[] | null;
};

export function buildListBinding(input: {
  kind: PracticeListBinding['kind'];
  ref?: string | null;
  origin?: PracticeListBinding['origin'] | null;
  label?: string | null;
} | null | undefined): PracticeListBinding | null {
  const ref = typeof input?.ref === 'string' ? input.ref.trim() : '';
  const label = typeof input?.label === 'string' ? input.label.trim() : '';
  if (!input?.kind || !ref) return null;
  return {
    kind: input.kind,
    ref,
    origin: input.origin === 'user' ? 'user' : 'system',
    label: label || ref,
  };
}

export type RankableVocabList = {
  id: string;
  title: string;
  description?: string | null;
  system_key?: string | null;
  level?: string | null;
  word_count?: number;
  theme_keys?: string[] | null;
  bound_label?: string | null;
};

export type RankedVocabList<T extends RankableVocabList = RankableVocabList> = T & {
  score: number;
  matched: boolean;
};

const STOP = new Set([
  'the', 'and', 'for', 'you', 'your', 'with', 'from', 'this', 'that', 'are', 'was', 'were',
  'have', 'has', 'had', 'will', 'can', 'not', 'but', 'they', 'them', 'their', 'our', 'out',
  'что', 'как', 'это', 'для', 'или', 'при', 'под', 'над', 'без', 'про', 'все', 'вас', 'вам',
  'есть', 'быть', 'был', 'была', 'были', 'когда', 'чтобы', 'только', 'также', 'после',
]);

/** Тематические якоря: если контекст содержит ключ — бустим списки с этими словами в title/key/description */
const THEME_GROUPS: Array<{ trigger: string[]; boost: string[] }> = [
  {
    trigger: ['apartment', 'rent', 'rental', 'landlord', 'flat', 'аренд', 'квартир', 'риелтор', 'съём', 'съем'],
    boost: ['home', 'дом', 'квартир', 'аренд', 'housing'],
  },
  {
    trigger: ['hotel', 'check-in', 'reception', 'отел', 'гостиниц', 'брон'],
    boost: ['home', 'дом', 'travel', 'поездк', 'путешеств', 'hotel', 'отел'],
  },
  {
    trigger: ['taxi', 'airport', 'terminal', 'driver', 'такси', 'аэропорт', 'водитель', 'поездк'],
    boost: ['everyday', 'каждый', 'travel', 'поездк', 'транспорт', 'city', 'город'],
  },
  {
    trigger: ['cafe', 'coffee', 'restaurant', 'menu', 'order', 'food', 'каф', 'ресторан', 'меню', 'заказ', 'еда'],
    boost: ['food', 'еда', 'кафе', 'ресторан'],
  },
  {
    trigger: ['family', 'parents', 'mother', 'father', 'семья', 'родител', 'мама', 'папа'],
    boost: ['family', 'семья'],
  },
  {
    trigger: ['doctor', 'hospital', 'pharmacy', 'здоров', 'врач', 'больниц', 'аптек'],
    boost: ['everyday', 'каждый', 'health', 'здоров'],
  },
  {
    trigger: ['shop', 'store', 'buy', 'price', 'магазин', 'покуп', 'цена'],
    boost: ['everyday', 'каждый', 'food', 'еда', 'shop', 'магазин'],
  },
  {
    trigger: ['job', 'office', 'interview', 'work', 'работ', 'офис', 'собеседован'],
    boost: ['everyday', 'каждый', 'work', 'работ', 'intro', 'знаком'],
  },
  {
    trigger: ['school', 'teacher', 'student', 'university', 'школ', 'универ', 'урок', 'ученик'],
    boost: ['everyday', 'каждый', 'school', 'школ', 'учеба', 'учёба'],
  },
  {
    trigger: ['debate', 'argument', 'opinion', 'politics', 'society', 'climate', 'rights', 'дебат', 'спор', 'мнение', 'обществ', 'политик', 'климат', 'права'],
    boost: ['everyday', 'каждый', 'debate', 'opinion', 'society', 'обществ'],
  },
  {
    trigger: ['travel', 'trip', 'passport', 'поездк', 'путешеств', 'паспорт', 'виза'],
    boost: ['travel', 'поездк', 'путешеств', 'everyday', 'каждый'],
  },
  {
    trigger: ['home', 'house', 'room', 'kitchen', 'bathroom', 'дом', 'комнат', 'кухн', 'ванн'],
    boost: ['home', 'дом'],
  },
  {
    trigger: ['hello', 'meet', 'intro', 'знаком', 'привет'],
    boost: ['intro', 'знаком'],
  },
];

function normalizeLevel(raw?: string | null): string {
  if (!raw) return '';
  const value = String(raw).trim().toLowerCase();
  if (!value) return '';
  if (value === 'easy') return 'a1';
  if (value === 'medium') return 'a2';
  if (value === 'hard') return 'b1';
  if (/^hsk\s*\d$/i.test(value)) return value.replace(/\s+/g, '');
  return value;
}

export function tokenizePracticeContext(text: string): string[] {
  const raw = String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/[\s/-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP.has(token));
  return [...new Set(raw)];
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function themeBoostForContext(contextTokens: string[], contextText: string): string[] {
  const boosts: string[] = [];
  for (const group of THEME_GROUPS) {
    const hit = group.trigger.some((key) => (
      contextText.includes(key) || contextTokens.some((token) => token.includes(key) || key.includes(token))
    ));
    if (hit) boosts.push(...group.boost);
  }
  return [...new Set(boosts)];
}

export function scoreVocabListForContext(
  list: RankableVocabList,
  context: PracticeListContext | null | undefined,
): number {
  if (!context?.text?.trim()) return 0;
  const contextText = context.text.toLowerCase();
  const contextTokens = tokenizePracticeContext(context.text);
  if (!contextTokens.length) return 0;

  const title = String(list.title || '').toLowerCase();
  const description = String(list.description || '').toLowerCase();
  const systemKey = String(list.system_key || '').toLowerCase();
  const boundLabel = String(list.bound_label || '').toLowerCase();
  const themeKeys = Array.isArray(list.theme_keys)
    ? list.theme_keys.map((key) => String(key || '').toLowerCase()).filter(Boolean)
    : [];
  const listBlob = `${title} ${description} ${systemKey} ${boundLabel} ${themeKeys.join(' ')}`;
  const listTokens = tokenizePracticeContext(listBlob);

  let score = 0;
  for (const token of contextTokens) {
    if (title === token || title.includes(token)) score += 4;
    else if (listTokens.some((item) => item === token || item.includes(token) || token.includes(item))) score += 2;
  }

  const themeBoosts = themeBoostForContext(contextTokens, contextText);
  for (const boost of themeBoosts) {
    if (themeKeys.includes(boost) || includesAny(listBlob, [boost])) score += 5;
  }

  const wantLevel = normalizeLevel(context.level);
  const listLevel = normalizeLevel(list.level);
  if (wantLevel && listLevel && wantLevel === listLevel) score += 3;
  else if (wantLevel && listLevel && wantLevel[0] === listLevel[0]) score += 1;

  return score;
}

export function rankVocabListsForContext<T extends RankableVocabList>(
  lists: T[],
  context: PracticeListContext | null | undefined,
  options?: { minScore?: number },
): { matched: RankedVocabList<T>[]; rest: RankedVocabList<T>[] } {
  const minScore = options?.minScore ?? 4;
  const ranked = lists
    .map((list) => {
      const score = scoreVocabListForContext(list, context);
      return { ...list, score, matched: score >= minScore };
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'ru'));

  return {
    matched: ranked.filter((item) => item.matched),
    rest: ranked.filter((item) => !item.matched),
  };
}

export function buildRoleplayPracticeContext(scenario: {
  id?: string | null;
  title?: string | null;
  description?: string | null;
  goal?: string | null;
  goalRu?: string | null;
  category?: string | null;
  setting?: string | null;
  settingRu?: string | null;
  scenarioText?: string | null;
  scenarioTextRu?: string | null;
  level?: string | null;
  difficulty?: string | null;
  steps?: Array<{ titleRu?: string | null; titleEn?: string | null }> | null;
} | null | undefined): PracticeListContext | null {
  if (!scenario) return null;
  const stepText = (scenario.steps || [])
    .map((step) => [step.titleRu, step.titleEn].filter(Boolean).join(' '))
    .join(' ');
  const text = [
    scenario.title,
    scenario.description,
    scenario.goalRu,
    scenario.goal,
    scenario.category,
    scenario.settingRu,
    scenario.setting,
    scenario.scenarioTextRu,
    scenario.scenarioText,
    stepText,
  ].filter((part) => typeof part === 'string' && part.trim()).join(' · ');
  if (!text.trim()) return null;
  const id = typeof scenario.id === 'string' ? scenario.id.trim() : '';
  const origin = id && /^[0-9a-f-]{36}$/i.test(id) ? 'user' as const : 'system' as const;
  const stepTitles = (scenario.steps || [])
    .map((step) => (step.titleRu || step.titleEn || '').trim())
    .filter(Boolean);
  return {
    label: 'Подходит к этой сцене',
    text,
    level: scenario.level || scenario.difficulty || null,
    steps: stepTitles,
    binding: buildListBinding({
      kind: 'scenario',
      ref: id || null,
      origin,
      label: scenario.title || null,
    }),
  };
}

function debateSide(value?: string | null) {
  if (value === 'for') return 'за';
  if (value === 'against') return 'против';
  return (value || '').trim();
}

export function buildDebatePracticeContext(input: {
  topic?: string | null;
  topicEn?: string | null;
  topicId?: string | null;
  topicKey?: string | null;
  userPosition?: string | null;
  aiPosition?: string | null;
  difficulty?: string | null;
  origin?: 'system' | 'user' | null;
} | null | undefined): PracticeListContext | null {
  const title = (input?.topic || input?.topicEn || '').trim();
  if (!title) return null;
  const learnerSide = debateSide(input?.userPosition);
  const partnerSide = debateSide(input?.aiPosition);
  const text = [
    input?.topicEn,
    input?.topic,
    learnerSide && `ученик ${learnerSide}`,
    partnerSide && `собеседник ${partnerSide}`,
  ].filter((part) => typeof part === 'string' && part.trim()).join(' · ');
  const ref = (input?.topicId || input?.topicKey || title).trim().slice(0, 120);
  return {
    label: 'Подходит к теме дебата',
    text: text || title,
    level: input?.difficulty || null,
    binding: buildListBinding({
      kind: 'debate',
      ref,
      origin: input?.origin === 'user' ? 'user' : 'system',
      label: title.slice(0, 140),
    }),
  };
}

export function buildModePracticeContext(mode: 'roleplay' | 'debate' | 'chat'): PracticeListContext {
  if (mode === 'debate') {
    return {
      label: 'Часто полезно в дебатах',
      text: 'debate argument opinion society politics education technology climate rights freedom everyday',
      level: null,
      // Пока тема дебата не выбрана — общий модульный binding; после выбора перепривяжется.
      binding: buildListBinding({
        kind: 'debate',
        ref: 'general-debate',
        origin: 'system',
        label: 'Дебаты',
      }),
    };
  }
  if (mode === 'roleplay') {
    return {
      label: 'Часто полезно в сценах',
      text: 'roleplay dialogue everyday cafe restaurant hotel apartment rent taxi travel doctor shop family home food intro',
      level: null,
      binding: buildListBinding({
        kind: 'scenario',
        ref: 'general-roleplay',
        origin: 'system',
        label: 'Ролевая сцена',
      }),
    };
  }
  return {
    label: 'Часто полезно в разговоре',
    text: 'everyday conversation intro family home food',
    level: null,
    binding: buildListBinding({
      kind: 'chat',
      ref: 'freestyle',
      origin: 'system',
      label: 'Свободный диалог',
    }),
  };
}
