import { useMemo, useState } from 'react'
import { AlertTriangle, Inbox } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SearchInput } from '../shell/index.js'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const TZ = 'Europe/Kiev'

const fmt = (n) =>
  n == null
    ? '—'
    : Number(n).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })

const SHIFT_BORDER = {
  ДНЕВНАЯ: 'border-l-[3px] border-l-orange-500',
  ВЕЧЕРНЯЯ: 'border-l-[3px] border-l-purple-500',
  НОЧНАЯ: 'border-l-[3px] border-l-blue-500',
}

const SHIFT_DOT = {
  ДНЕВНАЯ: 'bg-orange-500',
  ВЕЧЕРНЯЯ: 'bg-purple-500',
  НОЧНАЯ: 'bg-blue-500',
}

const opName = (rc, operatorMap) => operatorMap[rc]?.name || rc
const opShift = (rc, operatorMap) => operatorMap[rc]?.shift || ''

export function HourlyOperatorTable({ rows, operatorMap, period, loading, error }) {
  const [search, setSearch] = useState('')
  const [shiftFilter, setShiftFilter] = useState('ALL')
  const [onlyActive, setOnlyActive] = useState(false)
  const [sortCol, setSortCol] = useState('total')
  const [sortDir, setSortDir] = useState('desc')

  const [hMin, hMax] = period.hours
  const visibleHours = HOURS.filter((h) => h >= hMin && h <= hMax)
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: TZ })
  const isToday = period.from === today && period.to === today
  const currentHour = new Date().getHours()
  const isFutureHour = (h) => isToday && h > currentHour

  const shifts = useMemo(() => {
    const set = new Set()
    Object.values(operatorMap).forEach((o) => {
      if (o.shift) set.add(o.shift)
    })
    return ['ALL', ...Array.from(set).sort()]
  }, [operatorMap])

  const rowsInRange = useMemo(
    () =>
      rows.map((op) => ({
        ...op,
        rangeTotal: visibleHours.reduce((s, h) => s + (op[`h${h}`] || 0), 0),
      })),
    [rows, visibleHours],
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return rowsInRange
      .filter((op) => shiftFilter === 'ALL' || opShift(op.refcode, operatorMap) === shiftFilter)
      .filter((op) => !onlyActive || op.rangeTotal > 0)
      .filter((op) => {
        if (!q) return true
        return (
          opName(op.refcode, operatorMap).toLowerCase().includes(q) ||
          op.refcode.toLowerCase().includes(q)
        )
      })
  }, [rowsInRange, shiftFilter, onlyActive, search, operatorMap])

  const sorted = useMemo(() => {
    const list = [...filtered]
    list.sort((a, b) => {
      if (sortCol === 'name') {
        const an = opName(a.refcode, operatorMap)
        const bn = opName(b.refcode, operatorMap)
        return sortDir === 'desc' ? bn.localeCompare(an, 'uk') : an.localeCompare(bn, 'uk')
      }
      const aVal = sortCol === 'total' ? a.rangeTotal ?? 0 : a[sortCol] ?? 0
      const bVal = sortCol === 'total' ? b.rangeTotal ?? 0 : b[sortCol] ?? 0
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal
    })
    return list
  }, [filtered, sortCol, sortDir, operatorMap])

  const grand = filtered.reduce((s, op) => s + op.rangeTotal, 0)

  function handleSort(col) {
    if (sortCol === col) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-foreground mr-auto">Почасовая таблица операторов</h3>
        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
          {sorted.length} операторов
        </span>
      </div>
      <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-3">
        <div className="w-56">
          <SearchInput
            placeholder="Поиск оператора…"
            value={search}
            onChange={setSearch}
            ariaLabel="Поиск оператора"
          />
        </div>
        {shifts.length > 1 && (
          <Tabs value={shiftFilter} onValueChange={setShiftFilter}>
            <TabsList>
              {shifts.map((s) => (
                <TabsTrigger key={s} value={s}>
                  {s === 'ALL' ? 'Все смены' : s}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
        <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none ml-auto">
          <input
            type="checkbox"
            checked={onlyActive}
            onChange={(e) => setOnlyActive(e.target.checked)}
            className="accent-primary"
          />
          Только активные
        </label>
      </div>
      {loading ? (
        <div className="p-12 text-center text-sm text-muted-foreground">Загрузка…</div>
      ) : error ? (
        <div className="p-12 text-center">
          <AlertTriangle size={28} className="mx-auto mb-2 text-orange-500" />
          <p className="text-sm text-red-500">{error}</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="p-12 text-center">
          <Inbox size={28} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Нет данных</p>
        </div>
      ) : (
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th
                  className="sticky left-0 top-0 z-30 bg-muted/50 px-3 py-2 text-left font-semibold text-foreground cursor-pointer whitespace-nowrap select-none"
                  onClick={() => handleSort('name')}
                >
                  Оператор {sortCol === 'name' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                </th>
                <th
                  className="sticky top-0 z-20 px-3 py-2 text-right font-bold text-primary cursor-pointer bg-muted whitespace-nowrap select-none border-r border-border"
                  onClick={() => handleSort('total')}
                >
                  Итого {sortCol === 'total' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                </th>
                {visibleHours.map((h) => (
                  <th
                    key={h}
                    className="sticky top-0 z-20 px-2 py-2 text-center font-medium text-muted-foreground cursor-pointer whitespace-nowrap select-none bg-muted/50"
                    onClick={() => handleSort(`h${h}`)}
                  >
                    {String(h).padStart(2, '0')}:00
                    {sortCol === `h${h}` ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                ))}
              </tr>
              <tr className="bg-primary/10 border-b border-border">
                <td className="sticky left-0 z-20 bg-primary/10 px-3 py-2 font-bold text-primary whitespace-nowrap">
                  ИТОГО
                </td>
                <td className="sticky z-10 px-3 py-2 text-right font-bold text-primary bg-primary/15 whitespace-nowrap border-r border-border">
                  {fmt(grand)}
                </td>
                {visibleHours.map((h) => {
                  const sum = filtered.reduce((s, op) => s + (op[`h${h}`] || 0), 0)
                  return (
                    <td
                      key={h}
                      className={`px-2 py-2 text-center font-semibold whitespace-nowrap ${
                        isFutureHour(h)
                          ? 'bg-muted/30 text-muted-foreground'
                          : sum > 0
                            ? 'bg-primary/10 text-primary'
                            : 'bg-primary/5 text-muted-foreground'
                      }`}
                    >
                      {isFutureHour(h) ? '' : sum > 0 ? fmt(sum) : ''}
                    </td>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((op, idx) => {
                const name = opName(op.refcode, operatorMap)
                const shift = opShift(op.refcode, operatorMap)
                const isZero = op.noData || op.rangeTotal === 0
                const borderClass = SHIFT_BORDER[shift] || ''
                const dotClass = SHIFT_DOT[shift]
                return (
                  <tr
                    key={op.refcode}
                    className={`border-b border-border hover:bg-muted/30 transition-colors ${
                      isZero ? 'opacity-50' : idx % 2 === 1 ? 'bg-muted/20' : ''
                    }`}
                  >
                    <td className={`sticky left-0 bg-card px-3 py-2 whitespace-nowrap ${borderClass}`}>
                      <div className="flex items-center gap-2">
                        {dotClass && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />}
                        <span className="font-medium text-foreground">{name}</span>
                      </div>
                      {shift && <span className="text-[10px] text-muted-foreground ml-4">{shift}</span>}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-bold whitespace-nowrap border-r border-border ${
                        op.rangeTotal > 0 ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400' : 'text-muted-foreground'
                      }`}
                    >
                      {isZero ? '—' : fmt(op.rangeTotal)}
                    </td>
                    {visibleHours.map((h) => {
                      const val = op[`h${h}`]
                      const hasRevenue = val != null && val > 0
                      return (
                        <td
                          key={h}
                          className={`px-2 py-2 text-center whitespace-nowrap ${
                            isFutureHour(h)
                              ? 'bg-muted/30 text-muted-foreground'
                              : hasRevenue
                                ? 'text-green-700 dark:text-green-400 font-medium'
                                : 'text-muted-foreground'
                          }`}
                        >
                          {isFutureHour(h) ? '' : val != null ? fmt(val) : '—'}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
