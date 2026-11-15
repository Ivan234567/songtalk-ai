import { readAppAdmin } from './admin-access.js'
import { parseOptionalPromoCode } from './referral.js'

const STATUSES = new Set(['all', 'active', 'paused', 'disabled'])
const PARTNER_STATUSES = new Set(['active', 'paused', 'disabled'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function knownError(error) {
  const message = error?.message || ''
  if (message.includes('request_not_found')) return { status: 404, error: 'request_not_found' }
  if (message.includes('already_decided')) return { status: 409, error: 'already_decided' }
  if (message.includes('not_available')) return { status: 409, error: 'not_available' }
  if (message.includes('not_admin')) return { status: 403, error: 'not_admin' }
  if (message.includes('admin_account')) return { status: 409, error: 'admin_account' }
  if (message.includes('partner_not_found')) return { status: 404, error: 'partner_not_found' }
  if (message.includes('code_taken')) return { status: 409, error: 'code_taken' }
  if (message.includes('invalid_input') || message.includes('purge_blocked') || message.includes('account_delete_failed')) {
    return { status: 400, error: message.includes('invalid_input') ? 'invalid_input' : 'purge_blocked' }
  }
  return null
}

function parseRate(value) {
  const rate = Number(value)
  if (!Number.isFinite(rate) || rate < 0 || rate > 0.99) return undefined
  return Math.round(rate * 10000) / 10000
}

async function accountEmail(supabase, userId) {
  const { data, error } = await supabase.auth.admin.getUserById(userId)
  if (error || !data?.user?.email) return null
  return data.user.email
}

export function registerAdminPartnerRoutes(app, { supabase, asyncHandler, resolveUserId }) {
  app.get('/api/admin/partners', asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const admin = await readAppAdmin(supabase, userId)
    if (!admin.ok) {
      return res.status(admin.error === 'not_admin' ? 403 : 500).json({ ok: false, error: admin.error })
    }

    const query = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : 'all'
    if (query.length > 128 || !STATUSES.has(status || 'all')) {
      return res.status(400).json({ ok: false, error: 'invalid_input' })
    }

    const listed = await supabase.rpc('admin_list_issued_partners', {
      p_admin_id: userId,
      p_query: query,
      p_status: status || 'all',
    })
    if (listed.error) {
      const mapped = knownError(listed.error)
      if (mapped) return res.status(mapped.status).json({ ok: false, error: mapped.error })
      return res.status(500).json({ ok: false, error: 'partners_read_failed' })
    }
    return res.json(listed.data)
  }))

  app.get('/api/admin/reconciliation', asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const admin = await readAppAdmin(supabase, userId)
    if (!admin.ok) {
      return res.status(admin.error === 'not_admin' ? 403 : 500).json({ ok: false, error: admin.error })
    }
    const listed = await supabase.rpc('admin_reconciliation', { p_admin_id: userId })
    if (listed.error) {
      const mapped = knownError(listed.error)
      if (mapped) return res.status(mapped.status).json({ ok: false, error: mapped.error })
      return res.status(500).json({ ok: false, error: 'reconciliation_read_failed' })
    }
    return res.json(listed.data)
  }))

  app.get('/api/admin/accruals', asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const admin = await readAppAdmin(supabase, userId)
    if (!admin.ok) {
      return res.status(admin.error === 'not_admin' ? 403 : 500).json({ ok: false, error: admin.error })
    }
    const listed = await supabase.rpc('admin_partner_accruals', { p_admin_id: userId })
    if (listed.error) {
      const mapped = knownError(listed.error)
      if (mapped) return res.status(mapped.status).json({ ok: false, error: mapped.error })
      return res.status(500).json({ ok: false, error: 'accruals_read_failed' })
    }
    return res.json(listed.data)
  }))

  app.get('/api/admin/payouts', asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const admin = await readAppAdmin(supabase, userId)
    if (!admin.ok) {
      return res.status(admin.error === 'not_admin' ? 403 : 500).json({ ok: false, error: admin.error })
    }
    const listed = await supabase.rpc('admin_partner_payouts', { p_admin_id: userId })
    if (listed.error) {
      const mapped = knownError(listed.error)
      if (mapped) return res.status(mapped.status).json({ ok: false, error: mapped.error })
      return res.status(500).json({ ok: false, error: 'payouts_read_failed' })
    }
    return res.json(listed.data)
  }))

  app.get('/api/admin/audit', asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const admin = await readAppAdmin(supabase, userId)
    if (!admin.ok) {
      return res.status(admin.error === 'not_admin' ? 403 : 500).json({ ok: false, error: admin.error })
    }
    const listed = await supabase.rpc('admin_audit_entries', { p_admin_id: userId })
    if (listed.error) {
      const mapped = knownError(listed.error)
      if (mapped) return res.status(mapped.status).json({ ok: false, error: mapped.error })
      return res.status(500).json({ ok: false, error: 'audit_read_failed' })
    }
    return res.json(listed.data)
  }))

  app.get('/api/admin/withdrawals', asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const admin = await readAppAdmin(supabase, userId)
    if (!admin.ok) {
      return res.status(admin.error === 'not_admin' ? 403 : 500).json({ ok: false, error: admin.error })
    }
    const listed = await supabase.rpc('admin_list_withdrawals', { p_admin_id: userId })
    if (listed.error) {
      const mapped = knownError(listed.error)
      if (mapped) return res.status(mapped.status).json({ ok: false, error: mapped.error })
      return res.status(500).json({ ok: false, error: 'withdrawals_read_failed' })
    }
    return res.json(listed.data)
  }))

  app.post('/api/admin/withdrawals/:id/:decision', asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const admin = await readAppAdmin(supabase, userId)
    if (!admin.ok) {
      return res.status(admin.error === 'not_admin' ? 403 : 500).json({ ok: false, error: admin.error })
    }
    if (!UUID_RE.test(req.params.id || '') || !['pay', 'reject'].includes(req.params.decision)) {
      return res.status(400).json({ ok: false, error: 'invalid_input' })
    }
    const note = typeof req.body?.note === 'string' ? req.body.note : ''
    const decided = await supabase.rpc('admin_decide_withdrawal', {
      p_admin_id: userId,
      p_request_id: req.params.id,
      p_decision: req.params.decision === 'pay' ? 'paid' : 'rejected',
      p_note: note,
    })
    if (decided.error) {
      const mapped = knownError(decided.error)
      if (mapped) return res.status(mapped.status).json({ ok: false, error: mapped.error })
      return res.status(500).json({ ok: false, error: 'withdrawal_decide_failed' })
    }
    return res.json(decided.data)
  }))

  app.get('/api/admin/partners/:id/referrals', asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const admin = await readAppAdmin(supabase, userId)
    if (!admin.ok) {
      return res.status(admin.error === 'not_admin' ? 403 : 500).json({ ok: false, error: admin.error })
    }
    if (!UUID_RE.test(req.params.id || '')) return res.status(400).json({ ok: false, error: 'invalid_input' })
    const listed = await supabase.rpc('admin_partner_referrals', {
      p_admin_id: userId,
      p_partner_id: req.params.id,
    })
    if (listed.error) {
      const mapped = knownError(listed.error)
      if (mapped) return res.status(mapped.status).json({ ok: false, error: mapped.error })
      return res.status(500).json({ ok: false, error: 'referrals_read_failed' })
    }
    return res.json(listed.data)
  }))

  app.post('/api/admin/partners/:id', asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const admin = await readAppAdmin(supabase, userId)
    if (!admin.ok) {
      return res.status(admin.error === 'not_admin' ? 403 : 500).json({ ok: false, error: admin.error })
    }
    if (!UUID_RE.test(req.params.id || '')) return res.status(400).json({ ok: false, error: 'invalid_input' })
    const status = typeof req.body?.status === 'string' ? req.body.status : ''
    const rate = parseRate(req.body?.commission_rate)
    if (!PARTNER_STATUSES.has(status) || rate === undefined) {
      return res.status(400).json({ ok: false, error: 'invalid_input' })
    }

    const updated = await supabase.rpc('admin_update_issued_partner', {
      p_admin_id: userId,
      p_partner_id: req.params.id,
      p_status: status,
      p_rate: rate,
    })
    if (updated.error) {
      const mapped = knownError(updated.error)
      if (mapped) return res.status(mapped.status).json({ ok: false, error: mapped.error })
      return res.status(500).json({ ok: false, error: 'partner_update_failed' })
    }
    return res.json(updated.data)
  }))

  app.post('/api/admin/partners/:id/code', asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const admin = await readAppAdmin(supabase, userId)
    if (!admin.ok) {
      return res.status(admin.error === 'not_admin' ? 403 : 500).json({ ok: false, error: admin.error })
    }
    if (!UUID_RE.test(req.params.id || '')) return res.status(400).json({ ok: false, error: 'invalid_input' })
    const code = parseOptionalPromoCode(req.body?.code)
    if (!code) return res.status(400).json({ ok: false, error: 'invalid_input' })

    const issued = await supabase.rpc('admin_issue_partner_code', {
      p_admin_id: userId,
      p_partner_id: req.params.id,
      p_code: code,
    })
    if (issued.error) {
      const mapped = knownError(issued.error)
      if (mapped) return res.status(mapped.status).json({ ok: false, error: mapped.error })
      return res.status(500).json({ ok: false, error: 'partner_code_failed' })
    }
    return res.json(issued.data)
  }))

  app.post('/api/admin/partners/:id/delete', asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const admin = await readAppAdmin(supabase, userId)
    if (!admin.ok) {
      return res.status(admin.error === 'not_admin' ? 403 : 500).json({ ok: false, error: admin.error })
    }
    if (!UUID_RE.test(req.params.id || '')) return res.status(400).json({ ok: false, error: 'invalid_input' })
    const typed = typeof req.body?.confirm_email === 'string' ? req.body.confirm_email.trim().toLowerCase() : ''
    if (!typed) return res.status(400).json({ ok: false, error: 'invalid_input' })

    const partner = await supabase.from('partners').select('user_id').eq('id', req.params.id).maybeSingle()
    if (partner.error) return res.status(500).json({ ok: false, error: 'partners_read_failed' })
    if (!partner.data) return res.status(404).json({ ok: false, error: 'partner_not_found' })
    const email = await accountEmail(supabase, partner.data.user_id)
    if (!email || email.toLowerCase() !== typed) {
      return res.status(400).json({ ok: false, error: 'email_mismatch' })
    }

    const purged = await supabase.rpc('admin_purge_partner_account', {
      p_admin_id: userId,
      p_partner_id: req.params.id,
    })
    if (purged.error) {
      const mapped = knownError(purged.error)
      if (mapped) return res.status(mapped.status).json({ ok: false, error: mapped.error })
      return res.status(500).json({ ok: false, error: 'partner_delete_failed' })
    }
    return res.json(purged.data)
  }))
}
