-- Свой промокод партнёра. Прежний код остаётся рабочей ссылкой.

CREATE TABLE IF NOT EXISTS public.partner_code_aliases (
  code TEXT PRIMARY KEY,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_code_aliases_format CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS partner_code_aliases_lower_key
  ON public.partner_code_aliases (lower(code));

ALTER TABLE public.partner_code_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.partner_code_aliases FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.partner_code_aliases TO service_role;

CREATE OR REPLACE FUNCTION public.record_referral_click(
  p_referral_code TEXT,
  p_anonymous_id TEXT,
  p_landing_path TEXT DEFAULT NULL,
  p_campaign TEXT DEFAULT NULL,
  p_referrer TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_partner partners%ROWTYPE;
  v_id UUID;
  v_anonymous TEXT;
  v_code TEXT;
BEGIN
  PERFORM public.referral_require_service_role();
  v_anonymous := NULLIF(btrim(COALESCE(p_anonymous_id, '')), '');
  v_code := lower(btrim(COALESCE(p_referral_code, '')));

  IF v_anonymous IS NULL OR char_length(v_anonymous) < 8 OR char_length(v_anonymous) > 128 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT * INTO v_partner
  FROM partners
  WHERE lower(referral_code) = v_code
  FOR SHARE;

  IF NOT FOUND THEN
    SELECT p.* INTO v_partner
    FROM partners p
    JOIN partner_code_aliases a ON a.partner_id = p.id
    WHERE lower(a.code) = v_code
    FOR SHARE OF p;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_code');
  END IF;

  IF v_partner.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partner_inactive');
  END IF;

  INSERT INTO referral_clicks (partner_id, referral_code, anonymous_id, landing_path, campaign, referrer)
  VALUES (
    v_partner.id,
    v_partner.referral_code,
    v_anonymous,
    NULLIF(btrim(COALESCE(p_landing_path, '')), ''),
    NULLIF(btrim(COALESCE(p_campaign, '')), ''),
    NULLIF(btrim(COALESCE(p_referrer, '')), '')
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'click_id', v_id,
    'partner_id', v_partner.id,
    'referral_code', v_partner.referral_code
  );
END;
$$;

DROP FUNCTION IF EXISTS public.admin_decide_partner_application(UUID, UUID, TEXT, NUMERIC, TEXT);

CREATE FUNCTION public.admin_decide_partner_application(
  p_admin_id UUID,
  p_application_id UUID,
  p_decision TEXT,
  p_rate NUMERIC,
  p_note TEXT,
  p_code TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_app public.partner_applications%ROWTYPE;
  v_code TEXT;
  v_custom TEXT;
  v_try INT := 0;
  v_rate NUMERIC(5, 4);
BEGIN
  PERFORM public.referral_require_service_role();

  IF NOT EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = p_admin_id) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_app
  FROM public.partner_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_app.status <> 'pending' THEN
    RAISE EXCEPTION 'application_not_pending' USING ERRCODE = '22023';
  END IF;

  IF p_decision = 'rejected' THEN
    UPDATE public.partner_applications
    SET status = 'rejected',
        decision_note = NULLIF(btrim(COALESCE(p_note, '')), ''),
        decided_by = p_admin_id,
        decided_at = NOW()
    WHERE id = v_app.id;
    RETURN jsonb_build_object('ok', true, 'status', 'rejected');
  END IF;

  v_rate := COALESCE(p_rate, 0.4000);
  IF v_rate < 0 OR v_rate > 0.4000 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.partners WHERE user_id = v_app.user_id) THEN
    RAISE EXCEPTION 'already_partner' USING ERRCODE = '23505';
  END IF;

  v_custom := NULLIF(upper(btrim(COALESCE(p_code, ''))), '');
  IF v_custom IS NOT NULL AND v_custom !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$' THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF v_custom IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.partners WHERE lower(referral_code) = lower(v_custom))
       OR EXISTS (SELECT 1 FROM public.partner_code_aliases WHERE lower(code) = lower(v_custom)) THEN
      RAISE EXCEPTION 'code_taken' USING ERRCODE = '23505';
    END IF;
    BEGIN
      INSERT INTO public.partners (user_id, referral_code, status, commission_rate)
      VALUES (v_app.user_id, v_custom, 'active', v_rate);
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'code_taken' USING ERRCODE = '23505';
    END;
    v_code := v_custom;
  ELSE
    LOOP
      v_try := v_try + 1;
      IF v_try > 8 THEN
        RAISE EXCEPTION 'code_unavailable' USING ERRCODE = '23505';
      END IF;
      v_code := 'SPK' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));
      BEGIN
        INSERT INTO public.partners (user_id, referral_code, status, commission_rate)
        VALUES (v_app.user_id, v_code, 'active', v_rate);
        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          IF EXISTS (SELECT 1 FROM public.partners WHERE user_id = v_app.user_id) THEN
            RAISE EXCEPTION 'already_partner' USING ERRCODE = '23505';
          END IF;
      END;
    END LOOP;
  END IF;

  UPDATE public.partner_applications
  SET status = 'approved',
      commission_rate = v_rate,
      referral_code = v_code,
      decision_note = NULLIF(btrim(COALESCE(p_note, '')), ''),
      decided_by = p_admin_id,
      decided_at = NOW()
  WHERE id = v_app.id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'approved',
    'referral_code', v_code,
    'commission_rate', v_rate
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_decide_partner_application(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decide_partner_application(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.admin_issue_partner_code(
  p_admin_id UUID,
  p_partner_id UUID,
  p_code TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_partner public.partners%ROWTYPE;
  v_code TEXT;
  v_previous TEXT;
BEGIN
  PERFORM public.referral_require_service_role();

  IF p_admin_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_admins WHERE user_id = p_admin_id
  ) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  v_code := NULLIF(upper(btrim(COALESCE(p_code, ''))), '');
  IF v_code IS NULL OR v_code !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$' THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_partner
  FROM public.partners
  WHERE id = p_partner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partner_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_previous := v_partner.referral_code;
  IF lower(v_previous) = lower(v_code) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'referral_code', v_previous,
      'previous_code', v_previous
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.partners
    WHERE id <> v_partner.id AND lower(referral_code) = lower(v_code)
  ) OR EXISTS (
    SELECT 1 FROM public.partner_code_aliases
    WHERE partner_id <> v_partner.id AND lower(code) = lower(v_code)
  ) THEN
    RAISE EXCEPTION 'code_taken' USING ERRCODE = '23505';
  END IF;

  DELETE FROM public.partner_code_aliases
  WHERE partner_id = v_partner.id AND lower(code) = lower(v_code);

  INSERT INTO public.partner_code_aliases (code, partner_id)
  VALUES (v_previous, v_partner.id);

  UPDATE public.partners
  SET referral_code = v_code
  WHERE id = v_partner.id;

  RETURN jsonb_build_object(
    'ok', true,
    'referral_code', v_code,
    'previous_code', v_previous
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'code_taken' USING ERRCODE = '23505';
END;
$$;

REVOKE ALL ON FUNCTION public.admin_issue_partner_code(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_issue_partner_code(UUID, UUID, TEXT)
  TO service_role;

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
        OR EXISTS (
          SELECT 1 FROM public.partner_code_aliases alias
          WHERE alias.partner_id = p.id
            AND alias.code ILIKE '%' || v_like || '%' ESCAPE '\'
        )
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
