-- Резерв до вызова AITunnel. Доступный остаток = balance_rub − открытые резервы.
-- started, который не закрылся, списывается по потолку и не возвращается.

ALTER TABLE balance_transactions
  ADD COLUMN IF NOT EXISTS operation_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS balance_transactions_user_operation_id_key
  ON balance_transactions (user_id, operation_id)
  WHERE operation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS balance_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL,
  amount_rub NUMERIC(12, 2) NOT NULL CHECK (amount_rub > 0),
  status TEXT NOT NULL CHECK (status IN ('reserved', 'started', 'settled', 'failed', 'abandoned')),
  service TEXT,
  metadata JSONB,
  provider_cost_rub NUMERIC(12, 2),
  final_charge_rub NUMERIC(12, 2),
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  UNIQUE (user_id, operation_id)
);

CREATE INDEX IF NOT EXISTS balance_operations_user_open_idx
  ON balance_operations (user_id)
  WHERE status IN ('reserved', 'started');

CREATE OR REPLACE FUNCTION abandon_stale_operations(
  p_user_id UUID,
  p_reserved_after INTERVAL DEFAULT INTERVAL '2 minutes',
  p_started_after INTERVAL DEFAULT INTERVAL '15 minutes'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op balance_operations%ROWTYPE;
  v_balance NUMERIC;
BEGIN
  FOR v_op IN
    SELECT * FROM balance_operations
    WHERE user_id = p_user_id
      AND status = 'reserved'
      AND created_at <= NOW() - p_reserved_after
    FOR UPDATE
  LOOP
    UPDATE balance_operations
    SET status = 'failed',
        final_charge_rub = 0,
        settled_at = NOW()
    WHERE id = v_op.id;
  END LOOP;

  FOR v_op IN
    SELECT * FROM balance_operations
    WHERE user_id = p_user_id
      AND status = 'started'
      AND started_at IS NOT NULL
      AND started_at <= NOW() - p_started_after
    FOR UPDATE
  LOOP
    SELECT balance_rub INTO v_balance
    FROM user_balances
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_balance IS NULL THEN
      v_balance := 0;
    END IF;

    IF v_balance > 0 THEN
      UPDATE user_balances
      SET balance_rub = balance_rub - LEAST(balance_rub, v_op.amount_rub),
          updated_at = NOW()
      WHERE user_id = p_user_id;

      INSERT INTO balance_transactions (user_id, amount_rub, type, service, metadata, operation_id)
      VALUES (
        p_user_id,
        -LEAST(v_balance, v_op.amount_rub),
        'usage',
        v_op.service,
        COALESCE(v_op.metadata, '{}'::jsonb) || jsonb_build_object('abandoned', true, 'operation_id', v_op.operation_id),
        v_op.operation_id
      );
    END IF;

    UPDATE balance_operations
    SET status = 'abandoned',
        final_charge_rub = LEAST(v_balance, v_op.amount_rub),
        settled_at = NOW()
    WHERE id = v_op.id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION reserve_operation(
  p_user_id UUID,
  p_operation_id TEXT,
  p_amount_rub NUMERIC,
  p_service TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing balance_operations%ROWTYPE;
  v_balance NUMERIC;
  v_held NUMERIC;
  v_operation_id TEXT;
BEGIN
  v_operation_id := NULLIF(btrim(COALESCE(p_operation_id, '')), '');
  IF v_operation_id IS NULL OR p_amount_rub IS NULL OR p_amount_rub <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  INSERT INTO user_balances (user_id, balance_rub, updated_at)
  VALUES (p_user_id, 0, NOW())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance_rub INTO v_balance
  FROM user_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  PERFORM abandon_stale_operations(p_user_id);

  SELECT balance_rub INTO v_balance
  FROM user_balances
  WHERE user_id = p_user_id;

  SELECT * INTO v_existing
  FROM balance_operations
  WHERE user_id = p_user_id AND operation_id = v_operation_id
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', v_existing.status,
      'already', true,
      'final_charge_rub', v_existing.final_charge_rub,
      'result', v_existing.result_json
    );
  END IF;

  SELECT COALESCE(SUM(amount_rub), 0) INTO v_held
  FROM balance_operations
  WHERE user_id = p_user_id AND status IN ('reserved', 'started');

  IF v_balance - v_held < p_amount_rub THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_balance',
      'available_rub', v_balance - v_held
    );
  END IF;

  INSERT INTO balance_operations (user_id, operation_id, amount_rub, status, service, metadata)
  VALUES (p_user_id, v_operation_id, p_amount_rub, 'reserved', p_service, p_metadata);

  RETURN jsonb_build_object('ok', true, 'status', 'reserved', 'already', false);
END;
$$;

CREATE OR REPLACE FUNCTION mark_operation_started(
  p_user_id UUID,
  p_operation_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op balance_operations%ROWTYPE;
BEGIN
  SELECT * INTO v_op
  FROM balance_operations
  WHERE user_id = p_user_id AND operation_id = btrim(p_operation_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_op.status = 'started' THEN
    RETURN jsonb_build_object('ok', true, 'status', 'started', 'already', true);
  END IF;

  IF v_op.status <> 'reserved' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_state', 'status', v_op.status);
  END IF;

  UPDATE balance_operations
  SET status = 'started',
      started_at = NOW()
  WHERE id = v_op.id;

  RETURN jsonb_build_object('ok', true, 'status', 'started', 'already', false);
END;
$$;

CREATE OR REPLACE FUNCTION settle_operation(
  p_user_id UUID,
  p_operation_id TEXT,
  p_charge_rub NUMERIC,
  p_provider_cost_rub NUMERIC DEFAULT NULL,
  p_result JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op balance_operations%ROWTYPE;
  v_charge NUMERIC;
  v_balance NUMERIC;
  v_taken NUMERIC;
BEGIN
  SELECT * INTO v_op
  FROM balance_operations
  WHERE user_id = p_user_id AND operation_id = btrim(p_operation_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_op.status = 'settled' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'settled',
      'already', true,
      'final_charge_rub', v_op.final_charge_rub,
      'result', v_op.result_json
    );
  END IF;

  IF v_op.status <> 'started' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_state', 'status', v_op.status);
  END IF;

  v_charge := LEAST(v_op.amount_rub, GREATEST(COALESCE(p_charge_rub, 0), 0));

  SELECT balance_rub INTO v_balance
  FROM user_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_taken := LEAST(COALESCE(v_balance, 0), v_charge);

  IF v_taken > 0 THEN
    UPDATE user_balances
    SET balance_rub = balance_rub - v_taken,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    INSERT INTO balance_transactions (user_id, amount_rub, type, service, metadata, operation_id)
    VALUES (
      p_user_id,
      -v_taken,
      'usage',
      v_op.service,
      COALESCE(v_op.metadata, '{}'::jsonb) || jsonb_build_object(
        'operation_id', v_op.operation_id,
        'reserved_rub', v_op.amount_rub,
        'provider_cost_rub', p_provider_cost_rub
      ),
      v_op.operation_id
    );
  END IF;

  UPDATE balance_operations
  SET status = 'settled',
      final_charge_rub = v_taken,
      provider_cost_rub = p_provider_cost_rub,
      result_json = p_result,
      settled_at = NOW()
  WHERE id = v_op.id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'settled',
    'already', false,
    'final_charge_rub', v_taken,
    'unused_rub', v_op.amount_rub - v_taken
  );
END;
$$;

CREATE OR REPLACE FUNCTION fail_operation(
  p_user_id UUID,
  p_operation_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op balance_operations%ROWTYPE;
BEGIN
  SELECT * INTO v_op
  FROM balance_operations
  WHERE user_id = p_user_id AND operation_id = btrim(p_operation_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_op.status IN ('failed', 'settled', 'abandoned') THEN
    RETURN jsonb_build_object('ok', true, 'status', v_op.status, 'already', true, 'final_charge_rub', v_op.final_charge_rub);
  END IF;

  IF v_op.status NOT IN ('reserved', 'started') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_state', 'status', v_op.status);
  END IF;

  UPDATE balance_operations
  SET status = 'failed',
      final_charge_rub = 0,
      settled_at = NOW()
  WHERE id = v_op.id;

  RETURN jsonb_build_object('ok', true, 'status', 'failed', 'already', false, 'final_charge_rub', 0);
END;
$$;

CREATE OR REPLACE FUNCTION abandon_operation(
  p_user_id UUID,
  p_operation_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op balance_operations%ROWTYPE;
  v_balance NUMERIC;
  v_taken NUMERIC;
BEGIN
  SELECT * INTO v_op
  FROM balance_operations
  WHERE user_id = p_user_id AND operation_id = btrim(p_operation_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_op.status IN ('abandoned', 'settled') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', v_op.status,
      'already', true,
      'final_charge_rub', v_op.final_charge_rub,
      'result', v_op.result_json
    );
  END IF;

  IF v_op.status <> 'started' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_state', 'status', v_op.status);
  END IF;

  SELECT balance_rub INTO v_balance
  FROM user_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_taken := LEAST(COALESCE(v_balance, 0), v_op.amount_rub);

  IF v_taken > 0 THEN
    UPDATE user_balances
    SET balance_rub = balance_rub - v_taken,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    INSERT INTO balance_transactions (user_id, amount_rub, type, service, metadata, operation_id)
    VALUES (
      p_user_id,
      -v_taken,
      'usage',
      v_op.service,
      COALESCE(v_op.metadata, '{}'::jsonb) || jsonb_build_object('abandoned', true, 'operation_id', v_op.operation_id),
      v_op.operation_id
    );
  END IF;

  UPDATE balance_operations
  SET status = 'abandoned',
      final_charge_rub = v_taken,
      settled_at = NOW()
  WHERE id = v_op.id;

  RETURN jsonb_build_object('ok', true, 'status', 'abandoned', 'already', false, 'final_charge_rub', v_taken);
END;
$$;

REVOKE ALL ON FUNCTION reserve_operation(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION mark_operation_started(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION settle_operation(UUID, TEXT, NUMERIC, NUMERIC, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION fail_operation(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION abandon_operation(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION abandon_stale_operations(UUID, INTERVAL, INTERVAL) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION reserve_operation(UUID, TEXT, NUMERIC, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION mark_operation_started(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION settle_operation(UUID, TEXT, NUMERIC, NUMERIC, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION fail_operation(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION abandon_operation(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION abandon_stale_operations(UUID, INTERVAL, INTERVAL) TO service_role;
