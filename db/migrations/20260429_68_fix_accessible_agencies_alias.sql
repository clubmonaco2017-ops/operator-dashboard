-- Migration 68: fix ambiguous "agency_id" in scoped list_* / count_* RPCs
--
-- Подзапрос SELECT agency_id FROM accessible_agencies(...) попадал в неоднозначность
-- с OUT-параметром agency_id в функциях c RETURNS TABLE. Добавляем алиас acc.
-- Миграции 62 и 64 в репо синхронизированы (sed-patch); этот файл переписывает
-- 7 затронутых функций в существующей БД.

-- ========================================================================
-- TEAMS BUCKET
-- ========================================================================

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
      (p_agency_id IS NULL AND t.agency_id IN (SELECT acc.agency_id FROM accessible_agencies(v_caller_id) acc))
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
      (p_agency_id IS NULL AND t.agency_id IN (SELECT acc.agency_id FROM accessible_agencies(v_caller_id) acc))
    )
  ORDER BY t.name;
END $$;

REVOKE ALL ON FUNCTION public.list_active_teams_for_assignment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_active_teams_for_assignment(uuid) TO authenticated;

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
        OR (p_agency_id IS NULL AND u.agency_id IN (SELECT acc.agency_id FROM accessible_agencies(v_caller_id) acc))
      )
  )
  SELECT c.id, c.name, c.role, c.ref_code, c.alias, c.eligibility_reason, c.agency_id
    FROM candidates c
   ORDER BY c.name
   LIMIT 50;
END $$;

REVOKE ALL ON FUNCTION public.list_assignable_users(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_assignable_users(text, uuid) TO authenticated;

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
      (p_agency_id IS NULL AND u.agency_id IN (SELECT acc.agency_id FROM accessible_agencies(v_caller_id) acc))
    )
  ORDER BY lower(COALESCE(
             NULLIF(trim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''),
             u.alias,
             u.email))
  LIMIT 50;
END $$;

REVOKE ALL ON FUNCTION public.list_unassigned_operators(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_unassigned_operators(text, uuid) TO authenticated;

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
      (p_agency_id IS NULL AND u.agency_id IN (SELECT acc.agency_id FROM accessible_agencies(v_caller_id) acc))
    )
  ORDER BY lower(COALESCE(
             NULLIF(trim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''),
             u.alias,
             u.email));
END $$;

REVOKE ALL ON FUNCTION public.list_curated_operators(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_curated_operators(integer, uuid) TO authenticated;

-- ========================================================================
-- TASKS BUCKET
-- ========================================================================

-- 9. list_tasks — T.1 + p_agency_id (combined view via assignee.agency_id)
-- ============================================================

DROP FUNCTION IF EXISTS public.list_tasks(text, text, text);

CREATE OR REPLACE FUNCTION public.list_tasks(
  p_box       text DEFAULT 'inbox',
  p_status    text DEFAULT 'all',
  p_search    text DEFAULT NULL,
  p_agency_id uuid DEFAULT NULL
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
  created_at         timestamptz,
  agency_id          uuid,
  agency_name        text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_role      text;
  v_search    text;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  IF p_box NOT IN ('inbox', 'outbox', 'all') THEN
    RAISE EXCEPTION 'недопустимое значение box: %', p_box;
  END IF;
  IF p_status NOT IN ('all', 'pending', 'in_progress', 'done', 'overdue', 'cancelled') THEN
    RAISE EXCEPTION 'недопустимое значение status: %', p_status;
  END IF;

  SELECT u.role INTO v_role FROM dashboard_users u
   WHERE u.id = v_caller_id AND u.is_active = true;
  IF v_role IS NULL THEN
    RETURN;
  END IF;

  IF p_box = 'all' AND NOT has_permission(v_caller_id, 'view_all_tasks') THEN
    RAISE EXCEPTION 'только администратор может видеть все задачи' USING errcode = '42501';
  END IF;
  IF p_box = 'outbox' AND v_role = 'operator' THEN
    RAISE EXCEPTION 'оператор не может использовать outbox';
  END IF;

  IF p_agency_id IS NOT NULL THEN
    PERFORM assert_agency_access(v_caller_id, p_agency_id);
  END IF;

  v_search := NULLIF(trim(COALESCE(p_search, '')), '');

  RETURN QUERY
  WITH base AS (
    SELECT
      t.id, t.title, t.description, t.created_by,
      COALESCE(NULLIF(trim(COALESCE(cu.first_name,'') || ' ' || COALESCE(cu.last_name,'')), ''),
               cu.alias, cu.email) AS created_by_name,
      t.assigned_to,
      COALESCE(NULLIF(trim(COALESCE(au.first_name,'') || ' ' || COALESCE(au.last_name,'')), ''),
               au.alias, au.email) AS assigned_to_name,
      t.deadline, t.status,
      CASE
        WHEN t.deadline IS NOT NULL AND t.deadline < now()
         AND t.status IN ('pending', 'in_progress')
        THEN 'overdue' ELSE t.status END AS effective_status,
      t.completed_at,
      EXISTS (SELECT 1 FROM task_reports tr WHERE tr.task_id = t.id) AS has_report,
      t.created_at,
      au.agency_id AS agency_id,
      ag.name      AS agency_name
    FROM tasks t
    LEFT JOIN dashboard_users cu ON cu.id = t.created_by
    LEFT JOIN dashboard_users au ON au.id = t.assigned_to
    LEFT JOIN agencies        ag ON ag.id = au.agency_id
    WHERE
      ((p_box = 'inbox'  AND t.assigned_to = v_caller_id)
        OR (p_box = 'outbox' AND t.created_by = v_caller_id)
        OR (p_box = 'all'))
      AND (
        -- Agency filter:
        --   p_agency_id specified → only that agency
        --   p_agency_id NULL → caller's accessible agencies, plus tasks with NULL
        --   agency (admin assignees) when caller has view_all_tasks
        (p_agency_id IS NOT NULL AND au.agency_id = p_agency_id)
        OR
        (p_agency_id IS NULL AND (
          au.agency_id IN (SELECT acc.agency_id FROM accessible_agencies(v_caller_id) acc)
          OR (au.agency_id IS NULL AND has_permission(v_caller_id, 'view_all_tasks'))
        ))
      )
  )
  SELECT
    b.id, b.title, b.description, b.created_by, b.created_by_name,
    b.assigned_to, b.assigned_to_name, b.deadline, b.status, b.effective_status,
    b.completed_at, b.has_report, b.created_at, b.agency_id, b.agency_name
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

REVOKE ALL ON FUNCTION public.list_tasks(text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_tasks(text, text, text, uuid) TO authenticated;

-- 11. count_overdue_tasks — T.1 + p_agency_id (combined view)
-- ============================================================

DROP FUNCTION IF EXISTS public.count_overdue_tasks();

CREATE OR REPLACE FUNCTION public.count_overdue_tasks(
  p_agency_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_count     integer;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  IF p_agency_id IS NOT NULL THEN
    PERFORM assert_agency_access(v_caller_id, p_agency_id);
  END IF;

  IF has_permission(v_caller_id, 'view_all_tasks') THEN
    SELECT count(*)::integer INTO v_count
      FROM tasks t
      LEFT JOIN dashboard_users u ON u.id = t.assigned_to
     WHERE t.deadline IS NOT NULL
       AND t.deadline < now()
       AND t.status IN ('pending', 'in_progress')
       AND (
         (p_agency_id IS NOT NULL AND u.agency_id = p_agency_id)
         OR (p_agency_id IS NULL AND (
           u.agency_id IN (SELECT acc.agency_id FROM accessible_agencies(v_caller_id) acc)
           OR u.agency_id IS NULL
         ))
       );
  ELSE
    -- Self-scope: own overdue tasks (creator or assignee), agency check unnecessary
    -- (caller is part of any task they're creator/assignee on).
    SELECT count(*)::integer INTO v_count
      FROM tasks
     WHERE (created_by = v_caller_id OR assigned_to = v_caller_id)
       AND deadline IS NOT NULL
       AND deadline < now()
       AND status IN ('pending', 'in_progress');
  END IF;

  RETURN COALESCE(v_count, 0);
END $$;

REVOKE ALL ON FUNCTION public.count_overdue_tasks(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_overdue_tasks(uuid) TO authenticated;
