-- Migration 28: Supabase Storage bucket для Subplan 5 (Tasks / отчёты операторов)
--
-- Bucket:
--   task-reports — фото и видео, прикрепляемые к отчёту по задаче
--                  (jpg/png/webp + mp4/webm/mov, до 500 МБ).
--
-- Bucket публично-читаемый (URL-based access для рендера в карточке задачи).
-- Запись/удаление разрешены для anon/authenticated; фактический контроль идёт
-- через RPC submit_task_report (Stage 3) — без записи в task_reports.media файл
-- висит без ссылки.
--
-- ВАЖНО: если эта миграция не пройдёт в Supabase из-за прав, создай bucket
-- через Dashboard → Storage → New bucket с именем `task-reports` и `public = true`.

BEGIN;

-- ---------------------------------------------------------------------------
-- Создание bucket (идемпотентно через ON CONFLICT)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-reports', 'task-reports', true,
  524288000,                                          -- 500 МБ
  ARRAY['image/jpeg', 'image/png', 'image/webp',
        'video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Storage object policies (mirror Subplan 3 pattern in _16_storage_buckets.sql).
-- Public read (anon + authenticated). Authenticated write/update/delete.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "task_reports_public_read"          ON storage.objects;
DROP POLICY IF EXISTS "task_reports_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "task_reports_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "task_reports_authenticated_delete" ON storage.objects;

CREATE POLICY "task_reports_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'task-reports');

CREATE POLICY "task_reports_authenticated_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'task-reports');

CREATE POLICY "task_reports_authenticated_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'task-reports');

CREATE POLICY "task_reports_authenticated_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'task-reports');

COMMIT;

-- VERIFY:
--   SELECT id, name, public, file_size_limit FROM storage.buckets
--     WHERE id = 'task-reports';
--   -- Expected: 1 row, public=true, file_size_limit=524288000.
--
--   SELECT policyname FROM pg_policies
--     WHERE tablename = 'objects' AND schemaname = 'storage'
--       AND policyname LIKE 'task_reports_%';
--   -- Expected: 4 policies.
--
-- ROLLBACK:
--   DROP POLICY IF EXISTS "task_reports_public_read"          ON storage.objects;
--   DROP POLICY IF EXISTS "task_reports_authenticated_insert" ON storage.objects;
--   DROP POLICY IF EXISTS "task_reports_authenticated_update" ON storage.objects;
--   DROP POLICY IF EXISTS "task_reports_authenticated_delete" ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'task-reports';
--   -- !! При DELETE bucket все файлы внутри будут потеряны.
