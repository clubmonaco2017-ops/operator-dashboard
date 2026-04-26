import { Layers } from 'lucide-react'

const fmt = (n) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export function TeamDistributionCard({ rows, teamMap, period, loading }) {
  const [hMin, hMax] = period.hours
  const hours = Array.from({ length: 24 }, (_, i) => i).filter((h) => h >= hMin && h <= hMax)

  const teamTotals = {}
  for (const op of rows) {
    const team = teamMap[op.refcode]
    if (!team) continue
    const opTotal = hours.reduce((s, h) => s + (op[`h${h}`] || 0), 0)
    teamTotals[team] = (teamTotals[team] || 0) + opTotal
  }
  const sorted = Object.entries(teamTotals)
    .map(([team, total]) => ({ team, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
  const grand = sorted.reduce((s, t) => s + t.total, 0)

  return (
    <article className="bg-card border border-border rounded-lg p-4">
      <header className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground font-medium">Распределение по командам</span>
        <Layers size={16} className="text-muted-foreground" />
      </header>
      {loading ? (
        <p className="text-sm text-muted-foreground">...</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">Нет данных</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((t) => {
            const pct = grand > 0 ? Math.round((t.total / grand) * 100) : 0
            return (
              <li key={t.team} className="flex items-center gap-2 text-xs">
                <span className="w-24 truncate text-foreground">{t.team}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-12 text-right font-medium text-foreground">{fmt(t.total)} $</span>
                <span className="w-8 text-right text-muted-foreground">{pct}%</span>
              </li>
            )
          })}
        </ul>
      )}
    </article>
  )
}
