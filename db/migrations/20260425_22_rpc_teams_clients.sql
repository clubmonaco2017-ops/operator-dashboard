-- Migration 22: Team clients RPC functions (Subplan 4 Stage 3)
--   assign_team_clients     — bulk-assign clients to a team (fail-all atomic)
--   unassign_team_client    — idempotent removal
--   move_team_client        — atomic move across two teams
--   list_unassigned_clients — clients not currently assigned to any team
--
-- Permissions:
--   * Mutating RPCs require has_permission('manage_teams') AND
--     (caller is admin/superadmin OR caller is team's lead_user_id;
--     for move — lead of BOTH teams).
--   * list_unassigned_clients only requires has_permission('manage_teams').
--
-- Audit event types:
--   clients_assigned, client_unassigned, client_moved.

BEGIN;

-- ---------------------------------------------------------------------------
-- assign_team_clients — батч-назначение клиентов на команду (fail-all atomic)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION assign_team_clients(
  p_caller_id  integer,
  p_team_id    integer,
  p_client_ids integer[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_role text;
  v_lead_user_id integer;
  v_team_active  boolean;
  v_conflicts    text;
  v_invalid_ids  text;
BEGIN
  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = p_caller_id;

  IF NOT has_permission(p_caller_id, 'manage_teams') OR v_caller_role IS NULL THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', p_caller_id;
  END IF;

  IF p_client_ids IS NULL OR array_length(p_client_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'client_ids must be a non-empty array';
  END IF;

  SELECT t.lead_user_id, t.is_active INTO v_lead_user_id, v_team_active
    FROM teams t WHERE t.id = p_team_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team % not found', p_team_id;
  END IF;

  IF v_team_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'team % is archived', p_team_id;
  END IF;

  IF v_caller_role NOT IN ('superadmin','admin')
     AND v_lead_user_id IS DISTINCT FROM p_caller_id THEN
    RAISE EXCEPTION 'caller % is not lead of team %', p_caller_id, p_team_id;
  END IF;

  -- Validate all client ids exist and are active.
  SELECT string_agg(missing.id::text, ', ' ORDER BY missing.id)
    INTO v_invalid_ids
  FROM (
    SELECT u.cid AS id
    FROM unnest(p_client_ids) AS u(cid)
    WHERE NOT EXISTS (
      SELECT 1 FROM clients c
       WHERE c.id = u.cid AND c.is_active = true
    )
  ) AS missing;

  IF v_invalid_ids IS NOT NULL THEN
    RAISE EXCEPTION 'clients not found or archived: %', v_invalid_ids;
  END IF;

  -- Fail-all atomic conflict check with friendly user-facing message.
  WITH conflicts AS (
    SELECT c.name AS client_name, t.name AS team_name
      FROM team_clients tc
      JOIN clients c ON c.id = tc.client_id
      JOIN teams   t ON t.id = tc.team_id
     WHERE tc.client_id = ANY(p_client_ids)
  )
  SELECT string_agg(client_name || ' (в "' || team_name || '")', ', '
                    ORDER BY client_name)
    INTO v_conflicts
  FROM conflicts;

  IF v_conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'Клиенты уже назначены: %', v_conflicts;
  END IF;

  INSERT INTO team_clients (team_id, client_id, assigned_by)
  SELECT p_team_id, u.cid, p_caller_id
    FROM unnest(p_client_ids) AS u(cid);

  INSERT INTO team_activity (team_id, actor_id, event_type, payload)
  VALUES (
    p_team_id, p_caller_id, 'clients_assigned',
    jsonb_build_object('client_ids', to_jsonb(p_client_ids))
  );
END $$;

GRANT EXECUTE ON FUNCTION assign_team_clients(integer, integer, integer[])
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- unassign_team_client — снять клиента с команды (idempotent)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION unassign_team_client(
  p_caller_id integer,
  p_team_id   integer,
  p_client_id integer
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
    DELETE FROM team_clients
     WHERE team_id = p_team_id AND client_id = p_client_id
    RETURNING 1
  )
  SELECT count(*)::int INTO v_deleted FROM del;

  IF v_deleted > 0 THEN
    INSERT INTO team_activity (team_id, actor_id, event_type, payload)
    VALUES (
      p_team_id, p_caller_id, 'client_unassigned',
      jsonb_build_object('client_id', p_client_id)
    );
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION unassign_team_client(integer, integer, integer)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- move_team_client — атомарное перемещение клиента между командами
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION move_team_client(
  p_caller_id integer,
  p_from_team integer,
  p_to_team   integer,
  p_client_id integer
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
    RAISE EXCEPTION 'caller % must lead both teams to move clients', p_caller_id;
  END IF;

  IF v_to_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'team % is archived', p_to_team;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM team_clients
     WHERE team_id = p_from_team AND client_id = p_client_id
  ) THEN
    RAISE EXCEPTION 'client % not in team %', p_client_id, p_from_team;
  END IF;

  DELETE FROM team_clients
   WHERE team_id = p_from_team AND client_id = p_client_id;

  INSERT INTO team_clients (team_id, client_id, assigned_by)
  VALUES (p_to_team, p_client_id, p_caller_id);

  INSERT INTO team_activity (team_id, actor_id, event_type, payload)
  VALUES
    (p_from_team, p_caller_id, 'client_moved',
       jsonb_build_object(
         'client_id', p_client_id,
         'from_team', p_from_team,
         'to_team',   p_to_team)),
    (p_to_team,   p_caller_id, 'client_moved',
       jsonb_build_object(
         'client_id', p_client_id,
         'from_team', p_from_team,
         'to_team',   p_to_team));
END $$;

GRANT EXECUTE ON FUNCTION move_team_client(integer, integer, integer, integer)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- list_unassigned_clients — клиенты без команды (для assign/move modals)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION list_unassigned_clients(
  p_caller_id integer,
  p_search    text DEFAULT NULL
) RETURNS TABLE (
  id            integer,
  name          text,
  alias         text,
  avatar_url    text,
  platform_name text,
  agency_name   text
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
    c.id,
    c.name,
    c.alias,
    c.avatar_url,
    p.name AS platform_name,
    a.name AS agency_name
  FROM clients c
  LEFT JOIN platforms p ON p.id = c.platform_id
  LEFT JOIN agencies  a ON a.id = c.agency_id
  WHERE c.is_active = true
    AND NOT EXISTS (SELECT 1 FROM team_clients tc WHERE tc.client_id = c.id)
    AND (p_search IS NULL
         OR length(trim(p_search)) = 0
         OR lower(c.name)                LIKE '%' || lower(trim(p_search)) || '%'
         OR lower(COALESCE(c.alias, '')) LIKE '%' || lower(trim(p_search)) || '%')
  ORDER BY lower(c.name)
  LIMIT 50;
END $$;

GRANT EXECUTE ON FUNCTION list_unassigned_clients(integer, text)
  TO anon, authenticated;

COMMIT;

-- VERIFY:
--   SELECT routine_name FROM information_schema.routines
--     WHERE routine_schema='public'
--       AND routine_name IN ('assign_team_clients','unassign_team_client',
--                            'move_team_client','list_unassigned_clients')
--     ORDER BY routine_name;
--   -- Expected: 4 rows.
--
-- ROLLBACK:
--   DROP FUNCTION list_unassigned_clients(integer, text);
--   DROP FUNCTION move_team_client(integer, integer, integer, integer);
--   DROP FUNCTION unassign_team_client(integer, integer, integer);
--   DROP FUNCTION assign_team_clients(integer, integer, integer[]);
