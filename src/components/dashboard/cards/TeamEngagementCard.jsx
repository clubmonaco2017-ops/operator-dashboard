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
