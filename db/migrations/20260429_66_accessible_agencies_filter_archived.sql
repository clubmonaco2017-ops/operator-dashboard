-- Migration 66: accessible_agencies — exclude archived agencies
--
-- Архивированные агентства (is_active = false) не должны попадать в
-- available_agencies на клиенте, иначе superadmin/admin видит их в
-- multi-select при создании сотрудников и в combined-view фильтрах.
-- Управление архивированными остаётся только на странице /admin/multi-agency
-- через list_all_agencies(), где is_active намеренно показывается.

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
    RETURN QUERY SELECT a.id FROM public.agencies a WHERE a.is_active = true;
    RETURN;
  END IF;

  IF v_role = 'admin' THEN
    RETURN QUERY
      SELECT aa.agency_id
        FROM public.admin_agencies aa
        JOIN public.agencies a ON a.id = aa.agency_id
       WHERE aa.admin_id = p_user_id
         AND a.is_active = true;
    RETURN;
  END IF;

  -- operator/moderator/teamlead
  RETURN QUERY
    SELECT u.agency_id
      FROM public.dashboard_users u
      JOIN public.agencies a ON a.id = u.agency_id
     WHERE u.id = p_user_id
       AND u.agency_id IS NOT NULL
       AND a.is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.accessible_agencies(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accessible_agencies(integer) TO authenticated;
