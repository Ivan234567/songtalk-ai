import type { LearningLanguage } from '@/lib/learning-language';

export function buildAgentJsonHeaders(
  token: string,
  learningLanguage: LearningLanguage,
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Learning-Language': learningLanguage,
  };
}

export function buildAgentAuthHeaders(
  token: string,
  learningLanguage: LearningLanguage,
): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'X-Learning-Language': learningLanguage,
  };
}

export function withLearningLanguageBody<T extends Record<string, unknown>>(
  body: T,
  learningLanguage: LearningLanguage,
): T & { learningLanguage: LearningLanguage; operation_id: string } {
  const existing = typeof body.operation_id === 'string' ? body.operation_id.trim() : '';
  return {
    ...body,
    learningLanguage,
    operation_id: existing || crypto.randomUUID(),
  };
}
