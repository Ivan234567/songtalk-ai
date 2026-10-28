import crypto from 'node:crypto'

const MIN_LIST = 8
const MAX_LIST = 20
const DEFAULT_LIST = 20
const THEME_MIN_RATIO = 0.4

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'you', 'your', 'with', 'from', 'this', 'that', 'are', 'was', 'were',
  'have', 'has', 'had', 'will', 'can', 'not', 'but', 'they', 'them', 'their', 'our', 'out',
  'a', 'an', 'to', 'of', 'in', 'on', 'at', 'is', 'it', 'as', 'be', 'or', 'by',
])

const HOUSEHOLD_DEBATE_BAN = [
  'toothbrush', 'sock', 'socks', 'pillow', 'fridge', 'laundry', 'shampoo', 'umbrella',
  'toothbrush', 'slippers', 'toothbrush',
]

function parseJsonObject(raw) {
  const text = String(raw || '').trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      return JSON.parse(text.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[\s,.;:!?/()«»"'`_+={}\[\]|\\<>~@#$%^&*-]+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
}

function hasCyrillic(text) {
  return /[а-яёА-ЯЁ]/.test(String(text || ''))
}

function looksLikeEnglishWord(text) {
  return /^[a-z][a-z\s'-]{0,40}$/i.test(String(text || '').trim())
}

function looksLikeChineseWord(text) {
  return /[\u4e00-\u9fff]/.test(String(text || '')) && !/[a-zA-Z]{3,}/.test(String(text || ''))
}

export function cleanEntry(row, language) {
  if (!row || typeof row !== 'object') return null
  const word = typeof row.word === 'string' ? row.word.trim() : ''
  const gloss = typeof row.gloss === 'string' ? row.gloss.trim() : ''
  if (!word || !gloss) return null
  if (language === 'zh') {
    if (!looksLikeChineseWord(word)) return null
  } else if (!looksLikeEnglishWord(word) || !/[a-zA-Z]/.test(word)) {
    return null
  }
  // gloss обязан быть по-русски, не копией headword и не латиницей
  if (!hasCyrillic(gloss)) return null
  if (gloss.toLowerCase() === word.toLowerCase()) return null
  if (/^(word|test|asdf|xxx|foo|bar|baz|lorem|ipsum|перевод\d*|слово\d*)$/i.test(word)) return null
  if (/^(word|test|asdf|xxx|foo|bar|перевод\d*|слово\d*)$/i.test(gloss)) return null
  if (gloss.length < 2 || gloss.length > 200) return null
  if (word.length > 48) return null

  return {
    word: language === 'zh' ? word.replace(/\s+/g, '') : word.toLowerCase(),
    gloss: gloss.slice(0, 200),
    phonetic: typeof row.phonetic === 'string' && row.phonetic.trim() ? row.phonetic.trim().slice(0, 80) : null,
    part_of_speech: typeof row.part_of_speech === 'string' && row.part_of_speech.trim()
      ? row.part_of_speech.trim().slice(0, 40)
      : null,
    pinyin: typeof row.pinyin === 'string' && row.pinyin.trim() ? row.pinyin.trim().slice(0, 80) : null,
    step: normalizeStepKey(row.step),
  }
}

export function normalizeStepKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 160)
}

export function normalizeStepList(raw) {
  const source = Array.isArray(raw)
    ? raw
    : String(raw || '').split(/\n|·/)
  const seen = new Set()
  const steps = []
  for (const item of source) {
    const title = String(item || '').trim().replace(/\s+/g, ' ').slice(0, 160)
    const key = normalizeStepKey(title)
    if (!key || seen.has(key)) continue
    seen.add(key)
    steps.push(title)
    if (steps.length >= 12) break
  }
  return steps
}

export function matchStepKey(itemStep, currentStep) {
  const left = normalizeStepKey(itemStep)
  const right = normalizeStepKey(currentStep)
  if (!left || !right) return false
  return left === right || left.includes(right) || right.includes(left)
}

function coverSteps(items, steps, max) {
  const need = steps.length * 2 > max ? 1 : 2
  const buckets = steps.map(() => [])
  for (const item of items) {
    const index = steps.findIndex((step) => matchStepKey(item.step, step))
    if (index < 0) continue
    buckets[index].push({ ...item, step: steps[index] })
  }
  const loose = items.filter((item) => !steps.some((step) => matchStepKey(item.step, step)))
  let cursor = 0
  for (let index = 0; index < buckets.length && cursor < loose.length; index += 1) {
    while (buckets[index].length < need && cursor < loose.length) {
      buckets[index].push({ ...loose[cursor], step: steps[index] })
      cursor += 1
    }
  }
  while (cursor < loose.length) {
    const index = cursor % steps.length
    buckets[index].push({ ...loose[cursor], step: steps[index] })
    cursor += 1
  }
  const missing = steps.filter((step, index) => buckets[index].length < need)
  const ordered = []
  let round = 0
  while (ordered.length < max) {
    let added = false
    for (const bucket of buckets) {
      if (ordered.length >= max) break
      if (bucket[round]) {
        ordered.push(bucket[round])
        added = true
      }
    }
    if (!added) break
    round += 1
  }
  return { items: ordered, missing }
}

export function scoreEntryThemeFit(entry, themeText = '') {
  const hay = String(themeText || '').toLowerCase()
  if (!hay.trim()) return 0
  const gloss = String(entry?.gloss || '').toLowerCase()
  const head = String(entry?.word || '').toLowerCase()
  let score = 0
  for (const token of tokenize(gloss)) {
    if (hay.includes(token)) score += 2
  }
  for (const token of tokenize(head)) {
    if (hay.includes(token)) score += 3
  }
  if (head && hay.includes(head)) score += 2
  return score
}

/**
 * Жёсткий QC черновика AI-списка. Мусор не проходит.
 * @returns {{ ok: boolean, items: object[], rejected: number, theme_ratio: number, reasons: string[] }}
 */
export function validateBoundListDraft(rows, options = {}) {
  const language = options.language === 'zh' ? 'zh' : 'en'
  const mode = options.mode === 'debate' ? 'debate' : options.mode === 'chat' ? 'chat' : 'roleplay'
  const themeText = String(options.themeText || '')
  const steps = normalizeStepList(options.steps)
  const min = Math.max(6, Number(options.min) || MIN_LIST)
  const max = Math.max(min, Math.min(MAX_LIST, Number(options.max) || MAX_LIST))
  const reasons = []
  const seen = new Set()
  const items = []
  let rejected = 0

  for (const row of Array.isArray(rows) ? rows : []) {
    const entry = cleanEntry(row, language)
    if (!entry) {
      rejected += 1
      continue
    }
    if (seen.has(entry.word)) {
      rejected += 1
      continue
    }
    if (mode === 'debate' && HOUSEHOLD_DEBATE_BAN.includes(entry.word)) {
      rejected += 1
      continue
    }
    if (language === 'en' && !entry.phonetic) {
      // phonetic желателен, но не блокер — AI часто пропускает
    }
    if (language === 'zh' && entry.phonetic) {
      entry.phonetic = null
    }
    seen.add(entry.word)
    items.push({
      ...entry,
      theme_fit: scoreEntryThemeFit(entry, steps.length ? (entry.step || themeText) : themeText),
    })
    if (!steps.length && items.length >= max) break
  }

  if (steps.length) {
    const covered = coverSteps(items, steps, max)
    if (covered.missing.length) {
      reasons.push(`шаги без своих слов: ${covered.missing.join('; ')}`)
    }
    items.length = 0
    items.push(...covered.items)
  }

  if (items.length < min) {
    reasons.push(`мало чистых слов: ${items.length} из ${min}`)
  }

  let themeRatio = 1
  if (!steps.length && themeText.trim() && items.length) {
    const fitted = items.filter((item) => item.theme_fit > 0).length
    themeRatio = fitted / items.length
    if (themeRatio < THEME_MIN_RATIO) {
      // оставляем только тематические, если их хватает; иначе брак всего черновика
      const thematic = items.filter((item) => item.theme_fit > 0)
      if (thematic.length >= min) {
        items.length = 0
        items.push(...thematic.slice(0, max))
        themeRatio = 1
      } else if (mode === 'debate') {
        reasons.push(`мало слов по теме сцены (${Math.round(themeRatio * 100)}%)`)
      }
    }
  }

  const ok = reasons.length === 0 && items.length >= min
  return {
    ok,
    items: items.slice(0, max).map(({ theme_fit, ...rest }) => rest),
    rejected,
    theme_ratio: themeRatio,
    reasons,
    min,
  }
}

function cleanGeneratedEntries(rows, language, options = {}) {
  const result = validateBoundListDraft(rows, { ...options, language })
  return result.ok ? result.items : result.items.length >= (options.min || 6) ? result.items : []
}

async function callGenerateOnce({
  billableChatCreate,
  userId,
  language,
  mode,
  levelHint,
  targetCount,
  profile,
  isDebate,
}) {
  const target = language === 'zh' ? 'simplified Chinese headwords' : 'English headwords'
  const paid = await billableChatCreate(userId, crypto.randomUUID(), {
    messages: [
      {
        role: 'system',
        content: [
          `Create a vocabulary list of ${targetCount} ${target} for a language learner.`,
          'gloss must be natural Russian (Cyrillic), never English and never a copy of the headword.',
          'Return JSON only:',
          '{"title":"","items":[{"word":"","gloss":"","phonetic":"","part_of_speech":"","pinyin":"","step":""}]}',
          'title: short Russian list name for the learner dictionary (max 80 chars).',
          'word is the headword in the learning language only.',
          'phonetic is IPA for English, empty for Chinese. pinyin only for Chinese.',
          'part_of_speech in Russian (существительное, глагол, прилагательное).',
          `Match learner level ${levelHint}. Prefer concrete useful words for THIS situation.`,
          isDebate
            ? 'This is a DEBATE: prefer argumentative and topic vocabulary (claims, evidence, policy, rights, trade-offs). Avoid random household words.'
            : mode === 'chat'
              ? 'This is a FREE CONVERSATION: everyday useful words the learner can say in open dialogue.'
              : 'This is a ROLEPLAY/DIALOGUE scene. Each item must be a word the learner says to COMPLETE one listed step. Cover every step before adding anything else.',
          'No proper names, no duplicates, no junk, no transliteration as gloss, no placeholder words.',
          `Return exactly ${targetCount} items. Do not stop early.`,
          'Every item must fit one step. Set "step" to that step title exactly, copied from the Steps list.',
          'Do not add words for a different situation.',
        ].join(' '),
      },
      { role: 'user', content: profile || 'Everyday conversation practice.' },
    ],
    max_tokens: 2200,
    temperature: 0.35,
    metadata: { vocabulary_list_generate_bound: true, mode },
  })
  if (!paid?.ok) {
    const err = new Error(paid?.error || 'Недостаточно средств для генерации списка. Пополните баланс.')
    err.status = paid?.status || 402
    throw err
  }
  return parseJsonObject(paid.result?.text)
}

export function createGenerateBoundListEntries(deps) {
  const { billableChatCreate } = deps
  return async function generateBoundListEntries({
    userId,
    language,
    mode = 'roleplay',
    level = '',
    title = '',
    goal = '',
    topic = '',
    steps = '',
    themeText = '',
    count = DEFAULT_LIST,
  }) {
    const lang = language === 'zh' ? 'zh' : 'en'
    // D4: для ZH дебаты не используем как режим генерации
    let practiceMode = mode === 'debate' ? 'debate' : mode === 'chat' ? 'chat' : 'roleplay'
    if (lang === 'zh' && practiceMode === 'debate') {
      practiceMode = 'roleplay'
    }

    const targetCount = Math.max(MIN_LIST, Math.min(MAX_LIST, Number(count) || DEFAULT_LIST))
    const levelHint = String(level || '').trim() || (lang === 'zh' ? 'HSK3' : 'B1')
    const isDebate = practiceMode === 'debate'
    const themeBlob = [title, goal, topic, steps, themeText].filter(Boolean).join(' ')
    const profile = [
      title && `Title: ${String(title).trim().slice(0, 160)}`,
      goal && `Goal: ${String(goal).trim().slice(0, 240)}`,
      topic && `Topic: ${String(topic).trim().slice(0, 240)}`,
      steps && `Steps:\n${normalizeStepList(steps).join('\n')}`.slice(0, 900),
      themeText && `Context: ${String(themeText).trim().slice(0, 500)}`,
      `Level: ${levelHint}`,
      `Mode: ${practiceMode}`,
    ].filter(Boolean).join('\n')

    let parsed = await callGenerateOnce({
      billableChatCreate,
      userId,
      language: lang,
      mode: practiceMode,
      levelHint,
      targetCount,
      profile,
      isDebate,
    })

    let draft = validateBoundListDraft(parsed?.items, {
      language: lang,
      mode: practiceMode,
      themeText: themeBlob,
      steps,
      min: Math.max(6, targetCount - 4),
      max: targetCount,
    })

    // Один платный retry при браке QC — за счёт пользователя, лучше чем мусор в словаре
    if (!draft.ok) {
      parsed = await callGenerateOnce({
        billableChatCreate,
        userId,
        language: lang,
        mode: practiceMode,
        levelHint,
        targetCount,
        profile: `${profile}\n\nPrevious draft failed quality checks: ${draft.reasons.join('; ')}. Return only on-topic clean items.`,
        isDebate,
      })
      draft = validateBoundListDraft(parsed?.items, {
        language: lang,
        mode: practiceMode,
        themeText: themeBlob,
        steps,
        min: Math.max(6, targetCount - 4),
        max: targetCount,
      })
    }

    if (!draft.ok || draft.items.length < 6) {
      const err = new Error(
        draft.reasons.length
          ? `ИИ-список не прошёл проверку качества: ${draft.reasons.join('; ')}`
          : 'ИИ вернул слишком мало подходящих слов',
      )
      err.status = 422
      err.quality = draft
      throw err
    }

    const listTitle = typeof parsed?.title === 'string' && parsed.title.trim() && hasCyrillic(parsed.title)
      ? parsed.title.trim().slice(0, 120)
      : ''
    return {
      title: listTitle,
      items: draft.items,
      quality: {
        rejected: draft.rejected,
        theme_ratio: draft.theme_ratio,
        count: draft.items.length,
      },
    }
  }
}

export function normalizeConfirmEntries(rawItems, language) {
  const draft = validateBoundListDraft(rawItems, {
    language,
    min: 6,
    max: MAX_LIST,
    themeText: '',
  })
  if (!draft.ok) {
    const err = new Error(
      draft.reasons.length
        ? `Черновик списка не прошёл проверку: ${draft.reasons.join('; ')}`
        : 'В черновике слишком мало чистых слов',
    )
    err.status = 422
    throw err
  }
  return draft.items
}

export function createResolveListEntries(deps) {
  const { billableChatCreate } = deps
  return async function resolveListEntries({ text, language, userId }) {
    const source = String(text || '').trim().slice(0, 2000)
    if (!source) return []
    const target = language === 'zh' ? 'simplified Chinese headwords' : 'English headwords'
    const paid = await billableChatCreate(userId, crypto.randomUUID(), {
      messages: [
        {
          role: 'system',
          content: [
            `Turn learner input into ${target} for a vocabulary list.`,
            'Input may be the target word, a Russian gloss, a comma list, or a short paragraph.',
            'Return JSON only: {"items":[{"word":"","gloss":"","phonetic":"","part_of_speech":"","pinyin":""}]}',
            'word is the headword in the learning language. gloss is Russian Cyrillic.',
            'phonetic is IPA for English, empty for Chinese. pinyin only for Chinese.',
            'part_of_speech in Russian (существительное, глагол, прилагательное).',
            'At most 15 items. Skip names, numbers, and junk. Do not invent extra words.',
          ].join(' '),
        },
        { role: 'user', content: source },
      ],
      max_tokens: 700,
      temperature: 0,
      metadata: { vocabulary_list_resolve: true },
    })
    if (!paid?.ok) {
      const err = new Error(paid?.error || 'Недостаточно средств для подсказки ИИ. Пополните баланс.')
      err.status = paid?.status || 402
      throw err
    }
    const parsed = parseJsonObject(paid.result?.text)
    const draft = validateBoundListDraft(parsed?.items, {
      language,
      min: 1,
      max: 15,
      themeText: '',
    })
    return draft.items
  }
}

// re-export helper used by older call sites / tests
export { cleanGeneratedEntries }
