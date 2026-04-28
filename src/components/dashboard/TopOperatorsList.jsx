import { useState } from 'react'
import { Trophy, ChevronDown } from 'lucide-react'
import goldMedal from '../../assets/medals/gold.svg'
import silverMedal from '../../assets/medals/silver.svg'
import bronzeMedal from '../../assets/medals/bronze.svg'

const fmt = (n) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const MEDALS = [goldMedal, silverMedal, bronzeMedal]
const MEDAL_ALT = ['Золото', 'Серебро', 'Бронза']

export function TopOperatorsList({ rows, operatorMap, period }) {
  const [expanded, setExpanded] = useState(false)
  const [sectionExpanded, setSectionExpanded] = useState(true)

  const [hMin, hMax] = period.hours
  const hours = Array.from({ length: 24 }, (_, i) => i).filter((h) => h >= hMin && h <= hMax)

  const ranked = rows
    .map((op) => ({
      refcode: op.refcode,
      total: hours.reduce((s, h) => s + (op[`h${h}`] || 0), 0),
    }))
    .filter((op) => op.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 20)

  const visible = expanded ? ranked : ranked.slice(0, 5)
  const grand = ranked.reduce((s, op) => s + op.total, 0)

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setSectionExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between border-b border-border"
        aria-expanded={sectionExpanded}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Trophy size={14} className="text-muted-foreground" />
          <span>Топ операторов</span>
          <span className="text-xs font-normal text-muted-foreground">
            {expanded ? `все ${ranked.length}` : `топ-5 из ${ranked.length}`}
          </span>
        </div>
        <ChevronDown
          size={14}
          className={`text-muted-foreground transition-transform ${sectionExpanded ? '' : '-rotate-90'}`}
        />
      </button>
      {sectionExpanded && (
        <div className="p-3 space-y-2">
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Нет данных</p>
          ) : (
            visible.map((op, i) => {
              const pct = grand > 0 ? (op.total / grand) * 100 : 0
              const medal = MEDALS[i]
              const name = operatorMap[op.refcode]?.name || op.refcode
              const shift = operatorMap[op.refcode]?.shift
              return (
                <div key={op.refcode} className="flex items-center gap-2 text-xs">
                  <span className="w-6 flex items-center justify-center">
                    {medal ? (
                      <img src={medal} alt={MEDAL_ALT[i]} className="size-6" />
                    ) : (
                      <span className="inline-flex size-5 items-center justify-center rounded bg-muted text-[10px] font-medium text-[var(--fg3)]">
                        {i + 1}
                      </span>
                    )}
                  </span>
                  <div className="w-28 min-w-0">
                    <p className="text-foreground font-medium truncate">{name}</p>
                    {shift && <p className="text-[10px] text-muted-foreground">{shift}</p>}
                  </div>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-16 text-right font-semibold text-foreground">{fmt(op.total)}</span>
                  <span className="w-8 text-right text-muted-foreground">{pct.toFixed(0)}%</span>
                </div>
              )
            })
          )}
          {ranked.length > 5 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full pt-1 text-xs text-primary hover:underline"
            >
              {expanded ? '↑ Свернуть' : `↓ Показать все ${ranked.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
