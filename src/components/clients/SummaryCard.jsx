import { useMemo, useState } from 'react'
import { Eye, DollarSign, FileText, Link as LinkIcon } from 'lucide-react'

/**
 * Карточка «Сводка» в правой колонке Detail (D-5).
 *
 * Метрики (Просмотры, Доход, Посты) пока мок — детерминированный hash от client.id.
 * Реальные данные подтянутся когда подключим Tableau (см. _decisions.md D-5 подвопросы).
 *
 * Если tableau_id у клиента пустой — карточка показывает hook с CTA связки.
 */
export function SummaryCard({ client }) {
  const [period, setPeriod] = useState('30d')
  const metrics = useDeterministicMetrics(client?.id ?? 0, period)

  if (!client?.tableau_id) {
    return (
      <section className="rounded-xl border border-dashed border-border-strong bg-card p-4">
        <h3 className="mb-1 label-caps">Сводка</h3>
        <p className="text-sm text-[var(--fg2)]">
          Подключите Tableau ID — здесь появятся метрики клиента.
        </p>
        <p className="mt-2 text-xs text-[var(--fg4)]">
          Tableau ID можно добавить в карточке «Поля профиля».
        </p>
      </section>
    )
  }

  return (
    <section className="surface-card p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="label-caps">Сводка</h3>
        <PeriodToggle value={period} onChange={setPeriod} />
      </header>

      <div className="flex flex-col gap-3">
        <Metric
          label="Просмотры"
          icon={<Eye size={11} />}
          value={metrics.views.value.toLocaleString('ru-RU')}
          delta={metrics.views.delta}
          spark={metrics.views.spark}
          tone="blue"
        />
        <Metric
          label="Доход"
          icon={<DollarSign size={11} />}
          value={`${metrics.revenue.value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`}
          delta={metrics.revenue.delta}
          spark={metrics.revenue.spark}
          tone="blue"
        />
        <Metric
          label="Посты"
          icon={<FileText size={11} />}
          value={metrics.posts.value.toString()}
          delta={metrics.posts.delta}
          spark={metrics.posts.spark}
          tone={metrics.posts.delta < 0 ? 'red' : 'blue'}
        />
      </div>

      <footer className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5">
            <LinkIcon size={11} />
            <span className="font-mono">{client.tableau_id}</span>
            <span className="text-[var(--fg4)]">· обновлено только что</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => alert('Откроется реальный Tableau dashboard когда подключим интеграцию (D-5)')}
          className="mt-1 inline-flex items-center gap-1 text-primary hover:underline rounded"
        >
          Открыть в Tableau →
        </button>
      </footer>
    </section>
  )
}

function PeriodToggle({ value, onChange }) {
  const options = [
    { key: '7d', label: '7д' },
    { key: '30d', label: '30д' },
    { key: 'all', label: 'Всё время' },
  ]
  return (
    <div role="group" aria-label="Период" className="inline-flex rounded-md border border-border p-0.5">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          aria-pressed={value === opt.key}
          className={[
            'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
            value === opt.key
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function Metric({ label, icon, value, delta, spark, tone }) {
  const isUp = delta >= 0
  const deltaColor = isUp ? 'text-[var(--success-ink)]' : 'text-[var(--danger-ink)]'
  const sparkColor =
    tone === 'red' || !isUp ? 'stroke-[var(--danger)]' : 'stroke-[var(--success)]'

  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 label-caps">
          {icon}
          {label}
        </div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-lg font-bold text-foreground tabular">{value}</span>
          <span className={`text-xs font-medium tabular ${deltaColor}`}>
            {isUp ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}%
          </span>
        </div>
      </div>
      <Sparkline points={spark} className={sparkColor} />
    </div>
  )
}

function Sparkline({ points, className }) {
  if (!points || points.length === 0) return null
  const w = 70
  const h = 22
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const step = w / (points.length - 1)
  const path = points
    .map((y, i) => {
      const x = i * step
      const yy = h - ((y - min) / range) * h
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${yy.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <path d={path} fill="none" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" className={className} />
    </svg>
  )
}

// ============================================================================
// Pseudo-random deterministic metrics by client.id
// ============================================================================

function useDeterministicMetrics(clientId, period) {
  return useMemo(() => buildMetrics(clientId, period), [clientId, period])
}

function buildMetrics(clientId, period) {
  const seed = (clientId * 9301 + 49297) % 233280
  const rand = (n, base, range) => base + ((seed * (n + 1) * 7919) % range)
  const periodScale = period === '7d' ? 0.25 : period === 'all' ? 6 : 1

  const views = Math.floor(rand(1, 30000, 30000) * periodScale)
  const revenue = +(rand(2, 5000, 15000) * periodScale * 0.001).toFixed(2) * 1000 // → 5..20k
  const posts = Math.max(2, Math.floor(rand(3, 8, 30) * periodScale))

  // 10-point sparkline arrays trending towards current value
  const trend = (final, vol) => {
    const arr = []
    for (let i = 0; i < 10; i++) {
      const t = i / 9
      const noise = ((seed * (i + 1) * 53) % 100) / 100 - 0.5
      const v = final * (0.6 + 0.4 * t) + noise * vol * final
      arr.push(Math.max(0, v))
    }
    return arr
  }

  return {
    views: {
      value: views,
      delta: ((seed % 200) - 50) / 10, // -5..15%
      spark: trend(views, 0.08),
    },
    revenue: {
      value: revenue,
      delta: ((seed % 80) - 20) / 10, // -2..6%
      spark: trend(revenue, 0.06),
    },
    posts: {
      value: posts,
      delta: ((seed % 80) - 50) / 10, // -5..3%
      spark: trend(posts, 0.18),
    },
  }
}

