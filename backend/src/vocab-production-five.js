/**
 * Пятёрка говорения по одному списку.
 * Читает значения и карточки production. Сроки не записывает.
 * Очередь recognition (/api/vocabulary/srs/due) сюда не подключается.
 */
import { ensureUserVocabularySenses } from './vocab-sense-sync.js'

export const PRODUCTION_FIVE_LIMIT = 5

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function reviewedAt(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function dueMs(value) {
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

/**
 * Полка карточки говорения.
 * Нет речи — новое, даже если срок создания уже в прошлом.
 * Речь была и срок наступил — пора сказать.
 * Речь была и срок впереди — только ручной ранний выбор.
 */
export function classifyProductionBucket(state, now) {
  const at = now instanceof Date ? now.getTime() : Number.NaN
  if (!Number.isFinite(at)) throw new TypeError('now must be a valid Date')
  if (!reviewedAt(state?.lastReviewedAt ?? state?.last_reviewed_at)) return 'new'
  const due = dueMs(state?.dueAt ?? state?.due_at)
  if (due == null) return 'early'
  return due <= at ? 'due' : 'early'
}

function candidateKey(raw) {
  const senseId = typeof raw?.senseId === 'string'
    ? raw.senseId
    : typeof raw?.sense_id === 'string'
      ? raw.sense_id
      : ''
  return senseId.trim()
}

function normalizeCandidate(raw) {
  const senseId = candidateKey(raw)
  const headword = typeof raw?.headword === 'string' ? raw.headword.trim() : ''
  const gloss = typeof (raw?.glossRu ?? raw?.gloss_ru) === 'string'
    ? (raw.glossRu ?? raw.gloss_ru).trim()
    : ''
  if (!senseId || !headword || !gloss) return null
  const position = Number.isFinite(Number(raw.position)) ? Number(raw.position) : 0
  const createdAt = typeof (raw.createdAt ?? raw.created_at) === 'string'
    ? (raw.createdAt ?? raw.created_at)
    : ''
  const dueAt = raw.dueAt ?? raw.due_at ?? null
  const lastReviewedAt = raw.lastReviewedAt ?? raw.last_reviewed_at ?? null
  return { senseId, headword, gloss, position, createdAt, dueAt, lastReviewedAt }
}

function compareDue(a, b) {
  const left = dueMs(a.dueAt) ?? Number.POSITIVE_INFINITY
  const right = dueMs(b.dueAt) ?? Number.POSITIVE_INFINITY
  if (left !== right) return left - right
  if (a.position !== b.position) return a.position - b.position
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  return a.senseId < b.senseId ? -1 : a.senseId > b.senseId ? 1 : 0
}

function compareNew(a, b) {
  if (a.position !== b.position) return a.position - b.position
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  return a.senseId < b.senseId ? -1 : a.senseId > b.senseId ? 1 : 0
}

function toItem(row, now) {
  const bucket = classifyProductionBucket(row, now)
  return {
    sense_id: row.senseId,
    headword: row.headword,
    gloss_ru: row.gloss,
    bucket,
    due_at: typeof row.dueAt === 'string' && row.dueAt ? row.dueAt : null,
    moves_schedule: bucket !== 'early',
  }
}

/**
 * Ручные значения идут первыми, не больше пяти, повторы смысла схлопываются.
 * Пустые места добираются из того же набора: сначала пора сказать, затем новые.
 * Смысл с будущим сроком сам не подставляется.
 * @returns {{ items: object[] } | { error: 'missing', senseId: string }}
 */
export function selectProductionFive(candidates, manualIds, now) {
  const byId = new Map()
  for (const raw of Array.isArray(candidates) ? candidates : []) {
    const row = normalizeCandidate(raw)
    if (!row) continue
    const prev = byId.get(row.senseId)
    if (!prev || compareNew(row, prev) < 0) byId.set(row.senseId, row)
  }

  const items = []
  const taken = new Set()
  for (const rawId of Array.isArray(manualIds) ? manualIds : []) {
    if (items.length >= PRODUCTION_FIVE_LIMIT) break
    const senseId = typeof rawId === 'string' ? rawId.trim() : ''
    if (!senseId || taken.has(senseId)) continue
    const row = byId.get(senseId)
    if (!row) return { error: 'missing', senseId }
    taken.add(senseId)
    items.push(toItem(row, now))
  }

  const due = []
  const fresh = []
  for (const row of byId.values()) {
    if (taken.has(row.senseId)) continue
    const bucket = classifyProductionBucket(row, now)
    if (bucket === 'due') due.push(row)
    else if (bucket === 'new') fresh.push(row)
  }
  due.sort(compareDue)
  fresh.sort(compareNew)
  for (const row of [...due, ...fresh]) {
    if (items.length >= PRODUCTION_FIVE_LIMIT) break
    items.push(toItem(row, now))
  }
  return { items }
}

function parseBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Invalid practice body' }
  }
  const listId = typeof body.list_id === 'string' ? body.list_id.trim() : ''
  if (!UUID_RE.test(listId)) return { error: 'Invalid list id' }
  if (body.sense_ids == null) return { listId, senseIds: [] }
  if (!Array.isArray(body.sense_ids)) return { error: 'Invalid sense_ids' }
  const senseIds = []
  const seen = new Set()
  for (const raw of body.sense_ids) {
    const id = typeof raw === 'string' ? raw.trim() : ''
    if (!UUID_RE.test(id)) return { error: 'Invalid sense_ids' }
    if (seen.has(id)) continue
    seen.add(id)
    senseIds.push(id)
    if (senseIds.length === PRODUCTION_FIVE_LIMIT) break
  }
  return { listId, senseIds }
}

async function requireUser(req, res, { getBearerToken, resolveUserId }) {
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
  if (typeof userId !== 'string' || !userId.trim() || userId !== userId.trim()) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return null
  }
  return userId.trim()
}

async function loadLearningLanguage({ supabase, safeSupabaseCall, userId }) {
  const result = await safeSupabaseCall(
    () => supabase
      .from('user_profiles')
      .select('learning_language')
      .eq('user_id', userId)
      .maybeSingle(),
    { timeoutMs: 10000, maxRetries: 1 },
  )
  if (!result || typeof result !== 'object' || result.error) {
    throw new Error('profile read failed')
  }
  const value = result.data?.learning_language
  if (value == null || value === '') return 'en'
  if (value === 'en' || value === 'zh') return value
  throw new Error('invalid learning language')
}

async function readRows(safeSupabaseCall, fn) {
  const result = await safeSupabaseCall(fn, { timeoutMs: 15000, maxRetries: 1 })
  if (!result || typeof result !== 'object' || result.error) {
    throw new Error('read failed')
  }
  if (result.data == null) return []
  if (!Array.isArray(result.data)) throw new Error('invalid rows')
  return result.data
}

export function createProductionFiveHandler({
  supabase,
  resolveUserId,
  getBearerToken,
  safeSupabaseCall = (fn) => fn(),
  ensureSenses = ensureUserVocabularySenses,
  now = () => new Date(),
}) {
  return async function productionFiveHandler(req, res) {
    const userId = await requireUser(req, res, { getBearerToken, resolveUserId })
    if (!userId) return
    const parsed = parseBody(req.body)
    if (parsed.error) {
      res.status(400).json({ error: parsed.error })
      return
    }

    let language
    try {
      language = await loadLearningLanguage({ supabase, safeSupabaseCall, userId })
    } catch {
      console.error('[api/vocabulary/srs/production/five] failed to resolve learning language')
      res.status(500).json({ error: 'Failed to resolve learning language' })
      return
    }

    try {
      await ensureSenses({ supabase, userId, language })
    } catch {
      console.error('[api/vocabulary/srs/production/five] failed to prepare vocabulary senses')
      res.status(500).json({ error: 'Failed to prepare vocabulary senses' })
      return
    }

    try {
      const listResult = await safeSupabaseCall(
        () => supabase
          .from('vocab_lists')
          .select('id, user_id, language')
          .eq('id', parsed.listId)
          .eq('user_id', userId)
          .eq('language', language)
          .maybeSingle(),
        { timeoutMs: 10000, maxRetries: 1 },
      )
      if (!listResult || listResult.error) throw new Error('list read failed')
      const list = listResult.data
      if (!list || list.user_id !== userId || list.language !== language || list.id !== parsed.listId) {
        res.status(404).json({ error: 'List not found' })
        return
      }

      const itemRows = await readRows(
        safeSupabaseCall,
        () => supabase
          .from('vocab_list_items')
          .select('vocabulary_id, position, created_at')
          .eq('user_id', userId)
          .eq('list_id', parsed.listId)
          .order('position', { ascending: true }),
      )
      const positionByVocabulary = new Map()
      for (const row of itemRows) {
        const vocabularyId = typeof row?.vocabulary_id === 'string' ? row.vocabulary_id : ''
        if (!vocabularyId || positionByVocabulary.has(vocabularyId)) continue
        positionByVocabulary.set(vocabularyId, {
          position: Number.isFinite(Number(row.position)) ? Number(row.position) : 0,
          createdAt: typeof row.created_at === 'string' ? row.created_at : '',
        })
      }
      const vocabularyIds = [...positionByVocabulary.keys()]
      if (vocabularyIds.length === 0) {
        if (parsed.senseIds.length > 0) {
          res.status(400).json({ error: 'Practice sense is not in this list' })
          return
        }
        res.status(200).json({
          list_id: parsed.listId,
          limit: PRODUCTION_FIVE_LIMIT,
          count: 0,
          items: [],
        })
        return
      }

      const senseRows = await readRows(
        safeSupabaseCall,
        () => supabase
          .from('vocab_senses')
          .select('id, user_id, language, vocabulary_id, headword, gloss_ru, created_at')
          .eq('user_id', userId)
          .eq('language', language)
          .in('vocabulary_id', vocabularyIds),
      )
      const senses = senseRows.filter((row) => (
        row
        && row.user_id === userId
        && row.language === language
        && positionByVocabulary.has(row.vocabulary_id)
        && typeof row.id === 'string'
      ))
      const senseIds = senses.map((row) => row.id)
      const stateRows = senseIds.length
        ? await readRows(
          safeSupabaseCall,
          () => supabase
            .from('vocab_srs_states')
            .select('sense_id, user_id, card_type, due_at, last_reviewed_at')
            .eq('user_id', userId)
            .eq('card_type', 'production')
            .in('sense_id', senseIds),
        )
        : []
      const stateBySense = new Map()
      for (const row of stateRows) {
        if (!row || row.user_id !== userId || row.card_type !== 'production') continue
        if (typeof row.sense_id !== 'string') continue
        stateBySense.set(row.sense_id, row)
      }

      const candidates = senses.map((sense) => {
        const place = positionByVocabulary.get(sense.vocabulary_id)
        const state = stateBySense.get(sense.id)
        return {
          senseId: sense.id,
          headword: sense.headword,
          glossRu: sense.gloss_ru,
          position: place?.position ?? 0,
          createdAt: typeof sense.created_at === 'string' && sense.created_at
            ? sense.created_at
            : (place?.createdAt || ''),
          dueAt: state?.due_at ?? null,
          lastReviewedAt: state?.last_reviewed_at ?? null,
        }
      })
      const selected = selectProductionFive(candidates, parsed.senseIds, now())
      if (selected.error === 'missing') {
        res.status(400).json({ error: 'Practice sense is not in this list' })
        return
      }
      res.status(200).json({
        list_id: parsed.listId,
        limit: PRODUCTION_FIVE_LIMIT,
        count: selected.items.length,
        items: selected.items,
      })
    } catch {
      console.error('[api/vocabulary/srs/production/five] failed to build practice five')
      res.status(500).json({ error: 'Failed to build practice five' })
    }
  }
}

export function registerProductionFiveRoute(app, deps) {
  const wrap = deps.asyncHandler || ((fn) => fn)
  app.post('/api/vocabulary/srs/production/five', wrap(createProductionFiveHandler(deps)))
}
