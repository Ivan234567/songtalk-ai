-- Привязка и приветственные 50 ₽ только по промокоду, указанному при регистрации.
-- Старый переход без этого кода человека не привязывает.

DROP FUNCTION IF EXISTS public.attribute_referral(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.attribute_referral(
  p_user_id UUID,
  p_anonymous_id TEXT,
  p_referral_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_existing referral_attributions%ROWTYPE;
  v_click referral_clicks%ROWTYPE;
  v_partner partners%ROWTYPE;
  v_constraint TEXT;
  v_user_created_at TIMESTAMPTZ;
  v_code TEXT;
BEGIN
  PERFORM public.referral_require_service_role();

  IF p_user_id IS NULL OR NULLIF(btrim(COALESCE(p_anonymous_id, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('referral-attr:' || p_user_id::text));

  SELECT created_at
  INTO v_user_created_at
  FROM auth.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  SELECT * INTO v_existing
  FROM referral_attributions
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already', true,
      'partner_id', v_existing.partner_id,
      'attribution_id', v_existing.id
    );
  END IF;

  v_code := lower(btrim(COALESCE(p_referral_code, '')));
  IF v_code !~ '^[a-z0-9][a-z0-9_-]{1,31}$' THEN
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

  IF v_partner.user_id = p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_referral');
  END IF;

  SELECT * INTO v_click
  FROM referral_clicks
  WHERE anonymous_id = btrim(p_anonymous_id)
    AND partner_id = v_partner.id
    AND created_at >= NOW() - INTERVAL '30 days'
    AND created_at <= v_user_created_at
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_click_in_window');
  END IF;

  IF v_user_created_at IS NULL OR v_user_created_at < v_click.created_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'account_created_before_click');
  END IF;

  BEGIN
    INSERT INTO referral_attributions (
      user_id, partner_id, referral_click_id, referral_code, campaign, attribution_type
    )
    VALUES (
      p_user_id, v_partner.id, v_click.id, v_click.referral_code, v_click.campaign, 'last_click_30d'
    )
    RETURNING * INTO v_existing;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint IS DISTINCT FROM 'referral_attributions_user_id_key' THEN
        RAISE;
      END IF;
      SELECT * INTO v_existing FROM referral_attributions WHERE user_id = p_user_id;
      RETURN jsonb_build_object(
        'ok', true,
        'already', true,
        'partner_id', v_existing.partner_id,
        'attribution_id', v_existing.id
      );
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'already', false,
    'partner_id', v_existing.partner_id,
    'attribution_id', v_existing.id,
    'referral_code', v_existing.referral_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.attribute_referral(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attribute_referral(UUID, TEXT, TEXT) TO service_role;
