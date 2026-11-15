-- Журнал новых действий администратора. Старые события сюда не копируются.

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id UUID,
  actor_email TEXT,
  action TEXT NOT NULL,
  partner_email TEXT,
  before_value TEXT,
  after_value TEXT,
  CONSTRAINT admin_audit_log_action_len CHECK (char_length(action) BETWEEN 1 AND 64)
);

COMMENT ON TABLE public.admin_audit_log IS
  'Только новые смены статуса, ставки, промокода, выдача ссылки, отклонение заявки и удаление аккаунта. История назад не дописывается.';

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admin_audit_log TO service_role;

CREATE OR REPLACE FUNCTION public.admin_audit_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'audit row is immutable';
END;
$$;

DROP TRIGGER IF EXISTS admin_audit_log_immutable ON public.admin_audit_log;
CREATE TRIGGER admin_audit_log_immutable
  BEFORE UPDATE OR DELETE ON public.admin_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.admin_audit_guard();

CREATE OR REPLACE FUNCTION public.admin_audit_add(
  p_action TEXT,
  p_partner_user_id UUID,
  p_partner_email TEXT,
  p_before TEXT,
  p_after TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_actor_email TEXT;
  v_partner_email TEXT;
BEGIN
  BEGIN
    v_actor := NULLIF(current_setting('app.admin_actor', true), '')::UUID;
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_actor := NULL;
  END;

  IF v_actor IS NOT NULL THEN
    SELECT u.email::text INTO v_actor_email
    FROM auth.users u
    WHERE u.id = v_actor;
  END IF;

  v_partner_email := NULLIF(btrim(COALESCE(p_partner_email, '')), '');
  IF v_partner_email IS NULL AND p_partner_user_id IS NOT NULL THEN
    SELECT u.email::text INTO v_partner_email
    FROM auth.users u
    WHERE u.id = p_partner_user_id;
  END IF;

  INSERT INTO public.admin_audit_log (
    actor_id, actor_email, action, partner_email, before_value, after_value
  ) VALUES (
    v_actor, v_actor_email, p_action, v_partner_email, p_before, p_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_audit_add(TEXT, UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_audit_partner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.admin_audit_add(
      'code_issued', NEW.user_id, NULL, NULL, NEW.referral_code
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.admin_audit_add(
        'status', NEW.user_id, NULL, OLD.status, NEW.status
      );
    END IF;
    IF NEW.commission_rate IS DISTINCT FROM OLD.commission_rate THEN
      PERFORM public.admin_audit_add(
        'commission_rate',
        NEW.user_id,
        NULL,
        OLD.commission_rate::text,
        NEW.commission_rate::text
      );
    END IF;
    IF NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN
      PERFORM public.admin_audit_add(
        'referral_code', NEW.user_id, NULL, OLD.referral_code, NEW.referral_code
      );
    END IF;
    RETURN NEW;
  END IF;

  PERFORM public.admin_audit_add(
    'account_deleted', OLD.user_id, NULL, OLD.referral_code, 'Аккаунт удалён'
  );
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_audit_partner()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS admin_audit_partner ON public.partners;
CREATE TRIGGER admin_audit_partner
  AFTER INSERT OR UPDATE OR DELETE ON public.partners
  FOR EACH ROW
  EXECUTE FUNCTION public.admin_audit_partner();

CREATE OR REPLACE FUNCTION public.admin_audit_entries(p_admin_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_count INT;
  v_page JSONB;
BEGIN
  PERFORM public.referral_require_service_role();

  IF p_admin_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_admins WHERE user_id = p_admin_id
  ) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.admin_audit_log;

  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
  INTO v_page
  FROM (
    SELECT jsonb_build_object(
      'id', id,
      'created_at', created_at,
      'actor_email', actor_email,
      'action', action,
      'partner_email', partner_email,
      'before_value', before_value,
      'after_value', after_value
    ) AS item
    FROM public.admin_audit_log
    ORDER BY created_at DESC, id DESC
    LIMIT 100
  ) page;

  RETURN jsonb_build_object(
    'ok', true,
    'truncated', v_count > 100,
    'entries', v_page
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_audit_entries(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_audit_entries(UUID)
  TO service_role;

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

  IF p_rate IS NULL OR p_rate < 0 OR p_rate > 0.4000 THEN
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

CREATE OR REPLACE FUNCTION public.admin_purge_partner_account(
  p_admin_id UUID,
  p_partner_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_partner public.partners%ROWTYPE;
  v_left INT;
BEGIN
  PERFORM public.referral_require_service_role();

  IF p_admin_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_admins WHERE user_id = p_admin_id
  ) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.admin_actor', p_admin_id::text, true);

  SELECT * INTO v_partner
  FROM public.partners
  WHERE id = p_partner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partner_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = v_partner.user_id) THEN
    RAISE EXCEPTION 'admin_account' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.partner_account_purge', 'on', true);

  DELETE FROM public.partner_commission_payouts
  WHERE partner_id = v_partner.id;

  DELETE FROM public.partner_financial_ledger
  WHERE partner_id = v_partner.id
     OR user_id = v_partner.user_id;

  UPDATE public.usage_financial_journal
  SET partner_id = NULL
  WHERE partner_id = v_partner.id
    AND user_id <> v_partner.user_id;

  DELETE FROM public.usage_financial_journal
  WHERE user_id = v_partner.user_id;

  SELECT COUNT(*)::INT INTO v_left
  FROM public.usage_financial_journal
  WHERE partner_id = v_partner.id;

  IF v_left > 0 THEN
    RAISE EXCEPTION 'purge_blocked' USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.balance_ledger
  WHERE user_id = v_partner.user_id;

  DELETE FROM public.user_balance_lots
  WHERE user_id = v_partner.user_id;

  DELETE FROM public.referral_attributions
  WHERE partner_id = v_partner.id
     OR user_id = v_partner.user_id;

  DELETE FROM public.referral_clicks
  WHERE partner_id = v_partner.id;

  DELETE FROM public.partner_applications
  WHERE user_id = v_partner.user_id;

  DELETE FROM public.partners
  WHERE id = v_partner.id;

  DELETE FROM auth.users
  WHERE id = v_partner.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'account_delete_failed' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'referral_code', v_partner.referral_code
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

  PERFORM set_config('app.admin_actor', p_admin_id::text, true);

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
