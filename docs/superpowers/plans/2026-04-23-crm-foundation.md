# CRM Foundation (Подплан 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подготовить базу данных и auth-систему для полноценной CRM: расширить таблицу `users`, добавить роли (moderator / teamlead / operator), создать гибкие таблицы `user_permissions` и `user_attributes`, мигрировать существующих пользователей, обновить RPC-функции и auth-хук. UI не затрагиваем — существующий дашборд продолжает работать.

**Architecture:** PostgreSQL (Supabase) миграциями в `db/migrations/` (versioned SQL files). Auth остаётся кастомной (localStorage + RPC с `SECURITY DEFINER`). На фронте — Vitest для тестов, новый утилитарный слой `src/lib/permissions.js`, расширение `useAuth` для работы с массивом прав. Сохраняем обратную совместимость — колонка `permissions` (jsonb) в `users` остаётся до полной миграции фронта.

**Tech Stack:** PostgreSQL 15+, Supabase RPC, React 19, Vite, Vitest, @testing-library/react

**Prerequisites:**
- Доступ к Supabase SQL Editor (project `akpddaqpggktefkdecrl`)
- Сделать бэкап БД перед началом (Supabase Dashboard → Database → Backups → Create backup)
- `.env.local` содержит `VITE_SUPABASE_ANON_KEY` и `SUPABASE_SERVICE_KEY`

**⚠️ ВАЖНО: имя и схема таблицы пользователей**

Основная таблица пользователей в этой БД называется `dashboard_users` (в схеме `public`), **не** `users`. Таблица `auth.users` — это встроенная таблица Supabase Auth, которой приложение не пользуется.

**Во всех SQL-миграциях и RPC-функциях используем `dashboard_users`.** Где в этом плане написано `users` как имя таблицы — читать как `dashboard_users`. Имена производных сущностей (`user_permissions`, `user_attributes`, permission `create_users` и т.д.) остаются прежними.

**Фактическая схема `dashboard_users` (проверено 2026-04-23):**

| Колонка | Тип | Nullable | Default |
|---|---|---|---|
| `id` | **integer** (int4) | NO | `nextval('dashboard_users_id_seq')` |
| `email` | text | NO | — |
| `password_hash` | text | NO | — (`crypt()` из pgcrypto) |
| `role` | **text** | NO | `'user'` — без enum, без CHECK |
| `permissions` | jsonb | NO | `'{}'` |
| `is_active` | boolean | NO | `true` |
| `created_at` | timestamptz | NO | `now()` |
| `timezone` | text | YES | `'Europe/Kiev'` |

**Последствия для плана:**
- `id` это **integer**, не uuid. Все FK к `dashboard_users(id)` должны быть `integer`, не `uuid`.
- `role` это **text**, не enum. В миграции 02 берём ветку `CHECK constraint`, ветку enum не трогаем.
- `password_hash` использует `crypt()`, значит `pgcrypto` доступен — новая `auth_login` в миграции 08 использует тот же паттерн.

---

## Files Overview

### Создаём
- `db/migrations/20260423_01_extend_users_table.sql`
- `db/migrations/20260423_02_expand_role_enum.sql`
- `db/migrations/20260423_03_user_permissions_table.sql`
- `db/migrations/20260423_04_user_attributes_table.sql`
- `db/migrations/20260423_05_backfill_users_data.sql`
- `db/migrations/20260423_06_rpc_permissions.sql`
- `db/migrations/20260423_07_rpc_attributes.sql`
- `db/migrations/20260423_08_rpc_auth_login_update.sql`
- `db/README.md`
- `vitest.config.js`
- `src/test/setup.js`
- `src/lib/permissions.js`
- `src/lib/permissions.test.js`
- `src/lib/refCode.js`
- `src/lib/refCode.test.js`
- `src/components/PermissionGate.jsx`
- `src/components/PermissionGate.test.jsx`
- `src/useAuth.test.jsx`

### Меняем
- `package.json` — добавляем Vitest и scripts
- `src/useAuth.jsx` — расширяем для новой схемы сессии

---

## Task 1: Настройка инфраструктуры — migrations folder, Vitest

**Files:**
- Create: `db/README.md`
- Create: `vitest.config.js`
- Create: `src/test/setup.js`
- Create: `src/test/smoke.test.js`
- Modify: `package.json`

- [ ] **Step 1: Создать папку миграций и README**

Создать файл `db/README.md`:

```markdown
# Database migrations

Versioned SQL files. Apply в Supabase SQL Editor **in order**.

## Naming
`YYYYMMDD_NN_description.sql`

## How to apply
1. Открыть Supabase Dashboard → SQL Editor → New query
2. Скопировать содержимое файла миграции
3. Нажать Run
4. Проверить результат (каждая миграция содержит блок `-- VERIFY`)
5. Коммитить файл в репозиторий

## Rollback
Каждая миграция должна иметь комментарий `-- ROLLBACK` с обратным SQL (если применимо).
```

- [ ] **Step 2: Установить Vitest и React Testing Library**

Run:
```bash
cd /Users/artemsaskin/Work/operator-dashboard
npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom
```

Expected: пакеты устанавливаются без ошибок.

- [ ] **Step 3: Создать `vitest.config.js`**

```javascript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 4: Создать `src/test/setup.js`**

```javascript
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 5: Добавить scripts в `package.json`**

В секцию `"scripts"` добавить:
```json
"test": "vitest",
"test:run": "vitest run",
"test:ui": "vitest --ui"
```

- [ ] **Step 6: Написать smoke-тест**

Файл `src/test/smoke.test.js`:

```javascript
import { describe, it, expect } from 'vitest'

describe('test infrastructure', () => {
  it('vitest runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 7: Запустить тесты и убедиться что проходят**

Run: `npm run test:run`
Expected: `1 passed`

- [ ] **Step 8: Коммит**

```bash
git add db/README.md vitest.config.js src/test/ package.json package-lock.json
git commit -m "chore: add vitest + migrations folder scaffold"
```

---

## Task 2: Миграция 01 — расширение таблицы `users`

**Files:**
- Create: `db/migrations/20260423_01_extend_users_table.sql`

- [ ] **Step 1: Написать SQL миграции**

Файл `db/migrations/20260423_01_extend_users_table.sql`:

```sql
-- Migration 01: Extend users table with CRM fields
-- Adds: ref_code, first_name, last_name, alias, tableau_id, created_by
-- Backwards compatible: all new columns are nullable

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ref_code     text UNIQUE,
  ADD COLUMN IF NOT EXISTS first_name   text,
  ADD COLUMN IF NOT EXISTS last_name    text,
  ADD COLUMN IF NOT EXISTS alias        text,
  ADD COLUMN IF NOT EXISTS tableau_id   text,
  ADD COLUMN IF NOT EXISTS created_by   uuid REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_users_ref_code    ON users(ref_code);
CREATE INDEX IF NOT EXISTS idx_users_tableau_id  ON users(tableau_id);

COMMIT;

-- VERIFY:
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'users'
--   ORDER BY ordinal_position;
--
-- ROLLBACK:
--   ALTER TABLE users
--     DROP COLUMN ref_code, DROP COLUMN first_name, DROP COLUMN last_name,
--     DROP COLUMN alias, DROP COLUMN tableau_id, DROP COLUMN created_by;
```

- [ ] **Step 2: Применить миграцию в Supabase**

1. Открыть https://supabase.com/dashboard/project/akpddaqpggktefkdecrl/sql
2. New query → вставить содержимое файла
3. Run
4. Проверить что вернулось `Success. No rows returned`

- [ ] **Step 3: Проверить что колонки добавились**

В SQL Editor выполнить:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN ('ref_code','first_name','last_name','alias','tableau_id','created_by');
```

Expected: 6 строк.

- [ ] **Step 4: Проверить что существующий функционал работает**

Открыть дашборд (или `npm run dev` локально), залогиниться существующим пользователем. Expected: логин проходит, данные выручки видны — ничего не сломалось.

- [ ] **Step 5: Коммит**

```bash
git add db/migrations/20260423_01_extend_users_table.sql
git commit -m "db: migration 01 — extend users table with CRM fields"
```

---

## Task 3: Миграция 02 — расширение enum ролей

**Files:**
- Create: `db/migrations/20260423_02_expand_role_enum.sql`

**Note:** В Supabase колонка `users.role` может быть `text` или `user_role` enum. Сначала проверим.

- [ ] **Step 1: Проверить тип колонки `role`**

В SQL Editor:
```sql
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'role';
```

- [ ] **Step 2: Написать миграцию в зависимости от типа**

Файл `db/migrations/20260423_02_expand_role_enum.sql`:

```sql
-- Migration 02: Expand role values to include moderator, teamlead, operator
--
-- Existing roles: superadmin, admin, user
-- After:          superadmin, admin, moderator, teamlead, operator
--
-- Note: we keep 'user' temporarily for backwards compatibility; it will be
-- migrated to 'operator' in migration 05 (backfill).

BEGIN;

-- Вариант A: если role это enum (user_role)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'user_role'
  ) THEN
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'moderator';
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'teamlead';
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'operator';
  END IF;
END $$;

-- Вариант B: если role это text — добавляем CHECK constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='role' AND data_type='text'
  ) THEN
    -- Удаляем старый CHECK если есть
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    -- Добавляем новый
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('superadmin','admin','moderator','teamlead','operator','user'));
  END IF;
END $$;

COMMIT;

-- VERIFY:
--   SELECT DISTINCT role FROM users;
--   -- Должно: текущие роли остались валидны.
--
-- ROLLBACK:
--   enum-значения нельзя удалить без пересоздания типа.
--   Для CHECK: ALTER TABLE users DROP CONSTRAINT users_role_check;
```

- [ ] **Step 3: Применить миграцию**

Вставить в SQL Editor, Run.

- [ ] **Step 4: Проверить что роли расширились**

```sql
-- Для enum:
SELECT unnest(enum_range(NULL::user_role));
-- Для text:
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
  WHERE conname = 'users_role_check';
```

Expected: видим `moderator`, `teamlead`, `operator`.

- [ ] **Step 5: Коммит**

```bash
git add db/migrations/20260423_02_expand_role_enum.sql
git commit -m "db: migration 02 — expand role values with moderator/teamlead/operator"
```

---

## Task 4: Миграция 03 — таблица `user_permissions`

**Files:**
- Create: `db/migrations/20260423_03_user_permissions_table.sql`

- [ ] **Step 1: Написать SQL**

Файл `db/migrations/20260423_03_user_permissions_table.sql`:

```sql
-- Migration 03: Create user_permissions table
-- Granular permission flags, independent from role.

BEGIN;

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission  text NOT NULL,
  granted_by  uuid REFERENCES users(id),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id
  ON user_permissions(user_id);

-- RLS: чтение через SECURITY DEFINER RPC, прямой доступ запрещён
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

-- Разрешённый список прав (справочно, для валидации в RPC)
COMMENT ON TABLE user_permissions IS
  'Valid permissions (CRM spec):
     create_users, manage_roles, create_tasks, view_all_tasks,
     view_own_tasks, view_all_revenue, view_own_revenue, view_team_revenue,
     send_reminders, manage_teams, use_chat
   Legacy permissions (preserved during migration from old permissions jsonb):
     view_chart, view_top';

COMMIT;

-- VERIFY:
--   SELECT table_name FROM information_schema.tables WHERE table_name='user_permissions';
--   SELECT column_name, data_type FROM information_schema.columns
--     WHERE table_name='user_permissions' ORDER BY ordinal_position;
--
-- ROLLBACK:
--   DROP TABLE user_permissions;
```

- [ ] **Step 2: Применить в Supabase**

Вставить в SQL Editor, Run.

- [ ] **Step 3: Проверить таблицу**

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_permissions'
ORDER BY ordinal_position;
```

Expected: 4 колонки (`user_id`, `permission`, `granted_by`, `granted_at`).

- [ ] **Step 4: Коммит**

```bash
git add db/migrations/20260423_03_user_permissions_table.sql
git commit -m "db: migration 03 — create user_permissions table"
```

---

## Task 5: Миграция 04 — таблица `user_attributes`

**Files:**
- Create: `db/migrations/20260423_04_user_attributes_table.sql`

- [ ] **Step 1: Написать SQL**

Файл `db/migrations/20260423_04_user_attributes_table.sql`:

```sql
-- Migration 04: Create user_attributes table
-- Flexible key-value store for per-user settings (shift, panel_id, etc.)

BEGIN;

CREATE TABLE IF NOT EXISTS user_attributes (
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
--
-- ROLLBACK:
--   DROP TABLE user_attributes;
```

- [ ] **Step 2: Применить в Supabase**

Вставить в SQL Editor, Run.

- [ ] **Step 3: Проверить**

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'user_attributes'
ORDER BY ordinal_position;
```

Expected: 3 колонки (`user_id`, `key`, `value`).

- [ ] **Step 4: Коммит**

```bash
git add db/migrations/20260423_04_user_attributes_table.sql
git commit -m "db: migration 04 — create user_attributes table"
```

---

## Task 6: Утилита генерации реф-кода (фронт, TDD)

**Files:**
- Create: `src/lib/refCode.js`
- Create: `src/lib/refCode.test.js`

Нужна утилита чтобы генерировать реф-коды `MOD-ИванП-001`. Используем её и в SQL-бэкфилле (переписав логику), и в будущих формах создания сотрудника.

- [ ] **Step 1: Написать failing-тест**

Файл `src/lib/refCode.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import { buildRefCode, roleToPrefix } from './refCode.js'

describe('roleToPrefix', () => {
  it('maps each role to its prefix', () => {
    expect(roleToPrefix('superadmin')).toBe('SA')
    expect(roleToPrefix('admin')).toBe('ADM')
    expect(roleToPrefix('moderator')).toBe('MOD')
    expect(roleToPrefix('teamlead')).toBe('TL')
    expect(roleToPrefix('operator')).toBe('OP')
  })

  it('throws on unknown role', () => {
    expect(() => roleToPrefix('foo')).toThrow()
  })
})

describe('buildRefCode', () => {
  it('builds code for moderator', () => {
    expect(buildRefCode({
      role: 'moderator',
      firstName: 'Иван',
      lastName: 'Петров',
      number: 1,
    })).toBe('MOD-ИванП-001')
  })

  it('builds code for team lead', () => {
    expect(buildRefCode({
      role: 'teamlead',
      firstName: 'Анна',
      lastName: 'Михайлова',
      number: 3,
    })).toBe('TL-АннаМ-003')
  })

  it('builds code for operator with number >= 100', () => {
    expect(buildRefCode({
      role: 'operator',
      firstName: 'Вадим',
      lastName: 'Соловьёв',
      number: 123,
    })).toBe('OP-ВадимС-123')
  })

  it('capitalizes first name and takes first letter of last name', () => {
    expect(buildRefCode({
      role: 'admin',
      firstName: 'пётр',
      lastName: 'сидоров',
      number: 7,
    })).toBe('ADM-ПётрС-007')
  })

  it('throws when number > 999', () => {
    expect(() =>
      buildRefCode({ role: 'admin', firstName: 'А', lastName: 'Б', number: 1000 })
    ).toThrow()
  })
})
```

- [ ] **Step 2: Запустить тест — должен упасть**

Run: `npm run test:run -- src/lib/refCode`
Expected: FAIL (module not found или функции не определены).

- [ ] **Step 3: Написать реализацию**

Файл `src/lib/refCode.js`:

```javascript
const ROLE_PREFIX = {
  superadmin: 'SA',
  admin: 'ADM',
  moderator: 'MOD',
  teamlead: 'TL',
  operator: 'OP',
}

export function roleToPrefix(role) {
  const prefix = ROLE_PREFIX[role]
  if (!prefix) throw new Error(`Unknown role: ${role}`)
  return prefix
}

function capitalize(s) {
  if (!s) return ''
  return s.charAt(0).toLocaleUpperCase('ru-RU') + s.slice(1).toLocaleLowerCase('ru-RU')
}

export function buildRefCode({ role, firstName, lastName, number }) {
  if (number < 1 || number > 999) {
    throw new Error(`Number must be 1..999, got ${number}`)
  }
  const prefix = roleToPrefix(role)
  const first = capitalize(firstName)
  const lastInitial = lastName.charAt(0).toLocaleUpperCase('ru-RU')
  const num = String(number).padStart(3, '0')
  return `${prefix}-${first}${lastInitial}-${num}`
}
```

- [ ] **Step 4: Запустить тест — должен пройти**

Run: `npm run test:run -- src/lib/refCode`
Expected: `5 passed`.

- [ ] **Step 5: Коммит**

```bash
git add src/lib/refCode.js src/lib/refCode.test.js
git commit -m "feat(lib): add refCode utility with tests"
```

---

## Task 7: Миграция 05 — backfill данных существующих пользователей

**Files:**
- Create: `db/migrations/20260423_05_backfill_users_data.sql`

Для существующих пользователей:
1. Роль `user` → `operator` (если это обычный юзер) — оставляем на усмотрение: меняем тех у кого `role='user'` на `operator`.
2. Имя/фамилия: парсим из email (часть до `@`) — как заглушка; после будет форма редактирования.
3. Реф-код: генерируется по роли, числом становится позиция по created_at.
4. Права из `permissions` jsonb → строки в `user_permissions`.

- [ ] **Step 1: Написать SQL backfill**

Файл `db/migrations/20260423_05_backfill_users_data.sql`:

```sql
-- Migration 05: Backfill existing users with new CRM fields
-- Run ONCE. Idempotent where possible.

BEGIN;

-- 5.1) role: 'user' → 'operator'
UPDATE users SET role = 'operator'
  WHERE role = 'user';

-- 5.2) first_name / last_name из email (часть до @)
--     Прописываем только если first_name ещё не задан.
UPDATE users
SET first_name = COALESCE(first_name, split_part(split_part(email, '@', 1), '.', 1)),
    last_name  = COALESCE(last_name,  split_part(split_part(email, '@', 1), '.', 2))
WHERE first_name IS NULL OR last_name IS NULL;

-- Если часть фамилии пустая — подставляем 'X' чтобы реф-код построился
UPDATE users SET last_name = 'X'
  WHERE last_name IS NULL OR last_name = '';

UPDATE users SET first_name = 'User'
  WHERE first_name IS NULL OR first_name = '';

-- 5.3) ref_code: генерируем через функцию; номер = row_number() по role/created_at
CREATE OR REPLACE FUNCTION _backfill_ref_code(
  p_role text, p_first_name text, p_last_name text, p_num int
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_prefix  text;
  v_first   text;
  v_last    text;
BEGIN
  v_prefix := CASE p_role
    WHEN 'superadmin' THEN 'SA'
    WHEN 'admin'      THEN 'ADM'
    WHEN 'moderator'  THEN 'MOD'
    WHEN 'teamlead'   THEN 'TL'
    WHEN 'operator'   THEN 'OP'
    ELSE 'USR'
  END;
  v_first := upper(left(p_first_name, 1)) || lower(substring(p_first_name, 2));
  v_last  := upper(left(p_last_name, 1));
  RETURN v_prefix || '-' || v_first || v_last || '-' || lpad(p_num::text, 3, '0');
END $$;

WITH numbered AS (
  SELECT id, role, first_name, last_name,
         row_number() OVER (PARTITION BY role ORDER BY created_at, id) AS rn
  FROM users
  WHERE ref_code IS NULL
)
UPDATE users u
SET ref_code = _backfill_ref_code(n.role, n.first_name, n.last_name, n.rn::int)
FROM numbered n
WHERE u.id = n.id;

DROP FUNCTION _backfill_ref_code(text, text, text, int);

-- 5.4) permissions jsonb → user_permissions
--     Старые ключи: can_view_revenue, can_view_chart, can_view_top
--     Новые ключи: view_all_revenue (заменяет can_view_revenue), etc.
INSERT INTO user_permissions (user_id, permission, granted_by, granted_at)
SELECT u.id, 'view_all_revenue', NULL, now()
  FROM users u
  WHERE (u.permissions ->> 'can_view_revenue')::boolean IS TRUE
  ON CONFLICT DO NOTHING;

INSERT INTO user_permissions (user_id, permission, granted_by, granted_at)
SELECT u.id, 'view_chart', NULL, now()
  FROM users u
  WHERE (u.permissions ->> 'can_view_chart')::boolean IS TRUE
  ON CONFLICT DO NOTHING;

INSERT INTO user_permissions (user_id, permission, granted_by, granted_at)
SELECT u.id, 'view_top', NULL, now()
  FROM users u
  WHERE (u.permissions ->> 'can_view_top')::boolean IS TRUE
  ON CONFLICT DO NOTHING;

-- 5.5) default permissions по ролям
-- superadmin: все; admin: базовый набор; operator: view_own_revenue
INSERT INTO user_permissions (user_id, permission, granted_by, granted_at)
SELECT u.id, p.perm, NULL, now()
FROM users u
CROSS JOIN LATERAL (
  SELECT unnest(
    CASE u.role
      WHEN 'superadmin' THEN ARRAY[
        'create_users','manage_roles','create_tasks','view_all_tasks',
        'view_all_revenue','send_reminders','manage_teams','use_chat'
      ]
      WHEN 'admin' THEN ARRAY[
        'create_tasks','view_all_tasks','view_all_revenue',
        'send_reminders','manage_teams'
      ]
      WHEN 'operator' THEN ARRAY['view_own_revenue','view_own_tasks']
      ELSE ARRAY[]::text[]
    END
  ) AS perm
) p
ON CONFLICT DO NOTHING;

COMMIT;

-- VERIFY:
--   SELECT id, email, role, ref_code FROM users ORDER BY role, ref_code;
--   SELECT user_id, permission FROM user_permissions ORDER BY user_id, permission;
--   -- Ожидаем: у каждого пользователя есть ref_code; у superadmin много прав, у operator 2.
```

- [ ] **Step 2: Применить миграцию в Supabase**

Вставить в SQL Editor, Run.

- [ ] **Step 3: Проверить результаты**

```sql
-- Все юзеры имеют ref_code?
SELECT count(*) FROM users WHERE ref_code IS NULL;
-- Expected: 0

-- Распределение прав по ролям
SELECT u.role, up.permission, count(*)
FROM users u
JOIN user_permissions up ON up.user_id = u.id
GROUP BY u.role, up.permission
ORDER BY u.role, up.permission;
```

- [ ] **Step 4: Убедиться что существующий логин работает**

Открыть дашборд, залогиниться старым пользователем. Expected: логин проходит, видны прежние данные (старая колонка `permissions` ещё не удалена).

- [ ] **Step 5: Коммит**

```bash
git add db/migrations/20260423_05_backfill_users_data.sql
git commit -m "db: migration 05 — backfill users (ref_codes, roles, permissions)"
```

---

## Task 8: Миграция 06 — RPC-функции для прав

**Files:**
- Create: `db/migrations/20260423_06_rpc_permissions.sql`

- [ ] **Step 1: Написать SQL функций**

Файл `db/migrations/20260423_06_rpc_permissions.sql`:

```sql
-- Migration 06: RPC functions for user_permissions
-- has_permission, get_user_permissions, grant_permission, revoke_permission

BEGIN;

-- has_permission: true/false
CREATE OR REPLACE FUNCTION has_permission(
  p_user_id uuid, p_permission text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = p_user_id AND permission = p_permission
  );
$$;

GRANT EXECUTE ON FUNCTION has_permission(uuid, text) TO anon, authenticated;

-- get_user_permissions: массив строк
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id uuid)
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(permission ORDER BY permission), ARRAY[]::text[])
  FROM user_permissions
  WHERE user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION get_user_permissions(uuid) TO anon, authenticated;

-- grant_permission: только если caller имеет manage_roles
CREATE OR REPLACE FUNCTION grant_permission(
  p_caller_id uuid, p_target_user uuid, p_permission text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_permission(p_caller_id, 'manage_roles') THEN
    RAISE EXCEPTION 'caller % lacks manage_roles', p_caller_id;
  END IF;
  INSERT INTO user_permissions (user_id, permission, granted_by, granted_at)
    VALUES (p_target_user, p_permission, p_caller_id, now())
  ON CONFLICT (user_id, permission) DO UPDATE
    SET granted_by = EXCLUDED.granted_by,
        granted_at = EXCLUDED.granted_at;
END $$;

GRANT EXECUTE ON FUNCTION grant_permission(uuid, uuid, text) TO anon, authenticated;

-- revoke_permission
CREATE OR REPLACE FUNCTION revoke_permission(
  p_caller_id uuid, p_target_user uuid, p_permission text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_permission(p_caller_id, 'manage_roles') THEN
    RAISE EXCEPTION 'caller % lacks manage_roles', p_caller_id;
  END IF;
  DELETE FROM user_permissions
    WHERE user_id = p_target_user AND permission = p_permission;
END $$;

GRANT EXECUTE ON FUNCTION revoke_permission(uuid, uuid, text) TO anon, authenticated;

COMMIT;

-- VERIFY (замените <sa_id> на id супер-админа):
--   SELECT has_permission('<sa_id>', 'create_users');    -- true
--   SELECT has_permission('<sa_id>', 'nonexistent');     -- false
--   SELECT get_user_permissions('<sa_id>');              -- массив строк
```

- [ ] **Step 2: Применить миграцию**

Вставить в SQL Editor, Run.

- [ ] **Step 3: Проверить функции**

```sql
-- Найти id супер-админа
SELECT id, email, role FROM users WHERE role='superadmin' LIMIT 1;

-- Проверить has_permission
SELECT has_permission('<id_from_above>', 'create_users');
-- Expected: true

SELECT has_permission('<id_from_above>', 'nonexistent_perm');
-- Expected: false

-- Проверить get_user_permissions
SELECT get_user_permissions('<id_from_above>');
-- Expected: массив строк включая 'create_users', 'manage_roles'
```

- [ ] **Step 4: Коммит**

```bash
git add db/migrations/20260423_06_rpc_permissions.sql
git commit -m "db: migration 06 — RPC functions for user_permissions"
```

---

## Task 9: Миграция 07 — RPC-функции для атрибутов

**Files:**
- Create: `db/migrations/20260423_07_rpc_attributes.sql`

- [ ] **Step 1: Написать SQL**

Файл `db/migrations/20260423_07_rpc_attributes.sql`:

```sql
-- Migration 07: RPC functions for user_attributes

BEGIN;

-- get_user_attributes → jsonb object { key: value, ... }
CREATE OR REPLACE FUNCTION get_user_attributes(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
  FROM user_attributes
  WHERE user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION get_user_attributes(uuid) TO anon, authenticated;

-- set_user_attribute: upsert; caller должен иметь create_users
CREATE OR REPLACE FUNCTION set_user_attribute(
  p_caller_id uuid, p_user_id uuid, p_key text, p_value text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    has_permission(p_caller_id, 'create_users')
    OR p_caller_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'caller % cannot set attributes on %', p_caller_id, p_user_id;
  END IF;
  INSERT INTO user_attributes (user_id, key, value)
    VALUES (p_user_id, p_key, p_value)
  ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value;
END $$;

GRANT EXECUTE ON FUNCTION set_user_attribute(uuid, uuid, text, text) TO anon, authenticated;

-- delete_user_attribute
CREATE OR REPLACE FUNCTION delete_user_attribute(
  p_caller_id uuid, p_user_id uuid, p_key text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_permission(p_caller_id, 'create_users') THEN
    RAISE EXCEPTION 'caller % lacks create_users', p_caller_id;
  END IF;
  DELETE FROM user_attributes WHERE user_id = p_user_id AND key = p_key;
END $$;

GRANT EXECUTE ON FUNCTION delete_user_attribute(uuid, uuid, text) TO anon, authenticated;

COMMIT;

-- VERIFY:
--   SELECT set_user_attribute('<sa_id>','<sa_id>','shift','ДЕНЬ');
--   SELECT get_user_attributes('<sa_id>');
--   -- Expected: {"shift":"ДЕНЬ"}
```

- [ ] **Step 2: Применить**

SQL Editor, Run.

- [ ] **Step 3: Тест**

```sql
-- caller = user = супер-админ (самому себе можно)
SELECT set_user_attribute('<sa_id>','<sa_id>','test_key','test_val');
SELECT get_user_attributes('<sa_id>');
-- Expected: содержит "test_key":"test_val"

-- Чистим тестовое значение
SELECT delete_user_attribute('<sa_id>','<sa_id>','test_key');
```

- [ ] **Step 4: Коммит**

```bash
git add db/migrations/20260423_07_rpc_attributes.sql
git commit -m "db: migration 07 — RPC functions for user_attributes"
```

---

## Task 10: Миграция 08 — обновление `auth_login`

**Files:**
- Create: `db/migrations/20260423_08_rpc_auth_login_update.sql`

Расширяем existing `auth_login` чтобы возвращать:
- `user_permissions` как массив строк (было jsonb объект)
- `user_ref_code`, `user_first_name`, `user_last_name`, `user_alias`
- `user_attributes` как jsonb

- [ ] **Step 1: Посмотреть текущее определение функции**

В Supabase SQL Editor:
```sql
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'auth_login';
```

Скопировать текущее определение в комментарий нашей миграции для rollback.

- [ ] **Step 2: Написать обновление**

Файл `db/migrations/20260423_08_rpc_auth_login_update.sql`:

```sql
-- Migration 08: Update auth_login to return extended session data
--
-- Before: returns user_id, user_email, user_role, user_permissions (jsonb), user_timezone
-- After:  adds user_ref_code, user_first_name, user_last_name, user_alias,
--         user_attributes (jsonb), user_is_active.
--         user_permissions becomes text[] (array of permission names).
--
-- ROLLBACK: см. `db/migrations/.rollback/20260423_08_auth_login.sql`
--          (сохранить исходное определение туда при применении).

BEGIN;

CREATE OR REPLACE FUNCTION auth_login(
  p_email text, p_password text
) RETURNS TABLE (
  user_id          uuid,
  user_email       text,
  user_role        text,
  user_ref_code    text,
  user_first_name  text,
  user_last_name   text,
  user_alias       text,
  user_permissions text[],
  user_attributes  jsonb,
  user_timezone    text,
  user_is_active   boolean
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT u.id INTO v_user_id
  FROM users u
  WHERE u.email = lower(p_email)
    AND u.password_hash = crypt(p_password, u.password_hash)
    AND u.is_active = true;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.role::text,
    u.ref_code,
    u.first_name,
    u.last_name,
    u.alias,
    get_user_permissions(u.id)   AS user_permissions,
    get_user_attributes(u.id)    AS user_attributes,
    COALESCE(u.timezone, 'Europe/Kiev'),
    u.is_active
  FROM users u
  WHERE u.id = v_user_id;
END $$;

GRANT EXECUTE ON FUNCTION auth_login(text, text) TO anon, authenticated;

COMMIT;
```

**Важно:** если в вашей БД `password_hash` хранится иначе (например `pgcrypto` не установлен или использует другую функцию), адаптируйте WHERE-условие. Если текущая `auth_login` использует `compare_password` или другой паттерн — скопируйте логику проверки пароля из старого определения (Step 1).

- [ ] **Step 3: Применить**

SQL Editor, Run. Если ошибка про `crypt`/`password_hash` — подправить WHERE-условие под вашу текущую реализацию (посмотреть старое определение из Step 1) и запустить снова.

- [ ] **Step 4: Проверить логин**

```sql
SELECT * FROM auth_login('<existing_email>', '<existing_password>');
-- Expected: одна строка со всеми новыми полями
```

- [ ] **Step 5: Проверить фронт**

Запустить `npm run dev`, залогиниться существующим пользователем. Expected: логин работает. (В useAuth пока продолжим читать только старые поля; расширим в следующей задаче.)

- [ ] **Step 6: Коммит**

```bash
git add db/migrations/20260423_08_rpc_auth_login_update.sql
git commit -m "db: migration 08 — auth_login returns extended session data"
```

---

## Task 11: Фронт — утилита `permissions.js` (TDD)

**Files:**
- Create: `src/lib/permissions.js`
- Create: `src/lib/permissions.test.js`

- [ ] **Step 1: Написать failing-тесты**

Файл `src/lib/permissions.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  isSuperadmin,
} from './permissions.js'

const sa = { role: 'superadmin', permissions: [] }
const admin = {
  role: 'admin',
  permissions: ['create_tasks', 'view_all_tasks'],
}
const op = { role: 'operator', permissions: ['view_own_revenue'] }

describe('hasPermission', () => {
  it('returns true when permission is in the array', () => {
    expect(hasPermission(admin, 'create_tasks')).toBe(true)
  })

  it('returns false when permission is missing', () => {
    expect(hasPermission(admin, 'manage_roles')).toBe(false)
  })

  it('returns true for superadmin regardless of array', () => {
    expect(hasPermission(sa, 'literally_anything')).toBe(true)
  })

  it('handles null user', () => {
    expect(hasPermission(null, 'create_tasks')).toBe(false)
  })

  it('handles user without permissions array', () => {
    expect(hasPermission({ role: 'admin' }, 'create_tasks')).toBe(false)
  })
})

describe('hasAnyPermission', () => {
  it('true if user has at least one', () => {
    expect(hasAnyPermission(admin, ['manage_roles', 'create_tasks'])).toBe(true)
  })

  it('false if user has none', () => {
    expect(hasAnyPermission(op, ['create_tasks', 'manage_roles'])).toBe(false)
  })

  it('superadmin always true', () => {
    expect(hasAnyPermission(sa, ['foo', 'bar'])).toBe(true)
  })
})

describe('hasAllPermissions', () => {
  it('true only if all present', () => {
    expect(hasAllPermissions(admin, ['create_tasks', 'view_all_tasks'])).toBe(true)
    expect(hasAllPermissions(admin, ['create_tasks', 'manage_roles'])).toBe(false)
  })

  it('superadmin always true', () => {
    expect(hasAllPermissions(sa, ['anything', 'else'])).toBe(true)
  })
})

describe('isSuperadmin', () => {
  it('checks role', () => {
    expect(isSuperadmin(sa)).toBe(true)
    expect(isSuperadmin(admin)).toBe(false)
    expect(isSuperadmin(null)).toBe(false)
  })
})
```

- [ ] **Step 2: Запустить — должны упасть**

Run: `npm run test:run -- src/lib/permissions`
Expected: FAIL.

- [ ] **Step 3: Реализация**

Файл `src/lib/permissions.js`:

```javascript
export function isSuperadmin(user) {
  return user?.role === 'superadmin'
}

export function hasPermission(user, permission) {
  if (!user) return false
  if (isSuperadmin(user)) return true
  const perms = user.permissions
  if (!Array.isArray(perms)) return false
  return perms.includes(permission)
}

export function hasAnyPermission(user, permissions) {
  if (isSuperadmin(user)) return true
  return permissions.some((p) => hasPermission(user, p))
}

export function hasAllPermissions(user, permissions) {
  if (isSuperadmin(user)) return true
  return permissions.every((p) => hasPermission(user, p))
}
```

- [ ] **Step 4: Тесты проходят**

Run: `npm run test:run -- src/lib/permissions`
Expected: все `passed`.

- [ ] **Step 5: Коммит**

```bash
git add src/lib/permissions.js src/lib/permissions.test.js
git commit -m "feat(lib): add permission helpers with tests"
```

---

## Task 12: Фронт — обновление `useAuth` (новая форма сессии)

**Files:**
- Modify: `src/useAuth.jsx`
- Create: `src/useAuth.test.jsx`

Сессия обогащается: `permissions` (array), `attributes` (object), `refCode`, `firstName`, `lastName`, `alias`. Старые поля (`id`, `email`, `role`, `timezone`) сохраняются.

Для обратной совместимости: если `auth_login` вернёт jsonb `permissions` вместо array (старый вариант на всякий случай) — нормализуем.

- [ ] **Step 1: Прочитать текущий useAuth.jsx**

Запомнить сигнатуру `login`, `logout`, какие поля session используются в других файлах.

- [ ] **Step 2: Написать failing-тест для нормализации сессии**

Файл `src/useAuth.test.jsx`:

```javascript
import { describe, it, expect } from 'vitest'
import { normalizeSession } from './useAuth.jsx'

describe('normalizeSession', () => {
  it('maps RPC row to session shape (new fields)', () => {
    const row = {
      user_id: 'uuid-1',
      user_email: 'x@y.z',
      user_role: 'admin',
      user_ref_code: 'ADM-ИванП-001',
      user_first_name: 'Иван',
      user_last_name: 'Петров',
      user_alias: null,
      user_permissions: ['create_tasks', 'view_all_tasks'],
      user_attributes: { shift: 'ДЕНЬ' },
      user_timezone: 'Europe/Kiev',
      user_is_active: true,
    }
    expect(normalizeSession(row)).toEqual({
      id: 'uuid-1',
      email: 'x@y.z',
      role: 'admin',
      refCode: 'ADM-ИванП-001',
      firstName: 'Иван',
      lastName: 'Петров',
      alias: null,
      permissions: ['create_tasks', 'view_all_tasks'],
      attributes: { shift: 'ДЕНЬ' },
      timezone: 'Europe/Kiev',
      isActive: true,
    })
  })

  it('normalizes legacy permissions shape (jsonb object with boolean flags)', () => {
    const row = {
      user_id: 'uuid-2',
      user_email: 'x@y.z',
      user_role: 'operator',
      user_ref_code: null,
      user_first_name: null,
      user_last_name: null,
      user_alias: null,
      user_permissions: { can_view_revenue: true, can_view_chart: false },
      user_attributes: null,
      user_timezone: null,
      user_is_active: true,
    }
    const s = normalizeSession(row)
    expect(s.permissions).toEqual(['can_view_revenue'])
    expect(s.attributes).toEqual({})
    expect(s.timezone).toBe('Europe/Kiev')
  })
})
```

- [ ] **Step 3: Запустить — должен упасть**

Run: `npm run test:run -- src/useAuth`
Expected: FAIL (normalizeSession не экспортирован).

- [ ] **Step 4: Обновить `src/useAuth.jsx`**

Полный новый файл:

```jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient.js'

const SESSION_KEY = 'auth_session'
const AuthContext = createContext(null)

export function normalizeSession(row) {
  if (!row) return null

  // permissions: array | legacy jsonb {k: bool}
  let permissions = []
  if (Array.isArray(row.user_permissions)) {
    permissions = row.user_permissions
  } else if (row.user_permissions && typeof row.user_permissions === 'object') {
    permissions = Object.entries(row.user_permissions)
      .filter(([, v]) => Boolean(v))
      .map(([k]) => k)
  }

  return {
    id: row.user_id,
    email: row.user_email,
    role: row.user_role,
    refCode: row.user_ref_code ?? null,
    firstName: row.user_first_name ?? null,
    lastName: row.user_last_name ?? null,
    alias: row.user_alias ?? null,
    permissions,
    attributes: (row.user_attributes && typeof row.user_attributes === 'object')
      ? row.user_attributes
      : {},
    timezone: row.user_timezone || 'Europe/Kiev',
    isActive: row.user_is_active !== false,
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const login = useCallback(async (email, password) => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('auth_login', {
        p_email: email,
        p_password: password,
      })
      if (rpcError) throw rpcError
      const row = Array.isArray(data) ? data[0] : data
      if (!row) throw new Error('Неверный email или пароль')
      const s = normalizeSession(row)
      localStorage.setItem(SESSION_KEY, JSON.stringify(s))
      setSession(s)
      return s
    } catch (e) {
      setError(e.message || 'Ошибка входа')
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    setSession(null)
  }, [])

  const updateTimezone = useCallback(async (tz) => {
    if (!session?.id) return
    const { error: rpcError } = await supabase.rpc('update_user_timezone', {
      p_user_id: session.id,
      p_timezone: tz,
    })
    if (rpcError) throw rpcError
    const next = { ...session, timezone: tz }
    localStorage.setItem(SESSION_KEY, JSON.stringify(next))
    setSession(next)
  }, [session])

  useEffect(() => {
    // noop — сохраняем синхронность session ↔ localStorage только на login/logout
  }, [])

  return (
    <AuthContext.Provider
      value={{ session, login, logout, updateTimezone, loading, error }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside <AuthProvider>')
  return ctx
}
```

- [ ] **Step 5: Запустить тесты — должны пройти**

Run: `npm run test:run -- src/useAuth`
Expected: `2 passed`.

- [ ] **Step 6: Запустить dev и проверить логин**

Run: `npm run dev`. Зайти под существующим пользователем. Expected: логин проходит, данные загружаются.

- [ ] **Step 7: Обновить потребителей session (App.jsx / AdminPanel.jsx)**

Найти все места где читаются старые boolean-флаги и заменить на `hasPermission`:

```bash
grep -n "permissions\.\(can_view_revenue\|can_view_chart\|can_view_top\)" \
  src/App.jsx src/AdminPanel.jsx src/AdminLayout.jsx 2>/dev/null
```

Для каждого найденного места сделать замены (точное mapping):

| Старый код | Новый код |
|---|---|
| `session.permissions.can_view_revenue` | `hasPermission(session, 'view_all_revenue')` |
| `session.permissions.can_view_chart`   | `hasPermission(session, 'view_chart')` |
| `session.permissions.can_view_top`     | `hasPermission(session, 'view_top')` |
| `session.permissions?.can_view_revenue` | `hasPermission(session, 'view_all_revenue')` |

В каждом изменённом файле добавить импорт:
```javascript
import { hasPermission } from './lib/permissions.js'
```

**Важно:** `hasPermission` вернёт `true` для superadmin независимо от флагов — это совпадает со старым поведением (суперадмин всегда видел всё).

Также если есть чтение jsonb в AdminPanel (при редактировании прав через чек-боксы) — временно оставляем как есть: AdminPanel будет полностью переписан в Подплане 2.

- [ ] **Step 8: Финальный smoke-тест**

`npm run test:run` — ВСЕ тесты зелёные.
Запустить `npm run dev` — войти, увидеть дашборд.

- [ ] **Step 9: Коммит**

```bash
git add src/useAuth.jsx src/useAuth.test.jsx
git commit -m "feat(auth): extended session with permissions array and attributes"
```

---

## Task 13: Фронт — компонент `<PermissionGate>`

**Files:**
- Create: `src/components/PermissionGate.jsx`
- Create: `src/components/PermissionGate.test.jsx`

Компонент для условного рендера по правам. Будет использоваться везде.

- [ ] **Step 1: Написать failing-тест**

Файл `src/components/PermissionGate.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PermissionGate } from './PermissionGate.jsx'

describe('<PermissionGate>', () => {
  const sa = { role: 'superadmin' }
  const admin = { role: 'admin', permissions: ['create_tasks'] }
  const op = { role: 'operator', permissions: ['view_own_revenue'] }

  it('renders children when user has permission', () => {
    render(
      <PermissionGate user={admin} permission="create_tasks">
        <span>OK</span>
      </PermissionGate>,
    )
    expect(screen.getByText('OK')).toBeInTheDocument()
  })

  it('renders nothing when user lacks permission', () => {
    render(
      <PermissionGate user={op} permission="create_tasks">
        <span>OK</span>
      </PermissionGate>,
    )
    expect(screen.queryByText('OK')).toBeNull()
  })

  it('renders fallback if provided and lacks permission', () => {
    render(
      <PermissionGate user={op} permission="create_tasks" fallback={<span>NO</span>}>
        <span>OK</span>
      </PermissionGate>,
    )
    expect(screen.getByText('NO')).toBeInTheDocument()
  })

  it('superadmin sees everything', () => {
    render(
      <PermissionGate user={sa} permission="anything_at_all">
        <span>OK</span>
      </PermissionGate>,
    )
    expect(screen.getByText('OK')).toBeInTheDocument()
  })

  it('accepts any of permissions array', () => {
    render(
      <PermissionGate user={admin} anyOf={['manage_roles', 'create_tasks']}>
        <span>OK</span>
      </PermissionGate>,
    )
    expect(screen.getByText('OK')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Запустить — fail**

Run: `npm run test:run -- src/components/PermissionGate`
Expected: FAIL (файл не существует).

- [ ] **Step 3: Реализация**

Файл `src/components/PermissionGate.jsx`:

```jsx
import { hasPermission, hasAnyPermission } from '../lib/permissions.js'

export function PermissionGate({
  user,
  permission,
  anyOf,
  fallback = null,
  children,
}) {
  let allowed = false
  if (permission) {
    allowed = hasPermission(user, permission)
  } else if (Array.isArray(anyOf)) {
    allowed = hasAnyPermission(user, anyOf)
  }
  return allowed ? <>{children}</> : fallback
}
```

- [ ] **Step 4: Тесты проходят**

Run: `npm run test:run -- src/components/PermissionGate`
Expected: `5 passed`.

- [ ] **Step 5: Финальная проверка всех тестов**

Run: `npm run test:run`
Expected: все зелёные. Запустить `npm run dev` — убедиться что dev-сервер стартует без ошибок.

- [ ] **Step 6: Коммит**

```bash
git add src/components/PermissionGate.jsx src/components/PermissionGate.test.jsx
git commit -m "feat(ui): add <PermissionGate> component with tests"
```

---

## Task 14: Финал — контрольный прогон и документация

**Files:**
- Modify: `db/README.md`
- Modify: `NOTES.md`

- [ ] **Step 1: Прогнать всё**

```bash
npm run test:run
npm run lint
npm run build
```
Expected: всё зелёное, билд проходит.

- [ ] **Step 2: Запустить dev-сервер, залогиниться, пройти smoke-путь**

- Логин существующим пользователем — работает.
- Видим дашборд выручки — работает.
- Открываем AdminPanel (если пользователь с правами) — работает.
- Создаём нового пользователя — работает (пока через старую RPC `create_user`, её обновим в Подплане 2).
- Деактивируем пользователя — работает.

- [ ] **Step 3: Обновить `NOTES.md`**

Добавить секцию про новую схему (в конец файла):

```markdown
## CRM Foundation (Подплан 1) — готово

### Новые таблицы
- `user_permissions (user_id, permission, granted_by, granted_at)` — гибкие права
- `user_attributes (user_id, key, value)` — метаданные (shift, panel_id, team_id)

### Расширение `users`
Новые колонки: `ref_code` (MOD-ИванП-001), `first_name`, `last_name`, `alias`, `tableau_id`, `created_by`. Старая колонка `permissions` (jsonb) сохранена на время миграции.

### Новые / изменённые RPC
- `has_permission(user_id, permission) → boolean`
- `get_user_permissions(user_id) → text[]`
- `grant_permission(caller_id, target_user, permission) → void` (требует `manage_roles`)
- `revoke_permission(caller_id, target_user, permission) → void`
- `get_user_attributes(user_id) → jsonb`
- `set_user_attribute(caller_id, user_id, key, value) → void`
- `delete_user_attribute(caller_id, user_id, key) → void`
- `auth_login(email, password) → TABLE(…)` — расширена полями ref_code, first/last_name, alias, permissions[], attributes jsonb, is_active.

### Роли
- Старая `user` → `operator` (мигрированы)
- Добавлены: `moderator`, `teamlead`
- Полный список: `superadmin | admin | moderator | teamlead | operator`

### Тесты
- Vitest + @testing-library/react
- Команды: `npm run test`, `npm run test:run`, `npm run test:ui`
```

- [ ] **Step 4: Коммит**

```bash
git add NOTES.md
git commit -m "docs: note CRM Foundation migration in NOTES.md"
```

- [ ] **Step 5: Проверка статуса — Foundation готов**

```bash
git log --oneline -20
ls db/migrations/
```

Expected: 8 миграций применены и закоммичены, тесты зелёные, существующий дашборд работает.

**Критерии выхода (Exit criteria):**
- Все 8 миграций применены в Supabase и сохранены в `db/migrations/`
- У каждого пользователя есть `ref_code`
- Права перенесены из jsonb в `user_permissions`
- `auth_login` возвращает расширенный результат
- `useAuth` использует `normalizeSession` и отдаёт `permissions` массивом
- `<PermissionGate>` работает
- Vitest настроен, все тесты зелёные
- Существующий дашборд и AdminPanel функционируют без регрессий

---

## Что дальше

После Foundation (этот план) готовы следующие подпланы (оформим по мере необходимости):

- **Подплан 2** — Сотрудники (UI управления)
- **Подплан 3** — Задачи (core)
- **Подплан 4** — Вложения (Supabase Storage)
- **Подплан 5** — Команды (teams, team_members, moderator_operators)
- **Подплан 6** — Оповещения и workflow удаления
