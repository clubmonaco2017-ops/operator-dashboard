-- Migration 27: Tasks + reports + activity log (Subplan 5 Stage 1) — schema only
--
-- Domain context: docs/superpowers/plans/2026-04-26-crm-subplan-5-tasks.md
--                 docs/superpowers/specs/2026-04-26-crm-subplan-5-tasks-design.md (§3.1)
--
-- Sub-domain: «Задача» создаётся менеджером (admin/teamlead/moderator)
-- и назначается одному оператору. По одной задаче возможен ровно один
-- отчёт (`task_reports.task_id` — UNIQUE). Лог событий пишется
-- в `task_activity` (паттерн team_activity / staff_activity — open vocabulary).
--
-- Note: task_reports.reporter_id nullable to preserve report after user deletion
-- (FK ON DELETE SET NULL — NOT NULL was contradictory, blocked dashboard_users delete).
--
-- Инварианты, которые соблюдаются здесь на уровне схемы:
--   - title не пустой                                  → CHECK tasks_title_not_empty
--   - status ∈ {pending, in_progress, done, cancelled} → CHECK tasks_status_valid
--   - completed_at согласован со status='done'         → CHECK tasks_completed_at_consistent
--   - один отчёт на задачу                             → UNIQUE task_reports.task_id
--   - отчёт не пустой (есть текст ИЛИ медиа)          → CHECK task_reports_non_empty
--
-- Инварианты, которые НЕ соблюдаются на уровне схемы (RPC проверит):
--   - role(assigned_to) = 'operator'
--   - role(created_by)  ∈ менеджерские роли
--   - reporter_id = assigned_to (отчёт создаёт исполнитель)
--
-- D-7: status `overdue` НЕ хранится в БД — вычисляется на чтении в RPC
-- (deadline < now() AND status IN ('pending','in_progress')). Поэтому
-- в CHECK enum только 4 значения.

BEGIN;

-- ---------------------------------------------------------------------------
-- tasks — задача, назначенная оператору
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id            serial      PRIMARY KEY,
  title         text        NOT NULL,
  description   text,
  created_by    integer              REFERENCES dashboard_users(id) ON DELETE SET NULL,
  assigned_to   integer     NOT NULL REFERENCES dashboard_users(id) ON DELETE RESTRICT,
  deadline      timestamptz,
  status        text        NOT NULL DEFAULT 'pending',
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_title_not_empty CHECK (length(trim(title)) > 0),
  CONSTRAINT tasks_status_valid CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled')),
  CONSTRAINT tasks_completed_at_consistent CHECK (
    (status = 'done' AND completed_at IS NOT NULL)
    OR (status <> 'done' AND completed_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to
  ON tasks (assigned_to);

CREATE INDEX IF NOT EXISTS idx_tasks_created_by
  ON tasks (created_by);

CREATE INDEX IF NOT EXISTS idx_tasks_status
  ON tasks (status);

-- Частичный индекс — only открытые задачи имеют смысл для дедлайн-сортировки.
CREATE INDEX IF NOT EXISTS idx_tasks_deadline
  ON tasks (deadline)
  WHERE status IN ('pending', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_tasks_created_at
  ON tasks (created_at DESC);

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION _set_updated_at();

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- task_reports — отчёт оператора по задаче (1 на задачу)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_reports (
  id           serial      PRIMARY KEY,
  task_id      integer     NOT NULL REFERENCES tasks(id)            ON DELETE CASCADE,
  reporter_id  integer              REFERENCES dashboard_users(id)  ON DELETE SET NULL,
  content      text,
  media        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_reports_task_unique UNIQUE (task_id),
  CONSTRAINT task_reports_non_empty CHECK (
    length(trim(coalesce(content, ''))) > 0 OR jsonb_array_length(media) > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_task_reports_reporter_id
  ON task_reports (reporter_id);

DROP TRIGGER IF EXISTS trg_task_reports_updated_at ON task_reports;
CREATE TRIGGER trg_task_reports_updated_at
  BEFORE UPDATE ON task_reports
  FOR EACH ROW
  EXECUTE FUNCTION _set_updated_at();

ALTER TABLE task_reports ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- task_activity — лог событий по задаче (правая колонка «Активность» в UI)
-- ---------------------------------------------------------------------------
-- Open event_type: no CHECK constraint — Stage 2+ RPCs add events as needed.
CREATE TABLE IF NOT EXISTS task_activity (
  id         serial      PRIMARY KEY,
  task_id    integer              REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id   integer              REFERENCES dashboard_users(id) ON DELETE SET NULL,
  -- actor_id = NULL → «Система»
  event_type text        NOT NULL,
  payload    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_activity_task_created
  ON task_activity (task_id, created_at DESC);

ALTER TABLE task_activity ENABLE ROW LEVEL SECURITY;

COMMIT;

-- VERIFY:
--   SELECT table_name FROM information_schema.tables
--     WHERE table_schema='public'
--       AND table_name IN ('tasks','task_reports','task_activity');
--   -- Expected: 3 rows.
--
--   SELECT indexname FROM pg_indexes
--     WHERE tablename IN ('tasks','task_reports','task_activity');
--   -- Expected: 8+ indexes (PK + unique + lookup + partial deadline).
--
--   -- One-report-per-task sanity check:
--   SELECT indexdef FROM pg_indexes
--     WHERE indexname LIKE '%task_reports_task_unique%';
--   -- Expected: UNIQUE on (task_id).
--
--   -- Status enum sanity check (must NOT include 'overdue'):
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--     WHERE conname = 'tasks_status_valid';
--   -- Expected: CHECK (status IN ('pending','in_progress','done','cancelled')).
--
-- ROLLBACK:
--   DROP TABLE task_activity;
--   DROP TABLE task_reports;
--   DROP TABLE tasks;
--   -- _set_updated_at() оставить — он используется и для других таблиц.
