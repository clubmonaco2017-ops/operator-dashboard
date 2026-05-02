-- Migration 83: extend task-reports bucket allowed_mime_types
-- Reason: добавляем PDF, Office docs, архивы, и iPhone HEIC/HEIF.
-- Without this update, storage rejects upload даже если client validation pass.

BEGIN;

UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    -- existing photos
    'image/jpeg',
    'image/png',
    'image/webp',
    -- iPhone photos (HEIC/HEIF)
    'image/heic',
    'image/heif',
    -- existing videos
    'video/mp4',
    'video/webm',
    'video/quicktime',
    -- documents
    'application/pdf',
    'application/msword',                                                          -- .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',     -- .docx
    'application/vnd.ms-excel',                                                    -- .xls
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',           -- .xlsx
    -- archives
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/x-7z-compressed'
  ]
WHERE id = 'task-reports';

COMMIT;

-- VERIFY:
--   SELECT allowed_mime_types FROM storage.buckets WHERE id = 'task-reports';
--   -- Expected: 17 entries including application/pdf, image/heic, application/zip.
--
-- ROLLBACK:
--   UPDATE storage.buckets SET allowed_mime_types = ARRAY[
--     'image/jpeg', 'image/png', 'image/webp',
--     'video/mp4', 'video/webm', 'video/quicktime'
--   ] WHERE id = 'task-reports';
