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

const FREESTYLE_CHAT_SYSTEM_EN =
  'You are a helpful assistant. Always reply in the SAME language the user writes in (e.g. Russian if they write in Russian, English if in English). Do not switch to Chinese or other languages unless the user explicitly writes in that language.'

function buildChineseSystemPrompt(options = {}) {
  const { showPinyin, showTranslation, correctionMode, toneFocus, hskLevel } = options
  
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
  
  // Режим коррекции ошибок
  if (correctionMode === 'active') {
    prompt += '\n\nERROR CORRECTION MODE: ACTIVE\n' +
      '- When the user makes grammar or vocabulary mistakes, gently correct them.\n' +
      '- Format: After your natural reply, on a new line write "✏️ Исправление:" followed by the correction in Russian.\n' +
      '- Example: "✏️ Исправление: Вы написали \'我是好\', правильно \'我很好\' (I am fine)."'
  } else if (correctionMode === 'gentle') {
    prompt += '\n\nERROR CORRECTION MODE: GENTLE\n' +
      '- Only correct serious errors that significantly impede understanding.\n' +
      '- Use natural reformulation in your reply instead of explicit corrections.'
  }
  
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
  return FREESTYLE_CHAT_SYSTEM_EN
}

function splitZhScenarioVocab(vocabulary = []) {
  const list = Array.isArray(vocabulary)
    ? vocabulary.filter((v) => v && (v.hanzi || v.word)).slice(0, 24)
    : []
  const label = (v) => `${v.hanzi || v.word}${v.pinyin ? ` (${v.pinyin})` : ''}`
  const mustSay = list.filter((v) => v.usage === 'must_say')
  const model = list.filter((v) => v.usage === 'model')
  const unspecified = list.filter((v) => v.usage !== 'must_say' && v.usage !== 'model')
  const hasUsage = mustSay.length > 0 || model.length > 0
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

export function buildChineseRoleplayLock({ hskLevel = 3, showPinyin = false, showTranslation = false, vocabulary = [], grammarFocus = '' } = {}) {
  const hsk = HSK_LEVEL_INSTRUCTIONS[hskLevel] || HSK_LEVEL_INSTRUCTIONS[3]
  const { mustSay, model, label } = splitZhScenarioVocab(vocabulary)
  let text =
    'Stay in the roleplay character. Additional Mandarin constraints (override any looser level advice above):\n' +
    `HSK LEVEL LOCK: ${hsk}\n` +
    'Speak AT this HSK only — not harder, not easier. Do not switch spoken lines to English or Russian.'
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
}) {
  const metadataInstruction = buildChineseMetadataInstruction({ showPinyin, showTranslation })
  
  const hintModeInstruction = CHINESE_HINT_MODE_INSTRUCTIONS[chineseHintMode] || CHINESE_HINT_MODE_INSTRUCTIONS.basic
  const { mustSay, all, label } = splitZhScenarioVocab(vocabulary)
  const hintWords = mustSay.length ? mustSay : all
  const vocabBlock = hintWords.length
    ? '\n- Lesson words the learner has NOT said yet. Weave in exactly 1 of them: ' +
      hintWords.map(label).join('、') +
      '.\n- Do not dump the list. Do not pick a word that cannot fit this turn.'
    : ''
  const grammarBlock = grammarFocus && String(grammarFocus).trim()
    ? `\n- Grammar focus of this lesson: ${String(grammarFocus).trim()}. Use it naturally in the suggested reply.`
    : ''
  const goalLine = currentStepLabel
    ? `\n- Next lesson goal/step the USER should move toward: ${currentStepLabel}.`
    : (scenarioGoal ? `\n- Scenario goal the USER should move toward: ${scenarioGoal}.` : '')
  
  return (
    'You are a speaking coach for a Chinese roleplay lesson. Suggest what the USER could say next in Simplified Chinese.\n\n' +
    'The hint must do three things at once when possible:\n' +
    '1) Naturally answer or react to what the other person just said. Do not ignore their question.\n' +
    '2) Move the learner toward the next lesson goal/step.\n' +
    '3) If missing lesson words are listed, include exactly 1 of them.\n' +
    'If they slightly conflict, still answer the other person, but steer toward the step and the word. Never lecture.\n\n' +
    'Rules:\n' +
    '- The main suggestion must be Simplified Chinese only. No explanations or quote wrappers in that part.\n' +
    `- STRICT HSK lock: ${levelText}\n` +
    '- Speak at that HSK level only: not harder, not easier.\n' +
    `- Hint style: ${hintModeInstruction}\n` +
    '- If the conversation has not started, suggest a natural opening that already aims at the first step and a lesson word.' +
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
