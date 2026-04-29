-- Migration 59: RPC CRUD agencies (только superadmin)
--
-- create_agency / update_agency / archive_agency / list_all_agencies.
-- Если в legacy таблице agencies нет колонок is_active/created_at — добавляем.

BEGIN;

-- Add is_active + created_at to agencies if missing
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_agencies_active ON agencies(is_active) WHERE is_active = true;

-- ============================================================
-- create_agency(p_name, p_platform_id, p_admin_ids)
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_agency(
  p_name        text,
  p_platform_id uuid,
  p_admin_ids   integer[] DEFAULT ARRAY[]::integer[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_role      text;
  v_new_id    uuid;
  v_admin_id  integer;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  SELECT role INTO v_role FROM dashboard_users WHERE id = v_caller_id;
  IF v_role != 'superadmin' THEN
    RAISE EXCEPTION 'only superadmin can create agencies' USING errcode = '42501';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name is required';
  END IF;
  IF p_platform_id IS NULL THEN
    RAISE EXCEPTION 'platform_id is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM platforms WHERE id = p_platform_id) THEN
    RAISE EXCEPTION 'platform % not found', p_platform_id USING errcode = 'P0002';
  END IF;

  INSERT INTO agencies (name, platform_id)
  VALUES (trim(p_name), p_platform_id)
  RETURNING id INTO v_new_id;

  IF array_length(p_admin_ids, 1) > 0 THEN
    FOREACH v_admin_id IN ARRAY p_admin_ids LOOP
      IF NOT EXISTS (SELECT 1 FROM dashboard_users WHERE id = v_admin_id AND role = 'admin') THEN
        RAISE EXCEPTION 'user % is not an admin', v_admin_id USING errcode = '23514';
      END IF;
      INSERT INTO admin_agencies (admin_id, agency_id, assigned_by)
        VALUES (v_admin_id, v_new_id, v_caller_id);
    END LOOP;
  END IF;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_agency(text, uuid, integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_agency(text, uuid, integer[]) TO authenticated;

-- ============================================================
-- update_agency(p_agency_id, p_name)
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_agency(
  p_agency_id uuid,
  p_name      text
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
    RAISE EXCEPTION 'only superadmin can update agencies' USING errcode = '42501';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name is required';
  END IF;

  UPDATE agencies SET name = trim(p_name) WHERE id = p_agency_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'agency % not found', p_agency_id USING errcode = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_agency(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_agency(uuid, text) TO authenticated;

-- ============================================================
-- archive_agency(p_agency_id) — мягкое удаление через is_active
-- ============================================================
CREATE OR REPLACE FUNCTION public.archive_agency(p_agency_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_role text;
  v_active_users integer;
  v_active_clients integer;
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = '28000'; END IF;
  SELECT role INTO v_role FROM dashboard_users WHERE id = v_caller_id;
  IF v_role != 'superadmin' THEN
    RAISE EXCEPTION 'only superadmin can archive agencies' USING errcode = '42501';
  END IF;

  SELECT COUNT(*) INTO v_active_users
    FROM dashboard_users WHERE agency_id = p_agency_id AND is_active = true;
  SELECT COUNT(*) INTO v_active_clients
    FROM clients WHERE agency_id = p_agency_id AND is_active = true;

  IF v_active_users > 0 OR v_active_clients > 0 THEN
    RAISE EXCEPTION 'agency has % active users and % active clients; deactivate them first',
      v_active_users, v_active_clients USING errcode = '23514';
  END IF;

  UPDATE agencies SET is_active = false WHERE id = p_agency_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'agency % not found', p_agency_id USING errcode = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_agency(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_agency(uuid) TO authenticated;

-- ============================================================
-- list_all_agencies() — все агентства с метаданными (только superadmin)
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_all_agencies()
RETURNS TABLE (
  id              uuid,
  name            text,
  platform_id     uuid,
  platform_name   text,
  is_active       boolean,
  admin_count     integer,
  user_count      integer,
  client_count    integer,
  team_count      integer,
  created_at      timestamptz
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
    p.name AS platform_name,
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
