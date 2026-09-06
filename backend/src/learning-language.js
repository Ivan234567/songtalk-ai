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

const FREESTYLE_CHAT_SYSTEM_ZH =
  'You are a friendly Chinese conversation partner for language practice. ' +
  'Speak ONLY in Simplified Chinese (简体中文). ' +
  'Use natural, everyday Mandarin at a learner-friendly level (roughly HSK 1-4). ' +
  'Keep replies concise (1-3 sentences unless the user asks for more). ' +
  'If the user writes in Russian, still reply in Simplified Chinese. ' +
  'Do not switch to English unless the user explicitly asks.'

const FREESTYLE_CHAT_SYSTEM_ZH_WITH_PINYIN =
  'You are a friendly Chinese conversation partner for language practice. ' +
  'Speak ONLY in Simplified Chinese (简体中文). ' +
  'Use natural, everyday Mandarin at a learner-friendly level (roughly HSK 1-4). ' +
  'Keep replies concise (1-3 sentences unless the user asks for more). ' +
  'If the user writes in Russian, still reply in Simplified Chinese. ' +
  'Do not switch to English unless the user explicitly asks.\n\n' +
  'IMPORTANT: Format your reply as follows:\n' +
  'PINYIN:\n' +
  '你好 = nǐ hǎo\n' +
  '我 = wǒ\n' +
  '(one word/phrase per line: hanzi = pinyin with tones)\n' +
  'END:\n\n' +
  'This format helps learners see pronunciation alongside characters.'

export function getFreestyleChatSystemPrompt(lang, options = {}) {
  if (lang === 'zh') {
    return options.showPinyin ? FREESTYLE_CHAT_SYSTEM_ZH_WITH_PINYIN : FREESTYLE_CHAT_SYSTEM_ZH
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
}) {
  const pinyinInstruction = showPinyin
    ? '\n\nIMPORTANT: Format your reply as follows:\n' +
      'PINYIN:\n' +
      '你好 = nǐ hǎo\n' +
      '我想 = wǒ xiǎng\n' +
      '(one word/phrase per line: hanzi = pinyin with tones)\n' +
      'END:\n\n' +
      'This format helps learners see pronunciation alongside characters.'
    : ''
  
  return (
    'You are a speaking coach for Chinese conversation practice. The assistant just wrote a message in Simplified Chinese, and you suggest what the USER could reply next.\n\n' +
    'Rules:\n' +
    '- Output ONLY the suggested reply text in Simplified Chinese (简体中文). No explanations, no labels, no quote wrappers.\n' +
    `- Match learner level: ${levelText}\n` +
    '- Keep the suggestion directly relevant to the latest assistant message and recent context.\n' +
    '- Apply style settings:\n' +
    `  - slang_mode=${slangMode}\n` +
    `  - allow_profanity=${allowProfanity}\n` +
    `  - ai_may_use_profanity=${aiMayUseProfanity}\n` +
    `  - profanity_intensity=${profanityIntensity}\n` +
    '- If slang_mode is off: keep wording neutral.\n' +
    '- If hint_mode=no_profanity: keep it clean regardless of other settings.\n' +
    `- Hint mode: ${hintModeValue}. ${freestyleModeInstruction}\n` +
    `- Ephemeral freestyle context: role_hint=${freestyleRoleHint}; tone_formality=${freestyleToneFormality}/100; tone_directness=${freestyleToneDirectness}/100; micro_goals=${freestyleMicroGoals.join(', ') || 'none'}\n` +
    '- Keep it concise (usually 1-2 sentences; optionally 1-2 short variants on separate lines).' +
    pinyinInstruction
  )
}

export const REPLY_HINT_LEVEL_ZH = {
  A1: 'Use very simple words and short sentences (e.g. 你好, 谢谢, 我喜欢…).',
  A2: 'Use simple everyday phrases and short sentences.',
  B1: 'Use natural everyday Mandarin with common connectors.',
  B2: 'Use varied vocabulary and natural, flowing sentences.',
  C1: 'Use idiomatic, natural Mandarin with nuance where appropriate.',
  easy: 'Use simple words and short, clear sentences.',
  medium: 'Use natural everyday phrases and moderate complexity.',
  hard: 'Use varied, natural language with more sophisticated expressions.',
}
