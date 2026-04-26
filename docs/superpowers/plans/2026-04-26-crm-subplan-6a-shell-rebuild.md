# CRM Subplan 6A — Shell Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 240px `Sidebar.jsx` with three-pane shell (rail 56px + list pane 320px on master-detail + main flex), built using shadcn primitives bundled in Subplan 6 foundation. Lift list-rendering из 3 master-detail pages (Clients, Teams, Tasks) на shell-уровень. Migrate routing to react-router-dom v7 nested layout routes (URL paths unchanged). Snip DashboardPage internal h1/header. Pages stay в inline Tailwind — DS-token repaint deferred to Subplan 6A2.

**Architecture:** New `src/components/shell/` module containing 6 components (`AppShell`, `RailNav`, `AppHeader`, `UserMenuDropdown`, `MasterDetailLayout`, `ListPane`). `<AppShell>` is the root layout route; child pages render через `<Outlet>`. Master-detail pages become parent layout routes that render `<MasterDetailLayout>` with their list filling the `listPane` slot and an `<Outlet>` filling the main slot for detail panels. Single-pane pages (Dashboard, Notifications, Staff×3) render directly in shell main. State stays page-local; data flows to detail children via `useOutletContext`.

**Tech Stack:** React 19, react-router-dom v7 (nested layout routes + `<Outlet>` + `useOutletContext`), Tailwind CSS v4, lucide-react, shadcn primitives (`@/components/ui/{breadcrumb,dropdown-menu,avatar,tooltip}`), Vitest + @testing-library/react.

**Source of truth:**
- [docs/superpowers/specs/2026-04-26-crm-subplan-6a-shell-rebuild-design.md](../specs/2026-04-26-crm-subplan-6a-shell-rebuild-design.md) — все decisions D-1…D-16, component contracts, per-page table, acceptance.
- [docs/superpowers/specs/2026-04-26-crm-subplan-6-design-system-foundation-design.md](../specs/2026-04-26-crm-subplan-6-design-system-foundation-design.md) — Subplan 6 foundation (DS tokens, lucide sweep, primitives install).
- [docs/superpowers/plans/2026-04-26-crm-subplan-6-design-system-foundation.md](2026-04-26-crm-subplan-6-design-system-foundation.md) — execution patterns reference.

**Prerequisites:**
- Subplan 6 foundation merged into `main` ✓ (commit `a83bba8`).
- shadcn primitives present: `src/components/ui/{avatar,badge,breadcrumb,button,card,dialog,drawer,dropdown-menu,input,scroll-area,separator,sheet,sidebar,skeleton,tooltip}.jsx` (verified via `ls src/components/ui/`).
- `@/` alias configured in `vite.config.js` (`'@': path.resolve(__dirname, './src')`) and `jsconfig.json` (`paths: { "@/*": ["./src/*"] }`).
- Test infrastructure: vitest + jsdom + @testing-library/react (verified via `src/components/PermissionGate.test.jsx` pattern).
- All 173 existing unit tests passing on `main`.

---

## File structure

### Create — Shell components

```
src/components/shell/
  AppShell.jsx              # Root layout: TooltipProvider + grid (rail | header / main + Outlet)
  RailNav.jsx               # 56px aside with NavLinks + RailItem helper + permission gating
  AppHeader.jsx             # 48px breadcrumb-only header + useDerivedBreadcrumb helper
  UserMenuDropdown.jsx      # Avatar trigger → DropdownMenu with user info + Logout
  MasterDetailLayout.jsx    # 320px aside + flex section grid; props: listPane, children
  ListPane.jsx              # Slot-based: title/search/filters/createButton/children (list)
  index.js                  # Re-exports for clean imports
```

### Create — Tests

```
src/components/shell/
  AppShell.test.jsx
  RailNav.test.jsx
  AppHeader.test.jsx
  UserMenuDropdown.test.jsx
  MasterDetailLayout.test.jsx
  ListPane.test.jsx
```

### Modify — Routing + pages

```
src/App.jsx                         # Layout routes via <AppShell> parent + nested children
src/pages/DashboardPage.jsx         # Snip <Sidebar /> + internal h1/header (D-12)
src/pages/NotificationsPage.jsx     # Snip <Sidebar />
src/pages/StaffListPage.jsx         # Snip <Sidebar />
src/pages/StaffCreatePage.jsx       # Snip <Sidebar />
src/pages/StaffDetailPage.jsx       # Snip <Sidebar />
src/pages/ClientListPage.jsx        # Master-detail refactor: <MasterDetailLayout listPane><Outlet/>
src/pages/TeamListPage.jsx          # Master-detail refactor (mirror Clients pattern)
src/pages/TaskListPage.jsx          # Master-detail refactor + box detection (Inbox/Outbox/All)
```

### Delete

```
src/components/Sidebar.jsx                # Legacy 240px sidebar — replaced by RailNav/AppShell
src/components/application-shell7.jsx     # Chat-app scaffold — UI primitives used directly instead
```

### NOT touched

- `src/AdminLayout.jsx` (D-13: legacy `/admin/*` routes preserved as-is)
- `src/LoginPage.jsx` (stays outside shell)
- `src/components/{clients,teams,tasks,staff}/*` (internal page sub-components — used as-is)
- `src/components/ui/*` (shadcn primitives — used as-is)
- `src/index.css` (DS tokens already in place)
- `src/hooks/*`, `src/lib/*` (reused unchanged)
- DB / migrations (zero changes)

---

## Stages

5 stages, sequential. Each stage = one commit. Branch lives until end-to-end smoke passes; squash-merge PR at the end.

---

### Stage 1 — Shell scaffold (no integration)

**Цель:** Build all 6 shell components in `src/components/shell/` with unit tests. Zero integration with existing code — old `Sidebar.jsx` still in production.

#### Task 1.1 — Create branch and verify baseline

**Files:**
- Create: branch `feat/subplan-6a-shell-rebuild` from `main` (`a83bba8`)

- [ ] **Step 1: Create branch**

```bash
cd /Users/artemsaskin/Work/operator-dashboard
git checkout main
git pull --ff-only
git checkout -b feat/subplan-6a-shell-rebuild
git status
```
Expected: clean, ahead 0.

- [ ] **Step 2: Verify baseline tests + build**

```bash
npm test -- --run
```
Expected: 173 passed (14 files). Note exact count for end-of-stage comparison.

```bash
npx vite build
```
Expected: clean, only pre-existing chunk-size warning.

#### Task 1.2 — `MasterDetailLayout` component + test (start with simplest)

**Files:**
- Create: `src/components/shell/MasterDetailLayout.jsx`
- Create: `src/components/shell/MasterDetailLayout.test.jsx`

- [ ] **Step 1: Write the failing test**

Write to `src/components/shell/MasterDetailLayout.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MasterDetailLayout } from './MasterDetailLayout.jsx'

describe('<MasterDetailLayout>', () => {
  it('renders listPane in left aside and children in main section', () => {
    render(
      <MasterDetailLayout listPane={<div data-testid="lp">List Content</div>}>
        <div data-testid="main">Main Content</div>
      </MasterDetailLayout>,
    )
    expect(screen.getByTestId('lp')).toHaveTextContent('List Content')
    expect(screen.getByTestId('main')).toHaveTextContent('Main Content')
  })

  it('uses fixed 320px column for the list pane', () => {
    const { container } = render(
      <MasterDetailLayout listPane={<div />}>
        <div />
      </MasterDetailLayout>,
    )
    const root = container.firstChild
    // Tailwind class for the grid template-cols
    expect(root.className).toMatch(/grid-cols-\[320px_1fr\]/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --run src/components/shell/MasterDetailLayout.test.jsx
```
Expected: FAIL with "Cannot find module './MasterDetailLayout.jsx'".

- [ ] **Step 3: Write minimal implementation**

Write to `src/components/shell/MasterDetailLayout.jsx`:

```jsx
export function MasterDetailLayout({ listPane, children }) {
  return (
    <div className="grid grid-cols-[320px_1fr] h-full">
      <aside className="border-r border-border bg-card overflow-y-auto">
        {listPane}
      </aside>
      <section className="overflow-y-auto">
        {children}
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --run src/components/shell/MasterDetailLayout.test.jsx
```
Expected: PASS (2 tests).

#### Task 1.3 — `ListPane` component + test

**Files:**
- Create: `src/components/shell/ListPane.jsx`
- Create: `src/components/shell/ListPane.test.jsx`

- [ ] **Step 1: Write the failing test**

Write to `src/components/shell/ListPane.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ListPane } from './ListPane.jsx'

describe('<ListPane>', () => {
  it('renders all four optional slots when provided', () => {
    render(
      <ListPane
        title="Клиенты 24"
        search={<input data-testid="search" />}
        filters={<div data-testid="chips">chips</div>}
        createButton={<button data-testid="create">+ Новый</button>}
      >
        <ul data-testid="list"><li>row 1</li></ul>
      </ListPane>,
    )
    expect(screen.getByText('Клиенты 24')).toBeInTheDocument()
    expect(screen.getByTestId('search')).toBeInTheDocument()
    expect(screen.getByTestId('chips')).toBeInTheDocument()
    expect(screen.getByTestId('create')).toBeInTheDocument()
    expect(screen.getByTestId('list')).toHaveTextContent('row 1')
  })

  it('renders only children when other slots are omitted', () => {
    const { container } = render(
      <ListPane>
        <ul data-testid="list"><li>row</li></ul>
      </ListPane>,
    )
    expect(screen.getByTestId('list')).toBeInTheDocument()
    // Should have no header/search/filters wrapper divs
    expect(container.querySelectorAll('div.border-b').length).toBe(0)
  })

  it('renders title alone (no createButton) without errors', () => {
    render(
      <ListPane title="Только заголовок">
        <div>list</div>
      </ListPane>,
    )
    expect(screen.getByText('Только заголовок')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --run src/components/shell/ListPane.test.jsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write to `src/components/shell/ListPane.jsx`:

```jsx
export function ListPane({ title, search, filters, createButton, children }) {
  return (
    <div className="flex flex-col h-full">
      {(title || createButton) && (
        <div className="p-3 border-b border-border flex items-center justify-between gap-2">
          {title && (
            <h2 className="text-sm font-semibold flex-1 min-w-0 truncate">{title}</h2>
          )}
          {createButton}
        </div>
      )}
      {search && <div className="p-3 border-b border-border">{search}</div>}
      {filters && <div className="p-3 border-b border-border">{filters}</div>}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm test -- --run src/components/shell/ListPane.test.jsx
```
Expected: PASS (3 tests).

#### Task 1.4 — `AppHeader` + `useDerivedBreadcrumb` + test

**Files:**
- Create: `src/components/shell/AppHeader.jsx`
- Create: `src/components/shell/AppHeader.test.jsx`

- [ ] **Step 1: Write the failing test**

Write to `src/components/shell/AppHeader.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppHeader, useDerivedBreadcrumb } from './AppHeader.jsx'

function Probe({ path }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <AppHeader />
    </MemoryRouter>
  )
}

describe('useDerivedBreadcrumb', () => {
  it('returns empty for /', () => {
    expect(useDerivedBreadcrumb('/')).toEqual([])
  })
  it('returns single crumb for /clients', () => {
    expect(useDerivedBreadcrumb('/clients')).toEqual([{ label: 'Клиенты' }])
  })
  it('returns single crumb for /clients/123', () => {
    expect(useDerivedBreadcrumb('/clients/123')).toEqual([{ label: 'Клиенты' }])
  })
  it('returns nested crumbs for /tasks/all/42', () => {
    expect(useDerivedBreadcrumb('/tasks/all/42')).toEqual([
      { label: 'Задачи', to: '/tasks' },
      { label: 'Все' },
    ])
  })
  it('returns nested crumbs for /tasks/outbox', () => {
    expect(useDerivedBreadcrumb('/tasks/outbox')).toEqual([
      { label: 'Задачи', to: '/tasks' },
      { label: 'Исходящие' },
    ])
  })
  it('returns nested crumbs for /staff/new', () => {
    expect(useDerivedBreadcrumb('/staff/new')).toEqual([
      { label: 'Сотрудники', to: '/staff' },
      { label: 'Новый' },
    ])
  })
  it('returns single crumb for /notifications', () => {
    expect(useDerivedBreadcrumb('/notifications')).toEqual([{ label: 'Оповещения' }])
  })
})

describe('<AppHeader>', () => {
  it('renders nothing in breadcrumb area on /', () => {
    render(<Probe path="/" />)
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull()
  })
  it('renders "Клиенты" crumb on /clients', () => {
    render(<Probe path="/clients" />)
    expect(screen.getByText('Клиенты')).toBeInTheDocument()
  })
  it('renders nested crumbs with separator on /tasks/all', () => {
    render(<Probe path="/tasks/all" />)
    expect(screen.getByText('Задачи')).toBeInTheDocument()
    expect(screen.getByText('Все')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --run src/components/shell/AppHeader.test.jsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write to `src/components/shell/AppHeader.jsx`:

```jsx
import { Fragment } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

export function useDerivedBreadcrumb(pathname) {
  if (pathname === '/') return []
  if (pathname.startsWith('/staff/new')) {
    return [{ label: 'Сотрудники', to: '/staff' }, { label: 'Новый' }]
  }
  if (pathname.startsWith('/staff/')) {
    return [{ label: 'Сотрудники', to: '/staff' }, { label: 'Профиль' }]
  }
  if (pathname === '/staff') return [{ label: 'Сотрудники' }]
  if (pathname.startsWith('/clients')) return [{ label: 'Клиенты' }]
  if (pathname.startsWith('/teams')) return [{ label: 'Команды' }]
  if (pathname.startsWith('/tasks/outbox')) {
    return [{ label: 'Задачи', to: '/tasks' }, { label: 'Исходящие' }]
  }
  if (pathname.startsWith('/tasks/all')) {
    return [{ label: 'Задачи', to: '/tasks' }, { label: 'Все' }]
  }
  if (pathname.startsWith('/tasks')) return [{ label: 'Задачи' }]
  if (pathname.startsWith('/notifications')) return [{ label: 'Оповещения' }]
  return []
}

export function AppHeader() {
  const location = useLocation()
  const crumbs = useDerivedBreadcrumb(location.pathname)

  return (
    <header className="h-12 border-b border-border bg-background flex items-center px-4">
      {crumbs.length > 0 && (
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((crumb, i) => {
              const isLast = i === crumbs.length - 1
              return (
                <Fragment key={crumb.to ?? `${crumb.label}-${i}`}>
                  {i > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {isLast || !crumb.to ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink href={crumb.to}>{crumb.label}</BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
      )}
    </header>
  )
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm test -- --run src/components/shell/AppHeader.test.jsx
```
Expected: PASS (10 tests — 7 useDerivedBreadcrumb + 3 AppHeader).

#### Task 1.5 — `UserMenuDropdown` + test

**Files:**
- Create: `src/components/shell/UserMenuDropdown.jsx`
- Create: `src/components/shell/UserMenuDropdown.test.jsx`

- [ ] **Step 1: Write the failing test**

Write to `src/components/shell/UserMenuDropdown.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UserMenuDropdown } from './UserMenuDropdown.jsx'

const sampleUser = {
  alias: 'Артём Ш.',
  firstName: 'Артём',
  role: 'admin',
  refCode: 'ADM-АртёмШ-001',
}

describe('<UserMenuDropdown>', () => {
  it('renders avatar trigger with computed initials', () => {
    render(<UserMenuDropdown user={sampleUser} onLogout={() => {}} />)
    // The avatar trigger button has aria-label
    expect(screen.getByRole('button', { name: 'Меню пользователя' })).toBeInTheDocument()
    // Initials "А" + "Ш" → "АШ" from "Артём Ш."
    expect(screen.getByText('АШ')).toBeInTheDocument()
  })

  it('opens dropdown and shows user info + logout option on click', async () => {
    render(<UserMenuDropdown user={sampleUser} onLogout={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Меню пользователя' }))
    expect(await screen.findByText('Артём Ш.')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('ADM-АртёмШ-001')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Выйти' })).toBeInTheDocument()
  })

  it('calls onLogout when "Выйти" menuitem is clicked', async () => {
    const onLogout = vi.fn()
    render(<UserMenuDropdown user={sampleUser} onLogout={onLogout} />)
    fireEvent.click(screen.getByRole('button', { name: 'Меню пользователя' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Выйти' }))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('falls back to firstName when alias missing, then email/?', () => {
    render(
      <UserMenuDropdown
        user={{ firstName: 'Иван', role: 'operator', refCode: 'OP-Иван-002' }}
        onLogout={() => {}}
      />,
    )
    // Initials from "Иван" → "И"
    expect(screen.getByText('И')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --run src/components/shell/UserMenuDropdown.test.jsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write to `src/components/shell/UserMenuDropdown.jsx`:

```jsx
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

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

export function UserMenuDropdown({ user, onLogout }) {
  const initials = computeInitials(user)
  const displayName = user?.alias || user?.firstName || user?.email || ''

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-full focus-ds" aria-label="Меню пользователя">
          <Avatar className="h-9 w-9">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="min-w-[200px]">
        <div className="px-2 py-1.5">
          <div className="text-sm font-semibold">{displayName}</div>
          {user?.role && (
            <div className="text-xs text-muted-foreground">{user.role}</div>
          )}
          {user?.refCode && (
            <div className="font-mono text-xs text-[var(--fg4)] mt-0.5">
              {user.refCode}
            </div>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout}>Выйти</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm test -- --run src/components/shell/UserMenuDropdown.test.jsx
```
Expected: PASS (4 tests).

If `findByText('Артём Ш.')` fails because `DropdownMenuContent` uses a Radix portal that doesn't render in jsdom by default — wrap the assertions with `screen.getByRole('menu')` parent search, or check that `DropdownMenuContent` renders inline in jsdom. Radix-UI's DropdownMenu in jsdom DOES render the content portal inside the test container by default — should work. If it doesn't, add `import { TooltipProvider } from '@/components/ui/tooltip'` style wrappers as needed.

#### Task 1.6 — `RailNav` + `RailItem` helper + test

**Files:**
- Create: `src/components/shell/RailNav.jsx`
- Create: `src/components/shell/RailNav.test.jsx`

- [ ] **Step 1: Write the failing test**

Write to `src/components/shell/RailNav.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RailNav } from './RailNav.jsx'

// Mock all hooks RailNav uses
vi.mock('../../useAuth.jsx', () => ({
  useAuth: () => ({
    user: globalThis.__mockUser,
    logout: vi.fn(),
  }),
}))

vi.mock('../../hooks/useUserOverdueCount.js', () => ({
  useUserOverdueCount: () => ({ count: globalThis.__mockOverdue ?? 0 }),
}))

vi.mock('../../hooks/usePendingDeletionCount.js', () => ({
  usePendingDeletionCount: () => globalThis.__mockPending ?? 0,
}))

vi.mock('../../hooks/useUserTeamMembership.js', () => ({
  useUserTeamMembership: () => ({ has: true }),
}))

function renderRailWith({ user, overdue = 0, pending = 0 }) {
  globalThis.__mockUser = user
  globalThis.__mockOverdue = overdue
  globalThis.__mockPending = pending
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <RailNav />
      </TooltipProvider>
    </MemoryRouter>,
  )
}

describe('<RailNav>', () => {
  it('shows Dashboard icon for any authenticated user', () => {
    renderRailWith({ user: { id: 1, role: 'operator', permissions: ['view_own_tasks'] } })
    // Tooltip label "Дашборд" is in the DOM (NavLink has aria via tooltip trigger)
    expect(screen.getByRole('link', { name: /дашборд|home/i })).toBeInTheDocument()
  })

  it('hides Staff icon when user lacks create_users permission', () => {
    renderRailWith({ user: { id: 1, role: 'operator', permissions: ['view_own_tasks'] } })
    expect(screen.queryByRole('link', { name: /сотрудники|staff/i })).toBeNull()
  })

  it('shows Staff icon for admin (has create_users)', () => {
    renderRailWith({
      user: { id: 1, role: 'admin', permissions: ['create_users', 'manage_clients', 'create_tasks'] },
    })
    expect(screen.getByRole('link', { name: /сотрудники|staff/i })).toBeInTheDocument()
  })

  it('shows badge with overdue count on Tasks icon when count > 0', () => {
    renderRailWith({
      user: { id: 1, role: 'admin', permissions: ['view_all_tasks', 'create_tasks'] },
      overdue: 5,
    })
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('shows "99+" when overdue count exceeds 99', () => {
    renderRailWith({
      user: { id: 1, role: 'admin', permissions: ['view_all_tasks'] },
      overdue: 142,
    })
    expect(screen.getByText('99+')).toBeInTheDocument()
  })

  it('hides Notifications icon for non-superadmin', () => {
    renderRailWith({ user: { id: 1, role: 'admin', permissions: ['create_users'] } })
    expect(screen.queryByRole('link', { name: /оповещения/i })).toBeNull()
  })

  it('shows Notifications icon for superadmin', () => {
    renderRailWith({ user: { id: 1, role: 'superadmin' } })
    expect(screen.getByRole('link', { name: /оповещения/i })).toBeInTheDocument()
  })

  it('renders UserMenuDropdown trigger at the bottom', () => {
    renderRailWith({ user: { id: 1, alias: 'Тест', role: 'admin' } })
    expect(screen.getByRole('button', { name: 'Меню пользователя' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --run src/components/shell/RailNav.test.jsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write to `src/components/shell/RailNav.jsx`:

```jsx
import { NavLink } from 'react-router-dom'
import {
  Bell,
  CheckSquare,
  Home,
  Network,
  UserCircle,
  Users,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAuth } from '../../useAuth.jsx'
import { hasPermission, isSuperadmin } from '../../lib/permissions.js'
import { canSeeTeamsNav } from '../../lib/teams.js'
import { useUserTeamMembership } from '../../hooks/useUserTeamMembership.js'
import { useUserOverdueCount } from '../../hooks/useUserOverdueCount.js'
import { usePendingDeletionCount } from '../../hooks/usePendingDeletionCount.js'
import { UserMenuDropdown } from './UserMenuDropdown.jsx'

function RailItem({ to, end, icon, label, badge }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={to}
          end={end}
          aria-label={label}
          className={({ isActive }) =>
            `relative w-10 h-10 rounded-lg flex items-center justify-center transition-colors focus-ds ${
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-[var(--fg2)] hover:bg-muted'
            }`
          }
        >
          {icon}
          {badge > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] bg-[var(--danger)] text-white text-[9px] font-semibold rounded-full px-1 flex items-center justify-center tabular"
              aria-label={`${badge} непрочитанных`}
            >
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

export function RailNav({ className = '' }) {
  const { user, logout } = useAuth()
  const { has: hasTeamMembership } = useUserTeamMembership(user?.id)

  const canSeeStaff = hasPermission(user, 'create_users')
  const canSeeClients = hasPermission(user, 'manage_clients')
  const canSeeTeams = canSeeTeamsNav(user, hasTeamMembership)
  const canSeeTasks =
    hasPermission(user, 'view_own_tasks') || hasPermission(user, 'view_all_tasks')
  const canSeeNotifications = isSuperadmin(user)

  const { count: overdueCount } = useUserOverdueCount(canSeeTasks ? user?.id : null)
  const pending = usePendingDeletionCount({ enabled: canSeeNotifications })

  return (
    <aside
      className={`w-14 bg-card border-r border-border flex flex-col items-center py-3 gap-1 ${className}`}
      aria-label="Главное меню"
    >
      <RailItem to="/" end icon={<Home size={20} />} label="Дашборд" />
      {canSeeStaff && (
        <RailItem to="/staff" icon={<Users size={20} />} label="Сотрудники" />
      )}
      {canSeeClients && (
        <RailItem to="/clients" icon={<UserCircle size={20} />} label="Клиенты" />
      )}
      {canSeeTeams && (
        <RailItem to="/teams" icon={<Network size={20} />} label="Команды" />
      )}
      {canSeeTasks && (
        <RailItem
          to="/tasks"
          icon={<CheckSquare size={20} />}
          label="Задачи"
          badge={overdueCount}
        />
      )}

      <div className="flex-1" />

      {canSeeNotifications && (
        <RailItem
          to="/notifications"
          icon={<Bell size={20} />}
          label="Оповещения"
          badge={pending}
        />
      )}
      <UserMenuDropdown user={user} onLogout={logout} />
    </aside>
  )
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm test -- --run src/components/shell/RailNav.test.jsx
```
Expected: PASS (8 tests).

If a test fails because `aria-label` on NavLink doesn't translate to `getByRole('link', {name: ...})` — fall back to `getByLabelText('Сотрудники')` etc. The test is checking permission-based visibility; the exact selector can be adjusted.

#### Task 1.7 — `AppShell` + test

**Files:**
- Create: `src/components/shell/AppShell.jsx`
- Create: `src/components/shell/AppShell.test.jsx`

- [ ] **Step 1: Write the failing test**

Write to `src/components/shell/AppShell.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from './AppShell.jsx'

vi.mock('../../useAuth.jsx', () => ({
  useAuth: () => ({
    user: { id: 1, role: 'admin', permissions: ['create_users', 'manage_clients'] },
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

describe('<AppShell>', () => {
  it('renders rail, header, and outlet content in 3-area grid', () => {
    render(
      <MemoryRouter initialEntries={['/clients']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/clients" element={<div data-testid="page">Page Body</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    // Rail nav present
    expect(screen.getByLabelText('Главное меню')).toBeInTheDocument()
    // Breadcrumb shows current section
    expect(screen.getByText('Клиенты')).toBeInTheDocument()
    // Outlet rendered the page
    expect(screen.getByTestId('page')).toHaveTextContent('Page Body')
  })

  it('renders empty header on root /', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<div data-testid="dash">Dash</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('dash')).toBeInTheDocument()
    // No breadcrumb crumbs on /
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --run src/components/shell/AppShell.test.jsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write to `src/components/shell/AppShell.jsx`:

```jsx
import { Outlet } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RailNav } from './RailNav.jsx'
import { AppHeader } from './AppHeader.jsx'

export function AppShell() {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="grid grid-cols-[56px_1fr] grid-rows-[48px_1fr] h-screen">
        <RailNav className="row-span-2" />
        <AppHeader />
        <main className="overflow-hidden">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  )
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm test -- --run src/components/shell/AppShell.test.jsx
```
Expected: PASS (2 tests).

#### Task 1.8 — `index.js` re-exports

**Files:**
- Create: `src/components/shell/index.js`

- [ ] **Step 1: Write index re-exports**

Write to `src/components/shell/index.js`:

```js
export { AppShell } from './AppShell.jsx'
export { RailNav } from './RailNav.jsx'
export { AppHeader, useDerivedBreadcrumb } from './AppHeader.jsx'
export { UserMenuDropdown } from './UserMenuDropdown.jsx'
export { MasterDetailLayout } from './MasterDetailLayout.jsx'
export { ListPane } from './ListPane.jsx'
```

- [ ] **Step 2: Verify imports resolve**

```bash
node -e "import('./src/components/shell/index.js').then(m => console.log(Object.keys(m)))"
```
Note: This may fail because Node can't resolve `@/` alias outside Vite. Skip if that's the case — actual usage is via Vite which resolves it. Move to Step 3.

```bash
npx vite build
```
Expected: clean build (no unused-import warnings since shell/ files are not imported anywhere yet).

#### Task 1.9 — Stage 1 commit

- [ ] **Step 1: Run full test suite**

```bash
npm test -- --run
```
Expected: 173 (existing) + 27 (new shell tests: 2+3+10+4+8+0) = **200 passed** (approximate; if a test count differs, debug; should be ≥190).

- [ ] **Step 2: Verify build clean**

```bash
npx vite build
```
Expected: clean.

- [ ] **Step 3: Stage and commit**

```bash
git add src/components/shell/
git status   # confirm only src/components/shell/* added
git commit -m "$(cat <<'EOF'
feat(shell): scaffold AppShell + RailNav + AppHeader + ListPane + MasterDetailLayout (Subplan 6A Stage 1)

Six new shell components in src/components/shell/ with unit tests, no
integration with existing routing yet:

- MasterDetailLayout: 320px aside + flex section grid
- ListPane: slot-based (title, search, filters, createButton, children)
- AppHeader + useDerivedBreadcrumb: 48px header with URL→breadcrumb mapping
- UserMenuDropdown: avatar trigger + DropdownMenu (Logout + user info)
- RailNav + RailItem: 56px aside with permission-gated NavLinks + badges
- AppShell: TooltipProvider + grid (rail | header / main + Outlet)
- index.js re-exports

Tests: ~27 new assertions (200 total). Old Sidebar.jsx still in production.
EOF
)"
```

- [ ] **Step 4: Verify commit**

```bash
git log -1 --stat
```
Expected: 1 commit, 13 new files in `src/components/shell/`.

**Definition of done — Stage 1:**
- 6 components + index.js + 6 tests created
- ~200 tests passing
- Build clean
- Commit on `feat/subplan-6a-shell-rebuild` branch
- Old `Sidebar.jsx` still works in production (unmodified)

---

### Stage 2 — Wire AppShell into App.jsx + migrate single-pane routes

**Цель:** Switch `App.jsx` to use `<AppShell>` as a layout route. Migrate Dashboard, Notifications, Staff×3 to render directly in shell main (no list pane). Snip the internal h1/header from DashboardPage. Master-detail pages (Clients/Teams/Tasks) still wrap their old `<Sidebar>` — temporarily ugly (double rail) until Stages 3-4 lift them into the new shell.

#### Task 2.1 — Refactor `App.jsx` to use layout routes

**Files:**
- Modify: `src/App.jsx` (full rewrite — only 57 lines)

- [ ] **Step 1: Read current App.jsx for reference**

```bash
cat src/App.jsx
```
Expected output: current routing with `<Route path="/" element={<DashboardPage />} />` etc., flat structure.

- [ ] **Step 2: Replace App.jsx contents**

Write to `src/App.jsx`:

```jsx
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth.jsx'
import LoginPage from './LoginPage.jsx'
import AdminLayout from './AdminLayout.jsx'
import { AppShell } from './components/shell/index.js'
import { DashboardPage } from './pages/DashboardPage.jsx'
import { StaffListPage } from './pages/StaffListPage.jsx'
import { StaffCreatePage } from './pages/StaffCreatePage.jsx'
import { StaffDetailPage } from './pages/StaffDetailPage.jsx'
import { NotificationsPage } from './pages/NotificationsPage.jsx'
import { ClientListPage } from './pages/ClientListPage.jsx'
import { TeamListPage } from './pages/TeamListPage.jsx'
import { TaskListPage } from './pages/TaskListPage.jsx'
import { isSuperadmin } from './lib/permissions.js'

export default function App() {
  const { user, login, logout, loading } = useAuth()
  const navigate = useNavigate()

  if (!user) {
    return <LoginPage onLogin={login} loading={loading} />
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/staff" element={<StaffListPage />} />
        <Route path="/staff/new" element={<StaffCreatePage />} />
        <Route path="/staff/:refCode" element={<StaffDetailPage />} />
        <Route path="/staff/:refCode/:tab" element={<StaffDetailPage />} />

        {/* Master-detail pages: still flat in this stage; lifted in Stages 3-4 */}
        <Route path="/clients" element={<ClientListPage />} />
        <Route path="/clients/:clientId" element={<ClientListPage />} />
        <Route path="/clients/:clientId/:tab" element={<ClientListPage />} />
        <Route path="/teams" element={<TeamListPage />} />
        <Route path="/teams/:teamId" element={<TeamListPage />} />
        <Route path="/tasks" element={<TaskListPage />} />
        <Route path="/tasks/outbox" element={<TaskListPage />} />
        <Route path="/tasks/all" element={<TaskListPage />} />
        <Route path="/tasks/outbox/:taskId" element={<TaskListPage />} />
        <Route path="/tasks/all/:taskId" element={<TaskListPage />} />
        <Route path="/tasks/:taskId" element={<TaskListPage />} />
      </Route>

      {isSuperadmin(user) && (
        <Route
          path="/admin/*"
          element={
            <AdminLayout
              onClose={() => navigate('/')}
              onLogout={logout}
              currentUser={user}
            />
          }
        />
      )}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --run
```
Expected: 200 still passing (App.jsx not directly tested; child pages still work).

#### Task 2.2 — Snip `<Sidebar>` from DashboardPage + remove internal header (D-12)

**Files:**
- Modify: `src/pages/DashboardPage.jsx`

- [ ] **Step 1: Locate the `<Sidebar>` import and usage**

```bash
grep -n "Sidebar\|<header\|<h1" src/pages/DashboardPage.jsx | head -20
```
Note the line numbers of:
- `import { Sidebar } from ...` (likely top of file)
- `<Sidebar ... />` JSX usage
- The internal `<header>` element with logo + h1 (around lines 309-325 per earlier exploration)

- [ ] **Step 2: Remove the import**

Edit `src/pages/DashboardPage.jsx`. Remove the line `import { Sidebar } from '../components/Sidebar.jsx'` (path may differ slightly — match exactly what's there).

- [ ] **Step 3: Remove the `<Sidebar />` JSX wrapping + internal header**

Find the page's outer return — it likely looks like:

```jsx
return (
  <div className="flex min-h-screen ...">
    <Sidebar user={user} onLogout={logout} />
    <main className="flex-1 ...">
      <header ...>
        <div className="...">📊 (already swept) BarChart3</div>
        <h1>Дашборд</h1>
        ...header content...
      </header>
      ...page body (KPI cards, chart, top operators, etc.)...
    </main>
  </div>
)
```

Replace with (removing both the outer `<Sidebar>` wrapper AND the internal `<header>`):

```jsx
return (
  <div className="p-6">
    {/* internal header removed (Subplan 6A Stage 2 D-12) — shell header now provides breadcrumb */}
    ...page body (KPI cards, chart, top operators, etc., unchanged)...
  </div>
)
```

The exact wrapping structure depends on what's in DashboardPage.jsx — preserve all body content (KPI grid, chart section, top operators table, search, empty states). Only remove the outer `<div className="flex">` + `<Sidebar>` + `<main>` shell AND the internal `<header>` block. The body content is now placed directly inside a single `<div className="p-6">` wrapper (or whatever padding works — feel free to use existing classes).

If `useNavigate` / `logout` were used only by the header (e.g. logout button), remove those too. If used elsewhere, keep.

- [ ] **Step 4: Verify no import errors**

```bash
npx vite build
```
Expected: clean (no unused-import warnings; if any, address them).

- [ ] **Step 5: Run tests**

```bash
npm test -- --run
```
Expected: 200 passed (Dashboard has no unit tests; page-level changes don't affect existing tests).

#### Task 2.3 — Snip `<Sidebar>` from NotificationsPage

**Files:**
- Modify: `src/pages/NotificationsPage.jsx`

- [ ] **Step 1: Locate Sidebar usage**

```bash
grep -n "Sidebar" src/pages/NotificationsPage.jsx
```

- [ ] **Step 2: Remove import + wrapping**

Remove `import { Sidebar }` line. In the return value, remove the `<div className="flex">` + `<Sidebar>` + `<main>` wrapping; replace with a single `<div className="p-6">` (or matching existing padding). Preserve all page body content (notifications list, etc.).

If `logout` is no longer used (was only passed to Sidebar), remove from `useAuth()` destructuring.

- [ ] **Step 3: Verify build + tests**

```bash
npx vite build && npm test -- --run
```
Expected: clean build, 200 tests pass.

#### Task 2.4 — Snip `<Sidebar>` from StaffListPage

**Files:**
- Modify: `src/pages/StaffListPage.jsx`

- [ ] **Step 1: Locate**

```bash
grep -n "Sidebar" src/pages/StaffListPage.jsx
```

- [ ] **Step 2: Apply the same snip pattern as Task 2.3**

Remove `<Sidebar>` import + wrapping. Body content stays.

- [ ] **Step 3: Verify**

```bash
npx vite build && npm test -- --run
```
Expected: clean build, 200 tests pass.

#### Task 2.5 — Snip `<Sidebar>` from StaffCreatePage

**Files:**
- Modify: `src/pages/StaffCreatePage.jsx`

- [ ] **Step 1, 2, 3:** Apply same snip pattern as Task 2.3 to `src/pages/StaffCreatePage.jsx`. Verify build + tests pass.

#### Task 2.6 — Snip `<Sidebar>` from StaffDetailPage

**Files:**
- Modify: `src/pages/StaffDetailPage.jsx`

- [ ] **Step 1, 2, 3:** Apply same snip pattern to `src/pages/StaffDetailPage.jsx`. Verify build + tests pass.

#### Task 2.7 — Visual smoke + Stage 2 commit

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```
Expected: server up on `http://localhost:5173`.

- [ ] **Step 2: Manual smoke for migrated routes**

In browser (or via preview tools if available):
- `/` Dashboard — rail visible left, breadcrumb empty, single KPI grid in main, NO double sidebar/header.
- `/notifications` — rail + breadcrumb "Оповещения", notifications list in main.
- `/staff` — rail + breadcrumb "Сотрудники", staff list in main.
- `/staff/new` — rail + breadcrumb "Сотрудники / Новый", create form in main.
- `/staff/<refCode>` — rail + breadcrumb "Сотрудники / Профиль", detail in main.
- Click rail icon → navigation works, active state shown, tooltip on hover.
- Click avatar → dropdown opens, shows user info, Logout works.
- Toggle dark mode in console: `document.documentElement.classList.toggle('dark')` — shell respects DS tokens.

Master-detail pages (Clients/Teams/Tasks) are EXPECTED to look broken (double rail glitch — old Sidebar still inside ClientListPage etc.). That's fine for this stage; will be fixed in Stages 3-4.

- [ ] **Step 3: Stop dev server, run tests + build**

```bash
npm test -- --run
npx vite build
```
Expected: 200 passed, build clean.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/pages/DashboardPage.jsx src/pages/NotificationsPage.jsx src/pages/StaffListPage.jsx src/pages/StaffCreatePage.jsx src/pages/StaffDetailPage.jsx
git commit -m "$(cat <<'EOF'
feat(shell): wire AppShell + migrate single-pane routes to new shell (Subplan 6A Stage 2)

- App.jsx now uses <AppShell> as parent layout route via react-router-dom v7;
  child routes render via <Outlet>.
- Dashboard, Notifications, Staff×3 stripped of <Sidebar> wrapper — they now
  render directly inside AppShell's main slot (single-pane).
- DashboardPage internal h1/header removed (D-12) — shell header provides
  breadcrumb; full Dashboard rewrite deferred to Subplan 6A3.
- Master-detail pages (Clients/Teams/Tasks) still render their own <Sidebar>
  inside ClientListPage etc. — visible double-rail glitch on those routes;
  fixed in Stages 3-4.
EOF
)"
```

**Definition of done — Stage 2:**
- App.jsx uses layout routes
- Single-pane pages render under AppShell
- Dashboard internal header gone
- 200 tests pass, build clean
- Master-detail pages temporarily ugly (acceptable transient state)
- 1 commit

---

### Stage 3 — Migrate Clients to master-detail in shell

**Цель:** Refactor `/clients` route to use nested layout routes. `ClientListPage` becomes a parent that renders `<MasterDetailLayout>` with the list + filters in `listPane` slot and `<Outlet>` in main. The detail panel becomes a child route. Drop the old in-page `<Sidebar>` reference. Modals (`CreateClientSlideOut`, `ClientLightbox`) stay at page level.

#### Task 3.1 — Update `App.jsx` Clients route to nested layout

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Replace flat Clients routes with nested layout**

Edit `src/App.jsx`. Find the Clients block:

```jsx
<Route path="/clients" element={<ClientListPage />} />
<Route path="/clients/:clientId" element={<ClientListPage />} />
<Route path="/clients/:clientId/:tab" element={<ClientListPage />} />
```

Replace with:

```jsx
<Route path="/clients" element={<ClientListPage />}>
  <Route index element={<ClientDetailEmpty />} />
  <Route path=":clientId" element={<ClientDetailRoute />} />
  <Route path=":clientId/:tab" element={<ClientDetailRoute />} />
</Route>
```

- [ ] **Step 2: Add imports for the new child route components**

At the top of `src/App.jsx`, add:

```jsx
import { ClientDetailRoute, ClientDetailEmpty } from './pages/ClientListPage.jsx'
```

(These will be added as named exports in the next task.)

- [ ] **Step 3: Run build to confirm imports resolve later (will currently fail)**

```bash
npx vite build
```
Expected: FAIL — `ClientDetailRoute` and `ClientDetailEmpty` not yet defined. Continue to Task 3.2.

#### Task 3.2 — Refactor `ClientListPage.jsx` to MasterDetailLayout + ListPane

**Files:**
- Modify: `src/pages/ClientListPage.jsx` (full rewrite)

- [ ] **Step 1: Re-read current ClientListPage as reference for hooks/state**

```bash
sed -n '1,70p' src/pages/ClientListPage.jsx
```
Note: imports, hook calls, state declarations, derived values stay the same. Only the JSX return changes.

- [ ] **Step 2: Replace ClientListPage.jsx contents**

Write to `src/pages/ClientListPage.jsx`:

```jsx
import { useMemo, useState } from 'react'
import { Outlet, useOutletContext, useParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useAuth } from '../useAuth.jsx'
import { useClientList } from '../hooks/useClientList.js'
import { usePlatforms } from '../hooks/usePlatforms.js'
import { useAgencies } from '../hooks/useAgencies.js'
import { ClientList } from '../components/clients/ClientList.jsx'
import { ClientFilterChips } from '../components/clients/ClientFilterChips.jsx'
import { EmptyZero } from '../components/clients/EmptyZero.jsx'
import { EmptyFilter } from '../components/clients/EmptyFilter.jsx'
import { DetailEmptyHint } from '../components/clients/DetailEmptyHint.jsx'
import { ClientDetailPanel } from '../components/clients/ClientDetailPanel.jsx'
import { CreateClientSlideOut } from '../components/clients/CreateClientSlideOut.jsx'
import { hasPermission } from '../lib/permissions.js'
import { pluralizeClients } from '../lib/clients.js'
import { MasterDetailLayout, ListPane } from '../components/shell/index.js'

const DEFAULT_FILTERS = { active: 'active', platformId: null, agencyId: null }

export function ClientListPage() {
  const { user } = useAuth()
  const { clientId } = useParams()
  const canCreate = hasPermission(user, 'manage_clients')

  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const { rows, counts, loading, error, reload } = useClientList(user?.id, {
    ...filters,
    search,
  })
  const { rows: platforms } = usePlatforms()
  const { rows: agencies } = useAgencies({ platformId: filters.platformId })

  const hasAnyFilter = useMemo(
    () =>
      filters.active !== 'active' ||
      filters.platformId !== null ||
      filters.agencyId !== null,
    [filters],
  )
  const hasSearch = search.trim().length > 0
  const isEmpty = !loading && !error && rows.length === 0
  const isZeroEmpty = isEmpty && !hasAnyFilter && !hasSearch
  const isFilterEmpty = isEmpty && (hasAnyFilter || hasSearch)

  const activeFilterChips = useMemo(() => {
    const list = []
    if (filters.active !== 'active') {
      list.push({
        label: filters.active === 'archived' ? 'Архив' : 'Все',
        onClear: () => setFilters((f) => ({ ...f, active: 'active' })),
      })
    }
    if (filters.platformId) {
      const platformName =
        platforms.find((p) => p.id === filters.platformId)?.name || 'Платформа'
      list.push({
        label: platformName,
        onClear: () => setFilters((f) => ({ ...f, platformId: null })),
      })
    }
    if (filters.agencyId) {
      const agencyName =
        agencies.find((a) => a.id === filters.agencyId)?.name || 'Агентство'
      list.push({
        label: agencyName,
        onClear: () => setFilters((f) => ({ ...f, agencyId: null })),
      })
    }
    return list
  }, [filters, platforms, agencies])

  const totalForTitle = counts?.all ?? 0

  const titleNode = (
    <span className="flex items-baseline gap-2">
      Клиенты
      <span className="text-xs font-medium text-[var(--fg4)] tabular">
        {totalForTitle}
      </span>
    </span>
  )

  const createButtonNode = canCreate ? (
    <button
      type="button"
      onClick={() => setCreateOpen(true)}
      className="btn-primary text-xs px-2.5 py-1.5"
    >
      + Новый
    </button>
  ) : null

  const searchNode = <SearchInput value={search} onChange={setSearch} />

  const filtersNode = !isZeroEmpty ? (
    <ClientFilterChips
      value={filters}
      onChange={setFilters}
      platforms={platforms}
      agencies={agencies}
      counts={counts}
    />
  ) : null

  const listBody = isZeroEmpty ? (
    <EmptyZero canCreate={canCreate} onCreate={() => setCreateOpen(true)} />
  ) : isFilterEmpty ? (
    <EmptyFilter
      activeFilters={activeFilterChips}
      onResetAll={() => {
        setFilters(DEFAULT_FILTERS)
        setSearch('')
      }}
      searchQuery={hasSearch ? search.trim() : null}
      onClearSearch={() => setSearch('')}
    />
  ) : (
    <ClientList rows={rows} selectedId={clientId} loading={loading} error={error} />
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
      >
        <Outlet context={{ rows, reload, callerId: user?.id }} />
      </MasterDetailLayout>

      {createOpen && (
        <CreateClientSlideOut
          callerId={user?.id}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false)
            reload()
          }}
        />
      )}
    </>
  )
}

// Index child route — shows the empty hint when no client is selected.
export function ClientDetailEmpty() {
  return <DetailEmptyHint />
}

// Detail child route — pulls clientId/tab from URL and shared data from outlet context.
export function ClientDetailRoute() {
  const { clientId, tab } = useParams()
  const { rows, reload, callerId } = useOutletContext()
  return (
    <ClientDetailPanel
      callerId={callerId}
      clientId={clientId}
      activeTab={tab || 'profile'}
      siblings={rows}
      onChanged={reload}
    />
  )
}

function SearchInput({ value, onChange }) {
  return (
    <label className="relative flex items-center">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--fg4)]"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Поиск по name / alias…"
        aria-label="Поиск клиентов"
        className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-1.5 text-sm text-foreground placeholder:text-[var(--fg4)] outline-none focus:border-primary focus-ds"
      />
    </label>
  )
}
```

Note the changes vs original:
- Removed `<Sidebar>` import + JSX
- Removed `useAuth()` destructuring of `logout` (unused now)
- Removed `tab` from top-level `useParams` (used by ClientDetailRoute child instead)
- Master/detail responsive logic (`showMasterOnNarrow` / `showDetailOnNarrow`, 1024-px breakpoint) — REMOVED. Mobile is deferred to Subplan 6B (D-6); list pane is fixed 320px on `lg+` per shell.
- Master-section dynamic width (`flex-1` on empty) — REMOVED. List pane is fixed 320px; EmptyZero/EmptyFilter render inside it (smaller but acceptable per shell rebuild trade-off).
- Footer counter ("X of Y") — REMOVED for now (was noise; can be restored in 6A2 if missed).
- Added `<MasterDetailLayout>` + `<ListPane>` slots
- Added `<Outlet context={...}>` to pass rows/reload/callerId to child route
- Added `ClientDetailEmpty` and `ClientDetailRoute` named exports
- `SearchInput` simplified (kbd `/` indicator removed for visual symmetry; can be restored in 6A2)

- [ ] **Step 3: Run build**

```bash
npx vite build
```
Expected: clean (now `ClientDetailRoute` and `ClientDetailEmpty` exports satisfy App.jsx imports).

- [ ] **Step 4: Run tests**

```bash
npm test -- --run
```
Expected: 200 passed.

#### Task 3.3 — Visual smoke for Clients

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Browser smoke**

- `/clients` → rail + header (breadcrumb "Клиенты") + list pane (320px, with title/count/search/chips/list) + main (DetailEmptyHint). NO double rail.
- Click a client row → URL becomes `/clients/<id>`, main shows ClientDetailPanel for that client. List pane stays.
- Click `+ Новый` → CreateClientSlideOut opens as a modal overlaying everything.
- Apply a filter → list updates, chips appear.
- Search → list updates, EmptyFilter shows when no matches.
- Toggle to a non-existent client (manually navigate `/clients/9999`) → ClientDetailPanel may show error/loading; no shell-level crash.

- [ ] **Step 3: Stop dev server, commit Stage 3**

```bash
npm test -- --run
npx vite build
git add src/App.jsx src/pages/ClientListPage.jsx
git commit -m "$(cat <<'EOF'
feat(shell): migrate /clients to master-detail layout in new shell (Subplan 6A Stage 3)

- /clients now uses nested layout routes via react-router-dom v7:
  parent ClientListPage renders <MasterDetailLayout> with list/filters in
  listPane slot and <Outlet> in main slot. Detail child route renders
  <ClientDetailPanel> reading clientId/tab from useParams and rows/reload
  from useOutletContext.
- Removed old <Sidebar> wrapper and 1024-px master/detail switching
  (mobile responsive lives in Subplan 6B).
- Modals (CreateClientSlideOut) remain at page level.
- DS-token repaint of list pane / detail panel internals deferred to 6A2.
EOF
)"
```

**Definition of done — Stage 3:**
- /clients works on new shell with master-detail
- Filters, search, modals all functional
- 200 tests pass, build clean
- 1 commit

---

### Stage 4 — Migrate Teams + Tasks

**Цель:** Apply the same master-detail pattern to `/teams` and `/tasks`. Tasks is the most complex (5 sub-routes for box-tabs).

#### Task 4.1 — Update App.jsx Teams route + refactor TeamListPage

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/pages/TeamListPage.jsx`

- [ ] **Step 1: Read current TeamListPage to inventory hooks/state**

```bash
sed -n '1,60p' src/pages/TeamListPage.jsx
```
Note: imports, hooks (`useTeamList` etc.), state, filters, list rendering, detail panel. Pattern likely mirrors ClientListPage.

- [ ] **Step 2: Update App.jsx Teams block**

Find:

```jsx
<Route path="/teams" element={<TeamListPage />} />
<Route path="/teams/:teamId" element={<TeamListPage />} />
```

Replace with:

```jsx
<Route path="/teams" element={<TeamListPage />}>
  <Route index element={<TeamDetailEmpty />} />
  <Route path=":teamId" element={<TeamDetailRoute />} />
</Route>
```

Add imports at top of App.jsx:

```jsx
import {
  TeamListPage,
  TeamDetailRoute,
  TeamDetailEmpty,
} from './pages/TeamListPage.jsx'
```

(Replacing the existing `import { TeamListPage } ...`.)

- [ ] **Step 3: Refactor TeamListPage.jsx mirroring Clients pattern**

Open `src/pages/TeamListPage.jsx`. Apply the same structural transform as Task 3.2:

1. Remove `<Sidebar>` import + wrapping
2. Remove 1024-px responsive logic (if present)
3. Wrap return in `<MasterDetailLayout listPane={<ListPane ...>...</ListPane>}><Outlet context={{...team data...}} /></MasterDetailLayout>`
4. Move `TeamFilterChips`, search, create button into ListPane slots
5. Move list (`<TeamList>`) into ListPane children
6. Pass rows/reload/callerId via `<Outlet context>`
7. Add named exports `TeamDetailEmpty` (renders `<DetailEmptyHint />` from `src/components/teams/`) and `TeamDetailRoute` (reads `teamId` from `useParams` and rows/reload from `useOutletContext`, renders `<TeamDetailPanel>` with appropriate props)
8. Modals stay at page level (CreateTeamSlideOut etc.)

The exact structure depends on what TeamListPage currently uses. Apply the same shape:

```jsx
import { Outlet, useOutletContext, useParams } from 'react-router-dom'
import { MasterDetailLayout, ListPane } from '../components/shell/index.js'
// ... existing imports minus Sidebar

export function TeamListPage() {
  const { user } = useAuth()
  const { teamId } = useParams()
  // ... existing hooks/state

  return (
    <>
      <MasterDetailLayout
        listPane={
          <ListPane
            title={<>Команды <span className="text-xs text-[var(--fg4)] tabular">{count}</span></>}
            search={<SearchInput ... />}
            filters={!isZeroEmpty ? <TeamFilterChips ... /> : null}
            createButton={canCreate ? <button onClick={...} className="btn-primary text-xs px-2.5 py-1.5">+ Команда</button> : null}
          >
            {/* list body: ZeroEmpty / FilterEmpty / TeamList */}
          </ListPane>
        }
      >
        <Outlet context={{ rows, reload, callerId: user?.id }} />
      </MasterDetailLayout>

      {createOpen && <CreateTeamSlideOut ... />}
    </>
  )
}

export function TeamDetailEmpty() {
  return <DetailEmptyHint />  // from src/components/teams/DetailEmptyHint.jsx
}

export function TeamDetailRoute() {
  const { teamId } = useParams()
  const { rows, reload, callerId } = useOutletContext()
  return <TeamDetailPanel callerId={callerId} teamId={teamId} siblings={rows} onChanged={reload} />
}
```

(Adapt the slot contents to whatever TeamListPage currently renders. The pattern is identical to ClientListPage.)

- [ ] **Step 4: Build + tests**

```bash
npx vite build
npm test -- --run
```
Expected: clean build, 200 tests pass.

- [ ] **Step 5: Visual smoke**

```bash
npm run dev
```
Open `/teams`, click a team, verify shell + list pane + detail switching + create modal. Stop server.

#### Task 4.2 — Update App.jsx Tasks routes + refactor TaskListPage (with box detection)

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/pages/TaskListPage.jsx`

Tasks has 6 routes due to box-tabs (Inbox=default, Outbox, All) plus optional :taskId in each. Box is detected from `useLocation().pathname`.

- [ ] **Step 1: Read current TaskListPage to inventory**

```bash
sed -n '1,80p' src/pages/TaskListPage.jsx
```

- [ ] **Step 2: Update App.jsx Tasks block**

Find:

```jsx
<Route path="/tasks" element={<TaskListPage />} />
<Route path="/tasks/outbox" element={<TaskListPage />} />
<Route path="/tasks/all" element={<TaskListPage />} />
<Route path="/tasks/outbox/:taskId" element={<TaskListPage />} />
<Route path="/tasks/all/:taskId" element={<TaskListPage />} />
<Route path="/tasks/:taskId" element={<TaskListPage />} />
```

Replace with:

```jsx
<Route path="/tasks" element={<TaskListPage />}>
  <Route index element={<TaskDetailEmpty />} />
  <Route path=":taskId" element={<TaskDetailRoute />} />
  <Route path="outbox" element={<TaskDetailEmpty />} />
  <Route path="outbox/:taskId" element={<TaskDetailRoute />} />
  <Route path="all" element={<TaskDetailEmpty />} />
  <Route path="all/:taskId" element={<TaskDetailRoute />} />
</Route>
```

Add imports at top of App.jsx:

```jsx
import {
  TaskListPage,
  TaskDetailRoute,
  TaskDetailEmpty,
} from './pages/TaskListPage.jsx'
```

- [ ] **Step 3: Refactor TaskListPage.jsx with box detection from URL**

Same overall pattern as Clients/Teams, plus a `useLocation()` to detect box (Inbox/Outbox/All) from URL pathname.

```jsx
import { Outlet, useOutletContext, useParams, useLocation } from 'react-router-dom'
import { MasterDetailLayout, ListPane } from '../components/shell/index.js'
// ... existing imports minus Sidebar

function deriveBoxFromPath(pathname) {
  if (pathname.startsWith('/tasks/outbox')) return 'outbox'
  if (pathname.startsWith('/tasks/all')) return 'all'
  return 'inbox'
}

export function TaskListPage() {
  const { user } = useAuth()
  const location = useLocation()
  const box = deriveBoxFromPath(location.pathname)
  // existing hooks (useTaskList(box, filters, search), useTaskActions, etc.)

  return (
    <>
      <MasterDetailLayout
        listPane={
          <ListPane
            title={<>Задачи <span className="text-xs text-[var(--fg4)] tabular">{count}</span></>}
            search={<SearchInput ... />}
            filters={
              <>
                <TaskBoxTabs activeBox={box} />  {/* navigates to /tasks vs /tasks/outbox vs /tasks/all */}
                <TaskFilterChips ... />
              </>
            }
            createButton={canCreate ? <button onClick={...}>+ Задача</button> : null}
          >
            {/* list body */}
          </ListPane>
        }
      >
        <Outlet context={{ rows, reload, callerId: user?.id, box }} />
      </MasterDetailLayout>
      {createOpen && <CreateTaskSlideOut ... />}
    </>
  )
}

export function TaskDetailEmpty() {
  return <DetailEmptyHint />  // from src/components/tasks/DetailEmptyHint.jsx
}

export function TaskDetailRoute() {
  const { taskId } = useParams()
  const { rows, reload, callerId, box } = useOutletContext()
  return (
    <TaskDetailPanel
      callerId={callerId}
      taskId={taskId}
      siblings={rows}
      box={box}
      onChanged={reload}
    />
  )
}
```

`<TaskBoxTabs>` component (existing in `src/components/tasks/TaskBoxTabs.jsx`) renders three tab links navigating to `/tasks`, `/tasks/outbox`, `/tasks/all`. It already exists and works with the URL pattern; just verify it accepts the `activeBox` prop or derive from `useLocation` internally.

- [ ] **Step 4: Build + tests**

```bash
npx vite build
npm test -- --run
```
Expected: clean build, 200 tests pass.

- [ ] **Step 5: Visual smoke**

```bash
npm run dev
```
Open `/tasks`, switch boxes (Inbox/Outbox/All), click a task, verify shell + list pane + detail switching + create modal works in all 3 boxes.

- [ ] **Step 6: Commit Stage 4**

```bash
git add src/App.jsx src/pages/TeamListPage.jsx src/pages/TaskListPage.jsx
git commit -m "$(cat <<'EOF'
feat(shell): migrate /teams and /tasks to master-detail layout in new shell (Subplan 6A Stage 4)

- /teams: nested layout routes; TeamListPage renders <MasterDetailLayout>
  with list in listPane + <Outlet> in main; TeamDetailRoute renders
  <TeamDetailPanel> from useParams + useOutletContext.
- /tasks: same pattern + box detection via useLocation pathname
  (Inbox=default, /tasks/outbox, /tasks/all). Six child routes for box +
  detail combinations. TaskBoxTabs lives in ListPane filters slot.
- All <Sidebar> references removed from these pages; modals (CreateTeam,
  CreateTask) remain at page level.
EOF
)"
```

**Definition of done — Stage 4:**
- /teams + /tasks fully on new shell
- TaskBoxTabs work in shell
- 200 tests pass, build clean
- `Sidebar.jsx` no longer imported anywhere in `src/`
- 1 commit

---

### Stage 5 — Cleanup + final smoke + PR

**Цель:** Delete the dead `Sidebar.jsx` and `application-shell7.jsx`. Run full smoke. Open PR.

#### Task 5.1 — Verify Sidebar.jsx and application-shell7.jsx are unused

- [ ] **Step 1: Grep for any remaining imports**

```bash
grep -rn "from.*Sidebar\|from.*application-shell7" src/ --include="*.js" --include="*.jsx" | grep -v "components/ui/sidebar"
```
Expected: ZERO matches (note: `components/ui/sidebar.jsx` is the shadcn primitive, may be unused now too — leave for potential 6A2 use).

If any file still imports from `../components/Sidebar` or `./components/Sidebar` or `../components/application-shell7` — STOP and address before deleting.

#### Task 5.2 — Delete files + verify build

**Files:**
- Delete: `src/components/Sidebar.jsx`
- Delete: `src/components/application-shell7.jsx`

- [ ] **Step 1: Delete**

```bash
git rm src/components/Sidebar.jsx
git rm src/components/application-shell7.jsx
```

- [ ] **Step 2: Verify build still clean**

```bash
npx vite build
```
Expected: clean (no broken imports).

- [ ] **Step 3: Run tests**

```bash
npm test -- --run
```
Expected: 200 passed.

#### Task 5.3 — Final smoke through all routes

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Smoke checklist (paste into a temporary scratchpad as you go)**

Per role testing requires switching login, but if you only have one user role available, do these for that role:

For ALL roles: every visible route renders without console errors. Toggle dark mode (`document.documentElement.classList.toggle('dark')`) on each — visual integrity preserved.

- `/` Dashboard — KPI grid, no console errors. Single shell header (no internal h1).
- `/clients` — rail + breadcrumb "Клиенты" + list pane (320px) + DetailEmptyHint. Click row → detail panel. Filters work. Create modal opens. Light + dark.
- `/clients/<id>/photos` — detail with tab switch.
- `/teams` — same shape.
- `/teams/<id>` — detail panel.
- `/tasks` — same shape + box tabs (Inbox/Outbox/All). Click each tab, verify active state.
- `/tasks/outbox/<id>` — detail panel with box context.
- `/staff` — single-pane staff list under shell.
- `/staff/new` — creation form.
- `/staff/<refCode>` — staff detail.
- `/notifications` (if superadmin) — single-pane notifications.
- `/login` (logout to test) — NO shell, plain login page.

Permission-gated rail icons:
- Login as operator → Dashboard + Tasks (if has view_own_tasks) visible; Staff/Clients/Teams hidden depending on role.
- Login as superadmin → all icons visible + Notifications bell at bottom.

Tooltip on rail icon hover shows label.
Active rail icon highlighted.
User dropdown opens upward-right; Logout works.

- [ ] **Step 3: Stop dev server**

#### Task 5.4 — Commit + push + open PR

- [ ] **Step 1: Stage deletion + commit**

```bash
git status   # should show 2 deleted files only
git commit -m "$(cat <<'EOF'
chore(shell): delete legacy Sidebar.jsx and application-shell7.jsx scaffold (Subplan 6A Stage 5)

- Sidebar.jsx (240px legacy nav) — replaced by RailNav inside AppShell.
- application-shell7.jsx (896-line shadcnblocks chat-app scaffold) — UI
  primitives bundled with it (avatar, badge, breadcrumb, dropdown-menu,
  tooltip, etc.) used directly in src/components/shell/. Scaffold
  orchestrator never integrated.
- src/components/ui/sidebar.jsx (shadcn primitive bundled by application-shell7)
  retained for potential future use; not imported by Subplan 6A code.
EOF
)"
```

- [ ] **Step 2: Push branch**

```bash
git push -u origin feat/subplan-6a-shell-rebuild
```

- [ ] **Step 3: Open PR**

```bash
gh pr create --base main --title "feat(shell): Subplan 6A — three-pane shell rebuild (rail + list pane + main)" --body "$(cat <<'EOF'
## Summary

Three-pane shell rebuild on top of Subplan 6 foundation. Replaces the 240px legacy Sidebar with:

1. **Stage 1 (shell scaffold)** — six new components in \`src/components/shell/\` (\`AppShell\`, \`RailNav\`, \`AppHeader\`, \`UserMenuDropdown\`, \`MasterDetailLayout\`, \`ListPane\`) + tests, no integration.
2. **Stage 2 (wire + single-pane)** — \`App.jsx\` switched to react-router-dom v7 nested layout routes; Dashboard, Notifications, Staff×3 migrated to render directly in shell main. DashboardPage internal h1/header snipped (D-12).
3. **Stage 3 (Clients)** — \`/clients\` lifted to master-detail in shell: \`<MasterDetailLayout>\` + \`<ListPane>\` slots + child \`<Outlet>\` for detail. Modals stay at page level.
4. **Stage 4 (Teams + Tasks)** — same pattern; Tasks includes box detection (Inbox/Outbox/All) from URL.
5. **Stage 5 (cleanup)** — \`Sidebar.jsx\` + \`application-shell7.jsx\` deleted.

Spec: [docs/superpowers/specs/2026-04-26-crm-subplan-6a-shell-rebuild-design.md](docs/superpowers/specs/2026-04-26-crm-subplan-6a-shell-rebuild-design.md)
Plan: [docs/superpowers/plans/2026-04-26-crm-subplan-6a-shell-rebuild.md](docs/superpowers/plans/2026-04-26-crm-subplan-6a-shell-rebuild.md)

## Out of scope (deferred)

- DS-token repaint of pages → Subplan 6A2
- DashboardPage full rewrite → Subplan 6A3
- KpiCard contract refactor → Subplan 6A3 (replaced wholesale)
- Mobile shell (bottom-tabs/drawer/bottom-sheet) → Subplan 6B
- Activity panel right (per-entity activity stays in detail tabs)
- Staff master-detail conversion (kept as 3 single-pane routes)
- AdminLayout cleanup → Subplan 7

## Test plan

- [ ] \`npm test\` — 200/200 passes
- [ ] \`npx vite build\` — clean
- [ ] All routes render with no console errors:
  - / (Dashboard)
  - /clients, /clients/:id, /clients/:id/:tab
  - /teams, /teams/:id
  - /tasks, /tasks/outbox, /tasks/all (+ each with /:taskId)
  - /staff, /staff/new, /staff/:refCode (+ /:tab)
  - /notifications (superadmin only)
  - /login
- [ ] Permission-gated rail icons visible per role
- [ ] Overdue badge on Tasks rail icon (number, "99+" max)
- [ ] User dropdown opens, Logout works
- [ ] Master-detail pages: list pane + main; click row → detail; modals overlay
- [ ] Light + dark mode toggle integrity
- [ ] DashboardPage: only shell header, no internal h1

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Capture PR URL**

Print PR URL from `gh pr create` output. Report it back.

**Definition of done — Stage 5:**
- Sidebar.jsx + application-shell7.jsx deleted
- 200 tests pass, build clean
- PR opened against main
- 1 commit (cleanup)

---

## Acceptance criteria (post-merge — repeats spec §8)

After all 5 stages merged into `main`:

- `src/components/shell/` contains 6 components + `index.js` + 6 `*.test.jsx` files
- `src/components/Sidebar.jsx` DELETED
- `src/components/application-shell7.jsx` DELETED
- `src/App.jsx` uses layout routes pattern with `<AppShell>` parent
- RailNav shows 5 nav icons + Notifications + UserMenuDropdown with permission filtering
- Overdue badge on Tasks rail icon (numeric, "99+" max)
- Pending badge on Notifications rail icon (для superadmin)
- Master-detail pages (Clients/Teams/Tasks) use `<MasterDetailLayout>` + `<ListPane>` + `<Outlet>` for detail
- Single-pane pages (Dashboard, Notifications, Staff×3) render directly in main
- DashboardPage без internal h1/header
- LoginPage остаётся outside shell
- AdminLayout untouched
- ~200 tests pass (`npm test -- --run`)
- `npx vite build` clean
- Visual smoke through all routes works in light + dark per role
- Zero console errors

---

## Rollback / debugging notes

- **If a master-detail page detail panel doesn't receive props correctly** — verify `<Outlet context={...}>` in parent matches `useOutletContext()` destructuring in child route. Common bug: missing prop in context object → undefined in child.

- **If RailNav icons don't show for a role** — check the permission-gating logic matches what `Sidebar.jsx` had pre-deletion. Compare `canSeeStaff/Clients/Teams/Tasks/Notifications` derivations.

- **If tooltip doesn't render in jsdom tests** — Radix Tooltip needs `<TooltipProvider>` ancestor; tests should wrap with it (test code in Task 1.6 does). If a real-app test fails, that's an app-side missing wrapper — `<AppShell>` already provides it for its descendants.

- **If overdue badge doesn't appear** — verify `useUserOverdueCount(canSeeTasks ? user?.id : null)` is being called with non-null user.id and that hook returns `{count}` (not just a number).

- **If `useOutletContext` returns undefined** — check that the page is actually a parent layout route in App.jsx (with `<Outlet>` inside its render). If page is a flat `<Route element={<Page />} />` without children, `useOutletContext` returns undefined.

- **If `npx vite build` fails after stage** — most likely a missing import or a typo in the new shell file. Check the error's stack trace for the failing file.

- **If branch push fails because branch exists on origin** — `git fetch && git log feat/subplan-6a-shell-rebuild..origin/feat/subplan-6a-shell-rebuild`. If remote has commits not local: STOP, ask user. If local ahead and remote unchanged: `git push --force-with-lease` ONLY after user confirms.

- **If `gh pr merge` fails with permissions** — switch gh account: `gh auth switch --user clubmonaco2017-ops` (per memory `project_gh_auth.md`). User does the merge themselves; agent does NOT merge.

---

## Files for context (reading order for a fresh implementer)

1. This plan.
2. [Subplan 6A spec](../specs/2026-04-26-crm-subplan-6a-shell-rebuild-design.md) — decisions log + component contracts.
3. [Subplan 6 foundation plan](2026-04-26-crm-subplan-6-design-system-foundation.md) — execution patterns reference (similar 5-stage shape).
4. `src/App.jsx` — current routing (target for layout-routes refactor).
5. `src/components/Sidebar.jsx` — legacy 240px sidebar (target for deletion; reference for permission gating).
6. `src/pages/ClientListPage.jsx` — most complete example of current master-detail pattern (target for Stage 3 refactor).
7. `src/pages/TaskListPage.jsx` — most complex master-detail (box-tabs).
8. `src/components/ui/{breadcrumb,dropdown-menu,avatar,tooltip}.jsx` — shadcn primitives we use.
9. `src/components/PermissionGate.test.jsx` — sample test pattern (vitest + RTL).
10. `vite.config.js` + `jsconfig.json` — `@/*` alias config.
