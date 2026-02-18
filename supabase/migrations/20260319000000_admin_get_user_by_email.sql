-- Helper for admin balance topup: resolve user_id by email (auth.users).
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id FROM auth.users WHERE email = trim(p_email) LIMIT 1;
$$;
