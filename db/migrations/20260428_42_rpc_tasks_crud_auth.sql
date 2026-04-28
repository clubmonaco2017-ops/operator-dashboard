-- Migration 42: Stage 8 — Migrate tasks CRUD bucket to current_dashboard_user_id()
--
-- Migrates 11 RPCs:
--   create_task, update_task (live def from _33), cancel_task, delete_task,
--   list_tasks, get_task_detail, take_task_in_progress,
--   submit_task_report, update_task_report, count_overdue_tasks,
--   can_assign_task
--
-- Pattern: drop p_caller_id from signature; derive via current_dashboard_user_id().
--   DECLARE v_caller_id integer := current_dashboard_user_id();
--   IF v_caller_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING errcode = '28000'; END IF;
-- Permission-fail RAISEs use USING errcode = '42501'.
-- REVOKE anon EXECUTE, GRANT to authenticated only.
--
-- ⚠ DELIBERATE SEMANTICS CHANGE — count_overdue_tasks (§8.2):
--   The frontend previously passed p_caller_id = null as an "admin-scope" sentinel,
--   intending to count overdue tasks across ALL users. However, the original SQL body
--   used `WHERE (created_by = p_caller_id OR assigned_to = p_caller_id)`, which meant
--   passing NULL actually returned 0 (no tasks have created_by = NULL). The "admin
--   scope" was never truly implemented at the DB layer.
--   After this migration: if caller has view_all_tasks permission → count across all
--   active users. Otherwise → count own (creator or assignee). The frontend
--   OverdueAllCard drops the p_caller_id argument entirely; the RPC decides scope
--   from the JWT-derived v_caller_id and permission check.
--   Permission used: 'view_all_tasks' (same gate used by list_tasks box='all' and
--   get_task_detail visibility, and already required by cardRegistry for OverdueAllCard).

BEGIN;

-- ============================================================
-- 1. can_assign_task  (internal helper — no GRANT, called from SECURITY DEFINER RPCs)
--    Original signature: (p_caller_id integer, p_target_user_id integer)
--    New signature:      (p_target_user_id integer)
--
--    NOTE: this is an INTERNAL helper called from other SECURITY DEFINER RPCs.
--    Its call-sites within this migration (create_task, update_task) already have
--    v_caller_id resolved; we pass v_caller_id as the first arg which now becomes
--    p_caller_id inside can_assign_task's body. To keep the internal API consistent
--    with other RPCs in this migration, we keep one external integer parameter
--    (p_target_user_id) and derive the caller from current_dashboard_user_id().
--    The callers in create_task/update_task that use can_assign_task(v_caller_id, x)
--    are OTHER SECURITY DEFINER functions where current_dashboard_user_id() returns
--    the same v_caller_id — so this is safe.
-- ============================================================

DROP FUNCTION IF EXISTS public.can_assign_task(integer, integer);

CREATE OR REPLACE FUNCTION public.can_assign_task(
  p_target_user_id integer
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id  integer := current_dashboard_user_id();
  v_caller_role text;
  v_target_role text;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT role INTO v_caller_role
    FROM dashboard_users
   WHERE id = v_caller_id AND is_active = true;
  IF v_caller_role IS NULL THEN
    RETURN false;
  END IF;

  SELECT role INTO v_target_role
    FROM dashboard_users
   WHERE id = p_target_user_id AND is_active = true;
  IF v_target_role IS NULL THEN
    RETURN false;
  END IF;

  -- Admin/superadmin → assign to anyone
  IF v_caller_role IN ('admin', 'superadmin') THEN
    RETURN true;
  END IF;

  -- TL/Moderator → other TL/moderator (cross-staff coordination)
  IF v_caller_role IN ('teamlead', 'moderator')
     AND v_target_role IN ('teamlead', 'moderator') THEN
    RETURN true;
  END IF;

  -- Teamlead → operators in team caller leads
  IF v_caller_role = 'teamlead' AND v_target_role = 'operator' THEN
    RETURN EXISTS (
      SELECT 1
        FROM team_members tm
        JOIN teams t ON t.id = tm.team_id
       WHERE t.lead_user_id = v_caller_id
         AND t.is_active = true
         AND tm.operator_id = p_target_user_id
    );
  END IF;

  -- Moderator → curated operators
  IF v_caller_role = 'moderator' AND v_target_role = 'operator' THEN
    RETURN EXISTS (
      SELECT 1 FROM moderator_operators
       WHERE moderator_id = v_caller_id
         AND operator_id = p_target_user_id
    );
  END IF;

  RETURN false;
END;
$$;

-- INTENTIONAL: no GRANT EXECUTE. Called only from SECURITY DEFINER RPCs.

-- ============================================================
-- 2. create_task
--    Original signature: (p_caller_id integer, p_title text, p_description text,
--                         p_deadline timestamptz, p_assigned_to integer)
--    New signature:      (p_title text, p_description text,
--                         p_deadline timestamptz, p_assigned_to integer)
-- ============================================================

DROP FUNCTION IF EXISTS public.create_task(integer, text, text, timestamptz, integer);

CREATE OR REPLACE FUNCTION public.create_task(
  p_title       text,
  p_description text,
  p_deadline    timestamptz,
  p_assigned_to integer
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_new_id    integer;
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

  PERFORM 1 FROM dashboard_users
   WHERE id = p_assigned_to AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'исполнитель не найден или деактивирован';
  END IF;

  IF NOT can_assign_task(p_assigned_to) THEN
    RAISE EXCEPTION 'Нельзя назначить задачу этому сотруднику. Только своим операторам или другим лидам/модераторам.';
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
      'deadline',    p_deadline
    )
  );

  RETURN v_new_id;
END $$;

GRANT EXECUTE ON FUNCTION public.create_task(text, text, timestamptz, integer)
  TO authenticated;

-- ============================================================
-- 3. update_task  (live definition from migration _33 — includes p_clear_deadline)
--    Original signature: (p_caller_id integer, p_task_id integer, p_title text,
--                         p_description text, p_deadline timestamptz,
--                         p_assigned_to integer, p_clear_deadline boolean)
--    New signature:      (p_task_id integer, p_title text, p_description text,
--                         p_deadline timestamptz, p_assigned_to integer,
--                         p_clear_deadline boolean)
-- ============================================================

DROP FUNCTION IF EXISTS public.update_task(integer, integer, text, text, timestamptz, integer, boolean);

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
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  -- Lock + load existing task.
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

  -- Reassignment (I-8 + I-2).
  IF p_assigned_to IS NOT NULL AND p_assigned_to IS DISTINCT FROM v_old_assigned_to THEN
    IF v_status <> 'pending' THEN
      RAISE EXCEPTION 'Переназначение возможно только для задач в ожидании. Создайте новую задачу.';
    END IF;

    IF NOT can_assign_task(p_assigned_to) THEN
      RAISE EXCEPTION 'Нельзя назначить задачу этому сотруднику. Только своим операторам или другим лидам/модераторам.';
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

    UPDATE tasks
       SET title      = trim(p_title),
           updated_at = now()
     WHERE id = p_task_id;

    v_changed_fields := array_append(v_changed_fields, 'title');
  END IF;

  -- Description change.
  IF p_description IS NOT NULL
     AND coalesce(p_description, '') IS DISTINCT FROM coalesce(v_old_description, '') THEN
    UPDATE tasks
       SET description = NULLIF(trim(p_description), ''),
           updated_at  = now()
     WHERE id = p_task_id;

    v_changed_fields := array_append(v_changed_fields, 'description');
  END IF;

  -- Single audit event for title/description bundle.
  IF array_length(v_changed_fields, 1) IS NOT NULL THEN
    INSERT INTO task_activity (task_id, actor_id, event_type, payload)
    VALUES (
      p_task_id, v_caller_id, 'task_updated',
      jsonb_build_object('fields', to_jsonb(v_changed_fields))
    );
  END IF;

  -- Deadline change — separate event per D-10.
  -- p_clear_deadline=true → explicit NULL; otherwise NULL = no change.
  IF p_clear_deadline THEN
    IF v_old_deadline IS NOT NULL THEN
      UPDATE tasks
         SET deadline   = NULL,
             updated_at = now()
       WHERE id = p_task_id;

      INSERT INTO task_activity (task_id, actor_id, event_type, payload)
      VALUES (
        p_task_id, v_caller_id, 'deadline_changed',
        jsonb_build_object('from', v_old_deadline, 'to', NULL)
      );
    END IF;
  ELSIF p_deadline IS NOT NULL AND p_deadline IS DISTINCT FROM v_old_deadline THEN
    UPDATE tasks
       SET deadline   = p_deadline,
           updated_at = now()
     WHERE id = p_task_id;

    INSERT INTO task_activity (task_id, actor_id, event_type, payload)
    VALUES (
      p_task_id, v_caller_id, 'deadline_changed',
      jsonb_build_object('from', v_old_deadline, 'to', p_deadline)
    );
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.update_task(integer, text, text, timestamptz, integer, boolean)
  TO authenticated;

-- ============================================================
-- 4. cancel_task
--    Original signature: (p_caller_id integer, p_task_id integer)
--    New signature:      (p_task_id integer)
-- ============================================================

DROP FUNCTION IF EXISTS public.cancel_task(integer, integer);

CREATE OR REPLACE FUNCTION public.cancel_task(
  p_task_id integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id   integer := current_dashboard_user_id();
  v_status      text;
  v_created_by  integer;
  v_caller_role text;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT status, created_by INTO v_status, v_created_by
    FROM tasks WHERE id = p_task_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'задача не найдена';
  END IF;

  SELECT role INTO v_caller_role FROM dashboard_users WHERE id = v_caller_id;
  IF v_caller_role IS NULL
     OR (v_caller_role NOT IN ('admin', 'superadmin')
         AND v_created_by IS DISTINCT FROM v_caller_id) THEN
    RAISE EXCEPTION 'недостаточно прав для отмены задачи' USING errcode = '42501';
  END IF;

  IF v_status NOT IN ('pending', 'in_progress') THEN
    RAISE EXCEPTION 'Нельзя отменить завершённую задачу';
  END IF;

  UPDATE tasks
     SET status     = 'cancelled',
         updated_at = now()
   WHERE id = p_task_id;

  INSERT INTO task_activity (task_id, actor_id, event_type, payload)
  VALUES (p_task_id, v_caller_id, 'task_cancelled', jsonb_build_object('reason', NULL));
END $$;

GRANT EXECUTE ON FUNCTION public.cancel_task(integer)
  TO authenticated;

-- ============================================================
-- 5. take_task_in_progress
--    Original signature: (p_caller_id integer, p_task_id integer)
--    New signature:      (p_task_id integer)
-- ============================================================

DROP FUNCTION IF EXISTS public.take_task_in_progress(integer, integer);

CREATE OR REPLACE FUNCTION public.take_task_in_progress(
  p_task_id integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id   integer := current_dashboard_user_id();
  v_assigned_to integer;
  v_status      text;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT assigned_to, status INTO v_assigned_to, v_status
    FROM tasks WHERE id = p_task_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'задача не найдена';
  END IF;

  IF v_assigned_to IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION 'Только исполнитель может взять задачу' USING errcode = '42501';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Задача уже в работе';
  END IF;

  UPDATE tasks
     SET status     = 'in_progress',
         updated_at = now()
   WHERE id = p_task_id;

  INSERT INTO task_activity (task_id, actor_id, event_type, payload)
  VALUES (p_task_id, v_caller_id, 'taken_in_progress', '{}'::jsonb);
END $$;

GRANT EXECUTE ON FUNCTION public.take_task_in_progress(integer)
  TO authenticated;

-- ============================================================
-- 6. submit_task_report
--    Original signature: (p_caller_id integer, p_task_id integer,
--                         p_content text, p_media jsonb)
--    New signature:      (p_task_id integer, p_content text, p_media jsonb)
-- ============================================================

DROP FUNCTION IF EXISTS public.submit_task_report(integer, integer, text, jsonb);

CREATE OR REPLACE FUNCTION public.submit_task_report(
  p_task_id integer,
  p_content text,
  p_media   jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id   integer := current_dashboard_user_id();
  v_assigned_to integer;
  v_status      text;
  v_content     text;
  v_media       jsonb;
  v_has_content boolean;
  v_media_count integer;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT assigned_to, status INTO v_assigned_to, v_status
    FROM tasks WHERE id = p_task_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'задача не найдена';
  END IF;

  IF v_assigned_to IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION 'Только исполнитель может отправить отчёт' USING errcode = '42501';
  END IF;

  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'Задача должна быть в работе для отправки отчёта';
  END IF;

  v_content := NULLIF(trim(coalesce(p_content, '')), '');
  v_media   := coalesce(p_media, '[]'::jsonb);

  IF length(coalesce(v_content, '')) = 0
     AND jsonb_array_length(v_media) = 0 THEN
    RAISE EXCEPTION 'Отчёт должен содержать описание или хотя бы один файл';
  END IF;

  INSERT INTO task_reports (task_id, reporter_id, content, media)
  VALUES (p_task_id, v_caller_id, v_content, v_media)
  ON CONFLICT (task_id) DO UPDATE
    SET content    = EXCLUDED.content,
        media      = EXCLUDED.media,
        updated_at = now();

  UPDATE tasks
     SET status       = 'done',
         completed_at = now(),
         updated_at   = now()
   WHERE id = p_task_id;

  v_has_content := v_content IS NOT NULL;
  v_media_count := jsonb_array_length(v_media);

  INSERT INTO task_activity (task_id, actor_id, event_type, payload)
  VALUES (
    p_task_id, v_caller_id, 'report_submitted',
    jsonb_build_object('has_content', v_has_content, 'media_count', v_media_count)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.submit_task_report(integer, text, jsonb)
  TO authenticated;

-- ============================================================
-- 7. update_task_report
--    Original signature: (p_caller_id integer, p_task_id integer,
--                         p_content text, p_media jsonb)
--    New signature:      (p_task_id integer, p_content text, p_media jsonb)
-- ============================================================

DROP FUNCTION IF EXISTS public.update_task_report(integer, integer, text, jsonb);

CREATE OR REPLACE FUNCTION public.update_task_report(
  p_task_id integer,
  p_content text  DEFAULT NULL,
  p_media   jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id   integer := current_dashboard_user_id();
  v_old_content text;
  v_old_media   jsonb;
  v_reporter    integer;
  v_new_content text;
  v_new_media   jsonb;
  v_has_content boolean;
  v_media_count integer;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT content, media, reporter_id
    INTO v_old_content, v_old_media, v_reporter
    FROM task_reports
   WHERE task_id = p_task_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'отчёт не найден';
  END IF;

  IF v_reporter IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION 'недостаточно прав' USING errcode = '42501';
  END IF;

  -- Status must be 'done' (post-submission edit only).
  IF (SELECT status FROM tasks WHERE id = p_task_id FOR UPDATE) <> 'done' THEN
    RAISE EXCEPTION 'Отчёт можно редактировать только для завершённой задачи';
  END IF;

  -- Compute new values: NULL parameter → keep existing.
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
     SET content    = v_new_content,
         media      = v_new_media,
         updated_at = now()
   WHERE task_id = p_task_id;

  v_has_content := v_new_content IS NOT NULL;
  v_media_count := jsonb_array_length(v_new_media);

  INSERT INTO task_activity (task_id, actor_id, event_type, payload)
  VALUES (
    p_task_id, v_caller_id, 'report_updated',
    jsonb_build_object('has_content', v_has_content, 'media_count', v_media_count)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.update_task_report(integer, text, jsonb)
  TO authenticated;

-- ============================================================
-- 8. delete_task
--    Original signature: (p_caller_id integer, p_task_id integer)
--    New signature:      (p_task_id integer)
-- ============================================================

DROP FUNCTION IF EXISTS public.delete_task(integer, integer);

CREATE OR REPLACE FUNCTION public.delete_task(
  p_task_id integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id   integer := current_dashboard_user_id();
  v_caller_role text;
  v_title       text;
  v_media_paths jsonb;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT role INTO v_caller_role FROM dashboard_users WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'недостаточно прав для удаления задачи' USING errcode = '42501';
  END IF;

  SELECT title INTO v_title FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'задача не найдена';
  END IF;

  -- Collect media storage paths from the (optional) report before cascade-delete.
  SELECT coalesce(jsonb_agg(elem->>'storage_path'), '[]'::jsonb)
    INTO v_media_paths
    FROM task_reports tr,
         jsonb_array_elements(tr.media) AS elem
   WHERE tr.task_id = p_task_id
     AND elem ? 'storage_path';

  IF v_media_paths IS NULL THEN
    v_media_paths := '[]'::jsonb;
  END IF;

  -- Cascade удалит task_reports + task_activity.
  DELETE FROM tasks WHERE id = p_task_id;

  -- Аудит идёт в staff_activity (task_activity каскадно удалён вместе с задачей).
  INSERT INTO staff_activity (user_id, actor_id, event_type, payload)
  VALUES (
    v_caller_id, v_caller_id, 'task_deleted',
    jsonb_build_object(
      'task_id',     p_task_id,
      'title',       v_title,
      'media_count', jsonb_array_length(v_media_paths)
    )
  );

  RETURN jsonb_build_object('media_paths', v_media_paths);
END $$;

GRANT EXECUTE ON FUNCTION public.delete_task(integer)
  TO authenticated;

-- ============================================================
-- 9. list_tasks
--    Original signature: (p_caller_id integer, p_box text, p_status text, p_search text)
--    New signature:      (p_box text, p_status text, p_search text)
-- ============================================================

DROP FUNCTION IF EXISTS public.list_tasks(integer, text, text, text);

CREATE OR REPLACE FUNCTION public.list_tasks(
  p_box    text DEFAULT 'inbox',
  p_status text DEFAULT 'all',
  p_search text DEFAULT NULL
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

  SELECT u.role INTO v_role
    FROM dashboard_users u
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
        (p_box = 'inbox'  AND t.assigned_to = v_caller_id)
        OR (p_box = 'outbox' AND t.created_by = v_caller_id)
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

GRANT EXECUTE ON FUNCTION public.list_tasks(text, text, text)
  TO authenticated;

-- ============================================================
-- 10. get_task_detail
--    Original signature: (p_caller_id integer, p_task_id integer)
--    New signature:      (p_task_id integer)
-- ============================================================

DROP FUNCTION IF EXISTS public.get_task_detail(integer, integer);

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
  report             jsonb,
  activity           jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_role      text;
  v_visible   boolean;
  v_creator   integer;
  v_assignee  integer;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT u.role INTO v_role
    FROM dashboard_users u
   WHERE u.id = v_caller_id AND u.is_active = true;
  IF v_role IS NULL THEN
    RETURN;
  END IF;

  SELECT t.created_by, t.assigned_to INTO v_creator, v_assignee
    FROM tasks t WHERE t.id = p_task_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_visible := (v_creator IS NOT DISTINCT FROM v_caller_id)
            OR (v_assignee = v_caller_id)
            OR has_permission(v_caller_id, 'view_all_tasks');

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

GRANT EXECUTE ON FUNCTION public.get_task_detail(integer)
  TO authenticated;

-- ============================================================
-- 11. count_overdue_tasks
--    Original signature: (p_caller_id integer)
--    New signature:      ()
--
--    ⚠ DELIBERATE SEMANTICS CHANGE (§8.2):
--    If caller has view_all_tasks → count all users' overdue tasks.
--    Otherwise → count own (creator or assignee) overdue tasks.
--    Permission: 'view_all_tasks' (consistent with list_tasks box='all' gate).
-- ============================================================

DROP FUNCTION IF EXISTS public.count_overdue_tasks(integer);

CREATE OR REPLACE FUNCTION public.count_overdue_tasks()
RETURNS integer
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

  IF has_permission(v_caller_id, 'view_all_tasks') THEN
    -- Admin-scope: count overdue across all active users' tasks.
    SELECT count(*)::integer INTO v_count
      FROM tasks
     WHERE deadline IS NOT NULL
       AND deadline < now()
       AND status IN ('pending', 'in_progress');
  ELSE
    -- Self-scope: count own overdue tasks (creator or assignee).
    SELECT count(*)::integer INTO v_count
      FROM tasks
     WHERE (created_by = v_caller_id OR assigned_to = v_caller_id)
       AND deadline IS NOT NULL
       AND deadline < now()
       AND status IN ('pending', 'in_progress');
  END IF;

  RETURN COALESCE(v_count, 0);
END $$;

GRANT EXECUTE ON FUNCTION public.count_overdue_tasks()
  TO authenticated;

COMMIT;

-- VERIFY:
--   SELECT routine_name, pg_get_function_identity_arguments(p.oid) AS args
--     FROM information_schema.routines r
--     JOIN pg_proc p ON p.proname = r.routine_name
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE r.routine_schema = 'public'
--      AND r.routine_name IN (
--        'create_task','update_task','cancel_task','delete_task',
--        'list_tasks','get_task_detail','take_task_in_progress',
--        'submit_task_report','update_task_report',
--        'count_overdue_tasks','can_assign_task'
--      )
--    ORDER BY routine_name;
--   -- Expected: 11 rows, none with p_caller_id in args.
--
--   -- Verify anon cannot call:
--   --   SET role anon;
--   --   SELECT count_overdue_tasks(); -- should fail (permission denied)
--   --   RESET role;
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.count_overdue_tasks();
--   DROP FUNCTION IF EXISTS public.get_task_detail(integer);
--   DROP FUNCTION IF EXISTS public.list_tasks(text, text, text);
--   DROP FUNCTION IF EXISTS public.delete_task(integer);
--   DROP FUNCTION IF EXISTS public.update_task_report(integer, text, jsonb);
--   DROP FUNCTION IF EXISTS public.submit_task_report(integer, text, jsonb);
--   DROP FUNCTION IF EXISTS public.take_task_in_progress(integer);
--   DROP FUNCTION IF EXISTS public.cancel_task(integer);
--   DROP FUNCTION IF EXISTS public.update_task(integer, text, text, timestamptz, integer, boolean);
--   DROP FUNCTION IF EXISTS public.create_task(text, text, timestamptz, integer);
--   DROP FUNCTION IF EXISTS public.can_assign_task(integer);
--   -- Then re-apply migrations _29, _30, _31, _33 to restore original signatures.
