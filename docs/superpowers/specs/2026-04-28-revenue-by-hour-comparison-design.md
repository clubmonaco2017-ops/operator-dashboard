# Revenue-by-Hour сравнение с предыдущим периодом · Design Spec

**Status:** Brainstormed · approved decisions · spec ready for user review.
**Author:** Claude Code (Opus 4.7) + Artem.
**Date:** 2026-04-28.
**Branch context:** `feat/desktop-tweaks-nav-redesign`.
**Implements:** Dashboard tweak — оверлей «предыдущего периода» на графике «Выручка по часам».

---

## 1. Goal & non-goals

**Goal:** На графике [RevenueByHourChart](src/components/dashboard/RevenueByHourChart.jsx) добавить второй слой данных — выручку за предыдущий эквивалентный период (вчера / прошлая неделя / прошлый месяц / равный отрезок назад). Цель — пользователь сразу видит «лучше или хуже» относительно benchmark, без прыжков по пресетам.

**В scope:**
- `src/components/dashboard/RevenueByHourChart.jsx` — second `<Bar>` series (ghost), кастомный tooltip с delta %, toggle-pill в header, smart-clipping для `preset==='today'`.
- `src/components/dashboard/SectionAnalytics.jsx` — прокинуть `prevRows` и `previousPeriod` в `<RevenueByHourChart/>`.

**Out of scope:**
- Area mode comparison — отложен. Toggle отключается (greyed) когда выбрана area-вариация.
- Backend / RPC изменения — `previousPeriod` уже считается в `DashboardPeriodProvider`, `prevRows` уже фетчится в `SectionAnalytics`. Только `RevenueByHourChart` его не получает.
- Persist toggle state в localStorage — defer. Локальный `useState`, дефолт `true`.
- Year-over-year / custom-period сравнения — defer.
- Изменение semantics `derivePreviousPeriod` — используем как есть (today→вчера; week→-7д; month→равная длина; custom→равная длина).
- Mobile (< sm) оптимизация — отдельная задача.
- Tests — нет существующего паттерна component tests для `dashboard/`. Verification = manual browser smoke.

---

## 2. Decisions log

| # | Решение | Rationale |
|---|---|---|
| **D-1** | Ghost-бары прошлого периода рендерятся ПЕРЕД основным баром текущего (z-index = render order). | Recharts использует render order для перекрытия. Текущий период должен быть визуально доминантным. |
| **D-2** | Цвет ghost-бара: `fill: '#6366f1'` + `fillOpacity: 0.25`. Совпадает с hex текущих баров (RevenueByHourChart использует hardcoded `#6366f1`). | Унифицируем оттенок с current — без введения новой палитры. Альфа 0.25 — достаточно блёкло, чтобы не конкурировать с current. |
| **D-3** | Comparison включена по умолчанию (`useState(true)`). Toggle-pill в header графика. | Польза `vs предыдущий период` — главный смысл фичи. По умолчанию off = большинство пользователей не узнает о ней. Toggle для тех кому помеха. |
| **D-4** | Lable toggle-pill зависит от пресета: «vs вчера» / «vs прошлая неделя» / «vs прошлый месяц» / «vs предыдущий период». | Понятнее чем generic «vs prev» — пользователь сразу читает контекст. |
| **D-5** | Smart clipping (см. user-Q answer = C): при `preset === 'today'` отрезаем оба массива до индекса последней непустой ячейки в `current`. Для всех остальных пресетов — оба периода целиком. | Apples-to-apples сравнение. «Сегодня 14:00 vs 14:00 вчера» честно; vs полное вчера = false-negative («мы отстаём!» — на самом деле просто рано). Для остальных пресетов оба целые, clip не нужен. |
| **D-6** | Кастомный tooltip через Recharts `content` prop. Формат: время, current value, prev value, delta %. | Дефолтный tooltip Recharts не умеет multi-series красиво — рисуем сами. Также нужно отрисовать «нет данных» для prev и обработать +∞% / 0/0. |
| **D-7** | Area mode (вторая иконка) НЕ поддерживает comparison в этой итерации. Toggle-pill greyed-out с tooltip-подсказкой. | YAGNI: layered semi-transparent areas требуют отдельных design-решений (gradient-vs-flat, выделение пересечений). MVP — bar mode. |
| **D-8** | Состояние `showComparison` локальное (`useState`). Не персистим, не пробрасываем в context. | YAGNI: пока нет других графиков с такой же фичей, нет смысла поднимать. |
| **D-9** | Empty-state ветки: (a) оба пусто → как сейчас «Нет данных»; (b) есть current, нет prev → рисуем только current, в tooltip «вчера: нет данных»; (c) нет current, есть prev → не рендерим график. | Без current данных график = просто история. Эта секция дашборда — про текущее состояние. |
| **D-10** | Helper-ы `buildHourlyTotals(rows, hours)` и `clipToCurrentDataHours(...)` — private functions внутри `RevenueByHourChart.jsx`. | Файл уже компактный (~145 LOC). Hooks за пределы файла не вытаскиваем — они используются только здесь. |

---

## 3. Layout

### 3.1. Header chart card

```
┌────────────────────────────────────────────────────────────────────────┐
│ [📊 Выручка по часам ▾]               [vs вчера ●]   [▮▮▮]  [◢◣]      │
│                                       ↑ toggle pill   bar    area      │
└────────────────────────────────────────────────────────────────────────┘
```

- Order слева→направо: title (collapse) — gap — toggle-pill — chart-type tabs.
- Toggle-pill: `bg-muted text-foreground` когда on; `bg-transparent text-muted-foreground` когда off; маленькая зелёная точка-индикатор слева когда on.
- Когда `chartType === 'area'`: pill `opacity-50`, `cursor-not-allowed`, `aria-disabled="true"`, native title="Сравнение доступно в столбчатом режиме".

### 3.2. Bar chart (comparison on)

```
600 ┤
450 ┤                ▓
                     ▓
300 ┤                ▓
                     ▓
150 ┤  ▓░  ▓░  ▓░    ▓░  ▓░  ▓░  ▓░ ░  ▓░  ░  ▓░  ▓░
  0 ┤  ▓░  ▓░  ▓░    ▓░  ▓░  ▓░  ▓░ ░  ▓░  ░  ▓░  ▓░
       00  01  02   03  04  05  06 ...
       
       ▓ = текущий период (#6366f1, solid)
       ░ = предыдущий период (var(--primary) opacity 0.25)
       (одна и та же позиция X, разный fill — не grouped/clustered, а overlap)
```

### 3.3. Tooltip on hover

```
┌─────────────────────┐
│ 03:00               │
│                     │
│ сегодня    ₽540.00  │
│ вчера      ₽410.00  │
│            ▲ +31.7% │   ← зелёный для +, красный для -
└─────────────────────┘
```

Edge cases:
- prev = 0, current > 0 → строка `+∞%`.
- both = 0 → строка `—`.
- prev = null (нет данных за тот час) → строка `вчера   нет данных`, без delta.

---

## 4. Component changes

### 4.1. `RevenueByHourChart.jsx` — props

**Текущие:** `{ rows, period }`.
**Новые:** `{ rows, period, prevRows, previousPeriod }`.

`prevRows` имеет тот же shape что и `rows` (массив operator-объектов с `h0..h23` полями) — стандартный output `useDashboardData`.

### 4.2. `RevenueByHourChart.jsx` — internal state

```jsx
const [chartType, setChartType] = useState('bar')
const [expanded, setExpanded] = useState(true)
const [showComparison, setShowComparison] = useState(true)  // NEW
```

### 4.3. Helpers (private, in same file)

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
  return -1  // no data
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

### 4.4. Data assembly

```jsx
const [hMin, hMax] = period.hours
const allHours = Array.from({ length: 24 }, (_, i) => i).filter((h) => h >= hMin && h <= hMax)

const currentRaw = buildHourlyTotals(rows, allHours)
const prevRaw = buildHourlyTotals(prevRows ?? [], allHours)

// Smart clip: only when preset === 'today'
const isToday = period.preset === 'today'
const lastIdx = isToday ? lastHourWithData(currentRaw) : currentRaw.length - 1

// Both arrays clipped to same range; merge into combined data
const combined = currentRaw
  .slice(0, lastIdx + 1)
  .map((c, i) => ({
    hour: c.hour,
    revenue: c.revenue,
    prevRevenue: prevRaw[i]?.revenue ?? null,
  }))
  .filter((x) => x.revenue > 0 || (showComparison && x.prevRevenue > 0))
```

`combined` — единый источник для recharts data. Field `prevRevenue` рисуется отдельным `<Bar>`.

### 4.5. Render — bar mode

```jsx
<BarChart data={combined} margin={...}>
  <CartesianGrid ... />
  <XAxis ... />
  <YAxis ... />
  <Tooltip
    content={<HourComparisonTooltip preset={period.preset} showComparison={showComparison} />}
    cursor={{ fill: 'rgba(99, 102, 241, 0.08)' }}
  />
  {showComparison && (
    <Bar
      dataKey="prevRevenue"
      fill="#6366f1"
      fillOpacity={0.25}
      radius={[5, 5, 0, 0]}
      maxBarSize={40}
    />
  )}
  <Bar dataKey="revenue" radius={[5, 5, 0, 0]} maxBarSize={40}>
    {combined.map((_, i) => <Cell key={i} fill="#6366f1" />)}
  </Bar>
</BarChart>
```

Note: `prevRevenue` rendered FIRST so `revenue` overlaps it (z-index = render order).

### 4.6. Custom tooltip component (private)

```jsx
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

`previousLabelFor(preset)` → `'вчера'` / `'позавчера'` / `'прошлая неделя'` / `'прошлый месяц'` / `'предыдущий период'`.

`DeltaBadge`:
- prev = 0, cur > 0 → `+∞%` (info-soft).
- both = 0 → `—`.
- иначе → `((cur - prev) / prev * 100)` с одним знаком после запятой; `+` зелёный (`text-[var(--success-ink)]`), `-` красный (`text-[var(--danger-ink)]`).

### 4.7. Toggle-pill render

```jsx
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
  ].filter(Boolean).join(' ')}
>
  {showComparison && chartType === 'bar' && (
    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
  )}
  {comparisonLabel(period.preset)}
</button>
```

Размещение: между title-кнопкой и chart-type tabs в header. Только когда `expanded === true`.

### 4.8. Area mode

Никаких изменений в логике рендера. Когда `chartType === 'area'` И `showComparison === true`:
- Toggle-pill greyed (см. 4.7).
- Comparison series НЕ рендерится в area chart.
- Tooltip — текущий дефолтный (без comparison).

### 4.9. `SectionAnalytics.jsx`

```diff
-<RevenueByHourChart rows={rows} period={period} />
+<RevenueByHourChart rows={rows} prevRows={prevRows} period={period} previousPeriod={previousPeriod} />
```

Один-line diff.

---

## 5. Edge cases

- **`prevRows` ещё загружается** (loading): hook возвращает `[]`. `buildHourlyTotals([], allHours)` отдаст массив с `revenue: 0`. Все `prevRevenue` будут `null` (после nullish coalescing на пустых рядах). Comparison-бары не рендерятся, current — рендерится. Когда prev приедет — react re-render добавит ghost-бары. UX ок.
- **`prevRows` errored** (RPC failed): тот же fallback — пустой массив, no comparison shown. Без банера ошибки на графике (баннер уже на уровне `useDashboardData` в SectionAnalytics).
- **`isToday` + lastHourWithData = -1** (нет данных вообще): `combined` пустой → empty-state «Нет данных».
- **`hours` фильтр пользователя** (`period.hours = [9, 17]`): применяется к обоим current и prev. Сравниваем 9–17 у обоих.
- **Toggle off + area mode переключение**: если пользователь сначала выключил comparison, потом переключил на area, потом на bar — comparison остаётся off (state не сбрасывается).

---

## 6. Verification (manual, browser)

После реализации:

1. **Preset `today` (default)**:
   - На графике видны два бара на каждом часе (текущий solid + ghost behind).
   - Toggle-pill отображается «vs вчера», зелёная точка горит.
   - Hover на бар: tooltip показывает «сегодня X / вчера Y / +/-Z%».
   - Если сейчас 14:00 — последний показанный час 14:00 (smart clipping работает), ghost-бары после 14:00 не рендерятся.

2. **Toggle off**:
   - Кликаем pill → ghost-бары исчезают, индикатор-точка гаснет.
   - Tooltip без сравнения (только current).

3. **Preset `week`**:
   - Toggle-pill показывает «vs прошлая неделя».
   - Оба периода целиком (без clipping), часы 0–23 показываются для обеих недель (агрегированно).

4. **Preset `yesterday`**:
   - Toggle-pill «vs позавчера».
   - Both полные, нет clipping.

5. **Area mode**:
   - Кликаем area-icon → comparison series не рисуется, toggle-pill становится greyed/disabled, hover показывает «Сравнение доступно в столбчатом режиме».

6. **Build / lint / tests**:
   - `npm run build` зелёный.
   - `npm run lint` ≤ baseline (50 errors + 1 warning, all pre-existing).
   - `npm run test -- --run` 236/236.

---

## 7. Не в scope (повтор + обоснование)

- **Area mode comparison** — требует отдельного design-решения (overlap layered areas, gradient handling, peak emphasis).
- **Persist `showComparison`** в localStorage — пока эта фича единичная, поднимать до global preference преждевременно.
- **Year-over-year** или другой custom-период — текущий `derivePreviousPeriod` покрывает 95% кейсов; YoY — отдельная фича со своим UI.
- **Tests** — отсутствует convention для dashboard component tests; добавлять одну точку = inconsistent. Manual browser verify достаточен.
- **Mobile responsive sweep** — task в roadmap, общая.
