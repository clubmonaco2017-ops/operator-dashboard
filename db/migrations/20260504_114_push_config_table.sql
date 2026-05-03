-- Migration 114: replace GUC-based push webhook config with a config table.
-- Supabase managed Postgres denies ALTER DATABASE / ALTER ROLE for custom
-- parameters from Studio (permission denied for parameter "app.*"), so we
-- store the webhook URL + HMAC secret in a service-role-only table and
-- update enqueue_push_event() to read from it.

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);

REVOKE ALL ON public.push_config FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_config TO service_role;

ALTER TABLE public.push_config ENABLE ROW LEVEL SECURITY;
-- No policies = no access for non-service_role connections.

CREATE OR REPLACE FUNCTION public.enqueue_push_event() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url    text;
  v_secret text;
  v_body   jsonb;
  v_sig    text;
BEGIN
  SELECT value INTO v_url    FROM public.push_config WHERE key = 'webhook_url';
  SELECT value INTO v_secret FROM public.push_config WHERE key = 'webhook_secret';

  IF v_url IS NULL OR v_url = '' OR v_secret IS NULL OR v_secret = '' THEN
    RETURN NEW;  -- not configured: no-op (dev safety / pre-bootstrap)
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

COMMIT;

-- VERIFY (after INSERT-ing config rows):
--   SELECT key FROM public.push_config ORDER BY key;
--   -- expected: webhook_secret, webhook_url
--   -- Then INSERT a sample row into one of the four tracked tables and check
--   -- net._http_response for a recent dispatch:
--   SELECT id, status_code, error_msg FROM net._http_response ORDER BY id DESC LIMIT 3;
--
-- ROLLBACK:
--   -- Restore the GUC-based version of enqueue_push_event from migration 111
--   -- (only if you have a way to set GUCs); otherwise drop the triggers.
--   DROP TABLE IF EXISTS public.push_config;
