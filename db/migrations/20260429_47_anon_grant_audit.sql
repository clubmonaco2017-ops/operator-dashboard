-- Migration 47: Stage 14 — Anon-grant audit (defence-in-depth).
--
-- After bucket migrations 39–46 each REVOKE EXECUTE ... FROM anon on the
-- functions they touch, this audit sweeps any remaining EXECUTE grants on
-- public functions held by the `anon` role. After this point the only
-- public RPCs anon can reach must be those Edge Functions / privileged
-- code paths grant explicitly via service-role.
--
-- The loop is idempotent: a no-op once applied. NOTICE lines record what
-- was revoked so dev runs leave an audit trail in psql output.

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
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon',
      rec.nspname, rec.proname, rec.args
    );
    RAISE NOTICE 'Revoked anon EXECUTE on %.%(%)',
      rec.nspname, rec.proname, rec.args;
  END LOOP;
END;
$$;

COMMIT;
