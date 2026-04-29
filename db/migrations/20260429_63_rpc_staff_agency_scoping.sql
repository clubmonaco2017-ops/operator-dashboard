-- Migration 63: Stage 8 — Scope staff/user-CRUD bucket to agency context
--
-- Migrated RPCs (7):
--   create_staff           — adds p_agency_id (required for non-admin roles) +
--                            p_admin_agency_ids (optional, populates admin_agencies)
--   update_staff_profile   — T.3 (assert via target's agency_id)
--   deactivate_staff       — T.3
--   activate_staff         — T.3
--   list_staff             — BREAKING: gains p_role_filter, p_active, p_agency_id;
--                            adds agency_id + agency_name to TABLE
--   get_staff_detail       — adds agency_id + agency_name to TABLE; assert via row
--   get_staff_team_membership — assert via target's agency (skip when target is
--                            admin/superadmin without agency)
--
-- Skipped: list_unassigned_operators — already migrated in 62 (teams bucket).
--
-- All RPCs: 28000 unauthorized check, has_permission check (preserved),
--           assert/scoping, REVOKE PUBLIC, GRANT to authenticated.
--
-- See plan: docs/superpowers/plans/2026-04-29-multi-agency-scoping.md (Stage 8).

BEGIN;

-- ============================================================
-- 1. create_staff (T.2 — scoped write + admin_agencies side-effect)
-- ============================================================

DROP FUNCTION IF EXISTS public.create_staff(text, text, text, text, text, text, text[]);

CREATE OR REPLACE FUNCTION public.create_staff(
  p_email             text,
  p_password          text,
  p_role              text,
  p_first_name        text,
  p_last_name         text,
  p_alias             text,
  p_permissions       text[],
  p_agency_id         uuid      DEFAULT NULL,
  p_admin_agency_ids  uuid[]    DEFAULT ARRAY[]::uuid[]
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id   integer := current_dashboard_user_id();
  v_new_id      integer;
  v_ref_code    text;
  v_perm        text;
  v_admin_agid  uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  IF NOT has_permission(v_caller_id, 'create_users') THEN
    RAISE EXCEPTION 'caller % lacks create_users', v_caller_id USING errcode = '42501';
  END IF;

  IF p_role NOT IN ('admin','moderator','teamlead','operator') THEN
    RAISE EXCEPTION 'Invalid role for create_staff: %', p_role;
  END IF;

  -- Non-admin roles require an agency_id (DB CHECK enforces too).
  IF p_role IN ('moderator','teamlead','operator') THEN
    IF p_agency_id IS NULL THEN
      RAISE EXCEPTION 'agency_id is required for role %', p_role USING errcode = '23502';
    END IF;
    PERFORM assert_agency_access(v_caller_id, p_agency_id);
  ELSIF p_role = 'admin' THEN
    -- admin: agency_id must be NULL (admin → many agencies via admin_agencies).
    IF p_agency_id IS NOT NULL THEN
      RAISE EXCEPTION 'agency_id must be NULL for admin role; use p_admin_agency_ids'
        USING errcode = '23514';
    END IF;
    -- Caller must have access to every agency they assign the new admin to.
    IF p_admin_agency_ids IS NOT NULL AND array_length(p_admin_agency_ids, 1) > 0 THEN
      FOREACH v_admin_agid IN ARRAY p_admin_agency_ids LOOP
        PERFORM assert_agency_access(v_caller_id, v_admin_agid);
      END LOOP;
    END IF;
  END IF;

  v_ref_code := _next_ref_code(p_role, p_first_name, p_last_name);

  INSERT INTO dashboard_users (
    email, password_hash, role,
    first_name, last_name, alias, ref_code,
    created_by, permissions, agency_id
  ) VALUES (
    p_email,
    crypt(p_password, gen_salt('bf')),
    p_role,
    p_first_name, p_last_name, p_alias, v_ref_code,
    v_caller_id,
    '{}'::jsonb,
    p_agency_id   -- NULL for admin/superadmin, set for operator/moderator/teamlead
  )
  RETURNING id INTO v_new_id;

  -- Grant each permission in the passed array
  IF p_permissions IS NOT NULL THEN
    FOREACH v_perm IN ARRAY p_permissions LOOP
      INSERT INTO user_permissions (user_id, permission, granted_by, granted_at)
        VALUES (v_new_id, v_perm, v_caller_id, now())
      ON CONFLICT (user_id, permission) DO NOTHING;
    END LOOP;
  END IF;

  -- For admin role: populate admin_agencies junction.
  IF p_role = 'admin'
     AND p_admin_agency_ids IS NOT NULL
     AND array_length(p_admin_agency_ids, 1) > 0 THEN
    FOREACH v_admin_agid IN ARRAY p_admin_agency_ids LOOP
      INSERT INTO admin_agencies (admin_id, agency_id, assigned_by)
        VALUES (v_new_id, v_admin_agid, v_caller_id)
      ON CONFLICT (admin_id, agency_id) DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_staff(text, text, text, text, text, text, text[], uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_staff(text, text, text, text, text, text, text[], uuid, uuid[]) TO authenticated;

-- ============================================================
-- 2. update_staff_profile (T.3 — scoped update)
--    Assert caller has access to target's agency. agency_id itself is NOT
--    editable through this RPC (re-assignment uses assign/remove_admin_from_agency
--    for admin role; agency_id immutable for non-admin via CHECK + business rule).
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_staff_profile(
  p_user_id          integer,
  p_first_name       text,
  p_last_name        text,
  p_alias            text,
  p_email            text,
  p_avatar_url       text    DEFAULT NULL,
  p_clear_avatar_url boolean DEFAULT false
) RETURNS void
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
    RAISE EXCEPTION 'caller % cannot edit user %', v_caller_id, p_user_id USING errcode = '42501';
  END IF;

  -- Resolve target's role + agency. Self-edit always allowed.
  IF v_caller_id <> p_user_id THEN
    SELECT role, agency_id INTO v_target_role, v_target_agency
      FROM dashboard_users WHERE id = p_user_id;
    IF v_target_role IS NULL THEN
      RAISE EXCEPTION 'user % not found', p_user_id USING errcode = 'P0002';
    END IF;
    -- For non-admin targets, caller must have access to target's agency.
    IF v_target_role IN ('operator','moderator','teamlead') THEN
      PERFORM assert_agency_access(v_caller_id, v_target_agency);
    END IF;
    -- For admin targets, caller must be superadmin (admins editing other admins
    -- across agencies is a privilege step-up).
    IF v_target_role IN ('admin','superadmin') THEN
      IF NOT EXISTS (
        SELECT 1 FROM dashboard_users WHERE id = v_caller_id AND role = 'superadmin'
      ) THEN
        RAISE EXCEPTION 'only superadmin can edit admin/superadmin profiles'
          USING errcode = '42501';
      END IF;
    END IF;
  END IF;

  UPDATE dashboard_users
  SET first_name = COALESCE(p_first_name, first_name),
      last_name  = COALESCE(p_last_name, last_name),
      alias      = p_alias,
      email      = COALESCE(p_email, email),
      avatar_url = CASE
                     WHEN p_clear_avatar_url THEN NULL
                     WHEN p_avatar_url IS NULL THEN avatar_url
                     ELSE p_avatar_url
                   END
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_staff_profile(integer, text, text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_staff_profile(integer, text, text, text, text, text, boolean) TO authenticated;

-- ============================================================
-- 3. deactivate_staff (T.3)
-- ============================================================

CREATE OR REPLACE FUNCTION public.deactivate_staff(
  p_user_id integer
) RETURNS void
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

  -- Self-deactivation always allowed; otherwise need superadmin OR agency access.
  IF v_caller_id <> p_user_id THEN
    SELECT role, agency_id INTO v_target_role, v_target_agency
      FROM dashboard_users WHERE id = p_user_id;
    IF v_target_role IS NULL THEN
      RAISE EXCEPTION 'user % not found', p_user_id USING errcode = 'P0002';
    END IF;

    IF v_target_role IN ('operator','moderator','teamlead') THEN
      PERFORM assert_agency_access(v_caller_id, v_target_agency);
    ELSIF v_target_role IN ('admin','superadmin') THEN
      IF NOT EXISTS (
        SELECT 1 FROM dashboard_users WHERE id = v_caller_id AND role = 'superadmin'
      ) THEN
        RAISE EXCEPTION 'only superadmin can deactivate admin/superadmin'
          USING errcode = '42501';
      END IF;
    END IF;
  END IF;

  PERFORM apply_user_archived_side_effects(p_user_id, v_caller_id);
  UPDATE dashboard_users SET is_active = false WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_staff(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_staff(integer) TO authenticated;

-- ============================================================
-- 4. activate_staff (T.3) — symmetric scoping
-- ============================================================

CREATE OR REPLACE FUNCTION public.activate_staff(
  p_user_id integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id     integer := current_dashboard_user_id();
  v_was_active    boolean;
  v_target_role   text;
  v_target_agency uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT role, agency_id, is_active
    INTO v_target_role, v_target_agency, v_was_active
    FROM dashboard_users WHERE id = p_user_id FOR UPDATE;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'user % not found', p_user_id;
  END IF;

  -- Authorization: superadmin always OK; admin OK if target is in admin's agency.
  -- (admin can never reactivate other admins/superadmin.)
  IF v_target_role IN ('operator','moderator','teamlead') THEN
    PERFORM assert_agency_access(v_caller_id, v_target_agency);
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM dashboard_users WHERE id = v_caller_id AND role = 'superadmin'
    ) THEN
      RAISE EXCEPTION 'only superadmin can activate admin/superadmin users'
        USING errcode = '42501';
    END IF;
  END IF;

  -- Idempotent.
  IF v_was_active THEN
    RETURN;
  END IF;

  UPDATE dashboard_users SET is_active = true WHERE id = p_user_id;

  INSERT INTO staff_activity (user_id, actor_id, event_type, payload)
  VALUES (p_user_id, v_caller_id, 'user_reactivated', '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.activate_staff(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_staff(integer) TO authenticated;

-- ============================================================
-- 5. list_staff (T.1 — combined-view read)
--    BREAKING: gains p_role_filter, p_active, p_agency_id;
--    TABLE adds agency_id + agency_name.
-- ============================================================

DROP FUNCTION IF EXISTS public.list_staff();

CREATE OR REPLACE FUNCTION public.list_staff(
  p_role_filter text     DEFAULT NULL,    -- e.g. 'operator' | 'admin' | NULL = all
  p_active      boolean  DEFAULT NULL,    -- true|false|NULL = all
  p_agency_id   uuid     DEFAULT NULL     -- NULL = combined view
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
      (SELECT array_agg(permission ORDER BY permission) FROM user_permissions WHERE user_id = u.id),
      ARRAY[]::text[]
    ) AS permissions,
    COALESCE(
      (SELECT jsonb_object_agg(key, value) FROM user_attributes WHERE user_id = u.id),
      '{}'::jsonb
    ) AS attributes,
    EXISTS(
      SELECT 1 FROM deletion_requests dr
      WHERE dr.target_user = u.id AND dr.status = 'pending'
    ) AS has_pending_deletion,
    u.agency_id,
    a.name AS agency_name
  FROM dashboard_users u
  LEFT JOIN agencies a ON a.id = u.agency_id
  WHERE
    (p_role_filter IS NULL OR u.role = p_role_filter)
    AND (p_active IS NULL OR u.is_active = p_active)
    AND (
      -- superadmin and admin without agency_id are always visible to callers
      -- with create_users permission. Agency filter only narrows non-admin rows.
      u.role IN ('admin','superadmin')
      OR (
        p_agency_id IS NOT NULL AND u.agency_id = p_agency_id
        OR p_agency_id IS NULL AND u.agency_id IN (
          SELECT acc.agency_id FROM accessible_agencies(v_caller_id) acc
        )
      )
    )
  ORDER BY u.role, u.ref_code;
END;
$$;

REVOKE ALL ON FUNCTION public.list_staff(text, boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_staff(text, boolean, uuid) TO authenticated;

-- ============================================================
-- 6. get_staff_detail (T.3) — adds agency_id + agency_name to TABLE
-- ============================================================

DROP FUNCTION IF EXISTS public.get_staff_detail(integer);

CREATE OR REPLACE FUNCTION public.get_staff_detail(
  p_user_id integer
) RETURNS TABLE (
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
    SELECT role, agency_id INTO v_target_role, v_target_agency
      FROM dashboard_users WHERE id = p_user_id;
    IF v_target_role IS NULL THEN
      RAISE EXCEPTION 'user % not found', p_user_id USING errcode = 'P0002';
    END IF;
    -- For non-admin targets, caller must have access to target's agency.
    IF v_target_role IN ('operator','moderator','teamlead') THEN
      PERFORM assert_agency_access(v_caller_id, v_target_agency);
    END IF;
    -- admin/superadmin targets: any caller with create_users can view (existing behavior).
  END IF;

  RETURN QUERY
  SELECT
    u.id, u.ref_code, u.first_name, u.last_name, u.alias, u.email,
    u.role, u.is_active, u.tableau_id, u.avatar_url, u.created_at,
    COALESCE(
      (SELECT array_agg(permission ORDER BY permission) FROM user_permissions WHERE user_id = u.id),
      ARRAY[]::text[]
    ) AS permissions,
    COALESCE(
      (SELECT jsonb_object_agg(key, value) FROM user_attributes WHERE user_id = u.id),
      '{}'::jsonb
    ) AS attributes,
    EXISTS(
      SELECT 1 FROM deletion_requests dr
      WHERE dr.target_user = u.id AND dr.status = 'pending'
    ) AS has_pending_deletion,
    u.agency_id,
    a.name AS agency_name
  FROM dashboard_users u
  LEFT JOIN agencies a ON a.id = u.agency_id
  WHERE u.id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_staff_detail(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_staff_detail(integer) TO authenticated;

-- ============================================================
-- 7. get_staff_team_membership (T.3) — assert via target's agency
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_staff_team_membership(
  p_staff_id integer
) RETURNS TABLE (
  team_id      integer,
  team_name    text,
  lead_user_id integer,
  lead_name    text,
  lead_role    text
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

  -- Self-lookup always allowed.
  IF v_caller_id <> p_staff_id THEN
    SELECT role, agency_id INTO v_target_role, v_target_agency
      FROM dashboard_users WHERE id = p_staff_id;
    -- Membership only meaningful for operator role; if target not found or admin,
    -- skip assert and let the join return zero rows.
    IF v_target_role IN ('operator','moderator','teamlead')
       AND v_target_agency IS NOT NULL THEN
      PERFORM assert_agency_access(v_caller_id, v_target_agency);
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.lead_user_id,
    COALESCE(NULLIF(trim(lu.first_name || ' ' || lu.last_name), ''), lu.alias, lu.email),
    lu.role
  FROM team_members tm
  JOIN teams t ON t.id = tm.team_id
  JOIN dashboard_users lu ON lu.id = t.lead_user_id
  WHERE tm.operator_id = p_staff_id
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_staff_team_membership(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_staff_team_membership(integer) TO authenticated;

COMMIT;

-- VERIFY:
--   SELECT proname, pg_get_function_identity_arguments(oid)
--     FROM pg_proc
--     WHERE proname IN (
--       'create_staff','update_staff_profile','deactivate_staff','activate_staff',
--       'list_staff','get_staff_detail','get_staff_team_membership'
--     )
--     ORDER BY proname;
--   -- Expected: 7 rows.
--
-- ROLLBACK:
--   -- Re-apply migrations 20260428_44_rpc_staff_auth.sql + 20260429_51_rpc_activate_staff.sql.
