-- Migration 46: Stage 12 — Migrate dashboard counters / curatorship bucket to current_dashboard_user_id()
--
-- Migrated RPCs (5): drop p_caller_id from signature, derive via current_dashboard_user_id()
--   get_operator_curator, set_operator_curator, bulk_assign_curated_operators,
--   list_curated_operators, list_unassigned_operators
--
-- Audit columns (moderator_operators.assigned_by, staff_activity.actor_id) preserved
-- via v_caller_id. All migrated RPCs: REVOKE ALL FROM PUBLIC + GRANT EXECUTE TO authenticated.
-- Unauthorized RAISEs use errcode '28000'; permission-fail RAISEs use errcode '42501'.
--
-- Note: get_operator_curator was previously LANGUAGE sql with no permission gate
-- (anyone with EXECUTE could read). Converted to plpgsql so the auth gate runs
-- before the SELECT; readability invariant preserved (any authenticated user may
-- read; previous behaviour was strictly less restrictive).
--
-- Source migrations: 20260425_21_rpc_teams_members.sql (list_unassigned_operators),
--                    20260425_23_rpc_curatorship.sql (list_curated_operators,
--                                                     set_operator_curator,
--                                                     bulk_assign_curated_operators),
--                    20260425_26_rpc_staff_views.sql (get_operator_curator).

BEGIN;

-- ============================================================
-- 1. list_curated_operators
--    Original signature: (p_caller_id integer, p_moderator_id integer)
--    New signature:      (p_moderator_id integer)
--    Permission gate:    has_permission(manage_teams) AND (admin/superadmin OR caller is the moderator)
-- ============================================================

DROP FUNCTION IF EXISTS public.list_curated_operators(integer, integer);

CREATE OR REPLACE FUNCTION public.list_curated_operators(
  p_moderator_id integer
) RETURNS TABLE (
  operator_id integer,
  name        text,
  ref_code    text,
  alias       text,
  avatar_url  text,
  team_id     integer,
  team_name   text
)
LANGUAGE plpgsql
STABLE
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

  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = v_caller_id;

  IF NOT has_permission(v_caller_id, 'manage_teams') OR v_caller_role IS NULL THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', v_caller_id USING errcode = '42501';
  END IF;

  IF v_caller_role NOT IN ('superadmin','admin')
     AND v_caller_id IS DISTINCT FROM p_moderator_id THEN
    RAISE EXCEPTION 'caller % cannot view curated list of moderator %',
      v_caller_id, p_moderator_id USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id AS operator_id,
    COALESCE(
      NULLIF(trim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''),
      u.alias,
      u.email
    ) AS name,
    u.ref_code,
    u.alias,
    u.avatar_url,
    t.id   AS team_id,
    t.name AS team_name
  FROM moderator_operators mo
  JOIN dashboard_users u ON u.id = mo.operator_id
  LEFT JOIN team_members tm ON tm.operator_id = u.id
  LEFT JOIN teams        t  ON t.id = tm.team_id
  WHERE mo.moderator_id = p_moderator_id
  ORDER BY lower(COALESCE(
             NULLIF(trim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''),
             u.alias,
             u.email));
END $$;

REVOKE ALL ON FUNCTION public.list_curated_operators(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_curated_operators(integer) TO authenticated;

-- ============================================================
-- 2. set_operator_curator
--    Original signature: (p_caller_id integer, p_operator_id integer, p_new_moderator_id integer)
--    New signature:      (p_operator_id integer, p_new_moderator_id integer)
--    Permission gate:    admin/superadmin OR caller is current curator OR caller is the new moderator
--    Audit columns:      moderator_operators.assigned_by ← v_caller_id
--                        staff_activity.actor_id        ← v_caller_id
-- ============================================================

DROP FUNCTION IF EXISTS public.set_operator_curator(integer, integer, integer);

CREATE OR REPLACE FUNCTION public.set_operator_curator(
  p_operator_id      integer,
  p_new_moderator_id integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id   integer := current_dashboard_user_id();
  v_caller_role text;
  v_op_role     text;
  v_op_active   boolean;
  v_mod_role    text;
  v_mod_active  boolean;
  v_old_mod     integer;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = v_caller_id;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'caller % not found', v_caller_id USING errcode = '42501';
  END IF;

  IF p_new_moderator_id IS NULL THEN
    RAISE EXCEPTION 'new moderator is required (curator cannot be unset)';
  END IF;

  -- Validate operator.
  SELECT u.role, u.is_active INTO v_op_role, v_op_active
    FROM dashboard_users u WHERE u.id = p_operator_id;
  IF v_op_role IS NULL THEN
    RAISE EXCEPTION 'operator % not found', p_operator_id;
  END IF;
  IF v_op_role <> 'operator' OR v_op_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'user % is not an active operator', p_operator_id;
  END IF;

  -- Validate new moderator.
  SELECT u.role, u.is_active INTO v_mod_role, v_mod_active
    FROM dashboard_users u WHERE u.id = p_new_moderator_id;
  IF v_mod_role IS NULL THEN
    RAISE EXCEPTION 'moderator % not found', p_new_moderator_id;
  END IF;
  IF v_mod_role <> 'moderator' OR v_mod_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'user % is not an active moderator', p_new_moderator_id;
  END IF;

  -- Lock current curator row (if any) to serialise concurrent changes.
  SELECT mo.moderator_id INTO v_old_mod
    FROM moderator_operators mo
   WHERE mo.operator_id = p_operator_id
   FOR UPDATE;

  -- Permission gate: admin/superadmin OR current curator OR new moderator.
  IF v_caller_role NOT IN ('superadmin','admin')
     AND v_caller_id IS DISTINCT FROM v_old_mod
     AND v_caller_id IS DISTINCT FROM p_new_moderator_id THEN
    RAISE EXCEPTION 'caller % cannot change curator of operator %',
      v_caller_id, p_operator_id USING errcode = '42501';
  END IF;

  -- No-op if already assigned to the same moderator.
  IF v_old_mod IS NOT DISTINCT FROM p_new_moderator_id THEN
    RETURN;
  END IF;

  IF v_old_mod IS NOT NULL THEN
    DELETE FROM moderator_operators
     WHERE operator_id = p_operator_id;
  END IF;

  INSERT INTO moderator_operators (moderator_id, operator_id, assigned_by)
  VALUES (p_new_moderator_id, p_operator_id, v_caller_id);

  INSERT INTO staff_activity (user_id, actor_id, event_type, payload)
  VALUES (
    p_operator_id,
    v_caller_id,
    CASE WHEN v_old_mod IS NULL THEN 'curator_assigned' ELSE 'curator_changed' END,
    jsonb_build_object(
      'from_moderator_id', v_old_mod,
      'to_moderator_id',   p_new_moderator_id
    )
  );
END $$;

REVOKE ALL ON FUNCTION public.set_operator_curator(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_operator_curator(integer, integer) TO authenticated;

-- ============================================================
-- 3. bulk_assign_curated_operators
--    Original signature: (p_caller_id integer, p_moderator_id integer, p_operator_ids integer[])
--    New signature:      (p_moderator_id integer, p_operator_ids integer[])
--    Permission gate:    admin/superadmin OR caller IS the moderator being assigned to
--    Audit columns:      moderator_operators.assigned_by ← v_caller_id
--                        staff_activity.actor_id        ← v_caller_id
-- ============================================================

DROP FUNCTION IF EXISTS public.bulk_assign_curated_operators(integer, integer, integer[]);

CREATE OR REPLACE FUNCTION public.bulk_assign_curated_operators(
  p_moderator_id integer,
  p_operator_ids integer[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id   integer := current_dashboard_user_id();
  v_caller_role text;
  v_mod_role    text;
  v_mod_active  boolean;
  v_invalid_ids text;
  v_conflicts   text;
  v_op          integer;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = v_caller_id;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'caller % not found', v_caller_id USING errcode = '42501';
  END IF;

  IF p_operator_ids IS NULL OR array_length(p_operator_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'operator_ids must be a non-empty array';
  END IF;

  -- Permission gate: admin/superadmin OR caller IS the moderator being assigned to.
  IF v_caller_role NOT IN ('superadmin','admin')
     AND v_caller_id IS DISTINCT FROM p_moderator_id THEN
    RAISE EXCEPTION 'caller % cannot assign operators to moderator %',
      v_caller_id, p_moderator_id USING errcode = '42501';
  END IF;

  -- Validate moderator role.
  SELECT u.role, u.is_active INTO v_mod_role, v_mod_active
    FROM dashboard_users u WHERE u.id = p_moderator_id;
  IF v_mod_role IS NULL THEN
    RAISE EXCEPTION 'moderator % not found', p_moderator_id;
  END IF;
  IF v_mod_role <> 'moderator' OR v_mod_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'user % is not an active moderator', p_moderator_id;
  END IF;

  -- Validate each operator: exists, active, role=operator.
  SELECT string_agg(bad.id::text, ', ' ORDER BY bad.id)
    INTO v_invalid_ids
  FROM (
    SELECT x.oid AS id
    FROM unnest(p_operator_ids) AS x(oid)
    WHERE NOT EXISTS (
      SELECT 1 FROM dashboard_users u
       WHERE u.id = x.oid
         AND u.role = 'operator'
         AND u.is_active = true
    )
  ) AS bad;

  IF v_invalid_ids IS NOT NULL THEN
    RAISE EXCEPTION 'users not found or not active operators: %', v_invalid_ids;
  END IF;

  -- Fail-all atomic conflict check: any operator with a different curator.
  WITH conflicts AS (
    SELECT
      u.id,
      COALESCE(
        NULLIF(trim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''),
        u.alias,
        u.email
      ) AS name,
      mo.moderator_id AS current_mod,
      COALESCE(
        NULLIF(trim(COALESCE(m.first_name, '') || ' ' || COALESCE(m.last_name, '')), ''),
        m.alias,
        m.email
      ) AS current_mod_name
    FROM unnest(p_operator_ids) AS x(oid)
    JOIN dashboard_users u ON u.id = x.oid
    LEFT JOIN moderator_operators mo ON mo.operator_id = u.id
    LEFT JOIN dashboard_users m       ON m.id = mo.moderator_id
    WHERE mo.moderator_id IS NOT NULL
      AND mo.moderator_id <> p_moderator_id
  )
  SELECT string_agg(name || ' (куратор "' || current_mod_name || '")', ', '
                    ORDER BY name)
    INTO v_conflicts
  FROM conflicts;

  IF v_conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'У этих операторов уже есть куратор: %', v_conflicts;
  END IF;

  -- Insert per-operator; skip those already curated by this moderator.
  -- One staff_activity event per newly-assigned operator (clear per-operator timeline).
  FOREACH v_op IN ARRAY p_operator_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM moderator_operators mo
       WHERE mo.operator_id = v_op
         AND mo.moderator_id = p_moderator_id
    ) THEN
      INSERT INTO moderator_operators (moderator_id, operator_id, assigned_by)
      VALUES (p_moderator_id, v_op, v_caller_id);

      INSERT INTO staff_activity (user_id, actor_id, event_type, payload)
      VALUES (
        v_op,
        v_caller_id,
        'curator_assigned',
        jsonb_build_object(
          'from_moderator_id', NULL,
          'to_moderator_id',   p_moderator_id
        )
      );
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.bulk_assign_curated_operators(integer, integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_assign_curated_operators(integer, integer[]) TO authenticated;

-- ============================================================
-- 4. get_operator_curator
--    Original signature: (p_caller_id integer, p_operator_id integer)
--    New signature:      (p_operator_id integer)
--    Permission gate:    authenticated (any logged-in dashboard user)
--    Note:               original had no permission gate. This migration
--                        adds an unauthorized check (strictly tighter).
-- ============================================================

DROP FUNCTION IF EXISTS public.get_operator_curator(integer, integer);

CREATE OR REPLACE FUNCTION public.get_operator_curator(
  p_operator_id integer
) RETURNS TABLE (
  moderator_id       integer,
  moderator_name     text,
  moderator_alias    text,
  moderator_ref_code text,
  moderator_role     text
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
    m.id,
    COALESCE(NULLIF(trim(m.first_name || ' ' || m.last_name), ''), m.alias, m.email),
    m.alias,
    m.ref_code,
    m.role
  FROM moderator_operators mo
  JOIN dashboard_users m ON m.id = mo.moderator_id
  WHERE mo.operator_id = p_operator_id
  LIMIT 1;
END $$;

REVOKE ALL ON FUNCTION public.get_operator_curator(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_operator_curator(integer) TO authenticated;

-- ============================================================
-- 5. list_unassigned_operators
--    Original signature: (p_caller_id integer, p_search text DEFAULT NULL)
--    New signature:      (p_search text DEFAULT NULL)
--    Permission gate:    has_permission(manage_teams)
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
END $$;

REVOKE ALL ON FUNCTION public.list_unassigned_operators(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_unassigned_operators(text) TO authenticated;

COMMIT;

-- VERIFY:
--   SELECT proname, pg_get_function_identity_arguments(oid)
--     FROM pg_proc
--     WHERE proname IN (
--       'get_operator_curator','set_operator_curator','bulk_assign_curated_operators',
--       'list_curated_operators','list_unassigned_operators'
--     )
--     ORDER BY proname;
--   -- Expected: 5 rows, none with p_caller_id in their argument list.
--
--   -- Confirm anon has no EXECUTE on the migrated functions:
--   SELECT has_function_privilege('anon', 'public.list_unassigned_operators(text)', 'EXECUTE');
--   -- Expected: false
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.list_unassigned_operators(text);
--   DROP FUNCTION IF EXISTS public.get_operator_curator(integer);
--   DROP FUNCTION IF EXISTS public.bulk_assign_curated_operators(integer, integer[]);
--   DROP FUNCTION IF EXISTS public.set_operator_curator(integer, integer);
--   DROP FUNCTION IF EXISTS public.list_curated_operators(integer);
--   -- Then restore originals from migrations 21, 23, 26.
