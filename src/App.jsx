import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabaseClient'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'

const HOURS = Array.from({ length: 24 }, (_, i) => i)

// Data before this point is invalid (first snapshot captured cumulative)
const DATA_START = { date: '2026-04-02', hour: 22 }

const fmt = (n) =>
  n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Kiev' })
}

export default function App() {
  const [date, setDate] = useState(todayStr())
  const [rows, setRows] = useState([])
  const [operators, setOperators] = useState({}) // { refcode: { name, shift } }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [sortCol, setSortCol] = useState('total')
  const [sortDir, setSortDir] = useState('desc')
  const [shiftFilter, setShiftFilter] = useState('ALL')
  const [search, setSearch] = useState('')

  // Load operator names once
  useEffect(() => {
    supabase
      .from('operators')
      .select('refcode, name, shift')
      .then(({ data }) => {
        if (data) {
          const map = {}
          data.forEach(op => { map[op.refcode] = { name: op.name, shift: op.shift || '' } })
          setOperators(map)
        }
      })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('hourly_revenue')
        .select('refcode, hour, delta')
        .eq('date', date)

      // Exclude hours before the data start point
      if (date === DATA_START.date) {
        query = query.gte('hour', DATA_START.hour)
      } else if (date < DATA_START.date) {
        // Entire day is before start — return empty
        setRows([])
        setLastUpdated(new Date())
        setLoading(false)
        return
      }

      const { data, error: err } = await query
      if (err) throw err

      const map = {}
      for (const row of data) {
        if (row.refcode?.toString().trim().toLowerCase() === 'all') continue
        if (!map[row.refcode]) map[row.refcode] = { refcode: row.refcode }
        map[row.refcode][`h${row.hour}`] = Number(row.delta)
      }

      const result = Object.values(map).map(op => {
        const total = HOURS.reduce((s, h) => s + (op[`h${h}`] || 0), 0)
        return { ...op, total }
      })

      setRows(result)
      setLastUpdated(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const id = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [load])

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }

  // Helper: display name for a refcode
  const getName = (refcode) => operators[refcode]?.name || refcode
  const getShift = (refcode) => operators[refcode]?.shift || ''

  // Get unique shifts for filter
  const shifts = ['ALL', ...Array.from(new Set(Object.values(operators).map(o => o.shift).filter(Boolean))).sort()]

  // Filter + search + sort
  const filtered = rows
    .filter(op => shiftFilter === 'ALL' || getShift(op.refcode) === shiftFilter)
    .filter(op => {
      if (!search) return true
      const q = search.toLowerCase()
      return getName(op.refcode).toLowerCase().includes(q) || op.refcode.includes(q)
    })

  const sorted = [...filtered].sort((a, b) => {
    if (sortCol === 'name') {
      const an = getName(a.refcode), bn = getName(b.refcode)
      return sortDir === 'desc' ? bn.localeCompare(an, 'uk') : an.localeCompare(bn, 'uk')
    }
    const av = a[sortCol] ?? 0
    const bv = b[sortCol] ?? 0
    return sortDir === 'desc' ? bv - av : av - bv
  })

  const hourlyTotals = HOURS.map(h => ({
    hour: `${String(h).padStart(2, '0')}:00`,
    revenue: filtered.reduce((s, op) => s + (op[`h${h}`] || 0), 0)
  })).filter(x => x.revenue > 0)

  const top5 = [...filtered].sort((a, b) => b.total - a.total).slice(0, 5)
  const grandTotal = filtered.reduce((s, op) => s + op.total, 0)
  const activeCount = filtered.filter(r => r.total > 0).length

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white text-lg">📊</div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">Дашборд операторов</h1>
            <p className="text-xs text-slate-400">Почасовая выручка</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            onClick={load}
            disabled={loading}
            className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? '...' : '↻ Обновить'}
          </button>
          {lastUpdated && (
            <span className="text-xs text-slate-400">{lastUpdated.toLocaleTimeString('uk-UA')}</span>
          )}
        </div>
      </header>

      <div className="px-4 md:px-6 py-6 space-y-5 max-w-screen-2xl mx-auto">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Всего за день" value={`${fmt(grandTotal)} $`} icon="💰" color="indigo" />
          <KpiCard label="Операторов" value={filtered.length} icon="👥" color="slate" />
          <KpiCard label="Активных (> 0)" value={activeCount} icon="✅" color="green" />
          <KpiCard
            label="Средний доход"
            value={filtered.length ? `${fmt(Math.round(grandTotal / Math.max(activeCount, 1)))} $` : '—'}
            icon="📈"
            color="amber"
          />
        </div>

        {/* Chart */}
        {hourlyTotals.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Выручка по часам</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hourlyTotals} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v) => [`${fmt(v)} $`, 'Выручка']}
                  contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}
                  cursor={{ fill: '#f1f5f9' }}
                />
                <Bar dataKey="revenue" radius={[5, 5, 0, 0]} maxBarSize={40}>
                  {hourlyTotals.map((_, i) => <Cell key={i} fill="#6366f1" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top 5 */}
        {top5.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">🏆 Топ-5 операторов за день</h2>
            <div className="space-y-3">
              {top5.map((op, i) => {
                const pct = grandTotal > 0 ? (op.total / grandTotal) * 100 : 0
                const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']
                return (
                  <div key={op.refcode} className="flex items-center gap-3">
                    <span className="text-lg w-7">{medals[i]}</span>
                    <div className="w-40">
                      <p className="text-sm font-semibold text-slate-700 truncate">{getName(op.refcode)}</p>
                      {getShift(op.refcode) && (
                        <p className="text-xs text-slate-400">{getShift(op.refcode)}</p>
                      )}
                    </div>
                    <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-24 text-sm font-bold text-slate-800 text-right">{fmt(op.total)} $</span>
                    <span className="text-xs text-slate-400 w-10 text-right">{pct.toFixed(1)}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <input
            type="text"
            placeholder="🔍 Поиск оператора..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {/* Shift filter */}
          {shifts.length > 1 && shifts.map(s => (
            <button
              key={s}
              onClick={() => setShiftFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                shiftFilter === s
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-300 hover:border-indigo-400'
              }`}
            >
              {s === 'ALL' ? 'Все смены' : s}
            </button>
          ))}
        </div>

        {/* Main Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Почасовая таблица операторов</h2>
            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full">{sorted.length} операторов</span>
          </div>

          {loading ? (
            <div className="p-16 text-center">
              <div className="text-3xl mb-3 animate-bounce">⏳</div>
              <p className="text-slate-400 text-sm">Загрузка данных...</p>
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <div className="text-3xl mb-3">⚠️</div>
              <p className="text-red-500 text-sm">{error}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-16 text-center">
              <div className="text-3xl mb-3">📭</div>
              <p className="text-slate-400 text-sm">Нет данных за {date}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th
                      className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:text-indigo-600 whitespace-nowrap select-none"
                      onClick={() => handleSort('name')}
                    >
                      Оператор {sortCol === 'name' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                    </th>
                    <th
                      className="px-3 py-3 text-right font-bold text-indigo-700 cursor-pointer hover:text-indigo-900 bg-indigo-50 whitespace-nowrap select-none"
                      onClick={() => handleSort('total')}
                    >
                      Итого {sortCol === 'total' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                    </th>
                    {HOURS.map(h => (
                      <th
                        key={h}
                        className="px-2 py-3 text-center font-medium text-slate-500 cursor-pointer hover:text-indigo-600 whitespace-nowrap select-none"
                        onClick={() => handleSort(`h${h}`)}
                      >
                        {String(h).padStart(2, '0')}:00
                        {sortCol === `h${h}` ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((op, idx) => {
                    const name = getName(op.refcode)
                    const shift = getShift(op.refcode)
                    return (
                      <tr
                        key={op.refcode}
                        className={`border-b border-slate-100 hover:bg-indigo-50/30 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : ''}`}
                      >
                        <td className="sticky left-0 bg-inherit px-4 py-2 whitespace-nowrap">
                          <p className="font-semibold text-slate-700">{name}</p>
                          {shift && <p className="text-slate-400 text-xs">{shift}</p>}
                        </td>
                        <td className={`px-3 py-2 text-right font-bold whitespace-nowrap ${op.total > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-400'}`}>
                          {fmt(op.total)}
                        </td>
                        {HOURS.map(h => {
                          const val = op[`h${h}`]
                          const hasData = val != null
                          const hasRevenue = hasData && val > 0
                          return (
                            <td
                              key={h}
                              className={`px-2 py-2 text-center whitespace-nowrap
                                ${hasRevenue ? 'bg-green-50 text-green-700 font-medium' : hasData ? 'bg-red-50 text-red-300' : 'text-slate-200'}`}
                            >
                              {hasData ? fmt(val) : ''}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                  {/* Grand total row */}
                  <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                    <td className="sticky left-0 bg-indigo-50 px-4 py-2.5 font-bold text-indigo-800 whitespace-nowrap">ИТОГО</td>
                    <td className="px-3 py-2.5 text-right font-bold text-indigo-800 bg-indigo-100 whitespace-nowrap">{fmt(grandTotal)}</td>
                    {HOURS.map(h => {
                      const sum = filtered.reduce((s, op) => s + (op[`h${h}`] || 0), 0)
                      return (
                        <td key={h} className={`px-2 py-2.5 text-center font-semibold whitespace-nowrap ${sum > 0 ? 'text-indigo-700' : 'text-slate-300'}`}>
                          {sum > 0 ? fmt(sum) : ''}
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 pb-4">
          Данные обновляются каждый час · автообновление каждые 5 мин
        </p>
      </div>
    </div>
  )
}

function KpiCard({ label, value, icon, color }) {
  const styles = {
    indigo: 'bg-indigo-600 text-white',
    slate:  'bg-slate-700 text-white',
    green:  'bg-emerald-600 text-white',
    amber:  'bg-amber-500 text-white',
  }
  return (
    <div className={`rounded-2xl p-4 ${styles[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <p className="text-xs font-medium opacity-75">{label}</p>
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
    </div>
  )
}
