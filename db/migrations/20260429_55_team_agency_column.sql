-- Migration 55: teams.agency_id NOT NULL
--
-- Каждая команда принадлежит одному агентству. Применяется ПОСЛЕ миграции 53
-- (cleanup удаляет тестовые teams), поэтому сразу NOT NULL без backfill.

BEGIN;

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES agencies(id) ON DELETE RESTRICT;

-- После cleanup в teams 0 строк, поэтому SET NOT NULL пройдёт мгновенно.
ALTER TABLE teams
  ALTER COLUMN agency_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_teams_agency ON teams(agency_id);

COMMIT;

-- VERIFY:
--   SELECT column_name, is_nullable FROM information_schema.columns
--    WHERE table_name = 'teams' AND column_name = 'agency_id';
--   -- Expected: data_type = uuid, is_nullable = NO.
--
-- ROLLBACK:
--   DROP INDEX idx_teams_agency;
--   ALTER TABLE teams DROP COLUMN agency_id;
