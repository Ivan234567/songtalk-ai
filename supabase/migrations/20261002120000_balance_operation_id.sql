-- Повтор той же операции не списывает баланс второй раз.
-- operation_id пустым не остаётся: если вызывающий не передал его, берётся новый uuid.

ALTER TABLE balance_transactions
  ADD COLUMN IF NOT EXISTS operation_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS balance_transactions_user_operation_id_key
  ON balance_transactions (user_id, operation_id)
  WHERE operation_id IS NOT NULL;

DROP FUNCTION IF EXISTS deduct_balance(UUID, NUMERIC, TEXT, JSONB);

CREATE OR REPLACE FUNCTION deduct_balance(
  p_user_id UUID,
  p_amount_rub NUMERIC,
  p_service TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_operation_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance NUMERIC;
  v_new_balance NUMERIC;
  v_operation_id TEXT;
BEGIN
  IF p_amount_rub IS NULL OR p_amount_rub <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  v_operation_id := NULLIF(btrim(COALESCE(p_operation_id, '')), '');
  IF v_operation_id IS NULL THEN
    v_operation_id := gen_random_uuid()::text;
  END IF;

  INSERT INTO user_balances (user_id, balance_rub, updated_at)
  VALUES (p_user_id, 0, NOW())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance_rub INTO v_balance
  FROM user_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'balance_not_found');
  END IF;

  IF EXISTS (
    SELECT 1 FROM balance_transactions
    WHERE user_id = p_user_id AND operation_id = v_operation_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'new_balance', v_balance);
  END IF;

  IF v_balance < p_amount_rub THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'current_balance', v_balance);
  END IF;

  UPDATE user_balances
  SET balance_rub = balance_rub - p_amount_rub,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance_rub INTO v_new_balance;

  INSERT INTO balance_transactions (user_id, amount_rub, type, service, metadata, operation_id)
  VALUES (
    p_user_id,
    -p_amount_rub,
    'usage',
    p_service,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('operation_id', v_operation_id),
    v_operation_id
  );

  RETURN jsonb_build_object('ok', true, 'already', false, 'new_balance', v_new_balance);
END;
$$;
