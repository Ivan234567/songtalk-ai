import {
  parsePlayMode,
  type PlayMode,
} from '@/lib/play-mode';

export const EN_PLAY_MODE_HINTS: Record<PlayMode, string> = {
  rehearsal: 'Шаги и первая фраза на экране. Собеседник терпеливый.',
  life: 'Цель списком. Первой фразы и шагов во время диалога не будет. Если не расслышали — переспросите.',
  stress: 'Собеседник занят или отвечает «нет». Цель сцены не меняется — нужно выкрутиться.',
};

export const EN_DEFAULT_REPAIR_PHRASES: Array<{ en: string; ru: string }> = [
  { en: 'Sorry, could you repeat that?', ru: 'Повторите, пожалуйста.' },
  { en: 'Did you say …?', ru: 'Вы сказали …?' },
  { en: 'Could you speak a bit slower?', ru: 'Помедленнее, пожалуйста.' },
];

const EN_REPAIR_RE =
  /\b(sorry\??|pardon\??|come again|repeat that|say that again|didn't catch|did not catch|didn['’]t get that|speak (a bit )?slower|could you repeat|what did you say|excuse me\??)\b/i;

export function enRepairUsed(texts: string[]): boolean {
  return texts.some((t) => EN_REPAIR_RE.test(String(t || '')));
}

export function defaultEnStressTwist(setting?: string): string {
  const place = typeof setting === 'string' ? setting.trim() : '';
  if (place) return `In “${place}” the other person mishears once and asks you to repeat. The scene goal stays the same.`;
  return 'The other person mishears once and asks you to repeat. The scene goal does not change.';
}

export function defaultEnStressTwistRu(setting?: string): string {
  const place = typeof setting === 'string' ? setting.trim() : '';
  if (place) return `В «${place}» собеседник один раз не расслышал и просит повторить. Цель сцены та же.`;
  return 'Собеседник один раз не расслышал и просит повторить. Цель сцены не меняется.';
}

export function enPlayModePromptOverlay(options: {
  mode: PlayMode;
  stressTwist?: string;
}): string {
  const mode = parsePlayMode(options.mode);
  const lines: string[] = [
    'PLAY MODE (attempt wrapper — do NOT change the scene goals, steps, or character):',
  ];
  if (mode === 'rehearsal') {
    lines.push(
      'Mode: REHEARSAL. Be patient. You may speak a bit slower. Elicit the needed information with a choice or recast. Do not lecture. Do not switch to Russian.'
    );
  } else if (mode === 'life') {
    lines.push(
      'Mode: LIFE. Same goals. Sound natural: short fillers (um, right, yeah, okay) are fine.',
      'Do not dump vocabulary lists or translate to Russian. If the learner answers off-topic, they probably misheard — wait; they should repair in English (Sorry? / Could you repeat that? / Could you speak a bit slower?). You may recast once.',
      'Never switch the task into small talk.'
    );
  } else {
    lines.push(
      'Mode: STRESS. Same goals and steps. You are busy, slightly impatient, may overlap or ask them to repeat once.',
      `Complication you MUST introduce once, then stay in the same task: ${options.stressTwist || defaultEnStressTwist()}`,
      'Do not invent a new quest. Do not refuse forever — after they repair or repeat clearly, continue toward the original goal.',
      'If they freeze, offer a binary choice in English, still in character.'
    );
  }
  return lines.join('\n');
}
