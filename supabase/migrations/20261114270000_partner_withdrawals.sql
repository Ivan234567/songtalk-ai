-- Вывод: партнёр запрашивает, выплачивает только администратор. Налог в цене уже заложен.

CREATE OR REPLACE FUNCTION public.preview_partner_month(
  p_partner_id UUID,
  p_month DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_month DATE;
  v_from TIMESTAMPTZ;
  v_to TIMESTAMPTZ;
  v_rate NUMERIC(5, 4);
  v_revenue NUMERIC := 0;
  v_paid_cost NUMERIC := 0;
  v_bonus_cost NUMERIC := 0;
  v_legacy_cost NUMERIC := 0;
  v_missing_cost INT := 0;
  v_non_actual INT := 0;
BEGIN
  PERFORM public.referral_require_service_role();
  IF p_partner_id IS NULL OR p_month IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT commission_rate INTO v_rate FROM partners WHERE id = p_partner_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_rate IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'month', date_trunc('month', p_month::timestamp)::date,
      'paid_revenue_rub', NULL,
      'paid_provider_cost_rub', NULL,
      'excluded_bonus_provider_cost_rub', NULL,
      'excluded_legacy_provider_cost_rub', NULL,
      'preliminary_commission_rub', NULL,
      'loss_carryforward', false,
      'commission_rate', NULL,
      'status', 'not_calculated',
      'blocked_reason', 'commission_rate_missing',
      'payable', false
    );
  END IF;

  v_month := date_trunc('month', p_month::timestamp)::date;
  v_from := v_month::timestamp AT TIME ZONE 'Europe/Moscow';
  v_to := (v_month + INTERVAL '1 month')::timestamp AT TIME ZONE 'Europe/Moscow';

  SELECT
    COALESCE(SUM(eligible_revenue_rub), 0),
    COALESCE(SUM(allocated_provider_cost_rub), 0),
    COUNT(*) FILTER (WHERE allocated_provider_cost_rub IS NULL)
  INTO v_revenue, v_paid_cost, v_missing_cost
  FROM partner_financial_ledger
  WHERE partner_id = p_partner_id
    AND status = 'not_calculated'
    AND source_type = 'paid'
    AND created_at >= v_from
    AND created_at < v_to;

  SELECT
    COALESCE(SUM(provider_cost_rub) FILTER (
      WHERE source_type = 'bonus' AND cost_source = 'provider_actual'
    ), 0),
    COALESCE(SUM(provider_cost_rub) FILTER (
      WHERE source_type = 'legacy_unclassified' AND cost_source = 'provider_actual'
    ), 0),
    COUNT(*) FILTER (
      WHERE source_type = 'paid' AND cost_source IS DISTINCT FROM 'provider_actual'
    )
  INTO v_bonus_cost, v_legacy_cost, v_non_actual
  FROM usage_financial_journal
  WHERE partner_id = p_partner_id
    AND created_at >= v_from
    AND created_at < v_to;

  IF v_missing_cost > 0 OR v_non_actual > 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'month', v_month,
      'paid_revenue_rub', v_revenue,
      'paid_provider_cost_rub', NULL,
      'excluded_bonus_provider_cost_rub', v_bonus_cost,
      'excluded_legacy_provider_cost_rub', v_legacy_cost,
      'preliminary_commission_rub', NULL,
      'loss_carryforward', false,
      'commission_rate', v_rate,
      'status', 'not_calculated',
      'blocked_reason', 'cost_not_actual',
      'payable', false
    );
  END IF;

  IF v_revenue - v_paid_cost <= 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'month', v_month,
      'paid_revenue_rub', v_revenue,
      'paid_provider_cost_rub', v_paid_cost,
      'excluded_bonus_provider_cost_rub', v_bonus_cost,
      'excluded_legacy_provider_cost_rub', v_legacy_cost,
      'preliminary_commission_rub', 0,
      'loss_carryforward', false,
      'commission_rate', v_rate,
      'status', 'not_calculated',
      'blocked_reason', NULL,
      'payable', false
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'month', v_month,
    'paid_revenue_rub', v_revenue,
    'paid_provider_cost_rub', v_paid_cost,
    'excluded_bonus_provider_cost_rub', v_bonus_cost,
    'excluded_legacy_provider_cost_rub', v_legacy_cost,
    'preliminary_commission_rub', round((v_revenue - v_paid_cost) * v_rate, 2),
    'loss_carryforward', false,
    'commission_rate', v_rate,
    'status', 'not_calculated',
    'blocked_reason', NULL,
    'payable', true
  );
END;
$$;


COMMENT ON FUNCTION public.preview_partner_month(UUID, DATE) IS
  'Сводка paid-части за месяц Москвы. Комиссия — ставка от квалифицируемой прибыли. Налог в цене уже заложен и второй раз не вычитается. Неизвестная себестоимость блокирует расчёт. Убыток не переносится.';

CREATE OR REPLACE FUNCTION public.partner_cabinet_shape_month(p_preview JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_profit NUMERIC;
  v_reason TEXT;
BEGIN
  IF p_preview IS NULL OR COALESCE((p_preview ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RETURN p_preview;
  END IF;

  IF jsonb_typeof(p_preview -> 'paid_revenue_rub') = 'number'
     AND jsonb_typeof(p_preview -> 'paid_provider_cost_rub') = 'number' THEN
    v_profit := round(
      (p_preview ->> 'paid_revenue_rub')::NUMERIC - (p_preview ->> 'paid_provider_cost_rub')::NUMERIC,
      2
    );
  ELSE
    v_profit := NULL;
  END IF;

  v_reason := p_preview ->> 'blocked_reason';

  RETURN p_preview || jsonb_build_object(
    'qualified_profit_rub', v_profit,
    'confirmation_available', v_reason IS NULL,
    'payout_available', false,
    'payout_blocked_reason', 'admin_payout_only'
  );
END;
$$;

CREATE TABLE IF NOT EXISTS public.partner_withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  amount_rub NUMERIC(12, 2) NOT NULL CHECK (amount_rub > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'rejected')),
  partner_note TEXT,
  decision_note TEXT,
  decided_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  CONSTRAINT partner_withdrawal_requests_partner_note_len CHECK (
    partner_note IS NULL OR char_length(partner_note) BETWEEN 1 AND 500
  ),
  CONSTRAINT partner_withdrawal_requests_decision_note_len CHECK (
    decision_note IS NULL OR char_length(decision_note) BETWEEN 1 AND 500
  ),
  CONSTRAINT partner_withdrawal_requests_decision CHECK (
    (status = 'pending' AND decided_at IS NULL AND decided_by IS NULL)
    OR (status IN ('paid', 'rejected') AND decided_at IS NOT NULL AND decided_by IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS partner_withdrawal_one_pending
  ON public.partner_withdrawal_requests (partner_id)
  WHERE status = 'pending';

COMMENT ON TABLE public.partner_withdrawal_requests IS
  'Запрос партнёра на вывод. Выплачивает только администратор. Деньги не списываются, пока статус не станет paid.';

ALTER TABLE public.partner_withdrawal_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.partner_withdrawal_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.partner_withdrawal_requests TO service_role;

CREATE OR REPLACE FUNCTION public.partner_withdrawal_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('app.partner_account_purge', true) = 'on' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'withdrawal row is immutable';
  END IF;
  IF OLD.status <> 'pending' OR NEW.status = 'pending' THEN
    RAISE EXCEPTION 'withdrawal row is immutable';
  END IF;
  IF NEW.amount_rub IS DISTINCT FROM OLD.amount_rub OR NEW.partner_id IS DISTINCT FROM OLD.partner_id THEN
    RAISE EXCEPTION 'withdrawal row is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partner_withdrawal_requests_guard ON public.partner_withdrawal_requests;
CREATE TRIGGER partner_withdrawal_requests_guard
  BEFORE UPDATE OR DELETE ON public.partner_withdrawal_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.partner_withdrawal_guard();

CREATE OR REPLACE FUNCTION public.partner_withdrawal_quote(p_partner_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_end DATE;
  v_start DATE;
  v_cursor DATE;
  v_first TIMESTAMPTZ;
  v_preview JSONB;
  v_earned NUMERIC := 0;
  v_known BOOLEAN := true;
  v_truncated BOOLEAN := false;
  v_blocked JSONB := '[]'::jsonb;
  v_paid NUMERIC;
  v_pending NUMERIC;
BEGIN
  PERFORM public.referral_require_service_role();
  IF p_partner_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.partners WHERE id = p_partner_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_partner');
  END IF;

  SELECT MIN(ts) INTO v_first
  FROM (
    SELECT MIN(created_at) AS ts FROM public.partner_financial_ledger WHERE partner_id = p_partner_id
    UNION ALL
    SELECT MIN(attributed_at) FROM public.referral_attributions WHERE partner_id = p_partner_id
  ) bounds;

  v_end := date_trunc('month', (NOW() AT TIME ZONE 'Europe/Moscow'))::date;
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
    v_preview := public.preview_partner_month(p_partner_id, v_cursor);
    IF COALESCE((v_preview ->> 'ok')::boolean, false) IS NOT TRUE THEN
      v_known := false;
    ELSIF v_preview ->> 'preliminary_commission_rub' IS NULL THEN
      v_blocked := v_blocked || jsonb_build_array(jsonb_build_object(
        'month', v_preview ->> 'month',
        'blocked_reason', v_preview ->> 'blocked_reason'
      ));
    ELSE
      v_earned := v_earned + (v_preview ->> 'preliminary_commission_rub')::NUMERIC;
    END IF;
    v_cursor := (v_cursor + INTERVAL '1 month')::date;
  END LOOP;

  SELECT COALESCE(SUM(amount_rub), 0) INTO v_paid
  FROM (
    SELECT amount_rub FROM public.partner_withdrawal_requests
    WHERE partner_id = p_partner_id AND status = 'paid'
    UNION ALL
    SELECT amount_rub FROM public.partner_commission_payouts
    WHERE partner_id = p_partner_id
  ) paid_rows;
  SELECT COALESCE(SUM(amount_rub), 0) INTO v_pending
  FROM public.partner_withdrawal_requests
  WHERE partner_id = p_partner_id AND status = 'pending';

  RETURN jsonb_build_object(
    'ok', true,
    'truncated', v_truncated,
    'earned_rub', CASE WHEN v_known AND NOT v_truncated THEN v_earned ELSE NULL END,
    'paid_rub', v_paid,
    'pending_rub', v_pending,
    'available_rub', CASE
      WHEN v_known AND NOT v_truncated THEN v_earned - v_paid - v_pending
      ELSE NULL
    END,
    'blocked_months', v_blocked
  );
END;
$$;

REVOKE ALL ON FUNCTION public.partner_withdrawal_quote(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

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

  DELETE FROM public.partner_withdrawal_requests
  WHERE partner_id = v_partner.id;

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


CREATE OR REPLACE FUNCTION public.partner_withdrawal_state(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_partner_id UUID;
  v_quote JSONB;
  v_rows JSONB;
BEGIN
  PERFORM public.referral_require_service_role();
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  SELECT id INTO v_partner_id FROM public.partners WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_partner');
  END IF;

  v_quote := public.partner_withdrawal_quote(v_partner_id);

  SELECT COALESCE(jsonb_agg(item ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'id', id,
      'amount_rub', amount_rub,
      'status', status,
      'partner_note', partner_note,
      'decision_note', decision_note,
      'created_at', created_at,
      'decided_at', decided_at
    ) AS item,
    created_at
    FROM public.partner_withdrawal_requests
    WHERE partner_id = v_partner_id
    ORDER BY created_at DESC
    LIMIT 100
  ) page;

  RETURN v_quote || jsonb_build_object('requests', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_request_withdrawal(
  p_user_id UUID,
  p_amount NUMERIC,
  p_note TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_partner_id UUID;
  v_quote JSONB;
  v_available NUMERIC;
  v_amount NUMERIC;
  v_note TEXT;
  v_id UUID;
BEGIN
  PERFORM public.referral_require_service_role();
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT id INTO v_partner_id
  FROM public.partners
  WHERE user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_partner');
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  IF p_amount IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  v_amount := round(p_amount, 2);
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  v_quote := public.partner_withdrawal_quote(v_partner_id);
  IF v_quote ->> 'available_rub' IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_available');
  END IF;
  v_available := (v_quote ->> 'available_rub')::NUMERIC;
  IF v_amount > v_available THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'amount_exceeds_available',
      'available_rub', v_available
    );
  END IF;

  BEGIN
    INSERT INTO public.partner_withdrawal_requests (partner_id, amount_rub, partner_note)
    VALUES (v_partner_id, v_amount, v_note)
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'error', 'request_pending');
  END;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'amount_rub', v_amount, 'status', 'pending');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_withdrawals(p_admin_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_count INT;
  v_pending INT;
  v_page JSONB;
BEGIN
  PERFORM public.referral_require_service_role();
  IF p_admin_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_admins WHERE user_id = p_admin_id
  ) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.partner_withdrawal_requests;
  SELECT COUNT(*) INTO v_pending
  FROM public.partner_withdrawal_requests
  WHERE status = 'pending';

  SELECT COALESCE(jsonb_agg(item ORDER BY pending DESC, created_at DESC), '[]'::jsonb)
  INTO v_page
  FROM (
    SELECT jsonb_build_object(
      'id', r.id,
      'partner_id', r.partner_id,
      'email', u.email::text,
      'referral_code', p.referral_code,
      'amount_rub', r.amount_rub,
      'status', r.status,
      'partner_note', r.partner_note,
      'decision_note', r.decision_note,
      'created_at', r.created_at,
      'decided_at', r.decided_at
    ) AS item,
    (r.status = 'pending') AS pending,
    r.created_at
    FROM public.partner_withdrawal_requests r
    JOIN public.partners p ON p.id = r.partner_id
    JOIN auth.users u ON u.id = p.user_id
    ORDER BY (r.status = 'pending') DESC, r.created_at DESC
    LIMIT 100
  ) page;

  RETURN jsonb_build_object(
    'ok', true,
    'truncated', v_count > 100,
    'pending_count', v_pending,
    'requests', v_page
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_decide_withdrawal(
  p_admin_id UUID,
  p_request_id UUID,
  p_decision TEXT,
  p_note TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_row public.partner_withdrawal_requests%ROWTYPE;
  v_user UUID;
  v_email TEXT;
  v_note TEXT;
  v_quote JSONB;
BEGIN
  PERFORM public.referral_require_service_role();
  IF p_admin_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_admins WHERE user_id = p_admin_id
  ) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('paid', 'rejected') THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.partner_withdrawal_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'already_decided' USING ERRCODE = '22023';
  END IF;

  IF p_decision = 'paid' THEN
    v_quote := public.partner_withdrawal_quote(v_row.partner_id);
    IF v_quote ->> 'available_rub' IS NULL
       OR (v_quote ->> 'available_rub')::NUMERIC < 0 THEN
      RAISE EXCEPTION 'not_available' USING ERRCODE = '22023';
    END IF;
  END IF;

  PERFORM set_config('app.admin_actor', p_admin_id::text, true);

  UPDATE public.partner_withdrawal_requests
  SET status = p_decision,
      decision_note = v_note,
      decided_by = p_admin_id,
      decided_at = NOW()
  WHERE id = v_row.id;

  SELECT p.user_id, u.email::text
  INTO v_user, v_email
  FROM public.partners p
  JOIN auth.users u ON u.id = p.user_id
  WHERE p.id = v_row.partner_id;

  PERFORM public.admin_audit_add(
    CASE WHEN p_decision = 'paid' THEN 'withdrawal_paid' ELSE 'withdrawal_rejected' END,
    v_user,
    v_email,
    'pending',
    v_row.amount_rub::text
  );

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'status', p_decision,
    'amount_rub', v_row.amount_rub
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_partner_referrals(
  p_admin_id UUID,
  p_partner_id UUID
) RETURNS JSONB
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
  IF p_partner_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.partners WHERE id = p_partner_id) THEN
    RAISE EXCEPTION 'partner_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.referral_attributions
  WHERE partner_id = p_partner_id;

  SELECT COALESCE(jsonb_agg(item ORDER BY attributed_at DESC), '[]'::jsonb)
  INTO v_page
  FROM (
    SELECT jsonb_build_object(
      'email', u.email::text,
      'attributed_at', a.attributed_at
    ) AS item,
    a.attributed_at
    FROM public.referral_attributions a
    JOIN auth.users u ON u.id = a.user_id
    WHERE a.partner_id = p_partner_id
    ORDER BY a.attributed_at DESC
    LIMIT 500
  ) page;

  RETURN jsonb_build_object(
    'ok', true,
    'truncated', v_count > 500,
    'total', v_count,
    'referrals', v_page
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_cabinet_payouts(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_partner_id UUID;
  v_rows JSONB;
BEGIN
  PERFORM public.referral_require_service_role();
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  SELECT id INTO v_partner_id FROM public.partners WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_partner');
  END IF;

  SELECT COALESCE(jsonb_agg(item ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'amount_rub', amount_rub,
      'created_at', created_at
    ) AS item,
    created_at
    FROM (
      SELECT amount_rub, created_at
      FROM public.partner_commission_payouts
      WHERE partner_id = v_partner_id
      UNION ALL
      SELECT amount_rub, decided_at
      FROM public.partner_withdrawal_requests
      WHERE partner_id = v_partner_id AND status = 'paid'
      ORDER BY created_at DESC
      LIMIT 200
    ) rows
  ) payouts;

  RETURN jsonb_build_object(
    'ok', true,
    'recording_available', false,
    'recording_blocked_reason', 'admin_payout_only',
    'payouts', v_rows
  );
END;
$$;

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
  FROM (
    SELECT amount_rub FROM public.partner_commission_payouts
    UNION ALL
    SELECT amount_rub FROM public.partner_withdrawal_requests WHERE status = 'paid'
  ) paid_rows;

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
    'recording_blocked_reason', 'admin_payout_only',
    'payouts', v_page
  );
END;
$$;

REVOKE ALL ON FUNCTION public.partner_withdrawal_state(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_request_withdrawal(UUID, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_withdrawals(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_decide_withdrawal(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_partner_referrals(UUID, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.partner_withdrawal_state(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_request_withdrawal(UUID, NUMERIC, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_withdrawals(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_decide_withdrawal(UUID, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_partner_referrals(UUID, UUID) TO service_role;
