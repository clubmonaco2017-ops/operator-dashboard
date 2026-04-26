import { Trophy } from 'lucide-react'
import { KpiCard } from '../KpiCard.jsx'

const fmt = (n) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function aggregateTeams(rows, teamMap, hours) {
  const teamTotals = {}
  for (const op of rows) {
    const team = teamMap[op.refcode]
    if (!team) continue
    const opTotal = hours.reduce((s, h) => s + (op[`h${h}`] || 0), 0)
    if (!teamTotals[team]) teamTotals[team] = { team, total: 0, count: 0 }
    teamTotals[team].total += opTotal
    teamTotals[team].count += 1
  }
  return Object.values(teamTotals).sort((a, b) => b.total - a.total)
}

export function TopTeamCard({ rows, prevRows, teamMap, period, loading }) {
  const [hMin, hMax] = period.hours
  const hours = Array.from({ length: 24 }, (_, i) => i).filter((h) => h >= hMin && h <= hMax)

  const teams = aggregateTeams(rows, teamMap, hours)
  const top = teams[0]
  const prevTeams = aggregateTeams(prevRows, teamMap, hours)
  const prevSame = top ? prevTeams.find((t) => t.team === top.team) : null

  let delta
  if (top && prevSame && prevSame.total > 0) {
    const pct = Math.round(((top.total - prevSame.total) / prevSame.total) * 100)
    delta = { value: Math.abs(pct), direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral' }
  }

  const value = top && top.total > 0 ? top.team : '—'
  const sublabel =
    top && top.total > 0 && !loading ? `${fmt(top.total)} $ · ${top.count} операторов` : undefined

  return (
    <KpiCard
      label="Лидер команды"
      value={loading ? '...' : value}
      icon={Trophy}
      sublabel={sublabel}
      delta={!loading ? delta : undefined}
    />
  )
}
