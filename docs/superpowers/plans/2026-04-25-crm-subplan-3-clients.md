# CRM Subplan 3 — Clients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to execute this plan task-by-task.

**Goal:** Implement the master-detail Clients section (`/clients` list, `/clients/new` slide-out create, `/clients/:slug` detail with `Профиль · Фото · Видео` tabs). Replace the legacy `src/sections/ClientsSection.jsx` stub. Wire up Supabase schema (`clients`, `client_media`) per [domain-model.md](../../domain-model.md) §4.2 + Tableau ID field. Add permissions `manage_clients`, `assign_team_clients`.

**Architecture:** master-detail с правой панелью `Активность · Сводка` (метрики мокаются до подключения Tableau API — D-5). Drag-to-reorder в фото-галерее без handle ([D-2]). Lightbox со swipe-nav. Drop-overlay для bulk-upload. Validation/loading/error states. Dark mode обязателен.

**Tech Stack:** React 19, Vite, Tailwind CSS v4, shadcn/ui, react-router-dom v7, Supabase (PostgreSQL + RPC + Storage), Vitest. **Mobile: defensive responsive, не дизайнируем под mobile отдельно ([D-9]).**

**Design source of truth:**
- [docs/design-feedback/subplan-3-clients.md](../../design-feedback/subplan-3-clients.md) — R1 (включая таблицу терминов, раздел 0)
- [docs/design-feedback/subplan-3-clients-r2.md](../../design-feedback/subplan-3-clients-r2.md) — R2 + handoff
- [docs/design-feedback/_decisions.md](../../design-feedback/_decisions.md) — принятые решения D-1…D-8
- [docs/design-feedback/subplan-3-handoff/standalone.html](../../design-feedback/subplan-3-handoff/standalone.html) — bundle с Claude Design (CSS-токены, Geist шрифт)

**Prerequisites:**
- Subplan 2 (Staff) merged в `main`.
- Branch `feat/subplan-3-clients` (уже создан).
- `.env.local` с `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`.
- Geist Variable + Geist Mono шрифты подключены (если ещё нет — добавить в Stage 1).

---

## File structure

### Create — DB

```
db/migrations/
  20260425_12_clients_schema.sql              # clients, client_media tables; tableau_id column
  20260425_13_permissions_clients.sql         # manage_clients, assign_team_clients permissions
  20260425_14_rpc_client_crud.sql             # create_client, list_clients, get_client_detail, update_client, archive_client
  20260425_15_rpc_client_media.sql            # list/add/reorder/delete media
  20260425_16_storage_buckets.sql             # storage policies for client-avatars / client-photos / client-videos
  20260425_17_seed_dev_clients.sql            # (dev only) seed Sofia Reign + 8 моделей для тестов
```

### Create — Lib

```
src/lib/
  clients.js                                  # slug helpers, plural-form helper, validators
  clients.test.js
```

### Create — Hooks

```
src/hooks/
  useClientList.js                            # filtered list with search + chips
  useClient.js                                # single client detail
  useClientMedia.js                           # photos / videos for tab
  useClientUpload.js                          # upload progress state machine
```

### Create — Components

```
src/components/clients/
  ClientList.jsx                              # master panel (search + chips + scroll list)
  ClientListItem.jsx                          # one row (avatar + name + alias + meta + counter)
  ClientFilterChips.jsx                       # Активные · Платформа · Агентство · + Фильтр
  ClientPageShell.jsx                         # detail header (avatar, name, chips, status toggle)
  ClientTabs.jsx                              # Профиль · Фото · Видео
  ProfileTab.jsx                              # Описание + Поля профиля + Файлы профиля cards
  PhotoGalleryTab.jsx                         # masonry grid + drag-reorder + drop-overlay
  PhotoTile.jsx                               # one photo cell (hover actions)
  VideoGalleryTab.jsx                         # 16:9 grid + lightbox + error states
  VideoTile.jsx                               # one video cell (with #N marker, duration, hover actions)
  VideoErrorTile.jsx                          # error state — light-red, ⚠ icon, popover trigger (D-8)
  VideoErrorPopover.jsx                       # popover content for D-8
  ClientLightbox.jsx                          # shared lightbox for photo + video
  CreateClientSlideOut.jsx                    # slide-out form (avatar + name + alias + platform + agency + description + tableau_id)
  CreateClientCloseConfirm.jsx                # confirm-dialog при попытке закрыть с грязной формой
  ActivityCard.jsx                            # правая колонка — список событий
  SummaryCard.jsx                             # правая колонка — Просмотры/Доход/Посты + period toggle (D-5)
  UploadProgressBanner.jsx                    # banner с прогрессом
  DropOverlay.jsx                             # full-panel drop-zone overlay
  BulkSelectActionBar.jsx                     # action bar когда select mode
  EmptyZero.jsx                               # zero-state карточка
  EmptyFilter.jsx                             # filter-empty карточка
  __tests__/                                  # vitest specs (минимум для логики hooks + utils)
```

### Create — Pages

```
src/pages/
  ClientListPage.jsx                          # /clients
  ClientDetailPage.jsx                        # /clients/:slug, /clients/:slug/:tab
```

(Note: `ClientCreatePage.jsx` НЕ создаём — `Create` = slide-out из `ClientListPage`.)

### Modify

- `src/App.jsx` — добавить routes `/clients`, `/clients/new`, `/clients/:slug`, `/clients/:slug/:tab`.
- `src/components/Sidebar.jsx` — проверить ссылку `Клиенты` (если уже есть — обновить путь, иначе добавить).
- `src/lib/permissionGroups.js` — добавить `manage_clients`, `assign_team_clients`.
- `src/lib/defaultPermissions.js` — admin получает новые permissions.
- `src/index.css` — подключить Geist Variable + Geist Mono (через `@font-face` или `@import` из CDN). Проверить — токены уже есть (commit d83c7d8).

### Delete

- `src/sections/ClientsSection.jsx` — legacy stub (один раз; Subplan 2 уже удалил большинство sections).

---

## Stages

План разбит на 8 этапов. После каждого — рабочий коммит и smoke-test через preview server. Не двигаемся к следующему пока текущий не зелёный.

### Stage 1 — DB foundation + permissions

**Цель**: схема в Supabase, новые permissions, dev-seed.

- Создать миграции 12-13-14-15-16-17 (см. file structure).
- Применить миграции локально + продоставить SQL пользователю для applay в Supabase.
- Расширить `permissionGroups.js` + `defaultPermissions.js`.
- Tests: `clients.test.js` для slug/plural helpers.

**Definition of done**:
- Миграции применены, в БД таблицы `clients`, `client_media` существуют.
- `manage_clients` permission в `dashboard_users.permissions` для админа.
- `npm test` — всё зелёное.

---

### Stage 2 — Data layer (hooks + RPC)

**Цель**: hooks возвращают живые данные из Supabase.

- `useClientList(callerId, filters)` → `{ rows, counts, loading, error, reload }`.
- `useClient(callerId, slug)` → `{ row, loading, error, reload }`.
- `useClientMedia(callerId, clientId, type)` → `{ rows, loading, error, addMedia, reorderMedia, deleteMedia }`.
- `useClientUpload(clientId, type)` → state-machine `idle | uploading | done | error`.
- Минимум 1 unit-test для каждого hook'а (mock supabase).

**Definition of done**: dev-script в browser console (`window.__supa.rpc('list_clients', ...)`) возвращает 9 seeded клиентов.

---

### Stage 3 — Routing + Sidebar + ClientListPage skeleton

**Цель**: можно перейти на `/clients`, видеть пустую заглушку. Master-detail layout.

- `App.jsx` routes.
- `Sidebar.jsx` link "Клиенты" с counter (если есть).
- `ClientListPage.jsx` — обёртка с master-detail grid (`grid-cols-[480px_1fr]` desktop).
- `ClientList.jsx`, `ClientListItem.jsx`, `ClientFilterChips.jsx`.
- `EmptyZero.jsx`, `EmptyFilter.jsx`.

**Definition of done**:
- `/clients` рендерит master-list реальных данных.
- Активный клиент в URL виден через accent bar (D-3).
- Empty zero и empty filter states работают.
- Filter chips имеют 3 состояния (default / value-set / changed) — это **сквозное** правило, R2.0a.4.
- Detail-панель в empty состояниях схлопнута (R2.0.4).

---

### Stage 4 — CreateClientSlideOut

**Цель**: добавить нового клиента можно через UI.

- `CreateClientSlideOut.jsx` — форма со всеми полями (имя, alias, platform select, agency select, description, tableau_id).
- Avatar upload через Supabase Storage (`client-avatars` bucket).
- Валидация (required, format Tableau ID).
- Loading state submit (R2.11.8).
- Confirm-dialog при closing с грязной формой (R2.8 + D-2 терминология).
- Hot-key `Cmd+Enter` для submit (R2.11.11).
- Открытый dropdown с поиском (R2.11.14).

**Definition of done**:
- Создание клиента работает end-to-end.
- Validation states показываются inline.
- Esc / Cmd+Enter работают.
- Confirm-dialog корректен (D-2 терминология `Новый клиент`, primary `Продолжить ввод`).

---

### Stage 5 — Detail · Профиль

**Цель**: открыть клиента, увидеть полный профиль + Активность + Сводка.

- `ClientDetailPage.jsx`, `ClientPageShell.jsx`, `ClientTabs.jsx`, `ProfileTab.jsx`.
- 3 карточки в Profile: `Описание`, `Поля профиля`, `Файлы профиля`.
- Inline-edit для полей профиля (input-borders по умолчанию — D-3).
- Read-only `Tableau ID` с lock-icon.
- Toggle `Активна` ↔ архив (с confirm только в одну сторону).
- Pagination `‹ ›` между клиентами с tooltip имени.
- `ActivityCard.jsx` (правая колонка) — события + ссылка `Все события (12)`.
- `SummaryCard.jsx` (правая колонка) — мок-метрики Просмотры / Доход / Посты + period toggle + deep-link `Открыть в Tableau` (D-5).

**Definition of done**:
- Открытие клиента из master → виден полный профиль.
- Inline-edit описания и полей сохраняет в БД.
- Сводка показывает мок-данные (детерминированные, на основе `client.id`) — для реального API заведём отдельную задачу когда подключат Tableau.
- Активность показывает реальные события из таблицы (или мок если события ещё не пишутся).

---

### Stage 6 — Detail · Фото

**Цель**: галерея с upload, drag-reorder, lightbox.

- `PhotoGalleryTab.jsx`, `PhotoTile.jsx`, `DropOverlay.jsx`, `UploadProgressBanner.jsx`.
- Masonry layout (CSS columns или JS grid).
- Drag-reorder без handle (D-2): cursor `grab` / `grabbing`, использовать `@dnd-kit/core`.
- Drop-overlay при перетаскивании файлов с системы (R2.13).
- Sort modes: `Вручную` (manual) / `По дате`.
- Bulk-select: чекбоксы → action bar (`Скачать N · Переместить · Удалить N`).
- Lightbox open on click → `ClientLightbox.jsx` (фото-режим со scroll-zoom, swipe-nav).
- HEIC обработать (Q-5 пока без ответа: добавить guard `Не поддерживается. Сохраните в JPG/WEBP/PNG`).

**Definition of done**:
- Upload фото через drop overlay + кнопка `Загрузить`.
- Reorder сохраняется в БД (`sort_order`).
- Lightbox с навигацией ←/→, Esc.
- Bulk-select с группами actions.

---

### Stage 7 — Detail · Видео

**Цель**: галерея видео + lightbox + error states (popover из D-8).

- `VideoGalleryTab.jsx`, `VideoTile.jsx`.
- 16:9 grid (фиксированные пропорции).
- Player в lightbox: native `<video controls>` + кастомные controls overlay.
- Error states (D-8): плитка стандартного размера + popover. Toast при загрузке (5-7 сек fade).
- Transcoding-плитка (placeholder `обрабатывается...`).
- Search by название/подпись + фильтр длительности.

**Definition of done**:
- Загрузка видео работает.
- Validation (размер 500 МБ, формат MP4/WEBM/MOV-H.264) → `VideoErrorTile` с popover.
- Lightbox: play/pause/seek, swipe-nav между видео.
- HEVC video — error path (формат не подходит).

---

### Stage 8 — Polishing & states

**Цель**: довести edge-cases.

- Loading states (skeleton — D-12 структура: круглый avatar, tab-row, content-grid).
- Slow-loading сообщения (>2 сек).
- Network error fallback с retry.
- Auto-retry на upload network error (Q-20 default: 1 retry).
- Long content (длинные имена, длинные caption) — truncate / multiline.
- Touch-friendly drag (если возможно без mobile mock'ов — defensive).
- Accessibility: `role="alert"` для errors, focus management в slide-out, hotkeys.

**Definition of done**:
- Все states из чеклиста [docs/design-feedback/README.md, секция «Чеклист состояний»](../../design-feedback/README.md) покрыты.
- Lighthouse a11y score >90 для list и detail page.

---

## Open questions (нужно решить до Stage 4-5)

Из [_decisions.md](../../design-feedback/_decisions.md) `Ожидают ответа` — некоторые блокируют конкретные этапы:

- **Q-4 (MOV codec)** — Stage 7. **Default**: принимаем только H.264 на клиенте (быстрая валидация через `MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E"')`). Остальное — error.
- **Q-5 (HEIC)** — Stage 6. **Default**: блокируем с подсказкой. Серверная конверсия — отдельная фича.
- **Q-6 (лимиты)** — Stage 6/7. **Default**: 25 МБ фото, 500 МБ видео, 5 МБ аватар.
- **Q-7 (autoplay/mute lightbox)** — Stage 7. **Default**: paused + muted при первом открытии в сессии, запоминать выбор в localStorage.
- **Q-9 (wrap-around)** — Stage 6/7. **Default**: disabled на границах, без wrap-around.
- **Q-15 (drop на master-list)** — Stage 6. **Default**: drop на master = ничего, только detail-панель принимает.
- **Q-19 (cache policy)** — Stage 8. **Default**: cold load = всё skeleton, warm load = stale-значения с opacity 0.7.

Для остальных Q-N — defaults в коде с TODO-комментарием, явно решим когда дойдём.

---

## Acceptance criteria

После всех 8 stages:
- Полный CRUD клиентов через UI.
- Загрузка фото/видео в Storage с правильными bucket policies.
- Drag-reorder сохраняется.
- Lightbox работает для фото и видео.
- Все error/empty/loading states покрыты по нашим R2 mock'ам.
- Терминология `Клиенты / клиент` применена везде (D-1).
- D-2…D-8 применены.
- Dark mode работает на всех экранах.
- `npm run build` без ошибок.
- `npm test` без падений.
- Smoke-test через preview server: создать → загрузить фото и видео → reorder → удалить — без ошибок в console.

---

## Notes для исполнителя

- **Не оптимизируй преждевременно.** Если 100 клиентов — простой список без virtualize. Виртуализация — отдельный refactor когда понадобится.
- **Не пиши хелперов «на будущее».** Только то что нужно для текущей задачи.
- **CAPS на section headers** — оставляем (D-? — TODO зафиксировать), это часть DS Display style.
- **Hardcoded Tailwind classes разрешены** (D-4) — не пытайся всё абстрагировать в компоненты.
- **Memo / useCallback** — только если профайлер показывает реальный bottleneck, не превентивно.
- **Тесты** — пишем для logic-helpers (slug, plural, validators) и hooks. UI-снепшоты не пишем.
