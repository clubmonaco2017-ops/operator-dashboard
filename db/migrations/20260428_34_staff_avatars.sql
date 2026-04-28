-- Migration 34: Staff avatars
--
-- Adds avatar support for dashboard_users:
--   1. dashboard_users.avatar_url (nullable text)
--   2. staff-avatars storage bucket + policies (mirrors client-avatars bucket)
--   3. update_staff_profile accepts p_avatar_url + p_clear_avatar_url
--   4. list_staff / get_staff_detail return avatar_url
--
-- Backwards compatible: column is nullable, RPC signatures are extended (overload-safe
-- via DROP + recreate to ensure clean replacement).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Schema: avatar_url column
-- ---------------------------------------------------------------------------
ALTER TABLE dashboard_users
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- ---------------------------------------------------------------------------
-- 2. Storage: staff-avatars bucket + policies
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('staff-avatars', 'staff-avatars', true,
    5242880,                                          -- 5 MB
    ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "staff_avatars_public_read"           ON storage.objects;
DROP POLICY IF EXISTS "staff_avatars_authenticated_insert"  ON storage.objects;
DROP POLICY IF EXISTS "staff_avatars_authenticated_update"  ON storage.objects;
DROP POLICY IF EXISTS "staff_avatars_authenticated_delete"  ON storage.objects;

CREATE POLICY "staff_avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'staff-avatars');

CREATE POLICY "staff_avatars_authenticated_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'staff-avatars');

CREATE POLICY "staff_avatars_authenticated_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'staff-avatars');

CREATE POLICY "staff_avatars_authenticated_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'staff-avatars');

-- ---------------------------------------------------------------------------
-- 3. RPC: update_staff_profile — extend with p_avatar_url + p_clear_avatar_url
-- ---------------------------------------------------------------------------
-- Drop the old signature to avoid overload ambiguity.
DROP FUNCTION IF EXISTS update_staff_profile(integer,integer,text,text,text,text);

CREATE OR REPLACE FUNCTION update_staff_profile(
  p_caller_id        integer,
  p_user_id          integer,
  p_first_name       text,
  p_last_name        text,
  p_alias            text,
  p_email            text,
  p_avatar_url       text    DEFAULT NULL,
  p_clear_avatar_url boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (p_caller_id = p_user_id OR has_permission(p_caller_id, 'create_users')) THEN
    RAISE EXCEPTION 'caller % cannot edit user %', p_caller_id, p_user_id;
  END IF;

  UPDATE dashboard_users
  SET first_name = COALESCE(p_first_name, first_name),
      last_name  = COALESCE(p_last_name, last_name),
      alias      = p_alias,
      email      = COALESCE(p_email, email),
      avatar_url = CASE
                     WHEN p_clear_avatar_url THEN NULL
                     WHEN p_avatar_url IS NULL THEN avatar_url
                     ELSE p_avatar_url
                   END
  WHERE id = p_user_id;
END $$;

GRANT EXECUTE ON FUNCTION update_staff_profile(integer,integer,text,text,text,text,text,boolean)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC: list_staff / get_staff_detail — include avatar_url in return shape
-- ---------------------------------------------------------------------------
-- Both functions return TABLE (...). Adding a column requires DROP + recreate.
DROP FUNCTION IF EXISTS list_staff(integer);
DROP FUNCTION IF EXISTS get_staff_detail(integer, integer);

CREATE OR REPLACE FUNCTION list_staff(p_caller_id integer)
RETURNS TABLE (
  id          integer,
  ref_code    text,
  first_name  text,
  last_name   text,
  alias       text,
  email       text,
  role        text,
  is_active   boolean,
  tableau_id  text,
  avatar_url  text,
  created_at  timestamptz,
  permissions text[],
  attributes  jsonb,
  has_pending_deletion boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id, u.ref_code, u.first_name, u.last_name, u.alias, u.email,
    u.role, u.is_active, u.tableau_id, u.avatar_url, u.created_at,
    COALESCE(
      (SELECT array_agg(permission ORDER BY permission) FROM user_permissions WHERE user_id = u.id),
      ARRAY[]::text[]
    ) AS permissions,
    COALESCE(
      (SELECT jsonb_object_agg(key, value) FROM user_attributes WHERE user_id = u.id),
      '{}'::jsonb
    ) AS attributes,
    EXISTS(
      SELECT 1 FROM deletion_requests dr
      WHERE dr.target_user = u.id AND dr.status = 'pending'
    ) AS has_pending_deletion
  FROM dashboard_users u
  WHERE has_permission(p_caller_id, 'create_users')
  ORDER BY u.role, u.ref_code;
$$;

GRANT EXECUTE ON FUNCTION list_staff(integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_staff_detail(p_caller_id integer, p_user_id integer)
RETURNS TABLE (
  id          integer,
  ref_code    text,
  first_name  text,
  last_name   text,
  alias       text,
  email       text,
  role        text,
  is_active   boolean,
  tableau_id  text,
  avatar_url  text,
  created_at  timestamptz,
  permissions text[],
  attributes  jsonb,
  has_pending_deletion boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id, u.ref_code, u.first_name, u.last_name, u.alias, u.email,
    u.role, u.is_active, u.tableau_id, u.avatar_url, u.created_at,
    COALESCE(
      (SELECT array_agg(permission ORDER BY permission) FROM user_permissions WHERE user_id = u.id),
      ARRAY[]::text[]
    ) AS permissions,
    COALESCE(
      (SELECT jsonb_object_agg(key, value) FROM user_attributes WHERE user_id = u.id),
      '{}'::jsonb
    ) AS attributes,
    EXISTS(
      SELECT 1 FROM deletion_requests dr
      WHERE dr.target_user = u.id AND dr.status = 'pending'
    ) AS has_pending_deletion
  FROM dashboard_users u
  WHERE u.id = p_user_id
    AND (p_caller_id = p_user_id OR has_permission(p_caller_id, 'create_users'));
$$;

GRANT EXECUTE ON FUNCTION get_staff_detail(integer, integer) TO anon, authenticated;

COMMIT;

-- VERIFY:
--   -- column added
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'dashboard_users' AND column_name = 'avatar_url';
--   -- bucket + policies
--   SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'staff-avatars';
--   SELECT policyname FROM pg_policies
--     WHERE tablename = 'objects' AND schemaname = 'storage'
--       AND policyname LIKE 'staff_avatars_%';
--   -- 4 policies expected.
--   -- New RPC signature
--   SELECT pg_get_function_identity_arguments(oid)
--     FROM pg_proc WHERE proname = 'update_staff_profile';
--   -- Expected: p_caller_id integer, p_user_id integer, p_first_name text,
--   --           p_last_name text, p_alias text, p_email text,
--   --           p_avatar_url text, p_clear_avatar_url boolean
--
-- ROLLBACK:
--   DROP POLICY IF EXISTS "staff_avatars_public_read"           ON storage.objects;
--   DROP POLICY IF EXISTS "staff_avatars_authenticated_insert"  ON storage.objects;
--   DROP POLICY IF EXISTS "staff_avatars_authenticated_update"  ON storage.objects;
--   DROP POLICY IF EXISTS "staff_avatars_authenticated_delete"  ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'staff-avatars';
--   -- Restore original update_staff_profile / list_staff / get_staff_detail
--   -- from migration 10. Then:
--   ALTER TABLE dashboard_users DROP COLUMN IF EXISTS avatar_url;
