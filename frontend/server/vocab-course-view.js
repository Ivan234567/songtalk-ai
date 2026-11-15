/** Статусы для витрины курса. no_opportunity не становится промахом. */
export function courseWordStatus(verdict, sessionStatus = 'active') {
  const value = typeof verdict === 'string' ? verdict : 'unused'
  if (value === 'produced') return 'used'
  if (value === 'wrong_sense') return 'wrong_sense'
  if (value === 'hinted') return 'hinted'
  if (value === 'echoed') return 'echoed'
  if (value === 'mentioned') return 'mentioned'
  if (value === 'no_opportunity') return 'no_opportunity'
  if (value === 'unused') {
    return sessionStatus === 'active' ? 'waiting' : 'missed'
  }
  return 'other'
}

function sameInstant(left, right) {
  const a = Date.parse(left)
  const b = Date.parse(right)
  return Number.isFinite(a) && a === b
}

/**
 * Для разобранной сессии берёт записанный вердикт.
 * Раннее produced/wrong_sense с той же датой помечается schedule_held.
 */
export function overlayStoredVerdicts(items, events, sessionStatus = 'assessed') {
  const bySense = new Map()
  for (const event of Array.isArray(events) ? events : []) {
    const senseId = typeof event?.sense_id === 'string' ? event.sense_id : ''
    const verdict = typeof event?.verdict === 'string' ? event.verdict : ''
    if (!senseId || !verdict || bySense.has(senseId)) continue
    bySense.set(senseId, event)
  }
  return (Array.isArray(items) ? items : []).map((item) => {
    const event = bySense.get(item?.sense_id)
    if (!event) return item
    const held = (event.verdict === 'produced' || event.verdict === 'wrong_sense')
      && sameInstant(event.due_before, event.due_after)
    return {
      ...item,
      verdict: event.verdict,
      status: courseWordStatus(event.verdict, sessionStatus),
      schedule_held: held,
    }
  })
}

/** Срок карточки говорения. Слово без речи — новое, даже если дата создания уже прошла. */
export function describeProductionSpeech(state, now) {
  const at = now instanceof Date ? now.getTime() : Date.parse(now)
  const reviewed = typeof state?.last_reviewed_at === 'string' && state.last_reviewed_at.trim() !== ''
  if (!reviewed || !Number.isFinite(at)) return { bucket: 'new', due_at: null }
  const dueAt = typeof state.due_at === 'string' && state.due_at ? state.due_at : null
  const dueMs = dueAt ? Date.parse(dueAt) : Number.NaN
  if (!Number.isFinite(dueMs) || dueMs <= at) return { bucket: 'due', due_at: dueAt }
  return { bucket: 'later', due_at: dueAt }
}
