-- Провайдер платежа. Зачисление по-прежнему идемпотентно через credit_gateway_payment.

ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS provider TEXT;

ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS provider_payment_id TEXT;

ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

UPDATE payment_orders
SET provider = CASE
  WHEN itpay_payment_id IS NOT NULL THEN 'itpay'
  ELSE 'yookassa'
END
WHERE provider IS NULL;

ALTER TABLE payment_orders
  ALTER COLUMN provider SET DEFAULT 'yookassa';

ALTER TABLE payment_orders
  ALTER COLUMN provider SET NOT NULL;

ALTER TABLE payment_orders DROP CONSTRAINT IF EXISTS payment_orders_payment_method_check;
ALTER TABLE payment_orders
  ADD CONSTRAINT payment_orders_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('sbp', 'other'));

CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_provider_payment_id_key
  ON payment_orders (provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION credit_gateway_payment(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order payment_orders%ROWTYPE;
  v_new_balance NUMERIC;
BEGIN
  SELECT * INTO v_order
  FROM payment_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_order.credited_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  INSERT INTO user_balances (user_id, balance_rub, updated_at)
  VALUES (v_order.user_id, v_order.credit_rub, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    balance_rub = user_balances.balance_rub + v_order.credit_rub,
    updated_at = NOW()
  RETURNING balance_rub INTO v_new_balance;

  INSERT INTO balance_transactions (user_id, amount_rub, type, metadata)
  VALUES (
    v_order.user_id,
    v_order.credit_rub,
    'topup_gateway',
    jsonb_build_object(
      'provider', COALESCE(v_order.provider, 'yookassa'),
      'payment_id', COALESCE(v_order.provider_payment_id, v_order.itpay_payment_id),
      'client_payment_id', v_order.client_payment_id,
      'charge_rub', v_order.charge_rub,
      'payment_method', v_order.payment_method
    )
  );

  UPDATE payment_orders
  SET status = 'paid',
      credited_at = NOW(),
      updated_at = NOW()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'already', false, 'new_balance', v_new_balance);
END;
$$;

REVOKE ALL ON FUNCTION credit_gateway_payment(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION credit_gateway_payment(UUID) FROM anon;
REVOKE ALL ON FUNCTION credit_gateway_payment(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION credit_gateway_payment(UUID) TO service_role;
