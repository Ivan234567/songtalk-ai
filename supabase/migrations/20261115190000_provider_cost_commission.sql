-- Комиссия ждёт фактическую цену AITunnel.
-- Строка журнала пишется один раз, когда цена уже известна.
-- Пока оплаченное списание ждёт цену, месяц остаётся без комиссии.

CREATE TABLE IF NOT EXISTS public.usage_cost_pending (
  user_id UUID NOT NULL,
  operation_id TEXT NOT NULL,
  service_type TEXT NOT NULL,
  model TEXT,
  provider TEXT,
  provider_request_id TEXT,
  provider_cost_rub NUMERIC(12, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, operation_id),
  CONSTRAINT usage_cost_pending_operation_len CHECK (char_length(operation_id) BETWEEN 1 AND 128),
  CONSTRAINT usage_cost_pending_service_len CHECK (char_length(service_type) BETWEEN 1 AND 64),
  CONSTRAINT usage_cost_pending_request_len CHECK (
    provider_request_id IS NULL OR char_length(provider_request_id) BETWEEN 1 AND 80
  ),
  CONSTRAINT usage_cost_pending_cost_nonnegative CHECK (
    provider_cost_rub IS NULL OR provider_cost_rub >= 0
  )
);

COMMENT ON TABLE public.usage_cost_pending IS
  'Оплаченное списание, по которому AITunnel ещё не отдал цену или журнал ещё не записан. Такая строка блокирует комиссию месяца.';

ALTER TABLE public.usage_cost_pending ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.usage_cost_pending FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.note_usage_cost_pending(
  p_user_id UUID,
  p_operation_id TEXT,
  p_service_type TEXT,
  p_model TEXT,
  p_provider_request_id TEXT,
  p_provider_cost_rub NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_operation TEXT;
  v_service TEXT;
  v_request TEXT;
BEGIN
  PERFORM public.referral_require_service_role();
  v_operation := NULLIF(btrim(COALESCE(p_operation_id, '')), '');
  v_service := NULLIF(btrim(COALESCE(p_service_type, '')), '');
  v_request := NULLIF(btrim(COALESCE(p_provider_request_id, '')), '');
  IF p_user_id IS NULL OR v_operation IS NULL OR v_service IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  IF p_provider_cost_rub IS NOT NULL AND p_provider_cost_rub < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  INSERT INTO usage_cost_pending (
    user_id, operation_id, service_type, model, provider, provider_request_id, provider_cost_rub
  )
  VALUES (
    p_user_id,
    v_operation,
    v_service,
    NULLIF(btrim(COALESCE(p_model, '')), ''),
    'aitunnel',
    v_request,
    p_provider_cost_rub
  )
  ON CONFLICT (user_id, operation_id) DO UPDATE
  SET provider_request_id = COALESCE(usage_cost_pending.provider_request_id, EXCLUDED.provider_request_id),
      provider_cost_rub = COALESCE(usage_cost_pending.provider_cost_rub, EXCLUDED.provider_cost_rub);

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_usage_cost_pending(
  p_user_id UUID,
  p_operation_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.referral_require_service_role();
  DELETE FROM usage_cost_pending
  WHERE user_id = p_user_id
    AND operation_id = NULLIF(btrim(COALESCE(p_operation_id, '')), '');
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_usage_cost_pending(p_limit INT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_limit INT;
  v_rows JSONB;
BEGIN
  PERFORM public.referral_require_service_role();
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT user_id, operation_id, service_type, model, provider, provider_request_id, provider_cost_rub
    FROM usage_cost_pending
    ORDER BY created_at, operation_id
    LIMIT v_limit
  ) q;
  RETURN jsonb_build_object('ok', true, 'rows', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_partner_month(
  p_partner_id UUID,
  p_month DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_month DATE;
  v_from TIMESTAMPTZ;
  v_to TIMESTAMPTZ;
  v_rate NUMERIC(5, 4);
  v_revenue NUMERIC := 0;
  v_paid_cost NUMERIC := 0;
  v_bonus_cost NUMERIC := 0;
  v_legacy_cost NUMERIC := 0;
  v_missing_cost INT := 0;
  v_non_actual INT := 0;
  v_pending INT := 0;
BEGIN
  PERFORM public.referral_require_service_role();
  IF p_partner_id IS NULL OR p_month IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT commission_rate INTO v_rate FROM partners WHERE id = p_partner_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_rate IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'month', date_trunc('month', p_month::timestamp)::date,
      'paid_revenue_rub', NULL,
      'paid_provider_cost_rub', NULL,
      'excluded_bonus_provider_cost_rub', NULL,
      'excluded_legacy_provider_cost_rub', NULL,
      'preliminary_commission_rub', NULL,
      'loss_carryforward', false,
      'commission_rate', NULL,
      'status', 'not_calculated',
      'blocked_reason', 'commission_rate_missing',
      'payable', false
    );
  END IF;

  v_month := date_trunc('month', p_month::timestamp)::date;
  v_from := v_month::timestamp AT TIME ZONE 'Europe/Moscow';
  v_to := (v_month + INTERVAL '1 month')::timestamp AT TIME ZONE 'Europe/Moscow';

  SELECT
    COALESCE(SUM(eligible_revenue_rub), 0),
    COALESCE(SUM(allocated_provider_cost_rub), 0),
    COUNT(*) FILTER (WHERE allocated_provider_cost_rub IS NULL)
  INTO v_revenue, v_paid_cost, v_missing_cost
  FROM partner_financial_ledger
  WHERE partner_id = p_partner_id
    AND status = 'not_calculated'
    AND source_type = 'paid'
    AND created_at >= v_from
    AND created_at < v_to;

  SELECT
    COALESCE(SUM(provider_cost_rub) FILTER (
      WHERE source_type = 'bonus' AND cost_source = 'provider_actual'
    ), 0),
    COALESCE(SUM(provider_cost_rub) FILTER (
      WHERE source_type = 'legacy_unclassified' AND cost_source = 'provider_actual'
    ), 0),
    COUNT(*) FILTER (
      WHERE source_type = 'paid' AND cost_source IS DISTINCT FROM 'provider_actual'
    )
  INTO v_bonus_cost, v_legacy_cost, v_non_actual
  FROM usage_financial_journal
  WHERE partner_id = p_partner_id
    AND created_at >= v_from
    AND created_at < v_to;

  SELECT COUNT(*)::INT
  INTO v_pending
  FROM usage_cost_pending p
  JOIN referral_attributions a
    ON a.user_id = p.user_id
   AND a.partner_id = p_partner_id
  WHERE EXISTS (
    SELECT 1
    FROM balance_ledger l
    WHERE l.user_id = p.user_id
      AND l.operation_id = p.operation_id
      AND l.operation_type = 'usage'
      AND l.source_type = 'paid'
      AND l.created_at >= v_from
      AND l.created_at < v_to
  )
  AND NOT EXISTS (
    SELECT 1
    FROM usage_financial_journal j
    WHERE j.user_id = p.user_id
      AND j.operation_id = p.operation_id
  );

  IF v_missing_cost > 0 OR v_non_actual > 0 OR v_pending > 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'month', v_month,
      'paid_revenue_rub', v_revenue,
      'paid_provider_cost_rub', NULL,
      'excluded_bonus_provider_cost_rub', v_bonus_cost,
      'excluded_legacy_provider_cost_rub', v_legacy_cost,
      'preliminary_commission_rub', NULL,
      'loss_carryforward', false,
      'commission_rate', v_rate,
      'status', 'not_calculated',
      'blocked_reason', 'cost_not_actual',
      'payable', false
    );
  END IF;

  IF v_revenue - v_paid_cost <= 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'month', v_month,
      'paid_revenue_rub', v_revenue,
      'paid_provider_cost_rub', v_paid_cost,
      'excluded_bonus_provider_cost_rub', v_bonus_cost,
      'excluded_legacy_provider_cost_rub', v_legacy_cost,
      'preliminary_commission_rub', 0,
      'loss_carryforward', false,
      'commission_rate', v_rate,
      'status', 'not_calculated',
      'blocked_reason', NULL,
      'payable', false
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'month', v_month,
    'paid_revenue_rub', v_revenue,
    'paid_provider_cost_rub', v_paid_cost,
    'excluded_bonus_provider_cost_rub', v_bonus_cost,
    'excluded_legacy_provider_cost_rub', v_legacy_cost,
    'preliminary_commission_rub', round((v_revenue - v_paid_cost) * v_rate, 2),
    'loss_carryforward', false,
    'commission_rate', v_rate,
    'status', 'not_calculated',
    'blocked_reason', NULL,
    'payable', true
  );
END;
$$;

COMMENT ON FUNCTION public.preview_partner_month(UUID, DATE) IS
  'Сводка paid-части за месяц Москвы. Комиссия — ставка от прибыли после фактической цены AITunnel. Налог в цене уже заложен. Неизвестная себестоимость и ожидающая цена блокируют расчёт. Убыток не переносится.';

REVOKE ALL ON FUNCTION public.note_usage_cost_pending(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_usage_cost_pending(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_usage_cost_pending(INT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.note_usage_cost_pending(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_usage_cost_pending(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_usage_cost_pending(INT) TO service_role;
