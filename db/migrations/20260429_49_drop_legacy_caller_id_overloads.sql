-- Migration 49: Stage 14 cleanup — drop any leftover RPC overload still
-- bearing p_caller_id.
--
-- Bucket migrations 39–46 each DROP an old p_caller_id-bearing signature
-- and CREATE a clean replacement. If a DB drifted (e.g. skipped an
-- intermediate migration that altered the old signature — `_33`'s
-- p_clear_deadline addition for update_task is the known case), the old
-- signature survives the targeted DROP and coexists with the new one as
-- a stale overload.
--
-- This sweep drops every public function whose argument list still
-- contains `p_caller_id`. After Stage 14, no such function should exist;
-- this migration enforces that and is a no-op on clean DBs.
-- NOTICE lines record what was swept.

BEGIN;

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND pg_get_function_identity_arguments(p.oid) LIKE '%p_caller_id%'
  LOOP
    EXECUTE format(
      'DROP FUNCTION IF EXISTS %I.%I(%s)',
      rec.nspname, rec.proname, rec.args
    );
    RAISE NOTICE 'Dropped legacy %.%(%)',
      rec.nspname, rec.proname, rec.args;
  END LOOP;
END;
$$;

COMMIT;
