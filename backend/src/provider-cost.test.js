import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  commitUsageFinancials,
  normalizeProviderCostRub,
  readProviderCostRub,
  readProviderRequestId,
} from './provider-cost.js'
import { createTestLedger, runReserved } from './paid-call.js'

const sql = fs.readFileSync(
  new URL('../../supabase/migrations/20261115190000_provider_cost_commission.sql', import.meta.url),
  'utf8',
)

test('цена поставщика читается из usage и заголовка, ноль остаётся нулём', () => {
  assert.equal(readProviderCostRub({ cost_rub: 0.13 }, null), 0.13)
  assert.equal(readProviderCostRub({ cost: 0 }, null), 0)
  assert.equal(readProviderCostRub(null, { headers: { get: (name) => (name === 'cost-rub' ? '0,10' : null) } }), 0.1)
  assert.equal(readProviderCostRub({}, { headers: { get: () => null } }), null)
  assert.equal(normalizeProviderCostRub(-1), null)
  assert.equal(normalizeProviderCostRub(''), null)
})

test('номер запроса берётся из заголовка AITunnel', () => {
  const response = { headers: { get: (name) => (name === 'x-request-id' ? 'chat-034pYx9KaOzvCxWdvYoAvp' : null) } }
  assert.equal(readProviderRequestId(response, { id: 'chatcmpl-provider' }), 'chat-034pYx9KaOzvCxWdvYoAvp')
  assert.equal(readProviderRequestId(null, { id: 'chatcmpl-provider' }), null)
  assert.equal(readProviderRequestId(null, { id: 'stt-1234567890abcdef' }), 'stt-1234567890abcdef')
})

test('известная цена пишется как фактическая, неизвестная ждёт', async () => {
  const calls = []
  const supabase = {
    rpc: async (name, args) => {
      calls.push({ name, args })
      return { data: { ok: true }, error: null }
    },
  }
  await commitUsageFinancials(supabase, {
    userId: 'u',
    operationId: 'op',
    service: 'whisper-1',
    providerCostRub: 0.06,
    providerRequestId: 'stt-1234567890abcdef',
  })
  assert.equal(calls[0].name, 'record_usage_financials')
  assert.equal(calls[0].args.p_cost_source, 'provider_actual')
  assert.equal(calls[0].args.p_provider_cost_rub, 0.06)
  assert.equal(calls[1].name, 'release_usage_cost_pending')

  calls.length = 0
  await commitUsageFinancials(supabase, {
    userId: 'u',
    operationId: 'op-2',
    service: 'deepseek-v3.2',
    providerCostRub: null,
    providerRequestId: 'chat-034pYx9KaOzvCxWdvYoAvp',
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'note_usage_cost_pending')
  assert.equal(calls[0].args.p_provider_cost_rub, null)
  assert.equal(calls[0].args.p_provider_request_id, 'chat-034pYx9KaOzvCxWdvYoAvp')
})

test('нулевая цена поставщика тоже фактическая', async () => {
  const calls = []
  const supabase = {
    rpc: async (name, args) => {
      calls.push({ name, args })
      return { data: { ok: true }, error: null }
    },
  }
  await commitUsageFinancials(supabase, {
    userId: 'u',
    operationId: 'op',
    service: 'gpt-4o-mini-tts',
    providerCostRub: 0,
  })
  assert.equal(calls[0].args.p_cost_source, 'provider_actual')
  assert.equal(calls[0].args.p_provider_cost_rub, 0)
})

test('неудачная запись журнала оставляет ожидание с уже известной ценой', async () => {
  const calls = []
  const supabase = {
    rpc: async (name, args) => {
      calls.push(name)
      if (name === 'record_usage_financials') return { data: { ok: false, error: 'draw_not_found' }, error: null }
      return { data: { ok: true, args }, error: null }
    },
  }
  await commitUsageFinancials(supabase, {
    userId: 'u',
    operationId: 'op',
    service: 'deepseek-v3.2',
    providerCostRub: 0.04,
  })
  assert.deepEqual(calls, ['record_usage_financials', 'note_usage_cost_pending'])
})

test('списание передаёт цену поставщика в комиссию', async () => {
  const calls = []
  const { deps } = createTestLedger({ u: 20 })
  deps.commitUsage = async (args) => { calls.push(args) }
  const paid = await runReserved({
    userId: 'u',
    operationId: 'stt-1',
    ceilingRub: 1,
    service: 'whisper-1',
    execute: async () => ({
      chargeRub: 0.2,
      providerCostRub: 0.06,
      providerRequestId: 'stt-1234567890abcdef',
      result: { text: 'hi' },
    }),
  }, deps)
  assert.equal(paid.ok, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].providerCostRub, 0.06)
  assert.equal(calls[0].service, 'whisper-1')
  assert.equal(calls[0].providerRequestId, 'stt-1234567890abcdef')
})

test('месяц без цены поставщика не получает комиссию', () => {
  assert.match(sql, /usage_cost_pending/)
  assert.match(sql, /v_pending > 0/)
  assert.match(sql, /blocked_reason', 'cost_not_actual'/)
  assert.match(sql, /'preliminary_commission_rub', NULL/)
  assert.match(sql, /source_type = 'paid'/)
  assert.equal(sql.includes('tariff_estimate'), false)
  assert.equal(sql.includes('COALESCE(p.commission_rate'), false)
})
