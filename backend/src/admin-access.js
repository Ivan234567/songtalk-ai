export async function readAppAdmin(supabase, userId) {
  const { data, error } = await supabase
    .from('app_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    const missing = /app_admins|schema cache|does not exist/i.test(error.message || '')
    return { ok: false, error: missing ? 'admin_store_missing' : 'admin_read_failed' }
  }
  if (!data?.user_id) return { ok: false, error: 'not_admin' }
  return { ok: true }
}

export function registerAdminAccessRoutes(app, { supabase, asyncHandler, resolveUserId }) {
  app.get('/api/admin/me', asyncHandler(async (req, res) => {
    const userId = await resolveUserId(req)
    if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' })

    const result = await readAppAdmin(supabase, userId)
    if (result.ok) return res.json({ ok: true })
    if (result.error === 'not_admin') return res.status(403).json({ ok: false, error: 'not_admin' })
    return res.status(500).json({ ok: false, error: result.error })
  }))
}
