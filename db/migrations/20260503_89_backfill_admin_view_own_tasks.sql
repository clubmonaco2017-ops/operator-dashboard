-- Migration 89: backfill view_own_tasks for existing admin users.
-- Admin defaults gained view_own_tasks (so admins see TasksOwnCard on Dashboard);
-- existing rows persisted permissions snapshot at creation time, need backfill.
-- permissions column is jsonb, not text[].

BEGIN;

UPDATE public.dashboard_users
SET permissions = permissions || '["view_own_tasks"]'::jsonb
WHERE role = 'admin'
  AND NOT (permissions @> '["view_own_tasks"]'::jsonb);

COMMIT;

-- VERIFY:
--   SELECT id, name, role, permissions FROM public.dashboard_users
--   WHERE role = 'admin';
--   -- Expected: every admin row has 'view_own_tasks' in the permissions JSON.
--
-- ROLLBACK:
--   UPDATE public.dashboard_users
--   SET permissions = (
--     SELECT jsonb_agg(p) FROM jsonb_array_elements_text(permissions) p
--     WHERE p::text != '"view_own_tasks"'
--   )
--   WHERE role = 'admin';
