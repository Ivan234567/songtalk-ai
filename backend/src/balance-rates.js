/**
 * Тарифы монетизации: наценка 1,5× к закупке, 6% налог заложен в цену.
 * Цены за единицу (руб.): за 1M токенов, за 1M символов, за 60 сек.
 * Округление при списании — вверх до копеек (п. 11 плана).
 */

const RATES = Object.freeze({
  // deepseek-v3.2: вход/выход, руб. за 1M токенов
  'deepseek-v3.2-in': 86.22,
  'deepseek-v3.2-out': 129.34,
  // gpt-4o-mini-tts: руб. за 1M символов
  'gpt-4o-mini-tts': 4620.74,
  // whisper-1: руб. за 60 сек
  'whisper-1': 1.84,
})

/**
 * Округляет сумму в рублях вверх до копеек (2 знака).
 */
function roundUpRub(value) {
  if (value <= 0) return 0
  return Math.ceil(value * 100) / 100
}

/**
 * Считает стоимость в рублях по сервису и usage.
 * @param {string} service — идентификатор модели/сервиса (см. RATES)
 * @param {object} usage — объект с полями в зависимости от сервиса:
 *   - для LLM: input_tokens, output_tokens (числа)
 *   - для TTS: characters или chars (число символов)
 *   - для STT: duration_sec или seconds (число секунд)
 * @returns {number} стоимость в рублях (округлено вверх до копеек)
 */
export function getCost(service, usage) {
  if (!service || !usage || typeof usage !== 'object') return 0

  let rub = 0

  if (service === 'deepseek-v3.2' || service === 'deepseek-v3.2-in' || service === 'deepseek-v3.2-out') {
    const inRate = RATES['deepseek-v3.2-in']
    const outRate = RATES['deepseek-v3.2-out']
    const inTokens = Number(usage.input_tokens) || 0
    const outTokens = Number(usage.output_tokens) || 0
    rub = (inTokens / 1_000_000) * inRate + (outTokens / 1_000_000) * outRate
  } else if (service === 'gpt-4o-mini-tts') {
    const chars = Number(usage.characters ?? usage.chars) || 0
    rub = (chars / 1_000_000) * RATES['gpt-4o-mini-tts']
  } else if (service === 'whisper-1') {
    const sec = Number(usage.duration_sec ?? usage.seconds) || 0
    rub = (sec / 60) * RATES['whisper-1']
  } else if (RATES[service] !== undefined) {
    // Прямое совпадение по ключу (например deepseek-v3.2-in отдельно)
    const rate = RATES[service]
    if (usage.input_tokens != null || usage.output_tokens != null) {
      const inTokens = Number(usage.input_tokens) || 0
      const outTokens = Number(usage.output_tokens) || 0
      if (service === 'deepseek-v3.2-in') {
        rub = (inTokens / 1_000_000) * rate
      } else if (service === 'deepseek-v3.2-out') {
        rub = (outTokens / 1_000_000) * rate
      }
    } else if (usage.characters != null || usage.chars != null) {
      const chars = Number(usage.characters ?? usage.chars) || 0
      rub = (chars / 1_000_000) * rate
    } else if (usage.duration_sec != null || usage.seconds != null) {
      const sec = Number(usage.duration_sec ?? usage.seconds) || 0
      rub = (sec / 60) * rate
    }
  }

  return roundUpRub(rub)
}

export { RATES }
