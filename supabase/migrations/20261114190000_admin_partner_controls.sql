-- Админ меняет статус и ставку уже выданного партнёра.
-- Код ссылки не меняется.
-- Удаление партнёра стирает его аккаунт. Чужие аккаунты не удаляются.
-- Обычное удаление журналов по-прежнему запрещено. Исключение действует
-- только внутри admin_purge_partner_account.

CREATE OR REPLACE FUNCTION public.reject_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_setting('app.partner_account_purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE'
       AND TG_TABLE_NAME = 'usage_financial_journal'
       AND NEW.partner_id IS NULL
       AND (to_jsonb(NEW) - 'partner_id') = (to_jsonb(OLD) - 'partner_id') THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'ledger row is immutable';
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_referral_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_partner_user UUID;
  v_click_created TIMESTAMPTZ;
  v_click_partner UUID;
  v_user_created TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.partner_account_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'attribution is immutable';
  END IF;

  SELECT user_id INTO v_partner_user FROM partners WHERE id = NEW.partner_id;
  IF v_partner_user = NEW.user_id THEN
    RAISE EXCEPTION 'self_referral';
  END IF;

  IF NEW.referral_click_id IS NULL THEN
    RAISE EXCEPTION 'attribution requires a click';
  END IF;

  SELECT c.created_at, c.partner_id, u.created_at
  INTO v_click_created, v_click_partner, v_user_created
  FROM referral_clicks AS c
  JOIN auth.users AS u ON u.id = NEW.user_id
  WHERE c.id = NEW.referral_click_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attribution click or user is missing';
  END IF;

  IF v_click_partner IS DISTINCT FROM NEW.partner_id THEN
    RAISE EXCEPTION 'attribution partner does not match click';
  END IF;

  IF v_user_created IS NULL OR v_user_created < v_click_created THEN
    RAISE EXCEPTION 'account_created_before_click';
  END IF;

  IF v_click_created < NOW() - INTERVAL '30 days' THEN
    RAISE EXCEPTION 'click is outside the 30 day window';
  END IF;

  RETURN NEW;
END;
$$;

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

COMMENT ON FUNCTION public.admin_update_issued_partner(UUID, UUID, TEXT, NUMERIC) IS
  'Меняет только статус и ставку. Реферальный код остаётся прежним. Пустая ставка не становится 40%.';

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

COMMENT ON FUNCTION public.admin_purge_partner_account(UUID, UUID) IS
  'Удаляет аккаунт партнёра целиком. Аккаунт администратора не удаляет. Приглашённые пользователи остаются, их записи о стоимости теряют ссылку на партнёра.';

REVOKE ALL ON FUNCTION public.admin_update_issued_partner(UUID, UUID, TEXT, NUMERIC)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_issued_partner(UUID, UUID, TEXT, NUMERIC)
  TO service_role;

REVOKE ALL ON FUNCTION public.admin_purge_partner_account(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_purge_partner_account(UUID, UUID)
  TO service_role;
