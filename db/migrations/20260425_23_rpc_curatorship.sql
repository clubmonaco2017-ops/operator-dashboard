-- Migration 23: Curatorship RPC functions (Subplan 4 Stage 3)
--   list_curated_operators       — operators currently curated by a moderator
--   set_operator_curator         — atomic replace; new curator is required (no NULL)
--   bulk_assign_curated_operators — fail-all atomic batch assignment
--
-- Domain: moderator_operators is orthogonal to teams (см. domain-model §3).
-- I: один оператор имеет одного куратора-модератора (UNIQUE operator_id).
--
-- Permissions:
--   * list_curated_operators: has_permission('manage_teams') AND
--     (admin/superadmin OR caller is the moderator being viewed).
--   * set_operator_curator:   admin/superadmin OR caller is current curator
--                             OR caller is the new moderator.
--   * bulk_assign_curated_operators: admin/superadmin OR caller is the moderator.
--
-- Audit (staff_activity, open vocabulary):
--   curator_assigned (was NULL → moderator),
--   curator_changed  (moderator → moderator).

BEGIN;

-- ---------------------------------------------------------------------------
-- list_curated_operators — операторы, курируемые модератором
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION list_curated_operators(
  p_caller_id    integer,
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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_role text;
BEGIN
  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = p_caller_id;

  IF NOT has_permission(p_caller_id, 'manage_teams') OR v_caller_role IS NULL THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', p_caller_id;
  END IF;

  IF v_caller_role NOT IN ('superadmin','admin')
     AND p_caller_id IS DISTINCT FROM p_moderator_id THEN
    RAISE EXCEPTION 'caller % cannot view curated list of moderator %',
      p_caller_id, p_moderator_id;
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

GRANT EXECUTE ON FUNCTION list_curated_operators(integer, integer)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- set_operator_curator — назначить/сменить куратора (новый куратор обязателен)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_operator_curator(
  p_caller_id        integer,
  p_operator_id      integer,
  p_new_moderator_id integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_role text;
  v_op_role     text;
  v_op_active   boolean;
  v_mod_role    text;
  v_mod_active  boolean;
  v_old_mod     integer;
BEGIN
  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = p_caller_id;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'caller % not found', p_caller_id;
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
     AND p_caller_id IS DISTINCT FROM v_old_mod
     AND p_caller_id IS DISTINCT FROM p_new_moderator_id THEN
    RAISE EXCEPTION 'caller % cannot change curator of operator %',
      p_caller_id, p_operator_id;
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
  VALUES (p_new_moderator_id, p_operator_id, p_caller_id);

  INSERT INTO staff_activity (user_id, actor_id, event_type, payload)
  VALUES (
    p_operator_id,
    p_caller_id,
    CASE WHEN v_old_mod IS NULL THEN 'curator_assigned' ELSE 'curator_changed' END,
    jsonb_build_object(
      'from_moderator_id', v_old_mod,
      'to_moderator_id',   p_new_moderator_id
    )
  );
END $$;

GRANT EXECUTE ON FUNCTION set_operator_curator(integer, integer, integer)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- bulk_assign_curated_operators — батч-назначение операторов модератору
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bulk_assign_curated_operators(
  p_caller_id    integer,
  p_moderator_id integer,
  p_operator_ids integer[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_role text;
  v_mod_role    text;
  v_mod_active  boolean;
  v_invalid_ids text;
  v_conflicts   text;
  v_op          integer;
BEGIN
  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = p_caller_id;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'caller % not found', p_caller_id;
  END IF;

  IF p_operator_ids IS NULL OR array_length(p_operator_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'operator_ids must be a non-empty array';
  END IF;

  -- Permission gate: admin/superadmin OR caller IS the moderator being assigned to.
  IF v_caller_role NOT IN ('superadmin','admin')
     AND p_caller_id IS DISTINCT FROM p_moderator_id THEN
    RAISE EXCEPTION 'caller % cannot assign operators to moderator %',
      p_caller_id, p_moderator_id;
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
      VALUES (p_moderator_id, v_op, p_caller_id);

      INSERT INTO staff_activity (user_id, actor_id, event_type, payload)
      VALUES (
        v_op,
        p_caller_id,
        'curator_assigned',
        jsonb_build_object(
          'from_moderator_id', NULL,
          'to_moderator_id',   p_moderator_id
        )
      );
    END IF;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION bulk_assign_curated_operators(integer, integer, integer[])
  TO anon, authenticated;

COMMIT;

-- VERIFY:
--   SELECT routine_name FROM information_schema.routines
--     WHERE routine_schema='public'
--       AND routine_name IN ('list_curated_operators',
--                            'set_operator_curator',
--                            'bulk_assign_curated_operators')
--     ORDER BY routine_name;
--   -- Expected: 3 rows.
--
-- ROLLBACK:
--   DROP FUNCTION bulk_assign_curated_operators(integer, integer, integer[]);
--   DROP FUNCTION set_operator_curator(integer, integer, integer);
--   DROP FUNCTION list_curated_operators(integer, integer);
