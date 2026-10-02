/**
 * Хелперы баланса и транзакций (монетизация).
 * Баланс создаётся лениво при первом пополнении или списании.
 * Списание и пополнение выполняются через RPC в одной транзакции.
 */

/**
 * Возвращает текущий баланс пользователя в рублях.
 * Если записи нет (ленивое создание) — возвращает 0.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId — uuid пользователя
 * @returns {Promise<number>}
 */
export async function getBalance(supabase, userId) {
  const { data, error } = await supabase
    .from('user_balances')
    .select('balance_rub')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data ? Number(data.balance_rub) : 0
}

/**
 * Порог баланса (₽): ниже — возвращаем 402 и не вызываем платный API (п. 2.2 плана).
 */
export const BALANCE_THRESHOLD_RUB = 10

/**
 * Списание с баланса (атомарно: проверка → списание → запись в balance_transactions).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {number} amountRub — сумма к списанию (положительное число)
 * @param {string} [service] — модель/сервис для истории (например 'deepseek-v3.2', 'whisper-1')
 * @param {object} [metadata] — опционально: request_id, usage_units и т.д.
 * @returns {Promise<{ ok: true, newBalance: number } | { ok: false, error: string, currentBalance?: number }>}
 */
export function readOperationId(...candidates) {
  for (const value of candidates) {
    if (typeof value !== 'string') continue
    const id = value.trim()
    if (id && id.length <= 128) return id
  }
  return null
}

function reservationResult(data) {
  const result = data || {}
  return {
    ok: Boolean(result.ok),
    status: result.status || null,
    already: Boolean(result.already),
    error: result.error || null,
    finalChargeRub: result.final_charge_rub != null ? Number(result.final_charge_rub) : null,
    unusedRub: result.unused_rub != null ? Number(result.unused_rub) : null,
    result: result.result || null,
    availableRub: result.available_rub != null ? Number(result.available_rub) : null,
  }
}

export async function reserveOperation(supabase, { userId, operationId, amountRub, service = null, metadata = null }) {
  const { data, error } = await supabase.rpc('reserve_operation', {
    p_user_id: userId,
    p_operation_id: operationId,
    p_amount_rub: amountRub,
    p_service: service,
    p_metadata: metadata,
  })
  if (error) throw error
  return reservationResult(data)
}

export async function markOperationStarted(supabase, { userId, operationId }) {
  const { data, error } = await supabase.rpc('mark_operation_started', {
    p_user_id: userId,
    p_operation_id: operationId,
  })
  if (error) throw error
  return reservationResult(data)
}

export async function settleOperation(supabase, { userId, operationId, chargeRub, providerCostRub = null, result = null }) {
  const { data, error } = await supabase.rpc('settle_operation', {
    p_user_id: userId,
    p_operation_id: operationId,
    p_charge_rub: chargeRub,
    p_provider_cost_rub: providerCostRub,
    p_result: result,
  })
  if (error) throw error
  return reservationResult(data)
}

export async function failOperation(supabase, { userId, operationId }) {
  const { data, error } = await supabase.rpc('fail_operation', {
    p_user_id: userId,
    p_operation_id: operationId,
  })
  if (error) throw error
  return reservationResult(data)
}

export async function abandonOperation(supabase, { userId, operationId }) {
  const { data, error } = await supabase.rpc('abandon_operation', {
    p_user_id: userId,
    p_operation_id: operationId,
  })
  if (error) throw error
  return reservationResult(data)
}

export function reservationDeps(supabase) {
  return {
    reserve: (args) => reserveOperation(supabase, args),
    markStarted: (args) => markOperationStarted(supabase, args),
    settle: (args) => settleOperation(supabase, args),
    fail: (args) => failOperation(supabase, args),
    abandon: (args) => abandonOperation(supabase, args),
  }
}

export async function deductBalance(supabase, userId, amountRub, service = null, metadata = null, operationId = null) {
  if (!userId || amountRub <= 0) {
    return { ok: false, error: 'invalid_params' }
  }

  const { data, error } = await supabase.rpc('deduct_balance', {
    p_user_id: userId,
    p_amount_rub: amountRub,
    p_service: service ?? null,
    p_metadata: metadata ?? null,
    p_operation_id: operationId ?? null,
  })

  if (error) throw error

  const result = data
  if (result.ok) {
    return { ok: true, already: Boolean(result.already), newBalance: Number(result.new_balance) }
  }
  return {
    ok: false,
    error: result.error || 'deduct_failed',
    currentBalance: result.current_balance != null ? Number(result.current_balance) : undefined,
  }
}

/**
 * Ручное или шлюзовое пополнение баланса (атомарно).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {number} amountRub — сумма к зачислению
 * @param {'topup_manual' | 'topup_gateway'} type
 * @param {object} [metadata] — опционально (например payment_id для шлюза)
 * @returns {Promise<{ ok: true, newBalance: number } | { ok: false, error: string }>}
 */
export async function topupBalance(supabase, userId, amountRub, type, metadata = null) {
  if (!userId || amountRub <= 0) {
    return { ok: false, error: 'invalid_params' }
  }
  if (type !== 'topup_manual' && type !== 'topup_gateway') {
    return { ok: false, error: 'invalid_type' }
  }

  const { data, error } = await supabase.rpc('topup_balance', {
    p_user_id: userId,
    p_amount_rub: amountRub,
    p_type: type,
    p_metadata: metadata ?? null,
  })

  if (error) throw error

  const result = data
  if (result.ok) {
    return { ok: true, newBalance: Number(result.new_balance) }
  }
  return { ok: false, error: result.error || 'topup_failed' }
}
