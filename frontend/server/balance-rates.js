/**
 * Тарифы монетизации.
 * LLM и Whisper: наценка 3× к закупке AITunnel, налог УСН 6% в цене: (закупка × 3) / 0,94.
 * Озвучка: без наценки. Если AITunnel прислал cost-rub, списание = cost-rub / 0,94.
 * Ставка за 1M символов — запасной расчёт без заголовка: 7 950 / 0,94.
 * Округление при списании — вверх до копеек.
 */

const USN_KEEP_SHARE = 0.94

const RATES = Object.freeze({
  // deepseek-v3.2: вход 53,8 ₽ и выход 80 ₽ за 1M, ×3 / 0,94
  'deepseek-v3.2-in': 171.71,
  'deepseek-v3.2-out': 255.32,
  // gpt-4o-mini-tts: руб. за 1M символов, только если нет фактической стоимости
  'gpt-4o-mini-tts': 8457.45,
  // whisper-1: 1,2 ₽ за 60 сек, ×3 / 0,94
  'whisper-1': 3.83,
})

/**
 * Округляет сумму в рублях вверх до копеек (2 знака).
 */
function roundUpRub(value) {
  if (value <= 0) return 0
  return Math.ceil(value * 100) / 100
}

/**
 * Списание без наценки: закупка плюс налог 6%, чтобы после УСН выйти в ноль.
 * @param {number} supplierRub — стоимость запроса у AITunnel
 * @returns {number}
 */
export function chargeCoveringSupplierCost(supplierRub) {
  const cost = Number(supplierRub)
  if (!Number.isFinite(cost) || cost <= 0) return 0
  return roundUpRub(cost / USN_KEEP_SHARE)
}

/**
 * Озвучка: фактическая закупка из заголовка cost-rub, иначе ставка за символы.
 * @param {{ characters?: number, chars?: number, supplierCostRub?: number }} usage
 * @returns {number}
 */
export function ttsChargeRub(usage = {}) {
  const supplier = Number(usage.supplierCostRub)
  if (Number.isFinite(supplier) && supplier > 0) return chargeCoveringSupplierCost(supplier)
  return getCost('gpt-4o-mini-tts', usage)
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
