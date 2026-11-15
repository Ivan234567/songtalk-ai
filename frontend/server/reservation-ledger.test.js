import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  clampVoiceMaxTokens,
  estimateInputTokens,
  getCost,
  llmCeilingRub,
  llmSettledChargeRub,
  prepareSttBilling,
  readTokenUsage,
  sttReservationRub,
  ttsReservationRub,
  ttsSettledChargeRub,
  SERVER_MAX_OUTPUT_TOKENS,
  TTS_MAX_PROVIDER_COST_PER_1M_CHARS,
  TTS_PROVIDER_COST_PER_1M_CHARS,
} from './balance-rates.js'
import { createPaymentBook } from './reservation-ledger.js'
import { createTestLedger, runReserved } from './paid-call.js'

const sql = fs.readFileSync(new URL('../../supabase/migrations/20261002140000_balance_reservations.sql', import.meta.url), 'utf8')
const paymentSql = fs.readFileSync(new URL('../../supabase/migrations/20260928000000_yookassa_payment_provider.sql', import.meta.url), 'utf8')

function providerCall(chargeRub, result = { text: 'ok' }) {
  return { calls: 0, async execute() { this.calls += 1; return { chargeRub, result } } }
}

test('STT резервирует минуту и списывает факт', async () => {
  const { ledger, deps } = createTestLedger({ u: 20 })
  const reservation = sttReservationRub()
  assert.equal(reservation, 3.83)
  const paid = await runReserved({
    userId: 'u',
    operationId: 'stt-1',
    ceilingRub: reservation,
    execute: async () => ({ chargeRub: 0.64, result: { text: 'hi' } }),
  }, deps)
  assert.equal(paid.ok, true)
  assert.equal(paid.providerCalled, true)
  assert.equal(ledger.balance('u'), 19.36)
  assert.equal(paid.unusedRub, 3.19)
})

test('LLM списывает факт и возвращает остаток резерва', async () => {
  const messages = [{ role: 'user', content: 'hello' }]
  const ceiling = llmCeilingRub(messages, 300)
  const { ledger, deps } = createTestLedger({ u: 50 })
  const paid = await runReserved({
    userId: 'u',
    operationId: 'llm-1',
    ceilingRub: ceiling,
    execute: async () => ({
      chargeRub: llmSettledChargeRub({ prompt_tokens: 2, completion_tokens: 10 }, messages, 300).charge,
      result: { text: 'reply' },
    }),
  }, deps)
  assert.equal(paid.ok, true)
  assert.ok(ledger.balance('u') > 50 - ceiling)
  assert.ok(ledger.balance('u') < 50)
})

test('TTS списывает факт внутри потолка', async () => {
  const reservation = ttsReservationRub(1000)
  const settled = ttsSettledChargeRub({ characters: 1000, supplierCostRub: 7.95 })
  const { ledger, deps } = createTestLedger({ u: 100 })
  const paid = await runReserved({
    userId: 'u',
    operationId: 'tts-1',
    ceilingRub: reservation,
    execute: async () => ({ chargeRub: settled.charge, result: { characters: 1000 } }),
  }, deps)
  assert.equal(paid.ok, true)
  assert.ok(settled.charge <= reservation)
  assert.equal(ledger.balance('u'), Math.round((100 - settled.charge) * 100) / 100)
})

test('недостаточный баланс не вызывает провайдера', async () => {
  const { deps } = createTestLedger({ u: 1 })
  let calls = 0
  const paid = await runReserved({
    userId: 'u',
    operationId: 'low',
    ceilingRub: 3.83,
    execute: async () => { calls += 1; return { chargeRub: 3.83 } },
  }, deps)
  assert.equal(paid.status, 402)
  assert.equal(calls, 0)
})

test('два параллельных STT не тратят один баланс дважды', async () => {
  const { ledger, deps } = createTestLedger({ u: 5 })
  let calls = 0
  const run = (id) => runReserved({
    userId: 'u',
    operationId: id,
    ceilingRub: 3.83,
    execute: async () => { calls += 1; return { chargeRub: 3.83, result: { text: id } } },
  }, deps)
  const [a, b] = await Promise.all([run('a'), run('b')])
  const ok = [a, b].filter((item) => item.ok)
  assert.equal(ok.length, 1)
  assert.equal(calls, 1)
  assert.equal(ledger.balance('u'), 1.17)
})

test('два параллельных LLM и TTS ограничены доступным остатком', async () => {
  const messages = [{ role: 'user', content: 'x'.repeat(5000) }]
  const ceiling = llmCeilingRub(messages, 300)
  const { ledger, deps } = createTestLedger({ u: ceiling })
  let calls = 0
  const run = (id) => runReserved({
    userId: 'u',
    operationId: id,
    ceilingRub: ceiling,
    execute: async () => { calls += 1; return { chargeRub: ceiling, result: { text: 'a' } } },
  }, deps)
  const [a, b] = await Promise.all([run('llm-a'), run('llm-b')])
  assert.equal([a, b].filter((item) => item.ok).length, 1)
  assert.equal(calls, 1)
  assert.equal(ledger.balance('u'), 0)

  const ttsCeiling = ttsReservationRub(2000)
  const tts = createTestLedger({ u: ttsCeiling })
  let ttsCalls = 0
  const speak = (id) => runReserved({
    userId: 'u',
    operationId: id,
    ceilingRub: ttsCeiling,
    execute: async () => { ttsCalls += 1; return { chargeRub: ttsCeiling } },
  }, tts.deps)
  const pair = await Promise.all([speak('tts-a'), speak('tts-b')])
  assert.equal(pair.filter((item) => item.ok).length, 1)
  assert.equal(ttsCalls, 1)
})

test('повтор operation_id до вызова и после settlement не зовёт провайдера снова', async () => {
  const { deps } = createTestLedger({ u: 20 })
  let calls = 0
  const spec = {
    userId: 'u',
    operationId: 'same',
    ceilingRub: 3.83,
    execute: async () => { calls += 1; return { chargeRub: 1, result: { text: 'saved' } } },
  }
  const [first, second] = await Promise.all([runReserved(spec, deps), runReserved(spec, deps)])
  assert.equal(calls, 1)
  assert.equal([first, second].filter((item) => item.providerCalled).length, 1)
  const replay = await runReserved(spec, deps)
  assert.equal(replay.replay, true)
  assert.equal(replay.result.text, 'saved')
  assert.equal(calls, 1)
})

test('повторный webhook начисляет пакет один раз', async () => {
  const book = createPaymentBook()
  book.add({ id: 'order-1', userId: 'u', creditRub: 500 })
  const [a, b] = await Promise.all([book.credit('order-1'), book.credit('order-1')])
  assert.equal(book.balance('u'), 500)
  assert.equal([a, b].filter((item) => item.already).length, 1)
  assert.match(paymentSql, /credited_at IS NOT NULL/)
})

test('ошибка провайдера возвращает резерв, таймаут списывает потолок', async () => {
  const failed = createTestLedger({ u: 20 })
  await assert.rejects(() => runReserved({
    userId: 'u',
    operationId: 'err',
    ceilingRub: 3.83,
    execute: async () => { throw new Error('provider rejected') },
  }, failed.deps))
  assert.equal(failed.ledger.balance('u'), 20)
  assert.equal(failed.ledger.operation('u', 'err').status, 'failed')

  const timed = createTestLedger({ u: 20 })
  await assert.rejects(() => runReserved({
    userId: 'u',
    operationId: 'slow',
    ceilingRub: 3.83,
    execute: async () => { throw new Error('timeout') },
  }, timed.deps))
  assert.equal(timed.ledger.balance('u'), 16.17)
  assert.equal(timed.ledger.operation('u', 'slow').status, 'abandoned')
})

test('повторный settlement не меняет баланс второй раз', async () => {
  const { ledger, deps } = createTestLedger({ u: 10 })
  await runReserved({
    userId: 'u',
    operationId: 'once',
    ceilingRub: 3.83,
    execute: async () => ({ chargeRub: 1, result: { text: 'a' } }),
  }, deps)
  const again = await ledger.settle({ userId: 'u', operationId: 'once', chargeRub: 3.83 })
  assert.equal(again.already, true)
  assert.equal(ledger.balance('u'), 9)
})

test('usage читается из обоих имён полей, пустой usage берёт потолок', () => {
  const messages = [{ role: 'user', content: 'привет' }]
  const fromPrompt = readTokenUsage({ prompt_tokens: 4, completion_tokens: 2 }, { input_tokens: 99, output_tokens: 99 })
  const fromInput = readTokenUsage({ input_tokens: 4, output_tokens: 2 }, { input_tokens: 99, output_tokens: 99 })
  assert.deepEqual(fromPrompt, { input_tokens: 4, output_tokens: 2, source: 'usage' })
  assert.deepEqual(fromInput, { input_tokens: 4, output_tokens: 2, source: 'usage' })
  const missing = llmSettledChargeRub(null, messages, 300)
  assert.equal(missing.source, 'ceiling')
  assert.equal(missing.charge, missing.ceiling)
})

test('китайский текст резервируется не по длине / 4', () => {
  const text = '你'.repeat(4000)
  const tokens = estimateInputTokens(text)
  assert.equal(estimateInputTokens('你好世界'), 8)
  assert.ok(tokens > Math.ceil(text.length / 4))
  const ceiling = llmCeilingRub([{ role: 'user', content: text }], 300)
  const optimistic = getCost('deepseek-v3.2', {
    input_tokens: Math.ceil(text.length / 4),
    output_tokens: 300,
  })
  assert.ok(ceiling > optimistic)
})

test('сервер режет max_tokens клиента до 300', () => {
  assert.equal(SERVER_MAX_OUTPUT_TOKENS, 300)
  assert.equal(clampVoiceMaxTokens(1000), 300)
  assert.equal(clampVoiceMaxTokens(undefined), 300)
})

test('длинный ответ не может стоить больше резерва на 300 токенов', () => {
  const messages = [{ role: 'user', content: 'hello' }]
  const ceiling = llmCeilingRub(messages, 300)
  const huge = llmSettledChargeRub({ prompt_tokens: 10, completion_tokens: 5000 }, messages, 300)
  assert.equal(huge.charge, ceiling)
})

test('TTS cost-rub выше известной ставки упирается в потолок резерва', () => {
  assert.ok(TTS_MAX_PROVIDER_COST_PER_1M_CHARS > TTS_PROVIDER_COST_PER_1M_CHARS)
  const settled = ttsSettledChargeRub({ characters: 1_000_000, supplierCostRub: 50_000 })
  assert.equal(settled.exceeded, true)
  assert.equal(settled.charge, settled.reservation)
})

test('генерация сценария имеет ненулевой потолок', () => {
  const ceiling = llmCeilingRub([
    { role: 'system', content: 'scenario' },
    { role: 'user', content: 'cafe dialogue' },
  ], 2200)
  const field = llmCeilingRub([{ role: 'user', content: 'rewrite goal' }], 700)
  assert.ok(ceiling > 0)
  assert.ok(field > 0)
})

test('баланс не уходит ниже нуля', async () => {
  const { ledger, deps } = createTestLedger({ u: 3.83 })
  await runReserved({
    userId: 'u',
    operationId: 'all',
    ceilingRub: 3.83,
    execute: async () => ({ chargeRub: 3.83, result: { text: 'a' } }),
  }, deps)
  assert.equal(ledger.balance('u'), 0)
  assert.ok(ledger.available('u') >= 0)
})

test('ложный duration_ms не уменьшает минуту, файл длиннее минуты не проходит', () => {
  const lied = prepareSttBilling({ bytes: 200_000, durationMs: 1000 })
  assert.equal(lied.ok, true)
  assert.equal(lied.seconds, 60)
  assert.equal(lied.reservationRub, 3.83)
  const tooLong = prepareSttBilling({ bytes: 960_001, durationMs: 1000 })
  assert.equal(tooLong.ok, false)
  assert.equal(tooLong.error, 'too_long')
})

test('SQL резерва блокирует строку и не возвращает started', () => {
  assert.match(sql, /FOR UPDATE/)
  assert.match(sql, /status IN \('reserved', 'started'\)/)
  assert.match(sql, /abandoned/)
  assert.match(sql, /UNIQUE \(user_id, operation_id\)/)
})
