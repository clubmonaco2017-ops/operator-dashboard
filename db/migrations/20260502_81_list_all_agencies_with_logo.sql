-- Migration 81: add out_logo_url to list_all_agencies return type
-- Reason: avatar в master-list агентств теперь показывает logo если есть, иначе initial.
-- Note: PostgreSQL не позволяет CREATE OR REPLACE с изменением RETURNS, поэтому DROP + CREATE.

BEGIN;

DROP FUNCTION public.list_all_agencies();

CREATE FUNCTION public.list_all_agencies()
RETURNS TABLE (
  out_id            uuid,
  out_name          text,
  out_platform_id   uuid,
  out_platform_name text,
  out_logo_url      text,
  out_is_active     boolean,
  out_admin_count   integer,
  out_user_count    integer,
  out_client_count  integer,
  out_team_count    integer,
  out_created_at    timestamptz
)
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
    RAISE EXCEPTION 'only superadmin can list all agencies' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.name,
    a.platform_id,
    p.name,
    a.logo_url,
    a.is_active,
    (SELECT COUNT(*)::int FROM admin_agencies aa WHERE aa.agency_id = a.id),
    (SELECT COUNT(*)::int FROM dashboard_users u WHERE u.agency_id = a.id AND u.is_active = true),
    (SELECT COUNT(*)::int FROM clients c WHERE c.agency_id = a.id AND c.is_active = true),
    (SELECT COUNT(*)::int FROM teams t WHERE t.agency_id = a.id AND t.is_active = true),
    a.created_at
  FROM agencies a
  LEFT JOIN platforms p ON p.id = a.platform_id
  ORDER BY a.is_active DESC, lower(a.name) ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_all_agencies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_all_agencies() TO authenticated;

COMMIT;

-- VERIFY:
--   SELECT out_id, out_name, out_logo_url FROM list_all_agencies() LIMIT 2;
--   -- Expected: rows include out_logo_url column (null или URL string).
--
-- ROLLBACK:
--   DROP FUNCTION public.list_all_agencies();
--   -- Then re-create без out_logo_url (см. 20260429_65_fix_list_all_agencies_ambiguous.sql).
