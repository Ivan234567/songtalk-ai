-- Начисления администратора. Читает тот же месячный расчёт, ничего не подтверждает.

CREATE OR REPLACE FUNCTION public.admin_partner_accruals(p_admin_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_partner RECORD;
  v_end DATE;
  v_start DATE;
  v_cursor DATE;
  v_first TIMESTAMPTZ;
  v_preview JSONB;
  v_profit NUMERIC;
  v_items JSONB := '[]'::jsonb;
  v_page JSONB;
  v_total INT;
  v_truncated BOOLEAN := false;
BEGIN
  PERFORM public.referral_require_service_role();

  IF p_admin_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_admins WHERE user_id = p_admin_id
  ) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  v_end := date_trunc('month', (NOW() AT TIME ZONE 'Europe/Moscow'))::date;

  FOR v_partner IN
    SELECT p.id, p.referral_code, u.email::text AS email
    FROM public.partners p
    JOIN auth.users u ON u.id = p.user_id
  LOOP
    SELECT MIN(ts) INTO v_first
    FROM (
      SELECT MIN(created_at) AS ts
      FROM public.partner_financial_ledger
      WHERE partner_id = v_partner.id
      UNION ALL
      SELECT MIN(attributed_at)
      FROM public.referral_attributions
      WHERE partner_id = v_partner.id
    ) bounds;

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
      v_preview := public.preview_partner_month(v_partner.id, v_cursor);
      IF COALESCE((v_preview ->> 'ok')::boolean, false) IS NOT TRUE THEN
        v_items := v_items || jsonb_build_array(jsonb_build_object(
          'partner_id', v_partner.id,
          'email', v_partner.email,
          'referral_code', v_partner.referral_code,
          'month', to_char(v_cursor, 'YYYY-MM-DD'),
          'paid_revenue_rub', NULL,
          'paid_provider_cost_rub', NULL,
          'qualified_profit_rub', NULL,
          'commission_rate', NULL,
          'preliminary_commission_rub', NULL,
          'blocked_reason', NULL,
          'confirmed', false
        ));
      ELSE
        IF jsonb_typeof(v_preview -> 'paid_revenue_rub') = 'number'
           AND jsonb_typeof(v_preview -> 'paid_provider_cost_rub') = 'number' THEN
          v_profit := round(
            (v_preview ->> 'paid_revenue_rub')::NUMERIC
            - (v_preview ->> 'paid_provider_cost_rub')::NUMERIC,
            2
          );
        ELSE
          v_profit := NULL;
        END IF;

        v_items := v_items || jsonb_build_array(jsonb_build_object(
          'partner_id', v_partner.id,
          'email', v_partner.email,
          'referral_code', v_partner.referral_code,
          'month', v_preview ->> 'month',
          'paid_revenue_rub', v_preview -> 'paid_revenue_rub',
          'paid_provider_cost_rub', v_preview -> 'paid_provider_cost_rub',
          'qualified_profit_rub', to_jsonb(v_profit),
          'commission_rate', v_preview -> 'commission_rate',
          'preliminary_commission_rub', v_preview -> 'preliminary_commission_rub',
          'blocked_reason', v_preview -> 'blocked_reason',
          'confirmed', false
        ));
      END IF;
      v_cursor := (v_cursor + INTERVAL '1 month')::date;
    END LOOP;
  END LOOP;

  SELECT COUNT(*) INTO v_total FROM jsonb_array_elements(v_items);
  IF v_total > 100 THEN
    v_truncated := true;
  END IF;

  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
  INTO v_page
  FROM (
    SELECT item
    FROM jsonb_array_elements(v_items) AS item
    ORDER BY item ->> 'month' DESC, item ->> 'email'
    LIMIT 100
  ) page;

  RETURN jsonb_build_object(
    'ok', true,
    'truncated', v_truncated,
    'confirmation_available', false,
    'accruals', v_page
  );
END;
$$;

COMMENT ON FUNCTION public.admin_partner_accruals(UUID) IS
  'Месячные начисления по выданным партнёрам. Подтверждение закрыто. Пустой месяц остаётся нулём, неизвестная сумма остаётся пустой.';

REVOKE ALL ON FUNCTION public.admin_partner_accruals(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_partner_accruals(UUID)
  TO service_role;
