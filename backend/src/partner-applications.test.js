import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const sql = fs.readFileSync(
  new URL('../../supabase/migrations/20261114153000_partner_applications.sql', import.meta.url),
  'utf8',
)
const routes = fs.readFileSync(new URL('./partner-applications.js', import.meta.url), 'utf8')

test('заявка не выдаёт ссылку без решения администратора', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.partner_applications/)
  assert.match(sql, /status IN \('pending', 'approved', 'rejected'\)/)
  assert.match(sql, /partner_applications_one_pending/)
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /REVOKE ALL ON TABLE public\.partner_applications FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /INSERT INTO public\.partners/)
  assert.match(sql, /referral_require_service_role/)
  assert.match(sql, /app_admins/)
  assert.match(sql, /v_rate > 0\.4000/)
  assert.equal(sql.includes('user_metadata'), false)
})

test('решение принимает только админ, email не берётся из тела запроса', () => {
  assert.match(routes, /readAppAdmin/)
  assert.match(routes, /admin_decide_partner_application/)
  assert.match(routes, /p_code: code/)
  assert.match(routes, /parseOptionalPromoCode/)
  assert.match(routes, /auth\.admin\.getUserById/)
  assert.equal(routes.includes('req.body.email'), false)
  assert.equal(routes.includes('req.body?.email'), false)
  assert.equal(routes.includes('user_metadata'), false)
})
