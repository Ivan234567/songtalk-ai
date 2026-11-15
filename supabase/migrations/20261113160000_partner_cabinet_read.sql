-- Чтение кабинета партнёра. Ничего не начисляет, не подтверждает и не выплачивает.
-- Партнёр определяется по user_id, который backend взял из проверенного JWT.
-- Аргумент partner_id снаружи нет: подставить чужой идентификатор нельзя.

CREATE OR REPLACE FUNCTION public.mask_partner_email(p_email TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT CASE
    WHEN p_email IS NULL OR btrim(p_email) = '' THEN NULL
    WHEN position('@' IN btrim(p_email)) = 0 THEN left(btrim(p_email), 1) || '***'
    ELSE left(split_part(btrim(p_email), '@', 1), 1) || '***@'
      || left(split_part(btrim(p_email), '@', 2), 1) || '***'
  END;
$$;

COMMENT ON FUNCTION public.mask_partner_email(TEXT) IS
  'Маска для кабинета партнёра. Полный email наружу не возвращается.';

CREATE OR REPLACE FUNCTION public.partner_cabinet_shape_month(p_preview JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_profit NUMERIC;
BEGIN
  IF p_preview IS NULL OR COALESCE((p_preview ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RETURN p_preview;
  END IF;

  IF jsonb_typeof(p_preview -> 'paid_revenue_rub') = 'number'
     AND jsonb_typeof(p_preview -> 'paid_provider_cost_rub') = 'number' THEN
    v_profit := round(
      (p_preview ->> 'paid_revenue_rub')::NUMERIC - (p_preview ->> 'paid_provider_cost_rub')::NUMERIC,
      2
    );
  ELSE
    v_profit := NULL;
  END IF;

  RETURN p_preview || jsonb_build_object(
    'qualified_profit_rub', v_profit,
    'confirmation_available', false,
    'payout_available', false,
    'payout_blocked_reason', 'payout_manual_outside_system'
  );
END;
$$;

-- Внутренний расчёт. Снаружи не выдаётся: иначе по partner_id можно прочитать чужой месяц.
CREATE OR REPLACE FUNCTION public.partner_cabinet_month_for_partner(p_partner_id UUID, p_month DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_month DATE;
BEGIN
  PERFORM public.referral_require_service_role();
  IF p_partner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  IF p_month IS NULL THEN
    v_month := date_trunc('month', (NOW() AT TIME ZONE 'Europe/Moscow'))::date;
  ELSE
    v_month := date_trunc('month', p_month::timestamp)::date;
  END IF;

  RETURN public.partner_cabinet_shape_month(public.preview_partner_month(p_partner_id, v_month));
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_cabinet_month(p_user_id UUID, p_month DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_partner_id UUID;
BEGIN
  PERFORM public.referral_require_service_role();
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT id INTO v_partner_id FROM partners WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_partner');
  END IF;

  RETURN public.partner_cabinet_month_for_partner(v_partner_id, p_month);
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_cabinet_overview(p_user_id UUID, p_month DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_partner partners%ROWTYPE;
  v_month JSONB;
  v_total INT;
  v_paid_users INT;
  v_recent JSONB;
BEGIN
  PERFORM public.referral_require_service_role();
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT * INTO v_partner FROM partners WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_partner');
  END IF;

  v_month := public.partner_cabinet_month_for_partner(v_partner.id, p_month);

  SELECT COUNT(*)::INT INTO v_total
  FROM referral_attributions
  WHERE partner_id = v_partner.id;

  SELECT COUNT(*)::INT INTO v_paid_users
  FROM referral_attributions ra
  WHERE ra.partner_id = v_partner.id
    AND EXISTS (
      SELECT 1
      FROM partner_financial_entries e
      WHERE e.partner_id = ra.partner_id
        AND e.user_id = ra.user_id
        AND e.source_type = 'paid'
        AND e.eligible_revenue_rub > 0
    );

  SELECT COALESCE(jsonb_agg(item ORDER BY registered_at DESC), '[]'::jsonb)
  INTO v_recent
  FROM (
    SELECT jsonb_build_object(
      'masked_email', public.mask_partner_email(u.email),
      'registered_at', u.created_at,
      'has_paid_usage', EXISTS (
        SELECT 1
        FROM partner_financial_entries e
        WHERE e.partner_id = ra.partner_id
          AND e.user_id = ra.user_id
          AND e.source_type = 'paid'
          AND e.eligible_revenue_rub > 0
      )
    ) AS item,
    u.created_at AS registered_at
    FROM referral_attributions ra
    JOIN auth.users u ON u.id = ra.user_id
    WHERE ra.partner_id = v_partner.id
    ORDER BY u.created_at DESC, ra.id DESC
    LIMIT 5
  ) recent;

  RETURN jsonb_build_object(
    'ok', true,
    'status', v_partner.status,
    'referral_code', v_partner.referral_code,
    'commission_rate', v_partner.commission_rate,
    'referrals_total', v_total,
    'referrals_with_paid_usage', v_paid_users,
    'month', v_month,
    'recent_referrals', v_recent
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_cabinet_referrals(
  p_user_id UUID,
  p_page INT,
  p_query TEXT,
  p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_partner_id UUID;
  v_page INT;
  v_status TEXT;
  v_query TEXT;
  v_like TEXT;
  v_total INT;
  v_rows JSONB;
BEGIN
  PERFORM public.referral_require_service_role();
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  v_page := COALESCE(p_page, 1);
  IF v_page < 1 OR v_page > 10000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  v_status := NULLIF(btrim(COALESCE(p_status, '')), '');
  IF v_status IS NOT NULL AND v_status NOT IN ('all', 'paid_usage', 'no_paid_usage') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  v_query := NULLIF(btrim(COALESCE(p_query, '')), '');
  IF v_query IS NOT NULL AND char_length(v_query) > 128 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  IF v_query IS NOT NULL THEN
    v_like := '%' || replace(replace(replace(lower(v_query), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  SELECT id INTO v_partner_id FROM partners WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_partner');
  END IF;

  SELECT COUNT(*)::INT INTO v_total
  FROM referral_attributions ra
  JOIN auth.users u ON u.id = ra.user_id
  WHERE ra.partner_id = v_partner_id
    AND (v_like IS NULL OR lower(u.email) LIKE v_like ESCAPE '\')
    AND (
      v_status IS NULL
      OR v_status = 'all'
      OR (
        v_status = 'paid_usage'
        AND EXISTS (
          SELECT 1 FROM partner_financial_entries e
          WHERE e.partner_id = ra.partner_id
            AND e.user_id = ra.user_id
            AND e.source_type = 'paid'
            AND e.eligible_revenue_rub > 0
        )
      )
      OR (
        v_status = 'no_paid_usage'
        AND NOT EXISTS (
          SELECT 1 FROM partner_financial_entries e
          WHERE e.partner_id = ra.partner_id
            AND e.user_id = ra.user_id
            AND e.source_type = 'paid'
            AND e.eligible_revenue_rub > 0
        )
      )
    );

  SELECT COALESCE(jsonb_agg(item ORDER BY registered_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'masked_email', public.mask_partner_email(u.email),
      'registered_at', u.created_at,
      'has_paid_usage', EXISTS (
        SELECT 1
        FROM partner_financial_entries e
        WHERE e.partner_id = ra.partner_id
          AND e.user_id = ra.user_id
          AND e.source_type = 'paid'
          AND e.eligible_revenue_rub > 0
      )
    ) AS item,
    u.created_at AS registered_at
    FROM referral_attributions ra
    JOIN auth.users u ON u.id = ra.user_id
    WHERE ra.partner_id = v_partner_id
      AND (v_like IS NULL OR lower(u.email) LIKE v_like ESCAPE '\')
      AND (
        v_status IS NULL
        OR v_status = 'all'
        OR (
          v_status = 'paid_usage'
          AND EXISTS (
            SELECT 1 FROM partner_financial_entries e
            WHERE e.partner_id = ra.partner_id
              AND e.user_id = ra.user_id
              AND e.source_type = 'paid'
              AND e.eligible_revenue_rub > 0
          )
        )
        OR (
          v_status = 'no_paid_usage'
          AND NOT EXISTS (
            SELECT 1 FROM partner_financial_entries e
            WHERE e.partner_id = ra.partner_id
              AND e.user_id = ra.user_id
              AND e.source_type = 'paid'
              AND e.eligible_revenue_rub > 0
          )
        )
      )
    ORDER BY u.created_at DESC, ra.id DESC
    LIMIT 20
    OFFSET (v_page - 1) * 20
  ) page_rows;

  RETURN jsonb_build_object(
    'ok', true,
    'page', v_page,
    'page_size', 20,
    'total', v_total,
    'referrals', v_rows
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_cabinet_months(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_partner_id UUID;
  v_start DATE;
  v_end DATE;
  v_cursor DATE;
  v_first TIMESTAMPTZ;
  v_truncated BOOLEAN := false;
  v_months JSONB := '[]'::jsonb;
BEGIN
  PERFORM public.referral_require_service_role();
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT id INTO v_partner_id FROM partners WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_partner');
  END IF;

  SELECT MIN(ts) INTO v_first
  FROM (
    SELECT MIN(created_at) AS ts
    FROM partner_financial_ledger
    WHERE partner_id = v_partner_id
    UNION ALL
    SELECT MIN(attributed_at)
    FROM referral_attributions
    WHERE partner_id = v_partner_id
  ) bounds;

  v_end := date_trunc('month', (NOW() AT TIME ZONE 'Europe/Moscow'))::date;
  IF v_first IS NULL THEN
    v_start := v_end;
  ELSE
    v_start := date_trunc('month', (v_first AT TIME ZONE 'Europe/Moscow'))::date;
  END IF;
  IF v_start > v_end THEN
    v_start := v_end;
  END IF;

  IF v_start < (v_end - INTERVAL '35 months')::date THEN
    v_start := (v_end - INTERVAL '35 months')::date;
    v_truncated := true;
  END IF;

  v_cursor := v_start;
  WHILE v_cursor <= v_end LOOP
    v_months := v_months || jsonb_build_array(
      public.partner_cabinet_month_for_partner(v_partner_id, v_cursor)
    );
    v_cursor := (v_cursor + INTERVAL '1 month')::date;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'truncated', v_truncated,
    'months', v_months
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_cabinet_payouts(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_partner_id UUID;
  v_rows JSONB;
BEGIN
  PERFORM public.referral_require_service_role();
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT id INTO v_partner_id FROM partners WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_partner');
  END IF;

  SELECT COALESCE(jsonb_agg(item ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'amount_rub', amount_rub,
      'created_at', created_at
    ) AS item,
    created_at
    FROM partner_commission_payouts
    WHERE partner_id = v_partner_id
    ORDER BY created_at DESC
    LIMIT 200
  ) payouts;

  RETURN jsonb_build_object(
    'ok', true,
    'recording_available', false,
    'recording_blocked_reason', 'payout_manual_outside_system',
    'payouts', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mask_partner_email(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.partner_cabinet_shape_month(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.partner_cabinet_month_for_partner(UUID, DATE) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.partner_cabinet_overview(UUID, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_cabinet_referrals(UUID, INT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_cabinet_months(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_cabinet_month(UUID, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_cabinet_payouts(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.partner_cabinet_overview(UUID, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_cabinet_referrals(UUID, INT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_cabinet_months(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_cabinet_month(UUID, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_cabinet_payouts(UUID) TO service_role;
