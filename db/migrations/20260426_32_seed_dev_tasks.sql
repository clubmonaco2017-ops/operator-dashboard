-- Subplan 5 Stage 4 — dev seed: 5-7 sample tasks across users.
-- Idempotent: skips if not enough seed users or sample tasks already exist.

BEGIN;

DO $$
DECLARE
  v_admin    integer;
  v_tl       integer;
  v_mod      integer;
  v_op1      integer;
  v_op2      integer;
  v_t1 integer; v_t2 integer; v_t3 integer; v_t4 integer; v_t5 integer; v_t6 integer; v_t7 integer;
BEGIN
  SELECT id INTO v_admin FROM dashboard_users WHERE role IN ('admin', 'superadmin') AND is_active ORDER BY id LIMIT 1;
  SELECT id INTO v_tl    FROM dashboard_users WHERE role = 'teamlead' AND is_active ORDER BY id LIMIT 1;
  SELECT id INTO v_mod   FROM dashboard_users WHERE role = 'moderator' AND is_active ORDER BY id LIMIT 1;
  SELECT id INTO v_op1   FROM dashboard_users WHERE role = 'operator' AND is_active ORDER BY id OFFSET 0 LIMIT 1;
  SELECT id INTO v_op2   FROM dashboard_users WHERE role = 'operator' AND is_active ORDER BY id OFFSET 1 LIMIT 1;

  IF v_admin IS NULL OR v_tl IS NULL OR v_mod IS NULL OR v_op1 IS NULL THEN
    RAISE NOTICE 'Subplan 5 task seed skipped: need admin/TL/mod/operator users.';
    RETURN;
  END IF;

  -- Skip if sample tasks already exist
  IF EXISTS (SELECT 1 FROM tasks WHERE title LIKE '[seed]%' LIMIT 1) THEN
    RAISE NOTICE 'Subplan 5 task seed skipped: sample tasks already exist.';
    RETURN;
  END IF;

  -- 1. Pending, deadline через 2 дня (от admin → op1)
  INSERT INTO tasks (title, description, created_by, assigned_to, deadline, status)
    VALUES ('[seed] Загрузить контент за неделю', 'Скрин-репорт + ссылки в отчёт.', v_admin, v_op1, now() + interval '2 days', 'pending')
    RETURNING id INTO v_t1;
  INSERT INTO task_activity (task_id, actor_id, event_type, payload)
    VALUES (v_t1, v_admin, 'task_created', jsonb_build_object('title', '[seed] Загрузить контент за неделю', 'assigned_to', v_op1, 'deadline', (now() + interval '2 days')));

  -- 2. In_progress, deadline вчера → будет computed overdue (от admin → op1)
  INSERT INTO tasks (title, description, created_by, assigned_to, deadline, status)
    VALUES ('[seed] Просрочена: проверить переводы', 'Проверка переводов за прошлую неделю.', v_admin, v_op1, now() - interval '1 day', 'in_progress')
    RETURNING id INTO v_t2;
  INSERT INTO task_activity (task_id, actor_id, event_type, payload)
    VALUES (v_t2, v_admin, 'task_created', jsonb_build_object('title', '[seed] Просрочена: проверить переводы', 'assigned_to', v_op1, 'deadline', (now() - interval '1 day'))),
           (v_t2, v_op1, 'taken_in_progress', '{}'::jsonb);

  -- 3. Done, completed (от admin → op2 + inline report)
  IF v_op2 IS NOT NULL THEN
    INSERT INTO tasks (title, description, created_by, assigned_to, deadline, status, completed_at)
      VALUES ('[seed] Завершено: подготовить ответы', 'Подготовить шаблоны ответов.', v_admin, v_op2, now() - interval '3 days', 'done', now() - interval '1 day')
      RETURNING id INTO v_t3;
    INSERT INTO task_reports (task_id, reporter_id, content, media)
      VALUES (v_t3, v_op2, 'Готово. Шаблоны загружены в Notion (ссылка в Slack).', '[]'::jsonb);
    INSERT INTO task_activity (task_id, actor_id, event_type, payload)
      VALUES (v_t3, v_admin, 'task_created', jsonb_build_object('title', '[seed] Завершено: подготовить ответы', 'assigned_to', v_op2, 'deadline', (now() - interval '3 days'))),
             (v_t3, v_op2, 'taken_in_progress', '{}'::jsonb),
             (v_t3, v_op2, 'report_submitted', jsonb_build_object('has_content', true, 'media_count', 0));
  END IF;

  -- 4. Pending от TL → op1 (если op1 в команде где TL — лид; иначе skip с notice)
  IF can_assign_task(v_tl, v_op1) THEN
    INSERT INTO tasks (title, description, created_by, assigned_to, deadline, status)
      VALUES ('[seed] От ТЛ: усилить активность', 'Увеличить количество сообщений на этой неделе.', v_tl, v_op1, now() + interval '7 days', 'pending')
      RETURNING id INTO v_t4;
    INSERT INTO task_activity (task_id, actor_id, event_type, payload)
      VALUES (v_t4, v_tl, 'task_created', jsonb_build_object('title', '[seed] От ТЛ: усилить активность', 'assigned_to', v_op1, 'deadline', (now() + interval '7 days')));
  ELSE
    RAISE NOTICE 'Skipped TL→op1 task (op1 не в команде TL).';
  END IF;

  -- 5. In_progress от moderator → op (если курирует)
  IF v_mod IS NOT NULL AND v_op1 IS NOT NULL AND can_assign_task(v_mod, v_op1) THEN
    INSERT INTO tasks (title, description, created_by, assigned_to, deadline, status)
      VALUES ('[seed] От модератора: проверить отчёт', 'Прислать скриншоты статистики.', v_mod, v_op1, now() + interval '1 hour', 'in_progress')
      RETURNING id INTO v_t5;
    INSERT INTO task_activity (task_id, actor_id, event_type, payload)
      VALUES (v_t5, v_mod, 'task_created', jsonb_build_object('title', '[seed] От модератора: проверить отчёт', 'assigned_to', v_op1, 'deadline', (now() + interval '1 hour'))),
             (v_t5, v_op1, 'taken_in_progress', '{}'::jsonb);
  ELSE
    RAISE NOTICE 'Skipped mod→op1 task (op1 не курируется модератором).';
  END IF;

  -- 6. Pending от admin → mod (cross-staff)
  INSERT INTO tasks (title, description, created_by, assigned_to, deadline, status)
    VALUES ('[seed] Cross-staff: подготовить отчёт', 'Подготовить отчёт по работе команды.', v_admin, v_mod, now() + interval '3 days', 'pending')
    RETURNING id INTO v_t6;
  INSERT INTO task_activity (task_id, actor_id, event_type, payload)
    VALUES (v_t6, v_admin, 'task_created', jsonb_build_object('title', '[seed] Cross-staff: подготовить отчёт', 'assigned_to', v_mod, 'deadline', (now() + interval '3 days')));

  -- 7. Cancelled (от admin → op1)
  INSERT INTO tasks (title, description, created_by, assigned_to, deadline, status)
    VALUES ('[seed] Отменена: устаревшая задача', 'Уже не актуально.', v_admin, v_op1, now() - interval '5 days', 'cancelled')
    RETURNING id INTO v_t7;
  INSERT INTO task_activity (task_id, actor_id, event_type, payload)
    VALUES (v_t7, v_admin, 'task_created', jsonb_build_object('title', '[seed] Отменена: устаревшая задача', 'assigned_to', v_op1, 'deadline', (now() - interval '5 days'))),
           (v_t7, v_admin, 'task_cancelled', jsonb_build_object('reason', NULL));

  RAISE NOTICE 'Subplan 5 seed: created tasks t1=% t2=% t3=% t4=% t5=% t6=% t7=%', v_t1, v_t2, COALESCE(v_t3,0), COALESCE(v_t4,0), COALESCE(v_t5,0), v_t6, v_t7;
END $$;

COMMIT;

-- ROLLBACK:
--   DELETE FROM task_activity WHERE task_id IN (SELECT id FROM tasks WHERE title LIKE '[seed]%');
--   DELETE FROM task_reports WHERE task_id IN (SELECT id FROM tasks WHERE title LIKE '[seed]%');
--   DELETE FROM tasks WHERE title LIKE '[seed]%';
