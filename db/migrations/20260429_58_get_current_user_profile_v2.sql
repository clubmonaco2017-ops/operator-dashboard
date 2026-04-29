-- Migration 58: get_current_user_profile() v2 — добавляем available_agencies + agency_id
--
-- Возвращает дополнительные поля:
--   - agency_id (uuid) — agency для operator/moderator/teamlead, NULL для admin/superadmin
--   - available_agencies (jsonb array of {id, name}) — список агентств, доступных пользователю.
-- Используется AgencyContext на клиенте.

DROP FUNCTION IF EXISTS public.get_current_user_profile();

CREATE OR REPLACE FUNCTION public.get_current_user_profile()
RETURNS TABLE (
  id integer,
  email text,
  first_name text,
  last_name text,
  role text,
  is_active boolean,
  permissions text[],
  attributes jsonb,
  timezone text,
  ref_code text,
  alias text,
  agency_id uuid,
  available_agencies jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    u.role,
    u.is_active,
    COALESCE(
      (SELECT array_agg(p.permission ORDER BY p.permission)
       FROM public.user_permissions p
       WHERE p.user_id = u.id),
      ARRAY[]::text[]
    ),
    COALESCE(
      (SELECT jsonb_object_agg(a.key, a.value)
       FROM public.user_attributes a
       WHERE a.user_id = u.id),
      '{}'::jsonb
    ),
    COALESCE(u.timezone, 'Europe/Kiev'),
    u.ref_code,
    u.alias,
    u.agency_id,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', ag.id, 'name', ag.name) ORDER BY ag.name)
         FROM public.agencies ag
        WHERE ag.id IN (SELECT acc.agency_id FROM public.accessible_agencies(u.id) acc)),
      '[]'::jsonb
    )
  FROM public.dashboard_users u
  WHERE u.id = v_caller_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_current_user_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_profile() TO authenticated;

COMMENT ON FUNCTION public.get_current_user_profile() IS
  'Hydrates current user profile + agency_id + available_agencies (jsonb array). Used by useAuth + AgencyContext.';
