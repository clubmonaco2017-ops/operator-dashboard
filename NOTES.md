# Ключевые факты проекта: operator-dashboard

## Инфраструктура
- **GitHub**: репозиторий кода фронта
- **Vercel**: деплой фронта — `https://operator-dashboard-psi.vercel.app`
  - Env vars на Vercel: `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_SERVICE_KEY`
- **Supabase**: `https://akpddaqpggktefkdecrl.supabase.co` — данные + авторизация
- **Google Cloud** (`hourly-492015`): бэкенд-скрипт, пишет данные в Supabase каждый час

## Стек
- React + Vite + Tailwind CSS v4
- Supabase JS client (anon key для обычных запросов, service key для admin-операций)
- Кастомная авторизация через localStorage (не Supabase Auth)
  - Сессия хранится как `auth_session` в localStorage
  - Вход: `supabase.rpc('auth_login', {email, password})`

## Supabase клиенты
- **Обычный** (`src/supabaseClient.js`): anon key, для чтения данных
- **Admin** (`src/supabaseAdmin.js`): service key (lazy init через `getSupabaseAdmin()`), для управления пользователями

## Env vars (`.env.local`)
```
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_SUPABASE_SERVICE_KEY=sb_secret_...  # НЕ КОММИТИТЬ
```

## Авторизация
- Суперадмин управляет пользователями через `AdminPanel.jsx`
- Права: `can_view_revenue`, `can_view_chart`, `can_view_top`
- PostgreSQL функции с `SECURITY DEFINER`: `auth_login`, `auth_get_users`, `auth_create_user` и др.

## Таблицы Supabase (данные от бэкенда)
- `hourly_revenue` — почасовые дельты: PK `(refcode, date, hour)`, колонка `delta`
  - delta > 0 = оператор работал в этот час
  - Нет записи = прочерк (—) на дашборде
  - delta=0 не записывается
- `snapshot` — per-client кумулятив Tableau: PK `(refcode, client_id)`, колонки: `cumulative`, `updated_at`

## Важные особенности данных
- Данные поступают с задержкой ~1 час (Tableau обновляет Max Hour раз в час UTC)
- Выручка считается как дельта кумулятива между запусками, по парам (оператор, клиент)
- Шум округления < $0.10 отфильтрован на бэкенде
---

## CRM Foundation (Подплан 1) — готово 2026-04-23

### Основная таблица `dashboard_users` — расширена
Новые колонки: `ref_code` (`MOD-ИванП-001`, уникальный, не меняется), `first_name`, `last_name`, `alias` (псевдоним), `tableau_id` (source_id из Tableau, связка с операторами), `created_by` (integer FK). Колонка `permissions` (jsonb) сохранена для обратной совместимости — её читают старый фронт и существующий AdminPanel.

### Новые роли
Колонка `role` теперь CHECK-ограничена значениями: `superadmin | admin | moderator | teamlead | operator | user`. Старая роль `user` мигрирована в `operator` скриптом; `user` оставлен в CHECK временно (пока не удалим в следующих миграциях).

### Новые таблицы
- **`user_permissions`** `(user_id int → dashboard_users, permission text, granted_by int, granted_at timestamptz)` — PK (user_id, permission). RLS включён, доступ только через RPC.
- **`user_attributes`** `(user_id int → dashboard_users, key text, value text)` — PK (user_id, key). Для смен, panel_id и будущих атрибутов.

### Новые / изменённые RPC
- `has_permission(user_id int, permission text) → bool`
- `get_user_permissions(user_id int) → text[]`
- `grant_permission(caller_id, target, permission) → void` — требует `manage_roles`
- `revoke_permission(caller_id, target, permission) → void` — требует `manage_roles`
- `get_user_attributes(user_id int) → jsonb` (объект ключ-значение)
- `set_user_attribute(caller_id, user_id, key, value) → void` — требует `create_users` или self
- `delete_user_attribute(caller_id, user_id, key) → void` — требует `create_users`
- `auth_login(email, password) → TABLE(...)` — **обратно совместимо**: старые поля `user_id, user_email, user_role, user_permissions (jsonb), user_timezone` сохранены, добавлены `user_ref_code, user_first_name, user_last_name, user_alias, user_permission_names (text[]), user_attributes (jsonb), user_is_active`.

### Фронт
- **Тесты:** Vitest + @testing-library/react настроены. Команды: `npm run test`, `npm run test:run`, `npm run test:ui`.
- **Новые утилиты:**
  - `src/lib/refCode.js` — построение реф-кодов.
  - `src/lib/permissions.js` — `hasPermission`, `hasAnyPermission`, `hasAllPermissions`, `isSuperadmin`.
- **Новый компонент:** `src/components/PermissionGate.jsx` — `<PermissionGate user=... permission=... anyOf=... fallback=...>`.
- **`useAuth.jsx` расширен:** экспортирует `normalizeSession`. На init автоматически чистит localStorage с легаси-формой сессии (`permissions` как объект) — пользователь один раз перелогинится после мержа в main.
- **`App.jsx`:** перешёл на `hasPermission(user, 'view_all_revenue' | 'view_chart' | 'view_top')`.
- **`AdminPanel.jsx` не тронут** — продолжает работать с легаси `permissions` jsonb. Будет переписан в Подплане 2 (Сотрудники).

### Миграции
Все 8 миграций в `db/migrations/` применены к продовому Supabase (проект `akpddaqpggktefkdecrl`).

---

## CRM Subplan 2 — Staff Management — готово 2026-04-24

### Новый UI
- `/staff` — список сотрудников с фильтрами и поиском (desktop table / mobile cards)
- `/staff/new` — форма создания с живым preview реф-кода + default permissions
- `/staff/:refCode[/tab]` — страница сотрудника с 4 табами (Профиль / Атрибуты / Права / Активность)
- `/notifications` — очередь запросов на удаление (только для Супер-Админа)
- Sidebar с навигацией и бейджем pending-запросов

### Backend (миграции 09–11)
- Таблица `deletion_requests`, колонки `phone/telegram/notes` в `dashboard_users`
- RPC: `create_staff`, `update_staff_profile`, `list_staff`, `get_staff_detail`, `change_staff_password`, `request_deletion`, `approve_deletion`, `reject_deletion`, `list_deletion_requests`, `count_pending_deletions`, `deactivate_staff`, `_next_ref_code` (helper)

### Сосуществует с AdminPanel
- `AdminPanel.jsx`, `AdminLayout.jsx`, `sections/*` (Платформы, Агентства, Клиенты, Менеджеры, Операторы) **остаются** — живые CRUD для бизнес-данных.
- `api/admin/*` endpoints тоже живут (Platforms/Agencies/upload-logo, plus legacy create-user/update-password/list-users — эти legacy планируются к замене на RPC в следующем подплане).
- `/staff/*` — новый роут поверх RPC-слоя, параллелен `/admin/*`. Суперадмин видит обе кнопки в хедере дашборда; обычный админ с `create_users` — только «Сотрудники».
- Старая колонка `dashboard_users.permissions` (jsonb) остаётся как backup.

### Темы
Все новые компоненты работают в светлой и тёмной теме через Tailwind токены. Переключатель темы — существующий в `DashboardPage`.

### Тесты
Vitest: `defaultPermissions`, `permissionGroups`, `StaffFilterChips`, `RefCodePreview`, `PermissionsTab`, `DeleteRequestModal` + сохранившиеся от Subplan 1.
