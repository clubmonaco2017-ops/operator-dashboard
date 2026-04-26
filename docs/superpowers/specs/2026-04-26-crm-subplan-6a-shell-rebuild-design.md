# CRM Subplan 6A — Shell Rebuild · Design Spec

**Status:** Brainstormed · approved.
**Author:** Claude Code (Opus 4.7) + Artem.
**Date:** 2026-04-26.
**Implements:** Domain model §8 row 6 (design-system rollout) — second tier after Subplan 6 foundation. Decomposed during Subplan 6 brainstorm into 6/6A/6A2/6A3/6B; this spec covers **6A only**.

**Builds on:** [Subplan 6 Design Foundation spec](2026-04-26-crm-subplan-6-design-system-foundation-design.md) (DS tokens applied, lucide sweep done, shadcnblocks `application-shell7` + Card/Sheet/Dialog primitives installed).

---

## 1. Goal & non-goals

**Goal:** Replace the current 240px `Sidebar.jsx` with a three-pane shell (rail 56px + list pane 280-320px + main, no right activity panel). Lift list-rendering out of the four current master-detail-style pages (Clients, Teams, Tasks) plus single-pane pages (Dashboard, Notifications, Staff×3) into shell-owned slots. Adopt React-Router-DOM v7 nested layout routes. Remove the dual-header glitch on DashboardPage. Pages stay in **inline Tailwind** — DS-token repaint deferred to Subplan 6A2.

**В scope:**

- Build six new components in `src/components/shell/`: `AppShell`, `RailNav`, `AppHeader`, `UserMenuDropdown`, `MasterDetailLayout`, `ListPane` — using primitives bundled in 6A foundation install (`@/components/ui/{sidebar,breadcrumb,dropdown-menu,avatar,tooltip}`).
- Migrate 3 master-detail pages (Clients, Teams, Tasks) to `<MasterDetailLayout>` + `<ListPane>` slots + child route `<Outlet>` for the detail.
- Migrate 5 single-pane pages (Dashboard, Notifications, Staff×3) to render directly inside `<AppShell>`'s main slot.
- Snip the internal h1/header from `DashboardPage.jsx` (Q11 → option B during brainstorm) so only the shell header remains.
- Switch `App.jsx` routing to nested layout routes via `<Outlet>`. URL paths unchanged.
- Add overdue badge on the Tasks rail icon (Q13 → option B: small numeric badge, "99+" max).
- Add notifications-pending badge on the Notifications rail icon (superadmin only).
- Delete `src/components/Sidebar.jsx` (legacy, fully replaced).
- Delete `src/components/application-shell7.jsx` (chat-app scaffold; we use the bundled UI primitives directly, not the orchestrator).
- Six new `*.test.jsx` files for shell components (~30 new assertions; existing 173 tests still pass; ~180 total).

**Out of scope (deferred):**

- DS-token repaint of pages (Subplan 6A2).
- DashboardPage full rewrite (Subplan 6A3) — only header snip in 6A.
- KpiCard contract refactor `icon={Component}` (Q10 → option C, lives in DashboardPage rewrite which replaces it entirely).
- Mobile shell — bottom-tabs, drawer, bottom-sheet (Subplan 6B). On `<lg` viewports the rail simply hides via Tailwind responsive classes; pages render full-width like before.
- Activity panel on the right (Q4 → option A — per-entity activity stays inside detail tabs as today).
- Staff master-detail conversion (Q-Staff → option A — Staff stays as 3 separate single-pane routes; future task if desired).
- Cmd+K palette / global hotkeys.
- AdminLayout cleanup (Subplan 7 «Чистка legacy» — Q12 → option A, untouched).
- LoginPage redesign (stays outside shell).
- Dynamic breadcrumbs with entity names ("Клиенты / Анна М.") — derived breadcrumb is static-by-URL only in 6A; entity enrichment in 6A2.

---

## 2. Decisions log

| # | Решение | Rationale |
|---|---|---|
| **D-1** | Decompose Subplan 6 follow-up into 3 subplans: **6A** (shell rebuild + lift master-detail lists), **6A2** (DS-token repaint of all pages incl. KpiCard refactor), **6A3** (DashboardPage full rewrite). | Single mega-PR (~30 файлов) тяжело ревьюить. Three coherent iterations: shell mechanics → token repaint → legacy rewrite. Each independently merge-able. |
| **D-2** | Shell pattern = three-pane (B from brainstorm Q1): rail (56px icons) + list pane (280-320px, conditional) + main (flex). | Matches `application-shell7` spirit and shadcnblocks Premium subscription rationale. List-pane lift из page-level в shell-level even устраняет page-level layout boilerplate. |
| **D-3** | Lift list-rendering out of master-detail pages into shell-owned slots (B1 from brainstorm Q2). Pages stay in inline Tailwind (DS-token repaint deferred to 6A2). | Half-state (B2) даёт сломанный пустой list-pane слот пока pages не мигрированы. Pilot-only (B3) тоже даёт inconsistent shell. B1 — один консистентный PR. |
| **D-4** | List pane hidden on non-master-detail pages (Dashboard, Notifications, Staff) — main expands to fill (A from brainstorm Q3). | Sub-nav (B) over-engineering для page (Dashboard) which is being rewritten in 6A3. Empty list pane (C) — anti-pattern (wasted space). |
| **D-5** | No right activity panel in 6A (A from brainstorm Q4). Per-entity activity stays inside detail tabs (TeamActivityTab, ActivityCard, TaskActivityCard). | Глобальный activity feed нет в данных (нет audit log table). Контекстный panel (B) дублирует existing detail tabs. |
| **D-6** | No mobile shell in 6A (A from brainstorm Q5). On `<lg` rail hides via Tailwind responsive; pages render full-width. | Project used by admins/leads on desktop (precedent). Mobile UX заслуживает отдельного фокуса в 6B (bottom-tabs + drawer + bottom-sheet). |
| **D-7** | Minimum header в 6A (A from brainstorm Q6): breadcrumb only. User avatar + Notifications переезжают на bottom of rail (Q9 → A). | Двух-уровневый header (C) overengineered. Заполненный header (B) собирает actions + bell + theme + dropdown — слишком много за раз. |
| **D-8** | List pane content = slot-based component `<ListPane title search filters createButton>{children}</ListPane>` (C from brainstorm Q7). | Fixed template (A) слишком жёсткий (Notifications не имеет filters). Полный freeform (B) даёт drift между страницами. Slot-based — golden mean. |
| **D-9** | Routing = react-router-dom v7 nested layout routes via `<Outlet>` (C from brainstorm Q8). URL не меняется. | Cleanest separation в react-router (canonical pattern). А (URL не меняется + page = тонкий wrapper) и B (URL переезжает в shell config) — first too implicit, second too invasive. |
| **D-10** | Rail = 5 nav icons top, 2 items (Notifications + UserMenuDropdown) bottom (A from brainstorm Q9). Logout в dropdown. | Чисто и предсказуемо. Settings (B) — заглушка для несуществующей page. Notifications в top (C) теряет иерархию (nav vs system). |
| **D-11** | KpiCard contract refactor — НЕ в 6A (C from brainstorm Q10). | KpiCard живёт ТОЛЬКО в DashboardPage. Dashboard rewrites в 6A3. Refactor of soon-to-be-replaced component = wasted effort. |
| **D-12** | DashboardPage в 6A — снять internal h1/header (B from brainstorm Q11). Остальной content as-is. | Без snip двойной header сверху (shell header + page header) выглядит сломанным до 6A3. Snip — 5-минутный fix. |
| **D-13** | AdminLayout не трогаем (A from brainstorm Q12). | Legacy /admin/* routes только для superadmin, неактивны. Cleanup в Subplan 7. |
| **D-14** | Overdue badge на Tasks rail icon = numeric badge, "99+" max (B from brainstorm Q13). | Standard pattern (Slack/Linear), читаемо без hover. Dot-only (A) теряет информацию. Дублирование (C) — visual clutter. |
| **D-15** | Staff = 3 separate single-pane routes в 6A. Master-detail conversion НЕ делаем. | Staff currently isn't master-detail (StaffListPage и StaffDetailPage отдельные). Конверсия требует ~150 строк рефактора + конфликт с `/staff/new` (creation flow требует full main). Может стать отдельным mini-task позже. |
| **D-16** | Static URL → breadcrumb derivation в 6A. Без entity-name enrichment ("Клиенты / Анна М."). | Enrichment требует data subscription per route (имя клиента/команды/задачи). Скоуп crawls. В 6A2 при page-level enrichment — добавим. |

---

## 3. Architecture

### 3.1. Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Header (48px)        breadcrumb only (e.g. "Клиенты / Все")    │
├──────┬──────────────────────────────────────────────────────────┤
│ Rail │                                                           │
│ ⌂    │   ╭── ListPane (320px, only on master-detail) ──╮         │
│ ●    │   │  Title + counts                              │         │
│ ◊    │   │  Search input                                │  Main   │
│ ☰    │   │  Filter chips                                │  pane   │
│      │   │  + Create button                             │  (flex) │
│ ─    │   │                                              │         │
│ 🔔  │   │  ▾ list rows                                 │ <Outlet>│
│ avtr │   ╰──────────────────────────────────────────────╯         │
└──────┴──────────────────────────────────────────────────────────┘
   56px               320px (only on master-detail)         flex
```

### 3.2. Component graph

- `<AppShell>` — top-level layout. Children: `<RailNav>` + `<AppHeader>` + `<main><Outlet/></main>`.
- `<RailNav>` — uses `useAuth()`, `useUserOverdueCount`, `usePendingDeletionCount`. Renders 5 top icons (permission-gated) + bottom Notifications icon (superadmin) + `<UserMenuDropdown>`.
- `<AppHeader>` — uses `useLocation()`. Reads pathname → derives static breadcrumb via `useDerivedBreadcrumb` helper. Renders shadcn `<Breadcrumb>`.
- `<UserMenuDropdown>` — uses `useAuth()` for user info + logout. Renders shadcn `<DropdownMenu>` with avatar trigger.
- `<MasterDetailLayout>` — props: `listPane: ReactNode`, `children: ReactNode`. Renders 320px aside + flex section grid.
- `<ListPane>` — props: `title?, search?, filters?, createButton?, children` (all optional except children). Renders sticky top sections + scrolling list area.

### 3.3. Routing pattern (react-router-dom v7)

```jsx
<Routes>
  <Route element={<AppShell />}>
    <Route path="/" element={<DashboardPage />} />
    <Route path="/notifications" element={<NotificationsPage />} />
    <Route path="/staff" element={<StaffListPage />} />
    <Route path="/staff/new" element={<StaffCreatePage />} />
    <Route path="/staff/:refCode/:tab?" element={<StaffDetailPage />} />

    <Route path="/clients" element={<ClientListPage />}>
      <Route index element={<DetailEmptyHint />} />
      <Route path=":clientId/:tab?" element={<ClientDetailPanel />} />
    </Route>

    <Route path="/teams" element={<TeamListPage />}>
      <Route index element={<DetailEmptyHint />} />
      <Route path=":teamId" element={<TeamDetailPanel />} />
    </Route>

    <Route path="/tasks" element={<TaskListPage />}>
      <Route index element={<DetailEmptyHint />} />
      <Route path=":taskId" element={<TaskDetailPanel />} />
      <Route path="outbox" element={<DetailEmptyHint />} />
      <Route path="outbox/:taskId" element={<TaskDetailPanel />} />
      <Route path="all" element={<DetailEmptyHint />} />
      <Route path="all/:taskId" element={<TaskDetailPanel />} />
    </Route>
  </Route>

  <Route path="/login" element={<LoginPage />} />
  {isSuperadmin(user) && <Route path="/admin/*" element={<AdminLayout ... />} />}
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
```

Master-detail page becomes a parent layout route. It renders `<MasterDetailLayout>` with the list pane filled and `<Outlet>` in the main slot. Child routes render either `<DetailEmptyHint>` (index) or the actual detail panel. `useOutletContext({ rows, reload, ... })` from parent hands data down to detail child without prop drilling through router.

### 3.4. Permissions / data

`<RailNav>` reuses existing permission helpers (`hasPermission`, `isSuperadmin`, `canSeeTeamsNav`) and existing badge hooks (`useUserOverdueCount`, `usePendingDeletionCount`). No new RPC, no new hooks, no new permissions table changes.

### 3.5. State / context

Shell does not own page-level state (filters, search, list rows). Each page-level component owns its own state with existing hooks (`useClientList`, `useTeamList`, etc.). Detail child routes consume parent state via `useOutletContext`.

`<AppShell>` reads `user` from `useAuth()`. Unauthenticated user is rejected at App level (`<LoginPage>` rendered instead of `<Routes>`) — same guard as today, no shell-level auth check needed.

---

## 4. Component contracts

### 4.1. `<AppShell />`

```jsx
function AppShell() {
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

- No props (reads context internally).
- Grid: rail spans full height left, header 48px top right, main fills bottom right.
- `overflow-hidden` on main lets nested layouts (`MasterDetailLayout`) manage their own scrolling.
- `<TooltipProvider>` (from `@/components/ui/tooltip.jsx`) wraps shell so `<Tooltip>` inside `RailNav.RailItem` works without per-item provider.

### 4.2. `<RailNav className? />`

```jsx
function RailNav({ className }) {
  const { user, logout } = useAuth()
  const { has: hasTeamMembership } = useUserTeamMembership(user?.id)

  // existing permission helpers (keep order — overdueCount depends on canSeeTasks)
  const canSeeStaff = hasPermission(user, 'create_users')
  const canSeeClients = hasPermission(user, 'manage_clients')
  const canSeeTeams = canSeeTeamsNav(user, hasTeamMembership)
  const canSeeTasks = hasPermission(user, 'view_own_tasks') || hasPermission(user, 'view_all_tasks')
  const canSeeNotifications = isSuperadmin(user)

  const { count: overdueCount } = useUserOverdueCount(canSeeTasks ? user?.id : null)
  const pending = usePendingDeletionCount({ enabled: canSeeNotifications })

  return (
    <aside className={`w-14 bg-card border-r border-border flex flex-col items-center py-3 gap-1 ${className}`}>
      <RailItem to="/" end icon={<Home size={20} />} label="Дашборд" />
      {canSeeStaff && <RailItem to="/staff" icon={<Users size={20} />} label="Сотрудники" />}
      {canSeeClients && <RailItem to="/clients" icon={<UserCircle size={20} />} label="Клиенты" />}
      {canSeeTeams && <RailItem to="/teams" icon={<Network size={20} />} label="Команды" />}
      {canSeeTasks && <RailItem to="/tasks" icon={<CheckSquare size={20} />} label="Задачи" badge={overdueCount} />}

      <div className="flex-1" />

      {canSeeNotifications && <RailItem to="/notifications" icon={<Bell size={20} />} label="Оповещения" badge={pending} />}
      <UserMenuDropdown user={user} onLogout={logout} />
    </aside>
  )
}

function RailItem({ to, end, icon, label, badge }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={to}
          end={end}
          className={({ isActive }) =>
            `relative w-10 h-10 rounded-lg flex items-center justify-center
             transition-colors focus-ds
             ${isActive ? 'bg-primary text-primary-foreground' : 'text-[var(--fg2)] hover:bg-muted'}`
          }
        >
          {icon}
          {badge > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] bg-[var(--danger)] text-white text-[9px] font-semibold rounded-full px-1 flex items-center justify-center tabular">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}
```

### 4.3. `<AppHeader />`

```jsx
function AppHeader() {
  const location = useLocation()
  const breadcrumb = useDerivedBreadcrumb(location.pathname)

  return (
    <header className="h-12 border-b border-border bg-background flex items-center px-4">
      {breadcrumb.length > 0 && (
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumb.map((crumb, i) => {
              const isLast = i === breadcrumb.length - 1
              return (
                <Fragment key={crumb.to ?? i}>
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

function useDerivedBreadcrumb(pathname) {
  // Static URL→crumbs map. No entity name enrichment in 6A (D-16).
  if (pathname === '/') return []
  if (pathname.startsWith('/staff/new')) return [{ label: 'Сотрудники', to: '/staff' }, { label: 'Новый' }]
  if (pathname.startsWith('/staff/')) return [{ label: 'Сотрудники', to: '/staff' }, { label: 'Профиль' }]
  if (pathname === '/staff') return [{ label: 'Сотрудники' }]
  if (pathname.startsWith('/clients')) return [{ label: 'Клиенты' }]
  if (pathname.startsWith('/teams')) return [{ label: 'Команды' }]
  if (pathname.startsWith('/tasks/outbox')) return [{ label: 'Задачи', to: '/tasks' }, { label: 'Исходящие' }]
  if (pathname.startsWith('/tasks/all')) return [{ label: 'Задачи', to: '/tasks' }, { label: 'Все' }]
  if (pathname.startsWith('/tasks')) return [{ label: 'Задачи' }]
  if (pathname.startsWith('/notifications')) return [{ label: 'Оповещения' }]
  return []
}
```

### 4.4. `<UserMenuDropdown user, onLogout />`

```jsx
function UserMenuDropdown({ user, onLogout }) {
  const initials = (user?.alias || user?.firstName || user?.email || '?')
    .split(/\s+/)
    .map(s => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

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
          <div className="text-sm font-semibold">{user.alias || user.firstName}</div>
          <div className="text-xs text-muted-foreground">{user.role}</div>
          <div className="font-mono text-xs text-[var(--fg4)] mt-0.5">{user.refCode}</div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout}>Выйти</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

### 4.5. `<MasterDetailLayout listPane, children />`

```jsx
function MasterDetailLayout({ listPane, children }) {
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

### 4.6. `<ListPane title?, search?, filters?, createButton?, children />`

```jsx
function ListPane({ title, search, filters, createButton, children }) {
  return (
    <div className="flex flex-col h-full">
      {(title || createButton) && (
        <div className="p-3 border-b border-border flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold flex-1 min-w-0 truncate">{title}</h2>}
          {createButton}
        </div>
      )}
      {search && <div className="p-3 border-b border-border">{search}</div>}
      {filters && <div className="p-3 border-b border-border">{filters}</div>}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
```

---

## 5. Per-page migration table

| Page | Тип в shell | Изменения | Сложность |
|---|---|---|---|
| **`/`** Dashboard | single-pane | Снять internal h1/header (D-12). Убрать `<Sidebar>` reference. Content as-is. ~768 → ~750 строк. | XS |
| **`/notifications`** | single-pane | Убрать `<Sidebar>` reference. Content as-is. ~78 → ~60 строк. | XS |
| **`/staff`** Staff list | single-pane | Убрать `<Sidebar>` reference. ~86 → ~70 строк. | XS |
| **`/staff/new`** Staff create | single-pane | Убрать `<Sidebar>` reference. ~220 → ~210 строк. | XS |
| **`/staff/:refCode/:tab?`** Staff detail | single-pane | Убрать `<Sidebar>` reference. ~128 → ~115 строк. | XS |
| **`/clients` + `/clients/:clientId/:tab?`** | **master-detail** | Полный рефактор: `<MasterDetailLayout listPane={...}><Outlet /></MasterDetailLayout>` pattern; список + chips + search в `<ListPane>` slots; `<ClientDetailPanel>` становится child route, читает `clientId` через `useParams()` + dataset через `useOutletContext()`. CreateClientSlideOut / Lightbox остаются modals на уровне страницы. ~217 → ~250 строк. | M |
| **`/teams` + `/teams/:teamId`** | **master-detail** | Идентично Clients pattern. ~213 → ~245 строк. | M |
| **`/tasks` + 5 sub-routes** | **master-detail** | Идентично Clients pattern + box tabs (Входящие/Исходящие/Все). Box detection через `useLocation().pathname.includes('/outbox' or '/all')` в parent route. Child routes для каждого `:taskId`. 6 routes консолидируются в parent + 5 children. ~315 → ~330 строк. | L |

---

## 6. Stages / migration order

5 stages, each = одного stage commit. PR в конце.

### Stage 1 — Shell scaffold (no integration)

Build all six shell components in `src/components/shell/` plus tests. No App.jsx changes; old `Sidebar.jsx` still in production.

**Deliverable:** 6 new components + 1 `index.js` + 6 test files (~30 assertions). Build clean. Test count: 173 (existing) + ≥30 (new) = **≥203 total** (aim).

### Stage 2 — Wire AppShell + single-pane routes

Switch `App.jsx` to layout routes. Migrate Dashboard, Notifications, Staff×3 to render under `<AppShell>`. Snip Dashboard internal header. Snip `<Sidebar>` reference from these 5 pages.

Master-detail pages (Clients/Teams/Tasks) still render under shell but use OLD layout (visible double-shell glitch — acceptable transient state for one stage).

**Deliverable:** AppShell live. Single-pane pages clean. Master-detail pages temporarily ugly (double rail visible). Tests pass.

### Stage 3 — Migrate Clients to master-detail

`/clients` route → nested layout. `ClientListPage` → `<MasterDetailLayout>` + `<ListPane>` slots + `<Outlet>` for detail. `ClientDetailPanel` becomes child route consuming `useOutletContext`. Snip `<Sidebar>` reference.

Visual smoke: list loads, click selects detail, filters/search work, CreateClientSlideOut opens.

**Deliverable:** Clients fully on new shell. Tests pass.

### Stage 4 — Migrate Teams + Tasks

Identical pattern to Stage 3 для `/teams/*` и `/tasks/*` (latter has box-tabs — most complex).

**Deliverable:** All master-detail pages on new shell. `Sidebar.jsx` no longer imported anywhere. Tests pass.

### Stage 5 — Cleanup + final smoke + PR

- `git rm src/components/Sidebar.jsx`
- `git rm src/components/application-shell7.jsx`
- Run full test suite + `vite build`
- Smoke through 7 routes (`/`, `/clients/*`, `/teams/*`, `/tasks/*`, `/staff/*`, `/notifications`, `/login`) in light + dark + per-role
- Commit + push + open PR

**Deliverable:** Cleanup done, build clean, tests pass, PR open.

---

## 7. Тестирование

### 7.1. Existing 173 tests

Must continue to pass. All are unit-level (lib/hooks/helpers); no shell dependency.

### 7.2. New shell-component tests

| File | Что тестируется |
|---|---|
| `AppShell.test.jsx` | Renders rail + header + main slot; passes through `<Outlet>` |
| `RailNav.test.jsx` | Permission-based icon visibility (мок `useAuth`); active state via mock `useLocation`; overdue badge при `count > 0`; pending badge только для superadmin; "99+" formatting |
| `AppHeader.test.jsx` | `useDerivedBreadcrumb` mapping для каждого route (`/clients` → "Клиенты"; `/tasks/all/123` → "Задачи / Все"; `/` → empty); `<Breadcrumb>` markup correctness |
| `MasterDetailLayout.test.jsx` | Renders listPane + children в правильных слотах; sizes correct |
| `ListPane.test.jsx` | Rendering when ВСЕ slots переданы; rendering когда ТОЛЬКО children (без верхних секций); rendering combinations (e.g. title без createButton) |
| `UserMenuDropdown.test.jsx` | Renders user info (alias/role/refCode); logout click triggers callback |

Goal: ~6 new test files, ~30 new assertions. Total после 6A: ≥180 tests.

### 7.3. Visual smoke (preview server)

After Stages 2, 3, 4, 5: open in browser, verify:
- Each route renders без console errors
- Active rail icon highlighted при навигации
- Tooltip on rail icon показывает label
- Master-detail pages: list pane слева (320px), detail справа, switch работает
- UserMenuDropdown открывается, logout работает
- Light + dark mode toggle сохраняет visual integrity
- Permission-gated icons исчезают при login as different role
- DashboardPage без двойного header после Stage 2
- LoginPage остаётся вне shell

### 7.4. Что НЕ тестируем

- Pixel-perfect соответствие Figma (нет mockups для shell)
- Mobile breakpoint (defer 6B)
- E2E flows (no behavior change beyond routing/layout)
- application-shell7.jsx удаление (просто `git rm`, нет логики)

---

## 8. Acceptance criteria

After all 5 stages and merge into main:

- `src/components/shell/` contains 6 components (`AppShell`, `RailNav`, `AppHeader`, `UserMenuDropdown`, `MasterDetailLayout`, `ListPane`) + `index.js` re-exports + 6 `*.test.jsx`
- `src/components/Sidebar.jsx` DELETED
- `src/components/application-shell7.jsx` DELETED
- `src/App.jsx` uses layout routes pattern with `<AppShell>` parent
- `RailNav` shows 5 nav icons (top, permission-gated) + Notifications icon (bottom, superadmin) + UserMenuDropdown (bottom)
- Overdue badge on Tasks rail icon (numeric, "99+" max)
- Pending badge on Notifications rail icon (для superadmin)
- Master-detail pages (Clients, Teams, Tasks) рендерят list pane (320px) + main; detail switch via `<Outlet>`
- Single-pane pages (Dashboard, Notifications, Staff×3) рендерят прямо в main (без list pane)
- DashboardPage без internal h1/header
- LoginPage остаётся вне shell
- AdminLayout не тронут (legacy /admin/* still works)
- `npm test -- --run` passes (~180 tests)
- `npx vite build` clean (only pre-existing chunk-size warning)
- Visual smoke: 7 routes work в light + dark per role; zero console errors

---

## 9. Файлы для контекста

При начале plan'а / implementation'а:

- This spec.
- [docs/superpowers/specs/2026-04-26-crm-subplan-6-design-system-foundation-design.md](2026-04-26-crm-subplan-6-design-system-foundation-design.md) — Subplan 6 foundation (DS tokens, lucide sweep, primitives install).
- [docs/superpowers/plans/2026-04-26-crm-subplan-6-design-system-foundation.md](../plans/2026-04-26-crm-subplan-6-design-system-foundation.md) — execution patterns reference.
- `src/App.jsx` — current routing structure (target for layout-routes refactor).
- `src/components/Sidebar.jsx` — legacy 240px sidebar (target for deletion).
- `src/components/application-shell7.jsx` — chat-app scaffold (target for deletion; reference for primitive imports).
- `src/components/ui/{sidebar,breadcrumb,dropdown-menu,avatar,tooltip}.jsx` — shadcn primitives bundled in 6A foundation (use directly).
- `src/pages/*.jsx` — 8 page files to migrate.
- `src/index.css` — DS tokens already in place from Subplan 6 Stage 1.
- `docs/domain-model.md` §8 — design-system roadmap.
