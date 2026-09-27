/**
 * Пополнение баланса через ITPAY (СБП / страница оплаты шлюза).
 * Секреты только в ITPAY_PUBLIC_ID и ITPAY_API_SECRET.
 * Сумма к оплате равна сумме зачисления: 50 (тест), 300, 500 или 1000 ₽.
 */

import crypto from 'crypto'

const ITPAY_API_BASE = (process.env.ITPAY_API_BASE || 'https://api.gw.itpay.ru/v1').replace(/\/$/, '')
const ALLOWED_CREDITS = new Set([50, 300, 500, 1000])
const CREDIT_EVENTS = new Set(['payment.pay', 'payment.completed'])
const FAIL_EVENTS = new Set(['payment.rejected', 'payment.cancelled', 'payment.errored'])
const FAIL_STATUSES = new Set(['cancelled', 'rejected', 'error'])
const CREDIT_STATUSES = new Set(['paid', 'completed'])

function frontendBase() {
  const raw = process.env.FRONTEND_URL || ''
  if (raw.startsWith('https://')) return raw.replace(/\/$/, '')
  return 'https://speakeasy-voice.vercel.app'
}

function authHeader() {
  const id = process.env.ITPAY_PUBLIC_ID
  const secret = process.env.ITPAY_API_SECRET
  if (!id || !secret) return null
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`
}

export function itpayConfigured() {
  return Boolean(process.env.ITPAY_PUBLIC_ID && process.env.ITPAY_API_SECRET)
}

function creditKopecks(creditRub) {
  return Math.round(Number(creditRub) * 100)
}

export function kopecksToAmount(kopecks) {
  const rub = Math.floor(kopecks / 100)
  const kop = kopecks % 100
  return `${rub}.${String(kop).padStart(2, '0')}`
}

function toKopecks(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

function extractTopLevelJson(text, key) {
  const match = new RegExp(`"${key}"\\s*:`).exec(text)
  if (!match) return null
  let i = match.index + match[0].length
  while (i < text.length && /\s/.test(text[i])) i += 1
  const start = i
  const opener = text[i]
  if (opener === '"') {
    i += 1
    let escaped = false
    for (; i < text.length; i += 1) {
      if (escaped) {
        escaped = false
        continue
      }
      if (text[i] === '\\') {
        escaped = true
        continue
      }
      if (text[i] === '"') return text.slice(start, i + 1)
    }
    return null
  }
  if (opener !== '{' && opener !== '[') {
    const literal = text.slice(i).match(/^(null|true|false|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/)
    return literal ? literal[1] : null
  }
  let depth = 0
  let inString = false
  let escaped = false
  for (; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{' || ch === '[') depth += 1
    else if (ch === '}' || ch === ']') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

function hmacHex(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

function hexEqual(left, right) {
  const a = Buffer.from(String(left).toLowerCase(), 'utf8')
  const b = Buffer.from(String(right).toLowerCase(), 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export function verifyItpaySignature(rawBody, header) {
  const secret = process.env.ITPAY_API_SECRET
  if (!secret || !header || !rawBody) return false
  const match = String(header).match(/t=(\d+)\s*,\s*v1=([a-fA-F0-9]+)/)
  if (!match) return false
  const timestamp = match[1]
  const expected = match[2]
  const rawText = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody)
  const rawData = extractTopLevelJson(rawText, 'data')
  const payloads = []
  if (rawData) payloads.push(rawData)
  try {
    const parsed = JSON.parse(rawText)
    if (parsed && typeof parsed.data !== 'undefined') payloads.push(JSON.stringify(parsed.data))
  } catch {
    // raw body is the source of truth; parsed fallback is optional
  }
  return payloads.some((payload) => hexEqual(hmacHex(secret, `${timestamp}.${payload}`), expected))
}

export function paymentPageUrl(payment) {
  const urls = payment?.payment_qr_urls
  if (!urls) return null
  if (typeof urls === 'string') {
    const trimmed = urls.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return paymentPageUrl({ payment_qr_urls: JSON.parse(trimmed) })
      } catch {
        return trimmed
      }
    }
    return trimmed
  }
  if (typeof urls === 'object') {
    return urls.desktop || urls.android || urls.ios || null
  }
  return null
}

async function itpayRequest(method, path, body) {
  const authorization = authHeader()
  if (!authorization) {
    const err = new Error('ITPAY is not configured')
    err.code = 'itpay_not_configured'
    throw err
  }
  const res = await fetch(`${ITPAY_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: authorization,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || (json && json.error)) {
    const err = new Error(typeof json?.error === 'string' ? json.error : `ITPAY HTTP ${res.status}`)
    err.status = res.status
    err.code = json?.error_code ?? 'itpay_error'
    throw err
  }
  return json?.data ?? json
}

function shouldCredit(eventType, status) {
  if (FAIL_STATUSES.has(status) || FAIL_EVENTS.has(eventType)) return false
  if (CREDIT_EVENTS.has(eventType)) return true
  return CREDIT_STATUSES.has(status)
}

async function findOrder(supabase, { itpayPaymentId, clientPaymentId }) {
  if (itpayPaymentId) {
    const { data, error } = await supabase
      .from('payment_orders')
      .select('id, user_id, client_payment_id, itpay_payment_id, credit_rub, charge_rub, status, credited_at')
      .eq('itpay_payment_id', itpayPaymentId)
      .maybeSingle()
    if (error) throw error
    if (data) return data
  }
  if (clientPaymentId) {
    const { data, error } = await supabase
      .from('payment_orders')
      .select('id, user_id, client_payment_id, itpay_payment_id, credit_rub, charge_rub, status, credited_at')
      .eq('client_payment_id', clientPaymentId)
      .maybeSingle()
    if (error) throw error
    return data
  }
  return null
}

async function markFailed(supabase, orderId) {
  await supabase
    .from('payment_orders')
    .update({ status: 'failed', updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .is('credited_at', null)
}

async function creditOrder(supabase, order, remoteAmount) {
  if (order.credited_at) return { ok: true, already: true, status: 'paid' }
  const remoteKop = toKopecks(remoteAmount)
  const expectedKop = toKopecks(order.charge_rub)
  if (remoteKop == null || expectedKop == null || remoteKop !== expectedKop) {
    console.error('[itpay] amount mismatch', { orderId: order.id, remoteKop, expectedKop })
    return { ok: false, error: 'amount_mismatch', status: 'pending' }
  }
  const { data, error } = await supabase.rpc('credit_gateway_payment', { p_order_id: order.id })
  if (error) throw error
  if (!data?.ok) return { ok: false, error: data?.error || 'credit_failed', status: 'pending' }
  return { ok: true, already: Boolean(data.already), status: 'paid', newBalance: data.new_balance }
}

export function registerItpayRoutes(app, { supabase, asyncHandler, resolveUserId }) {
  app.post('/api/balance/topup', asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req)
    if (!userId) return res.status(401).json({ error: 'Missing or invalid Authorization' })
    if (!itpayConfigured()) return res.status(503).json({ error: 'Оплата ещё не настроена' })

    const creditRub = Number(req.body?.amount_rub)
    if (!ALLOWED_CREDITS.has(creditRub)) {
      return res.status(400).json({ error: 'Доступны суммы 50, 300, 500 и 1000 ₽' })
    }

    const clientPaymentId = crypto.randomUUID()
    const charge = kopecksToAmount(creditKopecks(creditRub))
    const successUrl = `${frontendBase()}/dashboard?tab=balance&topup=${clientPaymentId}`

    const { data: order, error: insertError } = await supabase
      .from('payment_orders')
      .insert({
        user_id: userId,
        client_payment_id: clientPaymentId,
        credit_rub: creditRub,
        charge_rub: charge,
        status: 'pending',
      })
      .select('id')
      .single()

    if (insertError) throw insertError

    let payment
    try {
      payment = await itpayRequest('POST', '/payments', {
        amount: charge,
        client_payment_id: clientPaymentId,
        description: 'Пополнение баланса Speakeasy',
        success_url: successUrl,
        metadata: {
          user_id: userId,
          credit_rub: String(creditRub),
        },
      })
    } catch (err) {
      console.error('[itpay] create payment failed', { code: err.code, status: err.status, message: err.message })
      await supabase.from('payment_orders').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', order.id)
      return res.status(502).json({ error: 'Не удалось создать платёж. Попробуйте ещё раз.' })
    }

    const paymentUrl = paymentPageUrl(payment)
    const itpayPaymentId = typeof payment?.id === 'string' ? payment.id : null
    if (!paymentUrl || !itpayPaymentId) {
      console.error('[itpay] payment response missing url or id')
      await supabase.from('payment_orders').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', order.id)
      return res.status(502).json({ error: 'Платёжный сервис вернул неполный ответ' })
    }

    const { error: updateError } = await supabase
      .from('payment_orders')
      .update({ itpay_payment_id: itpayPaymentId, updated_at: new Date().toISOString() })
      .eq('id', order.id)
    if (updateError) throw updateError

    return res.json({
      ok: true,
      payment_url: paymentUrl,
      credit_rub: creditRub,
      charge_rub: charge,
      client_payment_id: clientPaymentId,
    })
  }))

  app.post('/api/balance/topup/confirm', asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req)
    if (!userId) return res.status(401).json({ error: 'Missing or invalid Authorization' })

    const clientPaymentId = typeof req.body?.client_payment_id === 'string' ? req.body.client_payment_id.trim() : ''
    if (!clientPaymentId) return res.status(400).json({ error: 'client_payment_id is required' })

    const order = await findOrder(supabase, { clientPaymentId })
    if (!order || order.user_id !== userId) return res.status(404).json({ error: 'Платёж не найден' })
    if (order.credited_at) return res.json({ ok: true, status: 'paid' })
    if (!order.itpay_payment_id) return res.json({ ok: true, status: 'pending' })
    if (!itpayConfigured()) return res.status(503).json({ error: 'Оплата ещё не настроена' })

    const payment = await itpayRequest('GET', `/payments/${encodeURIComponent(order.itpay_payment_id)}`)
    const status = payment?.status
    if (FAIL_STATUSES.has(status)) {
      await markFailed(supabase, order.id)
      return res.json({ ok: true, status: 'failed' })
    }
    if (!CREDIT_STATUSES.has(status)) return res.json({ ok: true, status: 'pending' })

    const result = await creditOrder(supabase, order, payment.amount)
    if (!result.ok && result.error === 'amount_mismatch') {
      return res.status(409).json({ error: 'Сумма платежа не совпала', status: 'pending' })
    }
    if (!result.ok) return res.status(500).json({ error: 'Не удалось зачислить платёж' })
    return res.json({ ok: true, status: 'paid', new_balance: result.newBalance ?? null })
  }))

  app.post('/api/payments/itpay/webhook', asyncHandler(async (req, res) => {
    if (!itpayConfigured()) return res.status(503).json({ error: 'ITPAY is not configured' })
    const header = req.headers['itpay-signature']
    if (!verifyItpaySignature(req.rawBody, header)) {
      console.error('[itpay] webhook signature rejected')
      return res.status(401).json({ error: 'invalid signature' })
    }

    const event = req.body || {}
    const eventType = typeof event.type === 'string' ? event.type : ''
    const data = event.data && typeof event.data === 'object' ? event.data : {}
    const order = await findOrder(supabase, {
      itpayPaymentId: typeof data.id === 'string' ? data.id : null,
      clientPaymentId: typeof data.client_payment_id === 'string' ? data.client_payment_id : null,
    })

    if (!order) return res.status(200).json({ status: 0 })

    if (shouldCredit(eventType, data.status)) {
      const result = await creditOrder(supabase, order, data.amount)
      if (!result.ok && result.error !== 'amount_mismatch') {
        return res.status(500).json({ error: 'credit failed' })
      }
    } else if (FAIL_EVENTS.has(eventType) || FAIL_STATUSES.has(data.status)) {
      await markFailed(supabase, order.id)
    }

    return res.status(200).json({ status: 0 })
  }))
}
