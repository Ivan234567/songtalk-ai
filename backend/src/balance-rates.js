/**
 * Тарифы голосовой практики.
 * С клиента списывается закупка × наценка / 0,94.
 * 0,94 — это 1 − налог УСН 6%.
 * Распознавание и текст: наценка 3. Озвучка: наценка 2.
 * Округление при списании — вверх до копеек.
 *
 * Закупка зашита по текущим ставкам AITunnel в этом проекте:
 * whisper-1 — 1,2 ₽ за 60 секунд;
 * deepseek-v3.2 — 53,8 ₽ и 80 ₽ за 1 млн токенов входа и выхода;
 * gpt-4o-mini-tts — 7 950 ₽ за 1 млн символов, если провайдер не прислал cost-rub.
 */

export const TAX_KEEP_SHARE = 0.94
export const STT_MARKUP = 3
export const LLM_MARKUP = 3
export const TTS_MARKUP = 2

/** 200 ₽ баланса = 1 час на экране. На списание это не влияет. */
export const PRACTICE_RUB_PER_HOUR = 200

/** 128 кбит/с, как у записи в браузере. */
export const STT_BYTES_PER_SECOND = 16000
export const STT_MAX_SECONDS = 60

/** Один ответ агента в голосовом диалоге. Клиент не может поднять этот потолок. */
export const SERVER_MAX_OUTPUT_TOKENS = 300

/**
 * Токенов на символ для резерва. 2 покрывает китайский лучше, чем длина / 4,
 * и завышает английский, чтобы факт не обогнал резерв.
 */
export const LLM_INPUT_TOKENS_PER_CHAR = 2

/** Известная ставка озвучки, если провайдер не прислал cost-rub. */
export const TTS_PROVIDER_COST_PER_1M_CHARS = 7950

/** Потолок закупки для резерва: вдвое выше известной ставки. */
export const TTS_MAX_PROVIDER_COST_PER_1M_CHARS = TTS_PROVIDER_COST_PER_1M_CHARS * 2

const SUPPLIER_RATES = Object.freeze({
  'deepseek-v3.2-in': 53.8,
  'deepseek-v3.2-out': 80,
  'gpt-4o-mini-tts': 7950,
  'whisper-1': 1.2,
})

function roundUpRub(value) {
  if (value <= 0) return 0
  return Math.ceil(value * 100) / 100
}

export function chargeWithMarkup(supplierRub, markup) {
  const cost = Number(supplierRub)
  const factor = Number(markup)
  if (!Number.isFinite(cost) || cost <= 0) return 0
  if (!Number.isFinite(factor) || factor <= 0) return 0
  return roundUpRub((cost * factor) / TAX_KEEP_SHARE)
}

/** Совместимость: озвучка без отдельной наценки больше не используется. */
export function chargeCoveringSupplierCost(supplierRub) {
  return chargeWithMarkup(supplierRub, TTS_MARKUP)
}

export function ttsChargeRub(usage = {}) {
  const supplier = Number(usage.supplierCostRub)
  if (Number.isFinite(supplier) && supplier > 0) return chargeWithMarkup(supplier, TTS_MARKUP)
  return getCost('gpt-4o-mini-tts', usage)
}

export function getCost(service, usage) {
  if (!service || !usage || typeof usage !== 'object') return 0

  let supplierRub = 0
  let markup = LLM_MARKUP

  if (service === 'deepseek-v3.2' || service === 'deepseek-v3.2-in' || service === 'deepseek-v3.2-out') {
    const inTokens = Number(usage.input_tokens) || 0
    const outTokens = Number(usage.output_tokens) || 0
    supplierRub = (inTokens / 1_000_000) * SUPPLIER_RATES['deepseek-v3.2-in']
      + (outTokens / 1_000_000) * SUPPLIER_RATES['deepseek-v3.2-out']
    markup = LLM_MARKUP
  } else if (service === 'gpt-4o-mini-tts') {
    const chars = Number(usage.characters ?? usage.chars) || 0
    supplierRub = (chars / 1_000_000) * SUPPLIER_RATES['gpt-4o-mini-tts']
    markup = TTS_MARKUP
  } else if (service === 'whisper-1') {
    const sec = Number(usage.duration_sec ?? usage.seconds) || 0
    supplierRub = (sec / 60) * SUPPLIER_RATES['whisper-1']
    markup = STT_MARKUP
  }

  return chargeWithMarkup(supplierRub, markup)
}

export function sttReservationRub() {
  return getCost('whisper-1', { duration_sec: STT_MAX_SECONDS })
}

export function clampVoiceMaxTokens(requested) {
  const value = Number(requested)
  if (!Number.isFinite(value) || value <= 0) return SERVER_MAX_OUTPUT_TOKENS
  return Math.min(Math.floor(value), SERVER_MAX_OUTPUT_TOKENS)
}

export function messageText(messages) {
  return (Array.isArray(messages) ? messages : []).map((message) => {
    if (typeof message?.content === 'string') return message.content
    if (message?.content == null) return ''
    try { return JSON.stringify(message.content) } catch { return '' }
  }).join('\n')
}

export function estimateInputTokens(text) {
  const chars = Array.from(String(text || '')).length
  return chars * LLM_INPUT_TOKENS_PER_CHAR
}

export function llmCeilingRub(messages, maxOutputTokens) {
  const output = Math.max(0, Math.floor(Number(maxOutputTokens) || 0))
  return getCost('deepseek-v3.2', {
    input_tokens: estimateInputTokens(messageText(messages)),
    output_tokens: output,
  })
}

function usageField(usage, keys) {
  if (!usage || typeof usage !== 'object') return null
  for (const key of keys) {
    if (usage[key] == null || usage[key] === '') continue
    const value = Number(usage[key])
    if (Number.isFinite(value) && value >= 0) return value
  }
  return null
}

export function readTokenUsage(usage, fallback) {
  const input = usageField(usage, ['input_tokens', 'prompt_tokens'])
  const output = usageField(usage, ['output_tokens', 'completion_tokens'])
  if ((input == null && output == null) || ((input || 0) === 0 && (output || 0) === 0)) {
    return {
      input_tokens: Math.max(0, Number(fallback?.input_tokens) || 0),
      output_tokens: Math.max(0, Number(fallback?.output_tokens) || 0),
      source: 'ceiling',
    }
  }
  return {
    input_tokens: input || 0,
    output_tokens: output || 0,
    source: 'usage',
  }
}

export function llmSettledChargeRub(usage, messages, maxOutputTokens) {
  const ceiling = llmCeilingRub(messages, maxOutputTokens)
  const tokens = readTokenUsage(usage, {
    input_tokens: estimateInputTokens(messageText(messages)),
    output_tokens: Math.max(0, Math.floor(Number(maxOutputTokens) || 0)),
  })
  const raw = getCost('deepseek-v3.2', tokens)
  const charge = raw > 0 ? Math.min(ceiling, raw) : ceiling
  return { charge, ceiling, source: tokens.source }
}

export function ttsReservationRub(characters) {
  const chars = Math.max(0, Number(characters) || 0)
  const supplier = (chars / 1_000_000) * TTS_MAX_PROVIDER_COST_PER_1M_CHARS
  return chargeWithMarkup(supplier, TTS_MARKUP)
}

export function ttsSettledChargeRub({ characters, supplierCostRub }) {
  const reservation = ttsReservationRub(characters)
  const raw = ttsChargeRub({ characters, supplierCostRub })
  const chars = Math.max(0, Number(characters) || 0)
  const ceilingSupplier = (chars / 1_000_000) * TTS_MAX_PROVIDER_COST_PER_1M_CHARS
  const reported = Number(supplierCostRub)
  const exceeded = Number.isFinite(reported) && reported > ceilingSupplier + 1e-9
  return {
    charge: Math.min(reservation, raw > 0 ? raw : reservation),
    reservation,
    exceeded,
  }
}

/**
 * Секунды для списания распознавания.
 * Файл длиннее минуты по 128 кбит/с отклоняется до вызова Whisper.
 * Короткая заявленная длительность не уменьшает счёт, если файл в неё не помещается.
 */
export function billableSttSeconds({ bytes, durationMs }) {
  const size = Number(bytes)
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: 'empty_audio' }

  const clockRaw = Number(durationMs)
  const clockSec = Number.isFinite(clockRaw) && clockRaw > 0
    ? Math.ceil(clockRaw / 1000)
    : null
  const sizeSec = Math.max(1, Math.ceil(size / STT_BYTES_PER_SECOND))

  if (sizeSec > STT_MAX_SECONDS) return { ok: false, error: 'too_long' }

  if (clockSec == null) return { ok: true, seconds: sizeSec }

  if (clockSec > STT_MAX_SECONDS + 5) return { ok: false, error: 'too_long' }

  const maxForClaim = Math.ceil(clockSec * STT_BYTES_PER_SECOND * 1.5) + 8192
  if (size > maxForClaim) return { ok: true, seconds: STT_MAX_SECONDS }

  return { ok: true, seconds: Math.max(1, Math.min(STT_MAX_SECONDS, Math.max(sizeSec, clockSec))) }
}

export function prepareSttBilling({ bytes, durationMs }) {
  const billed = billableSttSeconds({ bytes, durationMs })
  if (!billed.ok) return billed
  return { ok: true, seconds: billed.seconds, reservationRub: sttReservationRub() }
}

export function practiceMinutesFromRub(balanceRub) {
  const rub = Number(balanceRub)
  if (!Number.isFinite(rub) || rub <= 0) return 0
  return Math.round((rub * 60) / PRACTICE_RUB_PER_HOUR)
}

export function formatPracticeRemaining(balanceRub) {
  const minutes = practiceMinutesFromRub(balanceRub)
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `≈ ${mins} мин практики`
  if (mins === 0) return `≈ ${hours} ч практики`
  return `≈ ${hours} ч ${mins} мин практики`
}

export { SUPPLIER_RATES }
