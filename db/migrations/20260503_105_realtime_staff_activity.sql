-- Migration 105: staff_activity → realtime publication + permissive SELECT policy.

BEGIN;

ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_activity;

CREATE POLICY staff_activity_select_realtime
  ON public.staff_activity FOR SELECT
  TO anon, authenticated
  USING (true);

COMMIT;
