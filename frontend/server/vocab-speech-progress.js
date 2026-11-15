/**
 * Чтение речевого прогресса из уже записанных vocab_review_events.
 * Ничего не пишет в SM-2 и не создаёт событий.
 *
 * Право сдвинуть срок совпадает с commit_vocab_dialogue_assessment:
 * вердикт двигает карточку только при moves_schedule = true.
 * Если права не было, due_before и due_after остаются одним моментом.
 */

const SPEECH_RANK = { none: 0, said: 1, repeated: 2 }
const DAY_MS = 24 * 60 * 60 * 1000

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function instant(value) {
  if (typeof value !== 'string' || !value.trim()) return Number.NaN
  return Date.parse(value)
}

export function isRecognitionEvent(event) {
  return Boolean(event)
    && event.source === 'daily_review'
    && event.card_type === 'recognition'
    && (event.dialogue_session_id == null || event.dialogue_session_id === '')
    && (event.verdict === 'good' || event.verdict === 'easy')
}

export function isRetentionEvent(event) {
  return event?.retention_days === 7 || event?.retention_days === 30
}

export function isTransferEvent(event) {
  return event?.is_transfer === true
}

export function isQualifyingProduced(event) {
  return Boolean(event)
    && !isRetentionEvent(event)
    && !isTransferEvent(event)
    && event.source === 'dialogue'
    && event.card_type === 'production'
    && event.verdict === 'produced'
    && text(event.dialogue_session_id) !== ''
    && text(event.evidence_text) !== ''
    && text(event.sense_id) !== ''
}

/**
 * Ранняя практика не имела права двигать SM-2.
 * moves_schedule === false — явный запрет на цели сессии.
 * Совпадение due_before и due_after — след того, что срок не сдвинулся.
 * Разные сроки возникают только когда commit записал новый due_at.
 */
export function producedHadScheduleRight(event, movesSchedule) {
  if (movesSchedule === false) return false
  const before = instant(event?.due_before)
  const after = instant(event?.due_after)
  if (!Number.isFinite(before) || !Number.isFinite(after)) return false
  return before !== after
}

function movesKey(event) {
  return `${text(event.dialogue_session_id)}:${text(event.sense_id)}`
}

export function readSenseSpeech(events, movesByKey = new Map()) {
  const rows = Array.isArray(events) ? events : []
  const recognizes = rows.some(isRecognitionEvent)
  const speechEvents = rows.filter(isQualifyingProduced)
  if (!speechEvents.length) return { speech: 'none', recognizes }

  const repeated = speechEvents.some((event) => {
    if (!producedHadScheduleRight(event, movesByKey.get(movesKey(event)))) return false
    const at = instant(event.created_at)
    if (!Number.isFinite(at)) return false
    return speechEvents.some((other) => {
      if (other === event) return false
      if (text(other.dialogue_session_id) === text(event.dialogue_session_id)) return false
      const otherAt = instant(other.created_at)
      return Number.isFinite(otherAt) && otherAt < at
    })
  })

  return { speech: repeated ? 'repeated' : 'said', recognizes }
}

/**
 * Якорь T — время второго подходящего produced в другой сессии.
 * Второе событие должно быть позже и иметь право сдвинуть SM-2.
 * Повторное чтение тех же событий возвращает то же время.
 * Плановые даты удержания не записываются в карточку.
 */
export function readRetentionAnchor(events, movesByKey = new Map()) {
  const speech = (Array.isArray(events) ? events : [])
    .filter(isQualifyingProduced)
    .map((event) => ({ event, at: instant(event.created_at) }))
    .filter((row) => Number.isFinite(row.at))
    .sort((a, b) => a.at - b.at)

  let anchorAt = null
  for (let index = 0; index < speech.length; index += 1) {
    const row = speech[index]
    if (!producedHadScheduleRight(row.event, movesByKey.get(movesKey(row.event)))) continue
    const hasEarlier = speech.some((other, otherIndex) => (
      otherIndex < index
      && text(other.event.dialogue_session_id) !== text(row.event.dialogue_session_id)
      && other.at < row.at
    ))
    if (!hasEarlier) continue
    anchorAt = row.at
    break
  }
  if (anchorAt == null) return null
  return {
    anchored_at: new Date(anchorAt).toISOString(),
    check_7_at: new Date(anchorAt + 7 * DAY_MS).toISOString(),
    check_30_at: new Date(anchorAt + 30 * DAY_MS).toISOString(),
  }
}

export function readSpeechBySense(events, targets = []) {
  const movesByKey = new Map()
  for (const target of Array.isArray(targets) ? targets : []) {
    const sessionId = text(target?.dialogue_session_id)
    const senseId = text(target?.sense_id)
    if (!sessionId || !senseId || target.moves_schedule !== false) continue
    movesByKey.set(`${sessionId}:${senseId}`, false)
  }

  const bySense = new Map()
  for (const event of Array.isArray(events) ? events : []) {
    const senseId = text(event?.sense_id)
    if (!senseId) continue
    if (!bySense.has(senseId)) bySense.set(senseId, [])
    bySense.get(senseId).push(event)
  }

  const result = new Map()
  for (const [senseId, senseEvents] of bySense) {
    result.set(senseId, readSenseSpeech(senseEvents, movesByKey))
  }
  return result
}

export function summarizeSenseSpeech(senseIds, bySense) {
  let speech = 'none'
  let recognizes = false
  const senseSpeech = []
  for (const senseId of senseIds) {
    const row = bySense.get(senseId) || { speech: 'none', recognizes: false }
    senseSpeech.push({ sense_id: senseId, speech: row.speech, recognizes: row.recognizes })
    if (SPEECH_RANK[row.speech] > SPEECH_RANK[speech]) speech = row.speech
    if (row.recognizes) recognizes = true
  }
  return { speech, recognizes, sense_speech: senseSpeech }
}
