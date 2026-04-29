-- Migration 61: Stage 6 — Scope clients RPC bucket to agency context
--
-- All 8 clients RPCs now require/respect p_agency_id:
--   - Mutating: assert_agency_access(caller, agency_id)
--   - Combined-view (list_*): when p_agency_id IS NULL, filter by accessible_agencies(caller)
--
-- BREAKING: list_clients renames p_filter_agency → p_agency_id.
-- BREAKING: list_unassigned_clients gains p_agency_id parameter.
--
-- See plan: docs/superpowers/plans/2026-04-29-multi-agency-scoping.md (Stage 6, Templates T.1/T.2/T.3).

BEGIN;

-- ============================================================
-- 1. create_client (T.2 — scoped write)
--    Same signature; adds assert_agency_access on p_agency_id.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_client(
  p_name        text,
  p_alias       text,
  p_description text,
  p_avatar_url  text,
  p_platform_id uuid,
  p_agency_id   uuid,
  p_tableau_id  text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_new_id    integer;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF NOT has_permission(v_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', v_caller_id USING errcode = '42501';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name is required';
  END IF;
  IF p_platform_id IS NULL THEN
    RAISE EXCEPTION 'platform_id is required';
  END IF;
  IF p_agency_id IS NULL THEN
    RAISE EXCEPTION 'agency_id is required';
  END IF;

  PERFORM assert_agency_access(v_caller_id, p_agency_id);

  INSERT INTO clients (
    name, alias, description, avatar_url,
    platform_id, agency_id, tableau_id,
    is_active, created_by
  )
  VALUES (
    trim(p_name),
    NULLIF(trim(p_alias), ''),
    NULLIF(p_description, ''),
    NULLIF(p_avatar_url, ''),
    p_platform_id,
    p_agency_id,
    NULLIF(trim(p_tableau_id), ''),
    true,
    v_caller_id
  )
  RETURNING id INTO v_new_id;

  INSERT INTO client_activity (client_id, actor_id, event_type, payload)
  VALUES (v_new_id, v_caller_id, 'created', jsonb_build_object('name', trim(p_name)));

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_client(text, text, text, text, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_client(text, text, text, text, uuid, uuid, text) TO authenticated;

-- ============================================================
-- 2. list_clients (T.1 — combined-view read)
--    BREAKING: p_filter_agency renamed to p_agency_id.
--    p_agency_id NULL = combined view across user's accessible agencies.
-- ============================================================

DROP FUNCTION IF EXISTS public.list_clients(text, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.list_clients(
  p_filter_active   text DEFAULT 'active',   -- 'active' | 'archived' | 'all'
  p_filter_platform uuid DEFAULT NULL,
  p_agency_id       uuid DEFAULT NULL,        -- renamed from p_filter_agency
  p_search          text DEFAULT NULL
) RETURNS TABLE (
  id            integer,
  name          text,
  alias         text,
  description   text,
  avatar_url    text,
  platform_id   uuid,
  platform_name text,
  agency_id     uuid,
  agency_name   text,
  tableau_id    text,
  is_active     boolean,
  photos_count  integer,
  videos_count  integer,
  files_count   integer,
  created_at    timestamptz,
  updated_at    timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF NOT has_permission(v_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', v_caller_id USING errcode = '42501';
  END IF;

  IF p_agency_id IS NOT NULL THEN
    PERFORM assert_agency_access(v_caller_id, p_agency_id);
  END IF;

  RETURN QUERY
  WITH media_counts AS (
    SELECT
      m.client_id,
      COUNT(*) FILTER (WHERE m.type = 'photo' AND m.status = 'ready')::int AS photos,
      COUNT(*) FILTER (WHERE m.type = 'video' AND m.status = 'ready')::int AS videos
    FROM client_media m
    GROUP BY m.client_id
  )
  SELECT
    c.id,
    c.name,
    c.alias,
    c.description,
    c.avatar_url,
    c.platform_id,
    p.name AS platform_name,
    c.agency_id,
    a.name AS agency_name,
    c.tableau_id,
    c.is_active,
    COALESCE(mc.photos, 0) AS photos_count,
    COALESCE(mc.videos, 0) AS videos_count,
    COALESCE(mc.photos, 0) + COALESCE(mc.videos, 0) AS files_count,
    c.created_at,
    c.updated_at
  FROM clients c
  LEFT JOIN platforms p ON p.id = c.platform_id
  LEFT JOIN agencies  a ON a.id = c.agency_id
  LEFT JOIN media_counts mc ON mc.client_id = c.id
  WHERE
    (p_filter_active = 'all'
       OR (p_filter_active = 'active'   AND c.is_active = true)
       OR (p_filter_active = 'archived' AND c.is_active = false))
    AND (p_filter_platform IS NULL OR c.platform_id = p_filter_platform)
    AND (
      (p_agency_id IS NOT NULL AND c.agency_id = p_agency_id)
      OR
      (p_agency_id IS NULL AND c.agency_id IN (
        SELECT acc.agency_id FROM accessible_agencies(v_caller_id) acc
      ))
    )
    AND (p_search IS NULL
         OR length(trim(p_search)) = 0
         OR lower(c.name)  LIKE '%' || lower(trim(p_search)) || '%'
         OR lower(COALESCE(c.alias, '')) LIKE '%' || lower(trim(p_search)) || '%')
  ORDER BY c.is_active DESC, lower(c.name) ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_clients(text, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_clients(text, uuid, uuid, text) TO authenticated;

-- ============================================================
-- 3. get_client_detail (T.3 — scoped read)
--    Resolve agency_id from clients row, then assert.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_client_detail(
  p_client_id integer
) RETURNS TABLE (
  id            integer,
  name          text,
  alias         text,
  description   text,
  avatar_url    text,
  platform_id   uuid,
  platform_name text,
  agency_id     uuid,
  agency_name   text,
  tableau_id    text,
  is_active     boolean,
  photos_count  integer,
  videos_count  integer,
  files_count   integer,
  created_by    integer,
  created_at    timestamptz,
  updated_at    timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_agency_id uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF NOT has_permission(v_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', v_caller_id USING errcode = '42501';
  END IF;

  SELECT c.agency_id INTO v_agency_id FROM clients c WHERE c.id = p_client_id;
  IF v_agency_id IS NULL THEN
    RAISE EXCEPTION 'client % not found', p_client_id USING errcode = 'P0002';
  END IF;
  PERFORM assert_agency_access(v_caller_id, v_agency_id);

  RETURN QUERY
  WITH media_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE m.type = 'photo' AND m.status = 'ready')::int AS photos,
      COUNT(*) FILTER (WHERE m.type = 'video' AND m.status = 'ready')::int AS videos
    FROM client_media m
    WHERE m.client_id = p_client_id
  )
  SELECT
    c.id, c.name, c.alias, c.description, c.avatar_url,
    c.platform_id, p.name AS platform_name,
    c.agency_id,   a.name AS agency_name,
    c.tableau_id, c.is_active,
    COALESCE(mc.photos, 0) AS photos_count,
    COALESCE(mc.videos, 0) AS videos_count,
    COALESCE(mc.photos, 0) + COALESCE(mc.videos, 0) AS files_count,
    c.created_by, c.created_at, c.updated_at
  FROM clients c
  LEFT JOIN platforms p ON p.id = c.platform_id
  LEFT JOIN agencies  a ON a.id = c.agency_id
  CROSS JOIN media_counts mc
  WHERE c.id = p_client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_detail(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_detail(integer) TO authenticated;

-- ============================================================
-- 4. update_client (T.3 — scoped update)
--    Resolve current agency from row, assert. If p_agency_id provided
--    and differs from current — assert on new agency too (move client
--    between agencies; only allowed if caller has access to both).
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_client(
  p_client_id         integer,
  p_name              text    DEFAULT NULL,
  p_alias             text    DEFAULT NULL,
  p_description       text    DEFAULT NULL,
  p_avatar_url        text    DEFAULT NULL,
  p_platform_id       uuid    DEFAULT NULL,
  p_agency_id         uuid    DEFAULT NULL,
  p_tableau_id        text    DEFAULT NULL,
  p_clear_alias       boolean DEFAULT false,
  p_clear_description boolean DEFAULT false,
  p_clear_avatar_url  boolean DEFAULT false,
  p_clear_tableau_id  boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id           integer := current_dashboard_user_id();
  v_existing_agency     uuid;
  v_changed_fields      text[]  := ARRAY[]::text[];
  v_description_changed boolean := false;
  v_profile_changed     boolean := false;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF NOT has_permission(v_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', v_caller_id USING errcode = '42501';
  END IF;

  SELECT c.agency_id INTO v_existing_agency FROM clients c WHERE c.id = p_client_id;
  IF v_existing_agency IS NULL THEN
    RAISE EXCEPTION 'client % not found', p_client_id USING errcode = 'P0002';
  END IF;
  PERFORM assert_agency_access(v_caller_id, v_existing_agency);

  -- If moving client to a different agency, also assert on new agency.
  IF p_agency_id IS NOT NULL AND p_agency_id <> v_existing_agency THEN
    PERFORM assert_agency_access(v_caller_id, p_agency_id);
  END IF;

  v_description_changed := (p_description IS NOT NULL OR p_clear_description);
  v_profile_changed := (
    p_name IS NOT NULL
    OR p_alias IS NOT NULL OR p_clear_alias
    OR p_avatar_url IS NOT NULL OR p_clear_avatar_url
    OR p_platform_id IS NOT NULL
    OR p_agency_id IS NOT NULL
    OR p_tableau_id IS NOT NULL OR p_clear_tableau_id
  );

  UPDATE clients SET
    name        = COALESCE(NULLIF(trim(p_name), ''), name),
    alias       = CASE WHEN p_clear_alias THEN NULL
                       WHEN p_alias IS NULL THEN alias
                       ELSE NULLIF(trim(p_alias), '') END,
    description = CASE WHEN p_clear_description THEN NULL
                       WHEN p_description IS NULL THEN description
                       ELSE p_description END,
    avatar_url  = CASE WHEN p_clear_avatar_url THEN NULL
                       WHEN p_avatar_url IS NULL THEN avatar_url
                       ELSE p_avatar_url END,
    platform_id = COALESCE(p_platform_id, platform_id),
    agency_id   = COALESCE(p_agency_id, agency_id),
    tableau_id  = CASE WHEN p_clear_tableau_id THEN NULL
                       WHEN p_tableau_id IS NULL THEN tableau_id
                       ELSE NULLIF(trim(p_tableau_id), '') END
  WHERE id = p_client_id;

  IF v_profile_changed THEN
    IF p_name IS NOT NULL THEN
      v_changed_fields := array_append(v_changed_fields, 'name');
    END IF;
    IF p_alias IS NOT NULL OR p_clear_alias THEN
      v_changed_fields := array_append(v_changed_fields, 'alias');
    END IF;
    IF p_avatar_url IS NOT NULL OR p_clear_avatar_url THEN
      v_changed_fields := array_append(v_changed_fields, 'avatar_url');
    END IF;
    IF p_platform_id IS NOT NULL THEN
      v_changed_fields := array_append(v_changed_fields, 'platform_id');
    END IF;
    IF p_agency_id IS NOT NULL THEN
      v_changed_fields := array_append(v_changed_fields, 'agency_id');
    END IF;
    IF p_tableau_id IS NOT NULL OR p_clear_tableau_id THEN
      v_changed_fields := array_append(v_changed_fields, 'tableau_id');
    END IF;

    INSERT INTO client_activity (client_id, actor_id, event_type, payload)
    VALUES (
      p_client_id, v_caller_id, 'updated_profile',
      jsonb_build_object('fields', v_changed_fields)
    );
  END IF;

  IF v_description_changed THEN
    INSERT INTO client_activity (client_id, actor_id, event_type, payload)
    VALUES (
      p_client_id, v_caller_id, 'updated_description', '{}'::jsonb
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_client(
  integer, text, text, text, text, uuid, uuid, text,
  boolean, boolean, boolean, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_client(
  integer, text, text, text, text, uuid, uuid, text,
  boolean, boolean, boolean, boolean
) TO authenticated;

-- ============================================================
-- 5. archive_client (T.3 — scoped update)
-- ============================================================

CREATE OR REPLACE FUNCTION public.archive_client(
  p_client_id integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_agency_id uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF NOT has_permission(v_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', v_caller_id USING errcode = '42501';
  END IF;

  SELECT c.agency_id INTO v_agency_id FROM clients c WHERE c.id = p_client_id;
  IF v_agency_id IS NULL THEN
    RAISE EXCEPTION 'client % not found', p_client_id USING errcode = 'P0002';
  END IF;
  PERFORM assert_agency_access(v_caller_id, v_agency_id);

  UPDATE clients SET is_active = false WHERE id = p_client_id;

  INSERT INTO client_activity (client_id, actor_id, event_type, payload)
  VALUES (p_client_id, v_caller_id, 'archived', '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.archive_client(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_client(integer) TO authenticated;

-- ============================================================
-- 6. restore_client (T.3 — scoped update)
-- ============================================================

CREATE OR REPLACE FUNCTION public.restore_client(
  p_client_id integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_agency_id uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF NOT has_permission(v_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', v_caller_id USING errcode = '42501';
  END IF;

  SELECT c.agency_id INTO v_agency_id FROM clients c WHERE c.id = p_client_id;
  IF v_agency_id IS NULL THEN
    RAISE EXCEPTION 'client % not found', p_client_id USING errcode = 'P0002';
  END IF;
  PERFORM assert_agency_access(v_caller_id, v_agency_id);

  UPDATE clients SET is_active = true WHERE id = p_client_id;

  INSERT INTO client_activity (client_id, actor_id, event_type, payload)
  VALUES (p_client_id, v_caller_id, 'restored', '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.restore_client(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_client(integer) TO authenticated;

-- ============================================================
-- 7. list_client_activity (T.3 — scoped read)
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_client_activity(
  p_client_id integer,
  p_limit     integer DEFAULT 12
) RETURNS TABLE (
  id           integer,
  actor_id     integer,
  actor_name   text,
  actor_role   text,
  event_type   text,
  payload      jsonb,
  created_at   timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_agency_id uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF NOT has_permission(v_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', v_caller_id USING errcode = '42501';
  END IF;

  SELECT c.agency_id INTO v_agency_id FROM clients c WHERE c.id = p_client_id;
  IF v_agency_id IS NULL THEN
    RAISE EXCEPTION 'client % not found', p_client_id USING errcode = 'P0002';
  END IF;
  PERFORM assert_agency_access(v_caller_id, v_agency_id);

  RETURN QUERY
  SELECT
    a.id,
    a.actor_id,
    CASE
      WHEN a.actor_id IS NULL THEN 'Система'
      ELSE COALESCE(NULLIF(trim(u.first_name || ' ' || u.last_name), ''), u.email)
    END AS actor_name,
    u.role AS actor_role,
    a.event_type,
    a.payload,
    a.created_at
  FROM client_activity a
  LEFT JOIN dashboard_users u ON u.id = a.actor_id
  WHERE a.client_id = p_client_id
  ORDER BY a.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 100));
END;
$$;

REVOKE ALL ON FUNCTION public.list_client_activity(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_client_activity(integer, integer) TO authenticated;

-- ============================================================
-- 8. list_unassigned_clients (T.1 — combined-view read)
--    BREAKING: gains p_agency_id parameter.
-- ============================================================

DROP FUNCTION IF EXISTS public.list_unassigned_clients(text);

CREATE OR REPLACE FUNCTION public.list_unassigned_clients(
  p_agency_id uuid DEFAULT NULL,
  p_search    text DEFAULT NULL
) RETURNS TABLE (
  id            integer,
  name          text,
  alias         text,
  avatar_url    text,
  platform_name text,
  agency_id     uuid,
  agency_name   text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF NOT has_permission(v_caller_id, 'manage_teams') THEN
    RAISE EXCEPTION 'caller % lacks manage_teams', v_caller_id USING errcode = '42501';
  END IF;

  IF p_agency_id IS NOT NULL THEN
    PERFORM assert_agency_access(v_caller_id, p_agency_id);
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.alias,
    c.avatar_url,
    p.name AS platform_name,
    c.agency_id,
    a.name AS agency_name
  FROM clients c
  LEFT JOIN platforms p ON p.id = c.platform_id
  LEFT JOIN agencies  a ON a.id = c.agency_id
  WHERE c.is_active = true
    AND NOT EXISTS (SELECT 1 FROM team_clients tc WHERE tc.client_id = c.id)
    AND (
      (p_agency_id IS NOT NULL AND c.agency_id = p_agency_id)
      OR
      (p_agency_id IS NULL AND c.agency_id IN (
        SELECT acc.agency_id FROM accessible_agencies(v_caller_id) acc
      ))
    )
    AND (p_search IS NULL
         OR length(trim(p_search)) = 0
         OR lower(c.name)                LIKE '%' || lower(trim(p_search)) || '%'
         OR lower(COALESCE(c.alias, '')) LIKE '%' || lower(trim(p_search)) || '%')
  ORDER BY lower(c.name)
  LIMIT 50;
END;
$$;

REVOKE ALL ON FUNCTION public.list_unassigned_clients(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_unassigned_clients(uuid, text) TO authenticated;

COMMIT;

-- VERIFY:
--   SELECT routine_name, specific_name FROM information_schema.routines
--     WHERE routine_schema = 'public'
--       AND routine_name IN (
--         'create_client', 'update_client', 'archive_client', 'restore_client',
--         'list_clients', 'get_client_detail', 'list_client_activity',
--         'list_unassigned_clients'
--       )
--     ORDER BY routine_name;
--   -- Expected: 8 rows.
--
-- ROLLBACK:
--   -- Re-apply migration 20260428_40_rpc_clients_crud_auth.sql to restore non-scoped versions.
