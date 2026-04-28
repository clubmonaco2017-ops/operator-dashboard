# Task Detail — двухколоночная вёрстка Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести `TaskDetailPanel` на двухколоночную вёрстку (main + sticky sidebar 320px) на `xl+`, перенести meta (статус / постановщик / исполнитель / дедлайн) из шапки и карточки «Поля» в sidebar, перенести action-кнопки вправо от title, убрать дублирующуюся meta-строку.

**Architecture:** Локализованное изменение в `src/components/tasks/`. `DeadlineField` и `AssigneeField` извлекаются из `TaskFieldsCard.jsx` в отдельные файлы `tasks/fields/` для переиспользования. Новый `TaskMetaSidebar.jsx` с двумя вариантами (`sidebar` / `card`) рендерится в `TaskDetailPanel`: на `xl+` как sticky aside справа от main колонки, под `xl` — как карточка между описанием и отчётом. Header `TaskDetailPanel` перестраивается: actions переезжают вправо, meta-строка удаляется, `max-w-3xl` снимается на двухколоночном режиме.

**Tech Stack:** React 19 + Vite + Tailwind v4 + shadcn `<Button>` (Base UI). Без новых зависимостей. Без backend / RPC изменений. Без новых тестов (в проекте отсутствуют component tests для tasks; verification — manual browser + build/lint).

**Spec:** [docs/superpowers/specs/2026-04-28-task-detail-two-column-design.md](../specs/2026-04-28-task-detail-two-column-design.md)

---

## File structure

**Created — 4 files:**
- `src/components/tasks/StatusPill.jsx` — extracted из `TaskDetailPanel`. Чистый presentational компонент: `<StatusPill status={status} />`. Содержит `STATUS_LABELS` map и `statusPillClasses` helper. Переиспользуется и в `TaskDetailPanel` header, и в `TaskMetaSidebar` Статус-секции.
- `src/components/tasks/fields/DeadlineField.jsx` — extracted из `TaskFieldsCard`. Inline-edit дедлайна (datetime-local + Сохранить/Отмена/Очистить). Содержит private helpers `toLocalInputValue` и `formatAbsoluteDeadline`.
- `src/components/tasks/fields/AssigneeField.jsx` — extracted из `TaskFieldsCard`. Inline-edit исполнителя (`AssigneeSelector`). Содержит `ROLE_LABEL` map.
- `src/components/tasks/TaskMetaSidebar.jsx` — новый компонент. Props: `{ callerId, user, task, onChanged, status, variant: 'sidebar' | 'card' }`. Рендерит 4 секции: Статус, Постановщик, Исполнитель, Дедлайн. `variant='sidebar'` — без surface-card обёртки, секции `flex-col gap-5`. `variant='card'` — обёртка `surface-card` + header «Поля», 2-column grid для секций.

**Modified — 2 files:**
- `src/components/tasks/TaskFieldsCard.jsx` — после extract переписывается, чтобы импортировать `DeadlineField` и `AssigneeField` из новых файлов. Файл остаётся в дереве, но в `TaskDetailPanel` больше не вызывается.
- `src/components/tasks/TaskDetailPanel.jsx` — `StatusPill` extract, header restructure (action-кнопки справа от title, удаление meta-строки), body restructure (xl grid с sidebar, под xl — single column с card variant), skeleton sync, замена import `TaskFieldsCard` → `TaskMetaSidebar`.

**Deleted — 0 files в этом плане.** `TaskFieldsCard.jsx` остаётся как dead code до отдельного cleanup-коммита (Task 7, опциональный).

**Tests:** не добавляются. В проекте нет component tests для tasks; lib/tasks.js покрыт отдельно и не меняется. Verification — manual browser + `npm run build` + `npm run lint`.

---

## Setup

### Task 0: Verify baseline

**Files:** none (read-only).

- [ ] **Step 0.1: Check current branch and clean state**

```bash
git status
git log --oneline -3
```

Expected: рабочая ветка `feat/desktop-tweaks-nav-redesign`; HEAD на коммите spec'а (`820d7c4 docs(spec): task-detail two-column layout design`); рабочее дерево содержит только pre-existing modifications (прочие компоненты с modified-флагом — это не наша область, не трогать).

- [ ] **Step 0.2: Verify build & lint baseline**

```bash
npm run build
npm run lint
```

Expected: build успешен, lint без ошибок (могут быть существующие warnings — не считаем регрессией, если их количество не растёт).

- [ ] **Step 0.3: Verify tests baseline**

```bash
npm run test -- --run
```

Expected: все существующие тесты зелёные.

---

## Implementation

### Task 1: Extract `DeadlineField` into `tasks/fields/`

**Цель:** Вынести `DeadlineField` (вместе с private helpers) из `TaskFieldsCard.jsx` в отдельный файл, чтобы переиспользовать в `TaskMetaSidebar`. Behavior идентичен.

**Files:**
- Create: `src/components/tasks/fields/DeadlineField.jsx`
- Modify: `src/components/tasks/TaskFieldsCard.jsx` (удалить inline `DeadlineField` + helpers, добавить import из нового файла)

- [ ] **Step 1.1: Create `src/components/tasks/fields/DeadlineField.jsx`**

```jsx
import { useEffect, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import { useTaskActions } from '../../../hooks/useTaskActions.js'
import { formatDeadlineRelative } from '../../../lib/tasks.js'
import { Button } from '@/components/ui/button'

/**
 * Inline-editable дедлайн-поле для TaskDetailPanel / TaskMetaSidebar.
 * Behavior 1:1 c исходным DeadlineField из TaskFieldsCard.jsx.
 */
export function DeadlineField({ callerId, task, editable, onChanged }) {
  const { updateTask } = useTaskActions(callerId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(toLocalInputValue(task.deadline))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    setDraft(toLocalInputValue(task.deadline))
  }, [task.deadline])

  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])

  async function save() {
    const next = draft ? new Date(draft).toISOString() : null
    const cur = task.deadline ? new Date(task.deadline).toISOString() : null
    if (next === cur) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (next === null) {
        await updateTask(task.id, { clearDeadline: true })
      } else {
        await updateTask(task.id, { deadline: next })
      }
      setEditing(false)
      onChanged?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setDraft(toLocalInputValue(task.deadline))
    setEditing(false)
    setError(null)
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="block label-caps">Дедлайн</span>
        {editable && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md p-0.5 text-[var(--fg4)] hover:bg-muted hover:text-foreground"
            aria-label="Редактировать дедлайн"
          >
            <Pencil size={14} />
          </button>
        )}
      </div>
      {editing ? (
        <div>
          <input
            ref={ref}
            type="datetime-local"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={saving}
            className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-[var(--primary-ring)]"
          />
          {error && (
            <p className="mt-1 text-xs text-[var(--danger-ink)]" role="alert">
              {error}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <Button
              type="button"
              onClick={save}
              disabled={saving}
              className="text-xs px-3 py-1.5"
            >
              {saving ? 'Сохраняем…' : 'Сохранить'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={cancel}
              disabled={saving}
              className="text-xs px-3 py-1.5"
            >
              Отмена
            </Button>
            {draft && (
              <button
                type="button"
                onClick={() => setDraft('')}
                disabled={saving}
                className="text-xs text-muted-foreground hover:text-foreground rounded"
              >
                Очистить
              </button>
            )}
          </div>
        </div>
      ) : task.deadline ? (
        <p className="text-sm text-foreground">
          {formatAbsoluteDeadline(task.deadline)}{' '}
          <span className="text-xs text-muted-foreground">
            · {formatDeadlineRelative(task.deadline)}
          </span>
        </p>
      ) : (
        <p className="text-sm italic text-[var(--fg4)]">Без дедлайна</p>
      )}
    </div>
  )
}

// ============================================================================
// Helpers (private)
// ============================================================================

/**
 * ISO → datetime-local input value (YYYY-MM-DDTHH:MM в локальной TZ).
 */
function toLocalInputValue(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatAbsoluteDeadline(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
```

- [ ] **Step 1.2: Modify `src/components/tasks/TaskFieldsCard.jsx` — remove inline `DeadlineField` + helpers, import from new location**

Заменить содержимое файла на:

```jsx
import { useTaskActions } from '../../hooks/useTaskActions.js'
import { canEditTask } from '../../lib/tasks.js'
import { AssigneeSelector } from './AssigneeSelector.jsx'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { DeadlineField } from './fields/DeadlineField.jsx'

const ROLE_LABEL = {
  admin: 'Админ',
  superadmin: 'Суперадмин',
  teamlead: 'Тимлид',
  moderator: 'Модератор',
  operator: 'Оператор',
}

/**
 * Карточка «Поля» в TaskDetailPanel.
 * Два поля: Дедлайн (datetime-local) и Исполнитель (AssigneeSelector).
 *
 * Исполнителя можно менять только пока задача в статусе pending (I-8).
 */
export function TaskFieldsCard({ callerId, user, task, onChanged }) {
  const editable = canEditTask(user, task)
  const canReassign = editable && task.status === 'pending'

  return (
    <section className="surface-card p-5">
      <header className="-mx-5 -mt-5 mb-5 flex items-center justify-between gap-2 border-b border-border px-5 py-3">
        <h3 className="label-caps">Поля</h3>
      </header>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
        <DeadlineField
          callerId={callerId}
          task={task}
          editable={editable}
          onChanged={onChanged}
        />
        <AssigneeField
          callerId={callerId}
          task={task}
          editable={editable}
          canReassign={canReassign}
          onChanged={onChanged}
        />
      </div>
    </section>
  )
}

// ============================================================================
// Assignee (still inline — extracted in next task)
// ============================================================================

function AssigneeField({ callerId, task, editable, canReassign, onChanged }) {
  const { updateTask } = useTaskActions(callerId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.assigned_to ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setDraft(task.assigned_to ?? null)
  }, [task.assigned_to])

  async function save() {
    if (!draft || draft === task.assigned_to) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateTask(task.id, { assignedTo: draft })
      setEditing(false)
      onChanged?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setDraft(task.assigned_to ?? null)
    setEditing(false)
    setError(null)
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="block label-caps">Исполнитель</span>
        {canReassign && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md p-0.5 text-[var(--fg4)] hover:bg-muted hover:text-foreground"
            aria-label="Изменить исполнителя"
          >
            <Pencil size={14} />
          </button>
        )}
      </div>
      {editing ? (
        <div>
          <AssigneeSelector
            callerId={callerId}
            value={draft}
            onChange={setDraft}
            error={error}
            disabled={saving}
          />
          <div className="mt-2 flex items-center gap-2">
            <Button
              type="button"
              onClick={save}
              disabled={saving || !draft || draft === task.assigned_to}
              className="text-xs px-3 py-1.5"
            >
              {saving ? 'Сохраняем…' : 'Сохранить'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={cancel}
              disabled={saving}
              className="text-xs px-3 py-1.5"
            >
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm text-foreground">
            <span className="font-medium">{task.assigned_to_name ?? '—'}</span>
            {task.assigned_to_role && (
              <span className="ml-2 inline-flex items-center rounded bg-muted px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {ROLE_LABEL[task.assigned_to_role] || task.assigned_to_role}
              </span>
            )}
          </p>
          {editable && !canReassign && (
            <p className="mt-1 text-xs italic text-[var(--fg4)]">
              Можно изменить только для задач в ожидании
            </p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 1.3: Verify build + lint**

```bash
npm run build
npm run lint
```

Expected: build успешен, lint без новых ошибок.

- [ ] **Step 1.4: Manual smoke — TaskFieldsCard всё ещё работает как раньше**

В preview/dev сервере открыть задачу в `pending`-статусе под админом, открыть редактирование дедлайна (pencil) → datetime input появляется, save работает, отмена восстанавливает значение. Никакой визуальной/функциональной регрессии.

- [ ] **Step 1.5: Commit**

```bash
git add src/components/tasks/fields/DeadlineField.jsx src/components/tasks/TaskFieldsCard.jsx
git commit -m "$(cat <<'EOF'
refactor(tasks): extract DeadlineField from TaskFieldsCard

Pure refactor — pulls DeadlineField into tasks/fields/ for reuse in the
upcoming TaskMetaSidebar. Behavior unchanged.
EOF
)"
```

---

### Task 2: Extract `AssigneeField` into `tasks/fields/`

**Цель:** Вынести `AssigneeField` из `TaskFieldsCard.jsx` в отдельный файл. Behavior идентичен.

**Files:**
- Create: `src/components/tasks/fields/AssigneeField.jsx`
- Modify: `src/components/tasks/TaskFieldsCard.jsx` (удалить inline `AssigneeField` + `ROLE_LABEL`, добавить import)

- [ ] **Step 2.1: Create `src/components/tasks/fields/AssigneeField.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { useTaskActions } from '../../../hooks/useTaskActions.js'
import { AssigneeSelector } from '../AssigneeSelector.jsx'
import { Button } from '@/components/ui/button'

const ROLE_LABEL = {
  admin: 'Админ',
  superadmin: 'Суперадмин',
  teamlead: 'Тимлид',
  moderator: 'Модератор',
  operator: 'Оператор',
}

/**
 * Inline-editable исполнитель для TaskDetailPanel / TaskMetaSidebar.
 * Behavior 1:1 c исходным AssigneeField из TaskFieldsCard.jsx.
 *
 * canReassign = editable && task.status === 'pending' (I-8).
 */
export function AssigneeField({ callerId, task, editable, canReassign, onChanged }) {
  const { updateTask } = useTaskActions(callerId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.assigned_to ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setDraft(task.assigned_to ?? null)
  }, [task.assigned_to])

  async function save() {
    if (!draft || draft === task.assigned_to) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateTask(task.id, { assignedTo: draft })
      setEditing(false)
      onChanged?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setDraft(task.assigned_to ?? null)
    setEditing(false)
    setError(null)
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="block label-caps">Исполнитель</span>
        {canReassign && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md p-0.5 text-[var(--fg4)] hover:bg-muted hover:text-foreground"
            aria-label="Изменить исполнителя"
          >
            <Pencil size={14} />
          </button>
        )}
      </div>
      {editing ? (
        <div>
          <AssigneeSelector
            callerId={callerId}
            value={draft}
            onChange={setDraft}
            error={error}
            disabled={saving}
          />
          <div className="mt-2 flex items-center gap-2">
            <Button
              type="button"
              onClick={save}
              disabled={saving || !draft || draft === task.assigned_to}
              className="text-xs px-3 py-1.5"
            >
              {saving ? 'Сохраняем…' : 'Сохранить'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={cancel}
              disabled={saving}
              className="text-xs px-3 py-1.5"
            >
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm text-foreground">
            <span className="font-medium">{task.assigned_to_name ?? '—'}</span>
            {task.assigned_to_role && (
              <span className="ml-2 inline-flex items-center rounded bg-muted px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {ROLE_LABEL[task.assigned_to_role] || task.assigned_to_role}
              </span>
            )}
          </p>
          {editable && !canReassign && (
            <p className="mt-1 text-xs italic text-[var(--fg4)]">
              Можно изменить только для задач в ожидании
            </p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2.2: Modify `src/components/tasks/TaskFieldsCard.jsx` — remove inline `AssigneeField` + helpers, import from new location**

Заменить содержимое файла на:

```jsx
import { canEditTask } from '../../lib/tasks.js'
import { DeadlineField } from './fields/DeadlineField.jsx'
import { AssigneeField } from './fields/AssigneeField.jsx'

/**
 * Карточка «Поля» в TaskDetailPanel.
 * Два поля: Дедлайн (datetime-local) и Исполнитель (AssigneeSelector).
 *
 * Исполнителя можно менять только пока задача в статусе pending (I-8).
 */
export function TaskFieldsCard({ callerId, user, task, onChanged }) {
  const editable = canEditTask(user, task)
  const canReassign = editable && task.status === 'pending'

  return (
    <section className="surface-card p-5">
      <header className="-mx-5 -mt-5 mb-5 flex items-center justify-between gap-2 border-b border-border px-5 py-3">
        <h3 className="label-caps">Поля</h3>
      </header>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
        <DeadlineField
          callerId={callerId}
          task={task}
          editable={editable}
          onChanged={onChanged}
        />
        <AssigneeField
          callerId={callerId}
          task={task}
          editable={editable}
          canReassign={canReassign}
          onChanged={onChanged}
        />
      </div>
    </section>
  )
}
```

- [ ] **Step 2.3: Verify build + lint**

```bash
npm run build
npm run lint
```

Expected: build успешен, lint без новых ошибок.

- [ ] **Step 2.4: Manual smoke — TaskFieldsCard визуально и функционально идентичен**

Открыть задачу в `pending` под админом, проверить редактирование исполнителя (pencil → AssigneeSelector → save). Открыть задачу в `in_progress` — pencil рядом с «Исполнитель» отсутствует, italic-hint «Можно изменить только для задач в ожидании» виден.

- [ ] **Step 2.5: Commit**

```bash
git add src/components/tasks/fields/AssigneeField.jsx src/components/tasks/TaskFieldsCard.jsx
git commit -m "$(cat <<'EOF'
refactor(tasks): extract AssigneeField from TaskFieldsCard

Pure refactor — pulls AssigneeField into tasks/fields/ for reuse in the
upcoming TaskMetaSidebar. Behavior unchanged.
EOF
)"
```

---

### Task 3: Extract `StatusPill` to shared file

**Цель:** Вынести `StatusPill` (и его helpers `STATUS_LABELS`, `statusPillClasses`) из `TaskDetailPanel.jsx` в отдельный файл, чтобы переиспользовать в `TaskMetaSidebar`. Behavior идентичен.

**Files:**
- Create: `src/components/tasks/StatusPill.jsx`
- Modify: `src/components/tasks/TaskDetailPanel.jsx` (удалить inline `StatusPill` + helpers, добавить import)

- [ ] **Step 3.1: Create `src/components/tasks/StatusPill.jsx`**

```jsx
const STATUS_LABELS = {
  pending: 'В ожидании',
  in_progress: 'В работе',
  done: 'Завершена',
  overdue: 'Просрочена',
  cancelled: 'Отменена',
}

function statusPillClasses(status) {
  switch (status) {
    case 'in_progress':
      return 'bg-[var(--primary-soft)] text-[var(--primary-ink)]'
    case 'done':
      return 'bg-[var(--success-soft)] text-[var(--success-ink)]'
    case 'overdue':
      return 'bg-[var(--danger-soft)] text-[var(--danger-ink)]'
    case 'cancelled':
      return 'bg-muted text-muted-foreground'
    case 'pending':
    default:
      return 'bg-muted text-[var(--fg2)]'
  }
}

export function StatusPill({ status }) {
  const label = STATUS_LABELS[status] ?? status
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        statusPillClasses(status),
      ].join(' ')}
      title={label}
    >
      {label}
    </span>
  )
}
```

- [ ] **Step 3.2: Modify `src/components/tasks/TaskDetailPanel.jsx` — remove inline `StatusPill`, import from new location**

Добавить новый import рядом с другими (например, после `import { Button } …`):

```jsx
import { StatusPill } from './StatusPill.jsx'
```

Удалить из файла блок `STATUS_LABELS`, `statusPillClasses` и `function StatusPill(...)` (текущие строки ~317-354).

- [ ] **Step 3.3: Verify build + lint**

```bash
npm run build
npm run lint
```

Expected: build успешен, lint без новых ошибок.

- [ ] **Step 3.4: Manual smoke — pill в шапке детали выглядит идентично**

Открыть задачу — `StatusPill` рядом с title рендерится как раньше (цвет соответствует статусу).

- [ ] **Step 3.5: Commit**

```bash
git add src/components/tasks/StatusPill.jsx src/components/tasks/TaskDetailPanel.jsx
git commit -m "$(cat <<'EOF'
refactor(tasks): extract StatusPill into its own file

Pure refactor — pulls StatusPill out of TaskDetailPanel for reuse in the
upcoming TaskMetaSidebar. Behavior unchanged.
EOF
)"
```

---

### Task 4: Create `TaskMetaSidebar` component

**Цель:** Создать новый компонент с двумя вариантами рендеринга (`sidebar` / `card`). Не интегрируется ни во что — отдельный файл, готовый к использованию.

**Files:**
- Create: `src/components/tasks/TaskMetaSidebar.jsx`

- [ ] **Step 4.1: Create `src/components/tasks/TaskMetaSidebar.jsx`**

```jsx
import { canEditTask } from '../../lib/tasks.js'
import { StatusPill } from './StatusPill.jsx'
import { DeadlineField } from './fields/DeadlineField.jsx'
import { AssigneeField } from './fields/AssigneeField.jsx'

function ReadonlySection({ label, children }) {
  return (
    <div>
      <span className="block label-caps mb-1">{label}</span>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  )
}

/**
 * Sidebar с meta-полями задачи: Статус, Постановщик, Исполнитель, Дедлайн.
 *
 * variant='sidebar' — для xl+ двухколоночной вёрстки. Без surface-card обёртки,
 *   секции в `flex-col gap-5`, опциональная левая граница.
 * variant='card'    — для < xl single-column режима. Обёрнут в surface-card
 *   с заголовком «Поля», секции в 2-column grid (md+).
 */
export function TaskMetaSidebar({ callerId, user, task, status, onChanged, variant = 'sidebar' }) {
  const editable = canEditTask(user, task)
  const canReassign = editable && task.status === 'pending'

  const statusSection = (
    <ReadonlySection label="Статус">
      <StatusPill status={status} />
    </ReadonlySection>
  )
  const creatorSection = (
    <ReadonlySection label="Постановщик">
      <span className="font-medium">{task.created_by_name ?? '—'}</span>
    </ReadonlySection>
  )
  const assigneeSection = (
    <AssigneeField
      callerId={callerId}
      task={task}
      editable={editable}
      canReassign={canReassign}
      onChanged={onChanged}
    />
  )
  const deadlineSection = (
    <DeadlineField
      callerId={callerId}
      task={task}
      editable={editable}
      onChanged={onChanged}
    />
  )

  if (variant === 'card') {
    return (
      <section className="surface-card p-5">
        <header className="-mx-5 -mt-5 mb-5 flex items-center justify-between gap-2 border-b border-border px-5 py-3">
          <h3 className="label-caps">Поля</h3>
        </header>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
          {statusSection}
          {creatorSection}
          {assigneeSection}
          {deadlineSection}
        </div>
      </section>
    )
  }

  // variant === 'sidebar'
  return (
    <aside
      className="flex flex-col gap-5"
      aria-label="Свойства задачи"
    >
      {statusSection}
      {creatorSection}
      {assigneeSection}
      {deadlineSection}
    </aside>
  )
}
```

- [ ] **Step 4.2: Verify build + lint**

```bash
npm run build
npm run lint
```

Expected: build успешен, lint без новых ошибок. Файл изолирован от потребителей — он ещё не подключён в `TaskDetailPanel`.

- [ ] **Step 4.3: Commit**

```bash
git add src/components/tasks/TaskMetaSidebar.jsx
git commit -m "$(cat <<'EOF'
feat(tasks): add TaskMetaSidebar component (sidebar/card variants)

Standalone meta panel rendering 4 sections — Статус, Постановщик,
Исполнитель, Дедлайн — with two layout variants:
- sidebar: flat flex-col for xl+ two-column TaskDetailPanel
- card: surface-card wrapper with «Поля» header for < xl fallback

Not yet wired into TaskDetailPanel — that's the next task.
EOF
)"
```

---

### Task 5: Replace `TaskFieldsCard` with `TaskMetaSidebar(card)` in `TaskDetailPanel`, keep header as-is

**Цель:** Заменить использование `TaskFieldsCard` на `TaskMetaSidebar(variant="card")` — promova меняется минимально (новая карточка показывает 4 секции вместо 2). Header пока не трогаем, single-column пока не трогаем. Это безопасный промежуточный шаг.

**Files:**
- Modify: `src/components/tasks/TaskDetailPanel.jsx` (заменить import + JSX usage)

- [ ] **Step 5.1: Modify `src/components/tasks/TaskDetailPanel.jsx` — swap TaskFieldsCard for TaskMetaSidebar**

В строке 14 заменить import:

```jsx
// было:
import { TaskFieldsCard } from './TaskFieldsCard.jsx'
// стало:
import { TaskMetaSidebar } from './TaskMetaSidebar.jsx'
```

В body-блоке (текущие строки ~268-288) заменить вызов `<TaskFieldsCard …/>` на `<TaskMetaSidebar …/>`:

```jsx
<div className="mx-auto flex max-w-3xl flex-col gap-4">
  <TaskDescriptionCard
    callerId={callerId}
    user={user}
    task={row}
    onChanged={bothChanged}
  />
  <TaskMetaSidebar
    callerId={callerId}
    user={user}
    task={row}
    status={status}
    onChanged={bothChanged}
    variant="card"
  />
  <TaskReportCard
    callerId={callerId}
    user={user}
    task={row}
    onChanged={bothChanged}
  />
  <TaskActivityCard activity={row.activity || []} />
</div>
```

- [ ] **Step 5.2: Verify build + lint**

```bash
npm run build
npm run lint
```

Expected: build успешен, lint без новых ошибок.

- [ ] **Step 5.3: Manual smoke**

В preview открыть задачу. Карточка «Поля» теперь содержит 4 секции (Статус, Постановщик, Исполнитель, Дедлайн) вместо 2. Inline editing работает (дедлайн, исполнитель). Status pill в карточке отображается.

- [ ] **Step 5.4: Commit**

```bash
git add src/components/tasks/TaskDetailPanel.jsx
git commit -m "$(cat <<'EOF'
refactor(tasks): swap TaskFieldsCard for TaskMetaSidebar in detail panel

Drop-in replacement — same single-column layout, but the «Поля» card now
renders 4 sections (adds Статус + Постановщик alongside Исполнитель +
Дедлайн). Sets up the next step where this card moves into a sidebar on
xl+ and the header sheds its duplicate meta line.
EOF
)"
```

---

### Task 6: Header restructure — move actions right, remove meta line

**Цель:** Перестроить `<header>` в `TaskDetailPanel`: action-кнопки переезжают вправо от title-блока, дублирующаяся meta-строка («От … · Исполнитель … · Дедлайн …») удаляется. Body всё ещё single-column.

**Files:**
- Modify: `src/components/tasks/TaskDetailPanel.jsx` (header JSX + skeleton header JSX)

- [ ] **Step 6.1: Modify header JSX в `TaskDetailPanel.jsx`**

Заменить блок `{/* Header */}` (текущие строки ~188-264) на:

```jsx
{/* Header */}
<header className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5 pb-4">
  <div className="min-w-0 flex flex-wrap items-baseline gap-2">
    <h1
      className={[
        'truncate text-xl font-bold text-foreground',
        cancelled && 'line-through opacity-70',
      ]
        .filter(Boolean)
        .join(' ')}
      title={row.title}
    >
      {row.title}
    </h1>
    <StatusPill status={status} />
  </div>

  {(showTake || showSubmitJump || showCancel || showDelete) && (
    <div className="flex flex-wrap items-center gap-2 shrink-0">
      {showTake && (
        <Button
          type="button"
          onClick={handleTakeInProgress}
          disabled={actionBusy || actions.mutating}
        >
          {actionBusy ? 'Берём…' : 'Взял в работу'}
        </Button>
      )}
      {showSubmitJump && (
        <Button
          type="button"
          onClick={scrollToReport}
        >
          К отчёту
        </Button>
      )}
      {showCancel && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setCancelOpen(true)}
          disabled={actionBusy || actions.mutating}
          className="text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]"
        >
          Отменить задачу
        </Button>
      )}
      {showDelete && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setDeleteOpen(true)}
          disabled={actionBusy || actions.mutating}
          className="text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]"
        >
          Удалить задачу
        </Button>
      )}
    </div>
  )}
</header>
```

Изменения по сравнению с текущим:
- Внешний `<header>`: `flex flex-wrap items-start justify-between gap-3` (было просто `px-6 pt-5 pb-4`).
- Padding `px-6 pt-5 pb-4` сохраняем на header, но теперь он flex-родитель.
- Title-блок обёрнут в `<div className="min-w-0 flex flex-wrap items-baseline gap-2">` — гарантирует, что title не выпихивает actions за viewport на узких ширинах.
- Параграф `<p className="mt-1.5 text-sm text-muted-foreground">От … · Исполнитель … · Дедлайн …</p>` — **удалён полностью**.
- Action-блок: `flex flex-wrap items-center gap-2 shrink-0` (было `mt-4 flex flex-wrap gap-2`). `shrink-0` нужен, чтобы action-блок не сжимался — на узких ширинах он переносится строкой ниже благодаря `flex-wrap` на `<header>`.

- [ ] **Step 6.2: Modify skeleton header JSX в `TaskDetailSkeleton`**

Заменить `<header>` блок в `TaskDetailSkeleton` (текущие строки ~406-416) на:

```jsx
{/* Header */}
<header className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5 pb-4">
  <div className="min-w-0 flex flex-wrap items-baseline gap-2">
    <div className="h-7 w-72 animate-pulse rounded bg-muted" />
    <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
  </div>
  <div className="flex gap-2 shrink-0">
    <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
  </div>
</header>
```

Изменения: убрана meta-строка skeleton (`<div className="mt-2 h-3 w-1/2 …" />`); action-row теперь справа; title shimmer стал шире (`w-72` вместо `w-3/5`, потому что освободилось пространство).

- [ ] **Step 6.3: Verify build + lint**

```bash
npm run build
npm run lint
```

Expected: build успешен, lint без новых ошибок.

- [ ] **Step 6.4: Manual smoke**

В preview/dev открыть задачи разных статусов:
- `pending` admin: title слева + status pill, action-блок справа (`Взял в работу` + `Отменить задачу`). Meta-строки «От vedvoy X · Исполнитель vip1 X · Дедлайн завтра» нет.
- `in_progress` operator-assignee: action-блок содержит `К отчёту` + `Отменить задачу`.
- `done` admin: action-блок содержит `Удалить задачу`.
- Узкое окно браузера: action-блок переносится строкой ниже title.

Все meta-данные теперь видны только в карточке «Поля» ниже.

- [ ] **Step 6.5: Commit**

```bash
git add src/components/tasks/TaskDetailPanel.jsx
git commit -m "$(cat <<'EOF'
feat(tasks): restructure detail header — actions right, meta line dropped

Title + status pill stay left; action buttons (Взял / К отчёту /
Отменить / Удалить) move to the right side of the header in a single
flex row, wrapping below title on narrow widths. The «От … · Исполнитель
… · Дедлайн …» meta paragraph is gone — TaskMetaSidebar already covers
that. No two-column body yet; that's the next task.
EOF
)"
```

---

### Task 7: Two-column body layout (xl+)

**Цель:** На `xl+` body становится grid `1fr / 320px`. На `xl+` `TaskMetaSidebar` рендерится как sticky aside справа (variant="sidebar"). Под `xl` остаётся карточка между Описанием и Отчётом (variant="card"). `max-w-3xl` снимается на двухколоночном режиме.

**Files:**
- Modify: `src/components/tasks/TaskDetailPanel.jsx` (body JSX + skeleton body JSX)

- [ ] **Step 7.1: Modify body JSX в `TaskDetailPanel.jsx`**

Заменить блок `{/* Body */}` (после header) на:

```jsx
{/* Body */}
<div className="flex-1 overflow-auto bg-background">
  <div className="px-4 py-5 sm:px-6 xl:px-8">
    <div className="mx-auto flex max-w-3xl flex-col gap-4 xl:max-w-none xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-6">
      {/* Main column */}
      <div className="flex min-w-0 flex-col gap-4">
        <TaskDescriptionCard
          callerId={callerId}
          user={user}
          task={row}
          onChanged={bothChanged}
        />
        {/* Meta as card — single-column режим, скрыт на xl+ */}
        <div className="xl:hidden">
          <TaskMetaSidebar
            callerId={callerId}
            user={user}
            task={row}
            status={status}
            onChanged={bothChanged}
            variant="card"
          />
        </div>
        <TaskReportCard
          callerId={callerId}
          user={user}
          task={row}
          onChanged={bothChanged}
        />
        <TaskActivityCard activity={row.activity || []} />
      </div>
      {/* Sidebar — только xl+ */}
      <aside className="hidden xl:block xl:sticky xl:top-5 xl:self-start xl:max-h-[calc(100vh-3rem)] xl:overflow-auto">
        <TaskMetaSidebar
          callerId={callerId}
          user={user}
          task={row}
          status={status}
          onChanged={bothChanged}
          variant="sidebar"
        />
      </aside>
    </div>
  </div>
</div>
```

Notes:
- Внешний скролл-контейнер `<div className="flex-1 overflow-auto bg-background">` сохранён (это родитель для sticky).
- Внутренний `<div>` несёт padding (`px-4 py-5 sm:px-6 xl:px-8`).
- На `xl+`: `xl:max-w-none xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-6` — флекс становится гридом, max-width снимается. Под `xl` остаётся `mx-auto flex max-w-3xl flex-col gap-4`.
- `min-w-0` на main column нужен, чтобы grid item не растягивался по непереносимому контенту (длинные URL в описании и т.п.).
- `xl:top-5` — sidebar отступает от верха overflow-auto скролл-контейнера на величину `py-5` внутреннего padding'а — sidebar окажется визуально на одной горизонтали с верхом первой карточки main-колонки.
- `xl:max-h-[calc(100vh-3rem)] xl:overflow-auto` — fallback на случай длинного sidebar (за счёт топбара + хедера примерно `~96px`, оставляем запас `48px`).
- Card variant под `xl` скрывается через `xl:hidden`. Sidebar variant над `xl` скрывается `hidden xl:block`. Никакого dual-render выпадания не происходит.

- [ ] **Step 7.2: Modify skeleton body JSX в `TaskDetailSkeleton`**

Заменить `{/* Body cards */}` блок на:

```jsx
{/* Body */}
<div className="flex-1 overflow-hidden bg-background">
  <div className="px-4 py-5 sm:px-6 xl:px-8">
    <div className="mx-auto flex max-w-3xl flex-col gap-4 xl:max-w-none xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-6">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="surface-card h-32 animate-pulse" />
        <div className="surface-card h-40 animate-pulse xl:hidden" />
        <div className="surface-card h-48 animate-pulse" />
        <div className="surface-card h-32 animate-pulse" />
      </div>
      <aside className="hidden xl:block xl:sticky xl:top-5 xl:self-start">
        <div className="flex flex-col gap-5">
          <div className="h-10 w-full animate-pulse rounded bg-muted/70" />
          <div className="h-10 w-full animate-pulse rounded bg-muted/70" />
          <div className="h-12 w-full animate-pulse rounded bg-muted/70" />
          <div className="h-12 w-full animate-pulse rounded bg-muted/70" />
        </div>
      </aside>
    </div>
  </div>
</div>
```

- [ ] **Step 7.3: Verify build + lint**

```bash
npm run build
npm run lint
```

Expected: build успешен, lint без новых ошибок.

- [ ] **Step 7.4: Manual smoke на разных ширинах**

Открыть preview/dev и проверить:

**`xl+` (≥ 1280px window width):**
- Двухколоночная вёрстка: main слева, sidebar справа 320px.
- Sidebar содержит 4 секции (Статус, Постановщик, Исполнитель, Дедлайн) без surface-card обёртки и без заголовка «Поля».
- Карточка «Поля» в основной колонке отсутствует.
- Скролл основного контейнера: sidebar остаётся на месте (sticky работает).
- Inline edit дедлайна и исполнителя работает внутри sidebar.
- Action buttons справа от title в шапке.

**< `xl` (< 1280px window width):**
- Single-column. `max-w-3xl` действует.
- Карточка «Поля» (с заголовком) появилась между Описанием и Отчётом.
- Sidebar справа отсутствует.
- Action-row под title (если узко) или справа от title (если ещё помещается).

**Resize live:** изменить ширину окна туда-обратно — переход между layouts происходит без визуальных артефактов / не залипает контент.

- [ ] **Step 7.5: Commit**

```bash
git add src/components/tasks/TaskDetailPanel.jsx
git commit -m "$(cat <<'EOF'
feat(tasks): two-column TaskDetailPanel on xl+ (sticky sidebar 320px)

Body becomes a grid (minmax(0,1fr) + 320px) at xl+. TaskMetaSidebar
renders as a sticky aside on xl+ (variant=sidebar) and stays as a card
between description and report on smaller widths (variant=card). The
max-w-3xl single-column constraint is preserved below xl, dropped on
the grid.

Closes the design from docs/superpowers/specs/2026-04-28-task-detail-two-column-design.md.
EOF
)"
```

---

### Task 8 (optional): Remove obsolete `TaskFieldsCard.jsx`

**Цель:** Удалить файл `TaskFieldsCard.jsx`, если он больше не импортируется. Опциональный финальный шаг — отделён от основного PR'а на случай, если что-то всплывёт в верификации.

**Files:**
- Delete: `src/components/tasks/TaskFieldsCard.jsx`

- [ ] **Step 8.1: Verify no remaining imports**

```bash
grep -rn "TaskFieldsCard" src/
```

Expected: ноль результатов. Если есть — НЕ удалять, разобраться с usage'ами.

- [ ] **Step 8.2: Delete the file**

```bash
git rm src/components/tasks/TaskFieldsCard.jsx
```

- [ ] **Step 8.3: Verify build + lint + tests**

```bash
npm run build
npm run lint
npm run test -- --run
```

Expected: всё зелёное.

- [ ] **Step 8.4: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore(tasks): drop unused TaskFieldsCard.jsx

Replaced by TaskMetaSidebar (variant=card) — no remaining imports.
EOF
)"
```

---

## Final verification

После всех тасков (минимум T1–T7):

- [ ] **`npm run build`** — успех.
- [ ] **`npm run lint`** — без новых ошибок.
- [ ] **`npm run test -- --run`** — все существующие тесты зелёные.
- [ ] **Manual browser smoke matrix:**
  - Desktop ≥ xl: двухколонка, sticky sidebar, inline edit обоих полей работают, action-кнопки в шапке.
  - Desktop < xl (узкое окно или resize): single-column, карточка «Поля» между описанием и отчётом, action-кнопки справа от title или ниже.
  - Status states: `pending` admin (с `Взял`/`Отменить`), `in_progress` operator-assignee (с `К отчёту`), `done` admin (с `Удалить`), `cancelled` (title с line-through).
  - Skeleton: загрузка задачи показывает корректные плейсхолдеры в обоих режимах (resize во время загрузки не вызывает аномалий — допустимо если skeleton просто перерисовывается).

---

## Out of scope (не в этом плане)

- Mobile (< sm) responsive sweep — отдельная задача в roadmap.
- Visual redesign карточек Описание/Отчёт/История.
- Action overflow menu (`⋯`).
- Тесты для `TaskMetaSidebar` / `DeadlineField` / `AssigneeField` — нет существующего паттерна component tests для tasks; добавлять одну изолированную точку покрытия = inconsistent. Если в будущем команда заведёт component-tests баесплат для tasks, эти три компонента — хорошие кандидаты первой очереди.
