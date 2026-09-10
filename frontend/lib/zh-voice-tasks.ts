/**
 * Контракт и API-клиент китайских голосовых заданий (zh_voice_tasks).
 * Это одно высказывание, не диалог: нет ролей, шагов и «кто начинает».
 */

import { getStoredBackendToken } from '@/lib/backend-jwt';

export type ZhHskLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type ZhVoiceTaskType = 'voicemail' | 'explain' | 'retell' | 'picture';
export type ZhVoiceTaskSource = 'user' | 'system';
export type ZhVoiceTaskGeneratePart = 'vocabulary' | 'checklist' | 'model_answer' | 'stimulus';
export type ZhVoiceTaskStatus = 'draft' | 'ready';
export type ZhVoiceAttemptStatus = 'recorded' | 'checked' | 'abandoned';
export type ZhChecklistItemStatus = 'done' | 'almost' | 'missed';
export type ZhVoiceTaskVerdict = 'done' | 'almost' | 'missed';

export const ZH_VOICE_TASK_TYPES: { value: ZhVoiceTaskType; label: string; hint: string }[] = [
  { value: 'voicemail', label: 'Голосовое', hint: 'Одно сообщение адресату, без ответа' },
  { value: 'explain', label: 'Объяснение', hint: 'Факт и просьба одним высказыванием' },
  { value: 'retell', label: 'Пересказ', hint: 'Своими словами после короткого стимула' },
  { value: 'picture', label: 'Картинка', hint: '看图说话 — позже' },
];

export const ZH_VOICE_TASK_V1_TYPES: ZhVoiceTaskType[] = ['voicemail', 'explain', 'retell'];

export function zhVoiceTaskTypeLabel(type?: ZhVoiceTaskType | null): string {
  return ZH_VOICE_TASK_TYPES.find((t) => t.value === type)?.label || 'Задание';
}

export const ZH_VOICE_TASK_MIN_SEC = 6;
export const ZH_VOICE_TASK_MAX_SEC = 90;

export interface ZhVoiceTaskChecklistItem {
  id: string;
  label_ru: string;
}

export interface ZhVoiceTaskVocabItem {
  hanzi: string;
  pinyin: string;
  translation_ru: string;
  hsk_level?: ZhHskLevel;
}

export interface ZhVoiceTask {
  id: string;
  source: ZhVoiceTaskSource;
  language: 'zh';
  status: ZhVoiceTaskStatus;
  archived: boolean;
  title: string;
  description?: string;
  type: ZhVoiceTaskType;
  hsk_level?: ZhHskLevel | null;
  time_target_sec: number;
  situation_ru?: string;
  instruction_ru: string;
  checklist: ZhVoiceTaskChecklistItem[];
  vocabulary: ZhVoiceTaskVocabItem[];
  stimulus_zh?: string | null;
  stimulus_pinyin?: string | null;
  stimulus_ru?: string | null;
  scene_ru?: string | null;
  model_answer_zh?: string;
  model_answer_pinyin?: string;
  model_answer_ru?: string;
  created_at?: string;
  updated_at?: string;
  attempts_count?: number;
  last_attempted_at?: string | null;
}

export type ZhVoiceTaskWritePayload = Partial<
  Pick<
    ZhVoiceTask,
    | 'title'
    | 'description'
    | 'type'
    | 'hsk_level'
    | 'time_target_sec'
    | 'situation_ru'
    | 'instruction_ru'
    | 'checklist'
    | 'vocabulary'
    | 'stimulus_zh'
    | 'stimulus_pinyin'
    | 'stimulus_ru'
    | 'scene_ru'
    | 'model_answer_zh'
    | 'model_answer_pinyin'
    | 'model_answer_ru'
    | 'status'
    | 'archived'
  >
>;

export type GenerateZhVoiceTaskResult = {
  title: string;
  hsk_level: ZhHskLevel;
  type: ZhVoiceTaskType;
  payload: Record<string, unknown>;
};

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

export function isZhVoiceTaskType(value: unknown): value is ZhVoiceTaskType {
  return value === 'voicemail' || value === 'explain' || value === 'retell' || value === 'picture';
}

export function isZhHskLevel(value: unknown): value is ZhHskLevel {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6;
}

export function defaultTimeTargetSec(hsk?: ZhHskLevel | null): number {
  if (!hsk || hsk <= 2) return 25;
  if (hsk === 3) return 35;
  return 45;
}

export function clampTimeTargetSec(value: unknown, hsk?: ZhHskLevel | null): number {
  const n = Number(value);
  const fallback = defaultTimeTargetSec(hsk);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(ZH_VOICE_TASK_MAX_SEC, Math.max(ZH_VOICE_TASK_MIN_SEC, Math.round(n)));
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNullableString(value: unknown): string | null {
  const s = asString(value);
  return s ?? null;
}

export function emptyManualZhVoiceTask(hsk: ZhHskLevel = 2): ZhVoiceTask {
  return {
    id: '',
    source: 'user',
    language: 'zh',
    status: 'draft',
    archived: false,
    title: '',
    description: '',
    type: 'voicemail',
    hsk_level: hsk,
    time_target_sec: defaultTimeTargetSec(hsk),
    situation_ru: '',
    instruction_ru: '',
    checklist: [
      { id: 'item-1', label_ru: '' },
      { id: 'item-2', label_ru: '' },
    ],
    vocabulary: [],
    stimulus_zh: null,
    stimulus_pinyin: null,
    stimulus_ru: null,
    scene_ru: null,
    model_answer_zh: '',
    model_answer_pinyin: '',
    model_answer_ru: '',
  };
}

export function canSaveZhVoiceTask(task: Pick<ZhVoiceTask, 'title' | 'type' | 'instruction_ru' | 'checklist' | 'hsk_level'>): boolean {
  const title = task.title?.trim();
  const instruction = task.instruction_ru?.trim();
  const checklist = (task.checklist || []).filter((item) => item.label_ru?.trim());
  return Boolean(title && isZhVoiceTaskType(task.type) && instruction && checklist.length >= 2 && isZhHskLevel(task.hsk_level));
}

export function toZhVoiceTaskWritePayload(task: ZhVoiceTask): ZhVoiceTaskWritePayload & { title: string } {
  const checklist = (task.checklist || [])
    .map((item, i) => ({
      id: item.id?.trim() || `item-${i + 1}`,
      label_ru: item.label_ru?.trim() || '',
    }))
    .filter((item) => item.label_ru);
  return {
    title: task.title.trim(),
    description: task.description?.trim() || undefined,
    type: task.type,
    hsk_level: task.hsk_level ?? undefined,
    time_target_sec: clampTimeTargetSec(task.time_target_sec, task.hsk_level),
    situation_ru: task.situation_ru?.trim() || undefined,
    instruction_ru: task.instruction_ru.trim(),
    checklist,
    vocabulary: (task.vocabulary || []).filter((v) => v.hanzi?.trim()),
    stimulus_zh: task.stimulus_zh?.trim() || null,
    stimulus_pinyin: task.stimulus_pinyin?.trim() || null,
    stimulus_ru: task.stimulus_ru?.trim() || null,
    scene_ru: task.scene_ru?.trim() || null,
    model_answer_zh: task.model_answer_zh?.trim() || undefined,
    model_answer_pinyin: task.model_answer_pinyin?.trim() || undefined,
    model_answer_ru: task.model_answer_ru?.trim() || undefined,
    status: canSaveZhVoiceTask({ ...task, checklist }) ? 'ready' : 'draft',
  };
}

export function draftFromGenerateResult(result: GenerateZhVoiceTaskResult): ZhVoiceTask {
  const p = result.payload || {};
  const hsk = result.hsk_level ?? (isZhHskLevel(p.hsk_level) ? p.hsk_level : 2);
  const type = isZhVoiceTaskType(result.type)
    ? result.type
    : isZhVoiceTaskType(p.type)
      ? p.type
      : 'voicemail';
  const checklist = Array.isArray(p.checklist)
    ? (p.checklist as ZhVoiceTaskChecklistItem[]).map((item, i) => ({
        id: item.id || `item-${i + 1}`,
        label_ru: item.label_ru || '',
      }))
    : emptyManualZhVoiceTask(hsk).checklist;
  return {
    ...emptyManualZhVoiceTask(hsk),
    title: result.title,
    description: typeof p.description === 'string' ? p.description : '',
    type,
    hsk_level: hsk,
    time_target_sec: clampTimeTargetSec(p.time_target_sec, hsk),
    situation_ru: asString(p.situation_ru) || '',
    instruction_ru: asString(p.instruction_ru) || '',
    checklist,
    vocabulary: Array.isArray(p.vocabulary) ? (p.vocabulary as ZhVoiceTaskVocabItem[]) : [],
    stimulus_zh: asNullableString(p.stimulus_zh),
    stimulus_pinyin: asNullableString(p.stimulus_pinyin),
    stimulus_ru: asNullableString(p.stimulus_ru),
    scene_ru: asNullableString(p.scene_ru),
    model_answer_zh: asString(p.model_answer_zh) || '',
    model_answer_pinyin: asString(p.model_answer_pinyin) || '',
    model_answer_ru: asString(p.model_answer_ru) || '',
    status: 'draft',
  };
}

export type ListZhVoiceTasksOptions = {
  archived?: boolean;
  hsk?: ZhHskLevel;
  type?: ZhVoiceTaskType;
  q?: string;
  source?: ZhVoiceTaskSource | 'all';
  sort?: 'last_used' | 'updated';
};

export async function listZhVoiceTasks(options?: ListZhVoiceTasksOptions): Promise<ZhVoiceTask[]> {
  const q = new URLSearchParams();
  if (options?.archived === true) q.set('archived', 'true');
  if (options?.archived === false) q.set('archived', 'false');
  if (options?.hsk) q.set('hsk', String(options.hsk));
  if (options?.type) q.set('type', options.type);
  if (options?.q?.trim()) q.set('q', options.q.trim());
  if (options?.source) q.set('source', options.source);
  if (options?.sort) q.set('sort', options.sort);
  const query = q.toString();
  const { tasks } = await fetchApi<{ tasks: ZhVoiceTask[] }>(
    `/api/zh-voice-tasks${query ? `?${query}` : ''}`
  );
  return tasks ?? [];
}

export async function getZhVoiceTask(id: string): Promise<ZhVoiceTask | null> {
  try {
    return await fetchApi<ZhVoiceTask>(`/api/zh-voice-tasks/${encodeURIComponent(id)}`);
  } catch {
    return null;
  }
}

export async function createZhVoiceTask(
  input: ZhVoiceTaskWritePayload & { title: string }
): Promise<ZhVoiceTask> {
  return fetchApi<ZhVoiceTask>('/api/zh-voice-tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateZhVoiceTask(id: string, updates: ZhVoiceTaskWritePayload): Promise<ZhVoiceTask> {
  return fetchApi<ZhVoiceTask>(`/api/zh-voice-tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteZhVoiceTask(id: string): Promise<void> {
  await fetchApi<void>(`/api/zh-voice-tasks/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function duplicateZhVoiceTask(id: string): Promise<ZhVoiceTask> {
  return fetchApi<ZhVoiceTask>(`/api/zh-voice-tasks/${encodeURIComponent(id)}/duplicate`, {
    method: 'POST',
  });
}

export type GenerateZhVoiceTaskParams = {
  prompt?: string;
  type?: 'auto' | Exclude<ZhVoiceTaskType, 'picture'>;
  textbook_title?: string;
  lesson_no?: string;
  hsk_level?: ZhHskLevel;
  goal?: string;
};

export async function generateZhVoiceTask(
  params: GenerateZhVoiceTaskParams
): Promise<GenerateZhVoiceTaskResult> {
  return fetchApi<GenerateZhVoiceTaskResult>('/api/zh-voice-tasks/generate', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export type GenerateZhVoiceTaskPartParams = {
  part: ZhVoiceTaskGeneratePart;
  task: ZhVoiceTaskWritePayload & { title?: string; hsk_level?: ZhHskLevel | null; type?: ZhVoiceTaskType };
  note?: string;
};

export type GenerateZhVoiceTaskPartResult = {
  part: ZhVoiceTaskGeneratePart;
  patch: Record<string, unknown>;
};

export async function generateZhVoiceTaskPart(
  params: GenerateZhVoiceTaskPartParams
): Promise<GenerateZhVoiceTaskPartResult> {
  return fetchApi<GenerateZhVoiceTaskPartResult>('/api/zh-voice-tasks/generate-part', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export interface ZhVoiceTaskChecklistResultItem {
  id: string;
  label_ru?: string;
  status: ZhChecklistItemStatus;
  note_ru: string;
}

export interface ZhVoiceTaskEvaluateResult {
  verdict: ZhVoiceTaskVerdict;
  checklist: ZhVoiceTaskChecklistResultItem[];
  strength_ru: string;
  next_try_zh: string;
  next_try_pinyin: string;
  next_try_ru: string;
  model_answer_zh: string;
  model_answer_pinyin: string;
  model_answer_ru: string;
}

export type EvaluateZhVoiceTaskParams = {
  task_id?: string;
  task?: ZhVoiceTaskWritePayload & { title?: string; type?: ZhVoiceTaskType; hsk_level?: ZhHskLevel | null };
  transcript: string;
  duration_sec: number;
  attempt_id?: string;
};

export async function evaluateZhVoiceTask(
  params: EvaluateZhVoiceTaskParams
): Promise<ZhVoiceTaskEvaluateResult> {
  return fetchApi<ZhVoiceTaskEvaluateResult>('/api/zh-voice-tasks/evaluate', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function zhVoiceTaskVerdictLabel(verdict?: ZhVoiceTaskVerdict | null): string {
  if (verdict === 'done') return 'Сделано';
  if (verdict === 'almost') return 'Почти';
  return 'Мало';
}

export function zhChecklistStatusLabel(status?: ZhChecklistItemStatus | null): string {
  if (status === 'done') return 'Сделано';
  if (status === 'almost') return 'Почти';
  return 'Мало';
}

export function applyGeneratePartPatch(
  draft: ZhVoiceTask,
  part: ZhVoiceTaskGeneratePart,
  patch: Record<string, unknown>
): ZhVoiceTask {
  if (part === 'vocabulary' && Array.isArray(patch.vocabulary)) {
    return {
      ...draft,
      vocabulary: (patch.vocabulary as ZhVoiceTaskVocabItem[]).map((v) => ({
        hanzi: v.hanzi || '',
        pinyin: v.pinyin || '',
        translation_ru: v.translation_ru || '',
        hsk_level: v.hsk_level,
      })),
    };
  }
  if (part === 'checklist' && Array.isArray(patch.checklist)) {
    return {
      ...draft,
      checklist: (patch.checklist as ZhVoiceTaskChecklistItem[]).map((item, i) => ({
        id: item.id || `item-${i + 1}`,
        label_ru: item.label_ru || '',
      })),
    };
  }
  if (part === 'model_answer') {
    return {
      ...draft,
      model_answer_zh: asString(patch.model_answer_zh) || draft.model_answer_zh,
      model_answer_pinyin: asString(patch.model_answer_pinyin) || draft.model_answer_pinyin,
      model_answer_ru: asString(patch.model_answer_ru) || draft.model_answer_ru,
    };
  }
  if (part === 'stimulus') {
    return {
      ...draft,
      stimulus_zh: asNullableString(patch.stimulus_zh),
      stimulus_pinyin: asNullableString(patch.stimulus_pinyin),
      stimulus_ru: asNullableString(patch.stimulus_ru),
    };
  }
  return draft;
}
