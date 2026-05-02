-- Migration 88: SELECT policy on task_activity to enable Realtime broadcast.
-- Realtime postgres_changes evaluates RLS using the connected role (anon).
-- Without a SELECT policy, events are not broadcast to subscribers.
--
-- Trade-off: anon (with bundle key) can SELECT task_activity rows directly via
-- PostgREST. Payload contains task titles, user IDs, change events. Acceptable
-- for internal-only deployment; writes still go through SECURITY DEFINER RPCs.

BEGIN;

CREATE POLICY task_activity_select_realtime
  ON public.task_activity FOR SELECT
  TO anon, authenticated
  USING (true);

COMMIT;

-- VERIFY:
--   SELECT polname, polcmd FROM pg_policy
--   WHERE polrelid = 'public.task_activity'::regclass;
--   -- Expected: 1 row, polname=task_activity_select_realtime, polcmd=r
--
-- ROLLBACK:
--   DROP POLICY task_activity_select_realtime ON public.task_activity;
