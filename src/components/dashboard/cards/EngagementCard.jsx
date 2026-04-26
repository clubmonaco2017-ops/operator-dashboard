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
