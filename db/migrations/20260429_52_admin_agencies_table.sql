-- Migration 52: admin_agencies junction table (admin → agencies many-to-many)
--
-- Один admin может быть привязан к нескольким агентствам. Заполняется superadmin-ом
-- через UI /admin/agencies. См. spec docs/superpowers/specs/2026-04-29-multi-agency-scoping-design.md.

BEGIN;

CREATE TABLE IF NOT EXISTS admin_agencies (
  admin_id     integer     NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
  agency_id    uuid        NOT NULL REFERENCES agencies(id)        ON DELETE CASCADE,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  assigned_by  integer     NOT NULL REFERENCES dashboard_users(id),
  PRIMARY KEY (admin_id, agency_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_agencies_agency
  ON admin_agencies(agency_id);

ALTER TABLE admin_agencies ENABLE ROW LEVEL SECURITY;

-- RLS: anon видит ничего; authenticated читает через RPC. Прямые SELECT не используются.
REVOKE ALL ON admin_agencies FROM PUBLIC;
REVOKE ALL ON admin_agencies FROM anon;

COMMIT;

-- VERIFY:
--   SELECT relname FROM pg_class WHERE relname = 'admin_agencies';
--   -- Expected: 1 row.
--
--   SELECT indexname FROM pg_indexes WHERE tablename = 'admin_agencies';
--   -- Expected: at least PRIMARY KEY index + idx_admin_agencies_agency.
--
-- ROLLBACK:
--   DROP TABLE admin_agencies;
