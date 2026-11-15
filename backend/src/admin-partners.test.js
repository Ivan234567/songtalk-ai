import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const sql = fs.readFileSync(
  new URL('../../supabase/migrations/20261114170000_admin_list_issued_partners.sql', import.meta.url),
  'utf8',
)
const routes = fs.readFileSync(new URL('./admin-partners.js', import.meta.url), 'utf8')

test('список партнёров считает комиссию прежним месяцем и не подменяет пустое нулём', () => {
  assert.match(sql, /admin_list_issued_partners/)
  assert.match(sql, /referral_require_service_role/)
  assert.match(sql, /app_admins/)
  assert.match(sql, /preview_partner_month/)
  assert.match(sql, /referral_attributions/)
  assert.match(sql, /preliminary_commission_rub/)
  assert.equal(sql.includes('COALESCE(p.commission_rate'), false)
  assert.equal(sql.includes('user_metadata'), false)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.admin_list_issued_partners/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.admin_list_issued_partners/)
})

test('список отдаёт дату выдачи и признак администратора, не подменяя ставку', () => {
  const facts = fs.readFileSync(
    new URL('../../supabase/migrations/20261114200000_admin_partner_list_facts.sql', import.meta.url),
    'utf8',
  )
  assert.match(facts, /issued_at/)
  assert.match(facts, /app_admins a WHERE a\.user_id = p\.user_id/)
  assert.equal(facts.includes('COALESCE(p.commission_rate'), false)
  assert.equal(facts.includes('user_metadata'), false)
  assert.equal(facts.includes('referral_code ='), false)
})

test('свой промокод сохраняет прежнюю ссылку', () => {
  const custom = fs.readFileSync(
    new URL('../../supabase/migrations/20261114210000_partner_custom_code.sql', import.meta.url),
    'utf8',
  )
  assert.match(custom, /partner_code_aliases/)
  assert.match(custom, /admin_issue_partner_code/)
  assert.match(custom, /code_taken/)
  assert.match(custom, /p_code TEXT/)
  assert.match(custom, /JOIN partner_code_aliases/)
  assert.equal(custom.includes('user_metadata'), false)
})

test('сверка читает проблемы и ничего не подтверждает', () => {
  const sql = fs.readFileSync(
    new URL('../../supabase/migrations/20261114220000_admin_reconciliation.sql', import.meta.url),
    'utf8',
  )
  assert.match(sql, /admin_reconciliation/)
  assert.match(sql, /cost_source = 'unknown'/)
  assert.match(sql, /cost_source = 'tariff_estimate'/)
  assert.match(sql, /allocated_provider_cost_rub IS NULL/)
  assert.match(sql, /Налоговое правило не задано/)
  assert.match(sql, /refunds_tracked', false/)
  assert.match(routes, /\/api\/admin\/reconciliation/)
  assert.equal(sql.includes('UPDATE '), false)
  assert.equal(sql.includes('user_metadata'), false)
})

test('начисления читают месяцы и ничего не подтверждают', () => {
  const sql = fs.readFileSync(
    new URL('../../supabase/migrations/20261114230000_admin_partner_accruals.sql', import.meta.url),
    'utf8',
  )
  assert.match(sql, /admin_partner_accruals/)
  assert.match(sql, /preview_partner_month/)
  assert.match(sql, /confirmation_available', false/)
  assert.match(sql, /'confirmed', false/)
  assert.match(sql, /qualified_profit_rub/)
  assert.equal(sql.includes('COALESCE(p.commission_rate'), false)
  assert.equal(sql.includes('UPDATE '), false)
  assert.equal(sql.includes('user_metadata'), false)
  assert.match(routes, /\/api\/admin\/accruals/)
  assert.match(routes, /admin_partner_accruals/)
  assert.equal(routes.includes("app.post('/api/admin/accruals'"), false)
})

test('выплаты только читают историю и не создают запись', () => {
  const sql = fs.readFileSync(
    new URL('../../supabase/migrations/20261114240000_admin_partner_payouts.sql', import.meta.url),
    'utf8',
  )
  assert.match(sql, /admin_partner_payouts/)
  assert.match(sql, /partner_commission_payouts/)
  assert.match(sql, /recording_available', false/)
  assert.match(sql, /payout_manual_outside_system/)
  assert.match(sql, /'recorded_by', NULL/)
  assert.equal(sql.includes('INSERT '), false)
  assert.equal(sql.includes('UPDATE '), false)
  assert.equal(sql.includes('user_metadata'), false)
  assert.match(routes, /\/api\/admin\/payouts/)
  assert.match(routes, /admin_partner_payouts/)
  assert.equal(routes.includes("app.post('/api/admin/payouts'"), false)
})

test('журнал пишет только новые действия и не дописывает старые', () => {
  const sql = fs.readFileSync(
    new URL('../../supabase/migrations/20261114250000_admin_audit_log.sql', import.meta.url),
    'utf8',
  )
  assert.match(sql, /admin_audit_log/)
  assert.match(sql, /admin_audit_entries/)
  assert.match(sql, /code_issued/)
  assert.match(sql, /application_rejected/)
  assert.match(sql, /account_deleted/)
  assert.match(sql, /audit row is immutable/)
  assert.equal(sql.split("set_config('app.admin_actor'").length - 1, 4)
  assert.equal(sql.includes('INSERT INTO public.admin_audit_log SELECT'), false)
  assert.equal(sql.includes('user_metadata'), false)
  assert.match(routes, /\/api\/admin\/audit/)
  assert.match(routes, /admin_audit_entries/)
  assert.equal(routes.includes("app.post('/api/admin/audit'"), false)
})

test('ставка партнёра допускается до 99%', () => {
  const sql = fs.readFileSync(
    new URL('../../supabase/migrations/20261114260000_commission_rate_cap.sql', import.meta.url),
    'utf8',
  )
  assert.match(sql, /commission_rate <= 0\.9900/)
  assert.match(sql, /p_rate > 0\.9900/)
  assert.match(sql, /v_rate > 0\.9900/)
  assert.match(sql, /COALESCE\(p_rate, 0\.4000\)/)
  assert.equal(sql.includes('p_rate > 0.4000'), false)
  assert.equal(sql.includes('v_rate > 0.4000'), false)
  assert.match(routes, /rate > 0\.99/)
  assert.equal(routes.includes('rate > 0.4'), false)
})

test('список читает только администратор', () => {
  assert.match(routes, /readAppAdmin/)
  assert.match(routes, /admin_list_issued_partners/)
  assert.equal(routes.includes('user_metadata'), false)
})

const controls = fs.readFileSync(
  new URL('../../supabase/migrations/20261114190000_admin_partner_controls.sql', import.meta.url),
  'utf8',
)

test('статус и ставка меняются без смены кода, удаление не трогает администратора', () => {
  assert.match(controls, /admin_update_issued_partner/)
  assert.match(controls, /SET status = p_status/)
  assert.match(controls, /commission_rate = v_rate/)
  assert.equal(controls.includes('referral_code ='), false)
  assert.match(controls, /admin_account/)
  assert.match(controls, /DELETE FROM auth\.users/)
  assert.match(controls, /ledger row is immutable/)
  assert.match(controls, /attribution is immutable/)
  assert.match(routes, /admin_update_issued_partner/)
  assert.match(routes, /admin_purge_partner_account/)
  assert.match(routes, /confirm_email/)
  assert.match(routes, /admin_issue_partner_code/)
  assert.match(routes, /\/code/)
  assert.equal(routes.includes('user_metadata'), false)
})

test('вывод запрашивает партнёр, выплачивает только администратор', () => {
  const sql = fs.readFileSync(
    new URL('../../supabase/migrations/20261114270000_partner_withdrawals.sql', import.meta.url),
    'utf8',
  )
  assert.equal(sql.includes('tax_rule_not_defined'), false)
  assert.equal(sql.includes('Налоговое правило не задано'), false)
  assert.match(sql, /'payable', true/)
  assert.match(sql, /partner_withdrawal_requests/)
  assert.match(sql, /partner_request_withdrawal/)
  assert.match(sql, /admin_decide_withdrawal/)
  assert.match(sql, /admin_partner_referrals/)
  assert.match(sql, /amount_exceeds_available/)
  assert.match(sql, /admin_payout_only/)
  assert.match(sql, /DELETE FROM public.partner_withdrawal_requests/)
  assert.equal(sql.includes('user_metadata'), false)
  assert.match(routes, /\/api\/admin\/withdrawals/)
  assert.match(routes, /\/api\/admin\/partners\/:id\/referrals/)
  assert.equal(routes.includes("app.post('/api/admin/payouts'"), false)
})
