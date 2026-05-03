-- Migration 95: add team_activity + deletion_requests to supabase_realtime publication.

BEGIN;

ALTER PUBLICATION supabase_realtime ADD TABLE public.team_activity;
ALTER PUBLICATION supabase_realtime ADD TABLE public.deletion_requests;

COMMIT;

-- VERIFY:
--   SELECT tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime'
--     AND tablename IN ('team_activity', 'deletion_requests');
--   -- Expected: 2 rows.
--
-- ROLLBACK:
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.team_activity;
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.deletion_requests;
