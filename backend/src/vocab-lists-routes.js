/**
 * Библиотека списков слов.
 * Тренировка внутри словаря не делается: только Послушать / Сказать сам снаружи.
 */
import { ensureUserVocabularySenses } from './vocab-sense-sync.js'
import { demoListOrder, findStarterPack, listStarterPacks, STARTER_PACKS } from './vocab-starter-packs.js'
import {
  applyLexiconToVocabulary,
  buildWordCardPayload,
  createBuildWordLexicon,
  lexiconNeedsEnrichment,
  persistWordLexicon,
} from './vocab-word-card.js'
import { createGenerateBoundListEntries, normalizeConfirmEntries } from './vocab-list-ai.js'
import {
  pickSessionCandidates,
  classifySenseMilestone,
  MILESTONE_LABELS,
} from './vocab-session-picks.js'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const TITLE_MAX = 120
const BOUND_REF_MAX = 160
const BOUND_LABEL_MAX = 160
/** Для прогресс-бара: полный прогресс после второго успешного повторения (интервал 6 дней в SM-2). */
const MASTERED_INTERVAL_DAYS = 6

const LIST_ROW_FIELDS = [
  'id',
  'title',
  'description',
  'source',
  'system_key',
  'collection_id',
  'language',
  'bound_kind',
  'bound_ref',
  'bound_origin',
  'bound_label',
  'theme_keys',
  'created_at',
  'updated_at',
].join(', ')

const LIST_SOURCES = new Set(['system', 'user', 'custom', 'ai'])
const BOUND_KINDS = new Set(['scenario', 'debate', 'chat'])
const BOUND_ORIGINS = new Set(['system', 'user'])

/** Канонические темы — зеркало frontend/lib/practice-list-context THEME_GROUPS.boost */
const THEME_INFER = [
  { key: 'home', needles: ['home', 'дом', 'квартир', 'аренд', 'apartment', 'rent', 'housing', 'bathroom', 'kitchen'] },
  { key: 'food', needles: ['food', 'еда', 'кафе', 'ресторан', 'cafe', 'restaurant', 'menu', 'заказ'] },
  { key: 'travel', needles: ['travel', 'поездк', 'путешеств', 'hotel', 'отел', 'taxi', 'аэропорт', 'airport'] },
  { key: 'everyday', needles: ['everyday', 'каждый', 'shop', 'магазин', 'doctor', 'врач', 'city', 'город'] },
  { key: 'family', needles: ['family', 'семья', 'родител'] },
  { key: 'work', needles: ['work', 'работ', 'office', 'офис', 'interview', 'собеседован'] },
  { key: 'school', needles: ['school', 'школ', 'учеба', 'учёба', 'university'] },
  { key: 'debate', needles: ['debate', 'дебат', 'opinion', 'мнение', 'society', 'обществ', 'climate', 'rights', 'политик'] },
  { key: 'intro', needles: ['intro', 'знаком', 'hello', 'привет'] },
]

export function inferThemeKeys(...parts) {
  const blob = parts
    .filter((part) => typeof part === 'string' && part.trim())
    .join(' ')
    .toLowerCase()
  if (!blob) return []
  const keys = []
  for (const theme of THEME_INFER) {
    if (theme.needles.some((needle) => blob.includes(needle))) keys.push(theme.key)
  }
  return [...new Set(keys)].slice(0, 8)
}

export function parseThemeKeysInput(body) {
  if (!body || typeof body !== 'object' || !('theme_keys' in body)) return { present: false }
  const raw = body.theme_keys
  if (!Array.isArray(raw)) {
    const err = new Error('theme_keys должен быть массивом')
    err.status = 400
    throw err
  }
  const keys = [...new Set(
    raw
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => /^[a-z][a-z0-9_-]{1,31}$/.test(item)),
  )].slice(0, 12)
  return { present: true, theme_keys: keys }
}

/**
 * Разбор primary-привязки списка к сцене/дебату/чату.
 * { present:false } — полей в теле нет.
 * { present:true, clear:true } — снять привязку.
 * { present:true, clear:false, bound_* } — установить.
 */
export function parseListBindingInput(body) {
  if (!body || typeof body !== 'object') return { present: false }
  const nested = body.binding && typeof body.binding === 'object' ? body.binding : null
  const hasFlat = ['bound_kind', 'bound_ref', 'bound_origin', 'bound_label'].some((key) => key in body)
  const hasNested = Boolean(nested) && ['kind', 'ref', 'origin', 'label', 'bound_kind', 'bound_ref'].some((key) => key in nested)
  if (!hasFlat && !hasNested && !('binding' in body)) return { present: false }

  const rawKind = hasNested
    ? (nested.kind ?? nested.bound_kind)
    : body.bound_kind
  const rawRef = hasNested
    ? (nested.ref ?? nested.bound_ref)
    : body.bound_ref
  const rawOrigin = hasNested
    ? (nested.origin ?? nested.bound_origin)
    : body.bound_origin
  const rawLabel = hasNested
    ? (nested.label ?? nested.bound_label)
    : body.bound_label

  if (rawKind == null || rawKind === '' || rawKind === false) {
    return {
      present: true,
      clear: true,
      bound_kind: null,
      bound_ref: null,
      bound_origin: null,
      bound_label: null,
    }
  }

  const kind = typeof rawKind === 'string' ? rawKind.trim() : ''
  const ref = typeof rawRef === 'string' ? rawRef.trim() : ''
  const origin = typeof rawOrigin === 'string' ? rawOrigin.trim() : ''
  const label = typeof rawLabel === 'string' ? rawLabel.trim() : ''

  if (!BOUND_KINDS.has(kind)) {
    const err = new Error('Некорректный тип привязки списка')
    err.status = 400
    throw err
  }
  if (!ref || ref.length > BOUND_REF_MAX) {
    const err = new Error('Нужен идентификатор сценария или дебата')
    err.status = 400
    throw err
  }
  if (origin && !BOUND_ORIGINS.has(origin)) {
    const err = new Error('Некорректный origin привязки')
    err.status = 400
    throw err
  }
  if (label.length > BOUND_LABEL_MAX) {
    const err = new Error('Слишком длинная подпись привязки')
    err.status = 400
    throw err
  }

  return {
    present: true,
    clear: false,
    bound_kind: kind,
    bound_ref: ref,
    bound_origin: origin || null,
    bound_label: label || null,
  }
}

export function listBindingPatch(binding) {
  if (!binding?.present) return {}
  return {
    bound_kind: binding.bound_kind,
    bound_ref: binding.bound_ref,
    bound_origin: binding.bound_origin,
    bound_label: binding.bound_label,
  }
}

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
  // Освоено только после устойчивого интервала (2-й успех SM-2 → 6 дней).
  // Первый «Знаю» даёт interval=1, reps=1 → ещё «Учу».
  if (reps >= 2 && interval >= MASTERED_INTERVAL_DAYS) return 'mastered'
  return 'learning'
}

function emptyListStats() {
  return { word_count: 0, new: 0, learning: 0, due: 0, mastered: 0 }
}

function computeListStatsFromMaps({ vocabularyIds, byVocabulary, statesBySense, now }) {
  const counts = emptyListStats()
  counts.word_count = vocabularyIds.length
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
  if (!vocabularyIds.length) return emptyListStats()

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

  return computeListStatsFromMaps({ vocabularyIds, byVocabulary, statesBySense, now })
}

/** Один проход по items/senses/states для всех списков библиотеки (вместо N+1). */
async function loadAllListWordStats({ supabase, safeSupabaseCall, userId, listIds, now = new Date() }) {
  const result = new Map()
  for (const listId of listIds) result.set(listId, emptyListStats())
  if (!listIds.length) return result

  const { data: items, error: itemsError } = await safeSupabaseCall(
    () => supabase
      .from('vocab_list_items')
      .select('list_id, vocabulary_id')
      .eq('user_id', userId)
      .in('list_id', listIds),
  )
  if (itemsError) throw itemsError

  const vocabIdsByList = new Map()
  const allVocabularyIds = new Set()
  for (const row of items || []) {
    if (!row?.list_id || !row?.vocabulary_id) continue
    if (!vocabIdsByList.has(row.list_id)) vocabIdsByList.set(row.list_id, [])
    vocabIdsByList.get(row.list_id).push(row.vocabulary_id)
    allVocabularyIds.add(row.vocabulary_id)
  }

  const vocabularyIds = [...allVocabularyIds]
  let senses = []
  if (vocabularyIds.length) {
    const { data, error: sensesError } = await safeSupabaseCall(
      () => supabase
        .from('vocab_senses')
        .select('id, vocabulary_id')
        .eq('user_id', userId)
        .in('vocabulary_id', vocabularyIds),
    )
    if (sensesError) throw sensesError
    senses = data || []
  }

  const byVocabulary = new Map()
  const senseIds = []
  for (const sense of senses) {
    senseIds.push(sense.id)
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

  for (const listId of listIds) {
    const listVocabIds = vocabIdsByList.get(listId) || []
    result.set(listId, computeListStatsFromMaps({
      vocabularyIds: listVocabIds,
      byVocabulary,
      statesBySense,
      now,
    }))
  }
  return result
}

function readEmbeddedCount(value) {
  const row = Array.isArray(value) ? value[0] : value
  const count = Number(row?.count)
  return Number.isFinite(count) ? count : null
}

/** Сколько слов списка пора повторить. Одна связь list+vocabulary считается один раз. */
export function tallyDueByList(links) {
  const due = new Map()
  const seen = new Set()
  for (const row of Array.isArray(links) ? links : []) {
    if (!row?.list_id || !row?.vocabulary_id) continue
    const key = `${row.list_id}:${row.vocabulary_id}`
    if (seen.has(key)) continue
    seen.add(key)
    due.set(row.list_id, (due.get(row.list_id) || 0) + 1)
  }
  return due
}

async function loadLibraryCounters({ supabase, safeSupabaseCall, userId, lists, now = new Date() }) {
  const stats = new Map(lists.map((row) => [row.id, emptyListStats()]))
  const listIds = lists.map((row) => row.id).filter(Boolean)
  let needsItemCount = false
  for (const row of lists) {
    const bucket = stats.get(row.id)
    const embedded = readEmbeddedCount(row.vocab_list_items)
    if (embedded == null) needsItemCount = true
    else if (bucket) bucket.word_count = embedded
  }
  if (!listIds.length) return stats

  if (needsItemCount) {
    const { data: items, error } = await safeSupabaseCall(
      () => supabase
        .from('vocab_list_items')
        .select('list_id')
        .eq('user_id', userId)
        .in('list_id', listIds),
    )
    if (error) throw error
    for (const row of items || []) {
      const bucket = stats.get(row.list_id)
      if (bucket) bucket.word_count += 1
    }
  }

  const { data: dueStates, error: dueError } = await safeSupabaseCall(
    () => supabase
      .from('vocab_srs_states')
      .select('sense_id')
      .eq('user_id', userId)
      .eq('card_type', 'recognition')
      .not('last_reviewed_at', 'is', null)
      .lte('due_at', now.toISOString()),
  )
  if (dueError) throw dueError
  const senseIds = (dueStates || []).map((row) => row.sense_id).filter(Boolean)
  if (!senseIds.length) return stats

  const { data: senses, error: sensesError } = await safeSupabaseCall(
    () => supabase
      .from('vocab_senses')
      .select('vocabulary_id')
      .eq('user_id', userId)
      .in('id', senseIds),
  )
  if (sensesError) throw sensesError
  const vocabularyIds = [...new Set((senses || []).map((row) => row.vocabulary_id).filter(Boolean))]
  if (!vocabularyIds.length) return stats

  const { data: links, error: linksError } = await safeSupabaseCall(
    () => supabase
      .from('vocab_list_items')
      .select('list_id, vocabulary_id')
      .eq('user_id', userId)
      .in('list_id', listIds)
      .in('vocabulary_id', vocabularyIds),
  )
  if (linksError) throw linksError
  const dueByList = tallyDueByList(links)
  for (const [listId, count] of dueByList) {
    const bucket = stats.get(listId)
    if (bucket) bucket.due = count
  }
  return stats
}

async function serializeList(row, stats = null, tags = []) {
  const boundKind = row.bound_kind || null
  const boundRef = row.bound_ref || null
  const themeKeys = Array.isArray(row.theme_keys)
    ? row.theme_keys.filter((item) => typeof item === 'string' && item.trim())
    : []
  return {
    id: row.id,
    title: row.title,
    description: row.description || null,
    source: row.source,
    system_key: row.system_key || null,
    collection_id: row.collection_id || null,
    language: row.language,
    bound_kind: boundKind,
    bound_ref: boundRef,
    bound_origin: row.bound_origin || null,
    bound_label: row.bound_label || null,
    theme_keys: themeKeys,
    binding: boundKind && boundRef
      ? {
        kind: boundKind,
        ref: boundRef,
        origin: row.bound_origin || null,
        label: row.bound_label || null,
      }
      : null,
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

    // Дозаполнение наборов и sense-sync не блокируют каталог: слова читаются при открытии списка.
    ensureUserVocabularySenses({ supabase, userId, language }).catch((error) => {
      console.error('[api/vocabulary/lists] background sense sync failed', error?.message || error)
    })
    ensureDemoLists({ supabase, safeSupabaseCall, userId, language }).catch((error) => {
      console.error('[api/vocabulary/lists] background demo fill failed', error?.message || error?.code || error)
    })

    const q = typeof req.query?.q === 'string' ? req.query.q.trim().toLowerCase() : ''
    const boundKindFilter = typeof req.query?.bound_kind === 'string' ? req.query.bound_kind.trim() : ''
    const boundRefFilter = typeof req.query?.bound_ref === 'string' ? req.query.bound_ref.trim() : ''
    if (boundKindFilter && !BOUND_KINDS.has(boundKindFilter)) {
      res.status(400).json({ error: 'Некорректный bound_kind' })
      return
    }

    let lists
    try {
      const loadLists = (fields) => {
        let query = supabase
          .from('vocab_lists')
          .select(fields)
          .eq('user_id', userId)
          .eq('language', language)
          .order('updated_at', { ascending: false })
        if (boundKindFilter) query = query.eq('bound_kind', boundKindFilter)
        if (boundRefFilter) query = query.eq('bound_ref', boundRefFilter)
        return safeSupabaseCall(() => query)
      }
      let result = await loadLists(`${LIST_ROW_FIELDS}, vocab_list_items(count)`)
      if (result?.error) {
        result = await loadLists(LIST_ROW_FIELDS)
      }
      if (result?.error) throw result.error
      lists = result?.data || []
    } catch (error) {
      console.error('[api/vocabulary/lists] failed to load lists')
      res.status(500).json({
        error: isMissingRelation(error) ? 'Списки ещё не включены в базе' : 'Failed to load lists',
      })
      return
    }

    if (q) {
      lists = lists.filter((row) => {
        const title = String(row.title || '').toLowerCase()
        const label = String(row.bound_label || '').toLowerCase()
        return title.includes(q) || label.includes(q)
      })
    }

    let statsByList = new Map()
    try {
      statsByList = await loadLibraryCounters({
        supabase,
        safeSupabaseCall,
        userId,
        lists,
      })
    } catch (error) {
      console.error('[api/vocabulary/lists] failed to load list stats', error?.message || error)
      statsByList = new Map(lists.map((row) => [row.id, emptyListStats()]))
    }

    const serialized = []
    let libraryDue = 0
    let libraryMastered = 0
    for (const row of lists) {
      const stats = statsByList.get(row.id) || emptyListStats()
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

    let binding
    let themeInput
    try {
      binding = parseListBindingInput(req.body)
      themeInput = parseThemeKeysInput(req.body)
    } catch (error) {
      res.status(error?.status || 400).json({ error: error.message || 'Некорректная привязка' })
      return
    }

    const sourceRaw = typeof req.body?.source === 'string' ? req.body.source.trim() : 'user'
    const source = LIST_SOURCES.has(sourceRaw) && sourceRaw !== 'system' ? sourceRaw : 'user'
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() || null : null
    const reuseBound = req.body?.reuse_bound !== false

    try {
      // Идемпотентность: повторное «создать под сцену» возвращает уже привязанный список.
      if (reuseBound && binding.present && !binding.clear && binding.bound_kind && binding.bound_ref) {
        const { data: existingRows, error: existingError } = await safeSupabaseCall(
          () => supabase
            .from('vocab_lists')
            .select(LIST_ROW_FIELDS)
            .eq('user_id', userId)
            .eq('language', language)
            .eq('bound_kind', binding.bound_kind)
            .eq('bound_ref', binding.bound_ref)
            .order('updated_at', { ascending: false })
            .limit(1),
        )
        if (existingError) throw existingError
        const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows
        if (existing?.id) {
          const stats = await loadListWordStats({ supabase, safeSupabaseCall, userId, listId: existing.id })
          res.status(200).json({ item: await serializeList(existing, stats), created: false, reused: true })
          return
        }
      }

      const inferredThemes = themeInput.present
        ? themeInput.theme_keys
        : inferThemeKeys(title, description || '', binding.present ? binding.bound_label : '')

      const { data, error } = await safeSupabaseCall(
        () => supabase
          .from('vocab_lists')
          .insert({
            user_id: userId,
            language,
            title,
            description,
            source,
            theme_keys: inferredThemes,
            ...(binding.present ? listBindingPatch(binding) : {}),
          })
          .select(LIST_ROW_FIELDS)
          .single(),
      )
      if (error) throw error
      if (!data?.id) throw new Error('empty insert')
      res.status(201).json({
        item: await serializeList(data, { word_count: 0, new: 0, learning: 0, due: 0, mastered: 0 }),
        created: true,
        reused: false,
      })
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
  // Только дозаполняем уже существующие наборы.
  // Не создаём заново удалённые — иначе DELETE выглядит сломанным.
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
    if (!existing?.id) continue
    await fillPackWords({ supabase, safeSupabaseCall, userId, language, pack, listId: existing.id })
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
        .select(LIST_ROW_FIELDS)
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
          .select(LIST_ROW_FIELDS)
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
        .select(LIST_ROW_FIELDS)
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
          gloss_ru: (() => {
            const fromSenses = senseList.map((sense) => sense.gloss_ru).filter(Boolean)
            if (fromSenses.length) return fromSenses.slice(0, 3).join('; ')
            return firstGloss(row.translations)
          })(),
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
      // Только новые и due: оценка non-due в /srs/review даёт 409.
      const nowMs = now().getTime()
      const queueIds = []
      const stateMap = new Map((states || []).map((row) => [row.sense_id, row]))
      for (const senseId of senseIds) {
        const state = stateMap.get(senseId)
        const dueAt = state?.due_at ? new Date(state.due_at).getTime() : 0
        if (!state?.last_reviewed_at || dueAt <= nowMs) queueIds.push(senseId)
      }
      const orderedIds = queueIds.slice(0, 10)
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


async function enrichListWordCard(deps, {
  userId,
  language,
  vocabularyId,
  word,
  gloss,
  phonetic,
  partOfSpeech,
  pinyin,
  force = false,
}) {
  const buildWordLexicon = deps.buildWordLexicon
  if (typeof buildWordLexicon !== 'function' || !vocabularyId || !word) return null

  const { data: cache } = await deps.safeSupabaseCall(
    () => deps.supabase
      .from('word_definitions_cache')
      .select('definitions, example_sentences, phonetic_transcription, pinyin, part_of_speech')
      .eq('word', word)
      .eq('language', language)
      .maybeSingle(),
  )
  const { data: vocabulary } = await deps.safeSupabaseCall(
    () => deps.supabase
      .from('user_vocabulary')
      .select('id, word, translations, part_of_speech, pinyin')
      .eq('id', vocabularyId)
      .eq('user_id', userId)
      .maybeSingle(),
  )
  if (!force && !lexiconNeedsEnrichment(cache, vocabulary)) return null

  const lexicon = await buildWordLexicon({
    word,
    language,
    userId,
    seedGloss: gloss || firstGloss(vocabulary?.translations),
    phonetic: phonetic || cache?.phonetic_transcription || null,
    pinyin: pinyin || vocabulary?.pinyin || cache?.pinyin || null,
    partOfSpeech: partOfSpeech || vocabulary?.part_of_speech || cache?.part_of_speech || null,
  })
  if (!lexicon) return null

  await persistWordLexicon(deps, { language, lexicon })
  await applyLexiconToVocabulary(deps, {
    userId,
    language,
    vocabularyId,
    lexicon,
    ensureUserVocabularySenses,
  })
  return lexicon
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
  lite = false,
  position: fixedPosition = null,
  stepKey = null,
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

  if (!lite && (phonetic || pinyin)) {
    await cachePhonetic(deps, {
      language,
      word,
      phonetic: typeof phonetic === 'string' ? phonetic.trim() : null,
      pinyin: typeof pinyin === 'string' ? pinyin.trim() : null,
      partOfSpeech,
      gloss,
    })
  }

  if (!lite) {
    await ensureUserVocabularySenses({ supabase: deps.supabase, userId, language })
  }

  const { data: existingLink } = await deps.safeSupabaseCall(
    () => deps.supabase
      .from('vocab_list_items')
      .select('vocabulary_id')
      .eq('user_id', userId)
      .eq('list_id', listId)
      .eq('vocabulary_id', vocabularyId)
      .maybeSingle(),
  )
  const alreadyLinked = Boolean(existingLink?.vocabulary_id)
  if (!alreadyLinked) {
    let position = Number.isInteger(fixedPosition) ? fixedPosition : 0
    if (!Number.isInteger(fixedPosition)) {
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
      position = Number.isInteger(lastItem?.position) ? lastItem.position + 1 : 0
    }
    const { error: linkError } = await deps.safeSupabaseCall(
      () => deps.supabase
        .from('vocab_list_items')
        .insert({
          list_id: listId,
          user_id: userId,
          vocabulary_id: vocabularyId,
          position,
          ...(stepKey ? { step_key: String(stepKey).slice(0, 160) } : {}),
        }),
    )
    if (linkError && errorCode(linkError) === '42703' && stepKey) {
      const { error: retryError } = await deps.safeSupabaseCall(
        () => deps.supabase
          .from('vocab_list_items')
          .insert({
            list_id: listId,
            user_id: userId,
            vocabulary_id: vocabularyId,
            position,
          }),
      )
      if (retryError && errorCode(retryError) !== '23505') throw retryError
    } else if (linkError && errorCode(linkError) !== '23505') throw linkError
  }

  let senses = null
  if (!alreadyLinked && !lite) {
    try {
      const lexicon = await enrichListWordCard(deps, {
        userId,
        language,
        vocabularyId,
        word,
        gloss,
        phonetic,
        partOfSpeech,
        pinyin,
        force: true,
      })
      senses = lexicon?.senses?.map((sense) => sense.gloss) || null
    } catch (error) {
      if (error?.status === 402) throw error
      console.error('[vocab-word-card] enrich failed', error?.message || error)
    }
  }

  return {
    already: alreadyLinked,
    vocabulary_id: vocabularyId,
    word,
    gloss,
    senses,
  }
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
      const result = await addWordToList(deps, {
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
      if (error?.status === 400 || error?.status === 402) {
        res.status(error.status).json({ error: error.message })
        return
      }
      console.error('[api/vocabulary/lists/words] failed', error?.message || error?.code || error)
      res.status(500).json({ error: 'Не удалось добавить слово' })
    }
  }
}

export function createListWordCardHandler(deps) {
  const { supabase, safeSupabaseCall = (fn) => fn() } = deps
  return async function listWordCardHandler(req, res) {
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
      const { data: link } = await safeSupabaseCall(
        () => supabase
          .from('vocab_list_items')
          .select('vocabulary_id')
          .eq('user_id', userId)
          .eq('list_id', listId)
          .eq('vocabulary_id', vocabularyId)
          .maybeSingle(),
      )
      if (!link?.vocabulary_id) {
        res.status(404).json({ error: 'Слова нет в списке' })
        return
      }

      const { data: vocabulary, error: vocabError } = await safeSupabaseCall(
        () => supabase
          .from('user_vocabulary')
          .select('id, word, translations, part_of_speech, pinyin, contexts, difficulty_level')
          .eq('id', vocabularyId)
          .eq('user_id', userId)
          .maybeSingle(),
      )
      if (vocabError) throw vocabError
      if (!vocabulary) {
        res.status(404).json({ error: 'Слово не найдено' })
        return
      }

      let lexicon = null
      try {
        lexicon = await enrichListWordCard(deps, {
          userId,
          language,
          vocabularyId,
          word: vocabulary.word,
          gloss: firstGloss(vocabulary.translations),
          phonetic: null,
          partOfSpeech: vocabulary.part_of_speech,
          pinyin: vocabulary.pinyin,
          force: false,
        })
      } catch (error) {
        if (error?.status === 402) {
          res.status(402).json({ error: error.message })
          return
        }
        console.error('[api/vocabulary/lists/word-card] enrich failed', error?.message || error)
      }

      const { data: senses } = await safeSupabaseCall(
        () => supabase
          .from('vocab_senses')
          .select('id, gloss_ru, part_of_speech, context_text')
          .eq('user_id', userId)
          .eq('vocabulary_id', vocabularyId)
          .order('created_at', { ascending: true }),
      )
      const { data: cache } = await safeSupabaseCall(
        () => supabase
          .from('word_definitions_cache')
          .select('definitions, example_sentences, phonetic_transcription, pinyin, part_of_speech, difficulty_level')
          .eq('word', vocabulary.word)
          .eq('language', language)
          .maybeSingle(),
      )
      const { data: freshVocab } = await safeSupabaseCall(
        () => supabase
          .from('user_vocabulary')
          .select('id, word, translations, part_of_speech, pinyin, contexts, difficulty_level')
          .eq('id', vocabularyId)
          .eq('user_id', userId)
          .maybeSingle(),
      )

      res.status(200).json({
        card: buildWordCardPayload({
          vocabulary: freshVocab || vocabulary,
          senses: senses || [],
          cache,
          lexicon,
        }),
      })
    } catch (error) {
      console.error('[api/vocabulary/lists/word-card] failed', error?.message || error)
      res.status(500).json({ error: 'Не получилось открыть слово' })
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
        const result = await addWordToList(deps, {
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
      if (error?.status === 400 || error?.status === 402) {
        res.status(error.status).json({ error: error.message })
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
    if (!UUID_RE.test(listId)) {
      res.status(400).json({ error: 'Invalid list id' })
      return
    }

    const hasTitle = typeof req.body?.title === 'string'
    const title = hasTitle ? req.body.title.trim() : ''
    if (hasTitle && (!title || title.length > TITLE_MAX)) {
      res.status(400).json({ error: 'Нужно название списка' })
      return
    }

    let binding
    let themeInput
    try {
      binding = parseListBindingInput(req.body || {})
      themeInput = parseThemeKeysInput(req.body || {})
    } catch (error) {
      res.status(error?.status || 400).json({ error: error.message || 'Некорректная привязка' })
      return
    }

    const hasDescription = typeof req.body?.description === 'string'
    if (!hasTitle && !hasDescription && !binding.present && !themeInput.present) {
      res.status(400).json({ error: 'Нет полей для обновления' })
      return
    }

    const nextTitle = hasTitle ? title : null
    const nextDescription = hasDescription ? (req.body.description.trim() || null) : null
    const themeKeys = themeInput.present
      ? themeInput.theme_keys
      : (binding.present && !binding.clear
        ? inferThemeKeys(
          nextTitle || '',
          nextDescription || '',
          binding.bound_label || '',
        )
        : null)

    const patch = {
      updated_at: new Date().toISOString(),
      ...(hasTitle ? { title } : {}),
      ...(hasDescription ? { description: nextDescription } : {}),
      ...(binding.present ? listBindingPatch(binding) : {}),
      ...(themeKeys ? { theme_keys: themeKeys } : {}),
      ...(binding.present && binding.clear ? { theme_keys: [] } : {}),
    }

    try {
      const { data, error } = await safeSupabaseCall(
        () => supabase
          .from('vocab_lists')
          .update(patch)
          .eq('user_id', userId)
          .eq('language', language)
          .eq('id', listId)
          .select(LIST_ROW_FIELDS)
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

async function clearListItems(deps, { userId, listId }) {
  const { error } = await deps.safeSupabaseCall(
    () => deps.supabase
      .from('vocab_list_items')
      .delete()
      .eq('user_id', userId)
      .eq('list_id', listId),
  )
  if (error) throw error
}

async function fillListWithGeneratedEntries(deps, { userId, language, listId, entries }) {
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
  const start = Number.isInteger(lastItem?.position) ? lastItem.position + 1 : 0
  const settled = await Promise.all((entries || []).map((entry, index) => (
    addWordToList(deps, {
      userId,
      language,
      listId,
      word: entry.word,
      gloss: entry.gloss,
      phonetic: entry.phonetic,
      part_of_speech: entry.part_of_speech,
      pinyin: entry.pinyin,
      lite: true,
      position: start + index,
      stepKey: entry.step || null,
    }).catch((error) => {
      if (error?.status === 402) throw error
      console.error('[vocab-lists] skip generated word', entry?.word, error?.message || error)
      return null
    })
  )))
  ensureUserVocabularySenses({ supabase: deps.supabase, userId, language }).catch((error) => {
    console.error('[vocab-lists] sense sync after generate failed', error?.message || error)
  })
  return settled.filter((result) => result && !result.already).length
}

function defaultBoundListTitle(binding, mode) {
  if (binding?.bound_label) {
    if (mode === 'debate') return `К дебату: ${binding.bound_label}`.slice(0, 120)
    if (mode === 'chat') return 'Слова для свободного диалога'
    return `К сцене: ${binding.bound_label}`.slice(0, 120)
  }
  return mode === 'debate' ? 'Слова для дебата' : mode === 'chat' ? 'Слова для разговора' : 'Слова для сцены'
}

export function createGenerateBoundListHandler(deps) {
  const { supabase, safeSupabaseCall = (fn) => fn() } = deps
  const generateBoundListEntries = deps.generateBoundListEntries || (
    typeof deps.billableChatCreate === 'function'
      ? createGenerateBoundListEntries({ billableChatCreate: deps.billableChatCreate })
      : null
  )
  return async function generateBoundListHandler(req, res) {
    const userId = await requireUser(deps, req, res)
    if (!userId) return
    const language = await requireLanguage(deps, userId, res)
    if (!language) return
    if (typeof generateBoundListEntries !== 'function') {
      res.status(501).json({ error: 'Генерация списка недоступна' })
      return
    }

    let binding
    try {
      binding = parseListBindingInput(req.body || {})
    } catch (error) {
      res.status(error?.status || 400).json({ error: error.message || 'Некорректная привязка' })
      return
    }
    if (!binding.present || binding.clear || !binding.bound_kind || !binding.bound_ref) {
      res.status(400).json({ error: 'Нужна привязка к сцене, дебату или чату' })
      return
    }

    // D4: ZH не генерирует debate-списки
    let mode = binding.bound_kind === 'debate' ? 'debate' : binding.bound_kind === 'chat' ? 'chat' : 'roleplay'
    if (language === 'zh' && mode === 'debate') {
      res.status(400).json({ error: 'Для китайского дебаты недоступны — выбери сцену или свободный диалог' })
      return
    }
    const forceNew = req.body?.force_new === true
    const replaceExisting = req.body?.replace_existing === true
    const confirm = req.body?.confirm === true
    const previewOnly = req.body?.preview === true || (!confirm && req.body?.preview !== false && !req.body?.items)
    const level = typeof req.body?.level === 'string' ? req.body.level.trim() : ''
    const themeText = typeof req.body?.theme_text === 'string' ? req.body.theme_text.trim() : ''
    const goal = typeof req.body?.goal === 'string' ? req.body.goal.trim() : ''
    const topic = typeof req.body?.topic === 'string' ? req.body.topic.trim() : ''
    const steps = Array.isArray(req.body?.steps)
      ? req.body.steps.filter((item) => typeof item === 'string').join('\n')
      : (typeof req.body?.steps === 'string' ? req.body.steps.trim() : '')
    const titleHint = typeof req.body?.title === 'string' ? req.body.title.trim() : ''

    try {
      if (!forceNew && !confirm && previewOnly) {
        const { data: existingRows, error: existingError } = await safeSupabaseCall(
          () => supabase
            .from('vocab_lists')
            .select(LIST_ROW_FIELDS)
            .eq('user_id', userId)
            .eq('language', language)
            .eq('bound_kind', binding.bound_kind)
            .eq('bound_ref', binding.bound_ref)
            .order('updated_at', { ascending: false })
            .limit(1),
        )
        if (existingError) throw existingError
        const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows
        if (existing?.id && !replaceExisting) {
          const stats = await loadListWordStats({ supabase, safeSupabaseCall, userId, listId: existing.id })
          if ((stats?.word_count || 0) > 0) {
            res.status(200).json({
              item: await serializeList(existing, stats),
              created: false,
              reused: true,
              regenerated: false,
            })
            return
          }
        }
      }

      let generated
      if (confirm && Array.isArray(req.body?.items)) {
        generated = {
          title: titleHint || defaultBoundListTitle(binding, mode),
          items: normalizeConfirmEntries(req.body.items, language),
          quality: { confirmed: true, count: 0 },
        }
        generated.quality.count = generated.items.length
      } else {
        generated = await generateBoundListEntries({
          userId,
          language,
          mode,
          level,
          title: titleHint || binding.bound_label || '',
          goal,
          topic,
          steps,
          themeText,
          count: 20,
        })
      }

      if (previewOnly && !confirm) {
        res.status(200).json({
          preview: true,
          title: (generated.title || titleHint || defaultBoundListTitle(binding, mode)).slice(0, 120),
          items: generated.items,
          quality: generated.quality || null,
          binding: {
            kind: binding.bound_kind,
            ref: binding.bound_ref,
            origin: binding.bound_origin,
            label: binding.bound_label,
          },
          billed: true,
        })
        return
      }

      const listTitle = (generated.title || titleHint || defaultBoundListTitle(binding, mode)).slice(0, 120)
      const themeKeys = inferThemeKeys(listTitle, binding.bound_label || '', themeText, topic, goal)

      let listRow = null
      let created = false
      let regenerated = false

      if (replaceExisting && !forceNew) {
        const { data: existingRows } = await safeSupabaseCall(
          () => supabase
            .from('vocab_lists')
            .select(LIST_ROW_FIELDS)
            .eq('user_id', userId)
            .eq('language', language)
            .eq('bound_kind', binding.bound_kind)
            .eq('bound_ref', binding.bound_ref)
            .order('updated_at', { ascending: false })
            .limit(1),
        )
        const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows
        if (existing?.id) {
          await clearListItems({ supabase, safeSupabaseCall }, { userId, listId: existing.id })
          const { data: updated, error: updateError } = await safeSupabaseCall(
            () => supabase
              .from('vocab_lists')
              .update({
                title: listTitle,
                source: 'ai',
                theme_keys: themeKeys,
                ...listBindingPatch(binding),
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id)
              .eq('user_id', userId)
              .select(LIST_ROW_FIELDS)
              .maybeSingle(),
          )
          if (updateError) throw updateError
          listRow = updated
          regenerated = true
        }
      }

      if (!listRow) {
        const { data: inserted, error: insertError } = await safeSupabaseCall(
          () => supabase
            .from('vocab_lists')
            .insert({
              user_id: userId,
              language,
              title: listTitle,
              description: null,
              source: 'ai',
              theme_keys: themeKeys,
              ...listBindingPatch(binding),
            })
            .select(LIST_ROW_FIELDS)
            .single(),
        )
        if (insertError) throw insertError
        listRow = inserted
        created = true
      }

      const added = await fillListWithGeneratedEntries(deps, {
        userId,
        language,
        listId: listRow.id,
        entries: generated.items,
      })
      if (added < 1) {
        if (created) {
          await safeSupabaseCall(
            () => supabase.from('vocab_lists').delete().eq('id', listRow.id).eq('user_id', userId),
          )
        }
        res.status(422).json({ error: 'Не удалось сохранить сгенерированные слова' })
        return
      }

      const stats = await loadListWordStats({ supabase, safeSupabaseCall, userId, listId: listRow.id })
      const { data: fresh } = await safeSupabaseCall(
        () => supabase.from('vocab_lists').select(LIST_ROW_FIELDS).eq('id', listRow.id).maybeSingle(),
      )
      res.status(created ? 201 : 200).json({
        item: await serializeList(fresh || listRow, stats),
        created,
        reused: false,
        regenerated,
        added,
        quality: generated.quality || null,
      })
    } catch (error) {
      if (error?.status === 402 || error?.status === 422) {
        res.status(error.status).json({ error: error.message })
        return
      }
      console.error('[api/vocabulary/lists/generate-for-context] failed', error?.message || error)
      res.status(500).json({ error: listWriteError(error) })
    }
  }
}

export function createRegenerateListHandler(deps) {
  const { supabase, safeSupabaseCall = (fn) => fn() } = deps
  const generateBoundListEntries = deps.generateBoundListEntries || (
    typeof deps.billableChatCreate === 'function'
      ? createGenerateBoundListEntries({ billableChatCreate: deps.billableChatCreate })
      : null
  )
  return async function regenerateListHandler(req, res) {
    const userId = await requireUser(deps, req, res)
    if (!userId) return
    const language = await requireLanguage(deps, userId, res)
    if (!language) return
    const listId = typeof req.params?.id === 'string' ? req.params.id.trim() : ''
    if (!UUID_RE.test(listId)) {
      res.status(400).json({ error: 'Invalid list id' })
      return
    }
    if (typeof generateBoundListEntries !== 'function') {
      res.status(501).json({ error: 'Генерация списка недоступна' })
      return
    }

    const mode = req.body?.mode === 'new' ? 'new' : 'replace'
    try {
      const { data: list, error: listError } = await safeSupabaseCall(
        () => supabase
          .from('vocab_lists')
          .select(LIST_ROW_FIELDS)
          .eq('id', listId)
          .eq('user_id', userId)
          .eq('language', language)
          .maybeSingle(),
      )
      if (listError) throw listError
      if (!list) {
        res.status(404).json({ error: 'Список не найден' })
        return
      }
      if (!list.bound_kind || !list.bound_ref) {
        res.status(409).json({ error: 'Пересборка доступна для списков с привязкой к сцене, дебату или чату' })
        return
      }
      if (language === 'zh' && list.bound_kind === 'debate') {
        res.status(400).json({ error: 'Для китайского дебаты недоступны' })
        return
      }

      const practiceMode = list.bound_kind === 'debate' ? 'debate' : list.bound_kind === 'chat' ? 'chat' : 'roleplay'
      const confirm = req.body?.confirm === true
      const previewOnly = req.body?.preview === true || (!confirm && req.body?.preview !== false && !req.body?.items)

      let generated
      if (confirm && Array.isArray(req.body?.items)) {
        generated = {
          title: typeof req.body?.title === 'string' ? req.body.title.trim() : list.title,
          items: normalizeConfirmEntries(req.body.items, language),
          quality: { confirmed: true },
        }
      } else {
        generated = await generateBoundListEntries({
          userId,
          language,
          mode: practiceMode,
          level: typeof req.body?.level === 'string' ? req.body.level.trim() : '',
          title: list.bound_label || list.title,
          goal: typeof req.body?.goal === 'string' ? req.body.goal.trim() : '',
          topic: typeof req.body?.topic === 'string' ? req.body.topic.trim() : (list.bound_label || ''),
          steps: Array.isArray(req.body?.steps)
            ? req.body.steps.filter((item) => typeof item === 'string').join('\n')
            : (typeof req.body?.steps === 'string' ? req.body.steps.trim() : ''),
          themeText: typeof req.body?.theme_text === 'string' ? req.body.theme_text.trim() : '',
          count: 20,
        })
      }

      if (previewOnly && !confirm) {
        res.status(200).json({
          preview: true,
          title: (generated.title || list.title || defaultBoundListTitle({
            bound_label: list.bound_label,
          }, practiceMode)).slice(0, 120),
          items: generated.items,
          quality: generated.quality || null,
          list_id: list.id,
          billed: true,
        })
        return
      }

      const listTitle = (generated.title || list.title || defaultBoundListTitle({
        bound_label: list.bound_label,
      }, practiceMode)).slice(0, 120)
      const themeKeys = inferThemeKeys(listTitle, list.bound_label || '', list.title || '')

      let targetList = list
      let created = false
      if (mode === 'new') {
        const { data: inserted, error: insertError } = await safeSupabaseCall(
          () => supabase
            .from('vocab_lists')
            .insert({
              user_id: userId,
              language,
              title: listTitle,
              source: 'ai',
              theme_keys: themeKeys,
              bound_kind: list.bound_kind,
              bound_ref: list.bound_ref,
              bound_origin: list.bound_origin,
              bound_label: list.bound_label,
            })
            .select(LIST_ROW_FIELDS)
            .single(),
        )
        if (insertError) throw insertError
        targetList = inserted
        created = true
      } else {
        await clearListItems({ supabase, safeSupabaseCall }, { userId, listId: list.id })
        const { data: updated, error: updateError } = await safeSupabaseCall(
          () => supabase
            .from('vocab_lists')
            .update({
              title: listTitle,
              source: list.source === 'system' ? list.source : 'ai',
              theme_keys: themeKeys,
              updated_at: new Date().toISOString(),
            })
            .eq('id', list.id)
            .eq('user_id', userId)
            .select(LIST_ROW_FIELDS)
            .maybeSingle(),
        )
        if (updateError) throw updateError
        targetList = updated || list
      }

      const added = await fillListWithGeneratedEntries(deps, {
        userId,
        language,
        listId: targetList.id,
        entries: generated.items,
      })
      if (added < 1) {
        res.status(422).json({ error: 'Не удалось сохранить сгенерированные слова' })
        return
      }
      const stats = await loadListWordStats({ supabase, safeSupabaseCall, userId, listId: targetList.id })
      res.status(created ? 201 : 200).json({
        item: await serializeList(targetList, stats),
        created,
        regenerated: !created,
        mode,
        added,
        quality: generated.quality || null,
      })
    } catch (error) {
      if (error?.status === 402 || error?.status === 422) {
        res.status(error.status).json({ error: error.message })
        return
      }
      console.error('[api/vocabulary/lists/regenerate] failed', error?.message || error)
      res.status(500).json({ error: 'Не удалось пересобрать список' })
    }
  }
}

export function createSessionPicksHandler(deps) {
  const { supabase, safeSupabaseCall = (fn) => fn(), now = () => new Date() } = deps
  return async function sessionPicksHandler(req, res) {
    const userId = await requireUser(deps, req, res)
    if (!userId) return
    const language = await requireLanguage(deps, userId, res)
    if (!language) return
    const listId = typeof req.params?.id === 'string' ? req.params.id.trim() : ''
    if (!UUID_RE.test(listId)) {
      res.status(400).json({ error: 'Invalid list id' })
      return
    }
    const limitRaw = Number(req.body?.limit)
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(5, Math.floor(limitRaw))) : 5
    const exclude = new Set(
      (Array.isArray(req.body?.exclude_sense_ids) ? req.body.exclude_sense_ids : [])
        .filter((id) => typeof id === 'string' && UUID_RE.test(id.trim()))
        .map((id) => id.trim()),
    )
    const currentStep = typeof req.body?.current_step === 'string' ? req.body.current_step.trim() : ''
    const sceneText = currentStep || [
      typeof req.body?.theme_text === 'string' ? req.body.theme_text : '',
      typeof req.body?.scene_text === 'string' ? req.body.scene_text : '',
    ].filter(Boolean).join(' ')

    try {
      const list = await loadOwnedList({ supabase, safeSupabaseCall }, { userId, language, listId })
      if (!list) {
        res.status(404).json({ error: 'Список не найден' })
        return
      }

      let itemsResult = await safeSupabaseCall(
        () => supabase
          .from('vocab_list_items')
          .select('vocabulary_id, position, step_key')
          .eq('user_id', userId)
          .eq('list_id', listId)
          .order('position', { ascending: true }),
      )
      if (itemsResult?.error && (itemsResult.error.code === '42703' || /step_key/.test(itemsResult.error.message || ''))) {
        itemsResult = await safeSupabaseCall(
          () => supabase
            .from('vocab_list_items')
            .select('vocabulary_id, position')
            .eq('user_id', userId)
            .eq('list_id', listId)
            .order('position', { ascending: true }),
        )
      }
      if (itemsResult?.error) throw itemsResult.error
      const items = itemsResult?.data || []
      const vocabularyIds = (items || []).map((row) => row.vocabulary_id).filter(Boolean)
      if (!vocabularyIds.length) {
        res.status(200).json({ items: [], list_id: listId, reason: '' })
        return
      }

      const { data: vocabRows, error: vocabError } = await safeSupabaseCall(
        () => supabase
          .from('user_vocabulary')
          .select('id, word')
          .eq('user_id', userId)
          .in('id', vocabularyIds),
      )
      if (vocabError) throw vocabError
      const vocabById = new Map((vocabRows || []).map((row) => [row.id, row]))

      const { data: senses, error: sensesError } = await safeSupabaseCall(
        () => supabase
          .from('vocab_senses')
          .select('id, vocabulary_id, gloss_ru, headword')
          .eq('user_id', userId)
          .in('vocabulary_id', vocabularyIds),
      )
      if (sensesError) throw sensesError
      const senseIds = (senses || []).map((row) => row.id)
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

      const stepByVocab = new Map((items || []).map((row) => [row.vocabulary_id, row.step_key || '']))
      const candidates = []
      for (const sense of senses || []) {
        const vocab = vocabById.get(sense.vocabulary_id)
        const headword = (sense.headword || vocab?.word || '').trim()
        const glossRu = (sense.gloss_ru || '').trim()
        if (!headword || !glossRu) continue
        candidates.push({
          senseId: sense.id,
          headword,
          glossRu,
          stepKey: stepByVocab.get(sense.vocabulary_id) || '',
          status: classifyRecognitionState(statesBySense.get(sense.id), now()),
        })
      }

      const themeHay = [sceneText, list.bound_label, ...(Array.isArray(list.theme_keys) ? list.theme_keys : [])]
        .filter(Boolean)
        .join(' ')
      const picked = pickSessionCandidates(candidates, {
        limit,
        sceneText: currentStep || themeHay,
        currentStep,
        excludeSenseIds: exclude,
      })

      res.status(200).json({
        list_id: listId,
        reason: picked.reason,
        items: picked.items.map((item) => ({
          sense_id: item.senseId,
          headword: item.headword,
          gloss_ru: item.glossRu,
          status: item.status,
          pick_reason: item.pickReason,
        })),
      })
    } catch (error) {
      console.error('[api/vocabulary/lists/session-picks] failed', error?.message || error)
      res.status(500).json({ error: 'Не удалось подобрать слова для сессии' })
    }
  }
}

export function createCourseModulesHandler(deps) {
  const { supabase, safeSupabaseCall = (fn) => fn(), now = () => new Date() } = deps
  return async function courseModulesHandler(req, res) {
    const userId = await requireUser(deps, req, res)
    if (!userId) return
    const language = await requireLanguage(deps, userId, res)
    if (!language) return

    try {
      const { data: lists, error: listsError } = await safeSupabaseCall(
        () => supabase
          .from('vocab_lists')
          .select('id, title, source, bound_kind, bound_ref, bound_origin, bound_label, theme_keys, updated_at')
          .eq('user_id', userId)
          .eq('language', language)
          .not('bound_kind', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(24),
      )
      if (listsError) throw listsError
      const boundLists = (lists || []).filter((row) => row.bound_kind && row.bound_ref)
      if (!boundLists.length) {
        res.status(200).json({ items: [] })
        return
      }

      const listIds = boundLists.map((row) => row.id)
      const statsByList = await loadAllListWordStats({
        supabase,
        safeSupabaseCall,
        userId,
        listIds,
        now: now(),
      })

      const since30 = new Date(now().getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const since7 = new Date(now().getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

      const { data: sessions, error: sessionsError } = await safeSupabaseCall(
        () => supabase
          .from('vocab_dialogue_sessions')
          .select('id, list_id, status, created_at, assessed_at')
          .eq('user_id', userId)
          .eq('language', language)
          .in('list_id', listIds)
          .gte('created_at', since30)
          .order('created_at', { ascending: false })
          .limit(120),
      )
      if (sessionsError) throw sessionsError

      const sessionsByList = new Map()
      for (const session of sessions || []) {
        if (!session.list_id) continue
        if (!sessionsByList.has(session.list_id)) sessionsByList.set(session.list_id, [])
        sessionsByList.get(session.list_id).push(session)
      }

      const sessionIds = (sessions || []).map((row) => row.id)
      let targets = []
      let turnsBySession = new Map()
      let hintsBySession = new Map()
      if (sessionIds.length) {
        const [targetsResult, turnsResult, hintsResult] = await Promise.all([
          safeSupabaseCall(
            () => supabase
              .from('vocab_dialogue_targets')
              .select('dialogue_session_id, sense_id, headword, gloss_ru')
              .eq('user_id', userId)
              .in('dialogue_session_id', sessionIds),
          ),
          safeSupabaseCall(
            () => supabase
              .from('vocab_dialogue_turns')
              .select('dialogue_session_id, turn_index, role, content')
              .eq('user_id', userId)
              .in('dialogue_session_id', sessionIds),
          ),
          safeSupabaseCall(
            () => supabase
              .from('vocab_dialogue_hints')
              .select('dialogue_session_id, turn_index, hint_text')
              .eq('user_id', userId)
              .in('dialogue_session_id', sessionIds),
          ),
        ])
        if (targetsResult.error) throw targetsResult.error
        if (turnsResult.error) throw turnsResult.error
        if (hintsResult.error) throw hintsResult.error
        targets = targetsResult.data || []
        turnsBySession = (turnsResult.data || []).reduce((map, row) => {
          if (!map.has(row.dialogue_session_id)) map.set(row.dialogue_session_id, [])
          map.get(row.dialogue_session_id).push(row)
          return map
        }, new Map())
        hintsBySession = (hintsResult.data || []).reduce((map, row) => {
          if (!map.has(row.dialogue_session_id)) map.set(row.dialogue_session_id, [])
          map.get(row.dialogue_session_id).push(row)
          return map
        }, new Map())
      }

      const classify = typeof deps.classifyTargets === 'function' ? deps.classifyTargets : null
      const toCourse = typeof deps.buildCourseItems === 'function' ? deps.buildCourseItems : null
      const senseStats = new Map()
      const courseBySession = new Map()
      const targetsBySession = targets.reduce((map, row) => {
        if (!map.has(row.dialogue_session_id)) map.set(row.dialogue_session_id, [])
        map.get(row.dialogue_session_id).push(row)
        return map
      }, new Map())

      for (const session of sessions || []) {
        const sessionTargets = targetsBySession.get(session.id) || []
        let courseItems = sessionTargets.map((target) => ({
          sense_id: target.sense_id,
          headword: target.headword,
          gloss_ru: target.gloss_ru,
          status: session.status === 'active' ? 'waiting' : 'missed',
          verdict: 'unused',
        }))
        if (classify && toCourse && sessionTargets.length) {
          const classified = classify({
            targets: sessionTargets,
            turns: turnsBySession.get(session.id) || [],
            hints: hintsBySession.get(session.id) || [],
          })
          courseItems = toCourse(sessionTargets, classified, session.status)
        }
        courseBySession.set(session.id, courseItems)
        for (const item of courseItems) {
          const key = item.sense_id
          if (!senseStats.has(key)) {
            senseStats.set(key, {
              sense_id: key,
              headword: item.headword,
              gloss_ru: item.gloss_ru,
              appearances: 0,
              produced: 0,
              hinted: 0,
              missed: 0,
              list_ids: new Set(),
            })
          }
          const row = senseStats.get(key)
          row.appearances += 1
          if (session.list_id) row.list_ids.add(session.list_id)
          if (item.status === 'used') row.produced += 1
          else if (item.status === 'hinted') row.hinted += 1
          else if (item.status === 'missed') row.missed += 1
        }
      }

      const allSenseIds = [...senseStats.keys()]
      let statesBySense = new Map()
      if (allSenseIds.length) {
        const { data: states, error: statesError } = await safeSupabaseCall(
          () => supabase
            .from('vocab_srs_states')
            .select('sense_id, due_at, interval_days, repetitions, last_reviewed_at')
            .eq('user_id', userId)
            .eq('card_type', 'recognition')
            .in('sense_id', allSenseIds.slice(0, 500)),
        )
        if (statesError) throw statesError
        statesBySense = new Map((states || []).map((row) => [row.sense_id, row]))
      }

      const payload = boundLists.map((list) => {
        const stats = statsByList.get(list.id) || emptyListStats()
        const listSessions = sessionsByList.get(list.id) || []
        const sessions7 = listSessions.filter((row) => row.created_at >= since7).length
        const sessions30 = listSessions.length
        const assessed = listSessions.filter((row) => row.status === 'assessed')
        let hintFree = 0
        for (const session of assessed) {
          const courseItems = courseBySession.get(session.id) || []
          if (!courseItems.length) continue
          if (!courseItems.some((item) => item.status === 'hinted')) hintFree += 1
        }

        const weak = []
        for (const row of senseStats.values()) {
          if (!row.list_ids.has(list.id)) continue
          const status = classifyRecognitionState(statesBySense.get(row.sense_id), now())
          const milestone = classifySenseMilestone({
            status,
            producedCount: row.produced,
            sessionAppearances: row.appearances,
          })
          const weakScore = row.missed * 3 + row.hinted * 2 - row.produced
          if (weakScore <= 0 && status !== 'due') continue
          weak.push({
            sense_id: row.sense_id,
            headword: row.headword,
            gloss_ru: row.gloss_ru,
            status,
            milestone,
            milestone_label: MILESTONE_LABELS[milestone] || milestone,
            missed: row.missed,
            hinted: row.hinted,
            produced: row.produced,
            appearances: row.appearances,
            weak_score: weakScore,
          })
        }
        weak.sort((a, b) => b.weak_score - a.weak_score || b.missed - a.missed)
        const covered = [...senseStats.values()].filter((row) => row.list_ids.has(list.id)).length
        const coveragePct = stats.word_count > 0
          ? Math.min(100, Math.round((covered / stats.word_count) * 100))
          : 0
        const masteredPct = stats.word_count > 0
          ? Math.round((stats.mastered / stats.word_count) * 100)
          : 0
        const recentSessions = listSessions.slice(0, 4).map((session) => {
          const courseItems = courseBySession.get(session.id) || []
          const used = courseItems.filter((item) => item.status === 'used').length
          const hinted = courseItems.filter((item) => item.status === 'hinted').length
          const missed = courseItems.filter((item) => item.status === 'missed').length
          return {
            id: session.id,
            status: session.status,
            created_at: session.created_at,
            assessed_at: session.assessed_at || null,
            used_count: used,
            hinted_count: hinted,
            missed_count: missed,
            target_count: courseItems.length,
            words: courseItems.slice(0, 5).map((item) => ({
              sense_id: item.sense_id,
              headword: item.headword,
              status: item.status,
            })),
          }
        })
        const moduleClear = (stats.due || 0) === 0
          && masteredPct >= 50
          && hintFree >= 3
          && coveragePct >= 40

        return {
          id: list.id,
          title: list.title,
          source: list.source,
          bound_kind: list.bound_kind,
          bound_ref: list.bound_ref,
          bound_origin: list.bound_origin,
          bound_label: list.bound_label,
          theme_keys: Array.isArray(list.theme_keys) ? list.theme_keys : [],
          stats,
          coverage_pct: coveragePct,
          mastered_pct: masteredPct,
          sessions_7d: sessions7,
          sessions_30d: sessions30,
          hint_free_assessed: hintFree,
          assessed_count: assessed.length,
          weak_words: weak.slice(0, 5),
          recent_sessions: recentSessions,
          module_clear: moduleClear,
          last_session_at: listSessions[0]?.created_at || null,
        }
      })

      payload.sort((a, b) => {
        const aTs = a.last_session_at ? Date.parse(a.last_session_at) : 0
        const bTs = b.last_session_at ? Date.parse(b.last_session_at) : 0
        return bTs - aTs || (b.sessions_30d - a.sessions_30d)
      })

      res.status(200).json({ items: payload })
    } catch (error) {
      console.error('[api/vocabulary/lists/course-modules] failed', error?.message || error)
      res.status(500).json({ error: 'Не удалось загрузить модули слов' })
    }
  }
}

export function registerVocabListsRoutes(app, deps) {
  const wrap = deps.asyncHandler || ((fn) => fn)
  const withLexicon = {
    ...deps,
    buildWordLexicon: deps.buildWordLexicon || (
      typeof deps.billableChatCreate === 'function'
        ? createBuildWordLexicon({ billableChatCreate: deps.billableChatCreate })
        : null
    ),
    generateBoundListEntries: deps.generateBoundListEntries || (
      typeof deps.billableChatCreate === 'function'
        ? createGenerateBoundListEntries({ billableChatCreate: deps.billableChatCreate })
        : null
    ),
  }
  app.get('/api/vocabulary/lists', wrap(createListLibraryHandler(withLexicon)))
  app.post('/api/vocabulary/lists', wrap(createEmptyListHandler(withLexicon)))
  app.post('/api/vocabulary/lists/generate-for-context', wrap(createGenerateBoundListHandler(withLexicon)))
  app.get('/api/vocabulary/lists/course-modules', wrap(createCourseModulesHandler(withLexicon)))
  app.post('/api/vocabulary/lists/starter', wrap(createStarterPackHandler(withLexicon)))
  app.patch('/api/vocabulary/lists/:id', wrap(createPatchListHandler(withLexicon)))
  app.delete('/api/vocabulary/lists/:id', wrap(createDeleteListHandler(withLexicon)))
  app.get('/api/vocabulary/lists/:id', wrap(createListDetailHandler(withLexicon)))
  app.post('/api/vocabulary/lists/:id/regenerate', wrap(createRegenerateListHandler(withLexicon)))
  app.post('/api/vocabulary/lists/:id/session-picks', wrap(createSessionPicksHandler(withLexicon)))
  app.get('/api/vocabulary/lists/:id/words/:vocabularyId', wrap(createListWordCardHandler(withLexicon)))
  app.post('/api/vocabulary/lists/:id/words/resolve', wrap(createResolveListWordsHandler(withLexicon)))
  app.post('/api/vocabulary/lists/:id/words/bulk', wrap(createBulkAddListWordsHandler(withLexicon)))
  app.post('/api/vocabulary/lists/:id/words', wrap(createAddListWordHandler(withLexicon)))
  app.delete('/api/vocabulary/lists/:id/words/:vocabularyId', wrap(createRemoveListWordHandler(withLexicon)))
  app.get('/api/vocabulary/lists/:id/listen', wrap(createListListenIdsHandler(withLexicon)))
}
