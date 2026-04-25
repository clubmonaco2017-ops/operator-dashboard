-- Migration 18: Dedupe agencies + add unique constraint
--
-- В таблице agencies (legacy from main) обнаружены дубликаты строк
-- с одинаковыми (lower(name), platform_id). Лечим:
--   1. Удаляем строки-дубли, оставляя строку с минимальным id (как «канонический» keeper).
--   2. Добавляем UNIQUE INDEX чтобы дубликаты не появлялись снова.
--
-- ВНИМАНИЕ: если в legacy таблицах есть FK на agencies.id (clients ещё нет на этих
-- агентствах — Subplan 3 только начали), DELETE упадёт. Если упадёт — остановись,
-- сначала надо UPDATE ссылок на keeper id (см. блок проверки внизу).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. (Diagnostic) Какие строки будут удалены
-- ---------------------------------------------------------------------------
-- Раскомментируй чтобы увидеть список перед DELETE:
--
-- SELECT a.id, a.name, a.platform_id
-- FROM agencies a
-- WHERE EXISTS (
--   SELECT 1 FROM agencies b
--   WHERE lower(b.name) = lower(a.name)
--     AND b.platform_id = a.platform_id
--     AND b.id < a.id
-- )
-- ORDER BY a.name, a.id;

-- ---------------------------------------------------------------------------
-- 2. DELETE дубликатов (оставляем строку с min(id) per (lower(name), platform_id))
-- ---------------------------------------------------------------------------
DELETE FROM agencies a
WHERE EXISTS (
  SELECT 1 FROM agencies b
  WHERE lower(b.name) = lower(a.name)
    AND b.platform_id = a.platform_id
    AND b.id < a.id
);

-- ---------------------------------------------------------------------------
-- 3. UNIQUE INDEX чтобы повторно не создавались
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_agencies_unique_name_platform
  ON agencies (lower(name), platform_id);

COMMIT;

-- VERIFY:
--   SELECT name, platform_id, COUNT(*) AS dup_count
--   FROM agencies
--   GROUP BY lower(name), platform_id
--   HAVING COUNT(*) > 1;
--   -- Expected: 0 rows.
--
--   SELECT indexname FROM pg_indexes
--     WHERE tablename = 'agencies' AND indexname = 'idx_agencies_unique_name_platform';
--   -- Expected: 1 row.
--
-- ROLLBACK:
--   DROP INDEX idx_agencies_unique_name_platform;
--   -- Восстановить удалённые дубли невозможно (только из бэкапа).
--
-- Если DELETE упал из-за FK constraint:
--   1. Найти dependents: SELECT conname, conrelid::regclass FROM pg_constraint
--      WHERE confrelid = 'agencies'::regclass;
--   2. UPDATE каждого dependent table:
--      UPDATE child_table SET agency_id = (
--        SELECT MIN(b.id) FROM agencies b
--        WHERE lower(b.name) = (SELECT lower(name) FROM agencies WHERE id = child_table.agency_id)
--          AND b.platform_id = (SELECT platform_id FROM agencies WHERE id = child_table.agency_id)
--      ) WHERE agency_id IN (
--        SELECT a.id FROM agencies a WHERE EXISTS (
--          SELECT 1 FROM agencies b
--          WHERE lower(b.name) = lower(a.name) AND b.platform_id = a.platform_id AND b.id < a.id
--        )
--      );
--   3. Снова попробовать DELETE.
