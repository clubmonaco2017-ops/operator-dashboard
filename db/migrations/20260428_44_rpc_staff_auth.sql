-- Migration 44: Stage 10 — Migrate staff bucket to current_dashboard_user_id()
--
-- Migrated RPCs (6): drop p_caller_id from signature, derive via current_dashboard_user_id()
--   create_staff, update_staff_profile, deactivate_staff,
--   list_staff, get_staff_detail, get_staff_team_membership, list_unassigned_operators
--
-- Dropped RPC (1, NOT recreated):
--   change_staff_password — was hashing via pgcrypto.crypt() into dashboard_users.password_hash,
--   which is deprecated post-cutover (auth_login dropped in Stage 14). Password resets now go
--   through supabase.auth.resetPasswordForEmail from the frontend.
--
-- All migrated RPCs: REVOKE ALL FROM PUBLIC + GRANT EXECUTE TO authenticated.
--
-- Source migrations:
--   create_staff, update_staff_profile, list_staff, get_staff_detail,
--   change_staff_password — 20260424_10_rpc_staff_crud.sql
--                           (update_staff_profile re-done in 20260428_34_staff_avatars.sql)
--   deactivate_staff       — 20260425_24_user_archive_cascade.sql
--   get_staff_team_membership — 20260425_26_rpc_staff_views.sql
--   list_unassigned_operators — 20260425_21_rpc_teams_members.sql

BEGIN;

-- ============================================================
-- DROP: change_staff_password
--   Legacy RPC wrote to dashboard_users.password_hash via pgcrypto.crypt().
--   After cutover, password_hash is unused (auth_login dropped in Stage 14).
--   Frontend now uses supabase.auth.resetPasswordForEmail instead.
-- ============================================================

DROP FUNCTION IF EXISTS public.change_staff_password(integer, integer, text);

-- ============================================================
-- 1. create_staff
--    Original signature: (p_caller_id integer, p_email text, p_password text,
--                         p_role text, p_first_name text, p_last_name text,
--                         p_alias text, p_permissions text[])
--    New signature:      (p_email text, p_password text, p_role text,
--                         p_first_name text, p_last_name text,
--                         p_alias text, p_permissions text[])
--    Permission gate:    create_users
-- ============================================================

DROP FUNCTION IF EXISTS public.create_staff(integer, text, text, text, text, text, text, text[]);

CREATE OR REPLACE FUNCTION public.create_staff(
  p_email       text,
  p_password    text,
  p_role        text,
  p_first_name  text,
  p_last_name   text,
  p_alias       text,
  p_permissions text[]
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_new_id    integer;
  v_ref_code  text;
  v_perm      text;
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

  v_ref_code := _next_ref_code(p_role, p_first_name, p_last_name);

  INSERT INTO dashboard_users (
    email, password_hash, role,
    first_name, last_name, alias, ref_code,
    created_by, permissions
  ) VALUES (
    p_email,
    crypt(p_password, gen_salt('bf')),
    p_role,
    p_first_name, p_last_name, p_alias, v_ref_code,
    v_caller_id,
    '{}'::jsonb
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

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_staff(text, text, text, text, text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_staff(text, text, text, text, text, text, text[]) TO authenticated;

-- ============================================================
-- 2. update_staff_profile
--    Original signature: (p_caller_id integer, p_user_id integer,
--                         p_first_name text, p_last_name text, p_alias text,
--                         p_email text, p_avatar_url text DEFAULT NULL,
--                         p_clear_avatar_url boolean DEFAULT false)
--    New signature:      (p_user_id integer, p_first_name text, p_last_name text,
--                         p_alias text, p_email text,
--                         p_avatar_url text DEFAULT NULL,
--                         p_clear_avatar_url boolean DEFAULT false)
--    Permission gate:    caller = p_user_id OR create_users
-- ============================================================

DROP FUNCTION IF EXISTS public.update_staff_profile(integer, integer, text, text, text, text, text, boolean);

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
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  IF NOT (v_caller_id = p_user_id OR has_permission(v_caller_id, 'create_users')) THEN
    RAISE EXCEPTION 'caller % cannot edit user %', v_caller_id, p_user_id USING errcode = '42501';
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
-- 3. deactivate_staff
--    Original signature: (p_caller_id integer, p_user_id integer)
--    New signature:      (p_user_id integer)
--    Permission gate:    caller = p_user_id OR caller is superadmin
-- ============================================================

DROP FUNCTION IF EXISTS public.deactivate_staff(integer, integer);

CREATE OR REPLACE FUNCTION public.deactivate_staff(
  p_user_id integer
) RETURNS void
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

  IF NOT (
    v_caller_id = p_user_id
    OR EXISTS (SELECT 1 FROM dashboard_users WHERE id = v_caller_id AND role = 'superadmin')
  ) THEN
    RAISE EXCEPTION 'only superadmin or self can deactivate' USING errcode = '42501';
  END IF;

  PERFORM apply_user_archived_side_effects(p_user_id, v_caller_id);
  UPDATE dashboard_users SET is_active = false WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_staff(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_staff(integer) TO authenticated;

-- ============================================================
-- 4. list_staff
--    Original signature: (p_caller_id integer)
--    New signature:      ()
--    Permission gate:    create_users
-- ============================================================

DROP FUNCTION IF EXISTS public.list_staff(integer);

CREATE OR REPLACE FUNCTION public.list_staff()
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
  has_pending_deletion boolean
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
    ) AS has_pending_deletion
  FROM dashboard_users u
  ORDER BY u.role, u.ref_code;
END;
$$;

REVOKE ALL ON FUNCTION public.list_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_staff() TO authenticated;

-- ============================================================
-- 5. get_staff_detail
--    Original signature: (p_caller_id integer, p_user_id integer)
--    New signature:      (p_user_id integer)
--    Permission gate:    caller = p_user_id OR create_users
-- ============================================================

DROP FUNCTION IF EXISTS public.get_staff_detail(integer, integer);

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
  has_pending_deletion boolean
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

  IF NOT (v_caller_id = p_user_id OR has_permission(v_caller_id, 'create_users')) THEN
    RAISE EXCEPTION 'caller % cannot view user %', v_caller_id, p_user_id USING errcode = '42501';
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
    ) AS has_pending_deletion
  FROM dashboard_users u
  WHERE u.id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_staff_detail(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_staff_detail(integer) TO authenticated;

-- ============================================================
-- 6. get_staff_team_membership
--    Original signature: (p_caller_id integer, p_staff_id integer)
--    New signature:      (p_staff_id integer)
--    Permission gate:    none (any authenticated user can view team membership)
-- ============================================================

DROP FUNCTION IF EXISTS public.get_staff_team_membership(integer, integer);

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
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
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

-- ============================================================
-- 7. list_unassigned_operators
--    Original signature: (p_caller_id integer, p_search text DEFAULT NULL)
--    New signature:      (p_search text DEFAULT NULL)
--    Permission gate:    manage_teams
-- ============================================================

DROP FUNCTION IF EXISTS public.list_unassigned_operators(integer, text);

CREATE OR REPLACE FUNCTION public.list_unassigned_operators(
  p_search text DEFAULT NULL
) RETURNS TABLE (
  id         integer,
  name       text,
  ref_code   text,
  alias      text,
  avatar_url text
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

  IF NOT has_permission(v_caller_id, 'manage_teams') THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', v_caller_id USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    COALESCE(
      NULLIF(trim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''),
      u.alias,
      u.email
    ) AS name,
    u.ref_code,
    u.alias,
    u.avatar_url
  FROM dashboard_users u
  WHERE u.role = 'operator'
    AND u.is_active = true
    AND NOT EXISTS (SELECT 1 FROM team_members tm WHERE tm.operator_id = u.id)
    AND (p_search IS NULL
         OR length(trim(p_search)) = 0
         OR lower(COALESCE(
              NULLIF(trim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''),
              u.alias,
              u.email
            )) LIKE '%' || lower(trim(p_search)) || '%'
         OR lower(COALESCE(u.alias, ''))    LIKE '%' || lower(trim(p_search)) || '%'
         OR lower(COALESCE(u.ref_code, '')) LIKE '%' || lower(trim(p_search)) || '%')
  ORDER BY lower(COALESCE(
             NULLIF(trim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''),
             u.alias,
             u.email))
  LIMIT 50;
END;
$$;

REVOKE ALL ON FUNCTION public.list_unassigned_operators(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_unassigned_operators(text) TO authenticated;

COMMIT;

-- VERIFY:
--   SELECT proname, pg_get_function_identity_arguments(oid)
--     FROM pg_proc
--     WHERE proname IN (
--       'create_staff','update_staff_profile','deactivate_staff',
--       'list_staff','get_staff_detail','get_staff_team_membership',
--       'list_unassigned_operators'
--     )
--     ORDER BY proname;
--   -- Expected: 7 rows, none with p_caller_id in their argument list.
--
--   -- Confirm change_staff_password is gone:
--   SELECT proname FROM pg_proc WHERE proname = 'change_staff_password';
--   -- Expected: 0 rows.
--
--   -- Confirm anon has no EXECUTE on the migrated functions:
--   SELECT has_function_privilege('anon', 'public.list_staff()', 'EXECUTE');
--   -- Expected: false
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.list_unassigned_operators(text);
--   DROP FUNCTION IF EXISTS public.get_staff_team_membership(integer);
--   DROP FUNCTION IF EXISTS public.get_staff_detail(integer);
--   DROP FUNCTION IF EXISTS public.list_staff();
--   DROP FUNCTION IF EXISTS public.deactivate_staff(integer);
--   DROP FUNCTION IF EXISTS public.update_staff_profile(integer, text, text, text, text, text, boolean);
--   DROP FUNCTION IF EXISTS public.create_staff(text, text, text, text, text, text, text[]);
--   -- Then restore originals from migrations 10, 21, 24, 26, 34.
--   -- Restore change_staff_password from migration 10.
