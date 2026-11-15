# Реферальная программа Speakeasy. План реализации

Статус: этап 1, аудит и проектирование. Код и база не менялись.

Источник правды по серверу — `backend/src`. Каталог `frontend/server` собирается копией через `frontend/scripts/copy-backend.js` перед `next build`. Новые серверные модули пишутся только в `backend/src`.

## Что уже есть

Пользователь входит через Supabase (`frontend/app/auth/register/page.tsx`, `frontend/app/auth/login/page.tsx`) или Яндекс (`backend/src/yandex-auth.js`, `supabase.auth.admin.createUser`). Дальше клиент меняет Supabase-токен на backend JWT в `POST /api/auth/exchange-supabase-token` (`backend/src/index.js`, `signBackendJwt` / `resolveUserId`).

Баланс один на пользователя, без деления на бонус и оплаченные рубли:

- `user_balances` и `balance_transactions` — `supabase/migrations/20260318000000_create_user_balances.sql`
- идемпотентность списания по `(user_id, operation_id)` — `supabase/migrations/20261002120000_balance_operation_id.sql`
- резерв и расчёт — `balance_operations`, функции `reserve_operation`, `mark_operation_started`, `settle_operation`, `fail_operation`, `abandon_operation` — `supabase/migrations/20261002140000_balance_reservations.sql`
- вызовы из Node — `backend/src/balance.js`, сценарий резерва — `backend/src/paid-call.js`

Пополнение:

- пакеты 300, 500 и 1 000 ₽, ЮKassa — `backend/src/yookassa.js`, `POST /api/balance/topup`, `POST /api/balance/topup/confirm`, `POST /api/payments/yookassa/webhook`
- заказы — `payment_orders`, зачисление — `credit_gateway_payment` в `supabase/migrations/20260927000000_create_payment_orders.sql` и `supabase/migrations/20260928000000_yookassa_payment_provider.sql`
- ручное зачисление — `POST /api/admin/balance/topup`, секрет `ADMIN_BALANCE_SECRET`, минимум 300 ₽. Отдельной роли администратора и админ-интерфейса нет. `get_user_id_by_email` в `supabase/migrations/20260319000000_admin_get_user_by_email.sql` только ищет пользователя.

Приветственные 50 ₽ уже выдаются всем. В `POST /api/auth/exchange-supabase-token`, если строки `user_balances` ещё нет, вызывается `topupBalance(..., 'topup_manual', { reason: 'welcome_bonus' })`. Это не реферальный бонус: его получают и пользователи без партнёра. Защита от повтора — наличие строки баланса, без уникального ключа операции. Два параллельных обмена могут начислить 50 ₽ дважды, потому что `topup_balance` не проверяет `operation_id`.

Профиля партнёра нет. `user_profiles` хранит только язык обучения. Маршрутов `/partner` и админки нет. Регистрация не принимает реферальный код: `supabase.auth.signUp` уходит сразу в Supabase.

Интерфейс кабинета ученика: `frontend/app/dashboard/page.tsx`, вкладки в `frontend/components/tabs/`, оболочка `frontend/components/sidebar/Sidebar.tsx`. Выход уже есть в `frontend/components/tabs/AccountTab.tsx`. Токены внешнего вида — `frontend/app/globals.css` (`--bg`, `--card`, `--accent`, `--text-primary`). Шрифт Onest подключён в `frontend/app/layout.tsx`. Библиотеки графиков в `frontend/package.json` нет.

## Что переиспользовать

- Вход Supabase и backend JWT. Партнёр и администратор — те же `auth.users`, отдельные кабинеты проверяют связь на сервере.
- `runReserved` / `settle_operation` как единственное место, где списывается голос, текст и озвучка через резерв.
- `deduct_balance` для словарных списаний, которые идут мимо резерва.
- Уникальный `operation_id` как образец идемпотентности.
- `credit_gateway_payment`: повторный webhook не зачисляет второй раз. Пополнение не считать выручкой.
- `getCost`, `chargeWithMarkup`, `ttsChargeRub` в `backend/src/balance-rates.js` как запасные ставки, не как факт закупки.
- `cost-rub` у озвучки: `backend/src/tts.js` читает заголовок, `settle_operation` уже умеет писать `provider_cost_rub`.
- Тёмную палитру и карточки кабинета. Новый кабинет не заводит вторую палитру.
- Выход через `supabase.auth.signOut` и `clearBackendToken` из `frontend/lib/backend-jwt`.

## Что создать

База, подробно в `ARCHITECTURE.md`:

- партнёры и кампании
- переходы без персональных данных
- одна атрибуция на пользователя
- одно начисление приветственного бонуса
- партии бонусных рублей и остаток оплаченных рублей
- неизменяемый журнал экономики использования
- журнал партнёра: начисление, доступно, выплата, корректировка
- выплаты, которые фиксирует администратор, без автоматического перевода денег

Сервер, этап 3:

- переход по ссылке, запись кода в `localStorage` и в `user_metadata` при регистрации. Cookie не добавляем: сессия проекта уже живёт в `localStorage`
- привязка при первом обмене токена, если пользователь ещё не привязан
- одноразовый бонус вместо сегодняшней гонки в `exchange-supabase-token`
- запись факта `cost-rub` там, где AITunnel его отдаёт
- расчёт 40 / 60 по правилам из `FINANCIAL_MODEL.md` после подтверждения спорных пунктов
- проверка, что партнёр видит только свои агрегаты

Интерфейс, этапы 4 и 5:

- `frontend/app/partner/` — кабинет партнёра
- закрытый `frontend/app/admin/partners/` — только после серверной проверки администратора
- графики без новой библиотеки на первом экране: суммы и ряды по дням своими средствами. Зависимость для графиков отдельно обосновать, если своих средств не хватит

Тестов в стиле `backend/src/balance-rates.test.js` на этап 3: повтор бонуса, самореферал, повторная атрибуция, повторное начисление 40%, корректировка с автором.

## Безопасность

- Партнёр не получает `user_id`, email, переписки и учебные данные привлечённых. В ответах API только счётчики и деньги.
- Код в `localStorage` и в теле запроса не считается доказательством. Привязку пишет сервер по коду из `user_metadata`, после проверки кампании.
- Админские действия не открываются по одному факту входа. Сегодняшний образец — общий секрет `ADMIN_BALANCE_SECRET`. Для панели нужен явный список администраторов, а не публичная страница.
- RLS как у денег: клиент Supabase читает только свои безопасные строки, запись — `service_role` и функции `SECURITY DEFINER`.
- Корректировка без текста основания и `author_user_id` не принимается.
- Выключенный партнёр не получает новые регистрации. Старая атрибуция и уже начисленное не удаляются.

## Этапы после подтверждения

Этап 2, только схема и миграция в репозитории, без применения к боевой базе:

1. Таблицы и ограничения из `ARCHITECTURE.md`.
2. Уникальный грант приветственного бонуса на `user_id`.
3. Партии бонуса и поле оплаченного остатка, чтобы старые балансы можно было разметить отдельно.
4. Журнал `usage_economics` и `partner_ledger` без права `UPDATE` для обычных ролей.
5. RLS и отзыв `EXECUTE` у `anon` и `authenticated` по образцу `credit_gateway_payment`.
6. Миграция не меняет формулы `deduct_balance` и `settle_operation`, пока этап 3 не начнёт их вызывать по-новому.

Этап 3: ссылка, переход, атрибуция, бонус, запись `cost-rub`, начисление 40%, тесты гонок.

Этап 4: `/partner` на существующих токенах.

Этап 5: админ-панель.

Этап 6: сценарий от перехода до зафиксированной выплаты на тестовых данных, без выдуманных сумм в интерфейсе.

Этап 2 не начинается, пока не подтверждены решения из конца `FINANCIAL_MODEL.md` и `ARCHITECTURE.md`.
