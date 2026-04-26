-- Migration 30: Tasks read RPCs (Subplan 5 Stage 3)
--   list_tasks             — box-tabbed list (inbox / outbox / all) with computed
--                            effective_status, search, has_report flag
--   get_task_detail        — single row + report jsonb + last-12 activity jsonb
--   count_overdue_tasks    — Sidebar badge counter for caller
--   list_assignable_users  — candidates can_assign_task() returns true for, with
--                            eligibility_reason for the UI tooltip
--
-- Permissions:
--   * list_tasks
--       - p_box='all'    → requires has_permission(caller,'view_all_tasks')
--       - p_box='outbox' → forbidden for role='operator' (operators don't create)
--       - p_box='inbox'  → assignee scope (any active user)
--   * get_task_detail   → caller is creator OR assignee OR has view_all_tasks;
--                         else empty result.
--   * count_overdue_tasks → no gate (own counter only).
--   * list_assignable_users → relies on can_assign_task() per-row.
--
-- D-7: 'overdue' is a computed effective_status (CASE on deadline+status), never
-- materialized. p_status='overdue' filter operates against the computed value, so
-- list_tasks wraps the SELECT in a CTE and filters in the outer query.
--
-- Audit event_type vocabulary stays open (no CHECK on task_activity in Stage 1) —
-- nothing in this read-only migration mutates it.

BEGIN;

-- ---------------------------------------------------------------------------
-- list_tasks — box-tabbed task list with computed effective_status
-- ---------------------------------------------------------------------------
-- p_box:    'inbox'   → tasks WHERE assigned_to = caller
--           'outbox'  → tasks WHERE created_by  = caller (forbidden for operators)
--           'all'     → all tasks (requires view_all_tasks permission)
-- p_status: 'all' | 'pending' | 'in_progress' | 'done' | 'overdue' | 'cancelled'
-- p_search: ILIKE on title / description / creator name / assignee name
-- ORDER BY created_at DESC, LIMIT 200.
CREATE OR REPLACE FUNCTION list_tasks(
  p_caller_id integer,
  p_box       text DEFAULT 'inbox',
  p_status    text DEFAULT 'all',
  p_search    text DEFAULT NULL
) RETURNS TABLE (
  id                 integer,
  title              text,
  description        text,
  created_by         integer,
  created_by_name    text,
  assigned_to        integer,
  assigned_to_name   text,
  deadline           timestamptz,
  status             text,
  effective_status   text,
  completed_at       timestamptz,
  has_report         boolean,
  created_at         timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_role   text;
  v_search text;
BEGIN
  IF p_box NOT IN ('inbox', 'outbox', 'all') THEN
    RAISE EXCEPTION 'недопустимое значение box: %', p_box;
  END IF;

  IF p_status NOT IN ('all', 'pending', 'in_progress', 'done', 'overdue', 'cancelled') THEN
    RAISE EXCEPTION 'недопустимое значение status: %', p_status;
  END IF;

  SELECT u.role INTO v_role
    FROM dashboard_users u
   WHERE u.id = p_caller_id AND u.is_active = true;

  IF v_role IS NULL THEN
    RETURN;
  END IF;

  IF p_box = 'all' AND NOT has_permission(p_caller_id, 'view_all_tasks') THEN
    RAISE EXCEPTION 'только администратор может видеть все задачи';
  END IF;

  IF p_box = 'outbox' AND v_role = 'operator' THEN
    RAISE EXCEPTION 'оператор не может использовать outbox';
  END IF;

  v_search := NULLIF(trim(COALESCE(p_search, '')), '');

  RETURN QUERY
  WITH base AS (
    SELECT
      t.id,
      t.title,
      t.description,
      t.created_by,
      COALESCE(
        NULLIF(trim(COALESCE(cu.first_name, '') || ' ' || COALESCE(cu.last_name, '')), ''),
        cu.alias,
        cu.email
      ) AS created_by_name,
      t.assigned_to,
      COALESCE(
        NULLIF(trim(COALESCE(au.first_name, '') || ' ' || COALESCE(au.last_name, '')), ''),
        au.alias,
        au.email
      ) AS assigned_to_name,
      t.deadline,
      t.status,
      CASE
        WHEN t.deadline IS NOT NULL
         AND t.deadline < now()
         AND t.status IN ('pending', 'in_progress')
        THEN 'overdue'
        ELSE t.status
      END AS effective_status,
      t.completed_at,
      EXISTS (SELECT 1 FROM task_reports tr WHERE tr.task_id = t.id) AS has_report,
      t.created_at
    FROM tasks t
    LEFT JOIN dashboard_users cu ON cu.id = t.created_by
    LEFT JOIN dashboard_users au ON au.id = t.assigned_to
    WHERE
      (
        (p_box = 'inbox'  AND t.assigned_to = p_caller_id)
        OR (p_box = 'outbox' AND t.created_by = p_caller_id)
        OR (p_box = 'all')
      )
  )
  SELECT
    b.id,
    b.title,
    b.description,
    b.created_by,
    b.created_by_name,
    b.assigned_to,
    b.assigned_to_name,
    b.deadline,
    b.status,
    b.effective_status,
    b.completed_at,
    b.has_report,
    b.created_at
  FROM base b
  WHERE
    (p_status = 'all' OR b.effective_status = p_status)
    AND (
      v_search IS NULL
      OR b.title              ILIKE '%' || v_search || '%'
      OR b.description        ILIKE '%' || v_search || '%'
      OR b.created_by_name    ILIKE '%' || v_search || '%'
      OR b.assigned_to_name   ILIKE '%' || v_search || '%'
    )
  ORDER BY b.created_at DESC
  LIMIT 200;
END $$;

GRANT EXECUTE ON FUNCTION list_tasks(integer, text, text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_task_detail — single task row + report jsonb + last-12 activity jsonb
-- ---------------------------------------------------------------------------
-- Visibility: caller is creator OR assignee OR has view_all_tasks.
-- Empty result if not visible (no exception — UI shows "not found / no access").
CREATE OR REPLACE FUNCTION get_task_detail(
  p_caller_id integer,
  p_task_id   integer
) RETURNS TABLE (
  id                 integer,
  title              text,
  description        text,
  created_by         integer,
  created_by_name    text,
  created_by_role    text,
  assigned_to        integer,
  assigned_to_name   text,
  assigned_to_role   text,
  deadline           timestamptz,
  status             text,
  effective_status   text,
  completed_at       timestamptz,
  has_report         boolean,
  created_at         timestamptz,
  report             jsonb,
  activity           jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_role        text;
  v_visible     boolean;
  v_creator     integer;
  v_assignee    integer;
BEGIN
  SELECT u.role INTO v_role
    FROM dashboard_users u
   WHERE u.id = p_caller_id AND u.is_active = true;
  IF v_role IS NULL THEN
    RETURN;
  END IF;

  SELECT t.created_by, t.assigned_to INTO v_creator, v_assignee
    FROM tasks t WHERE t.id = p_task_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_visible := (v_creator IS NOT DISTINCT FROM p_caller_id)
            OR (v_assignee = p_caller_id)
            OR has_permission(p_caller_id, 'view_all_tasks');

  IF NOT v_visible THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.title,
    t.description,
    t.created_by,
    COALESCE(
      NULLIF(trim(COALESCE(cu.first_name, '') || ' ' || COALESCE(cu.last_name, '')), ''),
      cu.alias,
      cu.email
    ) AS created_by_name,
    cu.role AS created_by_role,
    t.assigned_to,
    COALESCE(
      NULLIF(trim(COALESCE(au.first_name, '') || ' ' || COALESCE(au.last_name, '')), ''),
      au.alias,
      au.email
    ) AS assigned_to_name,
    au.role AS assigned_to_role,
    t.deadline,
    t.status,
    CASE
      WHEN t.deadline IS NOT NULL
       AND t.deadline < now()
       AND t.status IN ('pending', 'in_progress')
      THEN 'overdue'
      ELSE t.status
    END AS effective_status,
    t.completed_at,
    EXISTS (SELECT 1 FROM task_reports tr WHERE tr.task_id = t.id) AS has_report,
    t.created_at,
    (
      SELECT jsonb_build_object(
        'id',            tr.id,
        'reporter_id',   tr.reporter_id,
        'reporter_name', COALESCE(
                           NULLIF(trim(COALESCE(ru.first_name, '') || ' ' || COALESCE(ru.last_name, '')), ''),
                           ru.alias,
                           ru.email
                         ),
        'content',       tr.content,
        'media',         tr.media,
        'created_at',    tr.created_at,
        'updated_at',    tr.updated_at
      )
      FROM task_reports tr
      LEFT JOIN dashboard_users ru ON ru.id = tr.reporter_id
      WHERE tr.task_id = t.id
    ) AS report,
    COALESCE(
      (
        SELECT jsonb_agg(evt ORDER BY (evt->>'created_at')::timestamptz DESC)
        FROM (
          SELECT jsonb_build_object(
            'id',         a.id,
            'actor_id',   a.actor_id,
            'actor_name', CASE
                            WHEN a.actor_id IS NULL THEN 'Система'
                            ELSE COALESCE(
                              NULLIF(trim(COALESCE(actor.first_name, '') || ' ' || COALESCE(actor.last_name, '')), ''),
                              actor.alias,
                              actor.email
                            )
                          END,
            'event_type', a.event_type,
            'payload',    a.payload,
            'created_at', a.created_at
          ) AS evt
          FROM task_activity a
          LEFT JOIN dashboard_users actor ON actor.id = a.actor_id
          WHERE a.task_id = t.id
          ORDER BY a.created_at DESC
          LIMIT 12
        ) recent
      ),
      '[]'::jsonb
    ) AS activity
  FROM tasks t
  LEFT JOIN dashboard_users cu ON cu.id = t.created_by
  LEFT JOIN dashboard_users au ON au.id = t.assigned_to
  WHERE t.id = p_task_id;
END $$;

GRANT EXECUTE ON FUNCTION get_task_detail(integer, integer) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- count_overdue_tasks — Sidebar badge for caller (own creator/assignee scope)
-- ---------------------------------------------------------------------------
-- Counts tasks where caller is created_by OR assigned_to AND task is overdue.
-- No permission gate (operator can call for own count).
CREATE OR REPLACE FUNCTION count_overdue_tasks(
  p_caller_id integer
) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*)::integer INTO v_count
    FROM tasks
   WHERE (created_by = p_caller_id OR assigned_to = p_caller_id)
     AND deadline IS NOT NULL
     AND deadline < now()
     AND status IN ('pending', 'in_progress');

  RETURN COALESCE(v_count, 0);
END $$;

GRANT EXECUTE ON FUNCTION count_overdue_tasks(integer) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- list_assignable_users — candidates can_assign_task() returns true for
-- ---------------------------------------------------------------------------
-- Returns active users the caller can assign tasks to, with eligibility_reason
-- for UI tooltip:
--   admin/superadmin caller            → 'admin_full_access'
--   teamlead/moderator → teamlead/mod  → 'cross_staff'
--   teamlead → operator                → 'own_team_operator'
--   moderator → operator               → 'curated_operator'
-- Search ILIKE on first_name/last_name/alias/ref_code. ORDER BY name. LIMIT 50.
CREATE OR REPLACE FUNCTION list_assignable_users(
  p_caller_id integer,
  p_search    text DEFAULT NULL
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
  v_caller_role text;
  v_search      text;
BEGIN
  SELECT u.role INTO v_caller_role
    FROM dashboard_users u
   WHERE u.id = p_caller_id AND u.is_active = true;

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
      AND can_assign_task(p_caller_id, u.id)
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

GRANT EXECUTE ON FUNCTION list_assignable_users(integer, text) TO anon, authenticated;

COMMIT;

-- VERIFY:
--   SELECT routine_name FROM information_schema.routines
--     WHERE routine_schema='public'
--     AND routine_name IN ('list_tasks','get_task_detail',
--                          'count_overdue_tasks','list_assignable_users')
--     ORDER BY routine_name;
--   -- Expected: 4 rows.
--
--   -- Smoke (на staging, после Stage 4 mutations или ручного INSERT):
--   --   SELECT * FROM list_tasks(<operator_id>, 'inbox', 'all', NULL);
--   --   SELECT * FROM list_tasks(<tl_id>, 'outbox', 'overdue', NULL);
--   --   SELECT * FROM list_tasks(<admin_id>, 'all', 'pending', 'demo');
--   --   SELECT list_tasks(<operator_id>, 'outbox', 'all', NULL); -- raises
--   --   SELECT list_tasks(<operator_id>, 'all', 'all', NULL);    -- raises (no perm)
--   --   SELECT * FROM get_task_detail(<creator_or_assignee>, <task_id>);
--   --   SELECT count_overdue_tasks(<caller_id>);
--   --   SELECT * FROM list_assignable_users(<tl_id>, NULL);
--   --   SELECT * FROM list_assignable_users(<mod_id>, 'demo');
--
-- ROLLBACK:
--   DROP FUNCTION list_assignable_users(integer, text);
--   DROP FUNCTION count_overdue_tasks(integer);
--   DROP FUNCTION get_task_detail(integer, integer);
--   DROP FUNCTION list_tasks(integer, text, text, text);
