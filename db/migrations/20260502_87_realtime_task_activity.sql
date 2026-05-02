-- Migration 87: add task_activity to supabase_realtime publication.
-- Enables postgres_changes events to be broadcast to subscribed clients.

BEGIN;

ALTER PUBLICATION supabase_realtime ADD TABLE public.task_activity;

COMMIT;

-- VERIFY:
--   SELECT tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime' AND tablename = 'task_activity';
--   -- Expected: 1 row.
--
-- ROLLBACK:
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.task_activity;
