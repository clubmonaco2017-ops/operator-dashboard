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
