-- Migration 108: push_subscriptions table.

BEGIN;

CREATE TABLE public.push_subscriptions (
  id            bigserial   PRIMARY KEY,
  user_id       integer     NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
  endpoint      text        NOT NULL UNIQUE,
  p256dh        text        NOT NULL,
  auth          text        NOT NULL,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  disabled_at   timestamptz
);

CREATE INDEX push_subscriptions_user_idx
  ON public.push_subscriptions (user_id)
  WHERE disabled_at IS NULL;

COMMENT ON TABLE public.push_subscriptions IS
  'Web Push subscriptions per browser/device. Soft-disabled (disabled_at) on 404/410 from push service.';

COMMIT;

-- VERIFY:
--   \d+ public.push_subscriptions
--   SELECT COUNT(*) FROM push_subscriptions;
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.push_subscriptions;
