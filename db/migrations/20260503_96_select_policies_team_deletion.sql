-- Migration 96: SELECT policies for team_activity + deletion_requests
-- (required for Realtime broadcast under anon role; mirror task_activity migration 88).

BEGIN;

CREATE POLICY team_activity_select_realtime
  ON public.team_activity FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY deletion_requests_select_realtime
  ON public.deletion_requests FOR SELECT
  TO anon, authenticated
  USING (true);

COMMIT;

-- VERIFY:
--   SELECT polname, polrelid::regclass FROM pg_policy
--   WHERE polrelid IN ('public.team_activity'::regclass, 'public.deletion_requests'::regclass);
--
-- ROLLBACK:
--   DROP POLICY team_activity_select_realtime ON public.team_activity;
--   DROP POLICY deletion_requests_select_realtime ON public.deletion_requests;
