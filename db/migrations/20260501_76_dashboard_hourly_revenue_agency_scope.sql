-- Migration 76: dashboard_hourly_revenue — agency scoping (P0 fix from review)
--
-- Раньше: GRANT EXECUTE TO anon, authenticated; без caller-check; выдавала
-- revenue по ВСЕМ refcode'ам глобально → любой залогиненный (или anon с
-- jwt) видит revenue всех агентств. После multi-agency rollout это утечка.
--
-- Фикс:
--   - REVOKE FROM anon (требуем login)
--   - current_dashboard_user_id() гейт
--   - p_agency_id uuid DEFAULT NULL: NULL = combined view через
--     accessible_agencies(caller); UUID = assert + narrow
--   - Фильтр refcode по dashboard_users.agency_id (non-admin),
--     admin/superadmin не имеют agency_id и не появляются в hourly_revenue
--     (они не операторы; revenue генерируется операторами)

DROP FUNCTION IF EXISTS public.dashboard_hourly_revenue(date, date, text);

CREATE OR REPLACE FUNCTION public.dashboard_hourly_revenue(
  p_from      date,
  p_to        date,
  p_tz        text DEFAULT 'Europe/Kiev',
  p_agency_id uuid DEFAULT NULL
) RETURNS TABLE (
  refcode    text,
  local_hour integer,
  delta_sum  numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  IF p_agency_id IS NOT NULL THEN
    PERFORM assert_agency_access(v_caller_id, p_agency_id);
  END IF;

  RETURN QUERY
  WITH expanded AS (
    SELECT
      hr.refcode,
      ((hr.date + make_interval(hours => hr.hour)) AT TIME ZONE 'UTC' AT TIME ZONE p_tz) AS local_dt,
      hr.delta
    FROM hourly_revenue hr
    WHERE hr.date >= (p_from - INTERVAL '1 day')::date
      AND hr.date <= (p_to + INTERVAL '1 day')::date
      AND lower(hr.refcode) <> 'all'
      AND hr.refcode IN (
        SELECT u.ref_code FROM dashboard_users u
         WHERE u.agency_id IS NOT NULL
           AND (
             (p_agency_id IS NOT NULL AND u.agency_id = p_agency_id)
             OR (p_agency_id IS NULL AND u.agency_id IN (
                   SELECT acc.agency_id FROM accessible_agencies(v_caller_id) acc
                ))
           )
      )
  )
  SELECT
    e.refcode,
    EXTRACT(HOUR FROM e.local_dt)::int AS local_hour,
    SUM(e.delta)::numeric AS delta_sum
  FROM expanded e
  WHERE e.local_dt::date >= p_from
    AND e.local_dt::date <= p_to
  GROUP BY e.refcode, EXTRACT(HOUR FROM e.local_dt)
  ORDER BY e.refcode, EXTRACT(HOUR FROM e.local_dt);
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_hourly_revenue(date, date, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dashboard_hourly_revenue(date, date, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.dashboard_hourly_revenue(date, date, text, uuid) TO authenticated;
