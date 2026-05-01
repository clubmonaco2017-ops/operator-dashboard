-- Migration 75: client_media bucket — agency scoping (P0 fix from review)
--
-- Все 5 RPC client_media (list/add/update/reorder/delete) принимали p_client_id
-- или p_media_id и проверяли только manage_clients permission. Любой admin/operator
-- одного агентства с этой permission мог читать/писать media чужого клиента.
--
-- Фикс: резолвить client.agency_id и assert_agency_access(caller, agency).
-- Для list/add — через p_client_id; для update/reorder/delete — через media→client.

CREATE OR REPLACE FUNCTION public.list_client_media(
  p_client_id integer,
  p_type      text,
  p_sort      text DEFAULT 'manual',
  p_limit     integer DEFAULT 200,
  p_offset    integer DEFAULT 0
) RETURNS TABLE (
  id           integer,
  client_id    integer,
  type         text,
  storage_path text,
  filename     text,
  caption      text,
  size_bytes   bigint,
  width        integer,
  height       integer,
  duration_ms  integer,
  mime_type    text,
  status       text,
  error_reason text,
  sort_order   integer,
  created_at   timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_agency    uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF NOT has_permission(v_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', v_caller_id USING errcode = '42501';
  END IF;
  IF p_type NOT IN ('photo','video') THEN
    RAISE EXCEPTION 'invalid type: %', p_type;
  END IF;

  SELECT c.agency_id INTO v_agency FROM clients c WHERE c.id = p_client_id;
  IF v_agency IS NULL THEN
    RETURN;
  END IF;
  PERFORM assert_agency_access(v_caller_id, v_agency);

  RETURN QUERY
  SELECT
    m.id, m.client_id, m.type, m.storage_path, m.filename, m.caption,
    m.size_bytes, m.width, m.height, m.duration_ms, m.mime_type,
    m.status, m.error_reason, m.sort_order, m.created_at
  FROM client_media m
  WHERE m.client_id = p_client_id AND m.type = p_type
  ORDER BY
    CASE WHEN p_sort = 'manual'    THEN m.sort_order END ASC,
    CASE WHEN p_sort = 'date_desc' THEN m.created_at END DESC,
    CASE WHEN p_sort = 'date_asc'  THEN m.created_at END ASC,
    m.id ASC
  LIMIT GREATEST(1, LEAST(p_limit, 500))
  OFFSET GREATEST(0, p_offset);
END $$;

GRANT EXECUTE ON FUNCTION public.list_client_media(integer, text, text, integer, integer) TO authenticated;

-- ============================================================

CREATE OR REPLACE FUNCTION public.add_client_media(
  p_client_id    integer,
  p_type         text,
  p_storage_path text,
  p_filename     text,
  p_size_bytes   bigint,
  p_mime_type    text,
  p_width        integer DEFAULT NULL,
  p_height       integer DEFAULT NULL,
  p_duration_ms  integer DEFAULT NULL,
  p_caption      text    DEFAULT NULL,
  p_status       text    DEFAULT 'ready'
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_new_id    integer;
  v_max_order integer;
  v_agency    uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF NOT has_permission(v_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', v_caller_id USING errcode = '42501';
  END IF;
  IF p_type NOT IN ('photo','video') THEN
    RAISE EXCEPTION 'invalid type: %', p_type;
  END IF;
  IF p_status NOT IN ('ready','processing','error') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  SELECT c.agency_id INTO v_agency FROM clients c WHERE c.id = p_client_id;
  IF v_agency IS NULL THEN
    RAISE EXCEPTION 'client % not found', p_client_id USING errcode = 'P0002';
  END IF;
  PERFORM assert_agency_access(v_caller_id, v_agency);

  SELECT COALESCE(MAX(sort_order), 0) INTO v_max_order
  FROM client_media WHERE client_id = p_client_id AND type = p_type;

  INSERT INTO client_media (
    client_id, type, storage_path, filename, caption,
    size_bytes, width, height, duration_ms, mime_type,
    status, sort_order, created_by
  )
  VALUES (
    p_client_id, p_type, p_storage_path, p_filename, NULLIF(p_caption, ''),
    p_size_bytes, p_width, p_height, p_duration_ms, p_mime_type,
    p_status, v_max_order + 10, v_caller_id
  )
  RETURNING id INTO v_new_id;

  IF p_status = 'ready' THEN
    INSERT INTO client_activity (client_id, actor_id, event_type, payload)
    VALUES (
      p_client_id, v_caller_id, 'media_uploaded',
      jsonb_build_object('media_id', v_new_id, 'type', p_type, 'filename', p_filename)
    );
  END IF;

  RETURN v_new_id;
END $$;

GRANT EXECUTE ON FUNCTION public.add_client_media(
  integer, text, text, text, bigint, text,
  integer, integer, integer, text, text
) TO authenticated;

-- ============================================================

CREATE OR REPLACE FUNCTION public.update_client_media(
  p_media_id     integer,
  p_caption      text    DEFAULT NULL,
  p_clear_caption boolean DEFAULT false,
  p_status       text    DEFAULT NULL,
  p_error_reason text    DEFAULT NULL,
  p_width        integer DEFAULT NULL,
  p_height       integer DEFAULT NULL,
  p_duration_ms  integer DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_agency    uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF NOT has_permission(v_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', v_caller_id USING errcode = '42501';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('ready','processing','error') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  SELECT c.agency_id INTO v_agency
    FROM client_media m JOIN clients c ON c.id = m.client_id
   WHERE m.id = p_media_id;
  IF v_agency IS NULL THEN
    RAISE EXCEPTION 'media % not found', p_media_id USING errcode = 'P0002';
  END IF;
  PERFORM assert_agency_access(v_caller_id, v_agency);

  UPDATE client_media SET
    caption      = CASE WHEN p_clear_caption THEN NULL
                        WHEN p_caption IS NULL THEN caption
                        ELSE NULLIF(p_caption, '') END,
    status       = COALESCE(p_status, status),
    error_reason = COALESCE(p_error_reason, error_reason),
    width        = COALESCE(p_width, width),
    height       = COALESCE(p_height, height),
    duration_ms  = COALESCE(p_duration_ms, duration_ms)
  WHERE id = p_media_id;
END $$;

GRANT EXECUTE ON FUNCTION public.update_client_media(
  integer, text, boolean, text, text, integer, integer, integer
) TO authenticated;

-- ============================================================

CREATE OR REPLACE FUNCTION public.reorder_client_media(
  p_client_id   integer,
  p_type        text,
  p_ordered_ids integer[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_id        integer;
  v_pos       integer := 10;
  v_agency    uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF NOT has_permission(v_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', v_caller_id USING errcode = '42501';
  END IF;
  IF p_type NOT IN ('photo','video') THEN
    RAISE EXCEPTION 'invalid type: %', p_type;
  END IF;

  SELECT c.agency_id INTO v_agency FROM clients c WHERE c.id = p_client_id;
  IF v_agency IS NULL THEN
    RAISE EXCEPTION 'client % not found', p_client_id USING errcode = 'P0002';
  END IF;
  PERFORM assert_agency_access(v_caller_id, v_agency);

  IF EXISTS (
    SELECT 1
    FROM unnest(p_ordered_ids) AS x(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM client_media m
      WHERE m.id = x.id AND m.client_id = p_client_id AND m.type = p_type
    )
  ) THEN
    RAISE EXCEPTION 'one or more media ids do not belong to client/type';
  END IF;

  FOREACH v_id IN ARRAY p_ordered_ids LOOP
    UPDATE client_media SET sort_order = v_pos WHERE id = v_id;
    v_pos := v_pos + 10;
  END LOOP;

  INSERT INTO client_activity (client_id, actor_id, event_type, payload)
  VALUES (
    p_client_id, v_caller_id, 'media_reordered',
    jsonb_build_object('type', p_type, 'count', array_length(p_ordered_ids, 1))
  );
END $$;

GRANT EXECUTE ON FUNCTION public.reorder_client_media(integer, text, integer[]) TO authenticated;

-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_client_media(
  p_media_id integer
) RETURNS TABLE (storage_path text, type text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id    integer := current_dashboard_user_id();
  v_client_id    integer;
  v_storage_path text;
  v_type         text;
  v_filename     text;
  v_agency       uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF NOT has_permission(v_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', v_caller_id USING errcode = '42501';
  END IF;

  SELECT m.client_id, m.storage_path, m.type, m.filename, c.agency_id
    INTO v_client_id, v_storage_path, v_type, v_filename, v_agency
  FROM client_media m JOIN clients c ON c.id = m.client_id
  WHERE m.id = p_media_id;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'media % not found', p_media_id USING errcode = 'P0002';
  END IF;
  PERFORM assert_agency_access(v_caller_id, v_agency);

  DELETE FROM client_media WHERE id = p_media_id;

  INSERT INTO client_activity (client_id, actor_id, event_type, payload)
  VALUES (
    v_client_id, v_caller_id, 'media_deleted',
    jsonb_build_object('type', v_type, 'filename', v_filename)
  );

  RETURN QUERY SELECT v_storage_path, v_type;
END $$;

GRANT EXECUTE ON FUNCTION public.delete_client_media(integer) TO authenticated;
