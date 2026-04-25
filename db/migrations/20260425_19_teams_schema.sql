-- Migration 19: Teams + curatorship (Subplan 4 Stage 1) — schema only
--
-- Domain context: см. docs/domain-model.md §3, §4.2 (Subplan 4), §5 (инварианты).
--
-- Sub-domain: «Команда» = 3 оператора + N клиентов, возглавляется teamlead'ом ИЛИ
-- модератором. Параллельно — отдельная связь «модератор-куратор → оператор».
-- Каждый оператор всегда имеет двух супервизоров: TL команды + модератор-куратор.
--
-- Инварианты, которые соблюдаются здесь на уровне схемы:
--   I1. Оператор строго в одной команде         → UNIQUE team_members.operator_id
--   I4. Клиент закреплён максимум за одной командой → UNIQUE team_clients.client_id
--   Curator: один оператор имеет одного куратора-модератора → UNIQUE moderator_operators.operator_id
--
-- Инварианты, которые НЕ соблюдаются на уровне схемы (RPC проверит):
--   - role(operator_id) = 'operator'
--   - role(moderator_id) = 'moderator'
--   - role(lead_user_id) IN ('teamlead','moderator')
--   - max 3 операторов в команде

BEGIN;

-- ---------------------------------------------------------------------------
-- teams — команда (3 оператора + клиенты), ведётся TL или модератором
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teams (
  id            serial      PRIMARY KEY,
  name          text        NOT NULL,
  lead_user_id  integer     NOT NULL REFERENCES dashboard_users(id) ON DELETE RESTRICT,
  -- lead_user_id: teamlead ИЛИ moderator. Проверка роли — в RPC.
  is_active     boolean     NOT NULL DEFAULT true,
  created_by    integer     REFERENCES dashboard_users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teams_name_not_empty CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_teams_lead_user_id
  ON teams (lead_user_id);

CREATE INDEX IF NOT EXISTS idx_teams_is_active
  ON teams (is_active);

-- Глобальная case-insensitive уникальность имени команды.
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_name_lower
  ON teams (lower(name));

DROP TRIGGER IF EXISTS trg_teams_updated_at ON teams;
CREATE TRIGGER trg_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW
  EXECUTE FUNCTION _set_updated_at();

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- team_members — оператор ↔ команда (до 3 операторов на команду)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_members (
  team_id     integer     NOT NULL REFERENCES teams(id)            ON DELETE CASCADE,
  operator_id integer     NOT NULL REFERENCES dashboard_users(id)  ON DELETE CASCADE,
  added_by    integer              REFERENCES dashboard_users(id)  ON DELETE SET NULL,
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, operator_id)
);

-- I1: оператор строго в одной команде.
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_operator_unique
  ON team_members (operator_id);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- team_clients — клиент (модель) ↔ команда
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_clients (
  team_id     integer     NOT NULL REFERENCES teams(id)            ON DELETE CASCADE,
  client_id   integer     NOT NULL REFERENCES clients(id)          ON DELETE CASCADE,
  assigned_by integer              REFERENCES dashboard_users(id)  ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, client_id)
);

-- I4: клиент закреплён максимум за одной командой.
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_clients_client_unique
  ON team_clients (client_id);

ALTER TABLE team_clients ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- moderator_operators — кураторство модератор → оператор (параллельно командам)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS moderator_operators (
  moderator_id integer     NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
  operator_id  integer     NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
  assigned_by  integer              REFERENCES dashboard_users(id) ON DELETE SET NULL,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (moderator_id, operator_id)
);

-- Один оператор имеет одного куратора-модератора (см. §3, схема иерархии).
CREATE UNIQUE INDEX IF NOT EXISTS idx_moderator_operators_operator_unique
  ON moderator_operators (operator_id);

ALTER TABLE moderator_operators ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- team_activity — лог событий команды (правая колонка «Активность» в UI)
-- ---------------------------------------------------------------------------
-- Open event_type: no CHECK constraint — Stage 2+ RPCs add events as needed.
CREATE TABLE IF NOT EXISTS team_activity (
  id         serial      PRIMARY KEY,
  team_id    integer     NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  actor_id   integer              REFERENCES dashboard_users(id) ON DELETE SET NULL,
  -- actor_id = NULL → «Система»
  event_type text        NOT NULL,
  payload    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_activity_team_created
  ON team_activity (team_id, created_at DESC);

ALTER TABLE team_activity ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- staff_activity — generic per-user лог событий (Stage 4: user_archived_with_cascade и др.)
-- ---------------------------------------------------------------------------
-- Open event_type: no CHECK constraint — будущие stages добавляют свои события.
CREATE TABLE IF NOT EXISTS staff_activity (
  id         serial      PRIMARY KEY,
  user_id    integer     NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
  actor_id   integer              REFERENCES dashboard_users(id) ON DELETE SET NULL,
  event_type text        NOT NULL,
  payload    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_activity_user_created
  ON staff_activity (user_id, created_at DESC);

ALTER TABLE staff_activity ENABLE ROW LEVEL SECURITY;

COMMIT;

-- VERIFY:
--   SELECT table_name FROM information_schema.tables
--     WHERE table_schema='public'
--       AND table_name IN ('teams','team_members','team_clients',
--                          'moderator_operators','team_activity','staff_activity');
--   -- Expected: 6 rows.
--
--   SELECT indexname FROM pg_indexes
--     WHERE tablename IN ('teams','team_members','team_clients',
--                         'moderator_operators','team_activity','staff_activity');
--   -- Expected: 12+ indexes (PK + unique + lookup).
--
--   -- I1 sanity check:
--   SELECT indexdef FROM pg_indexes
--     WHERE indexname = 'idx_team_members_operator_unique';
--   -- Expected: UNIQUE on (operator_id).
--
--   -- I4 sanity check:
--   SELECT indexdef FROM pg_indexes
--     WHERE indexname = 'idx_team_clients_client_unique';
--   -- Expected: UNIQUE on (client_id).
--
-- ROLLBACK:
--   DROP TABLE staff_activity;
--   DROP TABLE team_activity;
--   DROP TABLE moderator_operators;
--   DROP TABLE team_clients;
--   DROP TABLE team_members;
--   DROP TABLE teams;
--   -- _set_updated_at() оставить — он используется и для будущих таблиц.
