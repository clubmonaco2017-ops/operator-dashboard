# CRM Subplan 6A8 — StaffList master-detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести `/staff` (Сотрудники) на `MasterDetailLayout` для визуальной унификации с Clients/Teams/Tasks; перенести `StaffCreatePage` в `CreateStaffSlideOut`; DS-token swap master-layer файлов; удалить устаревшие `StaffTable/CardList/PageShell/CreatePage`.

**Architecture:** Following `TeamListPage` pattern — `<MasterDetailLayout>` shell with `<ListPane>` (search + filter chips + create button + scrollable list) on the left and `<Outlet>` rendering `StaffDetailPanel` on the right. Routes nested under `/staff/:refCode/<tab>`; existing tab components (`ProfileTab`, `AttributesTab`, `PermissionsTab`, `ActivityTab`) reused as-is via outlet context.

**Tech Stack:** React 19 + Vite + Tailwind CSS v4 + shadcn/ui (Button, Input, Select, Checkbox) + react-router-dom v6 nested routes + Supabase RPC (`list_staff`, `create_staff`, `get_staff_detail`) + Vitest/Testing-Library.

**Spec:** [`docs/superpowers/specs/2026-04-27-crm-subplan-6a8-stafflist-master-detail-design.md`](../specs/2026-04-27-crm-subplan-6a8-stafflist-master-detail-design.md)

**Reference patterns (read before coding):**
- `src/pages/TeamListPage.jsx` — master-detail shell + outlet context + skeleton + create open state
- `src/components/teams/TeamListItem.jsx` — list item with selected highlight
- `src/components/teams/TeamDetailPanel.jsx` — detail panel with tabs
- `src/components/teams/CreateTeamSlideOut.jsx` — slide-out form pattern (esc/cmd-enter, backdrop, footer)
- `src/components/teams/EmptyFilter.jsx` + `EmptyZero.jsx` + `DetailEmptyHint.jsx`

---

## File Structure

**Created (new):**
- `src/components/staff/StaffListItem.jsx` — single row in list (avatar + name + role badge + status)
- `src/components/staff/StaffList.jsx` — `<ul>` rendering items
- `src/components/staff/EmptyZero.jsx` — no staff exist (with create CTA)
- `src/components/staff/EmptyFilter.jsx` — staff exist but filtered out
- `src/components/staff/DetailEmptyHint.jsx` — right-pane empty state
- `src/components/staff/StaffDetailPanel.jsx` — wraps existing tabs + header card + tab nav + actions
- `src/components/staff/CreateStaffSlideOut.jsx` — slide-out form replacing StaffCreatePage

**Tests (new):**
- `src/components/staff/StaffList.test.jsx`
- `src/components/staff/CreateStaffSlideOut.test.jsx`

**Modified:**
- `src/pages/StaffListPage.jsx` — full rewrite (master-detail shell + create state + useParams + skeleton; exports `StaffListPage`, `StaffDetailRoute`, `StaffDetailEmpty`)
- `src/components/staff/StaffFilterChips.jsx` — DS token swap (no logic change)
- `src/App.jsx` — restructure /staff routes to nested pattern + add `/staff/new` redirect

**Deleted:**
- `src/pages/StaffCreatePage.jsx` (216 LOC)
- `src/pages/StaffDetailPage.jsx` (124 LOC) — logic absorbed into `StaffDetailPanel` + `StaffDetailRoute`
- `src/components/staff/StaffPageShell.jsx` (94 LOC) — replaced by `StaffDetailPanel`
- `src/components/staff/StaffTable.jsx` (109 LOC)
- `src/components/staff/StaffCardList.jsx` (58 LOC)

**Branching:** Feature branch `feat/subplan-6a8-stafflist-master-detail` off main.

---

## Task 0: Setup — branch off main

**Files:** none

- [ ] **Step 1: Verify clean working tree on main**

Run: `git status`
Expected: `On branch main`, `nothing to commit, working tree clean`. Pull latest if needed: `git pull`.

- [ ] **Step 2: Create and switch to feature branch**

Run: `git checkout -b feat/subplan-6a8-stafflist-master-detail`
Expected: `Switched to a new branch 'feat/subplan-6a8-stafflist-master-detail'`

- [ ] **Step 3: Verify baseline build/test**

Run: `npm test -- --run`
Expected: 220/220 tests passing.

Run: `npm run build`
Expected: clean build, no errors.

---

## Task 1: StaffListItem component

**Files:**
- Create: `src/components/staff/StaffListItem.jsx`

Single row of staff list. Avatar + name + role badge + status dot + email/ref_code subtitle. Selected highlight via `useParams().refCode === row.ref_code`.

- [ ] **Step 1: Create StaffListItem.jsx**

```jsx
import { Link } from 'react-router-dom'

const ROLE_BADGE_COLOR = {
  superadmin: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  admin:      'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  moderator:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  teamlead:   'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  operator:   'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

const ROLE_LABEL = {
  superadmin: 'СА',
  admin:      'Адм',
  moderator:  'Мод',
  teamlead:   'ТЛ',
  operator:   'ОП',
}

// Намеренное DS-исключение: 5-цветная палитра ролей сохранена через прямые
// Tailwind utility-классы. Устойчивая визуальная семантика > чистота DS.
// См. spec §1 «Out of scope — 5-color role-badge palette».

function initialsOf(firstName, lastName) {
  return (
    (firstName?.[0] ?? '').toUpperCase() + (lastName?.[0] ?? '').toUpperCase()
  )
}

export function StaffListItem({ row, isActive }) {
  const archived = !row.is_active
  const initials = initialsOf(row.first_name, row.last_name) || '?'
  return (
    <Link
      to={`/staff/${encodeURIComponent(row.ref_code)}`}
      className={[
        'group relative flex items-center gap-3 px-4 py-2.5 outline-none transition-colors',
        'border-l-2',
        isActive
          ? 'border-l-primary bg-muted'
          : 'border-l-transparent hover:bg-muted/60',
      ].join(' ')}
      aria-current={isActive ? 'true' : undefined}
    >
      <div
        className={[
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          archived
            ? 'bg-muted text-muted-foreground/60'
            : 'bg-muted text-muted-foreground',
        ].join(' ')}
      >
        {initials}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            title={`${row.first_name} ${row.last_name}`.trim()}
            className={[
              'truncate text-sm',
              isActive
                ? 'font-semibold text-foreground'
                : 'font-medium text-[var(--fg2)]',
              archived && 'opacity-60',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {row.first_name} {row.last_name}
          </span>
          <span
            className={[
              'shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold',
              ROLE_BADGE_COLOR[row.role] ?? 'bg-muted text-muted-foreground',
            ].join(' ')}
          >
            {ROLE_LABEL[row.role] ?? row.role}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{row.email}</span>
          <span className="font-mono text-[var(--fg4)]">{row.ref_code}</span>
        </div>
      </div>

      <span
        className={[
          'h-2 w-2 shrink-0 rounded-full',
          row.is_active ? 'bg-emerald-500' : 'bg-muted-foreground',
        ].join(' ')}
        aria-label={row.is_active ? 'Активен' : 'Неактивен'}
      />
    </Link>
  )
}
```

- [ ] **Step 2: Verify file compiles via build**

Run: `npm run build`
Expected: clean build (file is unused but imported during list integration in Task 5).

- [ ] **Step 3: Commit**

```bash
git add src/components/staff/StaffListItem.jsx
git commit -m "feat(staff): add StaffListItem component for master-detail list

Subplan 6A8 task 1. Compact list-item with avatar, name, role badge, email/ref_code, status dot. Selected highlight via border-l-primary + bg-muted. 5-color role palette retained as DS exception per spec §1."
```

---

## Task 2: StaffList + test

**Files:**
- Create: `src/components/staff/StaffList.jsx`
- Create: `src/components/staff/StaffList.test.jsx`

- [ ] **Step 1: Write failing test**

`src/components/staff/StaffList.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { StaffList } from './StaffList.jsx'

const ROWS = [
  {
    id: 1,
    first_name: 'Иван',
    last_name: 'Петров',
    email: 'ivan@example.com',
    ref_code: 'OP-IPE-001',
    role: 'operator',
    is_active: true,
  },
  {
    id: 2,
    first_name: 'Анна',
    last_name: 'Смирнова',
    email: 'anna@example.com',
    ref_code: 'AD-ASM-002',
    role: 'admin',
    is_active: true,
  },
  {
    id: 3,
    first_name: 'Олег',
    last_name: 'Кузнецов',
    email: 'oleg@example.com',
    ref_code: 'TL-OKU-003',
    role: 'teamlead',
    is_active: false,
  },
]

function renderList(props) {
  return render(
    <MemoryRouter>
      <StaffList rows={ROWS} {...props} />
    </MemoryRouter>,
  )
}

describe('<StaffList>', () => {
  it('renders one row per staff member', () => {
    renderList({ selectedRefCode: null })
    expect(screen.getByText('Иван Петров')).toBeInTheDocument()
    expect(screen.getByText('Анна Смирнова')).toBeInTheDocument()
    expect(screen.getByText('Олег Кузнецов')).toBeInTheDocument()
  })

  it('renders link with encoded refCode', () => {
    renderList({ selectedRefCode: null })
    const link = screen.getByText('Иван Петров').closest('a')
    expect(link).toHaveAttribute('href', '/staff/OP-IPE-001')
  })

  it('marks selected row with aria-current', () => {
    renderList({ selectedRefCode: 'AD-ASM-002' })
    const link = screen.getByText('Анна Смирнова').closest('a')
    expect(link).toHaveAttribute('aria-current', 'true')
  })

  it('renders role label badge', () => {
    renderList({ selectedRefCode: null })
    expect(screen.getByText('ОП')).toBeInTheDocument()
    expect(screen.getByText('Адм')).toBeInTheDocument()
    expect(screen.getByText('ТЛ')).toBeInTheDocument()
  })

  it('renders email and ref_code as subtitle', () => {
    renderList({ selectedRefCode: null })
    expect(screen.getByText('ivan@example.com')).toBeInTheDocument()
    expect(screen.getByText('OP-IPE-001')).toBeInTheDocument()
  })

  it('renders status dot with active aria-label', () => {
    renderList({ selectedRefCode: null })
    const activeDots = screen.getAllByLabelText('Активен')
    const inactiveDots = screen.getAllByLabelText('Неактивен')
    expect(activeDots).toHaveLength(2)
    expect(inactiveDots).toHaveLength(1)
  })

  it('renders empty list when rows is empty', () => {
    render(
      <MemoryRouter>
        <StaffList rows={[]} selectedRefCode={null} />
      </MemoryRouter>,
    )
    const items = screen.queryAllByRole('listitem')
    expect(items).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npm test -- --run StaffList.test`
Expected: FAIL with `Cannot find module './StaffList.jsx'`.

- [ ] **Step 3: Create StaffList.jsx (minimal implementation)**

`src/components/staff/StaffList.jsx`:

```jsx
import { StaffListItem } from './StaffListItem.jsx'

/**
 * Master-список сотрудников. Не управляет фильтрами / поиском — просто рендерит.
 *
 * @param {object} props
 * @param {Array} props.rows — отфильтрованный массив сотрудников
 * @param {string|null} props.selectedRefCode — ref_code выбранного сотрудника
 */
export function StaffList({ rows, selectedRefCode }) {
  return (
    <ul className="flex flex-col py-1">
      {rows.map((row) => (
        <li key={row.id}>
          <StaffListItem row={row} isActive={row.ref_code === selectedRefCode} />
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `npm test -- --run StaffList.test`
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/staff/StaffList.jsx src/components/staff/StaffList.test.jsx
git commit -m "feat(staff): add StaffList component + tests

Subplan 6A8 task 2. Renders <ul> of <StaffListItem>, selected row marked with aria-current. 7 unit tests covering rendering, link encoding, selected state, role labels, subtitle, status dots, empty list."
```

---

## Task 3: Empty states (Zero/Filter/DetailHint)

**Files:**
- Create: `src/components/staff/EmptyZero.jsx`
- Create: `src/components/staff/EmptyFilter.jsx`
- Create: `src/components/staff/DetailEmptyHint.jsx`

These follow the Teams pattern (already token-clean).

- [ ] **Step 1: Create EmptyZero.jsx**

```jsx
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Empty state когда сотрудников нет вообще (только superadmin при пустой БД).
 */
export function StaffEmptyZero({ onCreate, canCreate }) {
  return (
    <div className="flex h-full items-center justify-center px-6 py-10">
      <div className="max-w-sm rounded-xl border border-dashed border-border-strong px-6 py-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary-ink)]">
          <UserPlus size={22} />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          Сотрудников пока нет
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Добавьте первого сотрудника, чтобы начать работу.
        </p>
        {canCreate && (
          <Button onClick={onCreate} className="mt-5">
            + Добавить первого
          </Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create EmptyFilter.jsx**

```jsx
import { FilterX } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Empty state когда сотрудники есть, но под поиск/role-фильтр не подходят.
 *
 * @param {object} props
 * @param {boolean} props.hasSearch
 * @param {boolean} props.hasRoleFilter — фильтр роли отличается от 'all'
 * @param {function} [props.onClearSearch]
 * @param {function} [props.onClearRole]
 */
export function StaffEmptyFilter({
  hasSearch,
  hasRoleFilter,
  onClearSearch,
  onClearRole,
}) {
  return (
    <div className="flex h-full items-center justify-center px-6 py-10">
      <div className="max-w-sm rounded-xl border border-dashed border-border-strong px-6 py-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <FilterX size={22} />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          Под фильтр ничего не подходит
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {hasSearch && hasRoleFilter
            ? 'Уточните поиск или сбросьте фильтр роли.'
            : hasSearch
              ? 'По вашему запросу сотрудников не найдено.'
              : 'Сбросьте фильтр роли, чтобы увидеть остальных сотрудников.'}
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {hasSearch && (
            <Button onClick={onClearSearch}>Очистить поиск</Button>
          )}
          {hasRoleFilter && (
            <Button variant={hasSearch ? 'ghost' : 'default'} onClick={onClearRole}>
              Сбросить роль
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create DetailEmptyHint.jsx**

```jsx
import { MousePointerClick } from 'lucide-react'

/**
 * Empty state в правой панели, когда сотрудник не выбран.
 */
export function StaffDetailEmptyHint() {
  return (
    <div className="flex h-full items-center justify-center px-6 py-10">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <MousePointerClick size={22} />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          Выберите сотрудника слева
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Профиль, атрибуты, права и активность откроются в этой панели.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: clean build (files unused yet but valid).

- [ ] **Step 5: Commit**

```bash
git add src/components/staff/EmptyZero.jsx src/components/staff/EmptyFilter.jsx src/components/staff/DetailEmptyHint.jsx
git commit -m "feat(staff): add empty states (Zero/Filter/DetailHint)

Subplan 6A8 task 3. Three empty-state components for the new master-detail layout: zero (no staff exist), filter (no match for search/role), detail hint (no row selected). Mirrors Teams empty-state pattern."
```

---

## Task 4: StaffDetailPanel

**Files:**
- Create: `src/components/staff/StaffDetailPanel.jsx`

Wraps existing tab components (`ProfileTab`, `AttributesTab`, `PermissionsTab`, `ActivityTab`) and existing modals (`ChangePasswordModal`, `DeleteRequestModal`). Header card with avatar + name + role badge + status pill. Tab nav. Loads via `useStaff(callerId, refCode)`.

- [ ] **Step 1: Create StaffDetailPanel.jsx**

```jsx
import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { useStaff } from '../../hooks/useStaff.js'
import { hasPermission, isSuperadmin } from '../../lib/permissions.js'
import { ChangePasswordModal } from './ChangePasswordModal.jsx'
import { DeleteRequestModal } from './DeleteRequestModal.jsx'

const ROLE_BADGE_COLOR = {
  superadmin: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  admin:      'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  moderator:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  teamlead:   'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  operator:   'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

const ROLE_LABEL = {
  superadmin: 'Супер-Админ',
  admin: 'Администратор',
  moderator: 'Модератор',
  teamlead: 'Тим Лидер',
  operator: 'Оператор',
}

const TAB_BASE = 'px-4 py-2 text-sm font-medium border-b-2 transition-colors'
const TAB_IDLE = 'border-transparent text-muted-foreground hover:text-foreground'
const TAB_ACTIVE = 'border-primary text-foreground'

/**
 * Detail-панель открытого сотрудника.
 *
 * @param {object} props
 * @param {string} props.callerId
 * @param {object} props.user
 * @param {string} props.refCode
 * @param {function} props.onChanged — callback после изменений (reload master)
 * @param {function} props.onBack — back to list (mobile)
 */
export function StaffDetailPanel({ callerId, user, refCode, onChanged, onBack }) {
  const navigate = useNavigate()
  const { row, loading, error, reload } = useStaff(callerId, refCode)
  const [pwOpen, setPwOpen] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [delSubmitting, setDelSubmitting] = useState(false)
  const [delError, setDelError] = useState(null)

  function bothChanged() {
    reload()
    onChanged?.()
  }

  async function submitDeletion(reason) {
    setDelSubmitting(true)
    setDelError(null)
    const { error: err } = await supabase.rpc('request_deletion', {
      p_caller_id: user.id,
      p_target_user: row.id,
      p_reason: reason,
    })
    setDelSubmitting(false)
    if (err) {
      setDelError(err.message)
      return
    }
    setDelOpen(false)
    bothChanged()
  }

  async function doDeactivate() {
    if (!confirm('Деактивировать сотрудника?')) return
    const { error: err } = await supabase.rpc('deactivate_staff', {
      p_caller_id: user.id,
      p_user_id: row.id,
    })
    if (err) {
      alert(err.message)
      return
    }
    bothChanged()
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Загрузка…</div>
  }
  if (error) {
    return (
      <div className="p-6 text-sm text-[var(--danger-ink)]" role="alert">
        Ошибка: {error}
      </div>
    )
  }
  if (!row) return null

  const initials =
    (row.first_name?.[0] ?? '').toUpperCase() +
    (row.last_name?.[0] ?? '').toUpperCase()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-2 border-b border-border bg-card px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden"
          aria-label="Назад к списку сотрудников"
        >
          <ChevronLeft size={18} />
        </button>
        <Link
          to="/staff"
          className="hidden items-center gap-1 rounded-md p-1 text-xs text-muted-foreground hover:text-foreground sm:flex"
        >
          <ChevronLeft size={14} /> Сотрудники
        </Link>
        <div className="flex-1" />
        <div className="flex flex-shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setPwOpen(true)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            Сменить пароль
          </button>
          {isSuperadmin(user) ? (
            <button
              type="button"
              onClick={doDeactivate}
              disabled={!row.is_active}
              className="rounded-lg border border-[var(--danger)] bg-card px-3 py-1.5 text-xs font-medium text-[var(--danger-ink)] hover:bg-[var(--danger-soft)] disabled:opacity-40"
            >
              Деактивировать
            </button>
          ) : (
            hasPermission(user, 'create_users') && (
              <button
                type="button"
                onClick={() => setDelOpen(true)}
                disabled={row.has_pending_deletion}
                className="rounded-lg border border-[var(--danger)] bg-card px-3 py-1.5 text-xs font-medium text-[var(--danger-ink)] hover:bg-[var(--danger-soft)] disabled:opacity-40"
              >
                {row.has_pending_deletion ? 'Запрос отправлен' : 'Запросить удаление'}
              </button>
            )
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 sm:p-6">
          <div className="mb-4 flex flex-col gap-4 rounded-lg border border-border bg-card p-5 sm:flex-row sm:items-start sm:gap-6">
            <div
              className={[
                'relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-bold',
                row.is_active ? 'bg-muted text-muted-foreground' : 'bg-muted text-muted-foreground/60',
              ].join(' ')}
            >
              {initials || '?'}
              <button
                type="button"
                title="Загрузить аватар (в разработке)"
                className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-primary text-xs text-primary-foreground"
                onClick={(e) => e.preventDefault()}
              >
                +
              </button>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-foreground">
                  {row.first_name} {row.last_name}
                </h1>
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    ROLE_BADGE_COLOR[row.role] ?? 'bg-muted text-muted-foreground'
                  }`}
                >
                  {ROLE_LABEL[row.role] ?? row.role}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <span
                    className={[
                      'h-2 w-2 rounded-full',
                      row.is_active ? 'bg-emerald-500' : 'bg-muted-foreground',
                    ].join(' ')}
                  />
                  {row.is_active ? 'Активен' : 'Неактивен'}
                </span>
                {row.has_pending_deletion && (
                  <span className="inline-flex items-center rounded-full bg-[var(--danger-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--danger-ink)]">
                    Запрос на удаление
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="rounded bg-muted px-2 py-0.5 font-mono">{row.ref_code}</span>
                <span>{row.email}</span>
                <span>Создан {new Date(row.created_at).toLocaleDateString('ru-RU')}</span>
              </div>
            </div>
          </div>

          <div className="mb-4 flex gap-1 border-b border-border">
            <TabLink refCode={row.ref_code} tab="" label="Профиль" />
            <TabLink refCode={row.ref_code} tab="attributes" label="Атрибуты" />
            <TabLink refCode={row.ref_code} tab="permissions" label="Права" />
            <TabLink refCode={row.ref_code} tab="activity" label="Активность" />
          </div>

          <div>
            <Outlet context={{ row, callerId, user, onChanged: bothChanged, navigate }} />
          </div>
        </div>
      </div>

      {pwOpen && (
        <ChangePasswordModal
          userId={row.id}
          onClose={() => setPwOpen(false)}
          onDone={() => bothChanged()}
        />
      )}
      {delOpen && (
        <DeleteRequestModal
          targetUserId={row.id}
          targetName={`${row.first_name} ${row.last_name}`}
          submitting={delSubmitting}
          onClose={() => setDelOpen(false)}
          onSubmit={submitDeletion}
        />
      )}
      {delError && (
        <p className="fixed bottom-4 right-4 rounded-lg bg-[var(--danger)] px-4 py-2 text-sm text-white">
          {delError}
        </p>
      )}
    </div>
  )
}

function TabLink({ refCode, tab, label }) {
  return (
    <NavLink
      to={
        tab
          ? `/staff/${encodeURIComponent(refCode)}/${tab}`
          : `/staff/${encodeURIComponent(refCode)}`
      }
      end
      className={({ isActive }) => `${TAB_BASE} ${isActive ? TAB_ACTIVE : TAB_IDLE}`}
    >
      {label}
    </NavLink>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/staff/StaffDetailPanel.jsx
git commit -m "feat(staff): add StaffDetailPanel for master-detail right pane

Subplan 6A8 task 4. Loads staff via useStaff, renders header with avatar/name/role/status, tab nav (Профиль/Атрибуты/Права/Активность), header actions (change password, deactivate, request deletion). Tab content rendered via nested <Outlet> with context. ChangePasswordModal + DeleteRequestModal preserved as-is."
```

---

## Task 5: CreateStaffSlideOut + test

**Files:**
- Create: `src/components/staff/CreateStaffSlideOut.jsx`
- Create: `src/components/staff/CreateStaffSlideOut.test.jsx`

Translates `StaffCreatePage` form (216 LOC) into a slide-out (`max-w-[480px]`, esc-to-close, backdrop-click-to-close, sticky footer). Permissions in `<details open>` collapsible groups.

- [ ] **Step 1: Write failing test**

`src/components/staff/CreateStaffSlideOut.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CreateStaffSlideOut } from './CreateStaffSlideOut.jsx'

vi.mock('../../supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}))
import { supabase } from '../../supabaseClient'

describe('<CreateStaffSlideOut>', () => {
  beforeEach(() => {
    supabase.rpc.mockReset()
  })

  function renderForm(overrides = {}) {
    const props = {
      callerId: 'caller-1',
      onClose: vi.fn(),
      onCreated: vi.fn(),
      ...overrides,
    }
    return { ...render(<CreateStaffSlideOut {...props} />), props }
  }

  it('disables submit button when form is incomplete', () => {
    renderForm()
    const submit = screen.getByRole('button', { name: /Создать/i })
    expect(submit).toBeDisabled()
  })

  it('enables submit when all required fields are filled', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText(/Имя/i), { target: { value: 'Иван' } })
    fireEvent.change(screen.getByLabelText(/Фамилия/i), { target: { value: 'Петров' } })
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'i@example.com' } })
    fireEvent.change(screen.getByLabelText(/Пароль/i), { target: { value: 'secret123' } })
    expect(screen.getByRole('button', { name: /Создать/i })).not.toBeDisabled()
  })

  it('calls onClose when backdrop is clicked', () => {
    const { props } = renderForm()
    fireEvent.click(screen.getByTestId('create-staff-backdrop'))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on Escape key', () => {
    const { props } = renderForm()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onCreated with refCode on successful submit', async () => {
    supabase.rpc
      .mockResolvedValueOnce({ data: 42, error: null }) // create_staff returns user_id
      .mockResolvedValueOnce({ data: [{ ref_code: 'OP-IPE-042' }], error: null }) // get_staff_detail
    const { props } = renderForm()
    fireEvent.change(screen.getByLabelText(/Имя/i), { target: { value: 'Иван' } })
    fireEvent.change(screen.getByLabelText(/Фамилия/i), { target: { value: 'Петров' } })
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'i@example.com' } })
    fireEvent.change(screen.getByLabelText(/Пароль/i), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /Создать/i }))
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith('OP-IPE-042'))
  })

  it('shows error alert on RPC failure', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'email уже занят' } })
    renderForm()
    fireEvent.change(screen.getByLabelText(/Имя/i), { target: { value: 'Иван' } })
    fireEvent.change(screen.getByLabelText(/Фамилия/i), { target: { value: 'Петров' } })
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'i@example.com' } })
    fireEvent.change(screen.getByLabelText(/Пароль/i), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /Создать/i }))
    await screen.findByText(/email уже занят/)
  })

  it('resets permissions when role changes', () => {
    renderForm()
    const roleSelect = screen.getByLabelText(/Роль/i)
    // По умолчанию роль 'moderator' — у неё есть send_reminders в дефолтных правах.
    const sendReminders = screen.getByLabelText(/Отправлять напоминания/i)
    expect(sendReminders).toBeChecked()
    // Меняем на operator — у operator другие defaults (manage_clients off, view_own_tasks on)
    fireEvent.change(roleSelect, { target: { value: 'operator' } })
    // send_reminders должен сброситься (operator его не имеет в дефолтах)
    expect(sendReminders).not.toBeChecked()
  })

  it('toggles permission checkbox independently of role', () => {
    renderForm()
    const createUsers = screen.getByLabelText(/Создавать сотрудников/i)
    const initial = createUsers.checked
    fireEvent.click(createUsers)
    expect(createUsers.checked).toBe(!initial)
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npm test -- --run CreateStaffSlideOut.test`
Expected: FAIL with `Cannot find module './CreateStaffSlideOut.jsx'`.

- [ ] **Step 3: Create CreateStaffSlideOut.jsx**

```jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { defaultPermissions } from '../../lib/defaultPermissions.js'
import { permissionGroups } from '../../lib/permissionGroups.js'
import { RefCodePreview } from './RefCodePreview.jsx'

const ROLES = [
  { value: 'admin',     label: 'Администратор' },
  { value: 'moderator', label: 'Модератор' },
  { value: 'teamlead',  label: 'Тим Лидер' },
  { value: 'operator',  label: 'Оператор' },
]

export function CreateStaffSlideOut({ callerId, onClose, onCreated }) {
  const [role, setRole] = useState('moderator')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [alias, setAlias] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [perms, setPerms] = useState(() => new Set(defaultPermissions('moderator')))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const firstNameRef = useRef(null)

  useEffect(() => {
    firstNameRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !submitting) {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [submitting, onClose])

  function setRoleAndPerms(r) {
    setRole(r)
    setPerms(new Set(defaultPermissions(r)))
  }

  function togglePerm(key) {
    setPerms((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const canSubmit = useMemo(() => {
    return (
      firstName.trim() &&
      lastName.trim() &&
      email.trim() &&
      password.length >= 6
    )
  }, [firstName, lastName, email, password])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setError(null)

    const { data: newId, error: rpcError } = await supabase.rpc('create_staff', {
      p_caller_id: callerId,
      p_email: email.trim(),
      p_password: password,
      p_role: role,
      p_first_name: firstName.trim(),
      p_last_name: lastName.trim(),
      p_alias: alias.trim() || null,
      p_permissions: Array.from(perms),
    })

    if (rpcError) {
      setError(rpcError.message)
      setSubmitting(false)
      return
    }

    const { data: detail, error: detailErr } = await supabase.rpc('get_staff_detail', {
      p_caller_id: callerId,
      p_user_id: newId,
    })
    if (detailErr || !detail?.[0]) {
      setError(detailErr?.message ?? 'Создано, но не удалось открыть карточку')
      setSubmitting(false)
      return
    }
    setSubmitting(false)
    onCreated?.(detail[0].ref_code)
  }

  return (
    <>
      <div
        data-testid="create-staff-backdrop"
        className="fixed inset-0 z-50 bg-black/40"
        onClick={() => !submitting && onClose()}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-staff-title"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col bg-card shadow-2xl border-l border-border"
      >
        <header className="flex items-start justify-between border-b border-border px-6 py-5">
          <div>
            <h2 id="create-staff-title" className="text-lg font-bold text-foreground">
              Новый сотрудник
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Поля со звёздочкой обязательны
            </p>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            aria-label="Закрыть форму создания сотрудника"
            className="rounded-md p-1 text-[var(--fg4)] hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </header>

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
            <Field label="Роль" required>
              <select
                value={role}
                onChange={(e) => setRoleAndPerms(e.target.value)}
                disabled={submitting}
                className={inputCls()}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>

            <div className="rounded-md border border-border bg-muted/40 p-3">
              <div className="mb-1 text-xs font-medium text-muted-foreground">
                Реф-код (предпросмотр)
              </div>
              <RefCodePreview role={role} firstName={firstName} lastName={lastName} />
            </div>

            <Field label="Имя" required>
              <input
                ref={firstNameRef}
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={submitting}
                className={inputCls()}
              />
            </Field>

            <Field label="Фамилия" required>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={submitting}
                className={inputCls()}
              />
            </Field>

            <Field label="Псевдоним">
              <input
                type="text"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                disabled={submitting}
                className={inputCls()}
              />
            </Field>

            <Field label="Email" required>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                className={inputCls()}
              />
            </Field>

            <Field label="Пароль" required hint="Минимум 6 символов">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                minLength={6}
                className={inputCls()}
              />
            </Field>

            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Права (по умолчанию для роли, можно менять)
              </div>
              <div className="space-y-2">
                {permissionGroups.map((g) => (
                  <details key={g.title} open className="rounded-md border border-border bg-card">
                    <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {g.title}
                    </summary>
                    <div className="space-y-1 border-t border-border px-3 py-2">
                      {g.permissions.map((p) => (
                        <label key={p.key} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={perms.has(p.key)}
                            onChange={() => togglePerm(p.key)}
                            disabled={submitting}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-[var(--primary-ring)]"
                          />
                          <span className="text-foreground">{p.label}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </div>

          <footer className="border-t border-border bg-muted/40 px-6 py-4">
            {error && (
              <p
                className="mb-3 rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]"
                role="alert"
              >
                {error}
              </p>
            )}
            <div className="flex items-center gap-3">
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => !submitting && onClose()}
                disabled={submitting}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={!canSubmit || submitting}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 inline-flex items-center"
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin mr-1.5" /> Создаётся…
                  </>
                ) : (
                  'Создать'
                )}
              </button>
            </div>
          </footer>
        </form>
      </aside>
    </>
  )
}

function Field({ label, required, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
        {required && (
          <span className="ml-0.5 text-[var(--danger)]" aria-label="обязательное поле">*</span>
        )}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--fg4)]">{hint}</span>}
    </label>
  )
}

function inputCls() {
  return [
    'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors text-foreground',
    'placeholder:text-[var(--fg4)]',
    'hover:border-border-strong focus:border-primary focus:ring-2 focus:ring-[var(--primary-ring)]',
    'disabled:bg-muted disabled:opacity-60',
  ].join(' ')
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `npm test -- --run CreateStaffSlideOut.test`
Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/staff/CreateStaffSlideOut.jsx src/components/staff/CreateStaffSlideOut.test.jsx
git commit -m "feat(staff): add CreateStaffSlideOut + tests

Subplan 6A8 task 5. Slide-out form (max-w-[480px], Esc to close, backdrop click) replacing the standalone /staff/new page. Same RPC flow (create_staff → get_staff_detail). Permission groups in <details open> collapsibles to fit narrow width. 8 unit tests covering submit validation, close handlers, success/error paths, role-change permission reset, and checkbox toggling."
```

---

## Task 6: DS-token swap in StaffFilterChips

**Files:**
- Modify: `src/components/staff/StaffFilterChips.jsx`

Pure token swap — replace `border-indigo-600 bg-indigo-600 text-white` and `border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:...` with DS tokens. Logic unchanged.

- [ ] **Step 1: Replace contents of StaffFilterChips.jsx**

```jsx
const ROLES = [
  { key: 'all',       label: 'Все' },
  { key: 'admin',     label: 'Админы' },
  { key: 'moderator', label: 'Модераторы' },
  { key: 'teamlead',  label: 'ТЛ' },
  { key: 'operator',  label: 'Операторы' },
]

export function StaffFilterChips({ counts, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ROLES.map(({ key, label }) => {
        const active = value === key
        return (
          <button
            key={key}
            type="button"
            data-active={active}
            onClick={() => onChange(key)}
            className={[
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-muted',
            ].join(' ')}
          >
            {label} · {counts[key] ?? 0}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/staff/StaffFilterChips.jsx
git commit -m "feat(staff): swap StaffFilterChips to DS tokens

Subplan 6A8 task 6. Pure token swap: indigo-600 → primary, slate-* → border/card/muted-foreground. No logic changes."
```

---

## Task 7: Rewrite StaffListPage as master-detail shell

**Files:**
- Modify (full rewrite): `src/pages/StaffListPage.jsx`

Page exports `StaffListPage` (shell), `StaffDetailRoute` (loads `<StaffDetailPanel>`), `StaffDetailEmpty` (renders `<StaffDetailEmptyHint>`). Mirror `TeamListPage` structure.

- [ ] **Step 1: Replace contents of StaffListPage.jsx**

```jsx
import { useMemo, useState } from 'react'
import { Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { useAuth } from '../useAuth.jsx'
import { useStaffList } from '../hooks/useStaffList.js'
import { StaffList } from '../components/staff/StaffList.jsx'
import { StaffFilterChips } from '../components/staff/StaffFilterChips.jsx'
import { StaffEmptyZero } from '../components/staff/EmptyZero.jsx'
import { StaffEmptyFilter } from '../components/staff/EmptyFilter.jsx'
import { StaffDetailEmptyHint } from '../components/staff/DetailEmptyHint.jsx'
import { StaffDetailPanel } from '../components/staff/StaffDetailPanel.jsx'
import { CreateStaffSlideOut } from '../components/staff/CreateStaffSlideOut.jsx'
import { MasterDetailLayout, ListPane, SearchInput } from '../components/shell/index.js'
import { Button } from '@/components/ui/button'
import { hasPermission } from '../lib/permissions.js'

export function StaffListPage() {
  const { user } = useAuth()
  const { refCode } = useParams()
  const navigate = useNavigate()

  const [role, setRole] = useState('all')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const { rows, counts, loading, error, reload } = useStaffList(user?.id)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((u) => {
      if (role !== 'all' && u.role !== role) return false
      if (!q) return true
      return (
        (u.first_name ?? '').toLowerCase().includes(q) ||
        (u.last_name ?? '').toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q) ||
        (u.ref_code ?? '').toLowerCase().includes(q) ||
        (u.alias ?? '').toLowerCase().includes(q)
      )
    })
  }, [rows, role, search])

  const hasSearch = search.trim().length > 0
  const hasRoleFilter = role !== 'all'
  const isEmpty = !loading && !error && filtered.length === 0
  const isZeroEmpty = isEmpty && rows.length === 0
  const isFilterEmpty = isEmpty && rows.length > 0

  const canCreate = hasPermission(user, 'create_users')

  const titleNode = (
    <span className="flex items-baseline gap-2">
      Сотрудники
      <span className="text-xs font-medium text-[var(--fg4)] tabular">
        {filtered.length}
      </span>
    </span>
  )

  const createButtonNode = canCreate ? (
    <Button size="sm" onClick={() => setCreateOpen(true)}>
      + Новый
    </Button>
  ) : null

  const searchNode = (
    <SearchInput
      placeholder="Поиск по имени, email, реф-коду…"
      value={search}
      onChange={setSearch}
      ariaLabel="Поиск сотрудников"
    />
  )

  const filtersNode = !isZeroEmpty ? (
    <StaffFilterChips counts={counts} value={role} onChange={setRole} />
  ) : null

  const listBody = error ? (
    <div className="px-4 py-6 text-sm text-[var(--danger-ink)]" role="alert">
      Ошибка: {error}
    </div>
  ) : loading ? (
    <StaffListSkeleton />
  ) : isZeroEmpty ? (
    <StaffEmptyZero canCreate={canCreate} onCreate={() => setCreateOpen(true)} />
  ) : isFilterEmpty ? (
    <StaffEmptyFilter
      hasSearch={hasSearch}
      hasRoleFilter={hasRoleFilter}
      onClearSearch={() => setSearch('')}
      onClearRole={() => setRole('all')}
    />
  ) : (
    <StaffList rows={filtered} selectedRefCode={refCode ?? null} />
  )

  return (
    <>
      <MasterDetailLayout
        listPane={
          <ListPane
            title={titleNode}
            search={searchNode}
            filters={filtersNode}
            createButton={createButtonNode}
          >
            {listBody}
          </ListPane>
        }
        listLabel="Список сотрудников"
        detailLabel="Сотрудник"
      >
        <Outlet context={{ rows, reload }} />
      </MasterDetailLayout>

      {createOpen && (
        <CreateStaffSlideOut
          callerId={user?.id}
          onClose={() => setCreateOpen(false)}
          onCreated={(newRefCode) => {
            setCreateOpen(false)
            reload()
            if (newRefCode) navigate(`/staff/${encodeURIComponent(newRefCode)}`)
          }}
        />
      )}
    </>
  )
}

// Index child route — shows the empty hint when no staff selected.
export function StaffDetailEmpty() {
  return <StaffDetailEmptyHint />
}

// Detail child route — pulls refCode from URL and shared data from outlet context.
export function StaffDetailRoute() {
  const { user } = useAuth()
  const { refCode } = useParams()
  const navigate = useNavigate()
  const { reload } = useOutletContext()
  return (
    <StaffDetailPanel
      callerId={user?.id}
      user={user}
      refCode={refCode}
      onChanged={reload}
      onBack={() => navigate('/staff')}
    />
  )
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function StaffListSkeleton() {
  const widths = [60, 50, 70, 55, 65, 50]
  return (
    <ul
      className="flex flex-col py-1"
      aria-busy="true"
      aria-label="Загрузка списка сотрудников"
    >
      {widths.map((w, i) => (
        <li
          key={i}
          className="flex items-center gap-3 border-l-2 border-l-transparent px-4 py-2.5"
        >
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div
              className="h-3 animate-pulse rounded bg-muted"
              style={{ width: `${w}%` }}
            />
            <div
              className="h-2.5 animate-pulse rounded bg-muted/70"
              style={{ width: `${Math.max(28, w - 18)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 2: Verify build (will fail — App.jsx still uses old routing)**

Run: `npm run build`
Expected: build will succeed (no import errors yet — App.jsx still uses old `StaffListPage`/`StaffDetailPage`/`StaffCreatePage`). Tests for old StaffListPage page may still pass — that's OK, integration in next step.

- [ ] **Step 3: Commit**

```bash
git add src/pages/StaffListPage.jsx
git commit -m "feat(staff): rewrite StaffListPage as master-detail shell

Subplan 6A8 task 7. Page exports StaffListPage (MasterDetailLayout shell), StaffDetailRoute (renders StaffDetailPanel from URL params), StaffDetailEmpty (DetailEmptyHint). Search + role chips + create slide-out integrated. Mirrors TeamListPage structure. App.jsx still uses old routing — fixed in next task."
```

---

## Task 8: Update App.jsx routes + redirect

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Read current routes**

Run: `grep -n 'staff\|StaffListPage\|StaffDetailPage\|StaffCreatePage' src/App.jsx`
Expected: see existing imports and 4 routes.

- [ ] **Step 2: Replace import + route block**

Find the import:
```jsx
import { StaffListPage } from './pages/StaffListPage.jsx'
import { StaffDetailPage } from './pages/StaffDetailPage.jsx'
import { StaffCreatePage } from './pages/StaffCreatePage.jsx'
```
Replace with:
```jsx
import { StaffListPage, StaffDetailRoute, StaffDetailEmpty } from './pages/StaffListPage.jsx'
import { ProfileTab } from './components/staff/ProfileTab.jsx'
import { AttributesTab } from './components/staff/AttributesTab.jsx'
import { PermissionsTab } from './components/staff/PermissionsTab.jsx'
import { ActivityTab } from './components/staff/ActivityTab.jsx'
```

(If ProfileTab/AttributesTab/PermissionsTab/ActivityTab were imported elsewhere, leave one import — verify with `grep -n 'ProfileTab\|AttributesTab\|PermissionsTab\|ActivityTab' src/App.jsx` first.)

Find the routes block:
```jsx
<Route path="/staff" element={<StaffListPage />} />
<Route path="/staff/new" element={<StaffCreatePage />} />
<Route path="/staff/:refCode" element={<StaffDetailPage />} />
<Route path="/staff/:refCode/:tab" element={<StaffDetailPage />} />
```
Replace with:
```jsx
<Route path="/staff" element={<StaffListPage />}>
  <Route index element={<StaffDetailEmpty />} />
  <Route path=":refCode" element={<StaffDetailRoute />}>
    <Route index element={<ProfileTab />} />
    <Route path="attributes" element={<AttributesTab />} />
    <Route path="permissions" element={<PermissionsTab />} />
    <Route path="activity" element={<ActivityTab />} />
  </Route>
</Route>
<Route path="/staff/new" element={<Navigate to="/staff" replace />} />
```

If `Navigate` isn't imported from `react-router-dom`, add it: change `import { ... } from 'react-router-dom'` to include `Navigate`.

- [ ] **Step 3: Wire ProfileTab / AttributesTab / PermissionsTab / ActivityTab to receive `row` from outlet context**

Tab components currently receive `row` as a prop from `StaffPageShell`. After migration they read it from `useOutletContext()`.

Read each tab to confirm signature:
Run: `head -30 src/components/staff/ProfileTab.jsx src/components/staff/AttributesTab.jsx src/components/staff/PermissionsTab.jsx src/components/staff/ActivityTab.jsx`

For each tab, wrap or modify so that when used inside `<Outlet>`, it pulls context. Pattern (apply to each tab if needed):

```jsx
import { useOutletContext } from 'react-router-dom'
// existing imports...

export function ProfileTab(props) {
  const ctx = useOutletContext?.() ?? null
  // If outlet context is present, prefer it over props (router-driven tabs).
  const row = props.row ?? ctx?.row
  const onSaved = props.onSaved ?? ctx?.onChanged
  // ... rest of component uses `row` and `onSaved`
}
```

For `PermissionsTab` (also uses `canEdit` + `onToggle`):
```jsx
export function PermissionsTab(props) {
  const ctx = useOutletContext?.() ?? null
  const row = props.row ?? ctx?.row
  const user = props.user ?? ctx?.user
  const onChanged = props.onChanged ?? ctx?.onChanged
  // canEdit / onToggle: derive from user + row + supabase if not passed via props
  // existing prop-based code keeps working when called directly
}
```

**Important:** `onToggle` and `canEdit` were passed by `StaffDetailPage`. Since `StaffDetailPanel` doesn't pass them through context yet, derive `canEdit` inside `PermissionsTab` from `hasPermission(user, 'manage_roles')` and define `onToggle` inline calling `supabase.rpc('grant_permission'/'revoke_permission')` then `onChanged()`. Verify by reading the existing `PermissionsTab` to see required surface.

- [ ] **Step 4: Verify build + tests**

Run: `npm run build`
Expected: clean build.

Run: `npm test -- --run`
Expected: existing 220 + 7 (StaffList) + 8 (CreateStaffSlideOut) = 235 tests pass. If old StaffDetailPage tests existed they may fail because of import — task 9 deletes the old files.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/components/staff/ProfileTab.jsx src/components/staff/AttributesTab.jsx src/components/staff/PermissionsTab.jsx src/components/staff/ActivityTab.jsx
git commit -m "feat(staff): wire nested staff routes via outlet context

Subplan 6A8 task 8. App.jsx restructured: /staff is the master-detail shell with index → empty hint, :refCode → detail panel with nested tabs (profile/attributes/permissions/activity). /staff/new redirects to /staff. Tab components updated to read row/onChanged from outlet context, falling back to props for backwards compat with any direct callers."
```

---

## Task 9: Delete obsolete files

**Files:**
- Delete: `src/pages/StaffCreatePage.jsx`
- Delete: `src/pages/StaffDetailPage.jsx`
- Delete: `src/components/staff/StaffPageShell.jsx`
- Delete: `src/components/staff/StaffTable.jsx`
- Delete: `src/components/staff/StaffCardList.jsx`

- [ ] **Step 1: Verify no references to deleted files**

Run:
```bash
grep -rn 'StaffPageShell\|StaffTable\|StaffCardList\|StaffCreatePage\|StaffDetailPage' src/ --include='*.jsx' --include='*.js'
```
Expected: only matches in the files about to be deleted (and in `App.jsx` if anything was missed in Task 8 — fix any stragglers before deletion).

- [ ] **Step 2: Delete the five files**

Run:
```bash
rm src/pages/StaffCreatePage.jsx \
   src/pages/StaffDetailPage.jsx \
   src/components/staff/StaffPageShell.jsx \
   src/components/staff/StaffTable.jsx \
   src/components/staff/StaffCardList.jsx
```

- [ ] **Step 3: Verify build + tests + lint**

Run: `npm run build`
Expected: clean build.

Run: `npm test -- --run`
Expected: 235 tests pass. If anything fails: re-grep for missed references and fix.

Run: `npm run lint 2>&1 | grep -E 'staff/' | head -20`
Expected: no new lint errors in staff/ files (pre-existing repo lint warnings unrelated to staff are OK).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(staff): delete obsolete StaffTable/CardList/PageShell/CreatePage/DetailPage

Subplan 6A8 task 9. Replaced by master-detail components in tasks 1-7. Total 601 LOC removed."
```

---

## Task 10: Manual preview verification

**Files:** none (verification only)

- [ ] **Step 1: Verify dev server is running**

Tool: `mcp__Claude_Preview__preview_list`
Expected: `operator-dashboard` server status `running`. If not running, start it with `mcp__Claude_Preview__preview_start { cwd: "/Users/artemsaskin/Work/operator-dashboard", command: "npm run dev" }`.

- [ ] **Step 2: Navigate to /staff and screenshot**

Tool: `mcp__Claude_Preview__preview_eval` with `window.location.href = '/staff'; window.location.pathname`
Tool: `mcp__Claude_Preview__preview_screenshot`
Expected: master-detail layout, list of staff on left (or empty state), DetailEmptyHint on right.

- [ ] **Step 3: Check console for errors**

Tool: `mcp__Claude_Preview__preview_console_logs` with `level: 'error'`
Expected: no errors.

- [ ] **Step 4: Click a staff row, verify detail panel**

Tool: `mcp__Claude_Preview__preview_click` with selector for the first staff link (e.g. `a[href^="/staff/"]:first-of-type`)
Tool: `mcp__Claude_Preview__preview_screenshot`
Expected: detail panel renders with header card (avatar + name + role + status), tab nav, ProfileTab content.

- [ ] **Step 5: Click each tab (Атрибуты / Права / Активность), screenshot each**

Tools: `mcp__Claude_Preview__preview_click` + `mcp__Claude_Preview__preview_screenshot` per tab.
Expected: each tab renders without console errors.

- [ ] **Step 6: Click "+ Новый", verify slide-out**

Tool: `mcp__Claude_Preview__preview_click` with selector for the create button (e.g. `button:has-text("Новый")` or by aria/role)
Tool: `mcp__Claude_Preview__preview_screenshot`
Expected: CreateStaffSlideOut opens, role select defaults to 'moderator', RefCodePreview rendered, permission groups expanded.

- [ ] **Step 7: Press Esc, verify slide-out closes**

Tool: `mcp__Claude_Preview__preview_eval` with `document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`
Tool: `mcp__Claude_Preview__preview_screenshot`
Expected: slide-out closed.

- [ ] **Step 8: Test filter chips (click "Админы")**

Tool: `mcp__Claude_Preview__preview_click` with selector for the "Админы" chip
Tool: `mcp__Claude_Preview__preview_screenshot`
Expected: list filtered to admins only.

- [ ] **Step 9: Test search miss**

Tool: `mcp__Claude_Preview__preview_eval` to type 'zzzzzz' in search input
Tool: `mcp__Claude_Preview__preview_screenshot`
Expected: StaffEmptyFilter shown with "Очистить поиск" + (if also role filter) "Сбросить роль" buttons.

- [ ] **Step 10: Test redirect /staff/new → /staff**

Tool: `mcp__Claude_Preview__preview_eval` with `window.location.href = '/staff/new'; window.location.pathname`
Expected: pathname is `/staff` after redirect.

- [ ] **Step 11: No commit (verification only)**

If issues found, fix in source and re-verify (no separate commit per fix — combine fixes into a single commit on top of Task 9 if needed).

---

## Task 11: Push branch + create PR

**Files:** none (git/gh)

- [ ] **Step 1: Push the branch**

Run: `git push -u origin feat/subplan-6a8-stafflist-master-detail`
Expected: branch pushed, tracking set up.

- [ ] **Step 2: Create PR**

Run:
```bash
gh pr create --title "feat(staff): Subplan 6A8 — StaffList master-detail migration" --body "$(cat <<'EOF'
## Summary
- Migrate /staff from standalone centered layout (max-w-6xl table+cards) to MasterDetailLayout for visual consistency with /clients, /teams, /tasks.
- Translate StaffCreatePage (/staff/new full page) into CreateStaffSlideOut.
- Delete obsolete StaffTable, StaffCardList, StaffPageShell, StaffCreatePage, StaffDetailPage (601 LOC removed).
- Pure DS-token swap in StaffFilterChips. 5-color role badge palette retained as DS-exception per spec §1.
- Tab components (ProfileTab/AttributesTab/PermissionsTab/ActivityTab) reused as-is via outlet context — no DS-swap inside tabs (deferred).

## Out of scope
- DS-token swap inside detail tabs and modals (deferred to follow-up subplan).
- .btn-primary/.btn-ghost/.btn-danger-ghost cleanup in src/index.css (after Family B complete).

## Test plan
- [ ] npm run build clean
- [ ] npm test -- --run all green (228+ tests, +15 new for StaffList + CreateStaffSlideOut)
- [ ] Browser preview /staff: list renders with new StaffListItem
- [ ] Browser preview /staff: click staff row → detail panel with header card + tabs
- [ ] Browser preview /staff: each tab (Профиль/Атрибуты/Права/Активность) renders
- [ ] Browser preview /staff: + Новый opens slide-out, Esc closes
- [ ] Browser preview /staff: filter chips work, EmptyFilter renders on miss
- [ ] Browser preview: /staff/new redirects to /staff
- [ ] Browser preview /staff (mobile breakpoint): back-button visible, detail covers list

Spec: docs/superpowers/specs/2026-04-27-crm-subplan-6a8-stafflist-master-detail-design.md
Plan: docs/superpowers/plans/2026-04-27-crm-subplan-6a8-stafflist-master-detail.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: PR URL printed.

- [ ] **Step 3: Update DS rollout roadmap memory**

After merge, update `~/.claude/projects/-Users-artemsaskin-Work-operator-dashboard/memory/project_ds_rollout_roadmap.md`:
- Add `- 6A8 (StaffList master-detail): full migration; 601 LOC removed; 7 new components; 15 new tests` to Done list.
- Remove StaffListPage from Family B.

---

## Self-review (run before handoff)

Spec coverage:
- Spec §1 in scope: routes restructured (Task 8) ✓; StaffListPage rewrite (Task 7) ✓; CreateStaffSlideOut migration (Task 5) ✓; StaffDetailPanel + tab outlet (Task 4 + 8) ✓; new list/empty components (Tasks 1-3) ✓; DS-swap StaffFilterChips (Task 6) ✓; deletes (Task 9) ✓; tests (Tasks 2, 5) ✓.
- Spec §1 out of scope: tab content DS-swap (excluded from plan) ✓; modal DS-swap (excluded) ✓; RefCodePreview (passed through unchanged in Task 5) ✓; .btn-* css cleanup (excluded) ✓; 5-color role-badge palette retained (Tasks 1, 4) ✓.
- Spec §6 acceptance criteria covered by Task 10 verification.

Placeholder scan: no TBD/TODO/"implement later" anywhere in the plan. PermissionsTab `onToggle`/`canEdit` derivation in Task 8 step 3 is a known integration sub-point — engineer must read existing PermissionsTab to see exact surface and decide whether to keep prop-based interface (preferred — minimal change) or move logic into the tab (only if `StaffDetailPanel` outlet doesn't pass `onToggle`). The plan instructs to inspect first, which is appropriate given uncertainty about the existing component's internals.

Type consistency: `selectedRefCode` (string|null) used in Task 1, 2, 7 ✓; `refCode` (string) URL param consistent ✓; `onChanged` callback name used in StaffDetailPanel + Task 8 outlet context ✓; `onCreated(refCode)` signature matches between CreateStaffSlideOut (Task 5) and StaffListPage caller (Task 7) ✓.
