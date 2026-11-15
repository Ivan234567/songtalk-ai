-- Потолок ставки партнёра: 99%. Пустая ставка при подтверждении заявки по-прежнему становится 40%.

ALTER TABLE public.partners DROP CONSTRAINT partners_commission_rate_check;
ALTER TABLE public.partners ADD CONSTRAINT partners_commission_rate_check
  CHECK (commission_rate >= 0 AND commission_rate <= 0.9900);

ALTER TABLE public.partner_financial_ledger DROP CONSTRAINT partner_financial_ledger_commission_rate_check;
ALTER TABLE public.partner_financial_ledger ADD CONSTRAINT partner_financial_ledger_commission_rate_check
  CHECK (commission_rate >= 0 AND commission_rate <= 0.9900);

ALTER TABLE public.partner_applications DROP CONSTRAINT partner_applications_rate;
ALTER TABLE public.partner_applications ADD CONSTRAINT partner_applications_rate
  CHECK (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 0.9900));

COMMENT ON COLUMN public.partners.commission_rate IS
  'Доля квалифицируемой прибыли оплаченной части. 0.9900 = 99%, максимум 99%. Пустое значение не подменяется. Не считается от бонуса.';

CREATE OR REPLACE FUNCTION public.admin_update_issued_partner(
  p_admin_id UUID,
  p_partner_id UUID,
  p_status TEXT,
  p_rate NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_partner public.partners%ROWTYPE;
  v_rate NUMERIC(5, 4);
BEGIN
  PERFORM public.referral_require_service_role();

  IF p_admin_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_admins WHERE user_id = p_admin_id
  ) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.admin_actor', p_admin_id::text, true);

  IF p_status IS NULL OR p_status NOT IN ('active', 'paused', 'disabled') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF p_rate IS NULL OR p_rate < 0 OR p_rate > 0.9900 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  v_rate := round(p_rate, 4);

  SELECT * INTO v_partner
  FROM public.partners
  WHERE id = p_partner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partner_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.partners
  SET status = p_status,
      commission_rate = v_rate
  WHERE id = v_partner.id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_partner.id,
    'referral_code', v_partner.referral_code,
    'status', p_status,
    'commission_rate', v_rate
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_decide_partner_application(
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

  PERFORM set_config('app.admin_actor', p_admin_id::text, true);

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
    PERFORM public.admin_audit_add(
      'application_rejected', v_app.user_id, v_app.email, 'pending', 'rejected'
    );
    RETURN jsonb_build_object('ok', true, 'status', 'rejected');
  END IF;

  v_rate := COALESCE(p_rate, 0.4000);
  IF v_rate < 0 OR v_rate > 0.9900 THEN
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
