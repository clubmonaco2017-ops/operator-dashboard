-- Migration 47: Stage 14 — Anon-grant audit (defence-in-depth).
--
-- Sweeps every public function still reachable by `anon`. Anon gets EXECUTE
-- two ways: (1) direct GRANT TO anon, (2) inheritance via the default
-- GRANT EXECUTE TO PUBLIC that Postgres applies to every newly-created
-- function. Several bucket migrations (39–44, 46) issued
-- DROP FUNCTION + CREATE OR REPLACE FUNCTION + GRANT TO authenticated,
-- but skipped the matching REVOKE FROM PUBLIC — so anon still reaches
-- those functions via PUBLIC inheritance. A REVOKE FROM anon on such a
-- function is a no-op (no direct grant to revoke); we must REVOKE FROM
-- PUBLIC. Authenticated and service_role keep their explicit grants and
-- continue working.
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
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC',
      rec.nspname, rec.proname, rec.args
    );
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon',
      rec.nspname, rec.proname, rec.args
    );
    RAISE NOTICE 'Revoked PUBLIC+anon EXECUTE on %.%(%)',
      rec.nspname, rec.proname, rec.args;
  END LOOP;
END;
$$;

COMMIT;
