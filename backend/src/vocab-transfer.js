/**
 * Диагностика переноса.
 * Ситуация выбирается сервером из закрытого списка миграции.
 * Подтверждение переноса не приходит от клиента и не двигает SM-2.
 */

const ROLES = ['customer', 'seller', 'colleague', 'manager', 'employee', 'friend', 'stranger', 'student', 'teacher', 'host', 'guest', 'family']
const RELATIONSHIPS = ['service', 'work', 'authority', 'friendship', 'strangers', 'family', 'study']
const LOCATIONS = ['shop', 'office', 'home', 'street', 'school', 'cafe', 'transport', 'clinic', 'public']
const CHANNELS = ['in_person', 'phone', 'message']
const CIRCUMSTANCES = ['everyday', 'work', 'urgent', 'formal', 'conflict']
const INTENTS = ['request', 'refuse', 'explain', 'persuade', 'agree', 'disagree', 'support', 'clarify', 'negotiate', 'apologize', 'complain', 'suggest']
const SITUATION_KEYS = ['roles', 'relationship', 'location', 'channel', 'circumstances', 'intent']
const LEARNING_VERDICTS = ['produced', 'wrong_sense', 'hinted', 'echoed', 'mentioned']

export const LEARNING_SITUATION = Object.freeze({
  roles: Object.freeze(['customer', 'seller']),
  relationship: 'service',
  location: 'shop',
  channel: 'in_person',
  circumstances: 'everyday',
  intent: 'request',
})

export const RETENTION_SITUATION = Object.freeze({
  roles: Object.freeze(['colleague', 'manager']),
  relationship: 'work',
  location: 'office',
  channel: 'message',
  circumstances: 'work',
  intent: 'explain',
})

export const TRANSFER_SITUATIONS = Object.freeze([
  Object.freeze({ roles: Object.freeze(['student', 'teacher']), relationship: 'study', location: 'school', channel: 'in_person', circumstances: 'formal', intent: 'clarify' }),
  Object.freeze({ roles: Object.freeze(['friend']), relationship: 'friendship', location: 'cafe', channel: 'phone', circumstances: 'everyday', intent: 'support' }),
  Object.freeze({ roles: Object.freeze(['stranger']), relationship: 'strangers', location: 'clinic', channel: 'in_person', circumstances: 'urgent', intent: 'complain' }),
  Object.freeze({ roles: Object.freeze(['host', 'guest']), relationship: 'friendship', location: 'home', channel: 'in_person', circumstances: 'everyday', intent: 'apologize' }),
  Object.freeze({ roles: Object.freeze(['employee', 'manager']), relationship: 'authority', location: 'transport', channel: 'phone', circumstances: 'conflict', intent: 'negotiate' }),
  Object.freeze({ roles: Object.freeze(['family']), relationship: 'family', location: 'home', channel: 'phone', circumstances: 'urgent', intent: 'refuse' }),
  Object.freeze({ roles: Object.freeze(['customer', 'seller']), relationship: 'service', location: 'street', channel: 'phone', circumstances: 'everyday', intent: 'suggest' }),
])

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function listed(value, allowed) {
  return typeof value === 'string' && allowed.includes(value)
}

export function situationValid(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value)
  if (keys.length !== SITUATION_KEYS.length || SITUATION_KEYS.some((key) => !keys.includes(key))) return false
  if (!Array.isArray(value.roles) || value.roles.length < 1 || value.roles.length > 3) return false
  if (value.roles.some((role) => !listed(role, ROLES))) return false
  if (new Set(value.roles).size !== value.roles.length) return false
  return listed(value.relationship, RELATIONSHIPS)
    && listed(value.location, LOCATIONS)
    && listed(value.channel, CHANNELS)
    && listed(value.circumstances, CIRCUMSTANCES)
    && listed(value.intent, INTENTS)
}

function roleKey(roles) {
  return [...roles].sort().join('\n')
}

export function contextDiffers(left, right) {
  return left.relationship !== right.relationship
    || left.location !== right.location
    || left.channel !== right.channel
    || left.circumstances !== right.circumstances
    || roleKey(left.roles) !== roleKey(right.roles)
}

export function situationsDiffer(left, right) {
  if (!situationValid(left) || !situationValid(right)) return false
  return contextDiffers(left, right) && left.intent !== right.intent
}

export function baselineValid(value) {
  if (!Array.isArray(value) || value.length !== 2) return false
  const [learning, retention] = value
  if (!learning || !retention || typeof learning !== 'object' || typeof retention !== 'object') return false
  if (learning.source !== 'learning' || retention.source !== 'retention') return false
  if (Object.keys(learning).length !== 2 || Object.keys(retention).length !== 2) return false
  return situationValid(learning.situation) && situationValid(retention.situation)
}

export function isNovel(situation, baseline) {
  if (!situationValid(situation) || !baselineValid(baseline)) return false
  return baseline.every((item) => situationsDiffer(situation, item.situation))
}

export function assignPracticeSituation(mode) {
  if (mode === 'retention') return RETENTION_SITUATION
  if (mode === 'chat' || mode === 'roleplay' || mode === 'debate') return LEARNING_SITUATION
  return null
}

export function planTransferSituation(baselines) {
  if (!Array.isArray(baselines) || baselines.length < 1 || baselines.some((row) => !baselineValid(row))) {
    return { error: 'not_ready' }
  }
  const situation = TRANSFER_SITUATIONS.find((item) => baselines.every((baseline) => isNovel(item, baseline))) || null
  if (!situation) return { error: 'no_situation' }
  return { situation }
}

export function clientSuppliedTransfer(body) {
  if (!body || typeof body !== 'object') return false
  return ['situation', 'baseline_situations', 'novelty_ok', 'is_transfer', 'transfer_confirmed']
    .some((key) => body[key] != null)
}

export function quoteContainsHeadword(quote, headword) {
  const raw = typeof quote === 'string' ? quote : ''
  const word = text(headword)
  if (!raw.trim() || !word) return false
  if (/[\u3400-\u9fff]/.test(word)) return raw.includes(word)
  const tokens = raw.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || []
  return tokens.includes(word.toLowerCase())
}

export function canConfirmTransfer({
  retentionConfirmed = false,
  situation = null,
  baseline = null,
  verdict = '',
  quality = null,
  evidence = '',
  userTurn = '',
  headword = '',
  assistantBefore = [],
  hintsBefore = [],
  alreadyConfirmed = false,
} = {}) {
  if (alreadyConfirmed || retentionConfirmed !== true) return false
  if (verdict !== 'produced' || quality !== 5) return false
  if (!isNovel(situation, baseline)) return false
  const quote = text(evidence)
  const turn = typeof userTurn === 'string' ? userTurn : ''
  if (!quote || !turn.includes(quote) || !quoteContainsHeadword(quote, headword)) return false
  const earlier = [...(Array.isArray(assistantBefore) ? assistantBefore : []), ...(Array.isArray(hintsBefore) ? hintsBefore : [])]
  if (earlier.some((line) => quoteContainsHeadword(line, headword))) return false
  return true
}

export function looksTransferReady(events) {
  const rows = Array.isArray(events) ? events : []
  if (rows.some((event) => event?.transfer_confirmed === true)) return false
  const retained = rows.some((event) => (
    event?.is_transfer !== true
    && (event?.retention_days === 7 || event?.retention_days === 30)
    && event?.verdict === 'produced'
    && text(event?.evidence_text) !== ''
  ))
  const learned = rows.some((event) => (
    event?.is_transfer !== true
    && event?.retention_days == null
    && event?.source === 'dialogue'
    && event?.card_type === 'production'
    && text(event?.dialogue_session_id) !== ''
    && LEARNING_VERDICTS.includes(event?.verdict)
    && (event?.verdict !== 'produced' || text(event?.evidence_text) !== '')
  ))
  return retained && learned
}

export function describeTransferAttempt(event) {
  return {
    verdict: typeof event?.verdict === 'string' ? event.verdict : null,
    transfer_confirmed: event?.is_transfer === true
      && event?.transfer_confirmed === true
      && event?.verdict === 'produced',
  }
}

export function describeSituation(situation) {
  if (!situationValid(situation)) return 'Use a new practical situation. Do not reuse the lesson scene.'
  return [
    `Place: ${situation.location}.`,
    `Channel: ${situation.channel}.`,
    `Relationship: ${situation.relationship}.`,
    `Roles: ${situation.roles.join(', ')}.`,
    `Circumstances: ${situation.circumstances}.`,
    `The learner's communicative job is to ${situation.intent}.`,
  ].join(' ')
}
