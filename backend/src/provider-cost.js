/**
 * Себестоимость для комиссии партнёра — только цена, которую назвал AITunnel.
 * Ставка из нашего тарифа сюда не подставляется: пока цены нет, месяц остаётся без комиссии.
 */

export function normalizeProviderCostRub(raw) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? raw : null
  }
  if (raw == null) return null
  const text = String(raw).trim().replace(',', '.')
  if (!text) return null
  const value = Number(text)
  return Number.isFinite(value) && value >= 0 ? value : null
}

function headerValue(response, name) {
  const headers = response?.headers
  if (!headers) return null
  if (typeof headers.get === 'function') return headers.get(name)
  const lowered = name.toLowerCase()
  return headers[name] ?? headers[lowered] ?? null
}

export function readProviderCostRub(usage, response) {
  const fromUsage = normalizeProviderCostRub(usage?.cost_rub ?? usage?.cost)
  if (fromUsage != null) return fromUsage
  return normalizeProviderCostRub(headerValue(response, 'cost-rub'))
}

export function readProviderRequestId(response, body) {
  const header = headerValue(response, 'x-request-id')
  const fromHeader = typeof header === 'string' ? header.trim() : ''
  if (fromHeader) return fromHeader.slice(0, 80)
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  if (/^[a-z]{2,12}-[A-Za-z0-9]{16,}$/.test(id) && !id.startsWith('chatcmpl-')) return id.slice(0, 80)
  return null
}

export async function settleProviderCall(request) {
  if (request && typeof request.withResponse === 'function') {
    const wrapped = await request.withResponse()
    return { data: wrapped.data, response: wrapped.response }
  }
  const data = await request
  return { data, response: data?.response ?? null }
}

export async function commitUsageFinancials(supabase, {
  userId,
  operationId,
  service,
  model = null,
  providerCostRub = null,
  providerRequestId = null,
}) {
  const cost = normalizeProviderCostRub(providerCostRub)
  const serviceType = typeof service === 'string' && service.trim() ? service.trim() : 'usage'
  if (cost != null) {
    const recorded = await supabase.rpc('record_usage_financials', {
      p_user_id: userId,
      p_operation_id: operationId,
      p_service_type: serviceType,
      p_model: model,
      p_provider: 'aitunnel',
      p_provider_cost_rub: cost,
      p_cost_source: 'provider_actual',
    })
    if (!recorded.error && recorded.data?.ok) {
      await supabase.rpc('release_usage_cost_pending', {
        p_user_id: userId,
        p_operation_id: operationId,
      })
      return { ok: true, recorded: true }
    }
  }
  await supabase.rpc('note_usage_cost_pending', {
    p_user_id: userId,
    p_operation_id: operationId,
    p_service_type: serviceType,
    p_model: model,
    p_provider_request_id: providerRequestId,
    p_provider_cost_rub: cost,
  })
  return { ok: true, recorded: false }
}

export async function fetchAitunnelRequestCost(requestId) {
  const id = typeof requestId === 'string' ? requestId.trim() : ''
  const key = process.env.AITUNNEL_API_KEY
  if (!id || !key) return null
  const base = (process.env.AITUNNEL_BASE_URL || 'https://api.aitunnel.ru/v1').replace(/\/$/, '')
  const response = await fetch(`${base}/aitunnel/requests/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) return null
  const body = await response.json().catch(() => null)
  return normalizeProviderCostRub(body?.cost_rub)
}

export async function resolvePendingUsageCosts(supabase, fetchCost = fetchAitunnelRequestCost) {
  const listed = await supabase.rpc('list_usage_cost_pending', { p_limit: 30 })
  if (listed.error || !listed.data?.ok) return
  const rows = Array.isArray(listed.data.rows) ? listed.data.rows : []
  for (const row of rows) {
    try {
      let cost = normalizeProviderCostRub(row.provider_cost_rub)
      if (cost == null && row.provider_request_id) cost = await fetchCost(row.provider_request_id)
      if (cost == null) continue
      await commitUsageFinancials(supabase, {
        userId: row.user_id,
        operationId: row.operation_id,
        service: row.service_type,
        model: row.model,
        providerCostRub: cost,
        providerRequestId: row.provider_request_id,
      })
    } catch (err) {
      console.error('[billing] pending provider cost was not resolved', err?.message || err)
    }
  }
}

export async function refreshProviderCosts(supabase) {
  try {
    await resolvePendingUsageCosts(supabase)
  } catch (err) {
    console.error('[billing] pending provider costs were not resolved', err?.message || err)
  }
}
