-- Дата выдачи и признак администратора в списке партнёров.
-- Статус, ставка, код и комиссия по-прежнему не меняются.

CREATE OR REPLACE FUNCTION public.admin_list_issued_partners(
  p_admin_id UUID,
  p_query TEXT,
  p_status TEXT
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_query TEXT;
  v_like TEXT;
  v_status TEXT;
  v_month DATE;
  v_items JSONB := '[]'::jsonb;
  v_seen INT := 0;
  v_truncated BOOLEAN := false;
  v_partner RECORD;
  v_preview JSONB;
  v_commission NUMERIC;
  v_reason TEXT;
  v_referrals INT;
BEGIN
  PERFORM public.referral_require_service_role();

  IF p_admin_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_admins WHERE user_id = p_admin_id
  ) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  v_status := NULLIF(btrim(COALESCE(p_status, '')), '');
  IF v_status IS NULL OR v_status = 'all' THEN
    v_status := NULL;
  ELSIF v_status NOT IN ('active', 'paused', 'disabled') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  v_query := NULLIF(btrim(COALESCE(p_query, '')), '');
  IF v_query IS NOT NULL AND char_length(v_query) > 128 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF v_query IS NULL THEN
    v_like := NULL;
  ELSE
    v_like := replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_');
  END IF;

  v_month := date_trunc('month', (NOW() AT TIME ZONE 'Europe/Moscow'))::date;

  FOR v_partner IN
    SELECT
      p.id,
      u.email::text AS email,
      p.referral_code,
      p.status,
      p.commission_rate,
      p.created_at,
      EXISTS (
        SELECT 1 FROM public.app_admins a WHERE a.user_id = p.user_id
      ) AS is_admin
    FROM public.partners p
    JOIN auth.users u ON u.id = p.user_id
    WHERE (v_status IS NULL OR p.status = v_status)
      AND (
        v_like IS NULL
        OR u.email ILIKE '%' || v_like || '%' ESCAPE '\'
        OR p.referral_code ILIKE '%' || v_like || '%' ESCAPE '\'
      )
    ORDER BY p.created_at DESC, p.id DESC
  LOOP
    v_seen := v_seen + 1;
    IF v_seen > 100 THEN
      v_truncated := true;
      EXIT;
    END IF;

    v_preview := public.preview_partner_month(v_partner.id, v_month);
    IF COALESCE((v_preview ->> 'ok')::boolean, false)
       AND jsonb_typeof(v_preview -> 'preliminary_commission_rub') = 'number' THEN
      v_commission := (v_preview ->> 'preliminary_commission_rub')::NUMERIC;
      v_reason := NULLIF(v_preview ->> 'blocked_reason', '');
    ELSE
      v_commission := NULL;
      v_reason := COALESCE(
        NULLIF(v_preview ->> 'blocked_reason', ''),
        NULLIF(v_preview ->> 'error', ''),
        'unavailable'
      );
    END IF;

    SELECT COUNT(*)::INT INTO v_referrals
    FROM public.referral_attributions
    WHERE partner_id = v_partner.id;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_partner.id,
      'email', v_partner.email,
      'referral_code', v_partner.referral_code,
      'status', v_partner.status,
      'commission_rate', v_partner.commission_rate,
      'referrals_total', v_referrals,
      'preliminary_commission_rub', v_commission,
      'commission_blocked_reason', v_reason,
      'issued_at', v_partner.created_at,
      'is_admin', v_partner.is_admin
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'month', v_month,
    'truncated', v_truncated,
    'partners', v_items
  );
END;
$$;

COMMENT ON FUNCTION public.admin_list_issued_partners(UUID, TEXT, TEXT) IS
  'Админский список выданных партнёров. Комиссия не подменяется нулём. Ставка не становится 40%, если она не записана. Дата выдачи и признак администратора только для отображения.';

REVOKE ALL ON FUNCTION public.admin_list_issued_partners(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_issued_partners(UUID, TEXT, TEXT)
  TO service_role;
