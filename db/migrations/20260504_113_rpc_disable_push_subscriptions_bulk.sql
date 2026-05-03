-- Migration 113: bulk soft-disable push subscriptions by endpoint.
-- Called from /api/push/dispatch after 404/410 responses from push services.

BEGIN;

CREATE OR REPLACE FUNCTION public.disable_push_subscriptions_bulk(
  p_endpoints text[]
)
RETURNS integer
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.push_subscriptions
     SET disabled_at = now()
   WHERE endpoint = ANY(p_endpoints)
     AND disabled_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.disable_push_subscriptions_bulk(text[])
  TO service_role;

COMMIT;

-- VERIFY:
--   SELECT public.disable_push_subscriptions_bulk(ARRAY['no-such-endpoint']::text[]);
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.disable_push_subscriptions_bulk(text[]);
