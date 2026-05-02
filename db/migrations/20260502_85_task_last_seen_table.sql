-- Migration 85: task_last_seen table — per-user-per-task seen tracking.
-- Used by count_unread_tasks RPC + list_tasks is_unread column (migration 86).

BEGIN;

CREATE TABLE IF NOT EXISTS public.task_last_seen (
  user_id      integer NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
  task_id      integer NOT NULL REFERENCES tasks(id)            ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_last_seen_user
  ON public.task_last_seen(user_id);

-- Initial seed: mark all (assignee, creator) × tasks as seen at now()
-- to prevent day-1 shock (huge counter for existing tasks).
INSERT INTO public.task_last_seen (user_id, task_id, last_seen_at)
SELECT u.id, t.id, now()
FROM tasks t
CROSS JOIN dashboard_users u
WHERE u.is_active = true
  AND (t.assigned_to = u.id OR t.created_by = u.id)
ON CONFLICT DO NOTHING;

-- RLS: SECURITY DEFINER RPCs handle access; no row-level policies needed
-- (table is internal, accessed only via RPCs).

COMMIT;

-- VERIFY:
--   SELECT count(*) FROM task_last_seen;
--   -- Expected: ~ (active users × their involved tasks).
--
-- ROLLBACK:
--   DROP TABLE public.task_last_seen;
