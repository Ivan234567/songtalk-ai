import { readAppAdmin } from './admin-access.js'
import { parseOptionalPromoCode } from './referral.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function knownError(error) {
  const message = error?.message || ''
  if (message.includes('not_admin')) return { status: 403, error: 'not_admin' }
  if (message.includes('application_not_found')) return { status: 404, error: 'application_not_found' }
  if (message.includes('application_not_pending')) return { status: 409, error: 'application_not_pending' }
  if (message.includes('already_partner')) return { status: 409, error: 'already_partner' }
  if (message.includes('code_taken')) return { status: 409, error: 'code_taken' }
  if (message.includes('invalid_input') || message.includes('code_unavailable')) {
    return { status: 400, error: 'invalid_input' }
  }
  return null
}

function parseRate(value) {
  if (value == null || value === '') return null
  const rate = Number(value)
  if (!Number.isFinite(rate) || rate < 0 || rate > 0.99) return undefined
  return Math.round(rate * 10000) / 10000
}

async function accountEmail(supabase, userId) {
  const { data, error } = await supabase.auth.admin.getUserById(userId)
  if (error || !data?.user?.email) return null
  return data.user.email
}

async function requireAdmin(supabase, userId) {
  const admin = await readAppAdmin(supabase, userId)
  return admin.ok ? null : admin
}

export function registerPartnerApplicationRoutes(app, { supabase, asyncHandler, resolveUserId }) {
  app.get('/api/partner/application', asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })

    const partner = await supabase.from('partners').select('user_id').eq('user_id', userId).maybeSingle()
    if (partner.error) return res.status(500).json({ ok: false, error: 'application_read_failed' })
    if (partner.data) return res.json({ ok: true, state: 'partner' })

    const pending = await supabase
      .from('partner_applications')
      .select('status, decision_note, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (pending.error) return res.status(500).json({ ok: false, error: 'application_read_failed' })
    if (!pending.data) return res.json({ ok: true, state: 'none' })
    return res.json({
      ok: true,
      state: pending.data.status === 'pending' ? 'pending' : pending.data.status === 'rejected' ? 'rejected' : 'none',
      note: pending.data.decision_note,
      created_at: pending.data.created_at,
    })
  }))

  app.post('/api/partner/application', asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const email = await accountEmail(supabase, userId)
    if (!email) return res.status(400).json({ ok: false, error: 'invalid_input' })

    const partner = await supabase.from('partners').select('user_id').eq('user_id', userId).maybeSingle()
    if (partner.error) return res.status(500).json({ ok: false, error: 'application_read_failed' })
    if (partner.data) return res.status(409).json({ ok: false, error: 'already_partner' })

    const inserted = await supabase
      .from('partner_applications')
      .insert({ user_id: userId, email, status: 'pending' })
      .select('id, created_at')
      .single()
    if (inserted.error) {
      if (/partner_applications_one_pending|duplicate key/i.test(inserted.error.message || '')) {
        return res.status(409).json({ ok: false, error: 'application_pending' })
      }
      return res.status(500).json({ ok: false, error: 'application_create_failed' })
    }
    return res.status(201).json({ ok: true, state: 'pending', created_at: inserted.data.created_at })
  }))

  app.get('/api/admin/applications', asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const admin = await requireAdmin(supabase, userId)
    if (admin) return res.status(admin.error === 'not_admin' ? 403 : 500).json({ ok: false, error: admin.error })

    const rows = await supabase
      .from('partner_applications')
      .select('id, email, status, commission_rate, referral_code, decision_note, created_at, decided_at')
      .order('created_at', { ascending: false })
      .limit(50)
    if (rows.error) return res.status(500).json({ ok: false, error: 'application_read_failed' })
    return res.json({ ok: true, applications: rows.data || [] })
  }))

  async function decide(req, res, decision) {
    const userId = await resolveUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const admin = await requireAdmin(supabase, userId)
    if (admin) return res.status(admin.error === 'not_admin' ? 403 : 500).json({ ok: false, error: admin.error })
    if (!UUID_RE.test(req.params.id || '')) return res.status(400).json({ ok: false, error: 'invalid_input' })

    const rate = decision === 'approved' ? parseRate(req.body?.commission_rate) : null
    const code = decision === 'approved' ? parseOptionalPromoCode(req.body?.code) : null
    if (rate === undefined || code === undefined) return res.status(400).json({ ok: false, error: 'invalid_input' })
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : null

    const decided = await supabase.rpc('admin_decide_partner_application', {
      p_admin_id: userId,
      p_application_id: req.params.id,
      p_decision: decision,
      p_rate: rate,
      p_note: note,
      p_code: code,
    })
    if (decided.error) {
      const mapped = knownError(decided.error)
      if (mapped) return res.status(mapped.status).json({ ok: false, error: mapped.error })
      return res.status(500).json({ ok: false, error: 'application_decide_failed' })
    }
    return res.json(decided.data)
  }

  app.post('/api/admin/applications/:id/approve', asyncHandler((req, res) => decide(req, res, 'approved')))
  app.post('/api/admin/applications/:id/reject', asyncHandler((req, res) => decide(req, res, 'rejected')))
}
