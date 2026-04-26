# CRM Subplan 6A3 — Dashboard Rewrite · Design Spec

**Status:** Brainstormed · approved decisions · spec ready for user review.
**Author:** Claude Code (Opus 4.7) + Artem.
**Date:** 2026-04-26.
**Implements:** Domain model §8 row 6 (design-system rollout) — third tier. Full rewrite of legacy 742-line `DashboardPage.jsx` (pre-CRM era) into section-based dashboard with permission-gated card registry, period-aware analytics, and Cloudflare-inspired visual style.

**Builds on:**
- [Subplan 6 Foundation spec](2026-04-26-crm-subplan-6-design-system-foundation-design.md) — DS tokens, lucide sweep, primitives install.
- [Subplan 6A Shell Rebuild spec](2026-04-26-crm-subplan-6a-shell-rebuild-design.md) — three-pane shell, AppHeader.
- [Subplan 6A2 Handoff Cleanup spec](2026-04-26-crm-subplan-6a2-handoff-cleanup-design.md) — SearchInput, outlet context, MasterDetailLayout aria-labels.

---

## 1. Goal & non-goals

**Goal:** Replace legacy 742-line `DashboardPage.jsx` with section-based dashboard architecture: section «Аналитика периода» (8 base + 3 team KPI cards + chart + top operators + hourly operator table, all bound to section-level date selector) + section «Задачи» (1-2 task-related cards). Use **permission-gated card registry** (cards declare `requiredPermission`, existing `hasPermission()` filters at render). Refactor `KpiCard` to hybrid model (base component + specialized wrappers). Adopt Cloudflare-inspired visual style (subtle cards + sparklines + delta deltas). Add **period comparison** for numeric metrics (delta % vs equivalent previous period). Move theme toggle from inline filter toolbar to `UserMenuDropdown`. Auto-refresh on period change.

**В scope:**

- New page `DashboardPage.jsx` rewritten from scratch (~300-400 lines vs current 742).
- New `src/components/dashboard/` folder with section components + card components + period context provider.
- **Card registry pattern**: `CARD_REGISTRY = [{id, component, requires, ...}]`. Render filters by `hasPermission(user, card.requires)`. Cards visible to a given user = subset of registry.
- 13 cards in registry: 8 base (Production/Shifts) + 3 team + 2 task-related. Concrete list in §6.
- **Section-based layout** with collapsible sections (per Subplan 6A2 light mockup style):
  - Section «Аналитика периода» — own period selector at section header (top-right). Contains sub-sections + chart + top-list + hourly table. Sticky section header on scroll.
  - Section «Задачи» — current-state, no period selector. Contains 1-2 task cards.
  - Future sections (Активность, Оповещения, Чат) — out of scope for 6A3, architecture supports.
- **Period context** scoped to «Аналитика периода» section: `<DashboardPeriodProvider>` wraps section, time-bound cards inside use `useDashboardPeriod()` hook.
- **Date selector** (per Subplan 6A2 light mockup design): pill «Сегодня» + range text + chevron → dropdown popover with 3 sections (preset tabs / date pickers / hour slider). Lives in section header (top-right) of «Аналитика периода».
- **Period comparison delta** for numeric cards: `↗ +18.5%` (green), `↘ -12.3%` (red), `→ 0%` (grey). Qualitative cards (Лидер дня = name) skip delta.
- **Cloudflare-inspired card visuals**: subtle white-card + lucide icons (no emoji except user-provided custom SVGs later) + accent colors + optional sparkline (only where time-series data exists).
- **Remove AppHeader entirely** from `<AppShell>` (D-14 revised). `<AppShell>` becomes rail + `<main>` with `grid-rows-[1fr]` (no header row). Delete `src/components/shell/AppHeader.jsx` + `AppHeader.test.jsx`. Update `AppShell.jsx`, `AppShell.test.jsx`, `index.js` (drop `AppHeader` and `useDerivedBreadcrumb` exports). Page-level breadcrumb component for sub-routes — defer (lazy add when first needed).
- **UserMenuDropdown extension**: add theme submenu (3 items: System / Light / Dark with checkmark on active). Reads/writes `localStorage.theme`.
- **Hourly operator table** preserved as-is functionally (search + shift filter pills + only-active toggle + sort), only visual repaint to DS tokens. Lives at bottom of «Аналитика периода» section.
- **Top operators list** (5 + expand) refactored to live alongside chart in 2/3 + 1/3 grid (chart left, top-5 right). Medals: lucide icons by default (Crown/Award/Medal placeholders); user-provided custom SVG can be swapped in via mini-PR.
- **Auto-refresh** on period change (re-fetch data when period context updates). Manual refresh icon button next to date selector. NO periodic polling in 6A3.
- **TZ selector** removed from UI (Europe/Kiev hardcoded for 6A3 MVP). Persisted localStorage value retained for backward-compat; future "Settings" page (deferred) will expose UI.
- Delete legacy `DashboardPage.jsx` (742 lines). Replaced with new `src/pages/DashboardPage.jsx` (~150 lines page-level) + `src/components/dashboard/*.jsx` (per-section + per-card components).

**Out of scope (deferred):**

- **User customization layer** — show/hide checkboxes per card, drag-drop reordering, persistence to DB. Subplan 6A4 or later. 6A3 ships static layout filtered by permissions only.
- **Per-role dedicated dashboards** (operator dashboard with personal metrics, TL dashboard with team scope). 6A3 uses permission-gated cards on shared registry; specialized operator/TL dashboards are separate brainstorm.
- **Activity feed / Оповещения / Чат sections** — placeholders documented in architecture but not implemented in 6A3.
- **Mobile responsive** — `<lg` breakpoint behavior. Subplan 6B.
- **Search bar / global actions** в shell — moot (no shell header). Если когда-то понадобится — отдельный subplan возродит header или придумает другой паттерн.
- **Page-level `<PageBreadcrumb>` component** для complex sub-routes (e.g., `/staff/<refCode>/<tab>`) — defer until first concrete need.
- **Periodic auto-refresh polling** (every N minutes) — future enhancement.
- **TZ selector UI** (Settings page) — future subplan.
- **Activity log RPC** for activity feed — needs new DB infrastructure.
- **Custom medals SVG** — user provides as separate mini-PR; default lucide icons until then.
- **Utility-class sweep** (`.btn-primary` / `.surface-card` → shadcn `<Button>` / `<Card>`) across other pages — Subplan 6A4.
- **Visual repaint of other pages** (Clients/Teams/Tasks/Staff) — Subplan 6A4.
- **AdminLayout cleanup** — Subplan 7.

---

## 2. Decisions log

| # | Решение | Rationale |
|---|---|---|
| **D-1** | Full rewrite (vs incremental refactor). New `DashboardPage.jsx` from scratch + new `src/components/dashboard/` folder. Delete legacy file at end. | 742 lines pre-CRM legacy — incremental refactor adds technical debt. Per spec D-6 of Subplan 6 brainstorm: «DashboardPage будет полностью переписан». |
| **D-2** | Section-based layout with collapsible sections. Section-level scope for date selector (NOT page-level). Per-section autonomy. | Q8-revised brainstorm = A. Page-level date selector implies «всё ниже фильтруется» which is misleading once non-time sections (Activity, Tasks, Chat) exist. Section-level matches Cloudflare model. |
| **D-3** | 6A3 MVP = 2 sections only: «Аналитика периода» (period-bound) + «Задачи» (current-state). Future sections (Активность, Оповещения, Чат) are architecture-supported but defer to later subplans. | Brainstorm: только эти 2 секции имеют ready data sources в Subplan 5/6/6A. Activity log RPC etc. = новая infrastructure work. |
| **D-4** | Permission-gated card registry. Each card has `requiredPermission` field. Render = `CARD_REGISTRY.filter(c => hasPermission(user, c.requires))`. Existing `hasPermission()` infrastructure does heavy lifting. | Q3c brainstorm: user identified existing permissions system already handles this. Cleaner than parallel role/visibility design. Operator with `view_own_revenue` (no `view_all_revenue`) → sees personal cards only. |
| **D-5** | Customization layer (show/hide checkboxes, drag-drop) — defer to Subplan 6A4 or later. 6A3 = static permission-filtered layout. | Q3a brainstorm = A. Customization needs DB table + drag library + state mgmt — own subplan worth. Real users (5-15 admins) may not need it. Ship defaults first, learn from usage. |
| **D-6** | 13 cards в registry для 6A3: 8 base (4 Производительность + 4 По сменам) + 3 team + 2 task-related. Concrete list in §6. | Q3c-followup = C (8 base + 3 team + 2 task = 13). Balance between value и noise. Future cards added to registry by extending array. |
| **D-7** | Period comparison delta (%) shown only for numeric metrics. Qualitative cards (Лидер = имя) skip delta. | Q3b brainstorm = C. Delta semantics for «Иванов vs Петров» — not meaningful. Numeric delta vs equivalent previous period (today vs yesterday, week vs prev week, custom vs equal-length-prior). |
| **D-8** | Date selector design = «pill + range text + chevron → dropdown popover with 3 sections (preset tabs / date pickers / hour slider)». Per Subplan 6A2 light mockup style. | Q2 brainstorm = A. Best balance: visible (pill), informative (range text), powerful (3-section dropdown). |
| **D-9** | Middle layout: chart «Выручка по часам» (2/3 width) + «Топ операторов» (1/3 width) in single grid row inside «Аналитика периода» section. | Q4 brainstorm = A. Chart-first hierarchy preserved, top operators compact column. |
| **D-10** | Hourly operator table preserved functionally (search + shift filter pills + only-active toggle + sort). Visual repaint to DS tokens only. | Q5 brainstorm = A. Works as-is, no pain point to redesign. Lives at bottom of «Аналитика периода» section. |
| **D-11** | Card visual style = Cloudflare-inspired (subtle white-card + lucide icons + accent colors + optional sparkline). NO emoji (per Subplan 6 sweep — uses lucide; user may supply custom SVG for medals later). | Q7 brainstorm = B + «icons not emoji». Cloudflare matches user's stated preference. Scales для 13 cards без noise. |
| **D-12** | KpiCard contract = hybrid. Base `<KpiCard>` shared component (label/value/icon/sublabel/delta/color slots) + specialized wrappers where custom viz needed (`<TeamDistributionCard>` mini-bar list, `<ShiftCard>` with trend-bar, `<TotalRevenueCard>` with peak-hour callout). | Q10 brainstorm = C. Base general-purpose + wrappers где нужны custom visualizations. Avoids over-genericizing base while maintaining shared layout/spacing. |
| **D-13** | Filter toolbar (Subplan 6A2) gets fully removed. Date pickers + hour slider → new dropdown date selector. Refresh button → small icon button next to date selector. TZ selector → removed from UI (hardcoded Europe/Kiev for MVP, localStorage value retained). ThemeSwitcher → moved to `UserMenuDropdown`. | Q9 brainstorm = A. Clean header, modern pattern. TZ rarely changed in CRM context. |
| **D-14 (revised)** | **Remove `<AppHeader />` from `<AppShell />`** entirely. AppShell grid: `grid-cols-[56px_1fr] grid-rows-[1fr] h-screen` (no header row). Delete `AppHeader.jsx`, `AppHeader.test.jsx`, drop exports from `index.js`. Section «Аналитика периода» (and any future top-level section) provides its own header with title + actions. | Final brainstorm: AppHeader currently shows redundant breadcrumb (active rail icon + list pane title уже передают section context) или пуст на `/`. 48px вертикали без явной пользы. Page-level breadcrumb для complex sub-routes — lazy add when first needed (none currently). Date selector (D-8) живёт в section header, не shell header — actions slot для shell не нужен. |
| **D-15** | UserMenuDropdown extension: add theme submenu (3 items System / Light / Dark with active checkmark). Reads/writes `localStorage.theme`. | Q9 = A. Theme toggle migration from inline toolbar. UserMenuDropdown already exists from Subplan 6A. |
| **D-16** | Auto-refresh on period change (data re-fetches via useEffect dependency). Manual refresh icon next to date selector. NO periodic polling in 6A3. | Q9 = A. Auto re-fetch on period change covers 95% UX. Manual refresh for explicit re-pull. Periodic = future. |
| **D-17** | Section collapsible state persisted in `localStorage` per-section ID. Default: all sections expanded. | Pragmatic decision — simple persistence, no DB. User opens dashboard, last collapse state restored. |
| **D-18** | Top operators medals = lucide icons (Crown / Award / Medal) by default. User-provided custom SVG sw apped in via separate mini-PR. | Per Subplan 6 spec D-6 + earlier brainstorm: medals row deferred to user-provided custom SVG. lucide placeholders preserve functionality without blocking 6A3. |

---

## 3. Architecture

### 3.1. Page structure

```
<DashboardPage>  ← rendered inside AppShell's <main> (no shell header anymore)
       ├── <SectionAnalytics>  ← contains DashboardPeriodProvider
       │     ├── <SectionHeader title="Аналитика периода" actions={<DateSelector /> + <RefreshButton />} collapsible />
       │     ├── <SubSection title="Производительность">  ← grid of cards
       │     │     ├── <TotalRevenueCard />
       │     │     ├── <RevenuePerHourCard />
       │     │     ├── <LeaderCard />
       │     │     └── <EngagementCard />
       │     ├── <SubSection title="По сменам">
       │     │     ├── <ShiftCard shift="day" />
       │     │     ├── <ShiftCard shift="evening" />
       │     │     ├── <ShiftCard shift="night" />
       │     │     └── <BestShiftCard />
       │     ├── <SubSection title="По командам">
       │     │     ├── <TopTeamCard />
       │     │     ├── <TeamDistributionCard />
       │     │     └── <TeamEngagementCard />
       │     ├── <ChartTopOperatorsRow>  ← 2/3 + 1/3 grid
       │     │     ├── <RevenueByHourChart />
       │     │     └── <TopOperatorsList />
       │     └── <HourlyOperatorTable />
       └── <SectionTasks>  ← no period provider; current state
             ├── <SectionHeader title="Задачи" collapsible />
             └── <SubSection (cards filter by perm)>
                   ├── <OverdueAllCard />     (perm: view_all_tasks)
                   └── <OverdueOwnCard />     (perm: view_own_tasks)
```

### 3.2. Period context (scoped to «Аналитика периода» section)

```jsx
// DashboardPeriodProvider.jsx
const DashboardPeriodContext = createContext(null)

export function DashboardPeriodProvider({ children }) {
  const [period, setPeriod] = useState({
    preset: 'today',         // 'today' | 'yesterday' | 'week' | 'month' | 'custom'
    from: todayStr(),
    to: todayStr(),
    hours: [0, 23],
  })
  const previousPeriod = useMemo(() => derivePreviousPeriod(period), [period])
  const value = useMemo(() => ({ period, previousPeriod, setPeriod }), [period, previousPeriod])
  return <DashboardPeriodContext.Provider value={value}>{children}</DashboardPeriodContext.Provider>
}

export function useDashboardPeriod() {
  const ctx = useContext(DashboardPeriodContext)
  if (!ctx) throw new Error('useDashboardPeriod must be used inside DashboardPeriodProvider')
  return ctx
}

// derivePreviousPeriod: today→yesterday, yesterday→day-before, week→prev-week, month→prev-month, custom→equal-length-immediately-before
```

Cards inside `<SectionAnalytics>` consume context: `const { period, previousPeriod } = useDashboardPeriod()` → fetch data for both, compute delta.

Cards outside (in «Задачи») don't subscribe — they render current-state.

### 3.3. Card registry pattern

```jsx
// src/components/dashboard/cardRegistry.js
import { TotalRevenueCard } from './cards/TotalRevenueCard.jsx'
import { LeaderCard } from './cards/LeaderCard.jsx'
// ... etc

export const ANALYTICS_CARDS = [
  { id: 'total_revenue',    component: TotalRevenueCard,    requires: 'view_all_revenue' },
  { id: 'revenue_per_hour', component: RevenuePerHourCard,  requires: 'view_all_revenue' },
  { id: 'leader',           component: LeaderCard,          requires: 'view_all_revenue' },
  { id: 'engagement',       component: EngagementCard,      requires: 'view_all_revenue' },
  { id: 'shift_day',        component: ShiftCard,           requires: 'view_all_revenue', props: { shift: 'day' } },
  { id: 'shift_evening',    component: ShiftCard,           requires: 'view_all_revenue', props: { shift: 'evening' } },
  { id: 'shift_night',      component: ShiftCard,           requires: 'view_all_revenue', props: { shift: 'night' } },
  { id: 'best_shift',       component: BestShiftCard,       requires: 'view_all_revenue' },
  { id: 'top_team',         component: TopTeamCard,         requires: 'view_all_revenue' },
  { id: 'team_distribution',component: TeamDistributionCard,requires: 'view_all_revenue' },
  { id: 'team_engagement',  component: TeamEngagementCard,  requires: 'view_all_revenue' },
]

export const TASK_CARDS = [
  { id: 'overdue_all', component: OverdueAllCard, requires: 'view_all_tasks' },
  { id: 'overdue_own', component: OverdueOwnCard, requires: 'view_own_tasks' },
]

// Render helper
export function renderCards(registry, user, props = {}) {
  return registry
    .filter(c => hasPermission(user, c.requires))
    .map(c => {
      const Component = c.component
      return <Component key={c.id} {...c.props} {...props} />
    })
}
```

Sub-sections can take a slice of registry (e.g., `ANALYTICS_CARDS.slice(0, 4)` for «Производительность»). Or each sub-section explicitly lists its cards.

### 3.4. Data flow

- **Existing queries** to `supabase` are abstracted into `useDashboardData(period)` hook (centralized in `src/hooks/useDashboardData.js`). Fetches operators, hourly revenue, shifts. Returns `{ rows, hourly, shifts, leader, total, ... }`.
- **Comparison data**: `useDashboardData(previousPeriod)` called separately. Cards compute deltas client-side.
- **Tasks data**: existing hooks (`useUserOverdueCount` for own, new lightweight hook for all-overdue or use `count_overdue_tasks(null)` for admin-scope) — TBD in plan.
- **No new RPCs** required. All data computable from existing queries + client-side aggregation (shift sums, team aggregates).

### 3.5. AppShell after AppHeader removal

```jsx
// AppShell.jsx (simplified — D-14 revised)
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

- `grid-rows-[1fr]` instead of `[48px_1fr]`. No `<AppHeader>` import or render.
- `RailNav` no longer needs `row-span-2` (single row now).
- Pages render their content directly. If a page needs visible heading or breadcrumb, page does it itself (e.g., Section «Аналитика периода» has its own bordered header with title + date selector).
- Section pattern (per §3.6) replaces shell header for visual organization.

`AppHeader.jsx` + `AppHeader.test.jsx` + `useDerivedBreadcrumb` deleted. `index.js` drops those exports.

### 3.6. Section components

```jsx
// src/components/dashboard/Section.jsx
export function Section({ id, title, icon, actions, children }) {
  const [expanded, setExpanded] = useLocalStorageBool(`dashboard.section.${id}.expanded`, true)
  return (
    <section className="border border-border rounded-lg mb-4">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-background">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 font-semibold">
          {icon && <icon size={16} />}
          <span>{title}</span>
          <ChevronDown className={expanded ? '' : 'rotate-180'} />
        </button>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      {expanded && <div className="p-4">{children}</div>}
    </section>
  )
}

// SubSection — same pattern but no border/sticky, smaller header, no localStorage
export function SubSection({ title, children }) { ... }
```

---

## 4. Card registry — full list (13 cards)

### 4.1. «Аналитика периода» — Производительность (4 cards, all `requires: 'view_all_revenue'`)

| Card | Value | Sub | Delta? |
|---|---|---|---|
| **Итого за период** | total revenue | "Пик: HH:00 · X $" | ✅ vs previous period |
| **Выручка / час** | avg per active hour | "Среднее по активным часам" | ✅ |
| **Лидер периода** | top-1 operator name | "X $ — топ-1" | ❌ qualitative |
| **Вовлечённость** | % active operators | "X из Y активны" | ✅ |

### 4.2. «Аналитика периода» — По сменам (4 cards, all `requires: 'view_all_revenue'`)

| Card | Value | Sub | Delta? |
|---|---|---|---|
| **Дневная** | shift sum | "X операторов · Y%" | ✅ |
| **Вечерняя** | shift sum | same | ✅ |
| **Ночная** | shift sum | same | ✅ |
| **Лучшая смена** | best shift name | "+X% к next-best" | ❌ qualitative + comparison inline |

### 4.3. «Аналитика периода» — По командам (3 cards, all `requires: 'view_all_revenue'`)

| Card | Value | Sub | Delta? |
|---|---|---|---|
| **Лидер команды** | top team name | "X $ · N операторов" | ✅ vs prev period |
| **Распределение по командам** | mini-bar list | top 3-5 teams with %-bars | ❌ list |
| **Активность команд** | % active operators in teams | "X из Y операторов в командах" | ✅ |

### 4.4. «Задачи» (2 cards, separate permissions)

| Card | Value | Sub | Permission |
|---|---|---|---|
| **Просрочки задач (все)** | count | "→ открыть `/tasks?filter=overdue`" | `view_all_tasks` |
| **Мои просрочки** | count | "→ открыть `/tasks` (inbox)" | `view_own_tasks` |

---

## 5. Component contracts

### 5.1. `<KpiCard>` (base — Cloudflare-inspired)

```jsx
// src/components/dashboard/KpiCard.jsx
export function KpiCard({
  label,         // string, e.g. "Итого за период"
  value,         // string|number, main metric
  icon: Icon,    // ComponentType (lucide), small icon top-right
  sublabel,      // optional string, e.g. "Пик: 14:00 · 412 $"
  delta,         // optional { value: number, direction: 'up'|'down'|'neutral' }
  accentColor,   // optional 'blue'|'green'|'purple'|'orange' for left-border accent (per D-12 hybrid)
  sparkline,     // optional number[] (last 24h or 7d series)
  children,      // optional custom content (for specialized wrappers)
}) {
  return (
    <article className={`bg-card border border-border rounded-lg p-4 ${accentColor ? `border-l-4 border-l-${accentColor}-500` : ''}`}>
      <header className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        {Icon && <Icon size={16} className="text-muted-foreground" />}
      </header>
      <div className="text-2xl font-bold mt-1 flex items-baseline gap-2">
        <span>{value}</span>
        {delta && (
          <span className={`text-xs font-medium ${delta.direction === 'up' ? 'text-green-600' : delta.direction === 'down' ? 'text-red-600' : 'text-muted-foreground'}`}>
            {delta.direction === 'up' ? '↗' : delta.direction === 'down' ? '↘' : '→'} {Math.abs(delta.value)}%
          </span>
        )}
      </div>
      {sublabel && <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>}
      {sparkline && <Sparkline data={sparkline} className="mt-2 h-6" />}
      {children}
    </article>
  )
}
```

### 5.2. Specialized wrappers (per D-12 hybrid)

Examples (full impl in plan):

- **`<TotalRevenueCard>`** — uses base `<KpiCard>` with `delta` (vs prev period) + sublabel «Пик: HH:00 · X $» derived from peak hour.
- **`<LeaderCard>`** — uses base `<KpiCard>` without delta (qualitative).
- **`<ShiftCard shift={shift}>`** — uses base + computes operator count + % share.
- **`<TeamDistributionCard>`** — does NOT use base; renders own `<article>` with header + horizontal mini-bar list. Uses same DS tokens for consistency.
- **`<OverdueAllCard>`** — uses base + click → navigate to `/tasks?filter=overdue`.

### 5.3. `<DateSelector>` (per Subplan 6A2 light mockup design)

```jsx
// src/components/dashboard/DateSelector.jsx
export function DateSelector() {
  const { period, setPeriod } = useDashboardPeriod()
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs">
          <Calendar size={12} />
          <span className="bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-semibold">
            {presetLabel(period.preset)}
          </span>
          <span className="text-muted-foreground">{rangeText(period)}</span>
          <ChevronDown size={12} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[480px]" align="end">
        {/* Section: Период (preset tabs) */}
        {/* Section: Даты (date pickers) */}
        {/* Section: Часы (range slider with reset) */}
      </PopoverContent>
    </Popover>
  )
}
```

Uses shadcn `<Popover>` (already installed) + native `<input type="date">` for date pickers + custom range slider (or rc-slider if already in package).

---

## 6. Stages

5 stages — each = one commit, sequential.

### Stage 1 — Remove AppHeader + Period context + DateSelector

**Stage 1a (cleanup):** Remove `<AppHeader />` from `<AppShell>`, adjust grid to `grid-rows-[1fr]`, delete `AppHeader.jsx` + `AppHeader.test.jsx`, update `index.js` exports, update `AppShell.test.jsx` (remove breadcrumb-related assertions). Verify all 8 routes still render (no broken layout).

**Stage 1b (period foundation):** Build `DashboardPeriodProvider`/`useDashboardPeriod`, `derivePreviousPeriod` helper, `<DateSelector>` component. Tests for context + period derivation + DateSelector behavior.

### Stage 2 — Section components + base KpiCard

Build `<Section>` (collapsible + sticky + localStorage persistence) + `<SubSection>`, base `<KpiCard>` component. Tests.

### Stage 3 — Card registry + 13 specific cards

Build `cardRegistry.js` + 13 card components (4 Производительность + 4 По сменам + 3 По командам + 2 Задачи). Each card fetches data (using shared `useDashboardData(period)` hook for analytics, individual hooks for tasks). Tests for permission filtering + render-helper.

### Stage 4 — Chart, top operators, hourly table

Refactor existing recharts logic into `<RevenueByHourChart>` + `<TopOperatorsList>` (in 2/3 + 1/3 grid) + `<HourlyOperatorTable>` (preserve current functionality, repaint to DS tokens). All inside «Аналитика периода» section.

### Stage 5 — Wire DashboardPage + UserMenuDropdown theme + cleanup

Compose `<DashboardPage>` from sections (no shell header to set — page renders Section «Аналитика периода» directly as first content). Add theme submenu to `UserMenuDropdown` (3 items + checkmark + localStorage). Delete legacy `DashboardPage.jsx` content (replace with new). Final smoke + commit + push + PR.

---

## 7. Тестирование

### 7.1. Existing tests

201 baseline must continue passing. Dashboard-related tests don't exist (current 742-line file untested). New tests come from Stages 1-3.

### 7.2. New tests

| File | Что тестируется |
|---|---|
| `DashboardPeriodProvider.test.jsx` | provider wraps children, useDashboardPeriod hook returns context, throws when outside provider, setPeriod updates state, derivePreviousPeriod for each preset (today→yesterday, week→prev week, etc.) |
| `DateSelector.test.jsx` | renders pill with preset label + range text, popover opens on click, clicking preset updates context, hour slider updates hours |
| `Section.test.jsx` | renders title + actions + children, collapse/expand toggles via button, localStorage persists state |
| `KpiCard.test.jsx` | renders label/value/icon/sublabel, delta shows arrow + color (up=green, down=red, neutral=grey), sparkline renders when data provided, accent border when accentColor set |
| `cardRegistry.test.jsx` | renderCards filters by hasPermission, props passed through, key=card.id |
| `AppShell.test.jsx` (update) | rail + main grid (single row); no header rendered; outlet content visible. Existing breadcrumb-related test cases removed. |

Target: ~25-30 new test assertions. Removed: ~12-14 (AppHeader.test.jsx full file = 10 useDerivedBreadcrumb + 2 visual; AppShell breadcrumb-related ~2 cases). **Net: 201 baseline - ~13 removed + ~25 new = ~213 tests after 6A3.**

### 7.3. Visual smoke

- `/` Dashboard renders for admin: see all 11 analytics cards + 1 task card (Просрочки all) + chart + top operators + hourly table.
- Same as operator: should see only «Мои просрочки» card (+ shell нав), no analytics. (Acceptance: graceful empty state for analytics section if no cards visible to user — show «Нет данных по правам».)
- Date selector dropdown opens, presets switch period, dates update, hour slider updates.
- Section collapse/expand works, persisted across reload.
- Theme switcher in UserMenuDropdown switches DS tokens (light/dark/system).
- Shell header on `/` shows «Дашборд» title + icon (NOT empty).
- Light + dark mode visual integrity.

---

## 8. Acceptance criteria

After 5 stages merged into `main`:

- `src/pages/DashboardPage.jsx` rewritten (~150 lines, no legacy code).
- `src/components/dashboard/` contains: `cardRegistry.js`, `DashboardPeriodProvider.jsx`, `DateSelector.jsx`, `Section.jsx`, `SubSection.jsx`, `KpiCard.jsx`, 13 individual card components, `RevenueByHourChart.jsx`, `TopOperatorsList.jsx`, `HourlyOperatorTable.jsx` + tests.
- `src/components/shell/AppHeader.jsx` + `AppHeader.test.jsx` DELETED. `AppShell.jsx` simplified (single-row grid, no header). `index.js` drops `AppHeader` and `useDerivedBreadcrumb` exports.
- `src/components/shell/UserMenuDropdown.jsx` extended with theme submenu (3 items).
- `src/hooks/useDashboardData.js` (or similar) centralized fetch hook.
- Old `DashboardPage.jsx` content replaced (no legacy 742 lines remain).
- Permission-gated cards work: admin sees ~12 cards, operator with `view_own_tasks` only sees «Мои просрочки».
- Date selector at section header of «Аналитика периода» — period changes re-fetch data, comparison delta shows on numeric cards.
- Sections collapsible with persisted state.
- ~213 tests pass (net of 12-14 AppHeader-related test removals).
- `npx vite build` clean.
- Visual smoke through dashboard for admin + operator role works.

---

## 9. Open items (pragmatic defaults — flag if you want to revisit)

These were not explicitly debated in brainstorm but I picked sensible defaults:

1. **Auto-refresh:** only on period change (no periodic polling). Manual refresh icon button next to date selector. Future: opt-in periodic.
2. **Section collapse persistence:** localStorage per section ID (`dashboard.section.analytics.expanded`). Default expanded.
3. **Empty state when user sees zero cards:** show «Нет данных по вашим правам» friendly message.
4. **Chart toggle (bar/area):** preserve current toggle (was in legacy DashboardPage).
5. **Top operators expand «Показать все 20»:** preserve current expand behavior.
6. **Medals icons:** lucide Crown / Award / Medal placeholder; ranks 4-5 use `<span className="font-mono">#4 #5</span>`. User-supplied custom SVG → mini-PR later.
7. **Hourly table — virtual scrolling:** NO (current table works at 79 rows; if grows past 200+ revisit).
8. **TZ:** hardcoded Europe/Kiev for 6A3 MVP. Existing localStorage `tz` value retained but not exposed in UI.
9. **Theme system mode:** matches OS via `matchMedia('(prefers-color-scheme: dark)')`. Listener для динамического update.
10. **Mobile (`<lg`):** untouched, uses what shell provides. Subplan 6B handles mobile-specific dashboard.

---

## 10. Файлы для контекста

При начале plan'а / implementation'а:

- This spec.
- [Subplan 6 spec](2026-04-26-crm-subplan-6-design-system-foundation-design.md) — DS tokens, lucide installed.
- [Subplan 6A spec](2026-04-26-crm-subplan-6a-shell-rebuild-design.md) — AppShell, AppHeader, RailNav, MasterDetailLayout (current contracts).
- [Subplan 6A2 spec](2026-04-26-crm-subplan-6a2-handoff-cleanup-design.md) — SearchInput, MasterDetailLayout aria-labels.
- `src/pages/DashboardPage.jsx` — current 742-line legacy (target for rewrite).
- `src/components/shell/AppHeader.jsx` — file to DELETE (along with `AppHeader.test.jsx`).
- `src/components/shell/AppShell.jsx` — file to modify (drop AppHeader render, single-row grid).
- `src/components/shell/UserMenuDropdown.jsx` — file to extend (theme submenu).
- `src/lib/permissions.js` — `hasPermission`, `isSuperadmin` for card gating.
- `src/lib/defaultPermissions.js` — permission names (`view_all_revenue`, `view_own_revenue`, `view_all_tasks`, `view_own_tasks`).
- `docs/design-system/preview/components-kpi.html` — visual reference for card style.
- `docs/design-system/preview/colors-*.html` — accent color references.
