import { Clock } from 'lucide-react'
import { KpiCard } from '../KpiCard.jsx'

const fmt = (n) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const SHIFT_CONFIG = {
  day: { label: 'Дневная смена', operatorShift: 'ДНЕВНАЯ', accent: 'orange' },
  evening: { label: 'Вечерняя смена', operatorShift: 'ВЕЧЕРНЯЯ', accent: 'purple' },
  night: { label: 'Ночная смена', operatorShift: 'НОЧНАЯ', accent: 'blue' },
}

function computeShift(rows, operatorMap, hours, operatorShift) {
  const shiftRows = rows.filter((op) => operatorMap[op.refcode]?.shift === operatorShift)
  const total = shiftRows.reduce(
    (s, op) => s + hours.reduce((hs, h) => hs + (op[`h${h}`] || 0), 0),
    0,
  )
  return { total, count: shiftRows.length }
}

export function ShiftCard({ shift, rows, prevRows, operatorMap, period, loading }) {
  const cfg = SHIFT_CONFIG[shift]
  const [hMin, hMax] = period.hours
  const hours = Array.from({ length: 24 }, (_, i) => i).filter((h) => h >= hMin && h <= hMax)

  const { total, count } = computeShift(rows, operatorMap, hours, cfg.operatorShift)
  const { total: prevTotal } = computeShift(prevRows, operatorMap, hours, cfg.operatorShift)

  const grand = rows.reduce(
    (s, op) => s + hours.reduce((hs, h) => hs + (op[`h${h}`] || 0), 0),
    0,
  )
  const sharePct = grand > 0 ? Math.round((total / grand) * 100) : 0

  let delta
  if (prevTotal > 0) {
    const pct = Math.round(((total - prevTotal) / prevTotal) * 100)
    delta = { value: Math.abs(pct), direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral' }
  }

  return (
    <KpiCard
      label={cfg.label}
      value={loading ? '...' : `${fmt(total)} $`}
      icon={Clock}
      sublabel={!loading ? `${count} операторов · ${sharePct}%` : undefined}
      delta={!loading ? delta : undefined}
      accentColor={cfg.accent}
    />
  )
}
