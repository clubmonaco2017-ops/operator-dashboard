import { Crown } from 'lucide-react'
import { KpiCard } from '../KpiCard.jsx'

const SHIFTS = ['ДНЕВНАЯ', 'ВЕЧЕРНЯЯ', 'НОЧНАЯ']
const DISPLAY = { ДНЕВНАЯ: 'Дневная', ВЕЧЕРНЯЯ: 'Вечерняя', НОЧНАЯ: 'Ночная' }

export function BestShiftCard({ rows, operatorMap, period, loading }) {
  const [hMin, hMax] = period.hours
  const hours = Array.from({ length: 24 }, (_, i) => i).filter((h) => h >= hMin && h <= hMax)

  const totals = SHIFTS.map((shift) => {
    const shiftRows = rows.filter((op) => operatorMap[op.refcode]?.shift === shift)
    const total = shiftRows.reduce(
      (s, op) => s + hours.reduce((hs, h) => hs + (op[`h${h}`] || 0), 0),
      0,
    )
    return { shift, total }
  }).sort((a, b) => b.total - a.total)

  const best = totals[0]
  const second = totals[1]
  const value = best && best.total > 0 ? DISPLAY[best.shift] : '—'

  let sublabel
  if (best && second && best.total > 0 && second.total > 0 && !loading) {
    const diffPct = Math.round(((best.total - second.total) / second.total) * 100)
    sublabel = `+${diffPct}% к ${DISPLAY[second.shift]}`
  }

  return (
    <KpiCard label="Лучшая смена" value={loading ? '...' : value} icon={Crown} sublabel={sublabel} />
  )
}
