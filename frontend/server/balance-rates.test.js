import test from 'node:test'
import assert from 'node:assert/strict'
import {
  STT_MARKUP,
  LLM_MARKUP,
  TTS_MARKUP,
  TAX_KEEP_SHARE,
  getCost,
  ttsChargeRub,
  chargeWithMarkup,
  billableSttSeconds,
  formatPracticeRemaining,
  practiceMinutesFromRub,
} from './balance-rates.js'

test('коэффициенты наценки и налога собраны в одном месте', () => {
  assert.equal(STT_MARKUP, 3)
  assert.equal(LLM_MARKUP, 3)
  assert.equal(TTS_MARKUP, 2)
  assert.equal(TAX_KEEP_SHARE, 0.94)
})

test('минута распознавания списывается как закупка × 3 / 0,94', () => {
  const charge = getCost('whisper-1', { duration_sec: 60 })
  assert.equal(charge, 3.83)
  assert.equal(charge, chargeWithMarkup(1.2, 3))
})

test('десять секунд речи округляются вверх до копеек', () => {
  assert.equal(getCost('whisper-1', { duration_sec: 10 }), 0.64)
})

test('текст считает вход и выход отдельно', () => {
  assert.equal(getCost('deepseek-v3.2', { input_tokens: 1_000_000, output_tokens: 0 }), 171.71)
  assert.equal(getCost('deepseek-v3.2', { input_tokens: 0, output_tokens: 1_000_000 }), 255.32)
})

test('озвучка с фактической закупкой идёт с наценкой ×2', () => {
  assert.equal(ttsChargeRub({ supplierCostRub: 0.94, characters: 10 }), 2)
  assert.equal(ttsChargeRub({ characters: 1_000_000 }), 16914.9)
})

test('ошибка распознавания не создаёт секунды для списания', () => {
  assert.deepEqual(billableSttSeconds({ bytes: 0, durationMs: 1000 }), { ok: false, error: 'empty_audio' })
  assert.equal(billableSttSeconds({ bytes: 3_000_000, durationMs: 5000 }).ok, false)
})

test('реальная длительность записи округляется вверх и не длиннее минуты', () => {
  assert.deepEqual(billableSttSeconds({ bytes: 20_000, durationMs: 10_200 }), { ok: true, seconds: 11 })
  assert.deepEqual(billableSttSeconds({ bytes: 20_000, durationMs: 60_400 }), { ok: true, seconds: 60 })
  assert.equal(billableSttSeconds({ bytes: 20_000, durationMs: 70_000 }).error, 'too_long')
  assert.deepEqual(billableSttSeconds({ bytes: 16_000 }), { ok: true, seconds: 1 })
  assert.equal(billableSttSeconds({ bytes: 960_001 }).error, 'too_long')
})

test('пакеты показываются по эталону 200 ₽ за час', () => {
  assert.equal(practiceMinutesFromRub(300), 90)
  assert.equal(practiceMinutesFromRub(500), 150)
  assert.equal(practiceMinutesFromRub(1000), 300)
  assert.equal(formatPracticeRemaining(300), '≈ 1 ч 30 мин практики')
  assert.equal(formatPracticeRemaining(500), '≈ 2 ч 30 мин практики')
  assert.equal(formatPracticeRemaining(1000), '≈ 5 ч практики')
  assert.equal(formatPracticeRemaining(0), '≈ 0 мин практики')
})

test('повтор операции и нехватка баланса не уводят в минус', () => {
  const seen = new Set()
  const apply = (balance, amount, operationId) => {
    if (seen.has(operationId)) return { ok: true, already: true, balance }
    if (balance < amount) return { ok: false, error: 'insufficient_balance', balance }
    seen.add(operationId)
    return { ok: true, already: false, balance: Math.round((balance - amount) * 100) / 100 }
  }

  const first = apply(10, 3.83, 'stt-1')
  assert.equal(first.ok, true)
  assert.equal(first.balance, 6.17)
  const repeat = apply(first.balance, 3.83, 'stt-1')
  assert.equal(repeat.already, true)
  assert.equal(repeat.balance, 6.17)
  const tooMuch = apply(6.17, 7, 'stt-2')
  assert.equal(tooMuch.ok, false)
  assert.equal(tooMuch.balance, 6.17)
})
