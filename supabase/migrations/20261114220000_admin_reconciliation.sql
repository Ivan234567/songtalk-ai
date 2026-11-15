-- Сверка проблемных операций. Ничего не подтверждает и не меняет.

CREATE OR REPLACE FUNCTION public.admin_reconciliation(p_admin_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_items JSONB;
BEGIN
  PERFORM public.referral_require_service_role();

  IF p_admin_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_admins WHERE user_id = p_admin_id
  ) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  WITH problems AS (
    SELECT 'unknown_api_cost' AS grp, u.email::text AS email, m.month, NULL::NUMERIC AS amount_rub,
           'У платных вызовов нет стоимости API' AS detail
    FROM (
      SELECT j.partner_id,
             date_trunc('month', (j.created_at AT TIME ZONE 'Europe/Moscow'))::date AS month
      FROM public.usage_financial_journal j
      WHERE j.partner_id IS NOT NULL
        AND j.source_type = 'paid'
        AND j.cost_source = 'unknown'
      GROUP BY j.partner_id, 2
    ) m
    JOIN public.partners p ON p.id = m.partner_id
    JOIN auth.users u ON u.id = p.user_id

    UNION ALL

    SELECT 'tariff_estimate', u.email::text, m.month, m.amount_rub,
           'Расход оценён по тарифу, а не по факту'
    FROM (
      SELECT j.partner_id,
             date_trunc('month', (j.created_at AT TIME ZONE 'Europe/Moscow'))::date AS month,
             SUM(j.provider_cost_rub) AS amount_rub
      FROM public.usage_financial_journal j
      WHERE j.partner_id IS NOT NULL
        AND j.source_type = 'paid'
        AND j.cost_source = 'tariff_estimate'
      GROUP BY j.partner_id, 2
    ) m
    JOIN public.partners p ON p.id = m.partner_id
    JOIN auth.users u ON u.id = p.user_id

    UNION ALL

    SELECT 'unconfirmed_cost', u.email::text, m.month, NULL::NUMERIC,
           'Платная операция без подтверждённой себестоимости'
    FROM (
      SELECT e.partner_id,
             date_trunc('month', (e.created_at AT TIME ZONE 'Europe/Moscow'))::date AS month
      FROM public.partner_financial_entries e
      WHERE e.allocated_provider_cost_rub IS NULL
      GROUP BY e.partner_id, 2
    ) m
    JOIN public.partners p ON p.id = m.partner_id
    JOIN auth.users u ON u.id = p.user_id

    UNION ALL

    SELECT 'blocked_month', u.email::text, m.month,
           round((m.revenue - m.cost) * p.commission_rate, 2),
           'Налоговое правило не задано'
    FROM (
      SELECT e.partner_id,
             date_trunc('month', (e.created_at AT TIME ZONE 'Europe/Moscow'))::date AS month,
             SUM(e.eligible_revenue_rub) AS revenue,
             SUM(e.allocated_provider_cost_rub) AS cost
      FROM public.partner_financial_entries e
      GROUP BY e.partner_id, 2
      HAVING COUNT(*) FILTER (WHERE e.allocated_provider_cost_rub IS NULL) = 0
         AND SUM(e.eligible_revenue_rub) - SUM(e.allocated_provider_cost_rub) > 0
    ) m
    JOIN public.partners p ON p.id = m.partner_id
    JOIN auth.users u ON u.id = p.user_id
    WHERE p.commission_rate IS NOT NULL

    UNION ALL

    SELECT 'blocked_month', u.email::text,
           date_trunc('month', (NOW() AT TIME ZONE 'Europe/Moscow'))::date,
           NULL::NUMERIC,
           'Ставка не задана'
    FROM public.partners p
    JOIN auth.users u ON u.id = p.user_id
    WHERE p.commission_rate IS NULL
  ),
  ranked AS (
    SELECT grp, email, month, amount_rub, detail
    FROM problems
  )
  SELECT jsonb_build_object(
    'ok', true,
    'truncated', (SELECT COUNT(*) > 100 FROM ranked),
    'refunds_tracked', false,
    'problems', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'group', grp,
        'email', email,
        'month', month,
        'amount_rub', amount_rub,
        'detail', detail
      ) ORDER BY month DESC, email, grp)
      FROM (
        SELECT grp, email, month, amount_rub, detail
        FROM ranked
        ORDER BY month DESC, email, grp
        LIMIT 100
      ) page
    ), '[]'::jsonb)
  )
  INTO v_items;

  RETURN v_items;
END;
$$;

COMMENT ON FUNCTION public.admin_reconciliation(UUID) IS
  'Проблемы, из-за которых комиссию нельзя подтвердить. Возвраты не ведутся и здесь не выдумываются. Ничего не подтверждает.';

REVOKE ALL ON FUNCTION public.admin_reconciliation(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reconciliation(UUID)
  TO service_role;
