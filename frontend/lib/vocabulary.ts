import type { LearningLanguage } from '@/lib/learning-language';

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type HskLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type LevelFilterValue = 'all' | CefrLevel | `${HskLevel}`;

export const CEFR_LEVEL_OPTIONS: { value: LevelFilterValue; label: string }[] = [
  { value: 'all', label: 'Все уровни' },
  { value: 'A1', label: 'A1' },
  { value: 'A2', label: 'A2' },
  { value: 'B1', label: 'B1' },
  { value: 'B2', label: 'B2' },
  { value: 'C1', label: 'C1' },
  { value: 'C2', label: 'C2' },
];

export const HSK_LEVEL_OPTIONS: { value: LevelFilterValue; label: string }[] = [
  { value: 'all', label: 'Все уровни' },
  { value: '1', label: 'HSK 1' },
  { value: '2', label: 'HSK 2' },
  { value: '3', label: 'HSK 3' },
  { value: '4', label: 'HSK 4' },
  { value: '5', label: 'HSK 5' },
  { value: '6', label: 'HSK 6' },
];

export function getLevelOptions(language: LearningLanguage) {
  return language === 'zh' ? HSK_LEVEL_OPTIONS : CEFR_LEVEL_OPTIONS;
}

export function getWordLevelBadge(
  word: { difficulty_level?: CefrLevel | null; hsk_level?: number | null },
  language: LearningLanguage,
): string | null {
  if (language === 'zh') {
    return word.hsk_level ? `HSK ${word.hsk_level}` : null;
  }
  return word.difficulty_level ?? null;
}

export function isCefrLevel(value: string): value is CefrLevel {
  return ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(value);
}

export function isHskLevelValue(value: string): value is `${HskLevel}` {
  return ['1', '2', '3', '4', '5', '6'].includes(value);
}

export function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

export function containsEnglish(text: string): boolean {
  return /[a-zA-Z]/.test(text);
}
