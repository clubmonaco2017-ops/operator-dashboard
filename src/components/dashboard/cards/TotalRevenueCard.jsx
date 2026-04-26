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
