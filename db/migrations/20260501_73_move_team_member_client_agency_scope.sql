-- Migration 73: move_team_member / move_team_client — agency scoping (P0 fix from review)
--
-- Изначально оставлены untouched в multi-agency rollout — review нашёл
-- cross-agency leak: admin agency A мог переместить оператора/клиента
-- в team agency B без проверок. Добавляем:
--   - assert_agency_access(caller, from_team.agency)
--   - assert_agency_access(caller, to_team.agency)
--   - T.4 invariant: from_team.agency = to_team.agency = subject.agency

CREATE OR REPLACE FUNCTION public.move_team_member(
  p_from_team   integer,
  p_to_team     integer,
  p_operator_id integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id    integer := current_dashboard_user_id();
  v_caller_role  text;
  v_from_lead    integer;
  v_to_lead      integer;
  v_from_active  boolean;
  v_to_active    boolean;
  v_from_agency  uuid;
  v_to_agency    uuid;
  v_op_agency    uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = v_caller_id AND u.is_active = true;

  IF NOT has_permission(v_caller_id, 'manage_teams') OR v_caller_role IS NULL THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', v_caller_id USING errcode = '42501';
  END IF;

  IF p_from_team = p_to_team THEN
    RAISE EXCEPTION 'from_team and to_team must differ';
  END IF;

  IF p_from_team < p_to_team THEN
    SELECT t.lead_user_id, t.is_active, t.agency_id INTO v_from_lead, v_from_active, v_from_agency
      FROM teams t WHERE t.id = p_from_team FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'team % not found', p_from_team USING errcode = 'P0002'; END IF;
    SELECT t.lead_user_id, t.is_active, t.agency_id INTO v_to_lead, v_to_active, v_to_agency
      FROM teams t WHERE t.id = p_to_team FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'team % not found', p_to_team USING errcode = 'P0002'; END IF;
  ELSE
    SELECT t.lead_user_id, t.is_active, t.agency_id INTO v_to_lead, v_to_active, v_to_agency
      FROM teams t WHERE t.id = p_to_team FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'team % not found', p_to_team USING errcode = 'P0002'; END IF;
    SELECT t.lead_user_id, t.is_active, t.agency_id INTO v_from_lead, v_from_active, v_from_agency
      FROM teams t WHERE t.id = p_from_team FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'team % not found', p_from_team USING errcode = 'P0002'; END IF;
  END IF;

  -- Defense in depth: caller must have access to BOTH agencies (resolves to same agency below)
  PERFORM assert_agency_access(v_caller_id, v_from_agency);
  PERFORM assert_agency_access(v_caller_id, v_to_agency);

  IF v_caller_role NOT IN ('superadmin','admin')
     AND (v_from_lead IS DISTINCT FROM v_caller_id
          OR v_to_lead IS DISTINCT FROM v_caller_id) THEN
    RAISE EXCEPTION 'caller % must lead both teams to move members', v_caller_id USING errcode = '42501';
  END IF;

  IF v_to_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'team % is archived', p_to_team;
  END IF;

  -- T.4 invariant: same agency for both teams + operator
  IF v_from_agency IS DISTINCT FROM v_to_agency THEN
    RAISE EXCEPTION 'cannot move between agencies (% vs %)', v_from_agency, v_to_agency USING errcode = '23514';
  END IF;

  SELECT u.agency_id INTO v_op_agency FROM dashboard_users u WHERE u.id = p_operator_id;
  IF v_op_agency IS NULL THEN
    RAISE EXCEPTION 'operator % has no agency', p_operator_id USING errcode = '23503';
  END IF;
  IF v_op_agency IS DISTINCT FROM v_to_agency THEN
    RAISE EXCEPTION 'operator % (agency %) does not belong to target team agency %', p_operator_id, v_op_agency, v_to_agency USING errcode = '23514';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM team_members WHERE team_id = p_from_team AND operator_id = p_operator_id) THEN
    RAISE EXCEPTION 'operator % not in team %', p_operator_id, p_from_team;
  END IF;

  DELETE FROM team_members WHERE team_id = p_from_team AND operator_id = p_operator_id;
  INSERT INTO team_members (team_id, operator_id, added_by) VALUES (p_to_team, p_operator_id, v_caller_id);

  INSERT INTO team_activity (team_id, actor_id, event_type, payload)
  VALUES
    (p_from_team, v_caller_id, 'member_moved',
       jsonb_build_object('operator_id', p_operator_id, 'from_team', p_from_team, 'to_team', p_to_team)),
    (p_to_team,   v_caller_id, 'member_moved',
       jsonb_build_object('operator_id', p_operator_id, 'from_team', p_from_team, 'to_team', p_to_team));
END $$;

REVOKE ALL ON FUNCTION public.move_team_member(integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_team_member(integer, integer, integer) TO authenticated;

-- ============================================================

CREATE OR REPLACE FUNCTION public.move_team_client(
  p_from_team integer,
  p_to_team   integer,
  p_client_id integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id     integer := current_dashboard_user_id();
  v_caller_role   text;
  v_from_lead     integer;
  v_to_lead       integer;
  v_from_active   boolean;
  v_to_active     boolean;
  v_from_agency   uuid;
  v_to_agency     uuid;
  v_client_agency uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = v_caller_id AND u.is_active = true;

  IF NOT has_permission(v_caller_id, 'manage_teams') OR v_caller_role IS NULL THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', v_caller_id USING errcode = '42501';
  END IF;

  IF p_from_team = p_to_team THEN
    RAISE EXCEPTION 'from_team and to_team must differ';
  END IF;

  IF p_from_team < p_to_team THEN
    SELECT t.lead_user_id, t.is_active, t.agency_id INTO v_from_lead, v_from_active, v_from_agency
      FROM teams t WHERE t.id = p_from_team FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'team % not found', p_from_team USING errcode = 'P0002'; END IF;
    SELECT t.lead_user_id, t.is_active, t.agency_id INTO v_to_lead, v_to_active, v_to_agency
      FROM teams t WHERE t.id = p_to_team FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'team % not found', p_to_team USING errcode = 'P0002'; END IF;
  ELSE
    SELECT t.lead_user_id, t.is_active, t.agency_id INTO v_to_lead, v_to_active, v_to_agency
      FROM teams t WHERE t.id = p_to_team FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'team % not found', p_to_team USING errcode = 'P0002'; END IF;
    SELECT t.lead_user_id, t.is_active, t.agency_id INTO v_from_lead, v_from_active, v_from_agency
      FROM teams t WHERE t.id = p_from_team FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'team % not found', p_from_team USING errcode = 'P0002'; END IF;
  END IF;

  PERFORM assert_agency_access(v_caller_id, v_from_agency);
  PERFORM assert_agency_access(v_caller_id, v_to_agency);

  IF v_caller_role NOT IN ('superadmin','admin')
     AND (v_from_lead IS DISTINCT FROM v_caller_id
          OR v_to_lead IS DISTINCT FROM v_caller_id) THEN
    RAISE EXCEPTION 'caller % must lead both teams to move clients', v_caller_id USING errcode = '42501';
  END IF;

  IF v_to_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'team % is archived', p_to_team;
  END IF;

  IF v_from_agency IS DISTINCT FROM v_to_agency THEN
    RAISE EXCEPTION 'cannot move between agencies (% vs %)', v_from_agency, v_to_agency USING errcode = '23514';
  END IF;

  SELECT c.agency_id INTO v_client_agency FROM clients c WHERE c.id = p_client_id;
  IF v_client_agency IS NULL THEN
    RAISE EXCEPTION 'client % not found', p_client_id USING errcode = 'P0002';
  END IF;
  IF v_client_agency IS DISTINCT FROM v_to_agency THEN
    RAISE EXCEPTION 'client % (agency %) does not belong to target team agency %', p_client_id, v_client_agency, v_to_agency USING errcode = '23514';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM team_clients WHERE team_id = p_from_team AND client_id = p_client_id) THEN
    RAISE EXCEPTION 'client % not in team %', p_client_id, p_from_team;
  END IF;

  DELETE FROM team_clients WHERE team_id = p_from_team AND client_id = p_client_id;
  INSERT INTO team_clients (team_id, client_id, assigned_by) VALUES (p_to_team, p_client_id, v_caller_id);

  INSERT INTO team_activity (team_id, actor_id, event_type, payload)
  VALUES
    (p_from_team, v_caller_id, 'client_moved',
       jsonb_build_object('client_id', p_client_id, 'from_team', p_from_team, 'to_team', p_to_team)),
    (p_to_team,   v_caller_id, 'client_moved',
       jsonb_build_object('client_id', p_client_id, 'from_team', p_from_team, 'to_team', p_to_team));
END $$;

REVOKE ALL ON FUNCTION public.move_team_client(integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_team_client(integer, integer, integer) TO authenticated;
