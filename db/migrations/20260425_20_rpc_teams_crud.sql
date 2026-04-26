-- Migration 20: Teams CRUD + activity RPC functions (Subplan 4 Stage 2)
--   list_teams           — list teams with scope-by-role + editable flag + counts
--   get_team_detail      — single team + members + clients + counts
--   create_team          — create a new team (admin/superadmin only)
--   update_team          — partial update (rename / change lead) with per-field audit
--   archive_team         — soft-delete (cascade-release members and clients)
--   restore_team         — restore archived team (does not restore prior membership)
--   list_team_activity   — events for the «Активность» panel
--
-- Permissions:
--   * Mutating RPCs (create / update / archive / restore) require
--     has_permission(caller,'manage_teams') AND role IN ('superadmin','admin').
--   * Read RPCs (list_teams / get_team_detail / list_team_activity) gate
--     visibility by caller's role: staff sees all teams, operators see only
--     teams they are a member of, others see nothing.
--
-- Audit event types (open vocabulary, no CHECK in Stage 1 schema):
--   team_created, team_renamed, lead_changed, team_archived, team_restored.

BEGIN;

-- ---------------------------------------------------------------------------
-- list_teams — список команд с фильтром is_active и scope-by-role
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION list_teams(
  p_caller_id integer,
  p_active    text DEFAULT 'active'   -- 'active' | 'archived' | 'all'
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
  v_role text;
BEGIN
  SELECT u.role INTO v_role FROM dashboard_users u WHERE u.id = p_caller_id;

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
    (v_role IN ('superadmin','admin') OR t.lead_user_id = p_caller_id) AS editable,
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
                         AND tm.operator_id = p_caller_id))
    )
  ORDER BY t.created_at DESC;
END $$;

GRANT EXECUTE ON FUNCTION list_teams(integer, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_team_detail — детали одной команды + members + clients + creator
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_team_detail(
  p_caller_id integer,
  p_team_id   integer
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
  v_role    text;
  v_visible boolean;
BEGIN
  SELECT u.role INTO v_role FROM dashboard_users u WHERE u.id = p_caller_id;

  IF v_role IS NULL THEN
    RETURN;
  END IF;

  -- Visibility scope check (same rules as list_teams).
  IF v_role IN ('superadmin','admin','teamlead','moderator') THEN
    v_visible := EXISTS (SELECT 1 FROM teams t WHERE t.id = p_team_id);
  ELSIF v_role = 'operator' THEN
    v_visible := EXISTS (SELECT 1 FROM team_members tm
                         WHERE tm.team_id = p_team_id
                           AND tm.operator_id = p_caller_id);
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
    (v_role IN ('superadmin','admin') OR t.lead_user_id = p_caller_id) AS editable,
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

GRANT EXECUTE ON FUNCTION get_team_detail(integer, integer) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_team — создание команды (только admin/superadmin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_team(
  p_caller_id   integer,
  p_name        text,
  p_lead_user_id integer
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_role text;
  v_lead_role   text;
  v_lead_active boolean;
  v_new_id      integer;
BEGIN
  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = p_caller_id;

  IF NOT has_permission(p_caller_id, 'manage_teams')
     OR v_caller_role IS NULL
     OR v_caller_role NOT IN ('superadmin','admin') THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', p_caller_id;
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
  VALUES (trim(p_name), p_lead_user_id, true, p_caller_id)
  RETURNING id INTO v_new_id;

  INSERT INTO team_activity (team_id, actor_id, event_type, payload)
  VALUES (
    v_new_id, p_caller_id, 'team_created',
    jsonb_build_object('name', trim(p_name), 'lead_user_id', p_lead_user_id)
  );

  RETURN v_new_id;
END $$;

GRANT EXECUTE ON FUNCTION create_team(integer, text, integer) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- update_team — частичный update имени и/или лида (admin/superadmin only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_team(
  p_caller_id    integer,
  p_team_id      integer,
  p_name         text    DEFAULT NULL,
  p_lead_user_id integer DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_role text;
  v_lead_role   text;
  v_lead_active boolean;
  v_old_name    text;
  v_old_lead    integer;
BEGIN
  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = p_caller_id;

  IF NOT has_permission(p_caller_id, 'manage_teams')
     OR v_caller_role IS NULL
     OR v_caller_role NOT IN ('superadmin','admin') THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', p_caller_id;
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
        p_team_id, p_caller_id, 'team_renamed',
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
      p_team_id, p_caller_id, 'lead_changed',
      jsonb_build_object('from_user_id', v_old_lead, 'to_user_id', p_lead_user_id)
    );
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION update_team(integer, integer, text, integer) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- archive_team — soft-delete с каскадным освобождением операторов и клиентов
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION archive_team(
  p_caller_id integer,
  p_team_id   integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_role text;
  v_was_active  boolean;
  v_op_count    integer := 0;
  v_cl_count    integer := 0;
BEGIN
  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = p_caller_id;

  IF NOT has_permission(p_caller_id, 'manage_teams')
     OR v_caller_role IS NULL
     OR v_caller_role NOT IN ('superadmin','admin') THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', p_caller_id;
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
    p_team_id, p_caller_id, 'team_archived',
    jsonb_build_object('released_operators', v_op_count, 'released_clients', v_cl_count)
  );

  RETURN jsonb_build_object('released_operators', v_op_count, 'released_clients', v_cl_count);
END $$;

GRANT EXECUTE ON FUNCTION archive_team(integer, integer) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- restore_team — восстановление команды (членство НЕ восстанавливается)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION restore_team(
  p_caller_id integer,
  p_team_id   integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_role text;
  v_was_active  boolean;
BEGIN
  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = p_caller_id;

  IF NOT has_permission(p_caller_id, 'manage_teams')
     OR v_caller_role IS NULL
     OR v_caller_role NOT IN ('superadmin','admin') THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', p_caller_id;
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
  VALUES (p_team_id, p_caller_id, 'team_restored', '{}'::jsonb);
END $$;

GRANT EXECUTE ON FUNCTION restore_team(integer, integer) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- list_team_activity — события для правой колонки «Активность»
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION list_team_activity(
  p_caller_id integer,
  p_team_id   integer,
  p_limit     integer DEFAULT 12,
  p_offset    integer DEFAULT 0
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
  v_role    text;
  v_visible boolean;
BEGIN
  SELECT u.role INTO v_role FROM dashboard_users u WHERE u.id = p_caller_id;

  IF v_role IS NULL THEN
    RETURN;
  END IF;

  IF v_role IN ('superadmin','admin','teamlead','moderator') THEN
    v_visible := EXISTS (SELECT 1 FROM teams t WHERE t.id = p_team_id);
  ELSIF v_role = 'operator' THEN
    v_visible := EXISTS (SELECT 1 FROM team_members tm
                         WHERE tm.team_id = p_team_id
                           AND tm.operator_id = p_caller_id);
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

GRANT EXECUTE ON FUNCTION list_team_activity(integer, integer, integer, integer)
  TO anon, authenticated;

COMMIT;

-- VERIFY:
--   SELECT routine_name FROM information_schema.routines
--     WHERE routine_schema='public'
--     AND routine_name IN ('list_teams','get_team_detail','create_team',
--                          'update_team','archive_team','restore_team',
--                          'list_team_activity')
--     ORDER BY routine_name;
--   -- Expected: 7 rows.
--
-- ROLLBACK:
--   DROP FUNCTION list_team_activity(integer, integer, integer, integer);
--   DROP FUNCTION restore_team(integer, integer);
--   DROP FUNCTION archive_team(integer, integer);
--   DROP FUNCTION update_team(integer, integer, text, integer);
--   DROP FUNCTION create_team(integer, text, integer);
--   DROP FUNCTION get_team_detail(integer, integer);
--   DROP FUNCTION list_teams(integer, text);
