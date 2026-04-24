-- Migration 04: Create user_attributes table
-- Flexible key-value store for per-user metadata (shift, panel_id, team_id, etc.)
-- FK user_id is integer to match dashboard_users.id type.

BEGIN;

CREATE TABLE IF NOT EXISTS user_attributes (
  user_id  integer NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
  key      text NOT NULL,
  value    text NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_user_attributes_user_id
  ON user_attributes(user_id);

ALTER TABLE user_attributes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE user_attributes IS
  'Flexible user metadata. Common keys: shift (ДЕНЬ|ВЕЧЕР|НОЧЬ),
   panel_id (Tableau admin panel), team_id (UUID of team).';

COMMIT;

-- VERIFY:
--   SELECT column_name, data_type FROM information_schema.columns
--     WHERE table_name='user_attributes' ORDER BY ordinal_position;
--   -- Expected: 3 columns: user_id integer, key text, value text.
--
-- ROLLBACK:
--   DROP TABLE user_attributes;
