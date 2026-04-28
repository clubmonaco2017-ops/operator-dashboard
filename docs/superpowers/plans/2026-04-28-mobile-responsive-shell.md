# Mobile Responsive Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Восстановить mobile-first контракт CRM. Ввести branch shell-кода по `useIsMobile()` так, чтобы все master/detail-страницы и стандартные взаимодействия (формы, навигация, оповещения, тема) были usable на ширине от 375px без специальной разводки внутри страниц.

**Architecture:** Только два места в кодовой базе содержат `useIsMobile()` — `AppShell.jsx` (root composition swap) и `MasterDetailLayout.jsx` (list/detail render swap). Mobile shell — fixed `MobileTopBar` (☰ + section title + 🔔) + scrollable `<Outlet/>` + fixed `MobileBottomNav`, плюс `MobileNavDrawer` (Base UI Sheet `side="left"`) для overflow. Pages пробрасывают section title через `useSectionTitle` Context+hook. List↔detail на mobile использует push-навигацию (без bottom-sheet quick-switch — это enhancement, не часть PR'а).

**Tech Stack:** React 19, react-router-dom 7, Base UI (`@base-ui/react/dialog` уже даёт `<Sheet>`), Tailwind v4, lucide-react, shadcn `<Button>`, Vitest + Testing Library. Без новых dependencies.

**Spec:** [docs/superpowers/specs/2026-04-28-mobile-responsive-shell-design.md](../specs/2026-04-28-mobile-responsive-shell-design.md)

---

## File structure

**Created (10):**
- `src/hooks/useSectionTitle.js` — Context + Provider + 2 hooks (`useSectionTitle`, `useSectionTitleValue`).
- `src/hooks/useSectionTitle.test.js` — unit tests for hook + provider behavior.
- `src/components/shell/MobileTopBar.jsx` — fixed 48px header: ☰/← + title + 🔔 badge.
- `src/components/shell/MobileTopBar.test.jsx` — covers gamburger / back / title fallback / 🔔 visibility.
- `src/components/shell/MobileBottomNav.jsx` — fixed 56px nav: 5 role-gated NavLink items.
- `src/components/shell/MobileBottomNav.test.jsx` — covers role gating, active state, badge.
- `src/components/shell/MobileNavDrawer.jsx` — Base UI `<Sheet side="left">`: profile + theme + admin + logout.
- `src/components/shell/MobileNavDrawer.test.jsx` — covers sections visibility, theme switch, logout call.
- `src/components/shell/MobileShell.jsx` — root composition: TopBar + Outlet + BottomNav + Drawer state owner.
- `src/components/shell/MobileShell.test.jsx` — covers drawer open/close on route change, structure.

**Modified (16):**
- `src/components/shell/AppShell.jsx` — branch on `useIsMobile()`.
- `src/components/shell/AppShell.test.jsx` — assert mobile branch renders `MobileShell`.
- `src/components/shell/MasterDetailLayout.jsx` — new `detailEmpty` prop + mobile branch.
- `src/components/shell/MasterDetailLayout.test.jsx` — assert mobile branch render swap.
- `src/components/shell/index.js` — export new components.
- `src/pages/TaskListPage.jsx` — `useSectionTitle('Задачи')` + `detailEmpty={!taskId}` prop.
- `src/pages/ClientListPage.jsx` — same pattern.
- `src/pages/TeamListPage.jsx` — same pattern.
- `src/pages/StaffListPage.jsx` — same pattern.
- `src/pages/DashboardPage.jsx` — `useSectionTitle('Дашборд')`.
- `src/pages/NotificationsPage.jsx` — `useSectionTitle('Оповещения')`.
- `src/components/tasks/TaskDetailPanel.jsx` — `useSectionTitle(row?.title || 'Задача', { backTo })`.
- `src/components/clients/ClientDetailPanel.jsx` — same pattern with `row?.name || 'Клиент'`.
- `src/components/teams/TeamDetailPanel.jsx` — same pattern with `row?.name || 'Команда'`.
- `src/components/staff/StaffDetailPanel.jsx` — same pattern with `row?.alias || row?.firstName || 'Сотрудник'`.
- `src/components/tasks/CreateTaskSlideOut.jsx` — `Sheet side` via `useIsMobile`.
- `src/components/clients/CreateClientSlideOut.jsx` — same.
- `src/components/teams/CreateTeamSlideOut.jsx` — same.
- `src/components/staff/CreateStaffSlideOut.jsx` — same.

**Deleted:** none. Existing desktop components (`RailNav`, `ListPane`, `SearchInput`, `ThemeToggle`, `UserMenuDropdown`) stay as desktop-only — they continue to be referenced from desktop branches.

**Estimated PR size:** ~1300–1500 LOC inserted (≈700 implementation + ≈500 tests + ≈100 modifications).

---

## Setup

### Task 0: Baseline verification

**Files:** none.

- [ ] **Step 0.1: Confirm branch and clean tree**

```bash
git status
git log --oneline -3
```

Expected: clean tree (or branch from main with только commit `83ec802 docs(spec): add mobile responsive shell design spec`); HEAD on main or feature branch.

- [ ] **Step 0.2: Verify build / lint / test baseline**

```bash
npm run build
npm run lint 2>&1 | tail -3
npm run test:run 2>&1 | tail -5
```

Expected: build succeeds; lint baseline (any pre-existing errors recorded — they're NOT in scope to fix here); tests = 235/235 passing (whatever the current count is, record it as baseline `T_BASE`).

- [ ] **Step 0.3: Confirm `useIsMobile` is currently orphaned**

```bash
grep -rn "useIsMobile" src --include='*.jsx' --include='*.js' | grep -v 'use-mobile.js'
```

Expected: empty (zero matches outside `src/hooks/use-mobile.js`). После завершения plan'а здесь должно быть ≥2 matches.

- [ ] **Step 0.4: Verify the 4 SlideOut files all use `<Sheet>`**

```bash
grep -l "from '@/components/ui/sheet'" \
  src/components/tasks/CreateTaskSlideOut.jsx \
  src/components/clients/CreateClientSlideOut.jsx \
  src/components/teams/CreateTeamSlideOut.jsx \
  src/components/staff/CreateStaffSlideOut.jsx
```

Expected: all 4 files listed (after 6D modal migration). If any file is missing the import, stop and investigate.

---

## Implementation

### Task 1: `useSectionTitle` hook + Provider

**Цель:** мини-инфраструктура для проброса title и backTo из page-компонентов в `MobileTopBar`. Это foundation — без него `MobileTopBar` не может рендериться корректно.

**Files:**
- Create: `src/hooks/useSectionTitle.js`
- Create: `src/hooks/useSectionTitle.test.js`

- [ ] **Step 1.1: Write the failing tests**

Create `src/hooks/useSectionTitle.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { SectionTitleProvider, useSectionTitle, useSectionTitleValue } from './useSectionTitle.js'

function ReaderProbe() {
  const { title, backTo } = useSectionTitleValue()
  return (
    <div data-testid="probe">
      <span data-testid="title">{title}</span>
      <span data-testid="backTo">{backTo ?? ''}</span>
    </div>
  )
}

function WriterProbe({ title, backTo }) {
  useSectionTitle(title, { backTo })
  return null
}

describe('useSectionTitle', () => {
  it('Provider initializes title and backTo to empty/null', () => {
    render(
      <SectionTitleProvider>
        <ReaderProbe />
      </SectionTitleProvider>,
    )
    expect(screen.getByTestId('title')).toHaveTextContent('')
    expect(screen.getByTestId('backTo')).toHaveTextContent('')
  })

  it('useSectionTitle sets title on mount', () => {
    render(
      <SectionTitleProvider>
        <WriterProbe title="Задачи" />
        <ReaderProbe />
      </SectionTitleProvider>,
    )
    expect(screen.getByTestId('title')).toHaveTextContent('Задачи')
    expect(screen.getByTestId('backTo')).toHaveTextContent('')
  })

  it('useSectionTitle sets backTo when option provided', () => {
    render(
      <SectionTitleProvider>
        <WriterProbe title="Клиент B" backTo="/clients" />
        <ReaderProbe />
      </SectionTitleProvider>,
    )
    expect(screen.getByTestId('title')).toHaveTextContent('Клиент B')
    expect(screen.getByTestId('backTo')).toHaveTextContent('/clients')
  })

  it('clears title and backTo on unmount', () => {
    function Toggler({ show }) {
      return show ? <WriterProbe title="X" backTo="/y" /> : null
    }
    const { rerender } = render(
      <SectionTitleProvider>
        <Toggler show={true} />
        <ReaderProbe />
      </SectionTitleProvider>,
    )
    expect(screen.getByTestId('title')).toHaveTextContent('X')
    rerender(
      <SectionTitleProvider>
        <Toggler show={false} />
        <ReaderProbe />
      </SectionTitleProvider>,
    )
    expect(screen.getByTestId('title')).toHaveTextContent('')
    expect(screen.getByTestId('backTo')).toHaveTextContent('')
  })

  it('updates title when prop changes', () => {
    const { rerender } = render(
      <SectionTitleProvider>
        <WriterProbe title="A" />
        <ReaderProbe />
      </SectionTitleProvider>,
    )
    expect(screen.getByTestId('title')).toHaveTextContent('A')
    rerender(
      <SectionTitleProvider>
        <WriterProbe title="B" />
        <ReaderProbe />
      </SectionTitleProvider>,
    )
    expect(screen.getByTestId('title')).toHaveTextContent('B')
  })

  it('returns default values when used outside provider', () => {
    render(<ReaderProbe />)
    expect(screen.getByTestId('title')).toHaveTextContent('')
    expect(screen.getByTestId('backTo')).toHaveTextContent('')
  })
})
```

- [ ] **Step 1.2: Run test, verify it fails**

```bash
npm run test:run -- src/hooks/useSectionTitle.test.js
```

Expected: FAIL with «Cannot find module './useSectionTitle.js'» or similar — file doesn't exist yet.

- [ ] **Step 1.3: Implement `useSectionTitle.js`**

Create `src/hooks/useSectionTitle.js`:

```js
import { createContext, useContext, useEffect, useState } from 'react'

const SectionTitleContext = createContext({
  title: '',
  backTo: null,
  setTitle: () => {},
  setBackTo: () => {},
})

/**
 * Provider for section title state. Wrap mobile shell so that
 * page components can publish their title via useSectionTitle()
 * and MobileTopBar can read it via useSectionTitleValue().
 */
export function SectionTitleProvider({ children }) {
  const [title, setTitle] = useState('')
  const [backTo, setBackTo] = useState(null)
  return (
    <SectionTitleContext.Provider value={{ title, backTo, setTitle, setBackTo }}>
      {children}
    </SectionTitleContext.Provider>
  )
}

/**
 * Page-side hook: publish the section title (and optional backTo) for the
 * current route. Cleared automatically on unmount.
 *
 * @param {string} title — what to show in MobileTopBar.
 * @param {{ backTo?: string|null }} [options]
 *   backTo: when set, MobileTopBar renders a back arrow that navigates here
 *   instead of opening the drawer.
 */
export function useSectionTitle(title, options = {}) {
  const { setTitle, setBackTo } = useContext(SectionTitleContext)
  const backTo = options.backTo ?? null
  useEffect(() => {
    setTitle(title)
    setBackTo(backTo)
    return () => {
      setTitle('')
      setBackTo(null)
    }
  }, [title, backTo, setTitle, setBackTo])
}

/**
 * Reader-side hook (for MobileTopBar). Outside provider returns
 * `{ title: '', backTo: null }`.
 */
export function useSectionTitleValue() {
  const { title, backTo } = useContext(SectionTitleContext)
  return { title, backTo }
}
```

- [ ] **Step 1.4: Run tests, verify they pass**

```bash
npm run test:run -- src/hooks/useSectionTitle.test.js
```

Expected: PASS, 6/6 tests green.

- [ ] **Step 1.5: Commit**

```bash
git add src/hooks/useSectionTitle.js src/hooks/useSectionTitle.test.js
git commit -m "feat(shell): add useSectionTitle hook + Context provider

Foundation for mobile shell. Pages publish their section title
via useSectionTitle('…'); MobileTopBar reads it via
useSectionTitleValue(). Cleared on unmount so the next route
starts blank.
"
```

---

### Task 2: `MobileTopBar` component

**Цель:** fixed 48px header, рендерит ☰ (или ← если есть backTo) + title (или fallback) + 🔔 (для superadmin'а с badge'ом). Standalone — пока не подключается к shell.

**Files:**
- Create: `src/components/shell/MobileTopBar.jsx`
- Create: `src/components/shell/MobileTopBar.test.jsx`

- [ ] **Step 2.1: Write failing tests**

Create `src/components/shell/MobileTopBar.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../../useAuth.jsx', () => ({ useAuth: vi.fn() }))
vi.mock('../../hooks/usePendingDeletionCount.js', () => ({
  usePendingDeletionCount: vi.fn(),
}))

import { MobileTopBar } from './MobileTopBar.jsx'
import { SectionTitleProvider, useSectionTitle } from '../../hooks/useSectionTitle.js'
import { useAuth } from '../../useAuth.jsx'
import { usePendingDeletionCount } from '../../hooks/usePendingDeletionCount.js'

function TitleSetter({ title, backTo }) {
  useSectionTitle(title, { backTo })
  return null
}

function renderAt(path, { user, pending = 0, title = null, backTo = null, onMenuClick = vi.fn() }) {
  useAuth.mockReturnValue({ user })
  usePendingDeletionCount.mockReturnValue(pending)
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SectionTitleProvider>
        {title !== null && <TitleSetter title={title} backTo={backTo} />}
        <Routes>
          <Route path="*" element={<MobileTopBar onMenuClick={onMenuClick} />} />
        </Routes>
      </SectionTitleProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('<MobileTopBar>', () => {
  it('renders hamburger menu button by default', () => {
    renderAt('/tasks', { user: { role: 'operator' }, title: 'Задачи' })
    expect(screen.getByRole('button', { name: 'Открыть меню' })).toBeInTheDocument()
  })

  it('renders the section title from context', () => {
    renderAt('/tasks', { user: { role: 'operator' }, title: 'Задачи' })
    expect(screen.getByText('Задачи')).toBeInTheDocument()
  })

  it('falls back to route-derived title when context is empty', () => {
    renderAt('/notifications', { user: { role: 'superadmin' } })
    expect(screen.getByText('Оповещения')).toBeInTheDocument()
  })

  it('falls back to "Дашборд" on root route when context empty', () => {
    renderAt('/', { user: { role: 'operator' } })
    expect(screen.getByText('Дашборд')).toBeInTheDocument()
  })

  it('renders back arrow instead of hamburger when backTo is set', () => {
    renderAt('/tasks/42', {
      user: { role: 'operator' },
      title: 'Задача 42',
      backTo: '/tasks',
    })
    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Открыть меню' })).toBeNull()
  })

  it('calls onMenuClick when hamburger pressed', () => {
    const onMenuClick = vi.fn()
    renderAt('/tasks', { user: { role: 'operator' }, title: 'Задачи', onMenuClick })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть меню' }))
    expect(onMenuClick).toHaveBeenCalledTimes(1)
  })

  it('shows notifications icon for superadmin only', () => {
    renderAt('/tasks', { user: { role: 'superadmin' }, title: 'Задачи', pending: 0 })
    expect(screen.getByLabelText('Оповещения')).toBeInTheDocument()
  })

  it('hides notifications icon for non-superadmin', () => {
    renderAt('/tasks', { user: { role: 'admin' }, title: 'Задачи', pending: 0 })
    expect(screen.queryByLabelText('Оповещения')).toBeNull()
  })

  it('shows pending count badge on notifications icon', () => {
    renderAt('/tasks', { user: { role: 'superadmin' }, title: 'Задачи', pending: 7 })
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('shows "99+" when pending count exceeds 99', () => {
    renderAt('/tasks', { user: { role: 'superadmin' }, title: 'Задачи', pending: 142 })
    expect(screen.getByText('99+')).toBeInTheDocument()
  })

  it('hides badge when pending count is 0', () => {
    renderAt('/tasks', { user: { role: 'superadmin' }, title: 'Задачи', pending: 0 })
    expect(screen.queryByText('0')).toBeNull()
  })
})
```

- [ ] **Step 2.2: Run test, verify it fails**

```bash
npm run test:run -- src/components/shell/MobileTopBar.test.jsx
```

Expected: FAIL — file doesn't exist.

- [ ] **Step 2.3: Implement `MobileTopBar.jsx`**

Create `src/components/shell/MobileTopBar.jsx`:

```jsx
import { ArrowLeft, Bell, Menu } from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../useAuth.jsx'
import { isSuperadmin } from '../../lib/permissions.js'
import { usePendingDeletionCount } from '../../hooks/usePendingDeletionCount.js'
import { useSectionTitleValue } from '../../hooks/useSectionTitle.js'

const ROUTE_TO_TITLE = {
  '/': 'Дашборд',
  '/staff': 'Сотрудники',
  '/clients': 'Клиенты',
  '/teams': 'Команды',
  '/tasks': 'Задачи',
  '/notifications': 'Оповещения',
}

function deriveFallbackTitle(pathname) {
  if (ROUTE_TO_TITLE[pathname]) return ROUTE_TO_TITLE[pathname]
  // /tasks/all, /tasks/outbox, etc.
  for (const [prefix, label] of Object.entries(ROUTE_TO_TITLE)) {
    if (prefix !== '/' && pathname.startsWith(prefix)) return label
  }
  return ''
}

/**
 * Fixed 48px header for mobile shell.
 *
 * Left side:
 *   - default: hamburger (☰) — calls onMenuClick to open the drawer.
 *   - when context has backTo: ← back-arrow that navigates to that path.
 * Right side:
 *   - 🔔 (only for superadmin) with optional pending-count badge.
 *     Tap navigates to /notifications.
 *
 * Title from useSectionTitleValue(); falls back to a route-derived label.
 */
export function MobileTopBar({ onMenuClick }) {
  const { title: ctxTitle, backTo } = useSectionTitleValue()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const pending = usePendingDeletionCount({ enabled: isSuperadmin(user) })

  const title = ctxTitle || deriveFallbackTitle(location.pathname)
  const showNotifications = isSuperadmin(user)

  return (
    <header
      data-slot="mobile-top-bar"
      className="h-12 bg-card border-b border-border flex items-center justify-between px-2 pt-[env(safe-area-inset-top)]"
    >
      <div className="flex items-center gap-1 min-w-0 flex-1">
        {backTo ? (
          <button
            type="button"
            onClick={() => navigate(backTo)}
            aria-label="Назад"
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-md text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft size={22} />
          </button>
        ) : (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Открыть меню"
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-md text-foreground hover:bg-muted transition-colors"
          >
            <Menu size={22} />
          </button>
        )}
        <span className="text-base font-semibold text-foreground truncate">
          {title}
        </span>
      </div>
      {showNotifications && (
        <NavLink
          to="/notifications"
          aria-label="Оповещения"
          className="relative min-h-11 min-w-11 inline-flex items-center justify-center rounded-md text-foreground hover:bg-muted transition-colors"
        >
          <Bell size={22} />
          {pending > 0 && (
            <span
              className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-[var(--danger)] text-white text-[10px] font-bold rounded-full px-1 ring-2 ring-card flex items-center justify-center tabular"
              aria-label={`${pending} непрочитанных`}
            >
              {pending > 99 ? '99+' : pending}
            </span>
          )}
        </NavLink>
      )}
    </header>
  )
}
```

- [ ] **Step 2.4: Run tests, verify they pass**

```bash
npm run test:run -- src/components/shell/MobileTopBar.test.jsx
```

Expected: PASS, 11/11 tests green.

- [ ] **Step 2.5: Commit**

```bash
git add src/components/shell/MobileTopBar.jsx src/components/shell/MobileTopBar.test.jsx
git commit -m "feat(shell): add MobileTopBar component

Fixed 48px header for mobile. Left: hamburger (or back-arrow when
section sets backTo). Right: notifications icon with badge for
superadmin only. Title comes from useSectionTitleValue() with a
route-derived fallback.
"
```

---

### Task 3: `MobileBottomNav` component

**Цель:** fixed 56px bottom nav. До 5 NavLink items, role-gated точно так же как `RailNav`. Без notifications, без theme/profile (они теперь в TopBar и drawer соответственно).

**Files:**
- Create: `src/components/shell/MobileBottomNav.jsx`
- Create: `src/components/shell/MobileBottomNav.test.jsx`

- [ ] **Step 3.1: Write failing tests**

Create `src/components/shell/MobileBottomNav.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../useAuth.jsx', () => ({ useAuth: vi.fn() }))
vi.mock('../../hooks/useUserOverdueCount.js', () => ({ useUserOverdueCount: vi.fn() }))
vi.mock('../../hooks/useUserTeamMembership.js', () => ({ useUserTeamMembership: vi.fn() }))

import { MobileBottomNav } from './MobileBottomNav.jsx'
import { useAuth } from '../../useAuth.jsx'
import { useUserOverdueCount } from '../../hooks/useUserOverdueCount.js'
import { useUserTeamMembership } from '../../hooks/useUserTeamMembership.js'

function setup({ user, overdue = 0, hasTeam = false, path = '/' } = {}) {
  useAuth.mockReturnValue({ user })
  useUserOverdueCount.mockReturnValue({ count: overdue })
  useUserTeamMembership.mockReturnValue({ has: hasTeam })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MobileBottomNav />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('<MobileBottomNav>', () => {
  it('always shows Dashboard for authenticated users', () => {
    setup({ user: { id: 1, role: 'operator', permissions: ['view_own_tasks'] } })
    expect(screen.getByRole('link', { name: /Дашборд/ })).toBeInTheDocument()
  })

  it('hides Staff for users without create_users', () => {
    setup({ user: { id: 1, role: 'operator', permissions: ['view_own_tasks'] } })
    expect(screen.queryByRole('link', { name: /Сотрудники/ })).toBeNull()
  })

  it('shows Staff for admin', () => {
    setup({
      user: { id: 1, role: 'admin', permissions: ['create_users', 'manage_clients', 'view_all_tasks'] },
    })
    expect(screen.getByRole('link', { name: /Сотрудники/ })).toBeInTheDocument()
  })

  it('hides Clients for users without manage_clients', () => {
    setup({ user: { id: 1, role: 'operator', permissions: ['view_own_tasks'] } })
    expect(screen.queryByRole('link', { name: /Клиенты/ })).toBeNull()
  })

  it('shows Teams for teamlead role', () => {
    setup({ user: { id: 1, role: 'teamlead', permissions: ['view_own_tasks'] } })
    expect(screen.getByRole('link', { name: /Команды/ })).toBeInTheDocument()
  })

  it('hides Teams for operator without team membership', () => {
    setup({
      user: { id: 1, role: 'operator', permissions: ['view_own_tasks'] },
      hasTeam: false,
    })
    expect(screen.queryByRole('link', { name: /Команды/ })).toBeNull()
  })

  it('shows Teams for operator WITH team membership', () => {
    setup({
      user: { id: 1, role: 'operator', permissions: ['view_own_tasks'] },
      hasTeam: true,
    })
    expect(screen.getByRole('link', { name: /Команды/ })).toBeInTheDocument()
  })

  it('shows Tasks for users with view_own_tasks', () => {
    setup({ user: { id: 1, role: 'operator', permissions: ['view_own_tasks'] } })
    expect(screen.getByRole('link', { name: /Задачи/ })).toBeInTheDocument()
  })

  it('shows overdue badge on Tasks when count > 0', () => {
    setup({
      user: { id: 1, role: 'operator', permissions: ['view_own_tasks'] },
      overdue: 5,
    })
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('caps overdue badge at "99+"', () => {
    setup({
      user: { id: 1, role: 'operator', permissions: ['view_own_tasks'] },
      overdue: 142,
    })
    expect(screen.getByText('99+')).toBeInTheDocument()
  })

  it('renders no notifications, theme, or profile icons (only nav items)', () => {
    setup({ user: { id: 1, role: 'superadmin' } })
    expect(screen.queryByLabelText('Оповещения')).toBeNull()
    expect(screen.queryByLabelText('Тема оформления')).toBeNull()
    expect(screen.queryByLabelText('Меню пользователя')).toBeNull()
  })
})
```

- [ ] **Step 3.2: Run test, verify it fails**

```bash
npm run test:run -- src/components/shell/MobileBottomNav.test.jsx
```

Expected: FAIL — file doesn't exist.

- [ ] **Step 3.3: Implement `MobileBottomNav.jsx`**

Create `src/components/shell/MobileBottomNav.jsx`:

```jsx
import { NavLink } from 'react-router-dom'
import { CheckSquare, LayoutDashboard, Network, UserCircle, Users } from 'lucide-react'
import { useAuth } from '../../useAuth.jsx'
import { hasPermission } from '../../lib/permissions.js'
import { canSeeTeamsNav } from '../../lib/teams.js'
import { useUserOverdueCount } from '../../hooks/useUserOverdueCount.js'
import { useUserTeamMembership } from '../../hooks/useUserTeamMembership.js'

function NavItem({ to, end, icon, label, badge }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative min-h-11 min-w-11 flex flex-1 flex-col items-center justify-center gap-0.5 px-1 transition-colors ${
          isActive ? 'text-primary' : 'text-[var(--fg2)]'
        }`
      }
    >
      <span className="relative">
        {icon}
        {badge > 0 && (
          <span
            className="absolute -top-1 -right-2 min-w-[18px] h-[18px] bg-[var(--danger)] text-white text-[10px] font-bold rounded-full px-1 ring-2 ring-card flex items-center justify-center tabular"
            aria-label={`${badge} срочных`}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </NavLink>
  )
}

export function MobileBottomNav() {
  const { user } = useAuth()
  const { has: hasTeam } = useUserTeamMembership(user?.id)
  const canSeeStaff = hasPermission(user, 'create_users')
  const canSeeClients = hasPermission(user, 'manage_clients')
  const canSeeTeams = canSeeTeamsNav(user, hasTeam)
  const canSeeTasks =
    hasPermission(user, 'view_own_tasks') || hasPermission(user, 'view_all_tasks')
  const { count: overdue } = useUserOverdueCount(canSeeTasks ? user?.id : null)

  return (
    <nav
      data-slot="mobile-bottom-nav"
      aria-label="Главное меню"
      className="h-14 bg-card border-t border-border flex items-stretch px-1 pb-[env(safe-area-inset-bottom)]"
    >
      <NavItem to="/" end icon={<LayoutDashboard size={20} />} label="Дашборд" />
      {canSeeStaff && (
        <NavItem to="/staff" icon={<Users size={20} />} label="Сотр." />
      )}
      {canSeeClients && (
        <NavItem to="/clients" icon={<UserCircle size={20} />} label="Клиенты" />
      )}
      {canSeeTeams && (
        <NavItem to="/teams" icon={<Network size={20} />} label="Команды" />
      )}
      {canSeeTasks && (
        <NavItem
          to="/tasks"
          icon={<CheckSquare size={20} />}
          label="Задачи"
          badge={overdue}
        />
      )}
    </nav>
  )
}
```

- [ ] **Step 3.4: Run tests, verify they pass**

```bash
npm run test:run -- src/components/shell/MobileBottomNav.test.jsx
```

Expected: PASS, 11/11 tests green.

- [ ] **Step 3.5: Commit**

```bash
git add src/components/shell/MobileBottomNav.jsx src/components/shell/MobileBottomNav.test.jsx
git commit -m "feat(shell): add MobileBottomNav component

Fixed 56px bottom nav for mobile. 5 role-gated NavLink items
(Дашборд, Сотр., Клиенты, Команды, Задачи) with the same
permission checks as RailNav. Overdue badge on Tasks. No
notifications/theme/profile icons (those live in TopBar and
drawer respectively).
"
```

---

### Task 4: `MobileNavDrawer` component

**Цель:** Sheet `side="left"` со списком: профиль (имя + role label) + Theme switch + Admin links (только superadmin) + Logout. Controlled component (`open` + `onOpenChange`).

**Files:**
- Create: `src/components/shell/MobileNavDrawer.jsx`
- Create: `src/components/shell/MobileNavDrawer.test.jsx`

- [ ] **Step 4.1: Write failing tests**

Create `src/components/shell/MobileNavDrawer.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../useAuth.jsx', () => ({ useAuth: vi.fn() }))
vi.mock('../../hooks/useTheme.js', () => ({ useTheme: vi.fn() }))

import { MobileNavDrawer } from './MobileNavDrawer.jsx'
import { useAuth } from '../../useAuth.jsx'
import { useTheme } from '../../hooks/useTheme.js'

function setup({
  user,
  open = true,
  onOpenChange = vi.fn(),
  onLogout = vi.fn(),
  theme = 'system',
  setTheme = vi.fn(),
} = {}) {
  useAuth.mockReturnValue({ user, logout: onLogout })
  useTheme.mockReturnValue([theme, setTheme])
  return render(
    <MemoryRouter>
      <MobileNavDrawer open={open} onOpenChange={onOpenChange} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('<MobileNavDrawer>', () => {
  it('does not render content when closed', () => {
    setup({ user: { id: 1, role: 'operator' }, open: false })
    expect(screen.queryByText('Выйти')).toBeNull()
  })

  it('shows the user display name and role label', () => {
    setup({ user: { id: 1, alias: 'Артём', role: 'admin' } })
    expect(screen.getByText('Артём')).toBeInTheDocument()
    expect(screen.getByText('Администратор')).toBeInTheDocument()
  })

  it('shows the theme section with current theme highlighted', () => {
    setup({ user: { id: 1, role: 'admin' }, theme: 'dark' })
    expect(screen.getByText('Тема')).toBeInTheDocument()
    const darkBtn = screen.getByRole('button', { name: /Тёмная/ })
    expect(darkBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('calls setTheme when theme option clicked', () => {
    const setTheme = vi.fn()
    setup({ user: { id: 1, role: 'admin' }, theme: 'system', setTheme })
    fireEvent.click(screen.getByRole('button', { name: /Светлая/ }))
    expect(setTheme).toHaveBeenCalledWith('light')
  })

  it('shows admin links only for superadmin', () => {
    setup({ user: { id: 1, role: 'superadmin' } })
    expect(screen.getByText('Платформы')).toBeInTheDocument()
    expect(screen.getByText('Агентства')).toBeInTheDocument()
  })

  it('hides admin links for non-superadmin', () => {
    setup({ user: { id: 1, role: 'admin' } })
    expect(screen.queryByText('Платформы')).toBeNull()
    expect(screen.queryByText('Агентства')).toBeNull()
  })

  it('calls logout on logout button click', () => {
    const onLogout = vi.fn()
    setup({ user: { id: 1, role: 'admin' }, onLogout })
    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('renders a sheet content slot when open', () => {
    setup({ user: { id: 1, role: 'admin' }, open: true })
    expect(document.querySelector('[data-slot="sheet-content"]')).not.toBeNull()
  })
})
```

- [ ] **Step 4.2: Run test, verify it fails**

```bash
npm run test:run -- src/components/shell/MobileNavDrawer.test.jsx
```

Expected: FAIL — file doesn't exist.

- [ ] **Step 4.3: Implement `MobileNavDrawer.jsx`**

Create `src/components/shell/MobileNavDrawer.jsx`:

```jsx
import { LogOut, Moon, Sun, Monitor, Settings, Building2 } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuth } from '../../useAuth.jsx'
import { isSuperadmin } from '../../lib/permissions.js'
import { useTheme } from '../../hooks/useTheme.js'

const ROLE_LABEL = {
  superadmin: 'Супер-Админ',
  admin: 'Администратор',
  moderator: 'Модератор',
  teamlead: 'Тим Лидер',
  operator: 'Оператор',
}

const THEME_OPTIONS = [
  { id: 'system', label: 'Системная', Icon: Monitor },
  { id: 'light', label: 'Светлая', Icon: Sun },
  { id: 'dark', label: 'Тёмная', Icon: Moon },
]

function computeInitials(user) {
  const source = user?.alias || user?.firstName || user?.email || '?'
  return source
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

/**
 * Drawer для overflow-навигации на mobile. Открывается тапом ☰ в TopBar.
 *
 * Содержит: профиль-блок, theme switch, admin-секция (для superadmin),
 * logout. Управляется снаружи через open / onOpenChange (закрывается
 * MobileShell при route change, backdrop tap, swipe-left, Esc).
 */
export function MobileNavDrawer({ open, onOpenChange }) {
  const { user, logout } = useAuth()
  const [theme, setTheme] = useTheme()

  const displayName = user?.alias || user?.firstName || user?.email || ''
  const roleLabel = user?.role ? ROLE_LABEL[user.role] || user.role : ''
  const initials = computeInitials(user)
  const showAdmin = isSuperadmin(user)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-[80%] max-w-[320px] p-0 flex flex-col"
      >
        <div
          data-slot="mobile-drawer-profile"
          className="px-5 pt-6 pb-4 border-b border-border flex items-center gap-3 pt-[env(safe-area-inset-top)]"
        >
          <Avatar className="h-10 w-10">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{displayName}</div>
            {roleLabel && (
              <div className="text-xs text-muted-foreground truncate">{roleLabel}</div>
            )}
          </div>
        </div>

        <div className="px-3 py-3 border-b border-border">
          <div className="px-2 pb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            Тема
          </div>
          <div className="flex flex-col gap-1">
            {THEME_OPTIONS.map(({ id, label, Icon }) => {
              const isActive = theme === id
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setTheme(id)}
                  className={`min-h-11 flex items-center gap-3 px-3 rounded-md text-sm transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {showAdmin && (
          <div className="px-3 py-3 border-b border-border">
            <div className="px-2 pb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              Админ
            </div>
            <div className="flex flex-col gap-1">
              <NavLink
                to="/admin/platforms"
                className="min-h-11 flex items-center gap-3 px-3 rounded-md text-sm text-foreground hover:bg-muted"
              >
                <Settings size={16} />
                <span>Платформы</span>
              </NavLink>
              <NavLink
                to="/admin/agencies"
                className="min-h-11 flex items-center gap-3 px-3 rounded-md text-sm text-foreground hover:bg-muted"
              >
                <Building2 size={16} />
                <span>Агентства</span>
              </NavLink>
            </div>
          </div>
        )}

        <div className="mt-auto p-3 pb-[env(safe-area-inset-bottom)]">
          <button
            type="button"
            onClick={logout}
            aria-label="Выйти"
            className="min-h-11 w-full flex items-center gap-3 px-3 rounded-md text-sm text-[var(--danger-ink)] hover:bg-[var(--danger)]/10 transition-colors"
          >
            <LogOut size={16} />
            <span>Выйти</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 4.4: Run tests, verify they pass**

```bash
npm run test:run -- src/components/shell/MobileNavDrawer.test.jsx
```

Expected: PASS, 8/8 tests green. (Sheet primitive renders into a portal — `document.querySelector` works because Testing Library appends body.)

- [ ] **Step 4.5: Commit**

```bash
git add src/components/shell/MobileNavDrawer.jsx src/components/shell/MobileNavDrawer.test.jsx
git commit -m "feat(shell): add MobileNavDrawer component

Side drawer (Base UI Sheet, side='left') for mobile overflow.
Contains profile block, theme switcher (inline 3-option list),
admin links for superadmin only, and logout button at the bottom.
Controlled component (open/onOpenChange) — owner is MobileShell.
"
```

---

### Task 5: `MobileShell` composition

**Цель:** root для mobile branch. Композит TopBar + Outlet + BottomNav + Drawer. Owner of `drawerOpen` state. Закрывает drawer при изменении `location.pathname`.

**Files:**
- Create: `src/components/shell/MobileShell.jsx`
- Create: `src/components/shell/MobileShell.test.jsx`

- [ ] **Step 5.1: Write failing tests**

Create `src/components/shell/MobileShell.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom'

vi.mock('../../useAuth.jsx', () => ({
  useAuth: () => ({
    user: { id: 1, role: 'admin', permissions: ['create_users', 'manage_clients', 'view_all_tasks'] },
    logout: vi.fn(),
  }),
}))
vi.mock('../../hooks/useUserOverdueCount.js', () => ({
  useUserOverdueCount: () => ({ count: 0 }),
}))
vi.mock('../../hooks/usePendingDeletionCount.js', () => ({
  usePendingDeletionCount: () => 0,
}))
vi.mock('../../hooks/useUserTeamMembership.js', () => ({
  useUserTeamMembership: () => ({ has: false }),
}))
vi.mock('../../hooks/useTheme.js', () => ({
  useTheme: () => ['system', vi.fn()],
}))

import { MobileShell } from './MobileShell.jsx'

describe('<MobileShell>', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders TopBar, Outlet content and BottomNav', () => {
    render(
      <MemoryRouter initialEntries={['/clients']}>
        <Routes>
          <Route element={<MobileShell />}>
            <Route path="/clients" element={<div data-testid="page">Клиенты body</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(document.querySelector('[data-slot="mobile-top-bar"]')).not.toBeNull()
    expect(screen.getByTestId('page')).toHaveTextContent('Клиенты body')
    expect(document.querySelector('[data-slot="mobile-bottom-nav"]')).not.toBeNull()
  })

  it('opens drawer when hamburger clicked', () => {
    render(
      <MemoryRouter initialEntries={['/clients']}>
        <Routes>
          <Route element={<MobileShell />}>
            <Route path="/clients" element={<div>page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: 'Выйти' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Открыть меню' }))
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument()
  })

  it('closes drawer when route changes', () => {
    function Trigger() {
      const navigate = useNavigate()
      return (
        <button data-testid="go" onClick={() => navigate('/tasks')}>
          go
        </button>
      )
    }
    render(
      <MemoryRouter initialEntries={['/clients']}>
        <Routes>
          <Route element={<MobileShell />}>
            <Route path="/clients" element={<Trigger />} />
            <Route path="/tasks" element={<div data-testid="tasks">tasks page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Открыть меню' }))
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('go'))
    expect(screen.getByTestId('tasks')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Выйти' })).toBeNull()
  })
})
```

- [ ] **Step 5.2: Run test, verify it fails**

```bash
npm run test:run -- src/components/shell/MobileShell.test.jsx
```

Expected: FAIL — file doesn't exist.

- [ ] **Step 5.3: Implement `MobileShell.jsx`**

Create `src/components/shell/MobileShell.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SectionTitleProvider } from '../../hooks/useSectionTitle.js'
import { MobileTopBar } from './MobileTopBar.jsx'
import { MobileBottomNav } from './MobileBottomNav.jsx'
import { MobileNavDrawer } from './MobileNavDrawer.jsx'

/**
 * Root composition for mobile shell. Owns the drawer-open state and
 * closes it automatically on route change so navigation feels native.
 *
 * Layout: grid-rows [auto_1fr_auto] — TopBar / scrollable Outlet /
 * BottomNav. h-screen contains everything within the viewport.
 */
export function MobileShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  return (
    <TooltipProvider delayDuration={300}>
      <SectionTitleProvider>
        <div
          data-slot="mobile-shell"
          className="grid grid-rows-[auto_1fr_auto] h-screen"
        >
          <MobileTopBar onMenuClick={() => setDrawerOpen(true)} />
          <main className="overflow-auto">
            <Outlet />
          </main>
          <MobileBottomNav />
        </div>
        <MobileNavDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
      </SectionTitleProvider>
    </TooltipProvider>
  )
}
```

- [ ] **Step 5.4: Run tests, verify they pass**

```bash
npm run test:run -- src/components/shell/MobileShell.test.jsx
```

Expected: PASS, 3/3 tests green.

- [ ] **Step 5.5: Commit**

```bash
git add src/components/shell/MobileShell.jsx src/components/shell/MobileShell.test.jsx
git commit -m "feat(shell): add MobileShell root composition

Wraps SectionTitleProvider + grid-rows layout (TopBar / Outlet
/ BottomNav). Owns drawer state and closes drawer automatically
when location.pathname changes. Standalone — not wired into
AppShell yet (next task).
"
```

---

### Task 6: Wire `MobileShell` into `AppShell` via `useIsMobile`

**Цель:** root branch — `AppShell` рендерит `MobileShell` на mobile, текущий desktop layout на desktop. Это первый шаг где `useIsMobile` начинает использоваться.

**Files:**
- Modify: `src/components/shell/AppShell.jsx`
- Modify: `src/components/shell/AppShell.test.jsx`
- Modify: `src/components/shell/index.js`

- [ ] **Step 6.1: Add mobile-branch test (failing)**

Read `src/components/shell/AppShell.test.jsx`. At the top, after the existing `vi.mock` calls (line 19), add a mock for `useIsMobile`:

```jsx
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(),
}))
vi.mock('../../hooks/useTheme.js', () => ({
  useTheme: () => ['system', vi.fn()],
}))
```

Then update the import block to also import the mock so we can control it:

```jsx
import { AppShell } from './AppShell.jsx'
import { useIsMobile } from '@/hooks/use-mobile'
```

Add this `describe` block AFTER the existing one (do not delete the existing tests; they cover desktop):

```jsx
describe('<AppShell> mobile branch', () => {
  it('renders MobileShell when isMobile=true', () => {
    useIsMobile.mockReturnValue(true)
    render(
      <MemoryRouter initialEntries={['/clients']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/clients" element={<div data-testid="page">Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(document.querySelector('[data-slot="mobile-shell"]')).not.toBeNull()
    expect(screen.queryByLabelText('Главное меню')).not.toBeNull() // bottom-nav has same aria
    expect(screen.getByTestId('page')).toBeInTheDocument()
  })

  it('renders desktop rail nav when isMobile=false', () => {
    useIsMobile.mockReturnValue(false)
    render(
      <MemoryRouter initialEntries={['/clients']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/clients" element={<div data-testid="page">Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(document.querySelector('[data-slot="mobile-shell"]')).toBeNull()
    // Desktop rail-nav uses aside with role and aria-label
    const rails = document.querySelectorAll('aside[aria-label="Главное меню"]')
    expect(rails.length).toBeGreaterThan(0)
  })
})
```

The existing two tests need `useIsMobile.mockReturnValue(false)` injected at the top so they don't break. Modify the existing tests to add at the start of each `it(...)` block:

```jsx
useIsMobile.mockReturnValue(false)
```

(Do this for both pre-existing test cases in the file.)

- [ ] **Step 6.2: Run test, verify mobile-branch tests fail**

```bash
npm run test:run -- src/components/shell/AppShell.test.jsx
```

Expected: existing 2 desktop tests pass, new 2 mobile-branch tests FAIL with «mobile-shell slot not found».

- [ ] **Step 6.3: Add `useIsMobile` branch to `AppShell.jsx`**

Open `src/components/shell/AppShell.jsx`. Replace the entire file contents with:

```jsx
import { Outlet } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useIsMobile } from '@/hooks/use-mobile'
import { RailNav } from './RailNav.jsx'
import { MobileShell } from './MobileShell.jsx'

export function AppShell() {
  const isMobile = useIsMobile()
  if (isMobile) {
    return <MobileShell />
  }
  return (
    <TooltipProvider delayDuration={300}>
      <div className="grid grid-cols-[56px_1fr] grid-rows-[1fr] h-screen">
        <RailNav />
        <main className="overflow-auto">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  )
}
```

- [ ] **Step 6.4: Update `src/components/shell/index.js` to export new components**

Read `src/components/shell/index.js`. Replace contents with:

```js
export { AppShell } from './AppShell.jsx'
export { RailNav } from './RailNav.jsx'
export { UserMenuDropdown } from './UserMenuDropdown.jsx'
export { MasterDetailLayout } from './MasterDetailLayout.jsx'
export { ListPane } from './ListPane.jsx'
export { SearchInput } from './SearchInput.jsx'
export { MobileShell } from './MobileShell.jsx'
export { MobileTopBar } from './MobileTopBar.jsx'
export { MobileBottomNav } from './MobileBottomNav.jsx'
export { MobileNavDrawer } from './MobileNavDrawer.jsx'
```

- [ ] **Step 6.5: Run AppShell tests, verify all pass**

```bash
npm run test:run -- src/components/shell/AppShell.test.jsx
```

Expected: PASS, 4/4 tests green (2 existing + 2 new).

- [ ] **Step 6.6: Run full test suite to catch regressions**

```bash
npm run test:run
```

Expected: total = `T_BASE` + 33 (or close — 6 useSectionTitle + 11 MobileTopBar + 11 MobileBottomNav + 8 MobileNavDrawer + 3 MobileShell + 2 AppShell new tests = 41 new). All passing.

- [ ] **Step 6.7: Commit**

```bash
git add src/components/shell/AppShell.jsx src/components/shell/AppShell.test.jsx src/components/shell/index.js
git commit -m "feat(shell): branch AppShell on useIsMobile

Below 768px AppShell now renders MobileShell (TopBar + Outlet
+ BottomNav + Drawer). Desktop layout (RailNav + 2-col grid)
unchanged. Closes the orphan-status of useIsMobile — first use
site project-wide.
"
```

---

### Task 7: `MasterDetailLayout` mobile branch + `detailEmpty` prop

**Цель:** На mobile рендерить ИЛИ list-pane ИЛИ detail children по новому prop'у `detailEmpty`. Desktop остаётся 2-колоночным.

**Files:**
- Modify: `src/components/shell/MasterDetailLayout.jsx`
- Modify: `src/components/shell/MasterDetailLayout.test.jsx`

- [ ] **Step 7.1: Add failing tests for the mobile branch**

Read `src/components/shell/MasterDetailLayout.test.jsx`. Replace its contents with:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: vi.fn() }))

import { MasterDetailLayout } from './MasterDetailLayout.jsx'
import { useIsMobile } from '@/hooks/use-mobile'

beforeEach(() => vi.clearAllMocks())

describe('<MasterDetailLayout> desktop', () => {
  it('renders listPane in left aside and children in main section', () => {
    useIsMobile.mockReturnValue(false)
    render(
      <MasterDetailLayout listPane={<div data-testid="lp">List Content</div>}>
        <div data-testid="main">Main Content</div>
      </MasterDetailLayout>,
    )
    expect(screen.getByTestId('lp')).toHaveTextContent('List Content')
    expect(screen.getByTestId('main')).toHaveTextContent('Main Content')
  })

  it('uses fixed 320px column for the list pane', () => {
    useIsMobile.mockReturnValue(false)
    const { container } = render(
      <MasterDetailLayout listPane={<div />}>
        <div />
      </MasterDetailLayout>,
    )
    const root = container.firstChild
    expect(root.className).toMatch(/grid-cols-\[320px_1fr\]/)
  })

  it('renders aria-label on aside and section when listLabel/detailLabel provided', () => {
    useIsMobile.mockReturnValue(false)
    render(
      <MasterDetailLayout
        listPane={<div data-testid="lp" />}
        listLabel="Список клиентов"
        detailLabel="Профиль клиента"
      >
        <div data-testid="main" />
      </MasterDetailLayout>,
    )
    expect(screen.getByLabelText('Список клиентов').tagName).toBe('ASIDE')
    expect(screen.getByLabelText('Профиль клиента').tagName).toBe('SECTION')
  })

  it('omits aria-label attribute when labels are undefined', () => {
    useIsMobile.mockReturnValue(false)
    const { container } = render(
      <MasterDetailLayout listPane={<div />}>
        <div />
      </MasterDetailLayout>,
    )
    expect(container.querySelector('aside')).not.toHaveAttribute('aria-label')
    expect(container.querySelector('section')).not.toHaveAttribute('aria-label')
  })
})

describe('<MasterDetailLayout> mobile', () => {
  it('renders only listPane when detailEmpty=true', () => {
    useIsMobile.mockReturnValue(true)
    render(
      <MasterDetailLayout
        listPane={<div data-testid="lp">List</div>}
        detailEmpty={true}
        listLabel="L"
        detailLabel="D"
      >
        <div data-testid="main">Main</div>
      </MasterDetailLayout>,
    )
    expect(screen.getByTestId('lp')).toHaveTextContent('List')
    expect(screen.queryByTestId('main')).toBeNull()
    expect(screen.getByLabelText('L').tagName).toBe('ASIDE')
    expect(screen.queryByLabelText('D')).toBeNull()
  })

  it('renders only children when detailEmpty=false', () => {
    useIsMobile.mockReturnValue(true)
    render(
      <MasterDetailLayout
        listPane={<div data-testid="lp">List</div>}
        detailEmpty={false}
        listLabel="L"
        detailLabel="D"
      >
        <div data-testid="main">Main</div>
      </MasterDetailLayout>,
    )
    expect(screen.queryByTestId('lp')).toBeNull()
    expect(screen.getByTestId('main')).toHaveTextContent('Main')
    expect(screen.getByLabelText('D').tagName).toBe('SECTION')
    expect(screen.queryByLabelText('L')).toBeNull()
  })

  it('treats omitted detailEmpty as truthy (defaults to list view)', () => {
    useIsMobile.mockReturnValue(true)
    render(
      <MasterDetailLayout listPane={<div data-testid="lp" />}>
        <div data-testid="main" />
      </MasterDetailLayout>,
    )
    expect(screen.getByTestId('lp')).toBeInTheDocument()
    expect(screen.queryByTestId('main')).toBeNull()
  })
})
```

- [ ] **Step 7.2: Run test, verify mobile branch tests fail**

```bash
npm run test:run -- src/components/shell/MasterDetailLayout.test.jsx
```

Expected: 4 desktop tests pass, 3 mobile tests FAIL.

- [ ] **Step 7.3: Implement mobile branch in `MasterDetailLayout.jsx`**

Open `src/components/shell/MasterDetailLayout.jsx`. Replace its contents with:

```jsx
import { useIsMobile } from '@/hooks/use-mobile'

export function MasterDetailLayout({
  listPane,
  listLabel,
  detailLabel,
  detailEmpty = true,
  children,
}) {
  const isMobile = useIsMobile()
  if (isMobile) {
    if (detailEmpty) {
      return (
        <aside aria-label={listLabel} className="h-full overflow-y-auto">
          {listPane}
        </aside>
      )
    }
    return (
      <section aria-label={detailLabel} className="h-full overflow-y-auto">
        {children}
      </section>
    )
  }
  return (
    <div className="grid grid-cols-[320px_1fr] h-full">
      <aside
        aria-label={listLabel}
        className="border-r border-border bg-card overflow-y-auto"
      >
        {listPane}
      </aside>
      <section aria-label={detailLabel} className="overflow-y-auto">
        {children}
      </section>
    </div>
  )
}
```

- [ ] **Step 7.4: Run tests, verify all pass**

```bash
npm run test:run -- src/components/shell/MasterDetailLayout.test.jsx
```

Expected: PASS, 7/7 (4 desktop + 3 mobile).

- [ ] **Step 7.5: Commit**

```bash
git add src/components/shell/MasterDetailLayout.jsx src/components/shell/MasterDetailLayout.test.jsx
git commit -m "feat(shell): MasterDetailLayout mobile branch (push nav)

New prop detailEmpty (default true). On mobile, renders ONLY
the listPane when detailEmpty=true, ONLY the detail children
when detailEmpty=false. Desktop layout (2-col grid) unchanged.
Pages will pass detailEmpty={!param} based on their URL params.
"
```

---

### Task 8: Wire 4 list pages — `useSectionTitle` + `detailEmpty`

**Цель:** Каждая из 4 master/detail-страниц объявляет section title и сообщает `MasterDetailLayout` есть ли выбранный detail.

**Files:**
- Modify: `src/pages/TaskListPage.jsx`
- Modify: `src/pages/ClientListPage.jsx`
- Modify: `src/pages/TeamListPage.jsx`
- Modify: `src/pages/StaffListPage.jsx`

- [ ] **Step 8.1: Patch `TaskListPage.jsx`**

Read `src/pages/TaskListPage.jsx`. Find the import block at the top (lines ~9-22). Add the `useSectionTitle` import alongside other hook imports — insert after line 11 (`import { hasPermission } from '../lib/permissions.js'`):

```jsx
import { useSectionTitle } from '../hooks/useSectionTitle.js'
```

Find the `TaskListPage` function declaration (currently line ~66). After `const { user } = useAuth()` and before reading other hooks, add:

```jsx
useSectionTitle('Задачи')
```

Then find the `<MasterDetailLayout` JSX (currently at line ~173). Add `detailEmpty={!taskIdParam}` between `listLabel` and `detailLabel`. The full JSX should read:

```jsx
<MasterDetailLayout
  listPane={
    <ListPane ...>
      ...
    </ListPane>
  }
  detailEmpty={!taskIdParam}
  listLabel="Список задач"
  detailLabel="Задача"
>
```

(`taskIdParam` is already in scope at line ~101: `const taskIdParam = useParams().taskId`.)

- [ ] **Step 8.2: Patch `ClientListPage.jsx`**

Read `src/pages/ClientListPage.jsx`. Find the imports near the top. Add:

```jsx
import { useSectionTitle } from '../hooks/useSectionTitle.js'
```

Find the `ClientListPage` function. Near the top of the function body (right after destructuring `useAuth()` etc., wherever feels natural), add:

```jsx
useSectionTitle('Клиенты')
```

Find the `<MasterDetailLayout` JSX. Page's URL param is `clientId` (read via `useParams()`). If it's not already destructured, add `const { clientId } = useParams()` near the top of the function body. Then add `detailEmpty={!clientId}` to the `<MasterDetailLayout>` props.

- [ ] **Step 8.3: Patch `TeamListPage.jsx`**

Same pattern. Param name: `teamId`.

```jsx
import { useSectionTitle } from '../hooks/useSectionTitle.js'
```

In `TeamListPage`:
```jsx
useSectionTitle('Команды')
const { teamId } = useParams()
```

In `<MasterDetailLayout>` props:
```jsx
detailEmpty={!teamId}
```

- [ ] **Step 8.4: Patch `StaffListPage.jsx`**

Same pattern. Param name: `refCode`.

```jsx
import { useSectionTitle } from '../hooks/useSectionTitle.js'
```

In `StaffListPage`:
```jsx
useSectionTitle('Сотрудники')
const { refCode } = useParams()
```

In `<MasterDetailLayout>` props:
```jsx
detailEmpty={!refCode}
```

- [ ] **Step 8.5: Run all tests + build**

```bash
npm run test:run
npm run build
```

Expected: tests still pass (no test changes here — pages are tested implicitly through render in their existing tests, if any). Build succeeds.

- [ ] **Step 8.6: Commit**

```bash
git add src/pages/TaskListPage.jsx src/pages/ClientListPage.jsx src/pages/TeamListPage.jsx src/pages/StaffListPage.jsx
git commit -m "feat(pages): wire master/detail pages to useSectionTitle + detailEmpty

Each list page publishes its section title via useSectionTitle
and passes detailEmpty={!urlParam} to MasterDetailLayout so
mobile correctly swaps between list-only and detail-only views.
"
```

---

### Task 9: Wire 4 detail panels — `useSectionTitle` with `backTo`

**Цель:** Когда открыт detail (Клиент B, Задача 42, etc.), TopBar показывает entity-name и заменяет ☰ на ←.

**Files:**
- Modify: `src/components/tasks/TaskDetailPanel.jsx`
- Modify: `src/components/clients/ClientDetailPanel.jsx`
- Modify: `src/components/teams/TeamDetailPanel.jsx`
- Modify: `src/components/staff/StaffDetailPanel.jsx`

- [ ] **Step 9.1: Patch `TaskDetailPanel.jsx`**

Read `src/components/tasks/TaskDetailPanel.jsx`. Add import near other hook imports:

```jsx
import { useLocation } from 'react-router-dom'
import { useSectionTitle } from '../../hooks/useSectionTitle.js'
```

(`useLocation` may already be imported alongside `useNavigate` — if so just add `useLocation` to the existing import.)

Inside `TaskDetailPanel` function, after the line that loads `row` (`const { row, loading, error, reload } = useTask(callerId, taskId)`), add:

```jsx
const location = useLocation()
const taskBox = location.pathname.startsWith('/tasks/all')
  ? '/tasks/all'
  : location.pathname.startsWith('/tasks/outbox')
    ? '/tasks/outbox'
    : '/tasks'
useSectionTitle(row?.title || 'Задача', { backTo: taskBox })
```

(Tasks have `box` semantics — back goes to the matching list `/tasks`, `/tasks/all`, or `/tasks/outbox`.)

- [ ] **Step 9.2: Patch `ClientDetailPanel.jsx`**

Read `src/components/clients/ClientDetailPanel.jsx`. Add import:

```jsx
import { useSectionTitle } from '../../hooks/useSectionTitle.js'
```

Inside `ClientDetailPanel`, after `const { row, loading, error, reload } = useClient(callerId, clientId)`, add:

```jsx
useSectionTitle(row?.name || 'Клиент', { backTo: '/clients' })
```

- [ ] **Step 9.3: Patch `TeamDetailPanel.jsx`**

Read `src/components/teams/TeamDetailPanel.jsx`. Add import:

```jsx
import { useSectionTitle } from '../../hooks/useSectionTitle.js'
```

Inside `TeamDetailPanel`, after `const { row, loading, error, reload } = useTeam(callerId, teamId)`, add:

```jsx
useSectionTitle(row?.name || 'Команда', { backTo: '/teams' })
```

- [ ] **Step 9.4: Patch `StaffDetailPanel.jsx`**

Read `src/components/staff/StaffDetailPanel.jsx`. Add import:

```jsx
import { useSectionTitle } from '../../hooks/useSectionTitle.js'
```

Inside `StaffDetailPanel`, after the `useStaff` call (the line that destructures `row`), add:

```jsx
useSectionTitle(row?.alias || row?.firstName || 'Сотрудник', { backTo: '/staff' })
```

- [ ] **Step 9.5: Run tests + build**

```bash
npm run test:run
npm run build
```

Expected: all tests still pass; build succeeds.

- [ ] **Step 9.6: Commit**

```bash
git add src/components/tasks/TaskDetailPanel.jsx src/components/clients/ClientDetailPanel.jsx src/components/teams/TeamDetailPanel.jsx src/components/staff/StaffDetailPanel.jsx
git commit -m "feat(detail): publish detail title + backTo to MobileTopBar

Each DetailPanel publishes the entity name via useSectionTitle
with backTo set to the parent list path. On mobile this makes
TopBar show the entity name and replace the hamburger with a
back arrow that returns to the list.
"
```

---

### Task 10: Wire standalone pages (Dashboard, Notifications)

**Цель:** Эти страницы не используют `MasterDetailLayout`, но всё равно должны проставлять title в TopBar.

**Files:**
- Modify: `src/pages/DashboardPage.jsx`
- Modify: `src/pages/NotificationsPage.jsx`

- [ ] **Step 10.1: Patch `DashboardPage.jsx`**

Read `src/pages/DashboardPage.jsx`. Add import:

```jsx
import { useSectionTitle } from '../hooks/useSectionTitle.js'
```

Inside the `DashboardPage` function, at the top of the body, add:

```jsx
useSectionTitle('Дашборд')
```

- [ ] **Step 10.2: Patch `NotificationsPage.jsx`**

Read `src/pages/NotificationsPage.jsx`. Add import:

```jsx
import { useSectionTitle } from '../hooks/useSectionTitle.js'
```

Inside `NotificationsPage`, at the top of the body, add:

```jsx
useSectionTitle('Оповещения')
```

- [ ] **Step 10.3: Run tests + build**

```bash
npm run test:run
npm run build
```

Expected: all tests pass; build succeeds.

- [ ] **Step 10.4: Commit**

```bash
git add src/pages/DashboardPage.jsx src/pages/NotificationsPage.jsx
git commit -m "feat(pages): publish title for standalone Dashboard/Notifications

Both pages now call useSectionTitle so MobileTopBar renders the
correct heading instead of the route fallback.
"
```

---

### Task 11: Slide-out responsive — `Sheet side` via `useIsMobile`

**Цель:** На mobile все 4 create-формы открываются bottom-sheet'ом (`side="bottom"`, `h-[90vh]`) вместо `side="right"` который выезжал бы за пределы экрана.

**Files:**
- Modify: `src/components/tasks/CreateTaskSlideOut.jsx`
- Modify: `src/components/clients/CreateClientSlideOut.jsx`
- Modify: `src/components/teams/CreateTeamSlideOut.jsx`
- Modify: `src/components/staff/CreateStaffSlideOut.jsx`

For each of the 4 files the change is identical in shape — adapt to whatever surrounding code is present.

- [ ] **Step 11.1: Patch `CreateClientSlideOut.jsx`**

Read `src/components/clients/CreateClientSlideOut.jsx`. Find the existing import line near the top:

```jsx
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
```

Add ABOVE it (or wherever other hook imports live):

```jsx
import { useIsMobile } from '@/hooks/use-mobile'
```

Inside the component function, near the top of the body (alongside other `useState` calls), add:

```jsx
const isMobile = useIsMobile()
```

Find the `<SheetContent` JSX (around line 185). Currently it reads:

```jsx
<SheetContent
  side="right"
  ...existing className...
>
```

Replace `side="right"` with:

```jsx
side={isMobile ? 'bottom' : 'right'}
```

If the existing className includes a fixed width (e.g., `sm:max-w-md` or similar), append `${isMobile ? ' h-[90vh]' : ''}` to the className via template-string concatenation. If the existing className is a static string, convert to template literal:

```jsx
className={`...existing classes... ${isMobile ? 'h-[90vh]' : ''}`}
```

- [ ] **Step 11.2: Patch `CreateTaskSlideOut.jsx`**

Same pattern. Read the file, add `useIsMobile` import, declare `const isMobile = useIsMobile()` inside the component, swap `side` and append `h-[90vh]` to className when mobile.

- [ ] **Step 11.3: Patch `CreateTeamSlideOut.jsx`**

Same pattern.

- [ ] **Step 11.4: Patch `CreateStaffSlideOut.jsx`**

Same pattern.

- [ ] **Step 11.5: Run tests + build**

```bash
npm run test:run
npm run build
```

Expected: tests pass (slide-out tests exist for at least `CreateStaffSlideOut`, they should continue to pass — `useIsMobile` returns `false` by default in jsdom because no matchMedia mock is set up to flip it). Build succeeds.

If a slide-out test fails because the test assumes `side="right"` and we now read from `useIsMobile`, mock `useIsMobile` in that test file with `vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))` to keep the desktop assertion stable.

- [ ] **Step 11.6: Commit**

```bash
git add src/components/tasks/CreateTaskSlideOut.jsx src/components/clients/CreateClientSlideOut.jsx src/components/teams/CreateTeamSlideOut.jsx src/components/staff/CreateStaffSlideOut.jsx
git commit -m "feat(forms): slide-out forms responsive — bottom sheet on mobile

CreateTask/Client/Team/Staff SlideOut now switch Sheet 'side' on
mobile (bottom, h-[90vh]) so they open as native-feel bottom
drawers instead of off-screen right panels.
"
```

---

### Task 12: Manual verification + memory update

**Цель:** убедиться что mobile-shell действительно работает в реальном браузере (DevTools device emulation), и зафиксировать новый статус в памяти после мерджа.

**Files:**
- Modify (post-merge): `~/.claude/projects/-Users-artemsaskin-Work-operator-dashboard/memory/project_mobile_status.md`
- Modify (post-merge): `~/.claude/projects/-Users-artemsaskin-Work-operator-dashboard/memory/project_next_up_plan.md`

- [ ] **Step 12.1: Run the app locally**

```bash
npm run dev
```

Open the printed URL in Chrome. Open DevTools → Toggle Device Toolbar → choose «iPhone SE (375×667)».

- [ ] **Step 12.2: Smoke-test each role and section**

Login as superadmin (or current dev user). On 375px:

For each section (Дашборд, Сотрудники, Клиенты, Команды, Задачи, Оповещения):
- TopBar shows correct title.
- Bottom-nav visible, active item highlighted.
- Tap ☰ → drawer opens from left, shows profile/Тема/Админ/Выйти.
- Tap backdrop or swipe-left → drawer closes.
- Switch theme inside drawer → app theme changes; drawer stays open.
- Tap admin link → drawer closes + navigates to admin page.
- Tap «Выйти» → logged out (you may want to skip this step or relogin after).
- For master/detail sections (/tasks, /clients, /teams, /staff):
  - List occupies the full screen on mobile.
  - Tap an item → detail occupies full screen, TopBar shows ←.
  - Tap ← → back to list.
  - Open create-form (+ button) → opens as bottom-sheet, scrollable.
- 🔔 visible only as superadmin; with badge if pending > 0.

Switch DevTools to «iPad portrait (768×1024)»:
- Layout switches to desktop (RailNav + 2-col).

- [ ] **Step 12.3: Manual checklist on real device (optional but recommended)**

If iPhone available, open the dev URL on it through ngrok / `--host` flag, verify safe-area insets render correctly (notch/home-indicator).

- [ ] **Step 12.4: Final test + build + lint**

```bash
npm run test:run
npm run build
npm run lint 2>&1 | tail -10
```

Expected: tests = `T_BASE` + ~41 passing; build clean; lint output unchanged from baseline (no new errors/warnings introduced).

- [ ] **Step 12.5: Verify orphan-status of `useIsMobile` is cleared**

```bash
grep -rn "useIsMobile" src --include='*.jsx' --include='*.js' | grep -v 'use-mobile.js' | wc -l
```

Expected: ≥ 6 (AppShell + MasterDetailLayout + 4 SlideOut files). Definitely no longer 0.

- [ ] **Step 12.6: Push branch and open PR**

```bash
git push -u origin <branch-name>
gh pr create --title "feat(shell): mobile responsive shell — TopBar + drawer + bottom-nav" --body "$(cat <<'EOF'
## Summary

Restores the mobile-first contract that regressed during Subplan 6A.
Below 768px AppShell now renders MobileShell (TopBar + Outlet +
BottomNav) plus a side drawer for overflow nav. List↔detail uses
push navigation; slide-out create-forms switch to bottom-sheet.

## Test plan

- [ ] `npm run build` clean
- [ ] `npm run test:run` all green
- [ ] DevTools 375×667: each section's TopBar, bottom-nav, drawer, list↔detail flow
- [ ] DevTools 768×1024: layout switches back to desktop
- [ ] Slide-out create-forms (Task / Client / Team / Staff) open as bottom-sheet on mobile

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 12.7: After merge — switch GH user and merge**

```bash
gh auth switch --user clubmonaco2017-ops
gh pr merge <pr-number> --squash --delete-branch
```

(Per memory `project_gh_auth.md`, `gh pr merge` falls under `temashdesign`; switching to `clubmonaco2017-ops` is required.)

- [ ] **Step 12.8: After merge — update memory**

Update `~/.claude/projects/-Users-artemsaskin-Work-operator-dashboard/memory/project_mobile_status.md`:

Replace the «Status:» line with:

```
**Status:** mobile shell shipped (PR #<n>, commit <sha>); per-page polish queued — /tasks /dashboard /teams в этом порядке.
```

In «Where we are now», update the timestamp and bullet list to reflect the new shell:

```
**Where we are now (2026-04-XX):**
- AppShell branches on useIsMobile() at 768px.
- MobileShell = MobileTopBar (☰ + title + 🔔) + Outlet + MobileBottomNav.
- MobileNavDrawer (Sheet side=left) — profile + Тема + Админ (superadmin) + Выйти.
- MasterDetailLayout uses push navigation on mobile via detailEmpty prop.
- 4 SlideOut create-forms switch to side=bottom on mobile.
- useIsMobile is now used in AppShell + MasterDetailLayout + 4 SlideOut files.
- Per-page polish (/tasks, /dashboard, /teams card grid) — separate follow-up PRs.
```

Update `~/.claude/projects/-Users-artemsaskin-Work-operator-dashboard/memory/project_next_up_plan.md`:

Replace «4. **Mobile rebuild**» line with «4. ~~**Mobile shell**~~ — DONE (PR #<n>, commit <sha>). Follow-ups: per-page polish for /tasks /dashboard /teams in that order.»

- [ ] **Step 12.9: Mark plan complete**

Update todo list / project status. Brainstorm ↔ spec ↔ plan ↔ exec cycle complete for mobile-shell. Per-page polish PRs handled separately as small standalone bundles.

---

## Self-review (run before declaring plan complete)

**1. Spec coverage**

| Spec section | Covered by |
|---|---|
| §1 Goal & non-goals — branch shell on `useIsMobile` | Task 6 (AppShell), Task 7 (MasterDetailLayout) |
| §1 «1. New mobile shell» | Tasks 2–5 |
| §1 «2. MobileNavDrawer» | Task 4 |
| §1 «3. AppShell branch» | Task 6 |
| §1 «4. MasterDetailLayout branch» | Task 7 |
| §1 «5. useSectionTitle hook+Context» | Task 1 (hook), Tasks 8-10 (call sites) |
| §1 «6. Slide-out side responsive» | Task 11 |
| §1 «7. Touch targets ≥ 44px» | Tasks 2, 3, 4 (`min-h-11 min-w-11` on all interactive elements) |
| §1 «8. Safe-area insets» | Tasks 2, 3 (`env(safe-area-inset-top)` / `env(safe-area-inset-bottom)`) |
| §3.5 Bottom-nav permission map | Task 3 (`MobileBottomNav.jsx` exact mapping) |
| §3.6 Slide-out responsive | Task 11 |
| §5 Acceptance criteria — build/tests/manual | Tasks 0, 12 |
| §6 Risk register — drawer auto-close on route change | Task 5 (`useEffect` on `location.pathname`) + test |
| §7 Testing strategy (7 test files) | Tasks 1–5 + Tasks 6, 7 (extending existing tests) |

No gaps.

**2. Placeholder scan**

Scanned for «TBD», «TODO», «implement later», «add appropriate error handling», «similar to». None found. Each step has full code block where code is changed; each command is exact with expected output.

**3. Type/name consistency**

- `useSectionTitle(title, { backTo })` — same signature in Task 1, Tasks 9.
- `useSectionTitleValue()` — used in Task 2, returns `{ title, backTo }`. Matches.
- `MobileTopBar` props — `onMenuClick`. Used in Task 5. Matches.
- `MobileNavDrawer` props — `open`, `onOpenChange`. Used in Task 5. Matches.
- `detailEmpty` prop — defined Task 7, used Task 8. Default `true` matches the «omit → list view» behavior tested.
- `useIsMobile` — same import path `@/hooks/use-mobile` across all tasks.
- `data-slot="mobile-shell"` (Task 5) used in Task 6 selectors. Matches.
- `data-slot="mobile-top-bar"` (Task 2) used in Task 5 selectors. Matches.
- `data-slot="mobile-bottom-nav"` (Task 3) used in Task 5 selectors. Matches.

No inconsistencies.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-04-28-mobile-responsive-shell.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task with paired spec+code review, fast iteration, catches regressions early. Same pattern used for 6B/6D.
**2. Inline Execution** — execute tasks in current session with checkpoints. More handholding but faster wall-clock.

User will pick which approach to use.
