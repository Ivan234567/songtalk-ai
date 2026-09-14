/**
 * Три режима попытки на одной карточке сценария (EN и ZH).
 * Не учебная программа и не отдельная вкладка — свойство попытки.
 */

export const PLAY_MODES = ['rehearsal', 'life', 'stress'] as const;
export type PlayMode = (typeof PLAY_MODES)[number];

export const PLAY_MODE_LABELS: Record<PlayMode, string> = {
  rehearsal: 'Репетиция',
  life: 'Как в жизни',
  stress: 'Стресс',
};

export const PLAY_MODE_HINTS: Record<PlayMode, string> = {
  rehearsal: 'Шаги и подсказки на экране, как в уроке. Собеседник терпеливый.',
  life: 'Цель списком. Шпаргалки во время диалога не будет. Если не расслышали — переспросите.',
  stress: 'Собеседник занят или отвечает «нет». Цель сцены не меняется — нужно выкрутиться.',
};

export const MASTERY_SCORE_THRESHOLD = 6;

export function isPlayMode(value: unknown): value is PlayMode {
  return value === 'rehearsal' || value === 'life' || value === 'stress';
}

export function parsePlayMode(value: unknown): PlayMode {
  return isPlayMode(value) ? value : 'rehearsal';
}

export function nextPlayMode(mode: PlayMode): PlayMode | null {
  if (mode === 'rehearsal') return 'life';
  if (mode === 'life') return 'stress';
  return null;
}

export function nextPlayModeCta(mode: PlayMode): string | null {
  if (mode === 'rehearsal') return 'Пройти это же как в жизни';
  if (mode === 'life') return 'Тот же диалог, но собеседник будет занят';
  return null;
}

export type ScaffoldPolicy = {
  showSteps: boolean;
  showVocab: boolean;
  vocabPeekOnce: boolean;
  showFirstLine: boolean;
};

export function scaffoldPolicy(mode: PlayMode): ScaffoldPolicy {
  if (mode === 'life') {
    return {
      showSteps: false,
      showVocab: false,
      vocabPeekOnce: true,
      showFirstLine: false,
    };
  }
  if (mode === 'stress') {
    return {
      showSteps: false,
      showVocab: false,
      vocabPeekOnce: false,
      showFirstLine: false,
    };
  }
  return {
    showSteps: true,
    showVocab: true,
    vocabPeekOnce: false,
    showFirstLine: true,
  };
}

export function playModeSpeechRate(base: number, mode: PlayMode): number {
  const n = Number.isFinite(base) ? base : 1;
  if (mode === 'life') return Math.min(1.2, Math.round((n + 0.08) * 100) / 100);
  if (mode === 'stress') return Math.min(1.28, Math.round((n + 0.16) * 100) / 100);
  return n;
}

export type MasteredModes = Record<PlayMode, boolean>;

export function emptyMasteredModes(): MasteredModes {
  return { rehearsal: false, life: false, stress: false };
}

export function masteredModesFromCompletions(
  rows: Array<{ play_mode?: string | null }>
): MasteredModes {
  const out = emptyMasteredModes();
  for (const row of rows) {
    out[parsePlayMode(row.play_mode)] = true;
  }
  return out;
}

export function masteredModesList(map: MasteredModes | PlayMode[] | undefined): PlayMode[] {
  if (Array.isArray(map)) return PLAY_MODES.filter((m) => map.includes(m));
  if (!map || typeof map !== 'object') return [];
  return PLAY_MODES.filter((m) => Boolean((map as MasteredModes)[m]));
}

export function nextModeFromMastery(map: MasteredModes | undefined): PlayMode {
  if (!map?.rehearsal) return 'rehearsal';
  if (!map.life) return 'life';
  if (!map.stress) return 'stress';
  return 'life';
}

/** Слой закрыт, если сцена доведена и балл ≥ порога. Без оценки — цель уже закрыта completion. */
export function isAttemptMastered(overallScore: number | null | undefined): boolean {
  if (typeof overallScore !== 'number') return true;
  return overallScore >= MASTERY_SCORE_THRESHOLD;
}

/** Следующий слой вперёд. Не возвращает назад, если ученик сразу играл «жизнь» или «стресс». */
export function recommendedNextPlayMode(map: MasteredModes | undefined): PlayMode | null {
  if (!map) return null;
  if (map.rehearsal && !map.life) return 'life';
  if (map.life && !map.stress) return 'stress';
  return null;
}

export function asMasteredModes(value: unknown): MasteredModes {
  const src = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    rehearsal: Boolean(src.rehearsal),
    life: Boolean(src.life),
    stress: Boolean(src.stress),
  };
}
