# Task Detail — двухколоночная вёрстка · Design Spec

**Status:** Brainstormed · approved decisions · spec ready for user review.
**Author:** Claude Code (Opus 4.7) + Artem.
**Date:** 2026-04-28.
**Branch context:** `feat/desktop-tweaks-nav-redesign` (часть desktop-tweaks itinerary).
**Implements:** Desktop tweak — переработка `TaskDetailPanel` без редизайна вложенных карточек.

---

## 1. Goal & non-goals

**Goal:** Перевести `TaskDetailPanel` на двухколоночную вёрстку (main + sidebar 320px) на широких экранах, чтобы:
1. Развести meta-информацию (исполнитель, дедлайн, постановщик, статус) и narrative-контент (описание, отчёт, история) — сейчас они дублируются в шапке и в карточке «Поля».
2. Убрать «висячую» одиночную кнопку «Отменить задачу» из шапки — действия группируются справа от title.
3. Использовать пустое пространство справа на широких мониторах — сейчас контент ограничен `max-w-3xl`, справа большое поле.

**В scope:**
- `src/components/tasks/TaskDetailPanel.jsx` — header restructure, body grid, скелетон.
- Новый `src/components/tasks/TaskMetaSidebar.jsx` — sidebar/card hybrid с inline-editing полей.
- Вынос `DeadlineField` и `AssigneeField` из `TaskFieldsCard.jsx` в отдельные модули для переиспользования.

**Out of scope:**
- Редизайн `TaskDescriptionCard`, `TaskReportCard`, `TaskActivityCard` — оставляем как есть.
- Редизайн `StatusPill`, breadcrumb, `Pagination` в TopBar.
- Mobile (`< xl`) оптимизация — fallback к single-column. Отдельная задача (Subplan «mobile responsive»).
- Удаление файла `TaskFieldsCard.jsx` — оставляем, но не вызываем. Удаление — опциональный финальный коммит, если grep не найдёт других usage'ов.
- Перенос destructive-кнопок в overflow-меню (`⋯`) — будущая итерация, если на узких ширинах action-row будет неудобно сворачиваться.

---

## 2. Decisions log

| # | Решение | Rationale |
|---|---|---|
| **D-1** | Двухколоночная вёрстка с sidebar 320px справа. | User-Q1=A. Linear/Asana-pattern. Разгружает шапку, уменьшает дублирование метаданных. |
| **D-2** | Sidebar содержит: Статус, Постановщик, Исполнитель (edit), Дедлайн (edit). Действия — НЕ в sidebar. | User-Q2=A (минимальный sidebar). Действия остаются в шапке справа от title — primary action («Взял в работу») рядом с заголовком, ближе к точке внимания. |
| **D-3** | `position: sticky; top: 0` для sidebar. | User-Q3 confirm. Мета всегда под рукой при скролле длинного описания/истории. |
| **D-4** | Breakpoint сворачивания в single-column: `< xl` (1280px). | User-Q3 confirm. App-shell уже занимает ~250px слева; на 13" ноутбуке (1280–1440px window) внутренняя ширина панели остаётся ~1000–1200px, что комфортно для двухколонки. На меньшем — sidebar сложился бы слишком узким. |
| **D-5** | Под `xl` тот же `TaskMetaSidebar` рендерится как карточка между Описанием и Отчётом. | Переиспользование одного компонента через `variant="sidebar" \| "card"` prop. Между narrative-блоками — оператор видит мета до отчёта. |
| **D-6** | Action-кнопки порядок: `Взял в работу` → `К отчёту` → gap → `Отменить задачу` → `Удалить задачу`. | Primary actions сначала, ghost destructive в конце. Текущая роль и статус определяют, какие именно кнопки рендерятся (логика `canTakeInProgress` etc. без изменений). |
| **D-7** | Удалить мета-строку «От … · Исполнитель … · Дедлайн …» из шапки. | Полностью покрыта sidebar'ом. Дублирование = шум. |
| **D-8** | `max-w-3xl` на main колонке убирается. | Ширина теперь регулируется sidebar'ом (main = `1fr`, sidebar = `320px`). |
| **D-9** | `TaskFieldsCard.jsx` не удаляется в этой PR. | Defensive — на случай, если grep пропустит import где-то. Удаление — опциональный последний коммит после verify в браузере. |
| **D-10** | Pure desktop tweak — без изменений в `useTask`, `useTaskActions`, `lib/tasks.js`, RPC, schema. | Backend-поведение не меняется. |
| **D-11** | Single PR / single commit. | Изменение локализовано в `tasks/`, ~150–250 line diff. Atomic = легче rollback при регрессии. |

---

## 3. Layout

### 3.1. Структура (≥ xl)

```
┌──────────────────────────────────────────────────────────────────┐
│ TopBar: «Задачи › {title}»                       [‹ 1/2 ›]       │  ← без изменений
├──────────────────────────────────────────────────────────────────┤
│ Header (full width, px-6 pt-5 pb-4)                              │
│ ┌──────────────────────────────────┐  ┌──────────────────────┐   │
│ │ {title}        [STATUS PILL]     │  │ [Взял] [К отчёту]    │   │
│ │                                  │  │  Отменить · Удалить  │   │
│ └──────────────────────────────────┘  └──────────────────────┘   │
├──────────────────────────────────────────────────────────────────┤
│ Body (flex-1, overflow-auto, px-6 py-5)                          │
│ ┌─ MAIN (minmax(0,1fr)) ────────────┐  ┌─ SIDEBAR (320px) ───┐   │
│ │ ┌─ TaskDescriptionCard ─────────┐ │  │ sticky top-0        │   │
│ │ │                               │ │  │ self-start          │   │
│ │ └───────────────────────────────┘ │  │                     │   │
│ │ ┌─ TaskReportCard ──────────────┐ │  │ ┌─ Sidebar sections │   │
│ │ │                               │ │  │ │ Статус            │   │
│ │ └───────────────────────────────┘ │  │ │ Постановщик       │   │
│ │ ┌─ TaskActivityCard ────────────┐ │  │ │ Исполнитель  [✏︎]│   │
│ │ │                               │ │  │ │ Дедлайн      [✏︎]│   │
│ │ └───────────────────────────────┘ │  │ └─                   │   │
│ └───────────────────────────────────┘  └─────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2. Структура (< xl)

```
┌──────────────────────────────────────────────────────────────────┐
│ TopBar                                                           │
├──────────────────────────────────────────────────────────────────┤
│ Header (action-row wraps below title)                            │
├──────────────────────────────────────────────────────────────────┤
│ Body (single column, max-w-3xl)                                  │
│   TaskDescriptionCard                                            │
│   TaskMetaSidebar (variant="card") ← вместо старой TaskFieldsCard│
│   TaskReportCard                                                 │
│   TaskActivityCard                                               │
└──────────────────────────────────────────────────────────────────┘
```

`max-w-3xl` остаётся **только** в single-column режиме (под `xl`). В двухколонке ширину диктует grid.

---

## 4. Component changes

### 4.1. `TaskDetailPanel.jsx`

**Header — изменяется:**
- Удаляется блок `<p className="mt-1.5 text-sm text-muted-foreground">От … · Исполнитель … · Дедлайн …</p>`.
- Внешний `<header>` становится `flex items-start justify-between gap-4 flex-wrap`.
- Левый блок: `<div>` с `flex flex-wrap items-baseline gap-2` → title + StatusPill (как сейчас).
- Правый блок: `<div className="flex flex-wrap items-center gap-2 shrink-0">` с action-кнопками.
- На узких ширинах вся правая часть переносится строкой ниже благодаря `flex-wrap` на header.
- Условие отображения action-блока остаётся: `(showTake || showSubmitJump || showCancel || showDelete)`.

**Body — изменяется:**
```jsx
<div className="flex-1 overflow-auto bg-background">
  <div className="px-4 py-5 sm:px-6 xl:px-8">
    {/* xl: grid 1fr + 320px; меньше — flex-col */}
    <div className="mx-auto flex max-w-3xl flex-col gap-4 xl:max-w-none xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-6">
      {/* Main */}
      <div className="flex flex-col gap-4 xl:min-w-0">
        <TaskDescriptionCard ... />
        {/* Под xl — sidebar как карточка между описанием и отчётом */}
        <div className="xl:hidden">
          <TaskMetaSidebar variant="card" ... />
        </div>
        <TaskReportCard ... />
        <TaskActivityCard ... />
      </div>
      {/* Sidebar (только xl+) */}
      <aside className="hidden xl:block xl:sticky xl:top-0 xl:self-start xl:max-h-[calc(100vh-4rem)] xl:overflow-auto">
        <TaskMetaSidebar variant="sidebar" ... />
      </aside>
    </div>
  </div>
</div>
```

`TaskFieldsCard` import — удаляется. Использование в JSX — удаляется.

**Skeleton — обновляется:**
- Убрать карточку «Поля» из основной колонки.
- Убрать мета-строку из header skeleton.
- На xl добавить sidebar-плейсхолдер (фиксированная ширина 320px, набор скелетонов под секции: 4 строки с label + value).

### 4.2. Новый `TaskMetaSidebar.jsx`

```jsx
// Props: { callerId, user, task, onChanged, variant: 'sidebar' | 'card' }
// variant='sidebar' → без surface-card обёртки, секции разделены border-t
// variant='card'    → обёрнут в <section className="surface-card p-5"> + header «Поля»
```

**Секции (порядок сверху вниз):**

1. **Статус** — read-only. Лейбл `СТАТУС` (label-caps), значение — `<StatusPill status={status} />`.
2. **Постановщик** — read-only. Лейбл `ПОСТАНОВЩИК`, значение — `{task.created_by_name ?? '—'}` (text-sm font-medium).
3. **Исполнитель** — `<AssigneeField />` (вынесенный из `TaskFieldsCard`).
4. **Дедлайн** — `<DeadlineField />` (вынесенный из `TaskFieldsCard`).

**Sidebar variant** структура:
```jsx
<aside className="flex flex-col gap-5 border-l border-border pl-6">
  <Section label="Статус"><StatusPill status={status} /></Section>
  <Section label="Постановщик">{task.created_by_name ?? '—'}</Section>
  <AssigneeField ... />  {/* содержит свой label-caps "Исполнитель" */}
  <DeadlineField ... />
</aside>
```

`<Section>` — локальный sub-component для read-only пар label+value. `AssigneeField` и `DeadlineField` уже сами рендерят `label-caps` лейбл — переиспользуем как есть.

**Card variant** структура:
```jsx
<section className="surface-card p-5">
  <header className="-mx-5 -mt-5 mb-5 flex items-center justify-between gap-2 border-b border-border px-5 py-3">
    <h3 className="label-caps">Поля</h3>
  </header>
  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
    <Section label="Статус"><StatusPill status={status} /></Section>
    <Section label="Постановщик">{task.created_by_name ?? '—'}</Section>
    <AssigneeField ... />
    <DeadlineField ... />
  </div>
</section>
```

**Note по width**: sidebar variant внутри 320px колонки → `AssigneeField` editing form (AssigneeSelector + 2 кнопки) должен помещаться. AssigneeSelector — уже full-width. Datetime input в `DeadlineField` — `w-full`, влезет.

### 4.3. `TaskFieldsCard.jsx` — рефакторинг (extract)

**Изменение:** Вынести `DeadlineField`, `AssigneeField`, `toLocalInputValue`, `formatAbsoluteDeadline` из `TaskFieldsCard.jsx` в новые файлы:
- `src/components/tasks/fields/DeadlineField.jsx`
- `src/components/tasks/fields/AssigneeField.jsx`

Helpers (`toLocalInputValue`, `formatAbsoluteDeadline`) — внутри `DeadlineField.jsx` (private).

`TaskFieldsCard.jsx` остаётся в дереве (на случай защёлкнутых импортов в неожиданных местах), но переписывается на использование вынесенных компонентов. После итерации — grep на `TaskFieldsCard` и удалить файл, если не используется.

### 4.4. `StatusPill` — без изменений

Используется в header (рядом с title) **и** в TaskMetaSidebar (секция Статус). Один и тот же компонент, экспортируется или дублируется внутри файла — решение в plan'е.

---

## 5. Edge cases

- **Длинный sidebar.** На текущем наборе из 4 секций sidebar умещается в любую viewport-высоту. Заложен `xl:max-h-[calc(100vh-4rem)] xl:overflow-auto` на случай будущих секций.
- **Inline editing внутри sticky sidebar.** Datetime picker и AssigneeSelector — обычные DOM-элементы, sticky не мешает их dropdown'ам/popover'ам, т.к. они не используют portal с фиксированным позиционированием относительно viewport (или используют — нужно проверить AssigneeSelector в верификации).
- **Action-row на узком экране в xl-режиме.** На xl-мониторе с очень узким окном между sidebar app-shell и desktop-tweaks panel header может стать тесно — action-row уйдёт ниже title благодаря `flex-wrap`. Acceptable.
- **Скелетон.** Loading state должен соответствовать новой структуре — иначе при загрузке мигнёт «карточка Поля» → «sidebar».
- **`canEditTask` / `canReassign` логика** — переезжает в sidebar без изменений. Кто мог редактировать дедлайн/исполнителя в `TaskFieldsCard`, тот же может редактировать в sidebar.
- **Pencil-кнопки в sidebar.** На 320px width pencil-кнопка справа от label-caps остаётся видимой.

---

## 6. Verification (manual, browser)

После реализации проверить через preview-tools:

1. **Desktop ≥ xl (1280px+):**
   - Двухколоночная вёрстка отображается. Sidebar справа 320px.
   - Скролл основного контейнера: sidebar остаётся на месте (sticky работает).
   - Inline edit дедлайна: pencil → datetime input разворачивается, save работает.
   - Inline edit исполнителя (только для pending tasks): pencil → AssigneeSelector работает, save работает.
   - Action buttons справа от title в одну строку.
   - Мета-строки «От … · Исполнитель …» в шапке нет.

2. **`< xl` (≤ 1279px):**
   - Single column.
   - Карточка «Поля» появилась между Описанием и Отчётом, содержит те же 4 секции (Статус, Постановщик, Исполнитель, Дедлайн).
   - Action-row перенёсся под title.

3. **Status states:**
   - `pending` task (admin user): кнопки `Отменить задачу` отображаются; редактирование исполнителя — доступно.
   - `in_progress` task (assignee operator): `К отчёту` отображается; редактирование исполнителя — заблокировано (italic hint).
   - `done` task (admin): `Удалить задачу` отображается.
   - `cancelled` task: title с line-through; sidebar показывает финальный статус.

4. **Loading:**
   - Skeleton не мигает между layouts.

5. **Build / lint:**
   - `npm run build` — успех.
   - `npm run lint` — нет новых warnings.

---

## 7. Out of scope (обоснование явно)

- **Mobile (< sm) responsive sweep** — отложено в roadmap (`project_mobile_status.md`). Single-column fallback под `xl` достаточен для ноутбуков, на мобиле возможны другие проблемы (touch targets, sticky breakpoints), требует отдельного брейнсторма.
- **Visual redesign карточек Описания/Отчёта/Истории** — переезжает только обвязка, не сам контент.
- **Action overflow menu (⋯)** — defer. Текущий набор кнопок (max 4) укладывается в `flex-wrap` без визуального беспорядка. Если на практике увидим перенос в 2+ строки — добавим overflow-menu отдельной задачей.
- **Удаление `TaskFieldsCard.jsx`** — опционально после verify, отдельный мелкий коммит.
