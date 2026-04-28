-- Migration 38: Stage 5 — Migrate permissions/attributes bucket to current_dashboard_user_id()
--
-- Mutating RPCs (4): drop p_caller_id from signature, derive via current_dashboard_user_id()
--   grant_permission, revoke_permission, set_user_attribute, delete_user_attribute
--
-- Read-only RPCs (3): signature unchanged; revoke anon EXECUTE, grant to authenticated only
--   get_user_permissions, get_user_attributes, get_user_team_membership

BEGIN;

-- ============================================================
-- 1. grant_permission
--    Original signature: (p_caller_id integer, p_target_user integer, p_permission text)
--    New signature:      (p_target_user integer, p_permission text)
-- ============================================================

DROP FUNCTION IF EXISTS public.grant_permission(integer, integer, text);

CREATE OR REPLACE FUNCTION public.grant_permission(
  p_target_user integer,
  p_permission  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF NOT has_permission(v_caller_id, 'manage_roles') THEN
    RAISE EXCEPTION 'caller % lacks manage_roles', v_caller_id;
  END IF;
  INSERT INTO user_permissions (user_id, permission, granted_by, granted_at)
    VALUES (p_target_user, p_permission, v_caller_id, now())
  ON CONFLICT (user_id, permission) DO UPDATE
    SET granted_by = EXCLUDED.granted_by,
        granted_at = EXCLUDED.granted_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_permission(integer, text) TO authenticated;

-- ============================================================
-- 2. revoke_permission
--    Original signature: (p_caller_id integer, p_target_user integer, p_permission text)
--    New signature:      (p_target_user integer, p_permission text)
-- ============================================================

DROP FUNCTION IF EXISTS public.revoke_permission(integer, integer, text);

CREATE OR REPLACE FUNCTION public.revoke_permission(
  p_target_user integer,
  p_permission  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF NOT has_permission(v_caller_id, 'manage_roles') THEN
    RAISE EXCEPTION 'caller % lacks manage_roles', v_caller_id;
  END IF;
  DELETE FROM user_permissions
    WHERE user_id = p_target_user AND permission = p_permission;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_permission(integer, text) TO authenticated;

-- ============================================================
-- 3. set_user_attribute
--    Original signature: (p_caller_id integer, p_user_id integer, p_key text, p_value text)
--    New signature:      (p_user_id integer, p_key text, p_value text)
-- ============================================================

DROP FUNCTION IF EXISTS public.set_user_attribute(integer, integer, text, text);

CREATE OR REPLACE FUNCTION public.set_user_attribute(
  p_user_id integer,
  p_key     text,
  p_value   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF NOT (
    has_permission(v_caller_id, 'create_users')
    OR v_caller_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'caller % cannot set attributes on user %', v_caller_id, p_user_id;
  END IF;
  INSERT INTO user_attributes (user_id, key, value)
    VALUES (p_user_id, p_key, p_value)
  ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_attribute(integer, text, text) TO authenticated;

-- ============================================================
-- 4. delete_user_attribute
--    Original signature: (p_caller_id integer, p_user_id integer, p_key text)
--    New signature:      (p_user_id integer, p_key text)
-- ============================================================

DROP FUNCTION IF EXISTS public.delete_user_attribute(integer, integer, text);

CREATE OR REPLACE FUNCTION public.delete_user_attribute(
  p_user_id integer,
  p_key     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF NOT has_permission(v_caller_id, 'create_users') THEN
    RAISE EXCEPTION 'caller % lacks create_users', v_caller_id;
  END IF;
  DELETE FROM user_attributes WHERE user_id = p_user_id AND key = p_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_attribute(integer, text) TO authenticated;

-- ============================================================
-- 5. get_user_permissions  (read-only — signature unchanged)
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.get_user_permissions(integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_user_permissions(integer) TO authenticated;

-- ============================================================
-- 6. get_user_attributes  (read-only — signature unchanged)
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.get_user_attributes(integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_user_attributes(integer) TO authenticated;

-- ============================================================
-- 7. get_user_team_membership  (read-only — signature unchanged)
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.get_user_team_membership(integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_user_team_membership(integer) TO authenticated;

COMMIT;

-- ROLLBACK:
--   -- Restore mutating RPCs to their pre-migration 3-param signatures (see migrations 06, 07).
--   -- Restore GRANT EXECUTE TO anon on get_user_permissions, get_user_attributes,
--   --   get_user_team_membership (see migrations 06, 07, 26).
