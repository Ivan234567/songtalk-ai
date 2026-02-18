/**
 * API-клиент для личных ролевых сценариев (user_roleplay_scenarios).
 * Сценарий из этого модуля по форме совместим с RoleplayScenario и подставляется
 * в тот же контур игры в AgentTab.
 */

import type { RoleplayScenario } from '@/lib/roleplay';

export type UserScenarioLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'easy' | 'medium' | 'hard';

/** Запись из API: сценарий с полями из БД + payload (совместим с RoleplayScenario при игре) */
export type UserScenario = RoleplayScenario & {
  level: UserScenarioLevel;
  archived: boolean;
  created_at?: string;
  updated_at?: string;
  /** Число завершений сценария (из roleplay_completions) */
  completions_count?: number;
  /** Время последнего завершения (ISO) — для сортировки «по последнему использованию» */
  last_completed_at?: string | null;
};

function getApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function getBackendToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('backend_jwt');
}

async function fetchApi<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getBackendToken();
  if (!token) {
    throw new Error('Необходима авторизация');
  }
  const res = await fetch(`${getApiUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
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

/** Список личных сценариев (опционально только неархивные или только архивные) */
export async function listUserScenarios(options?: { archived?: boolean }): Promise<UserScenario[]> {
  const q = new URLSearchParams();
  if (options?.archived === true) q.set('archived', 'true');
  if (options?.archived === false) q.set('archived', 'false');
  const query = q.toString();
  const { scenarios } = await fetchApi<{ scenarios: UserScenario[] }>(
    `/api/user-scenarios${query ? `?${query}` : ''}`
  );
  return scenarios ?? [];
}

/** Один сценарий по id (для воспроизведения или редактирования) */
export async function getUserScenario(id: string): Promise<UserScenario | null> {
  try {
    return await fetchApi<UserScenario>(`/api/user-scenarios/${encodeURIComponent(id)}`);
  } catch {
    return null;
  }
}

/** Параметры генерации: свободный текст и/или структурированные поля */
export type GenerateScenarioParams = {
  /** Свободный текст запроса */
  prompt?: string;
  /** Уровень (влияет на сложность языка в сценарии) */
  level?: UserScenarioLevel;
  /** Структурированные поля (тема, место, роль, цель) */
  structured?: {
    topic?: string;
    place?: string;
    userRole?: string;
    goal?: string;
    slangMode?: 'off' | 'light' | 'heavy';
    allowProfanity?: boolean;
    aiMayUseProfanity?: boolean;
    profanityIntensity?: 'light' | 'medium' | 'hard';
  };
};

/** Результат генерации: заголовок, уровень и payload для сохранения или редактирования */
export type GenerateScenarioResult = {
  title: string;
  level: UserScenarioLevel;
  payload: Record<string, unknown>;
};

/** Сгенерировать сценарий с помощью ИИ по запросу и уровню */
export async function generateUserScenario(
  params: GenerateScenarioParams
): Promise<GenerateScenarioResult> {
  return fetchApi<GenerateScenarioResult>('/api/user-scenarios/generate', {
    method: 'POST',
    body: JSON.stringify({
      prompt: params.prompt?.trim() || undefined,
      level: params.level ?? 'medium',
      structured: params.structured,
    }),
  });
}

/** Создать личный сценарий */
export async function createUserScenario(params: {
  title: string;
  level?: UserScenarioLevel;
  payload: Record<string, unknown>;
}): Promise<UserScenario> {
  return fetchApi<UserScenario>('/api/user-scenarios', {
    method: 'POST',
    body: JSON.stringify({
      title: params.title,
      level: params.level ?? 'medium',
      payload: params.payload,
    }),
  });
}

/** Обновить личный сценарий (редактирование, архив, снятие с архива) */
export async function updateUserScenario(
  id: string,
  updates: {
    title?: string;
    level?: UserScenarioLevel;
    archived?: boolean;
    payload?: Record<string, unknown>;
  }
): Promise<UserScenario> {
  return fetchApi<UserScenario>(`/api/user-scenarios/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

/** Удалить личный сценарий */
export async function deleteUserScenario(id: string): Promise<void> {
  await fetchApi<void>(`/api/user-scenarios/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/** Проверка: id принадлежит личному сценарию (UUID), а не системному (slug) */
export function isUserScenarioId(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}
