# Admin Section Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Привести `/admin` к виду «Настройки superadmin'а» — два раздела: Платформы и Агентства; убрать legacy auth-стек (`AdminPanel.jsx` + 5 REST endpoints) и пустые stubs; слить два экрана агентств в один RPC-base master-detail.

**Architecture:** Удаление legacy кластера + расширение существующего `AdminAgenciesPage` drawer'ом (master-detail). Новые RPC `get_agency_full` и `update_agency_branding` дополняют существующие `list_all_agencies`, `create_agency`, `archive_agency`, `assign_admin_to_agency`, `remove_admin_from_agency`, `list_agency_admins`. Колонки `logo_url`, `contacts`, `access_login`, `access_password`, `notes` в таблице `agencies` уже существуют (legacy REST использует их напрямую) — миграция для ADD COLUMN не нужна.

**Tech Stack:** React 19 + Vite + Vitest + Tailwind v4 + Supabase RPC (PostgreSQL plpgsql, SECURITY DEFINER). Memory: `feedback_inline_sql.md` — миграции/диагностика inline в чате (Studio SQL editor); `project_db_schema.md` — таблица пользователей `dashboard_users`; `project_legacy_admin_panel.md`, `project_admin_agencies_pages.md`, `project_create_staff_auth_gap.md`, `project_auth_security_gap.md` — соответствующие memory обновляются по ходу.

**Reference spec:** `docs/superpowers/specs/2026-05-01-admin-section-reorganization-design.md`

---

## Pre-flight

### Task 0: Pre-flight grep & branch

**Purpose:** Убедиться, что 5 endpoint'ов из Stage 2 (`api/admin/create-user|list-users|update-permissions|update-password|deactivate-user`) больше нигде не зовутся, и зафиксировать стартовую точку.

**Files:**
- Read: весь репо

- [ ] **Step 1: Создать ветку**

```bash
git checkout main
git pull --ff-only
git checkout -b feat/admin-section-reorganization
```

- [ ] **Step 2: Pre-flight grep на endpoint'ы Менеджеров**

```bash
grep -rn "api/admin/create-user\|api/admin/list-users\|api/admin/update-permissions\|api/admin/update-password\|api/admin/deactivate-user" --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.yml" --include="*.yaml" --include="*.md" .
```

Expected: **только** упоминания в `src/AdminPanel.jsx` (5 вызовов через `adminApi(...)`), `docs/superpowers/specs/2026-05-01-admin-section-reorganization-design.md` (план), `docs/superpowers/plans/2026-05-01-admin-section-reorganization.md` (этот документ). Если найдётся внешний call-site (CI скрипт, сторонний repo, README с примером curl) — остановиться и обсудить.

- [ ] **Step 3: Pre-flight grep на использование `AgenciesSection` и `AdminPanel`**

```bash
grep -rn "AgenciesSection\|AdminPanel\|ClientsSection\|OperatorsSection" src/
```

Expected: импорты только в `src/AdminLayout.jsx` (4 строки) + сами файлы. Если есть другие — остановиться.

- [ ] **Step 4: Pre-flight grep на REST `api/admin/agencies`**

```bash
grep -rn "api/admin/agencies\|adminFetch.*agencies" src/
```

Expected: только `src/sections/AgenciesSection.jsx` (2 строки). Если другие — остановиться.

- [ ] **Step 5: Сохранить baseline тестов**

```bash
pnpm install --frozen-lockfile
pnpm test --run
pnpm build
```

Expected: всё зелёное. Если тесты красные на main — починить main отдельно перед началом этой работы.

- [ ] **Step 6: Commit бранч-маркер**

Никаких изменений на этом шаге — Task 0 только проверочный. Переход к Stage 2.

---

## Stage 2 — Sunset «Менеджеры»

### Task 1: Удалить роут «Менеджеры» из `AdminLayout`

**Files:**
- Modify: `src/AdminLayout.jsx`

- [ ] **Step 1: Прочитать `src/AdminLayout.jsx` целиком**

Запомнить структуру массива `SECTIONS[]` и блока `<Routes>`.

- [ ] **Step 2: Убрать секцию `users` и импорт `AdminPanel`**

В `src/AdminLayout.jsx`:
- Удалить строку 2: `import AdminPanel from './AdminPanel'`
- Удалить элемент массива `SECTIONS` с `key: 'users'` (строки 10–21).
- В `<Routes>` (около строки 154) удалить `<Route index element={<AdminPanel />} />`.
- Заменить вычисление `activeSection` (строка 83) — сейчас default `'users'`. Сделать так:

```jsx
const activeSection = SECTIONS.find(s => s.key === pathSegment)?.key || SECTIONS[0]?.key
```

- В `onClick` навигации (строка 110) убрать спец-кейс `key === 'users' ? '/admin' :` — теперь все секции имеют `/admin/<key>`. Заменить на:

```jsx
onClick={() => navigate(`/admin/${key}`)}
```

- Добавить под `<Route path="operators" element={<OperatorsSection />} />` явный fallback (нужен будет в Stage 3 при удалении других routes; сейчас можно сразу): index-route → первый раздел.

```jsx
<Route index element={<Navigate to="platforms" replace />} />
```

И вверху файла:

```jsx
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
```

- [ ] **Step 3: Verify в браузере**

```bash
pnpm dev
```

Открыть `/admin` залогинившись superadmin'ом. Ожидание:
- Sidebar содержит 5 пунктов: Платформы, Агентства, Мульти-агентства, Клиенты, Операторы.
- Раздел «Менеджеры» отсутствует.
- Открытие `/admin` без сегмента → редирект на `/admin/platforms`.
- Существующие разделы открываются без ошибок (`/staff` тоже работает).

- [ ] **Step 4: Run existing tests**

```bash
pnpm test --run
```

Expected: всё зелёное.

- [ ] **Step 5: Commit**

```bash
git add src/AdminLayout.jsx
git commit -m "feat(admin): remove «Менеджеры» nav entry, default /admin to /admin/platforms"
```

### Task 2: Удалить компонент `AdminPanel.jsx`

**Files:**
- Delete: `src/AdminPanel.jsx`

- [ ] **Step 1: Подтвердить отсутствие импортов**

```bash
grep -rn "from.*['\"].*/AdminPanel['\"]\|from.*['\"]\.\./AdminPanel" src/
```

Expected: **никаких результатов** (Task 1 убрал последний импорт).

- [ ] **Step 2: Удалить файл**

```bash
git rm src/AdminPanel.jsx
```

- [ ] **Step 3: Run tests + build**

```bash
pnpm test --run && pnpm build
```

Expected: всё зелёное.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(admin): remove AdminPanel.jsx (legacy role model, replaced by /staff RPC)"
```

### Task 3: Удалить 5 admin-REST endpoints

**Files:**
- Delete: `api/admin/create-user.js`
- Delete: `api/admin/list-users.js`
- Delete: `api/admin/update-permissions.js`
- Delete: `api/admin/update-password.js`
- Delete: `api/admin/deactivate-user.js`

- [ ] **Step 1: Финальный grep**

```bash
grep -rn "api/admin/\(create-user\|list-users\|update-permissions\|update-password\|deactivate-user\)" --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" .
```

Expected: пусто (Task 2 удалил единственный код-консьюмер).

- [ ] **Step 2: Удалить файлы**

```bash
git rm api/admin/create-user.js api/admin/list-users.js api/admin/update-permissions.js api/admin/update-password.js api/admin/deactivate-user.js
```

- [ ] **Step 3: Run tests + build**

```bash
pnpm test --run && pnpm build
```

Expected: всё зелёное.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(admin): remove legacy api/admin/{create-user,list-users,update-permissions,update-password,deactivate-user} endpoints"
```

### Task 4: Обновить memory `project_create_staff_auth_gap.md`

**Files:**
- Modify: `/Users/artemsaskin/.claude/projects/-Users-artemsaskin-Work-operator-dashboard/memory/project_create_staff_auth_gap.md`

- [ ] **Step 1: Прочитать текущее содержимое**

```bash
cat ~/.claude/projects/-Users-artemsaskin-Work-operator-dashboard/memory/project_create_staff_auth_gap.md
```

- [ ] **Step 2: Переписать body**

Удалить упоминание «`api/admin/create-user.js` (legacy) технически ещё нужен». Зафиксировать актуальный workaround: создание auth.users только через Supabase Dashboard + UPDATE auth_user_id. Упомянуть, что серверный endpoint с service role — пока pending.

Структура такая же, как в других memory: оставить frontmatter (name/description/type), переписать body.

- [ ] **Step 3: Записать**

(Один Edit/Write на файл; см. шаблон в любом другом memory.)

- [ ] **Step 4: Commit (в репо ничего не меняется — memory лежит вне репо). Stage 2 завершён.**

```bash
# Никаких git операций — memory вне репозитория.
echo "Memory updated."
```

---

## Stage 3 — Удалить stub-разделы «Клиенты» / «Операторы»

### Task 5: Удалить stub-секции и их routes

**Files:**
- Delete: `src/sections/ClientsSection.jsx`
- Delete: `src/sections/OperatorsSection.jsx`
- Modify: `src/AdminLayout.jsx`

- [ ] **Step 1: Удалить файлы**

```bash
git rm src/sections/ClientsSection.jsx src/sections/OperatorsSection.jsx
```

- [ ] **Step 2: Убрать из `AdminLayout.jsx`**

В `src/AdminLayout.jsx`:
- Удалить импорты `ClientsSection`, `OperatorsSection` (строки 5, 6 после Task 1).
- Удалить элементы `SECTIONS` с `key: 'clients'` и `key: 'operators'`.
- Удалить из `<Routes>`: `<Route path="clients" .../>` и `<Route path="operators" .../>`.
- Добавить (если ещё не добавлен в Task 1) catch-all внутри `<Routes>`:

```jsx
<Route path="*" element={<Navigate to="/admin/platforms" replace />} />
```

Это нужно чтобы прямая навигация на `/admin/clients` не давала пустую main area, а редиректила на дефолт.

- [ ] **Step 3: Verify**

```bash
pnpm dev
```

Открыть `/admin` → sidebar содержит 3 пункта: Платформы, Агентства, Мульти-агентства. Прямая навигация `/admin/clients` или `/admin/operators` → редирект на `/admin/platforms`.

- [ ] **Step 4: Run tests + build**

```bash
pnpm test --run && pnpm build
```

Expected: всё зелёное.

- [ ] **Step 5: Commit**

```bash
git add src/AdminLayout.jsx
git commit -m "feat(admin): remove «Клиенты»/«Операторы» stub sections and routes"
```

---

## Stage 4 — Merge agencies (legacy + multi-agency)

### Task 6: Migration для новых RPC `get_agency_full` и `update_agency_branding`

**Purpose:** Вынести branding и contacts management в RPC layer (single source of truth) — взамен REST `api/admin/agencies`. `set_agency_contacts` совмещён с `update_agency_branding` через один вызов с jsonb-параметром (упрощает UI: одна кнопка save в Branding section). `get_agency_full` возвращает полную запись для master-detail drawer.

**Files:**
- Create: `db/migrations/20260501_80_rpc_agency_branding.sql`

- [ ] **Step 1: Создать файл миграции**

Создать `db/migrations/20260501_80_rpc_agency_branding.sql`:

```sql
-- Migration 80: RPC get_agency_full + update_agency_branding (superadmin-only)
--
-- get_agency_full(p_id) — возвращает полную запись агентства для master-detail drawer:
--   name, platform_id, platform_name, logo_url, contacts (jsonb array),
--   access_login, access_password, notes, is_active, created_at,
--   admin_count, user_count, client_count, team_count.
--
-- update_agency_branding(p_id, p_logo_url, p_contacts, p_access_login,
--                        p_access_password, p_notes) — superadmin-only,
-- частичное обновление (NULL → не трогаем). p_contacts передаётся как jsonb;
-- если NULL — не трогаем; если jsonb-массив — полная перезапись.

BEGIN;

-- ============================================================
-- get_agency_full(p_id)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_agency_full(p_id uuid)
RETURNS TABLE (
  out_id              uuid,
  out_name            text,
  out_platform_id     uuid,
  out_platform_name   text,
  out_logo_url        text,
  out_contacts        jsonb,
  out_access_login    text,
  out_access_password text,
  out_notes           text,
  out_is_active       boolean,
  out_created_at      timestamptz,
  out_admin_count     integer,
  out_user_count      integer,
  out_client_count    integer,
  out_team_count      integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_role text;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  SELECT role INTO v_role FROM dashboard_users WHERE id = v_caller_id;
  IF v_role != 'superadmin' THEN
    RAISE EXCEPTION 'only superadmin can read full agency' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.name,
    a.platform_id,
    p.name,
    a.logo_url,
    COALESCE(a.contacts, '[]'::jsonb),
    a.access_login,
    a.access_password,
    a.notes,
    a.is_active,
    a.created_at,
    (SELECT COUNT(*)::int FROM admin_agencies aa WHERE aa.agency_id = a.id),
    (SELECT COUNT(*)::int FROM dashboard_users u WHERE u.agency_id = a.id AND u.is_active = true),
    (SELECT COUNT(*)::int FROM clients c WHERE c.agency_id = a.id),
    (SELECT COUNT(*)::int FROM teams t WHERE t.agency_id = a.id)
  FROM agencies a
  LEFT JOIN platforms p ON p.id = a.platform_id
  WHERE a.id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'agency % not found', p_id USING errcode = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_agency_full(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_agency_full(uuid) TO authenticated;

-- ============================================================
-- update_agency_branding(p_id, p_logo_url, p_contacts, p_access_login,
--                       p_access_password, p_notes)
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_agency_branding(
  p_id              uuid,
  p_logo_url        text     DEFAULT NULL,
  p_contacts        jsonb    DEFAULT NULL,
  p_access_login    text     DEFAULT NULL,
  p_access_password text     DEFAULT NULL,
  p_notes           text     DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_role text;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  SELECT role INTO v_role FROM dashboard_users WHERE id = v_caller_id;
  IF v_role != 'superadmin' THEN
    RAISE EXCEPTION 'only superadmin can update agency branding' USING errcode = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM agencies WHERE id = p_id) THEN
    RAISE EXCEPTION 'agency % not found', p_id USING errcode = 'P0002';
  END IF;

  IF p_contacts IS NOT NULL AND jsonb_typeof(p_contacts) != 'array' THEN
    RAISE EXCEPTION 'p_contacts must be a jsonb array' USING errcode = '22023';
  END IF;

  UPDATE agencies SET
    logo_url        = COALESCE(p_logo_url,        logo_url),
    contacts        = COALESCE(p_contacts,        contacts),
    access_login    = COALESCE(p_access_login,    access_login),
    access_password = COALESCE(p_access_password, access_password),
    notes           = COALESCE(p_notes,           notes)
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_agency_branding(uuid, text, jsonb, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_agency_branding(uuid, text, jsonb, text, text, text) TO authenticated;

COMMIT;

-- VERIFY:
--   SELECT proname FROM pg_proc WHERE proname IN ('get_agency_full','update_agency_branding');
--   -- Expected: 2 rows.
--
--   -- Permission check (non-superadmin should fail):
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<non-superadmin auth uuid>"}', true);
--   SELECT * FROM get_agency_full('<some agency uuid>');
--   -- Expected: ERROR "only superadmin can read full agency".
--
-- ROLLBACK:
--   DROP FUNCTION public.update_agency_branding(uuid, text, jsonb, text, text, text);
--   DROP FUNCTION public.get_agency_full(uuid);
```

- [ ] **Step 2: Прокатить миграцию вручную через Supabase Studio SQL Editor**

Скопировать содержимое `20260501_80_rpc_agency_branding.sql` целиком, вставить в Studio SQL Editor, запустить. Ожидание: `BEGIN`/`COMMIT`, без ошибок.

- [ ] **Step 3: Verify через VERIFY-блок**

В Studio SQL Editor выполнить:

```sql
SELECT proname FROM pg_proc WHERE proname IN ('get_agency_full','update_agency_branding');
```

Expected: 2 строки.

Затем — на любом существующем агентстве:

```sql
SELECT * FROM get_agency_full((SELECT id FROM agencies LIMIT 1));
```

Expected: одна строка со всеми колонками.

- [ ] **Step 4: Commit миграции**

```bash
git add db/migrations/20260501_80_rpc_agency_branding.sql
git commit -m "feat(db): add get_agency_full + update_agency_branding RPC (superadmin-only)"
```

### Task 7: Создать `AgencyContactsFields` (extracted)

**Purpose:** Вынести редактор массива контактов из удаляемого `AgenciesSection.jsx` в отдельный компонент. Чистая UI-логика без зависимости от REST.

**Files:**
- Create: `src/components/agencies/AgencyContactsFields.jsx`

- [ ] **Step 1: Создать файл**

Содержимое — extracted `ContactFields` из `src/sections/AgenciesSection.jsx` (строки 32–87), с минимальными правками: убрать упоминание `EMPTY_CONTACT` как top-level const файла (не нужно), expose `EMPTY_CONTACT` как named export для использования в `AgencyDetailPanel`:

```jsx
import { Fragment } from 'react'

export const EMPTY_CONTACT = { name: '', phone: '', email: '', telegram: '', role: '' }

export default function AgencyContactsFields({ contacts, onChange, disabled = false }) {
  const update = (i, field, value) => {
    const next = contacts.map((c, j) => j === i ? { ...c, [field]: value } : c)
    onChange(next)
  }
  const add = () => onChange([...contacts, { ...EMPTY_CONTACT }])
  const remove = (i) => onChange(contacts.filter((_, j) => j !== i))

  return (
    <div>
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">
        Контакты менеджеров
      </p>
      <div className="space-y-3">
        {contacts.map((c, i) => (
          <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2 relative">
            {contacts.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={disabled}
                className="absolute top-2 right-2 text-slate-300 hover:text-red-500 transition-colors disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Имя" value={c.name || ''} onChange={e => update(i, 'name', e.target.value)} disabled={disabled}
                className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50" />
              <input placeholder="Должность" value={c.role || ''} onChange={e => update(i, 'role', e.target.value)} disabled={disabled}
                className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Телефон" value={c.phone || ''} onChange={e => update(i, 'phone', e.target.value)} disabled={disabled}
                className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50" />
              <input placeholder="Email" value={c.email || ''} onChange={e => update(i, 'email', e.target.value)} disabled={disabled}
                className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50" />
            </div>
            <input placeholder="Telegram (@username)" value={c.telegram || ''} onChange={e => update(i, 'telegram', e.target.value)} disabled={disabled}
              className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50" />
          </div>
        ))}
      </div>
      <button type="button" onClick={add} disabled={disabled}
        className="mt-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-medium flex items-center gap-1 disabled:opacity-50">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-3.5 h-3.5">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        Добавить контакт
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Run tests + build**

```bash
pnpm test --run && pnpm build
```

Expected: зелёное (компонент пока не используется — но компилируется).

- [ ] **Step 3: Commit**

```bash
git add src/components/agencies/AgencyContactsFields.jsx
git commit -m "feat(admin): extract AgencyContactsFields from legacy AgenciesSection"
```

### Task 8: Создать `AgencyBrandingFields`

**Purpose:** Branding-сабфильд: logo upload (через `api/admin/upload-logo`), access login/password (с show/hide), notes. Чистый презентационный компонент с пробрасыванием save вверх.

**Files:**
- Create: `src/components/agencies/AgencyBrandingFields.jsx`

- [ ] **Step 1: Создать файл**

```jsx
import { useState } from 'react'
import { adminFetch } from '../../lib/adminFetch.js'

async function uploadLogo(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1]
      const { data, error } = await adminFetch('/api/admin/upload-logo', {
        file: base64,
        filename: file.name,
        content_type: file.type,
      })
      if (error) reject(new Error(error.message || 'Upload failed'))
      else resolve(data.url)
    }
    reader.onerror = () => reject(new Error('File read error'))
    reader.readAsDataURL(file)
  })
}

export default function AgencyBrandingFields({ value, onChange, disabled = false }) {
  // value: { logo_url, access_login, access_password, notes }
  const [showPassword, setShowPassword] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const url = await uploadLogo(file)
      onChange({ ...value, logo_url: url })
    } catch (err) {
      setUploadError(err.message)
    }
    setUploading(false)
  }

  return (
    <div className="space-y-4">
      {/* Logo */}
      <div>
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Логотип</p>
        <div className="flex items-center gap-3">
          {value.logo_url ? (
            <img src={value.logo_url} alt="" className="h-12 max-w-24 rounded-xl object-contain border border-slate-200 dark:border-slate-700" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
                <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/>
              </svg>
            </div>
          )}
          <label className={`text-sm font-medium cursor-pointer px-3 py-1.5 rounded-lg border transition-colors ${uploading || disabled ? 'opacity-50' : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-indigo-400'}`}>
            {uploading ? 'Загрузка...' : 'Выбрать файл'}
            <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={uploading || disabled} />
          </label>
        </div>
        {uploadError && <p className="text-xs text-red-500 mt-2">{uploadError}</p>}
      </div>

      {/* Access */}
      <div>
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Доступ</p>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Логин"
            value={value.access_login || ''}
            onChange={e => onChange({ ...value, access_login: e.target.value })}
            disabled={disabled}
            className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
          />
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Пароль"
              value={value.access_password || ''}
              onChange={e => onChange({ ...value, access_password: e.target.value })}
              disabled={disabled}
              className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50 pr-9"
            />
            <button type="button" onClick={() => setShowPassword(v => !v)} disabled={disabled}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-50">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                {showPassword ? (
                  <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                ) : (
                  <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Заметки</p>
        <textarea
          placeholder="Дополнительная информация"
          value={value.notes || ''}
          onChange={e => onChange({ ...value, notes: e.target.value })}
          rows={3}
          disabled={disabled}
          className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run tests + build**

```bash
pnpm test --run && pnpm build
```

Expected: зелёное.

- [ ] **Step 3: Commit**

```bash
git add src/components/agencies/AgencyBrandingFields.jsx
git commit -m "feat(admin): add AgencyBrandingFields (logo + access + notes)"
```

### Task 9: Создать `AgencyAdminAssignments` (inline-вариант, без modal)

**Purpose:** Перенести логику `AgencyAdminAssignmentModal.jsx` в inline-секцию для drawer'а. RPC те же (`list_agency_admins`, `assign_admin_to_agency`, `remove_admin_from_agency`).

**Files:**
- Create: `src/components/agencies/AgencyAdminAssignments.jsx`

- [ ] **Step 1: Создать файл**

```jsx
import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient.js'

export default function AgencyAdminAssignments({ agencyId }) {
  const [allAdmins, setAllAdmins] = useState([])
  const [assigned, setAssigned] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      const { data: admins, error: aErr } = await supabase
        .from('dashboard_users')
        .select('id, email, first_name, last_name')
        .eq('role', 'admin')
        .eq('is_active', true)
        .order('email')
      if (cancelled) return
      if (aErr) {
        setError(aErr.message)
        setLoading(false)
        return
      }
      setAllAdmins(admins ?? [])

      const { data: links, error: lErr } = await supabase.rpc('list_agency_admins', {
        p_agency_id: agencyId,
      })
      if (cancelled) return
      if (lErr) {
        setError(lErr.message)
        setLoading(false)
        return
      }
      setAssigned(new Set((links ?? []).map((l) => l.admin_id)))
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [agencyId])

  const toggle = async (adminId) => {
    if (busy) return
    setBusy(true)
    setError(null)
    if (assigned.has(adminId)) {
      const { error: e } = await supabase.rpc('remove_admin_from_agency', {
        p_admin_id: adminId,
        p_agency_id: agencyId,
      })
      if (e) setError(e.message)
      else {
        const next = new Set(assigned)
        next.delete(adminId)
        setAssigned(next)
      }
    } else {
      const { error: e } = await supabase.rpc('assign_admin_to_agency', {
        p_admin_id: adminId,
        p_agency_id: agencyId,
      })
      if (e) setError(e.message)
      else setAssigned(new Set(assigned).add(adminId))
    }
    setBusy(false)
  }

  return (
    <div>
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">
        Админы агентства
      </p>
      {error && <p className="text-sm text-destructive mb-2 break-words">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : allAdmins.length === 0 ? (
        <p className="text-sm text-muted-foreground">Нет admin-пользователей. Создай в /staff.</p>
      ) : (
        <ul className="space-y-1 max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg p-2">
          {allAdmins.map((a) => (
            <li key={a.id}
              className="flex items-center justify-between gap-2 py-1.5 px-2 hover:bg-accent/40 rounded">
              <span className="text-sm truncate">
                {a.first_name || a.last_name
                  ? `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() + ' · '
                  : ''}
                {a.email}
              </span>
              <input
                type="checkbox"
                checked={assigned.has(a.id)}
                onChange={() => toggle(a.id)}
                disabled={busy}
                className="h-4 w-4"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run tests + build**

```bash
pnpm test --run && pnpm build
```

Expected: зелёное.

- [ ] **Step 3: Commit**

```bash
git add src/components/agencies/AgencyAdminAssignments.jsx
git commit -m "feat(admin): add AgencyAdminAssignments inline section (replaces modal)"
```

### Task 10: Создать `AgencyDetailPanel` (drawer-orchestrator)

**Purpose:** Master-detail drawer. Грузит данные через `get_agency_full`, держит локальную форму, вызывает `update_agency_branding` для save.

**Files:**
- Create: `src/components/agencies/AgencyDetailPanel.jsx`

- [ ] **Step 1: Создать файл**

```jsx
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient.js'
import AgencyBrandingFields from './AgencyBrandingFields.jsx'
import AgencyContactsFields, { EMPTY_CONTACT } from './AgencyContactsFields.jsx'
import AgencyAdminAssignments from './AgencyAdminAssignments.jsx'

const initialBranding = {
  logo_url: '',
  access_login: '',
  access_password: '',
  notes: '',
}

export default function AgencyDetailPanel({ agencyId, onClose, onAfterSave }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [agency, setAgency] = useState(null)
  const [branding, setBranding] = useState(initialBranding)
  const [contacts, setContacts] = useState([{ ...EMPTY_CONTACT }])
  const [savingBranding, setSavingBranding] = useState(false)
  const [savingContacts, setSavingContacts] = useState(false)
  const [brandingDirty, setBrandingDirty] = useState(false)
  const [contactsDirty, setContactsDirty] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: e } = await supabase.rpc('get_agency_full', { p_id: agencyId })
    if (e) {
      setError(e.message)
      setLoading(false)
      return
    }
    if (!data || data.length === 0) {
      setError('Агентство не найдено')
      setAgency(null)
      setLoading(false)
      return
    }
    const r = data[0]
    setAgency({
      id: r.out_id,
      name: r.out_name,
      platform_id: r.out_platform_id,
      platform_name: r.out_platform_name,
      is_active: r.out_is_active,
      created_at: r.out_created_at,
    })
    setBranding({
      logo_url: r.out_logo_url || '',
      access_login: r.out_access_login || '',
      access_password: r.out_access_password || '',
      notes: r.out_notes || '',
    })
    const arr = Array.isArray(r.out_contacts) ? r.out_contacts : []
    setContacts(arr.length ? arr : [{ ...EMPTY_CONTACT }])
    setBrandingDirty(false)
    setContactsDirty(false)
    setLoading(false)
  }, [agencyId])

  useEffect(() => { load() }, [load])

  const saveBranding = async () => {
    setSavingBranding(true)
    setError(null)
    const { error: e } = await supabase.rpc('update_agency_branding', {
      p_id: agencyId,
      p_logo_url: branding.logo_url || null,
      p_contacts: null,
      p_access_login: branding.access_login || null,
      p_access_password: branding.access_password || null,
      p_notes: branding.notes || null,
    })
    setSavingBranding(false)
    if (e) {
      setError(e.message)
      return
    }
    setBrandingDirty(false)
    onAfterSave?.()
  }

  const saveContacts = async () => {
    setSavingContacts(true)
    setError(null)
    const cleaned = contacts.filter(c => c.name || c.phone || c.email || c.telegram || c.role)
    const { error: e } = await supabase.rpc('update_agency_branding', {
      p_id: agencyId,
      p_logo_url: null,
      p_contacts: cleaned,
      p_access_login: null,
      p_access_password: null,
      p_notes: null,
    })
    setSavingContacts(false)
    if (e) {
      setError(e.message)
      return
    }
    setContactsDirty(false)
    onAfterSave?.()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative w-full max-w-xl h-full bg-background shadow-xl overflow-y-auto">
        <header className="sticky top-0 bg-background border-b border-border px-5 py-4 flex items-center justify-between z-10">
          <div className="min-w-0">
            <h2 className="text-base font-semibold truncate">
              {agency?.name || 'Агентство'}
            </h2>
            {agency?.platform_name && (
              <p className="text-xs text-muted-foreground truncate">{agency.platform_name}</p>
            )}
          </div>
          <button type="button" onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </header>

        <div className="p-5 space-y-6">
          {error && (
            <p className="text-sm text-destructive break-words bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : !agency ? null : (
            <>
              {/* Branding */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Бренд и доступ</h3>
                <AgencyBrandingFields
                  value={branding}
                  onChange={(next) => { setBranding(next); setBrandingDirty(true) }}
                  disabled={savingBranding}
                />
                <div className="flex justify-end">
                  <button type="button" onClick={saveBranding}
                    disabled={!brandingDirty || savingBranding}
                    className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50">
                    {savingBranding ? 'Сохранение…' : 'Сохранить'}
                  </button>
                </div>
              </section>

              {/* Contacts */}
              <section className="space-y-3 pt-4 border-t border-border">
                <AgencyContactsFields
                  contacts={contacts}
                  onChange={(next) => { setContacts(next); setContactsDirty(true) }}
                  disabled={savingContacts}
                />
                <div className="flex justify-end">
                  <button type="button" onClick={saveContacts}
                    disabled={!contactsDirty || savingContacts}
                    className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50">
                    {savingContacts ? 'Сохранение…' : 'Сохранить контакты'}
                  </button>
                </div>
              </section>

              {/* Admin assignments */}
              <section className="pt-4 border-t border-border">
                <AgencyAdminAssignments agencyId={agencyId} />
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
```

- [ ] **Step 2: Run tests + build**

```bash
pnpm test --run && pnpm build
```

Expected: зелёное.

- [ ] **Step 3: Commit**

```bash
git add src/components/agencies/AgencyDetailPanel.jsx
git commit -m "feat(admin): add AgencyDetailPanel master-detail drawer"
```

### Task 11: Расширить `AdminAgenciesPage` master-detail

**Purpose:** Открывать `AgencyDetailPanel` по row click. Заменить per-row кнопку «Админы» (открывала `AgencyAdminAssignmentModal`) на единый row click.

**Files:**
- Modify: `src/pages/AdminAgenciesPage.jsx`
- Modify: `src/components/agencies/AgencyTable.jsx`

- [ ] **Step 1: Прочитать оба файла**

Запомнить структуру state и пропсов.

- [ ] **Step 2: Обновить `AgencyTable.jsx`**

Поведение: вместо кнопки «Админы» (которая открывала modal) — клик по строке вызывает `onSelect(a)` callback. Кнопка «Архивировать» остаётся (но действие per-row, не открывает drawer). Удалить useState `editing`, удалить импорт `AgencyAdminAssignmentModal` и его рендер.

```jsx
import { useState } from 'react'
import { supabase } from '../../supabaseClient.js'

export default function AgencyTable({ agencies, onChange, onSelect }) {
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)

  const archive = async (a, e) => {
    e.stopPropagation()
    if (!window.confirm(`Архивировать «${a.name}»? У агентства не должно быть активных пользователей или клиентов.`)) return
    setBusyId(a.id)
    setError(null)
    const { error: err } = await supabase.rpc('archive_agency', { p_agency_id: a.id })
    setBusyId(null)
    if (err) {
      setError(`${a.name}: ${err.message}`)
      return
    }
    onChange()
  }

  return (
    <>
      {error && <p className="text-sm text-destructive mb-2 break-words">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="py-2 pr-4">Название</th>
              <th className="py-2 pr-4">Платформа</th>
              <th className="py-2 px-2 text-center">Админы</th>
              <th className="py-2 px-2 text-center">Сотрудники</th>
              <th className="py-2 px-2 text-center">Клиенты</th>
              <th className="py-2 px-2 text-center">Команды</th>
              <th className="py-2 px-2">Статус</th>
              <th className="py-2 pl-2 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {agencies.map((a) => (
              <tr key={a.id}
                  onClick={() => onSelect?.(a)}
                  className="border-b border-border hover:bg-accent/40 cursor-pointer">
                <td className="py-2 pr-4 font-medium">{a.name}</td>
                <td className="py-2 pr-4">{a.platform_name ?? '—'}</td>
                <td className="py-2 px-2 text-center">{a.admin_count}</td>
                <td className="py-2 px-2 text-center">{a.user_count}</td>
                <td className="py-2 px-2 text-center">{a.client_count}</td>
                <td className="py-2 px-2 text-center">{a.team_count}</td>
                <td className="py-2 px-2">
                  {a.is_active
                    ? <span className="text-xs">Активно</span>
                    : <span className="text-xs text-muted-foreground">Архив</span>}
                </td>
                <td className="py-2 pl-2 text-right whitespace-nowrap">
                  {a.is_active && (
                    <button
                      type="button"
                      onClick={(e) => archive(a, e)}
                      className="text-destructive text-xs hover:underline disabled:opacity-50"
                      disabled={busyId === a.id}
                    >
                      Архивировать
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
```

- [ ] **Step 3: Обновить `AdminAgenciesPage.jsx`**

Добавить `selectedId` state и рендер `AgencyDetailPanel`. Reload list после save в drawer'е (counters могут не меняться, но это безопасно).

```jsx
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { useAuth } from '../useAuth.jsx'
import AgencyTable from '../components/agencies/AgencyTable.jsx'
import AgencyCreateModal from '../components/agencies/AgencyCreateModal.jsx'
import AgencyDetailPanel from '../components/agencies/AgencyDetailPanel.jsx'

export default function AdminAgenciesPage() {
  const { user } = useAuth()
  const [agencies, setAgencies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: e } = await supabase.rpc('list_all_agencies')
    if (e) {
      setError(e.message)
      setAgencies([])
    } else {
      setAgencies(
        (data ?? []).map((r) => ({
          id: r.out_id,
          name: r.out_name,
          platform_id: r.out_platform_id,
          platform_name: r.out_platform_name,
          is_active: r.out_is_active,
          admin_count: r.out_admin_count,
          user_count: r.out_user_count,
          client_count: r.out_client_count,
          team_count: r.out_team_count,
          created_at: r.out_created_at,
        }))
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  if (user?.role !== 'superadmin') {
    return <div className="p-6 text-destructive">Доступ только для superadmin</div>
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Агентства</h1>
          <p className="text-sm text-muted-foreground">
            Создание агентств, мягкая архивация, управление брендингом, контактами и админами.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium hover:opacity-90"
        >
          + Новое агентство
        </button>
      </div>
      {error && <p className="text-sm text-destructive break-words">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : agencies.length === 0 ? (
        <p className="text-sm text-muted-foreground">Агентств пока нет.</p>
      ) : (
        <AgencyTable
          agencies={agencies}
          onChange={reload}
          onSelect={(a) => setSelectedId(a.id)}
        />
      )}
      {createOpen && (
        <AgencyCreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); reload() }}
        />
      )}
      {selectedId && (
        <AgencyDetailPanel
          agencyId={selectedId}
          onClose={() => setSelectedId(null)}
          onAfterSave={reload}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verify в браузере**

```bash
pnpm dev
```

`/admin/multi-agency` — клик по строке открывает drawer; данные загружены; logo upload работает; save branding и save contacts работают; чекбоксы admin assignments работают; closing drawer clicking outside or X works.

- [ ] **Step 5: Run tests + build**

```bash
pnpm test --run && pnpm build
```

Expected: зелёное.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AdminAgenciesPage.jsx src/components/agencies/AgencyTable.jsx
git commit -m "feat(admin): wire AgencyDetailPanel into AdminAgenciesPage; row click opens drawer"
```

### Task 12: Удалить orphaned `AgencyAdminAssignmentModal`

**Files:**
- Delete: `src/components/agencies/AgencyAdminAssignmentModal.jsx`

- [ ] **Step 1: Подтвердить отсутствие импортов**

```bash
grep -rn "AgencyAdminAssignmentModal" src/
```

Expected: пусто (Task 11 убрал последний импорт).

- [ ] **Step 2: Удалить файл**

```bash
git rm src/components/agencies/AgencyAdminAssignmentModal.jsx
```

- [ ] **Step 3: Run tests + build**

```bash
pnpm test --run && pnpm build
```

Expected: зелёное.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(admin): remove orphaned AgencyAdminAssignmentModal (replaced by inline drawer section)"
```

### Task 13: Перевести `/admin/agencies` на новый экран; удалить `multi-agency`

**Purpose:** Один путь для агентств. Старый legacy (`AgenciesSection.jsx`) больше не доступен через nav. Sidebar содержит «Платформы» и «Агентства».

**Files:**
- Modify: `src/AdminLayout.jsx`

- [ ] **Step 1: Прочитать `src/AdminLayout.jsx`**

- [ ] **Step 2: Обновить `SECTIONS[]` и `<Routes>`**

В `SECTIONS[]` оставить только два элемента — `platforms` и `agencies`. Удалить элементы `agencies` (legacy) и `multi-agency`. Заменить старый `agencies` icon на тот, что был у `multi-agency` (или оставить existing — на твоё усмотрение, дизайн-выбор; в плане оставляем существующий icon `agencies`).

В `<Routes>` оставить:
- `<Route index element={<Navigate to="platforms" replace />} />`
- `<Route path="platforms" element={<PlatformsSection />} />`
- `<Route path="agencies" element={<AdminAgenciesPage />} />`
- `<Route path="*" element={<Navigate to="/admin/platforms" replace />} />`

Удалить импорты `AgenciesSection` и убрать роут `multi-agency`.

```jsx
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import PlatformsSection from './sections/PlatformsSection'
import AdminAgenciesPage from './pages/AdminAgenciesPage'

const SECTIONS = [
  { key: 'platforms', label: 'Платформы', icon: (/* existing svg */) },
  { key: 'agencies',  label: 'Агентства', icon: (/* existing svg from old agencies entry */) },
]
```

- [ ] **Step 3: Verify**

```bash
pnpm dev
```

Открыть `/admin` — sidebar содержит ровно 2 пункта (Платформы, Агентства). `/admin/agencies` показывает новый экран с таблицей + drawer. Прямая навигация `/admin/multi-agency` → редирект на `/admin/platforms`.

- [ ] **Step 4: Run tests + build**

```bash
pnpm test --run && pnpm build
```

Expected: зелёное.

- [ ] **Step 5: Commit**

```bash
git add src/AdminLayout.jsx
git commit -m "feat(admin): unify agencies nav — single «Агентства» entry → AdminAgenciesPage"
```

### Task 14: Удалить `AgenciesSection.jsx` и REST `api/admin/agencies`

**Files:**
- Delete: `src/sections/AgenciesSection.jsx`
- Delete: `api/admin/agencies.js`

- [ ] **Step 1: Финальный grep**

```bash
grep -rn "AgenciesSection\|api/admin/agencies" src/ api/
```

Expected: пусто (Task 13 убрал последний импорт; Task 7 уже скопировал ContactFields).

- [ ] **Step 2: Удалить файлы**

```bash
git rm src/sections/AgenciesSection.jsx api/admin/agencies.js
```

- [ ] **Step 3: Run tests + build**

```bash
pnpm test --run && pnpm build
```

Expected: зелёное.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(admin): remove legacy AgenciesSection.jsx + api/admin/agencies REST endpoint"
```

### Task 15: SQL permission test (manual)

**Purpose:** Подтвердить, что новые RPC закрыты для не-superadmin.

**Files:**
- N/A (выполняется в Supabase Studio SQL Editor; результат фиксируется в комментарии PR).

- [ ] **Step 1: В Supabase Studio SQL Editor**

```sql
-- Подставить uuid обычного admin'а или user'а из dashboard_users
-- (НЕ superadmin'а).
DO $$
DECLARE
  v_non_super_auth_uuid text := '<auth.users uuid for non-superadmin>';
  v_test_agency_id uuid := (SELECT id FROM agencies LIMIT 1);
BEGIN
  -- Имитируем jwt не-superadmin'а:
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_non_super_auth_uuid)::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    PERFORM get_agency_full(v_test_agency_id);
    RAISE NOTICE 'FAIL: get_agency_full did not raise';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'OK: get_agency_full raised permission error';
  END;

  BEGIN
    PERFORM update_agency_branding(v_test_agency_id, p_notes := 'should not save');
    RAISE NOTICE 'FAIL: update_agency_branding did not raise';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'OK: update_agency_branding raised permission error';
  END;
END $$;
```

Expected: 2 NOTICE сообщения «OK: ...».

- [ ] **Step 2: Записать результаты в PR описание**

Добавить в финальный PR в секцию «Verification»:

```
- SQL permission test: get_agency_full и update_agency_branding отбрасывают non-superadmin (проверено через DO-блок в Studio).
```

---

## Stage 5 — UI rename

### Task 16: Переименовать «Аккаунт» → «Настройки»

**Files:**
- Modify: `src/AdminLayout.jsx`

- [ ] **Step 1: Изменить sidebar header**

В `src/AdminLayout.jsx` найти `<h1 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">Аккаунт</h1>` и заменить на:

```jsx
<h1 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">Настройки</h1>
```

- [ ] **Step 2: Verify**

```bash
pnpm dev
```

Sidebar header показывает «Настройки».

- [ ] **Step 3: Run tests + build**

```bash
pnpm test --run && pnpm build
```

Expected: зелёное.

- [ ] **Step 4: Commit**

```bash
git add src/AdminLayout.jsx
git commit -m "feat(admin): rename sidebar header «Аккаунт» → «Настройки»"
```

---

## Final

### Task 17: Финальная проверка перед PR

- [ ] **Step 1: Полный smoke test (manual)**

```bash
pnpm dev
```

Залогиниться superadmin'ом и пройти:
- User menu → Настройки → `/admin` редиректит на `/admin/platforms`.
- Sidebar содержит ровно 2 пункта: Платформы, Агентства.
- Sidebar header — «Настройки».
- `/admin/platforms` работает (создание/редактирование платформ — без регрессий).
- `/admin/agencies` работает: таблица из `list_all_agencies`, кнопка «+ Новое агентство» → создание; row click → drawer; load `get_agency_full`; save branding; save contacts; logo upload; admin assignments toggle; archive.
- Stale URLs: `/admin/users`, `/admin/clients`, `/admin/operators`, `/admin/multi-agency` — редирект на `/admin/platforms`.
- Login non-superadmin'ом → `/admin` 404 (защита в `App.jsx`).

- [ ] **Step 2: Полный test + build**

```bash
pnpm test --run && pnpm build
```

Expected: всё зелёное.

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

Expected: без новых ошибок.

- [ ] **Step 4: Удалить устаревший plan-stub**

```bash
git rm docs/superpowers/plans/2026-04-30-create-staff-auth-fix.md 2>/dev/null || true
git rm docs/superpowers/plans/2026-05-01-admin-section-reorganization.md.stub 2>/dev/null || true
```

(Если такого файла нет — пропустить. Если был старый stub — удалить.) Этот plan-документ остаётся в `docs/superpowers/plans/2026-05-01-admin-section-reorganization.md` как исторический.

- [ ] **Step 5: Финальный commit (если есть несохранённые правки)**

```bash
git status
# Если ничего — переходим к PR.
```

### Task 18: Создать PR

- [ ] **Step 1: Push**

```bash
git push -u origin feat/admin-section-reorganization
```

- [ ] **Step 2: Открыть PR**

```bash
gh pr create --title "feat(admin): section reorganization — sunset legacy + agencies merge" --body "$(cat <<'EOF'
## Summary
- Sunset legacy auth-стека: удалён `AdminPanel.jsx` + 5 REST endpoints (`api/admin/{create-user,list-users,update-permissions,update-password,deactivate-user}`); функционал перекрыт `/staff` через RPC.
- Удалены пустые stub-разделы «Клиенты»/«Операторы» из `/admin`.
- `/admin/agencies` (legacy) и `/admin/multi-agency` объединены в один master-detail экран на базе `AdminAgenciesPage` + новый `AgencyDetailPanel` drawer; новые RPC `get_agency_full` и `update_agency_branding`; `api/admin/agencies` удалён.
- Sidebar header `/admin` переименован «Аккаунт» → «Настройки» (концептуально соответствует пункту в user menu).

Spec: `docs/superpowers/specs/2026-05-01-admin-section-reorganization-design.md`
Plan: `docs/superpowers/plans/2026-05-01-admin-section-reorganization.md`

После этого PR разблокирован Stage 16 (drop `password_hash`) — последний UI-консьюмер `update-password.js` ушёл вместе с `AdminPanel.jsx`.

## Test plan
- [ ] Залогиниться superadmin → /admin редиректит на /admin/platforms; sidebar содержит 2 пункта; header «Настройки».
- [ ] Платформы — CRUD без регрессий.
- [ ] Агентства — list, create, row click → drawer, save branding, save contacts, logo upload, admin assign/detach, archive.
- [ ] Stale URLs `/admin/users`, `/admin/clients`, `/admin/operators`, `/admin/multi-agency` редиректят на `/admin/platforms`.
- [ ] Non-superadmin → /admin 404.
- [ ] Permission test SQL: get_agency_full и update_agency_branding отбрасывают non-superadmin.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Перед merge — переключиться на правильный gh-аккаунт**

Memory `project_gh_auth.md`: gh merge падает под `temashdesign`; нужен `clubmonaco2017-ops`.

```bash
gh auth switch --user clubmonaco2017-ops
```

- [ ] **Step 4: Merge после approve**

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 5: Deploy**

Memory `project_vercel_deploy.md`: deploy через CLI, scope `clubmonaco2017-ops-projects`.

```bash
git checkout main && git pull --ff-only
vercel --prod
```

---

## Self-review (после написания плана — выполнить перед стартом implementation)

Внутренний чек-лист (do this once, fix inline, не сабагент):

1. **Spec coverage** — каждый раздел spec'а покрыт задачей:
   - Goal 1 (settings entry) — DONE pre-plan (commit 610fd0f).
   - Goal 2 (sunset legacy) — Tasks 1–4.
   - Goal 3 (agencies merge) — Tasks 6–14.
   - Goal 4 (UI label) — Task 16.
   - Stub removal (Stage 3) — Task 5.
   - Risks → mitigation: pre-flight grep (Task 0), permission test (Task 15).

2. **Placeholder scan** — нет TBD/«implement later». Все code-блоки полные.

3. **Type consistency**:
   - RPC param names — `p_id`, `p_logo_url`, `p_contacts`, `p_access_login`, `p_access_password`, `p_notes` — одинаковые в SQL и JS-вызовах.
   - Component props — `agencyId`, `onClose`, `onAfterSave`, `value/onChange`, `disabled` — везде одинаковые.
   - Existing RPC names — `assign_admin_to_agency`, `remove_admin_from_agency`, `list_agency_admins`, `archive_agency`, `list_all_agencies` — соответствуют `db/migrations/20260429_60_rpc_admin_agency_assignments.sql` и `20260429_59_rpc_agencies_crud.sql`. (Spec изначально использовал `attach_agency_admin/detach_agency_admin` — это была ошибка; в плане использованы корректные имена.)
