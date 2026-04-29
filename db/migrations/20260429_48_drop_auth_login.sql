-- Migration 48: Stage 14 — Drop legacy auth_login RPC.
--
-- auth_login(text, text) was the bcrypt-against-dashboard_users.password_hash
-- entry point used before Supabase Auth. Replaced by
-- supabase.auth.signInWithPassword() (see useAuth + LoginPage). With
-- migration 47 having revoked EXECUTE from anon on every public function,
-- the RPC is unreachable in practice; this migration removes it outright.
--
-- dashboard_users.password_hash is retained ~30 days as rollback safety;
-- a separate follow-up migration drops the column (Stage 16).

BEGIN;

DROP FUNCTION IF EXISTS public.auth_login(text, text);

COMMENT ON COLUMN public.dashboard_users.password_hash IS
  'DEPRECATED 2026-04-29. Retained as rollback safety until ~2026-05-29. Drop scheduled in follow-up migration (Stage 16).';

COMMIT;
