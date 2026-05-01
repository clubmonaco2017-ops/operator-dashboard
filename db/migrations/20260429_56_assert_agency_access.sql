-- Migration 56: assert_agency_access(user_id, agency_id) helper
--
-- Bouncer для всех scoped RPC. RAISE 42501 если пользователь не имеет доступа к
-- указанному агентству. superadmin видит всё; admin — через admin_agencies;
-- operator/moderator/teamlead — через dashboard_users.agency_id.

CREATE OR REPLACE FUNCTION public.assert_agency_access(
  p_user_id   integer,
  p_agency_id uuid
) RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_role text;
BEGIN
  IF p_agency_id IS NULL THEN
    RAISE EXCEPTION 'assert_agency_access: agency_id required';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT role INTO v_role FROM public.dashboard_users WHERE id = p_user_id AND is_active = true;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  -- superadmin sees everything
  IF v_role = 'superadmin' THEN
    RETURN;
  END IF;

  -- admin: check admin_agencies junction
  IF v_role = 'admin' THEN
    IF EXISTS (
      SELECT 1 FROM public.admin_agencies
      WHERE admin_id = p_user_id AND agency_id = p_agency_id
    ) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'admin % has no access to agency %', p_user_id, p_agency_id
      USING errcode = '42501';
  END IF;

  -- operator/moderator/teamlead: check dashboard_users.agency_id
  IF EXISTS (
    SELECT 1 FROM public.dashboard_users
    WHERE id = p_user_id AND agency_id = p_agency_id
  ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'user % has no access to agency %', p_user_id, p_agency_id
    USING errcode = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.assert_agency_access(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_agency_access(integer, uuid) TO authenticated;

COMMENT ON FUNCTION public.assert_agency_access(integer, uuid) IS
  'Bouncer for scoped RPCs. Raises 42501 if user has no access to agency. superadmin: all; admin: admin_agencies; non-admin: dashboard_users.agency_id.';
