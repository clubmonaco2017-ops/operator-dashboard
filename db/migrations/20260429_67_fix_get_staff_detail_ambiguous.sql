-- Migration 67: fix ambiguous "role" / "agency_id" / "id" in get_staff_detail()
--
-- В RETURNS TABLE OUT-параметры (id, role, agency_id, ...) видны внутри тела
-- наравне с колонками таблиц. На SELECT role, agency_id INTO v_target_role,
-- v_target_agency FROM dashboard_users WHERE id = p_user_id Postgres падает
-- с "column reference 'role' is ambiguous". Префиксуем OUT с out_*.
--
-- Frontend (CreateStaffSlideOut.jsx) читает только detail[0].ref_code →
-- маппинг в одной строчке (см. parallel commit).

DROP FUNCTION IF EXISTS public.get_staff_detail(integer);

CREATE OR REPLACE FUNCTION public.get_staff_detail(
  p_user_id integer
) RETURNS TABLE (
  out_id                   integer,
  out_ref_code             text,
  out_first_name           text,
  out_last_name            text,
  out_alias                text,
  out_email                text,
  out_role                 text,
  out_is_active            boolean,
  out_tableau_id           text,
  out_avatar_url           text,
  out_created_at           timestamptz,
  out_permissions          text[],
  out_attributes           jsonb,
  out_has_pending_deletion boolean,
  out_agency_id            uuid,
  out_agency_name          text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id     integer := current_dashboard_user_id();
  v_target_role   text;
  v_target_agency uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  IF NOT (v_caller_id = p_user_id OR has_permission(v_caller_id, 'create_users')) THEN
    RAISE EXCEPTION 'caller % cannot view user %', v_caller_id, p_user_id USING errcode = '42501';
  END IF;

  IF v_caller_id <> p_user_id THEN
    SELECT du.role, du.agency_id INTO v_target_role, v_target_agency
      FROM public.dashboard_users du WHERE du.id = p_user_id;
    IF v_target_role IS NULL THEN
      RAISE EXCEPTION 'user % not found', p_user_id USING errcode = 'P0002';
    END IF;
    IF v_target_role IN ('operator','moderator','teamlead') THEN
      PERFORM assert_agency_access(v_caller_id, v_target_agency);
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    u.id, u.ref_code, u.first_name, u.last_name, u.alias, u.email,
    u.role, u.is_active, u.tableau_id, u.avatar_url, u.created_at,
    COALESCE(
      (SELECT array_agg(permission ORDER BY permission) FROM user_permissions WHERE user_id = u.id),
      ARRAY[]::text[]
    ),
    COALESCE(
      (SELECT jsonb_object_agg(key, value) FROM user_attributes WHERE user_id = u.id),
      '{}'::jsonb
    ),
    EXISTS(
      SELECT 1 FROM deletion_requests dr
      WHERE dr.target_user = u.id AND dr.status = 'pending'
    ),
    u.agency_id,
    a.name
  FROM public.dashboard_users u
  LEFT JOIN public.agencies a ON a.id = u.agency_id
  WHERE u.id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_staff_detail(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_staff_detail(integer) TO authenticated;
