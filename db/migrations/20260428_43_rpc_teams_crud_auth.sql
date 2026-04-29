-- Migration 43: Stage 9 — Migrate teams CRUD bucket to current_dashboard_user_id()
--
-- Migrates 15 RPCs:
--   create_team, update_team, archive_team, restore_team,
--   list_teams, get_team_detail, list_team_activity,
--   add_team_member, remove_team_member, move_team_member,
--   assign_team_clients, unassign_team_client, move_team_client,
--   list_active_teams_for_assignment, list_assignable_users
--
-- Pattern: drop p_caller_id from signature; derive via current_dashboard_user_id().
--   DECLARE v_caller_id integer := current_dashboard_user_id();
--   IF v_caller_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = '28000'; END IF;
-- Layered security: REVOKE ALL ... FROM PUBLIC; GRANT EXECUTE ... TO authenticated.
--
-- ⚠ NOT migrated here: list_unassigned_clients — Stage 6 (clients CRUD bucket) owns it.
--   Source file 20260425_22_rpc_teams_clients.sql has 4 RPCs; we migrate only 3.
--
-- ⚠ NOT migrated here: list_unassigned_operators — NOT in the Stage 9 bucket list.
--   (It lives in 20260425_21_rpc_teams_members.sql but is not one of the 15 RPCs
--    designated for Stage 9. It will be handled in a later stage.)
--
-- Sources (latest definition per RPC):
--   20260425_20_rpc_teams_crud.sql    → list_teams, get_team_detail, create_team,
--                                        update_team, archive_team, restore_team,
--                                        list_team_activity
--   20260425_21_rpc_teams_members.sql → add_team_member, remove_team_member,
--                                        move_team_member
--   20260425_22_rpc_teams_clients.sql → assign_team_clients, unassign_team_client,
--                                        move_team_client
--   20260425_26_rpc_staff_views.sql   → list_active_teams_for_assignment
--   20260426_30_rpc_tasks_read.sql    → list_assignable_users
--
-- Audit columns preserved: actor_id on team_activity, created_by on teams,
--   added_by on team_members, assigned_by on team_clients — all use v_caller_id.

BEGIN;

-- ============================================================
-- 1. list_teams
--    Original signature: (p_caller_id integer, p_active text DEFAULT 'active')
--    New signature:      (p_active text DEFAULT 'active')
--    Permission: none explicit (scope-by-role applied internally)
-- ============================================================
DROP FUNCTION IF EXISTS public.list_teams(integer, text);

CREATE OR REPLACE FUNCTION public.list_teams(
  p_active text DEFAULT 'active'   -- 'active' | 'archived' | 'all'
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
  created_at     timestamptz
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

  -- Unknown caller or roles outside the visibility scope → empty result.
  IF v_role IS NULL
     OR v_role NOT IN ('superadmin','admin','teamlead','moderator','operator') THEN
    RETURN;
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
    t.created_at
  FROM teams t
  LEFT JOIN dashboard_users lu ON lu.id = t.lead_user_id
  WHERE
    (p_active = 'all'
       OR (p_active = 'active'   AND t.is_active = true)
       OR (p_active = 'archived' AND t.is_active = false))
    AND (
      v_role IN ('superadmin','admin','teamlead','moderator')
      OR (v_role = 'operator'
          AND EXISTS (SELECT 1 FROM team_members tm
                       WHERE tm.team_id = t.id
                         AND tm.operator_id = v_caller_id))
    )
  ORDER BY t.created_at DESC;
END $$;

REVOKE ALL ON FUNCTION public.list_teams(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_teams(text) TO authenticated;

-- ============================================================
-- 2. get_team_detail
--    Original signature: (p_caller_id integer, p_team_id integer)
--    New signature:      (p_team_id integer)
--    Permission: scope-by-role (visibility check internal)
-- ============================================================
DROP FUNCTION IF EXISTS public.get_team_detail(integer, integer);

CREATE OR REPLACE FUNCTION public.get_team_detail(
  p_team_id integer
) RETURNS TABLE (
  id              integer,
  name            text,
  lead_user_id    integer,
  lead_name       text,
  lead_role       text,
  members_count   integer,
  clients_count   integer,
  is_active       boolean,
  editable        boolean,
  created_at      timestamptz,
  members         jsonb,
  clients         jsonb,
  created_by_name text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_role      text;
  v_visible   boolean;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT u.role INTO v_role FROM dashboard_users u WHERE u.id = v_caller_id;

  IF v_role IS NULL THEN
    RETURN;
  END IF;

  -- Visibility scope check (same rules as list_teams).
  IF v_role IN ('superadmin','admin','teamlead','moderator') THEN
    v_visible := EXISTS (SELECT 1 FROM teams t WHERE t.id = p_team_id);
  ELSIF v_role = 'operator' THEN
    v_visible := EXISTS (SELECT 1 FROM team_members tm
                         WHERE tm.team_id = p_team_id
                           AND tm.operator_id = v_caller_id);
  ELSE
    v_visible := false;
  END IF;

  IF NOT v_visible THEN
    RETURN;
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
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'operator_id', mu.id,
         'name', COALESCE(
           NULLIF(trim(COALESCE(mu.first_name, '') || ' ' || COALESCE(mu.last_name, '')), ''),
           mu.alias,
           mu.email
         ),
         'ref_code',   mu.ref_code,
         'alias',      mu.alias,
         'avatar_url', mu.avatar_url,
         'role',       mu.role
       ) ORDER BY mu.first_name, mu.last_name)
       FROM team_members tm
       JOIN dashboard_users mu ON mu.id = tm.operator_id
       WHERE tm.team_id = t.id),
      '[]'::jsonb
    ) AS members,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'client_id',  c.id,
         'name',       c.name,
         'alias',      c.alias,
         'avatar_url', c.avatar_url
       ) ORDER BY lower(c.name))
       FROM team_clients tc
       JOIN clients c ON c.id = tc.client_id
       WHERE tc.team_id = t.id),
      '[]'::jsonb
    ) AS clients,
    COALESCE(
      NULLIF(trim(COALESCE(cu.first_name, '') || ' ' || COALESCE(cu.last_name, '')), ''),
      cu.alias,
      cu.email
    ) AS created_by_name
  FROM teams t
  LEFT JOIN dashboard_users lu ON lu.id = t.lead_user_id
  LEFT JOIN dashboard_users cu ON cu.id = t.created_by
  WHERE t.id = p_team_id;
END $$;

REVOKE ALL ON FUNCTION public.get_team_detail(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_team_detail(integer) TO authenticated;

-- ============================================================
-- 3. create_team
--    Original signature: (p_caller_id integer, p_name text, p_lead_user_id integer)
--    New signature:      (p_name text, p_lead_user_id integer)
--    Permission: manage_teams (+ role admin/superadmin)
--    Audit: created_by = v_caller_id, actor_id = v_caller_id
-- ============================================================
DROP FUNCTION IF EXISTS public.create_team(integer, text, integer);

CREATE OR REPLACE FUNCTION public.create_team(
  p_name         text,
  p_lead_user_id integer
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id   integer := current_dashboard_user_id();
  v_caller_role text;
  v_lead_role   text;
  v_lead_active boolean;
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

  SELECT u.role, u.is_active INTO v_lead_role, v_lead_active
    FROM dashboard_users u WHERE u.id = p_lead_user_id;

  IF v_lead_role IS NULL
     OR v_lead_active IS DISTINCT FROM true
     OR v_lead_role NOT IN ('teamlead','moderator') THEN
    RAISE EXCEPTION 'Лидом может быть только тимлид или модератор';
  END IF;

  INSERT INTO teams (name, lead_user_id, is_active, created_by)
  VALUES (trim(p_name), p_lead_user_id, true, v_caller_id)
  RETURNING id INTO v_new_id;

  INSERT INTO team_activity (team_id, actor_id, event_type, payload)
  VALUES (
    v_new_id, v_caller_id, 'team_created',
    jsonb_build_object('name', trim(p_name), 'lead_user_id', p_lead_user_id)
  );

  RETURN v_new_id;
END $$;

REVOKE ALL ON FUNCTION public.create_team(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_team(text, integer) TO authenticated;

-- ============================================================
-- 4. update_team
--    Original signature: (p_caller_id integer, p_team_id integer,
--                         p_name text DEFAULT NULL, p_lead_user_id integer DEFAULT NULL)
--    New signature:      (p_team_id integer, p_name text DEFAULT NULL,
--                         p_lead_user_id integer DEFAULT NULL)
--    Permission: manage_teams (+ role admin/superadmin)
--    Audit: actor_id = v_caller_id
-- ============================================================
DROP FUNCTION IF EXISTS public.update_team(integer, integer, text, integer);

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
  v_old_name    text;
  v_old_lead    integer;
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

  -- Lock the row so concurrent updates can't race the audit «from» values.
  SELECT t.name, t.lead_user_id INTO v_old_name, v_old_lead
    FROM teams t WHERE t.id = p_team_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team % not found', p_team_id;
  END IF;

  -- Rename
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

  -- Change lead
  IF p_lead_user_id IS NOT NULL AND p_lead_user_id <> v_old_lead THEN
    SELECT u.role, u.is_active INTO v_lead_role, v_lead_active
      FROM dashboard_users u WHERE u.id = p_lead_user_id;

    IF v_lead_role IS NULL
       OR v_lead_active IS DISTINCT FROM true
       OR v_lead_role NOT IN ('teamlead','moderator') THEN
      RAISE EXCEPTION 'Лидом может быть только тимлид или модератор';
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
-- 5. archive_team
--    Original signature: (p_caller_id integer, p_team_id integer)
--    New signature:      (p_team_id integer)
--    Permission: manage_teams (+ role admin/superadmin)
--    Audit: actor_id = v_caller_id
-- ============================================================
DROP FUNCTION IF EXISTS public.archive_team(integer, integer);

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

  SELECT is_active INTO v_was_active FROM teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'team % not found', p_team_id;
  END IF;
  IF NOT v_was_active THEN
    RAISE EXCEPTION 'team % is already archived', p_team_id;
  END IF;

  -- moderator_operators НЕ затрагиваем — кураторство orthogonal к команде (см. domain-model §3).
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
-- 6. restore_team
--    Original signature: (p_caller_id integer, p_team_id integer)
--    New signature:      (p_team_id integer)
--    Permission: manage_teams (+ role admin/superadmin)
--    Audit: actor_id = v_caller_id
-- ============================================================
DROP FUNCTION IF EXISTS public.restore_team(integer, integer);

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

  SELECT is_active INTO v_was_active FROM teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'team % not found', p_team_id;
  END IF;
  IF v_was_active THEN
    RAISE EXCEPTION 'team % is already active', p_team_id;
  END IF;

  UPDATE teams SET is_active = true WHERE id = p_team_id;

  INSERT INTO team_activity (team_id, actor_id, event_type, payload)
  VALUES (p_team_id, v_caller_id, 'team_restored', '{}'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.restore_team(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_team(integer) TO authenticated;

-- ============================================================
-- 7. list_team_activity
--    Original signature: (p_caller_id integer, p_team_id integer,
--                         p_limit integer DEFAULT 12, p_offset integer DEFAULT 0)
--    New signature:      (p_team_id integer, p_limit integer DEFAULT 12,
--                         p_offset integer DEFAULT 0)
--    Permission: scope-by-role (visibility check internal)
-- ============================================================
DROP FUNCTION IF EXISTS public.list_team_activity(integer, integer, integer, integer);

CREATE OR REPLACE FUNCTION public.list_team_activity(
  p_team_id integer,
  p_limit   integer DEFAULT 12,
  p_offset  integer DEFAULT 0
) RETURNS TABLE (
  id         integer,
  actor_id   integer,
  actor_name text,
  event_type text,
  payload    jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_role      text;
  v_visible   boolean;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT u.role INTO v_role FROM dashboard_users u WHERE u.id = v_caller_id;

  IF v_role IS NULL THEN
    RETURN;
  END IF;

  IF v_role IN ('superadmin','admin','teamlead','moderator') THEN
    v_visible := EXISTS (SELECT 1 FROM teams t WHERE t.id = p_team_id);
  ELSIF v_role = 'operator' THEN
    v_visible := EXISTS (SELECT 1 FROM team_members tm
                         WHERE tm.team_id = p_team_id
                           AND tm.operator_id = v_caller_id);
  ELSE
    v_visible := false;
  END IF;

  IF NOT v_visible THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.actor_id,
    CASE
      WHEN a.actor_id IS NULL THEN 'Система'
      ELSE COALESCE(
        NULLIF(trim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''),
        u.alias,
        u.email
      )
    END AS actor_name,
    a.event_type,
    a.payload,
    a.created_at
  FROM team_activity a
  LEFT JOIN dashboard_users u ON u.id = a.actor_id
  WHERE a.team_id = p_team_id
  ORDER BY a.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 100))
  OFFSET GREATEST(0, p_offset);
END $$;

REVOKE ALL ON FUNCTION public.list_team_activity(integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_team_activity(integer, integer, integer) TO authenticated;

-- ============================================================
-- 8. add_team_member
--    Original signature: (p_caller_id integer, p_team_id integer, p_operator_id integer)
--    New signature:      (p_team_id integer, p_operator_id integer)
--    Permission: manage_teams
--    Audit: actor_id = v_caller_id, added_by = v_caller_id
-- ============================================================
DROP FUNCTION IF EXISTS public.add_team_member(integer, integer, integer);

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
  v_op_role             text;
  v_op_active           boolean;
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

  -- Lock target team for the duration of the transaction.
  SELECT t.lead_user_id INTO v_lead_user_id
    FROM teams t WHERE t.id = p_team_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team % not found', p_team_id;
  END IF;

  IF v_caller_role NOT IN ('superadmin','admin')
     AND v_lead_user_id IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION 'caller % is not lead of team %', v_caller_id, p_team_id
      USING errcode = '42501';
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
-- 9. remove_team_member
--    Original signature: (p_caller_id integer, p_team_id integer, p_operator_id integer)
--    New signature:      (p_team_id integer, p_operator_id integer)
--    Permission: manage_teams
--    Audit: actor_id = v_caller_id
-- ============================================================
DROP FUNCTION IF EXISTS public.remove_team_member(integer, integer, integer);

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

  SELECT t.lead_user_id INTO v_lead_user_id
    FROM teams t WHERE t.id = p_team_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team % not found', p_team_id;
  END IF;

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

  -- Idempotent: silent success when row was already absent.
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
-- 10. move_team_member
--     Original signature: (p_caller_id integer, p_from_team integer,
--                          p_to_team integer, p_operator_id integer)
--     New signature:      (p_from_team integer, p_to_team integer, p_operator_id integer)
--     Permission: manage_teams
--     Audit: actor_id = v_caller_id, added_by = v_caller_id
-- ============================================================
DROP FUNCTION IF EXISTS public.move_team_member(integer, integer, integer, integer);

CREATE OR REPLACE FUNCTION public.move_team_member(
  p_from_team   integer,
  p_to_team     integer,
  p_operator_id integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id   integer := current_dashboard_user_id();
  v_caller_role text;
  v_from_lead   integer;
  v_to_lead     integer;
  v_from_active boolean;
  v_to_active   boolean;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = v_caller_id;

  IF NOT has_permission(v_caller_id, 'manage_teams') OR v_caller_role IS NULL THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', v_caller_id
      USING errcode = '42501';
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
     AND (v_from_lead IS DISTINCT FROM v_caller_id
          OR v_to_lead IS DISTINCT FROM v_caller_id) THEN
    RAISE EXCEPTION 'caller % must lead both teams to move members', v_caller_id
      USING errcode = '42501';
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
  VALUES (p_to_team, p_operator_id, v_caller_id);

  -- Two audit rows for clarity: one per team with shared payload.
  INSERT INTO team_activity (team_id, actor_id, event_type, payload)
  VALUES
    (p_from_team, v_caller_id, 'member_moved',
       jsonb_build_object(
         'operator_id', p_operator_id,
         'from_team',   p_from_team,
         'to_team',     p_to_team)),
    (p_to_team,   v_caller_id, 'member_moved',
       jsonb_build_object(
         'operator_id', p_operator_id,
         'from_team',   p_from_team,
         'to_team',     p_to_team));
END $$;

REVOKE ALL ON FUNCTION public.move_team_member(integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_team_member(integer, integer, integer) TO authenticated;

-- ============================================================
-- 11. assign_team_clients
--     Original signature: (p_caller_id integer, p_team_id integer, p_client_ids integer[])
--     New signature:      (p_team_id integer, p_client_ids integer[])
--     Permission: manage_teams
--     Audit: actor_id = v_caller_id, assigned_by = v_caller_id
-- ============================================================
DROP FUNCTION IF EXISTS public.assign_team_clients(integer, integer, integer[]);

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
  v_conflicts    text;
  v_invalid_ids  text;
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

  SELECT t.lead_user_id, t.is_active INTO v_lead_user_id, v_team_active
    FROM teams t WHERE t.id = p_team_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team % not found', p_team_id;
  END IF;

  IF v_team_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'team % is archived', p_team_id;
  END IF;

  IF v_caller_role NOT IN ('superadmin','admin')
     AND v_lead_user_id IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION 'caller % is not lead of team %', v_caller_id, p_team_id
      USING errcode = '42501';
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
-- 12. unassign_team_client
--     Original signature: (p_caller_id integer, p_team_id integer, p_client_id integer)
--     New signature:      (p_team_id integer, p_client_id integer)
--     Permission: manage_teams
--     Audit: actor_id = v_caller_id
-- ============================================================
DROP FUNCTION IF EXISTS public.unassign_team_client(integer, integer, integer);

CREATE OR REPLACE FUNCTION public.unassign_team_client(
  p_team_id   integer,
  p_client_id integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id    integer := current_dashboard_user_id();
  v_caller_role  text;
  v_lead_user_id integer;
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

  SELECT t.lead_user_id INTO v_lead_user_id
    FROM teams t WHERE t.id = p_team_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team % not found', p_team_id;
  END IF;

  IF v_caller_role NOT IN ('superadmin','admin')
     AND v_lead_user_id IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION 'caller % is not lead of team %', v_caller_id, p_team_id
      USING errcode = '42501';
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
      p_team_id, v_caller_id, 'client_unassigned',
      jsonb_build_object('client_id', p_client_id)
    );
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.unassign_team_client(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unassign_team_client(integer, integer) TO authenticated;

-- ============================================================
-- 13. move_team_client
--     Original signature: (p_caller_id integer, p_from_team integer,
--                          p_to_team integer, p_client_id integer)
--     New signature:      (p_from_team integer, p_to_team integer, p_client_id integer)
--     Permission: manage_teams
--     Audit: actor_id = v_caller_id, assigned_by = v_caller_id
-- ============================================================
DROP FUNCTION IF EXISTS public.move_team_client(integer, integer, integer, integer);

CREATE OR REPLACE FUNCTION public.move_team_client(
  p_from_team integer,
  p_to_team   integer,
  p_client_id integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id   integer := current_dashboard_user_id();
  v_caller_role text;
  v_from_lead   integer;
  v_to_lead     integer;
  v_from_active boolean;
  v_to_active   boolean;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = v_caller_id;

  IF NOT has_permission(v_caller_id, 'manage_teams') OR v_caller_role IS NULL THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', v_caller_id
      USING errcode = '42501';
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
     AND (v_from_lead IS DISTINCT FROM v_caller_id
          OR v_to_lead IS DISTINCT FROM v_caller_id) THEN
    RAISE EXCEPTION 'caller % must lead both teams to move clients', v_caller_id
      USING errcode = '42501';
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
  VALUES (p_to_team, p_client_id, v_caller_id);

  INSERT INTO team_activity (team_id, actor_id, event_type, payload)
  VALUES
    (p_from_team, v_caller_id, 'client_moved',
       jsonb_build_object(
         'client_id', p_client_id,
         'from_team', p_from_team,
         'to_team',   p_to_team)),
    (p_to_team,   v_caller_id, 'client_moved',
       jsonb_build_object(
         'client_id', p_client_id,
         'from_team', p_from_team,
         'to_team',   p_to_team));
END $$;

REVOKE ALL ON FUNCTION public.move_team_client(integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_team_client(integer, integer, integer) TO authenticated;

-- ============================================================
-- 14. list_active_teams_for_assignment
--     Original signature: (p_caller_id integer)
--     New signature:      ()
--     Permission: manage_teams
--     Source: 20260425_26_rpc_staff_views.sql
-- ============================================================
DROP FUNCTION IF EXISTS public.list_active_teams_for_assignment(integer);

CREATE OR REPLACE FUNCTION public.list_active_teams_for_assignment()
RETURNS TABLE (id integer, name text)
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

  RETURN QUERY
    SELECT t.id, t.name FROM teams t WHERE t.is_active = true ORDER BY t.name;
END $$;

REVOKE ALL ON FUNCTION public.list_active_teams_for_assignment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_active_teams_for_assignment() TO authenticated;

-- ============================================================
-- 15. list_assignable_users
--     Original signature: (p_caller_id integer, p_search text DEFAULT NULL)
--     New signature:      (p_search text DEFAULT NULL)
--     Permission: scope-by-role (visibility internal via can_assign_task)
--     Source: 20260426_30_rpc_tasks_read.sql (latest definition)
--
--     Note: can_assign_task was already migrated in Stage 8 to take a single
--     p_target_user_id argument; it derives v_caller_id internally.
--     list_assignable_users no longer passes a caller_id to can_assign_task —
--     the call-site is inside a SECURITY DEFINER function, and can_assign_task
--     uses current_dashboard_user_id() itself, which resolves to the same JWT
--     subject. This is safe.
-- ============================================================
DROP FUNCTION IF EXISTS public.list_assignable_users(integer, text);

CREATE OR REPLACE FUNCTION public.list_assignable_users(
  p_search text DEFAULT NULL
) RETURNS TABLE (
  id                  integer,
  name                text,
  role                text,
  ref_code            text,
  alias               text,
  eligibility_reason  text
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
  )
  SELECT c.id, c.name, c.role, c.ref_code, c.alias, c.eligibility_reason
    FROM candidates c
   ORDER BY c.name
   LIMIT 50;
END $$;

REVOKE ALL ON FUNCTION public.list_assignable_users(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_assignable_users(text) TO authenticated;

COMMIT;

-- VERIFY:
--   SELECT routine_name FROM information_schema.routines
--     WHERE routine_schema='public'
--     AND routine_name IN (
--       'list_teams','get_team_detail','create_team','update_team',
--       'archive_team','restore_team','list_team_activity',
--       'add_team_member','remove_team_member','move_team_member',
--       'assign_team_clients','unassign_team_client','move_team_client',
--       'list_active_teams_for_assignment','list_assignable_users'
--     )
--     ORDER BY routine_name;
--   -- Expected: 15 rows.
--
-- ROLLBACK (in reverse order):
--   DROP FUNCTION IF EXISTS public.list_assignable_users(text);
--   DROP FUNCTION IF EXISTS public.list_active_teams_for_assignment();
--   DROP FUNCTION IF EXISTS public.move_team_client(integer, integer, integer);
--   DROP FUNCTION IF EXISTS public.unassign_team_client(integer, integer);
--   DROP FUNCTION IF EXISTS public.assign_team_clients(integer, integer[]);
--   DROP FUNCTION IF EXISTS public.move_team_member(integer, integer, integer);
--   DROP FUNCTION IF EXISTS public.remove_team_member(integer, integer);
--   DROP FUNCTION IF EXISTS public.add_team_member(integer, integer);
--   DROP FUNCTION IF EXISTS public.list_team_activity(integer, integer, integer);
--   DROP FUNCTION IF EXISTS public.restore_team(integer);
--   DROP FUNCTION IF EXISTS public.archive_team(integer);
--   DROP FUNCTION IF EXISTS public.update_team(integer, text, integer);
--   DROP FUNCTION IF EXISTS public.create_team(text, integer);
--   DROP FUNCTION IF EXISTS public.get_team_detail(integer);
--   DROP FUNCTION IF EXISTS public.list_teams(text);
--   -- Then restore originals from 20260425_20, 21, 22, 26 and 20260426_30.
