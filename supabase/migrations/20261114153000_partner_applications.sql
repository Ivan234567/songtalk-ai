-- Заявка на партнёрство. Ссылку создаёт только подтверждение администратора.

CREATE TABLE IF NOT EXISTS public.partner_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  commission_rate NUMERIC(5, 4),
  referral_code TEXT,
  decision_note TEXT,
  decided_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  CONSTRAINT partner_applications_email_len CHECK (char_length(email) BETWEEN 3 AND 320),
  CONSTRAINT partner_applications_note_len CHECK (decision_note IS NULL OR char_length(decision_note) BETWEEN 1 AND 500),
  CONSTRAINT partner_applications_rate CHECK (
    commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 0.4000)
  ),
  CONSTRAINT partner_applications_code CHECK (
    referral_code IS NULL OR referral_code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS partner_applications_one_pending
  ON public.partner_applications (user_id)
  WHERE status = 'pending';

COMMENT ON TABLE public.partner_applications IS
  'Заявка пользователя. Партнёр и ссылка появляются только при status = approved.';

ALTER TABLE public.partner_applications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.partner_applications FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.partner_applications TO service_role;

CREATE OR REPLACE FUNCTION public.admin_decide_partner_application(
  p_admin_id UUID,
  p_application_id UUID,
  p_decision TEXT,
  p_rate NUMERIC,
  p_note TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_app public.partner_applications%ROWTYPE;
  v_code TEXT;
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

REVOKE ALL ON FUNCTION public.admin_decide_partner_application(UUID, UUID, TEXT, NUMERIC, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decide_partner_application(UUID, UUID, TEXT, NUMERIC, TEXT)
  TO service_role;
