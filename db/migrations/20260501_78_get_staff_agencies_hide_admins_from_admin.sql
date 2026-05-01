-- Migration 78: get_staff_agencies — admin caller cannot see other admins (P1 fix)
--
-- Раньше: caller=admin с create_users мог вызвать get_staff_agencies(другой-admin)
-- и получить список агентств чужого админа. По list_staff (mig 72) admin
-- вообще не должен видеть других admin'ов. Симметризуем правило здесь.

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
  v_caller_id   integer := current_dashboard_user_id();
  v_caller_role text;
  v_target_role text;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  IF NOT (v_caller_id = p_user_id OR has_permission(v_caller_id, 'create_users')) THEN
    RAISE EXCEPTION 'caller % cannot view user %', v_caller_id, p_user_id USING errcode = '42501';
  END IF;

  SELECT du.role INTO v_caller_role FROM public.dashboard_users du WHERE du.id = v_caller_id AND du.is_active = true;
  SELECT du.role INTO v_target_role FROM public.dashboard_users du WHERE du.id = p_user_id;
  IF v_target_role IS NULL THEN
    RETURN;
  END IF;

  -- Admin caller не может видеть admin/superadmin (только superadmin caller может)
  IF v_caller_role = 'admin' AND v_target_role IN ('admin','superadmin')
     AND v_caller_id <> p_user_id THEN
    RAISE EXCEPTION 'caller % cannot view agencies of admin %', v_caller_id, p_user_id USING errcode = '42501';
  END IF;

  IF v_target_role = 'admin' THEN
    RETURN QUERY
      SELECT ag.id, ag.name
        FROM public.admin_agencies aa
        JOIN public.agencies ag ON ag.id = aa.agency_id
       WHERE aa.admin_id = p_user_id
       ORDER BY ag.name;
    RETURN;
  END IF;

  IF v_target_role IN ('operator','moderator','teamlead') THEN
    RETURN QUERY
      SELECT ag.id, ag.name
        FROM public.dashboard_users du
        JOIN public.agencies ag ON ag.id = du.agency_id
       WHERE du.id = p_user_id AND du.agency_id IS NOT NULL;
    RETURN;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_staff_agencies(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_staff_agencies(integer) TO authenticated;
