-- Migration 62: Stage 7 — Scope teams / members / clients / curatorship to agency context
--
-- All scoped RPCs now require/respect p_agency_id:
--   - Mutating: assert_agency_access(caller, agency_id) + T.4 same-agency invariants
--     (admin/superadmin participants exempt — they have agency_id IS NULL)
--   - Combined-view (list_*): when p_agency_id IS NULL, filter by accessible_agencies(caller)
--
-- BREAKING:
--   - create_team gains required p_agency_id parameter
--   - list_teams gains optional p_agency_id parameter (defaults NULL = combined view)
--   - list_active_teams_for_assignment gains optional p_agency_id
--   - list_assignable_users gains optional p_agency_id
--   - list_unassigned_operators gains optional p_agency_id
--   - list_curated_operators gains optional p_agency_id (filter own curated set)
--
-- Untouched in this stage (kept role-scoped only):
--   get_team_detail, list_team_activity, move_team_member, unassign_team_client,
--   move_team_client, get_operator_curator. These visibility checks already use
--   role/membership and would gain little from agency scoping; we leave them.
--
-- See plan: docs/superpowers/plans/2026-04-29-multi-agency-scoping.md (Stage 7).

BEGIN;

-- ============================================================
-- 1. create_team — T.2 + T.4 (lead must be in same agency, or admin/superadmin)
-- ============================================================

DROP FUNCTION IF EXISTS public.create_team(text, integer);

CREATE OR REPLACE FUNCTION public.create_team(
  p_name         text,
  p_lead_user_id integer,
  p_agency_id    uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id   integer := current_dashboard_user_id();
  v_caller_role text;
  v_lead_role   text;
  v_lead_active boolean;
  v_lead_agency uuid;
  v_new_id      integer;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = v_caller_id;

  IF NOT has_permission(v_caller_id, 'manage_teams')
     OR v_caller_role IS NULL
     OR v_caller_role NOT IN ('superadmin','admin') THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', v_caller_id
      USING errcode = '42501';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name is required';
  END IF;
  IF p_lead_user_id IS NULL THEN
    RAISE EXCEPTION 'lead_user_id is required';
  END IF;
  IF p_agency_id IS NULL THEN
    RAISE EXCEPTION 'agency_id is required';
  END IF;

  PERFORM assert_agency_access(v_caller_id, p_agency_id);

  SELECT u.role, u.is_active, u.agency_id
    INTO v_lead_role, v_lead_active, v_lead_agency
    FROM dashboard_users u WHERE u.id = p_lead_user_id;

  IF v_lead_role IS NULL
     OR v_lead_active IS DISTINCT FROM true
     OR v_lead_role NOT IN ('teamlead','moderator') THEN
    RAISE EXCEPTION 'Лидом может быть только тимлид или модератор';
  END IF;

  -- T.4 cross-agency invariant: lead's agency must equal team agency.
  -- (teamlead/moderator always have agency_id NOT NULL by CHECK constraint.)
  IF v_lead_agency IS DISTINCT FROM p_agency_id THEN
    RAISE EXCEPTION 'lead user % (agency %) and team agency % differ',
      p_lead_user_id, v_lead_agency, p_agency_id USING errcode = '23514';
  END IF;

  INSERT INTO teams (name, lead_user_id, is_active, created_by, agency_id)
  VALUES (trim(p_name), p_lead_user_id, true, v_caller_id, p_agency_id)
  RETURNING id INTO v_new_id;

  INSERT INTO team_activity (team_id, actor_id, event_type, payload)
  VALUES (
    v_new_id, v_caller_id, 'team_created',
    jsonb_build_object('name', trim(p_name), 'lead_user_id', p_lead_user_id, 'agency_id', p_agency_id)
  );

  RETURN v_new_id;
END $$;

REVOKE ALL ON FUNCTION public.create_team(text, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_team(text, integer, uuid) TO authenticated;

-- ============================================================
-- 2. list_teams — T.1 + p_agency_id (combined view)
-- ============================================================

DROP FUNCTION IF EXISTS public.list_teams(text);

CREATE OR REPLACE FUNCTION public.list_teams(
  p_active    text DEFAULT 'active',
  p_agency_id uuid DEFAULT NULL
) RETURNS TABLE (
  id             integer,
  name           text,
  lead_user_id   integer,
  lead_name      text,
  lead_role      text,
  members_count  integer,
  clients_count  integer,
  is_active      boolean,
  editable       boolean,
  created_at     timestamptz,
  agency_id      uuid,
  agency_name    text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_role      text;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT u.role INTO v_role FROM dashboard_users u WHERE u.id = v_caller_id;

  IF v_role IS NULL
     OR v_role NOT IN ('superadmin','admin','teamlead','moderator','operator') THEN
    RETURN;
  END IF;

  IF p_agency_id IS NOT NULL THEN
    PERFORM assert_agency_access(v_caller_id, p_agency_id);
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.lead_user_id,
    COALESCE(
      NULLIF(trim(COALESCE(lu.first_name, '') || ' ' || COALESCE(lu.last_name, '')), ''),
      lu.alias,
      lu.email
    ) AS lead_name,
    lu.role AS lead_role,
    (SELECT count(*)::int FROM team_members tm WHERE tm.team_id = t.id) AS members_count,
    (SELECT count(*)::int FROM team_clients tc WHERE tc.team_id = t.id) AS clients_count,
    t.is_active,
    (v_role IN ('superadmin','admin') OR t.lead_user_id = v_caller_id) AS editable,
    t.created_at,
    t.agency_id,
    a.name AS agency_name
  FROM teams t
  LEFT JOIN dashboard_users lu ON lu.id = t.lead_user_id
  LEFT JOIN agencies        a  ON a.id = t.agency_id
  WHERE
    (p_active = 'all'
       OR (p_active = 'active'   AND t.is_active = true)
       OR (p_active = 'archived' AND t.is_active = false))
    AND (
      (p_agency_id IS NOT NULL AND t.agency_id = p_agency_id)
      OR
      (p_agency_id IS NULL AND t.agency_id IN (SELECT agency_id FROM accessible_agencies(v_caller_id)))
    )
    AND (
      v_role IN ('superadmin','admin','teamlead','moderator')
      OR (v_role = 'operator'
          AND EXISTS (SELECT 1 FROM team_members tm
                       WHERE tm.team_id = t.id
                         AND tm.operator_id = v_caller_id))
    )
  ORDER BY t.created_at DESC;
END $$;

REVOKE ALL ON FUNCTION public.list_teams(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_teams(text, uuid) TO authenticated;

-- ============================================================
-- 3. update_team — T.3 + T.4 on lead change
-- ============================================================

DROP FUNCTION IF EXISTS public.update_team(integer, text, integer);

CREATE OR REPLACE FUNCTION public.update_team(
  p_team_id      integer,
  p_name         text    DEFAULT NULL,
  p_lead_user_id integer DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id   integer := current_dashboard_user_id();
  v_caller_role text;
  v_lead_role   text;
  v_lead_active boolean;
  v_lead_agency uuid;
  v_old_name    text;
  v_old_lead    integer;
  v_team_agency uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = v_caller_id;

  IF NOT has_permission(v_caller_id, 'manage_teams')
     OR v_caller_role IS NULL
     OR v_caller_role NOT IN ('superadmin','admin') THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', v_caller_id
      USING errcode = '42501';
  END IF;

  SELECT t.name, t.lead_user_id, t.agency_id
    INTO v_old_name, v_old_lead, v_team_agency
    FROM teams t WHERE t.id = p_team_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team % not found', p_team_id;
  END IF;

  PERFORM assert_agency_access(v_caller_id, v_team_agency);

  IF p_name IS NOT NULL THEN
    IF length(trim(p_name)) = 0 THEN
      RAISE EXCEPTION 'name is required';
    END IF;

    IF trim(p_name) <> v_old_name THEN
      UPDATE teams SET name = trim(p_name) WHERE id = p_team_id;

      INSERT INTO team_activity (team_id, actor_id, event_type, payload)
      VALUES (
        p_team_id, v_caller_id, 'team_renamed',
        jsonb_build_object('from', v_old_name, 'to', trim(p_name))
      );
    END IF;
  END IF;

  IF p_lead_user_id IS NOT NULL AND p_lead_user_id <> v_old_lead THEN
    SELECT u.role, u.is_active, u.agency_id
      INTO v_lead_role, v_lead_active, v_lead_agency
      FROM dashboard_users u WHERE u.id = p_lead_user_id;

    IF v_lead_role IS NULL
       OR v_lead_active IS DISTINCT FROM true
       OR v_lead_role NOT IN ('teamlead','moderator') THEN
      RAISE EXCEPTION 'Лидом может быть только тимлид или модератор';
    END IF;

    -- T.4: lead.agency must equal team.agency
    IF v_lead_agency IS DISTINCT FROM v_team_agency THEN
      RAISE EXCEPTION 'lead user % (agency %) and team agency % differ',
        p_lead_user_id, v_lead_agency, v_team_agency USING errcode = '23514';
    END IF;

    UPDATE teams SET lead_user_id = p_lead_user_id WHERE id = p_team_id;

    INSERT INTO team_activity (team_id, actor_id, event_type, payload)
    VALUES (
      p_team_id, v_caller_id, 'lead_changed',
      jsonb_build_object('from_user_id', v_old_lead, 'to_user_id', p_lead_user_id)
    );
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.update_team(integer, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_team(integer, text, integer) TO authenticated;

-- ============================================================
-- 4. archive_team — T.3
-- ============================================================

DROP FUNCTION IF EXISTS public.archive_team(integer);

CREATE OR REPLACE FUNCTION public.archive_team(
  p_team_id integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id   integer := current_dashboard_user_id();
  v_caller_role text;
  v_was_active  boolean;
  v_team_agency uuid;
  v_op_count    integer := 0;
  v_cl_count    integer := 0;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = v_caller_id;

  IF NOT has_permission(v_caller_id, 'manage_teams')
     OR v_caller_role IS NULL
     OR v_caller_role NOT IN ('superadmin','admin') THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', v_caller_id
      USING errcode = '42501';
  END IF;

  SELECT is_active, agency_id INTO v_was_active, v_team_agency
    FROM teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'team % not found', p_team_id;
  END IF;
  IF NOT v_was_active THEN
    RAISE EXCEPTION 'team % is already archived', p_team_id;
  END IF;

  PERFORM assert_agency_access(v_caller_id, v_team_agency);

  WITH released_ops AS (
    DELETE FROM team_members WHERE team_id = p_team_id RETURNING operator_id
  ),
  released_cls AS (
    DELETE FROM team_clients WHERE team_id = p_team_id RETURNING client_id
  )
  SELECT
    (SELECT count(*)::int FROM released_ops),
    (SELECT count(*)::int FROM released_cls)
    INTO v_op_count, v_cl_count;

  UPDATE teams SET is_active = false, updated_at = now() WHERE id = p_team_id;

  INSERT INTO team_activity (team_id, actor_id, event_type, payload)
  VALUES (
    p_team_id, v_caller_id, 'team_archived',
    jsonb_build_object('released_operators', v_op_count, 'released_clients', v_cl_count)
  );

  RETURN jsonb_build_object('released_operators', v_op_count, 'released_clients', v_cl_count);
END $$;

REVOKE ALL ON FUNCTION public.archive_team(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_team(integer) TO authenticated;

-- ============================================================
-- 5. restore_team — T.3
-- ============================================================

DROP FUNCTION IF EXISTS public.restore_team(integer);

CREATE OR REPLACE FUNCTION public.restore_team(
  p_team_id integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id   integer := current_dashboard_user_id();
  v_caller_role text;
  v_was_active  boolean;
  v_team_agency uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = v_caller_id;

  IF NOT has_permission(v_caller_id, 'manage_teams')
     OR v_caller_role IS NULL
     OR v_caller_role NOT IN ('superadmin','admin') THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', v_caller_id
      USING errcode = '42501';
  END IF;

  SELECT is_active, agency_id INTO v_was_active, v_team_agency
    FROM teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'team % not found', p_team_id;
  END IF;
  IF v_was_active THEN
    RAISE EXCEPTION 'team % is already active', p_team_id;
  END IF;

  PERFORM assert_agency_access(v_caller_id, v_team_agency);

  UPDATE teams SET is_active = true WHERE id = p_team_id;

  INSERT INTO team_activity (team_id, actor_id, event_type, payload)
  VALUES (p_team_id, v_caller_id, 'team_restored', '{}'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.restore_team(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_team(integer) TO authenticated;

-- ============================================================
-- 6. add_team_member — T.4 (team.agency = operator.agency)
-- ============================================================

DROP FUNCTION IF EXISTS public.add_team_member(integer, integer);

CREATE OR REPLACE FUNCTION public.add_team_member(
  p_team_id     integer,
  p_operator_id integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id           integer := current_dashboard_user_id();
  v_caller_role         text;
  v_lead_user_id        integer;
  v_team_agency         uuid;
  v_op_role             text;
  v_op_active           boolean;
  v_op_agency           uuid;
  v_existing_team_id    integer;
  v_existing_team_name  text;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = v_caller_id;

  IF NOT has_permission(v_caller_id, 'manage_teams') OR v_caller_role IS NULL THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', v_caller_id
      USING errcode = '42501';
  END IF;

  SELECT t.lead_user_id, t.agency_id INTO v_lead_user_id, v_team_agency
    FROM teams t WHERE t.id = p_team_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team % not found', p_team_id;
  END IF;

  PERFORM assert_agency_access(v_caller_id, v_team_agency);

  IF v_caller_role NOT IN ('superadmin','admin')
     AND v_lead_user_id IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION 'caller % is not lead of team %', v_caller_id, p_team_id
      USING errcode = '42501';
  END IF;

  SELECT u.role, u.is_active, u.agency_id INTO v_op_role, v_op_active, v_op_agency
    FROM dashboard_users u WHERE u.id = p_operator_id;

  IF v_op_role IS NULL THEN
    RAISE EXCEPTION 'user % not found', p_operator_id;
  END IF;

  IF v_op_role <> 'operator' OR v_op_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'user % is not an active operator', p_operator_id;
  END IF;

  -- T.4: operator.agency must equal team.agency
  IF v_op_agency IS DISTINCT FROM v_team_agency THEN
    RAISE EXCEPTION 'operator % (agency %) and team % (agency %) differ',
      p_operator_id, v_op_agency, p_team_id, v_team_agency USING errcode = '23514';
  END IF;

  SELECT t.id, t.name INTO v_existing_team_id, v_existing_team_name
    FROM team_members tm
    JOIN teams t ON t.id = tm.team_id
    WHERE tm.operator_id = p_operator_id;

  IF FOUND THEN
    RAISE EXCEPTION 'Оператор уже в команде "%"', v_existing_team_name
      USING DETAIL = v_existing_team_id::text;
  END IF;

  INSERT INTO team_members (team_id, operator_id, added_by)
  VALUES (p_team_id, p_operator_id, v_caller_id);

  INSERT INTO team_activity (team_id, actor_id, event_type, payload)
  VALUES (
    p_team_id, v_caller_id, 'member_added',
    jsonb_build_object('operator_id', p_operator_id)
  );
END $$;

REVOKE ALL ON FUNCTION public.add_team_member(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_team_member(integer, integer) TO authenticated;

-- ============================================================
-- 7. remove_team_member — T.3 (assert via team)
-- ============================================================

DROP FUNCTION IF EXISTS public.remove_team_member(integer, integer);

CREATE OR REPLACE FUNCTION public.remove_team_member(
  p_team_id     integer,
  p_operator_id integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id    integer := current_dashboard_user_id();
  v_caller_role  text;
  v_lead_user_id integer;
  v_team_agency  uuid;
  v_deleted      integer;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = v_caller_id;

  IF NOT has_permission(v_caller_id, 'manage_teams') OR v_caller_role IS NULL THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', v_caller_id
      USING errcode = '42501';
  END IF;

  SELECT t.lead_user_id, t.agency_id INTO v_lead_user_id, v_team_agency
    FROM teams t WHERE t.id = p_team_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team % not found', p_team_id;
  END IF;

  PERFORM assert_agency_access(v_caller_id, v_team_agency);

  IF v_caller_role NOT IN ('superadmin','admin')
     AND v_lead_user_id IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION 'caller % is not lead of team %', v_caller_id, p_team_id
      USING errcode = '42501';
  END IF;

  WITH del AS (
    DELETE FROM team_members
     WHERE team_id = p_team_id AND operator_id = p_operator_id
    RETURNING 1
  )
  SELECT count(*)::int INTO v_deleted FROM del;

  IF v_deleted > 0 THEN
    INSERT INTO team_activity (team_id, actor_id, event_type, payload)
    VALUES (
      p_team_id, v_caller_id, 'member_removed',
      jsonb_build_object('operator_id', p_operator_id)
    );
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.remove_team_member(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_team_member(integer, integer) TO authenticated;

-- ============================================================
-- 8. assign_team_clients — T.4 (each client.agency = team.agency)
-- ============================================================

DROP FUNCTION IF EXISTS public.assign_team_clients(integer, integer[]);

CREATE OR REPLACE FUNCTION public.assign_team_clients(
  p_team_id    integer,
  p_client_ids integer[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id    integer := current_dashboard_user_id();
  v_caller_role  text;
  v_lead_user_id integer;
  v_team_active  boolean;
  v_team_agency  uuid;
  v_conflicts    text;
  v_invalid_ids  text;
  v_cross_ids    text;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = v_caller_id;

  IF NOT has_permission(v_caller_id, 'manage_teams') OR v_caller_role IS NULL THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', v_caller_id
      USING errcode = '42501';
  END IF;

  IF p_client_ids IS NULL OR array_length(p_client_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'client_ids must be a non-empty array';
  END IF;

  SELECT t.lead_user_id, t.is_active, t.agency_id
    INTO v_lead_user_id, v_team_active, v_team_agency
    FROM teams t WHERE t.id = p_team_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team % not found', p_team_id;
  END IF;

  IF v_team_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'team % is archived', p_team_id;
  END IF;

  PERFORM assert_agency_access(v_caller_id, v_team_agency);

  IF v_caller_role NOT IN ('superadmin','admin')
     AND v_lead_user_id IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION 'caller % is not lead of team %', v_caller_id, p_team_id
      USING errcode = '42501';
  END IF;

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

  -- T.4: each client.agency must equal team.agency
  SELECT string_agg(c.id::text || ' (agency ' || c.agency_id || ')', ', ' ORDER BY c.id)
    INTO v_cross_ids
  FROM clients c
  WHERE c.id = ANY(p_client_ids)
    AND c.agency_id IS DISTINCT FROM v_team_agency;

  IF v_cross_ids IS NOT NULL THEN
    RAISE EXCEPTION 'clients from different agency than team % (agency %): %',
      p_team_id, v_team_agency, v_cross_ids USING errcode = '23514';
  END IF;

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
  SELECT p_team_id, u.cid, v_caller_id
    FROM unnest(p_client_ids) AS u(cid);

  INSERT INTO team_activity (team_id, actor_id, event_type, payload)
  VALUES (
    p_team_id, v_caller_id, 'clients_assigned',
    jsonb_build_object('client_ids', to_jsonb(p_client_ids))
  );
END $$;

REVOKE ALL ON FUNCTION public.assign_team_clients(integer, integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_team_clients(integer, integer[]) TO authenticated;

-- ============================================================
-- 9. set_operator_curator — T.4 (moderator.agency = operator.agency)
-- ============================================================

DROP FUNCTION IF EXISTS public.set_operator_curator(integer, integer);

CREATE OR REPLACE FUNCTION public.set_operator_curator(
  p_operator_id      integer,
  p_new_moderator_id integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id   integer := current_dashboard_user_id();
  v_caller_role text;
  v_op_role     text;
  v_op_active   boolean;
  v_op_agency   uuid;
  v_mod_role    text;
  v_mod_active  boolean;
  v_mod_agency  uuid;
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

  SELECT u.role, u.is_active, u.agency_id INTO v_op_role, v_op_active, v_op_agency
    FROM dashboard_users u WHERE u.id = p_operator_id;
  IF v_op_role IS NULL THEN
    RAISE EXCEPTION 'operator % not found', p_operator_id;
  END IF;
  IF v_op_role <> 'operator' OR v_op_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'user % is not an active operator', p_operator_id;
  END IF;

  SELECT u.role, u.is_active, u.agency_id INTO v_mod_role, v_mod_active, v_mod_agency
    FROM dashboard_users u WHERE u.id = p_new_moderator_id;
  IF v_mod_role IS NULL THEN
    RAISE EXCEPTION 'moderator % not found', p_new_moderator_id;
  END IF;
  IF v_mod_role <> 'moderator' OR v_mod_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'user % is not an active moderator', p_new_moderator_id;
  END IF;

  -- T.4: moderator.agency must equal operator.agency.
  -- (Both operator and moderator are non-admin so agency_id is NOT NULL by CHECK.)
  IF v_mod_agency IS DISTINCT FROM v_op_agency THEN
    RAISE EXCEPTION 'moderator % (agency %) and operator % (agency %) differ',
      p_new_moderator_id, v_mod_agency, p_operator_id, v_op_agency
      USING errcode = '23514';
  END IF;

  -- Caller must have access to the (shared) agency.
  PERFORM assert_agency_access(v_caller_id, v_op_agency);

  SELECT mo.moderator_id INTO v_old_mod
    FROM moderator_operators mo
   WHERE mo.operator_id = p_operator_id
   FOR UPDATE;

  IF v_caller_role NOT IN ('superadmin','admin')
     AND v_caller_id IS DISTINCT FROM v_old_mod
     AND v_caller_id IS DISTINCT FROM p_new_moderator_id THEN
    RAISE EXCEPTION 'caller % cannot change curator of operator %',
      v_caller_id, p_operator_id USING errcode = '42501';
  END IF;

  IF v_old_mod IS NOT DISTINCT FROM p_new_moderator_id THEN
    RETURN;
  END IF;

  IF v_old_mod IS NOT NULL THEN
    DELETE FROM moderator_operators WHERE operator_id = p_operator_id;
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
-- 10. bulk_assign_curated_operators — T.4 per operator
-- ============================================================

DROP FUNCTION IF EXISTS public.bulk_assign_curated_operators(integer, integer[]);

CREATE OR REPLACE FUNCTION public.bulk_assign_curated_operators(
  p_moderator_id integer,
  p_operator_ids integer[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id   integer := current_dashboard_user_id();
  v_caller_role text;
  v_mod_role    text;
  v_mod_active  boolean;
  v_mod_agency  uuid;
  v_invalid_ids text;
  v_conflicts   text;
  v_cross_ids   text;
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

  IF v_caller_role NOT IN ('superadmin','admin')
     AND v_caller_id IS DISTINCT FROM p_moderator_id THEN
    RAISE EXCEPTION 'caller % cannot assign operators to moderator %',
      v_caller_id, p_moderator_id USING errcode = '42501';
  END IF;

  SELECT u.role, u.is_active, u.agency_id INTO v_mod_role, v_mod_active, v_mod_agency
    FROM dashboard_users u WHERE u.id = p_moderator_id;
  IF v_mod_role IS NULL THEN
    RAISE EXCEPTION 'moderator % not found', p_moderator_id;
  END IF;
  IF v_mod_role <> 'moderator' OR v_mod_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'user % is not an active moderator', p_moderator_id;
  END IF;

  PERFORM assert_agency_access(v_caller_id, v_mod_agency);

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

  -- T.4: each operator.agency must equal moderator.agency
  SELECT string_agg(u.id::text || ' (agency ' || u.agency_id || ')', ', ' ORDER BY u.id)
    INTO v_cross_ids
  FROM dashboard_users u
  WHERE u.id = ANY(p_operator_ids)
    AND u.agency_id IS DISTINCT FROM v_mod_agency;

  IF v_cross_ids IS NOT NULL THEN
    RAISE EXCEPTION 'operators from different agency than moderator % (agency %): %',
      p_moderator_id, v_mod_agency, v_cross_ids USING errcode = '23514';
  END IF;

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
-- 11. list_active_teams_for_assignment — T.1 + p_agency_id
-- ============================================================

DROP FUNCTION IF EXISTS public.list_active_teams_for_assignment();

CREATE OR REPLACE FUNCTION public.list_active_teams_for_assignment(
  p_agency_id uuid DEFAULT NULL
)
RETURNS TABLE (id integer, name text, agency_id uuid, agency_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  IF NOT has_permission(v_caller_id, 'manage_teams') THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', v_caller_id
      USING errcode = '42501';
  END IF;

  IF p_agency_id IS NOT NULL THEN
    PERFORM assert_agency_access(v_caller_id, p_agency_id);
  END IF;

  RETURN QUERY
  SELECT t.id, t.name, t.agency_id, a.name AS agency_name
  FROM teams t
  LEFT JOIN agencies a ON a.id = t.agency_id
  WHERE t.is_active = true
    AND (
      (p_agency_id IS NOT NULL AND t.agency_id = p_agency_id)
      OR
      (p_agency_id IS NULL AND t.agency_id IN (SELECT agency_id FROM accessible_agencies(v_caller_id)))
    )
  ORDER BY t.name;
END $$;

REVOKE ALL ON FUNCTION public.list_active_teams_for_assignment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_active_teams_for_assignment(uuid) TO authenticated;

-- ============================================================
-- 12. list_assignable_users — T.1 + p_agency_id (filter by accessible_agencies)
-- ============================================================

DROP FUNCTION IF EXISTS public.list_assignable_users(text);

CREATE OR REPLACE FUNCTION public.list_assignable_users(
  p_search    text DEFAULT NULL,
  p_agency_id uuid DEFAULT NULL
) RETURNS TABLE (
  id                  integer,
  name                text,
  role                text,
  ref_code            text,
  alias               text,
  eligibility_reason  text,
  agency_id           uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id   integer := current_dashboard_user_id();
  v_caller_role text;
  v_search      text;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT u.role INTO v_caller_role
    FROM dashboard_users u
   WHERE u.id = v_caller_id AND u.is_active = true;

  IF v_caller_role IS NULL THEN
    RETURN;
  END IF;

  IF p_agency_id IS NOT NULL THEN
    PERFORM assert_agency_access(v_caller_id, p_agency_id);
  END IF;

  v_search := NULLIF(trim(COALESCE(p_search, '')), '');

  RETURN QUERY
  WITH candidates AS (
    SELECT
      u.id,
      COALESCE(
        NULLIF(trim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''),
        u.alias,
        u.email
      ) AS name,
      u.role,
      u.ref_code,
      u.alias,
      u.agency_id,
      CASE
        WHEN v_caller_role IN ('admin', 'superadmin')
          THEN 'admin_full_access'
        WHEN v_caller_role IN ('teamlead', 'moderator')
         AND u.role IN ('teamlead', 'moderator')
          THEN 'cross_staff'
        WHEN v_caller_role = 'teamlead' AND u.role = 'operator'
          THEN 'own_team_operator'
        WHEN v_caller_role = 'moderator' AND u.role = 'operator'
          THEN 'curated_operator'
        ELSE NULL
      END AS eligibility_reason
    FROM dashboard_users u
    WHERE u.is_active = true
      AND can_assign_task(u.id)
      AND (
        v_search IS NULL
        OR u.first_name ILIKE '%' || v_search || '%'
        OR u.last_name  ILIKE '%' || v_search || '%'
        OR u.alias      ILIKE '%' || v_search || '%'
        OR u.ref_code   ILIKE '%' || v_search || '%'
      )
      AND (
        -- Agency filter: include users whose agency is in scope, plus users with
        -- NULL agency (admin/superadmin who cross agencies).
        u.agency_id IS NULL
        OR (p_agency_id IS NOT NULL AND u.agency_id = p_agency_id)
        OR (p_agency_id IS NULL AND u.agency_id IN (SELECT agency_id FROM accessible_agencies(v_caller_id)))
      )
  )
  SELECT c.id, c.name, c.role, c.ref_code, c.alias, c.eligibility_reason, c.agency_id
    FROM candidates c
   ORDER BY c.name
   LIMIT 50;
END $$;

REVOKE ALL ON FUNCTION public.list_assignable_users(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_assignable_users(text, uuid) TO authenticated;

-- ============================================================
-- 13. list_unassigned_operators — T.1 + p_agency_id
-- ============================================================

DROP FUNCTION IF EXISTS public.list_unassigned_operators(text);

CREATE OR REPLACE FUNCTION public.list_unassigned_operators(
  p_search    text DEFAULT NULL,
  p_agency_id uuid DEFAULT NULL
) RETURNS TABLE (
  id         integer,
  name       text,
  ref_code   text,
  alias      text,
  avatar_url text,
  agency_id  uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
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

  IF p_agency_id IS NOT NULL THEN
    PERFORM assert_agency_access(v_caller_id, p_agency_id);
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
    u.avatar_url,
    u.agency_id
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
    AND (
      (p_agency_id IS NOT NULL AND u.agency_id = p_agency_id)
      OR
      (p_agency_id IS NULL AND u.agency_id IN (SELECT agency_id FROM accessible_agencies(v_caller_id)))
    )
  ORDER BY lower(COALESCE(
             NULLIF(trim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''),
             u.alias,
             u.email))
  LIMIT 50;
END $$;

REVOKE ALL ON FUNCTION public.list_unassigned_operators(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_unassigned_operators(text, uuid) TO authenticated;

-- ============================================================
-- 14. list_curated_operators — T.1 + p_agency_id (filter the curated set)
-- ============================================================

DROP FUNCTION IF EXISTS public.list_curated_operators(integer);

CREATE OR REPLACE FUNCTION public.list_curated_operators(
  p_moderator_id integer,
  p_agency_id    uuid DEFAULT NULL
) RETURNS TABLE (
  operator_id integer,
  name        text,
  ref_code    text,
  alias       text,
  avatar_url  text,
  team_id     integer,
  team_name   text,
  agency_id   uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
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

  IF p_agency_id IS NOT NULL THEN
    PERFORM assert_agency_access(v_caller_id, p_agency_id);
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
    t.name AS team_name,
    u.agency_id
  FROM moderator_operators mo
  JOIN dashboard_users u ON u.id = mo.operator_id
  LEFT JOIN team_members tm ON tm.operator_id = u.id
  LEFT JOIN teams        t  ON t.id = tm.team_id
  WHERE mo.moderator_id = p_moderator_id
    AND (
      (p_agency_id IS NOT NULL AND u.agency_id = p_agency_id)
      OR
      (p_agency_id IS NULL AND u.agency_id IN (SELECT agency_id FROM accessible_agencies(v_caller_id)))
    )
  ORDER BY lower(COALESCE(
             NULLIF(trim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''),
             u.alias,
             u.email));
END $$;

REVOKE ALL ON FUNCTION public.list_curated_operators(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_curated_operators(integer, uuid) TO authenticated;

COMMIT;

-- VERIFY:
--   SELECT proname, pg_get_function_identity_arguments(oid)
--     FROM pg_proc
--     WHERE proname IN (
--       'create_team','list_teams','update_team','archive_team','restore_team',
--       'add_team_member','remove_team_member','assign_team_clients',
--       'set_operator_curator','bulk_assign_curated_operators',
--       'list_active_teams_for_assignment','list_assignable_users',
--       'list_unassigned_operators','list_curated_operators'
--     )
--     ORDER BY proname;
--   -- Expected: 14 rows; signatures include p_agency_id where appropriate.
--
-- ROLLBACK: restore previous definitions from migrations 43, 22, 46, 21.
