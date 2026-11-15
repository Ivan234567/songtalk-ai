-- pgTAP: реферальная миграция 20261112180000_referral_program.sql
-- Ожидает уже применённые миграции баланса и платежей. Транзакция откатывается.

BEGIN;

SELECT set_config('request.jwt.claim.role', 'service_role', true);

SELECT plan(49);

INSERT INTO auth.users (id, email, created_at)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'partner@example.com', clock_timestamp()),
  ('22222222-2222-4222-8222-222222222222', 'fresh@example.com', clock_timestamp()),
  ('33333333-3333-4333-8333-333333333333', 'old@example.com', clock_timestamp() - INTERVAL '400 days'),
  ('44444444-4444-4444-8444-444444444444', 'plain@example.com', clock_timestamp()),
  ('55555555-5555-4555-8555-555555555555', 'cancel@example.com', clock_timestamp()),
  ('66666666-6666-4666-8666-666666666666', 'unknown@example.com', clock_timestamp());

INSERT INTO partners (user_id, referral_code)
VALUES ('11111111-1111-4111-8111-111111111111', 'PARTNER1');

INSERT INTO user_balances (user_id, balance_rub)
VALUES ('44444444-4444-4444-8444-444444444444', 10);

SELECT record_referral_click('PARTNER1', 'visitor-self-0001', '/r/PARTNER1', NULL, NULL);
SELECT attribute_referral('11111111-1111-4111-8111-111111111111'::uuid, 'visitor-self-0001');

SELECT ok(
  (SELECT attribute_referral('11111111-1111-4111-8111-111111111111'::uuid, 'visitor-self-0001') ->> 'error') = 'self_referral',
  'self-referral is rejected'
);

SELECT ok(
  (SELECT count(*) FROM referral_attributions WHERE user_id = '11111111-1111-4111-8111-111111111111') = 0,
  'self-referral does not create an attribution'
);

SELECT record_referral_click('PARTNER1', 'visitor-old-000001', '/r/PARTNER1', NULL, NULL);

SELECT ok(
  (SELECT attribute_referral('33333333-3333-4333-8333-333333333333'::uuid, 'visitor-old-000001') ->> 'error') = 'account_created_before_click'
  AND (SELECT count(*) FROM referral_attributions WHERE user_id = '33333333-3333-4333-8333-333333333333') = 0,
  'old account is not bound'
);

SELECT grant_welcome_bonus('33333333-3333-4333-8333-333333333333'::uuid);

SELECT ok(
  COALESCE((SELECT balance_rub FROM user_balances WHERE user_id = '33333333-3333-4333-8333-333333333333'), 0) = 0
  AND (SELECT count(*) FROM user_balance_lots WHERE user_id = '33333333-3333-4333-8333-333333333333') = 0,
  'old account does not receive a welcome bonus'
);

SELECT record_referral_click('PARTNER1', 'visitor-fresh-0001', '/r/PARTNER1', NULL, NULL);
UPDATE auth.users
SET created_at = clock_timestamp()
WHERE id = '22222222-2222-4222-8222-222222222222';
SELECT attribute_referral('22222222-2222-4222-8222-222222222222'::uuid, 'visitor-fresh-0001');

SELECT ok(
  (SELECT count(*) FROM referral_attributions WHERE user_id = '22222222-2222-4222-8222-222222222222') = 1,
  'new account receives an attribution'
);

SELECT ok(
  (SELECT attribute_referral('22222222-2222-4222-8222-222222222222'::uuid, 'visitor-fresh-0001') ->> 'already') = 'true'
  AND (SELECT count(*) FROM referral_attributions WHERE user_id = '22222222-2222-4222-8222-222222222222') = 1,
  'repeat call for a bound user does not create a duplicate'
);

SELECT grant_welcome_bonus('22222222-2222-4222-8222-222222222222'::uuid);

SELECT ok(
  (SELECT balance_rub FROM user_balances WHERE user_id = '22222222-2222-4222-8222-222222222222') = 50
  AND (SELECT count(*) FROM user_balance_lots WHERE user_id = '22222222-2222-4222-8222-222222222222' AND source_type = 'bonus') = 1,
  'referral signup receives a welcome bonus of 50'
);

SELECT grant_welcome_bonus('22222222-2222-4222-8222-222222222222'::uuid);

SELECT ok(
  (SELECT balance_rub FROM user_balances WHERE user_id = '22222222-2222-4222-8222-222222222222') = 50
  AND (SELECT count(*) FROM balance_ledger WHERE user_id = '22222222-2222-4222-8222-222222222222' AND operation_type = 'welcome_bonus') = 1,
  'welcome bonus is granted only once'
);

SELECT grant_welcome_bonus('44444444-4444-4444-8444-444444444444'::uuid);

SELECT ok(
  (SELECT balance_rub FROM user_balances WHERE user_id = '44444444-4444-4444-8444-444444444444') = 10,
  'signup without a referral does not receive a welcome bonus'
);

INSERT INTO payment_orders (
  id, user_id, client_payment_id, credit_rub, charge_rub, provider, provider_payment_id, payment_method
) VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '22222222-2222-4222-8222-222222222222',
  'pay-fresh',
  100,
  115,
  'yookassa',
  'yk-fresh',
  'sbp'
);

SELECT credit_gateway_payment('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid);
SELECT credit_gateway_payment('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid);

SELECT ok(
  (SELECT balance_rub FROM user_balances WHERE user_id = '22222222-2222-4222-8222-222222222222') = 150,
  'repeating one payment does not credit the balance twice'
);

SELECT ok(
  (SELECT original_amount FROM user_balance_lots
    WHERE user_id = '22222222-2222-4222-8222-222222222222' AND source_type = 'paid') = 100
  AND (SELECT count(*) FROM user_balance_lots
    WHERE user_id = '22222222-2222-4222-8222-222222222222' AND source_type = 'paid') = 1,
  'payment credits credit_rub and creates one paid lot'
);

SELECT topup_balance(
  '22222222-2222-4222-8222-222222222222'::uuid,
  40,
  'topup_manual',
  '{"reason":"goodwill"}'::jsonb
);

SELECT ok(
  (SELECT count(*) FROM user_balance_lots
    WHERE user_id = '22222222-2222-4222-8222-222222222222' AND source_type = 'paid') = 1
  AND (SELECT COALESCE(SUM(original_amount), 0) FROM user_balance_lots
    WHERE user_id = '22222222-2222-4222-8222-222222222222' AND source_type = 'paid') = 100,
  'manual adjustment does not become a paid lot'
);

SELECT deduct_balance(
  '22222222-2222-4222-8222-222222222222'::uuid,
  170,
  'deepseek-v3.2',
  '{}'::jsonb,
  'op-mixed'
);

SELECT ok(
  (SELECT abs(amount) FROM balance_ledger WHERE operation_id = 'op-mixed' AND source_type = 'bonus') = 50
  AND (SELECT abs(amount) FROM balance_ledger WHERE operation_id = 'op-mixed' AND source_type = 'paid') = 100
  AND (SELECT abs(amount) FROM balance_ledger WHERE operation_id = 'op-mixed' AND source_type = 'legacy_unclassified') = 20,
  'mixed spend takes 50 bonus, 100 paid and 20 legacy'
);

SELECT ok(
  (
    SELECT (c ->> 'balance_rub')::numeric
      = (c ->> 'bonus_remaining')::numeric
        + (c ->> 'paid_remaining')::numeric
        + (c ->> 'legacy_unclassified')::numeric
      AND (c ->> 'drift')::numeric >= 0
    FROM (SELECT balance_composition('22222222-2222-4222-8222-222222222222'::uuid) AS c) AS composition
  ),
  'lot remainders plus legacy equal the total balance'
);

SELECT record_usage_financials(
  '22222222-2222-4222-8222-222222222222'::uuid,
  'op-mixed',
  'deepseek-v3.2',
  'deepseek-v3.2',
  'DeepInfra',
  34,
  'provider_actual'
);

SELECT ok(
  (SELECT eligible_revenue_rub FROM partner_financial_ledger WHERE operation_id = 'op-mixed') = 100
  AND (SELECT allocated_provider_cost_rub FROM partner_financial_ledger WHERE operation_id = 'op-mixed') = 20,
  'bonus and legacy API cost do not reduce partner profit'
);

SELECT ok(
  (SELECT (preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNER1'),
      CURRENT_DATE
    ) ->> 'excluded_bonus_provider_cost_rub')::numeric) = 10
  AND (SELECT (preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNER1'),
      CURRENT_DATE
    ) ->> 'paid_provider_cost_rub')::numeric) = 20,
  'monthly preview keeps bonus API cost outside partner cost'
);

SELECT ok(
  (SELECT commission_rate FROM partner_financial_ledger WHERE operation_id = 'op-mixed') = 0.4,
  'partner operation rate is 40 percent'
);

SELECT ok(
  (SELECT (preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNER1'),
      CURRENT_DATE
    ) ->> 'preliminary_commission_rub')::numeric) = 32
  AND (SELECT preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNER1'),
      CURRENT_DATE
    ) ->> 'blocked_reason') = 'tax_rule_not_defined'
  AND (SELECT preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNER1'),
      CURRENT_DATE
    ) ->> 'payable') = 'false'
  AND (SELECT count(*) FROM partner_financial_ledger WHERE status = 'confirmed') = 0,
  'qualified profit of 80 has a preliminary commission of 32 and is not payable'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM partner_financial_ledger
    WHERE status = 'confirmed'
      AND commission_amount_rub > round(GREATEST(eligible_profit_rub, 0) * commission_rate, 2)
  ),
  'no confirmed commission exceeds 40 percent of qualified profit'
);

INSERT INTO payment_orders (
  id, user_id, client_payment_id, credit_rub, charge_rub, provider, provider_payment_id, payment_method
) VALUES (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '55555555-5555-4555-8555-555555555555',
  'pay-cancel',
  80,
  90,
  'yookassa',
  'yk-cancel',
  'other'
);

SELECT credit_gateway_payment('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid);
SELECT reserve_operation(
  '55555555-5555-4555-8555-555555555555'::uuid,
  'op-cancel',
  30,
  'deepseek-v3.2',
  '{}'::jsonb
);
SELECT mark_operation_started('55555555-5555-4555-8555-555555555555'::uuid, 'op-cancel');
SELECT fail_operation('55555555-5555-4555-8555-555555555555'::uuid, 'op-cancel');

SELECT ok(
  (SELECT balance_rub FROM user_balances WHERE user_id = '55555555-5555-4555-8555-555555555555') = 80
  AND (SELECT remaining_amount FROM user_balance_lots
    WHERE user_id = '55555555-5555-4555-8555-555555555555' AND source_type = 'paid') = 80,
  'cancelling an operation does not take money'
);

SELECT ok(
  (SELECT count(*) FROM balance_ledger
    WHERE user_id = '55555555-5555-4555-8555-555555555555' AND operation_type = 'usage') = 0,
  'cancelled operation does not draw lots'
);

SELECT fail_operation('55555555-5555-4555-8555-555555555555'::uuid, 'op-cancel');

SELECT ok(
  (SELECT balance_rub FROM user_balances WHERE user_id = '55555555-5555-4555-8555-555555555555') = 80
  AND (SELECT remaining_amount FROM user_balance_lots
    WHERE user_id = '55555555-5555-4555-8555-555555555555' AND source_type = 'paid') = 80
  AND (SELECT count(*) FROM balance_ledger
    WHERE user_id = '55555555-5555-4555-8555-555555555555' AND operation_type = 'usage') = 0,
  'repeating a cancellation does not take or restore money'
);

SELECT record_referral_click('PARTNER1', 'visitor-unknown-01', '/r/PARTNER1', NULL, NULL);
UPDATE auth.users
SET created_at = clock_timestamp()
WHERE id = '66666666-6666-4666-8666-666666666666';
SELECT attribute_referral('66666666-6666-4666-8666-666666666666'::uuid, 'visitor-unknown-01');

INSERT INTO payment_orders (
  id, user_id, client_payment_id, credit_rub, charge_rub, provider, provider_payment_id, payment_method
) VALUES (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  '66666666-6666-4666-8666-666666666666',
  'pay-unknown',
  30,
  35,
  'yookassa',
  'yk-unknown',
  'sbp'
);

SELECT credit_gateway_payment('dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid);
SELECT deduct_balance(
  '66666666-6666-4666-8666-666666666666'::uuid,
  10,
  'whisper-1',
  '{}'::jsonb,
  'op-unknown'
);
SELECT record_usage_financials(
  '66666666-6666-4666-8666-666666666666'::uuid,
  'op-unknown',
  'whisper-1',
  'whisper-1',
  'AITunnel',
  NULL,
  'unknown'
);

SELECT ok(
  (SELECT confirm_partner_profit('op-unknown', NULL) ->> 'ok') = 'false'
  AND (SELECT count(*) FROM partner_financial_ledger
    WHERE operation_id = 'op-unknown' AND status = 'confirmed') = 0,
  'unknown API cost blocks commission confirmation'
);

SELECT ok(
  (SELECT preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNER1'),
      CURRENT_DATE
    ) ->> 'blocked_reason') = 'cost_not_actual'
  AND (SELECT preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNER1'),
      CURRENT_DATE
    ) ->> 'payable') = 'false',
  'a month with unknown cost cannot confirm or pay commission'
);

INSERT INTO auth.users (id, email, created_at)
VALUES
  ('77777777-7777-4777-8777-777777777777', 'order@example.com', clock_timestamp()),
  ('88888888-8888-4888-8888-888888888888', 'expired@example.com', clock_timestamp()),
  ('12121212-1212-4212-8212-121212121212', 'window@example.com', clock_timestamp() - INTERVAL '40 days'),
  ('99999999-9999-4999-8999-999999999999', 'shared@example.com', clock_timestamp());

SELECT record_referral_click('PARTNER1', 'visitor-expired-01', '/r/PARTNER1', NULL, NULL);
UPDATE referral_clicks
SET created_at = clock_timestamp() - INTERVAL '31 days'
WHERE anonymous_id = 'visitor-expired-01';

SELECT ok(
  (SELECT attribute_referral('88888888-8888-4888-8888-888888888888'::uuid, 'visitor-expired-01') ->> 'error') = 'no_click_in_window'
  AND (SELECT count(*) FROM referral_attributions WHERE user_id = '88888888-8888-4888-8888-888888888888') = 0,
  'a click older than 30 days does not create an attribution'
);

SELECT record_referral_click('PARTNER1', 'visitor-window-001', '/r/PARTNER1', NULL, NULL);
UPDATE referral_clicks
SET created_at = clock_timestamp() - INTERVAL '29 days'
WHERE anonymous_id = 'visitor-window-001';
UPDATE auth.users
SET created_at = clock_timestamp() - INTERVAL '29 days' + INTERVAL '1 second'
WHERE id = '12121212-1212-4212-8212-121212121212';

CREATE TEMP TABLE referral_window_result (result jsonb);
INSERT INTO referral_window_result
SELECT attribute_referral('12121212-1212-4212-8212-121212121212'::uuid, 'visitor-window-001');

SELECT ok(
  (SELECT result ->> 'ok' FROM referral_window_result) = 'true'
  AND (SELECT result ->> 'error' FROM referral_window_result) IS NULL
  AND (SELECT count(*) FROM referral_attributions WHERE user_id = '12121212-1212-4212-8212-121212121212') = 1,
  'a click inside 30 days attributes an account created after that click'
);

DO $$
DECLARE
  v_message TEXT;
  v_partner UUID;
  v_click UUID;
BEGIN
  SELECT id INTO v_partner FROM partners WHERE referral_code = 'PARTNER1';
  SELECT id INTO v_click FROM referral_clicks WHERE anonymous_id = 'visitor-old-000001' ORDER BY created_at DESC LIMIT 1;
  BEGIN
    INSERT INTO referral_attributions (
      user_id, partner_id, referral_click_id, referral_code, attribution_type
    ) VALUES (
      '33333333-3333-4333-8333-333333333333',
      v_partner,
      v_click,
      'PARTNER1',
      'last_click_30d'
    );
    v_message := 'succeeded';
  EXCEPTION
    WHEN OTHERS THEN
      v_message := SQLERRM;
  END;
  CREATE TEMP TABLE IF NOT EXISTS referral_check_direct_attr (message text);
  DELETE FROM referral_check_direct_attr;
  INSERT INTO referral_check_direct_attr VALUES (v_message);
END $$;

SELECT ok(
  (SELECT message FROM referral_check_direct_attr) = 'account_created_before_click'
  AND (SELECT count(*) FROM referral_attributions WHERE user_id = '33333333-3333-4333-8333-333333333333') = 0,
  'a direct insert cannot bind an account created before the click'
);

SELECT record_referral_click('PARTNER1', 'visitor-order-0001', '/r/PARTNER1', NULL, NULL);
UPDATE auth.users
SET created_at = clock_timestamp()
WHERE id = '77777777-7777-4777-8777-777777777777';
SELECT attribute_referral('77777777-7777-4777-8777-777777777777'::uuid, 'visitor-order-0001');
SELECT grant_welcome_bonus('77777777-7777-4777-8777-777777777777'::uuid);

INSERT INTO payment_orders (
  id, user_id, client_payment_id, credit_rub, charge_rub, provider, provider_payment_id, payment_method
) VALUES (
  'abababab-abab-4aba-8aba-abababababab',
  '77777777-7777-4777-8777-777777777777',
  'pay-order',
  100,
  115,
  'yookassa',
  'yk-order',
  'sbp'
);
SELECT credit_gateway_payment('abababab-abab-4aba-8aba-abababababab'::uuid);
SELECT deduct_balance(
  '77777777-7777-4777-8777-777777777777'::uuid,
  30,
  'deepseek-v3.2',
  '{}'::jsonb,
  'op-order-bonus'
);

SELECT ok(
  (SELECT remaining_amount FROM user_balance_lots
    WHERE user_id = '77777777-7777-4777-8777-777777777777' AND source_type = 'bonus') = 20
  AND (SELECT remaining_amount FROM user_balance_lots
    WHERE user_id = '77777777-7777-4777-8777-777777777777' AND source_type = 'paid') = 100
  AND (SELECT count(*) FROM balance_ledger
    WHERE operation_id = 'op-order-bonus' AND source_type <> 'bonus') = 0,
  'a spend inside the bonus lot does not touch paid or legacy'
);

SELECT deduct_balance(
  '77777777-7777-4777-8777-777777777777'::uuid,
  30,
  'deepseek-v3.2',
  '{}'::jsonb,
  'op-order-cross'
);

SELECT ok(
  (SELECT remaining_amount FROM user_balance_lots
    WHERE user_id = '77777777-7777-4777-8777-777777777777' AND source_type = 'bonus') = 0
  AND (SELECT remaining_amount FROM user_balance_lots
    WHERE user_id = '77777777-7777-4777-8777-777777777777' AND source_type = 'paid') = 90
  AND (SELECT abs(amount) FROM balance_ledger
    WHERE operation_id = 'op-order-cross' AND source_type = 'bonus') = 20
  AND (SELECT abs(amount) FROM balance_ledger
    WHERE operation_id = 'op-order-cross' AND source_type = 'paid') = 10
  AND (SELECT count(*) FROM balance_ledger
    WHERE operation_id = 'op-order-cross' AND source_type = 'legacy_unclassified') = 0,
  'once the bonus lot is empty, the rest of that spend comes from paid'
);

SELECT topup_balance(
  '77777777-7777-4777-8777-777777777777'::uuid,
  15,
  'topup_manual',
  '{"reason":"legacy-seed"}'::jsonb
);
SELECT deduct_balance(
  '77777777-7777-4777-8777-777777777777'::uuid,
  100,
  'deepseek-v3.2',
  '{}'::jsonb,
  'op-order-legacy'
);

SELECT ok(
  (SELECT balance_rub FROM user_balances WHERE user_id = '77777777-7777-4777-8777-777777777777') = 5
  AND (SELECT remaining_amount FROM user_balance_lots
    WHERE user_id = '77777777-7777-4777-8777-777777777777' AND source_type = 'paid') = 0
  AND (SELECT abs(amount) FROM balance_ledger
    WHERE operation_id = 'op-order-legacy' AND source_type = 'paid') = 90
  AND (SELECT abs(amount) FROM balance_ledger
    WHERE operation_id = 'op-order-legacy' AND source_type = 'legacy_unclassified') = 10
  AND (SELECT count(*) FROM user_balance_lots
    WHERE user_id = '77777777-7777-4777-8777-777777777777' AND source_type = 'legacy_unclassified') = 0,
  'once the paid lot is empty, the remainder is legacy and is not stored as paid'
);

INSERT INTO payment_orders (
  id, user_id, client_payment_id, credit_rub, charge_rub, provider, provider_payment_id, payment_method
) VALUES
  (
    'cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd',
    '99999999-9999-4999-8999-999999999999',
    'pay-kop-1',
    1,
    1,
    'yookassa',
    'yk-kop-1',
    'sbp'
  ),
  (
    'dededede-dede-4ded-8ded-dededededede',
    '99999999-9999-4999-8999-999999999999',
    'pay-kop-2',
    1,
    1,
    'yookassa',
    'yk-kop-2',
    'sbp'
  );
SELECT credit_gateway_payment('cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd'::uuid);
SELECT credit_gateway_payment('dededede-dede-4ded-8ded-dededededede'::uuid);
SELECT deduct_balance(
  '99999999-9999-4999-8999-999999999999'::uuid,
  2,
  'deepseek-v3.2',
  '{}'::jsonb,
  'op-kopeck'
);
SELECT record_usage_financials(
  '99999999-9999-4999-8999-999999999999'::uuid,
  'op-kopeck',
  'deepseek-v3.2',
  'deepseek-v3.2',
  'DeepInfra',
  0.01,
  'provider_actual'
);

SELECT ok(
  (SELECT count(*) FROM usage_financial_journal WHERE operation_id = 'op-kopeck') = 2
  AND (SELECT round(COALESCE(SUM(provider_cost_rub), 0), 2) FROM usage_financial_journal WHERE operation_id = 'op-kopeck') = 0.01,
  'one kopeck of API cost is allocated once across two paid lots'
);

SELECT topup_balance(
  '99999999-9999-4999-8999-999999999999'::uuid,
  10,
  'topup_manual',
  '{"reason":"shared"}'::jsonb
);
SELECT deduct_balance(
  '44444444-4444-4444-8444-444444444444'::uuid,
  4,
  'deepseek-v3.2',
  '{}'::jsonb,
  'shared-op-1'
);
SELECT deduct_balance(
  '99999999-9999-4999-8999-999999999999'::uuid,
  4,
  'deepseek-v3.2',
  '{}'::jsonb,
  'shared-op-1'
);

SELECT ok(
  (SELECT balance_rub FROM user_balances WHERE user_id = '44444444-4444-4444-8444-444444444444') = 6
  AND (SELECT balance_rub FROM user_balances WHERE user_id = '99999999-9999-4999-8999-999999999999') = 6
  AND (SELECT count(*) FROM balance_ledger WHERE operation_id = 'shared-op-1' AND operation_type = 'usage') = 2,
  'the same operation_id on two users draws both balances'
);

SELECT deduct_balance(
  '44444444-4444-4444-8444-444444444444'::uuid,
  4,
  'deepseek-v3.2',
  '{}'::jsonb,
  'shared-op-1'
);

SELECT ok(
  (SELECT balance_rub FROM user_balances WHERE user_id = '44444444-4444-4444-8444-444444444444') = 6
  AND (SELECT count(*) FROM balance_ledger
    WHERE user_id = '44444444-4444-4444-8444-444444444444' AND operation_id = 'shared-op-1') = 1,
  'repeating one operation for the same user does not draw again'
);

DO $$
DECLARE
  v_message TEXT;
BEGIN
  BEGIN
    INSERT INTO user_balance_lots (
      user_id, source_type, original_amount, remaining_amount, reference_type, reference_id
    ) VALUES (
      '44444444-4444-4444-8444-444444444444',
      'paid',
      10,
      10,
      'payment_order',
      'not-a-real-order'
    );
    v_message := 'succeeded';
  EXCEPTION
    WHEN OTHERS THEN
      v_message := SQLERRM;
  END;
  CREATE TEMP TABLE IF NOT EXISTS referral_check_paid_lot (message text);
  DELETE FROM referral_check_paid_lot;
  INSERT INTO referral_check_paid_lot VALUES (v_message);
END $$;

SELECT ok(
  (SELECT message FROM referral_check_paid_lot) = 'paid lot does not match a payment order'
  AND (SELECT count(*) FROM user_balance_lots
    WHERE user_id = '44444444-4444-4444-8444-444444444444' AND source_type = 'paid') = 0,
  'a direct insert cannot create paid balance without a real payment order'
);

DO $$
DECLARE
  v_message TEXT;
BEGIN
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    INSERT INTO user_balance_lots (
      user_id, source_type, original_amount, remaining_amount, reference_type, reference_id
    ) VALUES (
      '22222222-2222-4222-8222-222222222222',
      'paid',
      100,
      100,
      'payment_order',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    );
    v_message := 'succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_message := 'insufficient_privilege';
    WHEN OTHERS THEN
      v_message := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  CREATE TEMP TABLE IF NOT EXISTS referral_check_service_role (message text);
  DELETE FROM referral_check_service_role;
  INSERT INTO referral_check_service_role VALUES (v_message);
END $$;

SELECT ok(
  (SELECT message FROM referral_check_service_role) = 'insufficient_privilege'
  AND (SELECT count(*) FROM user_balance_lots
    WHERE user_id = '22222222-2222-4222-8222-222222222222' AND source_type = 'paid') = 1,
  'service_role cannot insert a paid lot directly'
);

INSERT INTO partner_financial_ledger (
  partner_id, user_id, operation_id, source_type,
  eligible_revenue_rub, allocated_provider_cost_rub, commission_rate, status, created_at
) VALUES (
  (SELECT id FROM partners WHERE referral_code = 'PARTNER1'),
  '22222222-2222-4222-8222-222222222222',
  'op-loss-prev',
  'paid',
  20,
  25,
  0.4000,
  'not_calculated',
  ((date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')) - INTERVAL '1 day')::timestamp
    AT TIME ZONE 'Europe/Moscow')
);

SELECT ok(
  (SELECT (preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNER1'),
      (CURRENT_DATE - INTERVAL '1 month')::date
    ) ->> 'preliminary_commission_rub')::numeric) = 0
  AND (SELECT preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNER1'),
      (CURRENT_DATE - INTERVAL '1 month')::date
    ) ->> 'loss_carryforward') = 'false'
  AND (SELECT preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNER1'),
      CURRENT_DATE
    ) ->> 'loss_carryforward') = 'false'
  AND (SELECT (preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNER1'),
      CURRENT_DATE
    ) ->> 'paid_revenue_rub')::numeric) = 110,
  'a losing month does not reduce the next month'
);

INSERT INTO auth.users (id, email, created_at) VALUES
  ('30303030-3030-4030-8030-303030303030', 'paused-partner@example.com', clock_timestamp()),
  ('40404040-4040-4040-8040-404040404040', 'paused-buyer@example.com', clock_timestamp()),
  ('10101010-1010-4010-8010-101010101010', 'profit-partner@example.com', clock_timestamp()),
  ('20202020-2020-4020-8020-202020202020', 'profit-buyer@example.com', clock_timestamp());

INSERT INTO partners (user_id, referral_code, status)
VALUES ('30303030-3030-4030-8030-303030303030', 'PARTNER2', 'active');
SELECT record_referral_click('PARTNER2', 'visitor-paused-001', '/r/PARTNER2', NULL, NULL);
UPDATE partners SET status = 'paused' WHERE referral_code = 'PARTNER2';
UPDATE auth.users
SET created_at = clock_timestamp()
WHERE id = '40404040-4040-4040-8040-404040404040';

SELECT ok(
  (SELECT attribute_referral('40404040-4040-4040-8040-404040404040'::uuid, 'visitor-paused-001') ->> 'error') = 'partner_inactive'
  AND (SELECT count(*) FROM referral_attributions WHERE user_id = '40404040-4040-4040-8040-404040404040') = 0,
  'an inactive partner does not receive a new attribution'
);

INSERT INTO partners (user_id, referral_code)
VALUES ('10101010-1010-4010-8010-101010101010', 'PARTNER3');
SELECT record_referral_click('PARTNER3', 'visitor-profit-001', '/r/PARTNER3', NULL, NULL);
UPDATE auth.users
SET created_at = clock_timestamp()
WHERE id = '20202020-2020-4020-8020-202020202020';
SELECT attribute_referral('20202020-2020-4020-8020-202020202020'::uuid, 'visitor-profit-001');

INSERT INTO payment_orders (
  id, user_id, client_payment_id, credit_rub, charge_rub, provider, provider_payment_id, payment_method
) VALUES (
  '50505050-5050-4050-8050-505050505050',
  '20202020-2020-4020-8020-202020202020',
  'pay-1000',
  1000,
  1150,
  'yookassa',
  'yk-1000',
  'sbp'
);
SELECT credit_gateway_payment('50505050-5050-4050-8050-505050505050'::uuid);

SELECT ok(
  (SELECT count(*) FROM partner_financial_ledger
    WHERE user_id = '20202020-2020-4020-8020-202020202020') = 0
  AND (SELECT (preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNER3'),
      CURRENT_DATE
    ) ->> 'preliminary_commission_rub')::numeric) = 0,
  'a 1000 top-up does not create a 400 commission'
);

SELECT ok(
  (SELECT remaining_amount FROM user_balance_lots
    WHERE user_id = '20202020-2020-4020-8020-202020202020' AND source_type = 'paid') = 1000
  AND (SELECT (preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNER3'),
      CURRENT_DATE
    ) ->> 'paid_revenue_rub')::numeric) = 0,
  'a paid balance of 1000 is not partner profit by itself'
);

SELECT deduct_balance(
  '20202020-2020-4020-8020-202020202020'::uuid,
  1000,
  'deepseek-v3.2',
  '{}'::jsonb,
  'op-profit-1000'
);
SELECT record_usage_financials(
  '20202020-2020-4020-8020-202020202020'::uuid,
  'op-profit-1000',
  'deepseek-v3.2',
  'deepseek-v3.2',
  'DeepInfra',
  200,
  'provider_actual'
);

SELECT ok(
  (SELECT (preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNER3'),
      CURRENT_DATE
    ) ->> 'paid_revenue_rub')::numeric) = 1000
  AND (SELECT (preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNER3'),
      CURRENT_DATE
    ) ->> 'paid_provider_cost_rub')::numeric) = 200
  AND (SELECT (preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNER3'),
      CURRENT_DATE
    ) ->> 'preliminary_commission_rub')::numeric) = 320
  AND (SELECT preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNER3'),
      CURRENT_DATE
    ) ->> 'blocked_reason') = 'tax_rule_not_defined'
  AND (SELECT preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNER3'),
      CURRENT_DATE
    ) ->> 'payable') = 'false',
  'paid revenue 1000 and paid API cost 200 give a preliminary commission of 320'
);

SELECT confirm_partner_profit('op-profit-1000', NULL);
SELECT confirm_partner_profit('op-profit-1000', 0);

SELECT ok(
  (SELECT count(*) FROM partner_financial_ledger
    WHERE operation_id = 'op-profit-1000' AND status = 'confirmed') = 0
  AND (SELECT commission_amount_rub FROM partner_financial_ledger
    WHERE operation_id = 'op-profit-1000') IS NULL,
  'without a tax rule the commission is not confirmed'
);

SELECT record_partner_payout('50505050-5050-4050-8050-505050505050'::uuid);
SELECT record_partner_payout((SELECT id FROM partner_financial_ledger WHERE operation_id = 'op-profit-1000'));

SELECT ok(
  (SELECT count(*) FROM partner_commission_payouts WHERE operation_id = 'op-profit-1000') = 0,
  'repeating confirmation and payout does not create a payout row'
);

DO $$
DECLARE
  v_message TEXT;
BEGIN
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM public.topup_balance(
      '20202020-2020-4020-8020-202020202020'::uuid,
      1000,
      'topup_manual',
      '{}'::jsonb
    );
    v_message := 'succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_message := 'insufficient_privilege';
    WHEN OTHERS THEN
      v_message := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  CREATE TEMP TABLE IF NOT EXISTS referral_check_public_topup (message text);
  DELETE FROM referral_check_public_topup;
  INSERT INTO referral_check_public_topup VALUES (v_message);
END $$;

SELECT ok(
  (SELECT message FROM referral_check_public_topup) = 'insufficient_privilege'
  AND (SELECT balance_rub FROM user_balances WHERE user_id = '20202020-2020-4020-8020-202020202020') = 0,
  'an ordinary user cannot change another balance through topup_balance'
);

DO $$
DECLARE
  v_message TEXT;
BEGIN
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO user_balance_lots (
      user_id, source_type, original_amount, remaining_amount, reference_type, reference_id
    ) VALUES (
      '20202020-2020-4020-8020-202020202020',
      'paid',
      1000,
      1000,
      'payment_order',
      '50505050-5050-4050-8050-505050505050'
    );
    v_message := 'succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_message := 'insufficient_privilege';
    WHEN OTHERS THEN
      v_message := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  CREATE TEMP TABLE IF NOT EXISTS referral_check_public_lot (message text);
  DELETE FROM referral_check_public_lot;
  INSERT INTO referral_check_public_lot VALUES (v_message);
END $$;

SELECT ok(
  (SELECT message FROM referral_check_public_lot) = 'insufficient_privilege'
  AND (SELECT count(*) FROM user_balance_lots
    WHERE user_id = '20202020-2020-4020-8020-202020202020' AND source_type = 'paid') = 1,
  'an ordinary user cannot insert a paid lot'
);

DO $$
DECLARE
  v_message TEXT;
BEGIN
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM public.credit_gateway_payment('50505050-5050-4050-8050-505050505050'::uuid);
    v_message := 'succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_message := 'insufficient_privilege';
    WHEN OTHERS THEN
      v_message := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  CREATE TEMP TABLE IF NOT EXISTS referral_check_public_rpc (message text);
  DELETE FROM referral_check_public_rpc;
  INSERT INTO referral_check_public_rpc VALUES (v_message);
END $$;

SELECT ok(
  (SELECT message FROM referral_check_public_rpc) = 'insufficient_privilege',
  'a public role cannot call credit_gateway_payment'
);

DO $$
DECLARE
  v_message TEXT;
BEGIN
  BEGIN
    UPDATE balance_ledger
    SET amount = amount
    WHERE operation_id = 'op-profit-1000';
    v_message := 'succeeded';
  EXCEPTION
    WHEN OTHERS THEN
      v_message := SQLERRM;
  END;
  CREATE TEMP TABLE IF NOT EXISTS referral_check_ledger_update (message text);
  DELETE FROM referral_check_ledger_update;
  INSERT INTO referral_check_ledger_update VALUES (v_message);
END $$;

SELECT ok(
  (SELECT message FROM referral_check_ledger_update) = 'ledger row is immutable',
  'a financial ledger row cannot be updated'
);

INSERT INTO auth.users (id, email, created_at) VALUES
  ('61616161-6161-4161-8161-616161616161', 'zero-partner@example.com', clock_timestamp()),
  ('62626262-6262-4262-8262-626262626262', 'zero-buyer@example.com', clock_timestamp()),
  ('71717171-7171-4171-8171-717171717171', 'cap-partner@example.com', clock_timestamp()),
  ('72727272-7272-4272-8272-727272727272', 'cap-buyer@example.com', clock_timestamp()),
  ('81818181-8181-4181-8181-818181818181', 'null-partner@example.com', clock_timestamp()),
  ('82828282-8282-4282-8282-828282828282', 'null-buyer@example.com', clock_timestamp());

INSERT INTO partners (user_id, referral_code, commission_rate)
VALUES ('61616161-6161-4161-8161-616161616161', 'PARTNERZ', 0.4000);
SELECT record_referral_click('PARTNERZ', 'visitor-zero-0001', '/r/PARTNERZ', NULL, NULL);
UPDATE auth.users SET created_at = clock_timestamp() WHERE id = '62626262-6262-4262-8262-626262626262';
SELECT attribute_referral('62626262-6262-4262-8262-626262626262'::uuid, 'visitor-zero-0001');
INSERT INTO payment_orders (
  id, user_id, client_payment_id, credit_rub, charge_rub, provider, provider_payment_id, payment_method
) VALUES (
  '63636363-6363-4363-8363-636363636363',
  '62626262-6262-4262-8262-626262626262',
  'pay-zero', 100, 115, 'yookassa', 'yk-zero', 'sbp'
);
SELECT credit_gateway_payment('63636363-6363-4363-8363-636363636363'::uuid);
SELECT deduct_balance('62626262-6262-4262-8262-626262626262'::uuid, 100, 'deepseek-v3.2', '{}'::jsonb, 'op-zero');
SELECT record_usage_financials(
  '62626262-6262-4262-8262-626262626262'::uuid, 'op-zero', 'deepseek-v3.2', 'deepseek-v3.2', 'DeepInfra', 100, 'provider_actual'
);

SELECT ok(
  (SELECT (preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNERZ'), CURRENT_DATE
    ) ->> 'preliminary_commission_rub')::numeric) = 0
  AND (SELECT (preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNERZ'), CURRENT_DATE
    ) ->> 'paid_revenue_rub')::numeric) = 100
  AND (SELECT (preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNERZ'), CURRENT_DATE
    ) ->> 'paid_provider_cost_rub')::numeric) = 100,
  'zero qualified profit produces a zero commission'
);

INSERT INTO partners (user_id, referral_code, commission_rate)
VALUES ('71717171-7171-4171-8171-717171717171', 'PARTNERC', 0.9000);
SELECT record_referral_click('PARTNERC', 'visitor-cap-00001', '/r/PARTNERC', NULL, NULL);
UPDATE auth.users SET created_at = clock_timestamp() WHERE id = '72727272-7272-4272-8272-727272727272';
SELECT attribute_referral('72727272-7272-4272-8272-727272727272'::uuid, 'visitor-cap-00001');
INSERT INTO payment_orders (
  id, user_id, client_payment_id, credit_rub, charge_rub, provider, provider_payment_id, payment_method
) VALUES (
  '73737373-7373-4373-8373-737373737373',
  '72727272-7272-4272-8272-727272727272',
  'pay-cap', 10.01, 12, 'yookassa', 'yk-cap', 'sbp'
);
SELECT credit_gateway_payment('73737373-7373-4373-8373-737373737373'::uuid);
SELECT deduct_balance('72727272-7272-4272-8272-727272727272'::uuid, 10.01, 'deepseek-v3.2', '{}'::jsonb, 'op-cap');
SELECT record_usage_financials(
  '72727272-7272-4272-8272-727272727272'::uuid, 'op-cap', 'deepseek-v3.2', 'deepseek-v3.2', 'DeepInfra', 0, 'provider_actual'
);

SELECT ok(
  (SELECT (preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNERC'), CURRENT_DATE
    ) ->> 'preliminary_commission_rub')::numeric) = 4.00
  AND (SELECT commission_rate FROM partner_financial_ledger WHERE operation_id = 'op-cap') = 0.4000
  AND (SELECT (preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNERC'), CURRENT_DATE
    ) ->> 'preliminary_commission_rub')::numeric)
    <= round((SELECT (preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNERC'), CURRENT_DATE
    ) ->> 'paid_revenue_rub')::numeric) * 0.4000, 2),
  'a stored rate above 40 percent is capped and rounded to the kopeck'
);

INSERT INTO partners (user_id, referral_code)
VALUES ('81818181-8181-4181-8181-818181818181', 'PARTNERN');
ALTER TABLE partners ALTER COLUMN commission_rate DROP NOT NULL;
UPDATE partners SET commission_rate = NULL WHERE referral_code = 'PARTNERN';
SELECT record_referral_click('PARTNERN', 'visitor-null-0001', '/r/PARTNERN', NULL, NULL);
UPDATE auth.users SET created_at = clock_timestamp() WHERE id = '82828282-8282-4282-8282-828282828282';
SELECT attribute_referral('82828282-8282-4282-8282-828282828282'::uuid, 'visitor-null-0001');
INSERT INTO payment_orders (
  id, user_id, client_payment_id, credit_rub, charge_rub, provider, provider_payment_id, payment_method
) VALUES (
  '83838383-8383-4383-8383-838383838383',
  '82828282-8282-4282-8282-828282828282',
  'pay-null-rate', 1000, 1150, 'yookassa', 'yk-null-rate', 'sbp'
);
SELECT credit_gateway_payment('83838383-8383-4383-8383-838383838383'::uuid);
SELECT deduct_balance('82828282-8282-4282-8282-828282828282'::uuid, 1000, 'deepseek-v3.2', '{}'::jsonb, 'op-null-rate');

SELECT ok(
  (SELECT record_usage_financials(
      '82828282-8282-4282-8282-828282828282'::uuid,
      'op-null-rate', 'deepseek-v3.2', 'deepseek-v3.2', 'DeepInfra', 200, 'provider_actual'
    ) ->> 'error') = 'commission_rate_missing'
  AND (SELECT count(*) FROM partner_financial_ledger WHERE operation_id = 'op-null-rate') = 0
  AND (SELECT preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNERN'), CURRENT_DATE
    ) ->> 'blocked_reason') = 'commission_rate_missing'
  AND (SELECT preview_partner_month(
      (SELECT id FROM partners WHERE referral_code = 'PARTNERN'), CURRENT_DATE
    ) ->> 'preliminary_commission_rub') IS NULL,
  'a null commission rate does not become 40 percent'
);

SELECT * FROM finish();

ROLLBACK;
