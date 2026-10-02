/**
 * Память той же машины состояний, что и SQL-функции резерва.
 * Деньги списываются с balance только в settle и abandon.
 * Открытый резерв уменьшает доступный остаток, но не сам balance_rub.
 */

const STALE_STARTED_MS = 15 * 60 * 1000
const STALE_RESERVED_MS = 2 * 60 * 1000

function kop(rub) {
  const value = Number(rub)
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100)
}

function rubFromKop(value) {
  return value / 100
}

function roundRub(value) {
  return rubFromKop(kop(value))
}

export function createLedger({ balances = {}, now = () => Date.now() } = {}) {
  const balanceKop = new Map(Object.entries(balances).map(([userId, amount]) => [userId, kop(amount)]))
  const ops = new Map()
  let chain = Promise.resolve()

  function locked(work) {
    const run = chain.then(() => work())
    chain = run.then(() => undefined, () => undefined)
    return run
  }

  function keyOf(userId, operationId) {
    return `${userId}|${operationId}`
  }

  function heldKop(userId) {
    let held = 0
    for (const op of ops.values()) {
      if (op.userId === userId && (op.status === 'reserved' || op.status === 'started')) held += op.amountKop
    }
    return held
  }

  function snapshot(op) {
    return {
      ok: true,
      status: op.status,
      already: true,
      operationId: op.operationId,
      amountRub: rubFromKop(op.amountKop),
      finalChargeRub: op.finalChargeKop == null ? null : rubFromKop(op.finalChargeKop),
      result: op.result || null,
    }
  }

  function sweep(userId) {
    const moment = now()
    for (const op of ops.values()) {
      if (op.userId !== userId) continue
      if (op.status === 'reserved' && moment - op.createdAt >= STALE_RESERVED_MS) {
        op.status = 'failed'
        op.settledAt = moment
        continue
      }
      if (op.status === 'started' && op.startedAt != null && moment - op.startedAt >= STALE_STARTED_MS) {
        charge(op, op.amountKop, 'abandoned')
      }
    }
  }

  function charge(op, chargeKop, status) {
    const balance = balanceKop.get(op.userId) || 0
    const taken = Math.min(balance, Math.max(0, chargeKop))
    balanceKop.set(op.userId, balance - taken)
    op.status = status
    op.finalChargeKop = taken
    op.settledAt = now()
    return taken
  }

  return {
    balance(userId) {
      return rubFromKop(balanceKop.get(userId) || 0)
    },
    available(userId) {
      return rubFromKop((balanceKop.get(userId) || 0) - heldKop(userId))
    },
    operation(userId, operationId) {
      return ops.get(keyOf(userId, operationId)) || null
    },
    reserve({ userId, operationId, amountRub }) {
      return locked(() => {
        sweep(userId)
        const existing = ops.get(keyOf(userId, operationId))
        if (existing) return snapshot(existing)
        const amountKop = kop(amountRub)
        if (amountKop <= 0) return { ok: false, error: 'invalid_amount' }
        const available = (balanceKop.get(userId) || 0) - heldKop(userId)
        if (available < amountKop) {
          return { ok: false, error: 'insufficient_balance', availableRub: rubFromKop(available) }
        }
        ops.set(keyOf(userId, operationId), {
          userId,
          operationId,
          amountKop,
          status: 'reserved',
          createdAt: now(),
          startedAt: null,
          settledAt: null,
          finalChargeKop: null,
          providerCostRub: null,
          result: null,
        })
        return { ok: true, status: 'reserved', already: false, operationId, amountRub: rubFromKop(amountKop) }
      })
    },
    markStarted({ userId, operationId }) {
      return locked(() => {
        const op = ops.get(keyOf(userId, operationId))
        if (!op) return { ok: false, error: 'not_found' }
        if (op.status === 'started') return { ok: true, status: 'started', already: true }
        if (op.status !== 'reserved') return { ok: false, error: 'invalid_state', status: op.status }
        op.status = 'started'
        op.startedAt = now()
        return { ok: true, status: 'started', already: false }
      })
    },
    settle({ userId, operationId, chargeRub, providerCostRub = null, result = null }) {
      return locked(() => {
        const op = ops.get(keyOf(userId, operationId))
        if (!op) return { ok: false, error: 'not_found' }
        if (op.status === 'settled') return snapshot(op)
        if (op.status !== 'started') return { ok: false, error: 'invalid_state', status: op.status }
        const chargeKop = Math.min(op.amountKop, Math.max(0, kop(chargeRub)))
        const taken = charge(op, chargeKop, 'settled')
        op.providerCostRub = providerCostRub
        op.result = result
        return {
          ok: true,
          status: 'settled',
          already: false,
          finalChargeRub: rubFromKop(taken),
          unusedRub: rubFromKop(op.amountKop - taken),
        }
      })
    },
    fail({ userId, operationId }) {
      return locked(() => {
        const op = ops.get(keyOf(userId, operationId))
        if (!op) return { ok: false, error: 'not_found' }
        if (op.status === 'failed' || op.status === 'settled' || op.status === 'abandoned') return snapshot(op)
        if (op.status !== 'reserved' && op.status !== 'started') {
          return { ok: false, error: 'invalid_state', status: op.status }
        }
        op.status = 'failed'
        op.settledAt = now()
        op.finalChargeKop = 0
        return { ok: true, status: 'failed', already: false, finalChargeRub: 0 }
      })
    },
    abandon({ userId, operationId }) {
      return locked(() => {
        const op = ops.get(keyOf(userId, operationId))
        if (!op) return { ok: false, error: 'not_found' }
        if (op.status === 'abandoned' || op.status === 'settled') return snapshot(op)
        if (op.status !== 'started') return { ok: false, error: 'invalid_state', status: op.status }
        const taken = charge(op, op.amountKop, 'abandoned')
        return { ok: true, status: 'abandoned', already: false, finalChargeRub: rubFromKop(taken) }
      })
    },
  }
}

export function roundMoney(value) {
  return roundRub(value)
}

export function createPaymentBook() {
  const orders = new Map()
  const balances = new Map()
  let chain = Promise.resolve()
  function locked(work) {
    const run = chain.then(() => work())
    chain = run.then(() => undefined, () => undefined)
    return run
  }
  return {
    add(order) {
      orders.set(order.id, { ...order, creditedAt: null })
    },
    balance(userId) {
      return balances.get(userId) || 0
    },
    credit(orderId) {
      return locked(() => {
        const order = orders.get(orderId)
        if (!order) return { ok: false, error: 'not_found' }
        if (order.creditedAt) return { ok: true, already: true, balance: balances.get(order.userId) || 0 }
        const next = roundRub((balances.get(order.userId) || 0) + Number(order.creditRub))
        balances.set(order.userId, next)
        order.creditedAt = Date.now()
        return { ok: true, already: false, balance: next }
      })
    },
  }
}
