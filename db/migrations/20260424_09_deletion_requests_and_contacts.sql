-- Migration 09: deletion_requests table + optional contact fields on dashboard_users
-- Deletion workflow: admin requests deletion with reason → superadmin approves/rejects.
-- Contact fields: placeholder nullable columns for future UI (phone, telegram, notes).

BEGIN;

-- Contact fields (all nullable, no default)
ALTER TABLE dashboard_users
  ADD COLUMN IF NOT EXISTS phone    text,
  ADD COLUMN IF NOT EXISTS telegram text,
  ADD COLUMN IF NOT EXISTS notes    text;

-- Deletion requests
CREATE TABLE IF NOT EXISTS deletion_requests (
  id            serial PRIMARY KEY,
  target_user   integer NOT NULL REFERENCES dashboard_users(id),
  requested_by  integer NOT NULL REFERENCES dashboard_users(id),
  reason        text NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected')),
  reviewed_by   integer REFERENCES dashboard_users(id),
  review_note   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_pending
  ON deletion_requests(status) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_deletion_requests_target
  ON deletion_requests(target_user);

ALTER TABLE deletion_requests ENABLE ROW LEVEL SECURITY;

COMMIT;

-- VERIFY:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='dashboard_users' AND column_name IN ('phone','telegram','notes');
--   -- Expected: 3 rows.
--
--   SELECT column_name, data_type FROM information_schema.columns
--     WHERE table_name='deletion_requests' ORDER BY ordinal_position;
--   -- Expected: 10 rows.
--
-- ROLLBACK:
--   DROP TABLE deletion_requests;
--   ALTER TABLE dashboard_users DROP COLUMN phone, DROP COLUMN telegram, DROP COLUMN notes;
