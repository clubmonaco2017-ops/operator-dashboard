# Admin Section Reorganization — Design Spec

**Date:** 2026-05-01
**Status:** Approved (brainstorm complete)
**Supersedes:** `docs/superpowers/plans/2026-05-01-admin-section-reorganization.md` (stub)

## Context

После multi-agency scoping (PR #61) `/admin` стал перегруженным. Реальное состояние разделов отличается от первого впечатления:

| Раздел | Файл | Реальный статус |
|---|---|---|
| Менеджеры | `src/AdminPanel.jsx` (440) | Старая ролевая модель + REST `api/admin/*`; функционал перекрыт `/staff` (RPC) |
| Платформы | `src/sections/PlatformsSection.jsx` (407) | Уникальный CRUD, оставляем |
| Агентства (legacy) | `src/sections/AgenciesSection.jsx` (351) | name + platform + logo + contacts + access creds + notes; REST через `api/admin/agencies` |
| Мульти-агентства | `src/pages/AdminAgenciesPage.jsx` (89) | `list_all_agencies` RPC + admin assignments через `AgencyTable` |
| Клиенты | `src/sections/ClientsSection.jsx` (14) | **Пустой stub «Раздел в разработке»** |
| Операторы | `src/sections/OperatorsSection.jsx` (14) | **Пустой stub «Раздел в разработке»** |

Только `AdminPanel.jsx` зовёт `api/admin/create-user|list-users|update-permissions|update-password|deactivate-user`. `api/admin/upload-logo` зовут `PlatformsSection` и `AgenciesSection`. `api/admin/agencies` зовёт только `AgenciesSection`. `api/admin/platforms` — `PlatformsSection` и (для списка) `AgenciesSection`.

Memory references:
- `project_legacy_admin_panel.md` — sunset queued
- `project_admin_agencies_pages.md` — agencies merge planned
- `project_create_staff_auth_gap.md` — `create_staff` RPC не создаёт `auth.users`; workaround сейчас выполняется через Supabase Dashboard, не через UI; `api/admin/create-user.js` в реальном коде никем не зовётся
- `project_auth_security_gap.md` — Stage 16 (drop `password_hash`) pending; этот план снимает последних UI-консьюмеров `password_hash`

## Goals

1. Привести `/admin` к каноническому виду «Настройки superadmin'а» — только разделы с уникальной функциональностью.
2. Завершить sunset legacy auth-стека (`AdminPanel.jsx` + 5 REST endpoints) — это разблокирует auth Stage 16.
3. Свести два экрана управления агентствами в один RPC-base экран с полным набором полей (branding + contacts + admin assignments).
4. UI label «Настройки» — единый в user menu и sidebar header.

## Non-goals

- Drop `password_hash` колонки (Stage 16, отдельный план).
- Перенос `/admin/platforms` на RPC — раздел уникальный, REST работает.
- Reconciliation таблицы `operators` — не относится к `/admin`.
- Расширение прав доступа — `/admin` остаётся superadmin-only.
- Mobile-адаптация нового drawer'а — следует общему mobile roadmap (`project_mobile_status.md`).

## Architecture

### Routes after refactor

```
/admin             → <Navigate to="/admin/platforms" replace />
/admin/platforms   → PlatformsSection (без изменений)
/admin/agencies    → AdminAgenciesPage (расширенный, master-detail)
```

Sidebar навигация — 2 пункта: «Платформы», «Агентства». Header `<h1>` — «Настройки».

### Component layout

```
src/AdminLayout.jsx                          — навигация + routes (упрощён)
src/sections/PlatformsSection.jsx            — без изменений
src/pages/AdminAgenciesPage.jsx              — list (orchestrator) + drawer state
src/components/agencies/
  ├ AgencyTable.jsx                          — существует, минорные правки (открытие detail вместо row actions)
  ├ AgencyCreateModal.jsx                    — существует, без изменений
  ├ AgencyDetailPanel.jsx                    — НОВЫЙ: master-detail drawer
  ├ AgencyBrandingFields.jsx                 — НОВЫЙ: logo + access + notes
  ├ AgencyContactsFields.jsx                 — НОВЫЙ: array editor для contacts (extracted из AgenciesSection.ContactFields)
  └ AgencyAdminAssignments.jsx               — НОВЫЙ: assign/detach admins (logic переносится из AgencyTable)
```

Каждый sub-component внутри drawer'а — отдельный файл с одной ответственностью; `AgencyDetailPanel` — orchestrator, который дёргает RPC.

### Data flow

```
AdminAgenciesPage
  ├ list: rpc('list_all_agencies') → agencies[] (counters + name + platform + is_active)
  └ on row click → setSelectedId(id) → open <AgencyDetailPanel>
      ├ load: rpc('get_agency_full', { p_id }) → { name, logo_url, contacts, access_login, access_password, notes, admins[] }
      ├ save branding: rpc('update_agency_branding', { p_id, p_logo_url, p_access_login, p_access_password, p_notes })
      ├ save contacts: rpc('set_agency_contacts', { p_id, p_contacts })  -- jsonb array, full overwrite
      └ admin assignments: rpc('attach_agency_admin' / 'detach_agency_admin')
```

После любого save в drawer'е — reload detail. Reload list — только если изменились видимые в list поля (`name`, counters); branding/contacts list не показывает.

### Logo upload

Остаётся `api/admin/upload-logo.js` (используется в `PlatformsSection` и в новом `AgencyBrandingFields`). Это единственный admin-REST endpoint, который остаётся после refactor'а.

## Stages

### Stage 1 ✅ DONE (commit `610fd0f`)

Settings entry в user menu для superadmin'а.

### Stage 2 — Sunset «Менеджеры»

**Pre-flight:** `grep -r "api/admin/\(create-user\|list-users\|update-permissions\|update-password\|deactivate-user\)" .` по всему репо. Если найдётся неожиданный call-site — приостановить, обсудить.

**Изменения:**
- Удалить `src/AdminPanel.jsx`.
- В `src/AdminLayout.jsx`: удалить импорт `AdminPanel`, секцию `users` в `SECTIONS[]`, `<Route index>`. Заменить index-route на `<Navigate to="platforms" replace />`.
- Удалить файлы:
  - `api/admin/create-user.js`
  - `api/admin/list-users.js`
  - `api/admin/update-permissions.js`
  - `api/admin/update-password.js`
  - `api/admin/deactivate-user.js`
- Обновить memory `project_create_staff_auth_gap.md` — удалить упоминание «`api/admin/create-user.js` (legacy) технически ещё нужен», переписать как исторический контекст.

**Verification:** залогиниться superadmin → /admin → раздел «Менеджеры» отсутствует; `/staff` полностью покрывает создание/редактирование пользователей. Залогиниться обычным admin'ом → `/admin` недоступен.

### Stage 3 — Удалить stub-разделы «Клиенты» / «Операторы»

**Изменения:**
- Удалить `src/sections/ClientsSection.jsx`, `src/sections/OperatorsSection.jsx`.
- В `src/AdminLayout.jsx`: убрать импорты, секции `clients` / `operators` из `SECTIONS[]`, соответствующие `<Route>`.
- Добавить внутри `AdminLayout` `<Routes>` явный fallback `<Route path="*" element={<Navigate to="/admin/platforms" replace />} />` — иначе stale URL `/admin/clients` отрендерит пустую main area (внешний `App.jsx` catch-all не сработает, потому что `/admin/*` уже совпал с верхним route'ом).

**Verification:** /admin → нет «Клиенты»/«Операторы» в sidebar; прямая навигация `/admin/clients` → redirect на `/admin/platforms`.

### Stage 4 — Merge agencies

**Migration (Supabase Studio SQL):**
- Проверить колонки в `public.agencies`: `logo_url text`, `contacts jsonb`, `access_login text`, `access_password text`, `notes text`. Если каких-то нет — `ALTER TABLE public.agencies ADD COLUMN IF NOT EXISTS ...`.
- Migration пишется как inline SQL (см. memory `feedback_inline_sql.md`).

**RPC (новые):**
- `get_agency_full(p_id uuid) returns table(...)` — возвращает полную запись + `admins[]` (jsonb array из `dashboard_users` через `admin_agencies`). Superadmin-only.
- `update_agency_branding(p_id uuid, p_logo_url text, p_access_login text, p_access_password text, p_notes text) returns void` — superadmin-only.
- `set_agency_contacts(p_id uuid, p_contacts jsonb) returns void` — superadmin-only, полная перезапись массива.
- Каждый RPC начинается с `if not is_superadmin() then raise exception 'permission denied' end if;` — паттерн из existing admin RPC.

**Existing RPC** (без изменений, проверить наличие):
- `list_all_agencies` — list с counters
- `attach_agency_admin`, `detach_agency_admin` — admin assignments
- `create_agency` — для `AgencyCreateModal`

**UI:**
- Расширить `src/pages/AdminAgenciesPage.jsx`: state для `selectedId`, drawer открывается по row click через `AgencyTable` callback.
- `AgencyTable.jsx` — заменить per-row кнопки edit/delete (если есть) на единый row-click handler, прокидывающий `id` наверх. Оставить inline отображение counters / status.
- `AgencyDetailPanel.jsx` — drawer справа, fixed width ~480–560px (на узких screens full-width modal позже, mobile вне scope).
  - Внутри: `<AgencyBrandingFields>`, `<AgencyContactsFields>`, `<AgencyAdminAssignments>`.
  - Каждая секция — независимый save (отдельные кнопки «Сохранить» в каждом блоке) ИЛИ единая кнопка save внизу drawer'а, которая батчит RPC-вызовы. → **Решение:** отдельные кнопки save в каждом блоке (proстее, прозрачнее, меньше частичных fail сценариев).
- `AgencyContactsFields.jsx` — extract из `AgenciesSection.ContactFields` (без изменений в логике).
- `AgencyBrandingFields.jsx` — logo upload через `api/admin/upload-logo`, password show/hide toggle (как в legacy), inline save.
- `AgencyAdminAssignments.jsx` — переносится existing logic из `AgencyTable` (вероятно из row actions / nested popover) в полноценный list внутри drawer'а: список текущих админов + поиск/выбор для добавления.

**Удалить:**
- `src/sections/AgenciesSection.jsx`.
- `api/admin/agencies.js`.
- В `AdminLayout.jsx`: убрать секцию `multi-agency`, оставить только `agencies` → роут на `<AdminAgenciesPage />`.

**Verification:**
- `/admin/agencies` → таблица из `list_all_agencies`.
- Создать агентство → видно в списке.
- Клик по строке → drawer открывается; данные из `get_agency_full`.
- Branding save → `update_agency_branding` → перезагрузка drawer'а, поля сохранены.
- Contacts save → `set_agency_contacts` → массив сохранён.
- Logo upload работает; access_password показывается/скрывается.
- Assign admin → `attach_agency_admin`; detach → `detach_agency_admin`.
- Прямая навигация `/admin/multi-agency` → redirect на `/admin/platforms` (через fallback из Stage 3).
- Permission test (Supabase SQL Editor): `select update_agency_branding(...)` от non-superadmin → permission denied.

### Stage 5 — UI rename

**Изменения:**
- `src/AdminLayout.jsx`: header «Аккаунт» → «Настройки» (line 99 в текущем коде).
- Каждый раздел — корректный page-level `<h1>` (PlatformsSection и AdminAgenciesPage — оставить как есть, заголовки на месте).

### Stage 6 (вне scope)

Drop `password_hash` column = auth Stage 16 (отдельный план / спек, существующий `2026-04-28-auth-security-migration-design.md`). Этот рефактор разблокирует Stage 16.

## Error handling & edge cases

- Каждый RPC-вызов в `AgencyDetailPanel` — try/setError + inline error display + кнопки save disabled пока `submitting` (паттерн из текущего `AdminAgenciesPage`).
- `get_agency_full` 404 (агентство удалено в другой вкладке) → drawer показывает «Агентство не найдено», кнопка «Закрыть»; list reload снимет stale row.
- Concurrent edits — last-write-wins, без оптимистичных locks (superadmin-only, один пользователь).
- Logo upload failure → toast/inline error в Branding section; `logo_url` не меняется до успешного upload + save.
- Removing AdminPanel-endpoints: pre-flight grep обязателен. Удаление файла на Vercel = endpoint исчезает; внешние HTTP-запросы получат 404. Это намеренно.
- Migration `ADD COLUMN IF NOT EXISTS` — additive, rollback не нужен.
- `agencies.contacts` в legacy уже jsonb массив — читать как есть; `set_agency_contacts` перезаписывает целиком.

## Testing

**Manual smoke** — после каждого Stage по golden path (см. Verification в каждом stage).

**Existing test suites:**
- `src/components/staff/CreateStaffSlideOut.test.jsx` — должен продолжать проходить (Stage 2 не трогает `/staff`).
- Если есть тесты на `AgenciesSection.jsx` — удалить вместе с компонентом (компонент исчезает в Stage 4).

**RPC permission tests** — inline SQL в Supabase Studio:
```sql
-- ожидание: permission denied для non-superadmin
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"<non-superadmin uuid>"}', true);
select update_agency_branding('<id>', null, null, null, null);
```

**Verification before completion** (skill `verification-before-completion`): перед merge каждого Stage — `pnpm dev`, golden path в браузере, `pnpm test`, `pnpm build`.

## Risks & open items

| Risk | Mitigation |
|---|---|
| `api/admin/create-user.js` зовётся вне-UI скриптом | Pre-flight grep + git log; если есть подозрение — вернуть 410 Gone вместо удаления, удалить позже |
| Колонки в `agencies` отличаются от ожидаемого | Миграция `ADD COLUMN IF NOT EXISTS`; single-environment (см. memory) → проверять на текущей prod-копии |
| Drawer UX в узких ширинах | Drawer right ~480–560px; на узких screens — full-width modal; mobile — отдельный план |
| `AgencyTable` в текущем коде может уже иметь свои row actions | Перед Stage 4 — прочитать `AgencyTable.jsx` и решить: удалить inline actions или оставить сосуществовать |

## Stage ordering rationale

Stages 2–5 идут до auth Stage 16. Этот план снимает последних UI-консьюмеров `password_hash` (через `update-password.js`) и legacy ролевой модели (`role IN ('superadmin','admin','user')` + `permissions` JSON) — после чего Stage 16 становится тривиальным dropom колонки.

Memory `project_next_up_plan.md` сейчас фиксирует «после auth security» — но эта последовательность естественнее обратная: убираем потребителей колонки → дропаем колонку. Memory обновим вместе с реализацией Stage 1 этого плана (уже DONE, commit `610fd0f`).
