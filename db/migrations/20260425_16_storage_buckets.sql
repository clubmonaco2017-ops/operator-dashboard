-- Migration 16: Supabase Storage buckets для Subplan 3 (Clients)
--
-- Buckets:
--   client-avatars  — аватары клиентов (jpg/png, до 5 МБ)
--   client-photos   — фото-галерея (jpg/png/webp, до 25 МБ)
--   client-videos   — видео-галерея (mp4/webm/mov H.264, до 500 МБ)
--
-- Все buckets публично-читаемые (URL-based access для рендера в галерее).
-- Запись разрешена для anon/authenticated, но защита идёт через RPC add_client_media:
-- без записи в client_media файл фактически "висит" без ссылки.
--
-- ВАЖНО: если эта миграция не пройдёт в Supabase из-за прав, создай buckets
-- через Dashboard → Storage → New bucket с теми же именами и `public = true`.

BEGIN;

-- ---------------------------------------------------------------------------
-- Создание buckets (идемпотентно через ON CONFLICT)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('client-avatars', 'client-avatars', true,
    5242880,                                          -- 5 МБ
    ARRAY['image/jpeg','image/png','image/webp']),
  ('client-photos',  'client-photos',  true,
    26214400,                                         -- 25 МБ
    ARRAY['image/jpeg','image/png','image/webp']),
  ('client-videos',  'client-videos',  true,
    524288000,                                        -- 500 МБ
    ARRAY['video/mp4','video/webm','video/quicktime'])
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Storage policies
-- ---------------------------------------------------------------------------
-- Drop existing if rerun
DROP POLICY IF EXISTS "client_media_public_read" ON storage.objects;
DROP POLICY IF EXISTS "client_media_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "client_media_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "client_media_authenticated_delete" ON storage.objects;

-- Public read for all 3 buckets
CREATE POLICY "client_media_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id IN ('client-avatars','client-photos','client-videos'));

-- Insert (upload) — anon + authenticated; защита через RPC add_client_media
CREATE POLICY "client_media_authenticated_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id IN ('client-avatars','client-photos','client-videos'));

-- Update (rename / replace) — anon + authenticated; защита через RPC update_client_media
CREATE POLICY "client_media_authenticated_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id IN ('client-avatars','client-photos','client-videos'));

-- Delete — anon + authenticated; защита через RPC delete_client_media
CREATE POLICY "client_media_authenticated_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id IN ('client-avatars','client-photos','client-videos'));

COMMIT;

-- VERIFY:
--   SELECT id, name, public, file_size_limit FROM storage.buckets
--     WHERE id IN ('client-avatars','client-photos','client-videos');
--   -- Expected: 3 rows.
--
--   SELECT policyname FROM pg_policies
--     WHERE tablename = 'objects' AND schemaname = 'storage'
--       AND policyname LIKE 'client_media_%';
--   -- Expected: 4 policies.
--
-- ROLLBACK:
--   DROP POLICY IF EXISTS "client_media_public_read"           ON storage.objects;
--   DROP POLICY IF EXISTS "client_media_authenticated_insert"  ON storage.objects;
--   DROP POLICY IF EXISTS "client_media_authenticated_update"  ON storage.objects;
--   DROP POLICY IF EXISTS "client_media_authenticated_delete"  ON storage.objects;
--   DELETE FROM storage.buckets
--     WHERE id IN ('client-avatars','client-photos','client-videos');
--   -- !! При DELETE buckets все файлы внутри будут потеряны.
