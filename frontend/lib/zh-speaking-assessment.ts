/**
 * Китайская оценка ситуативного диалога.
 * Не TEFL: нет pronunciation/тонов по транскрипту Whisper.
 */

import type { GoalAttainmentItem } from '@/lib/speaking-assessment';

export const ZH_CRITERIA_KEYS = [
  'task_completion',
  'vocabulary',
  'grammar',
  'interaction',
  'connected_speech',
] as const;

export type ZhCriteriaKey = (typeof ZH_CRITERIA_KEYS)[number];

export type ZhCriteriaScores = Record<ZhCriteriaKey, number>;

export interface ZhAssessmentFeedback {
  strengths?: string[];
  improvements?: string[];
  summary?: string;
  useful_phrase_zh?: string;
  useful_phrase_pinyin?: string;
  useful_phrase_ru?: string;
  goal_attainment?: GoalAttainmentItem[];
}

export interface ZhSpeakingAssessmentResult {
  criteria_scores: ZhCriteriaScores;
  overall_score: number;
  feedback: ZhAssessmentFeedback;
  user_messages: string[];
  format: 'dialogue';
  language: 'zh';
  scenario_id?: string | null;
  scenario_title?: string | null;
  agent_session_id?: string | null;
}

const ZH_CRITERIA_LABELS: Record<ZhCriteriaKey, string> = {
  task_completion: 'Цель и шаги',
  vocabulary: 'Слова урока',
  grammar: 'Грамматика',
  interaction: 'Диалог',
  connected_speech: 'Связность',
};

const ZH_CRITERIA_DESCRIPTIONS: Record<ZhCriteriaKey, string> = {
  task_completion: 'Достижение цели сценария и шагов',
  vocabulary: 'Нужные слова и уместность HSK',
  grammar: 'Порядок слов и частицы',
  interaction: 'Вопросы, реакции, не односложные ответы',
  connected_speech: 'Длина и связность реплик',
};

export function getZhCriteriaLabel(key: string): string {
  return ZH_CRITERIA_LABELS[key as ZhCriteriaKey] ?? key;
}

export function getZhCriteriaDescription(key: string): string {
  return ZH_CRITERIA_DESCRIPTIONS[key as ZhCriteriaKey] ?? '';
}

export function isZhCriteriaScores(value: unknown): value is ZhCriteriaScores {
  if (!value || typeof value !== 'object') return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.task_completion === 'number' && typeof rec.vocabulary === 'number';
}
