import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const sql = fs.readFileSync(
  new URL('../../supabase/migrations/20261114140000_app_admins.sql', import.meta.url),
  'utf8',
)
const routes = fs.readFileSync(new URL('./admin-access.js', import.meta.url), 'utf8')

test('допуск администратора — отдельная таблица, не роль и не metadata', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.app_admins/)
  assert.match(sql, /user_id UUID PRIMARY KEY REFERENCES auth\.users/)
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /REVOKE ALL ON TABLE public\.app_admins FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /GRANT SELECT ON TABLE public\.app_admins TO service_role/)
  assert.match(sql, /не user_metadata/)
  assert.equal(sql.includes('raw_user_meta_data'), false)
  assert.equal(/GRANT .* TO anon/.test(sql), false)
  assert.equal(/GRANT .* TO authenticated/.test(sql), false)
  assert.match(sql, /ivankapusta23@gmail\.com/)
})

test('проверка админа идёт по user_id из токена', () => {
  assert.match(routes, /resolveUserId\(req\)/)
  assert.match(routes, /eq\('user_id', userId\)/)
  assert.match(routes, /not_admin/)
  assert.equal(routes.includes('req.body'), false)
  assert.equal(routes.includes('partner_id'), false)
  assert.equal(routes.includes('user_metadata'), false)
})
