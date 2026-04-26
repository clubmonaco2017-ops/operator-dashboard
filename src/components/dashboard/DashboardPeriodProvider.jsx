import { createContext, useContext, useMemo, useState } from 'react'

const DashboardPeriodContext = createContext(null)

const TZ = 'Europe/Kiev'

function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ })
}

function shiftDays(dateStr, deltaDays) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

function diffDaysInclusive(fromStr, toStr) {
  const f = new Date(fromStr + 'T00:00:00Z')
  const t = new Date(toStr + 'T00:00:00Z')
  return Math.round((t - f) / 86400000) + 1
}

export function derivePreviousPeriod(period) {
  const { preset, from, to } = period
  if (preset === 'today') {
    const prev = shiftDays(from, -1)
    return { ...period, preset: 'yesterday', from: prev, to: prev }
  }
  if (preset === 'yesterday') {
    const prev = shiftDays(from, -1)
    return { ...period, from: prev, to: prev }
  }
  if (preset === 'week') {
    return { ...period, preset: 'custom', from: shiftDays(from, -7), to: shiftDays(to, -7) }
  }
  if (preset === 'month') {
    const days = diffDaysInclusive(from, to)
    return { ...period, preset: 'custom', from: shiftDays(from, -days), to: shiftDays(to, -days) }
  }
  // custom: equal-length window immediately before
  const days = diffDaysInclusive(from, to)
  return { ...period, from: shiftDays(from, -days), to: shiftDays(to, -days) }
}

export function DashboardPeriodProvider({ children }) {
  const [period, setPeriod] = useState(() => ({
    preset: 'today',
    from: todayStr(),
    to: todayStr(),
    hours: [0, 23],
  }))
  const previousPeriod = useMemo(() => derivePreviousPeriod(period), [period])
  const value = useMemo(() => ({ period, previousPeriod, setPeriod }), [period, previousPeriod])
  return (
    <DashboardPeriodContext.Provider value={value}>{children}</DashboardPeriodContext.Provider>
  )
}

export function useDashboardPeriod() {
  const ctx = useContext(DashboardPeriodContext)
  if (!ctx) throw new Error('useDashboardPeriod must be used inside DashboardPeriodProvider')
  return ctx
}
