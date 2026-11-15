/**
 * Очередь и сохранение оценки recognition.
 * Журнал и состояние пишет только commit_vocab_srs_review.
 */
import { ensureUserVocabularySenses } from './vocab-sense-sync.js'
import { applySm2Review } from './srs.js'

export const RECOGNITION_DUE_LIMIT = 10
export const DUE_STATE_PAGE_SIZE = 40
export const REVIEW_REQUEST_ID_MAX = 200

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const RATING_QUALITY = Object.freeze({
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
})

export function createRecognitionDueHandler({
  supabase,
  resolveUserId,
  getBearerToken,
  safeSupabaseCall = (fn) => fn(),
  ensureSenses = ensureUserVocabularySenses,
  now = () => new Date(),
}) {
  return async function recognitionDueHandler(req, res) {
    const token = getBearerToken(req)
    if (!token) {
      res.status(401).json({ error: 'Missing Authorization Bearer token' })
      return
    }

    let userId
    try {
      userId = await resolveUserId(req)
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }
    if (typeof userId !== 'string' || userId.trim() === '' || userId !== userId.trim()) {
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }

    let language
    try {
      language = await loadLearningLanguage({ supabase, safeSupabaseCall, userId })
    } catch {
      console.error('[api/vocabulary/srs/due] failed to resolve learning language')
      res.status(500).json({ error: 'Failed to resolve learning language' })
      return
    }

    try {
      await ensureSenses({ supabase, userId, language })
    } catch {
      console.error('[api/vocabulary/srs/due] failed to prepare vocabulary senses')
      res.status(500).json({ error: 'Failed to prepare vocabulary senses' })
      return
    }

    let items
    try {
      items = await loadRecognitionQueue({
        supabase,
        safeSupabaseCall,
        userId,
        language,
        now: now(),
      })
    } catch {
      console.error('[api/vocabulary/srs/due] failed to load review queue')
      res.status(500).json({ error: 'Failed to load review queue' })
      return
    }

    res.status(200).json({
      items,
      count: items.length,
      limit: RECOGNITION_DUE_LIMIT,
    })
  }
}

export function registerVocabSrsDueRoute(app, deps) {
  const wrap = deps.asyncHandler || ((fn) => fn)
  app.get('/api/vocabulary/srs/due', wrap(createRecognitionDueHandler(deps)))
  app.post('/api/vocabulary/srs/review', wrap(createRecognitionReviewHandler(deps)))
}

export function createRecognitionReviewHandler({
  supabase,
  resolveUserId,
  getBearerToken,
  safeSupabaseCall = (fn) => fn(),
  now = () => new Date(),
}) {
  return async function recognitionReviewHandler(req, res) {
    const token = getBearerToken(req)
    if (!token) {
      res.status(401).json({ error: 'Missing Authorization Bearer token' })
      return
    }

    let userId
    try {
      userId = await resolveUserId(req)
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }
    if (typeof userId !== 'string' || userId.trim() === '' || userId !== userId.trim()) {
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }

    const parsed = parseReviewBody(req.body)
    if (parsed.error) {
      res.status(400).json({ error: parsed.error })
      return
    }

    const reviewedAt = now()
    let language
    try {
      language = await loadLearningLanguage({ supabase, safeSupabaseCall, userId })
    } catch {
      console.error('[api/vocabulary/srs/review] failed to resolve learning language')
      res.status(500).json({ error: 'Failed to resolve learning language' })
      return
    }

    let requestExists
    try {
      requestExists = await recognitionRequestExists({
        supabase,
        safeSupabaseCall,
        userId,
        requestId: parsed.requestId,
      })
    } catch {
      console.error('[api/vocabulary/srs/review] failed to read review request')
      res.status(500).json({ error: 'Failed to save vocabulary review' })
      return
    }

    let card
    try {
      card = await loadRecognitionCard({
        supabase,
        safeSupabaseCall,
        userId,
        language,
        senseId: parsed.senseId,
      })
    } catch {
      console.error('[api/vocabulary/srs/review] failed to read recognition card')
      res.status(500).json({ error: 'Failed to save vocabulary review' })
      return
    }
    if (!card) {
      res.status(404).json({ error: 'Vocabulary sense was not found' })
      return
    }

    if (!requestExists) {
      const due = classifyDue(card.state.due_at, reviewedAt)
      if (due === 'invalid') {
        console.error('[api/vocabulary/srs/review] recognition card state is unusable')
        res.status(500).json({ error: 'Failed to save vocabulary review' })
        return
      }
      if (due === 'future') {
        res.status(409).json({ error: 'Card is not due yet' })
        return
      }
    }

    let next
    try {
      next = applySm2Review({
        easeFactor: asEase(card.state.ease_factor),
        intervalDays: asInteger(card.state.interval_days),
        repetitions: asInteger(card.state.repetitions),
      }, parsed.quality, reviewedAt)
    } catch {
      console.error('[api/vocabulary/srs/review] recognition card state is unusable')
      res.status(500).json({ error: 'Failed to save vocabulary review' })
      return
    }

    let saved
    try {
      saved = await safeSupabaseCall(
        () => supabase.rpc('commit_vocab_srs_review', {
          p_user_id: userId,
          p_sense_id: parsed.senseId,
          p_language: language,
          p_client_request_id: parsed.requestId,
          p_verdict: parsed.rating,
          p_quality: parsed.quality,
          p_reviewed_at: reviewedAt.toISOString(),
          p_expected_ease: card.state.ease_factor,
          p_expected_interval_days: card.state.interval_days,
          p_expected_repetitions: card.state.repetitions,
          p_expected_lapses: card.state.lapses,
          p_expected_due_at: card.state.due_at,
          p_next_ease: next.easeFactor,
          p_next_interval_days: next.intervalDays,
          p_next_repetitions: next.repetitions,
          p_next_due_at: next.dueAt.toISOString(),
        }),
        { timeoutMs: 15000, maxRetries: 1 }
      )
    } catch {
      console.error('[api/vocabulary/srs/review] failed to commit review')
      res.status(500).json({ error: 'Failed to save vocabulary review' })
      return
    }

    if (!saved || typeof saved !== 'object' || saved.error) {
      console.error('[api/vocabulary/srs/review] failed to commit review')
      res.status(500).json({ error: 'Failed to save vocabulary review' })
      return
    }

    const outcome = saved.data
    if (!outcome || typeof outcome !== 'object' || typeof outcome.status !== 'string') {
      console.error('[api/vocabulary/srs/review] invalid commit response')
      res.status(500).json({ error: 'Failed to save vocabulary review' })
      return
    }

    if (outcome.status === 'applied' || outcome.status === 'replayed') {
      if (!hasSchedule(outcome)) {
        console.error('[api/vocabulary/srs/review] invalid commit response')
        res.status(500).json({ error: 'Failed to save vocabulary review' })
        return
      }
      res.status(200).json({
        status: outcome.status,
        sense_id: parsed.senseId,
        rating: parsed.rating,
        quality: outcome.quality,
        due_at: outcome.due_at,
        interval_days: outcome.interval_days,
        repetitions: outcome.repetitions,
        replayed: outcome.status === 'replayed',
      })
      return
    }

    if (outcome.status === 'conflict') {
      res.status(409).json({ error: 'Review request was already used', status: 'conflict' })
      return
    }
    if (outcome.status === 'stale_state') {
      res.status(409).json({ error: 'Card changed before the review was saved', status: 'stale_state' })
      return
    }
    if (outcome.status === 'not_found') {
      res.status(404).json({ error: 'Vocabulary sense was not found' })
      return
    }

    console.error('[api/vocabulary/srs/review] invalid commit response')
    res.status(500).json({ error: 'Failed to save vocabulary review' })
  }
}

async function loadLearningLanguage({ supabase, safeSupabaseCall, userId }) {
  const result = await safeSupabaseCall(
    () => supabase
      .from('user_profiles')
      .select('learning_language')
      .eq('user_id', userId)
      .maybeSingle(),
    { timeoutMs: 10000, maxRetries: 1 }
  )
  if (!result || typeof result !== 'object' || result.error) {
    throw new Error('profile read failed')
  }
  const value = result.data?.learning_language
  if (value == null || value === '') return 'en'
  if (value === 'en' || value === 'zh') return value
  throw new Error('invalid learning language')
}

async function loadRecognitionQueue({ supabase, safeSupabaseCall, userId, language, now }) {
  const nowMs = now.getTime()
  const nowIso = now.toISOString()
  const items = []
  let from = 0

  while (items.length < RECOGNITION_DUE_LIMIT) {
    const result = await safeSupabaseCall(
      () => supabase
        .from('vocab_srs_states')
        .select('sense_id, due_at, card_type, user_id')
        .eq('user_id', userId)
        .eq('card_type', 'recognition')
        .lte('due_at', nowIso)
        .order('due_at', { ascending: true })
        .range(from, from + DUE_STATE_PAGE_SIZE - 1),
      { timeoutMs: 15000, maxRetries: 1 }
    )
    if (!result || typeof result !== 'object' || result.error) {
      throw new Error('states read failed')
    }
    if (!Array.isArray(result.data)) {
      throw new Error('invalid states response')
    }
    if (result.data.length === 0) break

    const page = result.data
      .filter((row) => isOwnedDueRecognition(row, userId, nowMs))
      .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at))

    const senseIds = [...new Set(page.map((row) => row.sense_id))]
    const sensesById = senseIds.length
      ? await loadOwnedSenses({ supabase, safeSupabaseCall, userId, language, senseIds })
      : new Map()

    for (const row of page) {
      const sense = sensesById.get(row.sense_id)
      if (!sense) continue
      const gloss = typeof sense.gloss_ru === 'string' ? sense.gloss_ru.trim() : ''
      if (!gloss) continue
      items.push({
        sense_id: sense.id,
        headword: sense.headword,
        gloss_ru: gloss,
        due_at: row.due_at,
        part_of_speech: sense.part_of_speech ?? null,
        context_text: sense.context_text ?? null,
      })
      if (items.length === RECOGNITION_DUE_LIMIT) break
    }

    if (result.data.length < DUE_STATE_PAGE_SIZE) break
    from += DUE_STATE_PAGE_SIZE
  }

  return items
}

async function loadOwnedSenses({ supabase, safeSupabaseCall, userId, language, senseIds }) {
  const result = await safeSupabaseCall(
    () => supabase
      .from('vocab_senses')
      .select('id, user_id, language, headword, gloss_ru, part_of_speech, context_text')
      .eq('user_id', userId)
      .eq('language', language)
      .in('id', senseIds),
    { timeoutMs: 15000, maxRetries: 1 }
  )
  if (!result || typeof result !== 'object' || result.error) {
    throw new Error('senses read failed')
  }
  if (!Array.isArray(result.data)) {
    throw new Error('invalid senses response')
  }

  const sensesById = new Map()
  for (const sense of result.data) {
    if (!sense || sense.user_id !== userId || sense.language !== language) continue
    if (typeof sense.id !== 'string' || sense.id === '') continue
    sensesById.set(sense.id, sense)
  }
  return sensesById
}

function isOwnedDueRecognition(row, userId, nowMs) {
  if (!row || row.user_id !== userId || row.card_type !== 'recognition') return false
  const dueMs = Date.parse(row.due_at)
  return Number.isFinite(dueMs) && dueMs <= nowMs
}

function parseReviewBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Invalid review body' }
  }
  const senseId = typeof body.sense_id === 'string' ? body.sense_id.trim() : ''
  if (!UUID_RE.test(senseId)) return { error: 'Invalid sense_id' }
  const rating = body.rating
  if (!Object.prototype.hasOwnProperty.call(RATING_QUALITY, rating)) {
    return { error: 'Invalid rating' }
  }
  if (typeof body.client_request_id !== 'string') return { error: 'Invalid client_request_id' }
  const requestId = body.client_request_id.trim()
  if (requestId.length === 0 || requestId.length > REVIEW_REQUEST_ID_MAX) {
    return { error: 'Invalid client_request_id' }
  }
  return {
    senseId,
    rating,
    quality: RATING_QUALITY[rating],
    requestId,
  }
}

async function recognitionRequestExists({ supabase, safeSupabaseCall, userId, requestId }) {
  const result = await safeSupabaseCall(
    () => supabase
      .from('vocab_review_events')
      .select('id')
      .eq('user_id', userId)
      .eq('client_request_id', requestId)
      .maybeSingle(),
    { timeoutMs: 10000, maxRetries: 1 }
  )
  if (!result || typeof result !== 'object' || result.error) {
    throw new Error('review request read failed')
  }
  if (result.data == null) return false
  if (typeof result.data !== 'object' || Array.isArray(result.data) || !result.data.id) {
    throw new Error('invalid review request response')
  }
  return true
}

async function loadRecognitionCard({ supabase, safeSupabaseCall, userId, language, senseId }) {
  const senseResult = await safeSupabaseCall(
    () => supabase
      .from('vocab_senses')
      .select('id, user_id, language')
      .eq('id', senseId)
      .eq('user_id', userId)
      .eq('language', language)
      .maybeSingle(),
    { timeoutMs: 10000, maxRetries: 1 }
  )
  if (!senseResult || typeof senseResult !== 'object' || senseResult.error) {
    throw new Error('sense read failed')
  }
  const sense = senseResult.data
  if (!sense || sense.user_id !== userId || sense.language !== language || sense.id !== senseId) {
    return null
  }

  const stateResult = await safeSupabaseCall(
    () => supabase
      .from('vocab_srs_states')
      .select('sense_id, user_id, card_type, ease_factor, interval_days, repetitions, lapses, due_at')
      .eq('sense_id', senseId)
      .eq('user_id', userId)
      .eq('card_type', 'recognition')
      .maybeSingle(),
    { timeoutMs: 10000, maxRetries: 1 }
  )
  if (!stateResult || typeof stateResult !== 'object' || stateResult.error) {
    throw new Error('state read failed')
  }
  const state = stateResult.data
  if (
    !state
    || state.user_id !== userId
    || state.sense_id !== senseId
    || state.card_type !== 'recognition'
  ) {
    return null
  }
  return { sense, state }
}

function classifyDue(dueAt, reviewedAt) {
  const dueMs = Date.parse(dueAt)
  if (!Number.isFinite(dueMs)) return 'invalid'
  return dueMs <= reviewedAt.getTime() ? 'due' : 'future'
}

function asEase(value) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return Number.NaN
}

function asInteger(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value)
  return Number.NaN
}

function hasSchedule(outcome) {
  return outcome.due_at != null
    && outcome.interval_days != null
    && outcome.repetitions != null
    && outcome.quality != null
}
