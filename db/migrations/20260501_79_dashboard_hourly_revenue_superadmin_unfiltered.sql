-- Migration 79: dashboard_hourly_revenue — superadmin sees all (including orphaned refcodes)
--
-- После Stage 2 wipe + migration 76 в hourly_revenue остались orphaned refcode'ы
-- (исторические — не привязаны ни к одному dashboard_users.ref_code), и фильтр
-- срезал их → dashboard был пустой даже у superadmin'а.
--
-- Spec: superadmin = глобальный. Возвращаем ему unfiltered view (legacy behavior),
-- non-superadmin остаются agency-scoped через accessible_agencies.

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
  v_caller_id   integer := current_dashboard_user_id();
  v_caller_role text;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT u.role INTO v_caller_role FROM dashboard_users u WHERE u.id = v_caller_id AND u.is_active = true;
  IF v_caller_role IS NULL THEN
    RETURN;
  END IF;

  IF p_agency_id IS NOT NULL THEN
    PERFORM assert_agency_access(v_caller_id, p_agency_id);
  END IF;

  -- Superadmin: ВСЕГДА unfiltered global view (orphaned refcodes тоже видны).
  -- Параметр p_agency_id игнорируем — superadmin кросс-агентский по spec.
  IF v_caller_role = 'superadmin' THEN
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
    RETURN;
  END IF;

  -- Admin/non-admin: agency-scoped через accessible_agencies или explicit p_agency_id
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
