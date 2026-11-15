import { isRetentionEvent, readRetentionAnchor } from './vocab-speech-progress.js'

const DAY_MS = 24 * 60 * 60 * 1000
export const RETENTION_WINDOWS = [7, 30]
export const RETENTION_SET_LIMIT = 5

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function at(value) {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : null
}

export function isConfirmingRetention(event) {
  return isRetentionEvent(event)
    && event?.verdict === 'produced'
    && text(event?.evidence_text) !== ''
    && text(event?.dialogue_session_id) !== ''
}

export function retentionIntervalDays(anchoredAt, checkedAt) {
  const start = at(anchoredAt)
  const end = at(checkedAt)
  if (start == null || end == null || end < start) return null
  return Math.floor((end - start) / DAY_MS)
}

/**
 * Окна удержания одного смысла. Успех подтверждает каждое окно,
 * чья плановая дата уже наступила к моменту сохранённого события.
 * @param {object[]} events
 * @param {Map<string, boolean>} movesByKey
 * @param {Date} now
 */
export function readSenseRetention(events, movesByKey, now) {
  const anchor = readRetentionAnchor(events, movesByKey)
  if (!anchor) return null
  const start = at(anchor.anchored_at)
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now)
  const attempts = (Array.isArray(events) ? events : [])
    .filter(isRetentionEvent)
    .map((event) => ({ event, at: at(event.created_at) }))
    .filter((row) => row.at != null)
    .sort((left, right) => left.at - right.at)
  const confirmedBy = new Map()
  for (const row of attempts) {
    if (!isConfirmingRetention(row.event)) continue
    for (const days of RETENTION_WINDOWS) {
      if (confirmedBy.has(days)) continue
      if (start + days * DAY_MS <= row.at) confirmedBy.set(days, row)
    }
  }
  const windows = RETENTION_WINDOWS.map((days) => {
    const due = start + days * DAY_MS
    const hit = confirmedBy.get(days)
    if (hit) {
      const checkedAt = new Date(hit.at).toISOString()
      return {
        days,
        state: 'confirmed',
        due_at: new Date(due).toISOString(),
        checked_at: checkedAt,
        interval_days: retentionIntervalDays(anchor.anchored_at, checkedAt),
      }
    }
    const failed = attempts.some((row) => (
      row.at >= due
      && Number(row.event.retention_days) === days
      && !isConfirmingRetention(row.event)
    ))
    let state = 'waiting'
    if (Number.isFinite(nowMs) && nowMs >= due) state = failed ? 'unconfirmed' : 'available'
    return {
      days,
      state,
      due_at: new Date(due).toISOString(),
      checked_at: null,
      interval_days: null,
    }
  })
  const next = windows.find((window) => window.state === 'available' || window.state === 'unconfirmed') || null
  return { anchor, windows, next }
}

export function planRetentionSession(requestedIds, owned, now) {
  const byId = new Map()
  for (const sense of Array.isArray(owned) ? owned : []) {
    const senseId = text(sense?.senseId || sense?.sense_id)
    if (senseId && !byId.has(senseId)) byId.set(senseId, sense)
  }
  const ids = Array.isArray(requestedIds) ? requestedIds : []
  if (ids.some((id) => !byId.has(text(id)))) return { error: 'not_found' }
  const items = []
  for (const rawId of ids) {
    const senseId = text(rawId)
    const ownedSense = byId.get(senseId)
    const plan = readSenseRetention(ownedSense?.events, ownedSense?.movesByKey || new Map(), now)
    if (!plan?.next) return { error: 'not_open', senseId }
    items.push({
      senseId,
      retention_days: plan.next.days,
      moves_schedule: false,
    })
  }
  return { items }
}

export function practiceTargetFields({ mode, retentionDays = null, early = false, transferBaseline = null } = {}) {
  if (mode === 'retention') {
    if (retentionDays !== 7 && retentionDays !== 30) {
      throw new Error('Retention window is missing')
    }
    return { retention_days: retentionDays, moves_schedule: false }
  }
  if (mode === 'transfer') {
    if (!transferBaseline) throw new Error('Transfer baseline is missing')
    return {
      retention_days: null,
      moves_schedule: false,
      is_transfer: true,
      baseline_situations: transferBaseline,
      novelty_ok: true,
    }
  }
  if (retentionDays != null) throw new Error('Ordinary practice cannot carry a retention window')
  return { retention_days: null, moves_schedule: early !== true }
}

/**
 * До пяти открытых окон. Сначала все T+7, затем T+30.
 * @param {object[]} senses
 * @param {Date} now
 */
export function openRetentionTargets(senses, now) {
  const rows = []
  for (const sense of Array.isArray(senses) ? senses : []) {
    const plan = readSenseRetention(sense?.events, sense?.movesByKey || new Map(), now)
    if (!plan?.next) continue
    rows.push({
      senseId: text(sense.senseId || sense.sense_id),
      days: plan.next.days,
      dueAt: plan.next.due_at,
    })
  }
  rows.sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt))
  const sevens = rows.filter((row) => row.days === 7)
  const chosen = sevens.length > 0 ? sevens : rows.filter((row) => row.days === 30)
  return chosen.filter((row) => row.senseId).slice(0, RETENTION_SET_LIMIT)
}

export function describeRetentionAttempt(events, movesByKey, attempt) {
  const checkedAt = typeof attempt?.created_at === 'string' ? attempt.created_at : ''
  const plan = readSenseRetention(events, movesByKey, checkedAt ? new Date(checkedAt) : new Date())
  if (!plan || !checkedAt) {
    return { confirmed: false, interval_days: null, checked_at: checkedAt || null, windows: [] }
  }
  const windows = plan.windows.filter((window) => window.state === 'confirmed' && window.checked_at === checkedAt)
  if (!windows.length) {
    return { confirmed: false, interval_days: null, checked_at: checkedAt, windows: [] }
  }
  return {
    confirmed: true,
    interval_days: retentionIntervalDays(plan.anchor.anchored_at, checkedAt),
    checked_at: checkedAt,
    windows: windows.map((window) => window.days),
  }
}

export function longestWaitingDue(retentionRows, recognitionRows) {
  const retentionDue = retentionRows.reduce((min, row) => {
    const due = at(row.dueAt)
    return due == null ? min : Math.min(min, due)
  }, Infinity)
  const recognitionDue = recognitionRows.reduce((min, row) => {
    const due = at(row.dueAt || row.due)
    return due == null ? min : Math.min(min, due)
  }, Infinity)
  if (!Number.isFinite(retentionDue) && !Number.isFinite(recognitionDue)) return null
  return retentionDue <= recognitionDue ? 'retention' : 'recognition'
}
