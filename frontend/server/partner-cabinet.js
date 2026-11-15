const MONTH_RE = /^(\d{4})-(\d{2})$/

export function parsePartnerMonth(value) {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || !MONTH_RE.test(value)) return undefined
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  if (month < 1 || month > 12 || year < 2020 || year > 2100) return undefined
  return `${value}-01`
}

function partnerErrorStatus(error) {
  if (error === 'not_a_partner') return 404
  if (error === 'invalid_input') return 400
  return 400
}

async function readPartner(res, supabase, userId, fn, args) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    const forbidden = /forbidden/i.test(error.message || '')
    console.error(`[partner] ${fn}:`, error.message)
    return res.status(forbidden ? 403 : 500).json({
      ok: false,
      error: forbidden ? 'forbidden' : 'partner_read_failed',
    })
  }
  if (!data?.ok) {
    return res.status(partnerErrorStatus(data?.error)).json({
      ok: false,
      error: data?.error === 'not_a_partner' || data?.error === 'invalid_input'
        ? data.error
        : 'partner_read_failed',
    })
  }
  return res.json(data)
}

export function registerPartnerCabinetRoutes(app, { supabase, asyncHandler, resolveUserId }) {
  async function requireUser(req, res) {
    const userId = await resolveUserId(req)
    if (!userId) {
      res.status(401).json({ ok: false, error: 'unauthorized' })
      return null
    }
    return userId
  }

  app.get('/api/partner/overview', asyncHandler(async (req, res) => {
    const userId = await requireUser(req, res)
    if (!userId) return
    const month = parsePartnerMonth(req.query.month)
    if (month === undefined) return res.status(400).json({ ok: false, error: 'invalid_input' })
    return readPartner(res, supabase, userId, 'partner_cabinet_overview', {
      p_user_id: userId,
      p_month: month,
    })
  }))

  app.get('/api/partner/referrals', asyncHandler(async (req, res) => {
    const userId = await requireUser(req, res)
    if (!userId) return
    const page = req.query.page == null || req.query.page === '' ? 1 : Number(req.query.page)
    if (!Number.isInteger(page)) return res.status(400).json({ ok: false, error: 'invalid_input' })
    const status = typeof req.query.status === 'string' ? req.query.status : null
    const query = typeof req.query.q === 'string' ? req.query.q : null
    return readPartner(res, supabase, userId, 'partner_cabinet_referrals', {
      p_user_id: userId,
      p_page: page,
      p_query: query,
      p_status: status,
    })
  }))

  app.get('/api/partner/months', asyncHandler(async (req, res) => {
    const userId = await requireUser(req, res)
    if (!userId) return
    return readPartner(res, supabase, userId, 'partner_cabinet_months', { p_user_id: userId })
  }))

  app.get('/api/partner/months/:month', asyncHandler(async (req, res) => {
    const userId = await requireUser(req, res)
    if (!userId) return
    const month = parsePartnerMonth(req.params.month)
    if (!month) return res.status(400).json({ ok: false, error: 'invalid_input' })
    return readPartner(res, supabase, userId, 'partner_cabinet_month', {
      p_user_id: userId,
      p_month: month,
    })
  }))

  app.get('/api/partner/payouts', asyncHandler(async (req, res) => {
    const userId = await requireUser(req, res)
    if (!userId) return
    return readPartner(res, supabase, userId, 'partner_cabinet_payouts', { p_user_id: userId })
  }))
}
