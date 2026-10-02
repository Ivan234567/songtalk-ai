import { llmCeilingRub, llmSettledChargeRub } from './balance-rates.js'
import { createLedger } from './reservation-ledger.js'

export function isUncertainProviderError(err) {
  const name = String(err?.name || '')
  const code = String(err?.code || err?.cause?.code || '')
  const message = String(err?.message || '').toLowerCase()
  if (name === 'APIConnectionTimeoutError' || name === 'APIConnectionError' || name === 'APIUserAbortError') return true
  if (['ETIMEDOUT', 'ECONNRESET', 'ECONNABORTED', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'].includes(code)) {
    return true
  }
  return message.includes('timeout') || message.includes('timed out') || message.includes('socket hang up')
}

export function ledgerAdapter(ledger) {
  return {
    reserve: (args) => ledger.reserve(args),
    markStarted: (args) => ledger.markStarted(args),
    settle: (args) => ledger.settle(args),
    fail: (args) => ledger.fail(args),
    abandon: (args) => ledger.abandon(args),
  }
}

export async function runReserved(spec, deps) {
  const operationId = spec.operationId
  const reserved = await deps.reserve({
    userId: spec.userId,
    operationId,
    amountRub: spec.ceilingRub,
    service: spec.service || null,
    metadata: spec.metadata || null,
  })
  if (!reserved.ok) {
    return {
      ok: false,
      status: 402,
      error: 'Недостаточно средств. Пополните баланс.',
      providerCalled: false,
    }
  }
  if (reserved.status === 'settled') {
    return {
      ok: true,
      status: 200,
      replay: true,
      result: reserved.result,
      providerCalled: false,
    }
  }
  if (reserved.already || reserved.status !== 'reserved') {
    return {
      ok: false,
      status: 409,
      error: 'Операция уже выполняется',
      providerCalled: false,
    }
  }

  const started = await deps.markStarted({ userId: spec.userId, operationId })
  if (!started.ok || started.already || started.status !== 'started') {
    return {
      ok: false,
      status: 409,
      error: 'Операция уже выполняется',
      providerCalled: false,
    }
  }

  let produced = false
  try {
    const outcome = await spec.execute({
      noteProduced() { produced = true },
    })
    const chargeRub = Math.min(Number(spec.ceilingRub) || 0, Number(outcome?.chargeRub) || 0)
    const settled = await deps.settle({
      userId: spec.userId,
      operationId,
      chargeRub,
      providerCostRub: outcome?.providerCostRub ?? null,
      result: outcome?.result ?? null,
    })
    return {
      ok: true,
      status: 200,
      replay: false,
      providerCalled: true,
      chargeRub: settled.finalChargeRub,
      unusedRub: settled.unusedRub,
      result: outcome?.result ?? null,
      outcome,
    }
  } catch (err) {
    if (produced || isUncertainProviderError(err)) {
      await deps.abandon({ userId: spec.userId, operationId })
    } else {
      await deps.fail({ userId: spec.userId, operationId })
    }
    throw err
  }
}

export async function runBillableChat(deps, llm, model, spec) {
  const cap = Math.max(1, Math.floor(Number(spec.maxTokens) || 1))
  return runReserved({
    userId: spec.userId,
    operationId: spec.operationId,
    ceilingRub: llmCeilingRub(spec.messages, cap),
    service: model || 'deepseek-v3.2',
    metadata: spec.metadata || null,
    execute: async () => {
      const completion = await llm.chat.completions.create({
        model,
        messages: spec.messages,
        max_tokens: cap,
        ...(spec.temperature != null ? { temperature: spec.temperature } : {}),
      })
      const priced = llmSettledChargeRub(completion?.usage, spec.messages, cap)
      return {
        chargeRub: priced.charge,
        completion,
        result: { text: completion?.choices?.[0]?.message?.content || '' },
      }
    },
  }, deps)
}

export function completionFromPaid(paid) {
  if (paid?.replay) {
    return { choices: [{ message: { content: paid.result?.text || '' } }] }
  }
  return paid?.outcome?.completion
}

export function createTestLedger(balances) {
  const ledger = createLedger({ balances })
  return { ledger, deps: ledgerAdapter(ledger) }
}
