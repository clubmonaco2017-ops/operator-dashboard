-- 35: Link dashboard_users to Supabase Auth identities.
-- Phase 1 of auth security migration. NULL allowed; populated by
-- scripts/migrate-users-to-supabase-auth.mjs at cutover.

ALTER TABLE public.dashboard_users
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS dashboard_users_auth_user_id_idx
  ON public.dashboard_users(auth_user_id);

COMMENT ON COLUMN public.dashboard_users.auth_user_id IS
  'FK to auth.users. NULL means user not yet migrated; legacy login still possible during the migration window. Populated by scripts/migrate-users-to-supabase-auth.mjs at cutover.';
