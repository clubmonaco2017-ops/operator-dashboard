# CRM Subplan 6A8 — StaffList master-detail migration · Design Spec

**Status:** Brainstormed · approved decisions · spec ready for user review.
**Author:** Claude Code (Opus 4.7) + Artem.
**Date:** 2026-04-27.
**Implements:** Domain model §8 row 6 (design-system rollout) — Family B первый sweep. Архитектурная миграция StaffList с standalone-layout на `MasterDetailLayout` для визуальной унификации с Clients/Teams/Tasks + DS-token swap master-layer файлов.

**Builds on:**
- [Subplan 6 Foundation spec](2026-04-26-crm-subplan-6-design-system-foundation-design.md) — DS tokens, lucide sweep, shadcn primitives установлены (incl. `<Button>`, `<Input>`, `<Select>`, `<Checkbox>`).
- [Subplan 6A Shell Rebuild spec](2026-04-26-crm-subplan-6a-shell-rebuild-design.md) — `MasterDetailLayout`, `ListPane`, mobile back-pattern.
- [Subplan 6A4 ClientList spec](2026-04-27-crm-subplan-6a4-clientlist-repaint-design.md) — установил «pure token swap» паттерн (`.btn-primary` → shadcn `<Button>`), переиспользуемый ниже для StaffFilterChips.
- Subplan 6A5 (TaskList) + 6A7 (TeamList) — чистый token swap по той же схеме что Family A.

---

## 1. Goal & non-goals

**Goal:** Перевести `StaffListPage` со standalone центрированного layout (`max-w-6xl` table+cards) на тот же `MasterDetailLayout` (left rail → ListPane → DetailPane), что используют Clients/Teams/Tasks. Достигнуть визуальной консистентности всего CRM. Параллельно — token swap legacy-классов (`bg-indigo-600`, `slate-*`) на DS-токены в Staff master-layer + перенос `StaffCreatePage` (отдельная страница) в `CreateStaffSlideOut`.

**В scope:**

- Архитектурная миграция:
  - `src/pages/StaffListPage.jsx` — переписан под `MasterDetailLayout` (паттерн `TeamListPage`)
  - `src/pages/StaffCreatePage.jsx` — **удалён**, содержимое переехало в slide-out
  - `src/pages/StaffDetailPage.jsx` — упрощён до `StaffDetailRoute` внутри `StaffListPage` (паттерн Teams)
  - `src/components/staff/StaffPageShell.jsx` — **удалён**, замещается `StaffDetailPanel`
  - `src/components/staff/StaffTable.jsx` — **удалён** (широкая таблица не помещается в pane)
  - `src/components/staff/StaffCardList.jsx` — **удалён** (заменяется компактным `StaffList` + `StaffListItem`)
  - `src/App.jsx` — роуты переструктурированы под nested outlet pattern; `/staff/new` → редирект на `/staff` (для backward compat)

- Новые компоненты (паттерн Teams):
  - `src/components/staff/StaffList.jsx`
  - `src/components/staff/StaffListItem.jsx`
  - `src/components/staff/EmptyZero.jsx`
  - `src/components/staff/EmptyFilter.jsx`
  - `src/components/staff/DetailEmptyHint.jsx`
  - `src/components/staff/StaffDetailPanel.jsx`
  - `src/components/staff/CreateStaffSlideOut.jsx`

- DS-token swap (master-layer only):
  - `StaffFilterChips.jsx` — `bg-indigo-600`/`slate-*` → DS-токены, `<button>` → shadcn-style chip pattern
  - В `StaffDetailPanel`: `border-indigo-600 → border-primary`, `text-slate-* → text-foreground/muted-foreground`, `bg-indigo-100/text-indigo-800` (avatar) → `bg-muted/text-muted-foreground`
  - В `StaffListItem`/empty-states: тот же sweep

- Tests:
  - `src/components/staff/StaffList.test.jsx` (новый, ~10 тестов)
  - `src/components/staff/CreateStaffSlideOut.test.jsx` (новый, ~8 тестов)
  - Удалить тесты привязанные к удалённым файлам (если есть)

**Out of scope (deferred):**

- **DS-token swap внутри tab-компонентов** (`ProfileTab`, `AttributesTab`, `PermissionsTab`, `ActivityTab`) — они рендерятся as-is с legacy цветовой палитрой. Отдельный subplan (`6A8-detail` или вместе с финальной DS-revamp от Claude Design).
- **DS-token swap в модалках** (`ChangePasswordModal`, `DeleteRequestModal`, `ApprovalReviewModal`, `ChangeTeamModal`, `AddCuratedOperatorsModal`) — те же причины.
- **`RefCodePreview`** — оставляем визуально как есть, переносим в slide-out без переделки.
- **Финальный cleanup `.btn-primary/.btn-ghost/.btn-danger-ghost` в `src/index.css`** — после Family B полностью (Notifications + Login).
- **5-color role-badge палитра** (violet/blue/emerald/amber/slate для superadmin/admin/moderator/teamlead/operator) — **сохраняется как DS-исключение** через прямые tailwind utility-классы. Намеренный choice: устойчивая визуальная семантика ролей > чистота DS. Документировано как explicit drift в spec, не accident.

---

## 2. Architecture

### 2.1. Route structure (`src/App.jsx`)

**До:**
```
/staff           → StaffListPage (centered, max-w-6xl)
/staff/new       → StaffCreatePage (centered, max-w-2xl)
/staff/:refCode             → StaffDetailPage + ProfileTab
/staff/:refCode/attributes  → StaffDetailPage + AttributesTab
/staff/:refCode/permissions → StaffDetailPage + PermissionsTab
/staff/:refCode/activity    → StaffDetailPage + ActivityTab
```

**После (паттерн Teams):**
```jsx
<Route path="staff" element={<StaffListPage />}>
  <Route index element={<StaffDetailEmpty />} />
  <Route path=":refCode" element={<StaffDetailRoute />}>
    <Route index element={<ProfileTab />} />
    <Route path="attributes" element={<AttributesTab />} />
    <Route path="permissions" element={<PermissionsTab />} />
    <Route path="activity" element={<ActivityTab />} />
  </Route>
</Route>
<Route path="staff/new" element={<Navigate to="/staff" replace />} />
```

`StaffListPage` теперь оборачивает `MasterDetailLayout` и рендерит `<Outlet context={{ rows, reload }} />` внутри. `StaffDetailRoute` достаёт `refCode` из params + outletContext, рендерит `<StaffDetailPanel>` который содержит шапку, табы, и nested `<Outlet />` для активного таба.

### 2.2. ListPane composition

```jsx
<ListPane
  title={<>Сотрудники <span className="text-xs ... tabular">{total}</span></>}
  search={<SearchInput placeholder="Поиск по имени, email, реф-коду…" />}
  filters={<StaffFilterChips counts={counts} value={role} onChange={setRole} />}
  createButton={canCreate ? <Button size="sm" onClick={() => setCreateOpen(true)}>+ Новый</Button> : null}
>
  {listBody}
</ListPane>
```

`listBody` = `error` | `<StaffListSkeleton />` | `<StaffEmptyZero />` | `<StaffEmptyFilter />` | `<StaffList rows={filtered} selectedRefCode={selectedRefCode} />`.

Selection state определяется через `useParams().refCode`, как у Teams.

### 2.3. StaffListItem shape

```
[avatar 36×36] [имя — alias?]                          [role badge]
                [email · ref_code · ●status-dot]
```

- Avatar: круг с инициалами, `bg-muted text-muted-foreground` (DS-clean)
- Имя: `text-sm font-medium text-foreground`
- Subtitle row: `text-xs text-muted-foreground`, ref_code в `font-mono`
- Role badge: `bg-{role-color}/10 text-{role-color}` — 5 цветов (violet/blue/emerald/amber/slate), tailwind utility-классы explicit, **DS-exception**
- Status dot: 6×6 круг — `bg-emerald-500` (active) / `bg-muted-foreground` (inactive)
- Selected: `border-l-2 border-l-primary bg-accent` (паттерн Teams)
- Hover: `hover:bg-accent/50`

### 2.4. StaffDetailPanel structure

```
┌─ Pane header (sticky) ─────────────────────────┐
│ [← Назад (mobile)]  [Имя Фамилия]  [actions]  │
├─────────────────────────────────────────────────┤
│ Header card:                                   │
│   [avatar 56×56]  [Имя Фамилия]  [role badge] │
│                    [status pill] [del-pill?]   │
│                    [ref_code · email · created]│
├─────────────────────────────────────────────────┤
│ Tabs nav (inline, border-b-2):                 │
│   Профиль | Атрибуты | Права | Активность      │
├─────────────────────────────────────────────────┤
│ <Outlet /> ← active tab content                │
└─────────────────────────────────────────────────┘
```

**Изменения относительно текущего `StaffPageShell`:**
- Убран breadcrumb «Сотрудники › Имя» (избыточен в pane)
- Убран `mx-auto max-w-5xl` wrapper (pane сам контролирует ширину)
- Avatar 64×64 → 56×56 (экономия вертикали в pane)
- Tabs: `border-indigo-600` → `border-primary`, `text-slate-*` → `text-foreground/muted-foreground`
- Кнопка «+» под avatar для загрузки аватара остаётся (placeholder, не в этом PR)

**Tab content компоненты — НЕ ТРОГАЕМ внутренности.** `ProfileTab.jsx`, `AttributesTab.jsx`, `PermissionsTab.jsx`, `ActivityTab.jsx` рендерятся as-is. DS-swap внутри табов deferred.

**`headerActions` prop** контракт сохраняется: табы могут передавать кнопки в pane header (например, `ProfileTab` → «Сменить пароль», «Удалить»).

### 2.5. CreateStaffSlideOut composition

Slide-out (`w-[480px]`, паттерн `CreateTeamSlideOut`):

```
[×]  Новый сотрудник
─────────────────────────────────────
Body (overflow-y-auto):
  Роль          <Select>  Администратор / Модератор / ТЛ / Оператор
  Реф-код       <RefCodePreview role={role} firstName fastName />
  Имя           <Input required>
  Фамилия       <Input required>
  Алиас         <Input> (опционально)
  Email         <Input type="email" required>
  Пароль        <Input type="password" minLength={6} required>
  
  Права (по умолчанию для роли, можно менять):
    ▼ Сотрудники     ← collapsible group, default expanded
       ☑ create_users
       ☐ delete_users
       ...
    ▼ Команды        ← collapsible, default expanded
       ...
    ▼ Клиенты
    ▼ Задачи
  
  {error && <Alert variant="destructive">{error.message}</Alert>}
─────────────────────────────────────
Footer (sticky):
  [Отмена]                        [Создать]
```

**Поля:** все через shadcn primitives (`<Input>`, `<Select>`, `<Checkbox>`).
**Permissions UI:** группы из `permissionGroups.js`, каждая в `<details open>` (или collapsible div + chevron). 1-column checkbox list внутри (а не 2-col grid как раньше — slide-out 480px не вмещает).
**Submit:** RPC `create_staff` → `get_staff_detail` → `onCreated(refCode)` → закрыть slide-out → `reload()` списка → `navigate('/staff/' + refCode)`.
**Close:** Esc / backdrop click / отмена (no dirty-check для MVP, как у Teams).

### 2.6. Empty states

- `StaffEmptyZero` — иконка `UserPlus`, заголовок «Сотрудников пока нет», CTA `+ Добавить первого` (виден если `canCreate`)
- `StaffEmptyFilter` — иконка `FilterX`, «Под фильтр ничего не подходит», кнопки «Очистить поиск» / «Сбросить роль» с правильным variant (default/ghost) по паттерну Teams
- `StaffDetailEmptyHint` — иконка `MousePointerClick`, «Выберите сотрудника слева», подзаголовок «Профиль, атрибуты, права и активность откроются в этой панели»

### 2.7. Mobile

`MasterDetailLayout` уже обрабатывает mobile: на узком экране (sm и меньше) DetailPane занимает viewport, ListPane скрывается; кнопка `← Назад` в pane header возвращает на `/staff`. Без дополнительной работы.

---

## 3. Component contracts

### 3.1. StaffList

```ts
type StaffListProps = {
  rows: StaffRow[]
  selectedRefCode: string | null
}
```

Рендер `<ul role="list">` с `<StaffListItem>` для каждой строки. Без skeleton — skeleton отдельный компонент `StaffListSkeleton` рендерится в `listBody` при `loading=true`.

### 3.2. StaffListItem

```ts
type StaffListItemProps = {
  row: StaffRow
  selected: boolean
}
```

Внутри использует `<NavLink to={`/staff/${encodeURIComponent(row.ref_code)}`}>` с `border-l-2 border-l-primary bg-accent` при `selected`.

### 3.3. StaffDetailPanel

```ts
type StaffDetailPanelProps = {
  callerId: string
  user: User
  refCode: string
  siblings: StaffRow[]
  onChanged: () => void
  onBack: () => void
}
```

Делает `get_staff_detail` RPC при mount/refCode change, рендерит шапку + табы + `<Outlet context={{ row, callerId, user, onChanged }} />`. Tab-компоненты получают `row` через `useOutletContext()`.

### 3.4. CreateStaffSlideOut

```ts
type CreateStaffSlideOutProps = {
  callerId: string
  onClose: () => void
  onCreated: (refCode: string) => void
}
```

State: `role`, `firstName`, `lastName`, `alias`, `email`, `password`, `perms` (Set), `submitting`, `error`. Поведение совпадает с текущим `StaffCreatePage`.

---

## 4. Tests

**Новые:**

`src/components/staff/StaffList.test.jsx` (~10 cases):
- Рендер списка (3 строки → 3 items)
- Selected highlight на `selectedRefCode` совпадении
- NavLink имеет правильный href
- Role badge отображается с правильным цветом
- Status dot — emerald для active, muted для inactive
- ref_code и email отображаются

`src/components/staff/CreateStaffSlideOut.test.jsx` (~8 cases):
- Submit happy path с моком `create_staff` RPC + `get_staff_detail` → `onCreated(refCode)` вызван
- Валидация: submit disabled если `!firstName || !lastName || !email || password.length < 6`
- Role-change → permissions reset на defaults для новой роли
- Permission toggle — checkbox add/remove из set
- Esc + backdrop click → `onClose`
- Submitting state блокирует submit button
- RPC error → отображается в `<Alert>`
- `RefCodePreview` обновляется при изменении role/firstName/lastName

**Tests to delete:**
- Любые тесты для `StaffTable.jsx` / `StaffCardList.jsx` / `StaffPageShell.jsx` / `StaffCreatePage.jsx` (если есть в репо)

**Existing tests to update:**
- `src/components/shell/AppShell.test.jsx` — если есть кейс на `/staff/...` рендер, проверить что он всё ещё проходит после реструктуризации route'ов

---

## 5. Risks & mitigations

1. **`StaffTable` нёс больше столбцов чем `StaffListItem`** (role, email, ref_code, status, created_at одновременно).
   - Mitigation: `StaffListItem` показывает email + ref_code + status визуально. Created_at — переезжает в DetailPanel header card. Comparing-by-column сценарий редкий и низко-приоритетный.

2. **`/staff/new` URL может быть в закладках.**
   - Mitigation: `<Route path="staff/new" element={<Navigate to="/staff" replace />} />` redirect. Slide-out открывается через `+ Новый` кнопку (UX чуть отличается, но не ломает).

3. **`StaffPageShell` использовался только в одном месте** (StaffDetailPage с 4 tab вариантами). Удаление безопасно — grep на usage перед удалением.

4. **Permissions checkbox state в slide-out**: `setRoleAndPerms` при role-change перезаписывает set на defaults, теряя ручные правки.
   - Уже текущее поведение в `StaffCreatePage`, не regression. Сохраняем 1-в-1.

5. **5-color role badge как DS-exception** — может вызвать вопросы при будущем DS-revamp.
   - Mitigation: explicit пометка в spec + комментарий в коде `StaffListItem.jsx`/`StaffDetailPanel.jsx` что palette сознательно сохранена.

6. **Mobile detail view раньше был standalone full-page** — теперь pane с back-button. Поведение незначительно меняется, но улучшается (back ведёт на список, не в browser history).

---

## 6. Acceptance criteria

- `/staff` показывает master-detail layout, идентичный по структуре `/teams` и `/clients`.
- Клик на сотрудника → DetailPanel справа, табы переключаются без перезагрузки.
- `+ Новый` открывает `CreateStaffSlideOut`, успешное создание → новый сотрудник появляется в списке + автонавигация на его detail.
- `/staff/new` URL → redirect на `/staff`.
- Все 4 таба (`Profile/Attributes/Permissions/Activity`) рендерятся внутри DetailPanel, контент табов не сломан.
- Поиск по имени/email/ref_code работает.
- Filter chips (Все/Админы/Модераторы/ТЛ/Операторы) фильтруют список с counts.
- Mobile (sm и меньше): list/detail переключаются, back-button работает.
- Build clean, lint без новых warnings, все existing tests + новые проходят (ожидаемо ~228+ tests из 220).

---

## 7. Implementation order

Шаги для writing-plans:

1. Создать `StaffList`, `StaffListItem`, `StaffListSkeleton` (новые файлы) + базовый test для `StaffList`.
2. Создать `StaffEmptyZero`, `StaffEmptyFilter`, `StaffDetailEmptyHint`.
3. Создать `StaffDetailPanel` (обёртка вокруг существующих tab компонентов).
4. Создать `CreateStaffSlideOut` (перенос логики из `StaffCreatePage`) + test.
5. Переписать `StaffListPage` под `MasterDetailLayout` + добавить `StaffDetailRoute` + `StaffDetailEmpty`.
6. Обновить роуты в `App.jsx`, добавить `/staff/new` redirect.
7. Удалить `StaffCreatePage.jsx`, `StaffPageShell.jsx`, `StaffTable.jsx`, `StaffCardList.jsx`.
8. DS-token swap в `StaffFilterChips.jsx`.
9. Verification: build, lint, tests, ручное preview /staff (zero/filter/list/detail/create slide-out states).
10. Commit + PR.

---

## 8. Files diff summary

**Removed (4):**
- `src/pages/StaffCreatePage.jsx` (216 LOC)
- `src/components/staff/StaffPageShell.jsx` (94 LOC)
- `src/components/staff/StaffTable.jsx` (109 LOC)
- `src/components/staff/StaffCardList.jsx` (58 LOC)
- Total removed: 477 LOC

**Created (7):**
- `src/components/staff/StaffList.jsx`
- `src/components/staff/StaffListItem.jsx`
- `src/components/staff/EmptyZero.jsx`
- `src/components/staff/EmptyFilter.jsx`
- `src/components/staff/DetailEmptyHint.jsx`
- `src/components/staff/StaffDetailPanel.jsx`
- `src/components/staff/CreateStaffSlideOut.jsx`

**Modified:**
- `src/pages/StaffListPage.jsx` (полная переписка)
- `src/pages/StaffDetailPage.jsx` (упрощён или удалён в пользу inline `StaffDetailRoute`)
- `src/App.jsx` (роутинг)
- `src/components/staff/StaffFilterChips.jsx` (DS-swap)

**Test files created (2):**
- `src/components/staff/StaffList.test.jsx`
- `src/components/staff/CreateStaffSlideOut.test.jsx`

**Estimated PR size:** ~600-800 LOC net (бóльшая часть — новые файлы; удаления компенсируют ~50% gross).
**Estimated effort:** 4-6 часов.
