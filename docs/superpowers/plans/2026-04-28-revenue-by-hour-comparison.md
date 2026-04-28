# RevenueByHourChart vs previous-period comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить overlay «предыдущего периода» (ghost-бары) на график [RevenueByHourChart](src/components/dashboard/RevenueByHourChart.jsx) — пользователь сразу видит «выше или ниже benchmark» без переключения пресетов.

**Architecture:** Локальное изменение в `src/components/dashboard/`. `RevenueByHourChart` получает дополнительный prop `prevRows` (уже фетчится в `SectionAnalytics` через `useDashboardData(previousPeriod)`) и `previousPeriod`, рисует второй `<Bar>`-слой полупрозрачным fill'ом, добавляет custom tooltip с delta % и toggle-pill в header. Для `preset==='today'` применяется smart clipping (apples-to-apples по часу).

**Tech Stack:** React 19, recharts (`<BarChart>`/`<Bar>` already used), Tailwind v4, shadcn `<Button>`. Без backend / RPC изменений. Без новых dependencies.

**Spec:** [docs/superpowers/specs/2026-04-28-revenue-by-hour-comparison-design.md](../specs/2026-04-28-revenue-by-hour-comparison-design.md)

---

## File structure

**Modified — 2 files:**
- `src/components/dashboard/RevenueByHourChart.jsx` — основная работа: новый prop `prevRows`, state `showComparison`, helpers `buildHourlyTotals` / `lastHourWithData` / `comparisonLabel` / `previousLabelFor`, custom tooltip `HourComparisonTooltip` + `DeltaBadge`, второй `<Bar>` слой, toggle-pill в header.
- `src/components/dashboard/SectionAnalytics.jsx` — one-line diff: прокинуть `prevRows` в `<RevenueByHourChart>`.

**Created — 0 files.** Все helpers и sub-components — private внутри `RevenueByHourChart.jsx` (файл всё ещё компактный после изменений, ~250 LOC).

**Tests:** не добавляются. `dashboard/` не имеет component tests; lib-уровневой логики, заслуживающей unit-тестов, тоже нет — все helpers тривиальны и работают на простых массивах. Verification = manual browser smoke + build/lint/test baselines.

---

## Setup

### Task 0: Verify baseline

**Files:** none.

- [ ] **Step 0.1: Confirm branch and HEAD**

```bash
git status
git log --oneline -3
```

Expected: branch `feat/desktop-tweaks-nav-redesign`; HEAD includes `5c1b0ef docs(spec): RevenueByHourChart vs previous-period comparison`. Pre-existing uncommitted modifications on the branch are NOT in scope — do not touch them.

- [ ] **Step 0.2: Verify build / lint / test baseline**

```bash
npm run build
npm run lint 2>&1 | tail -3
npm run test -- --run 2>&1 | tail -5
```

Expected: build succeeds, lint = 50 errors + 1 warning (pre-existing), tests = 236/236 passing.

---

## Implementation

### Task 1: Add helpers + accept new props (no rendering change yet)

**Цель:** Расширить `RevenueByHourChart` чтобы принимал `prevRows` / `previousPeriod`, добавить private helpers и подготовить data assembly. Рендеринг ещё не меняется (второй `<Bar>` появится в Task 2). Каждый промежуточный коммит должен оставлять рабочее приложение.

**Files:**
- Modify: `src/components/dashboard/RevenueByHourChart.jsx`
- Modify: `src/components/dashboard/SectionAnalytics.jsx`

- [ ] **Step 1.1: Pass `prevRows` to `<RevenueByHourChart>` in `SectionAnalytics.jsx`**

Read `src/components/dashboard/SectionAnalytics.jsx`. Find line 78:

```jsx
<RevenueByHourChart rows={rows} period={period} />
```

Replace with:

```jsx
<RevenueByHourChart rows={rows} prevRows={prevRows} period={period} />
```

(`prevRows` is already in scope at line 25 — `useDashboardData({ from: previousPeriod.from, to: previousPeriod.to })`.)

- [ ] **Step 1.2: Modify `RevenueByHourChart.jsx` — extend signature + add helpers**

Read `src/components/dashboard/RevenueByHourChart.jsx`. Replace the function signature line:

```jsx
export function RevenueByHourChart({ rows, period }) {
```

with:

```jsx
export function RevenueByHourChart({ rows, prevRows = [], period }) {
```

Then ADD the following helpers OUTSIDE the component, near the existing `fmt` function (right after the existing `const fmt = ...` line):

```jsx
function buildHourlyTotals(rows, hours) {
  return hours.map((h) => ({
    hour: `${String(h).padStart(2, '0')}:00`,
    revenue: rows.reduce((s, op) => s + (op[`h${h}`] || 0), 0),
  }))
}

function lastHourWithData(totals) {
  for (let i = totals.length - 1; i >= 0; i--) {
    if (totals[i].revenue > 0) return i
  }
  return -1
}

function comparisonLabel(preset) {
  switch (preset) {
    case 'today': return 'vs вчера'
    case 'yesterday': return 'vs позавчера'
    case 'week': return 'vs прошлая неделя'
    case 'month': return 'vs прошлый месяц'
    default: return 'vs предыдущий период'
  }
}

function previousLabelFor(preset) {
  switch (preset) {
    case 'today': return 'вчера'
    case 'yesterday': return 'позавчера'
    case 'week': return 'прошлая неделя'
    case 'month': return 'прошлый месяц'
    default: return 'предыдущий период'
  }
}
```

- [ ] **Step 1.3: Replace data-assembly block in `RevenueByHourChart`**

Find the current data-assembly block inside the component (currently lines 23–31):

```jsx
const [hMin, hMax] = period.hours
const hours = Array.from({ length: 24 }, (_, i) => i).filter((h) => h >= hMin && h <= hMax)

const hourlyTotals = hours
  .map((h) => ({
    hour: `${String(h).padStart(2, '0')}:00`,
    revenue: rows.reduce((s, op) => s + (op[`h${h}`] || 0), 0),
  }))
  .filter((x) => x.revenue > 0)
```

Replace with:

```jsx
const [hMin, hMax] = period.hours
const allHours = Array.from({ length: 24 }, (_, i) => i).filter((h) => h >= hMin && h <= hMax)

const currentRaw = buildHourlyTotals(rows, allHours)
const prevRaw = buildHourlyTotals(prevRows, allHours)

const hasCurrentData = currentRaw.some((x) => x.revenue > 0)
const isToday = period.preset === 'today'
const lastIdx = isToday ? lastHourWithData(currentRaw) : currentRaw.length - 1

const hourlyTotals = hasCurrentData
  ? currentRaw
      .slice(0, lastIdx + 1)
      .map((c, i) => ({
        hour: c.hour,
        revenue: c.revenue,
        prevRevenue: prevRaw[i]?.revenue ?? null,
      }))
      .filter((x) => x.revenue > 0)
  : []
```

Notes:
- `hourlyTotals` keeps its name (consumed in unchanged places below). Now each element also has `prevRevenue`.
- Per spec D-9: empty `hourlyTotals` triggers the existing «Нет данных» branch. We treat «нет current данных вообще» as empty even if prev exists — chart-without-current-bars is misleading.
- The filter `x.revenue > 0` keeps the same shape as before (only show hours where current has value). Prev-only ghost bars on hours where current is 0 are NOT rendered — keeps the bar count tight and consistent with the prior baseline rendering.
- `lastIdx === -1` is unreachable here because `hasCurrentData === false` short-circuits to `[]`.

- [ ] **Step 1.4: Verify build + lint**

```bash
npm run build
npm run lint 2>&1 | tail -3
```

Expected: build succeeds. Lint baseline 50 errors + 1 warning unchanged.

- [ ] **Step 1.5: Manual smoke** — skip (no visible change yet — second bar series not rendered until Task 2).

- [ ] **Step 1.6: Commit (only the two intended files)**

```bash
git add src/components/dashboard/RevenueByHourChart.jsx src/components/dashboard/SectionAnalytics.jsx
git commit -m "$(cat <<'EOF'
refactor(dashboard): RevenueByHourChart accept prevRows/previousPeriod

Pure prep — wire up new props and private helpers (buildHourlyTotals,
lastHourWithData, comparisonLabel, previousLabelFor); rebuild data
assembly to compute combined current+prev rows with smart clipping for
preset='today'. No visible change yet — second bar series + toggle land
in the next commits.
EOF
)"
```

DO NOT use `git add -A` or `git add .`. Many other files have unrelated uncommitted modifications.

---

### Task 2: Render ghost-bar series + custom tooltip

**Цель:** Добавить второй `<Bar>` слой и кастомный tooltip с delta %. Toggle-pill ещё не добавляем (он в Task 3) — comparison всегда виден после этого коммита.

**Files:**
- Modify: `src/components/dashboard/RevenueByHourChart.jsx`

- [ ] **Step 2.1: Add tooltip + delta badge components**

ADD these helpers OUTSIDE the main component, immediately after the helpers added in Task 1 (`previousLabelFor`):

```jsx
function deltaInfo(current, prev) {
  if (prev == null) return { kind: 'no-prev' }
  if (prev === 0 && current === 0) return { kind: 'zero' }
  if (prev === 0) return { kind: 'inf', sign: current > 0 ? '+' : '-' }
  const pct = ((current - prev) / prev) * 100
  return { kind: 'pct', pct }
}

function DeltaBadge({ current, prev }) {
  const info = deltaInfo(current, prev)
  if (info.kind === 'no-prev') return null
  if (info.kind === 'zero') {
    return <span className="text-right text-muted-foreground">—</span>
  }
  if (info.kind === 'inf') {
    return (
      <span
        className={`text-right font-semibold ${
          info.sign === '+' ? 'text-[var(--success-ink)]' : 'text-[var(--danger-ink)]'
        }`}
      >
        {info.sign}∞%
      </span>
    )
  }
  const positive = info.pct >= 0
  return (
    <span
      className={`text-right font-semibold ${
        positive ? 'text-[var(--success-ink)]' : 'text-[var(--danger-ink)]'
      }`}
    >
      {positive ? '▲' : '▼'} {positive ? '+' : ''}{info.pct.toFixed(1)}%
    </span>
  )
}

function HourComparisonTooltip({ active, payload, label, preset, showComparison }) {
  if (!active || !payload?.length) return null
  const cur = payload.find((p) => p.dataKey === 'revenue')?.value ?? 0
  const prev = payload.find((p) => p.dataKey === 'prevRevenue')?.value
  const hasPrev = prev != null

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <div className="font-semibold text-foreground mb-1">{label}</div>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <span className="text-muted-foreground">сегодня</span>
        <span className="text-right font-medium text-foreground">{fmt(cur)} $</span>
        {showComparison && (
          <>
            <span className="text-muted-foreground">{previousLabelFor(preset)}</span>
            {hasPrev ? (
              <span className="text-right font-medium text-foreground">{fmt(prev)} $</span>
            ) : (
              <span className="text-right italic text-muted-foreground">нет данных</span>
            )}
            {hasPrev && (
              <>
                <span />
                <DeltaBadge current={cur} prev={prev} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2.2: Add `showComparison` state + render second Bar**

Find the `useState` lines at the top of the component:

```jsx
const [chartType, setChartType] = useState('bar')
const [expanded, setExpanded] = useState(true)
```

Add a third line right below:

```jsx
const [showComparison, setShowComparison] = useState(true)
```

Now find the `<BarChart>` block (currently rendering only the current `<Bar>`):

```jsx
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
```

Replace with:

```jsx
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
    content={
      <HourComparisonTooltip preset={period.preset} showComparison={showComparison} />
    }
    cursor={{ fill: 'rgba(99, 102, 241, 0.08)' }}
  />
  {showComparison && (
    <Bar
      dataKey="prevRevenue"
      fill="#6366f1"
      fillOpacity={0.25}
      radius={[5, 5, 0, 0]}
      maxBarSize={40}
      isAnimationActive={false}
    />
  )}
  <Bar dataKey="revenue" radius={[5, 5, 0, 0]} maxBarSize={40}>
    {hourlyTotals.map((_, i) => (
      <Cell key={i} fill="#6366f1" />
    ))}
  </Bar>
</BarChart>
```

Notes:
- `prevRevenue` Bar rendered FIRST so the solid `revenue` Bar overlaps it (recharts uses render order for z-index).
- `isAnimationActive={false}` on the prev bar avoids a fade-in flicker every time the user toggles or data updates — the ghost bar should just appear in place.
- `<Tooltip content={<HourComparisonTooltip ... />}>` replaces the default `formatter`-based tooltip with our custom multi-row component.

- [ ] **Step 2.3: Verify build + lint**

```bash
npm run build
npm run lint 2>&1 | tail -3
```

Expected: build succeeds, lint baseline.

- [ ] **Step 2.4: Manual smoke** — skip in subagent context (controller verifies).

- [ ] **Step 2.5: Commit**

```bash
git add src/components/dashboard/RevenueByHourChart.jsx
git commit -m "$(cat <<'EOF'
feat(dashboard): RevenueByHourChart — render previous-period ghost bars

Second <Bar> series renders prevRevenue with #6366f1 / opacity 0.25
behind the current solid bars. Custom HourComparisonTooltip shows both
values plus delta % (success-ink for positive, danger-ink for negative,
"—" for both-zero, "+∞%" when prev=0). showComparison state defaults
to true; toggle-pill arrives in the next commit.
EOF
)"
```

---

### Task 3: Toggle-pill in chart header + area-mode opt-out

**Цель:** Добавить toggle-pill «vs <prev>» в header графика, который включает/выключает comparison. Когда пользователь в area-режиме — pill greyed-out.

**Files:**
- Modify: `src/components/dashboard/RevenueByHourChart.jsx`

- [ ] **Step 3.1: Add toggle-pill in header**

Find the existing header block (currently around lines 42–55 of the post-Task-2 file — it's the `<div className="px-4 py-3 flex items-center justify-between border-b border-border">` block containing the title-button and chart-type tabs).

The header currently is:

```jsx
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
```

Replace it with this version (adds the toggle-pill between the title button and the chart-type tabs):

```jsx
<div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-border">
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
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setShowComparison((v) => !v)}
        disabled={chartType === 'area'}
        aria-pressed={showComparison}
        title={chartType === 'area' ? 'Сравнение доступно в столбчатом режиме' : undefined}
        className={[
          'inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors',
          showComparison && chartType === 'bar'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground',
          chartType === 'area' && 'opacity-50 cursor-not-allowed',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {showComparison && chartType === 'bar' && (
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        )}
        {comparisonLabel(period.preset)}
      </button>
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
    </div>
  )}
</div>
```

Changes vs prior:
- Outer header: added `gap-3`.
- Right block: wrapped chart-type tabs and the new pill in a single `<div className="flex items-center gap-2">`.
- Pill button: shows `comparisonLabel(period.preset)`, has emerald dot indicator when active, disabled in area mode with native title hint.

- [ ] **Step 3.2: Make sure area mode does NOT render comparison**

The `<BarChart>` block from Task 2 already gates the prev-bar via `{showComparison && (<Bar dataKey="prevRevenue" ... />)}`. The area-mode block is unchanged — it does not consume `prevRevenue` at all, so area renders as before.

However, the toggle-pill might be in the `on` state when the user switches to area mode. In that case the pill should still appear visually-disabled (Step 3.1's `disabled={chartType === 'area'}` and `opacity-50 cursor-not-allowed` classes handle that). Verify by reading the current file's area-mode section — confirm it does NOT reference `prevRevenue` or `showComparison`. No code changes needed there.

- [ ] **Step 3.3: Verify build + lint**

```bash
npm run build
npm run lint 2>&1 | tail -3
```

Expected: build succeeds, lint baseline.

- [ ] **Step 3.4: Verify tests still pass**

```bash
npm run test -- --run 2>&1 | tail -5
```

Expected: 236/236 passing.

- [ ] **Step 3.5: Manual smoke** — skip in subagent context.

- [ ] **Step 3.6: Commit**

```bash
git add src/components/dashboard/RevenueByHourChart.jsx
git commit -m "$(cat <<'EOF'
feat(dashboard): toggle-pill «vs предыдущий период» on hourly chart

Adds a header pill that flips showComparison; label adapts to the
active preset (vs вчера / vs прошлая неделя / vs прошлый месяц / vs
предыдущий период). Pill is greyed out in area mode with a tooltip
explaining comparison is bar-only for now.

Closes the design from
docs/superpowers/specs/2026-04-28-revenue-by-hour-comparison-design.md.
EOF
)"
```

---

## Final verification

After Tasks 1–3:

- [ ] **`npm run build`** — succeeds.
- [ ] **`npm run lint`** — baseline 50 errors + 1 warning unchanged.
- [ ] **`npm run test -- --run`** — 236/236.
- [ ] **Manual browser smoke (controller does this):**

  1. **Preset `today` (default):** ghost bars visible behind solid bars; toggle-pill says «vs вчера» with green dot. Hover bar → tooltip with «сегодня X / вчера Y / ▲±Z%». If now is 14:00, last bar is 14:00 (smart clipping). Bars after 14:00 not rendered.
  2. **Toggle off:** pill clicked → ghost bars vanish, dot off, tooltip shows only current.
  3. **Preset `week`:** pill says «vs прошлая неделя»; ghost bars cover full hour range (no smart clip).
  4. **Preset `yesterday`:** pill says «vs позавчера».
  5. **Preset `month`:** pill says «vs прошлый месяц».
  6. **Area mode:** chart switches; comparison series gone; pill greyed and shows native tooltip on hover «Сравнение доступно в столбчатом режиме».
  7. **prev = 0, current > 0:** delta shows `+∞%` in green.
  8. **No prev data for some hour:** tooltip shows «вчера: нет данных», no delta row.

---

## Out of scope (per spec)

- Area-mode comparison — defer.
- Persist `showComparison` in localStorage — defer.
- YoY / custom-comparison-period — defer.
- Mobile responsive sweep — separate roadmap task.
- Tests — no convention for dashboard component tests; manual smoke covers verification surface.
