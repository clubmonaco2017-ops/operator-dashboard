-- Subplan 4 — post-review fixes: read-only RPCs over RLS-protected tables.
-- The tables team_members, teams, moderator_operators have RLS enabled but no
-- policies (project convention). Direct supabase.from(...) reads from the
-- frontend (anon-key) silently return empty results. Wrap the four reads we
-- still do client-side in SECURITY DEFINER RPCs.

-- 1. get_user_team_membership: returns true if user is in any team_members row.
--    Used by Sidebar visibility for operator role.
CREATE OR REPLACE FUNCTION get_user_team_membership(p_user_id integer)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (SELECT 1 FROM team_members WHERE operator_id = p_user_id);
$$;

GRANT EXECUTE ON FUNCTION get_user_team_membership(integer) TO anon, authenticated;

-- 2. get_staff_team_membership: returns the team an operator is in (or null if none).
--    Used by Staff card TeamMembershipBlock (any caller can view any staff card).
CREATE OR REPLACE FUNCTION get_staff_team_membership(p_caller_id integer, p_staff_id integer)
RETURNS TABLE (
  team_id integer,
  team_name text,
  lead_user_id integer,
  lead_name text,
  lead_role text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION get_staff_team_membership(integer, integer) TO anon, authenticated;

-- 3. get_operator_curator: returns the curator for an operator (or null).
--    Used by Staff card CuratorBlock.
CREATE OR REPLACE FUNCTION get_operator_curator(p_caller_id integer, p_operator_id integer)
RETURNS TABLE (
  moderator_id integer,
  moderator_name text,
  moderator_alias text,
  moderator_ref_code text,
  moderator_role text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION get_operator_curator(integer, integer) TO anon, authenticated;

-- 4. list_active_teams_for_assignment: returns active teams (id, name) for assignment modals.
--    Used by ChangeTeamModal. Filters by manage_teams permission of caller.
CREATE OR REPLACE FUNCTION list_active_teams_for_assignment(p_caller_id integer)
RETURNS TABLE (id integer, name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT has_permission(p_caller_id, 'manage_teams') THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', p_caller_id;
  END IF;
  RETURN QUERY
    SELECT t.id, t.name FROM teams t WHERE t.is_active = true ORDER BY t.name;
END $$;

GRANT EXECUTE ON FUNCTION list_active_teams_for_assignment(integer) TO anon, authenticated;

-- ROLLBACK
-- DROP FUNCTION IF EXISTS list_active_teams_for_assignment(integer);
-- DROP FUNCTION IF EXISTS get_operator_curator(integer, integer);
-- DROP FUNCTION IF EXISTS get_staff_team_membership(integer, integer);
-- DROP FUNCTION IF EXISTS get_user_team_membership(integer);
