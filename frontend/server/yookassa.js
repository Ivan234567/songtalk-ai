/**
 * Пополнение баланса через ЮKassa, сценарий «Умный платёж».
 * Секреты только в YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY.
 *
 * Комиссия сервиса ложится на пользователя. На баланс зачисляется номинал пакета.
 * СБП: 0,7% без НДС (услуги и цифровой контент, базовый тариф).
 * Остальные способы: 3,5% и НДС 22% на сумму комиссии.
 * Ставки: https://yookassa.ru/docs/support/payments/fees
 * Формула совпадает с frontend/lib/topup-pricing.ts
 */

import crypto from 'crypto'

const YOOKASSA_API = 'https://api.yookassa.ru/v3'
const ALLOWED_CREDITS = new Set([300, 500, 1000])
const SBP_FEE_BPS = 70
const CARD_FEE_BPS = 350
const CARD_VAT_BPS = 2200
const OTHER_FEE_BPS = Math.round((CARD_FEE_BPS * (10000 + CARD_VAT_BPS)) / 10000)

function frontendBase() {
  const raw = (process.env.FRONTEND_URL || '').replace(/\/$/, '')
  if (raw.startsWith('https://')) return raw
  if (raw.startsWith('http://localhost') || raw.startsWith('http://127.0.0.1')) return raw
  return 'https://speakeasy-voice.vercel.app'
}

export function yookassaConfigured() {
  return Boolean(process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY)
}

export function chargeKopecks(creditRub, method) {
  const creditKop = Math.round(Number(creditRub) * 100)
  const feeBps = method === 'sbp' ? SBP_FEE_BPS : OTHER_FEE_BPS
  const denom = 10000 - feeBps
  return Math.floor((creditKop * 10000 + denom - 1) / denom)
}

export function kopecksToAmount(kopecks) {
  const rub = Math.floor(kopecks / 100)
  const kop = kopecks % 100
  return `${rub}.${String(kop).padStart(2, '0')}`
}

function toKopecks(value) {
  const text = String(value ?? '').trim().replace(',', '.')
  const match = text.match(/^(\d+)(?:\.(\d{1,2}))?$/)
  if (!match) return null
  const frac = (match[2] || '').padEnd(2, '0')
  return Number(match[1]) * 100 + Number(frac)
}

function bearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization
  if (!header || typeof header !== 'string') return ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ''
}

async function yookassaRequest(method, path, body, idempotenceKey) {
  const shopId = process.env.YOOKASSA_SHOP_ID
  const secret = process.env.YOOKASSA_SECRET_KEY
  if (!shopId || !secret) {
    const err = new Error('YooKassa is not configured')
    err.code = 'not_configured'
    throw err
  }
  const headers = {
    Authorization: `Basic ${Buffer.from(`${shopId}:${secret}`).toString('base64')}`,
    'Content-Type': 'application/json',
  }
  if (idempotenceKey) headers['Idempotence-Key'] = idempotenceKey
  const res = await fetch(`${YOOKASSA_API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const err = new Error(typeof json?.description === 'string' ? json.description : `YooKassa HTTP ${res.status}`)
    err.status = res.status
    err.code = json?.code || 'yookassa_error'
    err.parameter = typeof json?.parameter === 'string' ? json.parameter : ''
    throw err
  }
  return json
}

function isReceiptError(err) {
  const param = String(err?.parameter || '')
  const message = String(err?.message || '')
  return /receipt|чек/i.test(`${param} ${message}`)
}

function paymentErrorMessage(err) {
  const text = `${err?.parameter || ''} ${err?.message || ''}`
  if (/sbp|payment_method/i.test(text)) {
    return 'СБП сейчас недоступен в магазине. Включите его в кабинете ЮKassa или выберите другие способы.'
  }
  return 'Не удалось создать платёж. Попробуйте ещё раз.'
}

function buildReceipt(email, chargeAmount, creditRub) {
  return {
    customer: { email },
    items: [
      {
        description: `Предоплата услуг Speakeasy, пакет ${creditRub} ₽`.slice(0, 128),
        quantity: '1.00',
        amount: { value: chargeAmount, currency: 'RUB' },
        vat_code: 1,
        payment_mode: 'full_prepayment',
        payment_subject: 'service',
      },
    ],
  }
}

function buildPaymentBody({ chargeAmount, returnUrl, creditRub, clientPaymentId, userId, method, email }) {
  const body = {
    amount: { value: chargeAmount, currency: 'RUB' },
    capture: true,
    confirmation: { type: 'redirect', return_url: returnUrl },
    description: `Пополнение баланса Speakeasy на ${creditRub} ₽`,
    metadata: {
      user_id: userId,
      credit_rub: String(creditRub),
      client_payment_id: clientPaymentId,
      method,
    },
  }
  if (method === 'sbp') body.payment_method_data = { type: 'sbp' }
  if (email) body.receipt = buildReceipt(email, chargeAmount, creditRub)
  return body
}

function emailFromToken(token) {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
    return typeof payload.email === 'string' && payload.email.includes('@') ? payload.email : null
  } catch {
    return null
  }
}

async function payerEmail(supabase, token) {
  if (!token) return null
  try {
    const { data } = await supabase.auth.getUser(token)
    const email = data?.user?.email
    if (typeof email === 'string' && email.includes('@')) return email
  } catch {
    // Чек можно собрать и из email в уже проверенном токене.
  }
  return emailFromToken(token)
}

async function findOrder(supabase, { providerPaymentId, clientPaymentId }) {
  if (providerPaymentId) {
    const { data, error } = await supabase
      .from('payment_orders')
      .select('id, user_id, client_payment_id, provider_payment_id, credit_rub, charge_rub, status, credited_at, payment_method')
      .eq('provider_payment_id', providerPaymentId)
      .maybeSingle()
    if (error) throw error
    if (data) return data
  }
  if (!clientPaymentId) return null
  const { data, error } = await supabase
    .from('payment_orders')
    .select('id, user_id, client_payment_id, provider_payment_id, credit_rub, charge_rub, status, credited_at, payment_method')
    .eq('client_payment_id', clientPaymentId)
    .maybeSingle()
  if (error) throw error
  return data
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
    console.error('[yookassa] amount mismatch', { orderId: order.id, remoteKop, expectedKop })
    return { ok: false, error: 'amount_mismatch', status: 'pending' }
  }
  const { data, error } = await supabase.rpc('credit_gateway_payment', { p_order_id: order.id })
  if (error) throw error
  if (!data?.ok) return { ok: false, error: data?.error || 'credit_failed', status: 'pending' }
  return { ok: true, already: Boolean(data.already), status: 'paid', newBalance: data.new_balance }
}

async function settlePayment(supabase, order, payment) {
  const metadataId = payment?.metadata?.client_payment_id
  if (metadataId && metadataId !== order.client_payment_id) {
    console.error('[yookassa] client_payment_id mismatch', { orderId: order.id })
    return { ok: false, error: 'metadata_mismatch', status: 'pending' }
  }
  const status = payment?.status
  if (status === 'succeeded' && payment?.paid === true) {
    return creditOrder(supabase, order, payment?.amount?.value)
  }
  if (status === 'canceled') {
    await markFailed(supabase, order.id)
    return { ok: true, status: 'failed' }
  }
  return { ok: true, status: 'pending' }
}

export function registerYookassaRoutes(app, { supabase, asyncHandler, resolveUserId }) {
  app.post('/api/balance/topup', asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req)
    if (!userId) return res.status(401).json({ error: 'Missing or invalid Authorization' })
    if (!yookassaConfigured()) return res.status(503).json({ error: 'Оплата ещё не настроена' })

    const creditRub = Number(req.body?.amount_rub)
    const method = req.body?.method === 'sbp' ? 'sbp' : req.body?.method === 'other' ? 'other' : ''
    if (!ALLOWED_CREDITS.has(creditRub) || !method) {
      return res.status(400).json({ error: 'Доступны пакеты 300, 500 и 1000 ₽, способ sbp или other' })
    }

    const clientPaymentId = crypto.randomUUID()
    const chargeAmount = kopecksToAmount(chargeKopecks(creditRub, method))
    const returnUrl = `${frontendBase()}/dashboard?tab=balance&topup=${clientPaymentId}`
    const email = await payerEmail(supabase, bearerToken(req))

    const { data: order, error: insertError } = await supabase
      .from('payment_orders')
      .insert({
        user_id: userId,
        client_payment_id: clientPaymentId,
        credit_rub: creditRub,
        charge_rub: chargeAmount,
        status: 'pending',
        provider: 'yookassa',
        payment_method: method,
      })
      .select('id')
      .single()

    if (insertError) throw insertError

    const create = (withReceipt, idempotenceKey) => yookassaRequest(
      'POST',
      '/payments',
      buildPaymentBody({
        chargeAmount,
        returnUrl,
        creditRub,
        clientPaymentId,
        userId,
        method,
        email: withReceipt ? email : null,
      }),
      idempotenceKey,
    )

    let payment
    try {
      payment = await create(Boolean(email), clientPaymentId)
    } catch (err) {
      if (email && isReceiptError(err)) {
        console.error('[yookassa] receipt rejected, retrying without receipt', { parameter: err.parameter })
        try {
          payment = await create(false, crypto.randomUUID())
        } catch (retryErr) {
          console.error('[yookassa] create payment failed', { code: retryErr.code, status: retryErr.status })
          await markFailed(supabase, order.id)
          return res.status(502).json({ error: paymentErrorMessage(retryErr) })
        }
      } else {
        console.error('[yookassa] create payment failed', { code: err.code, status: err.status, parameter: err.parameter })
        await markFailed(supabase, order.id)
        return res.status(502).json({ error: paymentErrorMessage(err) })
      }
    }

    const paymentUrl = payment?.confirmation?.confirmation_url
    const providerPaymentId = typeof payment?.id === 'string' ? payment.id : null
    if (!paymentUrl || !providerPaymentId) {
      console.error('[yookassa] payment response missing url or id')
      await markFailed(supabase, order.id)
      return res.status(502).json({ error: 'Платёжный сервис вернул неполный ответ' })
    }

    const { error: updateError } = await supabase
      .from('payment_orders')
      .update({ provider_payment_id: providerPaymentId, updated_at: new Date().toISOString() })
      .eq('id', order.id)
    if (updateError) throw updateError

    return res.json({
      ok: true,
      payment_url: paymentUrl,
      credit_rub: creditRub,
      charge_rub: chargeAmount,
      method,
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
    if (!order.provider_payment_id) return res.json({ ok: true, status: 'pending' })
    if (!yookassaConfigured()) return res.status(503).json({ error: 'Оплата ещё не настроена' })

    const payment = await yookassaRequest('GET', `/payments/${encodeURIComponent(order.provider_payment_id)}`)
    const result = await settlePayment(supabase, order, payment)
    if (!result.ok && result.error === 'amount_mismatch') {
      return res.status(409).json({ error: 'Сумма платежа не совпала', status: 'pending' })
    }
    if (!result.ok) return res.status(500).json({ error: 'Не удалось зачислить платёж' })
    return res.json({ ok: true, status: result.status, new_balance: result.newBalance ?? null })
  }))

  app.post('/api/payments/yookassa/webhook', asyncHandler(async (req, res) => {
    if (!yookassaConfigured()) return res.status(503).json({ error: 'YooKassa is not configured' })

    const event = req.body || {}
    const eventName = typeof event.event === 'string' ? event.event : ''
    const object = event.object && typeof event.object === 'object' ? event.object : {}
    const providerPaymentId = typeof object.id === 'string' ? object.id : null
    const clientPaymentId = typeof object.metadata?.client_payment_id === 'string'
      ? object.metadata.client_payment_id
      : null
    const order = await findOrder(supabase, { providerPaymentId, clientPaymentId })
    if (!order) return res.status(200).json({ ok: true })

    const lookupId = order.provider_payment_id || providerPaymentId
    if (!lookupId) return res.status(200).json({ ok: true })

    let payment
    try {
      payment = await yookassaRequest('GET', `/payments/${encodeURIComponent(lookupId)}`)
    } catch (err) {
      console.error('[yookassa] webhook payment lookup failed', { status: err.status })
      return res.status(500).json({ error: 'payment lookup failed' })
    }

    if (!order.provider_payment_id && payment?.id) {
      await supabase
        .from('payment_orders')
        .update({ provider_payment_id: payment.id, updated_at: new Date().toISOString() })
        .eq('id', order.id)
        .is('provider_payment_id', null)
    }

    const result = await settlePayment(supabase, order, payment)
    if (!result.ok && (result.error === 'amount_mismatch' || result.error === 'metadata_mismatch')) {
      return res.status(200).json({ ok: false })
    }
    if (!result.ok) return res.status(500).json({ error: result.error || 'credit failed' })
    if (eventName === 'payment.succeeded' && result.status !== 'paid') {
      return res.status(500).json({ error: 'payment not finished' })
    }
    return res.status(200).json({ ok: true })
  }))
}
