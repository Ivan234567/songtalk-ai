-- История уже записанных выплат. Новую выплату не создаёт.

CREATE OR REPLACE FUNCTION public.admin_partner_payouts(p_admin_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_count INT;
  v_sum NUMERIC;
  v_page JSONB;
BEGIN
  PERFORM public.referral_require_service_role();

  IF p_admin_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_admins WHERE user_id = p_admin_id
  ) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(amount_rub), 0)
  INTO v_count, v_sum
  FROM public.partner_commission_payouts;

  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
  INTO v_page
  FROM (
    SELECT jsonb_build_object(
      'id', pay.id,
      'email', u.email::text,
      'referral_code', p.referral_code,
      'created_at', pay.created_at,
      'month', CASE
        WHEN l.created_at IS NULL THEN NULL
        ELSE date_trunc('month', (l.created_at AT TIME ZONE 'Europe/Moscow'))::date
      END,
      'amount_rub', pay.amount_rub,
      'recorded_by', NULL
    ) AS item
    FROM public.partner_commission_payouts pay
    JOIN public.partners p ON p.id = pay.partner_id
    JOIN auth.users u ON u.id = p.user_id
    LEFT JOIN public.partner_financial_ledger l ON l.id = pay.partner_ledger_id
    ORDER BY pay.created_at DESC
    LIMIT 100
  ) page;

  RETURN jsonb_build_object(
    'ok', true,
    'truncated', v_count > 100,
    'total_count', v_count,
    'total_amount_rub', v_sum,
    'recording_available', false,
    'recording_blocked_reason', 'payout_manual_outside_system',
    'payouts', v_page
  );
END;
$$;

COMMENT ON FUNCTION public.admin_partner_payouts(UUID) IS
  'Читает partner_commission_payouts. Пустая история — ноль. Кто зафиксировал, не хранится. Выплату не создаёт.';

REVOKE ALL ON FUNCTION public.admin_partner_payouts(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_partner_payouts(UUID)
  TO service_role;
