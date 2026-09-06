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
    prompt += `\n\nLEARNER LEVEL: ${HSK_LEVEL_INSTRUCTIONS[hskLevel]}\n`
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

function buildChineseMetadataInstruction({ showPinyin = false, showTranslation = false } = {}) {
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
  instruction += '- Do not put metadata inside the main Chinese reply.'
  return instruction
}

export function getFreestyleChatSystemPrompt(lang, options = {}) {
  if (lang === 'zh') {
    return buildChineseSystemPrompt(options)
  }
  return FREESTYLE_CHAT_SYSTEM_EN
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
}) {
  const metadataInstruction = buildChineseMetadataInstruction({ showPinyin, showTranslation })
  
  const hintModeInstruction = CHINESE_HINT_MODE_INSTRUCTIONS[chineseHintMode] || CHINESE_HINT_MODE_INSTRUCTIONS.basic
  
  return (
    'You are a speaking coach for Chinese conversation practice. The assistant just wrote a message in Simplified Chinese, and you suggest what the USER could reply next.\n\n' +
    'Rules:\n' +
    '- The main suggestion must be Simplified Chinese only. No explanations or quote wrappers in that part.\n' +
    `- STRICTLY match learner level: ${levelText}\n` +
    `- Hint style: ${hintModeInstruction}\n` +
    '- Keep the suggestion directly relevant to the latest assistant message and recent context.\n' +
    '- Keep it concise (usually 1-2 short sentences).' +
    metadataInstruction
  )
}

// Уровни HSK для промптов (1-6)
export const HSK_LEVEL_INSTRUCTIONS = {
  1: 'HSK 1 level: Use ONLY the most basic words (你好, 我, 你, 是, 不, 好, 谢谢, 再见, 对不起, 没关系, 吃, 喝, 什么, 这, 那). ' +
     'Maximum 3-5 words per sentence. Very simple structure: Subject + Verb or Subject + 是 + Object. ' +
     'Example replies: 好的, 我喜欢, 谢谢你, 我是学生.',
  2: 'HSK 2 level: Use basic everyday words. Short sentences of 4-8 words. ' +
     'Simple grammar: 了, 过, 在, 很, 都, 也. ' +
     'Example: 我很高兴, 今天天气很好, 你想吃什么?',
  3: 'HSK 3 level: Conversational vocabulary. Sentences up to 10-12 words. ' +
     'Can use 因为…所以…, 虽然…但是…, 如果…就…. ' +
     'Natural everyday dialogue level.',
  4: 'HSK 4 level: Wider vocabulary including some abstract concepts. ' +
     'Complex sentences with multiple clauses. Idiomatic expressions allowed.',
  5: 'HSK 5 level: Advanced vocabulary. Sophisticated sentence structures. ' +
     'Can discuss abstract topics, use literary expressions.',
  6: 'HSK 6 level: Near-native fluency. Rich vocabulary, nuanced expressions, ' +
     'cultural references, proverbs (成语) when appropriate.',
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
