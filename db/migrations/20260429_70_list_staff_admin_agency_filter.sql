-- Migration 70: list_staff — фильтр по агентству учитывает admin_agencies для admin
--
-- Раньше admin/superadmin "всегда видны" независимо от p_agency_id, что давало
-- ложноположительные совпадения: admin привязанный только к agency A показывался
-- при фильтре по agency B. Фикс:
--   - superadmin: всегда виден (он реально глобальный)
--   - admin: фильтр через admin_agencies (intersection с p_agency_id или
--     accessible_agencies для combined view)
--   - operator/moderator/teamlead: как раньше (через dashboard_users.agency_id)

DROP FUNCTION IF EXISTS public.list_staff(text, boolean, uuid);

CREATE OR REPLACE FUNCTION public.list_staff(
  p_role_filter text     DEFAULT NULL,
  p_active      boolean  DEFAULT NULL,
  p_agency_id   uuid     DEFAULT NULL
)
RETURNS TABLE (
  id                   integer,
  ref_code             text,
  first_name           text,
  last_name            text,
  alias                text,
  email                text,
  role                 text,
  is_active            boolean,
  tableau_id           text,
  avatar_url           text,
  created_at           timestamptz,
  permissions          text[],
  attributes           jsonb,
  has_pending_deletion boolean,
  agency_id            uuid,
  agency_name          text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  IF NOT has_permission(v_caller_id, 'create_users') THEN
    RAISE EXCEPTION 'caller % lacks create_users', v_caller_id USING errcode = '42501';
  END IF;

  IF p_agency_id IS NOT NULL THEN
    PERFORM assert_agency_access(v_caller_id, p_agency_id);
  END IF;

  RETURN QUERY
  SELECT
    u.id, u.ref_code, u.first_name, u.last_name, u.alias, u.email,
    u.role, u.is_active, u.tableau_id, u.avatar_url, u.created_at,
    COALESCE(
      (SELECT array_agg(p.permission ORDER BY p.permission)
         FROM user_permissions p WHERE p.user_id = u.id),
      ARRAY[]::text[]
    ),
    COALESCE(
      (SELECT jsonb_object_agg(at.key, at.value)
         FROM user_attributes at WHERE at.user_id = u.id),
      '{}'::jsonb
    ),
    EXISTS(
      SELECT 1 FROM deletion_requests dr
      WHERE dr.target_user = u.id AND dr.status = 'pending'
    ),
    u.agency_id,
    a.name
  FROM dashboard_users u
  LEFT JOIN agencies a ON a.id = u.agency_id
  WHERE
    (p_role_filter IS NULL OR u.role = p_role_filter)
    AND (p_active IS NULL OR u.is_active = p_active)
    AND (
      -- superadmin: всегда виден (truly global)
      u.role = 'superadmin'

      -- admin: scope через admin_agencies
      OR (u.role = 'admin' AND (
        (p_agency_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM admin_agencies aa
           WHERE aa.admin_id = u.id AND aa.agency_id = p_agency_id
        ))
        OR
        (p_agency_id IS NULL AND EXISTS (
          SELECT 1 FROM admin_agencies aa
           JOIN accessible_agencies(v_caller_id) acc ON acc.agency_id = aa.agency_id
          WHERE aa.admin_id = u.id
        ))
      ))

      -- operator/moderator/teamlead: scope через dashboard_users.agency_id
      OR (u.role IN ('operator','moderator','teamlead') AND (
        (p_agency_id IS NOT NULL AND u.agency_id = p_agency_id)
        OR
        (p_agency_id IS NULL AND u.agency_id IN (
          SELECT acc.agency_id FROM accessible_agencies(v_caller_id) acc
        ))
      ))
    )
  ORDER BY u.role, u.ref_code;
END;
$$;

REVOKE ALL ON FUNCTION public.list_staff(text, boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_staff(text, boolean, uuid) TO authenticated;
