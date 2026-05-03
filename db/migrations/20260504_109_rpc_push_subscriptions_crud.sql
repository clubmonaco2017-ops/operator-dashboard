-- Migration 109: upsert/delete RPCs for push subscriptions.

BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text DEFAULT NULL
)
RETURNS bigint
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_id        bigint;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF p_endpoint IS NULL OR p_p256dh IS NULL OR p_auth IS NULL THEN
    RAISE EXCEPTION 'endpoint/p256dh/auth required' USING errcode = '22023';
  END IF;

  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (v_caller_id, p_endpoint, p_p256dh, p_auth, p_user_agent)
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id      = EXCLUDED.user_id,
        p256dh       = EXCLUDED.p256dh,
        auth         = EXCLUDED.auth,
        user_agent   = COALESCE(EXCLUDED.user_agent, push_subscriptions.user_agent),
        last_seen_at = now(),
        disabled_at  = NULL
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.delete_push_subscription(p_endpoint text)
RETURNS void
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  DELETE FROM public.push_subscriptions
   WHERE endpoint = p_endpoint
     AND user_id  = v_caller_id;
END $$;

GRANT EXECUTE ON FUNCTION public.upsert_push_subscription(text, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_push_subscription(text)
  TO authenticated;

COMMIT;

-- VERIFY:
--   SELECT public.upsert_push_subscription('https://example.test/x','p','a','UA') AS new_id;
--   SELECT * FROM push_subscriptions WHERE endpoint = 'https://example.test/x';
--   SELECT public.delete_push_subscription('https://example.test/x');
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.delete_push_subscription(text);
--   DROP FUNCTION IF EXISTS public.upsert_push_subscription(text, text, text, text);
