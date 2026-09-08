/**
 * API-клиент китайских сценариев (zh_scenarios).
 */

import { getStoredBackendToken } from '@/lib/backend-jwt';
import type { RoleplayScenario } from '@/lib/roleplay';

export type ZhStarter = 'ai' | 'user';
export type ZhFormality = 'ni' | 'nin' | 'mixed';
export type ZhSlangMode = 'off' | 'light';
export type ZhSource = 'user' | 'system';
export type ZhStatus = 'draft' | 'ready';
export type ZhHskLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type ZhVocabUsage = 'must_say' | 'model';
export type ZhAiPersonality = 'warm' | 'patient' | 'hurried' | 'chatty' | 'strict' | 'professional';
export type ZhGeneratePart = 'vocabulary' | 'steps' | 'openings';

export const ZH_AI_PERSONALITIES: { value: ZhAiPersonality; label: string; hint: string }[] = [
  { value: 'warm', label: 'Тёплый', hint: 'доброжелательный, слегка поддерживает' },
  { value: 'patient', label: 'Терпеливый', hint: 'ждёт, повторяет, не торопит' },
  { value: 'hurried', label: 'Торопится', hint: 'короткие реплики, лёгкая спешка' },
  { value: 'chatty', label: 'Болтливый', hint: 'живые уточнения, не лекция' },
  { value: 'strict', label: 'Строгий', hint: 'держит роль, мало подсказок' },
  { value: 'professional', label: 'Деловой', hint: 'спокойный специалист / сотрудник' },
];

export const ZH_GRAMMAR_CHIPS = [
  '了',
  '吗 / 呢',
  '的',
  '想 / 要',
  'счётные слова',
  '因为…所以',
  '虽然…但是',
  '过',
  '在 + место',
];

export interface ZhScenarioStep {
  id: string;
  order: number;
  title_ru: string;
  expected_user_action: string;
  ai_context?: string;
  keywords: string[];
  example_zh?: string;
}

export interface ZhScenarioVocabItem {
  hanzi: string;
  pinyin: string;
  translation_ru: string;
  hsk_level?: ZhHskLevel;
  usage?: ZhVocabUsage;
}

export interface ZhScenarioTextbook {
  title?: string;
  lesson_no?: string;
}

export interface ZhScenario {
  id: string;
  source: ZhSource;
  language: 'zh';
  status: ZhStatus;
  archived: boolean;
  title: string;
  description?: string;
  goals: string[];
  hsk_level?: ZhHskLevel | null;
  textbook?: ZhScenarioTextbook;
  starter: ZhStarter;
  formality: ZhFormality;
  slang_mode: ZhSlangMode;
  user_role?: string;
  ai_role?: string;
  ai_personality?: ZhAiPersonality;
  ai_personality_note?: string;
  grammar_focus?: string;
  setting_ru?: string;
  scenario_text_ru?: string;
  character_opening?: string;
  suggested_first_line?: string;
  suggested_first_line_pinyin?: string;
  max_score_tips_ru?: string;
  steps: ZhScenarioStep[];
  vocabulary: ZhScenarioVocabItem[];
  created_at?: string;
  updated_at?: string;
  completions_count?: number;
  last_completed_at?: string | null;
}

export type ZhScenarioWritePayload = Partial<
  Pick<
    ZhScenario,
    | 'title'
    | 'description'
    | 'goals'
    | 'hsk_level'
    | 'textbook'
    | 'starter'
    | 'formality'
    | 'slang_mode'
    | 'user_role'
    | 'ai_role'
    | 'ai_personality'
    | 'ai_personality_note'
    | 'grammar_focus'
    | 'setting_ru'
    | 'scenario_text_ru'
    | 'character_opening'
    | 'suggested_first_line'
    | 'suggested_first_line_pinyin'
    | 'max_score_tips_ru'
    | 'steps'
    | 'vocabulary'
    | 'status'
    | 'archived'
  >
>;

function getApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL || '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredBackendToken();
  if (!token) {
    throw new Error('Необходима авторизация');
  }
  const res = await fetch(`${getApiUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Learning-Language': 'zh',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || res.statusText || 'Ошибка запроса');
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export type ListZhScenariosOptions = {
  archived?: boolean;
  hsk?: ZhHskLevel;
  q?: string;
  textbook?: string;
  source?: ZhSource | 'all';
  sort?: 'last_used' | 'updated';
};

export async function listZhScenarios(options?: ListZhScenariosOptions): Promise<ZhScenario[]> {
  const q = new URLSearchParams();
  if (options?.archived === true) q.set('archived', 'true');
  if (options?.archived === false) q.set('archived', 'false');
  if (options?.hsk) q.set('hsk', String(options.hsk));
  if (options?.q?.trim()) q.set('q', options.q.trim());
  if (options?.textbook?.trim()) q.set('textbook', options.textbook.trim());
  if (options?.source) q.set('source', options.source);
  if (options?.sort) q.set('sort', options.sort);
  const query = q.toString();
  const { scenarios } = await fetchApi<{ scenarios: ZhScenario[] }>(
    `/api/zh-scenarios${query ? `?${query}` : ''}`
  );
  return scenarios ?? [];
}

export async function getZhScenario(id: string): Promise<ZhScenario | null> {
  try {
    return await fetchApi<ZhScenario>(`/api/zh-scenarios/${encodeURIComponent(id)}`);
  } catch {
    return null;
  }
}

export async function createZhScenario(input: ZhScenarioWritePayload & { title: string }): Promise<ZhScenario> {
  return fetchApi<ZhScenario>('/api/zh-scenarios', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type GenerateZhScenarioParams = {
  prompt?: string;
  textbook_title?: string;
  lesson_no?: string;
  hsk_level?: ZhHskLevel;
  goal?: string;
  role_mode?: 'ai' | 'user';
  user_role?: string;
  starter?: 'auto' | ZhStarter;
  formality?: 'auto' | ZhFormality;
};

export type GenerateZhScenarioResult = {
  title: string;
  hsk_level: ZhHskLevel;
  payload: Record<string, unknown>;
};

export async function generateZhScenario(params: GenerateZhScenarioParams): Promise<GenerateZhScenarioResult> {
  return fetchApi<GenerateZhScenarioResult>('/api/zh-scenarios/generate', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export type GenerateZhScenarioPartParams = {
  part: ZhGeneratePart;
  scenario: ZhScenarioWritePayload & { title?: string; hsk_level?: ZhHskLevel | null };
  note?: string;
};

export type GenerateZhScenarioPartResult = {
  part: ZhGeneratePart;
  patch: Record<string, unknown>;
};

export async function generateZhScenarioPart(
  params: GenerateZhScenarioPartParams
): Promise<GenerateZhScenarioPartResult> {
  return fetchApi<GenerateZhScenarioPartResult>('/api/zh-scenarios/generate-part', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

function asPersonality(value: unknown): ZhAiPersonality {
  const v = String(value || '');
  return ZH_AI_PERSONALITIES.some((p) => p.value === v) ? (v as ZhAiPersonality) : 'warm';
}

function asUsage(value: unknown): ZhVocabUsage {
  return value === 'must_say' ? 'must_say' : 'model';
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function draftFromGenerateResult(result: GenerateZhScenarioResult): ZhScenario {
  const p = result.payload || {};
  const textbook = p.textbook && typeof p.textbook === 'object' ? (p.textbook as ZhScenarioTextbook) : {};
  const vocabulary = Array.isArray(p.vocabulary)
    ? (p.vocabulary as ZhScenarioVocabItem[]).map((v) => ({
        ...v,
        usage: asUsage(v.usage),
      }))
    : [];
  return {
    id: '',
    source: 'user',
    language: 'zh',
    status: 'draft',
    archived: false,
    title: result.title,
    description: typeof p.description === 'string' ? p.description : '',
    goals: Array.isArray(p.goals) ? (p.goals as string[]) : [],
    hsk_level: result.hsk_level ?? (typeof p.hsk_level === 'number' ? (p.hsk_level as ZhHskLevel) : null),
    textbook,
    starter: p.starter === 'user' ? 'user' : 'ai',
    formality: p.formality === 'ni' || p.formality === 'mixed' ? p.formality : 'nin',
    slang_mode: p.slang_mode === 'light' ? 'light' : 'off',
    user_role: asString(p.user_role),
    ai_role: asString(p.ai_role),
    ai_personality: asPersonality(p.ai_personality),
    ai_personality_note: asString(p.ai_personality_note),
    grammar_focus: asString(p.grammar_focus) || '',
    setting_ru: asString(p.setting_ru),
    scenario_text_ru: asString(p.scenario_text_ru),
    character_opening: asString(p.character_opening),
    suggested_first_line: asString(p.suggested_first_line),
    suggested_first_line_pinyin: asString(p.suggested_first_line_pinyin),
    max_score_tips_ru: asString(p.max_score_tips_ru),
    steps: Array.isArray(p.steps) ? (p.steps as ZhScenario['steps']) : [],
    vocabulary,
  };
}

export function applyGeneratePartPatch(draft: ZhScenario, part: ZhGeneratePart, patch: Record<string, unknown>): ZhScenario {
  if (part === 'vocabulary' && Array.isArray(patch.vocabulary)) {
    return {
      ...draft,
      vocabulary: (patch.vocabulary as ZhScenarioVocabItem[]).map((v) => ({
        hanzi: v.hanzi || '',
        pinyin: v.pinyin || '',
        translation_ru: v.translation_ru || '',
        hsk_level: v.hsk_level,
        usage: asUsage(v.usage),
      })),
    };
  }
  if (part === 'steps' && Array.isArray(patch.steps)) {
    return {
      ...draft,
      steps: (patch.steps as ZhScenarioStep[]).map((s, i) => ({
        id: s.id || `step-${i + 1}`,
        order: s.order || i + 1,
        title_ru: s.title_ru || '',
        expected_user_action: s.expected_user_action || '',
        ai_context: s.ai_context,
        keywords: Array.isArray(s.keywords) ? s.keywords : [],
        example_zh: s.example_zh,
      })),
    };
  }
  if (part === 'openings') {
    return {
      ...draft,
      character_opening: asString(patch.character_opening) || draft.character_opening,
      suggested_first_line: asString(patch.suggested_first_line) || draft.suggested_first_line,
      suggested_first_line_pinyin:
        asString(patch.suggested_first_line_pinyin) || draft.suggested_first_line_pinyin,
    };
  }
  return draft;
}

export async function updateZhScenario(id: string, updates: ZhScenarioWritePayload): Promise<ZhScenario> {
  return fetchApi<ZhScenario>(`/api/zh-scenarios/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteZhScenario(id: string): Promise<void> {
  await fetchApi<void>(`/api/zh-scenarios/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function duplicateZhScenario(id: string): Promise<ZhScenario> {
  return fetchApi<ZhScenario>(`/api/zh-scenarios/${encodeURIComponent(id)}/duplicate`, {
    method: 'POST',
  });
}

export async function addZhScenarioVocabToDictionary(
  id: string,
  hanzi?: string[]
): Promise<{ added: number; skipped: number }> {
  return fetchApi<{ added: number; skipped: number }>(
    `/api/zh-scenarios/${encodeURIComponent(id)}/add-vocab`,
    {
      method: 'POST',
      body: JSON.stringify(hanzi?.length ? { hanzi } : {}),
    }
  );
}

export function emptyManualZhScenario(hsk: ZhHskLevel = 3): ZhScenario {
  return {
    id: '',
    source: 'user',
    language: 'zh',
    status: 'draft',
    archived: false,
    title: '',
    description: '',
    goals: [''],
    hsk_level: hsk,
    textbook: {},
    starter: 'ai',
    formality: 'nin',
    slang_mode: 'off',
    ai_personality: 'warm',
    grammar_focus: '',
    steps: [
      {
        id: 'step-1',
        order: 1,
        title_ru: '',
        expected_user_action: '',
        keywords: [],
      },
    ],
    vocabulary: [],
  };
}

export function canSaveZhScenario(s: ZhScenario): boolean {
  const title = s.title?.trim();
  const goals = (s.goals || []).map((g) => g.trim()).filter(Boolean);
  const hasStep = (s.steps || []).some((step) => step.expected_user_action?.trim());
  return Boolean(title && goals.length && hasStep);
}

export function toZhWritePayload(s: ZhScenario): ZhScenarioWritePayload & { title: string } {
  return {
    title: s.title.trim(),
    description: s.description,
    goals: (s.goals || []).map((g) => g.trim()).filter(Boolean),
    hsk_level: s.hsk_level ?? undefined,
    textbook: s.textbook,
    starter: s.starter,
    formality: s.formality,
    slang_mode: s.slang_mode,
    user_role: s.user_role,
    ai_role: s.ai_role,
    ai_personality: s.ai_personality,
    ai_personality_note: s.ai_personality_note,
    grammar_focus: s.grammar_focus,
    setting_ru: s.setting_ru,
    scenario_text_ru: s.scenario_text_ru,
    character_opening: s.character_opening,
    suggested_first_line: s.suggested_first_line,
    suggested_first_line_pinyin: s.suggested_first_line_pinyin,
    max_score_tips_ru: s.max_score_tips_ru,
    steps: s.steps,
    vocabulary: (s.vocabulary || []).filter((v) => v.hanzi?.trim()),
    status: canSaveZhScenario(s) ? 'ready' : 'draft',
  };
}

export function isZhScenarioId(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

export function personalityLabel(value?: ZhAiPersonality | null): string {
  return ZH_AI_PERSONALITIES.find((p) => p.value === value)?.label || 'Тёплый';
}

function hskToDifficulty(hsk?: ZhHskLevel | null): RoleplayScenario['difficulty'] {
  if (!hsk) return 'medium';
  if (hsk <= 2) return 'easy';
  if (hsk <= 4) return 'medium';
  return 'hard';
}

function formalityInstruction(formality: ZhFormality): string {
  if (formality === 'ni') return 'Address the learner with 你. Keep the tone casual.';
  if (formality === 'mixed') return 'Use 您 with strangers/staff and 你 with peers, whichever fits the scene.';
  return 'Address the learner with 您. Keep the tone polite.';
}

function slangInstruction(mode: ZhSlangMode): string {
  if (mode === 'light') {
    return 'You may use light, common colloquial Mandarin when it fits. Do not use internet slang the learner would not know at this HSK level.';
  }
  return 'Use standard spoken Mandarin. Avoid slang.';
}

function personalityInstruction(personality?: ZhAiPersonality, note?: string): string {
  const map: Record<ZhAiPersonality, string> = {
    warm: 'Personality: warm and encouraging, still fully in character. Do not break role to teach.',
    patient: 'Personality: patient. Wait, recast slowly, offer a simple choice if they hesitate. Do not rush.',
    hurried: 'Personality: you are in a hurry. Short replies, mild impatience, still polite at the given formality.',
    chatty: 'Personality: chatty. One extra comment or follow-up is fine. Still 1–3 sentences, no lecture.',
    strict: 'Personality: strict and businesslike. Stay in role. Do not over-help or simplify below the HSK lock.',
    professional: 'Personality: professional and composed, like a competent staff member or specialist.',
  };
  const base = map[personality || 'warm'] || map.warm;
  const extra = note?.trim() ? ` Extra note about this character: ${note.trim()}` : '';
  return base + extra;
}

/** Собирает systemPrompt и поля RoleplayScenario для существующего игрового контура. */
export function zhScenarioToRoleplay(
  scenario: ZhScenario,
  sessionStarter?: ZhStarter
): RoleplayScenario {
  const starter = sessionStarter ?? scenario.starter ?? 'ai';
  const goals = Array.isArray(scenario.goals) ? scenario.goals.filter(Boolean) : [];
  const steps = Array.isArray(scenario.steps) ? [...scenario.steps].sort((a, b) => a.order - b.order) : [];
  const vocab = Array.isArray(scenario.vocabulary) ? scenario.vocabulary : [];
  const textbookLine = [scenario.textbook?.title, scenario.textbook?.lesson_no].filter(Boolean).join(' · ');
  const mustSay = vocab.filter((v) => v.usage === 'must_say' && v.hanzi?.trim());
  const modelVocab = vocab.filter((v) => v.usage !== 'must_say' && v.hanzi?.trim());

  const stepsBlock = steps.length
    ? [
        'Dialogue checkpoints: these are LEARNER actions, not your script.',
        'Do not act out the learner\'s tasks. Do not ask them to repeat a checkpoint they already did.',
        'Mark progress when the learner clearly does the action; synonyms and pinyin count:',
        steps
          .map((s, i) => {
            const keys = (s.keywords || []).join(', ');
            const ctx = s.ai_context ? ` AI cue (how YOU react, not a line to force): ${s.ai_context}` : '';
            const example = s.example_zh ? ` Example learner phrase: ${s.example_zh}` : '';
            return `${i + 1}. ${s.title_ru}. Learner should: ${s.expected_user_action}.${keys ? ` Keywords: ${keys}.` : ''}${ctx}${example}`;
          })
          .join('\n'),
      ].join('\n')
    : '';

  const vocabBlock = [
    mustSay.length
      ? [
          'MUST-SAY VOCABULARY — the LEARNER should produce these. Elicit them with a choice or a recast.',
          'Do not say these words FOR the learner. Do not dump the list.',
          mustSay.map((v) => `- ${v.hanzi} (${v.pinyin}) — ${v.translation_ru}`).join('\n'),
        ].join('\n')
      : '',
    modelVocab.length
      ? [
          'MODEL VOCABULARY — YOU should use these in spoken dialogue when they fit.',
          'In every reply include 1 of them if natural. Prefer these over unstudied synonyms.',
          modelVocab.map((v) => `- ${v.hanzi} (${v.pinyin}) — ${v.translation_ru}`).join('\n'),
        ].join('\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const grammarBlock = scenario.grammar_focus?.trim()
    ? `GRAMMAR FOCUS of this lesson: ${scenario.grammar_focus.trim()}. Recast errors using this grammar. Do not lecture about the rule.`
    : '';

  const systemPrompt = [
    `Character: You are ${scenario.ai_role || 'the other person in this Chinese roleplay'}. Stay in character.`,
    personalityInstruction(scenario.ai_personality, scenario.ai_personality_note),
    `Situation: ${scenario.scenario_text_ru || scenario.description || scenario.title}`,
    scenario.setting_ru ? `Place: ${scenario.setting_ru}` : '',
    scenario.user_role ? `The learner's role: ${scenario.user_role}` : '',
    goals.length ? `Goals of this scene: ${goals.join('; ')}` : '',
    textbookLine ? `Textbook context: ${textbookLine}` : '',
    scenario.hsk_level
      ? `HSK LEVEL LOCK: Speak at HSK ${scenario.hsk_level} only. Same difficulty, not harder, not easier. No words or grammar from a higher HSK.`
      : '',
    grammarBlock,
    formalityInstruction(scenario.formality ?? 'nin'),
    slangInstruction(scenario.slang_mode ?? 'off'),
    stepsBlock,
    vocabBlock,
    'Spoken character lines must be Simplified Chinese only. After each spoken line add ««PINYIN»» JSON and ««TRANSLATION»» Russian — metadata is not spoken.',
    'If the learner hesitates, recast naturally in Chinese at the same HSK level and offer a simple choice. Do not lecture or give meta-commentary.',
    starter === 'ai' && scenario.character_opening
      ? `If YOU are starting AND the learner has not spoken yet, your first line is: "${scenario.character_opening}". Once the learner has spoken, never reuse this line.`
      : 'The learner starts. Wait for their first line; then reply in character to what they said. Do not speak first. Do not use any stored AI opening line in this session.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const firstLine =
    starter === 'user'
      ? [scenario.suggested_first_line, scenario.suggested_first_line_pinyin].filter(Boolean).join(' · ')
      : scenario.suggested_first_line;

  return {
    id: scenario.id,
    title: scenario.title,
    description: scenario.description,
    language: 'zh',
    category: 'everyday',
    systemPrompt,
    settingRu: scenario.setting_ru || textbookLine || undefined,
    scenarioTextRu: scenario.scenario_text_ru || scenario.description,
    yourRoleRu: scenario.user_role,
    yourRole: scenario.user_role,
    goalRu: goals.join(' · ') || undefined,
    goal: goals.join('; ') || undefined,
    characterOpening: starter === 'ai' ? scenario.character_opening : undefined,
    suggestedFirstLine: firstLine || undefined,
    openingInstruction: starter === 'ai' ? 'Start in character with the given first line.' : 'Wait for the learner to speak first.',
    steps: steps.map((s) => ({
      id: s.id,
      order: s.order,
      titleRu: s.title_ru,
      titleEn: s.expected_user_action,
    })),
    maxScoreTipsRu: scenario.max_score_tips_ru,
    slangMode: scenario.slang_mode === 'light' ? 'light' : 'off',
    allowProfanity: false,
    aiMayUseProfanity: false,
    difficulty: hskToDifficulty(scenario.hsk_level),
    level: scenario.hsk_level ? `HSK ${scenario.hsk_level}` : undefined,
    grammarFocus: scenario.grammar_focus?.trim() || undefined,
    aiPersonality: scenario.ai_personality,
    scenarioVocabulary: vocab
      .filter((v) => v.hanzi?.trim())
      .map((v) => ({
        hanzi: v.hanzi,
        pinyin: v.pinyin || '',
        translation_ru: v.translation_ru || '',
        usage: asUsage(v.usage),
      })),
  };
}
