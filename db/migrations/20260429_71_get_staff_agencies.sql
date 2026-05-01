-- Migration 71: get_staff_agencies(p_user_id) — list agencies a staff member is bound to
--
-- admin → admin_agencies; operator/moderator/teamlead → одиночный agency;
-- superadmin → пусто (глобальный доступ).
-- Используется в ProfileTab для отрисовки chip-листа в карточке сотрудника.

CREATE OR REPLACE FUNCTION public.get_staff_agencies(p_user_id integer)
RETURNS TABLE (
  out_agency_id   uuid,
  out_agency_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_role      text;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  IF NOT (v_caller_id = p_user_id OR has_permission(v_caller_id, 'create_users')) THEN
    RAISE EXCEPTION 'caller % cannot view user %', v_caller_id, p_user_id USING errcode = '42501';
  END IF;

  SELECT du.role INTO v_role FROM public.dashboard_users du WHERE du.id = p_user_id;
  IF v_role IS NULL THEN
    RETURN;
  END IF;

  IF v_role = 'admin' THEN
    RETURN QUERY
      SELECT ag.id, ag.name
        FROM public.admin_agencies aa
        JOIN public.agencies ag ON ag.id = aa.agency_id
       WHERE aa.admin_id = p_user_id
       ORDER BY ag.name;
    RETURN;
  END IF;

  IF v_role IN ('operator','moderator','teamlead') THEN
    RETURN QUERY
      SELECT ag.id, ag.name
        FROM public.dashboard_users du
        JOIN public.agencies ag ON ag.id = du.agency_id
       WHERE du.id = p_user_id AND du.agency_id IS NOT NULL;
    RETURN;
  END IF;

  -- superadmin: глобальный, не возвращаем агентства (UI показывает «Все»)
END;
$$;

REVOKE ALL ON FUNCTION public.get_staff_agencies(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_staff_agencies(integer) TO authenticated;
