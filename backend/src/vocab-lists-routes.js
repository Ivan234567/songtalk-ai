/**
 * Библиотека списков слов.
 * Тренировка внутри словаря не делается: только Послушать / Сказать сам снаружи.
 */
import { ensureUserVocabularySenses } from './vocab-sense-sync.js'
import { demoListOrder, findStarterPack, listStarterPacks, STARTER_PACKS } from './vocab-starter-packs.js'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const TITLE_MAX = 120
/** Для прогресс-бара: полный прогресс после второго успешного повторения (интервал 6 дней в SM-2). */
const MASTERED_INTERVAL_DAYS = 6

async function loadLearningLanguage({ supabase, safeSupabaseCall, userId }) {
  const { data, error } = await safeSupabaseCall(
    () => supabase
      .from('user_profiles')
      .select('learning_language')
      .eq('user_id', userId)
      .maybeSingle(),
  )
  if (error) throw error
  const raw = typeof data?.learning_language === 'string' ? data.learning_language.trim() : ''
  if (!raw || raw === 'en') return 'en'
  if (raw === 'zh') return 'zh'
  const err = new Error('Unsupported learning language')
  err.code = 'bad_language'
  throw err
}

async function requireUser(deps, req, res) {
  const { getBearerToken, resolveUserId } = deps
  const token = getBearerToken(req)
  if (!token) {
    res.status(401).json({ error: 'Missing Authorization Bearer token' })
    return null
  }
  let userId
  try {
    userId = await resolveUserId(req)
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
    return null
  }
  if (typeof userId !== 'string' || !userId.trim()) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return null
  }
  return userId.trim()
}

async function requireLanguage(deps, userId, res) {
  try {
    return await loadLearningLanguage({
      supabase: deps.supabase,
      safeSupabaseCall: deps.safeSupabaseCall,
      userId,
    })
  } catch (error) {
    if (error?.code === 'bad_language') {
      res.status(500).json({ error: 'Unsupported learning language' })
      return null
    }
    console.error('[api/vocabulary/lists] failed to resolve learning language')
    res.status(500).json({ error: 'Failed to resolve learning language' })
    return null
  }
}

function firstGloss(translations) {
  if (!Array.isArray(translations) || !translations.length) return null
  for (const item of translations) {
    if (typeof item === 'string' && item.trim()) return item.trim()
    if (item && typeof item === 'object' && typeof item.translation === 'string' && item.translation.trim()) {
      return item.translation.trim()
    }
  }
  return null
}

export function classifyRecognitionState(state, now = new Date()) {
  if (!state) return 'new'
  const dueAt = state.due_at ? new Date(state.due_at) : null
  const interval = Number(state.interval_days) || 0
  const reps = Number(state.repetitions) || 0
  const reviewed = Boolean(state.last_reviewed_at)
  if (!reviewed) return 'new'
  // Пора снова слушать — важнее «освоено».
  if (dueAt && !Number.isNaN(dueAt.getTime()) && dueAt.getTime() <= now.getTime()) return 'due'
  // Успешный ответ в опросе (Знаю / Легко / С трудом): reps >= 1.
  // «Не знаю» сбрасывает reps в 0 → остаётся «Учу».
  if (reps >= 1 && interval >= 1) return 'mastered'
  return 'learning'
}

async function loadListWordStats({ supabase, safeSupabaseCall, userId, listId, now = new Date() }) {
  const { data: items, error: itemsError } = await safeSupabaseCall(
    () => supabase
      .from('vocab_list_items')
      .select('vocabulary_id')
      .eq('user_id', userId)
      .eq('list_id', listId),
  )
  if (itemsError) throw itemsError
  const vocabularyIds = (items || []).map((row) => row.vocabulary_id).filter(Boolean)
  if (!vocabularyIds.length) {
    return { word_count: 0, new: 0, learning: 0, due: 0, mastered: 0 }
  }

  const { data: senses, error: sensesError } = await safeSupabaseCall(
    () => supabase
      .from('vocab_senses')
      .select('id, vocabulary_id')
      .eq('user_id', userId)
      .in('vocabulary_id', vocabularyIds),
  )
  if (sensesError) throw sensesError

  const senseIds = (senses || []).map((row) => row.id)
  const byVocabulary = new Map()
  for (const sense of senses || []) {
    if (!byVocabulary.has(sense.vocabulary_id)) byVocabulary.set(sense.vocabulary_id, [])
    byVocabulary.get(sense.vocabulary_id).push(sense.id)
  }

  let statesBySense = new Map()
  if (senseIds.length) {
    const { data: states, error: statesError } = await safeSupabaseCall(
      () => supabase
        .from('vocab_srs_states')
        .select('sense_id, due_at, interval_days, repetitions, last_reviewed_at')
        .eq('user_id', userId)
        .eq('card_type', 'recognition')
        .in('sense_id', senseIds),
    )
    if (statesError) throw statesError
    statesBySense = new Map((states || []).map((row) => [row.sense_id, row]))
  }

  const counts = { word_count: vocabularyIds.length, new: 0, learning: 0, due: 0, mastered: 0 }
  for (const vocabularyId of vocabularyIds) {
    const senseList = byVocabulary.get(vocabularyId) || []
    if (!senseList.length) {
      counts.new += 1
      continue
    }
    const statuses = senseList.map((senseId) => classifyRecognitionState(statesBySense.get(senseId), now))
    if (statuses.includes('due')) counts.due += 1
    else if (statuses.every((status) => status === 'mastered')) counts.mastered += 1
    else if (statuses.every((status) => status === 'new')) counts.new += 1
    else counts.learning += 1
  }
  return counts
}

async function serializeList(row, stats = null, tags = []) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || null,
    source: row.source,
    system_key: row.system_key || null,
    collection_id: row.collection_id || null,
    language: row.language,
    level: demoListOrder(row.system_key) == null ? null : findStarterPack(row.system_key, row.language)?.level || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    word_count: stats?.word_count ?? 0,
    stats: {
      new: stats?.new ?? 0,
      learning: stats?.learning ?? 0,
      due: stats?.due ?? 0,
      mastered: stats?.mastered ?? 0,
    },
    tags,
    studied: Boolean(stats && (stats.learning > 0 || stats.due > 0 || stats.mastered > 0)),
  }
}

export function createListLibraryHandler(deps) {
  const { supabase, safeSupabaseCall = (fn) => fn() } = deps
  return async function listLibraryHandler(req, res) {
    const userId = await requireUser(deps, req, res)
    if (!userId) return
    const language = await requireLanguage(deps, userId, res)
    if (!language) return

    try {
      await ensureUserVocabularySenses({ supabase, userId, language })
    } catch {
      console.error('[api/vocabulary/lists] failed to prepare senses')
      res.status(500).json({ error: 'Failed to prepare vocabulary senses' })
      return
    }
    try {
      await ensureDemoLists({ supabase, safeSupabaseCall, userId, language })
    } catch (error) {
      console.error('[api/vocabulary/lists] failed to prepare demo lists', error?.message || error?.code || error)
      res.status(500).json({
        error: isMissingRelation(error) ? 'Списки ещё не включены в базе' : 'Failed to prepare vocabulary senses',
      })
      return
    }

    const q = typeof req.query?.q === 'string' ? req.query.q.trim().toLowerCase() : ''

    let lists
    try {
      const { data, error } = await safeSupabaseCall(
        () => supabase
          .from('vocab_lists')
          .select('id, title, description, source, system_key, collection_id, language, created_at, updated_at')
          .eq('user_id', userId)
          .eq('language', language)
          .order('updated_at', { ascending: false }),
      )
      if (error) throw error
      lists = data || []
    } catch {
      console.error('[api/vocabulary/lists] failed to load lists')
      res.status(500).json({ error: 'Failed to load lists' })
      return
    }

    if (q) {
      lists = lists.filter((row) => String(row.title || '').toLowerCase().includes(q))
    }

    const serialized = []
    let libraryDue = 0
    let libraryMastered = 0
    for (const row of lists) {
      let stats
      try {
        stats = await loadListWordStats({ supabase, safeSupabaseCall, userId, listId: row.id })
      } catch {
        stats = { word_count: 0, new: 0, learning: 0, due: 0, mastered: 0 }
      }
      libraryDue += stats.due
      libraryMastered += stats.mastered
      serialized.push(await serializeList(row, stats))
    }

    let collections = []
    let tags = []
    try {
      const [{ data: collectionRows }, { data: tagRows }] = await Promise.all([
        safeSupabaseCall(
          () => supabase
            .from('vocab_list_collections')
            .select('id, name')
            .eq('user_id', userId)
            .eq('language', language)
            .order('name'),
        ),
        safeSupabaseCall(
          () => supabase
            .from('vocab_list_tags')
            .select('id, name')
            .eq('user_id', userId)
            .eq('language', language)
            .order('name'),
        ),
      ])
      collections = collectionRows || []
      tags = tagRows || []
    } catch {
      collections = []
      tags = []
    }

    const ungrouped = serialized.filter((item) => !item.collection_id).length
    const items = orderLibraryItems(serialized)
    res.status(200).json({
      items,
      count: serialized.length,
      limit_free: 3,
      collections,
      tags,
      sidebar: {
        all: items.length,
        ungrouped,
      },
      summary: {
        due: libraryDue,
        mastered: libraryMastered,
        sessions_week: 0,
        streak_days: 0,
      },
      starter_packs: listStarterPacks(language).map((pack) => ({
        ...pack,
        in_library: serialized.some((item) => item.system_key === pack.key),
      })),
    })
  }
}

export function createEmptyListHandler(deps) {
  const { supabase, safeSupabaseCall = (fn) => fn() } = deps
  return async function emptyListHandler(req, res) {
    const userId = await requireUser(deps, req, res)
    if (!userId) return
    const language = await requireLanguage(deps, userId, res)
    if (!language) return

    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
    if (!title || title.length > TITLE_MAX) {
      res.status(400).json({ error: 'Title is required' })
      return
    }

    try {
      const { data, error } = await safeSupabaseCall(
        () => supabase
          .from('vocab_lists')
          .insert({
            user_id: userId,
            language,
            title,
            description: typeof req.body?.description === 'string' ? req.body.description.trim() || null : null,
            source: 'user',
          })
          .select('id, title, description, source, system_key, collection_id, language, created_at, updated_at')
          .single(),
      )
      if (error) throw error
      if (!data?.id) throw new Error('empty insert')
      res.status(201).json({ item: await serializeList(data, { word_count: 0, new: 0, learning: 0, due: 0, mastered: 0 }) })
    } catch (error) {
      console.error('[api/vocabulary/lists] failed to create list', error?.message || error?.code || error)
      res.status(500).json({ error: listWriteError(error) })
    }
  }
}

function errorCode(error) {
  return error?.code || error?.error?.code || ''
}

function isMissingRelation(error) {
  const code = errorCode(error)
  return code === '42P01' || code === 'PGRST205'
}

function listWriteError(error) {
  const code = errorCode(error)
  if (code === '23505') return 'Такой список уже есть'
  if (code === '23514') return 'Название списка не подходит'
  if (isMissingRelation(error)) return 'Списки ещё не включены в базе'
  return 'Не удалось создать список'
}

function orderLibraryItems(items) {
  const system = []
  const rest = []
  const byKey = new Map()
  for (const item of items) {
    if (item.system_key && demoListOrder(item.system_key) != null) byKey.set(item.system_key, item)
  }
  for (const pack of STARTER_PACKS) {
    const item = byKey.get(pack.key)
    if (item) system.push(item)
  }
  for (const item of items) {
    if (demoListOrder(item.system_key) == null) rest.push(item)
  }
  return [...system, ...rest]
}

function normalizeListWord(raw) {
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (!trimmed) return ''
  return trimmed.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/gi, '')
}

async function vocabularyIdForPackWord({ supabase, safeSupabaseCall, userId, language, entry, level }) {
  const word = normalizeListWord(entry.word)
  if (!word) return null
  const { data: found, error: foundError } = await safeSupabaseCall(
    () => supabase
      .from('user_vocabulary')
      .select('id, part_of_speech')
      .eq('user_id', userId)
      .eq('language', language)
      .eq('word', word)
      .maybeSingle(),
  )
  if (foundError) throw foundError
  if (found?.id) {
    if (entry.partOfSpeech && found.part_of_speech !== entry.partOfSpeech) {
      const { error: updateError } = await safeSupabaseCall(
        () => supabase
          .from('user_vocabulary')
          .update({ part_of_speech: entry.partOfSpeech })
          .eq('id', found.id)
          .eq('user_id', userId),
      )
      if (updateError) throw updateError
    }
    return found.id
  }
  const { data: inserted, error: insertError } = await safeSupabaseCall(
    () => supabase
      .from('user_vocabulary')
      .insert({
        user_id: userId,
        language,
        word,
        translations: [entry.gloss],
        part_of_speech: entry.partOfSpeech || null,
        difficulty_level: level === 'A2' ? 'A2' : 'A1',
      })
      .select('id')
      .single(),
  )
  if (insertError) throw insertError
  return inserted.id
}

async function fillPackWords({ supabase, safeSupabaseCall, userId, language, pack, listId }) {
  const vocabularyIds = []
  for (const entry of pack.words) {
    const vocabularyId = await vocabularyIdForPackWord({
      supabase,
      safeSupabaseCall,
      userId,
      language,
      entry,
      level: pack.level,
    })
    if (vocabularyId) vocabularyIds.push(vocabularyId)
  }
  const { data: current, error: currentError } = await safeSupabaseCall(
    () => supabase
      .from('vocab_list_items')
      .select('vocabulary_id, position')
      .eq('user_id', userId)
      .eq('list_id', listId),
  )
  if (currentError) throw currentError
  const have = new Set((current || []).map((row) => row.vocabulary_id))
  let nextPosition = (current || []).reduce((max, row) => Math.max(max, Number(row.position) || 0), -1) + 1
  const rows = []
  for (const vocabularyId of vocabularyIds) {
    if (have.has(vocabularyId)) continue
    have.add(vocabularyId)
    rows.push({
      list_id: listId,
      user_id: userId,
      vocabulary_id: vocabularyId,
      position: nextPosition,
    })
    nextPosition += 1
  }
  if (rows.length) {
    const { error } = await safeSupabaseCall(() => supabase.from('vocab_list_items').insert(rows))
    if (error) throw error
  }
  try {
    await ensurePackLexicon({ supabase, safeSupabaseCall, language, pack })
  } catch (error) {
    console.error('[api/vocabulary/lists] failed to store phonetics', error?.message || error?.code || error)
  }
}

async function ensurePackLexicon({ supabase, safeSupabaseCall, language, pack }) {
  const entries = pack.words
    .map((entry) => ({
      word: normalizeListWord(entry.word),
      gloss: entry.gloss,
      partOfSpeech: entry.partOfSpeech || null,
      phonetic: entry.phonetic || null,
      level: pack.level === 'A2' ? 'A2' : 'A1',
    }))
    .filter((entry) => entry.word && entry.phonetic)
  if (!entries.length) return
  const { data, error } = await safeSupabaseCall(
    () => supabase
      .from('word_definitions_cache')
      .select('word, phonetic_transcription')
      .eq('language', language)
      .in('word', entries.map((entry) => entry.word)),
  )
  if (error) throw error
  const byWord = new Map((data || []).map((row) => [row.word, row]))
  for (const entry of entries) {
    const existing = byWord.get(entry.word)
    if (existing?.phonetic_transcription) continue
    if (existing) {
      const { error: updateError } = await safeSupabaseCall(
        () => supabase
          .from('word_definitions_cache')
          .update({
            phonetic_transcription: entry.phonetic,
            updated_at: new Date().toISOString(),
          })
          .eq('word', entry.word)
          .eq('language', language),
      )
      if (updateError) throw updateError
      continue
    }
    const { error: insertError } = await safeSupabaseCall(
      () => supabase.from('word_definitions_cache').upsert({
        word: entry.word,
        language,
        definitions: entry.gloss ? [{ translation: entry.gloss }] : [],
        phonetic_transcription: entry.phonetic,
        part_of_speech: entry.partOfSpeech,
        difficulty_level: entry.level,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'word,language' }),
    )
    if (insertError) throw insertError
  }
}

async function ensureDemoLists({ supabase, safeSupabaseCall, userId, language }) {
  const packs = STARTER_PACKS.filter((pack) => pack.language === language)
  for (const pack of packs) {
    const { data: existing, error: existingError } = await safeSupabaseCall(
      () => supabase
        .from('vocab_lists')
        .select('id')
        .eq('user_id', userId)
        .eq('language', language)
        .eq('system_key', pack.key)
        .maybeSingle(),
    )
    if (existingError) throw existingError
    let listId = existing?.id
    if (!listId) {
      const { data: created, error: createError } = await safeSupabaseCall(
        () => supabase
          .from('vocab_lists')
          .insert({
            user_id: userId,
            language,
            title: pack.title,
            description: pack.description,
            source: 'system',
            system_key: pack.key,
          })
          .select('id')
          .single(),
      )
      if (createError) throw createError
      listId = created.id
    }
    await fillPackWords({ supabase, safeSupabaseCall, userId, language, pack, listId })
  }
  await ensureUserVocabularySenses({ supabase, userId, language })
}

export function createStarterPackHandler(deps) {
  const { supabase, safeSupabaseCall = (fn) => fn() } = deps
  return async function starterPackHandler(req, res) {
    const userId = await requireUser(deps, req, res)
    if (!userId) return
    const language = await requireLanguage(deps, userId, res)
    if (!language) return

    const key = typeof req.body?.key === 'string' ? req.body.key.trim() : ''
    const pack = findStarterPack(key, language)
    if (!pack) {
      res.status(404).json({ error: 'Starter pack not found' })
      return
    }

    const { data: existing } = await safeSupabaseCall(
      () => supabase
        .from('vocab_lists')
        .select('id, title, description, source, system_key, collection_id, language, created_at, updated_at')
        .eq('user_id', userId)
        .eq('language', language)
        .eq('system_key', pack.key)
        .maybeSingle(),
    )
    if (existing?.id) {
      await fillPackWords({ supabase, safeSupabaseCall, userId, language, pack, listId: existing.id })
      await ensureUserVocabularySenses({ supabase, userId, language })
      const stats = await loadListWordStats({ supabase, safeSupabaseCall, userId, listId: existing.id })
      res.status(200).json({ item: await serializeList(existing, stats), created: false })
      return
    }

    try {
      const { data: list, error: listError } = await safeSupabaseCall(
        () => supabase
          .from('vocab_lists')
          .insert({
            user_id: userId,
            language,
            title: pack.title,
            description: pack.description,
            source: 'system',
            system_key: pack.key,
          })
          .select('id, title, description, source, system_key, collection_id, language, created_at, updated_at')
          .single(),
      )
      if (listError) throw listError
      await fillPackWords({ supabase, safeSupabaseCall, userId, language, pack, listId: list.id })
      await ensureUserVocabularySenses({ supabase, userId, language })

      const stats = await loadListWordStats({ supabase, safeSupabaseCall, userId, listId: list.id })
      res.status(201).json({ item: await serializeList(list, stats), created: true })
    } catch (error) {
      console.error('[api/vocabulary/lists/starter] failed', error?.message || error)
      res.status(500).json({ error: 'Failed to add starter pack' })
    }
  }
}

export function createListDetailHandler(deps) {
  const { supabase, safeSupabaseCall = (fn) => fn(), now = () => new Date() } = deps
  return async function listDetailHandler(req, res) {
    const userId = await requireUser(deps, req, res)
    if (!userId) return
    const language = await requireLanguage(deps, userId, res)
    if (!language) return

    const listId = typeof req.params?.id === 'string' ? req.params.id.trim() : ''
    if (!UUID_RE.test(listId)) {
      res.status(400).json({ error: 'Invalid list id' })
      return
    }

    try {
      await ensureUserVocabularySenses({ supabase, userId, language })
    } catch {
      res.status(500).json({ error: 'Failed to prepare vocabulary senses' })
      return
    }

    const { data: list, error: listError } = await safeSupabaseCall(
      () => supabase
        .from('vocab_lists')
        .select('id, title, description, source, system_key, collection_id, language, created_at, updated_at')
        .eq('user_id', userId)
        .eq('language', language)
        .eq('id', listId)
        .maybeSingle(),
    )
    if (listError) {
      res.status(500).json({ error: 'Failed to load list' })
      return
    }
    if (!list) {
      res.status(404).json({ error: 'List not found' })
      return
    }

    const filter = typeof req.query?.filter === 'string' ? req.query.filter.trim() : 'all'
    const q = typeof req.query?.q === 'string' ? req.query.q.trim().toLowerCase() : ''

    const { data: itemRows, error: itemsError } = await safeSupabaseCall(
      () => supabase
        .from('vocab_list_items')
        .select('vocabulary_id, position, created_at')
        .eq('user_id', userId)
        .eq('list_id', listId)
        .order('position', { ascending: true }),
    )
    if (itemsError) {
      res.status(500).json({ error: 'Failed to load list words' })
      return
    }

    const vocabularyIds = (itemRows || []).map((row) => row.vocabulary_id)
    let words = []
    if (vocabularyIds.length) {
      const { data: vocabRows, error: vocabError } = await safeSupabaseCall(
        () => supabase
          .from('user_vocabulary')
          .select('id, word, translations, part_of_speech, difficulty_level, pinyin')
          .eq('user_id', userId)
          .in('id', vocabularyIds),
      )
      if (vocabError) {
        res.status(500).json({ error: 'Failed to load list words' })
        return
      }
      const byId = new Map((vocabRows || []).map((row) => [row.id, row]))
      const headwords = [...new Set((vocabRows || []).map((row) => row.word).filter(Boolean))]
      let phoneticByWord = new Map()
      if (headwords.length) {
        const { data: cacheRows, error: cacheError } = await safeSupabaseCall(
          () => supabase
            .from('word_definitions_cache')
            .select('word, phonetic_transcription')
            .eq('language', language)
            .in('word', headwords),
        )
        if (!cacheError) {
          phoneticByWord = new Map((cacheRows || []).map((row) => [row.word, row.phonetic_transcription || null]))
        }
      }

      const { data: senses } = await safeSupabaseCall(
        () => supabase
          .from('vocab_senses')
          .select('id, vocabulary_id, gloss_ru')
          .eq('user_id', userId)
          .in('vocabulary_id', vocabularyIds),
      )
      const sensesByVocab = new Map()
      for (const sense of senses || []) {
        if (!sensesByVocab.has(sense.vocabulary_id)) sensesByVocab.set(sense.vocabulary_id, [])
        sensesByVocab.get(sense.vocabulary_id).push(sense)
      }
      const senseIds = (senses || []).map((row) => row.id)
      const { data: states } = senseIds.length
        ? await safeSupabaseCall(
          () => supabase
            .from('vocab_srs_states')
            .select('sense_id, due_at, interval_days, repetitions, last_reviewed_at')
            .eq('user_id', userId)
            .eq('card_type', 'recognition')
            .in('sense_id', senseIds),
        )
        : { data: [] }
      const stateBySense = new Map((states || []).map((row) => [row.sense_id, row]))

      words = vocabularyIds.flatMap((vocabularyId) => {
        const row = byId.get(vocabularyId)
        if (!row) return []
        const senseList = sensesByVocab.get(vocabularyId) || []
        const statuses = senseList.length
          ? senseList.map((sense) => classifyRecognitionState(stateBySense.get(sense.id), now()))
          : ['new']
        let status = 'new'
        if (statuses.includes('due')) status = 'due'
        else if (statuses.every((item) => item === 'mastered')) status = 'mastered'
        else if (statuses.every((item) => item === 'new')) status = 'new'
        else status = 'learning'
        const senseStates = senseList.map((sense) => stateBySense.get(sense.id)).filter(Boolean)
        let nextReviewAt = null
        for (const state of senseStates) {
          if (!state?.due_at) continue
          if (!nextReviewAt || String(state.due_at) < nextReviewAt) nextReviewAt = String(state.due_at)
        }
        const interval = senseStates.reduce((max, state) => Math.max(max, Number(state.interval_days) || 0), 0)
        let progress = 0
        if (status === 'mastered') progress = 100
        else if (status !== 'new') progress = Math.min(90, Math.round((interval / MASTERED_INTERVAL_DAYS) * 100))
        return [{
          vocabulary_id: vocabularyId,
          headword: row.word,
          gloss_ru: firstGloss(row.translations) || senseList[0]?.gloss_ru || null,
          part_of_speech: row.part_of_speech || null,
          phonetic: phoneticByWord.get(row.word) || null,
          pinyin: row.pinyin || null,
          status,
          progress,
          next_review_at: nextReviewAt,
          sense_ids: senseList.map((sense) => sense.id),
        }]
      })
    }

    if (q) {
      words = words.filter((word) => {
        const hay = `${word.headword} ${word.gloss_ru || ''}`.toLowerCase()
        return hay.includes(q)
      })
    }
    if (filter === 'due') words = words.filter((word) => word.status === 'due')
    if (filter === 'new') words = words.filter((word) => word.status === 'new')
    if (filter === 'learning') words = words.filter((word) => word.status === 'learning')
    if (filter === 'mastered') words = words.filter((word) => word.status === 'mastered')

    const stats = await loadListWordStats({ supabase, safeSupabaseCall, userId, listId })
    res.status(200).json({
      item: await serializeList(list, stats),
      words,
      count: words.length,
    })
  }
}

export function createListListenIdsHandler(deps) {
  const { supabase, safeSupabaseCall = (fn) => fn(), now = () => new Date() } = deps
  return async function listListenIdsHandler(req, res) {
    const userId = await requireUser(deps, req, res)
    if (!userId) return
    const language = await requireLanguage(deps, userId, res)
    if (!language) return
    const listId = typeof req.params?.id === 'string' ? req.params.id.trim() : ''
    if (!UUID_RE.test(listId)) {
      res.status(400).json({ error: 'Invalid list id' })
      return
    }

    try {
      await ensureUserVocabularySenses({ supabase, userId, language })
      const { data: list } = await safeSupabaseCall(
        () => supabase
          .from('vocab_lists')
          .select('id')
          .eq('user_id', userId)
          .eq('language', language)
          .eq('id', listId)
          .maybeSingle(),
      )
      if (!list) {
        res.status(404).json({ error: 'List not found' })
        return
      }
      const { data: items } = await safeSupabaseCall(
        () => supabase
          .from('vocab_list_items')
          .select('vocabulary_id')
          .eq('user_id', userId)
          .eq('list_id', listId),
      )
      const vocabularyIds = (items || []).map((row) => row.vocabulary_id)
      if (!vocabularyIds.length) {
        res.status(200).json({ sense_ids: [], count: 0 })
        return
      }
      const { data: senses } = await safeSupabaseCall(
        () => supabase
          .from('vocab_senses')
          .select('id, vocabulary_id, gloss_ru')
          .eq('user_id', userId)
          .in('vocabulary_id', vocabularyIds),
      )
      const requestedSenses = typeof req.query?.senses === 'string'
        ? new Set(req.query.senses.split(',').map((item) => item.trim()).filter(Boolean))
        : null
      const senseIds = (senses || [])
        .filter((row) => typeof row.gloss_ru === 'string' && row.gloss_ru.trim())
        .map((row) => row.id)
        .filter((senseId) => !requestedSenses || requestedSenses.has(senseId))
      const { data: states } = senseIds.length
        ? await safeSupabaseCall(
          () => supabase
            .from('vocab_srs_states')
            .select('sense_id, due_at, last_reviewed_at')
            .eq('user_id', userId)
            .eq('card_type', 'recognition')
            .in('sense_id', senseIds),
        )
        : { data: [] }
      const nowMs = now().getTime()
      const dueFirst = []
      const rest = []
      const stateMap = new Map((states || []).map((row) => [row.sense_id, row]))
      for (const senseId of senseIds) {
        const state = stateMap.get(senseId)
        const dueAt = state?.due_at ? new Date(state.due_at).getTime() : 0
        if (!state?.last_reviewed_at || dueAt <= nowMs) dueFirst.push(senseId)
        else rest.push(senseId)
      }
      const orderedIds = [...dueFirst, ...rest].slice(0, 10)
      const senseById = new Map((senses || []).map((row) => [row.id, row]))
      const vocabularyIdSet = new Set(vocabularyIds)
      const { data: vocabRows } = await safeSupabaseCall(
        () => supabase
          .from('user_vocabulary')
          .select('id, word, part_of_speech, contexts')
          .eq('user_id', userId)
          .in('id', [...vocabularyIdSet]),
      )
      const vocabById = new Map((vocabRows || []).map((row) => [row.id, row]))
      const listenItems = orderedIds.flatMap((senseId) => {
        const sense = senseById.get(senseId)
        if (!sense) return []
        const vocab = vocabById.get(sense.vocabulary_id)
        const gloss = typeof sense.gloss_ru === 'string' ? sense.gloss_ru.trim() : ''
        const headword = typeof vocab?.word === 'string' ? vocab.word.trim() : ''
        if (!gloss || !headword) return []
        const contextText = Array.isArray(vocab?.contexts) && typeof vocab.contexts[0] === 'string'
          ? vocab.contexts[0]
          : null
        return [{
          sense_id: senseId,
          headword,
          gloss_ru: gloss,
          part_of_speech: vocab?.part_of_speech || null,
          context_text: contextText,
          due_at: stateMap.get(senseId)?.due_at || null,
        }]
      })
      res.status(200).json({ items: listenItems, sense_ids: orderedIds, count: listenItems.length })
    } catch {
      res.status(500).json({ error: 'Failed to prepare listen queue' })
    }
  }
}

function normalizeHeadword(raw, language) {
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (!trimmed || trimmed.length > 80) return ''
  if (language === 'zh') return trimmed.replace(/\s+/g, '')
  return trimmed.toLowerCase()
}

async function loadOwnedList(deps, { userId, language, listId }) {
  const { data, error } = await deps.safeSupabaseCall(
    () => deps.supabase
      .from('vocab_lists')
      .select('id, title, source')
      .eq('user_id', userId)
      .eq('language', language)
      .eq('id', listId)
      .maybeSingle(),
  )
  if (error) throw error
  return data || null
}

async function cachePhonetic(deps, { language, word, phonetic, pinyin, partOfSpeech, gloss }) {
  if (!phonetic && !pinyin) return
  try {
    await deps.safeSupabaseCall(
      () => deps.supabase
        .from('word_definitions_cache')
        .upsert({
          word,
          language,
          definitions: gloss ? [gloss] : [],
          phonetic_transcription: phonetic || null,
          pinyin: pinyin || null,
          part_of_speech: partOfSpeech || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'word,language' }),
    )
  } catch {
    // кэш не обязателен для добавления
  }
}

async function addWordToList(deps, {
  userId,
  language,
  listId,
  word: rawWord,
  gloss: rawGloss,
  phonetic,
  part_of_speech: partOfSpeech,
  pinyin,
}) {
  const word = language === 'zh' ? normalizeHeadword(rawWord, 'zh') : (normalizeListWord(rawWord) || normalizeHeadword(rawWord, language))
  const gloss = typeof rawGloss === 'string' ? rawGloss.trim() : ''
  if (!word || !gloss || gloss.length > 200) {
    const err = new Error('Нужны слово и перевод')
    err.status = 400
    throw err
  }

  const { data: found, error: foundError } = await deps.safeSupabaseCall(
    () => deps.supabase
      .from('user_vocabulary')
      .select('id')
      .eq('user_id', userId)
      .eq('language', language)
      .eq('word', word)
      .maybeSingle(),
  )
  if (foundError) throw foundError

  let vocabularyId = found?.id
  if (!vocabularyId) {
    const payload = {
      user_id: userId,
      language,
      word,
      translations: [gloss],
      difficulty_level: 'A1',
      part_of_speech: typeof partOfSpeech === 'string' && partOfSpeech.trim() ? partOfSpeech.trim().slice(0, 40) : null,
    }
    if (language === 'zh' && typeof pinyin === 'string' && pinyin.trim()) payload.pinyin = pinyin.trim().slice(0, 80)
    const { data: inserted, error: insertError } = await deps.safeSupabaseCall(
      () => deps.supabase.from('user_vocabulary').insert(payload).select('id').single(),
    )
    if (insertError) throw insertError
    vocabularyId = inserted.id
  } else if (partOfSpeech || pinyin) {
    const patch = {}
    if (partOfSpeech) patch.part_of_speech = String(partOfSpeech).trim().slice(0, 40)
    if (language === 'zh' && pinyin) patch.pinyin = String(pinyin).trim().slice(0, 80)
    if (Object.keys(patch).length) {
      await deps.safeSupabaseCall(
        () => deps.supabase.from('user_vocabulary').update(patch).eq('id', vocabularyId).eq('user_id', userId),
      )
    }
  }

  if (phonetic || pinyin) {
    await cachePhonetic(deps, {
      language,
      word,
      phonetic: typeof phonetic === 'string' ? phonetic.trim() : null,
      pinyin: typeof pinyin === 'string' ? pinyin.trim() : null,
      partOfSpeech,
      gloss,
    })
  }

  await ensureUserVocabularySenses({ supabase: deps.supabase, userId, language })

  const { data: existingLink } = await deps.safeSupabaseCall(
    () => deps.supabase
      .from('vocab_list_items')
      .select('vocabulary_id')
      .eq('user_id', userId)
      .eq('list_id', listId)
      .eq('vocabulary_id', vocabularyId)
      .maybeSingle(),
  )
  if (existingLink?.vocabulary_id) {
    return { already: true, vocabulary_id: vocabularyId, word, gloss }
  }

  const { data: lastItem } = await deps.safeSupabaseCall(
    () => deps.supabase
      .from('vocab_list_items')
      .select('position')
      .eq('user_id', userId)
      .eq('list_id', listId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle(),
  )
  const position = Number.isInteger(lastItem?.position) ? lastItem.position + 1 : 0
  const { error: linkError } = await deps.safeSupabaseCall(
    () => deps.supabase
      .from('vocab_list_items')
      .insert({
        list_id: listId,
        user_id: userId,
        vocabulary_id: vocabularyId,
        position,
      }),
  )
  if (linkError && errorCode(linkError) !== '23505') throw linkError
  return { already: Boolean(linkError), vocabulary_id: vocabularyId, word, gloss }
}

export function createAddListWordHandler(deps) {
  const { supabase, safeSupabaseCall = (fn) => fn() } = deps
  return async function addListWordHandler(req, res) {
    const userId = await requireUser(deps, req, res)
    if (!userId) return
    const language = await requireLanguage(deps, userId, res)
    if (!language) return
    const listId = typeof req.params?.id === 'string' ? req.params.id.trim() : ''
    if (!UUID_RE.test(listId)) {
      res.status(400).json({ error: 'Invalid list id' })
      return
    }

    try {
      const list = await loadOwnedList({ supabase, safeSupabaseCall }, { userId, language, listId })
      if (!list) {
        res.status(404).json({ error: 'Список не найден' })
        return
      }
      const result = await addWordToList({ supabase, safeSupabaseCall }, {
        userId,
        language,
        listId,
        word: req.body?.word,
        gloss: req.body?.gloss,
        phonetic: req.body?.phonetic,
        part_of_speech: req.body?.part_of_speech,
        pinyin: req.body?.pinyin,
      })
      res.status(result.already ? 200 : 201).json({ ok: true, ...result })
    } catch (error) {
      if (error?.status === 400) {
        res.status(400).json({ error: error.message })
        return
      }
      console.error('[api/vocabulary/lists/words] failed', error?.message || error?.code || error)
      res.status(500).json({ error: 'Не удалось добавить слово' })
    }
  }
}

export function createResolveListWordsHandler(deps) {
  const { supabase, safeSupabaseCall = (fn) => fn(), resolveListEntries } = deps
  return async function resolveListWordsHandler(req, res) {
    const userId = await requireUser(deps, req, res)
    if (!userId) return
    const language = await requireLanguage(deps, userId, res)
    if (!language) return
    const listId = typeof req.params?.id === 'string' ? req.params.id.trim() : ''
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
    if (!UUID_RE.test(listId) || !text) {
      res.status(400).json({ error: 'Нужен текст для разбора' })
      return
    }
    if (typeof resolveListEntries !== 'function') {
      res.status(501).json({ error: 'Разбор слов недоступен' })
      return
    }
    try {
      const list = await loadOwnedList({ supabase, safeSupabaseCall }, { userId, language, listId })
      if (!list) {
        res.status(404).json({ error: 'Список не найден' })
        return
      }
      const items = await resolveListEntries({ text, language, userId })
      const words = items.map((item) => item.word)
      let inList = new Set()
      if (words.length) {
        const { data: vocabRows } = await safeSupabaseCall(
          () => supabase
            .from('user_vocabulary')
            .select('id, word')
            .eq('user_id', userId)
            .eq('language', language)
            .in('word', words),
        )
        const byWord = new Map((vocabRows || []).map((row) => [row.word, row.id]))
        const vocabIds = [...byWord.values()]
        if (vocabIds.length) {
          const { data: links } = await safeSupabaseCall(
            () => supabase
              .from('vocab_list_items')
              .select('vocabulary_id')
              .eq('user_id', userId)
              .eq('list_id', listId)
              .in('vocabulary_id', vocabIds),
          )
          const linked = new Set((links || []).map((row) => row.vocabulary_id))
          inList = new Set([...byWord.entries()].filter(([, id]) => linked.has(id)).map(([word]) => word))
        }
      }
      res.status(200).json({
        items: items.map((item) => ({
          ...item,
          in_list: inList.has(item.word),
        })),
      })
    } catch (error) {
      if (error?.status === 402) {
        res.status(402).json({ error: error.message })
        return
      }
      console.error('[api/vocabulary/lists/resolve] failed', error?.message || error)
      res.status(500).json({ error: 'Не удалось разобрать слова' })
    }
  }
}

export function createBulkAddListWordsHandler(deps) {
  const { supabase, safeSupabaseCall = (fn) => fn() } = deps
  return async function bulkAddListWordsHandler(req, res) {
    const userId = await requireUser(deps, req, res)
    if (!userId) return
    const language = await requireLanguage(deps, userId, res)
    if (!language) return
    const listId = typeof req.params?.id === 'string' ? req.params.id.trim() : ''
    const rows = Array.isArray(req.body?.items) ? req.body.items.slice(0, 15) : []
    if (!UUID_RE.test(listId) || !rows.length) {
      res.status(400).json({ error: 'Нужны слова для добавления' })
      return
    }
    try {
      const list = await loadOwnedList({ supabase, safeSupabaseCall }, { userId, language, listId })
      if (!list) {
        res.status(404).json({ error: 'Список не найден' })
        return
      }
      const added = []
      const existing = []
      for (const row of rows) {
        const result = await addWordToList({ supabase, safeSupabaseCall }, {
          userId,
          language,
          listId,
          word: row?.word,
          gloss: row?.gloss,
          phonetic: row?.phonetic,
          part_of_speech: row?.part_of_speech,
          pinyin: row?.pinyin,
        })
        if (result.already) existing.push(result)
        else added.push(result)
      }
      res.status(200).json({ ok: true, added, existing })
    } catch (error) {
      if (error?.status === 400) {
        res.status(400).json({ error: error.message })
        return
      }
      console.error('[api/vocabulary/lists/bulk] failed', error?.message || error)
      res.status(500).json({ error: 'Не удалось добавить слова' })
    }
  }
}

export function createPatchListHandler(deps) {
  const { supabase, safeSupabaseCall = (fn) => fn() } = deps
  return async function patchListHandler(req, res) {
    const userId = await requireUser(deps, req, res)
    if (!userId) return
    const language = await requireLanguage(deps, userId, res)
    if (!language) return
    const listId = typeof req.params?.id === 'string' ? req.params.id.trim() : ''
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
    if (!UUID_RE.test(listId) || !title || title.length > TITLE_MAX) {
      res.status(400).json({ error: 'Нужно название списка' })
      return
    }
    try {
      const { data, error } = await safeSupabaseCall(
        () => supabase
          .from('vocab_lists')
          .update({ title, updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('language', language)
          .eq('id', listId)
          .select('id, title, description, source, system_key, collection_id, language, created_at, updated_at')
          .maybeSingle(),
      )
      if (error) throw error
      if (!data) {
        res.status(404).json({ error: 'Список не найден' })
        return
      }
      const stats = await loadListWordStats({ supabase, safeSupabaseCall, userId, listId })
      res.status(200).json({ item: await serializeList(data, stats) })
    } catch (error) {
      console.error('[api/vocabulary/lists/patch] failed', error?.message || error)
      res.status(500).json({ error: listWriteError(error) })
    }
  }
}

export function createDeleteListHandler(deps) {
  const { supabase, safeSupabaseCall = (fn) => fn() } = deps
  return async function deleteListHandler(req, res) {
    const userId = await requireUser(deps, req, res)
    if (!userId) return
    const language = await requireLanguage(deps, userId, res)
    if (!language) return
    const listId = typeof req.params?.id === 'string' ? req.params.id.trim() : ''
    if (!UUID_RE.test(listId)) {
      res.status(400).json({ error: 'Invalid list id' })
      return
    }
    try {
      const { data, error } = await safeSupabaseCall(
        () => supabase
          .from('vocab_lists')
          .delete()
          .eq('user_id', userId)
          .eq('language', language)
          .eq('id', listId)
          .select('id')
          .maybeSingle(),
      )
      if (error) throw error
      if (!data) {
        res.status(404).json({ error: 'Список не найден' })
        return
      }
      res.status(200).json({ ok: true, id: listId })
    } catch (error) {
      console.error('[api/vocabulary/lists/delete] failed', error?.message || error)
      res.status(500).json({ error: 'Не удалось удалить список' })
    }
  }
}

export function createRemoveListWordHandler(deps) {
  const { supabase, safeSupabaseCall = (fn) => fn() } = deps
  return async function removeListWordHandler(req, res) {
    const userId = await requireUser(deps, req, res)
    if (!userId) return
    const language = await requireLanguage(deps, userId, res)
    if (!language) return
    const listId = typeof req.params?.id === 'string' ? req.params.id.trim() : ''
    const vocabularyId = typeof req.params?.vocabularyId === 'string' ? req.params.vocabularyId.trim() : ''
    if (!UUID_RE.test(listId) || !UUID_RE.test(vocabularyId)) {
      res.status(400).json({ error: 'Invalid id' })
      return
    }
    try {
      const list = await loadOwnedList({ supabase, safeSupabaseCall }, { userId, language, listId })
      if (!list) {
        res.status(404).json({ error: 'Список не найден' })
        return
      }
      const { error } = await safeSupabaseCall(
        () => supabase
          .from('vocab_list_items')
          .delete()
          .eq('user_id', userId)
          .eq('list_id', listId)
          .eq('vocabulary_id', vocabularyId),
      )
      if (error) throw error
      res.status(200).json({ ok: true, vocabulary_id: vocabularyId })
    } catch (error) {
      console.error('[api/vocabulary/lists/remove-word] failed', error?.message || error)
      res.status(500).json({ error: 'Не удалось убрать слово' })
    }
  }
}

export function registerVocabListsRoutes(app, deps) {
  const wrap = deps.asyncHandler || ((fn) => fn)
  app.get('/api/vocabulary/lists', wrap(createListLibraryHandler(deps)))
  app.post('/api/vocabulary/lists', wrap(createEmptyListHandler(deps)))
  app.post('/api/vocabulary/lists/starter', wrap(createStarterPackHandler(deps)))
  app.patch('/api/vocabulary/lists/:id', wrap(createPatchListHandler(deps)))
  app.delete('/api/vocabulary/lists/:id', wrap(createDeleteListHandler(deps)))
  app.get('/api/vocabulary/lists/:id', wrap(createListDetailHandler(deps)))
  app.post('/api/vocabulary/lists/:id/words/resolve', wrap(createResolveListWordsHandler(deps)))
  app.post('/api/vocabulary/lists/:id/words/bulk', wrap(createBulkAddListWordsHandler(deps)))
  app.post('/api/vocabulary/lists/:id/words', wrap(createAddListWordHandler(deps)))
  app.delete('/api/vocabulary/lists/:id/words/:vocabularyId', wrap(createRemoveListWordHandler(deps)))
  app.get('/api/vocabulary/lists/:id/listen', wrap(createListListenIdsHandler(deps)))
}
