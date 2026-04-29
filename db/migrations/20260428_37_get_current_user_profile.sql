-- 37: Hydration RPC. Replaces the user-profile half of legacy auth_login.
-- Returns the current user row + permissions array + attributes; called by
-- useAuth after every onAuthStateChange.

CREATE OR REPLACE FUNCTION public.get_current_user_profile()
RETURNS TABLE (
  id integer,
  email text,
  first_name text,
  last_name text,
  role text,
  is_active boolean,
  permissions text[],
  attributes jsonb,
  timezone text,
  ref_code text,
  alias text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    u.role,
    u.is_active,
    COALESCE(
      (SELECT array_agg(p.permission ORDER BY p.permission)
       FROM public.user_permissions p
       WHERE p.user_id = u.id),
      ARRAY[]::text[]
    ),
    COALESCE(
      (SELECT jsonb_object_agg(a.key, a.value)
       FROM public.user_attributes a
       WHERE a.user_id = u.id),
      '{}'::jsonb
    ),
    COALESCE(u.timezone, 'Europe/Kiev'),
    u.ref_code,
    u.alias
  FROM public.dashboard_users u
  WHERE u.id = v_caller_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_current_user_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_profile() TO authenticated;

COMMENT ON FUNCTION public.get_current_user_profile() IS
  'Hydrates the current user profile (id, email, names, role, is_active, permissions array, attributes jsonb, timezone, ref_code, alias). Called by useAuth after every onAuthStateChange. Replaces the user-profile half of legacy auth_login.';
