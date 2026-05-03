-- Migration 111: pg_net extension + AFTER INSERT triggers that POST event metadata
-- to /api/push/dispatch with HMAC-SHA256 signature. Trigger is a no-op when
-- app.push_webhook_url / app.push_webhook_secret GUCs are not configured (dev safety).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net;  -- creates schema `net`; preinstalled on Supabase

CREATE OR REPLACE FUNCTION public.enqueue_push_event() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url    text := current_setting('app.push_webhook_url', true);
  v_secret text := current_setting('app.push_webhook_secret', true);
  v_body   jsonb;
  v_sig    text;
BEGIN
  IF v_url IS NULL OR v_url = '' OR v_secret IS NULL OR v_secret = '' THEN
    RETURN NEW;
  END IF;

  v_body := jsonb_build_object(
    'source',     TG_TABLE_NAME,
    'row_id',     NEW.id,
    'created_at', NEW.created_at
  );

  v_sig := encode(
    extensions.hmac(v_body::text::bytea, v_secret::bytea, 'sha256'),
    'hex'
  );

  PERFORM net.http_post(
    url     := v_url,
    body    := v_body,
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'X-Push-Signature', v_sig
    )
  );

  RETURN NEW;
END $$;

CREATE TRIGGER push_event_task_activity
  AFTER INSERT ON public.task_activity
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_push_event();

CREATE TRIGGER push_event_team_activity
  AFTER INSERT ON public.team_activity
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_push_event();

CREATE TRIGGER push_event_staff_activity
  AFTER INSERT ON public.staff_activity
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_push_event();

CREATE TRIGGER push_event_deletion_requests
  AFTER INSERT ON public.deletion_requests
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_push_event();

COMMIT;

-- VERIFY:
--   SELECT tgname, tgrelid::regclass FROM pg_trigger
--    WHERE tgname LIKE 'push_event_%';
--   -- Expected: 4 rows.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS push_event_deletion_requests ON public.deletion_requests;
--   DROP TRIGGER IF EXISTS push_event_staff_activity   ON public.staff_activity;
--   DROP TRIGGER IF EXISTS push_event_team_activity    ON public.team_activity;
--   DROP TRIGGER IF EXISTS push_event_task_activity    ON public.task_activity;
--   DROP FUNCTION IF EXISTS public.enqueue_push_event();
