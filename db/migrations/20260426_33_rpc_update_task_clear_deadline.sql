-- Migration 33: Subplan 5 follow-up — add p_clear_deadline parameter to update_task.
--
-- Allows UI to explicitly clear deadline. NULL still = no change to preserve
-- existing partial-update semantics for other callers (other fields unchanged).
--
-- Why a new migration: signature changes (new parameter), so we DROP the old
-- update_task and CREATE the new one. Body otherwise identical to _31 except
-- the deadline branch.

BEGIN;

-- Drop the old version (signature changed).
DROP FUNCTION IF EXISTS update_task(integer, integer, text, text, timestamptz, integer);

CREATE OR REPLACE FUNCTION update_task(
  p_caller_id      integer,
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
  -- p_clear_deadline=true → explicit NULL; otherwise NULL = no change.
  IF p_clear_deadline THEN
    IF v_old_deadline IS NOT NULL THEN
      UPDATE tasks
         SET deadline   = NULL,
             updated_at = now()
       WHERE id = p_task_id;

      INSERT INTO task_activity (task_id, actor_id, event_type, payload)
      VALUES (
        p_task_id, p_caller_id, 'deadline_changed',
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
      p_task_id, p_caller_id, 'deadline_changed',
      jsonb_build_object('from', v_old_deadline, 'to', p_deadline)
    );
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION update_task(integer, integer, text, text, timestamptz, integer, boolean)
  TO anon, authenticated;

COMMIT;

-- VERIFY:
--   SELECT pg_get_function_identity_arguments(p.oid)
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='update_task';
--   -- Expected: includes "p_clear_deadline boolean"
--
-- ROLLBACK:
--   DROP FUNCTION update_task(integer, integer, text, text, timestamptz, integer, boolean);
--   -- (then re-apply _31 to restore old signature)
