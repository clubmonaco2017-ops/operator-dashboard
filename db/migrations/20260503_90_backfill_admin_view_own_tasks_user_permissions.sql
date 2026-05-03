-- Migration 90: backfill view_own_tasks for existing admins (correct table).
-- get_current_user_profile reads permissions from public.user_permissions
-- (one row per permission), not from dashboard_users.permissions.
-- Migration 89 updated the wrong column — this one fixes it.

BEGIN;

INSERT INTO public.user_permissions (user_id, permission, granted_by, granted_at)
SELECT u.id, 'view_own_tasks', NULL, now()
FROM public.dashboard_users u
WHERE u.role = 'admin'
ON CONFLICT (user_id, permission) DO NOTHING;

COMMIT;

-- VERIFY:
--   SELECT u.id, u.first_name, u.role,
--          EXISTS (SELECT 1 FROM public.user_permissions p
--                  WHERE p.user_id = u.id AND p.permission = 'view_own_tasks') AS has_view_own_tasks
--   FROM public.dashboard_users u
--   WHERE u.role = 'admin';
--   -- Expected: every admin row has has_view_own_tasks = true.
--
-- ROLLBACK:
--   DELETE FROM public.user_permissions
--   WHERE permission = 'view_own_tasks'
--     AND user_id IN (SELECT id FROM public.dashboard_users WHERE role = 'admin');
