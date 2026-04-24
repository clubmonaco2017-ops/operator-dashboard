-- Migration 06: RPC functions for user_permissions
-- has_permission, get_user_permissions, grant_permission, revoke_permission
-- All user_id parameters are integer (matches dashboard_users.id type).

BEGIN;

-- has_permission: true/false
CREATE OR REPLACE FUNCTION has_permission(
  p_user_id integer, p_permission text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = p_user_id AND permission = p_permission
  );
$$;

GRANT EXECUTE ON FUNCTION has_permission(integer, text) TO anon, authenticated;

-- get_user_permissions: array of permission strings
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id integer)
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(permission ORDER BY permission), ARRAY[]::text[])
  FROM user_permissions
  WHERE user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION get_user_permissions(integer) TO anon, authenticated;

-- grant_permission: caller must have manage_roles
CREATE OR REPLACE FUNCTION grant_permission(
  p_caller_id integer, p_target_user integer, p_permission text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_permission(p_caller_id, 'manage_roles') THEN
    RAISE EXCEPTION 'caller % lacks manage_roles', p_caller_id;
  END IF;
  INSERT INTO user_permissions (user_id, permission, granted_by, granted_at)
    VALUES (p_target_user, p_permission, p_caller_id, now())
  ON CONFLICT (user_id, permission) DO UPDATE
    SET granted_by = EXCLUDED.granted_by,
        granted_at = EXCLUDED.granted_at;
END $$;

GRANT EXECUTE ON FUNCTION grant_permission(integer, integer, text) TO anon, authenticated;

-- revoke_permission: caller must have manage_roles
CREATE OR REPLACE FUNCTION revoke_permission(
  p_caller_id integer, p_target_user integer, p_permission text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_permission(p_caller_id, 'manage_roles') THEN
    RAISE EXCEPTION 'caller % lacks manage_roles', p_caller_id;
  END IF;
  DELETE FROM user_permissions
    WHERE user_id = p_target_user AND permission = p_permission;
END $$;

GRANT EXECUTE ON FUNCTION revoke_permission(integer, integer, text) TO anon, authenticated;

COMMIT;

-- VERIFY (replace <sa_id> with integer id of superadmin):
--   SELECT id FROM dashboard_users WHERE role='superadmin' LIMIT 1;
--   SELECT has_permission(<sa_id>, 'create_users');    -- true
--   SELECT has_permission(<sa_id>, 'nonexistent');     -- false
--   SELECT get_user_permissions(<sa_id>);              -- text array
--
-- ROLLBACK:
--   DROP FUNCTION has_permission(integer, text);
--   DROP FUNCTION get_user_permissions(integer);
--   DROP FUNCTION grant_permission(integer, integer, text);
--   DROP FUNCTION revoke_permission(integer, integer, text);
