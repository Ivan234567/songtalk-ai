/**
 * Библиотека списков слов.
 * Тренировка внутри словаря не делается: только Послушать / Сказать сам снаружи.
 */
import { ensureUserVocabularySenses } from './vocab-sense-sync.js'
import { findStarterPack, listStarterPacks } from './vocab-starter-packs.js'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const TITLE_MAX = 120
const MASTERED_INTERVAL_DAYS = 21

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

function classifyRecognitionState(state, now) {
  if (!state) return 'new'
  const dueAt = state.due_at ? new Date(state.due_at) : null
  const interval = Number(state.interval_days) || 0
  const reps = Number(state.repetitions) || 0
  const reviewed = Boolean(state.last_reviewed_at)
  if (!reviewed) return 'new'
  if (dueAt && dueAt.getTime() <= now.getTime()) return 'due'
  if (interval >= MASTERED_INTERVAL_DAYS && reps >= 2) return 'mastered'
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
    res.status(200).json({
      items: serialized,
      count: serialized.length,
      limit_free: 3,
      collections,
      tags,
      sidebar: {
        all: serialized.length,
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
            system_key: null,
          })
          .select('id, title, description, source, system_key, collection_id, language, created_at, updated_at')
          .single(),
      )
      if (error) throw error
      res.status(201).json({ item: await serializeList(data, { word_count: 0, new: 0, learning: 0, due: 0, mastered: 0 }) })
    } catch (error) {
      console.error('[api/vocabulary/lists] failed to create list', error?.message || error)
      res.status(500).json({ error: 'Failed to create list' })
    }
  }
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
      const stats = await loadListWordStats({ supabase, safeSupabaseCall, userId, listId: existing.id })
      res.status(200).json({ item: await serializeList(existing, stats), created: false })
      return
    }

    try {
      const vocabularyIds = []
      for (const entry of pack.words) {
        const word = String(entry.word || '').trim()
        if (!word) continue
        const { data: found } = await safeSupabaseCall(
          () => supabase
            .from('user_vocabulary')
            .select('id, translations')
            .eq('user_id', userId)
            .eq('language', language)
            .eq('word', word)
            .maybeSingle(),
        )
        if (found?.id) {
          vocabularyIds.push(found.id)
          continue
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
              difficulty_level: 'A1',
            })
            .select('id')
            .single(),
        )
        if (insertError) throw insertError
        vocabularyIds.push(inserted.id)
      }

      await ensureUserVocabularySenses({ supabase, userId, language })

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

      if (vocabularyIds.length) {
        const rows = vocabularyIds.map((vocabularyId, index) => ({
          list_id: list.id,
          user_id: userId,
          vocabulary_id: vocabularyId,
          position: index,
        }))
        const { error: itemsError } = await safeSupabaseCall(
          () => supabase.from('vocab_list_items').insert(rows),
        )
        if (itemsError) throw itemsError
      }

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
        return [{
          vocabulary_id: vocabularyId,
          headword: row.word,
          gloss_ru: firstGloss(row.translations) || senseList[0]?.gloss_ru || null,
          part_of_speech: row.part_of_speech || null,
          pinyin: row.pinyin || null,
          status,
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
      const senseIds = (senses || []).filter((row) => typeof row.gloss_ru === 'string' && row.gloss_ru.trim()).map((row) => row.id)
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

export function registerVocabListsRoutes(app, deps) {
  const wrap = deps.asyncHandler || ((fn) => fn)
  app.get('/api/vocabulary/lists', wrap(createListLibraryHandler(deps)))
  app.post('/api/vocabulary/lists', wrap(createEmptyListHandler(deps)))
  app.post('/api/vocabulary/lists/starter', wrap(createStarterPackHandler(deps)))
  app.get('/api/vocabulary/lists/:id', wrap(createListDetailHandler(deps)))
  app.get('/api/vocabulary/lists/:id/listen', wrap(createListListenIdsHandler(deps)))
}
