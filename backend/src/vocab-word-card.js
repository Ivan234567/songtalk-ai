import crypto from 'node:crypto'

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

/** @returns {{ text: string, translation: string | null }[]} */
export function cleanExampleItems(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = new Set()
  for (const item of raw) {
    let text = ''
    let translation = null
    if (typeof item === 'string') {
      text = item.trim()
    } else if (item && typeof item === 'object') {
      text = typeof item.text === 'string'
        ? item.text.trim()
        : (typeof item.example === 'string' ? item.example.trim() : '')
      if (typeof item.translation === 'string' && item.translation.trim()) {
        translation = item.translation.trim().slice(0, 240)
      }
    }
    if (!text || text.length > 240 || seen.has(text)) continue
    seen.add(text)
    out.push({ text, translation })
    if (out.length >= 3) break
  }
  return out
}

function exampleTexts(items) {
  return cleanExampleItems(items).map((item) => item.text)
}

/**
 * Нормализует ответ ИИ в карточку слова с несколькими значениями.
 */
export function normalizeWordLexicon(raw, language, seed = {}) {
  const word = typeof raw?.word === 'string' && raw.word.trim()
    ? (language === 'zh' ? raw.word.trim().replace(/\s+/g, '') : raw.word.trim().toLowerCase())
    : (typeof seed.word === 'string' ? seed.word : '')
  if (!word) return null

  const sensesIn = Array.isArray(raw?.senses) ? raw.senses : []
  const senses = []
  const seenGloss = new Set()
  for (const row of sensesIn) {
    const gloss = typeof row?.gloss === 'string' ? row.gloss.trim() : ''
    if (!gloss || gloss.length > 200 || seenGloss.has(gloss)) continue
    seenGloss.add(gloss)
    const definition = typeof row?.definition === 'string' && row.definition.trim()
      ? row.definition.trim().slice(0, 280)
      : null
    senses.push({
      gloss,
      definition,
      part_of_speech: typeof row?.part_of_speech === 'string' && row.part_of_speech.trim()
        ? row.part_of_speech.trim().slice(0, 40)
        : null,
      examples: cleanExampleItems(row?.examples),
    })
    if (senses.length >= 6) break
  }

  if (typeof seed.gloss === 'string' && seed.gloss.trim() && !seenGloss.has(seed.gloss.trim())) {
    senses.unshift({
      gloss: seed.gloss.trim().slice(0, 200),
      definition: null,
      part_of_speech: typeof seed.part_of_speech === 'string' ? seed.part_of_speech : null,
      examples: [],
    })
  }

  if (!senses.length && Array.isArray(raw?.translations)) {
    for (const item of raw.translations) {
      const gloss = typeof item === 'string'
        ? item.trim()
        : (item && typeof item.translation === 'string' ? item.translation.trim() : '')
      if (!gloss || seenGloss.has(gloss)) continue
      seenGloss.add(gloss)
      senses.push({ gloss: gloss.slice(0, 200), definition: null, part_of_speech: null, examples: [] })
      if (senses.length >= 6) break
    }
  }

  if (!senses.length) return null

  const flatExamples = []
  const seenFlat = new Set()
  for (const sense of senses) {
    for (const example of sense.examples) {
      if (seenFlat.has(example.text)) continue
      seenFlat.add(example.text)
      flatExamples.push(example)
    }
  }
  for (const example of cleanExampleItems(raw?.example_sentences)) {
    if (seenFlat.has(example.text)) continue
    seenFlat.add(example.text)
    flatExamples.push(example)
  }

  return {
    word,
    phonetic: typeof raw?.phonetic === 'string' && raw.phonetic.trim()
      ? raw.phonetic.trim().slice(0, 80)
      : (typeof seed.phonetic === 'string' ? seed.phonetic : null),
    pinyin: typeof raw?.pinyin === 'string' && raw.pinyin.trim()
      ? raw.pinyin.trim().slice(0, 80)
      : (typeof seed.pinyin === 'string' ? seed.pinyin : null),
    part_of_speech: typeof raw?.part_of_speech === 'string' && raw.part_of_speech.trim()
      ? raw.part_of_speech.trim().slice(0, 40)
      : (senses[0]?.part_of_speech || (typeof seed.part_of_speech === 'string' ? seed.part_of_speech : null)),
    difficulty_level: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(raw?.difficulty_level)
      ? raw.difficulty_level
      : null,
    senses,
    examples: flatExamples.slice(0, 8),
  }
}

export function lexiconNeedsEnrichment(cache, vocabulary) {
  const defs = Array.isArray(cache?.definitions) ? cache.definitions : []
  const examples = Array.isArray(cache?.example_sentences) ? cache.example_sentences : []
  const glossCount = Array.isArray(vocabulary?.translations) ? vocabulary.translations.length : 0
  const hasMulti = defs.length >= 2 || glossCount >= 2
  const hasExamples = examples.some((item) => {
    if (typeof item === 'string') return Boolean(item.trim())
    if (item && typeof item === 'object' && typeof item.text === 'string') return Boolean(item.text.trim())
    return false
  })
  return !(hasMulti && hasExamples)
}

export function createBuildWordLexicon(deps) {
  const { billableChatCreate } = deps
  return async function buildWordLexicon({ word, language, userId, seedGloss, phonetic, pinyin, partOfSpeech }) {
    const headword = String(word || '').trim()
    if (!headword) return null
    const isZh = language === 'zh'
    const paid = await billableChatCreate(userId, crypto.randomUUID(), {
      messages: [
        {
          role: 'system',
          content: [
            isZh
              ? 'Ты лексикограф китайского языка для учебника. Верни только JSON.'
              : 'Ты лексикограф английского языка для учебника. Верни только JSON.',
            'Структура: {"word":"","phonetic":"","pinyin":"","part_of_speech":"","difficulty_level":"A1","senses":[{"gloss":"","definition":"","part_of_speech":"","examples":[{"text":"","translation":""}]}]}',
            'word — заголовок на языке изучения.',
            'gloss — короткий русский перевод (одно слово или короткая фраза).',
            'definition — короткое объяснение значения по-русски, как в учебном словаре.',
            'Дай 2–4 разных значения, если они реально есть; иначе одно.',
            'У каждого значения 1–2 примера: text на языке изучения, translation — перевод на русский.',
            'phonetic — IPA для английского; для китайского пусто. pinyin — только для китайского с тонами.',
            'part_of_speech на русском (существительное, глагол, числительное…).',
            'difficulty_level: A1–C2.',
          ].join(' '),
        },
        {
          role: 'user',
          content: [
            `Слово: ${headword}`,
            seedGloss ? `Известный перевод: ${seedGloss}` : '',
            phonetic ? `IPA: ${phonetic}` : '',
            pinyin ? `Pinyin: ${pinyin}` : '',
            partOfSpeech ? `Часть речи: ${partOfSpeech}` : '',
          ].filter(Boolean).join('\n'),
        },
      ],
      max_tokens: 1100,
      temperature: 0.2,
      metadata: { vocabulary_word_card: true },
    })
    if (!paid?.ok) {
      const err = new Error(paid?.error || 'Недостаточно средств, чтобы разобрать слово')
      err.status = paid?.status || 402
      throw err
    }
    return normalizeWordLexicon(parseJsonObject(paid.result?.text), language, {
      word: headword,
      gloss: seedGloss,
      phonetic,
      pinyin,
      part_of_speech: partOfSpeech,
    })
  }
}

export async function persistWordLexicon(deps, { language, lexicon }) {
  const { supabase, safeSupabaseCall = (fn) => fn() } = deps
  if (!lexicon?.word || !lexicon.senses?.length) return
  const definitions = lexicon.senses.map((sense) => ({
    translation: sense.gloss,
    definition: sense.definition || null,
    source: 'ai',
    part_of_speech: sense.part_of_speech || null,
    examples: sense.examples || [],
  }))
  await safeSupabaseCall(
    () => supabase
      .from('word_definitions_cache')
      .upsert({
        word: lexicon.word,
        language,
        definitions,
        phonetic_transcription: language === 'en' ? lexicon.phonetic : null,
        pinyin: language === 'zh' ? lexicon.pinyin : null,
        part_of_speech: lexicon.part_of_speech || null,
        difficulty_level: lexicon.difficulty_level || null,
        example_sentences: lexicon.examples,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'word,language' }),
  )
}

export async function applyLexiconToVocabulary(deps, {
  userId,
  language,
  vocabularyId,
  lexicon,
  ensureUserVocabularySenses,
}) {
  const { supabase, safeSupabaseCall = (fn) => fn() } = deps
  if (!vocabularyId || !lexicon?.senses?.length) return
  const translations = lexicon.senses.map((sense) => sense.gloss)
  const contexts = lexicon.examples.map((example) => ({
    text: example.text,
    translation: example.translation || null,
    source: 'ai',
  }))
  const patch = {
    translations,
    contexts,
    part_of_speech: lexicon.part_of_speech || null,
    updated_at: new Date().toISOString(),
  }
  if (lexicon.difficulty_level) patch.difficulty_level = lexicon.difficulty_level
  if (language === 'zh' && lexicon.pinyin) patch.pinyin = lexicon.pinyin
  await safeSupabaseCall(
    () => supabase
      .from('user_vocabulary')
      .update(patch)
      .eq('id', vocabularyId)
      .eq('user_id', userId),
  )
  if (typeof ensureUserVocabularySenses === 'function') {
    await ensureUserVocabularySenses({ supabase, userId, language })
  }
}

function glossFromCacheDef(item) {
  if (typeof item === 'string') return item.trim()
  if (item && typeof item === 'object' && typeof item.translation === 'string') return item.translation.trim()
  return ''
}

function normalizeSenseExamples(raw) {
  return cleanExampleItems(raw)
}

export function buildWordCardPayload({ vocabulary, senses, cache, lexicon }) {
  const fromLexicon = lexicon?.senses?.length
    ? lexicon.senses.map((sense, index) => ({
      id: senses?.[index]?.id || null,
      gloss_ru: sense.gloss,
      definition: sense.definition || null,
      part_of_speech: sense.part_of_speech || lexicon.part_of_speech || null,
      examples: sense.examples || [],
    }))
    : null

  const fromSenses = (senses || []).map((sense) => {
    const def = Array.isArray(cache?.definitions)
      ? cache.definitions.find((item) => glossFromCacheDef(item) === sense.gloss_ru)
      : null
    const senseExamples = normalizeSenseExamples(def?.examples)
    const definition = typeof def?.definition === 'string' && def.definition.trim()
      ? def.definition.trim()
      : null
    return {
      id: sense.id,
      gloss_ru: sense.gloss_ru,
      definition,
      part_of_speech: sense.part_of_speech || vocabulary?.part_of_speech || cache?.part_of_speech || null,
      examples: senseExamples,
    }
  })

  const senseRows = fromLexicon || fromSenses
  const sharedExamples = normalizeSenseExamples(lexicon?.examples || cache?.example_sentences || [])
  const withExamples = senseRows.map((sense) => ({
    ...sense,
    examples: sense.examples.length ? sense.examples : sharedExamples.slice(0, 2),
  }))

  return {
    vocabulary_id: vocabulary.id,
    headword: vocabulary.word,
    phonetic: lexicon?.phonetic || cache?.phonetic_transcription || null,
    pinyin: lexicon?.pinyin || vocabulary.pinyin || cache?.pinyin || null,
    part_of_speech: lexicon?.part_of_speech || vocabulary.part_of_speech || cache?.part_of_speech || null,
    difficulty_level: lexicon?.difficulty_level || vocabulary.difficulty_level || cache?.difficulty_level || null,
    senses: withExamples,
    examples: sharedExamples,
    enriched: Boolean(lexicon) || !lexiconNeedsEnrichment(cache, vocabulary),
  }
}

export { exampleTexts }
