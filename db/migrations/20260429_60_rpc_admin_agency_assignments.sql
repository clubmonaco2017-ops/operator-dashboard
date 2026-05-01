-- Migration 60: RPC для управления назначениями admin → agency
--
-- assign_admin_to_agency / remove_admin_from_agency. Только superadmin.

BEGIN;

CREATE OR REPLACE FUNCTION public.assign_admin_to_agency(
  p_admin_id  integer,
  p_agency_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_role text;
  v_target_role text;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = '28000'; END IF;
  SELECT role INTO v_role FROM dashboard_users WHERE id = v_caller_id;
  IF v_role != 'superadmin' THEN
    RAISE EXCEPTION 'only superadmin can assign admins to agencies' USING errcode = '42501';
  END IF;

  SELECT role INTO v_target_role FROM dashboard_users WHERE id = p_admin_id AND is_active = true;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'user % not found or inactive', p_admin_id USING errcode = 'P0002';
  END IF;
  IF v_target_role != 'admin' THEN
    RAISE EXCEPTION 'user % is not an admin (role: %)', p_admin_id, v_target_role USING errcode = '23514';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM agencies WHERE id = p_agency_id AND is_active = true) THEN
    RAISE EXCEPTION 'agency % not found or archived', p_agency_id USING errcode = 'P0002';
  END IF;

  INSERT INTO admin_agencies (admin_id, agency_id, assigned_by)
    VALUES (p_admin_id, p_agency_id, v_caller_id)
    ON CONFLICT (admin_id, agency_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_admin_to_agency(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_admin_to_agency(integer, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_admin_from_agency(
  p_admin_id  integer,
  p_agency_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_role text;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = '28000'; END IF;
  SELECT role INTO v_role FROM dashboard_users WHERE id = v_caller_id;
  IF v_role != 'superadmin' THEN
    RAISE EXCEPTION 'only superadmin can remove admin assignments' USING errcode = '42501';
  END IF;

  DELETE FROM admin_agencies WHERE admin_id = p_admin_id AND agency_id = p_agency_id;
  -- NOT FOUND OK — idempotent.
END;
$$;

REVOKE ALL ON FUNCTION public.remove_admin_from_agency(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_admin_from_agency(integer, uuid) TO authenticated;

-- ============================================================
-- list_agency_admins(p_agency_id) — список админов агентства (для UI)
-- Доступен superadmin (для /admin/agencies management UI).
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_agency_admins(p_agency_id uuid)
RETURNS TABLE (admin_id integer, email text, first_name text, last_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_role text;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = '28000'; END IF;
  SELECT role INTO v_role FROM dashboard_users WHERE id = v_caller_id;
  IF v_role != 'superadmin' THEN
    RAISE EXCEPTION 'only superadmin can list agency admins' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT u.id, u.email, u.first_name, u.last_name
  FROM admin_agencies aa
  JOIN dashboard_users u ON u.id = aa.admin_id
  WHERE aa.agency_id = p_agency_id
  ORDER BY u.email;
END;
$$;

REVOKE ALL ON FUNCTION public.list_agency_admins(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_agency_admins(uuid) TO authenticated;

COMMIT;
