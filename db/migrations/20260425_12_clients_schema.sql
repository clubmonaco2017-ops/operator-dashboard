-- Migration 12: Clients (Subplan 3) — schema for clients + client_media tables
--
-- Domain context: «client» = creator (модель) на внешней платформе (OnlyFans/Fansly),
-- от чьего имени работают operators. См. docs/domain-model.md §4.2.
--
-- Tableau ID: каждый клиент опционально связан с дашбордом метрик в Tableau (просмотры,
-- доход, посты). Это другой Tableau-объект, чем dashboard_users.tableau_id (refcode оператора).
-- См. docs/design-feedback/_decisions.md D-11.

BEGIN;

-- ---------------------------------------------------------------------------
-- clients table
-- ---------------------------------------------------------------------------
-- NOTE: platforms.id и agencies.id — uuid (legacy from main).
-- dashboard_users.id — integer (Subplan 1+2). Не путать.
CREATE TABLE IF NOT EXISTS clients (
  id           serial PRIMARY KEY,
  name         text   NOT NULL,
  alias        text,
  description  text,
  avatar_url   text,
  platform_id  uuid    REFERENCES platforms(id) ON DELETE RESTRICT,
  agency_id    uuid    REFERENCES agencies(id)  ON DELETE RESTRICT,
  tableau_id   text,
  is_active    boolean NOT NULL DEFAULT true,
  created_by   integer REFERENCES dashboard_users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Уникальность name внутри одной платформы.
-- На разных платформах модели могут иметь одинаковое publication-name, поэтому
-- глобально name НЕ UNIQUE. alias тоже не UNIQUE — он внутренний поисковый.
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_name_platform
  ON clients (lower(name), platform_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_clients_alias
  ON clients (lower(alias)) WHERE alias IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clients_platform_id
  ON clients (platform_id);

CREATE INDEX IF NOT EXISTS idx_clients_agency_id
  ON clients (agency_id);

CREATE INDEX IF NOT EXISTS idx_clients_tableau_id
  ON clients (tableau_id) WHERE tableau_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clients_active
  ON clients (is_active) WHERE is_active = true;

-- Trigger: updated_at обновляется автоматически
CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clients_updated_at ON clients;
CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION _set_updated_at();

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- client_media table — фото/видео для каждого клиента
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_media (
  id           serial PRIMARY KEY,
  client_id    integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type         text    NOT NULL CHECK (type IN ('photo','video')),
  storage_path text    NOT NULL,                  -- путь в Supabase Storage (bucket/path/file.ext)
  filename     text    NOT NULL,                  -- оригинальное имя файла
  caption      text,                              -- подпись (виден в Lightbox)
  size_bytes   bigint,                            -- размер
  width        integer,                           -- для photo/video
  height       integer,                           -- для photo/video
  duration_ms  integer,                           -- для video (NULL для photo)
  mime_type    text,                              -- 'image/jpeg', 'video/mp4', etc.
  status       text    NOT NULL DEFAULT 'ready'   -- ready | processing | error
                       CHECK (status IN ('ready','processing','error')),
  error_reason text,                              -- если status='error': filled by upload pipeline
  sort_order   integer NOT NULL DEFAULT 0,        -- ручной порядок (sort = 'manual')
  created_by   integer REFERENCES dashboard_users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_media_client_type
  ON client_media (client_id, type, sort_order);

CREATE INDEX IF NOT EXISTS idx_client_media_client_created
  ON client_media (client_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_media_status
  ON client_media (status) WHERE status <> 'ready';

DROP TRIGGER IF EXISTS trg_client_media_updated_at ON client_media;
CREATE TRIGGER trg_client_media_updated_at
  BEFORE UPDATE ON client_media
  FOR EACH ROW
  EXECUTE FUNCTION _set_updated_at();

ALTER TABLE client_media ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- client_activity table — лог событий клиента (для правой колонки «Активность»)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_activity (
  id           serial PRIMARY KEY,
  client_id    integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  actor_id     integer REFERENCES dashboard_users(id) ON DELETE SET NULL,
  -- actor_id = NULL означает «Система»
  event_type   text    NOT NULL CHECK (event_type IN (
                 'created',
                 'updated_profile',
                 'updated_description',
                 'archived',
                 'restored',
                 'media_uploaded',
                 'media_deleted',
                 'media_reordered'
               )),
  payload      jsonb,                              -- детали события
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_activity_client_created
  ON client_activity (client_id, created_at DESC);

ALTER TABLE client_activity ENABLE ROW LEVEL SECURITY;

COMMIT;

-- VERIFY:
--   SELECT table_name FROM information_schema.tables
--     WHERE table_name IN ('clients','client_media','client_activity');
--   -- Expected: 3 rows.
--
--   SELECT column_name, data_type FROM information_schema.columns
--     WHERE table_name = 'clients' ORDER BY ordinal_position;
--   -- Expected columns: id, name, alias, description, avatar_url,
--   --   platform_id, agency_id, tableau_id, is_active, created_by,
--   --   created_at, updated_at.
--
--   SELECT indexname FROM pg_indexes
--     WHERE tablename IN ('clients','client_media','client_activity');
--   -- Expected: 8+ indexes.

-- ROLLBACK:
--   DROP TABLE client_activity;
--   DROP TABLE client_media;
--   DROP TABLE clients;
--   -- _set_updated_at() оставить — он используется и для будущих таблиц.
