-- Migration 17: DEV SEED — Subplan 3 sample data
--
-- ВНИМАНИЕ: это dev-данные, чтобы UI был наполнен на этапе разработки.
-- НЕ применяй на production. Если нужно — оберни в транзакцию + явный rollback,
-- либо просто пропусти этот файл при production rollout.
--
-- Идемпотентно: использует ON CONFLICT и WHERE NOT EXISTS.

BEGIN;

-- ---------------------------------------------------------------------------
-- Платформы (если ещё не созданы)
-- ---------------------------------------------------------------------------
INSERT INTO platforms (name)
SELECT v.name
FROM (VALUES
  ('OnlyFans'),
  ('Fansly'),
  ('4based'),
  ('MYM')
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM platforms p WHERE lower(p.name) = lower(v.name));

-- ---------------------------------------------------------------------------
-- Агентства
-- ---------------------------------------------------------------------------
INSERT INTO agencies (name, platform_id)
SELECT v.name, p.id
FROM (VALUES
  ('Aurora Media',   'OnlyFans'),
  ('Velvet Studio',  'OnlyFans'),
  ('Northline Group','OnlyFans'),
  ('Hex Talent',     'Fansly'),
  ('MYM',            'MYM')
) AS v(name, platform_name)
JOIN platforms p ON lower(p.name) = lower(v.platform_name)
WHERE NOT EXISTS (
  SELECT 1 FROM agencies a WHERE lower(a.name) = lower(v.name)
);

-- ---------------------------------------------------------------------------
-- Клиенты (модели). Привязаны к платформам и агентствам по имени.
-- Все active=true кроме Kira Wilde и Rhea Vale (архив).
-- ---------------------------------------------------------------------------
WITH platform_lookup AS (SELECT id, lower(name) AS name FROM platforms),
     agency_lookup   AS (SELECT id, lower(name) AS name FROM agencies),
     candidates AS (
       SELECT * FROM (VALUES
         -- name,         alias,         platform,    agency,           tableau_id,  is_active, description
         ('Sofia Reign',   '@sofia.reign',   'onlyfans', 'aurora media',   'TBL-2351',  true,
           'Топ-1 на Aurora, постоянная аудитория. Контент: lifestyle + fitness, иногда ASMR-войсы. Английский — основной язык в постах.'),
         ('Mia Voss',      '@miavoss',       'fansly',   'aurora media',   NULL,        true,
           'Soft-glam, fashion-ориентированный контент.'),
         ('Luna Park',     '@luna.parked',   'onlyfans', 'velvet studio',  'TBL-1102',  true,
           'Travel + boudoir. Снимает в выезде раз в месяц.'),
         ('Ava Knox',      '@avaknoxx',      '4based',   'velvet studio',  NULL,        true,
           '4based-only, alt-style.'),
         ('Ines Belmont',  '@ines.bel',      'onlyfans', 'northline group', NULL,       true,
           'Новый профиль, меньше 100 подписчиков.'),
         ('Kira Wilde',    '@kirawilde',     'mym',      'mym',            'TBL-0901',  false,
           'Архив: ушла в декрет.'),
         ('Dahlia Cross',  '@dahliacross',   'fansly',   'hex talent',     'TBL-3210',  true,
           'Cosplay + ролевые сценарии. Крупные продажи custom-контента.'),
         ('Noor Sayid',    '@noor.s',        'onlyfans', 'aurora media',   NULL,        true,
           'Сильный engagement в DM.'),
         ('Rhea Vale',     '@rheavale',      'onlyfans', 'hex talent',     NULL,        false,
           'Архив: переехала к другому агенту.')
       ) AS v(name, alias, platform, agency, tableau_id, is_active, description)
     )
INSERT INTO clients (name, alias, description, platform_id, agency_id, tableau_id, is_active)
SELECT
  c.name, c.alias, c.description,
  p.id, a.id, c.tableau_id, c.is_active
FROM candidates c
JOIN platform_lookup p ON p.name = c.platform
JOIN agency_lookup   a ON a.name = c.agency
WHERE NOT EXISTS (
  SELECT 1 FROM clients existing
  WHERE lower(existing.name) = lower(c.name)
    AND existing.platform_id = p.id
);

-- Activity: created event для свежесозданных клиентов
INSERT INTO client_activity (client_id, actor_id, event_type, payload, created_at)
SELECT c.id, NULL, 'created',
       jsonb_build_object('name', c.name, 'seeded', true),
       c.created_at
FROM clients c
WHERE NOT EXISTS (
  SELECT 1 FROM client_activity a
  WHERE a.client_id = c.id AND a.event_type = 'created'
);

COMMIT;

-- VERIFY:
--   SELECT name, is_active FROM clients ORDER BY name;
--   -- Expected: 9 rows, 7 active + 2 archived (Kira Wilde, Rhea Vale).
--
--   SELECT count(*) FROM client_activity WHERE event_type = 'created';
--   -- Expected: 9.
--
-- ROLLBACK:
--   DELETE FROM client_activity WHERE payload->>'seeded' = 'true';
--   DELETE FROM clients WHERE name IN (
--     'Sofia Reign','Mia Voss','Luna Park','Ava Knox','Ines Belmont',
--     'Kira Wilde','Dahlia Cross','Noor Sayid','Rhea Vale');
--   -- platforms/agencies НЕ удаляем — могли использоваться вне seed.
