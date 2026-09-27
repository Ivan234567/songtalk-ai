-- Заказы пополнения через ITPAY. Зачисление идемпотентно: повтор webhook не начисляет второй раз.

CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_payment_id TEXT NOT NULL UNIQUE,
  itpay_payment_id TEXT UNIQUE,
  credit_rub NUMERIC(12, 2) NOT NULL CHECK (credit_rub > 0),
  charge_rub NUMERIC(12, 2) NOT NULL CHECK (charge_rub > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  credited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id ON payment_orders(user_id, created_at DESC);

ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payment orders"
  ON payment_orders FOR SELECT
  USING (auth.uid() = user_id);

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
      'provider', 'itpay',
      'payment_id', v_order.itpay_payment_id,
      'client_payment_id', v_order.client_payment_id,
      'charge_rub', v_order.charge_rub
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
