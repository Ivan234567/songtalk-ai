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

function cleanExamples(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = new Set()
  for (const item of raw) {
    const text = typeof item === 'string'
      ? item.trim()
      : (item && typeof item === 'object' && typeof item.text === 'string' ? item.text.trim() : '')
    if (!text || text.length > 240 || seen.has(text)) continue
    seen.add(text)
    out.push(text)
    if (out.length >= 3) break
  }
  return out
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
    senses.push({
      gloss,
      part_of_speech: typeof row?.part_of_speech === 'string' && row.part_of_speech.trim()
        ? row.part_of_speech.trim().slice(0, 40)
        : null,
      examples: cleanExamples(row?.examples),
    })
    if (senses.length >= 6) break
  }

  if (typeof seed.gloss === 'string' && seed.gloss.trim() && !seenGloss.has(seed.gloss.trim())) {
    senses.unshift({
      gloss: seed.gloss.trim().slice(0, 200),
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
      senses.push({ gloss: gloss.slice(0, 200), part_of_speech: null, examples: [] })
      if (senses.length >= 6) break
    }
  }

  if (!senses.length) return null

  const flatExamples = []
  for (const sense of senses) {
    for (const example of sense.examples) {
      if (!flatExamples.includes(example)) flatExamples.push(example)
    }
  }
  const topExamples = cleanExamples(raw?.example_sentences)
  for (const example of topExamples) {
    if (!flatExamples.includes(example)) flatExamples.push(example)
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
              ? 'Ты лексикограф китайского языка. Верни только JSON.'
              : 'Ты лексикограф английского языка. Верни только JSON.',
            'Структура: {"word":"","phonetic":"","pinyin":"","part_of_speech":"","senses":[{"gloss":"","part_of_speech":"","examples":["",""]}]}',
            'word — заголовок на языке изучения. gloss — русский перевод одного значения.',
            'Дай 2–4 разных значения, если они реально есть; иначе одно.',
            'У каждого значения 1–2 коротких примера на языке изучения.',
            'phonetic — IPA для английского; для китайского пусто. pinyin — только для китайского с тонами.',
            'part_of_speech на русском (существительное, глагол…).',
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
      max_tokens: 900,
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
  const contexts = lexicon.examples.map((text) => ({ text, source: 'ai' }))
  const patch = {
    translations,
    contexts,
    part_of_speech: lexicon.part_of_speech || null,
    updated_at: new Date().toISOString(),
  }
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

export function buildWordCardPayload({ vocabulary, senses, cache, lexicon }) {
  const fromLexicon = lexicon?.senses?.length
    ? lexicon.senses.map((sense, index) => ({
      id: senses?.[index]?.id || null,
      gloss_ru: sense.gloss,
      part_of_speech: sense.part_of_speech || lexicon.part_of_speech || null,
      examples: sense.examples || [],
    }))
    : null

  const fromSenses = (senses || []).map((sense) => {
    const def = Array.isArray(cache?.definitions)
      ? cache.definitions.find((item) => glossFromCacheDef(item) === sense.gloss_ru)
      : null
    const senseExamples = Array.isArray(def?.examples) ? cleanExamples(def.examples) : []
    return {
      id: sense.id,
      gloss_ru: sense.gloss_ru,
      part_of_speech: sense.part_of_speech || vocabulary?.part_of_speech || cache?.part_of_speech || null,
      examples: senseExamples,
    }
  })

  const senseRows = fromLexicon || fromSenses
  const sharedExamples = cleanExamples(lexicon?.examples || cache?.example_sentences || [])
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
    senses: withExamples,
    examples: sharedExamples,
    enriched: Boolean(lexicon) || !lexiconNeedsEnrichment(cache, vocabulary),
  }
}
