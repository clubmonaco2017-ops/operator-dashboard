-- Migration 74: get_team_detail / list_team_activity — agency scoping (P0 fix from review)
--
-- Изначально untouched в multi-agency rollout — review нашёл cross-agency read:
-- любой admin/teamlead/moderator (через v_visible := EXISTS team) мог прочитать
-- состав/клиентов/activity-log команды другого агентства, передав id.
--
-- Фикс: разрешить только если caller имеет access к team.agency_id (через
-- assert_agency_access). superadmin не ограничен. operator пускается через
-- membership-чек (как раньше).

CREATE OR REPLACE FUNCTION public.get_team_detail(
  p_team_id integer
) RETURNS TABLE (
  id              integer,
  name            text,
  lead_user_id    integer,
  lead_name       text,
  lead_role       text,
  members_count   integer,
  clients_count   integer,
  is_active       boolean,
  editable        boolean,
  created_at      timestamptz,
  members         jsonb,
  clients         jsonb,
  created_by_name text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_role      text;
  v_team_agency uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT u.role INTO v_role FROM dashboard_users u WHERE u.id = v_caller_id AND u.is_active = true;
  IF v_role IS NULL THEN
    RETURN;
  END IF;

  SELECT t.agency_id INTO v_team_agency FROM teams t WHERE t.id = p_team_id;
  IF v_team_agency IS NULL THEN
    -- team not found: stay silent (return empty), не утечка id-existence
    RETURN;
  END IF;

  -- Visibility scope:
  --   superadmin → always
  --   admin/teamlead/moderator → only if caller has access to team's agency
  --   operator → only if member of this team
  IF v_role = 'superadmin' THEN
    NULL;
  ELSIF v_role IN ('admin','teamlead','moderator') THEN
    PERFORM assert_agency_access(v_caller_id, v_team_agency);
  ELSIF v_role = 'operator' THEN
    IF NOT EXISTS (SELECT 1 FROM team_members tm
                   WHERE tm.team_id = p_team_id AND tm.operator_id = v_caller_id) THEN
      RETURN;
    END IF;
  ELSE
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.lead_user_id,
    COALESCE(
      NULLIF(trim(COALESCE(lu.first_name, '') || ' ' || COALESCE(lu.last_name, '')), ''),
      lu.alias,
      lu.email
    ) AS lead_name,
    lu.role AS lead_role,
    (SELECT count(*)::int FROM team_members tm WHERE tm.team_id = t.id) AS members_count,
    (SELECT count(*)::int FROM team_clients tc WHERE tc.team_id = t.id) AS clients_count,
    t.is_active,
    (v_role IN ('superadmin','admin') OR t.lead_user_id = v_caller_id) AS editable,
    t.created_at,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'operator_id', mu.id,
         'name', COALESCE(
           NULLIF(trim(COALESCE(mu.first_name, '') || ' ' || COALESCE(mu.last_name, '')), ''),
           mu.alias, mu.email
         ),
         'ref_code',   mu.ref_code,
         'alias',      mu.alias,
         'avatar_url', mu.avatar_url,
         'role',       mu.role
       ) ORDER BY mu.first_name, mu.last_name)
       FROM team_members tm
       JOIN dashboard_users mu ON mu.id = tm.operator_id
       WHERE tm.team_id = t.id),
      '[]'::jsonb
    ) AS members,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'client_id',  c.id,
         'name',       c.name,
         'alias',      c.alias,
         'avatar_url', c.avatar_url
       ) ORDER BY lower(c.name))
       FROM team_clients tc
       JOIN clients c ON c.id = tc.client_id
       WHERE tc.team_id = t.id),
      '[]'::jsonb
    ) AS clients,
    COALESCE(
      NULLIF(trim(COALESCE(cu.first_name, '') || ' ' || COALESCE(cu.last_name, '')), ''),
      cu.alias,
      cu.email
    ) AS created_by_name
  FROM teams t
  LEFT JOIN dashboard_users lu ON lu.id = t.lead_user_id
  LEFT JOIN dashboard_users cu ON cu.id = t.created_by
  WHERE t.id = p_team_id;
END $$;

REVOKE ALL ON FUNCTION public.get_team_detail(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_team_detail(integer) TO authenticated;

-- ============================================================

CREATE OR REPLACE FUNCTION public.list_team_activity(
  p_team_id integer,
  p_limit   integer DEFAULT 12,
  p_offset  integer DEFAULT 0
) RETURNS TABLE (
  id         integer,
  actor_id   integer,
  actor_name text,
  event_type text,
  payload    jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id   integer := current_dashboard_user_id();
  v_role        text;
  v_team_agency uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  SELECT u.role INTO v_role FROM dashboard_users u WHERE u.id = v_caller_id AND u.is_active = true;
  IF v_role IS NULL THEN
    RETURN;
  END IF;

  SELECT t.agency_id INTO v_team_agency FROM teams t WHERE t.id = p_team_id;
  IF v_team_agency IS NULL THEN
    RETURN;
  END IF;

  IF v_role = 'superadmin' THEN
    NULL;
  ELSIF v_role IN ('admin','teamlead','moderator') THEN
    PERFORM assert_agency_access(v_caller_id, v_team_agency);
  ELSIF v_role = 'operator' THEN
    IF NOT EXISTS (SELECT 1 FROM team_members tm
                   WHERE tm.team_id = p_team_id AND tm.operator_id = v_caller_id) THEN
      RETURN;
    END IF;
  ELSE
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.actor_id,
    CASE
      WHEN a.actor_id IS NULL THEN 'Система'
      ELSE COALESCE(
        NULLIF(trim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''),
        u.alias, u.email
      )
    END AS actor_name,
    a.event_type,
    a.payload,
    a.created_at
  FROM team_activity a
  LEFT JOIN dashboard_users u ON u.id = a.actor_id
  WHERE a.team_id = p_team_id
  ORDER BY a.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 100))
  OFFSET GREATEST(0, p_offset);
END $$;

REVOKE ALL ON FUNCTION public.list_team_activity(integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_team_activity(integer, integer, integer) TO authenticated;
