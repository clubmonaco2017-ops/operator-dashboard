-- Migration 84: add audio MIME types to task-reports bucket
-- Reason: extends migration 83 with MP3/M4A/OGG/WAV/etc audio formats
-- (voice memos with iPhone, voice notes from operators).

BEGIN;

UPDATE storage.buckets
SET allowed_mime_types = allowed_mime_types || ARRAY[
  'audio/mpeg',        -- .mp3
  'audio/mp4',         -- .m4a (iPhone voice memos)
  'audio/x-m4a',       -- .m4a alternative
  'audio/ogg',         -- .ogg, .oga
  'audio/wav',         -- .wav
  'audio/x-wav',       -- .wav alternative
  'audio/webm',        -- .weba
  'audio/aac',         -- .aac
  'audio/flac'         -- .flac
]
WHERE id = 'task-reports';

COMMIT;

-- VERIFY:
--   SELECT array_length(allowed_mime_types, 1) FROM storage.buckets WHERE id = 'task-reports';
--   -- Expected: 26 entries (17 from migration 83 + 9 new audio).
--
-- ROLLBACK:
--   UPDATE storage.buckets SET allowed_mime_types =
--     array_remove(array_remove(array_remove(allowed_mime_types,
--       'audio/mpeg'), 'audio/mp4'), 'audio/x-m4a')
--   WHERE id = 'task-reports';
--   -- (repeat array_remove for each audio type)
