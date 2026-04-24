-- Migration 08: Update auth_login RPC
--
-- Preserves backwards compatibility: existing columns
--   (user_id, user_email, user_role, user_permissions jsonb, user_timezone)
-- retain their shape and meaning. Production frontend continues to work
-- because `user_permissions` is still the legacy jsonb from
-- dashboard_users.permissions.
--
-- Adds new columns for the upgraded frontend (Task 12+):
--   user_ref_code, user_first_name, user_last_name, user_alias,
--   user_permission_names (text[] from user_permissions table),
--   user_attributes (jsonb from user_attributes table),
--   user_is_active.
--
-- Password check preserves existing crypt(p_password, password_hash) pattern
-- (pgcrypto-based). Active-user filter is preserved.
--
-- DROP + CREATE is required because RETURNS TABLE shape changes, and Postgres
-- does not allow CREATE OR REPLACE to alter a function's return signature.
-- The whole operation is inside a single transaction, so clients never see
-- a missing function.

BEGIN;

DROP FUNCTION IF EXISTS auth_login(text, text);

CREATE FUNCTION auth_login(
  p_email text, p_password text
) RETURNS TABLE (
  -- Existing (legacy) columns — preserve shape and column names:
  user_id           integer,
  user_email        text,
  user_role         text,
  user_permissions  jsonb,
  user_timezone     text,
  -- New columns for the upgraded frontend:
  user_ref_code         text,
  user_first_name       text,
  user_last_name        text,
  user_alias            text,
  user_permission_names text[],
  user_attributes       jsonb,
  user_is_active        boolean
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id integer;
BEGIN
  SELECT u.id INTO v_user_id
  FROM dashboard_users u
  WHERE u.email = p_email
    AND u.password_hash = crypt(p_password, u.password_hash)
    AND u.is_active = true;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.role,
    u.permissions,
    COALESCE(u.timezone, 'Europe/Kiev'),
    u.ref_code,
    u.first_name,
    u.last_name,
    u.alias,
    get_user_permissions(u.id),
    get_user_attributes(u.id),
    u.is_active
  FROM dashboard_users u
  WHERE u.id = v_user_id
    AND u.is_active = true;
END $$;

GRANT EXECUTE ON FUNCTION auth_login(text, text) TO anon, authenticated;

COMMIT;

-- VERIFY (replace <email>/<password> with real credentials):
--   SELECT * FROM auth_login('<email>', '<password>');
--   -- Expected: single row with 12 columns, including:
--   --   user_permissions as jsonb (legacy shape, e.g. {"can_view_revenue": true, ...})
--   --   user_permission_names as text[] (e.g. {create_tasks, manage_roles, ...})
--   --   user_ref_code, user_first_name, etc. populated
--
-- ROLLBACK: restore original function
--   DROP FUNCTION auth_login(text, text);
--   CREATE OR REPLACE FUNCTION auth_login(p_email text, p_password text)
--   RETURNS TABLE (user_id integer, user_email text, user_role text,
--                  user_permissions jsonb, user_timezone text)
--   LANGUAGE plpgsql SECURITY DEFINER
--   SET search_path = public, extensions
--   AS $$
--   BEGIN
--     RETURN QUERY
--     SELECT id, email, role, permissions,
--            COALESCE(timezone, 'Europe/Kiev')
--     FROM dashboard_users
--     WHERE email = p_email
--       AND password_hash = crypt(p_password, password_hash)
--       AND is_active = true;
--   END $$;
--   GRANT EXECUTE ON FUNCTION auth_login(text, text) TO anon, authenticated;
