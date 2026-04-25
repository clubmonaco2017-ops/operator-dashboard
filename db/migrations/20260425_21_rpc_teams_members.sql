-- Migration 21: Team members RPC functions (Subplan 4 Stage 3)
--   add_team_member            — add an operator to a team (with conflict deep-link)
--   remove_team_member         — idempotent removal
--   move_team_member           — atomic move across two teams
--   list_unassigned_operators  — operators not currently in any team (modal source)
--
-- Permissions:
--   * Mutating RPCs (add / remove / move) require has_permission('manage_teams')
--     AND (caller is admin/superadmin OR caller is the team's lead_user_id;
--     for move — lead of BOTH teams).
--   * list_unassigned_operators only requires has_permission('manage_teams').
--
-- Audit event types (open vocabulary):
--   member_added, member_removed, member_moved.

BEGIN;

-- ---------------------------------------------------------------------------
-- add_team_member — добавить оператора в команду
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION add_team_member(
  p_caller_id  integer,
  p_team_id    integer,
  p_operator_id integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_role         text;
  v_lead_user_id        integer;
  v_op_role             text;
  v_op_active           boolean;
  v_existing_team_id    integer;
  v_existing_team_name  text;
BEGIN
  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = p_caller_id;

  IF NOT has_permission(p_caller_id, 'manage_teams') OR v_caller_role IS NULL THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', p_caller_id;
  END IF;

  -- Lock target team for the duration of the transaction.
  SELECT t.lead_user_id INTO v_lead_user_id
    FROM teams t WHERE t.id = p_team_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team % not found', p_team_id;
  END IF;

  IF v_caller_role NOT IN ('superadmin','admin')
     AND v_lead_user_id IS DISTINCT FROM p_caller_id THEN
    RAISE EXCEPTION 'caller % is not lead of team %', p_caller_id, p_team_id;
  END IF;

  -- Validate operator: exists, active, role=operator.
  SELECT u.role, u.is_active INTO v_op_role, v_op_active
    FROM dashboard_users u WHERE u.id = p_operator_id;

  IF v_op_role IS NULL THEN
    RAISE EXCEPTION 'user % not found', p_operator_id;
  END IF;

  IF v_op_role <> 'operator' OR v_op_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'user % is not an active operator', p_operator_id;
  END IF;

  -- Conflict check with deep-link details.
  SELECT t.id, t.name INTO v_existing_team_id, v_existing_team_name
    FROM team_members tm
    JOIN teams t ON t.id = tm.team_id
    WHERE tm.operator_id = p_operator_id;

  IF FOUND THEN
    RAISE EXCEPTION 'Оператор уже в команде "%"', v_existing_team_name
      USING DETAIL = v_existing_team_id::text;
  END IF;

  INSERT INTO team_members (team_id, operator_id, added_by)
  VALUES (p_team_id, p_operator_id, p_caller_id);

  INSERT INTO team_activity (team_id, actor_id, event_type, payload)
  VALUES (
    p_team_id, p_caller_id, 'member_added',
    jsonb_build_object('operator_id', p_operator_id)
  );
END $$;

GRANT EXECUTE ON FUNCTION add_team_member(integer, integer, integer)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- remove_team_member — удалить оператора из команды (idempotent)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION remove_team_member(
  p_caller_id   integer,
  p_team_id     integer,
  p_operator_id integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_role  text;
  v_lead_user_id integer;
  v_deleted      integer;
BEGIN
  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = p_caller_id;

  IF NOT has_permission(p_caller_id, 'manage_teams') OR v_caller_role IS NULL THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', p_caller_id;
  END IF;

  SELECT t.lead_user_id INTO v_lead_user_id
    FROM teams t WHERE t.id = p_team_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team % not found', p_team_id;
  END IF;

  IF v_caller_role NOT IN ('superadmin','admin')
     AND v_lead_user_id IS DISTINCT FROM p_caller_id THEN
    RAISE EXCEPTION 'caller % is not lead of team %', p_caller_id, p_team_id;
  END IF;

  WITH del AS (
    DELETE FROM team_members
     WHERE team_id = p_team_id AND operator_id = p_operator_id
    RETURNING 1
  )
  SELECT count(*)::int INTO v_deleted FROM del;

  -- Idempotent: silent success when row was already absent.
  IF v_deleted > 0 THEN
    INSERT INTO team_activity (team_id, actor_id, event_type, payload)
    VALUES (
      p_team_id, p_caller_id, 'member_removed',
      jsonb_build_object('operator_id', p_operator_id)
    );
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION remove_team_member(integer, integer, integer)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- move_team_member — атомарное перемещение между командами
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION move_team_member(
  p_caller_id   integer,
  p_from_team   integer,
  p_to_team     integer,
  p_operator_id integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_role text;
  v_from_lead   integer;
  v_to_lead     integer;
  v_from_active boolean;
  v_to_active   boolean;
BEGIN
  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = p_caller_id;

  IF NOT has_permission(p_caller_id, 'manage_teams') OR v_caller_role IS NULL THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', p_caller_id;
  END IF;

  IF p_from_team = p_to_team THEN
    RAISE EXCEPTION 'from_team and to_team must differ';
  END IF;

  -- Lock both team rows. Order by id to avoid deadlocks across concurrent moves.
  IF p_from_team < p_to_team THEN
    SELECT t.lead_user_id, t.is_active INTO v_from_lead, v_from_active
      FROM teams t WHERE t.id = p_from_team FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'team % not found', p_from_team;
    END IF;
    SELECT t.lead_user_id, t.is_active INTO v_to_lead, v_to_active
      FROM teams t WHERE t.id = p_to_team FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'team % not found', p_to_team;
    END IF;
  ELSE
    SELECT t.lead_user_id, t.is_active INTO v_to_lead, v_to_active
      FROM teams t WHERE t.id = p_to_team FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'team % not found', p_to_team;
    END IF;
    SELECT t.lead_user_id, t.is_active INTO v_from_lead, v_from_active
      FROM teams t WHERE t.id = p_from_team FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'team % not found', p_from_team;
    END IF;
  END IF;

  IF v_caller_role NOT IN ('superadmin','admin')
     AND (v_from_lead IS DISTINCT FROM p_caller_id
          OR v_to_lead IS DISTINCT FROM p_caller_id) THEN
    RAISE EXCEPTION 'caller % must lead both teams to move members', p_caller_id;
  END IF;

  IF v_to_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'team % is archived', p_to_team;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM team_members
     WHERE team_id = p_from_team AND operator_id = p_operator_id
  ) THEN
    RAISE EXCEPTION 'operator % not in team %', p_operator_id, p_from_team;
  END IF;

  DELETE FROM team_members
   WHERE team_id = p_from_team AND operator_id = p_operator_id;

  INSERT INTO team_members (team_id, operator_id, added_by)
  VALUES (p_to_team, p_operator_id, p_caller_id);

  -- Two audit rows for clarity: one per team with shared payload.
  INSERT INTO team_activity (team_id, actor_id, event_type, payload)
  VALUES
    (p_from_team, p_caller_id, 'member_moved',
       jsonb_build_object(
         'operator_id', p_operator_id,
         'from_team',   p_from_team,
         'to_team',     p_to_team)),
    (p_to_team,   p_caller_id, 'member_moved',
       jsonb_build_object(
         'operator_id', p_operator_id,
         'from_team',   p_from_team,
         'to_team',     p_to_team));
END $$;

GRANT EXECUTE ON FUNCTION move_team_member(integer, integer, integer, integer)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- list_unassigned_operators — операторы без команды (для add/move modals)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION list_unassigned_operators(
  p_caller_id integer,
  p_search    text DEFAULT NULL
) RETURNS TABLE (
  id         integer,
  name       text,
  ref_code   text,
  alias      text,
  avatar_url text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT has_permission(p_caller_id, 'manage_teams') THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', p_caller_id;
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

GRANT EXECUTE ON FUNCTION list_unassigned_operators(integer, text)
  TO anon, authenticated;

COMMIT;

-- VERIFY:
--   SELECT routine_name FROM information_schema.routines
--     WHERE routine_schema='public'
--       AND routine_name IN ('add_team_member','remove_team_member',
--                            'move_team_member','list_unassigned_operators')
--     ORDER BY routine_name;
--   -- Expected: 4 rows.
--
-- ROLLBACK:
--   DROP FUNCTION list_unassigned_operators(integer, text);
--   DROP FUNCTION move_team_member(integer, integer, integer, integer);
--   DROP FUNCTION remove_team_member(integer, integer, integer);
--   DROP FUNCTION add_team_member(integer, integer, integer);
