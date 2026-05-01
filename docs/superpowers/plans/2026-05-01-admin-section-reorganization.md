# Admin Section Reorganization — Plan Stub

**Date:** 2026-05-01
**Status:** Stub — needs brainstorm before execution
**Trigger:** After multi-agency scoping (PR #61) /admin section стал явно перегруженным: дубли с /staff /clients, два экрана для агентств, операторы в отдельной таблице. Пользователь предложил привести в порядок.

## Context

Текущие разделы `/admin`:

| Раздел | Файл | Статус |
|---|---|---|
| Менеджеры | `AdminPanel.jsx` | дубль `/staff` |
| Платформы | `PlatformsSection.jsx` | уникальный |
| Агентства (legacy) | `AgenciesSection.jsx` | name + logos + contacts (через `api/admin/agencies`) |
| Multi-agency | `AdminAgenciesPage.jsx` | list_all_agencies + admin assignments (через RPC) |
| Клиенты | `ClientsSection.jsx` | дубль `/clients` |
| Операторы | `OperatorsSection.jsx` | таблица `operators` для revenue analytics — НЕ дубль /staff |

Memory references:
- `project_legacy_admin_panel.md`: sunset queued после auth-миграции
- `project_admin_agencies_pages.md`: `/admin/agencies` vs `/admin/multi-agency` — слить позже
- `project_create_staff_auth_gap.md`: `create_staff` не создаёт `auth.users`; до фикса этого `api/admin/create-user.js` (legacy) технически ещё нужен

## Goal

1. `/admin` доступен только superadmin'у через user menu (Settings) — **уже сделано в Stage 1**, см. commit `610fd0f`
2. Убрать дубли (Менеджеры, Клиенты) — функционал переехал в `/staff` `/clients` через RPC
3. Слить «Агентства» (legacy) и «Multi-agency» в один раздел — single source of truth для name + platform + logos + contacts + admin assignments
4. Решить судьбу «Операторы» (refcode/name/shift для revenue): связать с `dashboard_users.ref_code` или формально deprecated с UI для editing-only metadata
5. `/admin` переименовать в «Настройки» концептуально (URL может остаться `/admin`)

## Non-goals

- Полная переписка `api/admin/*` — оставляем до auth Stage 16
- Перенос Платформ — этот раздел уникальный и работает
- Изменение модели revenue/hourly_revenue — отдельный план

## Stages (high-level — детали в полном плане)

**Stage 1 — Settings entry in user menu** ✅ DONE (commit `610fd0f`)
- `<DropdownMenuItem>` «Настройки» в `UserMenuDropdown` для superadmin'а → `/admin`

**Stage 2 — Remove duplicate sections (Менеджеры, Клиенты)**
- Pre-flight: grep по проекту что компоненты больше нигде не используются
- Удалить routes из `AdminLayout.jsx`
- Удалить компоненты `AdminPanel.jsx`, `ClientsSection.jsx`
- Удалить unused `api/admin/*` endpoints (только если никто больше их не зовёт):
  - `api/admin/list-users.js`, `create-user.js` — могут быть нужны до auth Stage 16 (см. `project_create_staff_auth_gap.md`); проверить call-sites
  - `api/admin/update-permissions.js`, `update-password.js`, `deactivate-user.js` — заменены на RPC, проверить
- Tests: убедиться что `/staff` `/clients` UI покрывает все сценарии что были на /admin

**Stage 3 — Merge agencies (legacy + multi-agency)**
- Решить: какой экран базовый — `AdminAgenciesPage.jsx` (RPC, новый) или `AgenciesSection.jsx` (REST, legacy с logos/contacts)
- Расширить выбранный экран: добавить отсутствующие поля (logo upload + contacts управление)
- API path: либо перенести logos/contacts в RPC layer (новые `update_agency_branding`, `set_agency_contacts`), либо оставить hybrid (RPC для assignments + REST для logos)
- Удалить второй экран и связанные ссылки
- Migration: убедиться что `agencies` table содержит все нужные columns (logo_url, contact_*)

**Stage 4 — Operators table reconciliation**
- Brainstorm: оставить отдельной таблицей или объединить с `dashboard_users`?
- Если оставлять: добавить `agency_id` в `operators` для multi-agency scoping; UI остаётся в /admin/operators
- Если объединять: миграция refcode'ов из operators → dashboard_users, deprecation `operators` table; revenue.refcode → dashboard_users.ref_code FK
- Связь с `dashboard_hourly_revenue` migration 79 (orphaned refcodes)

## Open questions for brainstorm

1. **Auth Stage 16 timing** — до или параллельно с этим планом? Memory говорит «sunset legacy после auth», но Settings entry + удаление Менеджеры/Клиенты не зависят от auth.users миграции
2. **Operators reconciliation** — самый сложный вопрос; orphaned hourly_revenue.refcode'ы нельзя восстановить; исторические данные потеряются если миграция перепишет refcodes
3. **Agencies merge UX** — single-page table с inline edit или master-detail like /clients?
4. **Permissions** — кто кроме superadmin'а имеет доступ к `/admin/agencies` (создание агентства)? По текущей spec — только superadmin
5. **URL strategy** — оставить `/admin` или переименовать в `/settings`? Bookmarks, deep links

## Priority

Не блокирует ничего критичного. Делать после `auth Stage 16` (drop password_hash), либо параллельно (Settings entry + удаление Менеджеры/Клиенты — независимые).

Из общего roadmap (`project_next_up_plan.md`): после 6D → 6D2 Lightbox → 6C btn cleanup → desktop tweaks → mobile → auth security. /admin reorg вставляется **после auth security** или параллельно с ним.
