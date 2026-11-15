import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const sql = fs.readFileSync(
  new URL('../../supabase/migrations/20261112180000_referral_program.sql', import.meta.url),
  'utf8',
)
const rates = fs.readFileSync(new URL('./balance-rates.js', import.meta.url), 'utf8')
const yookassa = fs.readFileSync(new URL('./yookassa.js', import.meta.url), 'utf8')
const exchange = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8')

test('сумма списания и зачисления прежняя, формула цены и ЮKassa не переписаны', () => {
  assert.match(sql, /LEAST\(v_op\.amount_rub, GREATEST\(COALESCE\(p_charge_rub, 0\), 0\)\)/)
  assert.match(sql, /balance_rub = user_balances\.balance_rub \+ v_order\.credit_rub/)
  assert.equal(/charge_rub\s*-/.test(sql), false)
  assert.equal(sql.includes('0.94'), false)
  assert.equal(sql.includes('p_bonus_consumed'), false)
  assert.match(sql, /public\.apply_balance_draw\(/)
  assert.equal(rates.includes('export const LLM_MARKUP = 3'), true)
  assert.equal(rates.includes('export const TTS_MARKUP = 2'), true)
  assert.equal(yookassa.includes('export function chargeKopecks'), true)
  assert.equal(yookassa.includes('credit_gateway_payment'), true)
  assert.equal(exchange.includes("reason: 'welcome_bonus'"), false)
  assert.match(exchange, /rpc\('grant_welcome_bonus'/)
  assert.match(exchange, /bonusResult\.granted/)
})

test('бонус не становится оплаченной базой комиссии', () => {
  assert.match(sql, /source_type = 'paid'/)
  assert.match(sql, /operation_type <> 'welcome_bonus'/)
  assert.match(sql, /source_type = 'bonus' AND amount > 0/)
  assert.match(sql, /user_balance_lots_one_welcome/)
  assert.match(sql, /GREATEST\(COALESCE\(v_balance, 0\) - v_bonus - v_paid, 0\)/)
  assert.match(sql, /ADD VALUE IF NOT EXISTS 'welcome_bonus'/)
  assert.match(sql, /balance_rub = balance_rub \+ 50/)
  assert.match(sql, /metadata->>'reason', ''\) = 'welcome_bonus'/)
  assert.match(sql, /not_referred/)
  assert.match(sql, /registered_before_click/)
  assert.match(sql, /user_balance_lots_paid_is_gateway/)
  assert.equal(sql.includes("INSERT INTO partner_financial_ledger"), true)
  assert.equal(sql.includes("source_type, 'bonus'"), false)
  const partnerInsert = sql.slice(sql.indexOf('INSERT INTO partner_financial_ledger'))
  assert.match(partnerInsert, /NULL, NULL, LEAST\(v_rate, 0\.4000\), NULL, 'not_calculated'/)
  assert.equal(sql.includes('COALESCE(v_rate, 0.4000)'), false)
})

test('атрибуция одна, last click 30 дней, самореферал закрыт', () => {
  assert.match(sql, /user_id UUID NOT NULL UNIQUE REFERENCES auth\.users/)
  assert.match(sql, /INTERVAL '30 days'/)
  assert.match(sql, /ORDER BY created_at DESC, id DESC/)
  assert.match(sql, /self_referral/)
  assert.match(sql, /attribution is immutable/)
  assert.match(sql, /TG_OP = 'UPDATE' OR TG_OP = 'DELETE'/)
  assert.match(sql, /pg_advisory_xact_lock\(hashtext\('referral-attr:'/)
  assert.match(sql, /commission_rate NUMERIC\(5, 4\) NOT NULL DEFAULT 0\.4000/)
  assert.match(sql, /status IN \('active', 'paused', 'disabled'\)/)
  assert.equal(sql.toLowerCase().includes('ip_address'), false)
})

test('журнал опирается на фактическое списание и не двоит комиссию', () => {
  assert.match(sql, /draw_not_found/)
  assert.match(sql, /balance_ledger_operation_lot_key/)
  assert.match(sql, /usage_financial_journal_ledger_key/)
  assert.match(sql, /cost_not_actual/)
  assert.match(sql, /tax_rule_not_defined/)
  assert.match(sql, /payout_manual_outside_system/)
  assert.match(sql, /loss_carryforward/)
  assert.match(sql, /preview_partner_month/)
  assert.match(sql, /partner_commission_payouts/)
  assert.match(sql, /partner_ledger_id UUID NOT NULL UNIQUE/)
  assert.match(sql, /referral_require_service_role/)
  assert.match(sql, /gateway-topup:/)
})

test('журналы закрыты от клиента и от правки', () => {
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /CREATE POLICY "Partners can view own row"/)
  assert.match(sql, /USING \(auth\.uid\(\) = user_id\)/)
  assert.match(sql, /ledger row is immutable/)
  assert.match(sql, /REVOKE ALL ON TABLE partner_financial_ledger FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /REVOKE ALL ON TABLE usage_financial_journal FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /REVOKE ALL ON TABLE partner_commission_payouts FROM PUBLIC, anon, authenticated/)
  assert.equal(sql.includes('CREATE POLICY') && sql.includes('partner_financial_ledger FOR'), false)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.grant_welcome_bonus\(UUID\) TO service_role/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.apply_balance_draw\(UUID, TEXT, NUMERIC\) FROM PUBLIC, anon, authenticated, service_role/)
  assert.equal(sql.includes('GRANT INSERT'), false)
  assert.equal(sql.includes('GRANT UPDATE'), false)
})
