-- 36: Helper function for resolving auth.uid() to dashboard_users.id.
-- Returns NULL when caller is anonymous, has no link, or is deactivated.
-- Every migrated RPC begins with `v_caller_id := current_dashboard_user_id();`
-- and raises 'unauthorized' on NULL.

CREATE OR REPLACE FUNCTION public.current_dashboard_user_id()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT id FROM public.dashboard_users
  WHERE auth_user_id = auth.uid()
    AND is_active = true
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.current_dashboard_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_dashboard_user_id() TO authenticated;

COMMENT ON FUNCTION public.current_dashboard_user_id() IS
  'Single source of truth for caller identity. Returns dashboard_users.id for the JWT-authenticated active user, or NULL for anon / unlinked / deactivated.';
