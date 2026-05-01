-- Migration 72: list_staff — admin caller видит только non-admin сотрудников
--
-- Дизайн multi-agency: superadmin управляет admin'ами; admin управляет
-- operator/moderator/teamlead в своих агентствах. Admin не должен видеть
-- других admin'ов и не должен видеть superadmin'а в /staff. Superadmin
-- видит всех (без изменений).

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
  v_caller_id   integer := current_dashboard_user_id();
  v_caller_role text;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  IF NOT has_permission(v_caller_id, 'create_users') THEN
    RAISE EXCEPTION 'caller % lacks create_users', v_caller_id USING errcode = '42501';
  END IF;

  SELECT du.role INTO v_caller_role
    FROM public.dashboard_users du WHERE du.id = v_caller_id AND du.is_active = true;
  IF v_caller_role IS NULL THEN
    RETURN;
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
      -- Caller = superadmin: видит всех
      v_caller_role = 'superadmin' AND (
        u.role = 'superadmin'
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
        OR (u.role IN ('operator','moderator','teamlead') AND (
          (p_agency_id IS NOT NULL AND u.agency_id = p_agency_id)
          OR
          (p_agency_id IS NULL AND u.agency_id IN (
            SELECT acc.agency_id FROM accessible_agencies(v_caller_id) acc
          ))
        ))
      )

      -- Caller = admin: только non-admin своих агентств (без admin/superadmin)
      OR (v_caller_role = 'admin' AND u.role IN ('operator','moderator','teamlead') AND (
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
