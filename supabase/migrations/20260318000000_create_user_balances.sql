-- Monetization: user balances and transaction history.
-- Balance is created lazily on first topup or first deduction (no trigger on registration).

-- Balances per user (lazy creation)
CREATE TABLE IF NOT EXISTS user_balances (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_rub NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (balance_rub >= 0),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_balances_updated_at ON user_balances(updated_at DESC);

-- Transaction history
CREATE TYPE balance_transaction_type AS ENUM ('usage', 'topup_manual', 'topup_gateway');

CREATE TABLE IF NOT EXISTS balance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_rub NUMERIC(12, 2) NOT NULL,
  type balance_transaction_type NOT NULL,
  service TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_balance_transactions_user_id ON balance_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_balance_transactions_created_at ON balance_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_balance_transactions_user_created ON balance_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_balance_transactions_type ON balance_transactions(type);

ALTER TABLE balance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_balances ENABLE ROW LEVEL SECURITY;

-- Users can only read their own balance and transactions (writes via backend/service role only)
CREATE POLICY "Users can view own balance"
  ON user_balances FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own balance transactions"
  ON balance_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- Atomic deduction: ensure row exists, check balance, subtract, record transaction.
-- amount_rub must be positive (amount to deduct).
-- Returns: {"ok": true, "new_balance": number} or {"ok": false, "error": "insufficient_balance"}
CREATE OR REPLACE FUNCTION deduct_balance(
  p_user_id UUID,
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
  v_balance NUMERIC;
  v_new_balance NUMERIC;
BEGIN
  IF p_amount_rub IS NULL OR p_amount_rub <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  -- Ensure balance row exists (lazy creation)
  INSERT INTO user_balances (user_id, balance_rub, updated_at)
  VALUES (p_user_id, 0, NOW())
  ON CONFLICT (user_id) DO NOTHING;

  -- Lock row and get current balance
  SELECT balance_rub INTO v_balance
  FROM user_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'balance_not_found');
  END IF;

  IF v_balance < p_amount_rub THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'current_balance', v_balance);
  END IF;

  -- Deduct and get new balance
  UPDATE user_balances
  SET balance_rub = balance_rub - p_amount_rub,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance_rub INTO v_new_balance;

  -- Record transaction (negative amount = deduction)
  INSERT INTO balance_transactions (user_id, amount_rub, type, service, metadata)
  VALUES (p_user_id, -p_amount_rub, 'usage', p_service, p_metadata);

  RETURN jsonb_build_object('ok', true, 'new_balance', v_new_balance);
END;
$$;

-- Atomic topup: add to balance (creating row if needed), record transaction.
-- type must be 'topup_manual' or 'topup_gateway'.
CREATE OR REPLACE FUNCTION topup_balance(
  p_user_id UUID,
  p_amount_rub NUMERIC,
  p_type balance_transaction_type,
  p_metadata JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  IF p_amount_rub IS NULL OR p_amount_rub <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  IF p_type NOT IN ('topup_manual', 'topup_gateway') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_type');
  END IF;

  -- Upsert balance
  INSERT INTO user_balances (user_id, balance_rub, updated_at)
  VALUES (p_user_id, p_amount_rub, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    balance_rub = user_balances.balance_rub + p_amount_rub,
    updated_at = NOW()
  RETURNING balance_rub INTO v_new_balance;

  -- Record transaction
  INSERT INTO balance_transactions (user_id, amount_rub, type, metadata)
  VALUES (p_user_id, p_amount_rub, p_type, p_metadata);

  RETURN jsonb_build_object('ok', true, 'new_balance', v_new_balance);
END;
$$;
