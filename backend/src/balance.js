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
export async function deductBalance(supabase, userId, amountRub, service = null, metadata = null) {
  if (!userId || amountRub <= 0) {
    return { ok: false, error: 'invalid_params' }
  }

  const { data, error } = await supabase.rpc('deduct_balance', {
    p_user_id: userId,
    p_amount_rub: amountRub,
    p_service: service ?? null,
    p_metadata: metadata ?? null,
  })

  if (error) throw error

  const result = data
  if (result.ok) {
    return { ok: true, newBalance: Number(result.new_balance) }
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
