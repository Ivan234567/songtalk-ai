/**
 * Одна рекомендация следующего занятия.
 * Читает карточки и уже записанные события. Сроки не меняет.
 * Перенос предлагается только готовым смыслам и не двигает сроки.
 */
import { classifyProductionBucket, selectProductionFive } from './vocab-production-five.js'
import { isQualifyingProduced, isRecognitionEvent, isRetentionEvent, isTransferEvent } from './vocab-speech-progress.js'
import { longestWaitingDue, openRetentionTargets } from './vocab-retention.js'
import { baselineValid, looksTransferReady, planTransferSituation } from './vocab-transfer.js'

export const INTRO_RUN_LIMIT = 2
const RECOGNITION_LIMIT = 5

const COPY = {
  repair: {
    title: 'Восстановить значение',
    reason: 'Ты недавно путал значение этого слова. Давай восстановим его в разговоре.',
  },
  due_speech: {
    title: 'Сказать слова, которым пора',
    reason: 'Наступил срок повторного использования слов в речи.',
  },
  recognized_speech: {
    title: 'Сказать узнанные слова',
    reason: 'Ты уже узнаёшь эти слова, теперь пора научиться самостоятельно их использовать.',
  },
  new_speech: {
    title: 'Познакомиться с новыми словами',
    reason: 'Есть новые слова, которые ещё не проходили разговорную практику.',
  },
  retention: {
    title: 'Проверить удержание',
    reason: 'Проверим, насколько хорошо ты можешь самостоятельно использовать ранее изученные слова.',
  },
  transfer: {
    title: 'Проверить перенос',
    reason: 'Проверим, можешь ли ты самостоятельно использовать слово в новой ситуации.',
  },
  recognition: {
    title: 'Повторить узнавание',
    reason: 'Пришло время повторить слова на узнавание.',
  },
  free: {
    title: 'Свободный разговор',
    reason: 'Сейчас нет обязательных повторений. Можно свободно поговорить.',
  },
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function at(value) {
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function reviewed(state) {
  return text(state?.lastReviewedAt) !== ''
}

export function introRunAfterAccept(action, introRun) {
  const current = Number.isInteger(introRun) && introRun > 0 ? introRun : 0
  if (action === 'recognized_speech' || action === 'new_speech') return current + 1
  return 0
}

function isWrongSense(event) {
  return Boolean(event)
    && !isRetentionEvent(event)
    && !isTransferEvent(event)
    && event.source === 'dialogue'
    && event.card_type === 'production'
    && event.verdict === 'wrong_sense'
    && text(event.dialogue_session_id) !== ''
    && text(event.sense_id) !== ''
}

function needsRepair(events) {
  const relevant = (Array.isArray(events) ? events : [])
    .filter((event) => isQualifyingProduced(event) || isWrongSense(event))
    .map((event) => ({ event, at: at(event.created_at) }))
    .filter((row) => row.at != null)
    .sort((a, b) => a.at - b.at)
  if (!relevant.length) return false
  return isWrongSense(relevant[relevant.length - 1].event)
}

function hasProduced(events) {
  return (Array.isArray(events) ? events : []).some(isQualifyingProduced)
}

function knowsWell(events) {
  return (Array.isArray(events) ? events : []).some(isRecognitionEvent)
}

function productionBucket(sense, now) {
  return classifyProductionBucket({
    lastReviewedAt: sense.production?.lastReviewedAt ?? null,
    dueAt: sense.production?.dueAt ?? null,
  }, now)
}

function recognitionDue(sense, now) {
  if (!reviewed(sense.recognition)) return false
  const due = at(sense.recognition?.dueAt)
  return due != null && due <= now.getTime()
}

function candidate(sense, listId) {
  const gloss = text(sense.gloss)
  const headword = text(sense.headword)
  if (!gloss || !headword) return null
  return {
    senseId: sense.senseId,
    headword,
    glossRu: gloss,
    position: Number(sense.positions?.[listId]) || 0,
    createdAt: text(sense.createdAt),
    dueAt: sense.production?.dueAt ?? null,
    lastReviewedAt: sense.production?.lastReviewedAt ?? null,
  }
}

function bestList(senseIds, senses, lists) {
  const counts = new Map()
  for (const senseId of senseIds) {
    const sense = senses.get(senseId)
    if (!sense) continue
    for (const listId of sense.listIds || []) {
      if (!lists.has(listId)) continue
      counts.set(listId, (counts.get(listId) || 0) + 1)
    }
  }
  let best = null
  for (const [listId, count] of counts) {
    const title = lists.get(listId)?.title || ''
    if (!best || count > best.count || (count === best.count && (title < best.title || (title === best.title && listId < best.listId)))) {
      best = { listId, count, title }
    }
  }
  return best
}

function speechSet(primaryIds, senses, lists, now) {
  const place = bestList(primaryIds, senses, lists)
  if (!place) return null
  const pool = []
  for (const sense of senses.values()) {
    if (!(sense.listIds || []).includes(place.listId)) continue
    const row = candidate(sense, place.listId)
    if (row) pool.push(row)
  }
  const ids = []
  for (const senseId of primaryIds) {
    if (ids.length >= 5) break
    if (!pool.some((row) => row.senseId === senseId) || ids.includes(senseId)) continue
    ids.push(senseId)
  }
  const due = []
  const fresh = []
  for (const row of pool) {
    if (ids.includes(row.senseId)) continue
    const bucket = classifyProductionBucket(row, now)
    if (bucket === 'due') due.push(row)
    else if (bucket === 'new') fresh.push(row)
  }
  due.sort((a, b) => (at(a.dueAt) ?? 0) - (at(b.dueAt) ?? 0))
  fresh.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
  for (const row of [...due, ...fresh]) {
    if (ids.length >= 5) break
    ids.push(row.senseId)
  }
  if (ids.length < 2) return null
  const selected = selectProductionFive(pool, ids, now)
  if (!selected.items) return null
  return {
    listId: place.listId,
    listTitle: place.title,
    senses: selected.items.map((item) => ({
      sense_id: item.sense_id,
      headword: item.headword,
      gloss_ru: item.gloss_ru,
    })),
  }
}

function recognitionItems(senses, now) {
  return [...senses.values()]
    .filter((sense) => recognitionDue(sense, now) && text(sense.headword) && text(sense.gloss))
    .map((sense) => ({
      sense,
      due: at(sense.recognition?.dueAt) ?? now.getTime(),
    }))
    .sort((a, b) => a.due - b.due || a.sense.senseId.localeCompare(b.sense.senseId))
    .slice(0, RECOGNITION_LIMIT)
}

function packRetention(rows, introRun) {
  return pack('retention', {
    senses: rows.map((row) => ({
      sense_id: row.senseId,
      headword: '',
      gloss_ru: '',
      retention_days: row.days,
    })),
  }, introRun)
}

function packTransfer(senseIds, introRun) {
  return pack('transfer', {
    senses: senseIds.map((senseId) => ({
      sense_id: senseId,
      headword: '',
      gloss_ru: '',
    })),
  }, introRun)
}

function pack(action, extra, introRun) {
  return {
    action,
    title: COPY[action].title,
    reason: COPY[action].reason,
    count: extra.senses.length,
    list_id: extra.listId || null,
    list_title: extra.listTitle || null,
    senses: extra.senses,
    intro_run: introRun,
    intro_run_after: introRunAfterAccept(action, introRun),
  }
}

/**
 * @param {{ senses: object[], lists: object[], introRun?: number, now: Date, transferSenseIds?: string[] }} input
 */
export function chooseNextAction({ senses, lists, introRun = 0, now, transferSenseIds = [] }) {
  const run = Number.isInteger(introRun) && introRun > 0 ? introRun : 0
  const senseMap = new Map()
  for (const raw of Array.isArray(senses) ? senses : []) {
    const senseId = text(raw?.senseId || raw?.sense_id)
    if (!senseId || senseMap.has(senseId)) continue
    senseMap.set(senseId, {
      senseId,
      headword: raw.headword,
      gloss: raw.gloss || raw.gloss_ru,
      createdAt: raw.createdAt || raw.created_at || '',
      listIds: [...new Set((raw.listIds || raw.list_ids || []).filter((id) => text(id)))],
      positions: raw.positions || {},
      production: raw.production || null,
      recognition: raw.recognition || null,
      events: Array.isArray(raw.events) ? raw.events : [],
    })
  }
  const listMap = new Map()
  for (const raw of Array.isArray(lists) ? lists : []) {
    const id = text(raw?.id)
    if (!id || listMap.has(id)) continue
    listMap.set(id, { id, title: text(raw.title) })
  }

  const repairIds = []
  const dueIds = []
  const recognizedIds = []
  const newIds = []
  for (const sense of senseMap.values()) {
    if (needsRepair(sense.events)) repairIds.push(sense.senseId)
    const bucket = productionBucket(sense, now)
    if (bucket === 'due') dueIds.push(sense.senseId)
    else if (bucket === 'new' && !hasProduced(sense.events)) newIds.push(sense.senseId)
    if (knowsWell(sense.events) && !hasProduced(sense.events)) recognizedIds.push(sense.senseId)
  }
  dueIds.sort((a, b) => (at(senseMap.get(a)?.production?.dueAt) ?? 0) - (at(senseMap.get(b)?.production?.dueAt) ?? 0))
  newIds.sort((a, b) => {
    const left = senseMap.get(a)
    const right = senseMap.get(b)
    return text(left?.createdAt) < text(right?.createdAt) ? -1 : text(left?.createdAt) > text(right?.createdAt) ? 1 : 0
  })

  const repair = speechSet(repairIds, senseMap, listMap, now)
  if (repair) return pack('repair', repair, run)

  const dueSpeech = speechSet(dueIds, senseMap, listMap, now)
  if (dueSpeech) return pack('due_speech', dueSpeech, run)

  const waitingRecognition = recognitionItems(senseMap, now)
  const retentionRows = openRetentionTargets([...senseMap.values()], now)
  const introBlocked = run >= INTRO_RUN_LIMIT
    && (waitingRecognition.length > 0 || retentionRows.length > 0)
  if (!introBlocked) {
    const recognized = speechSet(recognizedIds, senseMap, listMap, now)
    if (recognized) return pack('recognized_speech', recognized, run)
    const fresh = speechSet(newIds, senseMap, listMap, now)
    if (fresh) return pack('new_speech', fresh, run)
    if (retentionRows.length) return packRetention(retentionRows, run)
  } else {
    const choice = longestWaitingDue(
      retentionRows,
      waitingRecognition.map((row) => ({ dueAt: new Date(row.due).toISOString() })),
    )
    if (choice === 'retention') return packRetention(retentionRows, run)
  }

  const transferIds = [...new Set((Array.isArray(transferSenseIds) ? transferSenseIds : []).map(text).filter(Boolean))]
    .filter((senseId) => senseMap.has(senseId))
    .sort()
  if (transferIds.length) return packTransfer(transferIds.slice(0, 5), run)

  if (waitingRecognition.length) {
    return pack('recognition', {
      senses: waitingRecognition.map(({ sense }) => ({
        sense_id: sense.senseId,
        headword: text(sense.headword),
        gloss_ru: text(sense.gloss),
      })),
    }, run)
  }

  return pack('free', { senses: [] }, run)
}

function parseIntroRun(value) {
  if (value == null || value === '') return 0
  const run = Number(value)
  if (!Number.isInteger(run) || run < 0 || run > 100) return null
  return run
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
  if (typeof userId !== 'string' || !userId.trim()) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return null
  }
  return userId.trim()
}

async function readRows(safeSupabaseCall, fn) {
  const result = await safeSupabaseCall(fn, { timeoutMs: 15000, maxRetries: 1 })
  if (!result || result.error) throw new Error('read failed')
  return Array.isArray(result.data) ? result.data : []
}

const REVIEW_EVENT_COLUMNS = 'sense_id, source, card_type, verdict, dialogue_session_id, evidence_text, due_before, due_after, retention_days, created_at'

async function readReviewEvents(supabase, safeSupabaseCall, userId) {
  const extended = await safeSupabaseCall(
    () => supabase.from('vocab_review_events').select(`${REVIEW_EVENT_COLUMNS}, is_transfer, transfer_confirmed`).eq('user_id', userId),
    { timeoutMs: 15000, maxRetries: 0 },
  )
  if (extended && !extended.error) return Array.isArray(extended.data) ? extended.data : []
  return readRows(
    safeSupabaseCall,
    () => supabase.from('vocab_review_events').select(REVIEW_EVENT_COLUMNS).eq('user_id', userId),
  )
}

async function readyTransferSenses(supabase, safeSupabaseCall, userId, senses, language) {
  if (language === 'zh') return []
  const candidates = senses
    .filter((sense) => looksTransferReady(sense.events))
    .map((sense) => sense.senseId)
    .sort()
    .slice(0, 8)
  if (!candidates.length) return []
  const checks = await Promise.all(candidates.map(async (senseId) => {
    const result = await safeSupabaseCall(
      () => supabase.rpc('vocab_transfer_baseline_records', { p_user_id: userId, p_sense_id: senseId }),
      { timeoutMs: 10000, maxRetries: 0 },
    )
    if (!result || result.error || !baselineValid(result.data)) return null
    if (planTransferSituation([result.data]).error) return null
    return senseId
  }))
  return checks.filter(Boolean)
}

export function createNextActionHandler({
  supabase,
  resolveUserId,
  getBearerToken,
  safeSupabaseCall = (fn) => fn(),
  now = () => new Date(),
}) {
  return async function nextActionHandler(req, res) {
    const userId = await requireUser(req, res, { getBearerToken, resolveUserId })
    if (!userId) return
    const introRun = parseIntroRun(req.query?.intro_run)
    if (introRun == null) {
      res.status(400).json({ error: 'Invalid intro run' })
      return
    }

    try {
      const profile = await safeSupabaseCall(
        () => supabase.from('user_profiles').select('learning_language').eq('user_id', userId).maybeSingle(),
        { timeoutMs: 10000, maxRetries: 1 },
      )
      if (!profile || profile.error) throw new Error('profile read failed')
      const language = profile.data?.learning_language === 'zh' ? 'zh' : 'en'
      const [senseRows, listRows, itemRows, stateRows, eventRows] = await Promise.all([
        readRows(safeSupabaseCall, () => supabase.from('vocab_senses').select('id, vocabulary_id, headword, gloss_ru, created_at').eq('user_id', userId).eq('language', language)),
        readRows(safeSupabaseCall, () => supabase.from('vocab_lists').select('id, title').eq('user_id', userId).eq('language', language)),
        readRows(safeSupabaseCall, () => supabase.from('vocab_list_items').select('list_id, vocabulary_id, position').eq('user_id', userId)),
        readRows(safeSupabaseCall, () => supabase.from('vocab_srs_states').select('sense_id, card_type, due_at, last_reviewed_at').eq('user_id', userId)),
        readReviewEvents(supabase, safeSupabaseCall, userId),
      ])
      const lists = listRows
        .filter((row) => text(row?.id))
        .map((row) => ({ id: row.id, title: text(row.title) }))
      const listIds = new Set(lists.map((row) => row.id))
      const membership = new Map()
      for (const row of itemRows) {
        const listId = text(row?.list_id)
        const vocabularyId = text(row?.vocabulary_id)
        if (!listId || !vocabularyId || !listIds.has(listId)) continue
        if (!membership.has(vocabularyId)) membership.set(vocabularyId, [])
        membership.get(vocabularyId).push({
          listId,
          position: Number.isFinite(Number(row.position)) ? Number(row.position) : 0,
        })
      }
      const production = new Map()
      const recognition = new Map()
      for (const row of stateRows) {
        const senseId = text(row?.sense_id)
        if (!senseId) continue
        const state = { dueAt: row.due_at ?? null, lastReviewedAt: row.last_reviewed_at ?? null }
        if (row.card_type === 'production' && !production.has(senseId)) production.set(senseId, state)
        if (row.card_type === 'recognition' && !recognition.has(senseId)) recognition.set(senseId, state)
      }
      const eventsBySense = new Map()
      for (const row of eventRows) {
        const senseId = text(row?.sense_id)
        if (!senseId) continue
        if (!eventsBySense.has(senseId)) eventsBySense.set(senseId, [])
        eventsBySense.get(senseId).push(row)
      }
      const senses = []
      const seen = new Set()
      for (const row of senseRows) {
        const senseId = text(row?.id)
        if (!senseId || seen.has(senseId)) continue
        seen.add(senseId)
        const places = membership.get(text(row.vocabulary_id)) || []
        const positions = {}
        for (const place of places) positions[place.listId] = place.position
        senses.push({
          senseId,
          headword: row.headword,
          gloss: row.gloss_ru,
          createdAt: row.created_at || '',
          listIds: places.map((place) => place.listId),
          positions,
          production: production.get(senseId) || null,
          recognition: recognition.get(senseId) || null,
          events: eventsBySense.get(senseId) || [],
        })
      }
      const transferSenseIds = await readyTransferSenses(supabase, safeSupabaseCall, userId, senses, language)
      const recommendation = chooseNextAction({ senses, lists, introRun, now: now(), transferSenseIds })
      res.status(200).json(recommendation)
    } catch (error) {
      console.error('[api/vocabulary/next-action] failed', error?.message || error)
      res.status(500).json({ error: 'Failed to choose the next action' })
    }
  }
}

export function registerNextActionRoute(app, deps) {
  const wrap = deps.asyncHandler || ((fn) => fn)
  app.get('/api/vocabulary/next-action', wrap(createNextActionHandler(deps)))
}
