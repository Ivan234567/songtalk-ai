/**
 * Resolve learning language from request (header or JSON body).
 * Default: 'en' — English flow unchanged.
 */
export function resolveLanguage(req) {
  const header = req.headers['x-learning-language']
  const bodyLang = req.body?.learningLanguage
  const raw = (typeof header === 'string' && header.trim()) || (typeof bodyLang === 'string' && bodyLang.trim()) || 'en'
  return raw === 'zh' ? 'zh' : 'en'
}

export function attachLearningLanguage(req, _res, next) {
  if (req.path.startsWith('/api/agent')) {
    req.learningLanguage = resolveLanguage(req)
  }
  next()
}

export const CEFR_LEVEL_INSTRUCTIONS = {
  A1: 'CEFR A1 ONLY. Very simple words and short sentences (I like, Yes please, Thank you, I want). Maximum ~6–8 words. Present simple. FORBIDDEN: complex clauses, idioms, rare vocabulary.',
  A2: 'CEFR A2 ONLY. Everyday phrases and short connected sentences. Common past/future OK. FORBIDDEN: abstract academic words, dense idioms, long nested clauses.',
  B1: 'CEFR B1 ONLY. Natural everyday English with common connectors (because, so, but, if). 1–3 sentences. FORBIDDEN: C1 idioms, rare words, essay-like phrasing.',
  B2: 'CEFR B2 ONLY. Varied vocabulary and natural flowing sentences. Some nuance OK. FORBIDDEN: overly literary or specialist jargon the learner would not know at B2.',
  C1: 'CEFR C1 ONLY. Idiomatic, natural spoken English with nuance. Still conversational, not a written essay. Do not drop to classroom A2/B1 phrasing.',
  easy: 'Use simple words and short, clear sentences — roughly A2.',
  medium: 'Use natural everyday phrases and moderate complexity — roughly B1.',
  hard: 'Use varied, natural language with more sophisticated expressions — roughly C1.',
}

function normalizeEnglishLevel(level) {
  const raw = String(level || '').trim()
  if (!raw) return 'B1'
  const upper = raw.toUpperCase()
  if (CEFR_LEVEL_INSTRUCTIONS[upper]) return upper
  const lower = raw.toLowerCase()
  if (CEFR_LEVEL_INSTRUCTIONS[lower]) return lower
  return 'B1'
}

export function buildEnglishMetadataInstruction({ showTranslation = false } = {}) {
  if (!showTranslation) return ''
  return '\n\nAfter the spoken English line, add exactly one more line: ««TRANSLATION»» and a short Russian translation of that line. Stop after it. That line is not spoken.'
}

function buildEnglishSystemPrompt(options = {}) {
  const {
    showTranslation,
    cefrLevel,
    slangMode = 'off',
    allowProfanity = false,
    aiMayUseProfanity = false,
    profanityIntensity = 'light',
  } = options
  const levelKey = normalizeEnglishLevel(cefrLevel)
  const rawVoice = Boolean(allowProfanity && aiMayUseProfanity)
  let prompt = rawVoice
    ? 'You are a blunt casual friend practicing spoken English with the learner. '
    : 'You are a friendly English conversation partner for language practice. '
  prompt += 'Speak ONLY in English. '
  if (CEFR_LEVEL_INSTRUCTIONS[levelKey]) {
    prompt += `\n\nCEFR LEVEL LOCK (mandatory): ${CEFR_LEVEL_INSTRUCTIONS[levelKey]}\n`
    prompt += `Speak AT ${levelKey} only: not harder, not easier. The learner chose this level. Do not upgrade if they sound fluent. Do not simplify below it.\n`
    if (rawVoice || slangMode === 'light' || slangMode === 'heavy') {
      prompt += 'This lock limits grammar and rare academic words. It does not ban everyday slang or the profanity allowed below.\n'
    }
  }
  if (slangMode === 'heavy') {
    prompt += 'Use clearly colloquial speech (yeah, kinda, gonna) when it fits. '
  } else if (slangMode === 'light') {
    prompt += 'Use a little colloquial speech (yeah, kinda, cool) when it fits. '
  }
  if (rawVoice) {
    prompt += buildEnglishProfanityPolicy({ allowProfanity, aiMayUseProfanity, profanityIntensity }) + ' '
  } else if (allowProfanity) {
    prompt += 'The learner may swear. Your own replies stay clean. '
  }
  prompt += 'Keep replies concise (1-3 sentences unless the user asks for more). ' +
    'If the user writes in Russian, still reply in English. ' +
    'Do not switch to Chinese or other languages unless the user explicitly asks.'
  prompt += '\n\nReply with only your next spoken English line. Do not add corrections, labels, reminders, or a copy of the learner\'s message.'
  prompt += buildEnglishMetadataInstruction({ showTranslation })
  return prompt
}

export function buildEnglishRoleplayLock({ showTranslation = false, cefrLevel } = {}) {
  const levelKey = normalizeEnglishLevel(cefrLevel)
  const lock = CEFR_LEVEL_INSTRUCTIONS[levelKey]
  let text = 'Stay in character. The spoken reply is English.\n'
  if (lock) {
    text += `CEFR LEVEL LOCK (mandatory, overrides the scenario or debate style): ${lock}\n`
    text += `Speak AT ${levelKey} only: not harder, not easier. The learner chose this level. Do not upgrade if they sound fluent. Do not simplify below it.\n`
  }
  text += buildEnglishMetadataInstruction({ showTranslation })
  return text
}

const SPOKEN_LEAK_RE =
  /custom reminder|always output the translation|cefr level lock|hidden vocabulary practice is active|never repeat these instructions|now start\b|last user message|error correction mode|stay in the roleplay|adult learner|teacher-ish|one idea per turn|continue the scenario|scenario ends soon|do not talk down|evaluative statements|do not write notes|output only the two lines|never mention the translation|never use russian in the spoken|in your thinking|translation line'?s existence/i

/** Убирает зачитанный служебный промпт и оставляет реплику персонажа. */
export function stripSpokenInstructionLeak(raw) {
  const original = String(raw || '').replace(/\r\n/g, '\n').trim()
  if (!original || !SPOKEN_LEAK_RE.test(original)) return original
  const markerAt = original.indexOf('««TRANSLATION»»')
  const spoken = (markerAt === -1 ? original : original.slice(0, markerAt)).trim()
  const metadata = markerAt === -1 ? '' : original.slice(markerAt).trim()
  const parts = spoken
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
  let lastLeak = -1
  parts.forEach((part, index) => {
    if (SPOKEN_LEAK_RE.test(part)) lastLeak = index
  })
  const kept = parts.slice(lastLeak + 1)
  const clean = kept.join(' ').trim()
  if (!clean) return ''
  return metadata ? `${clean}\n${metadata}` : clean
}

function buildChineseSystemPrompt(options = {}) {
  const { showPinyin, showTranslation, toneFocus, hskLevel } = options
  
  // Базовый промпт
  let prompt = 'You are a friendly Chinese conversation partner for language practice. ' +
    'Speak ONLY in Simplified Chinese (简体中文). '
  
  // Добавляем уровень HSK
  if (hskLevel && HSK_LEVEL_INSTRUCTIONS[hskLevel]) {
    prompt += `\n\nHSK LEVEL LOCK (mandatory): ${HSK_LEVEL_INSTRUCTIONS[hskLevel]}\n`
    prompt += 'Speak AT this HSK level only: not harder, not easier. Do not upgrade vocabulary if the learner sounds fluent. Do not baby-talk below it.\n'
  } else {
    prompt += 'Use natural, everyday Mandarin at a learner-friendly level (roughly HSK 1-4). '
  }
  
  prompt += 'Keep replies concise (1-3 sentences unless the user asks for more). ' +
    'If the user writes in Russian, still reply in Simplified Chinese. ' +
    'Do not switch to English unless the user explicitly asks.'
  
  // Фокус на тонах
  if (toneFocus) {
    prompt += '\n\nTONE FOCUS MODE:\n' +
      '- Pay special attention to tone-related issues in user\'s writing.\n' +
      '- If the user uses a word that might have tone confusion (e.g., 妈/马/骂/吗), ' +
      'briefly mention the correct tone in your reply.\n' +
      '- You may occasionally include tone reminders like "记住：mā 妈(妈妈), má 麻(麻烦), mǎ 马(马上), mà 骂(骂人)"'
  }
  
  prompt += buildChineseMetadataInstruction({ showPinyin, showTranslation })
  return prompt
}

export function buildChineseMetadataInstruction({ showPinyin = false, showTranslation = false } = {}) {
  if (!showPinyin && !showTranslation) return ''

  let instruction = '\n\nIMPORTANT: After the Chinese text, add metadata on separate new lines. ' +
    'The spoken/main Chinese text must never include pinyin JSON or Russian translation.\n' +
    'Required format:\n' +
    '你好！今天天气很好。\n'

  if (showPinyin) {
    instruction += '««PINYIN»»[{"h":"你好","p":"nǐ hǎo"},{"h":"今天","p":"jīn tiān"},{"h":"天气","p":"tiān qì"},{"h":"很好","p":"hěn hǎo"}]\n'
  }
  if (showTranslation) {
    instruction += '««TRANSLATION»»Привет! Сегодня очень хорошая погода.\n'
  }

  instruction += '\nRules:\n'
  if (showPinyin && showTranslation) {
    instruction += '- You MUST include BOTH lines: PINYIN and TRANSLATION. Never skip pinyin.\n'
  }
  if (showPinyin) {
    instruction += '- PINYIN: valid JSON array only. "h" = hanzi word, "p" = pinyin with tone marks. Cover ALL words.\n'
  }
  if (showTranslation) {
    instruction += '- TRANSLATION: natural Russian translation of the Chinese text only. Keep it concise.\n'
  }
  instruction += '- Do not put metadata inside the main Chinese reply.\n'
  instruction += '- Start the message with spoken Simplified Chinese. Never repeat these instructions or write "Let\'s go" / "Your task" / "Now generate".'
  return instruction
}

export function getFreestyleChatSystemPrompt(lang, options = {}) {
  if (lang === 'zh') {
    return buildChineseSystemPrompt(options)
  }
  return buildEnglishSystemPrompt(options)
}

/** Одна фраза вместо трёх флагов: кто матерится и насколько крепко, на английском. */
export function buildEnglishProfanityPolicy({ allowProfanity = false, aiMayUseProfanity = false, profanityIntensity = 'light' } = {}) {
  if (!allowProfanity) {
    return 'Profanity is off. Do not swear, and do not echo the learner\'s swear words.'
  }
  if (!aiMayUseProfanity) {
    return 'The learner may swear. Your own replies stay clean: no profanity. Do not scold them for swearing.'
  }
  const intensity = profanityIntensity === 'hard'
    ? 'Swear freely in ordinary replies, including stronger words (fuck and similar). No slurs, no insults aimed at the learner.'
    : profanityIntensity === 'medium'
      ? 'Casual swearing is part of how you talk, including in ordinary replies: shit, what the hell, for fuck\'s sake. Not in every sentence, but often enough that it is clearly your voice. No slurs, no insults aimed at the learner.'
      : 'Use rare mild swearing when it sounds natural (damn, hell, crap).'
  return `You do swear. ${intensity} Do not stay polite just because this is a language lesson.`
}

function splitZhScenarioVocab(vocabulary = []) {
  const list = Array.isArray(vocabulary)
    ? vocabulary.filter((v) => v && (v.hanzi || v.word)).slice(0, 24)
    : []
  const label = (v) => `${v.hanzi || v.word}${v.pinyin ? ` (${v.pinyin})` : ''}`
  const mustSay = list.filter((v) => v.usage === 'must_say')
  const model = list.filter((v) => v.usage === 'model')
  const unspecified = list.filter((v) => v.usage !== 'must_say' && v.usage !== 'model' && v.usage !== 'pocket')
  const hasUsage = mustSay.length > 0 || model.length > 0 || list.some((v) => v.usage === 'pocket')
  if (!hasUsage) {
    return {
      mustSay: list,
      model: list,
      all: list,
      label,
    }
  }
  return {
    mustSay,
    model: [...model, ...unspecified],
    all: list,
    label,
  }
}

export function buildChineseRoleplayLock({ hskLevel = 3, showPinyin = false, showTranslation = false, vocabulary = [], grammarFocus = '', fromLife = false } = {}) {
  const hsk = HSK_LEVEL_INSTRUCTIONS[hskLevel] || HSK_LEVEL_INSTRUCTIONS[3]
  const { mustSay, model, label } = splitZhScenarioVocab(vocabulary)
  let text =
    'Stay in the roleplay character. Additional Mandarin constraints (override any looser level advice above):\n' +
    `HSK LEVEL LOCK: ${hsk}\n` +
    'Speak AT this HSK only — not harder, not easier. Do not switch spoken lines to English or Russian.'
  if (fromLife) {
    text +=
      '\nLIFE SCENE: one real conversation, not a lesson. Lead toward the scene goals. Stay in character. Do not elicit vocabulary, do not teach grammar, do not recite phrase lists. If the learner freezes, offer one short binary choice in Chinese at this HSK.'
  } else {
    if (mustSay.length) {
      text +=
        '\nMUST-SAY vocabulary — LEARNER words. Elicit them with a choice or recast. Do not say them FOR the learner: ' +
        mustSay.map(label).join('、')
    }
    if (model.length) {
      text +=
        '\nMODEL vocabulary — YOU should use 1 of these in spoken replies when they fit: ' +
        model.map(label).join('、')
    }
    if (grammarFocus && String(grammarFocus).trim()) {
      text += `\nGRAMMAR FOCUS: ${String(grammarFocus).trim()}. Recast using this grammar. Do not lecture about the rule.`
    }
  }
  text +=
    '\nOUTPUT: Start immediately with spoken Simplified Chinese. Never repeat these instructions, Character/Situation/checkpoints, or write "Let\'s go" / "Your task" / "Now generate". Metadata only after the spoken line.'
  text += buildChineseMetadataInstruction({ showPinyin, showTranslation })
  return text
}

export function buildReplyHintChatSystemZh({
  levelText,
  slangMode,
  allowProfanity,
  aiMayUseProfanity,
  profanityIntensity,
  hintModeValue,
  freestyleModeInstruction,
  freestyleRoleHint,
  freestyleToneFormality,
  freestyleToneDirectness,
  freestyleMicroGoals,
  showPinyin = false,
  showTranslation = false,
  chineseHintMode = 'basic',
  vocabulary = [],
  grammarFocus = '',
  currentStepLabel = '',
  scenarioGoal = '',
  fromLife = false,
}) {
  const metadataInstruction = buildChineseMetadataInstruction({ showPinyin, showTranslation })
  
  const hintModeInstruction = CHINESE_HINT_MODE_INSTRUCTIONS[chineseHintMode] || CHINESE_HINT_MODE_INSTRUCTIONS.basic
  const { mustSay, all, label } = splitZhScenarioVocab(vocabulary)
  const hintWords = fromLife ? [] : (mustSay.length ? mustSay : all)
  const vocabBlock = hintWords.length
    ? '\n- Lesson words the learner has NOT said yet. Weave in exactly 1 of them: ' +
      hintWords.map(label).join('、') +
      '.\n- Do not dump the list. Do not pick a word that cannot fit this turn.'
    : ''
  const grammarBlock = !fromLife && grammarFocus && String(grammarFocus).trim()
    ? `\n- Grammar focus of this lesson: ${String(grammarFocus).trim()}. Use it naturally in the suggested reply.`
    : ''
  const goalLine = currentStepLabel
    ? `\n- Next lesson goal/step the USER should move toward: ${currentStepLabel}.`
    : (scenarioGoal ? `\n- Scenario goal the USER should move toward: ${scenarioGoal}.` : '')
  
  return (
    'You are a speaking coach for a Chinese roleplay lesson. Suggest what the USER could say next in Simplified Chinese.\n\n' +
    (fromLife
      ? 'The hint must do two things at once:\n' +
        '1) Naturally answer or react to what the other person just said. Do not ignore their question.\n' +
        '2) Move the learner toward the next outcome of this real conversation.\n' +
        'Do not require a lesson word or a grammar point. Never lecture.\n\n'
      : 'The hint must do three things at once when possible:\n' +
        '1) Naturally answer or react to what the other person just said. Do not ignore their question.\n' +
        '2) Move the learner toward the next lesson goal/step.\n' +
        '3) If missing lesson words are listed, include exactly 1 of them.\n' +
        'If they slightly conflict, still answer the other person, but steer toward the step and the word. Never lecture.\n\n') +
    'Rules:\n' +
    '- The main suggestion must be Simplified Chinese only. No explanations or quote wrappers in that part.\n' +
    `- STRICT HSK lock: ${levelText}\n` +
    '- Speak at that HSK level only: not harder, not easier.\n' +
    `- Hint style: ${hintModeInstruction}\n` +
    (fromLife
      ? '- If the conversation has not started, suggest a natural opening that aims at the first outcome.'
      : '- If the conversation has not started, suggest a natural opening that already aims at the first step and a lesson word.') +
    goalLine +
    vocabBlock +
    grammarBlock +
    '\n- Keep it concise (usually 1-2 short sentences).' +
    metadataInstruction
  )
}

// Уровни HSK для промптов (1-6)
export const HSK_LEVEL_INSTRUCTIONS = {
  1: 'HSK 1 ONLY. Use ONLY the most basic words (你好, 我, 你, 是, 不, 好, 谢谢, 再见, 对不起, 没关系, 吃, 喝, 什么, 这, 那, 要, 有). ' +
     'Maximum 3-5 characters per sentence besides particles. Structure: Subject + Verb or Subject + 是 + Object. ' +
     'FORBIDDEN: 因为, 虽然, 如果, 已经, 觉得, 成语, any HSK 2+ word. Example: 好的, 我喜欢, 谢谢你, 我是学生.',
  2: 'HSK 2 ONLY. Basic everyday words. Sentences of 4-8 words. Grammar allowed: 了, 过, 在, 很, 都, 也, 吧, 吗. ' +
     'FORBIDDEN: 虽然…但是, 如果…就, abstract nouns, 成语, HSK 3+ words. Example: 我很高兴, 今天天气很好, 你想吃什么?',
  3: 'HSK 3 ONLY. Everyday conversation. Sentences up to 10-12 words. Grammar allowed: 因为…所以…, 虽然…但是…, 如果…就…. ' +
     'FORBIDDEN: HSK 4+ vocabulary, literary 成语, abstract academic words. Stay at textbook-dialogue difficulty.',
  4: 'HSK 4 ONLY. Wider everyday/abstract vocabulary and multi-clause sentences. ' +
     'FORBIDDEN: HSK 5–6 rare words, written 成语 the learner would not know at HSK 4. Do not sound like HSK 2 either.',
  5: 'HSK 5 ONLY. Advanced but still spoken Mandarin. Complex sentences OK. ' +
     'FORBIDDEN: obscure HSK 6 / classical 成语 unless the learner used them first. Do not simplify to HSK 3.',
  6: 'HSK 6. Near-native spoken fluency: rich vocabulary, nuance, common 成语 when natural. Still spoken, not written essay style.',
}

// Режимы подсказки для китайского
export const CHINESE_HINT_MODE_INSTRUCTIONS = {
  basic: 'Keep the reply simple and direct. Focus on correct grammar at the given HSK level.',
  vocabulary: 'Include 1-2 useful vocabulary words relevant to the topic. ' +
              'These should be natural, not forced.',
  formal: 'Use polite/formal register (您 instead of 你, 请, formal phrases). ' +
          'Appropriate for speaking with elders, teachers, or in professional settings.',
  colloquial: 'Use casual, colloquial Mandarin as spoken in daily life. ' +
              'Include common spoken contractions and casual expressions (but avoid slang that would confuse learners).',
}

export const REPLY_HINT_LEVEL_ZH = {
  A1: HSK_LEVEL_INSTRUCTIONS[1],
  A2: HSK_LEVEL_INSTRUCTIONS[2],
  B1: HSK_LEVEL_INSTRUCTIONS[3],
  B2: HSK_LEVEL_INSTRUCTIONS[4],
  C1: HSK_LEVEL_INSTRUCTIONS[5],
  1: HSK_LEVEL_INSTRUCTIONS[1],
  2: HSK_LEVEL_INSTRUCTIONS[2],
  3: HSK_LEVEL_INSTRUCTIONS[3],
  4: HSK_LEVEL_INSTRUCTIONS[4],
  5: HSK_LEVEL_INSTRUCTIONS[5],
  6: HSK_LEVEL_INSTRUCTIONS[6],
  easy: HSK_LEVEL_INSTRUCTIONS[1],
  medium: HSK_LEVEL_INSTRUCTIONS[3],
  hard: HSK_LEVEL_INSTRUCTIONS[5],
}
