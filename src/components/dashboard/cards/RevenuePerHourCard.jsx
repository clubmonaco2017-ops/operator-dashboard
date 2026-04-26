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
