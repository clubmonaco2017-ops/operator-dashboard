-- Migration 15: client_media RPC functions (photos + videos for clients)
--   list_client_media     — список media (photo или video) клиента с сортировкой
--   add_client_media      — зарегистрировать загруженный файл (после Storage upload)
--   update_client_media   — обновить caption
--   reorder_client_media  — массовая перестановка по ordered IDs
--   delete_client_media   — удалить запись + activity
--
-- Permission: все функции проверяют has_permission(caller, 'manage_clients').
--
-- Storage flow:
--   Клиент загружает файл в Supabase Storage (bucket client-photos / client-videos).
--   Storage возвращает path. Клиент вызывает add_client_media с path + metadata.
--   При удалении — клиент сам удаляет файл из Storage (или через cascade trigger в будущем).

BEGIN;

-- ---------------------------------------------------------------------------
-- list_client_media
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION list_client_media(
  p_caller_id integer,
  p_client_id integer,
  p_type      text,                       -- 'photo' | 'video'
  p_sort      text DEFAULT 'manual',      -- 'manual' | 'date_desc' | 'date_asc'
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
BEGIN
  IF NOT has_permission(p_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', p_caller_id;
  END IF;

  IF p_type NOT IN ('photo','video') THEN
    RAISE EXCEPTION 'invalid type: %', p_type;
  END IF;

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

GRANT EXECUTE ON FUNCTION list_client_media(integer, integer, text, text, integer, integer)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- add_client_media — записать факт загрузки
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION add_client_media(
  p_caller_id    integer,
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
  v_new_id integer;
  v_max_order integer;
BEGIN
  IF NOT has_permission(p_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', p_caller_id;
  END IF;

  IF p_type NOT IN ('photo','video') THEN
    RAISE EXCEPTION 'invalid type: %', p_type;
  END IF;
  IF p_status NOT IN ('ready','processing','error') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id) THEN
    RAISE EXCEPTION 'client % not found', p_client_id;
  END IF;

  -- Новый файл идёт в конец очереди при manual sort
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
    p_status, v_max_order + 10, p_caller_id
  )
  RETURNING id INTO v_new_id;

  -- Activity log: только для ready (processing/error не логируем — в основном это batch upload)
  IF p_status = 'ready' THEN
    INSERT INTO client_activity (client_id, actor_id, event_type, payload)
    VALUES (
      p_client_id, p_caller_id, 'media_uploaded',
      jsonb_build_object('media_id', v_new_id, 'type', p_type, 'filename', p_filename)
    );
  END IF;

  RETURN v_new_id;
END $$;

GRANT EXECUTE ON FUNCTION add_client_media(
  integer, integer, text, text, text, bigint, text,
  integer, integer, integer, text, text
) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- update_client_media — caption + status (для transcoding pipeline)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_client_media(
  p_caller_id    integer,
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
BEGIN
  IF NOT has_permission(p_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', p_caller_id;
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('ready','processing','error') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'media % not found', p_media_id;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION update_client_media(
  integer, integer, text, boolean, text, text, integer, integer, integer
) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- reorder_client_media — массовая перестановка
-- p_ordered_ids: массив id в новом порядке (для одного типа: photo или video)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reorder_client_media(
  p_caller_id   integer,
  p_client_id   integer,
  p_type        text,
  p_ordered_ids integer[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id integer;
  v_pos integer := 10;
BEGIN
  IF NOT has_permission(p_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', p_caller_id;
  END IF;
  IF p_type NOT IN ('photo','video') THEN
    RAISE EXCEPTION 'invalid type: %', p_type;
  END IF;

  -- Validate: все id принадлежат этому клиенту и нужного типа
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
    p_client_id, p_caller_id, 'media_reordered',
    jsonb_build_object('type', p_type, 'count', array_length(p_ordered_ids, 1))
  );
END $$;

GRANT EXECUTE ON FUNCTION reorder_client_media(integer, integer, text, integer[])
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- delete_client_media
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_client_media(
  p_caller_id integer,
  p_media_id  integer
) RETURNS TABLE (storage_path text, type text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_client_id    integer;
  v_storage_path text;
  v_type         text;
  v_filename     text;
BEGIN
  IF NOT has_permission(p_caller_id, 'manage_clients') THEN
    RAISE EXCEPTION 'caller % lacks manage_clients', p_caller_id;
  END IF;

  SELECT m.client_id, m.storage_path, m.type, m.filename
    INTO v_client_id, v_storage_path, v_type, v_filename
  FROM client_media m WHERE m.id = p_media_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'media % not found', p_media_id;
  END IF;

  DELETE FROM client_media WHERE id = p_media_id;

  INSERT INTO client_activity (client_id, actor_id, event_type, payload)
  VALUES (
    v_client_id, p_caller_id, 'media_deleted',
    jsonb_build_object('type', v_type, 'filename', v_filename)
  );

  -- Возвращаем storage_path и type — caller удалит файл из Storage
  RETURN QUERY SELECT v_storage_path, v_type;
END $$;

GRANT EXECUTE ON FUNCTION delete_client_media(integer, integer) TO anon, authenticated;

COMMIT;

-- VERIFY:
--   SELECT routine_name FROM information_schema.routines
--     WHERE routine_schema='public'
--     AND routine_name IN ('list_client_media','add_client_media','update_client_media',
--                          'reorder_client_media','delete_client_media')
--     ORDER BY routine_name;
--   -- Expected: 5 rows.
--
-- ROLLBACK:
--   DROP FUNCTION delete_client_media(integer, integer);
--   DROP FUNCTION reorder_client_media(integer, integer, text, integer[]);
--   DROP FUNCTION update_client_media(integer, integer, text, boolean, text, text, integer, integer, integer);
--   DROP FUNCTION add_client_media(integer, integer, text, text, text, bigint, text, integer, integer, integer, text, text);
--   DROP FUNCTION list_client_media(integer, integer, text, text, integer, integer);
