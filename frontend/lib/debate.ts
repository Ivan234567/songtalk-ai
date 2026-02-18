export type DebatePosition = 'for' | 'against';
export type DebateDifficulty = 'easy' | 'medium' | 'hard';
export type DebateWhoStarts = 'ai' | 'user';
export type DebateSlangMode = 'off' | 'light' | 'heavy';
export type DebateProfanityIntensity = 'light' | 'medium' | 'hard';
export type DebateTopicSource = 'catalog' | 'custom';
export type DebateTopicLanguage = 'ru' | 'en' | 'unknown';
export type DebateTopicValidationStatus = 'valid' | 'warning' | 'rejected';

export interface DebateSettings {
  slangMode?: DebateSlangMode;
  allowProfanity?: boolean;
  aiMayUseProfanity?: boolean;
  profanityIntensity?: DebateProfanityIntensity;
}
export interface DebateTopicMeta {
  source: DebateTopicSource;
  original: string;
  normalized: string;
  language: DebateTopicLanguage;
  validationStatus: DebateTopicValidationStatus;
}
export type DebateMicroGoalId =
  | 'connectors'
  | 'concession'
  | 'example_support'
  | 'conditionals'
  | 'clarifying_question';

export interface DebateMicroGoal {
  id: DebateMicroGoalId;
  labelRu: string;
  labelEn: string;
  hintRu: string;
}

export interface DebateStepCompletionCriteria {
  /** Минимум пользовательских реплик для зачета шага */
  min_user_turns?: number;
  /** Минимум предложений в ключевой реплике */
  min_sentences?: number;
  /** Маркеры/связки, которые желательно использовать в этом шаге */
  required_markers?: string[];
  /** Нужно ли прямо отвечать на аргумент оппонента */
  must_reference_opponent?: boolean;
  /** Пояснение для step-checker, как строго считать шаг выполненным */
  evidence_hint_en?: string;
}

/** Шаг (чекпоинт) дебата — отображается в карте прогресса, ИИ отмечает выполнение */
export interface DebateStep {
  id: string;
  order: number;
  titleRu: string;
  titleEn: string;
  completionCriteria?: DebateStepCompletionCriteria;
}

const DEBATE_MICRO_GOAL_MAP: Record<DebateMicroGoalId, DebateMicroGoal> = {
  connectors: {
    id: 'connectors',
    labelRu: 'Связки',
    labelEn: 'Use connectors',
    hintRu: 'Используйте however, moreover, on the other hand',
  },
  concession: {
    id: 'concession',
    labelRu: 'Уступка + контраргумент',
    labelEn: 'Concede then counter',
    hintRu: 'Используйте фразу: "I see your point, but..."',
  },
  example_support: {
    id: 'example_support',
    labelRu: 'Аргумент с примером',
    labelEn: 'Support with an example',
    hintRu: 'Подкрепите аргумент примером или кейсом',
  },
  conditionals: {
    id: 'conditionals',
    labelRu: 'Условные конструкции',
    labelEn: 'Use conditionals',
    hintRu: 'Используйте if-условия в аргументации',
  },
  clarifying_question: {
    id: 'clarifying_question',
    labelRu: 'Уточняющий вопрос',
    labelEn: 'Ask a clarifying question',
    hintRu: 'Задайте оппоненту уточняющий вопрос',
  },
};

export const DEBATE_MICRO_GOALS_BY_LEVEL: Record<DebateDifficulty, DebateMicroGoalId[]> = {
  easy: ['connectors', 'example_support', 'clarifying_question'],
  medium: ['connectors', 'concession', 'example_support', 'clarifying_question'],
  hard: ['connectors', 'concession', 'example_support', 'conditionals', 'clarifying_question'],
};

export function getDebateMicroGoalsByDifficulty(difficulty?: DebateDifficulty | null): DebateMicroGoal[] {
  const level = difficulty ?? 'medium';
  const ids = DEBATE_MICRO_GOALS_BY_LEVEL[level] ?? DEBATE_MICRO_GOALS_BY_LEVEL.medium;
  return ids.map((id) => DEBATE_MICRO_GOAL_MAP[id]);
}

/** Адаптивные шаги дебата по сложности. Id остаются стабильными для совместимости с прогрессом. */
export const DEBATE_STEPS_BY_LEVEL: Record<DebateDifficulty, DebateStep[]> = {
  easy: [
    {
      id: 'opening',
      order: 1,
      titleRu: 'Кратко обозначить свою позицию',
      titleEn: 'State your position briefly',
      completionCriteria: {
        min_user_turns: 1,
        min_sentences: 1,
        evidence_hint_en: 'User clearly says they are for/against the topic in a direct way.',
      },
    },
    {
      id: 'main-argument',
      order: 2,
      titleRu: 'Привести 1 понятный аргумент',
      titleEn: 'Give one clear supporting argument',
      completionCriteria: {
        min_user_turns: 1,
        min_sentences: 1,
        required_markers: ['because', 'for example', 'например'],
        evidence_hint_en: 'User gives at least one reason why their position is correct.',
      },
    },
    {
      id: 'counter-argument',
      order: 3,
      titleRu: 'Коротко ответить на аргумент оппонента',
      titleEn: 'Briefly respond to opponent argument',
      completionCriteria: {
        min_user_turns: 2,
        min_sentences: 1,
        must_reference_opponent: true,
        required_markers: ['but', 'however', 'i disagree', 'но', 'однако'],
        evidence_hint_en: 'User directly references opponent point and responds, not just repeats own claim.',
      },
    },
    {
      id: 'defense',
      order: 4,
      titleRu: 'Подтвердить и защитить свою позицию',
      titleEn: 'Defend your position clearly',
      completionCriteria: {
        min_user_turns: 2,
        min_sentences: 1,
        evidence_hint_en: 'User restates and defends their position after challenge.',
      },
    },
  ],
  medium: [
    {
      id: 'opening',
      order: 1,
      titleRu: 'Представить свою позицию',
      titleEn: 'Present your position',
      completionCriteria: {
        min_user_turns: 1,
        min_sentences: 1,
        evidence_hint_en: 'User clearly states position with at least one supporting thought.',
      },
    },
    {
      id: 'main-argument',
      order: 2,
      titleRu: 'Привести основной аргумент с примером',
      titleEn: 'Present a main argument with an example',
      completionCriteria: {
        min_user_turns: 1,
        min_sentences: 2,
        required_markers: ['because', 'for example', 'for instance', 'потому что', 'например'],
        evidence_hint_en: 'User provides reason + example or explanation, not only a short claim.',
      },
    },
    {
      id: 'counter-argument',
      order: 3,
      titleRu: 'Ответить на аргумент оппонента',
      titleEn: 'Respond to opponent\'s argument',
      completionCriteria: {
        min_user_turns: 2,
        min_sentences: 2,
        must_reference_opponent: true,
        required_markers: ['however', 'on the other hand', 'i disagree because', 'однако', 'с другой стороны'],
        evidence_hint_en: 'User acknowledges opponent argument and then counters it with reasoning.',
      },
    },
    {
      id: 'defense',
      order: 4,
      titleRu: 'Защитить свою позицию',
      titleEn: 'Defend your position',
      completionCriteria: {
        min_user_turns: 2,
        min_sentences: 2,
        evidence_hint_en: 'User maintains consistency and defends own stance after pushback.',
      },
    },
  ],
  hard: [
    {
      id: 'opening',
      order: 1,
      titleRu: 'Четко обозначить позицию и рамку аргумента',
      titleEn: 'State position with a clear framing',
      completionCriteria: {
        min_user_turns: 1,
        min_sentences: 2,
        evidence_hint_en: 'User states stance and frames why this criterion matters.',
      },
    },
    {
      id: 'main-argument',
      order: 2,
      titleRu: 'Дать развернутый аргумент с логикой и примером',
      titleEn: 'Present a structured argument with logic and example',
      completionCriteria: {
        min_user_turns: 1,
        min_sentences: 3,
        required_markers: ['because', 'therefore', 'for example', 'moreover', 'потому что', 'поэтому'],
        evidence_hint_en: 'User builds a multi-part argument (claim + reason + evidence/example).',
      },
    },
    {
      id: 'counter-argument',
      order: 3,
      titleRu: 'Содержательно опровергнуть довод оппонента',
      titleEn: 'Substantively rebut opponent argument',
      completionCriteria: {
        min_user_turns: 2,
        min_sentences: 2,
        must_reference_opponent: true,
        required_markers: ['however', 'that assumes', 'i disagree because', 'однако', 'это предполагает'],
        evidence_hint_en: 'User addresses a specific opponent point and explains why it is weak/limited.',
      },
    },
    {
      id: 'defense',
      order: 4,
      titleRu: 'Защитить позицию и удержать последовательность',
      titleEn: 'Defend position and keep consistency',
      completionCriteria: {
        min_user_turns: 3,
        min_sentences: 2,
        evidence_hint_en: 'User remains consistent and strengthens defense after counter-pressure.',
      },
    },
  ],
};

/** Средний уровень оставляем дефолтным для обратной совместимости */
export const DEBATE_STEPS: DebateStep[] = DEBATE_STEPS_BY_LEVEL.medium;

export function getDebateStepsByDifficulty(difficulty?: DebateDifficulty | null): DebateStep[] {
  if (!difficulty) return DEBATE_STEPS_BY_LEVEL.medium;
  return DEBATE_STEPS_BY_LEVEL[difficulty] ?? DEBATE_STEPS_BY_LEVEL.medium;
}

export function normalizeDebateTopic(topic: string): string {
  return topic.replace(/\s+/g, ' ').trim();
}

export function detectDebateTopicLanguage(topic: string): DebateTopicLanguage {
  const hasCyrillic = /[А-Яа-яЁё]/.test(topic);
  const hasLatin = /[A-Za-z]/.test(topic);
  if (hasCyrillic && !hasLatin) return 'ru';
  if (hasLatin && !hasCyrillic) return 'en';
  if (hasCyrillic && hasLatin) return 'unknown';
  return 'unknown';
}

export function validateDebateTopic(topic: string): {
  status: DebateTopicValidationStatus;
  normalized: string;
  language: DebateTopicLanguage;
  errors: string[];
  warnings: string[];
} {
  const normalized = normalizeDebateTopic(topic);
  const language = detectDebateTopicLanguage(normalized);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (normalized.length < 10) {
    errors.push('Тема слишком короткая. Минимум 10 символов.');
  }
  if (normalized.length > 180) {
    errors.push('Тема слишком длинная. Максимум 180 символов.');
  }
  if (!/[A-Za-zА-Яа-яЁё]{3}/.test(normalized)) {
    errors.push('Добавьте осмысленную тему (буквы, а не только символы).');
  }
  if (/[\r\n]/.test(topic)) {
    warnings.push('Тема содержит переносы строк. Лучше оставить одно предложение.');
  }
  if (/(ignore|disregard|override).{0,80}(instruction|system|prompt|developer)/i.test(normalized)) {
    warnings.push('Тема похожа на инструкцию для модели. Формулируйте только предмет дебата.');
  }

  if (errors.length > 0) {
    return { status: 'rejected', normalized, language, errors, warnings };
  }
  if (warnings.length > 0) {
    return { status: 'warning', normalized, language, errors, warnings };
  }
  return { status: 'valid', normalized, language, errors, warnings };
}

export function sanitizeDebateTopicForPrompt(topic: string): string {
  const normalized = normalizeDebateTopic(topic);
  const withoutControl = normalized.replace(/[\u0000-\u001F\u007F]/g, ' ');
  const neutralized = withoutControl.replace(
    /(ignore|disregard|override).{0,80}(instruction|system|prompt|developer)/gi,
    'debate topic'
  );
  return neutralized
    .replace(/```+/g, '')
    .replace(/[<>]/g, '')
    .slice(0, 220)
    .trim();
}

const ADULT_PROFANITY_ALLOWED_INSTRUCTION =
  'This is an adult (18+) speaking practice mode. Profanity may appear depending on settings and context. Keep it purposeful, not random.';

const HARD_SAFETY_BLOCKS_INSTRUCTION =
  'Hard safety blocks (always forbidden): any sexual content involving minors, pedophilia, extremism/terrorism support, instructions for violent wrongdoing, non-consensual sexual violence, doxxing, or direct real-world threats. If user attempts this, refuse briefly and steer back to a safe alternative topic.';

function buildDebateSlangInstruction(settings?: DebateSettings): string {
  const mode = settings?.slangMode ?? 'off';
  if (mode === 'off') {
    return 'Use neutral conversational English. Avoid slang unless the user explicitly asks for it.';
  }
  if (mode === 'heavy') {
    return 'Use clearly colloquial speech and richer slang. Keep it natural, concise, and context-aware; do not force slang in every sentence.';
  }
  return 'Use light, common colloquial expressions and simple slang naturally, without overloading each reply.';
}

function buildDebateProfanityInstruction(settings?: DebateSettings): string {
  if (!settings?.allowProfanity) {
    return 'Avoid profanity and obscenities. Keep language clean, respectful, and natural.';
  }
  const intensity = settings.profanityIntensity ?? 'light';
  const canAiUseProfanity = Boolean(settings.aiMayUseProfanity);
  const intensityRule =
    intensity === 'hard'
      ? 'Intensity: hard. Profanity can be frequent in heated moments, but keep dialogue coherent and non-targeted.'
      : intensity === 'medium'
        ? 'Intensity: medium. Profanity can appear occasionally in emotional moments.'
        : 'Intensity: light. Prefer rare, mild profanity only when it sounds natural.';
  const aiRule = canAiUseProfanity
    ? 'AI may also use profanity when contextually appropriate, but avoid slurs and personal abuse.'
    : 'User may use profanity, but AI should respond without profanity and keep tone controlled.';
  return `${ADULT_PROFANITY_ALLOWED_INSTRUCTION} ${intensityRule} ${aiRule}`;
}

export function buildDebateSystemPrompt(
  topic: string,
  userPosition: DebatePosition,
  aiPosition: DebatePosition,
  difficulty?: DebateDifficulty,
  microGoalIds: DebateMicroGoalId[] = [],
  whoStarts: DebateWhoStarts = 'ai',
  settings?: DebateSettings
): string {
  const safeTopic = sanitizeDebateTopicForPrompt(topic);
  const userPositionText = userPosition === 'for' ? 'FOR' : 'AGAINST';
  const aiPositionText = aiPosition === 'for' ? 'FOR' : 'AGAINST';
  const difficultyLevel = difficulty || 'medium';
  const selectedSteps = getDebateStepsByDifficulty(difficultyLevel);
  const selectedMicroGoals = microGoalIds
    .map((id) => DEBATE_MICRO_GOAL_MAP[id])
    .filter(Boolean);
  const microGoalsBlock = selectedMicroGoals.length
    ? `\nMICRO GOALS FOR THIS SESSION:
${selectedMicroGoals.map((g, i) => `${i + 1}. ${g.labelEn}: ${g.hintRu}`).join('\n')}

As you debate, naturally encourage the user to practice these goals without breaking the flow.`
    : '';

  // Difficulty instructions
  let difficultyBlock = '';
  if (difficultyLevel === 'easy') {
    difficultyBlock = `DIFFICULTY LEVEL: Easy
- Use simple arguments and vocabulary, keep responses concise (2-3 sentences)
- Avoid complex reasoning or advanced terminology
- Focus on clear, straightforward points`;
  } else if (difficultyLevel === 'hard') {
    difficultyBlock = `DIFFICULTY LEVEL: Hard
- Use sophisticated arguments and advanced vocabulary (4-5 sentences)
- Challenge deeply with nuanced counter-arguments
- Employ varied, complex language structures`;
  } else {
    difficultyBlock = `DIFFICULTY LEVEL: Medium
- Use balanced arguments with varied vocabulary (3-4 sentences)
- Present well-structured points with moderate complexity
- Match a moderate level of debate sophistication`;
  }

  return `You are a debate opponent in an English speaking practice session.

DEBATE TOPIC: "${safeTopic}"
- User position: ${userPositionText}
- Your position: ${aiPositionText} (OPPOSITE of user)

${difficultyBlock}

ADAPTATION TO USER LEVEL:
- Observe the user's actual language level from their messages
- If they use simple vocabulary and short phrases: use simpler language, shorter arguments (2-3 sentences), offer gentle recasts
- If they speak fluently: use more sophisticated arguments, challenge with deeper points, use varied vocabulary
- Match their complexity and pace - adapt in real-time

NATURAL DEBATE STYLE:
- Sound like a real person in a debate, not a robot
- Use brief acknowledgments when appropriate ("I see your point", "That's interesting")
- React to their arguments naturally before countering
- Vary your reply length: short responses for simple points, longer for complex arguments
- Stay respectful but firm in your position

STYLE SETTINGS:
${buildDebateSlangInstruction(settings)}
${buildDebateProfanityInstruction(settings)}
${HARD_SAFETY_BLOCKS_INSTRUCTION}

DEBATE STRUCTURE (guide the conversation):
The debate follows these steps that the user should complete:
${selectedSteps
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((step, idx) => `${idx + 1}. ${step.titleEn} (id: "${step.id}")`)
      .join('\n')}

As the debate progresses, observe which steps the user has completed based on their arguments. Mark steps mentally only when the user gives clear evidence (not vague agreement). The system will track completed steps automatically.

PEDAGOGICAL APPROACH:
- If the user makes a grammar mistake but you understand them: naturally recast the correct form in your response (don't say "You should say...")
- If they struggle to express an idea: acknowledge their point and help them by rephrasing: "I think you're saying... Is that right?"
- If they use very simple language: model slightly more advanced phrases naturally
- Challenge their arguments constructively to make them think and defend better

DEBATE RULES:
1. Always maintain your position (${aiPositionText}) - never agree with the user's position
2. Present logical, well-structured arguments
3. Challenge the user's points constructively
4. Keep responses appropriate length: 2-4 sentences for simple points, up to 5-6 for complex arguments
5. Respond in the SAME language the user writes in (if they write in Russian, respond in Russian; if English, respond in English)
6. Stay respectful and professional
${microGoalsBlock}

GOAL COMPLETION:
The debate is successfully completed when:
- Both sides have presented their main arguments (at least 2-3 exchanges)
- The user has defended their position with at least one clear argument
- There has been a natural back-and-forth discussion

When the goal is reached naturally, you may offer a brief closing statement summarizing your position, then the debate can conclude. Do not force an ending - let it flow naturally.

${whoStarts === 'ai' ? `FIRST LINE (you open the debate):
Your FIRST reply must feel like a real person starting a casual but opinionated conversation — NOT a formal speech.
Follow this structure naturally (do NOT label the parts):

1. HOOK / PERSONAL REACTION to the topic (1 sentence) — React to the topic as a real person would. Examples:
   - Share a relatable observation: "You know, I was just reading about this the other day..."
   - Express genuine curiosity or surprise: "This is actually something I feel pretty strongly about..."
   - Reference a common experience: "I think most people assume X, but actually..."
   - Use a thought-provoking fact or question: "Did you know that...?" / "Have you ever noticed that...?"
   Do NOT start with "I disagree" or "I believe the opposite" — that sounds robotic.

2. SOFT POSITION (1-2 sentences) — Naturally slide into your stance. Use conversational phrasing:
   - "Honestly, I'm more on the side of..."
   - "The way I see it..."
   - "I've always thought that..."
   Keep it brief — save your strongest arguments for later.

3. INVITATION TO RESPOND (1 sentence) — End with something that invites the user to share their view:
   - "But I'm curious — what made you pick the other side?"
   - "What do you think?"
   - "I'd love to hear your take on this."

Total length: 3-4 sentences. Sound like a friendly but opinionated person at a coffee shop, not a debate robot.` : `FIRST LINE (user opens the debate):
The user will speak first and present their position. Your first reply should:
1. ACKNOWLEDGE what they said naturally — show you actually listened ("That's an interesting point...", "I hear you, but...")
2. React to their SPECIFIC argument, not just the topic in general
3. Present your counter-position naturally, referencing what they said
4. Keep it conversational — you're responding to a person, not delivering a prepared speech

Do NOT ignore what the user said and jump straight to your own monologue.`}`;
}

