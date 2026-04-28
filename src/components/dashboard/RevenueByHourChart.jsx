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

// eslint-disable-next-line no-unused-vars
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

export function RevenueByHourChart({ rows, prevRows = [], period }) {
  const [chartType, setChartType] = useState('bar')
  const [expanded, setExpanded] = useState(true)
  // eslint-disable-next-line no-unused-vars
  const [showComparison, setShowComparison] = useState(true)

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
