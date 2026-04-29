-- Migration 57: accessible_agencies(user_id) set-returning helper
--
-- Возвращает agency_id для всех агентств, доступных пользователю.
-- Используется в combined-view RPC (когда p_agency_id IS NULL):
--   SELECT * FROM clients WHERE agency_id IN (SELECT agency_id FROM accessible_agencies(v_caller_id));

CREATE OR REPLACE FUNCTION public.accessible_agencies(p_user_id integer)
RETURNS TABLE (agency_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.dashboard_users WHERE id = p_user_id AND is_active = true;
  IF v_role IS NULL THEN
    RETURN;
  END IF;

  IF v_role = 'superadmin' THEN
    RETURN QUERY SELECT a.id FROM public.agencies a;
    RETURN;
  END IF;

  IF v_role = 'admin' THEN
    RETURN QUERY
      SELECT aa.agency_id FROM public.admin_agencies aa WHERE aa.admin_id = p_user_id;
    RETURN;
  END IF;

  -- operator/moderator/teamlead
  RETURN QUERY
    SELECT u.agency_id
      FROM public.dashboard_users u
     WHERE u.id = p_user_id AND u.agency_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.accessible_agencies(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accessible_agencies(integer) TO authenticated;

COMMENT ON FUNCTION public.accessible_agencies(integer) IS
  'Returns agency_ids accessible to user. Used by combined-view RPCs (p_agency_id IS NULL).';
