/**
 * Китайский слой «Ситуативные диалоги 2.0»: те же три режима попытки,
 * плюс пиньинь, repair по-китайски и overlay с HSK-lock.
 */

import {
  PLAY_MODES,
  PLAY_MODE_LABELS,
  MASTERY_SCORE_THRESHOLD,
  isPlayMode,
  parsePlayMode,
  nextPlayMode,
  nextPlayModeCta,
  playModeSpeechRate,
  scaffoldPolicy,
  emptyMasteredModes,
  masteredModesFromCompletions,
  masteredModesList,
  nextModeFromMastery,
  isAttemptMastered,
  recommendedNextPlayMode,
  type PlayMode,
  type MasteredModes,
  type ScaffoldPolicy,
} from '@/lib/play-mode';

export const ZH_PLAY_MODES = PLAY_MODES;
export type ZhPlayMode = PlayMode;
export const ZH_PLAY_MODE_LABELS = PLAY_MODE_LABELS;
export const ZH_MASTERY_SCORE_THRESHOLD = MASTERY_SCORE_THRESHOLD;
export const isZhPlayMode = isPlayMode;
export const parseZhPlayMode = parsePlayMode;
export const nextZhPlayMode = nextPlayMode;
export const nextZhPlayModeCta = nextPlayModeCta;
export const zhPlayModeSpeechRate = playModeSpeechRate;
export const isZhAttemptMastered = isAttemptMastered;
export type ZhMasteredModes = MasteredModes;
export {
  emptyMasteredModes,
  masteredModesFromCompletions,
  masteredModesList,
  nextModeFromMastery,
  recommendedNextPlayMode,
};

export const ZH_PLAY_MODE_HINTS: Record<ZhPlayMode, string> = {
  rehearsal: 'Шаги и слова на экране, как в уроке. Собеседник терпеливый.',
  life: 'Цель списком на экране, как в репетиции. Слов урока во время диалога не будет. Если не расслышали — переспросите.',
  stress: 'Собеседник занят или отвечает «нет». Цель сцены не меняется — нужно выкрутиться.',
};

export const ZH_DEFAULT_REPAIR_PHRASES: Array<{ zh: string; pinyin: string; ru: string }> = [
  { zh: '请再说一遍。', pinyin: 'qǐng zài shuō yí biàn.', ru: 'Повторите, пожалуйста.' },
  { zh: '你是说…吗？', pinyin: 'nǐ shì shuō… ma?', ru: 'Вы сказали …?' },
  { zh: '慢一点。', pinyin: 'màn yìdiǎn.', ru: 'Помедленнее.' },
];

const REPAIR_RE =
  /请再说|再说一遍|再说一次|慢一点|慢一些|你是说|没听清|听不懂|什么意思|请再说一遍/;

export type ZhScaffoldPolicy = ScaffoldPolicy & {
  pinyin: 'always' | 'tap' | 'after';
};

export function zhScaffoldPolicy(mode: ZhPlayMode): ZhScaffoldPolicy {
  const base = scaffoldPolicy(mode);
  if (mode === 'life') return { ...base, pinyin: 'tap' };
  if (mode === 'stress') return { ...base, pinyin: 'after' };
  return { ...base, pinyin: 'always' };
}

export function zhRepairUsed(texts: string[]): boolean {
  return texts.some((t) => REPAIR_RE.test(String(t || '')));
}

export type ZhMissedListeningItem = {
  said_zh: string;
  said_ru?: string;
  what_happened_ru: string;
};

export type ZhRepairPhrase = {
  zh: string;
  pinyin?: string;
  ru: string;
};

export type ZhRewindFork = {
  title_ru: string;
  hint_zh?: string;
  hint_ru?: string;
  after_user_line?: string;
  message_index?: number;
};

export type ZhListenReview = {
  missed_listening: ZhMissedListeningItem[];
  repair_phrases: ZhRepairPhrase[];
  rewind_forks: ZhRewindFork[];
  memory_facts: string[];
  repair_used: boolean;
};

function asTrimmed(value: unknown, max = 400): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function normalizeZhListenReview(raw: unknown, repairUsedFallback = false): ZhListenReview {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const missed = Array.isArray(src.missed_listening)
    ? src.missed_listening
        .map((item) => {
          const rec = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
          const said_zh = asTrimmed(rec.said_zh || rec.saidZh, 200);
          const what = asTrimmed(rec.what_happened_ru || rec.whatHappenedRu, 240);
          if (!said_zh && !what) return null;
          return {
            said_zh,
            said_ru: asTrimmed(rec.said_ru || rec.saidRu, 200) || undefined,
            what_happened_ru: what,
          };
        })
        .filter((v): v is ZhMissedListeningItem => Boolean(v))
        .slice(0, 3)
    : [];
  const phrases = Array.isArray(src.repair_phrases)
    ? src.repair_phrases
        .map((item) => {
          const rec = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
          const zh = asTrimmed(rec.zh, 80);
          if (!zh) return null;
          return {
            zh,
            pinyin: asTrimmed(rec.pinyin, 80) || undefined,
            ru: asTrimmed(rec.ru, 120) || '',
          };
        })
        .filter((v): v is ZhRepairPhrase => Boolean(v))
        .slice(0, 3)
    : [];
  const forks = Array.isArray(src.rewind_forks)
    ? src.rewind_forks
        .map((item) => {
          const rec = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
          const title_ru = asTrimmed(rec.title_ru || rec.titleRu, 160);
          if (!title_ru) return null;
          const idx = Number(rec.message_index ?? rec.messageIndex);
          return {
            title_ru,
            hint_zh: asTrimmed(rec.hint_zh || rec.hintZh, 200) || undefined,
            hint_ru: asTrimmed(rec.hint_ru || rec.hintRu, 200) || undefined,
            after_user_line: asTrimmed(rec.after_user_line || rec.afterUserLine, 200) || undefined,
            message_index: Number.isInteger(idx) && idx >= 0 ? idx : undefined,
          };
        })
        .filter((v): v is ZhRewindFork => Boolean(v))
        .slice(0, 3)
    : [];
  const memory = Array.isArray(src.memory_facts)
    ? src.memory_facts.map((f) => asTrimmed(f, 120)).filter(Boolean).slice(0, 3)
    : [];
  return {
    missed_listening: missed,
    repair_phrases: phrases.length ? phrases : ZH_DEFAULT_REPAIR_PHRASES,
    rewind_forks: forks,
    memory_facts: memory,
    repair_used: typeof src.repair_used === 'boolean' ? src.repair_used : repairUsedFallback,
  };
}

export function fallbackRewindForks(
  messages: Array<{ role: string; content: string }>
): ZhRewindFork[] {
  const forks: ZhRewindFork[] = [];
  for (let i = 0; i < messages.length - 1 && forks.length < 3; i++) {
    const cur = messages[i];
    const next = messages[i + 1];
    if (cur?.role !== 'assistant' || next?.role !== 'user') continue;
    const userLine = String(next.content || '').replace(/««[\s\S]*$/, '').trim();
    if (userLine.length < 2) continue;
    forks.push({
      title_ru: `После реплики собеседника можно было ответить иначе`,
      hint_ru: 'Скажите полную фразу и, если нужно, переспросите.',
      hint_zh: '请再说一遍。',
      after_user_line: userLine.slice(0, 80),
      message_index: i,
    });
  }
  return forks.slice(-3);
}

export function resolveRewindIndex(
  messages: Array<{ role: string; content: string }>,
  fork: ZhRewindFork
): number {
  if (typeof fork.message_index === 'number' && messages[fork.message_index]?.role === 'assistant') {
    return fork.message_index;
  }
  if (fork.after_user_line) {
    const needle = fork.after_user_line.trim();
    const userIdx = messages.findIndex(
      (m) => m.role === 'user' && String(m.content || '').includes(needle)
    );
    if (userIdx > 0 && messages[userIdx - 1]?.role === 'assistant') return userIdx - 1;
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'assistant') return i;
  }
  return -1;
}

export function defaultStressTwist(settingRu?: string): string {
  const place = typeof settingRu === 'string' ? settingRu.trim() : '';
  if (place) return `В «${place}» собеседник один раз не расслышал и просит повторить. Цель сцены та же.`;
  return 'Собеседник один раз не расслышал и просит повторить. Цель сцены не меняется.';
}

export function zhPlayModePromptOverlay(options: {
  mode: ZhPlayMode;
  stressTwist?: string;
  memoryFacts?: string[];
  rewindHint?: string;
}): string {
  const { mode, stressTwist, memoryFacts, rewindHint } = options;
  const lines: string[] = ['PLAY MODE (attempt wrapper — do NOT change the scene goals, steps, or HSK lock):'];
  if (mode === 'rehearsal') {
    lines.push(
      'Mode: REHEARSAL. Be patient. Elicit must-say words with a choice or recast. You may speak a bit slower. Do not lecture.'
    );
  } else if (mode === 'life') {
    lines.push(
      'Mode: LIFE. Same goals. Do not dump vocabulary lists. Sound natural: short fillers 那个 / 然后 / 嗯 are ok at this HSK.',
      'Do not simplify below the HSK lock. If the learner answers off-topic, they probably misheard — wait; they should repair in Chinese (请再说一遍 / 你是说…吗？ / 慢一点). You may recast once, not translate to Russian.',
      'Never switch the task (do not change the scene into small talk).'
    );
  } else {
    lines.push(
      'Mode: STRESS. Same goals and steps. You are busy, slightly impatient, may overlap or ask them to repeat once.',
      `Complication you MUST introduce once, then stay in the same task: ${stressTwist || defaultStressTwist()}`,
      'Do not invent a new quest. Do not refuse forever — after they repair or repeat clearly, continue toward the original goal.',
      'If they freeze, offer a binary choice in Chinese at the same HSK, still in character.'
    );
  }
  const facts = (memoryFacts || [])
    .map((f) => (typeof f === 'string' ? f.trim() : ''))
    .filter(Boolean)
    .slice(0, 3);
  if (facts.length) {
    lines.push(
      'MEMORY from a previous attempt at THIS scene (use at most one of these if it fits naturally): ' +
        facts.join(' | ')
    );
  }
  if (rewindHint?.trim()) {
    lines.push(
      `The learner is replaying from a moment in this attempt. Nudge toward: ${rewindHint.trim()}. Stay in character. One hint max.`
    );
  }
  return lines.join('\n');
}
