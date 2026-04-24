# CRM Подплан 2 — «Сотрудники» (Staff Management)

**Дата:** 2026-04-24
**Проект:** operator-dashboard
**Этап:** 1 (CRM-ядро), Подплан 2
**Предыдущий подплан:** [Foundation](./2026-04-23-crm-system-design.md)

---

## 1. Контекст и цель

Подплан 1 (Foundation) подготовил БД и auth: таблицы `user_permissions`, `user_attributes`, RPC-функции, новые роли и реф-коды. `AdminPanel.jsx` оставлен без изменений и пишет в легаси jsonb — это тех-долг, который нужно закрыть, иначе новые сотрудники не получают корректных прав.

**Цель Подплана 2:** заменить `AdminPanel.jsx` полноценным разделом «Сотрудники» с отдельными страницами, нормальной навигацией, мобильной адаптацией и корректной записью в новые таблицы. Закрыть workflow удаления сотрудника с подтверждением Супер-Админа.

---

## 2. Скоуп

### 2.1 В Подплане 2
- `/staff` — список сотрудников с фильтрами по ролям, поиском
- `/staff/new` — форма создания с preview автогенерируемого реф-кода
- `/staff/:refCode` — страница сотрудника (4 таба, редактирование)
- Редактирование профиля (имя, фамилия, псевдоним, email)
- Редактирование атрибутов (смена, panel_id, и т.д. — гибко)
- Редактирование прав (чек-боксы, синхронизированы с `user_permissions`)
- Смена пароля
- Workflow удаления: Супер-Админ — напрямую, Админ — через запрос с подтверждением СА
- `/notifications` — раздел для Супер-Админа со списком запросов на удаление
- Бейдж в сайдбаре с количеством pending-запросов для СА
- Mobile-first responsive

### 2.2 Вне скоупа (передаём дальше)
- Управление составом команд (Подплан 5: `teams`, `team_members`, `moderator_operators`)
- Задачи и их пулы (Подплан 3)
- Реальная история активности (stub-таб на будущее)
- Загрузка аватара (placeholder кнопка без реализации)
- Контактные поля — телефон, Telegram — (поля появятся в Подплане 2 как задел в UI, но миграция колонок и RPC — в отдельной небольшой миграции, возможно в этом подплане)
- Чат (Этап 3)

---

## 3. Маршруты

| Маршрут | Экран | Кто видит |
|---|---|---|
| `/staff` | Список сотрудников | Все с `view_all_tasks` или выше (по факту — админы и СА) |
| `/staff/new` | Форма создания | Владельцы права `create_users` |
| `/staff/:refCode` | Страница сотрудника | Админы и СА; сотрудник может видеть свою (будущее) |
| `/staff/:refCode/profile` | Таб «Профиль» (дефолтный) | то же |
| `/staff/:refCode/attributes` | Таб «Атрибуты» | то же |
| `/staff/:refCode/permissions` | Таб «Права» | владельцы `manage_roles` |
| `/staff/:refCode/activity` | Таб «Активность» (stub) | то же |
| `/notifications` | Очередь approvals | СА (фильтр по роли внутри) |

`refCode` используется в URL вместо числового `id` — shareable и читаемый.

---

## 4. UI / UX

### 4.1 Список `/staff`

**Desktop (≥1024px):**
- Topbar с поиском, чипами-фильтрами (Все · Админы · Модераторы · ТЛ · Операторы) и кнопкой «+ Добавить»
- Таблица с колонками: Сотрудник (аватар + ФИО) · Реф-код · Роль · Атрибуты · Статус
- Клик по строке → `/staff/:refCode`
- Сортировка по колонкам (клик на заголовок)

**Mobile (<640px):**
- Поиск + кнопка «+» на одной строке
- Чипы-фильтры на отдельной строке
- Карточки вместо таблицы: аватар + имя + роль-бейдж + реф-код + ключевой атрибут + статус-точка
- Клик по карточке → `/staff/:refCode`

### 4.2 Создание `/staff/new`

Одношаговая форма:
- Имя, Фамилия (обязательные)
- Псевдоним (опционально)
- Email (обязательный)
- Пароль (обязательный)
- Роль (select: admin/moderator/teamlead/operator — superadmin не через UI)
- **Preview реф-кода** — обновляется live при вводе имени/фамилии/выборе роли. Формат: `MOD-ИванП-###` где `###` заменяется на «будет назначено после сохранения»
- Чек-боксы дефолтных прав (предвыбранные по роли из `src/lib/defaultPermissions.js`)
- Кнопки: Отмена · Создать

После успешного создания → редирект на `/staff/:refCode` нового сотрудника.

### 4.3 Страница сотрудника `/staff/:refCode`

**Hero:**
- Аватар (placeholder с инициалами + кнопка upload, без реализации)
- ФИО + бейдж роли + статус-пилл
- Реф-код (моноширинный, скопировать по клику)
- Email, дата создания
- Действия: «Сменить пароль», «Запросить удаление» (для Админов) или «Деактивировать» (для СА)

**Табы** (URL-based, deep-linkable):
- **Профиль** — форма редактирования: имя, фамилия, псевдоним, email; реф-код и роль — read-only (🔒)
- **Атрибуты** — редактирование key/value; для моды́в — select для `shift` (ДЕНЬ/ВЕЧЕР/НОЧЬ), инпут для `panel_id`; для ТЛ — `team_id` (read-only в этом подплане); на будущее — произвольные key/value
- **Права** — чек-боксы всех permissions с группировкой по категориям (CRM-действия / Просмотр данных / Администрирование); редактирует только владелец `manage_roles`
- **Активность** — stub: «Здесь появится история действий сотрудника»

Grid layout — 2 колонки на desktop, 1 на mobile.

### 4.4 Удаление — модалки

**DeleteRequestModal (для Админа):**
- Заголовок: «Запросить удаление: <имя>»
- Textarea: «Причина удаления» (обязательно, мин. 20 символов)
- Предупреждение: «Запрос уйдёт на подтверждение Супер-Админу. До подтверждения сотрудник остаётся активным.»
- Кнопки: Отмена · Отправить запрос

**ApprovalReviewModal (для СА, из /notifications):**
- Заголовок: «Запрос на удаление: <имя>»
- Информация: кто запросил, когда, причина
- Textarea: «Комментарий» (опционально)
- Кнопки: Отклонить · Подтвердить и деактивировать

### 4.5 `/notifications`

Список запросов со статусом `pending`:
- Каждая строка: ФИО удаляемого, кто запросил, когда, кнопка «Рассмотреть» → ApprovalReviewModal
- Фильтр-таб внизу: Ожидают / Одобренные / Отклонённые (опционально)
- Если нет pending — пустое состояние: «Нет запросов на рассмотрение»

Badge в сайдбаре: количество pending-запросов (обновление через Supabase real-time — или polling каждые 30 сек; на выбор реализации).

---

## 5. Backend

### 5.1 Новая таблица `deletion_requests` (миграция 09)

```sql
CREATE TABLE deletion_requests (
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

CREATE INDEX idx_deletion_requests_status
  ON deletion_requests(status) WHERE status = 'pending';

ALTER TABLE deletion_requests ENABLE ROW LEVEL SECURITY;
```

### 5.2 Опциональная миграция контактных полей (09a)

Добавить в `dashboard_users`: `phone text`, `telegram text`, `notes text` (все nullable). Задел под будущие поля UI.

### 5.3 Новые RPC (миграция 10)

- `create_staff(p_caller_id int, p_email text, p_password text, p_role text, p_first_name text, p_last_name text, p_alias text, p_permissions text[]) → integer`
  — создаёт запись в `dashboard_users`, генерирует `ref_code`, вставляет переданные permissions в `user_permissions`, возвращает новый `id`. Требует `create_users`.
- `update_staff_profile(p_caller_id int, p_user_id int, p_first_name text, p_last_name text, p_alias text, p_email text) → void`
  — обновляет профиль. Требует `create_users` или self.
- `list_staff(p_caller_id int) → setof record`
  — возвращает список с pre-joined `permissions text[]` и `attributes jsonb` + статусом pending-deletion-request (если есть). Проверяет права на чтение.
- `get_staff_detail(p_caller_id int, p_user_id int) → record`
  — одиночная запись + permissions + attributes.
- `request_deletion(p_caller_id int, p_target_user int, p_reason text) → integer`
  — создаёт pending-request. Требует `create_users`. Возвращает `id` запроса.
- `approve_deletion(p_caller_id int, p_request_id int, p_note text) → void`
  — только для СА: меняет статус на `approved`, деактивирует `target_user`.
- `reject_deletion(p_caller_id int, p_request_id int, p_note text) → void`
  — только для СА: меняет статус на `rejected`, пользователь остаётся активным.
- `list_deletion_requests(p_caller_id int, p_status text default 'pending') → setof record`
  — только для СА.
- `deactivate_staff(p_caller_id int, p_user_id int) → void`
  — прямая деактивация для СА (или self-deactivation).
- `change_staff_password(p_caller_id int, p_user_id int, p_new_password text) → void`
  — через `crypt(p_new_password, gen_salt('bf'))`. Самому себе — можно без прав; другим — требует `create_users`.

### 5.4 Авто-генерация `ref_code` в `create_staff`

Логика в PL/pgSQL, повторяет `src/lib/refCode.js`:
1. Определить префикс по роли (SA/ADM/MOD/TL/OP)
2. Взять следующий порядковый номер для этой роли: `MAX(ref_code_num) + 1`, где `ref_code_num` парсится из существующих реф-кодов
3. Капитализация: `UPPER(LEFT(first_name,1)) || LOWER(SUBSTRING(first_name,2))`
4. Первая буква фамилии: `UPPER(LEFT(last_name,1))`
5. Формат: `<PREFIX>-<First><L>-<NNN>`

Если номер > 999 — RAISE EXCEPTION (на практике не достижимо).

### 5.5 Удаляемые legacy-эндпоинты

`api/admin/create-user.js`, `update-password.js`, `update-permissions.js`, `deactivate-user.js`, `list-users.js` — удаляются, фронт переходит на прямые `supabase.rpc` вызовы.

---

## 6. Frontend

### 6.1 Новые файлы

```
src/pages/
  StaffListPage.jsx
  StaffDetailPage.jsx
  StaffCreatePage.jsx
  NotificationsPage.jsx

src/components/staff/
  StaffTable.jsx           — desktop таблица с сортировкой
  StaffCardList.jsx        — mobile карточки
  StaffFilterChips.jsx     — чипы по ролям + счётчики
  RefCodePreview.jsx       — живой preview реф-кода в форме
  ProfileTab.jsx
  AttributesTab.jsx
  PermissionsTab.jsx
  ActivityTab.jsx          — stub
  DeleteRequestModal.jsx
  ApprovalReviewModal.jsx
  ChangePasswordModal.jsx
  StaffPageShell.jsx       — общий каркас (breadcrumb + hero + tabs)

src/components/ui/
  (устанавливаем из shadcn CLI: tabs, dialog, sheet, table, badge,
   avatar, input, label, select, checkbox, dropdown-menu)

src/hooks/
  useStaffList.js
  useStaff.js              — один сотрудник
  useDeletionRequests.js
  usePendingDeletionCount.js — для сайдбар-бейджа

src/lib/
  defaultPermissions.js    — { role → string[] permissions }
  permissionGroups.js      — категории для UI (CRM / Просмотр / Администрирование)

Тесты:
  src/lib/defaultPermissions.test.js
  src/lib/permissionGroups.test.js
  src/components/staff/RefCodePreview.test.jsx
  src/components/staff/StaffFilterChips.test.jsx
  src/components/staff/PermissionsTab.test.jsx
  src/components/staff/DeleteRequestModal.test.jsx
  src/hooks/useStaffList.test.js (моки supabase.rpc)
```

### 6.2 Удаляемые файлы

```
src/AdminPanel.jsx
src/AdminLayout.jsx
src/sections/AgenciesSection.jsx
src/sections/ClientsSection.jsx
src/sections/ManagersSection.jsx
src/sections/PlatformsSection.jsx
api/admin/_supabase.js
api/admin/create-user.js
api/admin/deactivate-user.js
api/admin/list-users.js
api/admin/update-password.js
api/admin/update-permissions.js
```

### 6.3 Изменяемые файлы

- `src/App.jsx` — роутинг: добавить `react-router-dom` (если ещё нет) или простой conditional-render по `window.location.pathname`. Удалить импорты `AdminPanel`/`AdminLayout`. Навигация по сайдбару через `<a href>` + client-side navigation.
- `src/Sidebar` (новый компонент либо часть App.jsx) — пункты: Дашборд, Сотрудники, Оповещения (с бейджем), Выход.
- `src/useAuth.jsx` — без изменений (Подплан 1 уже всё подготовил).

### 6.4 Роутинг

Устанавливаем `react-router-dom@^7` (легковесно, добавит ~13kB). Альтернатива — свой маленький роутер на `window.location.pathname` и `history.pushState`. Рекомендация: **react-router-dom** — стандартно, понятно, deep-links из коробки.

### 6.5 Темы (светлая / тёмная)

В проекте уже настроен механизм тем (Tailwind `dark:` варианты + toggle в header — см. существующий `App.jsx`). Все новые компоненты обязаны поддерживать обе темы:

- Все цвета фонов, текста, границ — через токены `bg-white dark:bg-slate-800`, `text-slate-800 dark:text-slate-200`, `border-slate-200 dark:border-slate-700` и т.д.
- Бейджи ролей — светлая и тёмная версия (например `bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300`)
- Модальные окна / sheets — фон и оверлей адаптированы под обе темы
- Статус-дот (активен/неактивен) — цвет не меняется, но нужен достаточный контраст в обеих темах
- Аватары — placeholder с инициалами: светлый фон + тёмный текст (light), тёмный фон + светлый текст (dark)

Не используем хардкод цветов в стиле `#ffffff`. Только Tailwind-токены. Smoke-тест: переключить тему и убедиться что ни один фон/текст не «прыгнул».

### 6.6 shadcnblocks референсы

- **Список** — паттерн из [`dashboard18`](https://www.shadcnblocks.com/preview/dashboard18): sortable table + quick actions header
- **Страница сотрудника** — паттерн из [`application-shell7`](https://www.shadcnblocks.com/preview/application-shell7): breadcrumb + tabs + sheet на мобайле
- **Форма создания** — стандартные shadcn/ui Input + Label + Button без отдельного блока

---

## 7. Валидация прав

| Действие | Требуемое право |
|---|---|
| Видеть список `/staff` | `create_users` OR `manage_roles` (практически — админы и СА) |
| Видеть страницу сотрудника | то же |
| Создавать сотрудника | `create_users` |
| Редактировать профиль другого | `create_users` |
| Редактировать свой профиль | self |
| Редактировать атрибуты | `create_users` |
| Редактировать права | `manage_roles` |
| Запросить удаление | `create_users` |
| Одобрить/отклонить запрос | суперадмин |
| Прямая деактивация | суперадмин OR self-deactivation (будущее) |

Валидация — на клиенте (UI-гейты через `<PermissionGate>`) И на сервере (в RPC функциях).

---

## 8. Обратная совместимость

- Старая jsonb-колонка `dashboard_users.permissions` **оставляется в БД** как backup (можно удалить в отдельной миграции после Подплана 2 стабилизации).
- `create_staff` дополнительно синхронизирует jsonb (для случая, если какой-то legacy код ещё читает его) — опционально, на усмотрение реализации. По умолчанию — не синхронизируем, разрыв с legacy мы уже прошли в Подплане 1.
- `auth_login` не меняется (уже правильно возвращает permissions_names массивом).

---

## 9. Тестирование

**Unit (Vitest):**
- `defaultPermissions(role)` — возвращает корректный набор для каждой роли
- `permissionGroups` — структура категорий полная
- `RefCodePreview` — live-обновление при изменении имени/фамилии/роли
- `StaffFilterChips` — переключение активного чипа, счётчики
- `PermissionsTab` — чек-боксы, dispatch onChange
- `DeleteRequestModal` — валидация длины причины, submit

**Integration (в рамках Подплана 2 — без E2E, просто RPC-моки):**
- `useStaffList` — корректно фильтрует и сортирует ответ
- `useDeletionRequests` — обновляется после approve/reject

**Manual smoke-test (преview URL):**
1. Логин как СА → видит «Сотрудники», «Оповещения»
2. Создание нового модератора — реф-код сгенерирован, появляется в списке, имеет default permissions
3. Редактирование профиля (имя) — сохраняется
4. Редактирование атрибутов (shift=ДЕНЬ) — сохраняется
5. Редактирование прав (снять create_tasks) — сохраняется
6. Смена пароля — новый пароль работает
7. Запрос удаления от имени админа → появляется в /notifications для СА
8. Одобрение запроса → сотрудник деактивирован
9. Mobile: открыть на телефоне, проверить карточки, sheet, форму
10. Переключение темы (светлая ↔ тёмная) — все экраны раздела выглядят корректно, нет хардкод-цветов, читаемые контрасты

---

## 10. План миграции (пошаговый, на уровне спека)

1. Миграция 09 — `deletion_requests` таблица
2. Миграция 09a (опционально) — `phone/telegram/notes` колонки в `dashboard_users`
3. Миграция 10 — новые RPC функции
4. Установка shadcn/ui компонентов + react-router-dom
5. Роутинг в App.jsx
6. StaffList + useStaffList
7. StaffCreate + RefCodePreview + defaultPermissions
8. StaffDetail shell + 4 таба по порядку
9. Password change + Delete request flow
10. NotificationsPage + usePendingDeletionCount + badge
11. Удаление старого AdminPanel + sections + api/admin/*
12. Smoke-test на preview

Детализация шагов — в отдельном implementation plan (writing-plans).

---

## 11. Критерии приёмки

- Все smoke-пункты из §9 проходят зелёным
- `npm run test:run` — все тесты зелёные
- `npm run build` — проходит без ошибок
- На preview URL открывается `/staff`, работает полный CRUD
- Mobile (~375px viewport) — таблица превращается в карточки, модалки в sheet
- `/notifications` доступен только Супер-Админу (не админу)
- Бейдж в сайдбаре отображает количество pending

---

## 12. Риски и открытые вопросы

- **Real-time обновление бейджа** — выбрать между Supabase subscriptions и простым polling. Решать на этапе реализации.
- **react-router-dom vs минимальный роутер** — рекомендация стандартная, но если хотим минимализма, можем свой.
- **Группировка прав в UI** — конкретные категории (CRM / Просмотр / Администрирование) могут меняться — это не blocker, решим в `permissionGroups.js`.
- **Phone / Telegram поля** — добавлять сейчас или в отдельном апдейте? Рекомендация: добавить сейчас, в UI положить плейсхолдерами «не заполнено». Миграция 09a опциональна но безболезненна.
