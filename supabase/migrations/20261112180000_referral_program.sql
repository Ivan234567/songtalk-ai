-- Реферальная программа: партии, журналы и атрибуция поверх текущего баланса.
-- Файл не применялся к production. Исторический balance_rub в paid не копируется.
--
-- Изменения относительно предыдущей версии:
--  [1] attribute_referral берёт последний клик ДО регистрации (created_at <= user.created_at).
--  [2] credit_gateway_payment не зачисляет заказы в явно неоплаченных статусах.
--  [3] Ставка партнёра ограничена CHECK-ом (<= 0.4000), скрытый LEAST(...) удалён.
--  [4] Срок жизни бонусов не поддерживается ни одной функцией.
--  [5] topup_balance, fail_operation, reserve_operation, mark_operation_started
--      становятся SECURITY DEFINER: после REVOKE прямых прав service_role на
--      user_balances / balance_transactions они иначе не смогут писать.
--  [6] Обработчик unique_violation в grant_welcome_bonus терпим к имени ограничения balance_transactions.
--
-- План перехода, без смены формулы цены и без второй комиссии ЮKassa:
-- 1. deduct_balance, settle_operation, abandon_operation и abandon_stale_operations
--    по-прежнему списывают ту же сумму с user_balances и пишут balance_transactions.
--    В той же транзакции apply_balance_draw уменьшает конкретные партии на ту же сумму.
-- 2. credit_gateway_payment по-прежнему зачисляет credit_rub и выходит, если заказ уже зачислен.
--    В той же транзакции появляется paid-партия на credit_rub. charge_rub не вычитается.
-- 3. grant_welcome_bonus начисляет 50 только новой регистрации после реферального перехода.
--    Обычная регистрация, самореферал и старый аккаунт бонус не получают.
--    Повторный вызов и старая проводка reason = welcome_bonus вторые 50 не создают и партию не заводят.
-- 4. record_usage_financials читает уже записанный balance_ledger и не принимает суммы источников от клиента.
--    provider_actual — фактическая стоимость. tariff_estimate — только при надёжном тарифе и объёме.
--    Иначе unknown. Оба последних статуса комиссию не подтверждают.
-- 5. Налог не считается. Комиссия не получает статус confirmed и не выплачивается из базы.
--    Месяц считается по Europe/Moscow. Убыток месяца не переносится. Ставка партнёра 40%.
--    paid — только подтверждённое поступление денег через credit_gateway_payment.
--
-- Вызовы Node для списания и ЮKassa не меняются: они уже вызывают эти SQL-функции.
-- exchange должен вызывать только grant_welcome_bonus и не вызывать topup_balance для бонуса.
--
-- Известные ограничения (решаются отдельно от этого файла):
--  * ON DELETE RESTRICT на auth.users: пользователя с записями в журналах нельзя удалить,
--    нужна процедура анонимизации.
--  * Возвраты и чарджбэки не уменьшают paid-партии (тип refund зарезервирован).
--  * Ручные пополнения через topup_balance не создают партий и попадают в legacy_unclassified.
--  * Срок жизни бонусов не поддерживается.

-- ---------------------------------------------------------------------------
-- Партнёры
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  referral_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
  commission_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.4000 CHECK (commission_rate >= 0 AND commission_rate <= 0.4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partners_referral_code_format CHECK (referral_code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS partners_referral_code_lower_key
  ON partners (lower(referral_code));

COMMENT ON COLUMN partners.commission_rate IS
  'Доля квалифицируемой прибыли оплаченной части. 0.4000 = 40%, максимум 40% (CHECK). Не считается от бонуса.';
COMMENT ON COLUMN partners.status IS
  'active принимает новых привлечённых, paused и disabled — нет. Старые атрибуции не удаляются.';

CREATE OR REPLACE FUNCTION public.partners_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partners_touch_updated_at ON partners;
CREATE TRIGGER partners_touch_updated_at
  BEFORE UPDATE ON partners
  FOR EACH ROW
  EXECUTE FUNCTION public.partners_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Переходы. IP не хранится.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS referral_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  referral_code TEXT NOT NULL,
  anonymous_id TEXT NOT NULL,
  landing_path TEXT,
  campaign TEXT,
  referrer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referral_clicks_anonymous_id_len CHECK (char_length(anonymous_id) BETWEEN 8 AND 128),
  CONSTRAINT referral_clicks_landing_path_len CHECK (landing_path IS NULL OR char_length(landing_path) <= 512),
  CONSTRAINT referral_clicks_campaign_len CHECK (campaign IS NULL OR char_length(campaign) BETWEEN 1 AND 64),
  CONSTRAINT referral_clicks_referrer_len CHECK (referrer IS NULL OR char_length(referrer) <= 512)
);

CREATE INDEX IF NOT EXISTS referral_clicks_anonymous_recent_idx
  ON referral_clicks (anonymous_id, created_at DESC);

CREATE INDEX IF NOT EXISTS referral_clicks_partner_created_idx
  ON referral_clicks (partner_id, created_at DESC);

COMMENT ON TABLE referral_clicks IS
  'Обезличенный переход по /r/{code}. Не содержит email, имени и IP.';

-- ---------------------------------------------------------------------------
-- Одна атрибуция на пользователя. Last click, 30 дней, дальше строка не меняется.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS referral_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  referral_click_id UUID REFERENCES referral_clicks(id) ON DELETE RESTRICT,
  referral_code TEXT NOT NULL,
  campaign TEXT,
  attributed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attribution_type TEXT NOT NULL DEFAULT 'last_click_30d' CHECK (attribution_type = 'last_click_30d'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_attributions_partner_idx
  ON referral_attributions (partner_id, attributed_at DESC);

COMMENT ON TABLE referral_attributions IS
  'Первая и единственная привязка пользователя. Повторный вход строку не создаёт и партнёра не меняет.';

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

DROP TRIGGER IF EXISTS guard_referral_attribution ON referral_attributions;
CREATE TRIGGER guard_referral_attribution
  BEFORE INSERT OR UPDATE OR DELETE ON referral_attributions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_referral_attribution();

CREATE OR REPLACE FUNCTION public.guard_referral_click()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_code TEXT;
BEGIN
  SELECT referral_code INTO v_code FROM partners WHERE id = NEW.partner_id;
  IF v_code IS NULL OR lower(v_code) <> lower(NEW.referral_code) THEN
    RAISE EXCEPTION 'referral code does not match partner';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_referral_click ON referral_clicks;
CREATE TRIGGER guard_referral_click
  BEFORE INSERT OR UPDATE ON referral_clicks
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_referral_click();

-- ---------------------------------------------------------------------------
-- Партии баланса. Исторический котёл user_balances не переписывается.
-- Срок жизни партий не поддерживается.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_balance_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL CHECK (source_type IN ('bonus', 'paid', 'legacy_unclassified')),
  original_amount NUMERIC(12, 2) NOT NULL CHECK (original_amount > 0),
  remaining_amount NUMERIC(12, 2) NOT NULL CHECK (remaining_amount >= 0 AND remaining_amount <= original_amount),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reference_type TEXT,
  reference_id TEXT,
  CONSTRAINT user_balance_lots_reference_len CHECK (
    reference_type IS NULL OR char_length(reference_type) <= 64
  ),
  CONSTRAINT user_balance_lots_reference_id_len CHECK (
    reference_id IS NULL OR char_length(reference_id) <= 128
  ),
  CONSTRAINT user_balance_lots_paid_is_gateway CHECK (
    source_type <> 'paid' OR reference_type = 'payment_order'
  )
);

CREATE INDEX IF NOT EXISTS user_balance_lots_draw_idx
  ON user_balance_lots (user_id, source_type, created_at, id)
  WHERE remaining_amount > 0;

CREATE UNIQUE INDEX IF NOT EXISTS user_balance_lots_one_welcome
  ON user_balance_lots (user_id)
  WHERE reference_type = 'welcome_bonus';

CREATE UNIQUE INDEX IF NOT EXISTS user_balance_lots_one_payment
  ON user_balance_lots (reference_id)
  WHERE source_type = 'paid' AND reference_type = 'payment_order';

-- Прямая вставка paid-партии не заменяет credit_gateway_payment.
CREATE OR REPLACE FUNCTION public.guard_paid_balance_lot()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_order_id UUID;
  v_user UUID;
  v_credit NUMERIC;
BEGIN
  IF NEW.source_type IS DISTINCT FROM 'paid' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_order_id := NEW.reference_id::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'paid lot does not match a payment order';
  END;

  SELECT user_id, credit_rub
  INTO v_user, v_credit
  FROM payment_orders
  WHERE id = v_order_id;

  IF NOT FOUND
     OR v_user IS DISTINCT FROM NEW.user_id
     OR v_credit IS DISTINCT FROM NEW.original_amount
     OR NEW.remaining_amount IS DISTINCT FROM NEW.original_amount
     OR NEW.reference_type IS DISTINCT FROM 'payment_order' THEN
    RAISE EXCEPTION 'paid lot does not match a payment order';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_paid_balance_lot ON user_balance_lots;
CREATE TRIGGER guard_paid_balance_lot
  BEFORE INSERT ON user_balance_lots
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_paid_balance_lot();

COMMENT ON COLUMN user_balance_lots.source_type IS
  'bonus — маркетинговые единицы. paid — только подтверждённое поступление денег. legacy_unclassified — происхождение неизвестно, это не paid.';
COMMENT ON TABLE user_balance_lots IS
  'Партии поверх user_balances. Отсутствие партии не означает, что текущий balance_rub оплачен.';

-- ---------------------------------------------------------------------------
-- Неизменяемый журнал движений партий.
-- Несколько партий одного источника различаются balance_lot_id.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS balance_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL CHECK (source_type IN ('bonus', 'paid', 'legacy_unclassified')),
  operation_type TEXT NOT NULL CHECK (operation_type IN (
    'welcome_bonus', 'topup_paid', 'usage', 'refund', 'adjustment'
  )),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount <> 0),
  balance_lot_id UUID REFERENCES user_balance_lots(id) ON DELETE RESTRICT,
  reference_type TEXT,
  reference_id TEXT,
  operation_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT balance_ledger_operation_id_len CHECK (char_length(operation_id) BETWEEN 1 AND 128),
  CONSTRAINT balance_ledger_lot_matches_source CHECK (
    (source_type = 'legacy_unclassified' AND balance_lot_id IS NULL)
    OR (source_type IN ('bonus', 'paid') AND balance_lot_id IS NOT NULL)
  ),
  CONSTRAINT balance_ledger_welcome_is_bonus CHECK (
    operation_type <> 'welcome_bonus'
    OR (source_type = 'bonus' AND amount > 0)
  ),
  CONSTRAINT balance_ledger_topup_is_paid CHECK (
    operation_type <> 'topup_paid'
    OR (source_type = 'paid' AND amount > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS balance_ledger_operation_lot_key
  ON balance_ledger (user_id, operation_id, balance_lot_id, operation_type)
  WHERE balance_lot_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS balance_ledger_operation_legacy_key
  ON balance_ledger (user_id, operation_id, source_type, operation_type)
  WHERE balance_lot_id IS NULL;

CREATE INDEX IF NOT EXISTS balance_ledger_user_created_idx
  ON balance_ledger (user_id, created_at DESC);

COMMENT ON TABLE balance_ledger IS
  'Append-only. Повтор той же партии в той же операции не создаёт второе движение. Партии одного источника не схлопываются в один ключ.';
COMMENT ON COLUMN balance_ledger.operation_type IS
  'welcome_bonus не является пополнением. topup_paid — только реальные деньги пользователя, сумма credit_rub.';

-- ---------------------------------------------------------------------------
-- Журнал стоимости использования. Строка связана с конкретным движением партии.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS usage_financial_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  partner_id UUID REFERENCES partners(id) ON DELETE RESTRICT,
  operation_id TEXT NOT NULL,
  balance_ledger_id UUID NOT NULL REFERENCES balance_ledger(id) ON DELETE RESTRICT,
  balance_lot_id UUID REFERENCES user_balance_lots(id) ON DELETE RESTRICT,
  service_type TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('bonus', 'paid', 'legacy_unclassified')),
  consumed_amount NUMERIC(12, 2) NOT NULL CHECK (consumed_amount > 0),
  provider_cost_rub NUMERIC(12, 2),
  provider TEXT,
  model TEXT,
  cost_source TEXT NOT NULL CHECK (cost_source IN ('provider_actual', 'tariff_estimate', 'unknown')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT usage_financial_journal_operation_id_len CHECK (char_length(operation_id) BETWEEN 1 AND 128),
  CONSTRAINT usage_financial_journal_cost_known CHECK (
    (cost_source = 'unknown' AND provider_cost_rub IS NULL)
    OR (cost_source IN ('provider_actual', 'tariff_estimate') AND provider_cost_rub IS NOT NULL AND provider_cost_rub >= 0)
  ),
  CONSTRAINT usage_financial_journal_lot_matches_source CHECK (
    (source_type = 'legacy_unclassified' AND balance_lot_id IS NULL)
    OR (source_type IN ('bonus', 'paid') AND balance_lot_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS usage_financial_journal_ledger_key
  ON usage_financial_journal (balance_ledger_id);

CREATE UNIQUE INDEX IF NOT EXISTS usage_financial_journal_operation_lot_key
  ON usage_financial_journal (user_id, operation_id, balance_lot_id)
  WHERE balance_lot_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS usage_financial_journal_operation_legacy_key
  ON usage_financial_journal (user_id, operation_id, source_type)
  WHERE balance_lot_id IS NULL;

CREATE INDEX IF NOT EXISTS usage_financial_journal_user_idx
  ON usage_financial_journal (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS usage_financial_journal_partner_idx
  ON usage_financial_journal (partner_id, created_at DESC)
  WHERE partner_id IS NOT NULL;

COMMENT ON COLUMN usage_financial_journal.cost_source IS
  'provider_actual — достоверная стоимость провайдера. tariff_estimate — только при надёжном тарифе и достоверном объёме. unknown — оценки нет. tariff_estimate и unknown комиссию не подтверждают.';
COMMENT ON COLUMN usage_financial_journal.provider_cost_rub IS
  'Доля стоимости API этой партии. Сумма долей одной операции равна общей стоимости один раз.';

-- ---------------------------------------------------------------------------
-- Партнёрский журнал. Только оплаченная часть. Комиссия не подтверждена, пока нет данных.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS partner_financial_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  operation_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type = 'paid'),
  eligible_revenue_rub NUMERIC(12, 2) NOT NULL CHECK (eligible_revenue_rub >= 0),
  allocated_provider_cost_rub NUMERIC(12, 2),
  tax_amount_rub NUMERIC(12, 2),
  eligible_profit_rub NUMERIC(12, 2),
  commission_rate NUMERIC(5, 4) NOT NULL CHECK (commission_rate >= 0 AND commission_rate <= 0.4000),
  commission_amount_rub NUMERIC(12, 2),
  status TEXT NOT NULL CHECK (status IN ('not_calculated', 'confirmed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_financial_ledger_operation_id_len CHECK (char_length(operation_id) BETWEEN 1 AND 128),
  CONSTRAINT partner_financial_ledger_open_is_blank CHECK (
    status <> 'not_calculated'
    OR (
      tax_amount_rub IS NULL
      AND eligible_profit_rub IS NULL
      AND commission_amount_rub IS NULL
    )
  ),
  CONSTRAINT partner_financial_ledger_confirmed_is_complete CHECK (
    status <> 'confirmed'
    OR (
      tax_amount_rub IS NOT NULL
      AND eligible_profit_rub IS NOT NULL
      AND commission_amount_rub IS NOT NULL
      AND allocated_provider_cost_rub IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS partner_financial_ledger_one_open
  ON partner_financial_ledger (user_id, operation_id)
  WHERE status = 'not_calculated';

CREATE UNIQUE INDEX IF NOT EXISTS partner_financial_ledger_one_confirmed
  ON partner_financial_ledger (user_id, operation_id)
  WHERE status = 'confirmed';

CREATE INDEX IF NOT EXISTS partner_financial_ledger_partner_idx
  ON partner_financial_ledger (partner_id, created_at DESC);

COMMENT ON TABLE partner_financial_ledger IS
  'Только source_type = paid. Бонус и legacy сюда не пишутся: их расход не уменьшает базу комиссии. Подтверждение — новая строка, старая не редактируется.';
COMMENT ON COLUMN partner_financial_ledger.tax_amount_rub IS
  'Пусто, пока налог не передан отдельно. Из формулы цены ученика сюда ничего не подставляется.';
COMMENT ON COLUMN partner_financial_ledger.commission_amount_rub IS
  'Пусто, пока прибыль не подтверждена. Повторное подтверждение той же операции блокирует уникальный индекс.';

-- Одна строка на операцию: подтверждённая, если она есть, иначе открытая.
CREATE OR REPLACE VIEW public.partner_financial_entries
WITH (security_invoker = true) AS
SELECT DISTINCT ON (user_id, operation_id)
  id,
  partner_id,
  user_id,
  operation_id,
  source_type,
  eligible_revenue_rub,
  allocated_provider_cost_rub,
  tax_amount_rub,
  eligible_profit_rub,
  commission_rate,
  commission_amount_rub,
  status,
  created_at
FROM partner_financial_ledger
ORDER BY user_id, operation_id, (status = 'confirmed') DESC, created_at DESC;

COMMENT ON VIEW public.partner_financial_entries IS
  'Не суммировать partner_financial_ledger напрямую: открытая и подтверждённая строки одной операции сложились бы дважды.';

-- Выплата ссылается на конкретную подтверждённую строку и не повторяется.
CREATE TABLE IF NOT EXISTS partner_commission_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_ledger_id UUID NOT NULL UNIQUE REFERENCES partner_financial_ledger(id) ON DELETE RESTRICT,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  operation_id TEXT NOT NULL,
  amount_rub NUMERIC(12, 2) NOT NULL CHECK (amount_rub > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_commission_payouts_operation_id_len CHECK (char_length(operation_id) BETWEEN 1 AND 128),
  CONSTRAINT partner_commission_payouts_partner_operation_key UNIQUE (partner_id, operation_id)
);

COMMENT ON TABLE partner_commission_payouts IS
  'Реквизиты партнёра здесь не хранятся. Автоматическая выплата отключена: деньги уходят вручную вне системы.';

CREATE OR REPLACE FUNCTION public.reject_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'ledger row is immutable';
END;
$$;

DROP TRIGGER IF EXISTS balance_ledger_immutable ON balance_ledger;
CREATE TRIGGER balance_ledger_immutable
  BEFORE UPDATE OR DELETE ON balance_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_ledger_mutation();

DROP TRIGGER IF EXISTS usage_financial_journal_immutable ON usage_financial_journal;
CREATE TRIGGER usage_financial_journal_immutable
  BEFORE UPDATE OR DELETE ON usage_financial_journal
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_ledger_mutation();

DROP TRIGGER IF EXISTS partner_financial_ledger_immutable ON partner_financial_ledger;
CREATE TRIGGER partner_financial_ledger_immutable
  BEFORE UPDATE OR DELETE ON partner_financial_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_ledger_mutation();

DROP TRIGGER IF EXISTS partner_commission_payouts_immutable ON partner_commission_payouts;
CREATE TRIGGER partner_commission_payouts_immutable
  BEFORE UPDATE OR DELETE ON partner_commission_payouts
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_ledger_mutation();

-- ---------------------------------------------------------------------------
-- Доверенный контекст. user_id из аргумента сам по себе права не даёт.
-- service_role JWT — backend после resolveUserId.
-- Пустой JWT и session_user postgres/supabase_admin — SQL-редактор и тесты.
-- authenticated и anon отклоняются даже при совпадении user_id.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.referral_require_service_role()
RETURNS VOID
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_claims TEXT;
BEGIN
  v_role := NULLIF(current_setting('request.jwt.claim.role', true), '');
  IF v_role IS NULL THEN
    v_claims := NULLIF(current_setting('request.jwt.claims', true), '');
    IF v_claims IS NOT NULL THEN
      v_role := v_claims::jsonb ->> 'role';
    END IF;
  END IF;

  IF v_role = 'service_role' THEN
    RETURN;
  END IF;

  IF v_role IS NULL AND session_user IN ('postgres', 'supabase_admin') THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END;
$$;

-- ---------------------------------------------------------------------------
-- Клик и атрибуция. Клиентский код не является доказательством.
-- ---------------------------------------------------------------------------

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
BEGIN
  PERFORM public.referral_require_service_role();
  v_anonymous := NULLIF(btrim(COALESCE(p_anonymous_id, '')), '');

  IF v_anonymous IS NULL OR char_length(v_anonymous) < 8 OR char_length(v_anonymous) > 128 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT * INTO v_partner
  FROM partners
  WHERE lower(referral_code) = lower(btrim(COALESCE(p_referral_code, '')))
  FOR SHARE;

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

CREATE OR REPLACE FUNCTION public.attribute_referral(
  p_user_id UUID,
  p_anonymous_id TEXT
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
BEGIN
  PERFORM public.referral_require_service_role();

  IF p_user_id IS NULL OR NULLIF(btrim(COALESCE(p_anonymous_id, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  -- Второй одновременный exchange ждёт и видит уже вставленную строку.
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

  -- Last click среди переходов ДО создания аккаунта и не старше 30 дней.
  -- Клик, сделанный уже после регистрации, не вытесняет валидный более ранний.
  SELECT * INTO v_click
  FROM referral_clicks
  WHERE anonymous_id = btrim(p_anonymous_id)
    AND created_at >= NOW() - INTERVAL '30 days'
    AND created_at <= v_user_created_at
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_click_in_window');
  END IF;

  SELECT * INTO v_partner FROM partners WHERE id = v_click.partner_id FOR SHARE;

  IF NOT FOUND OR v_partner.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partner_inactive');
  END IF;

  IF v_partner.user_id = p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_referral');
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

-- ---------------------------------------------------------------------------
-- Списание партий на уже снятую с user_balances сумму.
-- Не меняет balance_rub: это делает вызывающая функция в той же транзакции.
-- Снаружи API не выдаётся.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_balance_draw(
  p_user_id UUID,
  p_operation_id TEXT,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_operation_id TEXT;
  v_need NUMERIC(12, 2);
  v_take NUMERIC(12, 2);
  v_bonus NUMERIC(12, 2) := 0;
  v_paid NUMERIC(12, 2) := 0;
  v_legacy NUMERIC(12, 2) := 0;
  v_lot user_balance_lots%ROWTYPE;
  v_updated INT;
BEGIN
  PERFORM public.referral_require_service_role();
  v_operation_id := NULLIF(btrim(COALESCE(p_operation_id, '')), '');
  IF p_user_id IS NULL OR v_operation_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  v_need := round(p_amount, 2);
  IF v_need <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  PERFORM 1
  FROM user_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM balance_ledger
    WHERE user_id = p_user_id
      AND operation_id = v_operation_id
      AND operation_type = 'usage'
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  FOR v_lot IN
    SELECT *
    FROM user_balance_lots
    WHERE user_id = p_user_id AND source_type = 'bonus' AND remaining_amount > 0
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_need <= 0;
    v_take := LEAST(v_lot.remaining_amount, v_need);
    UPDATE user_balance_lots
    SET remaining_amount = remaining_amount - v_take
    WHERE id = v_lot.id AND remaining_amount >= v_take;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'bonus lot draw failed';
    END IF;
    INSERT INTO balance_ledger (
      user_id, source_type, operation_type, amount, balance_lot_id, operation_id
    )
    VALUES (p_user_id, 'bonus', 'usage', -v_take, v_lot.id, v_operation_id);
    v_bonus := v_bonus + v_take;
    v_need := v_need - v_take;
  END LOOP;

  FOR v_lot IN
    SELECT *
    FROM user_balance_lots
    WHERE user_id = p_user_id AND source_type = 'paid' AND remaining_amount > 0
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_need <= 0;
    v_take := LEAST(v_lot.remaining_amount, v_need);
    UPDATE user_balance_lots
    SET remaining_amount = remaining_amount - v_take
    WHERE id = v_lot.id AND remaining_amount >= v_take;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'paid lot draw failed';
    END IF;
    INSERT INTO balance_ledger (
      user_id, source_type, operation_type, amount, balance_lot_id, operation_id
    )
    VALUES (p_user_id, 'paid', 'usage', -v_take, v_lot.id, v_operation_id);
    v_paid := v_paid + v_take;
    v_need := v_need - v_take;
  END LOOP;

  -- Остаток не превращается в paid-партию.
  IF v_need > 0 THEN
    INSERT INTO balance_ledger (
      user_id, source_type, operation_type, amount, balance_lot_id, operation_id
    )
    VALUES (p_user_id, 'legacy_unclassified', 'usage', -v_need, NULL, v_operation_id);
    v_legacy := v_need;
    v_need := 0;
  END IF;

  IF round(v_bonus + v_paid + v_legacy, 2) <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'draw mismatch';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'already', false,
    'bonus', v_bonus,
    'paid', v_paid,
    'legacy_unclassified', v_legacy
  );
END;
$$;

COMMENT ON FUNCTION public.apply_balance_draw(UUID, TEXT, NUMERIC) IS
  'Разносит уже снятые рубли по партиям: бонус, затем paid, остаток — legacy без новой партии. API-роли функцию не вызывают.';

-- ---------------------------------------------------------------------------
-- Приветственные 50. Баланс, бонусная партия и журналы — одна транзакция.
-- Старое начисление topup_manual с reason welcome_bonus повторно не дописывается и в партию не переносится.
-- ---------------------------------------------------------------------------

ALTER TYPE balance_transaction_type ADD VALUE IF NOT EXISTS 'welcome_bonus';

CREATE OR REPLACE FUNCTION public.grant_welcome_bonus(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_lot_id UUID;
  v_operation_id TEXT;
  v_balance NUMERIC(12, 2);
  v_constraint TEXT;
  v_user_created TIMESTAMPTZ;
  v_click_created TIMESTAMPTZ;
  v_partner_user UUID;
  v_reason TEXT;
BEGIN
  PERFORM public.referral_require_service_role();

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  v_operation_id := 'welcome-bonus:' || p_user_id::text;
  PERFORM pg_advisory_xact_lock(hashtext('welcome-bonus:' || p_user_id::text));

  SELECT id INTO v_lot_id
  FROM user_balance_lots
  WHERE user_id = p_user_id AND reference_type = 'welcome_bonus';

  IF FOUND OR EXISTS (
    SELECT 1 FROM balance_ledger
    WHERE operation_id = v_operation_id AND operation_type = 'welcome_bonus'
  ) OR EXISTS (
    SELECT 1 FROM balance_transactions
    WHERE user_id = p_user_id
      AND (
        operation_id = v_operation_id
        OR COALESCE(metadata->>'reason', '') = 'welcome_bonus'
      )
  ) THEN
    SELECT balance_rub INTO v_balance FROM user_balances WHERE user_id = p_user_id;
    RETURN jsonb_build_object(
      'ok', true,
      'already', true,
      'granted', false,
      'lot_id', v_lot_id,
      'amount', 50,
      'new_balance', v_balance,
      'classified', v_lot_id IS NOT NULL
    );
  END IF;

  SELECT u.created_at, c.created_at, p.user_id
  INTO v_user_created, v_click_created, v_partner_user
  FROM referral_attributions ra
  JOIN auth.users u ON u.id = ra.user_id
  JOIN referral_clicks c ON c.id = ra.referral_click_id
  JOIN partners p ON p.id = ra.partner_id
  WHERE ra.user_id = p_user_id;

  IF NOT FOUND OR v_partner_user = p_user_id THEN
    v_reason := 'not_referred';
  ELSIF v_user_created IS NULL OR v_click_created IS NULL OR v_user_created < v_click_created THEN
    v_reason := 'registered_before_click';
  END IF;

  IF v_reason IS NOT NULL THEN
    SELECT balance_rub INTO v_balance FROM user_balances WHERE user_id = p_user_id;
    RETURN jsonb_build_object(
      'ok', true,
      'already', false,
      'granted', false,
      'reason', v_reason,
      'amount', 0,
      'new_balance', v_balance
    );
  END IF;

  BEGIN
    INSERT INTO user_balances (user_id, balance_rub, updated_at)
    VALUES (p_user_id, 0, NOW())
    ON CONFLICT (user_id) DO NOTHING;

    SELECT balance_rub INTO v_balance
    FROM user_balances
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'balance_not_found');
    END IF;

    UPDATE user_balances
    SET balance_rub = balance_rub + 50,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING balance_rub INTO v_balance;

    INSERT INTO user_balance_lots (
      user_id, source_type, original_amount, remaining_amount, reference_type, reference_id
    )
    VALUES (p_user_id, 'bonus', 50, 50, 'welcome_bonus', v_operation_id)
    RETURNING id INTO v_lot_id;

    INSERT INTO balance_ledger (
      user_id, source_type, operation_type, amount, balance_lot_id, reference_type, reference_id, operation_id
    )
    VALUES (
      p_user_id, 'bonus', 'welcome_bonus', 50, v_lot_id, 'welcome_bonus', v_operation_id, v_operation_id
    );

    INSERT INTO balance_transactions (user_id, amount_rub, type, metadata, operation_id)
    VALUES (
      p_user_id,
      50,
      'welcome_bonus',
      jsonb_build_object('reason', 'welcome_bonus', 'marketing', true),
      v_operation_id
    );
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      -- Любое уникальное ограничение balance_transactions по операции тоже считается повтором:
      -- реальное имя в базе может отличаться от ожидаемого.
      IF v_constraint NOT IN (
        'user_balance_lots_one_welcome',
        'balance_transactions_user_operation_id_key',
        'balance_ledger_operation_lot_key'
      ) AND v_constraint NOT LIKE 'balance_transactions%' THEN
        RAISE;
      END IF;
      SELECT balance_rub INTO v_balance FROM user_balances WHERE user_id = p_user_id;
      SELECT id INTO v_lot_id
      FROM user_balance_lots
      WHERE user_id = p_user_id AND reference_type = 'welcome_bonus';
      RETURN jsonb_build_object(
        'ok', true,
        'already', true,
        'granted', false,
        'lot_id', v_lot_id,
        'amount', 50,
        'new_balance', v_balance,
        'classified', v_lot_id IS NOT NULL
      );
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'already', false,
    'granted', true,
    'lot_id', v_lot_id,
    'amount', 50,
    'new_balance', v_balance,
    'classified', true
  );
END;
$$;

COMMENT ON FUNCTION public.grant_welcome_bonus(UUID) IS
  '50 маркетинговых единиц один раз, только если аккаунт создан не раньше реферального перехода. Строка баланса выдаче не мешает. Старый welcome и повторный вызов баланс не увеличивают.';

-- Состав баланса для сверки. Оплаченным считается только сумма paid-партий.
CREATE OR REPLACE FUNCTION public.balance_composition(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_balance NUMERIC;
  v_bonus NUMERIC;
  v_paid NUMERIC;
  v_drift NUMERIC;
BEGIN
  PERFORM public.referral_require_service_role();
  SELECT balance_rub INTO v_balance FROM user_balances WHERE user_id = p_user_id;
  SELECT COALESCE(SUM(remaining_amount), 0) INTO v_bonus
  FROM user_balance_lots
  WHERE user_id = p_user_id AND source_type = 'bonus';
  SELECT COALESCE(SUM(remaining_amount), 0) INTO v_paid
  FROM user_balance_lots
  WHERE user_id = p_user_id AND source_type = 'paid';

  v_drift := COALESCE(v_balance, 0) - v_bonus - v_paid;

  RETURN jsonb_build_object(
    'balance_rub', COALESCE(v_balance, 0),
    'bonus_remaining', v_bonus,
    'paid_remaining', v_paid,
    'legacy_unclassified', GREATEST(COALESCE(v_balance, 0) - v_bonus - v_paid, 0),
    'drift', v_drift
  );
END;
$$;

COMMENT ON FUNCTION public.balance_composition(UUID) IS
  'legacy_unclassified — остаток user_balances, у которого нет партии. Он не входит в paid_remaining. drift < 0 значит партии больше общего баланса.';

-- План списания без изменения остатков. Порядок тот же, что у apply_balance_draw.
CREATE OR REPLACE FUNCTION public.plan_balance_draw(p_user_id UUID, p_amount NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_need NUMERIC;
  v_bonus NUMERIC := 0;
  v_paid NUMERIC := 0;
  v_lot user_balance_lots%ROWTYPE;
BEGIN
  PERFORM public.referral_require_service_role();

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  PERFORM 1 FROM user_balances WHERE user_id = p_user_id FOR UPDATE;
  v_need := round(p_amount, 2);

  FOR v_lot IN
    SELECT * FROM user_balance_lots
    WHERE user_id = p_user_id AND source_type = 'bonus' AND remaining_amount > 0
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_need <= 0;
    v_bonus := v_bonus + LEAST(v_lot.remaining_amount, v_need);
    v_need := v_need - LEAST(v_lot.remaining_amount, v_need);
  END LOOP;

  FOR v_lot IN
    SELECT * FROM user_balance_lots
    WHERE user_id = p_user_id AND source_type = 'paid' AND remaining_amount > 0
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_need <= 0;
    v_paid := v_paid + LEAST(v_lot.remaining_amount, v_need);
    v_need := v_need - LEAST(v_lot.remaining_amount, v_need);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'bonus', v_bonus,
    'paid', v_paid,
    'uncovered_legacy', v_need
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Финансовая запись по фактически списанным партиям.
-- Старая сигнатура с суммами источников удаляется, чтобы её нельзя было вызвать.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.record_usage_financials(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.record_usage_financials(
  p_user_id UUID,
  p_operation_id TEXT,
  p_service_type TEXT,
  p_model TEXT,
  p_provider TEXT,
  p_provider_cost_rub NUMERIC,
  p_cost_source TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_operation_id TEXT;
  v_line balance_ledger%ROWTYPE;
  v_count INT := 0;
  v_index INT;
  v_ids UUID[] := ARRAY[]::UUID[];
  v_lots UUID[] := ARRAY[]::UUID[];
  v_sources TEXT[] := ARRAY[]::TEXT[];
  v_amounts NUMERIC[] := ARRAY[]::NUMERIC[];
  v_floors BIGINT[] := ARRAY[]::BIGINT[];
  v_fracs NUMERIC[] := ARRAY[]::NUMERIC[];
  v_costs NUMERIC[] := ARRAY[]::NUMERIC[];
  v_total NUMERIC := 0;
  v_cost NUMERIC(12, 2);
  v_total_kop BIGINT := 0;
  v_assigned BIGINT := 0;
  v_remainder BIGINT := 0;
  v_pick INT;
  v_best NUMERIC;
  v_exact NUMERIC;
  v_partner_id UUID;
  v_rate NUMERIC(5, 4);
  v_paid NUMERIC := 0;
  v_paid_cost NUMERIC := 0;
  v_constraint TEXT;
BEGIN
  PERFORM public.referral_require_service_role();
  v_operation_id := NULLIF(btrim(COALESCE(p_operation_id, '')), '');

  IF p_user_id IS NULL OR v_operation_id IS NULL OR NULLIF(btrim(COALESCE(p_service_type, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  IF p_cost_source NOT IN ('provider_actual', 'tariff_estimate', 'unknown') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_cost_source');
  END IF;

  IF p_cost_source = 'unknown' AND p_provider_cost_rub IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_cost_must_be_null');
  END IF;

  IF p_cost_source <> 'unknown' AND (p_provider_cost_rub IS NULL OR p_provider_cost_rub < 0) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cost_required');
  END IF;

  IF EXISTS (
    SELECT 1 FROM usage_financial_journal
    WHERE user_id = p_user_id AND operation_id = v_operation_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  FOR v_line IN
    SELECT *
    FROM balance_ledger
    WHERE user_id = p_user_id
      AND operation_id = v_operation_id
      AND operation_type = 'usage'
    ORDER BY created_at, id
    FOR SHARE
  LOOP
    v_count := v_count + 1;
    v_ids[v_count] := v_line.id;
    v_lots[v_count] := v_line.balance_lot_id;
    v_sources[v_count] := v_line.source_type;
    v_amounts[v_count] := abs(v_line.amount);
    v_total := v_total + abs(v_line.amount);
    v_floors[v_count] := 0;
    v_fracs[v_count] := 0;
    v_costs[v_count] := NULL;
  END LOOP;

  IF v_count = 0 OR v_total <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'draw_not_found');
  END IF;

  IF p_provider_cost_rub IS NOT NULL THEN
    v_cost := round(p_provider_cost_rub, 2);
    v_total_kop := (v_cost * 100)::BIGINT;
    FOR v_index IN 1..v_count LOOP
      v_exact := (v_total_kop::NUMERIC * v_amounts[v_index]) / v_total;
      v_floors[v_index] := floor(v_exact)::BIGINT;
      v_fracs[v_index] := v_exact - v_floors[v_index];
      v_assigned := v_assigned + v_floors[v_index];
    END LOOP;

    v_remainder := v_total_kop - v_assigned;
    WHILE v_remainder > 0 LOOP
      v_pick := NULL;
      v_best := -1;
      FOR v_index IN 1..v_count LOOP
        IF v_amounts[v_index] > 0 AND v_fracs[v_index] > v_best THEN
          v_pick := v_index;
          v_best := v_fracs[v_index];
        END IF;
      END LOOP;
      IF v_pick IS NULL THEN
        RAISE EXCEPTION 'cost split failed';
      END IF;
      v_floors[v_pick] := v_floors[v_pick] + 1;
      v_fracs[v_pick] := -1;
      v_remainder := v_remainder - 1;
    END LOOP;

    FOR v_index IN 1..v_count LOOP
      v_costs[v_index] := v_floors[v_index]::NUMERIC / 100;
    END LOOP;

    IF (SELECT COALESCE(SUM(value), 0) FROM unnest(v_costs) AS value) <> v_cost THEN
      RAISE EXCEPTION 'cost split mismatch';
    END IF;
  END IF;

  SELECT partner_id INTO v_partner_id
  FROM referral_attributions
  WHERE user_id = p_user_id;

  IF v_partner_id IS NOT NULL THEN
    SELECT commission_rate INTO v_rate FROM partners WHERE id = v_partner_id;
  END IF;

  IF v_partner_id IS NOT NULL AND v_rate IS NULL THEN
    FOR v_index IN 1..v_count LOOP
      IF v_sources[v_index] = 'paid' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'commission_rate_missing');
      END IF;
    END LOOP;
  END IF;

  BEGIN
    FOR v_index IN 1..v_count LOOP
      INSERT INTO usage_financial_journal (
        user_id, partner_id, operation_id, balance_ledger_id, balance_lot_id,
        service_type, source_type, consumed_amount, provider_cost_rub, provider, model, cost_source
      )
      VALUES (
        p_user_id,
        v_partner_id,
        v_operation_id,
        v_ids[v_index],
        v_lots[v_index],
        btrim(p_service_type),
        v_sources[v_index],
        v_amounts[v_index],
        v_costs[v_index],
        NULLIF(btrim(COALESCE(p_provider, '')), ''),
        NULLIF(btrim(COALESCE(p_model, '')), ''),
        p_cost_source
      );

      IF v_sources[v_index] = 'paid' THEN
        v_paid := v_paid + v_amounts[v_index];
        IF p_cost_source = 'provider_actual' THEN
          v_paid_cost := v_paid_cost + COALESCE(v_costs[v_index], 0);
        END IF;
      END IF;
    END LOOP;

    -- Бонус и legacy не получают строку комиссии. Их расход остаётся в usage_financial_journal.
    IF v_paid > 0 AND v_partner_id IS NOT NULL THEN
      INSERT INTO partner_financial_ledger (
        partner_id, user_id, operation_id, source_type,
        eligible_revenue_rub, allocated_provider_cost_rub,
        tax_amount_rub, eligible_profit_rub, commission_rate, commission_amount_rub, status
      )
      VALUES (
        v_partner_id, p_user_id, v_operation_id, 'paid',
        v_paid,
        CASE WHEN p_cost_source = 'provider_actual' THEN v_paid_cost ELSE NULL END,
        NULL, NULL, v_rate, NULL, 'not_calculated'
      );
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint NOT IN (
        'usage_financial_journal_ledger_key',
        'usage_financial_journal_operation_lot_key',
        'usage_financial_journal_operation_legacy_key',
        'partner_financial_ledger_one_open'
      ) THEN
        RAISE;
      END IF;
      RETURN jsonb_build_object('ok', true, 'already', true);
  END;

  RETURN jsonb_build_object('ok', true, 'already', false, 'paid_consumed', v_paid);
END;
$$;

COMMENT ON FUNCTION public.record_usage_financials(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT) IS
  'Берёт суммы из balance_ledger этой операции. Партнёрская строка только на paid. tariff_estimate и unknown прибыль не подтверждают. Повторный вызов той же операции ничего не меняет, в том числе стоимость.';

-- Подтверждение закрыто, пока нет согласованного налогового правила.
CREATE OR REPLACE FUNCTION public.confirm_partner_profit(
  p_operation_id TEXT,
  p_tax_amount_rub NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.referral_require_service_role();
  RETURN jsonb_build_object('ok', false, 'error', 'tax_rule_not_defined');
END;
$$;

COMMENT ON FUNCTION public.confirm_partner_profit(TEXT, NUMERIC) IS
  'Не подтверждает комиссию и не считает налог. Статус confirmed недоступен до отдельного налогового правила.';

CREATE OR REPLACE FUNCTION public.record_partner_payout(p_ledger_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.referral_require_service_role();
  RETURN jsonb_build_object('ok', false, 'error', 'payout_manual_outside_system');
END;
$$;

COMMENT ON FUNCTION public.record_partner_payout(UUID) IS
  'Выплату не создаёт. Реквизиты в базе нет, перевод делает администратор вне системы.';

-- Предварительный месяц. Ничего не записывает и не выплачивает.
-- Убыток этого месяца не читает прошлые и не оставляет долг на следующий.
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
    'blocked_reason', 'tax_rule_not_defined',
    'payable', false
  );
END;
$$;

COMMENT ON FUNCTION public.preview_partner_month(UUID, DATE) IS
  'Сводка paid-части за календарный месяц Москвы. Предварительная комиссия — доля (до 40%) квалифицируемой прибыли, не сумма пополнения. Налог не считается, выплата закрыта. Убыток не переносится.';

-- Не запускать. Исторический balance_rub не становится paid.
-- INSERT INTO user_balance_lots (...) SELECT ... FROM user_balances;  -- запрещено

-- ---------------------------------------------------------------------------
-- Те же функции списания и зачисления. Сумма, идемпотентность и ответ прежние.
-- Добавлено только движение партий в той же транзакции.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.deduct_balance(UUID, NUMERIC, TEXT, JSONB);

CREATE OR REPLACE FUNCTION deduct_balance(
  p_user_id UUID,
  p_amount_rub NUMERIC,
  p_service TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_operation_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_balance NUMERIC;
  v_new_balance NUMERIC;
  v_operation_id TEXT;
  v_draw JSONB;
BEGIN
  PERFORM public.referral_require_service_role();

  IF p_amount_rub IS NULL OR p_amount_rub <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  v_operation_id := NULLIF(btrim(COALESCE(p_operation_id, '')), '');
  IF v_operation_id IS NULL THEN
    v_operation_id := gen_random_uuid()::text;
  END IF;

  INSERT INTO user_balances (user_id, balance_rub, updated_at)
  VALUES (p_user_id, 0, NOW())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance_rub INTO v_balance
  FROM user_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'balance_not_found');
  END IF;

  IF EXISTS (
    SELECT 1 FROM balance_transactions
    WHERE user_id = p_user_id AND operation_id = v_operation_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'new_balance', v_balance);
  END IF;

  IF v_balance < p_amount_rub THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'current_balance', v_balance);
  END IF;

  UPDATE user_balances
  SET balance_rub = balance_rub - p_amount_rub,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance_rub INTO v_new_balance;

  INSERT INTO balance_transactions (user_id, amount_rub, type, service, metadata, operation_id)
  VALUES (
    p_user_id,
    -p_amount_rub,
    'usage',
    p_service,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('operation_id', v_operation_id),
    v_operation_id
  );

  v_draw := public.apply_balance_draw(p_user_id, v_operation_id, p_amount_rub);
  IF COALESCE((v_draw ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'balance draw failed: %', COALESCE(v_draw ->> 'error', 'unknown');
  END IF;

  RETURN jsonb_build_object('ok', true, 'already', false, 'new_balance', v_new_balance);
END;
$$;

CREATE OR REPLACE FUNCTION settle_operation(
  p_user_id UUID,
  p_operation_id TEXT,
  p_charge_rub NUMERIC,
  p_provider_cost_rub NUMERIC DEFAULT NULL,
  p_result JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_op balance_operations%ROWTYPE;
  v_charge NUMERIC;
  v_balance NUMERIC;
  v_taken NUMERIC;
  v_draw JSONB;
BEGIN
  PERFORM public.referral_require_service_role();

  SELECT * INTO v_op
  FROM balance_operations
  WHERE user_id = p_user_id AND operation_id = btrim(p_operation_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_op.status = 'settled' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'settled',
      'already', true,
      'final_charge_rub', v_op.final_charge_rub,
      'result', v_op.result_json
    );
  END IF;

  IF v_op.status <> 'started' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_state', 'status', v_op.status);
  END IF;

  v_charge := LEAST(v_op.amount_rub, GREATEST(COALESCE(p_charge_rub, 0), 0));

  SELECT balance_rub INTO v_balance
  FROM user_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_taken := LEAST(COALESCE(v_balance, 0), v_charge);

  IF v_taken > 0 THEN
    UPDATE user_balances
    SET balance_rub = balance_rub - v_taken,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    INSERT INTO balance_transactions (user_id, amount_rub, type, service, metadata, operation_id)
    VALUES (
      p_user_id,
      -v_taken,
      'usage',
      v_op.service,
      COALESCE(v_op.metadata, '{}'::jsonb) || jsonb_build_object(
        'operation_id', v_op.operation_id,
        'reserved_rub', v_op.amount_rub,
        'provider_cost_rub', p_provider_cost_rub
      ),
      v_op.operation_id
    );

    v_draw := public.apply_balance_draw(p_user_id, v_op.operation_id, v_taken);
    IF COALESCE((v_draw ->> 'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'balance draw failed: %', COALESCE(v_draw ->> 'error', 'unknown');
    END IF;
  END IF;

  UPDATE balance_operations
  SET status = 'settled',
      final_charge_rub = v_taken,
      provider_cost_rub = p_provider_cost_rub,
      result_json = p_result,
      settled_at = NOW()
  WHERE id = v_op.id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'settled',
    'already', false,
    'final_charge_rub', v_taken,
    'unused_rub', v_op.amount_rub - v_taken
  );
END;
$$;

CREATE OR REPLACE FUNCTION abandon_operation(
  p_user_id UUID,
  p_operation_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_op balance_operations%ROWTYPE;
  v_balance NUMERIC;
  v_taken NUMERIC;
  v_draw JSONB;
BEGIN
  PERFORM public.referral_require_service_role();

  SELECT * INTO v_op
  FROM balance_operations
  WHERE user_id = p_user_id AND operation_id = btrim(p_operation_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_op.status IN ('abandoned', 'settled') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', v_op.status,
      'already', true,
      'final_charge_rub', v_op.final_charge_rub,
      'result', v_op.result_json
    );
  END IF;

  IF v_op.status <> 'started' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_state', 'status', v_op.status);
  END IF;

  SELECT balance_rub INTO v_balance
  FROM user_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_taken := LEAST(COALESCE(v_balance, 0), v_op.amount_rub);

  IF v_taken > 0 THEN
    UPDATE user_balances
    SET balance_rub = balance_rub - v_taken,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    INSERT INTO balance_transactions (user_id, amount_rub, type, service, metadata, operation_id)
    VALUES (
      p_user_id,
      -v_taken,
      'usage',
      v_op.service,
      COALESCE(v_op.metadata, '{}'::jsonb) || jsonb_build_object('abandoned', true, 'operation_id', v_op.operation_id),
      v_op.operation_id
    );

    v_draw := public.apply_balance_draw(p_user_id, v_op.operation_id, v_taken);
    IF COALESCE((v_draw ->> 'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'balance draw failed: %', COALESCE(v_draw ->> 'error', 'unknown');
    END IF;
  END IF;

  UPDATE balance_operations
  SET status = 'abandoned',
      final_charge_rub = v_taken,
      settled_at = NOW()
  WHERE id = v_op.id;

  RETURN jsonb_build_object('ok', true, 'status', 'abandoned', 'already', false, 'final_charge_rub', v_taken);
END;
$$;

CREATE OR REPLACE FUNCTION abandon_stale_operations(
  p_user_id UUID,
  p_reserved_after INTERVAL DEFAULT INTERVAL '2 minutes',
  p_started_after INTERVAL DEFAULT INTERVAL '15 minutes'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_op balance_operations%ROWTYPE;
  v_balance NUMERIC;
  v_taken NUMERIC;
  v_draw JSONB;
BEGIN
  PERFORM public.referral_require_service_role();

  FOR v_op IN
    SELECT * FROM balance_operations
    WHERE user_id = p_user_id
      AND status = 'reserved'
      AND created_at <= NOW() - p_reserved_after
    FOR UPDATE
  LOOP
    UPDATE balance_operations
    SET status = 'failed',
        final_charge_rub = 0,
        settled_at = NOW()
    WHERE id = v_op.id;
  END LOOP;

  FOR v_op IN
    SELECT * FROM balance_operations
    WHERE user_id = p_user_id
      AND status = 'started'
      AND started_at IS NOT NULL
      AND started_at <= NOW() - p_started_after
    FOR UPDATE
  LOOP
    SELECT balance_rub INTO v_balance
    FROM user_balances
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_balance IS NULL THEN
      v_balance := 0;
    END IF;

    v_taken := LEAST(v_balance, v_op.amount_rub);

    IF v_taken > 0 THEN
      UPDATE user_balances
      SET balance_rub = balance_rub - v_taken,
          updated_at = NOW()
      WHERE user_id = p_user_id;

      INSERT INTO balance_transactions (user_id, amount_rub, type, service, metadata, operation_id)
      VALUES (
        p_user_id,
        -v_taken,
        'usage',
        v_op.service,
        COALESCE(v_op.metadata, '{}'::jsonb) || jsonb_build_object('abandoned', true, 'operation_id', v_op.operation_id),
        v_op.operation_id
      );

      v_draw := public.apply_balance_draw(p_user_id, v_op.operation_id, v_taken);
      IF COALESCE((v_draw ->> 'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'balance draw failed: %', COALESCE(v_draw ->> 'error', 'unknown');
      END IF;
    END IF;

    UPDATE balance_operations
    SET status = 'abandoned',
        final_charge_rub = v_taken,
        settled_at = NOW()
    WHERE id = v_op.id;
  END LOOP;
END;
$$;

-- Зачисление ЮKassa. credit_rub, не charge_rub. Повторный вызов не создаёт вторую партию.
-- Заказы в явно неоплаченных статусах не зачисляются: прежняя версия смотрела только на credited_at.
CREATE OR REPLACE FUNCTION credit_gateway_payment(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_order payment_orders%ROWTYPE;
  v_new_balance NUMERIC;
  v_lot_id UUID;
  v_operation_id TEXT;
BEGIN
  PERFORM public.referral_require_service_role();

  SELECT * INTO v_order
  FROM payment_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_order.credited_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  IF lower(COALESCE(v_order.status::text, '')) IN (
    'failed', 'canceled', 'cancelled', 'refunded', 'expired'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_payable', 'status', v_order.status::text);
  END IF;

  INSERT INTO user_balances (user_id, balance_rub, updated_at)
  VALUES (v_order.user_id, v_order.credit_rub, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    balance_rub = user_balances.balance_rub + v_order.credit_rub,
    updated_at = NOW()
  RETURNING balance_rub INTO v_new_balance;

  INSERT INTO balance_transactions (user_id, amount_rub, type, metadata)
  VALUES (
    v_order.user_id,
    v_order.credit_rub,
    'topup_gateway',
    jsonb_build_object(
      'provider', COALESCE(v_order.provider, 'yookassa'),
      'payment_id', COALESCE(v_order.provider_payment_id, v_order.itpay_payment_id),
      'client_payment_id', v_order.client_payment_id,
      'charge_rub', v_order.charge_rub,
      'payment_method', v_order.payment_method
    )
  );

  v_operation_id := 'gateway-topup:' || p_order_id::text;

  INSERT INTO user_balance_lots (
    user_id, source_type, original_amount, remaining_amount, reference_type, reference_id
  )
  VALUES (
    v_order.user_id, 'paid', v_order.credit_rub, v_order.credit_rub, 'payment_order', p_order_id::text
  )
  RETURNING id INTO v_lot_id;

  INSERT INTO balance_ledger (
    user_id, source_type, operation_type, amount, balance_lot_id, reference_type, reference_id, operation_id
  )
  VALUES (
    v_order.user_id, 'paid', 'topup_paid', v_order.credit_rub, v_lot_id,
    'payment_order', p_order_id::text, v_operation_id
  );

  UPDATE payment_orders
  SET status = 'paid',
      credited_at = NOW(),
      updated_at = NOW()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'already', false, 'new_balance', v_new_balance);
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS. Клиент не пишет журналы и не читает чужие деньги.
-- ---------------------------------------------------------------------------

ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_balance_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_financial_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_financial_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_commission_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Partners can view own row" ON partners;
CREATE POLICY "Partners can view own row"
  ON partners FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own attribution" ON referral_attributions;
CREATE POLICY "Users can view own attribution"
  ON referral_attributions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own balance lots" ON user_balance_lots;
CREATE POLICY "Users can view own balance lots"
  ON user_balance_lots FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own balance ledger" ON balance_ledger;
CREATE POLICY "Users can view own balance ledger"
  ON balance_ledger FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- referral_clicks, usage_financial_journal, partner_financial_ledger и выплаты
-- без политик: authenticated и anon не видят строки.

REVOKE ALL ON TABLE partners FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE referral_clicks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE referral_attributions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE user_balance_lots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE balance_ledger FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE usage_financial_journal FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE partner_financial_ledger FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE partner_commission_payouts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE partner_financial_entries FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE partners TO authenticated;
GRANT SELECT ON TABLE referral_attributions TO authenticated;
GRANT SELECT ON TABLE user_balance_lots TO authenticated;
GRANT SELECT ON TABLE balance_ledger TO authenticated;

GRANT ALL ON TABLE partners TO service_role;
GRANT SELECT ON TABLE referral_clicks TO service_role;
GRANT SELECT ON TABLE referral_attributions TO service_role;
GRANT SELECT ON TABLE user_balance_lots TO service_role;
GRANT SELECT ON TABLE balance_ledger TO service_role;
GRANT SELECT ON TABLE usage_financial_journal TO service_role;
GRANT SELECT ON TABLE partner_financial_ledger TO service_role;
GRANT SELECT ON TABLE partner_commission_payouts TO service_role;
GRANT SELECT ON TABLE partner_financial_entries TO service_role;

REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;

-- ВНИМАНИЕ: после этого service_role не пишет в user_balances и balance_transactions напрямую.
-- Перед применением найдите в Node-коде все прямые insert/update/delete по этим таблицам.
REVOKE INSERT, UPDATE, DELETE ON TABLE user_balances FROM service_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE balance_transactions FROM service_role;
GRANT SELECT ON TABLE user_balances TO service_role, authenticated;
GRANT SELECT ON TABLE balance_transactions TO service_role, authenticated;

-- Функции, которые пишут в эти таблицы, обязаны выполняться от владельца.
ALTER FUNCTION public.topup_balance(UUID, NUMERIC, public.balance_transaction_type, JSONB)
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.fail_operation(UUID, TEXT)
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.reserve_operation(UUID, TEXT, NUMERIC, TEXT, JSONB)
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.mark_operation_started(UUID, TEXT)
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.guard_paid_balance_lot() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_ledger_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_referral_attribution() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_referral_click() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partners_touch_updated_at() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.referral_require_service_role() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_balance_draw(UUID, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_referral_click(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attribute_referral(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_welcome_bonus(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.balance_composition(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plan_balance_draw(UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_usage_financials(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_partner_profit(TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_partner_payout(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_partner_month(UUID, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deduct_balance(UUID, NUMERIC, TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_operation(UUID, TEXT, NUMERIC, NUMERIC, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.abandon_operation(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.abandon_stale_operations(UUID, INTERVAL, INTERVAL) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_gateway_payment(UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_referral_click(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.attribute_referral(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_welcome_bonus(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.balance_composition(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.plan_balance_draw(UUID, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_usage_financials(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_partner_profit(TEXT, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_partner_payout(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.preview_partner_month(UUID, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_balance(UUID, NUMERIC, TEXT, JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_operation(UUID, TEXT, NUMERIC, NUMERIC, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.abandon_operation(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.abandon_stale_operations(UUID, INTERVAL, INTERVAL) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_gateway_payment(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.topup_balance(UUID, NUMERIC, public.balance_transaction_type, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.topup_balance(UUID, NUMERIC, public.balance_transaction_type, JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.fail_operation(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_operation(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_operation_started(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_operation(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_operation(UUID, TEXT, NUMERIC, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_operation_started(UUID, TEXT) TO service_role;

-- Внутренние функции вызывает владелец SECURITY DEFINER, не клиент и не service_role напрямую.
DO $$
BEGIN
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.referral_require_service_role() TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.apply_balance_draw(UUID, TEXT, NUMERIC) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.abandon_stale_operations(UUID, INTERVAL, INTERVAL) TO %I', current_user);
END $$;
