-- Migration 91: per-user notifications "last seen" timestamp.

BEGIN;

ALTER TABLE public.dashboard_users
  ADD COLUMN IF NOT EXISTS last_visited_notifications_at timestamptz;

COMMIT;

-- VERIFY:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='dashboard_users'
--     AND column_name='last_visited_notifications_at';
--
-- ROLLBACK:
--   ALTER TABLE public.dashboard_users DROP COLUMN last_visited_notifications_at;
