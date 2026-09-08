/**
 * API-клиент китайских сценариев (zh_scenarios).
 * Генерация ИИ и UI конструктора — следующие этапы.
 */

import { getStoredBackendToken } from '@/lib/backend-jwt';
import type { RoleplayScenario } from '@/lib/roleplay';

export type ZhStarter = 'ai' | 'user';
export type ZhFormality = 'ni' | 'nin' | 'mixed';
export type ZhSlangMode = 'off' | 'light';
export type ZhSource = 'user' | 'system';
export type ZhStatus = 'draft' | 'ready';
export type ZhHskLevel = 1 | 2 | 3 | 4 | 5 | 6;

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
  role_mode: 'ai' | 'user';
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

export function draftFromGenerateResult(result: GenerateZhScenarioResult): ZhScenario {
  const p = result.payload || {};
  const textbook = p.textbook && typeof p.textbook === 'object' ? (p.textbook as ZhScenarioTextbook) : {};
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
    user_role: typeof p.user_role === 'string' ? p.user_role : undefined,
    ai_role: typeof p.ai_role === 'string' ? p.ai_role : undefined,
    setting_ru: typeof p.setting_ru === 'string' ? p.setting_ru : undefined,
    scenario_text_ru: typeof p.scenario_text_ru === 'string' ? p.scenario_text_ru : undefined,
    character_opening: typeof p.character_opening === 'string' ? p.character_opening : undefined,
    suggested_first_line: typeof p.suggested_first_line === 'string' ? p.suggested_first_line : undefined,
    suggested_first_line_pinyin:
      typeof p.suggested_first_line_pinyin === 'string' ? p.suggested_first_line_pinyin : undefined,
    max_score_tips_ru: typeof p.max_score_tips_ru === 'string' ? p.max_score_tips_ru : undefined,
    steps: Array.isArray(p.steps) ? (p.steps as ZhScenario['steps']) : [],
    vocabulary: Array.isArray(p.vocabulary) ? (p.vocabulary as ZhScenario['vocabulary']) : [],
  };
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

  const vocabBlock = vocab.length
    ? [
        'SCENARIO VOCABULARY — you MUST use these words in the spoken dialogue.',
        'In every reply include 1–2 of them when they fit the situation. Do not dump the list. Do not ignore this list.',
        'Prefer these words over synonyms the learner has not studied.',
        vocab.map((v) => `- ${v.hanzi} (${v.pinyin}) — ${v.translation_ru}`).join('\n'),
      ].join('\n')
    : '';

  const systemPrompt = [
    `Character: You are ${scenario.ai_role || 'the other person in this Chinese roleplay'}. Stay in character.`,
    `Situation: ${scenario.scenario_text_ru || scenario.description || scenario.title}`,
    scenario.user_role ? `The learner's role: ${scenario.user_role}` : '',
    goals.length ? `Goals of this scene: ${goals.join('; ')}` : '',
    textbookLine ? `Textbook context: ${textbookLine}` : '',
    scenario.hsk_level
      ? `HSK LEVEL LOCK: Speak at HSK ${scenario.hsk_level} only. Same difficulty, not harder, not easier. No words or grammar from a higher HSK.`
      : '',
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
    scenarioVocabulary: vocab
      .filter((v) => v.hanzi?.trim())
      .map((v) => ({
        hanzi: v.hanzi,
        pinyin: v.pinyin || '',
        translation_ru: v.translation_ru || '',
      })),
  };
}
