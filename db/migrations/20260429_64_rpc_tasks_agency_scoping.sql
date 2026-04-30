-- Migration 64: Stage 9 — Scope tasks RPC bucket to agency context
--
-- Tasks have NO direct agency_id column. Scoping path: tasks → assigned_to →
-- dashboard_users.agency_id. The task's agency = the assignee's agency.
--
-- Most assignees are operators (agency_id NOT NULL). admin/superadmin assignees
-- are possible (cross-agency coordination per can_assign_task rules) — for them
-- agency_id IS NULL and the task is "global" / unscoped.
--
-- Enforced T.4 invariant in create_task / update_task reassign:
--   p_agency_id IS NOT DISTINCT FROM assignee.agency_id   (NULL-safe equality)
-- For T.1 (list/count) and T.3 (read/update/cancel/delete via task lookup):
--   if assignee.agency_id IS NULL → skip assert_agency_access (admin task — visible
--   to anyone with view_all_tasks or who is creator/assignee — existing perm gates
--   in place)
--   if assignee.agency_id IS NOT NULL → assert_agency_access(caller, assignee.agency_id)
--
-- BREAKING:
--   - create_task gains required p_agency_id (NULL allowed only when assignee is admin/superadmin)
--   - list_tasks gains optional p_agency_id (defaults NULL = combined view)
--   - count_overdue_tasks gains optional p_agency_id (defaults NULL = combined view)
--
-- See plan: docs/superpowers/plans/2026-04-29-multi-agency-scoping.md (Stage 9).

BEGIN;

-- ============================================================
-- 1. can_assign_task — UNCHANGED. Internal helper, role-only logic.
-- ============================================================
-- (Kept as is from migration 42. No agency scoping — caller's role gates already
--  enforce who can assign to whom; agency invariant is enforced at create_task.)

-- ============================================================
-- 2. create_task — T.2 + T.4 (assignee.agency = p_agency_id, NULL-safe)
-- ============================================================

DROP FUNCTION IF EXISTS public.create_task(text, text, timestamptz, integer);

CREATE OR REPLACE FUNCTION public.create_task(
  p_title       text,
  p_description text,
  p_deadline    timestamptz,
  p_assigned_to integer,
  p_agency_id   uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id        integer := current_dashboard_user_id();
  v_assignee_agency  uuid;
  v_assignee_active  boolean;
  v_new_id           integer;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  IF NOT has_permission(v_caller_id, 'create_tasks') THEN
    RAISE EXCEPTION 'caller % lacks create_tasks', v_caller_id USING errcode = '42501';
  END IF;

  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'название задачи обязательно';
  END IF;

  IF p_assigned_to IS NULL THEN
    RAISE EXCEPTION 'исполнитель не найден или деактивирован';
  END IF;

  SELECT u.agency_id, u.is_active INTO v_assignee_agency, v_assignee_active
    FROM dashboard_users u WHERE u.id = p_assigned_to;
  IF v_assignee_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'исполнитель не найден или деактивирован';
  END IF;

  IF NOT can_assign_task(p_assigned_to) THEN
    RAISE EXCEPTION 'Нельзя назначить задачу этому сотруднику. Только своим операторам или другим лидам/модераторам.';
  END IF;

  -- T.4: assignee's agency must match the requested agency context (NULL-safe).
  IF p_agency_id IS DISTINCT FROM v_assignee_agency THEN
    RAISE EXCEPTION 'assignee % (agency %) and requested agency % differ',
      p_assigned_to, v_assignee_agency, p_agency_id USING errcode = '23514';
  END IF;

  -- Caller must have access to the agency (skip when NULL — admin task).
  IF p_agency_id IS NOT NULL THEN
    PERFORM assert_agency_access(v_caller_id, p_agency_id);
  END IF;

  INSERT INTO tasks (title, description, created_by, assigned_to, deadline, status)
  VALUES (
    trim(p_title),
    NULLIF(trim(coalesce(p_description, '')), ''),
    v_caller_id,
    p_assigned_to,
    p_deadline,
    'pending'
  )
  RETURNING id INTO v_new_id;

  INSERT INTO task_activity (task_id, actor_id, event_type, payload)
  VALUES (
    v_new_id, v_caller_id, 'task_created',
    jsonb_build_object(
      'title',       trim(p_title),
      'assigned_to', p_assigned_to,
      'deadline',    p_deadline,
      'agency_id',   p_agency_id
    )
  );

  RETURN v_new_id;
END $$;

REVOKE ALL ON FUNCTION public.create_task(text, text, timestamptz, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_task(text, text, timestamptz, integer, uuid)
  TO authenticated;

-- ============================================================
-- 3. update_task — T.3 (resolve via assignee) + T.4 on reassign
-- ============================================================

DROP FUNCTION IF EXISTS public.update_task(integer, text, text, timestamptz, integer, boolean);

CREATE OR REPLACE FUNCTION public.update_task(
  p_task_id        integer,
  p_title          text        DEFAULT NULL,
  p_description    text        DEFAULT NULL,
  p_deadline       timestamptz DEFAULT NULL,
  p_assigned_to    integer     DEFAULT NULL,
  p_clear_deadline boolean     DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id       integer := current_dashboard_user_id();
  v_old_title       text;
  v_old_description text;
  v_old_deadline    timestamptz;
  v_old_assigned_to integer;
  v_status          text;
  v_created_by      integer;
  v_caller_role     text;
  v_changed_fields  text[] := ARRAY[]::text[];
  v_old_agency      uuid;
  v_new_agency      uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT title, description, deadline, assigned_to, status, created_by
    INTO v_old_title, v_old_description, v_old_deadline, v_old_assigned_to,
         v_status, v_created_by
    FROM tasks
   WHERE id = p_task_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'задача не найдена';
  END IF;

  -- Permission: admin/superadmin OR creator.
  SELECT role INTO v_caller_role FROM dashboard_users WHERE id = v_caller_id;
  IF v_caller_role IS NULL
     OR (v_caller_role NOT IN ('admin', 'superadmin')
         AND v_created_by IS DISTINCT FROM v_caller_id) THEN
    RAISE EXCEPTION 'недостаточно прав для редактирования задачи' USING errcode = '42501';
  END IF;

  -- Resolve current task agency via existing assignee, assert access (skip when NULL).
  SELECT u.agency_id INTO v_old_agency
    FROM dashboard_users u WHERE u.id = v_old_assigned_to;
  IF v_old_agency IS NOT NULL THEN
    PERFORM assert_agency_access(v_caller_id, v_old_agency);
  END IF;

  -- Reassignment (I-8 + I-2).
  IF p_assigned_to IS NOT NULL AND p_assigned_to IS DISTINCT FROM v_old_assigned_to THEN
    IF v_status <> 'pending' THEN
      RAISE EXCEPTION 'Переназначение возможно только для задач в ожидании. Создайте новую задачу.';
    END IF;

    IF NOT can_assign_task(p_assigned_to) THEN
      RAISE EXCEPTION 'Нельзя назначить задачу этому сотруднику. Только своим операторам или другим лидам/модераторам.';
    END IF;

    -- T.4: new assignee's agency must equal current task agency (NULL-safe).
    SELECT u.agency_id INTO v_new_agency
      FROM dashboard_users u WHERE u.id = p_assigned_to;
    IF v_new_agency IS DISTINCT FROM v_old_agency THEN
      RAISE EXCEPTION 'new assignee % (agency %) and task agency % differ — cross-agency reassign not allowed',
        p_assigned_to, v_new_agency, v_old_agency USING errcode = '23514';
    END IF;

    UPDATE tasks
       SET assigned_to = p_assigned_to,
           updated_at  = now()
     WHERE id = p_task_id;

    INSERT INTO task_activity (task_id, actor_id, event_type, payload)
    VALUES (
      p_task_id, v_caller_id, 'task_reassigned',
      jsonb_build_object('from_user_id', v_old_assigned_to, 'to_user_id', p_assigned_to)
    );
  END IF;

  -- Title change.
  IF p_title IS NOT NULL AND trim(p_title) IS DISTINCT FROM coalesce(v_old_title, '') THEN
    IF length(trim(p_title)) = 0 THEN
      RAISE EXCEPTION 'название задачи обязательно';
    END IF;

    UPDATE tasks SET title = trim(p_title), updated_at = now() WHERE id = p_task_id;
    v_changed_fields := array_append(v_changed_fields, 'title');
  END IF;

  -- Description change.
  IF p_description IS NOT NULL
     AND coalesce(p_description, '') IS DISTINCT FROM coalesce(v_old_description, '') THEN
    UPDATE tasks SET description = NULLIF(trim(p_description), ''), updated_at = now()
     WHERE id = p_task_id;
    v_changed_fields := array_append(v_changed_fields, 'description');
  END IF;

  IF array_length(v_changed_fields, 1) IS NOT NULL THEN
    INSERT INTO task_activity (task_id, actor_id, event_type, payload)
    VALUES (
      p_task_id, v_caller_id, 'task_updated',
      jsonb_build_object('fields', to_jsonb(v_changed_fields))
    );
  END IF;

  -- Deadline change.
  IF p_clear_deadline THEN
    IF v_old_deadline IS NOT NULL THEN
      UPDATE tasks SET deadline = NULL, updated_at = now() WHERE id = p_task_id;
      INSERT INTO task_activity (task_id, actor_id, event_type, payload)
      VALUES (
        p_task_id, v_caller_id, 'deadline_changed',
        jsonb_build_object('from', v_old_deadline, 'to', NULL)
      );
    END IF;
  ELSIF p_deadline IS NOT NULL AND p_deadline IS DISTINCT FROM v_old_deadline THEN
    UPDATE tasks SET deadline = p_deadline, updated_at = now() WHERE id = p_task_id;
    INSERT INTO task_activity (task_id, actor_id, event_type, payload)
    VALUES (
      p_task_id, v_caller_id, 'deadline_changed',
      jsonb_build_object('from', v_old_deadline, 'to', p_deadline)
    );
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.update_task(integer, text, text, timestamptz, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_task(integer, text, text, timestamptz, integer, boolean)
  TO authenticated;

-- ============================================================
-- 4. cancel_task — T.3
-- ============================================================

CREATE OR REPLACE FUNCTION public.cancel_task(
  p_task_id integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id       integer := current_dashboard_user_id();
  v_status          text;
  v_created_by      integer;
  v_caller_role     text;
  v_assignee_agency uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT t.status, t.created_by, u.agency_id
    INTO v_status, v_created_by, v_assignee_agency
    FROM tasks t JOIN dashboard_users u ON u.id = t.assigned_to
   WHERE t.id = p_task_id FOR UPDATE OF t;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'задача не найдена';
  END IF;

  SELECT role INTO v_caller_role FROM dashboard_users WHERE id = v_caller_id;
  IF v_caller_role IS NULL
     OR (v_caller_role NOT IN ('admin', 'superadmin')
         AND v_created_by IS DISTINCT FROM v_caller_id) THEN
    RAISE EXCEPTION 'недостаточно прав для отмены задачи' USING errcode = '42501';
  END IF;

  IF v_assignee_agency IS NOT NULL THEN
    PERFORM assert_agency_access(v_caller_id, v_assignee_agency);
  END IF;

  IF v_status NOT IN ('pending', 'in_progress') THEN
    RAISE EXCEPTION 'Нельзя отменить завершённую задачу';
  END IF;

  UPDATE tasks SET status = 'cancelled', updated_at = now() WHERE id = p_task_id;

  INSERT INTO task_activity (task_id, actor_id, event_type, payload)
  VALUES (p_task_id, v_caller_id, 'task_cancelled', jsonb_build_object('reason', NULL));
END $$;

REVOKE ALL ON FUNCTION public.cancel_task(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_task(integer) TO authenticated;

-- ============================================================
-- 5. take_task_in_progress — T.3 (caller IS assignee, but assert for consistency)
-- ============================================================

CREATE OR REPLACE FUNCTION public.take_task_in_progress(
  p_task_id integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id       integer := current_dashboard_user_id();
  v_assigned_to     integer;
  v_status          text;
  v_assignee_agency uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT t.assigned_to, t.status, u.agency_id
    INTO v_assigned_to, v_status, v_assignee_agency
    FROM tasks t JOIN dashboard_users u ON u.id = t.assigned_to
   WHERE t.id = p_task_id FOR UPDATE OF t;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'задача не найдена';
  END IF;

  IF v_assigned_to IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION 'Только исполнитель может взять задачу' USING errcode = '42501';
  END IF;

  IF v_assignee_agency IS NOT NULL THEN
    PERFORM assert_agency_access(v_caller_id, v_assignee_agency);
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Задача уже в работе';
  END IF;

  UPDATE tasks SET status = 'in_progress', updated_at = now() WHERE id = p_task_id;
  INSERT INTO task_activity (task_id, actor_id, event_type, payload)
  VALUES (p_task_id, v_caller_id, 'taken_in_progress', '{}'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.take_task_in_progress(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.take_task_in_progress(integer) TO authenticated;

-- ============================================================
-- 6. submit_task_report — T.3 (caller IS assignee)
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_task_report(
  p_task_id integer,
  p_content text,
  p_media   jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id       integer := current_dashboard_user_id();
  v_assigned_to     integer;
  v_status          text;
  v_content         text;
  v_media           jsonb;
  v_has_content     boolean;
  v_media_count     integer;
  v_assignee_agency uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT t.assigned_to, t.status, u.agency_id
    INTO v_assigned_to, v_status, v_assignee_agency
    FROM tasks t JOIN dashboard_users u ON u.id = t.assigned_to
   WHERE t.id = p_task_id FOR UPDATE OF t;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'задача не найдена';
  END IF;

  IF v_assigned_to IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION 'Только исполнитель может отправить отчёт' USING errcode = '42501';
  END IF;

  IF v_assignee_agency IS NOT NULL THEN
    PERFORM assert_agency_access(v_caller_id, v_assignee_agency);
  END IF;

  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'Задача должна быть в работе для отправки отчёта';
  END IF;

  v_content := NULLIF(trim(coalesce(p_content, '')), '');
  v_media   := coalesce(p_media, '[]'::jsonb);

  IF length(coalesce(v_content, '')) = 0 AND jsonb_array_length(v_media) = 0 THEN
    RAISE EXCEPTION 'Отчёт должен содержать описание или хотя бы один файл';
  END IF;

  INSERT INTO task_reports (task_id, reporter_id, content, media)
  VALUES (p_task_id, v_caller_id, v_content, v_media)
  ON CONFLICT (task_id) DO UPDATE
    SET content = EXCLUDED.content, media = EXCLUDED.media, updated_at = now();

  UPDATE tasks SET status = 'done', completed_at = now(), updated_at = now()
   WHERE id = p_task_id;

  v_has_content := v_content IS NOT NULL;
  v_media_count := jsonb_array_length(v_media);

  INSERT INTO task_activity (task_id, actor_id, event_type, payload)
  VALUES (
    p_task_id, v_caller_id, 'report_submitted',
    jsonb_build_object('has_content', v_has_content, 'media_count', v_media_count)
  );
END $$;

REVOKE ALL ON FUNCTION public.submit_task_report(integer, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_task_report(integer, text, jsonb) TO authenticated;

-- ============================================================
-- 7. update_task_report — T.3
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_task_report(
  p_task_id integer,
  p_content text  DEFAULT NULL,
  p_media   jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id       integer := current_dashboard_user_id();
  v_old_content     text;
  v_old_media       jsonb;
  v_reporter        integer;
  v_new_content     text;
  v_new_media       jsonb;
  v_has_content     boolean;
  v_media_count     integer;
  v_assignee_agency uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT content, media, reporter_id
    INTO v_old_content, v_old_media, v_reporter
    FROM task_reports WHERE task_id = p_task_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'отчёт не найден';
  END IF;

  IF v_reporter IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION 'недостаточно прав' USING errcode = '42501';
  END IF;

  -- Resolve task agency (assignee = reporter = caller, but consistent assert).
  SELECT u.agency_id INTO v_assignee_agency
    FROM tasks t JOIN dashboard_users u ON u.id = t.assigned_to
   WHERE t.id = p_task_id;
  IF v_assignee_agency IS NOT NULL THEN
    PERFORM assert_agency_access(v_caller_id, v_assignee_agency);
  END IF;

  IF (SELECT status FROM tasks WHERE id = p_task_id FOR UPDATE) <> 'done' THEN
    RAISE EXCEPTION 'Отчёт можно редактировать только для завершённой задачи';
  END IF;

  IF p_content IS NOT NULL THEN
    v_new_content := NULLIF(trim(p_content), '');
  ELSE
    v_new_content := v_old_content;
  END IF;
  v_new_media := coalesce(p_media, v_old_media);

  IF length(coalesce(v_new_content, '')) = 0
     AND jsonb_array_length(coalesce(v_new_media, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Отчёт должен содержать описание или хотя бы один файл';
  END IF;

  UPDATE task_reports
     SET content = v_new_content, media = v_new_media, updated_at = now()
   WHERE task_id = p_task_id;

  v_has_content := v_new_content IS NOT NULL;
  v_media_count := jsonb_array_length(v_new_media);

  INSERT INTO task_activity (task_id, actor_id, event_type, payload)
  VALUES (
    p_task_id, v_caller_id, 'report_updated',
    jsonb_build_object('has_content', v_has_content, 'media_count', v_media_count)
  );
END $$;

REVOKE ALL ON FUNCTION public.update_task_report(integer, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_task_report(integer, text, jsonb) TO authenticated;

-- ============================================================
-- 8. delete_task — T.3
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_task(
  p_task_id integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id       integer := current_dashboard_user_id();
  v_caller_role     text;
  v_title           text;
  v_media_paths     jsonb;
  v_assignee_agency uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT role INTO v_caller_role FROM dashboard_users WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'недостаточно прав для удаления задачи' USING errcode = '42501';
  END IF;

  SELECT t.title, u.agency_id INTO v_title, v_assignee_agency
    FROM tasks t JOIN dashboard_users u ON u.id = t.assigned_to
   WHERE t.id = p_task_id FOR UPDATE OF t;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'задача не найдена';
  END IF;

  IF v_assignee_agency IS NOT NULL THEN
    PERFORM assert_agency_access(v_caller_id, v_assignee_agency);
  END IF;

  SELECT coalesce(jsonb_agg(elem->>'storage_path'), '[]'::jsonb)
    INTO v_media_paths
    FROM task_reports tr, jsonb_array_elements(tr.media) AS elem
   WHERE tr.task_id = p_task_id AND elem ? 'storage_path';

  IF v_media_paths IS NULL THEN
    v_media_paths := '[]'::jsonb;
  END IF;

  DELETE FROM tasks WHERE id = p_task_id;

  INSERT INTO staff_activity (user_id, actor_id, event_type, payload)
  VALUES (
    v_caller_id, v_caller_id, 'task_deleted',
    jsonb_build_object(
      'task_id', p_task_id, 'title', v_title,
      'media_count', jsonb_array_length(v_media_paths)
    )
  );

  RETURN jsonb_build_object('media_paths', v_media_paths);
END $$;

REVOKE ALL ON FUNCTION public.delete_task(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_task(integer) TO authenticated;

-- ============================================================
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
          au.agency_id IN (SELECT agency_id FROM accessible_agencies(v_caller_id))
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

-- ============================================================
-- 10. get_task_detail — T.3
-- ============================================================

DROP FUNCTION IF EXISTS public.get_task_detail(integer);

CREATE OR REPLACE FUNCTION public.get_task_detail(
  p_task_id integer
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
  agency_id          uuid,
  agency_name        text,
  report             jsonb,
  activity           jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id        integer := current_dashboard_user_id();
  v_role             text;
  v_visible          boolean;
  v_creator          integer;
  v_assignee         integer;
  v_assignee_agency  uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT u.role INTO v_role FROM dashboard_users u
   WHERE u.id = v_caller_id AND u.is_active = true;
  IF v_role IS NULL THEN
    RETURN;
  END IF;

  SELECT t.created_by, t.assigned_to, au.agency_id
    INTO v_creator, v_assignee, v_assignee_agency
    FROM tasks t LEFT JOIN dashboard_users au ON au.id = t.assigned_to
   WHERE t.id = p_task_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_visible := (v_creator IS NOT DISTINCT FROM v_caller_id)
            OR (v_assignee = v_caller_id)
            OR has_permission(v_caller_id, 'view_all_tasks');

  IF NOT v_visible THEN
    RETURN;
  END IF;

  -- Additional agency-level gate: if task has an agency, caller must have access.
  -- (Permission gate above is the primary; this is defense in depth for non-admin
  --  callers who might gain view_all_tasks but should still respect agency boundary.)
  IF v_assignee_agency IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM accessible_agencies(v_caller_id) a WHERE a.agency_id = v_assignee_agency
     )
     AND v_creator IS DISTINCT FROM v_caller_id
     AND v_assignee IS DISTINCT FROM v_caller_id THEN
    -- Caller has view_all_tasks but no agency access — block to enforce isolation.
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    t.id, t.title, t.description, t.created_by,
    COALESCE(NULLIF(trim(COALESCE(cu.first_name,'') || ' ' || COALESCE(cu.last_name,'')), ''),
             cu.alias, cu.email) AS created_by_name,
    cu.role AS created_by_role, t.assigned_to,
    COALESCE(NULLIF(trim(COALESCE(au.first_name,'') || ' ' || COALESCE(au.last_name,'')), ''),
             au.alias, au.email) AS assigned_to_name,
    au.role AS assigned_to_role, t.deadline, t.status,
    CASE WHEN t.deadline IS NOT NULL AND t.deadline < now()
              AND t.status IN ('pending','in_progress')
         THEN 'overdue' ELSE t.status END AS effective_status,
    t.completed_at,
    EXISTS (SELECT 1 FROM task_reports tr WHERE tr.task_id = t.id) AS has_report,
    t.created_at,
    au.agency_id, ag.name AS agency_name,
    (
      SELECT jsonb_build_object(
        'id', tr.id, 'reporter_id', tr.reporter_id,
        'reporter_name', COALESCE(
                           NULLIF(trim(COALESCE(ru.first_name,'') || ' ' || COALESCE(ru.last_name,'')), ''),
                           ru.alias, ru.email),
        'content', tr.content, 'media', tr.media,
        'created_at', tr.created_at, 'updated_at', tr.updated_at
      )
      FROM task_reports tr LEFT JOIN dashboard_users ru ON ru.id = tr.reporter_id
      WHERE tr.task_id = t.id
    ) AS report,
    COALESCE(
      (SELECT jsonb_agg(evt ORDER BY (evt->>'created_at')::timestamptz DESC)
       FROM (
         SELECT jsonb_build_object(
           'id', a.id, 'actor_id', a.actor_id,
           'actor_name', CASE WHEN a.actor_id IS NULL THEN 'Система'
                              ELSE COALESCE(
                                NULLIF(trim(COALESCE(actor.first_name,'') || ' ' || COALESCE(actor.last_name,'')), ''),
                                actor.alias, actor.email) END,
           'event_type', a.event_type, 'payload', a.payload, 'created_at', a.created_at
         ) AS evt
         FROM task_activity a LEFT JOIN dashboard_users actor ON actor.id = a.actor_id
         WHERE a.task_id = t.id ORDER BY a.created_at DESC LIMIT 12
       ) recent),
      '[]'::jsonb) AS activity
  FROM tasks t
  LEFT JOIN dashboard_users cu ON cu.id = t.created_by
  LEFT JOIN dashboard_users au ON au.id = t.assigned_to
  LEFT JOIN agencies        ag ON ag.id = au.agency_id
  WHERE t.id = p_task_id;
END $$;

REVOKE ALL ON FUNCTION public.get_task_detail(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_task_detail(integer) TO authenticated;

-- ============================================================
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
           u.agency_id IN (SELECT agency_id FROM accessible_agencies(v_caller_id))
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

COMMIT;

-- VERIFY:
--   SELECT proname, pg_get_function_identity_arguments(oid) AS args
--     FROM pg_proc
--    WHERE proname IN (
--      'create_task','update_task','cancel_task','take_task_in_progress',
--      'submit_task_report','update_task_report','delete_task',
--      'list_tasks','get_task_detail','count_overdue_tasks','can_assign_task'
--    )
--    ORDER BY proname;
--   -- Expected: 11 rows. Signatures include p_agency_id where appropriate.
