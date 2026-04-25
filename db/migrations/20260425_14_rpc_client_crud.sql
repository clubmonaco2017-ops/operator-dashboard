-- Migration 14: Clients CRUD RPC functions
--   create_client          — create a new client (with activity log)
--   list_clients           — list clients with filters + counts (photos/videos)
--   get_client_detail      — single client + counts + recent activity
--   update_client          — edit fields (with activity log per changed group)
--   archive_client         — soft-delete (is_active=false)
--   restore_client         — restore archived client (is_active=true)
--
-- Permission: all functions check has_permission(caller, 'manage_clients').

BEGIN;

-- ---------------------------------------------------------------------------
-- create_client
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_client(
  p_caller_id   integer,
  p_name        text,
  p_alias       text,
  p_description text,
  p_avatar_url  text,
  p_platform_id uuid,
  p_agency_id   uuid,
  p_tableau_id  text
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_new_id integer;
BEGIN
  IF NOT has_permission(p_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', p_caller_id;
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
    p_caller_id
  )
  RETURNING id INTO v_new_id;

  -- Activity: created
  INSERT INTO client_activity (client_id, actor_id, event_type, payload)
  VALUES (v_new_id, p_caller_id, 'created', jsonb_build_object('name', trim(p_name)));

  RETURN v_new_id;
END $$;

GRANT EXECUTE ON FUNCTION create_client(integer, text, text, text, text, uuid, uuid, text)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- list_clients — фильтры + счётчики фото/видео
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION list_clients(
  p_caller_id      integer,
  p_filter_active  text DEFAULT 'active',   -- 'active' | 'archived' | 'all'
  p_filter_platform uuid DEFAULT NULL,
  p_filter_agency   uuid DEFAULT NULL,
  p_search         text DEFAULT NULL
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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT has_permission(p_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', p_caller_id;
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
    AND (p_filter_agency   IS NULL OR c.agency_id   = p_filter_agency)
    AND (p_search IS NULL
         OR length(trim(p_search)) = 0
         OR lower(c.name)  LIKE '%' || lower(trim(p_search)) || '%'
         OR lower(COALESCE(c.alias, '')) LIKE '%' || lower(trim(p_search)) || '%')
  ORDER BY c.is_active DESC, lower(c.name) ASC;
END $$;

GRANT EXECUTE ON FUNCTION list_clients(integer, text, uuid, uuid, text)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_client_detail — single row + counts (без activity, она через отдельный endpoint)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_client_detail(
  p_caller_id integer,
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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT has_permission(p_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', p_caller_id;
  END IF;

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
END $$;

GRANT EXECUTE ON FUNCTION get_client_detail(integer, integer)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- update_client — частичный update (NULL для каждого аргумента означает «не менять»)
-- ---------------------------------------------------------------------------
-- Sentinel-семантика очистки nullable полей:
--   p_X = NULL          → не менять
--   p_X = ''            → не менять (NULLIF фильтрует пустые строки на input'ах)
--   p_clear_X = true    → принудительно установить NULL
CREATE OR REPLACE FUNCTION update_client(
  p_caller_id    integer,
  p_client_id    integer,
  p_name         text  DEFAULT NULL,
  p_alias        text  DEFAULT NULL,
  p_description  text  DEFAULT NULL,
  p_avatar_url   text  DEFAULT NULL,
  p_platform_id  uuid  DEFAULT NULL,
  p_agency_id    uuid  DEFAULT NULL,
  p_tableau_id   text  DEFAULT NULL,
  p_clear_alias       boolean DEFAULT false,
  p_clear_description boolean DEFAULT false,
  p_clear_avatar_url  boolean DEFAULT false,
  p_clear_tableau_id  boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_changed_fields text[] := ARRAY[]::text[];
  v_description_changed boolean := false;
  v_profile_changed     boolean := false;
BEGIN
  IF NOT has_permission(p_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', p_caller_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id) THEN
    RAISE EXCEPTION 'client % not found', p_client_id;
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
      p_client_id, p_caller_id, 'updated_profile',
      jsonb_build_object('fields', v_changed_fields)
    );
  END IF;

  IF v_description_changed THEN
    INSERT INTO client_activity (client_id, actor_id, event_type, payload)
    VALUES (
      p_client_id, p_caller_id, 'updated_description', '{}'::jsonb
    );
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION update_client(
  integer, integer, text, text, text, text, uuid, uuid, text,
  boolean, boolean, boolean, boolean
) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- archive_client / restore_client
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION archive_client(
  p_caller_id integer,
  p_client_id integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT has_permission(p_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', p_caller_id;
  END IF;

  UPDATE clients SET is_active = false WHERE id = p_client_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'client % not found', p_client_id;
  END IF;

  INSERT INTO client_activity (client_id, actor_id, event_type, payload)
  VALUES (p_client_id, p_caller_id, 'archived', '{}'::jsonb);
END $$;

GRANT EXECUTE ON FUNCTION archive_client(integer, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION restore_client(
  p_caller_id integer,
  p_client_id integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT has_permission(p_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', p_caller_id;
  END IF;

  UPDATE clients SET is_active = true WHERE id = p_client_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'client % not found', p_client_id;
  END IF;

  INSERT INTO client_activity (client_id, actor_id, event_type, payload)
  VALUES (p_client_id, p_caller_id, 'restored', '{}'::jsonb);
END $$;

GRANT EXECUTE ON FUNCTION restore_client(integer, integer) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- list_client_activity — события для правой колонки «Активность»
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION list_client_activity(
  p_caller_id integer,
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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT has_permission(p_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', p_caller_id;
  END IF;

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
END $$;

GRANT EXECUTE ON FUNCTION list_client_activity(integer, integer, integer)
  TO anon, authenticated;

COMMIT;

-- VERIFY:
--   SELECT routine_name FROM information_schema.routines
--     WHERE routine_schema='public'
--     AND routine_name IN ('create_client','list_clients','get_client_detail',
--                          'update_client','archive_client','restore_client',
--                          'list_client_activity')
--     ORDER BY routine_name;
--   -- Expected: 7 rows.
--
-- ROLLBACK:
--   DROP FUNCTION list_client_activity(integer, integer, integer);
--   DROP FUNCTION restore_client(integer, integer);
--   DROP FUNCTION archive_client(integer, integer);
--   DROP FUNCTION update_client(integer, integer, text, text, text, text, uuid, uuid, text,
--                                boolean, boolean, boolean, boolean);
--   DROP FUNCTION get_client_detail(integer, integer);
--   DROP FUNCTION list_clients(integer, text, uuid, uuid, text);
--   DROP FUNCTION create_client(integer, text, text, text, text, uuid, uuid, text);
