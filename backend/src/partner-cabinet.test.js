import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parsePartnerMonth } from './partner-cabinet.js'

const sql = fs.readFileSync(
  new URL('../../supabase/migrations/20261113160000_partner_cabinet_read.sql', import.meta.url),
  'utf8',
)
const routes = fs.readFileSync(new URL('./partner-cabinet.js', import.meta.url), 'utf8')

test('месяц принимается только как YYYY-MM', () => {
  assert.equal(parsePartnerMonth(undefined), null)
  assert.equal(parsePartnerMonth(''), null)
  assert.equal(parsePartnerMonth('2026-11'), '2026-11-01')
  assert.equal(parsePartnerMonth('2026-13'), undefined)
  assert.equal(parsePartnerMonth('2026-11-01'), undefined)
  assert.equal(parsePartnerMonth('11-2026'), undefined)
})

test('кабинет читает партнёра по user_id и не принимает partner_id', () => {
  for (const name of [
    'partner_cabinet_overview(UUID, DATE)',
    'partner_cabinet_referrals(UUID, INT, TEXT, TEXT)',
    'partner_cabinet_months(UUID)',
    'partner_cabinet_month(UUID, DATE)',
    'partner_cabinet_payouts(UUID)',
  ]) {
    assert.match(sql, new RegExp(`FUNCTION public\\.${name.split('(')[0]}`))
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name.replace('(', '\\(').replace(')', '\\)')} TO service_role`))
  }
  assert.equal(
    /FUNCTION public\.partner_cabinet_(overview|referrals|months|month|payouts)\([^)]*p_partner_id/.test(sql),
    false,
  )
  assert.match(sql, /FROM partners WHERE user_id = p_user_id/)
  assert.match(sql, /referral_require_service_role/)
  assert.match(sql, /preview_partner_month/)
  assert.match(sql, /mask_partner_email/)
  assert.match(sql, /qualified_profit_rub/)
  assert.match(sql, /confirmation_available', false/)
  assert.match(sql, /payout_manual_outside_system/)
  assert.match(sql, /SET search_path = pg_catalog, public, pg_temp/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.partner_cabinet_month_for_partner\(UUID, DATE\) FROM PUBLIC, anon, authenticated, service_role/)
  assert.equal(sql.includes('COALESCE(v_rate, 0.4000)'), false)
  assert.equal(routes.includes('partner_id'), false)
  assert.match(routes, /p_user_id: userId/)
})
