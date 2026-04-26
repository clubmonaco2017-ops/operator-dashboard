# CRM Subplan 6A3 — Dashboard Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace legacy 742-line `DashboardPage.jsx` with section-based dashboard architecture (section «Аналитика периода» with 11 permission-gated KPI cards + chart + top operators + hourly table; section «Задачи» with 1-2 task cards). Remove `<AppHeader />` from `<AppShell />` entirely (D-14 revised — single-row grid, no shell header). Move theme toggle from inline filter toolbar to `UserMenuDropdown`. Adopt Cloudflare-inspired card style with period comparison delta on numeric metrics.

**Architecture:** 6 sequential commits on branch `feat/subplan-6a3-dashboard-rewrite`. Stage 1a removes AppHeader. Stage 1b builds period context + DateSelector. Stage 2 builds Section + base KpiCard primitives. Stage 3 builds card registry + 11 specific cards + central `useDashboardData` hook + 2 task cards. Stage 4 ports chart + top operators + hourly table from legacy file (visual repaint only). Stage 5 wires DashboardPage from sections + adds theme submenu to UserMenuDropdown + deletes legacy + opens PR.

**Tech Stack:** React 19, react-router-dom v7, Tailwind CSS v4, lucide-react (Calendar, ChevronDown, RefreshCw, DollarSign, Users, Trophy, Clock, TrendingUp, Crown, Award, Medal, Check, Monitor, Sun, Moon, AlertTriangle, Inbox, Search, BarChart3), recharts (BarChart, AreaChart), rc-slider (already in deps), shadcn `<Popover>` (NEW — needs install), shadcn `<DropdownMenu>` extended with Sub for theme, Vitest + @testing-library/react, Supabase (existing `operators` + `hourly_revenue` queries; new optional team membership query).

**Source of truth:**
- [Subplan 6A3 spec](../specs/2026-04-26-crm-subplan-6a3-dashboard-rewrite-design.md) — D-1…D-18, architecture (§3), card registry (§4), component contracts (§5), stages (§6), open items (§9).
- [Subplan 6 spec](../specs/2026-04-26-crm-subplan-6-design-system-foundation-design.md) — DS tokens, lucide installed.
- [Subplan 6A spec](../specs/2026-04-26-crm-subplan-6a-shell-rebuild-design.md) — original AppShell + AppHeader contracts (the things we are now removing/replacing).
- [Subplan 6A2 spec](../specs/2026-04-26-crm-subplan-6a2-handoff-cleanup-design.md) — date selector "light mockup" reference, MasterDetailLayout.

**Prerequisites:**
- Subplans 6 + 6A + 6A2 merged into `main` ✓ (latest commit on main: `992e68a`).
- Spec for 6A3 committed (`e9630f3` + `992e68a`) on main.
- All 201 baseline tests passing on `main`.
- `npx shadcn` CLI configured via `components.json` with shadcnblocks Premium + base shadcn registry.
- `rc-slider` already in deps (used by legacy `DashboardPage.jsx`).
- Recharts already in deps (used by legacy `DashboardPage.jsx`).

---

## File structure

### Create

```
src/hooks/useTheme.js                                       # extracted from legacy DashboardPage useTheme()
src/hooks/useDashboardData.js                               # central hourly_revenue + operators fetch
src/components/dashboard/DashboardPeriodProvider.jsx        # context + derivePreviousPeriod helper
src/components/dashboard/DashboardPeriodProvider.test.jsx
src/components/dashboard/DateSelector.jsx                   # pill + popover (presets / dates / hours)
src/components/dashboard/DateSelector.test.jsx
src/components/dashboard/Section.jsx                        # collapsible Section + SubSection
src/components/dashboard/Section.test.jsx
src/components/dashboard/KpiCard.jsx                        # base shared card (label / value / icon / sublabel / delta / accentColor)
src/components/dashboard/KpiCard.test.jsx
src/components/dashboard/cardRegistry.js                    # ANALYTICS_CARDS + TASK_CARDS + renderCards helper
src/components/dashboard/cardRegistry.test.jsx
src/components/dashboard/cards/TotalRevenueCard.jsx
src/components/dashboard/cards/RevenuePerHourCard.jsx
src/components/dashboard/cards/LeaderCard.jsx
src/components/dashboard/cards/EngagementCard.jsx
src/components/dashboard/cards/ShiftCard.jsx                # parameterised by shift prop
src/components/dashboard/cards/BestShiftCard.jsx
src/components/dashboard/cards/TopTeamCard.jsx
src/components/dashboard/cards/TeamDistributionCard.jsx
src/components/dashboard/cards/TeamEngagementCard.jsx
src/components/dashboard/cards/OverdueAllCard.jsx
src/components/dashboard/cards/OverdueOwnCard.jsx
src/components/dashboard/SectionAnalytics.jsx               # wraps period provider, renders sub-sections + chart row + table
src/components/dashboard/SectionTasks.jsx                   # renders task cards (no period provider)
src/components/dashboard/RevenueByHourChart.jsx             # 2/3 grid, recharts BarChart/AreaChart with toggle
src/components/dashboard/TopOperatorsList.jsx               # 1/3 grid, top-5 default, expand to top-20
src/components/dashboard/HourlyOperatorTable.jsx            # bottom of section: search + shift pills + only-active + sort
src/components/ui/popover.jsx                               # added via `npx shadcn add popover`
```

### Modify

```
src/components/shell/AppShell.jsx                           # grid-rows-[1fr], remove AppHeader render
src/components/shell/AppShell.test.jsx                      # remove header/breadcrumb assertions
src/components/shell/index.js                               # drop AppHeader + useDerivedBreadcrumb exports
src/components/shell/UserMenuDropdown.jsx                   # add theme submenu (3 items + checkmark)
src/components/shell/UserMenuDropdown.test.jsx              # add theme menu tests
src/pages/DashboardPage.jsx                                 # full rewrite (~150 lines)
```

### Delete

```
src/components/shell/AppHeader.jsx                          # 64 lines
src/components/shell/AppHeader.test.jsx                     # 62 lines, 10 tests
```

### NOT touched (deferred or unrelated)

- All shadcn primitives in `src/components/ui/` (popover added; rest unchanged).
- All other pages (Clients/Teams/Tasks/Staff/Notifications) — visual repaint deferred to 6A4.
- DB / migrations — ZERO new RPCs (D-3.4: existing queries + client-side aggregation).
- AdminPanel + AdminLayout — Subplan 7.

---

## Stages

6 commits, sequential. Each stage = one commit. PR opened at end of Stage 5.

---

### Stage 1a — Remove `<AppHeader />` from `<AppShell />`

**Цель:** Surgical removal of AppHeader. AppShell becomes single-row grid (rail + main). Delete `AppHeader.jsx` + `AppHeader.test.jsx`. Update `AppShell.test.jsx` to drop header/breadcrumb assertions. All 8 routes still render — pages will provide their own headers in later stages.

#### Task 1a.1 — Branch + baseline verification

**Files:**
- Create: branch `feat/subplan-6a3-dashboard-rewrite` from `main` (commit `992e68a`)

- [ ] **Step 1: Create feature branch**

```bash
cd /Users/artemsaskin/Work/operator-dashboard
git checkout main
git pull --ff-only
git checkout -b feat/subplan-6a3-dashboard-rewrite
git status
```
Expected: clean working tree, branch ahead 0 of main.

- [ ] **Step 2: Verify baseline**

```bash
npm test -- --run
```
Expected: 201 passed (~21 files). Note exact count for end-of-stage comparison.

```bash
npx vite build
```
Expected: clean (only pre-existing chunk-size warning).

#### Task 1a.2 — Update `AppShell.jsx` to single-row grid

**Files:**
- Modify: `src/components/shell/AppShell.jsx`

- [ ] **Step 1: Replace AppShell.jsx contents**

Write to `src/components/shell/AppShell.jsx`:

```jsx
import { Outlet } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RailNav } from './RailNav.jsx'

export function AppShell() {
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

Notes:
- `grid-rows-[1fr]` (was `[48px_1fr]`).
- `<RailNav />` no longer needs `className="row-span-2"` (single row now).
- `<AppHeader />` import + render REMOVED.
- `<main>` is direct grandchild of grid.

- [ ] **Step 2: Verify build**

```bash
npx vite build
```
Expected: clean.

#### Task 1a.3 — Delete `AppHeader.jsx` + `AppHeader.test.jsx`

**Files:**
- Delete: `src/components/shell/AppHeader.jsx`
- Delete: `src/components/shell/AppHeader.test.jsx`

- [ ] **Step 1: Confirm zero external usage of AppHeader / useDerivedBreadcrumb**

```bash
grep -rn "AppHeader\|useDerivedBreadcrumb" src/ --include="*.jsx" --include="*.js" | grep -v "shell/AppHeader\|shell/index.js\|shell/AppShell.jsx"
```
Expected: ZERO matches (only AppHeader.jsx, AppShell.jsx (already updated above — should now NOT match), and index.js (still exports — to be cleaned in Task 1a.4) reference these).

If any other file matches — STOP, investigate.

- [ ] **Step 2: Delete files**

```bash
git rm src/components/shell/AppHeader.jsx src/components/shell/AppHeader.test.jsx
```

#### Task 1a.4 — Drop AppHeader exports from `src/components/shell/index.js`

**Files:**
- Modify: `src/components/shell/index.js`

- [ ] **Step 1: Read current index.js**

```bash
cat src/components/shell/index.js
```
Expected: 7 exports (AppShell, RailNav, AppHeader+useDerivedBreadcrumb, UserMenuDropdown, MasterDetailLayout, ListPane, SearchInput).

- [ ] **Step 2: Remove AppHeader export line**

Edit `src/components/shell/index.js` — remove the line:
```js
export { AppHeader, useDerivedBreadcrumb } from './AppHeader.jsx'
```

Final `index.js` should be:
```js
export { AppShell } from './AppShell.jsx'
export { RailNav } from './RailNav.jsx'
export { UserMenuDropdown } from './UserMenuDropdown.jsx'
export { MasterDetailLayout } from './MasterDetailLayout.jsx'
export { ListPane } from './ListPane.jsx'
export { SearchInput } from './SearchInput.jsx'
```

- [ ] **Step 3: Verify build**

```bash
npx vite build
```
Expected: clean.

#### Task 1a.5 — Update `AppShell.test.jsx` (remove header/breadcrumb assertions)

**Files:**
- Modify: `src/components/shell/AppShell.test.jsx`

- [ ] **Step 1: Replace AppShell.test.jsx contents**

The current test file has 2 cases — one of them was specifically about empty header on `/`, the other mentioned "header" in description but actually checks rail + outlet. Replace contents with:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

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

import { AppShell } from './AppShell.jsx'

describe('<AppShell>', () => {
  it('renders rail nav and outlet content (single-row grid, no header)', () => {
    render(
      <MemoryRouter initialEntries={['/clients']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/clients" element={<div data-testid="page">Page Body</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByLabelText('Главное меню')).toBeInTheDocument()
    expect(screen.getByTestId('page')).toHaveTextContent('Page Body')
  })

  it('does not render any breadcrumb navigation', () => {
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
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull()
  })
})
```

Notes:
- Test 1 description updated to mention single-row grid; the `screen.getByText('Клиенты')` assertion is REMOVED (it was ambiguous — could come from RailNav nav item OR breadcrumb; by removing it, the test is unambiguous about checking only rail label + outlet content).
- Test 2 kept (asserting no breadcrumb anywhere) as a regression guard for D-14.
- 2 tests instead of 2 (same count — but 1 was updated to drop ambiguous assertion).

- [ ] **Step 2: Run tests**

```bash
npm test -- --run src/components/shell/AppShell.test.jsx
```
Expected: 2 passed.

#### Task 1a.6 — Stage 1a smoke + commit

- [ ] **Step 1: Full test + build**

```bash
npm test -- --run
npx vite build
```
Expected: 201 - 10 (AppHeader.test.jsx deleted) = **191 passed**, build clean.

If test count differs from 191 — STOP and investigate.

- [ ] **Step 2: Stage and commit**

```bash
git add src/components/shell/AppShell.jsx src/components/shell/AppShell.test.jsx src/components/shell/index.js
git status   # should also list deleted AppHeader.jsx + AppHeader.test.jsx (already git rm'd in Task 1a.3)
git commit -m "feat(shell): remove AppHeader entirely (Subplan 6A3 Stage 1a — D-14 revised)

- AppShell.jsx now single-row grid: grid-cols-[56px_1fr] grid-rows-[1fr].
- RailNav no longer needs row-span-2 (single row).
- AppHeader.jsx + AppHeader.test.jsx DELETED (10 tests removed).
- shell/index.js drops AppHeader + useDerivedBreadcrumb exports.
- AppShell.test.jsx updated: 2 tests, no breadcrumb-related assertions.
- Pages will provide their own section headers in subsequent stages
  (Section component in Stage 2). Page-level breadcrumb component for
  complex sub-routes deferred until first concrete need."
```

- [ ] **Step 3: Verify**

```bash
git log -1 --stat
```
Expected: 5 files changed (3 modified + 2 deleted).

**Definition of done — Stage 1a:**
- AppShell renders rail + main only; no AppHeader render.
- AppHeader.jsx + AppHeader.test.jsx deleted.
- shell/index.js sans AppHeader/useDerivedBreadcrumb exports.
- 191 tests pass, build clean.
- 1 commit.

---

### Stage 1b — Period context + `<DateSelector>` + popover install

**Цель:** Build foundational period state (`DashboardPeriodProvider` + `useDashboardPeriod` + `derivePreviousPeriod` helper). Build `<DateSelector>` (pill + popover with 3 sections — presets / dates / hours). Install shadcn `<Popover>` primitive. Tests for both.

#### Task 1b.1 — Install shadcn `<Popover>` primitive

**Files:**
- Create: `src/components/ui/popover.jsx` (via shadcn CLI)

- [ ] **Step 1: Run shadcn add**

```bash
npx shadcn@latest add popover
```
Expected: prompt may ask about overwrite — say no for any existing files. Creates `src/components/ui/popover.jsx`.

If prompt fails or the registry is configured for shadcnblocks Premium, fall back to:
```bash
npx shadcn@latest add @shadcn/popover
```

- [ ] **Step 2: Verify popover.jsx exists**

```bash
ls -la src/components/ui/popover.jsx
```
Expected: file exists, ~50-80 lines, exports `Popover`, `PopoverTrigger`, `PopoverContent`, `PopoverAnchor`.

- [ ] **Step 3: Verify build**

```bash
npx vite build
```
Expected: clean.

#### Task 1b.2 — Create `DashboardPeriodProvider.jsx` + `useDashboardPeriod` + `derivePreviousPeriod` (TDD)

**Files:**
- Create: `src/components/dashboard/DashboardPeriodProvider.jsx`
- Create: `src/components/dashboard/DashboardPeriodProvider.test.jsx`

- [ ] **Step 1: Create folder**

```bash
mkdir -p src/components/dashboard/cards
```

- [ ] **Step 2: Write the failing test**

Write to `src/components/dashboard/DashboardPeriodProvider.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import {
  DashboardPeriodProvider,
  useDashboardPeriod,
  derivePreviousPeriod,
} from './DashboardPeriodProvider.jsx'

function Probe({ onMount }) {
  const ctx = useDashboardPeriod()
  onMount?.(ctx)
  return (
    <div>
      <span data-testid="preset">{ctx.period.preset}</span>
      <span data-testid="from">{ctx.period.from}</span>
      <span data-testid="to">{ctx.period.to}</span>
      <span data-testid="hmin">{ctx.period.hours[0]}</span>
      <span data-testid="hmax">{ctx.period.hours[1]}</span>
      <button
        onClick={() =>
          ctx.setPeriod((p) => ({ ...p, preset: 'week', from: '2026-04-01', to: '2026-04-07' }))
        }
      >
        set week
      </button>
    </div>
  )
}

describe('<DashboardPeriodProvider>', () => {
  it('provides default period (today / hours [0,23])', () => {
    render(
      <DashboardPeriodProvider>
        <Probe />
      </DashboardPeriodProvider>,
    )
    expect(screen.getByTestId('preset')).toHaveTextContent('today')
    expect(screen.getByTestId('hmin')).toHaveTextContent('0')
    expect(screen.getByTestId('hmax')).toHaveTextContent('23')
    expect(screen.getByTestId('from').textContent).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('updates period via setPeriod', () => {
    render(
      <DashboardPeriodProvider>
        <Probe />
      </DashboardPeriodProvider>,
    )
    act(() => {
      screen.getByText('set week').click()
    })
    expect(screen.getByTestId('preset')).toHaveTextContent('week')
    expect(screen.getByTestId('from')).toHaveTextContent('2026-04-01')
    expect(screen.getByTestId('to')).toHaveTextContent('2026-04-07')
  })

  it('throws when useDashboardPeriod is used outside provider', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/must be used inside DashboardPeriodProvider/)
    errSpy.mockRestore()
  })
})

describe('derivePreviousPeriod', () => {
  it('today → yesterday (single-day)', () => {
    const out = derivePreviousPeriod({ preset: 'today', from: '2026-04-26', to: '2026-04-26', hours: [0, 23] })
    expect(out).toEqual({ preset: 'yesterday', from: '2026-04-25', to: '2026-04-25', hours: [0, 23] })
  })
  it('yesterday → day-before', () => {
    const out = derivePreviousPeriod({ preset: 'yesterday', from: '2026-04-25', to: '2026-04-25', hours: [0, 23] })
    expect(out.from).toBe('2026-04-24')
    expect(out.to).toBe('2026-04-24')
  })
  it('week → previous 7-day window', () => {
    const out = derivePreviousPeriod({ preset: 'week', from: '2026-04-20', to: '2026-04-26', hours: [0, 23] })
    expect(out.from).toBe('2026-04-13')
    expect(out.to).toBe('2026-04-19')
  })
  it('month → equal-length window before', () => {
    const out = derivePreviousPeriod({ preset: 'month', from: '2026-03-28', to: '2026-04-26', hours: [0, 23] })
    expect(out.from).toBe('2026-02-26')
    expect(out.to).toBe('2026-03-27')
  })
  it('custom (3-day range) → 3 days immediately before', () => {
    const out = derivePreviousPeriod({ preset: 'custom', from: '2026-04-24', to: '2026-04-26', hours: [0, 23] })
    expect(out.from).toBe('2026-04-21')
    expect(out.to).toBe('2026-04-23')
  })
  it('preserves hours unchanged', () => {
    const out = derivePreviousPeriod({ preset: 'today', from: '2026-04-26', to: '2026-04-26', hours: [9, 18] })
    expect(out.hours).toEqual([9, 18])
  })
})
```

- [ ] **Step 3: Run test to verify failure**

```bash
npm test -- --run src/components/dashboard/DashboardPeriodProvider.test.jsx
```
Expected: FAIL — module not found.

- [ ] **Step 4: Write implementation**

Write to `src/components/dashboard/DashboardPeriodProvider.jsx`:

```jsx
import { createContext, useContext, useMemo, useState } from 'react'

const DashboardPeriodContext = createContext(null)

const TZ = 'Europe/Kiev'

function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ })
}

function shiftDays(dateStr, deltaDays) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

function diffDaysInclusive(fromStr, toStr) {
  const f = new Date(fromStr + 'T00:00:00Z')
  const t = new Date(toStr + 'T00:00:00Z')
  return Math.round((t - f) / 86400000) + 1
}

export function derivePreviousPeriod(period) {
  const { preset, from, to } = period
  if (preset === 'today') {
    const prev = shiftDays(from, -1)
    return { ...period, preset: 'yesterday', from: prev, to: prev }
  }
  if (preset === 'yesterday') {
    const prev = shiftDays(from, -1)
    return { ...period, from: prev, to: prev }
  }
  if (preset === 'week') {
    return { ...period, preset: 'custom', from: shiftDays(from, -7), to: shiftDays(to, -7) }
  }
  if (preset === 'month') {
    const days = diffDaysInclusive(from, to)
    return { ...period, preset: 'custom', from: shiftDays(from, -days), to: shiftDays(to, -days) }
  }
  // custom: equal-length window immediately before
  const days = diffDaysInclusive(from, to)
  return { ...period, from: shiftDays(from, -days), to: shiftDays(to, -days) }
}

export function DashboardPeriodProvider({ children }) {
  const [period, setPeriod] = useState(() => ({
    preset: 'today',
    from: todayStr(),
    to: todayStr(),
    hours: [0, 23],
  }))
  const previousPeriod = useMemo(() => derivePreviousPeriod(period), [period])
  const value = useMemo(() => ({ period, previousPeriod, setPeriod }), [period, previousPeriod])
  return (
    <DashboardPeriodContext.Provider value={value}>{children}</DashboardPeriodContext.Provider>
  )
}

export function useDashboardPeriod() {
  const ctx = useContext(DashboardPeriodContext)
  if (!ctx) throw new Error('useDashboardPeriod must be used inside DashboardPeriodProvider')
  return ctx
}
```

- [ ] **Step 5: Run test to verify pass**

```bash
npm test -- --run src/components/dashboard/DashboardPeriodProvider.test.jsx
```
Expected: 9 passed (3 provider + 6 derivePreviousPeriod).

#### Task 1b.3 — Create `<DateSelector>` component (TDD)

**Files:**
- Create: `src/components/dashboard/DateSelector.jsx`
- Create: `src/components/dashboard/DateSelector.test.jsx`

- [ ] **Step 1: Write the failing test**

Write to `src/components/dashboard/DateSelector.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DashboardPeriodProvider, useDashboardPeriod } from './DashboardPeriodProvider.jsx'
import { DateSelector } from './DateSelector.jsx'

function Reader() {
  const { period } = useDashboardPeriod()
  return (
    <div>
      <span data-testid="preset">{period.preset}</span>
      <span data-testid="from">{period.from}</span>
      <span data-testid="to">{period.to}</span>
    </div>
  )
}

function Wrapped() {
  return (
    <DashboardPeriodProvider>
      <DateSelector />
      <Reader />
    </DashboardPeriodProvider>
  )
}

describe('<DateSelector>', () => {
  it('renders pill with default preset label "Сегодня"', () => {
    render(<Wrapped />)
    expect(screen.getByRole('button', { name: /Сегодня/ })).toBeInTheDocument()
  })

  it('opens popover with preset buttons when pill clicked', () => {
    render(<Wrapped />)
    fireEvent.click(screen.getByRole('button', { name: /Сегодня/ }))
    expect(screen.getByRole('button', { name: 'Вчера' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Неделя' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Месяц' })).toBeInTheDocument()
  })

  it('switching preset updates context (Вчера)', () => {
    render(<Wrapped />)
    fireEvent.click(screen.getByRole('button', { name: /Сегодня/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Вчера' }))
    expect(screen.getByTestId('preset')).toHaveTextContent('yesterday')
    // from === to (single day)
    expect(screen.getByTestId('from').textContent).toBe(screen.getByTestId('to').textContent)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm test -- --run src/components/dashboard/DateSelector.test.jsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write to `src/components/dashboard/DateSelector.jsx`:

```jsx
import { useState } from 'react'
import { Calendar, ChevronDown } from 'lucide-react'
import Slider from 'rc-slider'
import 'rc-slider/assets/index.css'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useDashboardPeriod } from './DashboardPeriodProvider.jsx'

const TZ = 'Europe/Kiev'
const PRESETS = [
  { id: 'today', label: 'Сегодня' },
  { id: 'yesterday', label: 'Вчера' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
]

function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ })
}

function shiftDays(dateStr, deltaDays) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

function presetToDates(preset) {
  const today = todayStr()
  if (preset === 'today') return { from: today, to: today }
  if (preset === 'yesterday') {
    const y = shiftDays(today, -1)
    return { from: y, to: y }
  }
  if (preset === 'week') return { from: shiftDays(today, -6), to: today }
  if (preset === 'month') return { from: shiftDays(today, -29), to: today }
  return { from: today, to: today }
}

function presetLabel(preset) {
  return PRESETS.find((p) => p.id === preset)?.label ?? 'Период'
}

function rangeText(period) {
  return period.from === period.to ? period.from : `${period.from} — ${period.to}`
}

export function DateSelector() {
  const { period, setPeriod } = useDashboardPeriod()
  const [open, setOpen] = useState(false)

  function handlePreset(preset) {
    const { from, to } = presetToDates(preset)
    setPeriod((p) => ({ ...p, preset, from, to }))
  }

  function handleFrom(e) {
    setPeriod((p) => ({ ...p, preset: 'custom', from: e.target.value }))
  }

  function handleTo(e) {
    setPeriod((p) => ({ ...p, preset: 'custom', to: e.target.value }))
  }

  function handleHours(val) {
    setPeriod((p) => ({ ...p, hours: val }))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs hover:border-primary transition-colors"
          aria-label={`Период: ${presetLabel(period.preset)}, ${rangeText(period)}`}
        >
          <Calendar size={12} className="text-muted-foreground" />
          <span className="bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-semibold">
            {presetLabel(period.preset)}
          </span>
          <span className="text-muted-foreground">{rangeText(period)}</span>
          <ChevronDown size={12} className="text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px]" align="end">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Период</p>
            <div className="flex gap-2 flex-wrap">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePreset(p.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    period.preset === p.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-foreground hover:border-primary'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Даты</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={period.from}
                max={period.to}
                onChange={handleFrom}
                className="border border-border rounded-md px-2 py-1 text-xs bg-card text-foreground"
                aria-label="Начало периода"
              />
              <span className="text-muted-foreground text-xs">—</span>
              <input
                type="date"
                value={period.to}
                min={period.from}
                onChange={handleTo}
                className="border border-border rounded-md px-2 py-1 text-xs bg-card text-foreground"
                aria-label="Конец периода"
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">
                Часы: {String(period.hours[0]).padStart(2, '0')}:00 — {String(period.hours[1]).padStart(2, '0')}:00
              </p>
              {(period.hours[0] !== 0 || period.hours[1] !== 23) && (
                <button
                  type="button"
                  onClick={() => handleHours([0, 23])}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Сбросить
                </button>
              )}
            </div>
            <div className="px-1">
              <Slider range min={0} max={23} value={period.hours} onChange={handleHours} />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm test -- --run src/components/dashboard/DateSelector.test.jsx
```
Expected: 3 passed.

If popover-test fails because shadcn Popover requires special test setup (some Base UI primitives need `pointer-events` polyfills or a portal target), add to test file at top before render calls:
```jsx
beforeEach(() => {
  // Some Popover implementations rely on document.elementFromPoint
  if (!document.elementFromPoint) document.elementFromPoint = () => null
})
```

- [ ] **Step 5: Verify build**

```bash
npx vite build
```
Expected: clean.

#### Task 1b.4 — Stage 1b commit

- [ ] **Step 1: Run all tests + build**

```bash
npm test -- --run
npx vite build
```
Expected: 191 (after Stage 1a) + 9 (DashboardPeriodProvider tests) + 3 (DateSelector tests) = **203 passed**, build clean.

- [ ] **Step 2: Stage and commit**

```bash
git add src/components/ui/popover.jsx src/components/dashboard/DashboardPeriodProvider.jsx src/components/dashboard/DashboardPeriodProvider.test.jsx src/components/dashboard/DateSelector.jsx src/components/dashboard/DateSelector.test.jsx
git status
git commit -m "feat(dashboard): period context + DateSelector + popover (Subplan 6A3 Stage 1b)

- Install shadcn <Popover> primitive (src/components/ui/popover.jsx).
- New DashboardPeriodProvider with default {preset:'today', hours:[0,23]}.
- useDashboardPeriod() hook (throws when outside provider).
- derivePreviousPeriod helper:
    today → yesterday
    yesterday → day-before
    week → previous 7-day window
    month → equal-length window before
    custom → N days immediately before
  hours preserved unchanged for fair comparison.
- <DateSelector> pill (preset badge + range text + chevron) + popover with
  3 sections: presets / dates (native <input type='date'>) / hour range
  (rc-slider, already in deps).
- 12 new tests (9 provider + 3 selector)."
```

**Definition of done — Stage 1b:**
- shadcn Popover installed.
- DashboardPeriodProvider + useDashboardPeriod + derivePreviousPeriod exported.
- DateSelector renders pill + functional popover.
- 203 tests pass, build clean.
- 1 commit.

---

### Stage 2 — `<Section>` + `<SubSection>` + base `<KpiCard>`

**Цель:** Build dashboard primitives. `<Section>` is collapsible (localStorage persisted); `<SubSection>` is a non-collapsible logical group with its own header. `<KpiCard>` is the base card per D-12 hybrid contract.

#### Task 2.1 — Create `<Section>` + `<SubSection>` (TDD)

**Files:**
- Create: `src/components/dashboard/Section.jsx`
- Create: `src/components/dashboard/Section.test.jsx`

- [ ] **Step 1: Write the failing test**

Write to `src/components/dashboard/Section.test.jsx`:

```jsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Section, SubSection } from './Section.jsx'

describe('<Section>', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders title, actions, and children when expanded', () => {
    render(
      <Section id="t1" title="Аналитика" actions={<button>Refresh</button>}>
        <p data-testid="body">Body</p>
      </Section>,
    )
    expect(screen.getByText('Аналитика')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
    expect(screen.getByTestId('body')).toBeInTheDocument()
  })

  it('collapses children when toggle clicked, persists state to localStorage', () => {
    render(
      <Section id="t2" title="Section">
        <p data-testid="body">Body</p>
      </Section>,
    )
    expect(screen.getByTestId('body')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Section/ }))
    expect(screen.queryByTestId('body')).toBeNull()
    expect(localStorage.getItem('dashboard.section.t2.expanded')).toBe('false')
  })

  it('restores collapsed state from localStorage on mount', () => {
    localStorage.setItem('dashboard.section.t3.expanded', 'false')
    render(
      <Section id="t3" title="Section">
        <p data-testid="body">Body</p>
      </Section>,
    )
    expect(screen.queryByTestId('body')).toBeNull()
  })

  it('default expanded=true when no localStorage entry', () => {
    render(
      <Section id="t4" title="Section">
        <p data-testid="body">Body</p>
      </Section>,
    )
    expect(screen.getByTestId('body')).toBeInTheDocument()
  })
})

describe('<SubSection>', () => {
  it('renders title and children (no collapse, no localStorage)', () => {
    render(
      <SubSection title="Производительность">
        <p data-testid="body">Body</p>
      </SubSection>,
    )
    expect(screen.getByText('Производительность')).toBeInTheDocument()
    expect(screen.getByTestId('body')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm test -- --run src/components/dashboard/Section.test.jsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write to `src/components/dashboard/Section.jsx`:

```jsx
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

function useLocalStorageBool(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return defaultValue
      return raw === 'true'
    } catch {
      return defaultValue
    }
  })
  const set = (v) => {
    setValue(v)
    try {
      localStorage.setItem(key, String(v))
    } catch {
      /* swallow quota/disabled */
    }
  }
  return [value, set]
}

export function Section({ id, title, icon: Icon, actions, children }) {
  const [expanded, setExpanded] = useLocalStorageBool(`dashboard.section.${id}.expanded`, true)
  return (
    <section className="border border-border rounded-lg bg-card mb-4 overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 font-semibold text-sm text-foreground"
          aria-expanded={expanded}
        >
          {Icon && <Icon size={16} className="text-muted-foreground" />}
          <span>{title}</span>
          <ChevronDown
            size={14}
            className={`text-muted-foreground transition-transform ${expanded ? '' : '-rotate-90'}`}
          />
        </button>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      {expanded && <div className="p-4 space-y-4">{children}</div>}
    </section>
  )
}

export function SubSection({ title, children }) {
  return (
    <div className="space-y-3">
      {title && (
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
      )}
      <div>{children}</div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm test -- --run src/components/dashboard/Section.test.jsx
```
Expected: 5 passed.

#### Task 2.2 — Create base `<KpiCard>` (TDD)

**Files:**
- Create: `src/components/dashboard/KpiCard.jsx`
- Create: `src/components/dashboard/KpiCard.test.jsx`

- [ ] **Step 1: Write the failing test**

Write to `src/components/dashboard/KpiCard.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DollarSign } from 'lucide-react'
import { KpiCard } from './KpiCard.jsx'

describe('<KpiCard>', () => {
  it('renders label, value, icon, sublabel', () => {
    render(
      <KpiCard
        label="Итого"
        value="1 234 $"
        icon={DollarSign}
        sublabel="Пик: 14:00 · 412 $"
      />,
    )
    expect(screen.getByText('Итого')).toBeInTheDocument()
    expect(screen.getByText('1 234 $')).toBeInTheDocument()
    expect(screen.getByText('Пик: 14:00 · 412 $')).toBeInTheDocument()
  })

  it('renders delta with up arrow + green when direction=up', () => {
    render(<KpiCard label="X" value="42" delta={{ value: 18, direction: 'up' }} />)
    const delta = screen.getByText(/↗.*18%/)
    expect(delta).toBeInTheDocument()
    expect(delta).toHaveClass('text-green-600')
  })

  it('renders delta with down arrow + red when direction=down', () => {
    render(<KpiCard label="X" value="42" delta={{ value: 12, direction: 'down' }} />)
    const delta = screen.getByText(/↘.*12%/)
    expect(delta).toBeInTheDocument()
    expect(delta).toHaveClass('text-red-600')
  })

  it('renders delta with neutral arrow + muted when direction=neutral', () => {
    render(<KpiCard label="X" value="42" delta={{ value: 0, direction: 'neutral' }} />)
    expect(screen.getByText(/→.*0%/)).toBeInTheDocument()
  })

  it('omits delta when delta prop not provided', () => {
    render(<KpiCard label="X" value="42" />)
    expect(screen.queryByText(/↗|↘|→/)).toBeNull()
  })

  it('applies accent border when accentColor=blue', () => {
    const { container } = render(<KpiCard label="X" value="42" accentColor="blue" />)
    const article = container.querySelector('article')
    expect(article.className).toMatch(/border-l-blue-500/)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm test -- --run src/components/dashboard/KpiCard.test.jsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write to `src/components/dashboard/KpiCard.jsx`:

```jsx
const ACCENT_BORDER = {
  blue: 'border-l-[3px] border-l-blue-500',
  green: 'border-l-[3px] border-l-green-500',
  purple: 'border-l-[3px] border-l-purple-500',
  orange: 'border-l-[3px] border-l-orange-500',
  red: 'border-l-[3px] border-l-red-500',
}

const DELTA_CLASS = {
  up: 'text-green-600',
  down: 'text-red-600',
  neutral: 'text-muted-foreground',
}

const DELTA_ARROW = {
  up: '↗',
  down: '↘',
  neutral: '→',
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  sublabel,
  delta,
  accentColor,
  sparkline, // reserved — render only if real time-series data passed; no Sparkline component yet
  children,
}) {
  const accentClass = accentColor ? ACCENT_BORDER[accentColor] || '' : ''
  return (
    <article className={`bg-card border border-border rounded-lg p-4 ${accentClass}`}>
      <header className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        {Icon && <Icon size={16} className="text-muted-foreground" />}
      </header>
      <div className="text-2xl font-bold mt-1 flex items-baseline gap-2 text-foreground">
        <span>{value}</span>
        {delta && (
          <span className={`text-xs font-medium ${DELTA_CLASS[delta.direction]}`}>
            {DELTA_ARROW[delta.direction]} {Math.abs(delta.value)}%
          </span>
        )}
      </div>
      {sublabel && <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>}
      {children}
    </article>
  )
}
```

Notes:
- Tailwind v4 JIT requires complete class names — `ACCENT_BORDER` map ensures `border-l-blue-500` etc. are written as literal strings.
- `sparkline` prop is accepted but ignored for 6A3 (no Sparkline implementation yet — left as opt-in slot for future enhancement).

- [ ] **Step 4: Run test to verify pass**

```bash
npm test -- --run src/components/dashboard/KpiCard.test.jsx
```
Expected: 6 passed.

#### Task 2.3 — Stage 2 commit

- [ ] **Step 1: Full test + build**

```bash
npm test -- --run
npx vite build
```
Expected: 203 + 5 (Section) + 6 (KpiCard) = **214 passed**, build clean.

- [ ] **Step 2: Stage and commit**

```bash
git add src/components/dashboard/Section.jsx src/components/dashboard/Section.test.jsx src/components/dashboard/KpiCard.jsx src/components/dashboard/KpiCard.test.jsx
git status
git commit -m "feat(dashboard): Section + SubSection + base KpiCard primitives (Subplan 6A3 Stage 2)

- <Section id title icon? actions? children> — collapsible top-level
  section with localStorage persistence (key: dashboard.section.<id>.expanded,
  default expanded). Header shows icon + title + chevron + actions slot.
- <SubSection title? children> — non-collapsible logical group with
  uppercase muted heading. No persistence.
- <KpiCard label value icon? sublabel? delta? accentColor? sparkline?
  children?> — base shared card per D-12 hybrid model.
  Tailwind v4 JIT-safe accent border via ACCENT_BORDER lookup map
  (blue/green/purple/orange/red). Delta renders ↗ ↘ → with green/red/
  muted color. Sparkline slot reserved for future opt-in.
- 11 new tests (5 Section + 6 KpiCard)."
```

**Definition of done — Stage 2:**
- Section + SubSection + KpiCard exist with tests.
- KpiCard accent borders use complete class names (Tailwind JIT-safe).
- 214 tests pass, build clean.
- 1 commit.

---

### Stage 3 — Card registry + 11 analytics cards + 2 task cards + `useDashboardData`

**Цель:** Build central data-fetching hook + card registry. Implement all 13 specific card components per spec §4. Cards are dumb props-driven components (analytics cards receive `{rows, prevRows, operatorMap, teamMap, period, loading}` from SectionAnalytics; task cards receive `{user}`). SectionAnalytics fetches data ONCE for both periods and passes down — avoids N×2 query explosion.

#### Task 3.1 — Create `useDashboardData` hook

**Files:**
- Create: `src/hooks/useDashboardData.js`

- [ ] **Step 1: Write implementation**

Write to `src/hooks/useDashboardData.js`:

```js
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const TZ = 'Europe/Kiev'
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const DATA_START = { date: '2026-04-04', hour: 0 }

/**
 * Fetches per-operator hourly revenue rows for a date range.
 * Hour-range filtering happens at consumer level (cards apply period.hours).
 *
 * @param {{from: string, to: string}} range — YYYY-MM-DD inclusive
 * @returns {{
 *   rows: Array<{refcode, h0..h23, total, noData?}>,
 *   operatorMap: Record<string, {name, shift}>,
 *   loading: boolean,
 *   error: string|null,
 *   reload: () => void,
 * }}
 */
export function useDashboardData({ from, to }) {
  const [rows, setRows] = useState([])
  const [operatorMap, setOperatorMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [version, setVersion] = useState(0)

  const fetchData = useCallback(async () => {
    if (!from || !to) return
    setLoading(true)
    setError(null)
    try {
      // Expand UTC range by ±1 day to capture rows that fall into the local TZ window
      const d1 = new Date(from + 'T00:00:00Z')
      const d2 = new Date(to + 'T00:00:00Z')
      d1.setUTCDate(d1.getUTCDate() - 1)
      d2.setUTCDate(d2.getUTCDate() + 1)
      const utcFrom = d1.toISOString().slice(0, 10)
      const utcTo = d2.toISOString().slice(0, 10)

      const [opsResult, revResult] = await Promise.all([
        supabase.from('operators').select('refcode, name, shift'),
        supabase
          .from('hourly_revenue')
          .select('refcode, date, hour, delta')
          .gte('date', utcFrom)
          .lte('date', utcTo),
      ])

      if (revResult.error) throw revResult.error
      if (opsResult.error) throw opsResult.error

      const opMap = {}
      ;(opsResult.data || []).forEach((op) => {
        opMap[op.refcode] = { name: op.name, shift: op.shift || '' }
      })

      const map = {}
      for (const row of revResult.data || []) {
        if (row.refcode?.toString().trim().toLowerCase() === 'all') continue
        // Convert UTC date+hour → local date+hour
        const utcDt = new Date(row.date + 'T00:00:00Z')
        utcDt.setUTCHours(row.hour)
        const localDt = new Date(utcDt.toLocaleString('en-US', { timeZone: TZ }))
        const localDate = localDt.toLocaleDateString('sv-SE')
        const localHour = localDt.getHours()
        if (localDate < from || localDate > to) continue
        if (localDate === DATA_START.date && localHour < DATA_START.hour) continue
        if (!map[row.refcode]) map[row.refcode] = { refcode: row.refcode }
        map[row.refcode][`h${localHour}`] = (map[row.refcode][`h${localHour}`] || 0) + Number(row.delta)
      }

      // Add operators with no revenue (noData markers)
      Object.keys(opMap).forEach((refcode) => {
        if (!map[refcode]) map[refcode] = { refcode, noData: true }
      })

      const result = Object.values(map).map((op) => {
        const total = HOURS.reduce((s, h) => s + (op[`h${h}`] || 0), 0)
        return { ...op, total }
      })

      setOperatorMap(opMap)
      setRows(result)
    } catch (e) {
      setError(e.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    fetchData()
  }, [fetchData, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  return { rows, operatorMap, loading, error, reload }
}
```

- [ ] **Step 2: Verify build (no test for hook — covered by SectionAnalytics integration smoke later)**

```bash
npx vite build
```
Expected: clean.

#### Task 3.2 — Create `cardRegistry.js` + render helper (TDD)

**Files:**
- Create: `src/components/dashboard/cardRegistry.js`
- Create: `src/components/dashboard/cardRegistry.test.jsx`

- [ ] **Step 1: Write the failing test**

Write to `src/components/dashboard/cardRegistry.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { renderCards } from './cardRegistry.js'

const FAKE_REGISTRY = [
  {
    id: 'a',
    component: function A({ x }) {
      return <div data-testid="A">A:{x}</div>
    },
    requires: 'view_all_revenue',
    props: { x: '1' },
  },
  {
    id: 'b',
    component: function B({ x }) {
      return <div data-testid="B">B:{x}</div>
    },
    requires: 'view_only_admin',
  },
  {
    id: 'c',
    component: function C() {
      return <div data-testid="C">C</div>
    },
    // no `requires` → always shown
  },
]

describe('renderCards', () => {
  it('filters cards by hasPermission', () => {
    const user = { role: 'admin', permissions: ['view_all_revenue'] }
    render(<>{renderCards(FAKE_REGISTRY, user, { x: 'shared' })}</>)
    expect(screen.getByTestId('A')).toBeInTheDocument()
    expect(screen.queryByTestId('B')).toBeNull()
    expect(screen.getByTestId('C')).toBeInTheDocument()
  })

  it('superadmin sees all cards regardless of requires', () => {
    const user = { role: 'superadmin', permissions: [] }
    render(<>{renderCards(FAKE_REGISTRY, user)}</>)
    expect(screen.getByTestId('A')).toBeInTheDocument()
    expect(screen.getByTestId('B')).toBeInTheDocument()
    expect(screen.getByTestId('C')).toBeInTheDocument()
  })

  it('passes registry props + render-time props to each component', () => {
    const user = { role: 'superadmin', permissions: [] }
    render(<>{renderCards(FAKE_REGISTRY, user, { x: 'shared' })}</>)
    // A has registry x:'1' (registry props win? render-time wins?). Per spec §3.3:
    //   <Component {...c.props} {...props} /> → render-time props OVERRIDE registry props.
    expect(screen.getByTestId('A')).toHaveTextContent('A:shared')
    // C has no registry props → gets render-time x
    expect(screen.getByTestId('C')).toHaveTextContent('C')
  })

  it('returns empty array when user has no permissions and no card has empty requires', () => {
    const user = null
    const minimal = [{ id: 'b', component: () => <div>B</div>, requires: 'view_only_admin' }]
    const out = renderCards(minimal, user)
    expect(out).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm test -- --run src/components/dashboard/cardRegistry.test.jsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write to `src/components/dashboard/cardRegistry.js`:

```js
import { hasPermission } from '../../lib/permissions.js'

import { TotalRevenueCard } from './cards/TotalRevenueCard.jsx'
import { RevenuePerHourCard } from './cards/RevenuePerHourCard.jsx'
import { LeaderCard } from './cards/LeaderCard.jsx'
import { EngagementCard } from './cards/EngagementCard.jsx'
import { ShiftCard } from './cards/ShiftCard.jsx'
import { BestShiftCard } from './cards/BestShiftCard.jsx'
import { TopTeamCard } from './cards/TopTeamCard.jsx'
import { TeamDistributionCard } from './cards/TeamDistributionCard.jsx'
import { TeamEngagementCard } from './cards/TeamEngagementCard.jsx'
import { OverdueAllCard } from './cards/OverdueAllCard.jsx'
import { OverdueOwnCard } from './cards/OverdueOwnCard.jsx'

// Performance group (4 cards)
export const PRODUCTION_CARDS = [
  { id: 'total_revenue', component: TotalRevenueCard, requires: 'view_all_revenue' },
  { id: 'revenue_per_hour', component: RevenuePerHourCard, requires: 'view_all_revenue' },
  { id: 'leader', component: LeaderCard, requires: 'view_all_revenue' },
  { id: 'engagement', component: EngagementCard, requires: 'view_all_revenue' },
]

// Shift group (4 cards)
export const SHIFT_CARDS = [
  { id: 'shift_day', component: ShiftCard, requires: 'view_all_revenue', props: { shift: 'day' } },
  { id: 'shift_evening', component: ShiftCard, requires: 'view_all_revenue', props: { shift: 'evening' } },
  { id: 'shift_night', component: ShiftCard, requires: 'view_all_revenue', props: { shift: 'night' } },
  { id: 'best_shift', component: BestShiftCard, requires: 'view_all_revenue' },
]

// Team group (3 cards)
export const TEAM_CARDS = [
  { id: 'top_team', component: TopTeamCard, requires: 'view_all_revenue' },
  { id: 'team_distribution', component: TeamDistributionCard, requires: 'view_all_revenue' },
  { id: 'team_engagement', component: TeamEngagementCard, requires: 'view_all_revenue' },
]

// Combined analytics (11 cards) — convenience for whole-section iteration
export const ANALYTICS_CARDS = [...PRODUCTION_CARDS, ...SHIFT_CARDS, ...TEAM_CARDS]

// Tasks (2 cards)
export const TASK_CARDS = [
  { id: 'overdue_all', component: OverdueAllCard, requires: 'view_all_tasks' },
  { id: 'overdue_own', component: OverdueOwnCard, requires: 'view_own_tasks' },
]

/**
 * Render a registry filtered by user permissions.
 * Render-time `props` override registry-static `c.props` (spec §3.3).
 */
export function renderCards(registry, user, props = {}) {
  return registry
    .filter((c) => !c.requires || hasPermission(user, c.requires))
    .map((c) => {
      const Component = c.component
      return <Component key={c.id} {...c.props} {...props} />
    })
}
```

Notes:
- `cardRegistry.js` re-exports from JS (not JSX) but contains JSX in `renderCards`. Vite handles `.js` files with JSX out-of-the-box because of esbuild/SWC config — but if a build error occurs ("Unexpected token <"), rename file to `cardRegistry.jsx` and update imports across stage 3. Alternative: keep registry data in `.js` and put `renderCards` in a separate `renderCards.jsx`. **Pragmatic default — use `.jsx` extension to avoid surprise:** rename file to `cardRegistry.jsx` if first test fails on JSX parse.

- [ ] **Step 4: Verify test pass — but cards don't exist yet, so individual card imports will fail**

For now, test will fail because `./cards/TotalRevenueCard.jsx` etc. don't exist. We'll create them in Tasks 3.3-3.13. To allow the registry test to run independently NOW, temporarily stub the imports — replace each `import { X } from './cards/X.jsx'` line with `const X = () => null`. Then write the actual cards in subsequent tasks and replace the stubs.

Actually simpler: write all 13 card stub files NOW (each file = one-line `export const Foo = () => null`), then flesh them out one by one. This keeps the registry test passing throughout.

- [ ] **Step 5: Create card stub files**

For each of the 11 analytics cards + 2 task cards, create a stub:

```bash
for card in TotalRevenueCard RevenuePerHourCard LeaderCard EngagementCard ShiftCard BestShiftCard TopTeamCard TeamDistributionCard TeamEngagementCard OverdueAllCard OverdueOwnCard; do
  echo "export function ${card}() { return null }" > "src/components/dashboard/cards/${card}.jsx"
done
ls src/components/dashboard/cards/
```
Expected: 11 files.

- [ ] **Step 6: Run cardRegistry test**

```bash
npm test -- --run src/components/dashboard/cardRegistry.test.jsx
```
Expected: 4 passed.

- [ ] **Step 7: Verify build**

```bash
npx vite build
```
Expected: clean.

#### Task 3.3 — Implement `TotalRevenueCard.jsx`

**Files:**
- Modify: `src/components/dashboard/cards/TotalRevenueCard.jsx`

- [ ] **Step 1: Replace stub with implementation**

Write to `src/components/dashboard/cards/TotalRevenueCard.jsx`:

```jsx
import { DollarSign } from 'lucide-react'
import { KpiCard } from '../KpiCard.jsx'

const fmt = (n) =>
  n == null
    ? '—'
    : Number(n).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })

function sumPeriod(rows, hours) {
  return rows.reduce(
    (s, op) => s + hours.reduce((hs, h) => hs + (op[`h${h}`] || 0), 0),
    0,
  )
}

export function TotalRevenueCard({ rows, prevRows, period, loading }) {
  const [hMin, hMax] = period.hours
  const hours = Array.from({ length: 24 }, (_, i) => i).filter((h) => h >= hMin && h <= hMax)

  const total = sumPeriod(rows, hours)
  const prevTotal = sumPeriod(prevRows, hours)

  // Peak hour
  const hourlyTotals = hours.map((h) => ({
    h,
    sum: rows.reduce((s, op) => s + (op[`h${h}`] || 0), 0),
  }))
  const peak = hourlyTotals.reduce((best, c) => (c.sum > best.sum ? c : best), { h: 0, sum: 0 })

  let delta
  if (prevTotal > 0) {
    const pct = Math.round(((total - prevTotal) / prevTotal) * 100)
    delta = { value: Math.abs(pct), direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral' }
  }

  return (
    <KpiCard
      label="Итого за период"
      value={loading ? '...' : `${fmt(total)} $`}
      icon={DollarSign}
      sublabel={
        peak.sum > 0 && !loading ? `Пик: ${String(peak.h).padStart(2, '0')}:00 · ${fmt(peak.sum)} $` : undefined
      }
      delta={!loading ? delta : undefined}
      accentColor="blue"
    />
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npx vite build
```
Expected: clean.

#### Task 3.4 — Implement `RevenuePerHourCard.jsx`

**Files:**
- Modify: `src/components/dashboard/cards/RevenuePerHourCard.jsx`

- [ ] **Step 1: Replace stub**

Write to `src/components/dashboard/cards/RevenuePerHourCard.jsx`:

```jsx
import { TrendingUp } from 'lucide-react'
import { KpiCard } from '../KpiCard.jsx'

const fmt = (n) =>
  n == null
    ? '—'
    : Number(n).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })

function avgPerActiveHour(rows, hours) {
  const activeHours = hours.filter((h) => rows.some((op) => (op[`h${h}`] || 0) > 0))
  if (activeHours.length === 0) return 0
  const total = rows.reduce(
    (s, op) => s + activeHours.reduce((hs, h) => hs + (op[`h${h}`] || 0), 0),
    0,
  )
  return total / activeHours.length
}

export function RevenuePerHourCard({ rows, prevRows, period, loading }) {
  const [hMin, hMax] = period.hours
  const hours = Array.from({ length: 24 }, (_, i) => i).filter((h) => h >= hMin && h <= hMax)

  const avg = avgPerActiveHour(rows, hours)
  const prevAvg = avgPerActiveHour(prevRows, hours)

  let delta
  if (prevAvg > 0) {
    const pct = Math.round(((avg - prevAvg) / prevAvg) * 100)
    delta = { value: Math.abs(pct), direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral' }
  }

  return (
    <KpiCard
      label="Выручка / час"
      value={loading ? '...' : `${fmt(avg)} $`}
      icon={TrendingUp}
      sublabel="Среднее по активным часам"
      delta={!loading ? delta : undefined}
      accentColor="green"
    />
  )
}
```

#### Task 3.5 — Implement `LeaderCard.jsx`

**Files:**
- Modify: `src/components/dashboard/cards/LeaderCard.jsx`

- [ ] **Step 1: Replace stub**

Write to `src/components/dashboard/cards/LeaderCard.jsx`:

```jsx
import { Trophy } from 'lucide-react'
import { KpiCard } from '../KpiCard.jsx'

const fmt = (n) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function LeaderCard({ rows, operatorMap, period, loading }) {
  const [hMin, hMax] = period.hours
  const hours = Array.from({ length: 24 }, (_, i) => i).filter((h) => h >= hMin && h <= hMax)

  const ranked = rows
    .map((op) => ({
      refcode: op.refcode,
      total: hours.reduce((s, h) => s + (op[`h${h}`] || 0), 0),
    }))
    .sort((a, b) => b.total - a.total)

  const leader = ranked[0]
  const name = leader && leader.total > 0 ? operatorMap[leader.refcode]?.name || leader.refcode : '—'

  return (
    <KpiCard
      label="Лидер периода"
      value={loading ? '...' : name}
      icon={Trophy}
      sublabel={leader && leader.total > 0 && !loading ? `${fmt(leader.total)} $ — топ-1` : undefined}
    />
  )
}
```

Notes:
- Per D-7, qualitative cards (Лидер = name) skip delta. No `delta` prop passed.

#### Task 3.6 — Implement `EngagementCard.jsx`

**Files:**
- Modify: `src/components/dashboard/cards/EngagementCard.jsx`

- [ ] **Step 1: Replace stub**

Write to `src/components/dashboard/cards/EngagementCard.jsx`:

```jsx
import { Users } from 'lucide-react'
import { KpiCard } from '../KpiCard.jsx'

function engagement(rows, hours) {
  const total = rows.length
  const active = rows.filter((op) => hours.some((h) => (op[`h${h}`] || 0) > 0)).length
  return { total, active, pct: total > 0 ? Math.round((active / total) * 100) : 0 }
}

export function EngagementCard({ rows, prevRows, period, loading }) {
  const [hMin, hMax] = period.hours
  const hours = Array.from({ length: 24 }, (_, i) => i).filter((h) => h >= hMin && h <= hMax)

  const { total, active, pct } = engagement(rows, hours)
  const { pct: prevPct } = engagement(prevRows, hours)

  let delta
  if (prevPct > 0) {
    const diff = pct - prevPct
    delta = { value: Math.abs(diff), direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral' }
  }

  return (
    <KpiCard
      label="Вовлечённость"
      value={loading ? '...' : `${pct}%`}
      icon={Users}
      sublabel={!loading ? `${active} из ${total} активны` : undefined}
      delta={!loading ? delta : undefined}
      accentColor="purple"
    />
  )
}
```

#### Task 3.7 — Implement `ShiftCard.jsx`

**Files:**
- Modify: `src/components/dashboard/cards/ShiftCard.jsx`

- [ ] **Step 1: Replace stub**

Write to `src/components/dashboard/cards/ShiftCard.jsx`:

```jsx
import { Clock } from 'lucide-react'
import { KpiCard } from '../KpiCard.jsx'

const fmt = (n) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const SHIFT_CONFIG = {
  day: { label: 'Дневная смена', operatorShift: 'ДНЕВНАЯ', accent: 'orange' },
  evening: { label: 'Вечерняя смена', operatorShift: 'ВЕЧЕРНЯЯ', accent: 'purple' },
  night: { label: 'Ночная смена', operatorShift: 'НОЧНАЯ', accent: 'blue' },
}

function computeShift(rows, operatorMap, hours, operatorShift) {
  const shiftRows = rows.filter((op) => operatorMap[op.refcode]?.shift === operatorShift)
  const total = shiftRows.reduce(
    (s, op) => s + hours.reduce((hs, h) => hs + (op[`h${h}`] || 0), 0),
    0,
  )
  return { total, count: shiftRows.length }
}

export function ShiftCard({ shift, rows, prevRows, operatorMap, period, loading }) {
  const cfg = SHIFT_CONFIG[shift]
  const [hMin, hMax] = period.hours
  const hours = Array.from({ length: 24 }, (_, i) => i).filter((h) => h >= hMin && h <= hMax)

  const { total, count } = computeShift(rows, operatorMap, hours, cfg.operatorShift)
  const { total: prevTotal } = computeShift(prevRows, operatorMap, hours, cfg.operatorShift)

  const grand = rows.reduce(
    (s, op) => s + hours.reduce((hs, h) => hs + (op[`h${h}`] || 0), 0),
    0,
  )
  const sharePct = grand > 0 ? Math.round((total / grand) * 100) : 0

  let delta
  if (prevTotal > 0) {
    const pct = Math.round(((total - prevTotal) / prevTotal) * 100)
    delta = { value: Math.abs(pct), direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral' }
  }

  return (
    <KpiCard
      label={cfg.label}
      value={loading ? '...' : `${fmt(total)} $`}
      icon={Clock}
      sublabel={!loading ? `${count} операторов · ${sharePct}%` : undefined}
      delta={!loading ? delta : undefined}
      accentColor={cfg.accent}
    />
  )
}
```

#### Task 3.8 — Implement `BestShiftCard.jsx`

**Files:**
- Modify: `src/components/dashboard/cards/BestShiftCard.jsx`

- [ ] **Step 1: Replace stub**

Write to `src/components/dashboard/cards/BestShiftCard.jsx`:

```jsx
import { Crown } from 'lucide-react'
import { KpiCard } from '../KpiCard.jsx'

const SHIFTS = ['ДНЕВНАЯ', 'ВЕЧЕРНЯЯ', 'НОЧНАЯ']
const DISPLAY = { ДНЕВНАЯ: 'Дневная', ВЕЧЕРНЯЯ: 'Вечерняя', НОЧНАЯ: 'Ночная' }

export function BestShiftCard({ rows, operatorMap, period, loading }) {
  const [hMin, hMax] = period.hours
  const hours = Array.from({ length: 24 }, (_, i) => i).filter((h) => h >= hMin && h <= hMax)

  const totals = SHIFTS.map((shift) => {
    const shiftRows = rows.filter((op) => operatorMap[op.refcode]?.shift === shift)
    const total = shiftRows.reduce(
      (s, op) => s + hours.reduce((hs, h) => hs + (op[`h${h}`] || 0), 0),
      0,
    )
    return { shift, total }
  }).sort((a, b) => b.total - a.total)

  const best = totals[0]
  const second = totals[1]
  const value = best && best.total > 0 ? DISPLAY[best.shift] : '—'

  let sublabel
  if (best && second && best.total > 0 && second.total > 0 && !loading) {
    const diffPct = Math.round(((best.total - second.total) / second.total) * 100)
    sublabel = `+${diffPct}% к ${DISPLAY[second.shift]}`
  }

  return (
    <KpiCard label="Лучшая смена" value={loading ? '...' : value} icon={Crown} sublabel={sublabel} />
  )
}
```

#### Task 3.9 — Implement team cards (`TopTeamCard`, `TeamDistributionCard`, `TeamEngagementCard`)

**Background — team data source:**

The legacy DashboardPage doesn't fetch team data. The 6A2 codebase has `useTeamList.js` which calls RPC `list_teams(p_caller_id)` returning team rows with `id`, `name`, `lead_name`, possibly aggregate counts. To know which operators belong to which team, the codebase has `useTeamMembers.js` (RPC: probably `list_team_members(p_team_id)` or similar) — but iterating over all teams to fetch members is expensive.

**Pragmatic approach:** add a single helper hook `useTeamMembershipsMap(callerId)` that calls a single supabase query against the `team_members` (or equivalent) table to build `{operatorRefcode: teamName}`. Implementer should:

1. Open `src/hooks/useTeamMembers.js` — find the RPC name + return shape.
2. Open `src/hooks/useTeamList.js` — reference for caller_id pattern.
3. If a single query covers all teams (e.g., `supabase.from('team_members').select('team_id, operator_ref_code, teams(name)')`) — use it.
4. If not, fall back to: `useTeamList` → for each team `useTeamMembers(team.id)` → flatten to map. (Slower but correct.)

For this plan, we'll implement a **standalone helper hook** in `useDashboardData.js` next to the main hook:

- [ ] **Step 1: Extend `src/hooks/useDashboardData.js` with `useTeamMembershipsMap`**

Append to `src/hooks/useDashboardData.js`:

```js
/**
 * Builds a map: operator refcode → team name.
 *
 * IMPLEMENTATION NOTE: The exact source of truth for this mapping varies.
 * Inspect the schema by reading useTeamMembers.js / useTeamList.js. Two
 * common patterns:
 *   1. A single table `team_members` with (team_id, operator_ref_code) +
 *      a foreign-key into `teams(name)` — use one query with select join.
 *   2. RPC `list_teams` + per-team `list_team_members` — fan-out + flatten.
 *
 * Until the implementer wires this up, this stub returns {} so team cards
 * gracefully render «—» / empty list. Full impl is acceptance criterion.
 */
export function useTeamMembershipsMap(callerId) {
  const [teamMap, setTeamMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (callerId == null) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    // TODO[6A3]: Replace with real query. Verify schema via useTeamMembers.js.
    // Example single-query shape:
    //   supabase
    //     .from('team_members')
    //     .select('operator_ref_code, teams(name)')
    //     .then(({ data, error }) => { ... })
    // Build: data.forEach(r => map[r.operator_ref_code] = r.teams.name)
    //
    // Fallback (works without schema knowledge): leave map empty — team cards
    // render «—» which is acceptable for 6A3 MVP shipping.

    Promise.resolve()
      .then(() => {
        if (cancelled) return
        setTeamMap({})
        setLoading(false)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [callerId])

  return { teamMap, loading, error }
}
```

The implementer is expected to wire the real query during this task. If schema introspection reveals the simple single-query pattern, replace the stub `Promise.resolve().then(...)` block with the real `supabase.from(...)` call. If schema introspection reveals a fan-out pattern is needed, document it in the implementation comment and implement it.

If schema introspection is impossible without DB access (the case for an isolated agent), the stub-empty-map fallback is **acceptable for 6A3 MVP** — team cards will render «—» and zero values, which is an expected degraded state. Mark as a follow-up issue.

- [ ] **Step 2: Implement `TopTeamCard.jsx`**

Write to `src/components/dashboard/cards/TopTeamCard.jsx`:

```jsx
import { Trophy } from 'lucide-react'
import { KpiCard } from '../KpiCard.jsx'

const fmt = (n) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function aggregateTeams(rows, teamMap, hours) {
  const teamTotals = {}
  for (const op of rows) {
    const team = teamMap[op.refcode]
    if (!team) continue
    const opTotal = hours.reduce((s, h) => s + (op[`h${h}`] || 0), 0)
    if (!teamTotals[team]) teamTotals[team] = { team, total: 0, count: 0 }
    teamTotals[team].total += opTotal
    teamTotals[team].count += 1
  }
  return Object.values(teamTotals).sort((a, b) => b.total - a.total)
}

export function TopTeamCard({ rows, prevRows, teamMap, period, loading }) {
  const [hMin, hMax] = period.hours
  const hours = Array.from({ length: 24 }, (_, i) => i).filter((h) => h >= hMin && h <= hMax)

  const teams = aggregateTeams(rows, teamMap, hours)
  const top = teams[0]
  const prevTeams = aggregateTeams(prevRows, teamMap, hours)
  const prevSame = top ? prevTeams.find((t) => t.team === top.team) : null

  let delta
  if (top && prevSame && prevSame.total > 0) {
    const pct = Math.round(((top.total - prevSame.total) / prevSame.total) * 100)
    delta = { value: Math.abs(pct), direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral' }
  }

  const value = top && top.total > 0 ? top.team : '—'
  const sublabel =
    top && top.total > 0 && !loading ? `${fmt(top.total)} $ · ${top.count} операторов` : undefined

  return (
    <KpiCard
      label="Лидер команды"
      value={loading ? '...' : value}
      icon={Trophy}
      sublabel={sublabel}
      delta={!loading ? delta : undefined}
    />
  )
}
```

- [ ] **Step 3: Implement `TeamDistributionCard.jsx` (specialized wrapper, no base KpiCard)**

Write to `src/components/dashboard/cards/TeamDistributionCard.jsx`:

```jsx
import { Layers } from 'lucide-react'

const fmt = (n) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export function TeamDistributionCard({ rows, teamMap, period, loading }) {
  const [hMin, hMax] = period.hours
  const hours = Array.from({ length: 24 }, (_, i) => i).filter((h) => h >= hMin && h <= hMax)

  const teamTotals = {}
  for (const op of rows) {
    const team = teamMap[op.refcode]
    if (!team) continue
    const opTotal = hours.reduce((s, h) => s + (op[`h${h}`] || 0), 0)
    teamTotals[team] = (teamTotals[team] || 0) + opTotal
  }
  const sorted = Object.entries(teamTotals)
    .map(([team, total]) => ({ team, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
  const grand = sorted.reduce((s, t) => s + t.total, 0)

  return (
    <article className="bg-card border border-border rounded-lg p-4">
      <header className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground font-medium">Распределение по командам</span>
        <Layers size={16} className="text-muted-foreground" />
      </header>
      {loading ? (
        <p className="text-sm text-muted-foreground">...</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">Нет данных</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((t) => {
            const pct = grand > 0 ? Math.round((t.total / grand) * 100) : 0
            return (
              <li key={t.team} className="flex items-center gap-2 text-xs">
                <span className="w-24 truncate text-foreground">{t.team}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-12 text-right font-medium text-foreground">{fmt(t.total)} $</span>
                <span className="w-8 text-right text-muted-foreground">{pct}%</span>
              </li>
            )
          })}
        </ul>
      )}
    </article>
  )
}
```

- [ ] **Step 4: Implement `TeamEngagementCard.jsx`**

Write to `src/components/dashboard/cards/TeamEngagementCard.jsx`:

```jsx
import { Users } from 'lucide-react'
import { KpiCard } from '../KpiCard.jsx'

export function TeamEngagementCard({ rows, prevRows, teamMap, period, loading }) {
  const [hMin, hMax] = period.hours
  const hours = Array.from({ length: 24 }, (_, i) => i).filter((h) => h >= hMin && h <= hMax)

  function compute(r) {
    const inTeams = r.filter((op) => teamMap[op.refcode])
    const total = inTeams.length
    const active = inTeams.filter((op) => hours.some((h) => (op[`h${h}`] || 0) > 0)).length
    return { total, active, pct: total > 0 ? Math.round((active / total) * 100) : 0 }
  }

  const { total, active, pct } = compute(rows)
  const { pct: prevPct } = compute(prevRows)

  let delta
  if (prevPct > 0) {
    const diff = pct - prevPct
    delta = { value: Math.abs(diff), direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral' }
  }

  return (
    <KpiCard
      label="Активность команд"
      value={loading ? '...' : `${pct}%`}
      icon={Users}
      sublabel={!loading ? `${active} из ${total} операторов в командах` : undefined}
      delta={!loading ? delta : undefined}
    />
  )
}
```

- [ ] **Step 5: Verify build**

```bash
npx vite build
```
Expected: clean.

#### Task 3.10 — Implement `OverdueAllCard.jsx`

**Background:** existing `useUserOverdueCount(userId)` calls RPC `count_overdue_tasks(p_caller_id: userId)`. Per spec §3.4, admin-scope (all overdue) uses `count_overdue_tasks(null)`. Implementer should verify whether passing `null` to that RPC returns the all-task count, or if a different RPC name is needed. If unclear, fall back to `useUserOverdueCount(user?.id)` for both cards (a slight redundancy but safe).

**Files:**
- Modify: `src/components/dashboard/cards/OverdueAllCard.jsx`

- [ ] **Step 1: Replace stub**

Write to `src/components/dashboard/cards/OverdueAllCard.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../supabaseClient'
import { KpiCard } from '../KpiCard.jsx'

/**
 * Admin-scope all-overdue count.
 * Uses RPC `count_overdue_tasks` with p_caller_id=null (admin-scope).
 * If the RPC rejects null at the DB level, replace with caller-id of the
 * current admin user — same effect (admin sees all per RLS).
 */
export function OverdueAllCard({ user }) {
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase
      .rpc('count_overdue_tasks', { p_caller_id: user?.id ?? null })
      .then(({ data }) => {
        if (cancelled) return
        setCount(Number(data ?? 0))
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user?.id])

  return (
    <Link to="/tasks?filter=overdue" className="block">
      <KpiCard
        label="Просрочки задач (все)"
        value={loading ? '...' : count}
        icon={AlertTriangle}
        sublabel="→ открыть список"
        accentColor={count > 0 ? 'red' : undefined}
      />
    </Link>
  )
}
```

#### Task 3.11 — Implement `OverdueOwnCard.jsx`

**Files:**
- Modify: `src/components/dashboard/cards/OverdueOwnCard.jsx`

- [ ] **Step 1: Replace stub**

Write to `src/components/dashboard/cards/OverdueOwnCard.jsx`:

```jsx
import { Inbox } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useUserOverdueCount } from '../../../hooks/useUserOverdueCount.js'
import { KpiCard } from '../KpiCard.jsx'

export function OverdueOwnCard({ user }) {
  const { count, loading } = useUserOverdueCount(user?.id ?? null)

  return (
    <Link to="/tasks" className="block">
      <KpiCard
        label="Мои просрочки"
        value={loading ? '...' : count}
        icon={Inbox}
        sublabel="→ открыть инбокс"
        accentColor={count > 0 ? 'red' : undefined}
      />
    </Link>
  )
}
```

#### Task 3.12 — Stage 3 commit

- [ ] **Step 1: Full test + build**

```bash
npm test -- --run
npx vite build
```
Expected: 214 + 4 (cardRegistry) = **218 passed**, build clean.

- [ ] **Step 2: Stage and commit**

```bash
git add src/hooks/useDashboardData.js src/components/dashboard/cardRegistry.js src/components/dashboard/cardRegistry.test.jsx src/components/dashboard/cards/
git status
git commit -m "feat(dashboard): card registry + 13 specific cards + useDashboardData (Subplan 6A3 Stage 3)

- New useDashboardData({from, to}) hook — parallel fetch of operators +
  hourly_revenue, returns {rows, operatorMap, loading, error, reload}.
  TZ conversion (UTC ↔ Europe/Kiev) preserves legacy semantics.
- New useTeamMembershipsMap(callerId) helper — returns {refcode: teamName}.
  Stub falls back to empty map; implementer wires real query against
  team_members table (verify schema via useTeamMembers.js).
- cardRegistry.js — PRODUCTION_CARDS / SHIFT_CARDS / TEAM_CARDS /
  ANALYTICS_CARDS (combined) / TASK_CARDS arrays + renderCards(registry,
  user, props). Each card declares requires permission; renderCards
  filters via hasPermission + spreads {...c.props, ...props}.
- 11 analytics cards: TotalRevenue, RevenuePerHour, Leader, Engagement,
  ShiftCard×3 (day/evening/night), BestShift, TopTeam, TeamDistribution
  (specialized wrapper, mini-bar list), TeamEngagement.
  Numeric cards compute delta vs previous period (D-7); qualitative
  (Leader, BestShift) skip delta.
- 2 task cards: OverdueAll (RPC count_overdue_tasks admin-scope, links
  to /tasks?filter=overdue), OverdueOwn (uses existing useUserOverdueCount,
  links to /tasks).
- 4 new tests (cardRegistry permission filtering + props pass-through)."
```

**Definition of done — Stage 3:**
- useDashboardData hook fetches operators + hourly_revenue.
- useTeamMembershipsMap helper exists (real impl OR documented stub).
- 13 card components implemented per spec §4.
- cardRegistry exports + renderCards work + tested.
- 218 tests pass, build clean.
- 1 commit.

---

### Stage 4 — Chart + Top operators + Hourly table

**Цель:** Port chart, top operators list, and hourly operator table from legacy `DashboardPage.jsx` into stand-alone components inside `src/components/dashboard/`. Functional parity preserved; visual repaint to DS tokens (bg-card, border-border, text-foreground/muted-foreground). Chart + Top operators sit in 2/3 + 1/3 grid (D-9). Hourly table at bottom of section.

#### Task 4.1 — Create `<RevenueByHourChart>`

**Files:**
- Create: `src/components/dashboard/RevenueByHourChart.jsx`

- [ ] **Step 1: Write implementation**

Write to `src/components/dashboard/RevenueByHourChart.jsx`:

```jsx
import { useState } from 'react'
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { BarChart3, ChevronDown } from 'lucide-react'

const fmt = (n) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function RevenueByHourChart({ rows, period }) {
  const [chartType, setChartType] = useState('bar')
  const [expanded, setExpanded] = useState(true)

  const [hMin, hMax] = period.hours
  const hours = Array.from({ length: 24 }, (_, i) => i).filter((h) => h >= hMin && h <= hMax)

  const hourlyTotals = hours
    .map((h) => ({
      hour: `${String(h).padStart(2, '0')}:00`,
      revenue: rows.reduce((s, op) => s + (op[`h${h}`] || 0), 0),
    }))
    .filter((x) => x.revenue > 0)

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const gridColor = isDark ? '#334155' : '#e2e8f0'
  const tickColor = isDark ? '#64748b' : '#94a3b8'
  const tooltipStyle = isDark
    ? { fontSize: 12, borderRadius: 10, background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' }
    : { fontSize: 12, borderRadius: 10, border: '1px solid #e2e8f0' }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between border-b border-border">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-foreground"
          aria-expanded={expanded}
        >
          <BarChart3 size={14} className="text-muted-foreground" />
          <span>Выручка по часам</span>
          <ChevronDown
            size={14}
            className={`text-muted-foreground transition-transform ${expanded ? '' : '-rotate-90'}`}
          />
        </button>
        {expanded && (
          <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
            <button
              type="button"
              onClick={() => setChartType('bar')}
              aria-label="Столбчатый график"
              className={`p-1 rounded ${chartType === 'bar' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground'}`}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <rect x="3" y="12" width="4" height="9" rx="1" />
                <rect x="10" y="7" width="4" height="14" rx="1" />
                <rect x="17" y="4" width="4" height="17" rx="1" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setChartType('area')}
              aria-label="Площадной график"
              className={`p-1 rounded ${chartType === 'area' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground'}`}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M2 20 L2 14 L7 8 L12 11 L17 5 L22 9 L22 20 Z" opacity="0.4" />
              </svg>
            </button>
          </div>
        )}
      </div>
      {expanded && (
        <div className="p-4">
          {hourlyTotals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Нет данных</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              {chartType === 'bar' ? (
                <BarChart data={hourlyTotals} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: tickColor }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0))}
                  />
                  <Tooltip
                    formatter={(v) => [`${fmt(v)} $`, 'Выручка']}
                    contentStyle={tooltipStyle}
                    cursor={{ fill: 'rgba(99, 102, 241, 0.08)' }}
                  />
                  <Bar dataKey="revenue" radius={[5, 5, 0, 0]} maxBarSize={40}>
                    {hourlyTotals.map((_, i) => (
                      <Cell key={i} fill="#6366f1" />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <AreaChart data={hourlyTotals} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="dashAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fill: tickColor }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: tickColor }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0))}
                  />
                  <Tooltip formatter={(v) => [`${fmt(v)} $`, 'Выручка']} contentStyle={tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#dashAreaGrad)"
                    dot={{ fill: '#6366f1', r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  )
}
```

#### Task 4.2 — Create `<TopOperatorsList>`

**Files:**
- Create: `src/components/dashboard/TopOperatorsList.jsx`

- [ ] **Step 1: Write implementation**

Write to `src/components/dashboard/TopOperatorsList.jsx`:

```jsx
import { useState } from 'react'
import { Trophy, Crown, Award, Medal, ChevronDown } from 'lucide-react'

const fmt = (n) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const MEDAL_BY_RANK = [Crown, Award, Medal]

export function TopOperatorsList({ rows, operatorMap, period }) {
  const [expanded, setExpanded] = useState(false)
  const [sectionExpanded, setSectionExpanded] = useState(true)

  const [hMin, hMax] = period.hours
  const hours = Array.from({ length: 24 }, (_, i) => i).filter((h) => h >= hMin && h <= hMax)

  const ranked = rows
    .map((op) => ({
      refcode: op.refcode,
      total: hours.reduce((s, h) => s + (op[`h${h}`] || 0), 0),
    }))
    .filter((op) => op.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 20)

  const visible = expanded ? ranked : ranked.slice(0, 5)
  const grand = ranked.reduce((s, op) => s + op.total, 0)

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setSectionExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between border-b border-border"
        aria-expanded={sectionExpanded}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Trophy size={14} className="text-muted-foreground" />
          <span>Топ операторов</span>
          <span className="text-xs font-normal text-muted-foreground">
            {expanded ? `все ${ranked.length}` : `топ-5 из ${ranked.length}`}
          </span>
        </div>
        <ChevronDown
          size={14}
          className={`text-muted-foreground transition-transform ${sectionExpanded ? '' : '-rotate-90'}`}
        />
      </button>
      {sectionExpanded && (
        <div className="p-3 space-y-2">
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Нет данных</p>
          ) : (
            visible.map((op, i) => {
              const pct = grand > 0 ? (op.total / grand) * 100 : 0
              const Medal = MEDAL_BY_RANK[i]
              const name = operatorMap[op.refcode]?.name || op.refcode
              const shift = operatorMap[op.refcode]?.shift
              return (
                <div key={op.refcode} className="flex items-center gap-2 text-xs">
                  <span className="w-6 flex items-center justify-center">
                    {Medal ? (
                      <Medal size={14} className="text-amber-500" />
                    ) : (
                      <span className="font-mono text-muted-foreground">#{i + 1}</span>
                    )}
                  </span>
                  <div className="w-28 min-w-0">
                    <p className="text-foreground font-medium truncate">{name}</p>
                    {shift && <p className="text-[10px] text-muted-foreground">{shift}</p>}
                  </div>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-16 text-right font-semibold text-foreground">{fmt(op.total)}</span>
                  <span className="w-8 text-right text-muted-foreground">{pct.toFixed(0)}%</span>
                </div>
              )
            })
          )}
          {ranked.length > 5 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full pt-1 text-xs text-primary hover:underline"
            >
              {expanded ? '↑ Свернуть' : `↓ Показать все ${ranked.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

#### Task 4.3 — Create `<HourlyOperatorTable>`

**Files:**
- Create: `src/components/dashboard/HourlyOperatorTable.jsx`

- [ ] **Step 1: Write implementation (port from legacy DashboardPage with DS repaint)**

Write to `src/components/dashboard/HourlyOperatorTable.jsx`:

```jsx
import { useMemo, useState } from 'react'
import { AlertTriangle, Inbox } from 'lucide-react'
import { SearchInput } from '../shell/index.js'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const TZ = 'Europe/Kiev'

const fmt = (n) =>
  n == null
    ? '—'
    : Number(n).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })

const SHIFT_BORDER = {
  ДНЕВНАЯ: 'border-l-[3px] border-l-orange-500',
  ВЕЧЕРНЯЯ: 'border-l-[3px] border-l-purple-500',
  НОЧНАЯ: 'border-l-[3px] border-l-blue-500',
}

const SHIFT_DOT = {
  ДНЕВНАЯ: 'bg-orange-500',
  ВЕЧЕРНЯЯ: 'bg-purple-500',
  НОЧНАЯ: 'bg-blue-500',
}

export function HourlyOperatorTable({ rows, operatorMap, period, loading, error }) {
  const [search, setSearch] = useState('')
  const [shiftFilter, setShiftFilter] = useState('ALL')
  const [onlyActive, setOnlyActive] = useState(false)
  const [sortCol, setSortCol] = useState('total')
  const [sortDir, setSortDir] = useState('desc')

  const [hMin, hMax] = period.hours
  const visibleHours = HOURS.filter((h) => h >= hMin && h <= hMax)
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: TZ })
  const isToday = period.from === today && period.to === today
  const currentHour = new Date().getHours()
  const isFutureHour = (h) => isToday && h > currentHour

  const shifts = useMemo(() => {
    const set = new Set()
    Object.values(operatorMap).forEach((o) => {
      if (o.shift) set.add(o.shift)
    })
    return ['ALL', ...Array.from(set).sort()]
  }, [operatorMap])

  const getName = (rc) => operatorMap[rc]?.name || rc
  const getShift = (rc) => operatorMap[rc]?.shift || ''

  const rowsInRange = useMemo(
    () =>
      rows.map((op) => ({
        ...op,
        rangeTotal: visibleHours.reduce((s, h) => s + (op[`h${h}`] || 0), 0),
      })),
    [rows, visibleHours],
  )

  const filtered = rowsInRange
    .filter((op) => shiftFilter === 'ALL' || getShift(op.refcode) === shiftFilter)
    .filter((op) => !onlyActive || op.rangeTotal > 0)
    .filter((op) => {
      if (!search) return true
      const q = search.toLowerCase()
      return getName(op.refcode).toLowerCase().includes(q) || op.refcode.toLowerCase().includes(q)
    })

  const sorted = useMemo(() => {
    const list = [...filtered]
    list.sort((a, b) => {
      if (sortCol === 'name') {
        const an = getName(a.refcode)
        const bn = getName(b.refcode)
        return sortDir === 'desc' ? bn.localeCompare(an, 'uk') : an.localeCompare(bn, 'uk')
      }
      const aVal = sortCol === 'total' ? a.rangeTotal ?? 0 : a[sortCol] ?? 0
      const bVal = sortCol === 'total' ? b.rangeTotal ?? 0 : b[sortCol] ?? 0
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal
    })
    return list
  }, [filtered, sortCol, sortDir, operatorMap])

  const grand = filtered.reduce((s, op) => s + op.rangeTotal, 0)

  function handleSort(col) {
    if (sortCol === col) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-foreground mr-auto">Почасовая таблица операторов</h3>
        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
          {sorted.length} операторов
        </span>
      </div>
      <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-3">
        <div className="w-56">
          <SearchInput
            placeholder="Поиск оператора…"
            value={search}
            onChange={setSearch}
            ariaLabel="Поиск оператора"
          />
        </div>
        {shifts.length > 1 &&
          shifts.map((s) => {
            const active = shiftFilter === s
            return (
              <button
                key={s}
                type="button"
                onClick={() => setShiftFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  active ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground hover:border-primary'
                }`}
              >
                {s === 'ALL' ? 'Все смены' : s}
              </button>
            )
          })}
        <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none ml-auto">
          <input
            type="checkbox"
            checked={onlyActive}
            onChange={(e) => setOnlyActive(e.target.checked)}
            className="accent-primary"
          />
          Только активные
        </label>
      </div>
      {loading ? (
        <div className="p-12 text-center text-sm text-muted-foreground">Загрузка…</div>
      ) : error ? (
        <div className="p-12 text-center">
          <AlertTriangle size={28} className="mx-auto mb-2 text-orange-500" />
          <p className="text-sm text-red-500">{error}</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="p-12 text-center">
          <Inbox size={28} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Нет данных</p>
        </div>
      ) : (
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th
                  className="sticky left-0 top-0 z-30 bg-muted/50 px-3 py-2 text-left font-semibold text-foreground cursor-pointer whitespace-nowrap select-none"
                  onClick={() => handleSort('name')}
                >
                  Оператор {sortCol === 'name' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                </th>
                <th
                  className="sticky top-0 z-20 px-3 py-2 text-right font-bold text-primary cursor-pointer bg-muted whitespace-nowrap select-none border-r border-border"
                  onClick={() => handleSort('total')}
                >
                  Итого {sortCol === 'total' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                </th>
                {visibleHours.map((h) => (
                  <th
                    key={h}
                    className="sticky top-0 z-20 px-2 py-2 text-center font-medium text-muted-foreground cursor-pointer whitespace-nowrap select-none bg-muted/50"
                    onClick={() => handleSort(`h${h}`)}
                  >
                    {String(h).padStart(2, '0')}:00
                    {sortCol === `h${h}` ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                ))}
              </tr>
              <tr className="bg-primary/10 border-b border-border">
                <td className="sticky left-0 z-20 bg-primary/10 px-3 py-2 font-bold text-primary whitespace-nowrap">
                  ИТОГО
                </td>
                <td className="sticky z-10 px-3 py-2 text-right font-bold text-primary bg-primary/15 whitespace-nowrap border-r border-border">
                  {fmt(grand)}
                </td>
                {visibleHours.map((h) => {
                  const sum = filtered.reduce((s, op) => s + (op[`h${h}`] || 0), 0)
                  return (
                    <td
                      key={h}
                      className={`px-2 py-2 text-center font-semibold whitespace-nowrap ${
                        isFutureHour(h)
                          ? 'bg-muted/30 text-muted-foreground'
                          : sum > 0
                            ? 'bg-primary/10 text-primary'
                            : 'bg-primary/5 text-muted-foreground'
                      }`}
                    >
                      {isFutureHour(h) ? '' : sum > 0 ? fmt(sum) : ''}
                    </td>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((op, idx) => {
                const name = getName(op.refcode)
                const shift = getShift(op.refcode)
                const isZero = op.noData || op.rangeTotal === 0
                const borderClass = SHIFT_BORDER[shift] || ''
                const dotClass = SHIFT_DOT[shift]
                return (
                  <tr
                    key={op.refcode}
                    className={`border-b border-border hover:bg-muted/30 transition-colors ${
                      isZero ? 'opacity-50' : idx % 2 === 1 ? 'bg-muted/20' : ''
                    }`}
                  >
                    <td className={`sticky left-0 bg-card px-3 py-2 whitespace-nowrap ${borderClass}`}>
                      <div className="flex items-center gap-2">
                        {dotClass && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />}
                        <span className="font-medium text-foreground">{name}</span>
                      </div>
                      {shift && <span className="text-[10px] text-muted-foreground ml-4">{shift}</span>}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-bold whitespace-nowrap border-r border-border ${
                        op.rangeTotal > 0 ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400' : 'text-muted-foreground'
                      }`}
                    >
                      {isZero ? '—' : fmt(op.rangeTotal)}
                    </td>
                    {visibleHours.map((h) => {
                      const val = op[`h${h}`]
                      const hasRevenue = val != null && val > 0
                      return (
                        <td
                          key={h}
                          className={`px-2 py-2 text-center whitespace-nowrap ${
                            isFutureHour(h)
                              ? 'bg-muted/30 text-muted-foreground'
                              : hasRevenue
                                ? 'text-green-700 dark:text-green-400 font-medium'
                                : 'text-muted-foreground'
                          }`}
                        >
                          {isFutureHour(h) ? '' : val != null ? fmt(val) : '—'}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

Notes:
- Reuses `SearchInput` from shell (extracted in 6A2).
- Functional parity preserved: search + shift filter pills + only-active toggle + sort by name/total/individual hour.
- Visual repaint: bg-card, border-border, bg-muted, text-foreground, text-primary etc. instead of literal slate/indigo classes.
- Future-hour detection still works (greys out hours past current local time when viewing today).

#### Task 4.4 — Stage 4 commit

- [ ] **Step 1: Build check**

```bash
npx vite build
```
Expected: clean (no tests added in Stage 4 — components are integration-tested via Stage 5 visual smoke).

- [ ] **Step 2: Run all tests (regression check)**

```bash
npm test -- --run
```
Expected: 218 still passing.

- [ ] **Step 3: Stage and commit**

```bash
git add src/components/dashboard/RevenueByHourChart.jsx src/components/dashboard/TopOperatorsList.jsx src/components/dashboard/HourlyOperatorTable.jsx
git status
git commit -m "feat(dashboard): chart + top operators + hourly table (Subplan 6A3 Stage 4)

- <RevenueByHourChart rows period> — recharts BarChart/AreaChart with
  toggle (D-9 left side of 2/3+1/3 grid). Collapsible header.
- <TopOperatorsList rows operatorMap period> — top-5 default, expand to
  top-20 (D-9 right side). Lucide medals (Crown/Award/Medal) for ranks
  1-3, #N text for ranks 4+ (D-18 placeholder; user-supplied custom SVG
  via separate mini-PR later).
- <HourlyOperatorTable rows operatorMap period loading error> —
  preserved functionally per D-10 (search + shift pills + only-active
  toggle + sort). Visual repaint to DS tokens (bg-card, border-border,
  text-foreground, text-primary; shift accent strips: orange/purple/blue
  via complete Tailwind classes for JIT).
- Reuses shell <SearchInput> for table search input.
- Future-hour detection (today + h > current local hour) preserved."
```

**Definition of done — Stage 4:**
- 3 chart/list/table components exist.
- Build clean, all 218 prior tests still pass.
- 1 commit.

---

### Stage 5 — Wire DashboardPage + UserMenuDropdown theme + delete legacy + push + PR

**Цель:** Compose final `DashboardPage.jsx` from sections. Build `<SectionAnalytics>` (period provider + data fetch + sub-sections + chart row + table) and `<SectionTasks>` (task cards). Extract `useTheme` hook. Extend `UserMenuDropdown` with theme submenu. Delete legacy 742-line DashboardPage content (replace with new). Final smoke + push + PR.

#### Task 5.1 — Extract `useTheme` hook from legacy DashboardPage

**Files:**
- Create: `src/hooks/useTheme.js`

- [ ] **Step 1: Write implementation**

Write to `src/hooks/useTheme.js`:

```js
import { useEffect, useState } from 'react'

/**
 * Theme switcher state — system / light / dark.
 * Persists choice to localStorage.theme. System mode tracks
 * prefers-color-scheme and live-updates on OS change.
 */
export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('theme') || 'system'
    } catch {
      return 'system'
    }
  })

  useEffect(() => {
    const root = document.documentElement
    const apply = (isDark) => root.classList.toggle('dark', isDark)
    try {
      localStorage.setItem('theme', theme)
    } catch {
      /* swallow */
    }

    if (theme === 'dark') {
      apply(true)
      return
    }
    if (theme === 'light') {
      apply(false)
      return
    }
    // system
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    apply(mq.matches)
    const handler = (e) => apply(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return [theme, setTheme]
}
```

#### Task 5.2 — Extend `UserMenuDropdown` with theme submenu (TDD)

**Files:**
- Modify: `src/components/shell/UserMenuDropdown.jsx`
- Modify: `src/components/shell/UserMenuDropdown.test.jsx`

- [ ] **Step 1: Read current test to understand existing assertions**

```bash
cat src/components/shell/UserMenuDropdown.test.jsx
```

Note existing passing test count (likely 2-3 cases).

- [ ] **Step 2: Append theme submenu tests to UserMenuDropdown.test.jsx**

Append to `src/components/shell/UserMenuDropdown.test.jsx` inside the existing `describe` block:

```jsx
  it('renders theme menu items (Системная / Светлая / Тёмная)', async () => {
    const user = { alias: 'Test', email: 't@e' }
    const { default: userEvent } = await import('@testing-library/user-event')
    const ue = userEvent.setup()
    render(<UserMenuDropdown user={user} onLogout={() => {}} />)
    await ue.click(screen.getByLabelText('Меню пользователя'))
    expect(screen.getByText('Системная')).toBeInTheDocument()
    expect(screen.getByText('Светлая')).toBeInTheDocument()
    expect(screen.getByText('Тёмная')).toBeInTheDocument()
  })

  it('clicking theme item writes localStorage.theme', async () => {
    localStorage.clear()
    const user = { alias: 'Test', email: 't@e' }
    const { default: userEvent } = await import('@testing-library/user-event')
    const ue = userEvent.setup()
    render(<UserMenuDropdown user={user} onLogout={() => {}} />)
    await ue.click(screen.getByLabelText('Меню пользователя'))
    await ue.click(screen.getByText('Тёмная'))
    expect(localStorage.getItem('theme')).toBe('dark')
  })
```

If `@testing-library/user-event` is not in package.json deps, fall back to `fireEvent.click`. (Likely installed already since other tests use it.)

- [ ] **Step 3: Update UserMenuDropdown.jsx**

Replace contents of `src/components/shell/UserMenuDropdown.jsx`:

```jsx
import { Check, Monitor, Sun, Moon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from '../../hooks/useTheme.js'

const THEME_OPTIONS = [
  { id: 'system', label: 'Системная', icon: Monitor },
  { id: 'light', label: 'Светлая', icon: Sun },
  { id: 'dark', label: 'Тёмная', icon: Moon },
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

export function UserMenuDropdown({ user, onLogout }) {
  const initials = computeInitials(user)
  const displayName = user?.alias || user?.firstName || user?.email || ''
  const [theme, setTheme] = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-full" aria-label="Меню пользователя">
          <Avatar className="h-9 w-9">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="min-w-[200px]">
        <div className="px-2 py-1.5">
          <div className="text-sm font-semibold">{displayName}</div>
          {user?.role && <div className="text-xs text-muted-foreground">{user.role}</div>}
          {user?.refCode && (
            <div className="font-mono text-xs text-[var(--fg4)] mt-0.5">{user.refCode}</div>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Тема</DropdownMenuLabel>
        {THEME_OPTIONS.map((opt) => {
          const Icon = opt.icon
          const isActive = theme === opt.id
          return (
            <DropdownMenuItem
              key={opt.id}
              onSelect={(e) => {
                e.preventDefault()
                setTheme(opt.id)
              }}
              className="gap-2"
            >
              <Icon size={14} className="text-muted-foreground" />
              <span>{opt.label}</span>
              {isActive && <Check size={14} className="ml-auto text-primary" />}
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLogout}>Выйти</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 4: Run UserMenuDropdown tests**

```bash
npm test -- --run src/components/shell/UserMenuDropdown.test.jsx
```
Expected: all existing + 2 new tests pass.

If a test fails because the dropdown doesn't open via `userEvent.click`, the shadcn DropdownMenu may use a portal — assertions still work but `findByText` may need `waitFor`. Adjust by replacing direct `getByText` with `findByText` (async).

- [ ] **Step 5: Verify build**

```bash
npx vite build
```
Expected: clean.

#### Task 5.3 — Create `<SectionAnalytics>` (compose period provider + data fetch + sub-sections + chart row + table)

**Files:**
- Create: `src/components/dashboard/SectionAnalytics.jsx`

- [ ] **Step 1: Write implementation**

Write to `src/components/dashboard/SectionAnalytics.jsx`:

```jsx
import { RefreshCw } from 'lucide-react'
import { Section, SubSection } from './Section.jsx'
import {
  DashboardPeriodProvider,
  useDashboardPeriod,
} from './DashboardPeriodProvider.jsx'
import { DateSelector } from './DateSelector.jsx'
import { useDashboardData, useTeamMembershipsMap } from '../../hooks/useDashboardData.js'
import {
  PRODUCTION_CARDS,
  SHIFT_CARDS,
  TEAM_CARDS,
  renderCards,
} from './cardRegistry.js'
import { RevenueByHourChart } from './RevenueByHourChart.jsx'
import { TopOperatorsList } from './TopOperatorsList.jsx'
import { HourlyOperatorTable } from './HourlyOperatorTable.jsx'

function SectionAnalyticsInner({ user }) {
  const { period, previousPeriod } = useDashboardPeriod()
  const { rows, operatorMap, loading, error, reload } = useDashboardData({
    from: period.from,
    to: period.to,
  })
  const { rows: prevRows } = useDashboardData({
    from: previousPeriod.from,
    to: previousPeriod.to,
  })
  const { teamMap } = useTeamMembershipsMap(user?.id)

  const cardProps = { rows, prevRows, operatorMap, teamMap, period, loading }

  const productionRendered = renderCards(PRODUCTION_CARDS, user, cardProps)
  const shiftRendered = renderCards(SHIFT_CARDS, user, cardProps)
  const teamRendered = renderCards(TEAM_CARDS, user, cardProps)

  const anyAnalyticsVisible =
    productionRendered.length > 0 || shiftRendered.length > 0 || teamRendered.length > 0

  const actions = (
    <>
      <DateSelector />
      <button
        type="button"
        onClick={reload}
        disabled={loading}
        aria-label="Обновить данные"
        className="p-1.5 rounded-md border border-border text-muted-foreground hover:border-primary hover:text-foreground transition-colors disabled:opacity-50"
      >
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
      </button>
    </>
  )

  return (
    <Section id="analytics" title="Аналитика периода" actions={actions}>
      {!anyAnalyticsVisible ? (
        <p className="text-sm text-muted-foreground">Нет данных по вашим правам</p>
      ) : (
        <>
          {productionRendered.length > 0 && (
            <SubSection title="Производительность">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{productionRendered}</div>
            </SubSection>
          )}
          {shiftRendered.length > 0 && (
            <SubSection title="По сменам">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{shiftRendered}</div>
            </SubSection>
          )}
          {teamRendered.length > 0 && (
            <SubSection title="По командам">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">{teamRendered}</div>
            </SubSection>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2">
              <RevenueByHourChart rows={rows} period={period} />
            </div>
            <div>
              <TopOperatorsList rows={rows} operatorMap={operatorMap} period={period} />
            </div>
          </div>
          <HourlyOperatorTable
            rows={rows}
            operatorMap={operatorMap}
            period={period}
            loading={loading}
            error={error}
          />
        </>
      )}
    </Section>
  )
}

export function SectionAnalytics({ user }) {
  return (
    <DashboardPeriodProvider>
      <SectionAnalyticsInner user={user} />
    </DashboardPeriodProvider>
  )
}
```

#### Task 5.4 — Create `<SectionTasks>`

**Files:**
- Create: `src/components/dashboard/SectionTasks.jsx`

- [ ] **Step 1: Write implementation**

Write to `src/components/dashboard/SectionTasks.jsx`:

```jsx
import { Section, SubSection } from './Section.jsx'
import { TASK_CARDS, renderCards } from './cardRegistry.js'

export function SectionTasks({ user }) {
  const rendered = renderCards(TASK_CARDS, user, { user })
  if (rendered.length === 0) return null
  return (
    <Section id="tasks" title="Задачи">
      <SubSection>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{rendered}</div>
      </SubSection>
    </Section>
  )
}
```

#### Task 5.5 — Rewrite `DashboardPage.jsx`

**Files:**
- Modify: `src/pages/DashboardPage.jsx`

- [ ] **Step 1: Replace contents (legacy 742 lines → new ~30 lines)**

Write to `src/pages/DashboardPage.jsx`:

```jsx
import { useAuth } from '../useAuth'
import { SectionAnalytics } from '../components/dashboard/SectionAnalytics.jsx'
import { SectionTasks } from '../components/dashboard/SectionTasks.jsx'

export function DashboardPage() {
  const { user } = useAuth()
  return (
    <div className="p-4 md:p-6 max-w-screen-2xl mx-auto">
      <SectionAnalytics user={user} />
      <SectionTasks user={user} />
    </div>
  )
}
```

Notes:
- All complexity (period state, data fetch, chart, table, theme switcher, TZ selector, filter toolbar) has been moved to dedicated dashboard components or removed (TZ selector hardcoded to Europe/Kiev per D-13; theme moved to UserMenuDropdown per D-15).
- Page-level wrapper just composes 2 sections.

- [ ] **Step 2: Verify build**

```bash
npx vite build
```
Expected: clean.

#### Task 5.6 — Final test + visual smoke

- [ ] **Step 1: Run full suite**

```bash
npm test -- --run
```
Expected: 218 (after Stage 3) + ~2 (UserMenuDropdown theme tests) = **~220 passed** (close to spec target of 213; difference acceptable — spec is approximate).

If the count materially differs (more than ±5), investigate before proceeding.

- [ ] **Step 2: Build clean**

```bash
npx vite build
```
Expected: clean (only pre-existing chunk-size warning).

- [ ] **Step 3: Dev smoke (admin)**

```bash
npm run dev &
sleep 3
```

Open browser at `http://localhost:5173`:
- Login as admin user (with `view_all_revenue` + `view_all_tasks`).
- Verify on `/`:
  - No shell header bar — content starts immediately below shell rail.
  - Section «Аналитика периода» renders with chevron + DateSelector pill (top-right) + refresh icon.
  - SubSection «Производительность» renders 4 cards (Итого / Выручка/час / Лидер / Вовлечённость) with values + delta arrows on numeric ones.
  - SubSection «По сменам» renders 4 cards (Дневная / Вечерняя / Ночная / Лучшая смена).
  - SubSection «По командам» renders 3 cards. (TeamDistributionCard may show empty list / «—» if useTeamMembershipsMap stub returns empty — known degraded state for 6A3 MVP if not wired.)
  - Chart + Top operators in 2/3 + 1/3 grid below.
  - Hourly table at bottom with search / shift filter pills / only-active toggle / sort.
  - Section «Задачи» renders «Просрочки задач (все)» card linking to `/tasks?filter=overdue`.
- Click DateSelector pill → popover opens with presets + dates + hour slider.
- Click «Вчера» preset → values re-fetch and update.
- Click section chevron → section collapses; reload page → state persists.
- Open `UserMenuDropdown` (avatar bottom-left of rail) → theme submenu shows 3 items with checkmark on active. Click «Тёмная» → entire page switches to dark mode.
- Switch back to «Системная» → matches OS preference.

- [ ] **Step 4: Dev smoke (operator)**

If a non-admin operator account is available, login as operator with only `view_own_tasks`:
- `/` should show:
  - Section «Аналитика периода» renders empty state «Нет данных по вашим правам» (since no analytics permissions).
  - Section «Задачи» renders only «Мои просрочки» card (1 card).

If no operator account is configurable, skip — covered by `cardRegistry` permission filtering tests.

- [ ] **Step 5: Stop dev server**

```bash
pkill -f "vite" || true
```

#### Task 5.7 — Commit Stage 5 changes

- [ ] **Step 1: Stage and commit**

```bash
git add src/hooks/useTheme.js src/components/shell/UserMenuDropdown.jsx src/components/shell/UserMenuDropdown.test.jsx src/components/dashboard/SectionAnalytics.jsx src/components/dashboard/SectionTasks.jsx src/pages/DashboardPage.jsx
git status   # confirm only these files staged
git commit -m "feat(dashboard): wire DashboardPage from sections + theme menu (Subplan 6A3 Stage 5)

- New src/hooks/useTheme.js extracted from legacy DashboardPage:
  state mirrors localStorage.theme, system mode tracks prefers-color-scheme.
- UserMenuDropdown extended with theme submenu (D-15):
  3 items (Системная / Светлая / Тёмная) with lucide icons + Check on
  active. Replaces inline ThemeSwitcher from filter toolbar.
- New <SectionAnalytics user> — wraps DashboardPeriodProvider + fetches
  current/previous period data ONCE + passes down to all cards as props.
  Renders 3 SubSections (Производительность / По сменам / По командам)
  via renderCards filtered by user permissions, then 2/3+1/3 chart row,
  then hourly table. DateSelector + refresh icon in section header.
  Empty state «Нет данных по вашим правам» when zero analytics cards
  visible.
- New <SectionTasks user> — renders TASK_CARDS filtered by perms.
- src/pages/DashboardPage.jsx rewritten from 742 lines → ~12 lines.
  Composes 2 sections + max-width wrapper. All legacy state/queries/
  theme switcher/TZ selector removed (TZ hardcoded to Europe/Kiev for
  6A3 MVP per D-13; existing localStorage 'tz' value retained for
  backward-compat but not exposed in UI)."
```

#### Task 5.8 — Push branch + open PR

- [ ] **Step 1: Push**

```bash
git push -u origin feat/subplan-6a3-dashboard-rewrite
```

If push fails because the branch already exists on origin: `git fetch && git log feat/subplan-6a3-dashboard-rewrite..origin/feat/subplan-6a3-dashboard-rewrite`. If diverging — STOP, report. If local ahead and remote unchanged — `git push --force-with-lease` ONLY after user confirmation.

- [ ] **Step 2: Open PR**

```bash
gh pr create --base main --title "feat(dashboard): Subplan 6A3 — dashboard rewrite (sections + card registry + AppHeader removal)" --body "$(cat <<'EOF'
## Summary

Full rewrite of legacy 742-line \`DashboardPage.jsx\` (pre-CRM era) into section-based dashboard architecture per [Subplan 6A3 spec](docs/superpowers/specs/2026-04-26-crm-subplan-6a3-dashboard-rewrite-design.md).

1. **Stage 1a (D-14 revised, AppHeader removal)** — \`<AppHeader />\` deleted entirely; \`AppShell\` becomes single-row grid (rail + main, no header). \`AppHeader.jsx\` + \`AppHeader.test.jsx\` deleted; \`shell/index.js\` exports cleaned.
2. **Stage 1b (period foundation)** — \`DashboardPeriodProvider\` + \`useDashboardPeriod\` + \`derivePreviousPeriod\` helper. \`<DateSelector>\` pill (preset badge + range text + chevron) → popover with 3 sections (presets / native date pickers / rc-slider hour range). shadcn \`<Popover>\` installed.
3. **Stage 2 (primitives)** — \`<Section>\` (collapsible + localStorage persist) + \`<SubSection>\`. Base \`<KpiCard>\` with label / value / icon / sublabel / delta / accentColor (Tailwind v4 JIT-safe via lookup map).
4. **Stage 3 (registry + cards + data)** — \`useDashboardData({from,to})\` + \`useTeamMembershipsMap()\` hooks. \`cardRegistry.js\` with \`PRODUCTION_CARDS\` (4) / \`SHIFT_CARDS\` (4) / \`TEAM_CARDS\` (3) / \`TASK_CARDS\` (2) + \`renderCards()\` permission-gated render helper. 11 analytics cards + 2 task cards implemented per spec §4. Numeric metrics show comparison delta (D-7); qualitative (Лидер / Лучшая смена) skip delta.
5. **Stage 4 (chart + lists + table)** — \`<RevenueByHourChart>\` (recharts BarChart/AreaChart toggle) + \`<TopOperatorsList>\` (top-5 default, expand to top-20, lucide medals Crown/Award/Medal placeholder per D-18) + \`<HourlyOperatorTable>\` (functional parity with legacy: search + shift pills + only-active + sort; visual repaint to DS tokens).
6. **Stage 5 (wire + theme + cleanup)** — \`<SectionAnalytics>\` composes period provider + data fetch + sub-sections + chart row + table. \`<SectionTasks>\` composes task cards. \`useTheme\` extracted from legacy DashboardPage. \`UserMenuDropdown\` extended with theme submenu (3 items + checkmark, D-15). New \`DashboardPage.jsx\` ~12 lines composes 2 sections.

## Out of scope (deferred per spec §1)

- User customization layer (show/hide checkboxes + drag-drop reordering) → Subplan 6A4.
- Per-role dedicated dashboards (operator-personal, TL-team-scope) → separate brainstorm.
- Activity feed / Оповещения / Чат sections → architecture supports, not implemented.
- Mobile (\`<lg\` breakpoint) → Subplan 6B.
- Page-level breadcrumb component for complex sub-routes → defer until first need.
- Periodic auto-refresh polling → future.
- TZ selector UI (Settings page) → future.
- Custom medal SVGs → user-supplied mini-PR.
- Visual repaint of other pages (Clients/Teams/Tasks/Staff) → Subplan 6A4.
- AdminLayout cleanup → Subplan 7.

## Files

**Created (29):** Hooks (useTheme, useDashboardData), 1 popover primitive, 13 card components, 2 section composites (SectionAnalytics, SectionTasks), 3 chart/list/table components, 5 dashboard primitives (Provider, DateSelector, Section/SubSection, KpiCard, cardRegistry) + 5 test files.

**Modified (6):** AppShell.jsx (single-row grid), AppShell.test.jsx (remove header assertions), shell/index.js (drop AppHeader exports), UserMenuDropdown.jsx (theme submenu), UserMenuDropdown.test.jsx (theme tests), DashboardPage.jsx (full rewrite).

**Deleted (2):** AppHeader.jsx, AppHeader.test.jsx.

## Test plan

- [ ] \`npm test -- --run\` — ~220 passes (201 baseline - 10 AppHeader.test - 0 AppShell delta + 9 DashboardPeriodProvider + 3 DateSelector + 5 Section + 6 KpiCard + 4 cardRegistry + ~2 UserMenuDropdown theme).
- [ ] \`npx vite build\` — clean.
- [ ] All 8 routes render (\`/\`, \`/clients/\*\`, \`/teams/\*\`, \`/tasks/\*\`, \`/staff/\*\`, \`/notifications\`, \`/login\`).
- [ ] No shell header on any route — content starts directly below the rail.
- [ ] Dashboard \`/\` admin: ~12 cards visible (4 production + 4 shift + 3 team + 1 «Просрочки задач (все)» if perm) + chart + top operators + hourly table.
- [ ] Dashboard \`/\` operator: empty analytics section + only «Мои просрочки» card.
- [ ] DateSelector popover opens, presets switch period, hour slider updates filter.
- [ ] Section collapse persists across reload (localStorage).
- [ ] UserMenuDropdown theme submenu (System / Light / Dark) switches DS tokens.
- [ ] Light + dark mode visual integrity.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Capture PR URL**

The PR URL is printed by `gh pr create`. Report it back.

**Definition of done — Stage 5:**
- DashboardPage rewritten (~12 lines, no legacy code remains).
- SectionAnalytics + SectionTasks composed correctly.
- UserMenuDropdown has theme submenu.
- useTheme extracted to dedicated hook file.
- ~220 tests pass, build clean.
- 1 commit + push + PR opened.

---

## Acceptance criteria (post-merge — repeats spec §8)

After all 6 commits merged into `main`:

- `src/pages/DashboardPage.jsx` rewritten (~12 lines).
- `src/components/dashboard/` contains: `cardRegistry.js`, `DashboardPeriodProvider.jsx`, `DateSelector.jsx`, `Section.jsx`, `KpiCard.jsx`, `SectionAnalytics.jsx`, `SectionTasks.jsx`, `RevenueByHourChart.jsx`, `TopOperatorsList.jsx`, `HourlyOperatorTable.jsx`, plus 11 analytics + 2 task card components in `cards/`, plus 5 test files.
- `src/hooks/useDashboardData.js` (with `useTeamMembershipsMap`) + `src/hooks/useTheme.js`.
- `src/components/shell/AppHeader.jsx` + `AppHeader.test.jsx` DELETED.
- `src/components/shell/AppShell.jsx` simplified (single-row grid).
- `src/components/shell/index.js` drops `AppHeader` + `useDerivedBreadcrumb`.
- `src/components/shell/UserMenuDropdown.jsx` extended with theme submenu.
- `src/components/ui/popover.jsx` added.
- Permission-gated cards work: admin sees ~12 cards; operator with `view_own_tasks` only sees «Мои просрочки».
- Date selector at section header — period changes re-fetch + comparison delta on numeric cards.
- Sections collapsible with persisted state.
- Theme submenu in UserMenuDropdown switches DS tokens.
- ~220 tests pass.
- `npx vite build` clean.

---

## Rollback / debugging notes

- **If shadcn `popover` install fails:** the registry config in `components.json` may point to shadcnblocks Premium. Try `npx shadcn@latest add @shadcn/popover` (force base registry). If still broken, write a minimal wrapper around `@radix-ui/react-popover` directly (~30 lines) or use the existing `@base-ui-components/react/popover` if dropdown-menu uses Base UI primitives.
- **If `cardRegistry.js` JSX parse fails ("Unexpected token <"):** rename to `cardRegistry.jsx` and update all imports across stage 3.
- **If team cards render «—» / empty list:** `useTeamMembershipsMap` stub returned empty map. Inspect `src/hooks/useTeamMembers.js` schema, replace stub body with real query (see Task 3.9 implementation note).
- **If `Popover` test fails on `pointerEvents`:** add `document.elementFromPoint = () => null` polyfill in test setup.
- **If `useTheme` test fails because module wraps `matchMedia`:** mock via `vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))` in test setup.
- **If after AppHeader removal a page suddenly looks unbordered/headerless:** that's expected — pages that previously relied on shell header for visual chrome (none currently — Dashboard had its own toolbar; Clients/Teams/Tasks/Staff use MasterDetailLayout) now live in plain `<main>`. If a page later needs a header (e.g., Staff sub-routes), add a `<PageHeader>` component locally per spec D-14.
- **If `gh pr merge` fails with permissions:** switch gh account: `gh auth switch --user clubmonaco2017-ops` (per memory `project_gh_auth.md`).

---

## Files for context (reading order for a fresh implementer)

1. This plan.
2. [Subplan 6A3 spec](../specs/2026-04-26-crm-subplan-6a3-dashboard-rewrite-design.md) — D-1…D-18, architecture (§3), card registry (§4), component contracts (§5), open items (§9).
3. [Subplan 6A2 plan](2026-04-26-crm-subplan-6a2-handoff-cleanup.md) — execution patterns reference (similar 3-stage shape, TDD discipline, commit hygiene).
4. [Subplan 6A spec](../specs/2026-04-26-crm-subplan-6a-shell-rebuild-design.md) — original AppShell + AppHeader contracts.
5. `src/pages/DashboardPage.jsx` — current 742-line legacy (target for rewrite; reference for fetch logic + chart + table).
6. `src/components/shell/AppShell.jsx` + `AppHeader.jsx` + `AppHeader.test.jsx` + `index.js` — files to modify/delete in Stage 1a.
7. `src/components/shell/UserMenuDropdown.jsx` + `.test.jsx` — file to extend in Stage 5.
8. `src/lib/permissions.js` — `hasPermission`, `isSuperadmin` for card gating.
9. `src/hooks/useUserOverdueCount.js` — reference for OverdueOwnCard pattern.
10. `src/hooks/useTeamMembers.js` + `useTeamList.js` — reference for `useTeamMembershipsMap` schema discovery.
11. `src/components/shell/SearchInput.jsx` — reused by HourlyOperatorTable.
12. `src/components/dashboard/preview/components-kpi.html` (if exists in `docs/design-system/`) — visual reference for card style.
