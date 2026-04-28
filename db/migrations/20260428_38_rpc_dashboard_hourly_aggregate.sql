-- Migration 38: RPC dashboard_hourly_revenue
--
-- Replaces the client-side .from('hourly_revenue').select(...) call used by
-- src/hooks/useDashboardData.js. The previous direct-table read silently hit
-- the supabase-js default 1000-row response cap on multi-day periods (e.g.
-- a week spans 7 × ~700 rows ≈ 5000), so the dashboard underreported revenue
-- whenever the period was longer than ~1.5 days.
--
-- This RPC does the timezone conversion and per-(refcode, local_hour)
-- aggregation server-side and returns ≤ N_operators × 24 rows (~720 max),
-- which always fits in the default response window.
--
-- Contract:
--   p_from, p_to:  inclusive YYYY-MM-DD bounds in p_tz local time.
--   p_tz:          IANA tz name (default 'Europe/Kiev' to match the existing
--                   client-side TZ constant).
-- Returns rows of (refcode, local_hour, delta_sum) — the same shape the
-- client builds today, just pre-aggregated.

BEGIN;

CREATE OR REPLACE FUNCTION dashboard_hourly_revenue(
  p_from date,
  p_to date,
  p_tz text DEFAULT 'Europe/Kiev'
) RETURNS TABLE (
  refcode text,
  local_hour integer,
  delta_sum numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH expanded AS (
    SELECT
      hr.refcode,
      ((hr.date + make_interval(hours => hr.hour)) AT TIME ZONE 'UTC' AT TIME ZONE p_tz) AS local_dt,
      hr.delta
    FROM hourly_revenue hr
    -- Widen the UTC scan by ±1 day so rows whose UTC date is outside [from,to]
    -- but whose Kiev-local date falls inside the window are still considered.
    WHERE hr.date >= (p_from - INTERVAL '1 day')::date
      AND hr.date <= (p_to + INTERVAL '1 day')::date
      AND lower(hr.refcode) <> 'all'
  )
  SELECT
    refcode,
    EXTRACT(HOUR FROM local_dt)::int AS local_hour,
    SUM(delta)::numeric AS delta_sum
  FROM expanded
  WHERE local_dt::date >= p_from
    AND local_dt::date <= p_to
  GROUP BY refcode, local_hour
  ORDER BY refcode, local_hour;
$$;

GRANT EXECUTE ON FUNCTION dashboard_hourly_revenue(date, date, text) TO anon, authenticated;

COMMIT;

-- VERIFY ----------------------------------------------------------------
-- 1. Function exists and is callable:
--   SELECT count(*) FROM dashboard_hourly_revenue(CURRENT_DATE, CURRENT_DATE);
-- 2. Sanity-check that one day's RPC sum == raw table sum (ignoring TZ
--    boundary effects, the totals should be in the same ballpark):
--   SELECT
--     (SELECT SUM(delta_sum) FROM dashboard_hourly_revenue(CURRENT_DATE, CURRENT_DATE)) AS rpc_total,
--     (SELECT SUM(delta) FROM hourly_revenue
--       WHERE date = CURRENT_DATE AND lower(refcode) <> 'all') AS raw_total;
-- 3. Confirm the week period now returns ≥ a single day's total (the bug
--    being fixed: week was less than a day because of the 1000-row cap).
--    Use integer subtraction (date - int → date), not INTERVAL — the latter
--    returns timestamp and won't match the (date, date) signature.
--   SELECT SUM(delta_sum) FROM dashboard_hourly_revenue(CURRENT_DATE - 6, CURRENT_DATE);

-- ROLLBACK --------------------------------------------------------------
-- DROP FUNCTION IF EXISTS dashboard_hourly_revenue(date, date, text);
-- (Front-end will fall back to broken behavior — re-deploy old useDashboardData.js
--  alongside this rollback.)
