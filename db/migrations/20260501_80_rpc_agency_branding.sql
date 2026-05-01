-- Migration 80: RPC get_agency_full + update_agency_branding (superadmin-only)
--
-- get_agency_full(p_id) — возвращает полную запись агентства для master-detail drawer:
--   name, platform_id, platform_name, logo_url, contacts (jsonb array),
--   access_login, access_password, notes, is_active, created_at,
--   admin_count, user_count, client_count, team_count.
--
-- update_agency_branding(p_id, p_logo_url, p_contacts, p_access_login,
--                        p_access_password, p_notes) — superadmin-only,
-- частичное обновление (NULL → не трогаем). p_contacts передаётся как jsonb;
-- если NULL — не трогаем; если jsonb-массив — полная перезапись.

BEGIN;

-- ============================================================
-- get_agency_full(p_id)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_agency_full(p_id uuid)
RETURNS TABLE (
  out_id              uuid,
  out_name            text,
  out_platform_id     uuid,
  out_platform_name   text,
  out_logo_url        text,
  out_contacts        jsonb,
  out_access_login    text,
  out_access_password text,
  out_notes           text,
  out_is_active       boolean,
  out_created_at      timestamptz,
  out_admin_count     integer,
  out_user_count      integer,
  out_client_count    integer,
  out_team_count      integer
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
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  SELECT role INTO v_role FROM dashboard_users WHERE id = v_caller_id;
  IF v_role != 'superadmin' THEN
    RAISE EXCEPTION 'only superadmin can read full agency' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.name,
    a.platform_id,
    p.name,
    a.logo_url,
    COALESCE(a.contacts, '[]'::jsonb),
    a.access_login,
    a.access_password,
    a.notes,
    a.is_active,
    a.created_at,
    (SELECT COUNT(*)::int FROM admin_agencies aa WHERE aa.agency_id = a.id),
    (SELECT COUNT(*)::int FROM dashboard_users u WHERE u.agency_id = a.id AND u.is_active = true),
    (SELECT COUNT(*)::int FROM clients c WHERE c.agency_id = a.id),
    (SELECT COUNT(*)::int FROM teams t WHERE t.agency_id = a.id)
  FROM agencies a
  LEFT JOIN platforms p ON p.id = a.platform_id
  WHERE a.id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'agency % not found', p_id USING errcode = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_agency_full(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_agency_full(uuid) TO authenticated;

-- ============================================================
-- update_agency_branding(p_id, p_logo_url, p_contacts, p_access_login,
--                       p_access_password, p_notes)
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_agency_branding(
  p_id              uuid,
  p_logo_url        text     DEFAULT NULL,
  p_contacts        jsonb    DEFAULT NULL,
  p_access_login    text     DEFAULT NULL,
  p_access_password text     DEFAULT NULL,
  p_notes           text     DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_role text;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  SELECT role INTO v_role FROM dashboard_users WHERE id = v_caller_id;
  IF v_role != 'superadmin' THEN
    RAISE EXCEPTION 'only superadmin can update agency branding' USING errcode = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM agencies WHERE id = p_id) THEN
    RAISE EXCEPTION 'agency % not found', p_id USING errcode = 'P0002';
  END IF;

  IF p_contacts IS NOT NULL AND jsonb_typeof(p_contacts) != 'array' THEN
    RAISE EXCEPTION 'p_contacts must be a jsonb array' USING errcode = '22023';
  END IF;

  UPDATE agencies SET
    logo_url        = COALESCE(p_logo_url,        logo_url),
    contacts        = COALESCE(p_contacts,        contacts),
    access_login    = COALESCE(p_access_login,    access_login),
    access_password = COALESCE(p_access_password, access_password),
    notes           = COALESCE(p_notes,           notes)
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_agency_branding(uuid, text, jsonb, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_agency_branding(uuid, text, jsonb, text, text, text) TO authenticated;

COMMIT;

-- VERIFY:
--   SELECT proname FROM pg_proc WHERE proname IN ('get_agency_full','update_agency_branding');
--   -- Expected: 2 rows.
--
--   -- Permission check (non-superadmin should fail):
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<non-superadmin auth uuid>"}', true);
--   SELECT * FROM get_agency_full('<some agency uuid>');
--   -- Expected: ERROR "only superadmin can read full agency".
--
-- ROLLBACK:
--   DROP FUNCTION public.update_agency_branding(uuid, text, jsonb, text, text, text);
--   DROP FUNCTION public.get_agency_full(uuid);
