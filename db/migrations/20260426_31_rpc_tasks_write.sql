-- Migration 31: Tasks write RPCs (Subplan 5 Stage 4)
--   create_task              — create a task assigned to an operator/manager
--   update_task              — partial update (title/description/deadline/assignee)
--   cancel_task              — soft cancel (pending/in_progress only)
--   take_task_in_progress    — assignee transitions pending → in_progress
--   submit_task_report       — assignee submits a report (idempotent UPSERT) → done
--   update_task_report       — reporter edits their submitted report
--   delete_task              — admin-only hard delete; returns media paths for cleanup
--
-- Permissions / invariants enforced here (RPC layer) per design:
--   I-1  (D-2): assignment validated via can_assign_task() helper.
--   I-2  : каста назначения работает в create + update.
--   I-4  : take_task — только исполнитель.
--   I-5  : отчёт — только исполнитель + non-empty content или media.
--   I-7  : cancel — только pending/in_progress.
--   I-8  : переназначение — только для pending задач.
--   D-10 : изменение дедлайна пишется отдельным событием deadline_changed.
--
-- Audit event types (open vocabulary, no CHECK on task_activity.event_type):
--   task_created, task_updated, task_reassigned, deadline_changed,
--   task_cancelled, taken_in_progress, report_submitted, report_updated.
-- delete_task пишет в staff_activity (т.к. task_activity каскадно удалится):
--   event_type = 'task_deleted'.
--
-- Errors are user-facing Russian strings (Stage 3 convention).

BEGIN;

-- ---------------------------------------------------------------------------
-- create_task — создать новую задачу
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_task(
  p_caller_id   integer,
  p_title       text,
  p_description text,
  p_deadline    timestamptz,
  p_assigned_to integer
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_new_id integer;
BEGIN
  IF NOT has_permission(p_caller_id, 'create_tasks') THEN
    RAISE EXCEPTION 'недостаточно прав для создания задачи';
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

  IF NOT can_assign_task(p_caller_id, p_assigned_to) THEN
    RAISE EXCEPTION 'Нельзя назначить задачу этому сотруднику. Только своим операторам или другим лидам/модераторам.';
  END IF;

  INSERT INTO tasks (title, description, created_by, assigned_to, deadline, status)
  VALUES (
    trim(p_title),
    NULLIF(trim(coalesce(p_description, '')), ''),
    p_caller_id,
    p_assigned_to,
    p_deadline,
    'pending'
  )
  RETURNING id INTO v_new_id;

  INSERT INTO task_activity (task_id, actor_id, event_type, payload)
  VALUES (
    v_new_id, p_caller_id, 'task_created',
    jsonb_build_object(
      'title',       trim(p_title),
      'assigned_to', p_assigned_to,
      'deadline',    p_deadline
    )
  );

  RETURN v_new_id;
END $$;

GRANT EXECUTE ON FUNCTION create_task(integer, text, text, timestamptz, integer)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- update_task — частичный update (title/description/deadline/assignee)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_task(
  p_caller_id   integer,
  p_task_id     integer,
  p_title       text        DEFAULT NULL,
  p_description text        DEFAULT NULL,
  p_deadline    timestamptz DEFAULT NULL,
  p_assigned_to integer     DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_old_title       text;
  v_old_description text;
  v_old_deadline    timestamptz;
  v_old_assigned_to integer;
  v_status          text;
  v_created_by      integer;
  v_caller_role     text;
  v_changed_fields  text[] := ARRAY[]::text[];
BEGIN
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
  SELECT role INTO v_caller_role FROM dashboard_users WHERE id = p_caller_id;
  IF v_caller_role IS NULL
     OR (v_caller_role NOT IN ('admin', 'superadmin')
         AND v_created_by IS DISTINCT FROM p_caller_id) THEN
    RAISE EXCEPTION 'недостаточно прав для редактирования задачи';
  END IF;

  -- Reassignment (I-8 + I-2).
  IF p_assigned_to IS NOT NULL AND p_assigned_to IS DISTINCT FROM v_old_assigned_to THEN
    IF v_status <> 'pending' THEN
      RAISE EXCEPTION 'Переназначение возможно только для задач в ожидании. Создайте новую задачу.';
    END IF;

    IF NOT can_assign_task(p_caller_id, p_assigned_to) THEN
      RAISE EXCEPTION 'Нельзя назначить задачу этому сотруднику. Только своим операторам или другим лидам/модераторам.';
    END IF;

    UPDATE tasks
       SET assigned_to = p_assigned_to,
           updated_at  = now()
     WHERE id = p_task_id;

    INSERT INTO task_activity (task_id, actor_id, event_type, payload)
    VALUES (
      p_task_id, p_caller_id, 'task_reassigned',
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
      p_task_id, p_caller_id, 'task_updated',
      jsonb_build_object('fields', to_jsonb(v_changed_fields))
    );
  END IF;

  -- Deadline change — separate event per D-10.
  IF p_deadline IS NOT NULL AND p_deadline IS DISTINCT FROM v_old_deadline THEN
    UPDATE tasks
       SET deadline   = p_deadline,
           updated_at = now()
     WHERE id = p_task_id;

    INSERT INTO task_activity (task_id, actor_id, event_type, payload)
    VALUES (
      p_task_id, p_caller_id, 'deadline_changed',
      jsonb_build_object('from', v_old_deadline, 'to', p_deadline)
    );
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION update_task(integer, integer, text, text, timestamptz, integer)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- cancel_task — отмена задачи (только pending/in_progress)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_task(
  p_caller_id integer,
  p_task_id   integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_status      text;
  v_created_by  integer;
  v_caller_role text;
BEGIN
  SELECT status, created_by INTO v_status, v_created_by
    FROM tasks WHERE id = p_task_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'задача не найдена';
  END IF;

  SELECT role INTO v_caller_role FROM dashboard_users WHERE id = p_caller_id;
  IF v_caller_role IS NULL
     OR (v_caller_role NOT IN ('admin', 'superadmin')
         AND v_created_by IS DISTINCT FROM p_caller_id) THEN
    RAISE EXCEPTION 'недостаточно прав для отмены задачи';
  END IF;

  IF v_status NOT IN ('pending', 'in_progress') THEN
    RAISE EXCEPTION 'Нельзя отменить завершённую задачу';
  END IF;

  UPDATE tasks
     SET status     = 'cancelled',
         updated_at = now()
   WHERE id = p_task_id;

  INSERT INTO task_activity (task_id, actor_id, event_type, payload)
  VALUES (p_task_id, p_caller_id, 'task_cancelled', jsonb_build_object('reason', NULL));
END $$;

GRANT EXECUTE ON FUNCTION cancel_task(integer, integer) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- take_task_in_progress — исполнитель берёт задачу в работу
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION take_task_in_progress(
  p_caller_id integer,
  p_task_id   integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_assigned_to integer;
  v_status      text;
BEGIN
  SELECT assigned_to, status INTO v_assigned_to, v_status
    FROM tasks WHERE id = p_task_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'задача не найдена';
  END IF;

  IF v_assigned_to IS DISTINCT FROM p_caller_id THEN
    RAISE EXCEPTION 'Только исполнитель может взять задачу';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Задача уже в работе';
  END IF;

  UPDATE tasks
     SET status     = 'in_progress',
         updated_at = now()
   WHERE id = p_task_id;

  INSERT INTO task_activity (task_id, actor_id, event_type, payload)
  VALUES (p_task_id, p_caller_id, 'taken_in_progress', '{}'::jsonb);
END $$;

GRANT EXECUTE ON FUNCTION take_task_in_progress(integer, integer) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- submit_task_report — исполнитель сдаёт отчёт (in_progress → done, UPSERT)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_task_report(
  p_caller_id integer,
  p_task_id   integer,
  p_content   text,
  p_media     jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_assigned_to integer;
  v_status      text;
  v_content     text;
  v_media       jsonb;
  v_has_content boolean;
  v_media_count integer;
BEGIN
  SELECT assigned_to, status INTO v_assigned_to, v_status
    FROM tasks WHERE id = p_task_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'задача не найдена';
  END IF;

  IF v_assigned_to IS DISTINCT FROM p_caller_id THEN
    RAISE EXCEPTION 'Только исполнитель может отправить отчёт';
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
  VALUES (p_task_id, p_caller_id, v_content, v_media)
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
    p_task_id, p_caller_id, 'report_submitted',
    jsonb_build_object('has_content', v_has_content, 'media_count', v_media_count)
  );
END $$;

GRANT EXECUTE ON FUNCTION submit_task_report(integer, integer, text, jsonb)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- update_task_report — редактирование отчёта автором
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_task_report(
  p_caller_id integer,
  p_task_id   integer,
  p_content   text  DEFAULT NULL,
  p_media     jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_old_content text;
  v_old_media   jsonb;
  v_reporter    integer;
  v_new_content text;
  v_new_media   jsonb;
  v_has_content boolean;
  v_media_count integer;
BEGIN
  SELECT content, media, reporter_id
    INTO v_old_content, v_old_media, v_reporter
    FROM task_reports
   WHERE task_id = p_task_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'отчёт не найден';
  END IF;

  IF v_reporter IS DISTINCT FROM p_caller_id THEN
    RAISE EXCEPTION 'недостаточно прав';
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
    p_task_id, p_caller_id, 'report_updated',
    jsonb_build_object('has_content', v_has_content, 'media_count', v_media_count)
  );
END $$;

GRANT EXECUTE ON FUNCTION update_task_report(integer, integer, text, jsonb)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- delete_task — admin/superadmin only; returns media paths for Storage cleanup
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_task(
  p_caller_id integer,
  p_task_id   integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_role text;
  v_title       text;
  v_media_paths jsonb;
BEGIN
  SELECT role INTO v_caller_role FROM dashboard_users WHERE id = p_caller_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'недостаточно прав для удаления задачи';
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
    p_caller_id, p_caller_id, 'task_deleted',
    jsonb_build_object(
      'task_id',     p_task_id,
      'title',       v_title,
      'media_count', jsonb_array_length(v_media_paths)
    )
  );

  RETURN jsonb_build_object('media_paths', v_media_paths);
END $$;

GRANT EXECUTE ON FUNCTION delete_task(integer, integer) TO anon, authenticated;

COMMIT;

-- VERIFY:
--   SELECT routine_name FROM information_schema.routines
--     WHERE routine_schema='public'
--       AND routine_name IN ('create_task','update_task','cancel_task',
--                            'take_task_in_progress','submit_task_report',
--                            'update_task_report','delete_task')
--     ORDER BY routine_name;
--   -- Expected: 7 rows.
--
-- ROLLBACK:
--   DROP FUNCTION delete_task(integer, integer);
--   DROP FUNCTION update_task_report(integer, integer, text, jsonb);
--   DROP FUNCTION submit_task_report(integer, integer, text, jsonb);
--   DROP FUNCTION take_task_in_progress(integer, integer);
--   DROP FUNCTION cancel_task(integer, integer);
--   DROP FUNCTION update_task(integer, integer, text, text, timestamptz, integer);
--   DROP FUNCTION create_task(integer, text, text, timestamptz, integer);
