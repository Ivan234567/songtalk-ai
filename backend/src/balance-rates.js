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

/**
 * Секунды для списания распознавания.
 * Если браузер прислал длительность записи, берём её.
 * Файл, который не помещается в эту длительность даже при удвоенной скорости, отклоняем.
 * Без длительности оцениваем файл по 128 кбит/с и не берём запись длиннее минуты.
 */
export function billableSttSeconds({ bytes, durationMs }) {
  const size = Number(bytes)
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: 'empty_audio' }

  const clockRaw = Number(durationMs)
  const clockSec = Number.isFinite(clockRaw) && clockRaw > 0
    ? Math.ceil(clockRaw / 1000)
    : null
  const sizeSec = Math.max(1, Math.ceil(size / STT_BYTES_PER_SECOND))

  if (clockSec == null) {
    if (sizeSec > STT_MAX_SECONDS) return { ok: false, error: 'too_long' }
    return { ok: true, seconds: sizeSec }
  }

  // Кнопка останавливает запись на 60-й секунде, таймер может чуть перескочить.
  if (clockSec > STT_MAX_SECONDS + 5) return { ok: false, error: 'too_long' }

  const maxBytes = Math.ceil(STT_MAX_SECONDS * STT_BYTES_PER_SECOND * 2) + 65536
  if (size > maxBytes) return { ok: false, error: 'too_long' }

  return { ok: true, seconds: Math.max(1, Math.min(STT_MAX_SECONDS, clockSec)) }
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
