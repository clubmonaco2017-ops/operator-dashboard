# Domain Model — operator-dashboard

Источник правды для бизнес-домена и архитектуры CRM. На эту модель опираются:
- Все последующие Subplan'ы (3 и далее)
- Техническое задание для Claude Design (Set up design system)
- RPC-функции и таблицы Supabase

Последнее обновление: **2026-04-24**.

---

## 1. Бизнес в двух абзацах

Компания управляет работой **операторов-переводчиков** (далее «операторы»), которые пишут сообщения подписчикам **моделей** (creator'ов) на внешних платформах (OnlyFans и подобные) от имени самих моделей. Модели — предмет работы, операторы — исполнители, а наша CRM нужна чтобы назначать операторов на моделей, распределять нагрузку по сменам и контролировать выполнение операционных задач.

Бизнес-иерархия снаружи: платформа (OF-like сайт) → агентство (агрегатор моделей на этой платформе) → модель (creator, с которой работаем). Внутри компании — суперадмин и админы, под ними тимлиды и модераторы-кураторы, под ними операторы. Каждая модель закреплена за командой из трёх операторов, которые сменяют друг друга посменно (день / вечер / ночь).

---

## 2. Словарь терминов

| Термин | Что это |
|---|---|
| **Платформа** (`platform`) | Внешний сервис (OF-like), на котором работают модели. Пример: «OnlyFans», «Fansly». CRUD уже реализован (legacy from main). |
| **Агентство** (`agency`) | Партнёр-агрегатор моделей на платформе. CRUD уже реализован. |
| **Клиент** = **Модель** (`client`) | Creator, от имени которого пишут операторы. Новая сущность, Subplan 3. |
| **Менеджер** | **Устаревший термин** — в прошлом так называли всех внутренних сотрудников. Сейчас это любой non-client пользователь CRM. В UI это слово не используем. |
| **Оператор** (`operator`) | Переводчик/чатер. Пишет сообщения от имени модели. |
| **Модератор** (`moderator`) | Контролирует операторов, создаёт для них задачи, принимает отчёты. Может также возглавлять свою команду. |
| **Тим Лидер** (`teamlead`) | Возглавляет команду из 3 операторов, управляет её составом, ставит задачи. |
| **Администратор** (`admin`) | Создаёт аккаунты, команды, задачи верхнего уровня, назначает моделей на команды, получает оповещения о просроченных задачах. |
| **Супер-админ** (`superadmin`) | Имеет все права. Единственный, кто может деактивировать аккаунты и апрувить запросы на удаление. |
| **Команда** (`team`) | 3 оператора + набор моделей, закреплённых за ними. Возглавляется тимлидом или модератором. |
| **Кураторство** (`moderator_operator`) | Связь «модератор ↔ оператор». Куратор создаёт задачи своим операторам и принимает отчёты. Параллельна принадлежности к команде. |
| **Задача** (`task`) | Поручение сверху вниз («+20% к балансу», «загрузить контент», «проверить переводы»). Имеет дедлайн, статус, автора, исполнителя. |
| **Отчёт** (`task_report`) | Подтверждение выполнения задачи: текст + медиа (скриншоты/записи). Идёт тому, кто задачу создал. |
| **Реф-код** (`ref_code`) | Человекочитаемый ID сотрудника вида `MOD-ИванП-001`, `TL-АннаМ-002`. Генерируется при создании. |

---

## 3. Роли и иерархия

```
Superadmin
    │
  Admin
    ├─→ Teamlead (ведёт команду) ───┐
    │        ↓                       │
    │     Operator (в этой команде) ─┤──→ работает с Clients команды
    │        ↑                       │
    └─→ Moderator (опционально ведёт свою команду, всегда является куратором операторов) ─┘

Каждый Operator ВСЕГДА имеет двух супервизоров одновременно:
  - TL своей команды
  - Modarator-куратор (отдельная связь)
```

### 3.1. Что делает каждая роль

**Суперадмин (superadmin)** — все права; апрувит запросы на удаление; деактивирует аккаунты.

**Админ (admin)**
- Создаёт аккаунты (`create_users`), реф-коды
- Создаёт и редактирует команды, назначает лидов (тимлидов или модераторов)
- Назначает операторов в команды
- Назначает моделей на команду (`assign_team_clients` — новое право)
- Создаёт CRUD клиентов (моделей) — право `manage_clients`
- Создаёт задачи для любого уровня (`create_tasks`, `view_all_tasks`)
- Получает оповещения о просроченных задачах своих назначений (`send_reminders`)
- Видит всю выручку (`view_all_revenue`)

**Тим Лидер (teamlead)**
- Управляет составом своей команды (`manage_teams`)
- Создаёт задачи для своих операторов (`create_tasks`)
- Видит задачи своей команды (`view_own_tasks`)
- Видит выручку команды (`view_team_revenue`)
- Принимает отчёты по своим задачам; он же отчитывается админу

**Модератор (moderator)**
- Куратор своих подчинённых операторов (назначает их админ, модератор управляет составом через `manage_teams`)
- Создаёт задачи своим операторам (`create_tasks`)
- Видит задачи своих операторов (`view_own_tasks`)
- Видит выручку своих подчинённых (`view_team_revenue`)
- Принимает отчёты по своим задачам; он же отчитывается админу
- Опционально: может одновременно быть лидом своей команды (та же `team`, просто `lead_user_id` = этот модератор)

**Оператор (operator)**
- Работает с моделями своей команды по расписанию смен
- Видит и выполняет задачи от своего ТЛ и от своего куратора-модератора (`view_own_tasks`)
- Загружает отчёты с медиа (скриншоты/записи)
- Видит свою выручку (`view_own_revenue`)

### 3.2. Права (всё что будет к Subplan 5)

Существующие (уже в `src/lib/permissionGroups.js`):

| Ключ | Смысл |
|---|---|
| `create_users` | Создавать сотрудников |
| `manage_roles` | Управлять правами |
| `manage_teams` | Управлять составом команд / кураторской группы |
| `send_reminders` | Получать оповещения по просроченным задачам |
| `create_tasks` | Создавать задачи |
| `view_all_tasks` | Видеть все задачи |
| `view_own_tasks` | Видеть свои задачи (входящие и исходящие) |
| `view_all_revenue` | Вся выручка |
| `view_team_revenue` | Выручка команды / подчинённых |
| `view_own_revenue` | Своя выручка |
| `use_chat` | Внутренний чат |

Новые (добавить в Subplan 3/4):

| Ключ | Смысл |
|---|---|
| `manage_clients` | CRUD моделей (админ; опционально ТЛ/мод для правок) |
| `assign_team_clients` | Назначать моделей на команду (админ) |

### 3.3. Default permissions по ролям (уже в `src/lib/defaultPermissions.js`)

| Роль | Дефолтные права |
|---|---|
| `admin` | `create_tasks`, `manage_teams`, `send_reminders`, `view_all_revenue`, `view_all_tasks` (+ будет `manage_clients`, `assign_team_clients`) |
| `moderator` | `create_tasks`, `view_own_tasks`, `view_team_revenue` (+ будет `manage_teams`) |
| `teamlead` | `create_tasks`, `manage_teams`, `view_own_tasks`, `view_team_revenue` |
| `operator` | `view_own_revenue`, `view_own_tasks` |

---

## 4. Сущности и таблицы

### 4.1. Существующие

- **`dashboard_users`** — пользователи CRM. Поля: `id`, `email`, `password_hash`, `role`, `first_name`, `last_name`, `alias`, `ref_code`, `tableau_id`, `timezone`, `is_active`, `phone`, `telegram`, `notes`, `created_by`, `permissions` (jsonb, legacy). *(Foundation + Subplan 2)*
- **`user_permissions`** — `(user_id, permission)` связь. *(Foundation)*
- **`user_attributes`** — `(user_id, key, value)` произвольные атрибуты (смена, panel_id и т.п.). *(Foundation)*
- **`deletion_requests`** — запросы на удаление. *(Subplan 2)*
- **`platforms`** — внешние сайты. *(legacy from main)*
- **`agencies`** — агентства. *(legacy from main)*

### 4.2. Новые сущности (Subplan 3–5)

**Subplan 3 — Клиенты**

```
clients
  id             serial PK
  name           text NOT NULL            -- имя модели / псевдоним
  alias          text                     -- внутренний псевдоним
  description    text
  avatar_url     text                     -- Storage: client-avatars
  platform_id    int REFERENCES platforms(id)
  agency_id      int REFERENCES agencies(id)
  is_active      bool DEFAULT true
  created_by     int REFERENCES dashboard_users(id)
  created_at     timestamptz DEFAULT now()

client_media
  id         serial PK
  client_id  int REFERENCES clients(id) ON DELETE CASCADE
  type       text CHECK (type IN ('photo','video'))
  url        text NOT NULL
  sort_order int DEFAULT 0
  created_by int REFERENCES dashboard_users(id)
  created_at timestamptz DEFAULT now()
```

**Subplan 4 — Команды и кураторство**

```
teams
  id             serial PK
  name           text NOT NULL
  lead_user_id   int REFERENCES dashboard_users(id)   -- teamlead ИЛИ moderator
  created_by     int REFERENCES dashboard_users(id)
  created_at     timestamptz DEFAULT now()

team_members                               -- 3 оператора на команду
  team_id     int REFERENCES teams(id) ON DELETE CASCADE
  operator_id int REFERENCES dashboard_users(id)
  PRIMARY KEY (team_id, operator_id)
  -- CHECK: operator_id должен иметь role='operator'
  -- UNIQUE on operator_id (один оператор в одной команде)

team_clients                               -- модели, закреплённые за командой
  team_id   int REFERENCES teams(id) ON DELETE CASCADE
  client_id int REFERENCES clients(id) ON DELETE CASCADE
  PRIMARY KEY (team_id, client_id)

moderator_operators                        -- кураторство модератор→оператор
  moderator_id int REFERENCES dashboard_users(id)
  operator_id  int REFERENCES dashboard_users(id)
  assigned_by  int REFERENCES dashboard_users(id)   -- админ или другой модератор
  assigned_at  timestamptz DEFAULT now()
  PRIMARY KEY (moderator_id, operator_id)
  -- CHECK: moderator_id.role='moderator', operator_id.role='operator'
```

**Subplan 5 — Задачи**

```
tasks
  id           serial PK
  title        text NOT NULL
  description  text
  created_by   int REFERENCES dashboard_users(id)     -- admin / moderator / teamlead
  assigned_to  int REFERENCES dashboard_users(id)     -- moderator / teamlead / operator
  deadline     timestamptz
  status       text CHECK (status IN ('pending','in_progress','done','overdue'))
  completed_at timestamptz
  created_at   timestamptz DEFAULT now()

task_reports
  id           serial PK
  task_id      int REFERENCES tasks(id) ON DELETE CASCADE
  reporter_id  int REFERENCES dashboard_users(id)
  content      text                                    -- текстовый отчёт
  media        jsonb DEFAULT '[]'::jsonb               -- [{type, url}, ...] Storage: task-reports
  created_at   timestamptz DEFAULT now()
```

---

## 5. Ключевые инварианты

1. **Оператор строго в одной команде.** `team_members.operator_id` UNIQUE.
2. **Оператор всегда имеет и ТЛ, и модератора-куратора** — то есть есть запись в `team_members` (с командой, где lead — тимлид) И запись в `moderator_operators`.
3. **Лидом команды может быть только `teamlead` или `moderator`.** Проверяется в RPC при INSERT/UPDATE `teams`.
4. **Клиенты на команду — многие-ко-многим**, но обычно 5-10 моделей на команду.
5. **Задача имеет одного автора и одного исполнителя.** Если надо назначить на нескольких — это две задачи.
6. **Отчёт привязан к задаче, автор отчёта — исполнитель задачи** (или делегат). Отчёт идёт тому, кто задачу создал (определяется через `task.created_by`).
7. **Модератор может быть лидом команды И куратором операторов одновременно.** Причём необязательно операторы в его команде = операторы под его кураторством.

---

## 6. Потоки (flow'ы)

### 6.1. Назначение оператора (админ)

```
Admin открывает /admin/staff → создаёт Operator → генерируется ref_code
Admin переходит в /admin/teams/:id → "Добавить оператора" → выбирает нового
Admin переходит в /admin/staff/:refCode → "Куратор" → выбирает модератора
```

После этого у оператора две связи: `team_members` + `moderator_operators`. Инвариант 2 соблюдён.

### 6.2. Создание задачи

```
Teamlead открывает /tasks → "Новая задача"
  → выбирает исполнителя (свой оператор или другой TL/mod в общем случае)
  → заполняет title/description/deadline
  → сохраняет: INSERT tasks (created_by=TL, assigned_to=operator, status='pending')
Operator видит задачу в /tasks (inbox)
Operator выполняет → "Отправить отчёт" → загружает медиа в task-reports bucket
  → INSERT task_reports (task_id, reporter_id=operator, content, media=[...])
  → UPDATE tasks SET status='done', completed_at=now()
Teamlead получает отчёт в своём outbox /tasks (created_by=me)
```

### 6.3. Просрочка

Фоновый джоб (или on-read query): `tasks WHERE deadline < now() AND status IN ('pending','in_progress')` → UPDATE status='overdue'. Админы с `send_reminders` видят бейдж в /notifications.

### 6.4. Назначение клиентов на команду

```
Admin открывает /admin/clients → видит список моделей
Admin открывает /admin/teams/:id → "Добавить клиента" → выбирает из списка
  → INSERT team_clients (team_id, client_id)
```

После этого все 3 оператора команды работают с этим клиентом посменно.

---

## 7. Supabase Storage

Уже есть:
- `logos` — логотипы платформ и агентств

Будут в Subplan 3–5:
- `client-avatars` — фото профиля модели (один файл на клиента, upsert)
- `client-photos` — галерея фотографий (несколько файлов)
- `client-videos` — галерея видео (большие файлы — через signed URL + direct upload)
- `task-reports` — медиа отчётов (скриншоты PNG/JPEG, записи экрана MP4)

### RLS (черновик)
- `client-avatars`, `client-photos`, `client-videos`: read — любой authenticated; write — `manage_clients`
- `task-reports`: read — только автор отчёта, создатель задачи, админ; write — автор отчёта

Точные RLS-правила проработаем в Subplan 3.

---

## 8. Следующие Subplan'ы (дорожная карта)

| # | Subplan | Сложность | Содержание |
|---|---|---|---|
| **3** | Клиенты (модели) | L | `clients`, `client_media` таблицы; Storage бакеты `client-avatars/photos/videos`; `/admin/clients` список, карточка с медиа-галереями; RLS; права `manage_clients` |
| **4** | Команды и кураторство | M | `teams`, `team_members`, `team_clients`, `moderator_operators`; UI `/admin/teams` и `/admin/teams/:id`; раздел «Кураторство» в карточке оператора |
| **5** | Задачи и отчёты | L | `tasks`, `task_reports`; Storage `task-reports`; страницы `/tasks` (inbox + outbox); overdue-логика; бейджи |
| **6** | Дизайн-система | M | Применение design system из Claude Design: tokens → `src/index.css`; пересобрать базовые компоненты `src/components/ui/*`; перекрасить существующие экраны |
| **7** | Чистка legacy | S | Заменить `api/admin/{create-user,deactivate-user,list-users,update-password,update-permissions}.js` на прямые RPC; удалить устаревшее |

**Параллельно с Subplan'ами** в Claude Design идёт `Set up design system` — визуальный язык (tokens, типографика, компоненты). К финалу Subplan 5 получим готовую дизайн-систему и применим в Subplan 6.

---

## 9. Не решено / на обсудить позже

- Чат — сущность `use_chat` право уже есть. Когда делать? Между кем? (TL ↔ operator? Модератор ↔ operator? Вся команда?)
- Статистика — дашборд revenue уже работает, но для TL/moderator нужны свои cuts.
- Расписание смен — сейчас `user_attributes.shift` — свободный текст (ДЕНЬ/ВЕЧЕР/НОЧЬ). Нужна ли таблица `shifts` со временем начала-конца и привязкой к дате?
- Обучение операторов — модератор этим занимается, но в доменной модели этого нет. Чек-листы / курсы / sign-off?
- История изменений — audit log для задач, перемещений операторов, назначения клиентов. Нужен или админам достаточно оповещений?
