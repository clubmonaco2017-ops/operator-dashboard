-- Migration 86: task unread RPCs + list_tasks extension.
--
-- Adds:
--   - mark_task_seen(p_task_id) — upsert (current_user, task_id, now())
--   - count_unread_tasks() — counter for current user
--   - list_tasks (DROP+CREATE) — adds is_unread boolean column

BEGIN;

-- ============================================================
-- mark_task_seen(p_task_id)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_task_seen(p_task_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  INSERT INTO task_last_seen (user_id, task_id, last_seen_at)
  VALUES (v_caller_id, p_task_id, now())
  ON CONFLICT (user_id, task_id) DO UPDATE SET last_seen_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.mark_task_seen(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_task_seen(integer) TO authenticated;

-- ============================================================
-- count_unread_tasks() — counter for current user
-- ============================================================
CREATE OR REPLACE FUNCTION public.count_unread_tasks()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_count     integer;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM tasks t
  WHERE (t.assigned_to = v_caller_id OR t.created_by = v_caller_id)
    AND EXISTS (
      SELECT 1
      FROM task_activity ta
      LEFT JOIN task_last_seen tls
        ON tls.user_id = v_caller_id AND tls.task_id = t.id
      WHERE ta.task_id = t.id
        AND ta.actor_id IS DISTINCT FROM v_caller_id
        AND ta.created_at > COALESCE(tls.last_seen_at, '1970-01-01'::timestamptz)
    );

  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.count_unread_tasks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_unread_tasks() TO authenticated;

-- ============================================================
-- list_tasks — DROP+CREATE с новой колонкой is_unread
-- ============================================================
DROP FUNCTION IF EXISTS public.list_tasks(text, text, text, uuid);

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
  agency_name        text,
  is_unread          boolean
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
      ag.name      AS agency_name,
      EXISTS (
        SELECT 1
        FROM task_activity ta
        LEFT JOIN task_last_seen tls
          ON tls.user_id = v_caller_id AND tls.task_id = t.id
        WHERE ta.task_id = t.id
          AND ta.actor_id IS DISTINCT FROM v_caller_id
          AND ta.created_at > COALESCE(tls.last_seen_at, '1970-01-01'::timestamptz)
      ) AS is_unread
    FROM tasks t
    LEFT JOIN dashboard_users cu ON cu.id = t.created_by
    LEFT JOIN dashboard_users au ON au.id = t.assigned_to
    LEFT JOIN agencies        ag ON ag.id = au.agency_id
    WHERE
      ((p_box = 'inbox'  AND t.assigned_to = v_caller_id)
        OR (p_box = 'outbox' AND t.created_by = v_caller_id)
        OR (p_box = 'all'))
      AND (
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
    b.completed_at, b.has_report, b.created_at, b.agency_id, b.agency_name,
    b.is_unread
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

COMMIT;
