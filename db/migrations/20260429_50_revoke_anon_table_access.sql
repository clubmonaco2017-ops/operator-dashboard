-- Migration 50: Stage 14 cleanup — revoke anon's direct table access on
-- the two privileged tables that anon could still SELECT from despite
-- function-level lockdowns.
--
-- Background: Supabase grants ALL ON ALL TABLES TO anon, authenticated by
-- default at project bootstrap. RLS gates per-row access on tables that
-- enable it. dashboard_users never had RLS enabled (intentional — RPCs
-- run as SECURITY DEFINER and never query through anon). clients has RLS
-- enabled but no anon-blocking policy, so anon-denial returns empty data
-- without an error — bypassing the security-test assertion that anon
-- direct-table reads must error out.
--
-- After Stage 14 there is no legitimate reason for anon to touch these
-- tables directly: every read path goes through SECURITY DEFINER RPCs
-- (list_clients, get_current_user_profile, etc.) which use service-role
-- inside their bodies. Revoke SELECT/DML from anon to close the gap.
-- Authenticated keeps its grants; service-role and postgres are unaffected.

BEGIN;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.dashboard_users FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.clients         FROM anon;

COMMIT;
