-- Допуск в /admin. Это не роль Supabase Auth и не user_metadata.
-- Обычный аккаунт остаётся в auth.users. Администратором его делает только строка здесь.
-- Партнёр по-прежнему отделён таблицей partners, не этой.

CREATE TABLE IF NOT EXISTS public.app_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.app_admins IS
  'Серверный допуск в /admin. Клиент список не читает и не редактирует.';

INSERT INTO public.app_admins (user_id)
SELECT id
FROM auth.users
WHERE email = 'ivankapusta23@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.app_admins FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.app_admins TO service_role;
